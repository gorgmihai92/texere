// Texere · Sources (versiune 1.3, 2026-11-01)
// Caută surse în mai multe cataloage dintr-o singură bară și creează nota de literatură, cu PDF-ul gratuit dacă există.
// E scris ca un plugin separat: primește pluginul gazdă (host) și folosește doar API-ul Obsidian.
// Fiecare catalog e un fișier în sources/providers/ (vezi README.md din acel folder); unul nou = un fișier nou.
const { Modal, Notice, Setting, PluginSettingTab, requestUrl, setIcon, TFile, normalizePath } = require("obsidian");

const LANG = "texere-lang";
// ceasurile lui Node: merg normal și când Obsidian e în fundal (salvezi din browser)
const NT = (() => { try { const t = require("timers"); return typeof t?.setTimeout === "function" ? t : null; } catch (e) { return null; } })();
const later = (f, ms) => (NT ? NT.setTimeout(f, ms) : setTimeout(f, ms));
const fold = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const stripTags = s => String(s || "").replace(/<[^>]+>/g, "")
  .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (m, e) => e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()])
  .replace(/\s+/g, " ").trim();
const normTitle = s => fold(stripTags(s)).replace(/[^a-z0-9]+/g, " ").trim();
const cleanDoi = d => { const m = /10\.\d{4,9}\/\S+/i.exec(String(d || "")); return m ? m[0].replace(/[.,;)\]]+$/, "") : null; };
const today = () => { const d = new Date(); return [d.getFullYear(), d.getMonth() + 1, d.getDate()]; };

// ISBN: doar cifre; ISBN-10 → ISBN-13 (ca dublurile să se recunoască)
function isbn13(s) {
  const d = String(s || "").replace(/[^0-9Xx]/g, "").toUpperCase();
  if (d.length === 13) return d;
  if (d.length !== 10) return null;
  const core = "978" + d.slice(0, 9); let sum = 0;
  for (let i = 0; i < 12; i++) sum += +core[i] * (i % 2 ? 3 : 1);
  return core + ((10 - (sum % 10)) % 10);
}
// „Simon Blackburn” → { given: "Simon", family: "Blackburn" }; „Blackburn, Simon” la fel; particule (van, de, von) rămân la nume
function splitName(n) {
  n = stripTags(n); if (!n) return null;
  if (n.includes(",")) { const [f, g] = n.split(",", 2); return { family: f.trim(), given: (g || "").trim() }; }
  const p = n.split(/\s+/); if (p.length === 1) return { family: p[0] };
  let i = p.length - 1; while (i > 1 && /^(van|von|der|den|de|del|della|di|da|du|la|le|ter|bin|al)$/i.test(p[i - 1])) i--;
  return { family: p.slice(i).join(" "), given: p.slice(0, i).join(" ") };
}
// primul cuvânt important din titlu ({{title|titleword}})
const STOP = new Set(["a", "an", "the", "and", "or", "but", "on", "in", "at", "to", "for", "with", "of", "from", "by", "as", "into", "like", "near", "over", "past", "since", "upon"]);
function titleWord(t) {
  const w = fold(stripTags(t)).split(/\s+/).map(x => x.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "")).filter(x => x && !STOP.has(x));
  return (w[0] || "").replace(/[^a-z0-9]/g, "");
}

// YAML în stilul notelor de literatură (liste cu „-”, șiruri între ghilimele doar când e nevoie)
function yScalar(v) {
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  const s = String(v ?? "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^[A-Za-zÀ-ž(][^:#\n"'{}\[\],&*!|>%@`]*$/.test(s) && !/\s$/.test(s) && !/^(true|false|null|yes|no|on|off)$/i.test(s)) return s;
  return JSON.stringify(s);
}
const P = n => "  ".repeat(n);
function yItem(v, ind) {
  if (v === null || typeof v !== "object") return [`${P(ind)}- ${yScalar(v)}`];
  const sub = Array.isArray(v) ? v.flatMap(x => yItem(x, ind + 1)) : Object.entries(v).filter(([, x]) => x != null).flatMap(([k, x]) => yKey(k, x, ind + 1));
  if (!sub.length) return [`${P(ind)}- []`];
  sub[0] = `${P(ind)}- ` + sub[0].slice(P(ind + 1).length);
  return sub;
}
function yKey(k, v, ind) {
  if (v == null) return [];
  if (Array.isArray(v)) return v.length ? [`${P(ind)}${k}:`, ...v.flatMap(x => yItem(x, ind + 1))] : [`${P(ind)}${k}: []`];
  if (typeof v === "object") return [`${P(ind)}${k}:`, ...Object.entries(v).flatMap(([a, b]) => yKey(a, b, ind + 1))];
  return [`${P(ind)}${k}: ${yScalar(v)}`];
}
const toYaml = o => Object.entries(o).flatMap(([k, v]) => yKey(k, v, 0)).join("\n");

// câmpurile CSL păstrate în notă (restul, ex. lista de referințe din Crossref, se aruncă)
const CSL_KEYS = ["type", "title", "title-short", "container-title", "container-title-short", "collection-title", "collection-number", "publisher", "publisher-place",
  "issued", "original-date", "edition", "volume", "issue", "number", "page", "number-of-pages", "URL", "DOI", "ISBN", "ISSN", "language", "abstract", "genre",
  "author", "editor", "translator", "container-author", "event-title", "original-title", "accessed"];
// fișierele pe care le poți cataloga (PDF și EPUB)
const DOC_EXT = /^(pdf|epub)$/i;
// câmpurile standard ale notei (în ordinea lor) și cele suplimentare
const CITEKEY_DEFAULT = "{{author|lowercase}}_{{title|titleword}}_{{year}}";   // regula cheii de citare
const BIB_DEFAULT = "Support/Admin/Bibliography/bibliography.json";   // bibliografia; stilurile de citare (.csl) stau în același folder
const NOTE_STD = ["type", "title", "issued", "title-short", "page", "URL", "DOI", "container-title", "publisher", "publisher-place", "edition", "volume", "number", "language", "abstract"];
const NOTE_EXTRA = [["ISSN", "standard"], ["ISBN", "standard"], ["collection-title", "standard"], ["collection-number", "standard"], ["number-of-pages", "standard"],
  ["original-title", "standard"], ["original-date", "date"], ["genre", "standard"], ["container-title-short", "standard"], ["event-title", "standard"]];
function cleanCsl(c) {
  const o = {};
  for (const k of CSL_KEYS) {
    let v = c[k]; if (v == null || v === "" || (Array.isArray(v) && !v.length)) continue;
    if (Array.isArray(v) && /^(title|container-title|container-title-short|publisher|ISBN|ISSN|URL|collection-title)$/.test(k)) v = k === "ISBN" || k === "ISSN" ? v.join(", ") : v[0];
    if (/^(author|editor|translator|container-author)$/.test(k)) v = v.map(a => a.family || a.given ? { family: stripTags(a.family || ""), ...(a.given ? { given: stripTags(a.given) } : {}) } : a.literal ? { literal: stripTags(a.literal) } : null).filter(Boolean);
    if (k === "issued" || k === "original-date") { const dp = v["date-parts"]?.[0]?.filter(x => x != null && x !== ""); if (!dp?.length) continue; v = { "date-parts": [dp.map(Number)] }; }
    if (typeof v === "number") v = String(v);
    if (typeof v === "string") v = k === "abstract" ? stripTags(v.replace(/<\/?jats:p>/g, "\n")).replace(/^Abstract\s+/i, "") : stripTags(v);
    if (v === "" || (Array.isArray(v) && !v.length)) continue;
    o[k] = v;
  }
  if (o.DOI) o.DOI = cleanDoi(o.DOI) || o.DOI;
  if (o.URL && o.DOI && /^https?:\/\/(dx\.)?doi\.org\//i.test(o.URL)) o.URL = "https://doi.org/" + o.DOI;
  const TY = { "journal-article": "article-journal", "book-chapter": "chapter", "book-section": "chapter", "proceedings-article": "paper-conference", "posted-content": "article",
    monograph: "book", "edited-book": "book", "reference-book": "book", "reference-entry": "entry-encyclopedia", dissertation: "thesis", component: "document", other: "document" };
  if (TY[o.type]) o.type = TY[o.type];
  return o;
}

// diacriticele scrise în LaTeX: Vic{\u{a}} → Vică, \c{s} → ş, {\'e} → é
const ACC = { "`": "\u0300", "'": "\u0301", "^": "\u0302", "~": "\u0303", "=": "\u0304", u: "\u0306", ".": "\u0307", '"': "\u0308", r: "\u030A", H: "\u030B", v: "\u030C", c: "\u0327", k: "\u0328" };
const latex = s => String(s).replace(/\\([`'^~=."]|[uvHckr](?=[\s{]|[a-zA-Z](?![a-zA-Z])))\s*\{?\s*(\\?[a-zA-Z])(?:\s*\})?/g, (m, a, ch) => (ch === "\\i" ? (ACC[a] ? "i" : "ı") : ch.replace("\\", "")) + (ACC[a] || "")).normalize("NFC")
  // și forma scurtă, fără acolade: „Vic\ua” → Vică (PhilPapers exportă așa)
  .replace(/\\([uvHckr])([a-zA-Z])(?![a-zA-Z])/g, (m, a, ch) => ch + ACC[a])
  .replace(/\\ss\b/g, "ß").replace(/\\(ae|oe|o|l)\b/gi, (m, x) => ({ ae: "æ", AE: "Æ", oe: "œ", OE: "Œ", o: "ø", O: "Ø", l: "ł", L: "Ł" })[x] || x).normalize("NFC");
// textele românești din BibTeX: sedila veche → virgulă (ş → ș, ţ → ț); literele pierdute la export („?” în loc de ș/ț) se refac după regulile limbii:
// „?i” singur = „și”; înainte de „t” = ș (București, știință); după „n” = ț (știință, ființă); înainte de „i” + vocală/sfârșit = ț (-ție, -ții); altfel ș
const RO_SIGN = /[ăâîșțĂÂÎȘȚ]/;   // nu ş/ţ cu sedilă: le folosește și turca
function roFix(v) {
  let s = String(v).replace(/ş/g, "ș").replace(/Ş/g, "Ș").replace(/ţ/g, "ț").replace(/Ţ/g, "Ț");
  s = s.replace(/(^|[.!:]\s+)\?(?=\p{L})/gu, "$1\u0001?");   // „?” la începutul titlului sau după punct → va fi majusculă
  s = s.replace(/(^|[^\p{L}])\?([iI])(?!\p{L})/gu, (m, a, i) => a + (i === "I" ? "ȘI" : "și"))
    .replace(/(^|[^\p{L}])\?(?=t\p{L})/gu, "$1ș")
    .replace(/(\p{L})\?(?=t)/gu, "$1ș")
    .replace(/([nN])\?(?=\p{L}|$|[^\p{L}])/gu, "$1ț")
    .replace(/(\p{L})\?(?=i(?:[aeiouăâî]|[^\p{L}]|$))/gu, "$1ț")
    .replace(/(\p{L})\?(?=\p{L})/gu, "$1ș");
  // la începutul titlului sau după punct: majusculă (Știință, Ție) — doar unde lipsea litera
  return s.replace(/\u0001(\S)/g, (m, c) => c.toUpperCase()).replace(/\u0001/g, "");
}
// BibTeX (ex. Google Scholar → Cite → BibTeX) → CSL
function parseBibtex(src) {
  const out = []; const re = /@(\w+)\s*\{\s*([^,\s]*)\s*,/g; let m;
  while ((m = re.exec(src))) {
    const type = m[1].toLowerCase(); if (/^(comment|preamble|string)$/.test(type)) continue;
    let i = re.lastIndex, depth = 1; const start = i;
    while (i < src.length && depth > 0) { if (src[i] === "{") depth++; else if (src[i] === "}") depth--; i++; }
    const body = src.slice(start, i - 1), f = {};
    const fr = /(\w[\w-]*)\s*=\s*/g; let fm;
    while ((fm = fr.exec(body))) {
      let j = fr.lastIndex, val = "";
      if (body[j] === "{") { let d = 0, k = j; for (; k < body.length; k++) { if (body[k] === "{") d++; else if (body[k] === "}") { d--; if (!d) break; } } val = body.slice(j + 1, k); fr.lastIndex = k + 1; }
      else if (body[j] === '"') { const k = body.indexOf('"', j + 1); val = body.slice(j + 1, k); fr.lastIndex = k + 1; }
      else { const k = body.slice(j).search(/[,}\n]/); val = body.slice(j, k < 0 ? undefined : j + k); fr.lastIndex = j + (k < 0 ? body.length : k); }
      f[fm[1].toLowerCase()] = latex(val).replace(/[{}]/g, "").replace(/\\&/g, "&").replace(/\s+/g, " ").trim();
    }
    // un text românesc (diacritice sau „?” în mijlocul cuvintelor): refacem ce s-a pierdut și ținem minte, ca să-ți cerem să verifici
    const vals = Object.values(f), ro = vals.some(v => RO_SIGN.test(v)) || vals.some(v => /\p{L}\?\p{L}/u.test(v)) || vals.some(v => /(^|\s)\?i(\s|$)/.test(v));
    let fixed = false;
    if (ro) for (const k of Object.keys(f)) { const r = roFix(f[k]); if (r !== f[k]) { if (/\?/.test(f[k])) fixed = true; f[k] = r; } }
    const names = s => (s || "").split(/\s+and\s+/i).map(splitName).filter(Boolean);
    const T = { article: "article-journal", book: "book", inbook: "chapter", incollection: "chapter", inproceedings: "paper-conference", conference: "paper-conference", phdthesis: "thesis", mastersthesis: "thesis", techreport: "report", misc: "document", online: "webpage" };
    const csl = { type: T[type] || "document", title: f.title, author: names(f.author), editor: f.editor ? names(f.editor) : undefined,
      "container-title": f.journal || f.booktitle, publisher: f.publisher || f.school || f.institution, "publisher-place": f.address,
      volume: f.volume, issue: f.number, page: f.pages?.replace(/-+/g, "-"), DOI: f.doi, ISBN: f.isbn, URL: f.url, edition: f.edition, abstract: f.abstract,
      issued: f.year ? { "date-parts": [[+f.year]] } : undefined };
    out.push({ csl: cleanCsl(csl), bibkey: m[2], fixed });
  }
  return out;
}

// RIS (Zotero, Mendeley, EndNote, baze de date) → CSL
function parseRis(src) {
  const out = []; let cur = null;
  const TY = { JOUR: "article-journal", BOOK: "book", CHAP: "chapter", CONF: "paper-conference", CPAPER: "paper-conference", THES: "thesis", RPRT: "report", ELEC: "webpage", NEWS: "article-newspaper", MGZN: "article-magazine", ENCYC: "entry-encyclopedia", GEN: "document" };
  for (const line of String(src).split(/\r?\n/)) {
    const m = /^([A-Z][A-Z0-9])  -\s?(.*)$/.exec(line); if (!m) continue;
    const [, tag, v] = m;
    if (tag === "TY") { cur = { type: TY[v.trim()] || "document", author: [], editor: [] }; continue; }
    if (!cur) continue;
    if (tag === "ER") { const sp = cur.sp, ep = cur.ep; delete cur.sp; delete cur.ep; if (sp) cur.page = ep ? `${sp}-${ep}` : sp; out.push({ csl: cleanCsl(cur), bibkey: null }); cur = null; continue; }
    const name = x => { const [f, g] = x.split(/,\s*/); return g ? { family: f.trim(), given: g.trim() } : splitName(x); };
    if (/^(AU|A1)$/.test(tag)) cur.author.push(name(v)); else if (/^(ED|A2|A3)$/.test(tag)) cur.editor.push(name(v));
    else if (/^(TI|T1)$/.test(tag)) cur.title = v; else if (/^(T2|JO|JF|BT)$/.test(tag)) cur["container-title"] = cur["container-title"] || v;
    else if (/^(PY|Y1|DA)$/.test(tag)) { const y = /\d{4}/.exec(v); if (y && !cur.issued) cur.issued = { "date-parts": [[+y[0]]] }; }
    else if (tag === "VL") cur.volume = v; else if (tag === "IS") cur.issue = v; else if (tag === "SP") cur.sp = v; else if (tag === "EP") cur.ep = v;
    else if (tag === "PB") cur.publisher = v; else if (tag === "CY") cur["publisher-place"] = v; else if (tag === "DO") cur.DOI = v; else if (tag === "SN") cur.ISBN = cur.ISBN || v;
    else if (tag === "UR") cur.URL = cur.URL || v; else if (tag === "AB") cur.abstract = v; else if (tag === "LA") cur.language = v; else if (tag === "ET") cur.edition = v;
  }
  return out;
}
// ce fel de text ai lipit: BibTeX, RIS, sau referințe scrise (una pe paragraf; sau una pe rând, dacă fiecare rând arată ca o referință)
function pastedKind(text) {
  const t = String(text || "").trim(); if (!t) return { kind: "none", refs: [] };
  if (/@\w+\s*\{/.test(t)) return { kind: "bibtex", refs: parseBibtex(t) };
  if (/^TY  - /m.test(t)) return { kind: "ris", refs: parseRis(t) };
  let parts = t.split(/\n\s*\n/).map(x => x.trim()).filter(Boolean);
  if (parts.length === 1) {
    const lines = t.split(/\n/).map(x => x.trim()).filter(Boolean);
    const refLike = l => /\b10\.\d{4,9}\/\S+/.test(l) || /ISBN|97[89][\d-]{10,}/i.test(l) || /^https?:\/\//.test(l) || (l.length > 40 && /\b(1[5-9]\d\d|20\d\d)\b/.test(l));
    if (lines.length > 1 && lines.every(refLike)) parts = lines;
  }
  return { kind: "text", refs: parts.map(p => p.replace(/\s*\n\s*/g, " ")) };
}
// text lipit în Căutare care e de fapt o referință întreagă (sau mai multe): merge în „Lipește”, unde e citit ca referință
function looksLikeRef(text) {
  const s = String(text || "").trim(); if (!s) return false;
  if (/@\w+\s*\{/.test(s) || /^TY {1,2}- /m.test(s)) return true;                 // BibTeX, RIS
  const one = s.replace(/\s*\n\s*/g, " "), id = l => /\b10\.\d{4,9}\/\S+/.test(l) || /ISBN|97[89][\d-]{10,}/i.test(l) || /^https?:\/\//.test(l.trim());
  const lines = s.split(/\n/).filter(l => l.trim());
  if (lines.length >= 2 && lines.filter(id).length >= 2) return true;               // mai mulți identificatori, câte unul pe rând
  if (one.length < 50) return false;
  const year = /\b(1[5-9]\d\d|20\d\d)[a-z]?\b/.test(one);
  const names = /[A-ZĂÂÎȘȚ][\p{L}'’-]+,\s*[A-ZĂÂÎȘȚ]/u.test(one) || /\bet al\b/i.test(one) || /\(\s*(1[5-9]|20)\d\d[a-z]?\s*\)/.test(one) || /\b[A-ZĂÂÎȘȚ][\p{L}'’-]+ [A-Z]{1,3}\b[,;]/u.test(one);
  return year && names && (one.match(/[.,;:]/g) || []).length >= 3;
}
// o referință scrisă (APA, Chicago, Vancouver, Frontiers…) citită cât se poate: autori, an, titlu, revistă
function guessRef(text) {
  const t = String(text).replace(/\s+/g, " ").trim();
  const ym = /\((1[5-9]\d\d|20\d\d)[a-z]?\)|\b(1[5-9]\d\d|20\d\d)[a-z]?\b/.exec(t), year = ym ? +(ym[1] || ym[2]) : null;
  let auth = ym ? t.slice(0, ym.index) : "", rest = ym ? t.slice(ym.index + ym[0].length) : t;
  rest = rest.replace(/^[\s.,:)]+/, "");
  const q = /^[“"«„]([^”"»]+)[”"»]/.exec(rest), tm = q ? [null, q[1], rest.slice(q[0].length)] : /^(.+?[.?!])\s+(.*)$/.exec(rest);
  const title = (tm ? tm[1] : rest).replace(/[.\s]+$/, "").trim(), after = (tm ? tm[2] : "").replace(/^[\s.,]+/, "");
  // după titlu: „Loc: Editură” (carte) sau „Revista, volum(număr), pagini”
  const pub = /^([A-ZĂÂÎȘȚ][^:.,\d]{1,40}):\s*([^.]+)/.exec(after);
  const cont = pub ? [] : (/^(?:In:?\s+)?([^\d][^,]*?)(?:,\s*|\.\s+|\s+)(\d+)/.exec(after) || /^(?:In:?\s+)?([^\d][^.,]*)/.exec(after) || []);
  const initials = x => /^(?:[A-ZĂÂÎȘȚ]\.?\s?-?){1,4}$/.test(x.trim());
  const toks = auth.replace(/\s*&\s*|\s+(?:and|și|et)\s+/g, ", ").replace(/\bet al\.?/g, "").split(/\s*[,;]\s*/).map(x => x.trim()).filter(Boolean);
  const authors = [];
  // Chicago: primul autor inversat („Blackburn, Simon”), ceilalți normal
  if (toks.length >= 2 && !/\s/.test(toks[0]) && /^[A-ZĂÂÎȘȚ][\p{L}'-]+\.?$/u.test(toks[1]) && !initials(toks[1]) && (toks.length === 2 || /\s/.test(toks[2]))) {
    authors.push({ family: toks[0], given: toks[1].replace(/\.$/, "") }); toks.splice(0, 2);
  }
  for (let i = 0; i < toks.length; i++) {
    const a = toks[i], nx = toks[i + 1];
    if (nx && initials(nx) && !initials(a)) { authors.push({ family: a.replace(/[.]$/, ""), given: nx.trim() }); i++; continue; }   // APA: „Felber, N. A.”
    const w = a.split(/\s+/);
    if (w.length > 1 && initials(w[w.length - 1])) { authors.push({ family: w.slice(0, -1).join(" "), given: w[w.length - 1] }); continue; }   // Vancouver: „Felber NA”
    if (initials(a)) continue;
    const n = splitName(a); if (n) authors.push(n);
  }
  const isPub = x => /\b(editura|press|publishing|publishers|verlag|éditions|edizioni|humanitas|polirom|nemira)\b/i.test(x || "");
  if (cont[1] && isPub(cont[1])) return cleanCsl({ type: "book", title, author: authors, issued: year ? { "date-parts": [[year]] } : undefined, publisher: cont[1].trim() });
  return cleanCsl({ type: cont[1] ? "article-journal" : "book", title, author: authors, issued: year ? { "date-parts": [[year]] } : undefined,
    "container-title": cont[1]?.trim(), volume: cont[2], "publisher-place": pub?.[1]?.trim(), publisher: pub?.[2]?.trim() });
}

// miezul nopții UTC (OpenAlex își reface bugetul atunci) și al Californiei (Google Books)
const nextUtcMidnight = () => { const d = new Date(); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1); };
const nextPacificMidnight = () => { try { const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23" }).formatToParts(new Date()).map(x => [x.type, x.value])); return Date.now() + ((23 - +p.hour) * 3600 + (59 - +p.minute) * 60 + (60 - +p.second)) * 1000; } catch (e) { return Date.now() + 86400000; } };

// câmpurile cu foldere din vault: lista folderelor apare cât scrii (ca să fie clar că e un folder din vault, nu text oarecare)
const _obs = require("obsidian");
const FolderSuggest = _obs.AbstractInputSuggest ? class extends _obs.AbstractInputSuggest {
  constructor(app, inputEl, onPick) { super(app, inputEl); this.inp = inputEl; this.onPick = onPick; }
  getSuggestions(q) {
    const v = this.app.vault, all = v.getAllFolders ? v.getAllFolders(false) : v.getAllLoadedFiles().filter(f => f.children);
    q = String(q || "").toLowerCase();
    return all.map(f => f.path).filter(p => p && p !== "/" && !/^\.trash(\/|$)/.test(p) && !/(^|\/)\./.test(p) && p.toLowerCase().includes(q)).sort((a, b) => a.localeCompare(b)).slice(0, 60);
  }
  renderSuggestion(p, el) { el.setText(p); }
  selectSuggestion(p) { this.inp.value = p; this.inp.dispatchEvent(new Event("input")); this.inp.dispatchEvent(new Event("change")); this.onPick?.(p); this.close(); }
} : null;

class Sources {
  constructor(host, dir) { this.host = host; this.app = host.app; this.dir = dir; this.providers = []; }
  get en() { return this.app.loadLocalStorage(LANG) === "en"; }
  T(ro, en) { return this.en ? en : ro; }
  conf() {
    const s = this.host.settings; if (!s.sources) s.sources = {};
    const c = s.sources, d = { disabled: [], openalexKey: "", s2Key: "", serpapiKey: "", email: "", pdf: true };
    for (const k in d) if (!(k in c)) c[k] = d[k];
    // Semantic Scholar fără cheie răspunde aproape mereu „prea multe cereri”: pornit doar cu cheie
    if (!c.v) { c.v = 1; if (!c.s2Key && !c.disabled.includes("semanticscholar")) c.disabled.push("semanticscholar"); }
    return c;
  }
  save() { return this.host.saveData(this.host.settings); }
  // șablonul notei de literatură: cel implicit al vault-ului Texere, apoi îl schimbi în Setări → Texere · Sources → Șablonul notei
  template() {
    const c = this.conf();
    if (!c.template) { c.template = JSON.parse(JSON.stringify(this.T_.DEFAULT)); this.save(); }
    if (c.template.filename === this.T_.FILENAME_V1) { c.template.filename = this.T_.FILENAME; this.save(); }
    if (c.template.from) { delete c.template.from; this.save(); }   // urma vechiului punct de pornire   // numele primesc și anul original (traduceri)
    return c.template;
  }
  // deschide Setări → Texere · Sources, la o anumită filă
  openSettings(tab) {
    try { if (this.settingTab) this.settingTab.tab = tab; this.app.setting.open(); this.app.setting.openTabById(this.host.manifest.id); } catch (e) { console.warn(e); }
  }
  // valorile pe care le are deja câmpul în notele de literatură (pentru sugestii) și dacă sunt linkuri [[…]]
  fieldUsage(name) {
    const vals = new Map(); let links = 0, plain = 0;
    let files = []; try { files = this.app.vault.getMarkdownFiles(); } catch (e) {}
    for (const f of files) {
      if (!f.path.startsWith(this.litDir())) continue;
      const v = this.app.metadataCache?.getFileCache?.(f)?.frontmatter?.[name];
      for (const x of Array.isArray(v) ? v : v != null && v !== "" ? [v] : []) {
        const s = String(x), m = /^\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/.exec(s.trim());
        if (m) links++; else plain++;
        const k = (m ? m[1] : s).trim(); if (k) vals.set(k, (vals.get(k) || 0) + 1);
      }
    }
    return { values: [...vals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(e => e[0]), links: links >= plain };
  }
  // de unde vin valorile câmpurilor de completat: notele dintr-un folder cu același nume (ex. Fields/Philosophy/Branch pentru branch,
  // „Historical Periods” pentru historical-period) și valorile folosite deja în orice notă din vault. Se poate alege alt folder în Setări → Șablonul notei.
  fieldIndex(names) {
    const norm = x => fold(x).replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().replace(/ies$/, "y").replace(/s$/, "");
    const link = x => { const m = /^\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]$/.exec(String(x).trim()); return (m ? m[1].split("/").pop() : String(x)).trim(); };
    const arr = v => Array.isArray(v) ? v : v != null && v !== "" ? [v] : [];
    const tpl = this.template(), idx = { byName: new Map(), link, arr, fields: {} };
    for (const n of names) idx.fields[n] = { opts: new Map(), folders: new Set(), src: (tpl.fields.find(f => f.name === n)?.source || "").replace(/\/+$/, "") };
    let files = []; try { files = this.app.vault.getMarkdownFiles(); } catch (e) {}
    const add = (n, name, aliases, folder, used) => {
      if (!name) return; const F = idx.fields[n]; let o = F.opts.get(name);
      if (!o) F.opts.set(name, o = { name, aliases: [], inFolder: false, count: 0 });
      if (aliases) o.aliases = [...new Set([...o.aliases, ...arr(aliases).map(String)])];
      if (folder) o.inFolder = true; if (used) o.count++;
    };
    for (const f of files) {
      const fm = this.app.metadataCache?.getFileCache?.(f)?.frontmatter || {};
      idx.byName.set(f.basename, fm);
      const parts = (f.parent?.path || "").split("/");
      for (const n of names) {
        const F = idx.fields[n];
        const hit = F.src ? f.path.startsWith(F.src + "/") : parts.some(p => p && norm(p) === norm(n));
        if (hit) { add(n, f.basename, fm.aliases, true); if (!F.src) F.folders.add(parts.slice(0, parts.findIndex(p => norm(p) === norm(n)) + 1).join("/")); }
        for (const v of arr(fm[n])) add(n, link(v), null, false, true);
      }
    }
    return idx;
  }
  // sugestiile pentru un câmp: întâi cele legate de ce ai ales deja (ex. teoriile ramurii alese), apoi cele din folderul câmpului, apoi după cât sunt folosite
  fieldOptions(idx, name, chosen) {
    const F = idx.fields[name]; if (!F) return [];
    const rel = new Set();
    for (const [other, vals] of Object.entries(chosen || {})) if (other !== name) for (const v of vals) for (const x of idx.arr(idx.byName.get(v)?.[name])) rel.add(idx.link(x));
    const related = o => rel.has(o.name) || Object.entries(chosen || {}).some(([other, vals]) => other !== name && vals.length && idx.arr(idx.byName.get(o.name)?.[other]).map(idx.link).some(x => vals.includes(x)));
    return [...F.opts.values()].map(o => ({ ...o, related: related(o) }))
      .sort((a, b) => (b.related - a.related) || (b.inFolder - a.inFolder) || (b.count - a.count) || a.name.localeCompare(b.name));
  }
  // tipul unui câmp: „links” (listă de linkuri), „list”, „text” sau „auto” (se calculează din datele sursei)
  fieldKind(f) {
    if (!this.T_.isFill(f)) return "auto";
    if (f.kind) return f.kind;
    if (!this.T_.isList(f)) return "text";
    return this.fieldUsage(f.name).links ? "links" : "list";
  }
  // câmpurile notei pentru o sursă: valorile din șablon, peste care se pun cele scrise de tine în formular
  noteFields(csl, key, attachments, custom) {
    const vars = this.tplVars(csl, key, attachments);
    const out = [];
    for (const f of this.template().fields) {
      if (!f.enabled || !f.name) continue;
      const v = custom && Object.prototype.hasOwnProperty.call(custom, f.name) ? custom[f.name] : this.T_.fieldValue(f, vars);
      if (v !== undefined) out.push([f.name, v]);
    }
    return out;
  }
  // numele notei și al PDF-ului: „Autor An – Titlu scurt” (șablonul din Setări → Nume și foldere); citarea rămâne [@citekey]
  // variabilele șablonului pentru o sursă: datele ei plus cele suplimentare (anul și titlul originalului, ISBN…)
  tplVars(csl, key, attachments) {
    const { citation, contributors, additionalFields } = this.noteData(csl, key), extra = {};
    for (const f of additionalFields) if (!(f.name in citation)) extra[f.name] = f.value;
    return this.T_.variables({ ...extra, ...citation }, contributors, attachments || [], []);
  }
  fileBase(csl, key) {
    const t = this.template(), vars = this.tplVars(csl, key);
    return this.T_.fileBase(t.filename || this.T_.FILENAME, vars) || "@" + key;
  }
  // ce s-ar redenumi: fiecare notă de literatură după șablon, iar PDF-urile ei cu același nume (doar cele atașate unei singure note)
  tidyPlan() {
    const mc = this.app.metadataCache, arr = v => Array.isArray(v) ? v : v ? [v] : [], used = new Set(), plan = [];
    const notes = this.app.vault.getMarkdownFiles().filter(f => f.path.startsWith(this.litDir()));
    const target = (dir, base, ext, self) => {
      let p = normalizePath(`${dir}/${base}.${ext}`), n = 2;
      while ((p !== self && this.app.vault.getAbstractFileByPath(p)) || used.has(p)) p = normalizePath(`${dir}/${base} (${n++}).${ext}`);
      used.add(p); return p;
    };
    const att = f => arr(mc.getFileCache(f)?.frontmatter?.attachment).map(x => /\[\[([^\]|#]+)/.exec(String(x))?.[1]).filter(Boolean)
      .map(l => mc.getFirstLinkpathDest(l, f.path)).filter(p => p && /^(pdf|epub)$/i.test(p.extension));
    const owners = new Map(); for (const f of notes) for (const p of att(f)) owners.set(p.path, (owners.get(p.path) || 0) + 1);
    for (const f of notes) {
      const fm = mc.getFileCache(f)?.frontmatter; if (!fm?.id) continue;
      const csl = this.cslOfFm(fm);
      const base = this.fileBase(csl, fm.id);
      const to = target(this.notesDir(csl, fm.id), base, "md", f.path);
      if (to !== f.path) plan.push({ kind: "note", file: f, to, key: fm.id });
      const pb = this.pdfBase(csl, fm.id, base);
      // PDF-urile din folderul de documente (sau din Inbox) se mută în folderul sursei; cele ținute în altă parte rămân acolo
      const docRoot = this.docDir() + "/", pdir = this.pdfDir(csl, fm.id);
      att(f).forEach((p, i) => {
        if (owners.get(p.path) > 1) return;
        const dir = p.path.startsWith(docRoot) || p.path.startsWith(this.inboxDir() + "/") ? pdir : (p.parent?.path || ""), name = pb ? (i ? `${pb} (${i + 1})` : pb) : p.basename;
        const t = target(dir, name, p.extension, p.path); if (t !== p.path) plan.push({ kind: "pdf", file: p, to: t, key: fm.id });
      });
    }
    return plan;
  }
  // calculează ceva ca și cum folderele ar fi altele (pentru previzualizare), fără să schimbe setarea
  withFiles(cfg, fn) { const c = this.conf(), old = c.files; c.files = { ...old, ...cfg }; try { return fn(); } finally { c.files = old; } }
  // previzualizarea folderelor noi: unde ar ajunge o sursă nouă și ce fișiere existente s-ar muta; abia apoi se aplică
  previewFiles(draft, onDone) {
    const S = this, T = (a, b) => this.T(a, b);
    const ex = { type: "book", title: "Think: A compelling introduction to philosophy", author: [{ family: "Blackburn", given: "Simon" }], issued: { "date-parts": [[2001]] } }, exk = "blackburn_think_2001";
    const sample = this.withFiles(draft, () => { const nb = this.fileBase(ex, exk), pb = this.pdfBase(ex, exk, nb); return { note: `${this.notesDir(ex, exk)}/${nb}.md`, pdf: `${this.pdfDir(ex, exk)}/${pb || "Think.pdf"}${pb ? ".pdf" : ""}`, inbox: String(draft.inbox || "").replace(/\/+$/, "") }; });
    const plan = this.withFiles(draft, () => this.tidyPlan());
    const M = class extends Modal {
      onOpen() {
        this.modalEl.addClass("texere-tidy"); this.titleEl.setText(T("Folderele noi: previzualizare", "New folders: preview"));
        const c = this.contentEl;
        c.createEl("p", { cls: "ts-hint", text: T("Nimic nu s-a schimbat încă. Așa ar arăta:", "Nothing has changed yet. This is what it would look like:") });
        const ex = c.createDiv("ts-tidy-list");
        for (const [lab, val] of [[T("O sursă nouă · nota", "A new source · note"), sample.note], [T("O sursă nouă · PDF-ul", "A new source · PDF"), sample.pdf], ["Inbox", sample.inbox + "/"]]) {
          const r = ex.createDiv("ts-tidy-row"); const tx = r.createDiv(); tx.createDiv({ cls: "ts-tidy-old", text: lab }); tx.createDiv({ cls: "ts-tidy-new", text: val });
        }
        c.createEl("p", { cls: "ts-hint", text: plan.length ? T(`Fișierele existente care s-ar muta (${plan.length}). Linkurile și evidențierile se actualizează singure; citările rămân la fel.`, `Existing files that would move (${plan.length}). Links and highlights update themselves; citations stay the same.`)
          : T("Niciun fișier existent nu trebuie mutat.", "No existing file needs to move.") });
        const checks = [];
        if (plan.length) {
          const list = c.createDiv("ts-tidy-list ts-tidy-scroll");
          for (const it of plan) {
            const row = list.createEl("label", { cls: "ts-tidy-row" + (it.kind === "pdf" ? " pdf" : "") });
          row.addEventListener("mousedown", e => e.preventDefault());   // bifa se schimbă, dar lista nu sare (fără focus/scroll)
            const cb = row.createEl("input", { type: "checkbox" }); cb.checked = true; checks.push([cb, it]);
            const tx = row.createDiv(); tx.createDiv({ cls: "ts-tidy-old", text: it.file.path }); tx.createDiv({ cls: "ts-tidy-new", text: "→ " + it.to });
          }
        }
        const bar = c.createDiv("ts-tidy-bar");
        const no = bar.createEl("button", { text: T("Renunță", "Cancel") }); no.addEventListener("click", () => this.close());
        const only = bar.createEl("button", { text: plan.length ? T("Doar pentru sursele noi", "For new sources only") : T("Aplică", "Apply") });
        only.addEventListener("click", async () => { Object.assign(S.filesConf(), draft); await S.save(); this.close(); onDone?.(); new Notice(T("Folderele noi se folosesc de acum.", "The new folders are used from now on.")); });
        if (plan.length) {
          const go = bar.createEl("button", { cls: "mod-cta" });
          const count = () => { const n = checks.filter(([cb]) => cb.checked).length; go.setText(T(`Aplică și mută ${n} fișiere`, `Apply and move ${n} files`)); go.disabled = !n; };
          checks.forEach(([cb]) => cb.addEventListener("change", count)); count();
          go.addEventListener("click", async () => {
            go.disabled = true; Object.assign(S.filesConf(), draft); await S.save();
            let ok = 0, bad = 0;
            for (const [cb, it] of checks) {
              if (!cb.checked) continue;
              try { const dir = it.to.slice(0, it.to.lastIndexOf("/")); await S.ensureFolder(dir); await S.app.fileManager.renameFile(it.file, S.freePath(dir, it.to.split("/").pop().replace(/\.[^.]+$/, ""), it.file.extension, it.file.path)); ok++; }
              catch (e) { bad++; console.error("Texere Sources: mutare", it.file.path, e); }
            }
            this.close(); onDone?.();
            new Notice(T(`Mutate: ${ok}`, `Moved: ${ok}`) + (bad ? T(` · nu s-au putut muta: ${bad} (vezi consola)`, ` · couldn't move: ${bad} (see the console)`) : ""), 8000);
          });
        }
      }
      onClose() { this.contentEl.empty(); }
    };
    new M(this.app).open();
  }
  // fereastra de previzualizare: bifezi ce vrei și redenumești prin Obsidian (linkurile din note și din evidențieri se actualizează)
  tidy(firstTime) {
    const S = this, T = (a, b) => this.T(a, b), plan = this.tidyPlan();
    if (!plan.length) { new Notice(T("Toate sursele au deja nume „Autor An – Titlu”.", "All sources already have “Author Year – Title” names.")); return; }
    const M = class extends Modal {
      onOpen() {
        this.modalEl.addClass("texere-tidy"); this.titleEl.setText(T("Redenumește sursele", "Rename sources"));
        const c = this.contentEl;
        c.createEl("p", { cls: "ts-hint", text: T("Notele și PDF-urile primesc numele „Autor An – Titlu”. Citările [@citekey] rămân la fel, iar Obsidian actualizează toate linkurile, inclusiv cele din evidențieri.",
          "Notes and PDFs get “Author Year – Title” names. Citations [@citekey] stay the same, and Obsidian updates every link, including those in your highlights.") });
        const list = c.createDiv("ts-tidy-list ts-tidy-scroll"), checks = [];
        for (const it of plan) {
          const row = list.createEl("label", { cls: "ts-tidy-row" + (it.kind === "pdf" ? " pdf" : "") });
          row.addEventListener("mousedown", e => e.preventDefault());   // bifa se schimbă, dar lista nu sare (fără focus/scroll)
          const cb = row.createEl("input", { type: "checkbox" }); cb.checked = true; checks.push([cb, it]);
          const tx = row.createDiv(); tx.createDiv({ cls: "ts-tidy-old", text: (it.kind === "pdf" ? "PDF · " : "") + it.file.name });
          tx.createDiv({ cls: "ts-tidy-new", text: "→ " + it.to.split("/").pop() });
        }
        const bar = c.createDiv("ts-tidy-bar");
        const later = bar.createEl("button", { text: T("Nu acum", "Not now") }); later.addEventListener("click", () => this.close());
        const go = bar.createEl("button", { cls: "mod-cta" });
        const count = () => { const n = checks.filter(([cb]) => cb.checked).length; go.setText(T(`Redenumește ${n} fișiere`, `Rename ${n} files`)); go.disabled = !n; };
        checks.forEach(([cb]) => cb.addEventListener("change", count)); count();
        go.addEventListener("click", async () => {
          go.disabled = true; let ok = 0, bad = 0;
          for (const [cb, it] of checks) {
            if (!cb.checked) continue;
            try {
              await S.ensureFolder(it.to.slice(0, it.to.lastIndexOf("/")));
              const to = S.app.vault.getAbstractFileByPath(it.to) ? S.freePath(it.to.slice(0, it.to.lastIndexOf("/")), it.to.split("/").pop().replace(/\.[^.]+$/, ""), it.file.extension) : it.to;
              await S.app.fileManager.renameFile(it.file, to); ok++;
              if (it.kind === "note") await S.app.fileManager.processFrontMatter(it.file, fm => { const al = Array.isArray(fm.aliases) ? fm.aliases : fm.aliases ? [fm.aliases] : []; if (!al.includes("@" + it.key)) fm.aliases = [...al, "@" + it.key]; });
            } catch (e) { bad++; console.error("Texere Sources: redenumire", it.file.path, e); }
          }
          this.close();
          new Notice(T(`Redenumite: ${ok}`, `Renamed: ${ok}`) + (bad ? T(` · nu s-au putut redenumi: ${bad} (vezi consola)`, ` · couldn't rename: ${bad} (see the console)`) : ""), 8000);
        });
      }
      onClose() { this.contentEl.empty(); if (firstTime) { S.conf().tidyOffered = 2; S.save(); } }
    };
    new M(this.app).open();
  }
  // numele PDF-ului: ca nota (implicit), după alt șablon, sau păstrat cum vine (null)
  pdfBase(csl, key, noteBase) {
    const t = this.template(), mode = t.pdfMode || "note";
    if (mode === "keep") return null;
    if (mode === "custom") { const vars = this.tplVars(csl, key); return this.T_.fileBase(t.pdfName || this.T_.FILENAME, vars) || key; }
    return noteBase || this.fileBase(csl, key);
  }
  // un nume liber în folder: „…2001”, apoi „…2001 (2)”
  freePath(dir, base, ext, self) {
    let p = normalizePath(`${dir}/${base}.${ext}`), n = 2;
    while (this.app.vault.getAbstractFileByPath(p) && p !== self) p = normalizePath(`${dir}/${base} (${n++}).${ext}`);
    return p;
  }
  noteHeader(csl, key) {
    const t = this.template(), vars = this.tplVars(csl, key);
    const tpl = csl.type === "chapter" && csl["container-title"] && t.chapterHeader ? t.chapterHeader : t.header;
    return this.T_.render(tpl || "# {{title}}", vars);
  }
  // notele de literatură: au cheie (id) și eticheta din șablon
  isLitNote(fm) {
    if (!fm?.id) return false;
    const want = (this.T_?.tags(this.template().tag) || ["literature_note"]).map(t => String(t).replace(/^#/, "").toLowerCase());
    const has = (Array.isArray(fm.tags) ? fm.tags : fm.tags ? String(fm.tags).split(/[,\s]+/) : []).map(t => String(t).replace(/^#/, "").toLowerCase());
    return want.some(t => has.includes(t));
  }
  entryOf(fm, path) { const { tags, position, ...e } = fm; return JSON.parse(JSON.stringify({ ...e, obsidianPath: path })); }
  // bibliografia (bibliography.json) urmează notele: schimbi ceva în proprietățile unei note de literatură → intrarea ei se schimbă la fel
  syncFromNotes(h) {
    const mc = this.app.metadataCache, pend = new Map(), same = (a, b) => JSON.stringify(a, Object.keys(a).sort()) === JSON.stringify(b, Object.keys(b).sort());
    const run = async file => {
      const fm = mc.getFileCache(file)?.frontmatter; if (!this.isLitNote(fm)) return;
      const entry = this.entryOf(fm, file.path), all = this.lib.all();
      const i = all.findIndex(e => e.obsidianPath === file.path), j = all.findIndex(e => e.id === entry.id);
      if (i < 0 && j < 0) { await this.lib.add(entry); return; }
      const k = i >= 0 ? i : j; if (same(all[k], entry)) return;
      all[k] = entry; await this.lib.save();
    };
    if (mc.on) h.registerEvent(mc.on("changed", file => {
      if (!(file instanceof TFile) || file.extension !== "md") return;
      clearTimeout(pend.get(file.path)); pend.set(file.path, setTimeout(() => { pend.delete(file.path); run(file).catch(e => console.warn("Texere Sources: bibliografia din notă", e)); }, 600));
    }));
  }
  // refă bibliografia din toate notele de literatură
  async rebuildFromNotes(quiet) {
    const mc = this.app.metadataCache, out = [], seen = new Set();
    for (const f of this.app.vault.getMarkdownFiles()) { const fm = mc.getFileCache(f)?.frontmatter; if (this.isLitNote(fm) && !seen.has(fm.id)) { seen.add(fm.id); out.push(this.entryOf(fm, f.path)); } }
    this.lib.entries = out; await this.lib.save();
    if (!quiet) new Notice(this.T(`Bibliografia e refăcută din note: ${out.length} surse.`, `The bibliography was rebuilt from your notes: ${out.length} sources.`), 5000);
    return out.length;
  }
  // setările de bază (o singură dată): bibliografia, regula cheii de citare, nota deschisă după adăugare, butonul Zotero
  async ownSettings() {
    const c = this.conf(); let ch = false;
    if (!c.bibPath) { c.bibPath = BIB_DEFAULT; ch = true; }
    if (!c.citekey) { c.citekey = CITEKEY_DEFAULT; ch = true; }
    if (c.openNote === undefined) { c.openNote = true; ch = true; }
    if (c.zoteroConnector === undefined) { c.zoteroConnector = false; ch = true; }
    // folderul vechi al bibliografiei („Support/Admin/biblib”) devine „Support/Admin/Bibliography”, prin Obsidian (linkurile urmează)
    const OLD = "Support/Admin/biblib", dir = c.bibPath.slice(0, c.bibPath.lastIndexOf("/"));
    if (dir === OLD) {
      const NEW = BIB_DEFAULT.slice(0, BIB_DEFAULT.lastIndexOf("/")), from = this.app.vault.getAbstractFileByPath(OLD);
      try {
        if (from && !this.app.vault.getAbstractFileByPath(NEW)) await this.app.fileManager.renameFile(from, NEW);
        if (this.app.vault.getAbstractFileByPath(NEW + c.bibPath.slice(OLD.length)) || !from) { c.bibPath = NEW + c.bibPath.slice(OLD.length); ch = true; }
      } catch (e) { console.warn("Texere Sources: mutarea bibliografiei", e); }
    }
    if (ch) await this.save();
  }
  // folderele: note, PDF-uri, Inbox (Setări → Nume și foldere); pot folosi variabile, ex. „Documents/{{authorsShort}}”
  filesConf() {
    const c = this.conf();
    if (!c.files) {
      c.files = { notes: "01. Sources/Literature Notes", pdfs: "01. Sources/Documents", inbox: "01. Sources/Documents/Inbox" };
      this.save();
    }
    return c.files;
  }
  // partea fixă a unui folder cu variabile: „Documents/{{authorsShort}}” → „Documents”
  rootOf(p) { p = String(p || "").replace(/\/+$/, ""); const i = p.indexOf("{{"); if (i < 0) return p; return p.slice(0, i).replace(/\/[^/]*$/, "").replace(/\/+$/, ""); }
  litDir() { return this.rootOf(this.filesConf().notes || "01. Sources/Literature Notes") + "/"; }
  docDir() { return this.rootOf(this.filesConf().pdfs || "01. Sources/Documents"); }
  inboxDir() { return String(this.filesConf().inbox || this.docDir() + "/Inbox").replace(/\/+$/, ""); }
  // folderul unei surse anume: variabilele șablonului; fiecare parte a căii fără caractere interzise
  dirFor(tpl, csl, key) {
    const vars = this.tplVars(csl, key); vars.noteName = this.fileBase(csl, key);
    const out = this.T_.render(String(tpl || ""), vars).split("/").map(x => x.replace(/[\\:*?"<>|#^[\]]+/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean).join("/");
    return normalizePath(out || this.rootOf(tpl));
  }
  notesDir(csl, key) { return this.dirFor(this.filesConf().notes, csl, key); }
  pdfDir(csl, key) { return this.dirFor(this.filesConf().pdfs, csl, key); }
  async ensureFolder(dir) {
    if (!dir || this.app.vault.getAbstractFileByPath(dir)) return;
    let cur = ""; for (const part of dir.split("/")) { cur = cur ? cur + "/" + part : part; if (!this.app.vault.getAbstractFileByPath(cur)) { try { await this.app.vault.createFolder(cur); } catch (e) {} } }
  }
  // datele unei note de literatură, cât trebuie pentru nume și foldere
  cslOfFm(fm) { return { type: fm.type, title: fm.title, "title-short": fm["title-short"], author: fm.author, editor: fm.editor, issued: fm.issued, "original-date": fm["original-date"], DOI: fm.DOI, ISBN: fm.ISBN }; }
  bibPath() { return this.conf().bibPath || BIB_DEFAULT; }
  // lista folderelor din vault sub un câmp (Obsidian ≥ 1.4; altfel o listă simplă de sugestii a browserului)
  folderSuggest(inputEl, onPick) {
    try { if (FolderSuggest) return new FolderSuggest(this.app, inputEl, onPick); } catch (e) {}
    try {
      const id = "texere-folders-" + Math.random().toString(36).slice(2), dl = document.createElement("datalist"); dl.id = id;
      for (const f of this.app.vault.getAllLoadedFiles?.() || []) if (f.children && f.path && f.path !== "/" && !/(^|\/)\./.test(f.path)) { const o = document.createElement("option"); o.value = f.path; dl.appendChild(o); }
      inputEl.after(dl); inputEl.setAttribute("list", id);
    } catch (e) {}
    return null;
  }
  enabled() { const c = this.conf(), off = new Set(c.disabled); return this.providers.filter(p => !off.has(p.id) && (!p.requires || c[p.requires])); }

  // încarcă un fișier din folderul sources/ (require("./cite") între ele funcționează la fel)
  async mod(name) {
    this._mods = this._mods || {};
    if (this._mods[name]) return this._mods[name];
    const m = { exports: {} };
    const req = n => n.startsWith("./") ? (this._mods[n.slice(2)] || (() => { throw new Error("Texere Sources: " + n + " nu e încărcat"); })()) : require(n);
    new Function("module", "exports", "require", await this.app.vault.adapter.read(`${this.dir}/${name}.js`))(m, m.exports, req);
    return (this._mods[name] = m.exports);
  }

  // numele comenzilor: „Texere · Surse · acțiunea” / „Texere · Export · acțiunea” (doar cele generale păstrează „Texere – The Researcher's Vault”)
  renameCommands() {
    const cmds = this.app.commands?.commands || {}, pre = this.host.manifest.id + ":";
    for (const [id, c] of Object.entries(cmds)) {
      if (!id.startsWith(pre) || !c) continue; const short = id.slice(pre.length);
      if (!/^(sources|citation|export)/.test(short) || c._texereNamed) continue;
      const raw = String(c.name).replace(/^[^:]*The Researcher's Vault:\s*/, ""), [en, ro] = raw.split(" / ");
      const plugin = short.startsWith("export") ? "Export" : this.T("Surse", "Sources");
      c.name = `Texere · ${plugin} · ${(this.en ? en : (ro || en)).trim()}`; c._texereNamed = true;
    }
  }

  async load() {
    const ad = this.app.vault.adapter, pdir = this.dir + "/providers";
    const h = this.host;
    // biblioteca comună: o singură copie a bibliografiei, pentru căutare, citări, sugestii @ și statistici
    this.T_ = await this.mod("template");   // șablonul notei (câmpurile tale, eticheta, titlul)
    await this.ownSettings();
    setTimeout(() => this.renameAttachLinks().catch(e => console.warn("Texere Sources: attachment", e)), 5000);
    const Library = await this.mod("library");
    this.lib = h.lib = new Library(this.app, () => this.bibPath());
    await this.lib.load(); this.lib.watch(h);
    this.syncFromNotes(h);
    // citările (sugestiile @, afișarea în stilul ales, butonul de stil) și panoul de statistici, fiecare separat, ca o eroare într-unul să nu le oprească pe celelalte
    try { await (await this.mod("cite")).install(h); } catch (e) { console.error("Texere Sources: citările", e); }
    try { await (await this.mod("stats")).install(h); } catch (e) { console.error("Texere Sources: statisticile", e); }
    try { (await this.mod("highlights")).install(this); } catch (e) { console.error("Texere Sources: evidențierile", e); }
    try { (await this.mod("zotero")).install(this); } catch (e) { console.error("Texere Sources: Zotero", e); }
    let files = [];
    try { files = (await ad.list(pdir)).files.filter(f => f.endsWith(".js")).sort(); } catch (e) {}
    for (const f of files) {
      try {
        const mod = { exports: {} };
        new Function("module", "exports", "require", await ad.read(f))(mod, mod.exports, require);
        const p = mod.exports; if (p?.id && typeof p.search === "function") this.providers.push(p);
      } catch (e) { console.error("Texere Sources: catalogul", f, e); }
    }
    this.providers.sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
    this.css();
    h.addRibbonIcon("library", this.T("Texere · Surse", "Texere · Sources"), () => this.open());
    h.addCommand({ id: "sources-search", name: "Search sources / Caută surse", callback: () => this.open() });
    h.addCommand({ id: "sources-bibtex", name: "Paste a reference (citation, BibTeX, RIS, DOI) / Lipește o referință (citare, BibTeX, RIS, DOI)", callback: () => this.open("", "bibtex") });
    h.addCommand({ id: "sources-find-pdf", name: "Find the free PDF for this source / Caută PDF-ul gratuit pentru această sursă", checkCallback: chk => {
      const f = this.app.workspace.getActiveFile(); if (!f || !f.path.startsWith(this.litDir())) return false;
      if (!chk) this.findPdfForNote(f); return true; } });
    h.registerEvent(this.app.vault.on("delete", async f => {
      if (!(f instanceof TFile) || f.extension !== "md" || !f.path.startsWith(this.litDir())) return;
      await this.lib.removePath(f.path);
    }));
    h.addSettingTab(this.settingTab = new SourcesSettingTab(this));
    for (const ms of [0, 4000]) setTimeout(() => { try { this.renameCommands(); } catch (e) {} }, ms);   // și comenzile adăugate mai jos / de alte module
    this.selfTest().catch(e => console.error("Texere Sources: test", e));
    // catalogarea unui PDF fără sursă: din meniul PDF-ului (clic dreapta), din comenzi, sau când apare unul în Inbox
    h.addCommand({ id: "sources-catalog", name: "Add this PDF as a source / Adaugă acest PDF ca sursă", checkCallback: chk => { const f = this.app.workspace.getActiveFile(); if (!f || !DOC_EXT.test(f.extension)) return false; if (!chk) this.catalog(f); return true; } });
    h.addCommand({ id: "sources-uncataloged", name: "PDFs without a source… / PDF-uri fără sursă…", callback: () => this.uncataloged() });
    if (this.app.workspace.on) h.registerEvent(this.app.workspace.on("file-menu", (menu, f) => { if (f instanceof TFile && DOC_EXT.test(f.extension)) menu.addItem(i => i.setTitle(f.extension === "pdf" ? this.T("Adaugă ca sursă", "Add as source") : this.T("Adaugă ca sursă", "Add as source")).setIcon("library").onClick(() => this.catalog(f))); }));
    this.app.workspace.onLayoutReady?.(() => {
      const inInbox = p => String(p || "").startsWith(this.inboxDir() + "/");
      h.registerEvent(this.app.vault.on("create", f => { if (f instanceof TFile && DOC_EXT.test(f.extension) && inInbox(f.path)) this.inboxNotice(f); }));
      h.registerEvent(this.app.vault.on("rename", (f, old) => { if (f instanceof TFile && DOC_EXT.test(f.extension) && inInbox(f.path) && !inInbox(old)) this.inboxNotice(f); }));
      h.registerEvent(this.app.vault.on("rename", (f, old) => { try { this.trackFolderRename(f, old); } catch (e) {} }));   // un folder al surselor redenumit: îl ținem minte
    });
    // bara de jos: când ai deschis un PDF/EPUB, „Cataloghează acest PDF” (sau sursa lui, dacă are deja una)
    try { this.catalogStatus(h); } catch (e) { console.warn("Texere Sources: bara de jos", e); }
    // pagina din citare = pagina tipărită (vezi pdfPageExpr); se aplică formatului de evidențiere din PDF++
    this.app.workspace.onLayoutReady?.(() => setTimeout(() => { try { this.patchPdfPage(); } catch (e) { console.warn("Texere Sources: pagina din citare", e); } }, 2000));
    h.addCommand({ id: "sources-rebuild-bib", name: "Rebuild the bibliography from notes / Refă bibliografia din note", callback: () => this.rebuildFromNotes() });
    h.addCommand({ id: "sources-tidy", name: "Rename sources to “Author Year – Title” / Redenumește sursele „Autor An – Titlu”", callback: () => this.tidy() });
    // o singură dată: arată ce s-ar redenumi în sursele existente (nimic nu se mută fără „Redenumește”)
    if ((this.conf().tidyOffered || 0) < 2) this.app.workspace.onLayoutReady?.(() => setTimeout(() => { try { if (this.tidyPlan().length) this.tidy(true); else { this.conf().tidyOffered = 2; this.save(); } } catch (e) { console.warn(e); } }, 4000));
  }

  open(q, mode) { const m = new SearchModal(this, q); m.mode0 = mode; m.open(); }
  reviewFromOutside(x, csl, pdf, label) {
    const m = new SearchModal(this, "", pdf ? { pdf } : {}); m.open();
    if (label) m.titleEl.querySelector(".ts-head-t")?.setText(this.T("Adaugă o sursă", "Add a source") + " · " + label);
    setTimeout(() => m.review(x, csl), 50);
  }

  // cerere HTTP prin Obsidian (fără limitările browserului); { status, json, text, bytes }
  async http(url, opts = {}) {
    try {
      const ms = opts.timeout || 20000;
      const r = await Promise.race([requestUrl({ url, method: opts.method || "GET", headers: opts.headers || {}, throw: false }), new Promise((_, no) => later(() => no(new Error("timeout")), ms))]);
      try { this.track(url, r); } catch (e) {}
      return { status: r.status, get json() { try { return r.json; } catch (e) { return null; } }, get text() { return r.text; }, bytes: () => r.arrayBuffer, headers: r.headers };
    } catch (e) { return { status: 0, error: e }; }
  }
  // ——— limitele cataloagelor: câte căutări mai ai și când se refac (din răspunsurile lor; SerpApi și OpenAlex le spun exact, gratuit) ———
  track(url, r) {
    let host = ""; try { host = new URL(url).hostname; } catch (e) { return; }
    const c = this.conf(), u = c.usage || (c.usage = {}), now = Date.now(), h = r.headers || {}, get = k => h[k] ?? h[k.toLowerCase()] ?? h[k.replace(/(^|-)([a-z])/g, (m, a, b) => a + b.toUpperCase())];
    let ch = false;
    if (host === "api.openalex.org" && !/\/rate-limit/.test(url)) {
      const rem = parseFloat(get("x-ratelimit-remaining")), lim = parseFloat(get("x-ratelimit-limit")), used = parseFloat(get("x-ratelimit-credits-used")), reset = parseFloat(get("x-ratelimit-reset"));
      const o = u.openalex || (u.openalex = {});
      if (Number.isFinite(rem)) { o.left = rem; if (Number.isFinite(lim)) o.limit = lim; if (/[?&]search=/.test(url) && used > 0) o.cost = used; o.at = now; o.resetAt = Number.isFinite(reset) ? now + reset * 1000 : nextUtcMidnight(); ch = true; }
      if (r.status === 429) { o.left = 0; o.at = now; if (!(o.resetAt > now)) o.resetAt = nextUtcMidnight(); ch = true; }
    } else if (host === "serpapi.com" && /\/search/.test(url)) {
      let out = false; try { out = r.status === 429 || /run out of searches/i.test(r.text || ""); } catch (e) {}
      if (out) { u.googlescholar = { ...(u.googlescholar || {}), left: 0, at: now }; ch = true; }
      clearTimeout(this._serpT); this._serpT = setTimeout(() => this.refreshUsage("googlescholar"), 1500);   // SerpApi spune exact câte mai ai (fără să consume o căutare)
    } else if (host === "api.semanticscholar.org" && r.status === 429) { u.semanticscholar = { busyUntil: now + 60000, at: now }; ch = true; }
    else if (host === "www.googleapis.com" && /\/books\//.test(url)) {
      if (r.status === 429) { u.googlebooks = { left: 0, at: now, resetAt: nextPacificMidnight() }; ch = true; }
      else if (r.status === 200 && u.googlebooks) { delete u.googlebooks; ch = true; }
    }
    if (ch) { clearTimeout(this._usageSave); this._usageSave = setTimeout(() => this.save(), 2000); for (const f of [...(this._usageHooks || [])]) { try { f(); } catch (e) {} } }
  }
  // întreabă direct (gratuit): SerpApi → account.json; OpenAlex (cu cheie) → /rate-limit
  async refreshUsage(id) {
    const c = this.conf(), u = c.usage || (c.usage = {}), now = Date.now();
    try {
      if ((!id || id === "googlescholar") && c.serpapiKey) {
        const r = await requestUrl({ url: `https://serpapi.com/account.json?api_key=${encodeURIComponent(c.serpapiKey)}`, throw: false });
        const j = r.status === 200 ? r.json : null;
        if (j && j.total_searches_left != null) u.googlescholar = { left: +j.total_searches_left, limit: +j.searches_per_month || null, used: +j.this_month_usage || 0, renew: j.plan_renewal_date || null, at: now };
      }
      if ((!id || id === "openalex") && c.openalexKey) {
        const r = await requestUrl({ url: `https://api.openalex.org/rate-limit?api_key=${encodeURIComponent(c.openalexKey)}`, throw: false });
        const j = r.status === 200 ? (r.json?.rate_limit || r.json) : null;
        if (j && j.daily_remaining_usd != null) u.openalex = { ...(u.openalex || {}), usd: true, left: +j.daily_remaining_usd, limit: +j.daily_budget_usd || null, at: now, resetAt: j.resets_in_seconds != null ? now + j.resets_in_seconds * 1000 : nextUtcMidnight() };
      }
    } catch (e) { console.warn("Texere Sources: limitele", e); }
    for (const f of [...(this._usageHooks || [])]) { try { f(); } catch (e) {} }
  }
  // OpenAlex: bugetul zilei, în căutări (o căutare costă cât a costat ultima, altfel 1/1000 din bugetul cu cheie)
  oaSearches(o) {
    if (!o || o.left == null) return null;
    if (o.usd || (o.limit != null && o.limit <= 10)) return Math.floor(o.left / 0.001);
    return Math.floor(o.left / (o.cost || 10));
  }
  limited(id) {
    const u = this.conf().usage?.[id], now = Date.now(); if (!u) return null;
    if (id === "semanticscholar") return u.busyUntil > now ? u : null;
    if (id === "openalex") return u.resetAt > now && this.oaSearches(u) <= 0 ? u : null;
    if (u.left === 0) { if (u.resetAt && u.resetAt <= now) return null; if (u.renew && Date.parse(u.renew) <= now) return null; return u; }
    return null;
  }
  // eticheta din Setări și motivul din căutare: { text, cls, title } sau null (cataloagele fără limite)
  usageInfo(id) {
    const T = (a, b) => this.T(a, b), c = this.conf(), u = c.usage?.[id], now = Date.now(), loc = this.en ? "en-GB" : "ro-RO";
    const at = t => new Date(t).toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" }), day = t => new Date(t).toLocaleDateString(loc, { day: "numeric", month: "short" });
    // cât mai e până se reface: „3 h 20 min”, „45 min”
    const left = t => { const m = Math.max(1, Math.ceil((t - Date.now()) / 60000)), h = Math.floor(m / 60), r = m % 60; return h ? (r ? `${h} h ${r} min` : `${h} h`) : `${r} min`; };
    if (id === "openalex") {
      const per = c.openalexKey ? 1000 : 100;
      if (!u || u.left == null || !(u.resetAt > now)) return { cls: "", text: T(`≈ ${per} căutări pe zi`, `≈ ${per} searches a day`), title: c.openalexKey ? T("Cu cheia ta: un buget de 1 $ pe zi (≈ 1.000 de căutări). Se reface la miezul nopții UTC.", "With your key: a $1 daily budget (≈ 1,000 searches). Resets at midnight UTC.") : T("Fără cheie: ≈ 100 de căutări pe zi. Cu o cheie gratuită: ≈ 1.000.", "Without a key: ≈ 100 searches a day. With a free key: ≈ 1,000.") };
      const n = this.oaSearches(u);
      if (n <= 0) return { cls: "bad", text: T(`limită atinsă · se reface în ${left(u.resetAt)}`, `limit reached · resets in ${left(u.resetAt)}`), title: T(`Se reface la ${at(u.resetAt)}.`, `Resets at ${at(u.resetAt)}.`) + (c.openalexKey ? "" : " " + T("Cu o cheie gratuită ai de 10 ori mai multe.", "A free key gives you 10 times more.")) };
      return { cls: n < per * 0.1 ? "warn" : "ok", text: T(`≈ ${n.toLocaleString(loc)} căutări rămase azi`, `≈ ${n.toLocaleString(loc)} searches left today`), title: T(`Se reface la ${at(u.resetAt)}.`, `Resets at ${at(u.resetAt)}.`) };
    }
    if (id === "googlescholar") {
      if (!c.serpapiKey) return null;
      if (!u || u.left == null) return { cls: "", text: T("250 de căutări pe lună (plan gratuit)", "250 searches a month (free plan)") };
      const renew = u.renew ? T(` · se reînnoiește pe ${day(u.renew)}`, ` · renews ${day(u.renew)}`) : "";
      if (u.left <= 0) return { cls: "bad", text: T("limită atinsă", "limit reached") + renew };
      return { cls: u.limit && u.left < u.limit * 0.1 ? "warn" : "ok", text: u.limit ? T(`${u.left} din ${u.limit} rămase luna asta`, `${u.left} of ${u.limit} left this month`) : T(`${u.left} căutări rămase`, `${u.left} searches left`), title: renew.replace(/^ · /, "") };
    }
    if (id === "semanticscholar" && u?.busyUntil > now) return { cls: "warn", text: T("prea multe cereri · încearcă peste un minut", "too many requests · try again in a minute"), title: c.s2Key ? "" : T("Fără cheie, toți utilizatorii împart aceeași limită.", "Without a key, everyone shares the same limit.") };
    if (id === "googlebooks" && u?.left === 0 && u.resetAt > now) return { cls: "bad", text: T(`limită atinsă azi · se reface în ${left(u.resetAt)}`, `daily limit reached · resets in ${left(u.resetAt)}`), title: T(`Se reface la ${at(u.resetAt)}.`, `Resets at ${at(u.resetAt)}.`) };
    return null;
  }
  // un PDF gratuit pentru o notă tocmai creată (fără mesaje): numele lui sau null
  async freePdfFor(file, x) {
    const e = this.lib.all().find(v => v.obsidianPath === file.path), key = e?.id || file.basename.replace(/^@/, "");
    const csl = x.zotero?.csl || this.cslOfFm(this.app.metadataCache.getFileCache(file)?.frontmatter || {});
    const y = { ...x, pdf: x.pdf || [] }; if (!y.doi) { try { y.doi = await this.findDoi(y); } catch (err) {} }
    if (!y.doi && !y.pdf.length) return null;
    const name = await this.onePdf(file, () => this.fetchPdf(y, this.pdfBase(csl, key, file.basename.replace(/^@/, "")), key, this.pdfDir(csl, key)));
    if (y._pdfUrl) x._pdfUrl = y._pdfUrl;
    if (!name) return null;
    await this.attachPdf(this.app.vault.getAbstractFileByPath(file.path) || file, key, name);
    return name;
  }
  ctx() {
    const self = this;
    return {
      conf: this.conf(), fold, stripTags, normTitle, cleanDoi, isbn13, splitName, zotero: this.zotero,
      // „constantin vică” arată ca un nume (2–4 cuvinte, fără cifre și fără „of”, „and”…); atunci cataloagele caută și după autor
      looksLikeName: q => { const w = normTitle(q).split(" ").filter(Boolean); return w.length >= 2 && w.length <= 4 && !/\d/.test(q) && !w.some(x => STOP.has(x) || /^(si|de|la|in|cu|pe|din|al|ale)$/.test(x)); },
      sameName: (name, q) => { const n = normTitle(name).split(" "), t = normTitle(q).split(" ").filter(Boolean); return t.every(x => n.includes(x) || (x.length === 1 && n.some(y => y.startsWith(x)))); },
      async json(url, headers) {
        const r = await self.http(url, { headers: Object.assign({ Accept: "application/json" }, headers || {}) });
        if (r.status === 200) return r.json;
        if (r.status === 404) return null;   // nu există (ex. un DOI necunoscut acestui catalog)
        const e = new Error("HTTP " + r.status); e.status = r.status; e.limit = r.status === 429 || r.status === 409 || r.status === 403; throw e;
      },
    };
  }

  // caută în toate cataloagele deodată; onUpdate primește rezultatele pe măsură ce sosesc
  search(q, filters, onUpdate) {
    let ps = this.enabled().filter(p => !filters.providers || filters.providers.has(p.id)).filter(p => filters.type === "all" || !p.types || p.types.includes(filters.type));
    // un link de profil (Google Scholar) sau un ORCID iD se caută doar în catalogul lui
    if (/scholar\.google\.[a-z.]+\/citations/i.test(q)) ps = ps.filter(p => p.id === "googlescholar");
    else if (/^\s*(https?:\/\/|pmc\d+\s*$|pmid:?\s*\d+\s*$|q\d+\s*$|arxiv:)/i.test(q) && !this.ctx().cleanDoi(q)) ps = ps.filter(p => p.id === "citoid");
    else if (/\d{4}-\d{4}-\d{4}-\d{3}[\dX]/i.test(q)) ps = ps.filter(p => p.id === "orcid");
    const lists = {}, status = {}, cards = {}; const ctx = this.ctx();
    for (const p of ps) status[p.id] = "busy";
    const done = () => { const m = this.merge(lists); onUpdate(this.rank(m, q, filters), { ...status }, Object.values(cards), m); };
    onUpdate([], { ...status }, []);
    return Promise.all(ps.map(async p => {
      if (this.limited(p.id)) { status[p.id] = "limit"; (this.errors = this.errors || {})[p.id] = this.usageInfo(p.id)?.text || "limit"; done(); return; }   // limita atinsă: nu-l mai întreb până se reface
      try {
        const t = new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error("timeout"), { timeout: true })), 30000));
        const items = await Promise.race([p.search(q, filters, ctx), t]);
        if (items?.card) cards[p.id] = { ...items.card, source: p.id };
        lists[p.id] = (items || []).filter(x => x && x.title).map((x, i) => ({ ...x, source: p.id, rank: i }));
        status[p.id] = "ok";
      } catch (e) { status[p.id] = e.limit ? "limit" : "err"; (this.errors = this.errors || {})[p.id] = e.timeout ? "timeout" : e.status ? "HTTP " + e.status : String(e.message || e).slice(0, 60); console.warn("Texere Sources:", p.id, e); }
      done();
    }));
  }
  // scite pentru un DOI: { s, c, m } sau null; păstrat cât e deschis Obsidian
  async scite(doi) {
    this.sciteCache = this.sciteCache || new Map();
    const k = doi.toLowerCase(); if (this.sciteCache.has(k)) return this.sciteCache.get(k);
    const p = this.http(`https://api.scite.ai/tallies/${doi}`, { headers: { Accept: "application/json" } }).then(r => {
      const j = r.status === 200 ? r.json : null;
      return j ? { s: j.supporting || 0, c: j.contradicting || 0, m: j.mentioning || 0 } : null;
    });
    this.sciteCache.set(k, p); const v = await p; this.sciteCache.set(k, v); return v;
  }
  key(x) {
    const d = cleanDoi(x.doi); if (d) return "doi:" + d.toLowerCase();
    const i = isbn13(x.isbn); if (i) return "isbn:" + i;
    return "t:" + normTitle(x.title).slice(0, 90) + "|" + (x.year || "");
  }
  merge(lists) {
    const map = new Map();
    for (const [pid, items] of Object.entries(lists)) for (const x of items) {
      const k = this.key(x), cur = map.get(k);
      const score = 1 / (x.rank + 3);
      if (!cur) { map.set(k, { ...x, doi: cleanDoi(x.doi), isbn: isbn13(x.isbn) || null, pdf: [...(x.pdf || [])], sources: [pid], score }); continue; }
      for (const f of ["title", "year", "type", "venue", "publisher", "volume", "issue", "page", "url", "isbn", "abstract", "lang"]) if (!cur[f] && x[f]) cur[f] = f === "isbn" ? isbn13(x[f]) : x[f];
      if ((!cur.authors || !cur.authors.length) && x.authors?.length) cur.authors = x.authors;
      if (x.cited != null) cur.cited = Math.max(cur.cited || 0, x.cited);
      cur.oa = cur.oa || x.oa; for (const u of x.pdf || []) if (!cur.pdf.includes(u)) cur.pdf.push(u);
      if (cur.fwci == null && x.fwci != null) cur.fwci = x.fwci;
      if (!cur.csl && x.csl) cur.csl = x.csl;
      if (!cur.zotero && x.zotero) cur.zotero = x.zotero;
      cur.top1 = cur.top1 || x.top1; cur.top10 = cur.top10 || x.top10; cur.retracted = cur.retracted || x.retracted;
      if (!cur.sources.includes(pid)) cur.sources.push(pid); cur.score += score;
    }
    // o carte fără DOI dintr-un catalog și aceeași carte cu DOI din altul: le unim după titlu + an
    const byT = new Map();
    for (const [k, v] of map) if (!k.startsWith("t:")) byT.set(normTitle(v.title).slice(0, 90) + "|" + (v.year || ""), k);
    for (const [k, v] of [...map]) if (k.startsWith("t:")) {
      const tk = byT.get(k.slice(2)); if (!tk) continue;
      const cur = map.get(tk); for (const s of v.sources) if (!cur.sources.includes(s)) cur.sources.push(s); if (!cur.zotero && v.zotero) cur.zotero = v.zotero;
      cur.score += v.score; for (const u of v.pdf || []) if (!cur.pdf.includes(u)) cur.pdf.push(u); map.delete(k);
    }
    return [...map.values()];
  }
  // relevanță: câte dintre cuvintele căutate apar în titlu sau la autori (ex. „constantin vică” = un autor),
  // apoi titlul/numele întreg, acordul mai multor cataloage, locul în fiecare catalog și citările
  rank(items, q, f) {
    const STOPQ = new Set(["the", "and", "of", "in", "on", "a", "an", "to", "for", "de", "si", "la", "in", "cu", "pe", "din", "al", "ale", "lui"]);
    const toks = [...new Set(normTitle(q).split(" ").filter(w => w.length > 1 && !STOPQ.has(w)))];
    const ok = x => (f.type === "all" || this.kind(x.type) === f.type) && (!f.from || !x.year || x.year >= +f.from) && (!f.to || !x.year || x.year <= +f.to);
    const phrase = toks.join(" ");
    for (const x of items) {
      const t = " " + normTitle(x.title) + " ", tw = new Set(t.trim().split(" "));
      const people = (x.authors || []).map(a => normTitle([a.given, a.family, a.literal].filter(Boolean).join(" ")));
      const aw = new Set(people.join(" ").split(" ").filter(Boolean)), vw = new Set(normTitle(x.venue || "").split(" "));
      let hit = 0;
      for (const w of toks) { if (aw.has(w)) hit += 1; else if (tw.has(w) || (w.length > 4 && t.includes(" " + w))) hit += 1; else if (vw.has(w)) hit += 0.3; }
      const cover = toks.length ? hit / toks.length : 0;
      let s = cover * cover * 4;                                                        // toate cuvintele găsite contează cel mai mult
      if (toks.length > 1 && t.includes(" " + phrase + " ")) s += 1.2;                   // titlul conține exact ce ai scris
      if (toks.length > 1 && people.some(p => toks.every(w => p.split(" ").includes(w)))) s += 1.5;   // un singur autor are tot numele căutat
      // impactul, corectat cu vechimea (citări pe an) și cu domeniul (FWCI), ca o lucrare nouă să nu piardă în fața uneia vechi
      const age = Math.max(1, new Date().getFullYear() - (x.year || new Date().getFullYear()) + 1), perYear = (x.cited || 0) / age;
      s += Math.min(x.sources.length - 1, 2) * 0.3 + x.score * 0.5 + Math.log10(1 + perYear) * 0.7 + Math.min(x.fwci || 0, 10) * 0.04;
      if (!x.authors?.length) s -= 0.4;                                                  // fără autori: de obicei intrări de dicționar, recenzii
      if (/^(entry|entry-encyclopedia|entry-dictionary|document)$/.test(x.type) || /dictionary|encyclopedia|lexikon/i.test(x.venue || "")) s -= 0.6;
      x._s = s; x._cover = cover;
      // influența: FWCI (citări față de media domeniului și a anului), locul între cele mai citate (top 1% / 10%),
      // citările pe an și, dacă există, ce spun citările (susțin / contrazic); pentru cărți fără FWCI contează citările pe an
      const sc = x.scite && (x.scite.s + x.scite.c) ? (x.scite.s - x.scite.c) / (x.scite.s + x.scite.c) : 0;
      // fără FWCI (des la cărți) îl estimăm din citările pe an, ca o carte citată să nu ajungă la coadă
      x._impact = Math.log2(1 + Math.min(x.fwci != null ? x.fwci : perYear / 2, 50)) * 2 + (x.top1 ? 1.5 : x.top10 ? 0.8 : 0) + Math.log10(1 + perYear) * 1.5 + sc * 0.3;
    }
    // dacă sunt destule rezultate cu toate cuvintele căutate, celelalte dispar din listă
    const full = items.filter(x => ok(x) && x._cover >= 1).length, min = full >= 5 ? 1 : full ? 0.5 : 0;
    const by = f.sort === "impact" ? (a, b) => b._impact - a._impact || b._s - a._s : f.sort === "cited" ? (a, b) => (b.cited || 0) - (a.cited || 0) || b._s - a._s : f.sort === "newest" ? (a, b) => (b.year || 0) - (a.year || 0) || b._s - a._s : (a, b) => b._s - a._s;
    return items.filter(ok).filter(x => x._cover >= min).sort(by).slice(0, 100);
  }
  kind(t) { return /^(book)$/.test(t) ? "book" : /^(chapter|entry|entry-encyclopedia|entry-dictionary)$/.test(t) ? "chapter" : "article"; }

  // sursele deja în vault (după DOI, ISBN sau titlu)
  library() {
    const dois = new Map(), isbns = new Map(), titles = new Map(), keys = new Set();
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!f.path.startsWith(this.litDir())) continue;
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter; if (!fm) continue;
      if (fm.id) keys.add(String(fm.id));
      const d = cleanDoi(fm.DOI); if (d) dois.set(d.toLowerCase(), f);
      for (const i of String(fm.ISBN || "").split(/[\s,;]+/)) { const n = isbn13(i); if (n) isbns.set(n, f); }
      if (fm.title) titles.set(normTitle(fm.title), f);
    }
    return { keys, find: x => (x.doi && dois.get(x.doi.toLowerCase())) || (x.isbn && isbns.get(x.isbn)) || titles.get(normTitle(x.title)) || null };
  }

  // datele complete: după DOI din registrul DOI (Crossref, DataCite…), altfel din ce a dat catalogul
  async findDoi(x) {
    if (!x.title || x.type === "book") return null;
    const fam = x.authors?.[0]?.family || "";
    const r = await this.http(`https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(x.title + " " + fam)}&rows=5&select=DOI,title,author,issued`);
    const it = (r.status === 200 ? r.json?.message?.items : []) || [];
    const hit = it.find(i => normTitle(i.title?.[0]) === normTitle(x.title) && (!fam || (i.author || []).some(a => fold(a.family) === fold(fam))));
    return hit ? cleanDoi(hit.DOI) : null;
  }
  async fullCsl(x) {
    if (x.zotero?.csl?.title) return cleanCsl({ ...x.zotero.csl });   // din biblioteca ta Zotero: datele tale, așa cum le-ai pus acolo
    if (!x.doi) { try { x.doi = await this.findDoi(x); } catch (e) {} }
    if (x.doi) {
      const r = await this.http(`https://doi.org/${x.doi}`, { headers: { Accept: "application/vnd.citationstyles.csl+json" } });
      let c = r.status === 200 ? r.json : null;
      if (!c) { const r2 = await this.http(`https://api.crossref.org/works/${x.doi}/transform/application/vnd.citationstyles.csl+json`); c = r2.status === 200 ? r2.json : null; }
      if (c && c.title) { const o = cleanCsl(c); if (!o.abstract && x.abstract) o.abstract = x.abstract; return o; }
    }
    const p = this.providers.filter(p => x.sources?.includes(p.id) && typeof p.full === "function").sort((a, b) => (a.id === "citoid" ? -1 : 0) - (b.id === "citoid" ? -1 : 0))[0];
    if (p) { try { const c = await p.full(x, this.ctx()); if (c?.title) return cleanCsl(c); } catch (e) {} }
    return cleanCsl({ type: x.type || "document", title: x.title, author: x.authors, "container-title": x.venue, publisher: x.publisher,
      issued: x.year ? { "date-parts": [[x.year]] } : undefined, DOI: x.doi, ISBN: x.isbn, URL: x.url, volume: x.volume, issue: x.issue, page: x.page, abstract: x.abstract });
  }

  // cheia de citare după regula din Setări → Nume și foldere (implicit: {{author|lowercase}}_{{title|titleword}}_{{year}})
  citekey(csl, taken) {
    const base = this.citekeyBase(csl);
    let k = base, n = 1;
    const exists = k => taken.has(k) || this.app.vault.getAbstractFileByPath(normalizePath(this.litDir() + "@" + k + ".md"));
    while (exists(k)) k = base + String.fromCharCode(97 + n++);   // ex. smith_mind_2001b
    return k;
  }
  citekeyBase(csl, tpl) {
    const a = csl.author?.[0] || csl.editor?.[0] || {};
    const fam = String(a.family || a.literal || "anon").trim() || "anon", y = csl.issued?.["date-parts"]?.[0]?.[0] || "nd";
    const plain = v => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");   // fără diacritice (Gândește → Gandeste), cu literele mari păstrate
    const vars = { ...this.tplVars(csl, ""), author: plain(fam), authors: (csl.author || []).map(p => plain(p.family || p.literal)).filter(Boolean).join(" "), year: String(y), title: plain(csl.title) };
    let out = ""; try { out = this.T_.render(tpl || this.conf().citekey || CITEKEY_DEFAULT, vars); } catch (e) {}
    // doar litere fără diacritice, cifre și _ - : (cheile merg în [@cheie] și în nume de fișiere)
    out = plain(out).replace(/\s+/g, "_").replace(/[^A-Za-z0-9_:\-]+/g, "").replace(/_+/g, "_").replace(/^[_\-:]+|[_\-:]+$/g, "");
    if (!out) out = [fold(fam).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "anon", titleWord(csl.title), y].filter(Boolean).join("_");
    return out;
  }

  // PDF gratuit: adună toate adresele cunoscute, din toate sursele, și le încearcă pe rând
  async pdfCandidates(x) {
    const urls = [], landing = [], add = (u, l) => { if (u && !urls.includes(u) && !landing.includes(u)) (l ? landing : urls).push(u); };
    for (const u of x.pdf || []) add(u);
    const doi = x.doi, c = this.conf(), tasks = [];
    if (doi) {
      // OpenAlex: toate copiile cu acces deschis (arhive instituționale, PubMed Central, preprinturi), nu doar cea a editurii
      const key = c.openalexKey ? `&api_key=${encodeURIComponent(c.openalexKey)}` : "";
      tasks.push(this.http(`https://api.openalex.org/works/doi:${doi}?select=best_oa_location,locations,open_access,ids${key}`).then(r => {
        const j = r.status === 200 ? r.json : null; if (!j) return;
        const locs = [j.best_oa_location, ...(j.locations || [])].filter(l => l && (l.is_oa || l.pdf_url));
        locs.sort((a, b) => (a.source?.type === "repository" ? 0 : 1) - (b.source?.type === "repository" ? 0 : 1));   // arhivele întâi: editurile blochează des descărcările automate
        for (const l of locs) { add(l.pdf_url); add(l.landing_page_url, true); }
        add(j.open_access?.oa_url, true);
        if (j.ids?.pmcid) x.pmcid = String(j.ids.pmcid).split("/").pop();
      }));
      // Europe PMC: articolele din PubMed Central (multe articole de bioetică, medicină, psihologie)
      tasks.push(this.http(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=DOI:%22${encodeURIComponent(doi)}%22&format=json&resultType=core`).then(r => {
        const it = r.status === 200 ? r.json?.resultList?.result?.[0] : null; if (!it) return;
        if (it.pmcid) x.pmcid = it.pmcid;
        for (const f of it.fullTextUrlList?.fullTextUrl || []) if (f.availabilityCode === "OA" || f.availabilityCode === "F") add(f.url, f.documentStyle !== "pdf");
      }));
      if (c.email) tasks.push(this.http(`https://api.unpaywall.org/v2/${doi}?email=${encodeURIComponent(c.email)}`).then(r => {
        const j = r.status === 200 ? r.json : null;
        for (const l of [j?.best_oa_location, ...(j?.oa_locations || [])]) { add(l?.url_for_pdf); add(l?.url_for_landing_page, true); }
      }));
      if (c.s2Key) tasks.push(this.http(`https://api.semanticscholar.org/graph/v1/paper/DOI:${doi}?fields=openAccessPdf`, { headers: { "x-api-key": c.s2Key } }).then(r => add(r.status === 200 ? r.json?.openAccessPdf?.url : null)));
      tasks.push(this.http(`https://api.crossref.org/works/${doi}`).then(r => {
        const m = r.status === 200 ? r.json?.message : null;
        if (m && (m.license || []).some(l => /creativecommons\.org/.test(l.URL || ""))) for (const l of m.link || []) if (/pdf/i.test(l["content-type"] || "")) add(l.URL);
      }));
      const ax = /^10\.48550\/arxiv\.(.+)$/i.exec(doi); if (ax) add(`https://arxiv.org/pdf/${ax[1]}`);
      // adresa PDF-ului la editurile mari (merge pentru articolele lor cu acces deschis; la celelalte primim o pagină web, care se ignoră)
      const PUB = [[/^10\.3389\//, d => `https://www.frontiersin.org/articles/${d}/pdf`], [/^10\.1371\//, d => `https://journals.plos.org/plosone/article/file?id=${d}&type=printable`],
        [/^10\.(1007|1186)\//, d => `https://link.springer.com/content/pdf/${d}.pdf`], [/^10\.1177\//, d => `https://journals.sagepub.com/doi/pdf/${d}?download=true`],
        [/^10\.1080\//, d => `https://www.tandfonline.com/doi/pdf/${d}?download=true`], [/^10\.(1111|1002)\//, d => `https://onlinelibrary.wiley.com/doi/pdfdirect/${d}?download=true`],
        [/^10\.7554\//, d => `https://elifesciences.org/articles/${d.split(".").pop()}.pdf`], [/^10\.1098\//, d => `https://royalsocietypublishing.org/doi/pdf/${d}`]];
      for (const [re, f] of PUB) if (re.test(doi)) add(f(doi));
    }
    await Promise.all(tasks.map(t => t.catch(() => {})));
    if (x.pmcid) { const id = String(x.pmcid).replace(/^PMC/i, ""); add(`https://europepmc.org/articles/PMC${id}?pdf=render`); add(`https://pmc.ncbi.nlm.nih.gov/articles/PMC${id}/pdf/`); }
    if (doi) add(`https://doi.org/${doi}`, true);
    return { urls, landing };
  }
  async fetchPdf(x, key, fallback, dirArg) {
    const { urls, landing } = await this.pdfCandidates(x);
    const isPdf = buf => { try { return String.fromCharCode(...new Uint8Array(buf.slice(0, 5))) === "%PDF-"; } catch (e) { return false; } };
    const log = [];
    const t0 = Date.now(), late = () => Date.now() - t0 > 40000;
    const get = async (u, page) => {
      if (late()) return null;
      const r = await this.http(u, { headers: { Accept: "application/pdf,text/html;q=0.9,*/*;q=0.8" }, timeout: page ? 12000 : 30000 });
      let buf = null; try { buf = r.status === 200 ? r.bytes() : null; } catch (e) {}
      let head = ""; try { head = buf ? String.fromCharCode(...new Uint8Array(buf.slice(0, 12))).replace(/[^\x20-\x7e]/g, ".") : ""; } catch (e) {}
      log.push(`${r.status} ${(r.headers?.["content-type"] || r.headers?.["Content-Type"] || "").split(";")[0]} ${head} ${u}`);
      return buf ? { buf, r } : null;
    };
    const tried = new Set();
    let found = null;
    let foundUrl = null;
    for (const u of urls) { if (late()) break; if (tried.has(u)) continue; tried.add(u); const g = await get(u); if (g && isPdf(g.buf)) { found = g.buf; foundUrl = u; break; } }
    // pagini de prezentare (arhive, edituri): multe își anunță PDF-ul în <meta name="citation_pdf_url">, pentru motoarele de căutare academice
    if (!found) for (const u of landing) {
      if (late()) break; if (tried.has(u)) continue; tried.add(u);
      const g = await get(u, true); if (!g) continue;
      if (isPdf(g.buf)) { found = g.buf; foundUrl = u; break; }
      let html = ""; try { html = g.r.text || ""; } catch (e) {}
      const m = /<meta[^>]+name=["']?citation_pdf_url["']?[^>]*?content=(?:"([^"]+)"|'([^']+)'|([^\s"'>]+))/i.exec(html) || /<meta[^>]+content=(?:"([^"]+)"|'([^']+)'|([^\s"'>]+))[^>]*?name=["']?citation_pdf_url\b/i.exec(html);   // cu sau fără ghilimele (PhilPapers: fără)
      if (!m) continue;
      const pu = new URL((m[1] || m[2] || m[3]).replace(/&amp;/g, "&"), u).href; if (!x._pdfUrl) x._pdfUrl = pu; if (tried.has(pu)) continue; tried.add(pu);
      const p = await get(pu); if (p && isPdf(p.buf)) { found = p.buf; foundUrl = pu; break; }
    }
    this.lastPdfPage = landing.find(u => !/doi\.org/.test(u)) || urls[0] || (x.doi ? `https://doi.org/${x.doi}` : null);
    if (!found && x.pdf?.length) x._pdfUrl = x.pdf[0];   // adresa PDF-ului anunțată de pagina sursei: situl n-a lăsat descărcarea automată
    try {
      const p = this.dir + "/pdf-log.txt", ad = this.app.vault.adapter;
      const old = (await ad.exists(p)) ? (await ad.read(p)).split("\n") : [];
      const add = [`--- ${new Date().toISOString()} ${x.doi || x.title} → ${found ? "OK" : "no PDF"}`, ...log];
      await ad.write(p, [...old, ...add].slice(-400).join("\n"));
    } catch (e) {}
    if (!found) return null;
    const dir = dirArg || this.docDir(); await this.ensureFolder(dir);
    // „păstrează numele”: numele fișierului de pe site (dacă e unul adevărat, nu „pdf” sau „download”)
    if (!key) { let n = ""; try { n = decodeURIComponent(new URL(foundUrl).pathname.split("/").filter(Boolean).pop() || ""); } catch (e) {}
      n = n.replace(/\.pdf$/i, "").replace(/[\\/:*?"<>|#^[\]]+/g, " ").trim();
      key = n && !/^(pdf|download|content|fulltext|view|file|article|epdf|\d{1,6})$/i.test(n) ? n.slice(0, 120) : (fallback || "document"); }
    let path = this.freePath(dir, key, "pdf");
    await this.app.vault.createBinary(path, found);
    return path.split("/").pop();
  }

  // „Caută PDF-ul gratuit” pentru o notă existentă (ex. una adăugată înainte sau când editura n-a permis descărcarea)
  async findPdfForNote(file) {
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter || {}, T = (a, b) => this.T(a, b);
    const key = fm.id || file.basename.replace(/^@/, "");
    const base = this.pdfBase(this.cslOfFm(fm), key, file.basename.replace(/^@/, ""));
    const x = { doi: cleanDoi(fm.DOI), title: fm.title, authors: fm.author, type: fm.type, pdf: [] };
    if (/philpapers\.org\/rec\/|philarchive\.org\/rec\//.test(String(fm.URL || ""))) x.pdf.push(String(fm.URL).replace(/\/rec\//, "/archive/").replace(/[#?].*$/, ""));   // arhiva PhilPapers / PhilArchive
    if (!x.doi) { try { x.doi = await this.findDoi(x); } catch (e) {} }
    if (!x.doi) { new Notice(T("Nota nu are DOI, iar fără DOI nu pot căuta un PDF gratuit.", "The note has no DOI, and without one I can't look for a free PDF.")); return; }
    const wait = new Notice(T("Caut PDF-ul gratuit în toate sursele…", "Looking for the free PDF in all sources…"), 0);
    let name = null; try { name = await this.fetchPdf(x, base, key, this.pdfDir(this.cslOfFm(fm), key)); } catch (e) {}
    wait.hide();
    if (!name) { this.noPdfNotice({ note: file, x }); return; }
    await this.attachPdf(file, key, name);
    new Notice(T(`PDF găsit și atașat: ${name}`, `PDF found and attached: ${name}`), 6000);
  }
  // formatul de evidențiere din PDF++ scria „p. {{pageLabel}}”: numărul din bara PDF-ului. Îl înlocuim cu o expresie care dă pagina tipărită:
  // 1) dacă PDF-ul are deja numerotarea tipărită (eticheta diferă de pagina din fișier) → eticheta;
  // 2) altfel, dacă nota are intervalul de pagini (ex. page: 503-519) și PDF-ul are exact atâtea pagini → 503 + pagina − 1
  //    (sau o pagină în plus = copertă adăugată de editură/JSTOR → pagina 2 din PDF e 503);
  // 3) altfel → eticheta, ca până acum (cărți, scanuri: se corectează cu „Edit page labels” din PDF++).
  pdfPageExpr() {
    return `((p, lab, n, rng) => { lab = String(lab ?? p); if (/^\\d+$/.test(lab) && +lab !== p) return lab; const m = /^\\s*(\\d+)\\s*[-–—]\\s*(\\d+)/.exec(String(rng ?? "")); if (m) { const a = +m[1], len = +m[2] - a + 1; if (len > 0 && n === len) return String(a + p - 1); if (len > 0 && n === len + 1 && p > 1) return String(a + p - 2); } return lab; })(page, pageLabel, pageCount, properties.page)`;
  }
  patchPdfPage() {
    const pp = this.app.plugins.plugins["pdf-plus"], cmds = pp?.settings?.copyCommands; if (!Array.isArray(cmds)) return;
    const OLD = "p. {{pageLabel}}]", NEW = "p. {{" + this.pdfPageExpr() + "}}]"; let n = 0;
    for (const c of cmds) if (typeof c.template === "string" && c.template.includes(OLD)) { c.template = c.template.split(OLD).join(NEW); n++; }
    if (n) { pp.saveSettings?.(); console.log("Texere Sources: citările din evidențieri folosesc acum pagina tipărită"); }
  }
  // butonul din bara de jos, după fișierul deschis:
  // nota unei surse → „Vezi PDF-ul”; PDF-ul unei surse → „Vezi nota”; un PDF fără sursă → „Cataloghează acest PDF”
  catalogStatus(h) {
    const T = (a, b) => this.T(a, b), mc = this.app.metadataCache, arr = v => Array.isArray(v) ? v : v ? [v] : [];
    const sb = h.addStatusBarItem(); sb.addClass("mod-clickable"); sb.addClass("texere-catalog-status"); sb.style.display = "none";
    let act = null;   // ce face clicul
    const open = (f, e) => {
      const leaf = this.app.workspace.getLeavesOfType(f.extension === "md" ? "markdown" : f.extension).find(l => l.view?.file === f);
      if (leaf && !(e?.metaKey || e?.ctrlKey)) { this.app.workspace.setActiveLeaf(leaf, { focus: true }); return; }   // deja deschis: doar îl arătăm
      this.app.workspace.getLeaf(e?.metaKey || e?.ctrlKey ? "split" : "tab").openFile(f);   // Cmd/Ctrl+clic: alături
    };
    const show = (icon, text, tip, fn) => { sb.empty(); sb.style.display = ""; try { setIcon(sb.createSpan(), icon); } catch (x) {} sb.createSpan({ text: " " + text }); sb.title = tip; act = fn; };
    const upd = () => {
      act = null; sb.style.display = "none";
      const f = this.app.workspace.getActiveFile?.(); if (!(f instanceof TFile)) return;
      if (DOC_EXT.test(f.extension)) {
        const e = this.lib.all().find(x => arr(x.attachment).some(a => typeof a === "string" && a.includes(f.name)));
        const note = e?.obsidianPath ? this.app.vault.getAbstractFileByPath(e.obsidianPath) : null;
        if (note) show("file-text", T("Vezi nota", "View note"), `@${e.id} · ` + T("Cmd/Ctrl+clic: alături", "Cmd/Ctrl+click: side by side"), ev => open(note, ev));
        else show("library", f.extension === "pdf" ? T("Adaugă ca sursă", "Add as source") : T("Adaugă ca sursă", "Add as source"), T("Fișierul nu e încă o sursă: Texere îi găsește datele și creează nota", "This file isn't a source yet: Texere finds its details and creates the note"), () => this.catalog(f));
        return;
      }
      if (f.extension !== "md") return;
      const fm = mc.getFileCache(f)?.frontmatter; if (!fm?.id) return;
      const files = arr(fm.attachment).map(x => /\[\[([^\]|#]+)/.exec(String(x))?.[1]).filter(Boolean).map(l => mc.getFirstLinkpathDest(l, f.path)).filter(p => p && DOC_EXT.test(p.extension));
      if (!files.length) return;
      const kind = p => p.extension === "pdf" ? "PDF" : p.extension.toUpperCase();
      const label = files.length === 1 ? T(`Vezi ${kind(files[0])}-ul`, `View ${kind(files[0])}`) : T(`Vezi atașamentele (${files.length})`, `View attachments (${files.length})`);
      show("paperclip", label, (files.length === 1 ? files[0].name : files.map(p => p.name).join("\n")) + "\n" + T("Cmd/Ctrl+clic: alături", "Cmd/Ctrl+click: side by side"), ev => {
        if (files.length === 1) return open(files[0], ev);
        const { Menu } = require("obsidian"), m = new Menu();
        for (const p of files) m.addItem(i => i.setTitle(p.name).setIcon("file").onClick(() => open(p, ev)));
        m.showAtMouseEvent(ev);
      });
    };
    sb.addEventListener("click", ev => act?.(ev));
    for (const ev of ["file-open", "active-leaf-change"]) if (this.app.workspace.on) h.registerEvent(this.app.workspace.on(ev, upd));
    if (mc.on) h.registerEvent(mc.on("changed", f => { if (f === this.app.workspace.getActiveFile?.()) upd(); }));
    h.registerEvent(this.app.vault.on("rename", () => setTimeout(upd, 300)));
    this.lib.onChange(upd); upd();
  }
  // o referință lipită → sursa ei: { x, csl, how: "doi" | "id" | "matched" | "guess" }
  async resolveRef(text) {
    const t = String(text).replace(/\s+/g, " ").trim();
    const doi = cleanDoi(t), isbn = (() => { const m = /(?:ISBN[^0-9X]{0,8})?((?:97[89][\s-]?)?(?:\d[\s-]?){9}[\dX])/i.exec(t); return m && /ISBN|97[89]/i.test(m[0]) ? isbn13(m[1]) : null; })();
    const find = async q => { const f = { type: "all", from: "", to: "", sort: "relevance", providers: new Set(this.enabled().filter(p => !["semanticscholar", "googlescholar", "orcid"].includes(p.id)).map(p => p.id)) };
      let last = []; await Promise.race([this.search(q, f, items => { last = items || []; }), new Promise(r => setTimeout(r, 10000))]); return last; };
    if (doi) { try { const csl = await this.fullCsl({ doi }); if (csl?.title) return { x: { doi, title: csl.title, authors: csl.author, year: csl.issued?.["date-parts"]?.[0]?.[0], sources: ["crossref"] }, csl, how: "doi" }; } catch (e) {} }
    const url = /https?:\/\/\S+/.exec(t)?.[0], ax = /arXiv:\s?\d{4}\.\d{4,5}/i.exec(t)?.[0], pm = /\bPMID:?\s*\d+/i.exec(t)?.[0];
    for (const id of [isbn, ax, pm, t.length < 200 ? url : null].filter(Boolean)) {
      const hit = (await find(id))[0];
      if (hit) { try { const csl = await this.fullCsl({ ...hit }); if (csl?.title) return { x: hit, csl, how: "id" }; } catch (e) {} }
    }
    const g = guessRef(t), yr = g.issued?.["date-parts"]?.[0]?.[0];
    // Crossref recunoaște referințe scrise: o acceptăm doar dacă aproape toate cuvintele titlului găsit apar în ce ai lipit
    const covered = title => { const w = normTitle(title).split(" ").filter(x => x.length > 2), hay = " " + normTitle(t) + " "; return w.length && w.filter(x => hay.includes(" " + x + " ")).length / w.length >= 0.85; };
    try {
      const r = await this.http(`https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(t.slice(0, 600))}&rows=3&select=DOI,title,issued`);
      const it = ((r.status === 200 ? r.json?.message?.items : []) || []).find(i => i.title?.[0] && covered(i.title[0]) && (!yr || !i.issued?.["date-parts"]?.[0]?.[0] || Math.abs(i.issued["date-parts"][0][0] - yr) <= 1));
      if (it) { const d = cleanDoi(it.DOI), csl = await this.fullCsl({ doi: d }); if (csl?.title) return { x: { doi: d, title: csl.title, authors: csl.author, year: csl.issued?.["date-parts"]?.[0]?.[0], sources: ["crossref"] }, csl, how: "matched" }; }
    } catch (e) {}
    // cărți (nu sunt în Crossref): cataloagele, după titlu și primul autor
    if (g.title) {
      const hit = (await find(`${g.title} ${g.author?.[0]?.family || ""}`)).find(x => x.title && normTitle(x.title) === normTitle(g.title) && (!yr || !x.year || Math.abs(+x.year - yr) <= 1));
      if (hit) { try { const csl = await this.fullCsl({ ...hit }); if (csl?.title) return { x: hit, csl: { ...g, ...csl }, how: "matched" }; } catch (e) {} }
    }
    return { x: { title: g.title, authors: g.author || [], year: yr, type: g.type, sources: [] }, csl: g, how: "guess" };
  }
  // aceeași sursă în cataloage (titlu fără diacritice identic, anul ±1): pentru textele cu litere refăcute
  async verifyCsl(csl) {
    if (!csl?.title) return null;
    const fam = csl.author?.[0]?.family || csl.editor?.[0]?.family || "", q = `${csl.title} ${fam}`.trim();
    const f = { type: "all", from: "", to: "", sort: "relevance", providers: new Set(this.enabled().filter(p => !["semanticscholar", "googlescholar", "orcid"].includes(p.id)).map(p => p.id)) };
    let last = [];
    await Promise.race([this.search(q, f, items => { last = items || []; }), new Promise(r => setTimeout(r, 9000))]);
    const want = normTitle(csl.title), yr = csl.issued?.["date-parts"]?.[0]?.[0];
    const hit = last.find(x => x.title && !/\?/.test(x.title) && normTitle(x.title) === want && (!yr || !x.year || Math.abs(+x.year - yr) <= 1));
    if (!hit) return null;
    const names = Object.fromEntries(this.providers.map(p => [p.id, p.name]));
    return { ...hit, sourceName: (hit.sources || []).map(s => names[s] || s)[0] };
  }
  // ——— catalogare: un PDF fără sursă → nota lui ———
  inboxNotice(f) {
    if (this.zotero?.quietInbox?.has(f.path)) { this.zotero.quietInbox.delete(f.path); return; }
    if (this._dlWatch && Date.now() < this._dlWatch.until) return;   // Texere așteaptă PDF-ul unei surse: îl atașează singur
  
    const T = (a, b) => this.T(a, b), frag = document.createDocumentFragment();
    frag.append(T("PDF nou în Inbox: ", "New PDF in Inbox: ") + f.basename + " · ");
    const a = document.createElement("a"); a.textContent = T("Adaugă ca sursă", "Add as source"); a.href = "#"; frag.append(a);
    const n = new Notice(frag, 15000);
    a.addEventListener("click", e => { e.preventDefault(); n.hide(); this.catalog(f); });
  }
  // textul primelor pagini (și al ultimei), plus metadatele PDF-ului
  async readPdf(file) {
    const { loadPdfJs } = require("obsidian"), pdfjs = await loadPdfJs();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await this.app.vault.readBinary(file)) }).promise;
    let meta = {}; try { meta = await doc.getMetadata(); } catch (e) {}
    let xmp = ""; try { xmp = meta.metadata?.getRaw?.() || ""; } catch (e) {}
    let text = "";
    for (const n of [...new Set([1, 2, 3, 4, 5, 6, doc.numPages])].filter(n => n >= 1 && n <= doc.numPages)) {
      try { const tc = await (await doc.getPage(n)).getTextContent(); text += "\n" + tc.items.map(i => (i.str || "") + (i.hasEOL ? "\n" : " ")).join(""); } catch (e) {}
    }
    try { doc.destroy(); } catch (e) {}
    return { title: String(meta.info?.Title || ""), author: String(meta.info?.Author || ""), xmp: String(xmp), text };
  }
  // EPUB = arhivă zip: citim META-INF/container.xml → fișierul .opf → titlu, autori, identificatori (ISBN, DOI)
  async readEpub(file) {
    const buf = new Uint8Array(await this.app.vault.readBinary(file)), dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    let eocd = -1; for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error("not a zip");
    const entries = new Map(); let p = dv.getUint32(eocd + 16, true); const n = dv.getUint16(eocd + 10, true), dec = new TextDecoder();
    for (let k = 0; k < n && dv.getUint32(p, true) === 0x02014b50; k++) {
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      entries.set(dec.decode(buf.subarray(p + 46, p + 46 + nl)), { method, csize, off }); p += 46 + nl + xl + cl;
    }
    const read = async name => {
      const e = entries.get(name); if (!e) return null;
      const start = e.off + 30 + dv.getUint16(e.off + 26, true) + dv.getUint16(e.off + 28, true), data = buf.subarray(start, start + e.csize);
      if (e.method === 0) return dec.decode(data);
      const out = await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer();
      return dec.decode(out);
    };
    const container = await read("META-INF/container.xml") || "", opfPath = (/full-path="([^"]+)"/.exec(container) || [])[1];
    const opf = (opfPath && await read(opfPath)) || "";
    const doc = new DOMParser().parseFromString(opf, "application/xml"), tag = t => [...doc.getElementsByTagName("dc:" + t)].map(x => x.textContent.trim()).filter(Boolean);
    const idText = tag("identifier").map(x => /^\d[\d-]{8,}[\dX]$/i.test(x) ? "ISBN " + x : x.replace(/^urn:isbn:/i, "ISBN ").replace(/^urn:doi:/i, "doi:")).join("\n");
    return { title: tag("title")[0] || "", author: tag("creator").join("; "), xmp: idText, text: [tag("publisher")[0], tag("date")[0]].filter(Boolean).join(" ") };
  }
  // DOI, ISBN (cu cifra de control verificată), arXiv
  findIds({ text = "", xmp = "" }) {
    const all = xmp + "\n" + text, out = {};
    const d = /\b(10\.\d{4,9}\/[^\s"'<>]+)/i.exec(all.replace(/https?:\/\/(dx\.)?doi\.org\//gi, " ")); if (d) out.doi = cleanDoi(d[1]);
    const ok13 = s => s.length === 13 && /^97[89]/.test(s) && (10 - [...s.slice(0, 12)].reduce((a, c, i) => a + +c * (i % 2 ? 3 : 1), 0) % 10) % 10 === +s[12];
    const ok10 = s => s.length === 10 && [...s].reduce((a, c, i) => a + (c === "X" ? 10 : +c) * (10 - i), 0) % 11 === 0;
    const re = /ISBN(?:-1[03])?[^0-9X\n]{0,8}((?:[0-9][ \t\-–—]{0,2}){9,12}[0-9X])/gi; let m;   // și „0–19–285421–6”, „973-35- 1838- 7”
    while ((m = re.exec(all))) { const v = m[1].replace(/[^0-9X]/gi, "").toUpperCase(), v13 = v.slice(0, 13), v10 = v.slice(0, 10);
      if (ok13(v13)) { out.isbn = v13; break; } if (ok10(v10)) { out.isbn = isbn13(v10); break; } }
    const ax = /arXiv:\s?(\d{4}\.\d{4,5})/i.exec(all); if (ax) out.arxiv = ax[1];
    return out;
  }
  // fără identificator: titlul din metadate (dacă e unul adevărat) sau numele fișierului
  guessTitle(info, file) {
    const t = (info.title || "").trim();
    if (t.length > 5 && !/untitled|microsoft word|^document\d*$|\.(docx?|pdf|indd)$|^[\d\W_]+$/i.test(t)) return t + (info.author ? " " + info.author.split(/[,;&]| and /)[0].trim().split(/\s+/).pop() : "");
    const parts = file.basename.split(/\s+--\s+/); if (parts.length >= 3) return parts[0].trim() + " " + (parts[1].split(/[;,]/)[0].trim().split(/\s+/).pop() || "");
    return file.basename.replace(/\s+(by|de)\s+.*$/i, "").replace(/[_]+/g, " ").replace(/\s+[—–-]\s+/g, " ").trim();
  }
  async catalog(file, opts = {}) {
    const T = (a, b) => this.T(a, b), wait = new Notice(T("Citesc fișierul…", "Reading the file…"), 0);
    let info = { text: "", xmp: "", title: "" };
    try { info = file.extension === "epub" ? await this.readEpub(file) : file.extension === "pdf" ? await this.readPdf(file) : info; } catch (e) { console.warn("Texere Sources: citirea fișierului", e); }
    wait.hide();
    // un ISBN fără „ISBN” în față se acceptă doar în numele fișierului (ex. „… -- 9780140135152 -- …”), unde nu poate fi un număr de telefon
    const fm = /(?:^|\D)(97[89](?:[\s-]?\d){10})(?!\d)/.exec(file.basename), fnIsbn = fm ? fm[1].replace(/\D/g, "") : "";
    const ids = this.findIds({ ...info, xmp: (info.xmp || "") + (fnIsbn ? "\nISBN " + fnIsbn : "") });
    const q = ids.doi || ids.isbn || (ids.arxiv ? "arXiv:" + ids.arxiv : "") || this.guessTitle(info, file);
    new SearchModal(this, q, { pdf: file, auto: ids.doi || ids.isbn || ids.arxiv ? ids : null, after: opts.after }).open();
  }
  // PDF-urile din Inbox și cele din Documents pe care nu le are nicio notă
  uncataloged() {
    const T = (a, b) => this.T(a, b), mc = this.app.metadataCache, arr = v => Array.isArray(v) ? v : v ? [v] : [];
    const used = new Set();
    for (const f of this.app.vault.getMarkdownFiles()) for (const x of arr(mc.getFileCache(f)?.frontmatter?.attachment)) { const l = /\[\[([^\]|#]+)/.exec(String(x))?.[1]; const p = l && mc.getFirstLinkpathDest(l, f.path); if (p) used.add(p.path); }
    const pdfs = this.app.vault.getFiles().filter(f => DOC_EXT.test(f.extension) && (f.path.startsWith(this.inboxDir() + "/") || (f.path.startsWith(this.docDir() + "/") && !used.has(f.path))));
    if (!pdfs.length) { new Notice(T("Toate PDF-urile au o sursă. Inbox-ul e gol.", "Every PDF has a source. The Inbox is empty.")); return; }
    const { FuzzySuggestModal } = require("obsidian"), S = this, inbox = this.inboxDir() + "/";
    const M = class extends FuzzySuggestModal {
      getItems() { return pdfs; }
      getItemText(f) { return (f.path.startsWith(inbox) ? "Inbox · " : "") + f.basename; }
      onChooseItem(f) { S.catalog(f); }
    };
    const m = new M(this.app); m.setPlaceholder(T("Alege PDF-ul pe care îl adaugi ca sursă", "Choose the PDF to add as a source")); m.open();
  }
  // un PDF pe care îl ai deja (din Inbox sau de oriunde) ajunge în folderul sursei, cu numele după regulă, și se atașează notei
  async placePdf(note, csl, key, pdf, noteBase) {
    const dir = this.pdfDir(csl, key), name = this.pdfBase(csl, key, noteBase) || pdf.basename;
    await this.ensureFolder(dir);
    const to = this.freePath(dir, name, pdf.extension, pdf.path);
    if (to !== pdf.path) await this.app.fileManager.renameFile(pdf, to);
    await this.attachPdf(note, key, pdf.name);
    try { await this.highlights?.flushPending(pdf, note); } catch (e) { console.error("Texere Sources: evidențierile păstrate", e); }   // evidențierile făcute înainte de notă
    // și toate celelalte evidențieri scrise deja în PDF (făcute înainte, sau în altă aplicație), fiecare la locul ei
    if (pdf.extension === "pdf" && this.highlights?.importFromPdf) {
      try { const r = await this.highlights.importFromPdf(pdf, note); this.highlights.report([{ ...r, note }]); } catch (e) { console.error("Texere Sources: evidențierile din PDF", e); }
    }
  }
  // ——— folderele surselor: unul redenumit, mutat sau șters ———
  // ce folder lipsește: { notes, pdfs } → calea (partea fixă, fără variabile); Inbox se creează singur, la nevoie
  goneFolders() {
    const f = this.filesConf(), out = {};
    for (const k of ["notes", "pdfs"]) { const r = this.rootOf(f[k]); if (r && !this.app.vault.getAbstractFileByPath(r)) out[k] = r; }
    return out;
  }
  vaultFolders() {
    const v = this.app.vault, out = new Set(), walk = f => { for (const c of f.children || []) if (Array.isArray(c.children)) { out.add(c.path); walk(c); } };
    try { if (v.getAllFolders) for (const f of v.getAllFolders()) out.add(f.path); else if (v.getRoot) walk(v.getRoot()); else for (const f of v.getAllLoadedFiles?.() || []) if (Array.isArray(f.children)) out.add(f.path); } catch (e) {}
    return [...out].filter(p => p && p !== "/" && !p.split("/").some(x => x.startsWith("."))).sort((a, b) => a.localeCompare(b));
  }
  // folderul unei setări schimbat direct (fără să muți notele: ele sunt deja acolo): partea fixă se înlocuiește, variabilele rămân
  async setFolderRoot(key, to) {
    const f = this.filesConf(), old = this.rootOf(f[key]);
    f[key] = old && String(f[key]).startsWith(old) ? to + String(f[key]).slice(old.length) : to;
    // celelalte foldere care stau în cel schimbat (ex. Inbox în Documents, PDF-urile lângă note) îl urmează
    const m = this.conf().folderMoved || {};
    for (const k of ["notes", "pdfs", "inbox"]) { if (k === key || !old) continue; const v = String(f[k] || ""); if (v === old || v.startsWith(old + "/") || (v.startsWith(old) && v.slice(old.length).startsWith("/{{"))) { f[k] = to + v.slice(old.length); delete m[k]; } }
    delete m[key];
    await this.save();
  }
  // redenumești în Obsidian un folder al surselor: îl ținem minte (și după repornire), ca să-ți propunem numele nou
  trackFolderRename(f, old) {
    if (!Array.isArray(f?.children)) return;
    const files = this.filesConf(), c = this.conf();
    for (const k of ["notes", "pdfs", "inbox"]) { const r = this.rootOf(files[k]); if (r && (old === r || r.startsWith(old + "/"))) { (c.folderMoved = c.folderMoved || {})[k] = { from: r, to: f.path + r.slice(old.length) }; } }
    this.save();
  }
  // înainte să salvezi o sursă: dacă folderul notelor sau al PDF-urilor a dispărut, te întreabă unde le pune; false = renunți
  async checkFolders() {
    const gone = this.goneFolders(); if (!Object.keys(gone).length) return true;
    return new Promise(res => new SourceFoldersModal(this, gone, res).open());
  }

  // PDF-ul pe care îl salvezi din browser (după „Deschide PDF-ul”): când apare în Downloads (cel mult 10 minute), o copie intră lângă celelalte PDF-uri și se atașează
  watchDownload(note, x) {
    let fs = null, path = null, os = null; try { fs = require("fs"); path = require("path"); os = require("os"); } catch (e) {}
    let dir = null, before = new Set();
    try { dir = path.join(os.homedir(), "Downloads"); before = new Set(fs.readdirSync(dir)); } catch (e) { dir = null; }   // fără acces la Downloads: rămâne Inbox
    const T = (a, b) => this.T(a, b), t0 = Date.now(), sizes = {}, inbox = (() => { try { return this.inboxDir() + "/"; } catch (e) { return null; } })();
    const watch = (this._dlWatch = { note: note.path, until: t0 + 10 * 60000 });
    const id = normTitle(decodeURIComponent(String(x._pdfUrl || "").split(/[?#]/)[0].split("/").filter(Boolean).pop() || "").replace(/\.pdf$/i, ""));
    const words = normTitle(x.title || "").split(" ").filter(w => w.length > 3).slice(0, 8), doi = x.doi ? normTitle(String(x.doi).split("/").pop()) : "";
    const fits = n => { const b = normTitle(n.replace(/\.pdf$/i, "")); return (id.length >= 4 && b.includes(id)) || (doi.length >= 4 && b.includes(doi)) || (words.length >= 2 && words.filter(w => b.includes(w)).length >= 2); };
    const tick = async () => {
      if (Date.now() - t0 > 10 * 60000 || this._dlWatch !== watch) return;
      // un PDF tras în Inbox între timp: merge direct la notă
      const dropped = inbox && this.app.vault.getFiles().find(f => f.extension === "pdf" && f.path.startsWith(inbox) && (f.stat?.ctime || 0) >= t0);
      if (dropped) {
        try { const f = this.app.vault.getAbstractFileByPath(note.path) || note; if (!this.attachedPdfs(f).length) { await this.placeLater(f, dropped); new Notice(T(`PDF-ul din Inbox e atașat la @${f.basename}.`, `The PDF from Inbox is attached to @${f.basename}.`), 6000); } }
        catch (err) { console.warn("Texere Sources: PDF-ul din Inbox", err); }
        this._dlWatch = null; return;
      }
      let hit = null;
      if (dir) try {
        for (const n of fs.readdirSync(dir)) {
          if (before.has(n) || !/\.pdf$/i.test(n) || !fits(n)) continue;
          const st = fs.statSync(path.join(dir, n)); if (st.size > 1000 && sizes[n] === st.size) { hit = path.join(dir, n); break; } sizes[n] = st.size;   // descărcarea s-a terminat: mărimea nu se mai schimbă
        }
      } catch (e) {}
      if (!hit) return void later(tick, 1500);
      try {
        const b = fs.readFileSync(hit); if (b.subarray(0, 5).toString("latin1") !== "%PDF-") { before.add(path.basename(hit)); return void later(tick, 1500); }
        const f = this.app.vault.getAbstractFileByPath(note.path) || note; if (this.attachedPdfs(f).length) return;
        const csl = this.cslOfFm(this.app.metadataCache.getFileCache(f)?.frontmatter || {}), e = this.lib.all().find(v => v.obsidianPath === f.path), key = e?.id || f.basename.replace(/^@/, "");
        const to = this.pdfDir(csl, key); await this.ensureFolder(to);
        const pdf = await this.app.vault.createBinary(this.freePath(to, this.pdfBase(csl, key, f.basename.replace(/^@/, "")) || key, "pdf"), b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
        await this.placeLater(f, pdf, csl);
        new Notice(T(`PDF-ul din Downloads e atașat la @${key}.`, `The PDF from Downloads is attached to @${key}.`), 6000);
      } catch (err) { console.warn("Texere Sources: PDF-ul din Downloads", err); }
      this._dlWatch = null;
    };
    later(tick, 1500);
  }
  async logLine(line) {
    try { const p = this.dir + "/pdf-log.txt", ad = this.app.vault.adapter; const old = (await ad.exists(p)) ? (await ad.read(p)).split("\n") : []; await ad.write(p, [...old, `--- ${new Date().toISOString()} ${line}`].slice(-400).join("\n")); } catch (e) {}
  }
  // PDF-urile deja atașate notei (în notă sau în bibliografie)
  attachedPdfs(note) {
    const mc = this.app.metadataCache, fm = mc.getFileCache(note)?.frontmatter || {}, e = this.lib.all().find(v => v.obsidianPath === note.path) || {};
    const list = [].concat(fm.attachment || [], e.attachment || []);
    return [...new Set(list.map(x => /\[\[([^\]|#]+)/.exec(String(x))?.[1]).filter(Boolean))].map(n => mc.getFirstLinkpathDest(n, note.path)).filter(f => f && f.extension === "pdf");
  }
  // o singură căutare de PDF pe notă; dacă între timp a primit un PDF (de la Zotero, de la buton), cel găsit nu se mai atașează
  async onePdf(note, run) {
    const jobs = (this._pdfJobs = this._pdfJobs || new Set());
    if (jobs.has(note.path) || this.attachedPdfs(note).length) return null;
    jobs.add(note.path);
    try {
      const name = await run(); if (!name) return null;
      const f = this.app.vault.getAbstractFileByPath(note.path) || note;
      if (this.attachedPdfs(f).length) {   // între timp a venit altul: cel abia descărcat merge la coș
        const dup = this.app.vault.getFiles().filter(x => x.name === name && x.extension === "pdf" && Date.now() - (x.stat?.ctime || 0) < 120000).sort((p, q) => q.stat.ctime - p.stat.ctime)[0];
        if (dup && !this.attachedPdfs(f).includes(dup)) { try { await (this.app.fileManager.trashFile ? this.app.fileManager.trashFile(dup) : this.app.vault.trash(dup, true)); } catch (e) {} }
        return null;
      }
      return name;
    } finally { jobs.delete(note.path); }
  }
  async placeLater(note, pdf, csl) {
    const f = this.app.vault.getAbstractFileByPath(note.path) || note, e = this.lib.all().find(v => v.obsidianPath === f.path), key = e?.id || f.basename.replace(/^@/, "");
    await this.placePdf(f, csl || this.cslOfFm(this.app.metadataCache.getFileCache(f)?.frontmatter || {}), key, pdf, f.basename.startsWith("@") ? key : f.basename);
  }
  async attachToNote(note, pdf) {
    const fm = this.app.metadataCache.getFileCache(note)?.frontmatter || {}, key = fm.id || note.basename.replace(/^@/, "");
    await this.placePdf(note, this.cslOfFm(fm), key, pdf, note.basename.replace(/^@/, ""));
    new Notice(this.T(`PDF-ul a fost atașat la @${key}`, `The PDF was attached to @${key}`), 5000);
  }
  // PDF-ul găsit intră în attachment (în notă și în bibliografie)
  // linkul arată numele PDF-ului ([[nume.pdf]]), nu doar „PDF”; Obsidian îl ține la zi când redenumești fișierul
  async attachPdf(file, key, name) {
    const link = `[[${name}]]`, same = x => /\[\[([^\]|#]+)/.exec(String(x))?.[1] === name;
    await this.app.fileManager.processFrontMatter(file, f => { const a = Array.isArray(f.attachment) ? f.attachment.filter(Boolean) : f.attachment ? [f.attachment] : []; if (!a.some(same)) a.push(link); f.attachment = a; });
    await this.lib.update(key, e => { const a = (Array.isArray(e.attachment) ? e.attachment : []).filter(Boolean); if (!a.some(same)) a.push(link); e.attachment = a; });
  }
  // o singură dată: [[x.pdf|PDF]] → [[x.pdf]] în notele de literatură (aliasurile tale, altele decât PDF/EPUB…, rămân)
  async renameAttachLinks() {
    const c = this.conf(); if (c.attachNames === 1) return;
    const mc = this.app.metadataCache, OLD = /^\[\[([^\]|#]+?)\|(PDF|EPUB|DJVU|MOBI|DOCX?|FILE)\]\]$/;
    let n = 0, bad = 0;
    for (const f of this.app.vault.getMarkdownFiles()) {
      const fm = mc.getFileCache(f)?.frontmatter; if (!fm || fm.attachment == null) continue;
      const list = Array.isArray(fm.attachment) ? fm.attachment : [fm.attachment];
      if (!list.some(x => OLD.test(String(x).trim()))) continue;
      try {
        await this.app.fileManager.processFrontMatter(f, o => { const a = Array.isArray(o.attachment) ? o.attachment : [o.attachment]; const b = a.map(x => { const m = OLD.exec(String(x ?? "").trim()); return m ? `[[${m[1]}]]` : x; }); o.attachment = Array.isArray(o.attachment) ? b : b[0]; });
        n++;
      } catch (e) { bad++; console.warn("Texere Sources: numele PDF-ului în attachment", f.path, e); }
    }
    if (!bad) { c.attachNames = 1; await this.save(); }
    if (n) { console.log(`Texere Sources: attachment arată numele PDF-ului în ${n} note`); setTimeout(() => this.rebuildFromNotes?.(true), 1500); }
  }
  // fără PDF descărcabil: un buton care deschide versiunea gratuită în browser, ca să-l salvezi tu în Documents
  noPdfNotice(ctx) {
    const T = (a, b) => this.T(a, b), url = this.lastPdfPage, frag = document.createDocumentFragment();
    const pdfUrl = ctx?.x?._pdfUrl;
    if (pdfUrl && ctx.note) {   // PDF-ul există, dar situl nu lasă descărcarea automată (ex. PhilPapers): îl iei tu din browser, Texere îl atașează
      frag.append(T("Situl nu lasă Texere să descarce PDF-ul. ", "The site doesn't let Texere download the PDF. "));
      const a = document.createElement("a"); a.textContent = T("Deschide PDF-ul ↗", "Open the PDF ↗"); a.href = pdfUrl; frag.append(a);
      const save = process.platform === "darwin" ? "⌘S" : "Ctrl+S";
      frag.append(T(`, apoi salvează-l (${save}) în Downloads sau trage-l în Inbox: Texere îl atașează la sursă.`, `, then save it (${save}) to Downloads, or drag it into Inbox: Texere attaches it to the source.`));
      const n = new Notice(frag, 25000);
      a.addEventListener("click", e => { e.preventDefault(); n.hide(); window.open(pdfUrl); try { this.watchDownload(ctx.note, ctx.x); } catch (err) { console.warn("Texere Sources: Downloads", err); } });
      return;
    }
    frag.append(T("Nu am putut descărca un PDF gratuit: editura nu permite descărcarea automată sau nu există o copie liberă. ", "I couldn't download a free PDF: the publisher blocks automatic downloads or there's no free copy. "));
    if (url) { const a = document.createElement("a"); a.textContent = T("Deschide pagina sursei ↗", "Open the source's page ↗"); a.href = url; a.addEventListener("click", e => { e.preventDefault(); window.open(url); }); frag.append(a);
      frag.append(T(" — dacă are PDF, salvează-l în Documents și pune-l în attachment.", " — if it has a PDF, save it in Documents and add it to attachment.")); }
    new Notice(frag, 15000);
  }

  // datele sursei pentru notă: câmpurile standard (numărul revistei = „number”), apoi persoanele, apoi câmpurile suplimentare
  noteData(csl, key) {
    const citation = { id: key };
    const yr = csl.issued?.["date-parts"]?.[0]?.[0]; if (yr) citation.year = String(yr);   // pentru {{year}} (nu apare ca atare în notă)
    const std = { ...csl }; if (std.number == null && std.issue != null) std.number = std.issue;
    for (const k of NOTE_STD) if (std[k] != null && std[k] !== "") citation[k] = std[k];
    const contributors = [];
    for (const role of ["author", "editor", "translator", "container-author"]) for (const p of csl[role] || []) contributors.push({ role, ...p });
    const additionalFields = [{ name: "accessed", value: csl.accessed || { "date-parts": [today()] }, type: "date" }, { name: "citation-key", value: key, type: "standard" }];
    for (const [k, type] of NOTE_EXTRA) if (csl[k] != null && csl[k] !== "") additionalFields.push({ name: k, value: csl[k], type });
    return { citation, contributors, additionalFields };
  }
  // textul notei de literatură: proprietățile în ordinea de mai sus, apoi titlul notei din șablon
  noteText(csl, key, pdfName, custom, opts) {
    const { citation, contributors, additionalFields } = this.noteData(csl, key);
    const { year, ...std } = citation;
    const fm = { ...std, tags: this.T_.tags(this.template().tag) };
    for (const { role, ...p } of contributors) (fm[role] = fm[role] || []).push(p);
    for (const f of additionalFields) fm[f.name] = f.value;
    for (const [k, v] of this.noteFields(csl, key, pdfName ? [`${this.docDir()}/${pdfName}`] : [], custom)) if (!(k in fm)) fm[k] = v;
    if (opts?.alias && Array.isArray(fm.aliases) && !fm.aliases.includes("@" + key)) fm.aliases = [...fm.aliases, "@" + key];
    return { text: `---\n${toYaml(fm)}\n---\n\n${this.noteHeader(csl, key)}\n`, fm };
  }

  // adaugă sursa: nota de literatură + PDF + intrarea în bibliografie
  async add(x, opts = {}) {
    if (!(await this.checkFolders())) return null;   // un folder al surselor a dispărut și ai renunțat
    opts.submitted?.();
    const lib = this.library(), have = lib.find(x);
    if (have && !opts.force) { if (opts.silent) { opts.after?.(have); return have; } if (opts.pdfFile) await this.attachToNote(have, opts.pdfFile); if (opts.after) opts.after(have); else await this.app.workspace.getLeaf("tab").openFile(have); return have; }
    const quiet = { hide() {}, setMessage() { return this; } };
    const wait = opts.silent ? quiet : new Notice(this.T("Adaug sursa…", "Adding the source…"), 0);
    const notice = (m, t) => { if (!opts.silent) new Notice(m, t); };
    try {
      const csl = opts.csl || await this.fullCsl(x);
      if (!x.doi && csl.DOI) x.doi = cleanDoi(csl.DOI);
      const again = lib.find({ ...x, title: csl.title, doi: x.doi, isbn: isbn13(csl.ISBN) });
      if (again && !opts.force) { wait.hide(); if (opts.silent) { opts.after?.(again); return again; } if (opts.pdfFile) await this.attachToNote(again, opts.pdfFile); if (opts.after) opts.after(again); else await this.app.workspace.getLeaf("tab").openFile(again); return again; }
      const taken = new Set([...lib.keys, ...this.lib.all().map(e => e.id)]);
      const key = this.citekey(csl, taken);
      // nota se creează imediat; PDF-ul se caută după, în fundal, și se atașează când e gata
      const base = this.fileBase(csl, key), readable = !base.startsWith("@");
      const { text, fm } = this.noteText(csl, key, null, opts.custom, { alias: readable });
      wait.setMessage(this.T("Creez nota…", "Creating the note…"));
      // nota o scrie Texere, cu șablonul și folderele tale
      const dir = this.notesDir(csl, key); await this.ensureFolder(dir);
      const file = await this.app.vault.create(this.freePath(dir, base, "md"), text);
      // în bibliografie intră aceleași date ca în notă („Refă bibliografia din note” o reface la fel)
      { const { tags, ...entry } = fm; await this.lib.add({ ...entry, obsidianPath: file.path }); }
      if (opts.pdfFile && !opts.silent) { if (!opts.after) { try { await (this.highlights?.showNote(file, opts.pdfFile) ?? this.app.workspace.getLeaf("tab").openFile(file)); } catch (e) {} } }   // lângă PDF, nu în locul lui
      else if (!opts.silent && this.conf().openNote !== false) await this.app.workspace.getLeaf("tab").openFile(file);
      // din Zotero: PDF-ul vine din biblioteca ta Zotero (nu se mai caută pe internet)
      if (!opts.pdfFile && !opts.noZoteroPdf && x.zotero && this.zotero) {
        wait.setMessage(this.T(`Sursă adăugată: @${key}. Aduc PDF-ul din Zotero…`, `Source added: @${key}. Bringing the PDF from Zotero…`));
        try { const zf = await this.zotero.pdfToVault(x); if (zf) { await this.placePdf(file, csl, key, zf, readable ? base : key); wait.hide(); notice(this.T(`Sursă adăugată din Zotero, cu PDF-ul: @${key}`, `Source added from Zotero, with its PDF: @${key}`), 5000); opts.after?.(file); return file; } }
        catch (e) { console.warn("Texere Sources: PDF-ul din Zotero", e); }
      }
      if (opts.pdfFile) {   // catalogare: PDF-ul pe care îl ai deja se mută lângă celelalte și se atașează
        try { await this.placePdf(file, csl, key, opts.pdfFile, readable ? base : key); } catch (e) { console.error("Texere Sources: PDF-ul catalogat", e); }
        wait.hide(); notice(this.T(`Sursă adăugată, cu PDF-ul tău: @${key}`, `Source added, with your PDF: @${key}`), 5000);
      } else if (!opts.silent && !opts.noFreePdf && this.conf().pdf && (x.doi || x.pdf?.length)) {
        wait.setMessage(this.T(`Sursă adăugată: @${key}. Caut PDF-ul gratuit…`, `Source added: @${key}. Looking for the free PDF…`));
        this.pdfLater(x, key, file, wait, this.pdfBase(csl, key, readable ? base : key), this.pdfDir(csl, key));   // fără await: nota e deja gata de lucru
      } else { wait.hide(); notice(opts.addedMsg ? opts.addedMsg(key) : this.T(`Sursă adăugată: @${key}`, `Source added: @${key}`), 5000); }
      opts.after?.(file);
      return file;
    } catch (e) { wait.hide(); console.error("Texere Sources: adăugare", e); if (opts.silent) throw e; new Notice(this.T("Nu am putut adăuga sursa: ", "Couldn't add the source: ") + e.message, 8000); opts.after?.(null); return null; }
  }
  // căutarea PDF-ului după ce nota există: îl atașează dacă îl găsește, altfel arată unde îl poți lua de mână
  async pdfLater(x, key, file, wait, base, dir) {
    const T = (a, b) => this.T(a, b);
    let name = null; try { name = await this.onePdf(file, () => this.fetchPdf(x, base, key, dir)); } catch (e) { console.warn("Texere Sources: PDF", e); }
    wait.hide();
    if (!name) { if ((x.oa || x.doi || x._pdfUrl) && !this.attachedPdfs(this.app.vault.getAbstractFileByPath(file.path) || file).length) this.noPdfNotice({ note: file, x }); return; }
    try {
      const f = this.app.vault.getAbstractFileByPath(file.path) || file;   // poate ai redenumit-o între timp
      await this.attachPdf(f, key, name);
      new Notice(T(`PDF găsit și atașat la @${key}`, `PDF found and attached to @${key}`), 5000);
    } catch (e) { console.error("Texere Sources: atașarea PDF-ului", e); new Notice(T(`PDF-ul e în Documents (${name}), dar nu l-am putut pune în attachment.`, `The PDF is in Documents (${name}), but I couldn't add it to attachment.`), 8000); }
  }


  // test la prima pornire: rezultatul fiecărui catalog se scrie în sources-test.log (în folderul pluginului)
  async selfTest() {
    const c = this.conf(); if (c.selftest === 2) return;
    const lines = [`Texere Sources self-test ${new Date().toISOString()}`], ctx = this.ctx();
    const f = { type: "all", from: "", to: "" };
    for (const p of this.providers) {
      for (const q of ["responsibility artificial intelligence virtue", "Think Blackburn"]) {
        const t0 = Date.now();
        try { const r = await p.search(q, f, ctx); lines.push(`${p.id} | ${q} | ${r.length} results | ${Date.now() - t0}ms`); if (r[0]) lines.push("  first: " + JSON.stringify(r[0]).slice(0, 600)); }
        catch (e) { lines.push(`${p.id} | ${q} | ERROR ${e.status || ""} ${e.message}`); }
      }
    }
    try {
      const x = { doi: "10.1007/s10676-021-09616-9", title: "Understanding responsibility in Responsible AI", sources: [] };
      const csl = await this.fullCsl(x); lines.push("doi.org CSL: " + JSON.stringify(csl).slice(0, 800));
      lines.push("note:\n" + this.noteText(csl, "test_key_2021", null).text.slice(0, 1500));
    } catch (e) { lines.push("fullCsl ERROR " + e.message); }
    await this.app.vault.adapter.write(this.dir + "/sources-test.log", lines.join("\n"));
    c.selftest = 2; await this.save();
  }

  css() {
    const id = "texere-sources-css"; document.getElementById(id)?.remove();
    const s = document.createElement("style"); s.id = id;
    s.textContent = `.modal-container:has(.texere-src){align-items:flex-start}
.texere-src{width:min(860px,94vw);max-width:94vw;margin-top:8vh;height:min(760px,84vh);max-height:84vh}
.texere-src .modal-title{display:flex;align-items:flex-end;gap:8px 28px;flex-wrap:wrap;border-bottom:1px solid var(--background-modifier-border);padding-bottom:0;margin-bottom:12px}
.texere-src .ts-head-t{padding-bottom:10px}
.texere-src .ts-modes{display:flex;gap:20px;font-size:var(--font-ui-small);font-weight:500}
.texere-src .ts-mode{padding:2px 1px 10px;margin-bottom:-1px;border-bottom:2px solid transparent;color:var(--text-muted);cursor:pointer;user-select:none;white-space:nowrap;transition:color .12s}
.texere-src .ts-mode:hover{color:var(--text-normal)}
.texere-src .ts-mode.on{color:var(--text-normal);border-bottom-color:var(--interactive-accent)}
.texere-src .modal-content{overflow:hidden}
.texere-src .ts-pane{display:flex;flex-direction:column;gap:10px;flex:1;min-height:0;overflow-y:auto;padding:4px 4px 2px;margin:-4px -4px 0}
.texere-src .ts-pane textarea{width:100%;min-height:90px}
.texere-src .ts-review-top{display:flex;align-items:center;gap:14px;font-size:var(--font-ui-small)}
.texere-src .ts-back{cursor:pointer;color:var(--text-muted)}.texere-src .ts-back:hover{color:var(--text-accent)}
.texere-src .ts-review-src{color:var(--text-faint);margin-left:auto}
.texere-src .ts-hint{color:var(--text-muted);font-size:var(--font-ui-small)}
.texere-src .ts-form{display:grid;grid-template-columns:150px 1fr;gap:6px 14px;align-items:center}
.texere-src .ts-form .ts-row{display:contents}
.texere-src .ts-form label{font-size:var(--font-ui-small);color:var(--text-muted);text-align:right}
.texere-src .ts-form input,.texere-src .ts-form select{width:100%;height:30px;font-size:var(--font-ui-small)}
.texere-src .ts-form select{justify-self:start;width:auto;min-width:200px}
.texere-src .ts-form .ts-more-row a{font-size:var(--font-ui-smaller);color:var(--text-muted);cursor:pointer;padding:2px 0}
.texere-src .ts-form .ts-more-row a:hover{color:var(--text-accent)}
.texere-src .ts-form .ts-sec-t{display:flex;align-items:baseline;gap:12px;margin-top:12px;padding-top:10px;border-top:1px solid var(--background-modifier-border);font-size:var(--font-ui-small);font-weight:600;color:var(--text-normal)}
.texere-src .ts-form .ts-sec label{margin-top:12px}
.texere-src .ts-form .ts-sec-t a{font-weight:400;font-size:var(--font-ui-smaller);color:var(--text-muted);cursor:pointer}.texere-src .ts-form .ts-sec-t a:hover{color:var(--text-accent)}
.texere-src .ts-form input.ts-auto::placeholder{color:var(--text-muted)}
.texere-src .ts-chips{position:relative;display:flex;flex-wrap:wrap;gap:4px;align-items:center;min-height:30px;padding:2px 6px;border:var(--input-border-width,1px) solid var(--background-modifier-border);border-radius:var(--input-radius,5px);background:var(--background-modifier-form-field);cursor:text}
.texere-src .ts-chips:focus-within{border-color:var(--interactive-accent)}
.texere-src .ts-chips input{flex:1;min-width:120px;height:24px !important;border:0 !important;box-shadow:none !important;background:transparent !important;padding:0 2px}
.texere-src .ts-chip{display:inline-flex;align-items:center;gap:4px;padding:1px 4px 1px 8px;border-radius:10px;background:var(--background-modifier-hover);font-size:var(--font-ui-small)}
.texere-src .ts-chip-x{cursor:pointer;color:var(--text-faint);padding:0 3px}.texere-src .ts-chip-x:hover{color:var(--text-normal)}
.modal.texere-tidy{display:flex;flex-direction:column;max-height:86vh}
.texere-tidy .modal-content{display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden}
.texere-tidy .ts-tidy-list{flex:none;border:1px solid var(--background-modifier-border);border-radius:8px;padding:4px;margin:10px 0}
.texere-tidy .ts-tidy-list.ts-tidy-scroll{flex:1 1 auto;min-height:80px;overflow-y:auto;overscroll-behavior:contain}
.texere-tidy .ts-tidy-row{display:flex;gap:10px;align-items:flex-start;padding:6px 8px;border-radius:6px;cursor:pointer;font-size:var(--font-ui-small)}
.texere-tidy .ts-tidy-row:hover{background:var(--background-modifier-hover)}.texere-tidy .ts-tidy-row.pdf{padding-left:28px}
.texere-tidy .ts-tidy-row input{margin-top:3px}.texere-tidy .ts-tidy-old{color:var(--text-muted);word-break:break-word}.texere-tidy .ts-tidy-new{font-weight:500;word-break:break-word}
.texere-tidy .ts-tidy-bar{flex:none;display:flex;justify-content:flex-end;gap:8px;padding-top:12px;border-top:1px solid var(--background-modifier-border)}
.texere-src .ts-catalog{font-size:var(--font-ui-small);color:var(--text-muted);padding:6px 10px;margin-bottom:6px;border-radius:6px;background:var(--background-secondary)}
.texere-src .ts-catalog-f{font-weight:600;color:var(--text-normal)}
.status-bar-item.texere-catalog-status{gap:4px;cursor:pointer}.texere-catalog-status svg{width:13px;height:13px}
.texere-src .ts-paste-list{flex:1;min-height:0;overflow-y:auto;border:1px solid var(--background-modifier-border);border-radius:8px;padding:4px}
.texere-src .ts-paste-row{display:flex;gap:10px;align-items:flex-start;padding:8px;border-radius:6px;cursor:pointer}.texere-src .ts-paste-row:hover{background:var(--background-modifier-hover)}
.texere-src .ts-paste-row input{margin-top:3px}.texere-src .ts-paste-t{font-weight:500;font-size:var(--font-ui-small)}.texere-src .ts-paste-st{font-size:var(--font-ui-smaller);color:var(--text-muted);margin-top:2px}
.texere-src .ts-paste-st a{cursor:pointer;color:var(--text-accent)}.texere-src .ts-paste-how.doi,.texere-src .ts-paste-how.id,.texere-src .ts-paste-how.bibtex{color:var(--color-green)}
.texere-src .ts-paste-how.matched{color:var(--color-orange)}.texere-src .ts-paste-how.guess{color:var(--color-red)}
.texere-ask-source ul{margin:6px 0 10px;padding-left:1.3em}.texere-ask-source li{margin:3px 0}
.texere-ask-source .texere-ask-note{font-size:var(--font-ui-small);color:var(--text-muted)}
.texere-ask-bar{display:flex;align-items:center;gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid var(--background-modifier-border)}
.texere-ask-later{flex:1;font-size:var(--font-ui-smaller);color:var(--text-faint)}
.texere-chip-menu{position:fixed;z-index:var(--layer-menu,65);background:var(--background-primary);border:1px solid var(--background-modifier-border);border-radius:6px;box-shadow:var(--shadow-l);padding:3px;overflow-y:auto}
.texere-chip-menu .ts-chip-opt{display:flex;justify-content:space-between;gap:10px;padding:4px 8px;border-radius:4px;font-size:var(--font-ui-small);cursor:pointer}
.texere-chip-menu .ts-chip-note{color:var(--text-faint);font-size:var(--font-ui-smaller)}.texere-chip-menu .ts-chip-opt.on,.texere-chip-menu .ts-chip-opt:hover{background:var(--background-modifier-hover)}
.texere-src .ts-actions{position:sticky;bottom:0;margin-top:auto;display:flex;justify-content:flex-end;padding:10px 0 2px;background:var(--modal-background,var(--background-primary));border-top:1px solid var(--background-modifier-border)}
@media (max-width:560px){.texere-src .ts-form{grid-template-columns:1fr}.texere-src .ts-form label{text-align:left}}
.texere-src .ts-pane textarea.ts-bib-ta{min-height:260px;font-family:var(--font-monospace);font-size:12px}
.texere-src .ts-start-alt{font-size:var(--font-ui-small);color:var(--text-faint)}
.texere-src .ts-start-alt a{color:var(--text-muted);cursor:pointer}.texere-src .ts-start-alt a:hover{color:var(--text-accent)}
.texere-src .modal-content{display:flex;flex-direction:column;gap:10px;padding-top:4px;flex:1;min-height:0}
.texere-src .ts-q{display:flex;align-items:center;gap:8px;border:1px solid var(--background-modifier-border);border-radius:8px;padding:6px 10px;background:var(--background-primary)}
.texere-src .ts-q{flex-direction:row}
.texere-src .ts-clear{order:3;background:none;box-shadow:none;border:0;padding:2px;height:auto;color:var(--text-faint);cursor:pointer;display:flex}
.texere-src .ts-clear:hover{color:var(--text-normal)}.texere-src .ts-clear svg{width:16px;height:16px}
.texere-src .ts-q input{order:2;flex:1;border:0!important;box-shadow:none!important;background:transparent;font-size:var(--font-ui-medium);padding:2px 0}
.texere-src .ts-q svg{width:16px;height:16px;color:var(--text-faint)}
.texere-src .ts-filters{display:flex;flex-wrap:wrap;gap:6px 8px;align-items:center;font-size:var(--font-ui-small);color:var(--text-muted)}
.texere-src .ts-tabs{display:flex;gap:4px}
.texere-src-menu{position:fixed;z-index:var(--layer-menu,65);min-width:240px;max-width:min(560px,90vw);padding:4px;background:var(--background-primary);border:1px solid var(--background-modifier-border);border-radius:8px;box-shadow:var(--shadow-l)}
.texere-src-menu .ts-sm-item{display:flex;align-items:baseline;gap:6px;padding:5px 10px 5px 6px;border-radius:5px;cursor:pointer;font-size:var(--font-ui-small);user-select:none}
.texere-src-menu .ts-sm-item:hover{background:var(--background-modifier-hover)}
.texere-src-menu .ts-sm-ck{flex:0 0 14px;text-align:center;color:var(--text-normal)}
.texere-src-menu .ts-sm-item:not(.on) .ts-sm-name{color:var(--text-muted)}
.texere-src-menu .ts-sm-note{color:var(--text-faint);white-space:nowrap}
.texere-src-menu .ts-sm-sep{height:1px;margin:4px 6px;background:var(--background-modifier-border)}
.texere-src-menu .ts-sm-more{padding-left:26px;color:var(--text-muted)}
.texere-src .ts-zpane{gap:10px}
.texere-src .ts-zhead{display:flex;align-items:center;flex-wrap:wrap;gap:8px;font-size:var(--font-ui-small);color:var(--text-muted)}
.texere-src .ts-zhead-t{font-weight:600;color:var(--text-normal)}
.texere-src .ts-zhead .ts-zdot{width:8px;height:8px;border-radius:50%;display:inline-block;background:#E8A33B}.texere-src .ts-zhead .ts-zdot.ok{background:#2E9E6B}.texere-src .ts-zhead .ts-zdot.bad{background:#E03131}
.texere-src .ts-zhead-d{flex-basis:100%;color:var(--text-faint)}
.texere-src .ts-zacts{display:flex;gap:8px}
.texere-src .ts-zbody{display:grid;grid-template-columns:minmax(170px,230px) 1fr;gap:14px;flex:1;min-height:0}
.texere-src .ts-zside{display:flex;flex-direction:column;gap:1px;overflow-y:auto;min-height:0;border-right:1px solid var(--background-modifier-border);padding-right:8px}
.texere-src .ts-zmain{display:flex;flex-direction:column;gap:8px;min-height:0;min-width:0}
.texere-src .ts-ztop{display:flex;align-items:center;gap:10px}.texere-src .ts-ztop .ts-q{flex:1;min-width:0}
.texere-src .ts-zonly{flex-shrink:0;font-size:var(--font-ui-small)}
.texere-src .ts-zretry{cursor:pointer;margin-left:6px}
.notice .ts-notice-acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.notice .ts-notice-acts button{font-size:var(--font-ui-small)}
.texere-src .ts-zrow{display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:var(--font-ui-small)}
.texere-src .ts-zrow:hover{background:var(--background-modifier-hover)}
.texere-src .ts-zrow.on{background:var(--background-modifier-hover);color:var(--text-normal);font-weight:600}
.texere-src .ts-zname{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.texere-src .ts-zn{color:var(--text-faint);font-size:var(--font-ui-smaller)}
.texere-src .ts-zpdf{display:flex;align-items:center;gap:4px;color:var(--text-muted);cursor:pointer}
.texere-src .ts-zitem{display:flex;gap:10px;align-items:flex-start}
.texere-src .ts-zitem .ts-zchk{margin-top:3px;flex:0 0 auto}
.texere-src .ts-zitem-b{flex:1;min-width:0}
.texere-src .ts-list.is-busy{opacity:.55;pointer-events:none}
.texere-src .ts-status.ts-zdone{color:var(--text-normal)}
.texere-src .ts-b.hl{color:#C98A00;font-weight:600}
.texere-zimport .ts-zmode{font-size:var(--font-ui-small);font-weight:400;color:var(--text-muted);padding-bottom:10px}
.texere-zimport .ts-zlist{display:flex;flex-direction:column;gap:1px;overflow-y:auto;flex:1;min-height:0;border:1px solid var(--background-modifier-border);border-radius:8px;padding:4px}
.texere-zimport .ts-zlist.is-busy{opacity:.55;pointer-events:none}
.texere-zimport .ts-zrow{display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:var(--font-ui-small)}
.texere-zimport .ts-zrow:hover{background:var(--background-modifier-hover)}
.texere-zimport .ts-zrow.on{background:var(--background-modifier-hover);color:var(--text-normal);font-weight:600}
.texere-zimport .ts-zall{font-weight:500}
.texere-zimport .ts-zname{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.texere-zimport .ts-zn{color:var(--text-faint);font-size:var(--font-ui-smaller)}
.texere-zimport .ts-zpdf{display:flex;align-items:center;gap:4px;color:var(--text-muted);cursor:pointer}
.texere-src .ts-tab{padding:3px 10px;border-radius:999px;border:1px solid var(--background-modifier-border);cursor:pointer;color:var(--text-muted);user-select:none}
.texere-src .ts-tab:hover{color:var(--text-normal)}
.texere-src .ts-tab.on{background:var(--background-modifier-hover);border-color:transparent;color:var(--text-normal)}
.texere-src .ts-spacer{flex:1}
.texere-src .ts-filters .ts-years{width:170px;height:28px;font-size:var(--font-ui-small)}
.texere-src .ts-filters .ts-years.bad{border-color:var(--text-error)}
.texere-src .ts-filters .ts-sel{height:28px;font-size:var(--font-ui-small);padding:0 24px 0 8px}
.texere-src .ts-srcbtn{height:28px;font-size:var(--font-ui-small);padding:0 10px;background:transparent;box-shadow:none;border:1px solid var(--background-modifier-border);color:var(--text-muted)}
@media (max-width:640px){.texere-src .ts-spacer{display:none}}
.texere-src .ts-q{position:relative;overflow:hidden}
.texere-src{position:relative;overflow:hidden}
.texere-src.is-loading::before{content:"";position:absolute;left:0;top:0;height:3px;width:35%;background:var(--interactive-accent);animation:ts-run 1.1s ease-in-out infinite;z-index:5}
@keyframes ts-run{0%{left:-35%}100%{left:100%}}
.texere-src .ts-skel{cursor:default}.texere-src .ts-skel:hover{background:none}
.texere-src .sk{border-radius:4px;background:linear-gradient(90deg,var(--background-modifier-hover) 25%,var(--background-modifier-border) 50%,var(--background-modifier-hover) 75%);background-size:200% 100%;animation:ts-shine 1.2s linear infinite;height:12px;margin:6px 0}
.texere-src .sk-t{width:70%;height:15px}.texere-src .sk-m{width:45%}.texere-src .sk-b{width:30%;height:10px}
@keyframes ts-shine{0%{background-position:200% 0}100%{background-position:-200% 0}}
.texere-src .ts-status{font-size:var(--font-ui-smaller);color:var(--text-faint);min-height:1.2em}
.texere-src .ts-list{flex:1;min-height:120px;overflow-y:auto;display:flex;flex-direction:column;gap:2px}
.texere-src .ts-item{padding:8px 10px;border-radius:6px;cursor:pointer;position:relative}
.texere-src .ts-item.sel,.texere-src .ts-item:hover{background:var(--background-modifier-hover)}
.texere-src .ts-title{font-weight:600;color:var(--text-normal);line-height:1.35}
.texere-src .ts-meta{font-size:var(--font-ui-small);color:var(--text-muted);margin-top:2px}
.texere-src .ts-badges{display:flex;flex-wrap:wrap;gap:5px 10px;margin-top:4px;font-size:var(--font-ui-smaller);color:var(--text-faint);align-items:center}
.texere-src .ts-b{display:inline-flex;align-items:center;gap:4px}
.texere-src .ts-b.oa{color:#C98A00}.texere-src .ts-b.have{color:var(--color-green,#2E9E6B);font-weight:600}
.texere-src .ts-hl{font-weight:700;color:var(--text-normal)}
.texere-src .ts-title .ts-hl{text-decoration:underline;text-decoration-color:var(--text-accent);text-underline-offset:3px;text-decoration-thickness:2px}
.texere-src .ts-open{color:var(--text-faint);text-decoration:none;font-weight:400;cursor:pointer}.texere-src .ts-open:hover{color:var(--text-accent)}
.texere-src .ts-abs{font-size:var(--font-ui-smaller);color:var(--text-muted);margin-top:3px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.45}
.texere-src .ts-item.sel .ts-abs{-webkit-line-clamp:5}
.texere-src .ts-card{border:1px solid var(--background-modifier-border);border-radius:8px;padding:8px 10px;margin-bottom:6px;background:var(--background-secondary)}
.texere-src .ts-card-name{font-weight:600}.texere-src .ts-card-inst{font-weight:400;color:var(--text-muted)}
.texere-src .ts-link{cursor:pointer;text-decoration:none;color:var(--text-muted)}.texere-src .ts-link:hover{color:var(--text-accent)}
.texere-src .ts-b.lang{border:1px solid var(--background-modifier-border);border-radius:4px;padding:0 4px}
.texere-src .ts-b.retracted{background:#F45B5B;color:#fff;font-weight:600;border-radius:8px;padding:0 6px}
.texere-src .ts-b.top{color:var(--text-muted);font-weight:600}
.texere-src .ts-dot{width:7px;height:7px;border-radius:50%;display:inline-block}
.texere-src .ts-b.kind{border:1px solid var(--background-modifier-border);border-radius:4px;padding:0 5px}
.texere-src .ts-start{padding:4px 2px 6px}
.texere-src .ts-start-tip{color:var(--text-muted);font-size:var(--font-ui-small);margin-bottom:6px}
.texere-src .ts-foot-q{color:var(--text-faint)}.texere-src .ts-keys{margin-left:auto}
.texere-src .ts-foot{flex:none;min-height:44px;margin-top:2px;align-items:center !important}
.texere-src .ts-foot-l{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;min-width:0}
.texere-src .ts-foot-r{margin-left:auto;display:flex;gap:8px;align-items:center}
.texere-src .ts-foot-r button{margin:0}
.texere-src .ts-foot{display:flex;flex-wrap:wrap;gap:8px 16px;font-size:var(--font-ui-small);color:var(--text-faint);border-top:1px solid var(--background-modifier-border);padding-top:8px}
.texere-src .ts-foot a{color:var(--text-muted);cursor:pointer;text-decoration:none}.texere-src .ts-foot a:hover{color:var(--text-accent)}
.texere-src .ts-empty{color:var(--text-faint);padding:18px 4px;font-size:var(--font-ui-small)}
.texere-bib textarea{width:100%;min-height:220px;font-family:var(--font-monospace);font-size:12px}`;
    document.head.appendChild(s); this.host.register(() => s.remove());
  }
}

// sub un folder al surselor care a dispărut: ce s-a întâmplat și ce poți face
function sourceFolderAlert(el, S, T, cur, moved, use, key) {
  const to = moved && moved.from === cur && S.app.vault.getAbstractFileByPath(moved.to) ? moved.to : null;
  const box = el.createDiv("ts-falert"), what = key === "pdfs" ? T("folderul PDF-urilor", "the PDF folder") : key === "inbox" ? T("Inbox-ul", "the Inbox") : T("folderul notelor de literatură", "the literature notes folder");
  box.createDiv({ cls: "ts-falert-t", text: key === "pdfs" ? T("PDF-urile surselor noi nu se pot salva", "New sources' PDFs can't be saved") : key === "inbox" ? T("PDF-urile fără sursă nu au unde să ajungă", "PDFs without a source have nowhere to go") : T("Sursele noi nu se pot salva", "New sources can't be saved") });
  box.createDiv({ cls: "ts-falert-d", text: to ? T(`Ai redenumit ${what}: „${cur}” e acum „${to}”. Folosește numele nou, pune-i înapoi numele vechi sau alege alt folder din lista de deasupra.`, `You renamed ${what}: “${cur}” is now “${to}”. Use the new name, put the old name back, or pick another folder from the list above.`)
    : T(`${what.charAt(0).toUpperCase() + what.slice(1)}, „${cur}”, nu mai e în vault (l-ai redenumit, mutat sau șters). Creează-l din nou sau alege alt folder din lista de deasupra.`, `${what.charAt(0).toUpperCase() + what.slice(1)}, “${cur}”, isn't in your vault anymore (renamed, moved or deleted). Create it again, or pick another folder from the list above.`) });
  const bt = box.createDiv("ts-falert-b");
  if (to) {
    bt.createEl("button", { cls: "mod-cta", text: T(`Folosește „${to}”`, `Use “${to}”`) }).addEventListener("click", () => use(to));
    bt.createEl("button", { text: T(`Pune-i înapoi numele „${cur}”`, `Put back the name “${cur}”`) }).addEventListener("click", async () => {
      try { const f = S.app.vault.getAbstractFileByPath(to), parent = cur.includes("/") ? cur.slice(0, cur.lastIndexOf("/")) : ""; if (parent) await S.ensureFolder(parent); await S.app.fileManager.renameFile(f, cur); await use(cur); }
      catch (e) { new Notice(T("N-am putut redenumi folderul: ", "Couldn't rename the folder: ") + e.message, 8000); }
    });
  } else bt.createEl("button", { cls: "mod-cta", text: T(`Creează din nou „${cur}”`, `Create “${cur}” again`) }).addEventListener("click", async () => { await S.ensureFolder(cur); await use(cur); });
  return box;
}
// „Unde salvez sursa?”: folderul notelor sau al PDF-urilor a dispărut; pentru fiecare: folosește numele nou, pune-l la loc, creează-l din nou sau alege altul
class SourceFoldersModal extends Modal {
  constructor(S, gone, done) { super(S.app); this.S = S; this.gone = gone; this.done = done; this.ok = false; }
  onOpen() {
    const S = this.S, T = (a, b) => S.T(a, b), el = this.contentEl, moved = S.conf().folderMoved || {}, folders = S.vaultFolders();
    this.modalEl.addClass("ts-folder-ask"); this.titleEl.setText(T("Unde salvez sursa?", "Where should I save the source?"));
    const names = { notes: T("Notele de literatură", "Literature notes"), pdfs: T("PDF-urile", "PDFs") }, pick = {};
    for (const [k, cur] of Object.entries(this.gone)) {
      new Setting(el).setName(names[k]).setHeading();
      sourceFolderAlert(el, S, T, cur, moved[k], async to => { await S.setFolderRoot(k, to); delete this.gone[k]; if (!Object.keys(this.gone).length) { this.ok = true; this.close(); } else { this.contentEl.empty(); this.onOpen(); } }, k);
      const ren = moved[k] && moved[k].from === cur && S.app.vault.getAbstractFileByPath(moved[k].to) ? moved[k].to : null;
      pick[k] = ren || folders.find(f => f.split("/").pop().toLowerCase() === cur.split("/").pop().toLowerCase()) || folders[0];
      new Setting(el).setName(T("Alt folder din vault", "Another folder in your vault")).addDropdown(d => { for (const f of folders) d.addOption(f, f); d.setValue(pick[k]).onChange(v => { pick[k] = v; }); d.selectEl.style.minWidth = "200px"; d.selectEl.style.maxWidth = "300px"; });
    }
    const bc = el.createDiv("modal-button-container");
    bc.createEl("button", { text: T("Renunț", "Cancel") }).addEventListener("click", () => this.close());
    bc.createEl("button", { cls: "mod-cta", text: T("Salvează acolo", "Save there") }).addEventListener("click", async () => { for (const k of Object.keys(this.gone)) await S.setFolderRoot(k, pick[k]); this.ok = true; this.close(); });
  }
  onClose() { this.contentEl.empty(); const d = this.done; this.done = null; d?.(this.ok); }
}

class SearchModal extends Modal {
  constructor(src, q, opts = {}) {
    super(src.app); this.src = src; this.q0 = q || ""; this.pdf = opts.pdf || null; this.auto = opts.auto || null;
    // „after” se cheamă o singură dată: cu nota creată sau găsită, ori cu null dacă închizi fereastra fără să adaugi
    if (opts.after) { let called = false; this.after = n => { if (called) return; called = true; try { opts.after(n); } catch (e) { console.error(e); } }; } this.items = []; this.sel = -1; this.status = {}; this.lib = src.library();
    this.f = { type: "all", from: "", to: "", sort: "relevance", providers: new Set(src.enabled().filter(p => p.id !== "zotero").map(p => p.id)) }; this.cards = [];   // Zotero are fila lui
  }
  onOpen() {
    const S = this.src, T = (a, b) => S.T(a, b);
    this.modalEl.addClass("texere-src"); this.titleEl.empty();
    // titlul + filele: Caută · Lipește · Introdu manual — de la cel mai automat la cel mai manual (aceeași fereastră, aceeași mărime)
    this.titleEl.createSpan({ cls: "ts-head-t", text: this.pdf ? T("Adaugă un PDF ca sursă", "Add a PDF as a source") : T("Adaugă o sursă", "Add a source") });
    const sw = this.titleEl.createDiv("ts-modes"); this.modeBtns = {};
    const mod = /Mac|iPhone|iPad/.test(navigator.platform || "") ? "⌘" : "Ctrl+";
    [["search", T("Caută", "Search"), T("Caută în cataloage după titlu, autor sau un identificator (DOI, ISBN, link…)", "Search catalogs by title, author or an identifier (DOI, ISBN, link…)")],
     ...(S.zotero && S.ZoteroPane && !this.pdf ? [["zotero", "Zotero", T("Biblioteca ta din Zotero: colecțiile tale, cu PDF-urile și evidențierile", "Your Zotero library: your collections, with their PDFs and highlights")]] : []),
     ["bibtex", T("Lipește", "Paste"), T("Ai deja referința: o citare, BibTeX, RIS, un DOI sau un link. Una sau mai multe deodată.", "You already have the reference: a citation, BibTeX, RIS, a DOI or a link. One or several at once.")],
     ["manual", T("Introdu manual", "Enter manually"), T("Sursa nu e în niciun catalog: completezi tu datele.", "The source isn't in any catalog: you fill in the details.")]].forEach(([m, label, tip], i) => {
      const b = sw.createSpan({ cls: "ts-mode", text: label }); b.title = `${tip}  (${mod}${i + 1})`;
      this.modeBtns[m] = b; b.addEventListener("click", () => this.setMode(m));
      try { this.scope?.register(["Mod"], String(i + 1), e => { e.preventDefault?.(); this.setMode(m); return false; }); } catch (e) {}
    });
    this.panes = { search: this.contentEl.createDiv("ts-pane"), bibtex: this.contentEl.createDiv("ts-pane"), manual: this.contentEl.createDiv("ts-pane") };
    if (this.modeBtns.zotero) this.panes.zotero = this.contentEl.createDiv("ts-pane");
    const c = this.panes.search;
    const qb = c.createDiv("ts-q"); try { setIcon(qb.createSpan(), "search"); } catch (e) {}
    const clr = qb.createEl("button", { cls: "ts-clear" }); try { setIcon(clr, "x"); } catch (e) { clr.textContent = "✕"; }
    clr.title = T("Golește căutarea", "Clear the search"); clr.style.display = "none";
    const inp = this.inp = qb.createEl("input", { type: "text", placeholder: T("Titlu, autor sau un identificator: DOI, ISBN, arXiv, link, PMID, PMCID…", "Title, author or an identifier: DOI, ISBN, arXiv, link, PMID, PMCID…") }); inp.value = this.q0;
    // un singur rând discret: tipul (file) în stânga; anii, ordinea și sursele în dreapta
    const fl = c.createDiv("ts-filters");
    const tabs = fl.createDiv("ts-tabs");
    for (const [v, a, b] of [["all", "Toate", "All"], ["article", "Articole", "Articles"], ["book", "Cărți", "Books"], ["chapter", "Capitole", "Chapters"]]) {
      const tb = tabs.createSpan({ cls: "ts-tab" + (v === "all" ? " on" : ""), text: T(a, b) });
      tb.addEventListener("click", () => { this.f.type = v; tabs.querySelectorAll(".ts-tab").forEach(e => e.toggleClass("on", e === tb)); this.run(); });
    }
    fl.createDiv("ts-spacer");
    const yr = fl.createEl("input", { cls: "ts-years", type: "text", placeholder: T("Ani, ex. 2015–2024", "Years, e.g. 2015–2024") });
    yr.title = T("Un an (2020), un interval (2015–2024), sau doar început (2015–) / sfârșit (–2010)", "One year (2020), a range (2015–2024), or only a start (2015–) / end (–2010)");
    yr.addEventListener("change", () => {
      const m = /^\s*(\d{4})?\s*([-–—]\s*(\d{4})?)?\s*$/.exec(yr.value);
      if (!m) { yr.addClass("bad"); return; } yr.removeClass("bad");
      this.f.from = m[1] || ""; this.f.to = m[2] ? (m[3] || "") : (m[1] || ""); this.run();
    });
    const so = fl.createEl("select", { cls: "ts-sel" });
    for (const [v, a, b] of [["relevance", "Relevante", "Relevant"], ["impact", "Cele mai influente", "Most influential"], ["cited", "Cele mai citate", "Most cited"], ["newest", "Cele mai noi", "Newest"]]) so.createEl("option", { value: v, text: T(a, b) });
    so.title = T("Relevante: cât de bine se potrivesc cu ce ai scris, apoi impactul.\nCele mai influente: citări față de media domeniului (FWCI), top 1% / 10%, citări pe an și ce spun citările (scite).\nCele mai citate: numărul total de citări.\nCele mai noi: anul.",
      "Relevant: how well they match what you typed, then impact.\nMost influential: citations compared with the field's average (FWCI), top 1% / 10%, citations per year and what citations say (scite).\nMost cited: total citations.\nNewest: year.");
    this.sortEl = so;
    so.addEventListener("change", () => { this.f.sort = so.value; this.sortChosen = true; this.resort(); });
    const sb = this.srcBtn = fl.createEl("button", { cls: "ts-srcbtn" });
    sb.addEventListener("click", e => { e.stopPropagation(); if (this.srcMenu) this.closeSrcMenu(); else this.openSrcMenu(sb); });
    this.statusEl = c.createDiv("ts-status");
    this.list = c.createDiv("ts-list");
    // celelalte moduri de a adăuga o sursă: la început, ca alternative vizibile; după căutare, în subsol („Nu găsești?”)
    this.openBibtex = () => this.setMode("bibtex");
    this.openManual = () => this.setMode("manual");
    this.openOther = e => {
      const { Menu } = require("obsidian"), m = new Menu(), q = encodeURIComponent(inp.value.trim());
      m.addItem(i => i.setTitle("Google Scholar").setIcon("external-link").onClick(() => window.open("https://scholar.google.com/scholar?q=" + q)));
      for (const [name, url] of [["Biblioteca Națională a României", `https://aleph.bibnat.ro/F?func=find-b&request=${q}`], ["Biblioteca Seminarului Teologic București", "https://www.catalog.bibseminarbuc.ro/"],
        ["WorldCat", `https://search.worldcat.org/search?q=${q}`], ["Google Books", `https://www.google.com/search?tbm=bks&q=${q}`]])
        m.addItem(i => i.setTitle(name).setIcon("external-link").onClick(() => window.open(url)));
      m.showAtMouseEvent(e);
    };
    // subsolul e același pe toate ecranele: stânga = acțiuni secundare, dreapta = acțiunea principală (setFoot)
    const ft = this.foot = this.contentEl.createDiv("ts-foot");
    this.footL = ft.createDiv("ts-foot-l"); this.footR = ft.createDiv("ts-foot-r");
    let t = null;
    const syncClr = () => { clr.style.display = inp.value ? "" : "none"; };
    clr.addEventListener("click", () => { inp.value = ""; syncClr(); clearTimeout(t); this.reqId = (this.reqId || 0) + 1; this.merged = []; this.run(); inp.focus(); });
    inp.addEventListener("input", () => { syncClr(); clearTimeout(t); t = setTimeout(() => this.run(), 650); });
    inp.addEventListener("paste", e => {
      const txt = e.clipboardData?.getData("text/plain") || "";
      if (looksLikeRef(txt)) { e.preventDefault(); clearTimeout(t); this.toPaste(txt); return; }
      if (/\n/.test(txt)) { e.preventDefault(); inp.setRangeText(txt.replace(/\s*\n\s*/g, " ").trim(), inp.selectionStart ?? inp.value.length, inp.selectionEnd ?? inp.value.length, "end"); inp.dispatchEvent(new window.Event("input")); }
    });
    this.toPaste = txt => {
      this.setMode("bibtex");
      this.bib?.fill(txt, T("Ce ai lipit arată ca o referință întreagă, așa că e aici: Texere o caută după DOI, ISBN sau după text, apoi o verifici.", "What you pasted looks like a full reference, so it's here: Texere looks it up by DOI, ISBN or its text, then you check it."));
      this.setFoot("bibtex");
    };
    syncClr();
    inp.addEventListener("keydown", e => {
      if (e.key === "ArrowDown") { e.preventDefault(); this.move(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); this.move(-1); }
      else if (e.key === "Enter") { e.preventDefault(); clearTimeout(t); const x = this.items[this.sel];
        const same = this.lastQ === inp.value.trim();
        if (x && same) { if (e.metaKey || e.ctrlKey) { this.close(); this.src.add(x, this.extra()); } else this.pick(x); }
        else if (same && this.items.length) this.move(1);   // nimic ales încă: Enter alege primul rezultat
        else this.run(); }
    });
    this.render();
    this.setMode(this.mode0 || "search");
    // catalogare: o bandă discretă sus, ca să știi ce PDF se atașează
    if (this.pdf) { const b = document.createElement("div"); b.className = "ts-catalog"; b.createSpan({ cls: "ts-catalog-f", text: this.pdf.name });
      b.appendText(T(" · alege sursa potrivită; PDF-ul se atașează notei și se mută în Documents.", " · choose the matching source; the PDF is attached to its note and moved to Documents.")); this.contentEl.prepend(b); }
    if (this.q0) this.run();
  }
  // comută între căutare, adăugare manuală și BibTeX fără să închidă fereastra
  setMode(m) {
    this.mode = m;
    for (const [k, el] of Object.entries(this.panes)) el.style.display = k === m ? "" : "none";
    for (const [k, b] of Object.entries(this.modeBtns)) b.toggleClass("on", k === m);
    if (m === "search") this.modalEl.toggleClass("is-loading", Object.values(this.status || {}).includes("busy"));
    const p = this.panes[m];
    if (m === "zotero" && !p.childElementCount) {
      const S = this.src;
      this.zpane = new S.ZoteroPane(S.zotero, { close: () => this.close(), refreshFoot: () => { if (this.mode === "zotero") this.setFoot("zotero"); }, settings: () => { this.close(); this.app.setting.open(); this.app.setting.openTabById(S.host.manifest.id); } });
      this.zpane.build(p);
    } else if (m !== "search" && m !== "zotero" && !p.childElementCount) {
      const done = () => this.close();
      if (m === "manual") this.manualSubmit = new ManualModal(this.src, this.inp.value.trim(), { noBar: true, extra: this.extra() }).build(p, done);
      else this.bib = new BibtexModal(this.src, { noBar: true, onCount: () => this.setFoot("bibtex"), onOne: (x, csl) => this.review(x, csl) }).build(p, done);
    }
    this.setFoot(m);
    if (m === "zotero") { setTimeout(() => this.zpane?.inp?.focus(), 30); return; }
    setTimeout(() => (m === "search" ? this.inp : m === "manual" ? p.querySelector('input[type="text"], input:not([type]), textarea') : p.querySelector("textarea, input, select"))?.focus(), 30);
  }
  // „Surse ▾”: lista cataloagelor rămâne deschisă cât timp bifezi (rezultatele se reîncarcă în spate); se închide la clic în afară, Esc sau din nou pe buton
  openSrcMenu(anchor) {
    const S = this.src, T = (a, b) => S.T(a, b);
    const menu = this.srcMenu = document.body.createDiv("texere-src-menu"), r = anchor.getBoundingClientRect();
    menu.style.top = Math.round(r.bottom + 4) + "px"; menu.style.right = Math.max(8, Math.round(window.innerWidth - r.right)) + "px";
    const rows = [];
    for (const p of S.enabled().filter(p => p.id !== "zotero")) {
      const it = menu.createDiv("ts-sm-item"), ck = it.createSpan("ts-sm-ck"), _name = it.createSpan({ cls: "ts-sm-name", text: p.name }), nt = it.createSpan("ts-sm-note");
      it.addEventListener("mousedown", e => e.preventDefault());
      it.addEventListener("click", e => { e.stopPropagation(); if (this.f.providers.has(p.id)) { if (this.f.providers.size > 1) this.f.providers.delete(p.id); } else this.f.providers.add(p.id); this.updateSrcMenu(); clearTimeout(this._srcT); this._srcT = setTimeout(() => this.run(), 350); });
      rows.push({ p, it, ck, nt });
    }
    menu.createDiv("ts-sm-sep");
    const more = menu.createDiv({ cls: "ts-sm-item ts-sm-more", text: T("Alte surse și chei…", "More sources and keys…") });
    more.addEventListener("click", () => { this.closeSrcMenu(); this.close(); this.app.setting.open(); this.app.setting.openTabById(S.host.manifest.id); });
    this._srcRows = rows; this.updateSrcMenu();
    this._srcOut = e => { if (!menu.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) this.closeSrcMenu(); };
    this._srcKey = e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); this.closeSrcMenu(); } };
    setTimeout(() => { document.addEventListener("mousedown", this._srcOut, true); window.addEventListener("keydown", this._srcKey, true); }, 0);
  }
  updateSrcMenu() {
    if (!this.srcMenu) return; const S = this.src, T = (a, b) => S.T(a, b);
    for (const { p, it, ck, nt } of this._srcRows || []) {
      const on = this.f.providers.has(p.id), st = this.status[p.id], n = this.items.filter(x => x.sources.includes(p.id)).length, why = S.errors?.[p.id] ? ` (${S.errors[p.id]})` : "";
      it.toggleClass("on", on); ck.setText(on ? "✓" : "");
      nt.setText(!on ? "" : st === "ok" ? `· ${n}` : st === "busy" ? "· …" : st === "limit" ? `· ${S.usageInfo(p.id)?.text || T("limită atinsă", "limit reached")}` : st ? T("· nu răspunde", "· not responding") + why : "");
    }
  }
  closeSrcMenu() {
    if (!this.srcMenu) return; this.srcMenu.remove(); this.srcMenu = null;
    document.removeEventListener("mousedown", this._srcOut, true); window.removeEventListener("keydown", this._srcKey, true);
  }
  // subsolul pentru fiecare ecran
  setFoot(m) {
    const S = this.src, T = (a, b) => S.T(a, b), L = this.footL, Rr = this.footR; if (!L) return;
    L.empty(); Rr.empty();
    const link = (txt, fn, tip) => { const a = L.createEl("a", { text: txt }); if (tip) a.title = tip; a.addEventListener("click", fn); return a; };
    const btn = (txt, fn) => { const b = Rr.createEl("button", { cls: "mod-cta", text: txt }); b.addEventListener("click", fn); return b; };
    const note = txt => L.createSpan({ cls: "ts-foot-q", text: txt });
    if (m === "search") {
      if ((this.inp?.value.trim() || "").length >= 3) {
        note(T("Nu găsești?", "Can't find it?"));
        link(T("Lipește referința", "Paste the reference"), () => this.setMode("bibtex"), T("O citare, BibTeX sau RIS (de ex. din Google Scholar)", "A citation, BibTeX or RIS (e.g. from Google Scholar)"));
        link(T("Introdu manual", "Enter manually"), () => this.setMode("manual"));
        link(T("Alte cataloage ↗", "Other catalogs ↗"), e => this.openOther(e));
      }
      Rr.createSpan({ cls: "ts-keys", text: T("↑↓ alegi · Enter vezi datele · ⌘/Ctrl+Enter adaugi direct", "↑↓ choose · Enter review · ⌘/Ctrl+Enter add directly") });
    } else if (m === "manual") {
      note(T("Doar titlul e obligatoriu.", "Only the title is required."));
      btn(T("Adaugă în vault", "Add to vault"), () => this.manualSubmit?.());
    } else if (m === "bibtex") {
      if (this.bib?.state?.() === "list") {
        link(T("← Editează textul", "← Edit the text"), () => this.bib.back());
        const k = this.bib.checked(), b = btn(this.bib.pending() ? T("Caut…", "Looking up…") : (k === 1 ? T("Adaugă 1 sursă", "Add 1 source") : T(`Adaugă ${k} surse`, `Add ${k} sources`)), () => this.bib?.submit()); b.disabled = this.bib.pending() || !k;
      } else {
        const n = this.bib?.count() || 0;
        note(!n ? T("Lipește una sau mai multe referințe.", "Paste one or more references.") : n > 1 ? T(`${n} referințe: le caut pe toate, apoi alegi ce adaugi.`, `${n} references: I'll look them all up, then you choose what to add.`) : T("O referință: o verifici înainte s-o adaugi.", "One reference: you check it before adding it."));
        btn(n > 1 ? T(`Caută ${n} surse`, `Look up ${n} sources`) : T("Continuă", "Continue"), () => this.bib?.submit());
      }
    } else if (m === "zotero") {
      this.zpane?.foot(L, Rr);
    } else if (m === "review") {
      link(T("← Înapoi", "← Back"), () => this.setMode(this.reviewFrom || "search"));
      btn(T("Adaugă în vault", "Add to vault"), () => this.reviewSubmit?.());
    }
  }
  // citările care susțin / contrazic (scite) pentru primele 15 rezultate cu DOI, câte 4 deodată
  async loadScite(id) {
    const todo = this.items.slice(0, 15).filter(x => x.doi && x.scite === undefined);
    let t = null; const redraw = () => { clearTimeout(t); t = setTimeout(() => { if (id !== this.reqId) return; if (this.f.sort === "impact") this.items = this.src.rank(this.merged?.length ? this.merged : this.items, this.lastQ, this.f); this.render(); }, 150); };
    const run = async () => { while (todo.length && id === this.reqId) { const x = todo.shift(); try { x.scite = await this.src.scite(x.doi); } catch (e) { x.scite = null; } redraw(); } };
    await Promise.all([run(), run(), run(), run()]);
  }
  move(d) { if (!this.items.length) return; this.sel = this.sel < 0 ? (d > 0 ? 0 : this.items.length - 1) : (this.sel + d + this.items.length) % this.items.length; this.render(); this.list.querySelectorAll(".ts-item")[this.sel]?.scrollIntoView({ block: "nearest" }); }
  run() {
    const q = this.inp.value.trim(); this.lastQ = q;
    if (q.length < 3) { this.items = []; this.status = {}; this.loading = false; this.render(); return; }
    const id = (this.reqId = (this.reqId || 0) + 1), t0 = Date.now();
    this.loading = true; this.items = []; this.cards = []; this.sel = -1; this.render();
    let shown = false, pend = null;
    this.src.search(q, this.f, (items, status, cards, merged) => {
      if (id !== this.reqId) return;
      this.status = status; this.merged = merged || []; const busy = Object.values(status).includes("busy");
      const show = () => {
        if (id !== this.reqId) return; shown = true; this.cards = cards || [];
        // un autor căutat: lista pornește de la lucrările lui cele mai influente (dacă n-ai ales tu altă ordine)
        if (!this.sortChosen) { const want = this.cards.length ? "impact" : "relevance"; if (this.f.sort !== want) { this.f.sort = want; if (this.sortEl) this.sortEl.value = want; } }
        this.items = this.merged.length ? this.src.rank(this.merged, q, this.f) : items; this.loading = busy; if (this.sel >= this.items.length) this.sel = -1; this.render();
        if (!busy && this.auto && this.mode === "search") {   // catalogare după DOI/ISBN: sursa găsită se deschide direct în verificare
          const a = this.auto; this.auto = null;
          const hit = this.items.find(x => (a.doi && cleanDoi(x.doi)?.toLowerCase() === a.doi.toLowerCase()) || (a.isbn && isbn13(x.isbn) === a.isbn)) || (this.items.length === 1 ? this.items[0] : null);
          if (hit) this.pick(hit);
        }
        if (!busy) this.loadScite(id);
      };
      clearTimeout(pend);
      if (!busy || shown) show();
      else { if (Object.values(status).some(s => s !== "busy")) pend = setTimeout(show, Math.max(0, 3000 - (Date.now() - t0))); this.render(); }
    });
  }
  // altă ordine = aceleași rezultate, reordonate pe loc (fără să caute din nou)
  resort() { if (!this.merged?.length) return this.run(); this.items = this.src.rank(this.merged, this.lastQ, this.f); this.sel = -1; this.render(); }
  render() {
    const S = this.src, T = (a, b) => S.T(a, b);
    const busy = Object.values(this.status).includes("busy"), q = this.inp?.value.trim() || "";
    const on = S.enabled().filter(p => this.f.providers.has(p.id)), bad = on.filter(p => this.status[p.id] === "err" || this.status[p.id] === "limit");
    if (this.srcBtn) { this.srcBtn.setText(T(`Surse: ${on.length}`, `Sources: ${on.length}`) + (bad.length ? " ⚠" : "") + " ▾");
      this.srcBtn.title = on.map(p => p.name).join(", "); }
    const waiting = on.filter(p => this.status[p.id] === "busy").map(p => p.name);
    let line = q.length < 3 ? "" : busy ? T(`Caut în ${waiting.join(", ")}…`, `Searching ${waiting.join(", ")}…`) + (this.items.length ? T(` · ${this.items.length} rezultate până acum`, ` · ${this.items.length} results so far`) : "") : T(`${this.items.length} rezultate`, `${this.items.length} results`);
    if (!busy && q.length >= 3 && this.cards.length && this.f.sort === "impact" && !this.sortChosen) line += T(" · ordonate după influență, pentru că ai căutat un autor", " · ordered by influence, since you searched an author");
    this.modalEl.toggleClass("is-loading", busy && q.length >= 3);
    const lim = bad.filter(p => this.status[p.id] === "limit"), err = bad.filter(p => this.status[p.id] !== "limit");
    if (err.length && q.length >= 3) line += T(` · ${err.map(p => p.name).join(", ")} nu răspunde acum`, ` · ${err.map(p => p.name).join(", ")} not responding right now`);
    if (lim.length && q.length >= 3) line += " · " + lim.map(p => `${p.name}: ${S.usageInfo(p.id)?.text || T("limită atinsă", "limit reached")}`).join(" · ");
    this.statusEl.setText(line); this.updateSrcMenu?.();
    this.list.empty();
    if (this.mode === "search") this.setFoot("search");
    if (q.length < 3) {
      const st = this.list.createDiv("ts-start");
      // ce scrii în câmp e explicat de câmp; aici doar ce se întâmplă când lipești o referință întreagă
      st.createDiv({ cls: "ts-start-alt", text: T("Ai o citare întreagă sau BibTeX? Lipește-o în câmpul de sus: trece singură în „Lipește”, unde Texere o caută și o verifici înainte s-o adaugi.",
        "Have a full citation or BibTeX? Paste it into the box above: it moves to “Paste” by itself, where Texere looks it up and you check it before adding it.") });
      return;
    }
    if (/scholar\.google\.[a-z.]+\/citations/i.test(q) && !S.conf().serpapiKey) { this.list.createDiv({ cls: "ts-empty", text: T("Pentru profilurile Google Scholar e nevoie de o cheie SerpApi (Settings → Texere). Până atunci, caută numele autorului: Texere caută în OpenAlex, Crossref și ORCID.", "Google Scholar profiles need a SerpApi key (Settings → Texere). Until then, search the author's name: Texere looks in OpenAlex, Crossref and ORCID.") }); return; }
    if (!this.items.length && busy && q.length >= 3) {
      for (let i = 0; i < 4; i++) { const sk = this.list.createDiv("ts-item ts-skel"); sk.createDiv("sk sk-t"); sk.createDiv("sk sk-m"); sk.createDiv("sk sk-b"); }
      return;
    }
    if (!this.items.length && q.length >= 3 && !busy) {
      const em = this.list.createDiv({ cls: "ts-empty", text: T("Nimic găsit. Încearcă alte cuvinte, un DOI sau ISBN. Multe cărți de la edituri mici nu sunt în niciun catalog public: ", "Nothing found. Try other words, a DOI or ISBN. Many books from small publishers aren't in any public catalog: ") });
      const a1 = em.createEl("a", { text: T("lipește referința", "paste the reference") }); a1.style.cursor = "pointer"; a1.addEventListener("click", () => this.setMode("bibtex"));
      em.appendChild(document.createTextNode(T(" sau ", " or ")));
      const a = em.createEl("a", { text: T("introdu-o manual", "enter it manually") }); a.style.cursor = "pointer";
      a.addEventListener("click", () => this.setMode("manual")); em.appendChild(document.createTextNode("."));
      return;
    }
    const kindLabel = { article: T("Articol", "Article"), book: T("Carte", "Book"), chapter: T("Capitol", "Chapter") };
    const toks = normTitle(q).split(" ").filter(w => w.length > 1);
    // cuvintele căutate apar îngroșate în titlu și la autori
    const hl = (el, text) => { for (const part of String(text).split(/(\s+)/)) { const w = normTitle(part); if (w && toks.some(t => w === t || (t.length > 3 && w.startsWith(t)))) el.createSpan({ cls: "ts-hl", text: part }); else el.appendChild(document.createTextNode(part)); } };
    const nf = n => Number(n).toLocaleString(S.en ? "en-US" : "ro-RO");
    for (const c of this.cards) {
      const card = this.list.createDiv("ts-card");
      const top = card.createDiv("ts-card-name"); top.createSpan({ text: c.name });
      if (c.inst) top.createSpan({ cls: "ts-card-inst", text: " · " + c.inst });
      const st = card.createDiv("ts-badges");
      st.createSpan({ cls: "ts-b", text: T(`${nf(c.works)} lucrări`, `${nf(c.works)} works`) });
      st.createSpan({ cls: "ts-b", text: T(`${nf(c.cited)} citări`, `${nf(c.cited)} citations`) });
      if (c.h) { const h = st.createSpan({ cls: "ts-b", text: "h-index " + c.h }); h.title = T("h lucrări citate de cel puțin h ori fiecare", "h works cited at least h times each"); }
      if (c.profiles > 1) st.createSpan({ cls: "ts-b", text: T(`${c.profiles} profiluri OpenAlex unite`, `${c.profiles} OpenAlex profiles joined`) });
      const lk = (txt, url) => { const a = st.createEl("a", { cls: "ts-b ts-link", text: txt + " ↗" }); a.addEventListener("click", e => { e.stopPropagation(); window.open(url); }); };
      if (c.orcid) lk("ORCID", c.orcid); if (c.url) lk("OpenAlex", c.url);
      card.title = T("Lucrările lui sunt mai jos; pentru o ordine anume, alege „Cele mai citate” sau „Cele mai noi”.", "Their works are below; for a specific order choose “Most cited” or “Newest”.");
    }
    const names = Object.fromEntries(S.providers.map(p => [p.id, p.name]));
    this.items.forEach((x, i) => {
      const row = this.list.createDiv("ts-item" + (i === this.sel ? " sel" : ""));
      const tl = row.createDiv("ts-title"); hl(tl, stripTags(x.title));
      const go = x.doi ? `https://doi.org/${x.doi}` : x.url;
      if (go) { const a = tl.createEl("a", { cls: "ts-open", text: " ↗" }); a.title = T("Deschide pagina sursei, fără s-o adaugi", "Open the source's page without adding it"); a.addEventListener("click", e => { e.stopPropagation(); window.open(go); }); }
      // autorii: primii trei, iar dacă autorul căutat e mai departe în listă, apare și el, cu locul lui (ex. „Mihailov (6/9)”)
      const ppl = (x.authors || []).map(a => a.literal || a.family).filter(Boolean), full = (x.authors || []).map(a => [a.given, a.family, a.literal].filter(Boolean).join(" "));
      const who = toks.length > 1 ? full.findIndex(n => toks.every(t => normTitle(n).split(" ").some(w => w === t || w.startsWith(t)))) : -1;
      let byline = ppl.slice(0, 3).join(", ");
      if (ppl.length > 3) byline += who >= 3 ? ` … ${ppl[who]} (${who + 1}/${ppl.length})` : " et al.";
      const meta = row.createDiv("ts-meta");
      if (byline) hl(meta, byline);
      const rest = [x.year, x.venue || x.publisher].filter(Boolean).join(" · ");
      if (rest) meta.appendChild(document.createTextNode((byline ? " · " : "") + rest));
      if (x.abstract) row.createDiv({ cls: "ts-abs", text: stripTags(x.abstract).replace(/^(abstract|rezumat|résumé|zusammenfassung)[\s.:]+/i, "") });
      const b = row.createDiv("ts-badges");
      const have = this.lib.find(x);
      b.createSpan({ cls: "ts-b kind", text: kindLabel[S.kind(x.type)] });
      if (have) b.createSpan({ cls: "ts-b have", text: T("✓ deja în vault", "✓ already in your vault") });
      if (x.retracted) { const r = b.createSpan({ cls: "ts-b retracted", text: T("Retrasă", "Retracted") }); r.title = T("Lucrarea a fost retrasă de editor", "The publisher retracted this work"); }
      if (x.cited != null) b.createSpan({ cls: "ts-b", text: T(`${x.cited.toLocaleString("ro-RO")} citări`, `${x.cited.toLocaleString("en-US")} citations`) });
      if (x.scite && (x.scite.s || x.scite.c)) {
        const sc = b.createSpan({ cls: "ts-b" }); sc.title = T("Citări care susțin / contrazic / menționează (scite)", "Citations that support / contrast / mention it (scite)");
        for (const [n, col, a, e] of [[x.scite.s, "#00A896", "susțin", "supporting"], [x.scite.c, "#F45B5B", "contrazic", "contrasting"]]) {
          const d = sc.createSpan({ cls: "ts-dot" }); d.style.background = col; sc.appendText ? sc.appendText(` ${n} ${T(a, e)}  `) : sc.appendChild(document.createTextNode(` ${n} ${T(a, e)}  `)); }
      }
      if (x.top1 || x.top10) { const tp = b.createSpan({ cls: "ts-b top", text: x.top1 ? "Top 1%" : "Top 10%" }); tp.title = T("Printre cele mai citate lucrări din domeniu și an (OpenAlex)", "Among the most cited works of its field and year (OpenAlex)"); }
      if (x.fwci != null && x.fwci > 0) { const fw = b.createSpan({ cls: "ts-b", text: "FWCI " + x.fwci.toFixed(1) }); fw.title = T("1 = media domeniului; 2 = de două ori mai citată decât media", "1 = field average; 2 = cited twice as much as the average"); }
      if (x.oa) b.createSpan({ cls: "ts-b oa", text: x.pdf?.length ? T("Acces deschis · PDF", "Open access · PDF") : T("Acces deschis", "Open access") });
      if (x.lang && !/^en/i.test(x.lang)) b.createSpan({ cls: "ts-b lang", text: String(x.lang).slice(0, 2).toUpperCase() });
      if (x.doi) b.createSpan({ cls: "ts-b", text: "DOI" });
      else if (x.isbn) b.createSpan({ cls: "ts-b", text: "ISBN " + x.isbn });
      b.createSpan({ cls: "ts-b", text: x.sources.map(s => names[s] || s).join(" · ") });
      row.title = have ? T("Enter: deschide nota", "Enter: open the note") : T("Enter: vezi toate datele și adaugă sursa", "Enter: see all the data and add the source");
      row.addEventListener("click", () => { this.sel = i; this.pick(x); });
    });
  }
  onClose() { this.closeSrcMenu?.(); this.zpane?.destroy?.(); if (this.after) setTimeout(() => { if (!this._submitted) this.after(null); }, 0); }
  extra() { return this.pdf ? { pdfFile: this.pdf, after: this.after, submitted: () => { this._submitted = true; } } : {}; }
  async pick(x) {
    const have = this.lib.find(x);
    if (have) { this._submitted = true; this.close(); if (this.pdf) await this.src.attachToNote(have, this.pdf); if (this.after) { this.after(have); return; } await this.app.workspace.getLeaf("tab").openFile(have); return; }
    this.review(x);
  }
  async review(x, cslGiven) {
    const S = this.src, T = (a, b) => S.T(a, b);
    this.reviewFrom = this.mode === "review" ? this.reviewFrom : this.mode || "search";
    const p = this.panes.review || (this.panes.review = this.contentEl.insertBefore(Object.assign(document.createElement("div"), { className: "ts-pane" }), this.foot));
    p.empty(); this.mode = "review"; this.reviewSubmit = null;
    for (const [k, el] of Object.entries(this.panes)) el.style.display = k === "review" ? "" : "none";
    for (const b of Object.values(this.modeBtns)) b.toggleClass("on", false);
    this.setFoot("review");
    const names = Object.fromEntries(S.providers.map(pr => [pr.id, pr.name]));
    const info = p.createDiv({ cls: "ts-hint", text: T("Încarc toate datele sursei…", "Loading all of the source's data…") });
    let csl = cslGiven;
    if (!csl) { this.modalEl.toggleClass("is-loading", true); try { csl = await S.fullCsl(x); } catch (e) { csl = null; } this.modalEl.toggleClass("is-loading", false); }
    if (this.mode !== "review") return;   // ai plecat între timp
    const found = x.sources?.length ? T(" Găsit în: ", " Found in: ") + x.sources.map(s => names[s] || s).join(" · ") + "." : "";
    info.setText(T("Verifică datele și corectează ce e nevoie.", "Check the data and fix anything that needs it.") + found
      + (S.conf().pdf && (x.doi || x.pdf?.length) ? T(" PDF-ul gratuit, dacă există, se descarcă automat.", " The free PDF, if there is one, is downloaded automatically.") : "") + (x.fixNote || ""));
    this.reviewSubmit = new ManualModal(S, "", { csl: csl || {}, noBar: true,
      onSubmit: async (c, custom) => { await S.add({ ...x, title: c.title, doi: cleanDoi(c.DOI) || x.doi, isbn: isbn13(c.ISBN) || x.isbn, sources: x.sources || [] }, { csl: c, custom, ...this.extra() }); } })
      .build(p, () => this.close());
  }
}

// rând de acțiuni fixat jos în panou (butonul rămâne vizibil oricât de lung e formularul)
function actions(c, label, fn) {
  const bar = c.createDiv("ts-actions"); const b = bar.createEl("button", { cls: "mod-cta", text: label }); b.addEventListener("click", fn); return bar;
}

class BibtexModal extends Modal {
  constructor(src, opts) { super(src.app); this.src = src; this.opts = opts || {}; }
  onOpen() { this.modalEl.addClass("texere-src"); this.titleEl.setText(this.src.T("Lipește o referință", "Paste a reference")); const p = this.contentEl.createDiv("ts-pane"); const api = this.build(p, () => this.close()); actions(p, this.src.T("Adaugă în vault", "Add to vault"), api.submit); }
  build(c, done) {
    const S = this.src, T = (a, b) => S.T(a, b);
    const hint = c.createDiv({ cls: "ts-hint", text: T("Lipește o referință în orice formă: o citare (APA, Chicago, Frontiers…), BibTeX, RIS, un DOI, un ISBN sau un link. Mai multe deodată: câte una pe paragraf (sau pe rând).",
      "Paste a reference in any form: a citation (APA, Chicago, Frontiers…), BibTeX, RIS, a DOI, an ISBN or a link. Several at once: one per paragraph (or per line).") });
    const ta = c.createEl("textarea", { attr: { placeholder: T("ex. Felber NA, Mihailov E and Wangmo T (2025) Virtual reality as a possible aged care technology… doi: 10.3389/frvir.2025.1502450\n\n@article{…}", "e.g. Felber NA, Mihailov E and Wangmo T (2025) Virtual reality as a possible aged care technology… doi: 10.3389/frvir.2025.1502450\n\n@article{…}") } });
    ta.addClass("ts-bib-ta");
    const list = c.createDiv("ts-paste-list"); list.style.display = "none";
    let state = "input", rows = [];
    const kind = () => pastedKind(ta.value), count = () => kind().refs.length;
    ta.addEventListener("input", () => this.opts.onCount?.());
    const toX = e => ({ title: e.csl.title, authors: e.csl.author, year: e.csl.issued?.["date-parts"]?.[0]?.[0], doi: cleanDoi(e.csl.DOI), isbn: isbn13(e.csl.ISBN), type: e.csl.type, sources: [] });
    const HOW = { doi: T("găsită după DOI", "found by DOI"), id: T("găsită după identificator", "found by identifier"), matched: T("găsită după text: verifică dacă e aceeași", "matched by text: check it's the same one"),
      bibtex: T("din BibTeX", "from BibTeX"), guess: T("negăsită în cataloage: am completat ce am putut citi", "not found in catalogs: I filled in what I could read") };
    // o intrare BibTeX/RIS → completăm din Crossref dacă se poate (ca până acum)
    const fromEntry = async e => {
      const x = toX(e); let csl = e.csl;
      if (e.fixed) {
        x.fixNote = T(" Unele litere lipseau din BibTeX (apăreau „?”); le-am refăcut (ș/ț) după regulile limbii: verifică titlul, autorii și editura.", " Some letters were missing in the BibTeX (shown as “?”); I filled them in (ș/ț) using Romanian spelling rules: check the title, authors and publisher.");
        try { const hit = await S.verifyCsl(csl); if (hit) { csl = { ...csl, title: hit.title || csl.title, ...(hit.isbn && !csl.ISBN ? { ISBN: hit.isbn } : {}), ...(hit.publisher ? { publisher: hit.publisher } : {}) }; x.title = csl.title; x.isbn = isbn13(csl.ISBN) || x.isbn;
          x.fixNote = T(` Unele litere lipseau din BibTeX; titlul l-am luat din ${hit.sourceName || "catalog"}, unde sursa apare corect.`, ` Some letters were missing in the BibTeX; I took the title from ${hit.sourceName || "a catalog"}, where the source is spelled correctly.`); } } catch (e2) {}
      }
      if (!x.doi && x.title) { try { x.doi = await S.findDoi(x); } catch (e2) {} }
      if (x.doi) { try { const full = await S.fullCsl({ ...x }); if (full?.title) csl = { ...csl, ...full }; } catch (e2) {} }
      return { x, csl, how: "bibtex" };
    };
    const resolveAll = async (k, onEach) => { const out = []; for (const [i, r] of k.refs.entries()) { const v = k.kind === "text" ? await S.resolveRef(r) : await fromEntry(r); out.push(v); onEach?.(i, v); } return out; };
    const showList = (k) => {
      state = "list"; hint.setText(T("Am căutat fiecare referință. Bifează ce adaugi; cele negăsite le poți deschide cu „Verifică”.", "I looked up each reference. Tick what to add; the ones not found you can open with “Check”."));
      ta.style.display = "none"; list.style.display = ""; list.empty(); rows = [];
      k.refs.forEach((r, i) => {
        const row = list.createEl("label", { cls: "ts-paste-row" }); row.addEventListener("mousedown", e => { if (e.target.tagName !== "A") e.preventDefault(); });
        const cb = row.createEl("input", { type: "checkbox" }); cb.disabled = true;
        const box = row.createDiv("ts-paste-main"); box.createDiv({ cls: "ts-paste-t", text: typeof r === "string" ? r.slice(0, 160) : (r.csl.title || "") }); const st = box.createDiv({ cls: "ts-paste-st", text: T("caut…", "looking it up…") });
        rows.push({ cb, box, st, v: null }); cb.addEventListener("change", () => this.opts.onCount?.());
      });
      this.opts.onCount?.();
      return (i, v) => {
        const r = rows[i]; r.v = v; r.cb.disabled = false; r.cb.checked = v.how !== "guess";
        const a = (v.csl.author || []).map(p => p.family || p.literal).filter(Boolean), yr = v.csl.issued?.["date-parts"]?.[0]?.[0];
        r.box.querySelector(".ts-paste-t").setText(v.csl.title || T("(fără titlu)", "(no title)"));
        r.st.empty(); r.st.appendText([a.length > 2 ? a[0] + " et al." : a.join(" & "), yr, v.csl["container-title"] || v.csl.publisher].filter(Boolean).join(" · ") + " — ");
        r.st.createSpan({ cls: "ts-paste-how " + v.how, text: HOW[v.how] });
        if (this.opts.onOne) { r.st.appendText(" · "); const ed = r.st.createEl("a", { text: T("Verifică", "Check") }); ed.addEventListener("click", e => { e.preventDefault(); this.opts.onOne(v.x, v.csl); }); }
        this.opts.onCount?.();
      };
    };
    const submit = async () => {
      if (state === "list") {   // adaugă ce e bifat
        const pick = rows.filter(r => r.v && r.cb.checked); if (!pick.length) return;
        done(); for (const r of pick) await S.add(r.v.x, { csl: r.v.csl });
        return;
      }
      const k = kind();
      if (!k.refs.length) { new Notice(T("Lipește cel puțin o referință.", "Paste at least one reference.")); return; }
      if (k.refs.length === 1 && this.opts.onOne) {   // una singură: direct în ecranul de verificare
        const wait = new Notice(T("Caut sursa…", "Looking up the source…"), 0);
        let v; try { v = (await resolveAll(k))[0]; } finally { wait.hide(); }
        if (v.how !== "bibtex") v.x.fixNote = " " + T("Referința a fost ", "The reference was ") + HOW[v.how] + ".";
        this.opts.onOne(v.x, v.csl); return;
      }
      const upd = showList(k); await resolveAll(k, upd);
    };
    const back = () => { state = "input"; ta.style.display = ""; list.style.display = "none"; hint.setText(T("Lipește o referință în orice formă: o citare (APA, Chicago, Frontiers…), BibTeX, RIS, un DOI, un ISBN sau un link. Mai multe deodată: câte una pe paragraf (sau pe rând).", "Paste a reference in any form: a citation (APA, Chicago, Frontiers…), BibTeX, RIS, a DOI, an ISBN or a link. Several at once: one per paragraph (or per line).")); this.opts.onCount?.(); setTimeout(() => ta.focus(), 30); };
    setTimeout(() => ta.focus(), 30);
    // textul lipit în Căutare ajunge aici, cu o explicație scurtă
    const fill = (txt, why) => { if (state === "list") back(); ta.value = String(txt).trim(); if (why) hint.setText(why); this.opts.onCount?.(); setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 30); };
    return { submit, count, back, fill, state: () => state, checked: () => rows.filter(r => r.v && r.cb.checked).length, pending: () => rows.some(r => !r.v) };
  }
}

// adăugare manuală: pentru cărți care nu sunt în niciun catalog public. Câmpurile depind de tip (carte, capitol, articol),
// iar cele mai rare stau sub „Mai multe detalii”.
class ManualModal extends Modal {
  constructor(src, q, opts) { super(src.app); this.src = src; this.q = q || ""; this.opts = opts || {}; }
  onOpen() { this.modalEl.addClass("texere-src"); this.titleEl.setText(this.src.T("Adaugă o sursă manual", "Add a source manually")); const p = this.contentEl.createDiv("ts-pane"); this.build(p, () => this.close()); }
  build(c, done) {
    const S = this.src, T = (a, b) => S.T(a, b);
    const v = { type: "book" }, inputs = {};
    const qi = isbn13(this.q.replace(/^isbn[:\s]*/i, "")), qd = cleanDoi(this.q);
    const grid = c.createDiv("ts-form");
    // [cheie, etichetă, exemplu, tipuri la care apare, avansat]
    const B = "book", C = "chapter", A = "article-journal", E = "entry-encyclopedia", TH = "thesis", P = "paper-conference", N = "article-newspaper", W = "webpage", R = "report";
    const ALL = [B, C, A, E, TH, P, N, W, R];
    // eticheta unor câmpuri depinde de tip (ex. „Revista” la articol, „Enciclopedia” la o intrare de enciclopedie)
    const LBL = {
      container: { [C]: T("Volumul (cartea)", "Book title"), [A]: T("Revista", "Journal"), [E]: T("Enciclopedia", "Encyclopedia"), [P]: T("Volumul conferinței", "Proceedings"), [N]: T("Ziarul / revista", "Newspaper / magazine"), [W]: T("Site-ul", "Website") },
      publisher: { [TH]: T("Universitatea", "University"), [R]: T("Instituția", "Institution") },
      title: { [C]: T("Titlul capitolului", "Chapter title"), [E]: T("Titlul intrării", "Entry title") },
    };
    const PH = {
      container: { [C]: T("titlul cărții în care apare capitolul", "the book the chapter is in"), [A]: T("ex. Revista de Filosofie", "e.g. Revista de Filosofie"), [E]: T("ex. Stanford Encyclopedia of Philosophy", "e.g. Stanford Encyclopedia of Philosophy"), [N]: T("ex. Dilema veche", "e.g. The Guardian"), [W]: T("ex. Aeon", "e.g. Aeon") },
      publisher: { [TH]: T("ex. Universitatea din București", "e.g. University of Bucharest"), [B]: T("ex. Polirom", "e.g. Polirom") },
    };
    const F = [
      ["title", T("Titlu", "Title"), "", ALL],
      ["authors", T("Autori", "Authors"), T("ex. Dumitru Stăniloae; Ioan Ică", "e.g. Dumitru Stăniloae; Ioan Ică"), ALL],
      ["container", "", "", [C, A, E, P, N, W]],
      ["editors", T("Coordonatori", "Editors"), T("ex. Ioan Ică jr.", "e.g. Ioan Ică jr."), [B, C, E, P]],
      ["genre", T("Tipul tezei", "Thesis type"), T("ex. Teză de doctorat", "e.g. PhD thesis"), [TH]],
      ["year", T("An", "Year"), "2019", ALL],
      ["volume", T("Volum", "Volume"), "12", [A]],
      ["issue", T("Număr", "Issue"), "3", [A]],
      ["number", T("Numărul raportului", "Report number"), "", [R]],
      ["pages", T("Pagini", "Pages"), "45–67", [C, A, P, N]],
      ["publisher", T("Editură", "Publisher"), "", [B, C, E, TH, P, R]],
      ["place", T("Loc", "Place"), T("ex. București", "e.g. Bucharest"), [B, C, TH, P, R]],
      ["isbn", "ISBN", "978…", [B, C, P]],
      ["doi", "DOI", "10.…", [C, A, P, R]],
      ["url", "Link", "https://…", [E, W, N]],
      ["accessed", T("Accesat la", "Accessed"), T("ex. 2026-10-31", "e.g. 2026-10-31"), [E, W]],
      ["translators", T("Traducere", "Translators"), T("ex. Maria Ivănescu", "e.g. Maria Ivănescu"), [B, C, E], 1],
      ["edition", T("Ediția", "Edition"), T("ex. a 2-a, revăzută / Spring 2024", "e.g. 2nd, revised / Spring 2024"), [B, C, E], 1],
      ["series", T("Colecția", "Series"), T("ex. Biblioteca Filosofică", "e.g. Very Short Introductions"), [B, C, R], 1],
      ["origTitle", T("Titlul original", "Original title"), T("pentru traduceri", "for translations"), [B, C], 1],
      ["origYear", T("Anul ediției originale", "Original year"), T("pentru traduceri", "for translations"), [B, C], 1],
      ["numPages", T("Număr de pagini", "Number of pages"), "312", [B, TH], 1],
      ["issn", "ISSN", "1234-5678", [A], 1],
      ["language", T("Limba", "Language"), "ro", ALL, 1],
      ["url2", "Link", "https://…", [B, C, A, TH, P, R], 1],
    ];
    const tr = grid.createDiv("ts-row"); tr.createEl("label", { text: T("Tip", "Type") });
    const sel = tr.createEl("select", { cls: "dropdown" });
    for (const [val, a, b] of [[B, "Carte", "Book"], [C, "Capitol dintr-o carte", "Book chapter"], [A, "Articol de revistă", "Journal article"], [E, "Intrare de enciclopedie sau dicționar", "Encyclopedia or dictionary entry"],
      [TH, "Teză (doctorat, master, licență)", "Thesis (PhD, master's, bachelor's)"], [P, "Lucrare la o conferință", "Conference paper"], [N, "Articol de ziar sau de revistă culturală", "Newspaper or magazine article"],
      [W, "Pagină web", "Web page"], [R, "Raport", "Report"]]) sel.createEl("option", { value: val, text: T(a, b) });
    sel.addEventListener("change", () => { v.type = sel.value; show(); });
    const rows = {};
    let adv = false;
    const moreRow = grid.createDiv("ts-row ts-more-row");
    for (const [k, label, ph, kinds, isAdv] of F) {
      const r = grid.createDiv("ts-row"); const lab = r.createEl("label", { text: label });
      const i = r.createEl("input", { type: "text" }); i.placeholder = ph || ""; i.addEventListener("input", () => v[k] = i.value);
      inputs[k] = i; rows[k] = { r, kinds, isAdv, lab, label, ph: ph || "" };
      if (isAdv && !moreRow.dataset.placed) { grid.insertBefore(moreRow, r); moreRow.dataset.placed = "1"; }
    }
    const more = moreRow.createEl("a", { text: T("Mai multe detalii (traducere, ediție, colecție…)", "More details (translation, edition, series…)") });
    moreRow.createEl("label"); moreRow.insertBefore(moreRow.lastChild, more);
    more.addEventListener("click", () => { adv = !adv; show(); });
    const show = () => {
      for (const [k, { r, kinds, isAdv, lab, label, ph }] of Object.entries(rows)) {
        r.style.display = kinds.includes(v.type) && (!isAdv || adv) ? "" : "none";
        lab.textContent = LBL[k]?.[v.type] || label || T("Publicat în", "Published in"); inputs[k].placeholder = PH[k]?.[v.type] || ph;
      }
      more.textContent = adv ? T("Mai puține detalii", "Fewer details") : [B, C].includes(v.type) ? T("Mai multe detalii (traducere, ediție, colecție…)", "More details (translation, edition, series…)") : T("Mai multe detalii", "More details");
    };
    const set = (k, val) => { if (!inputs[k] || inputs[k].value) return; inputs[k].value = val; v[k] = val; };
    if (qi) set("isbn", qi); else if (qd) { set("doi", qd); v.type = A; sel.value = A; } else set("title", this.q);
    // completat din rezultatul ales în căutare: toate datele găsite, de verificat sau corectat înainte de adăugare
    const pre = this.opts.csl;
    if (pre) {
      const ty = ALL.includes(pre.type) ? pre.type : /^article-(magazine|newspaper)/.test(pre.type) ? N : /^article/.test(pre.type) ? A : /^entry/.test(pre.type) ? E : /weblog|webpage/.test(pre.type) ? W : B;
      v.type = ty; sel.value = ty;
      const ppl = a => (a || []).map(p => p.literal || [p.given, p.family].filter(Boolean).join(" ")).filter(Boolean).join("; ");
      const yr = d => d?.["date-parts"]?.[0]?.[0] ? String(d["date-parts"][0][0]) : "";
      const ymd2 = d => { const p = d?.["date-parts"]?.[0]; return p?.length ? p.map((x, i) => i ? String(x).padStart(2, "0") : x).join("-") : ""; };
      const fill = { title: pre.title, authors: ppl(pre.author), editors: ppl(pre.editor), translators: ppl(pre.translator), container: pre["container-title"], year: yr(pre.issued),
        volume: pre.volume, issue: pre.issue, number: pre.number, pages: pre.page, publisher: pre.publisher, place: pre["publisher-place"], isbn: pre.ISBN, doi: pre.DOI,
        url: pre.URL, url2: pre.URL, accessed: ymd2(pre.accessed), edition: pre.edition, series: pre["collection-title"], origTitle: pre["original-title"], origYear: yr(pre["original-date"]),
        numPages: pre["number-of-pages"], issn: pre.ISSN, language: pre.language, genre: pre.genre };
      for (const [k, val] of Object.entries(fill)) if (inputs[k] && val != null && val !== "") { inputs[k].value = String(val); v[k] = String(val); }
      v.abstract = pre.abstract;
      if (F.some(f => f[4] && f[3].includes(ty) && inputs[f[0]].value)) adv = true;   // are și detalii (traducere, ediție…): le arătăm
    }
    show();
    const people = s => String(s || "").split(/;|\n|\s+și\s+|\s+and\s+/).map(x => x.trim()).filter(Boolean).map(splitName).filter(Boolean);
    const buildCsl = () => {
      const ty = v.type, has = k => F.find(f => f[0] === k)[3].includes(ty), val = k => has(k) ? v[k] : undefined, num = x => (/\d+/.exec(x || "") || [])[0];
      const acc = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(val("accessed") || "");
      const csl = cleanCsl({
        type: ty, title: (v.title || "").trim(), author: people(v.authors), editor: people(val("editors")), translator: people(adv || v.translators ? val("translators") : ""),
        "container-title": val("container"), genre: val("genre"), issued: num(v.year) ? { "date-parts": [[+num(v.year)]] } : undefined,
        "original-date": num(val("origYear")) ? { "date-parts": [[+num(val("origYear"))]] } : undefined, "original-title": val("origTitle"),
        publisher: val("publisher"), "publisher-place": val("place"), edition: val("edition"), "collection-title": val("series"), "number-of-pages": num(val("numPages")),
        volume: val("volume"), issue: val("issue"), number: val("number"), page: (val("pages") || "").replace(/\s*[–—]\s*/g, "-") || undefined,
        ISBN: has("isbn") ? (isbn13(v.isbn) || v.isbn || undefined) : undefined, ISSN: val("issn"), DOI: has("doi") ? cleanDoi(v.doi) || undefined : undefined,
        language: v.language, URL: val("url") || val("url2"),
      });
      if (acc) csl.accessed = { "date-parts": [[+acc[1], +acc[2], +acc[3]]] };
      if (v.abstract) csl.abstract = v.abstract;
      return csl;
    };
    // câmpurile notei din șablon (ale tale: domain, branch…; și cele automate: an, aliases…), ca să le vezi și să le completezi înainte să adaugi
    const noteVals = this.noteFields(grid, buildCsl);
    const submit = async () => {
      if (!(v.title || "").trim()) { new Notice(T("Scrie cel puțin titlul.", "Type at least the title.")); inputs.title.focus(); return; }
      const csl = buildCsl(), custom = noteVals(), num = x => (/\d+/.exec(x || "") || [])[0];
      if (this.opts.onSubmit) { done(); await this.opts.onSubmit(csl, custom); return; }
      done();
      await S.add({ title: csl.title, authors: csl.author || [], year: +num(v.year) || null, isbn: isbn13(v.isbn), doi: csl.DOI || null, type: v.type, sources: [] }, { csl, custom, ...(this.opts.extra || {}) });
    };
    if (!this.opts.noBar) actions(c, this.opts.label || T("Adaugă în vault", "Add to vault"), submit);
    // Enter într-un câmp = adaugă
    grid.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.tagName === "INPUT" && !e.defaultPrevented) { e.preventDefault(); submit(); } });
    return submit;
  }

  // secțiunea „În notă”: un rând pentru fiecare câmp din șablon. Întoarce o funcție care dă valorile schimbate de tine.
  noteFields(grid, buildCsl) {
    const S = this.src, T = (a, b) => S.T(a, b), tpl = S.template(), custom = {}, previews = [];
    const fields = tpl.fields.filter(f => f.enabled && f.name);
    if (!fields.length) return () => ({});
    const head = grid.createDiv("ts-row ts-sec"); head.createEl("label");
    const ht = head.createDiv("ts-sec-t"); ht.createSpan({ text: T("În notă", "In the note") });
    const ed = ht.createEl("a", { text: T("Schimbă câmpurile", "Edit fields") });
    ed.addEventListener("click", () => S.openSettings("notes"));
    const pretty = n => { const t = n.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_]+/g, " ").trim().toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); };
    const key = () => { const c = buildCsl(); return { c, k: S.citekey(c, new Set()) }; };
    const listNames = fields.filter(f => ["links", "list"].includes(S.fieldKind(f))).map(f => f.name);
    let idx = null; try { idx = S.fieldIndex(listNames); } catch (e) { console.warn("Texere Sources: valorile câmpurilor", e); }
    const chosen = {};
    for (const f of fields) {
      const kind = S.fieldKind(f), r = grid.createDiv("ts-row"); r.createEl("label", { text: pretty(f.name) }); r.title = f.name;
      if (kind === "links" || kind === "list") {
        // valorile din șablon (ex. o listă fixă) pornesc ca etichete; le poți scoate
        let start = []; try { const { c, k } = key(); const x = S.noteFields(c, k, [], null).find(e => e[0] === f.name)?.[1]; if (Array.isArray(x)) start = x.map(y => String(y).replace(/^\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/, "$1")); } catch (e) {}
        chosen[f.name] = [...start];
        const all = idx ? S.fieldOptions(idx, f.name, {}) : [];
        const top = all.slice(0, 2).map(o => o.name);
        chipInput(r, { getOptions: () => idx ? S.fieldOptions(idx, f.name, chosen) : [], start,
          placeholder: top.length ? T("ex. ", "e.g. ") + top.join(", ") + (all.length > 2 ? T(` · ${all.length} valori`, ` · ${all.length} values`) : "") : T("scrie și apasă Enter", "type and press Enter"),
          relatedLabel: T("legat", "related"),
          onChange: arr => { chosen[f.name] = arr; custom[f.name] = kind === "links" ? arr.map(x => `[[${x}]]`) : arr; } });
        if (start.length) custom[f.name] = kind === "links" ? start.map(x => `[[${x}]]`) : start;
      } else if (kind === "text") {
        const i = r.createEl("input", { type: "text" }); i.value = f.template || ""; i.addEventListener("input", () => { custom[f.name] = i.value; });
      } else {
        // automat: vezi valoarea calculată; dacă scrii ceva, al tău are prioritate
        const i = r.createEl("input", { type: "text" }); i.addClass("ts-auto");
        const fmt = x => Array.isArray(x) ? x.join(", ") : x == null ? "" : typeof x === "object" ? JSON.stringify(x) : String(x);
        const upd = () => { let x; try { const { c, k } = key(); x = S.noteFields(c, k, [], null).find(e => e[0] === f.name)?.[1]; } catch (e) {}
          i.placeholder = f.name === "attachment" && (!x || (Array.isArray(x) && !x.length)) ? T("se adaugă singur când găsesc PDF-ul", "added automatically when the PDF is found") : fmt(x) || T("(gol)", "(empty)"); };
        upd(); previews.push(upd);
        i.addEventListener("input", () => {
          if (!i.value.trim()) { delete custom[f.name]; return; }
          if (S.T_.isList(f)) { const ex = i.placeholder.includes("[["); custom[f.name] = i.value.split(",").map(x => x.trim()).filter(Boolean).map(x => ex && !x.startsWith("[[") ? `[[${x}]]` : x); }
          else custom[f.name] = i.value;
        });
      }
    }
    let t = null; grid.addEventListener("input", e => { if (e.target.closest(".ts-sec ~ .ts-row")) return; clearTimeout(t); t = setTimeout(() => previews.forEach(p => p()), 250); });
    grid.querySelector("select")?.addEventListener("change", () => previews.forEach(p => p()));
    return () => ({ ...custom });
  }
}

// etichete cu sugestii: scrii, alegi din valorile folosite deja (sau una nouă) cu Enter sau virgulă; Backspace scoate ultima
function chipInput(row, { options = [], getOptions, start = [], placeholder = "", relatedLabel = "related", onChange }) {
  const box = row.createDiv("ts-chips"), vals = [...start];
  const inp = box.createEl("input", { type: "text" }); inp.placeholder = placeholder;
  // lista plutește deasupra ferestrei (nu e tăiată de derulare) și se deschide în sus când jos nu e loc
  const menu = document.createElement("div"); menu.className = "texere-chip-menu"; menu.style.display = "none";
  const place = () => {
    if (menu.style.display === "none") return;
    const r = box.getBoundingClientRect(), H = window.innerHeight, below = H - r.bottom - 10, above = r.top - 10;
    const need = Math.min(260, menu.scrollHeight + 2), up = below < need && above > below;
    Object.assign(menu.style, { left: r.left + "px", width: r.width + "px", maxHeight: Math.max(100, Math.min(260, up ? above : below)) + "px",
      top: up ? "auto" : r.bottom + 3 + "px", bottom: up ? H - r.top + 3 + "px" : "auto" });
  };
  const open = () => { if (!menu.isConnected) document.body.appendChild(menu); menu.style.display = ""; place(); window.addEventListener("scroll", place, true); window.addEventListener("resize", place); };
  const close = () => { menu.style.display = "none"; menu.remove(); window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place); };
  let hi = 0;
  const draw = () => {
    box.querySelectorAll(".ts-chip").forEach(x => x.remove());
    for (const val of vals) {
      const ch = document.createElement("span"); ch.className = "ts-chip"; ch.textContent = val;
      const x = document.createElement("span"); x.className = "ts-chip-x"; x.textContent = "×"; x.addEventListener("mousedown", e => { e.preventDefault(); vals.splice(vals.indexOf(val), 1); draw(); onChange([...vals]); });
      ch.appendChild(x); box.insertBefore(ch, inp);
    }
    inp.placeholder = vals.length ? "" : placeholder;
  };
  // fiecare opțiune: { name, aliases, related }; cauți și după alias (ex. „Metafizică” → Metaphysics), fără diacritice
  const list = () => (getOptions ? getOptions() : options.map(name => ({ name, aliases: [] })));
  const matches = () => {
    const q = fold(inp.value.trim());
    return list().filter(o => !vals.includes(o.name)).map(o => {
      if (!q) return o;
      if (fold(o.name).includes(q)) return { ...o, rank: fold(o.name).startsWith(q) ? 0 : 1 };
      const al = (o.aliases || []).find(a => fold(a).includes(q)); return al ? { ...o, via: al, rank: 2 } : null;
    }).filter(Boolean).sort((a, b) => q ? (a.rank - b.rank) || (b.related - a.related) : 0).slice(0, 80);
  };
  const showMenu = () => {
    const m = matches(); menu.empty(); hi = Math.min(hi, Math.max(m.length - 1, 0));
    if (!m.length || document.activeElement !== inp) { close(); return; }
    m.forEach((o, i) => {
      const it = menu.createDiv({ cls: "ts-chip-opt" + (i === hi ? " on" : "") }); it.createSpan({ text: o.name });
      const note = o.via || (o.related ? relatedLabel : ""); if (note) it.createSpan({ cls: "ts-chip-note", text: note });
      it.addEventListener("mousedown", e => { e.preventDefault(); add(o.name); });
    });
    open();
    const cur = menu.children[hi]; if (cur) { const t = cur.offsetTop, b = t + cur.offsetHeight; if (t < menu.scrollTop) menu.scrollTop = t; else if (b > menu.scrollTop + menu.clientHeight) menu.scrollTop = b - menu.clientHeight; }
  };
  const add = val => { val = String(val || "").trim().replace(/^\[\[|\]\]$/g, ""); if (val && !vals.includes(val)) { vals.push(val); draw(); onChange([...vals]); } inp.value = ""; hi = 0; showMenu(); };
  inp.addEventListener("input", () => { if (inp.value.includes(",")) { inp.value.split(",").slice(0, -1).forEach(add); inp.value = inp.value.split(",").pop(); } hi = 0; showMenu(); });
  inp.addEventListener("focus", showMenu);
  inp.addEventListener("blur", () => { if (inp.value.trim()) add(inp.value); close(); });
  inp.addEventListener("keydown", e => {
    const m = matches();
    if (e.key === "ArrowDown" && m.length) { e.preventDefault(); e.stopPropagation(); hi = (hi + 1) % m.length; showMenu(); }
    else if (e.key === "ArrowUp" && m.length) { e.preventDefault(); e.stopPropagation(); hi = (hi - 1 + m.length) % m.length; showMenu(); }
    else if (e.key === "Enter" && (inp.value.trim() || (menu.style.display !== "none" && m.length))) { e.preventDefault(); e.stopPropagation(); add(menu.style.display !== "none" && m[hi] ? m[hi].name : inp.value); }
    else if (e.key === "Backspace" && !inp.value && vals.length) { vals.pop(); draw(); onChange([...vals]); }
  });
  box.addEventListener("mousedown", e => { if (e.target === box) { e.preventDefault(); inp.focus(); } });
  draw();
  return { get: () => [...vals] };
}

class SourcesSettingTab extends PluginSettingTab {
  constructor(src) { super(src.app, src.host); this.src = src; this.tab = "search"; }
  hide() { const h = this.src.host; h._citeHooks = (h._citeHooks || []).filter(f => f !== this._hook); }
  display() {
    const S = this.src, T = (a, b) => S.T(a, b), c = this.containerEl, conf = S.conf(), host = S.host;
    // pagina se redesenează (ex. după o alegere): rămâi exact unde erai; doar schimbarea filei te duce sus
    const keep = this._top ? 0 : c.scrollTop; this._top = false;
    c.empty(); c.addClass("texere-settings");
    // pagina se redesenează singură când se instalează sau se șterge un stil
    if (!this._hook) this._hook = () => { if (this.tab === "citations" && c.isConnected) this.display(); };
    host._citeHooks = [...(host._citeHooks || []).filter(f => f !== this._hook), this._hook];
    this.css();
    // antetul, ca în fereastra „Adaugă o sursă”: titlul și filele subliniate, pe același rând
    const head = c.createDiv("ts-head");
    head.createSpan({ cls: "ts-head-t", text: "Texere · " + T("Surse", "Sources") }).title = T("Cauți surse în mai multe cataloage, le adaugi în vault cu PDF-ul gratuit și le citezi în stilul ales.", "Search several catalogs for sources, add them to your vault with the free PDF, and cite them in the style you choose.");
    const nav = head.createDiv("ts-nav");
    // fiecare filă spune ce reglezi acolo
    const tabs = [["search", T("Cataloage", "Catalogs"), T("În ce cataloage caută „Caută surse” și cheile lor", "Which catalogs “Search sources” looks in, and their keys")],
      ["notes", T("Șablonul notei", "Note template"), T("Eticheta, câmpurile și titlul fiecărei note de literatură", "The tag, fields and heading of every literature note")],
      ["files", T("Nume și foldere", "Names & folders"), T("Cum se numesc notele și PDF-urile și unde stau", "What notes and PDFs are called and where they live")],
      ["citations", T("Stiluri de citare", "Citation styles"), T("Stilul citărilor și al bibliografiei (APA, Chicago…)", "The style of citations and the bibliography (APA, Chicago…)")],
      ["pdf", T("PDF-uri gratuite", "Free PDFs"), T("Descărcarea automată a copiei gratuite", "Downloading the free copy automatically")]];
    for (const [id, label, tip] of tabs) {
      const b = nav.createSpan({ cls: "ts-navbtn" + (this.tab === id ? " on" : ""), text: label }); b.title = tip;
      b.addEventListener("click", () => { if (this.tab === id) return; this.tab = id; this._top = true; this.display(); });
    }
    const body = c.createDiv("ts-body");
    if (this.tab === "search") this.searchTab(body, S, T, conf);
    else if (this.tab === "citations") this.citationsTab(body, S, T, host);
    else if (this.tab === "notes") this.notesTab(body, S, T);
    else if (this.tab === "files") this.filesTab(body, S, T);
    else this.pdfTab(body, S, T, conf);
    // rândurile cu câmpuri de completat (text, listă) au aceeași grilă pe toate filele: eticheta într-o coloană, câmpul începe mereu în același loc
    for (const it of body.querySelectorAll(".setting-item:not(.setting-item-heading)")) {
      const ctl = it.querySelector(".setting-item-control");
      if (ctl && ctl.querySelector('input[type="text"], input[type="password"], input[type="email"], input:not([type]), select, textarea')) it.addClass("ts-grid-row");
    }
    c.scrollTop = keep; requestAnimationFrame(() => { if (c.scrollTop !== keep) c.scrollTop = keep; });
  }

  // câmpul unei chei, cu (i) care arată pașii
  keyField(el, S, T, conf, field, name, desc, steps, placeholder, after, inline) {
    const st = new Setting(el).setName(name).setDesc(desc); st.settingEl.addClass("ts-sub");
    const help = el.createDiv({ cls: "texere-keyhelp" }); help.style.display = inline ? "" : "none";
    const ol = help.createEl("ol");
    for (const [txt, url] of steps) { const li = ol.createEl("li"); li.appendText(txt + (url ? " " : "")); if (url) { const a = li.createEl("a", { text: url.replace(/^https?:\/\//, ""), href: url }); a.addEventListener("click", e => { e.preventDefault(); window.open(url); }); } }
    if (!inline) st.addExtraButton(b => b.setIcon("info").setTooltip(T("Cum obțin cheia", "How to get the key")).onClick(() => { help.style.display = help.style.display === "none" ? "" : "none"; }));
    st.addText(t => { t.setPlaceholder(placeholder || T("lipește cheia aici", "paste the key here")).setValue(conf[field]).onChange(async v => { conf[field] = v.trim(); await S.save(); after && after(); }); if (field !== "email") t.inputEl.type = "password"; });
    st.settingEl.after(help);
    return st;
  }

  searchTab(el, S, T, conf) {
    el.createEl("p", { cls: "ts-intro", text: T("Cataloagele în care caută „Caută surse”. Unele merg mai bine (sau doar) cu o cheie gratuită: apasă pe eticheta cheii.", "The catalogs that “Search sources” looks in. Some work better (or only) with a free key: click the key label.") });
    const KEYS = {
      zotero: ["zoteroKey", T("Cheie Zotero (recomandat)", "Zotero key (recommended)"), T("Cu o cheie, Texere lucrează cu biblioteca ta și când Zotero e închis (și de pe alt calculator): nu mai aștepți după Zotero și nu te mai oprește „Zotero e închis”. PDF-urile vin și ele, dacă Zotero îți sincronizează fișierele. Cu Zotero deschis, Texere îl folosește tot pe el, că e mai rapid.", "With a key, Texere works with your library even when Zotero is closed (and from another computer): no waiting for Zotero, no “Zotero is closed” stops. PDFs come too, if Zotero syncs your files. With Zotero open, Texere still uses it, because it's faster."), [
        [T("Intră în contul tău pe zotero.org și deschide pagina pentru o cheie nouă:", "Sign in to zotero.org and open the page for a new key:"), "https://www.zotero.org/settings/keys/new"],
        [T("Bifează „Allow library access” (doar citire e destul) și salvează.", "Tick “Allow library access” (read-only is enough) and save.")],
        [T("Copiază cheia și lipește-o în câmpul alăturat.", "Copy the key and paste it into the field next to this.")]]],
      openalex: ["openalexKey", T("Cheie OpenAlex (recomandată)", "OpenAlex key (recommended)"), T("Fără cheie: câteva zeci de căutări pe zi. Cu o cheie gratuită: aproximativ 1.000.", "Without a key: a few dozen searches a day. With a free key: about 1,000."), [
        [T("Fă-ți un cont gratuit pe", "Create a free account at"), "https://openalex.org"],
        [T("Deschide pagina cheii:", "Open the key page:"), "https://openalex.org/settings/api"],
        [T("Copiază cheia și lipește-o în câmpul alăturat.", "Copy the key and paste it into the field next to this.")]]],
      semanticscholar: ["s2Key", T("Cheie Semantic Scholar", "Semantic Scholar key"), T("Fără cheie, Semantic Scholar refuză aproape toate căutările. Cu cheie, pornește catalogul de mai sus.", "Without a key, Semantic Scholar refuses almost every search. With a key, turn the catalog on above."), [
        [T("Completează formularul de cerere (nume, e-mail, la ce o folosești, ex. „cercetare doctorală, bibliografie în Obsidian”):", "Fill in the request form (name, e-mail, what it's for, e.g. “PhD research, references in Obsidian”):"), "https://www.semanticscholar.org/product/api#api-key-form"],
        [T("Cheia vine pe e-mail; aprobarea poate dura câteva zile.", "The key arrives by e-mail; approval can take a few days.")],
        [T("Lipește cheia în câmpul alăturat, apoi pornește Semantic Scholar.", "Paste the key into the field next to this, then turn Semantic Scholar on.")]]],
      googlescholar: ["serpapiKey", T("Cheie SerpApi", "SerpApi key"), T("Google Scholar nu are o interfață publică pentru programe; SerpApi e un serviciu separat care o oferă. Plan gratuit: 250 de căutări pe lună.", "Google Scholar has no public interface for programs; SerpApi is a separate service that provides one. Free plan: 250 searches a month."), [
        [T("Fă-ți un cont gratuit (confirmi e-mailul și telefonul):", "Create a free account (confirm your e-mail and phone):"), "https://serpapi.com/users/sign_up"],
        [T("Cheia e în panoul tău, la „Your Private API Key”:", "The key is on your dashboard, under “Your Private API Key”:"), "https://serpapi.com/dashboard"],
        [T("Lipește-o în câmpul alăturat. Poți lipi apoi în căutare și linkul profilului Google Scholar al unui autor (un profil întreg consumă 1–3 căutări).", "Paste it into the field next to this. You can then paste an author's Google Scholar profile link into the search (a full profile uses 1–3 searches).")]]],
    };
    S._usageHooks = [];   // etichetele limitelor se refac când vin cifrele exacte
    S.refreshUsage().catch(() => {});
    { const iv = window.setInterval(() => { if (!el.isConnected) return window.clearInterval(iv); for (const f of S._usageHooks || []) { try { f(); } catch (e) {} } }, 60000); }   // „se reface în …” numără minutele
    this._keys = this._keys || new Set();   // cheile deschise rămân deschise după redesenare
    for (const p of S.providers) {
      if (p.id === "zotero") continue;   // Zotero nu mai e un catalog: are fila lui în „Adaugă o sursă” și secțiunea lui mai jos
      const k = KEYS[p.id], needs = p.requires && !conf[p.requires], has = k && conf[k[0]];
      const st = new Setting(el).setName(p.name).setDesc(S.en ? (p.desc?.en || "") : (p.desc?.ro || p.desc?.en || "")); st.settingEl.addClass("ts-cat");
      st.addToggle(t => { t.setValue(!conf.disabled.includes(p.id) && !needs).onChange(async v => { conf.disabled = conf.disabled.filter(x => x !== p.id); if (!v) conf.disabled.push(p.id); await S.save(); }); if (needs) t.setDisabled(true); });
      if (["openalex", "googlescholar", "semanticscholar", "googlebooks"].includes(p.id)) {   // câte căutări mai ai (și când se refac)
        const uc = st.nameEl.createSpan({ cls: "ts-chip" }), upd = () => { if (!uc.isConnected && uc._seen) return; uc._seen = true; const ui = S.usageInfo(p.id); uc.style.display = ui ? "" : "none"; if (ui) { uc.className = "ts-chip " + ui.cls; uc.setText(ui.text); uc.title = ui.title || ""; } };
        upd(); (S._usageHooks = S._usageHooks || []).push(upd);
      }
      if (p.id === "zotero" && S.zotero) {   // conectat acum? (Zotero deschis sau cheia ta)
        const zc = st.nameEl.createSpan({ cls: "ts-chip" }), upd = () => { const c = S.zotero.describe(S.zotero.st).catalog; zc.className = "ts-chip " + c.cls; zc.setText(c.text); };
        upd(); S.zotero.refresh().then(upd).catch(() => {}); const off = S.zotero.onChange(() => { if (!zc.isConnected) return off(); upd(); });
      }
      if (!k) continue;
      const chip = st.nameEl.createSpan({ cls: "ts-chip btn " + (has ? "ok" : needs ? "warn" : "act"), text: has ? T("cheie adăugată", "key added") : needs ? T("Adaugă cheia (obligatorie)", "Add key (required)") : T("Adaugă cheia", "Add key") });
      chip.title = has ? T("Schimbă cheia", "Change the key") : T("Cum obții cheia și unde o pui", "How to get the key and where to put it");
      const box = el.createDiv("ts-keybox"); box.style.display = this._keys.has(p.id) ? "" : "none";
      this.keyField(box, S, T, conf, k[0], k[1], k[2], k[3], null, () => { if (p.requires) { clearTimeout(this._rt); this._rt = setTimeout(() => this.display(), 800); } }, true);
      chip.addEventListener("click", e => { e.preventDefault(); const open = box.style.display === "none"; box.style.display = open ? "" : "none"; this._keys[open ? "add" : "delete"](p.id); if (open) box.querySelector("input")?.focus(); });
    }
    this.zoteroSection(el, S, T, conf, KEYS.zotero);
    const more = el.createEl("p", { cls: "ts-intro" });
    more.appendText(T("Un catalog nou e un singur fișier în folderul pluginului (sources/providers); vezi README-ul de acolo. Pentru cărți care nu sunt în niciun catalog: Caută surse → Introdu manual.", "A new catalog is a single file in the plugin's folder (sources/providers); see the README there. For books that aren't in any catalog: Search sources → Enter manually."));
  }

  // Zotero: starea (pe înțeles: ce merge și ce oprește restul), importul și butonul din browser; se reface singură la câteva secunde
  zoteroSection(el, S, T, conf, k) {
    const Z = S.zotero; if (!Z) return;
    new Setting(el).setName("Zotero").setHeading();
    const box = el.createDiv("ts-zsec"); let sig = null;
    if (k) {   // cheia Zotero (recomandată): biblioteca ta și când Zotero e închis; în afara rândurilor care se refac, ca să nu se piardă ce scrii
      const has = !!conf[k[0]], ks = new Setting(el).setName(k[1]).setDesc(k[2]); ks.settingEl.addClass("ts-cat");
      const chip = ks.nameEl.createSpan({ cls: "ts-chip btn " + (has ? "ok" : "act"), text: has ? T("cheie adăugată", "key added") : T("Adaugă cheia", "Add key") });
      const kb = el.createDiv("ts-keybox"); kb.style.display = this._keys?.has("zotero") ? "" : "none";
      this.keyField(kb, S, T, conf, k[0], k[1], k[2], k[3], null, () => { Z.refresh().catch(() => {}); }, true);
      chip.addEventListener("click", e => { e.preventDefault(); const open = kb.style.display === "none"; kb.style.display = open ? "" : "none"; this._keys?.[open ? "add" : "delete"]("zotero"); if (open) kb.querySelector("input")?.focus(); });
    }
    const render = () => {
      if (!box.isConnected && sig !== null) return;
      const d = Z.describe(Z.st), s2 = JSON.stringify(d); if (s2 === sig) return; sig = s2; box.empty();
      const stat = new Setting(box).setName(d.head).setDesc(d.detail); stat.settingEl.addClass("ts-zstat"); stat.settingEl.addClass("is-" + (d.dot || "warn"));
      const dot = document.createElement("span"); dot.className = "ts-zdot " + (d.dot || "warn"); stat.nameEl.prepend(dot);
      stat.addExtraButton(b => b.setIcon("refresh-cw").setTooltip(T("Verifică din nou", "Check again")).onClick(async () => { sig = null; await Z.refresh(); render(); }));
      const im = new Setting(box).setName(T("Importă din Zotero", "Import from Zotero")).setDesc(T("Deschide „Adaugă o sursă” → Zotero: colecțiile tale, bifezi ce vrei (sau tot) și imporți, cu PDF-urile și evidențierile.", "Opens “Add a source” → Zotero: your collections; tick what you want (or everything) and import, with PDFs and highlights."));
      im.nameEl.createSpan({ cls: "ts-chip " + d.import.cls, text: d.import.text });
      im.addButton(b => { b.setButtonText(T("Importă…", "Import…")).onClick(() => Z.openImport()); if (!d.import.ok) { b.setDisabled(true); if (b.buttonEl) b.buttonEl.title = T("Vezi starea de mai sus", "See the status above"); } });
      // culorile evidențierilor din Zotero → etichetele tale (paleta PDF++)
      const pal = Object.keys(this.plugin?.app?.plugins?.plugins?.["pdf-plus"]?.settings?.colors || Z.palette()), map = Z.colorMap();
      const cs = new Setting(box).setName(T("Culorile din Zotero → etichete", "Zotero colors → tags")).setDesc(pal.length ? T("Evidențierile din Zotero intră în PDF și în notă cu eticheta culorii lor (și cu comentariul). Pornit din ce ai folosit deja în note.", "Zotero highlights go into the PDF and the note with their color's tag (and their comment). Starts from what you already used in your notes.") : T("Setează întâi paleta de culori în PDF++.", "Set up the color palette in PDF++ first."));
      cs.settingEl.addClass("ts-zcol-row");
      if (pal.length) {
        const g = (cs.controlEl || cs.settingEl).createDiv("ts-zcolors");
        for (const [hex, ro, en] of (Z.zcolors?.() || [])) {
          const w = g.createDiv("ts-zc"); const sw = w.createSpan({ cls: "ts-zsw" }); sw.style.background = hex; sw.title = T(ro, en);
          const sel = w.createEl("select", { cls: "dropdown" }); sel.createEl("option", { value: "", text: T("fără etichetă", "no tag") });
          for (const n of pal) sel.createEl("option", { value: n.toLowerCase(), text: "#" + n.toLowerCase() });
          sel.value = map[hex] || ""; sel.title = T(ro, en);
          sel.addEventListener("change", async () => { (conf.zoteroColors = conf.zoteroColors || {})[hex] = sel.value; await S.save(); });
        }
      }
      const bt = new Setting(box).setName(T("Butonul Zotero din browser", "Zotero browser button")).setDesc(d.button.desc);
      bt.nameEl.createSpan({ cls: "ts-chip " + d.button.cls, text: d.button.chip });
      bt.addToggle(t => t.setValue(!!conf.zoteroConnector).onChange(async v => { t.setDisabled(true); try { await Z.setWanted(v); } finally { sig = null; render(); } }));
    };
    render();
    const off = Z.onChange(() => { if (!box.isConnected) return off(); render(); });
    Z.refresh().then(render).catch(() => {});
    // cât timp pagina e deschisă: starea se verifică și când butonul e oprit (când e pornit, o verifică Texere oricum)
    const iv = window.setInterval(() => { if (!box.isConnected) { window.clearInterval(iv); off(); return; } if (!Z.wantConnector()) Z.refresh().catch(() => {}); }, 4000);
  }

  citationsTab(el, S, T, host) {
    const E = host.cite;
    if (!E?.ready) { el.createEl("p", { cls: "ts-intro", text: T("Citările se încarcă; redeschide pagina peste o clipă.", "Citations are loading; reopen this page in a moment.") }); return; }
    el.createEl("p", { cls: "ts-intro", text: T("În note, [@citekey, p. 34] apare deja în stilul ales; exportul îl folosește pe același. O notă își poate alege alt stil din butonul de jos al ferestrei (ex. APA), salvat în proprietatea csl.", "In notes, [@citekey, p. 34] already shows in the chosen style; the export uses the same one. A note can choose another style from the button at the bottom of the window (e.g. APA), saved in its csl property.") });
    new Setting(el).setName(T("Stilul implicit", "Default style")).setDesc(T("Pentru notele fără proprietatea csl.", "For notes without a csl property."))
      .addDropdown(d => { for (const st of E.list()) d.addOption(st.id, st.label); d.setValue(E.defaultId() || "apa").onChange(async v => { await host.setDefaultStyle(v); this.display(); }); });
    const hd = new Setting(el).setName(T("Stilurile instalate", "Installed styles")).setHeading();
    hd.addExtraButton(b => b.setIcon("help-circle").setTooltip(T("Cum îmi fac propriul stil", "How to make your own style")).onClick(() => host.citeGuide(null)));
    hd.addButton(b => b.setButtonText(T("Importă .csl", "Import .csl")).onClick(() => host.citeImport(null)));
    hd.addButton(b => b.setButtonText(T("+ Adaugă un stil", "+ Add a style")).setCta().onClick(() => host.citeAdd(true)));
    const def = E.defaultId();
    for (const st of E.list()) {
      const row = new Setting(el).setName(st.label).setDesc(st.title + (st.note ? T(" · note de subsol", " · footnotes") : ""));
      if (st.id === def) row.nameEl.createSpan({ cls: "ts-tag ok", text: T("implicit", "default") });
      else {
        row.addButton(b => b.setButtonText(T("Fă-l implicit", "Make default")).onClick(async () => { await host.setDefaultStyle(st.id); this.display(); }));
        row.addExtraButton(b => b.setIcon("trash-2").setTooltip(T("Șterge stilul", "Remove the style")).onClick(() => host.removeStyle(st.id)));
      }
    }
    el.createEl("p", { cls: "ts-intro", text: T("„+ Adaugă un stil” caută printre cele peste 10.000 de stiluri din Zotero Style Repository (ex. numele unei reviste). „Importă .csl” adaugă un stil făcut de tine sau primit de la universitate; (?) arată cum îl faci, fără cod. Stilurile stau în ", "“+ Add a style” searches the 10,000+ styles of the Zotero Style Repository (e.g. a journal's name). “Import .csl” adds a style you made or got from your university; (?) shows how to make one, without code. Styles live in ") + E.styleDir() + "." });
  }

  // șablonul notei de literatură: câmpurile tale, eticheta și titlul notei
  notesTab(el, S, T) {
    const tpl = S.template(), save = async (redraw) => { await S.save(); if (redraw) this.display(); };
    el.createEl("p", { cls: "ts-intro", text: T("Cum arată nota fiecărei surse: eticheta, câmpurile și titlul. Le completezi și când adaugi o sursă.", "What every source's note looks like: the tag, the fields and the heading. You also fill them in when you add a source.") });
    new Setting(el).setName(T("Eticheta", "Tag")).setDesc(T("Se pune pe fiecare notă de literatură.", "Added to every literature note."))
      .addText(t => t.setValue((S.T_.tags(tpl.tag) || []).join(", ")).setPlaceholder("literature_note").onChange(async v => { tpl.tag = v; await save(); }));
    new Setting(el).setName(T("Câmpuri", "Fields")).setDesc(T("În ordinea din notă, după datele sursei (titlu, autori, DOI…).", "In the note's order, after the source's data (title, authors, DOI…).")).setHeading();
    const KIND = { links: T("linkuri", "links"), list: T("listă", "list"), text: "text", auto: T("automat", "automatic") };
    const TIP = { links: T("O completezi tu, cu linkuri [[…]]", "You fill it in, with links [[…]]"), list: T("O completezi tu, ca listă", "You fill it in, as a list"), text: T("O completezi tu, ca text", "You fill it in, as text"), auto: T("Se completează singur, din datele sursei", "Filled in by itself, from the source's details") };
    tpl.fields.forEach((f, i) => {
      const kind = S.fieldKind(f);
      const row = new Setting(el).setName(f.name).setDesc("");
      row.settingEl.addClass("ts-field-row"); row.settingEl.addClass("ts-grid-row"); if (!f.enabled) row.settingEl.addClass("is-off");
      const kc = row.nameEl.createSpan({ cls: "ts-chip", text: KIND[kind] }); kc.title = TIP[kind];
      if (kind === "auto" || kind === "text") row.addText(t => { t.setValue(f.template).setPlaceholder(kind === "text" ? T("valoarea de pornire", "starting value") : "{{…}}").onChange(async v => { f.template = v; await save(); }); t.inputEl.addClass("ts-mono"); });
      else {
        // valorile propuse vin din notele din orice folder cu numele câmpului (ex. „Concepts”, în oricare domeniu) și din ce ai folosit deja;
        // un folder ales aici le restrânge la el
        let tip = ""; try {
          const ix = S.fieldIndex([f.name]).fields[f.name], dirs = [...ix.folders];
          row.setDesc(ix.opts.size === 1 ? T("1 valoare", "1 value") : T(`${ix.opts.size} valori`, `${ix.opts.size} values`));
          tip = f.source ? T(`Valorile vin din ${f.source} și din notele tale.`, `Values come from ${f.source} and your notes.`)
            : dirs.length ? T(`Valorile vin din folderele „${f.name}” (${dirs.join(", ")}) și din notele tale.`, `Values come from the “${f.name}” folders (${dirs.join(", ")}) and your notes.`)
            : T("Valorile vin din notele tale.", "Values come from your notes.");
          row.descEl.title = tip;
        } catch (e) {}
        row.addText(t => { t.setValue(f.source || "").setPlaceholder(T("orice folder", "any folder")).onChange(async v => { f.source = v.trim() || undefined; await save(); }); t.inputEl.addClass("ts-src-in"); S.folderSuggest(t.inputEl);
          t.inputEl.title = T(`Gol: valorile vin din orice folder numit „${f.name}”, din oricare domeniu. Scrie un folder ca să le iei doar de acolo.`, `Empty: values come from any folder named “${f.name}”, in any field of study. Type a folder to take them only from there.`) + (tip ? "\n" + tip : ""); });
        row.addDropdown(d => d.addOption("links", T("Linkuri [[…]]", "Links [[…]]")).addOption("list", T("Listă", "List")).setValue(kind).onChange(async v => { f.kind = v; await save(true); }));
      }
      if (i) row.addExtraButton(b => b.setIcon("arrow-up").setTooltip(T("Mai sus", "Move up")).onClick(async () => { tpl.fields.splice(i - 1, 0, tpl.fields.splice(i, 1)[0]); await save(true); }));
      else row.addExtraButton(b => { b.setIcon("arrow-up"); if (b.extraSettingsEl) { b.extraSettingsEl.style.visibility = "hidden"; b.extraSettingsEl.setAttribute("aria-hidden", "true"); } });   // aliniere
      row.addToggle(t => { t.setValue(f.enabled).onChange(async v => { f.enabled = v; row.settingEl.toggleClass("is-off", !v); await save(); }); t.toggleEl?.setAttribute?.("aria-label", T("În notă", "In the note")); });
      row.addExtraButton(b => b.setIcon("trash-2").setTooltip(T("Șterge câmpul", "Remove the field")).onClick(async () => { tpl.fields.splice(i, 1); await save(true); }));
    });
    // câmp nou: numele și tipul
    const add = new Setting(el).setName(T("Câmp nou", "New field")).setDesc(T("Ex. „concepts”, „seminar”, „curs”.", "E.g. “concepts”, “seminar”, “course”.")); add.settingEl.addClass("ts-grid-row"); add.settingEl.addClass("ts-new-field");
    let nm = "", kd = "links";
    add.addText(t => t.setPlaceholder(T("numele câmpului", "field name")).onChange(v => { nm = v; }));
    add.addDropdown(d => d.addOption("links", T("Listă de linkuri", "List of links")).addOption("list", T("Listă", "List")).addOption("text", "Text").addOption("auto", T("Automat (șablon)", "Automatic (template)")).setValue(kd).onChange(v => { kd = v; }));
    add.addButton(b => b.setButtonText(T("+ Adaugă", "+ Add")).setCta().onClick(async () => {
      const name = nm.trim().replace(/\s+/g, "-"); if (!name) { new Notice(T("Scrie numele câmpului.", "Type the field's name.")); return; }
      if (tpl.fields.some(f => f.name === name)) { new Notice(T("Există deja un câmp cu acest nume.", "There's already a field with this name.")); return; }
      tpl.fields.push(kd === "auto" ? { name, template: "{{title}}", enabled: true } : { name, template: kd === "text" ? "" : "[]", enabled: true, kind: kd === "text" ? undefined : kd });
      await save(true);
    }));
    const vh = el.createEl("details", { cls: "ts-vars" }); vh.createEl("summary", { text: T("Ce poți scrie într-un câmp automat", "What you can write in an automatic field") });
    vh.createEl("p", { text: T("Exemple:", "Examples:") });
    const ul = vh.createEl("ul");
    for (const [code, d] of [["{{title}}", T("titlul", "the title")], ["{{year}} · {{currentDate}}", T("anul sursei · data de azi", "the source's year · today's date")], ["{{citekey}}", T("cheia de citare", "the citation key")],
      ["{{container-title}} · {{publisher}} · {{DOI}}", T("revista · editura · DOI", "journal · publisher · DOI")], ['[{{#authors}}"[[Author/{{.}}]]",{{/authors}}]', T("o listă de linkuri, câte unul pentru fiecare autor", "a list of links, one per author")],
      ["{{title|lowercase}} · {{title|titleword}}", T("cu filtre: lowercase, sentence, titleword, truncate:20…", "with filters: lowercase, sentence, titleword, truncate:20…")]]) { const li = ul.createEl("li"); li.createEl("code", { text: code }); li.appendText(" — " + d); }
    new Setting(el).setName(T("Titlul notei", "Note heading")).setHeading();
    const ta = el.createEl("textarea", { cls: "ts-header-ta" }); ta.value = tpl.header || ""; ta.rows = 8;
    ta.addEventListener("change", async () => { tpl.header = ta.value; await save(); });
  }

  // fila Fișiere: cum se numesc notele și PDF-urile, unde stau, și redenumirea celor existente după regulă
  filesTab(el, S, T) {
    const tpl = S.template(), save = async (redraw) => { await S.save(); if (redraw) this.display(); };
    el.createEl("p", { cls: "ts-intro", text: T("Numele și folderele notelor de literatură și ale PDF-urilor. Citările [@citekey] nu depind de ele: poți schimba oricând, fără să strici nimic.", "The names and folders of literature notes and PDFs. Citations [@citekey] don't depend on them: you can change them any time without breaking anything.") });
    new Setting(el).setName(T("Nume", "Names")).setHeading();
    const EX = { title: "Understanding responsibility in Responsible AI. Dianoetic virtues and the hard problem of context", author: [{ family: "Constantinescu", given: "Mihaela" }, { family: "Voinea", given: "Cristina" }, { family: "Vică", given: "Constantin" }], issued: { "date-parts": [[2021]] } }, EXK = "constantinescu_understanding_2021";
    const fnSet = new Setting(el).setName(T("Numele notei", "Note name"));
    const pdSet = new Setting(el).setName(T("Numele PDF-ului", "PDF name"));
    const prev = () => { try {
      fnSet.setDesc(T("Citarea rămâne [@citekey], oricum s-ar numi fișierul. Ex.: ", "Citations stay [@citekey], whatever the file is called. E.g.: ") + S.fileBase(EX, EXK) + ".md");
      const pb = S.pdfBase(EX, EXK);
      pdSet.setDesc(pb ? T("Ex.: ", "E.g.: ") + pb + ".pdf" : T("PDF-ul rămâne cu numele pe care îl are (sau cu cel de pe site, când îl descarcă Texere).", "The PDF keeps the name it has (or the one from the website, when Texere downloads it)."));
    } catch (e) {} };
    fnSet.addText(t => { t.setValue(tpl.filename || S.T_.FILENAME).setPlaceholder(S.T_.FILENAME).onChange(async v => { tpl.filename = v.trim() || S.T_.FILENAME; await save(); prev(); }); t.inputEl.addClass("ts-mono"); });
    fnSet.addExtraButton(b => b.setIcon("rotate-ccw").setTooltip(T("Înapoi la „Autor An – Titlu”", "Back to “Author Year – Title”")).onClick(async () => { tpl.filename = S.T_.FILENAME; await save(true); }));
    pdSet.addDropdown(d => d.addOption("note", T("La fel ca nota", "Same as the note")).addOption("keep", T("Păstrează numele PDF-ului", "Keep the PDF's own name")).addOption("custom", T("Alt șablon…", "Another template…"))
      .setValue(tpl.pdfMode || "note").onChange(async v => { tpl.pdfMode = v; if (v === "custom" && !tpl.pdfName) tpl.pdfName = tpl.filename || S.T_.FILENAME; await save(true); }));
    if (tpl.pdfMode === "custom") pdSet.addText(t => { t.setValue(tpl.pdfName || "").setPlaceholder(S.T_.FILENAME).onChange(async v => { tpl.pdfName = v.trim() || S.T_.FILENAME; await save(); prev(); }); t.inputEl.addClass("ts-mono"); });
    // cheia de citare: regula după care se face [@cheie] pentru sursele noi (cele existente își păstrează cheia)
    const conf = S.conf(), ckSet = new Setting(el).setName(T("Cheia de citare", "Citation key"));
    const ckPrev = () => { try { ckSet.setDesc(T("Pentru sursele noi; cele existente își păstrează cheia. Ex.: ", "For new sources; existing ones keep their key. E.g.: ") + "@" + S.citekeyBase({ ...EX, type: "article-journal" })); } catch (e) {} };
    ckSet.addText(t => { t.setValue(conf.citekey || "").setPlaceholder("{{author|lowercase}}_{{title|titleword}}_{{year}}").onChange(async v => { conf.citekey = v.trim() || undefined; await save(); ckPrev(); }); t.inputEl.addClass("ts-mono"); });
    ckSet.addExtraButton(b => b.setIcon("rotate-ccw").setTooltip(T("Înapoi la autor_cuvânt_an", "Back to author_word_year")).onClick(async () => { conf.citekey = "{{author|lowercase}}_{{title|titleword}}_{{year}}"; await save(true); }));
    ckPrev();
    prev();
    this.foldersSection(el, S, T);
    new Setting(el).setName(T("Sursele existente", "Existing sources")).setHeading();
    new Setting(el).setName(T("Redenumește după regulă", "Rename to the rule")).setDesc(T("Arată ce note și PDF-uri nu au încă numele de mai sus; bifezi ce vrei și le redenumești.", "Shows which notes and PDFs don't have the names above yet; tick what you want and rename them."))
      .addButton(b => b.setButtonText(T("Verifică…", "Check…")).onClick(() => S.tidy()));
    { const bdir = S.bibPath().slice(0, S.bibPath().lastIndexOf("/")), bset = new Setting(el).setName(T("Folderul bibliografiei", "Bibliography folder"))
        .setDesc(T(`${bdir}. Rămâne aici: Texere ține aici bibliografia și stilurile de citare, iar celelalte pluginuri o caută aici. Nu-l redenumi și nu-l muta.`, `${bdir}. It stays here: Texere keeps the bibliography and the citation styles here, and the other plugins look for them here. Don't rename or move it.`));
      bset.nameEl.createSpan({ cls: "ts-chip", text: T("fix", "fixed") });
      if (!S.app.vault.getAbstractFileByPath(bdir)) { const core = S.app.plugins.plugins.texere; const box = el.createDiv("ts-falert");
        box.createDiv({ cls: "ts-falert-t", text: T(`Folderul bibliografiei nu mai e la locul lui (${bdir}).`, `The bibliography folder isn't in its place anymore (${bdir}).`) });
        box.createDiv({ cls: "ts-falert-d", text: T("Până nu-l pui la loc, citările și bibliografia nu merg. Trebuie să rămână acolo, cu numele lui.", "Until you put it back, citations and the bibliography don't work. It has to stay there, with its name.") });
        if (core?.putBack) { const b = box.createDiv("ts-falert-b").createEl("button", { cls: "mod-cta", text: T("Pune-l la loc", "Put it back") }); b.addEventListener("click", async () => { await core.putBack(bdir); this.display(); }); } } }
    new Setting(el).setName(T("Bibliografia", "Bibliography")).setDesc(T(`Se ține la zi singură din notele de literatură (${S.lib.all().length} surse). Dacă ai schimbat note în afara Obsidian, o poți reface.`, `It keeps itself up to date from your literature notes (${S.lib.all().length} sources). If you changed notes outside Obsidian, you can rebuild it.`))
      .addButton(b => b.setButtonText(T("Refă din note", "Rebuild from notes")).onClick(async () => { await S.rebuildFromNotes(); this.display(); }));
  }

  // folderele: întâi le schimbi aici (ciornă), apoi „Previzualizează” arată exact ce s-ar întâmpla; abia acolo le aplici
  foldersSection(el, S, T) {
    const cur = S.filesConf(), d = this.filesDraft || (this.filesDraft = { ...cur });
    const changed = () => ["notes", "pdfs", "inbox"].some(k => (d[k] || "") !== (cur[k] || ""));
    new Setting(el).setName(T("Foldere", "Folders")).setDesc(T("Unde ajung notele, PDF-urile și PDF-urile fără sursă. Poți folosi variabile, ex. {{authorsShort}} sau {{typeName}}.", "Where notes, PDFs and PDFs without a source go. You can use variables, e.g. {{authorsShort}} or {{typeName}}.")).setHeading();
    const root = () => S.rootOf(d.pdfs) || "01. Sources/Documents";
    const PRESETS = [["one", T("Un singur folder pentru toate PDF-urile", "One folder for all PDFs"), () => root()], ["source", T("Un folder pentru fiecare sursă", "A folder per source"), () => root() + "/{{noteName}}"],
      ["author", T("Pe autori", "By author"), () => root() + "/{{authorsShort}}"], ["type", T("Pe tipuri (cărți, articole…)", "By type (books, articles…)"), () => root() + "/{{typeName}}"],
      ["notes", T("Lângă notă", "Next to the note"), () => d.notes]];
    const which = () => (PRESETS.find(([, , f]) => f() === d.pdfs) || ["custom"])[0];
    const lay = new Setting(el).setName(T("Așezarea PDF-urilor", "PDF layout"));
    lay.addDropdown(dd => { for (const [k, l] of PRESETS) dd.addOption(k, l); dd.addOption("custom", T("Altfel (scriu eu calea)", "Custom (I'll type the path)"));
      dd.setValue(which()).onChange(v => { const p = PRESETS.find(([k]) => k === v); if (p) d.pdfs = p[2](); this.filesDraft = d; this.display(); }); });
    if (which() === "custom") lay.addText(t => { t.setValue(d.pdfs || "").setPlaceholder(root() + "/{{authorsShort}}").onChange(v => { d.pdfs = v.trim().replace(/\/+$/, ""); upd(); }); t.inputEl.addClass("ts-mono"); t.inputEl.style.minWidth = "240px"; });
    const inputs = {};
    const inVault = T("Un folder din vault: alege-l din listă.", "A folder in your vault: pick it from the list.");
    const folders = S.vaultFolders(), moved = S.conf().folderMoved || {};
    // un selector cu folderele din vault; la PDF-uri, folderul de bază (variabilele vin din „Așezarea PDF-urilor”)
    const row = (key, name, desc) => {
      const st = new Setting(el).setName(name).setDesc(desc), cur = key === "pdfs" ? root() : (d[key] || "").replace(/\/+$/, ""), gone = cur && !S.app.vault.getAbstractFileByPath(cur);
      st.addDropdown(dd => {
        if (gone) dd.addOption(cur, T(`${cur} (nu mai e în vault)`, `${cur} (not in the vault anymore)`));
        for (const f of folders) dd.addOption(f, f);
        if (cur && !gone && !folders.includes(cur)) dd.addOption(cur, cur);
        dd.setValue(cur).onChange(v => { if (key === "pdfs") { const suf = String(d.pdfs || "").slice(root().length); d.pdfs = v + suf; } else d[key] = v; upd(); });
        dd.selectEl.style.minWidth = "220px"; dd.selectEl.style.maxWidth = "320px"; inputs[key] = dd.selectEl;
      });
      if (gone && cur === S.rootOf((S.filesConf() || {})[key])) sourceFolderAlert(el, S, T, cur, moved[key], async to => { await S.setFolderRoot(key, to); this.filesDraft = null; this.display(); }, key);
      return st;
    };
    row("notes", T("Notele de literatură", "Literature notes"), inVault);
    row("pdfs", T("PDF-urile", "PDFs"), inVault + " " + T("Așezarea de mai sus adaugă, la nevoie, câte un folder pe autor, tip sau sursă.", "The layout above adds, if you want, a folder per author, type or source."));
    row("inbox", "Inbox", inVault + " " + T("PDF-urile fără sursă încă. Când apare unul aici, Texere te întreabă dacă îl adaugi ca sursă.", "PDFs without a source yet. When one lands here, Texere offers to add it as a source."));
    const bar = new Setting(el).setName(T("Aplică folderele", "Apply the folders"));
    let btn = null;
    bar.addButton(b => { btn = b; b.setButtonText(T("Previzualizează…", "Preview…")).setCta().onClick(() => S.previewFiles({ ...d }, () => { this.filesDraft = null; this.display(); })); });
    bar.addExtraButton(b => b.setIcon("rotate-ccw").setTooltip(T("Renunță la modificări", "Discard changes")).onClick(() => { this.filesDraft = null; this.display(); }));
    const upd = () => {
      const ch = changed(); btn?.setDisabled(!ch);
      bar.setDesc(ch ? T("Ai modificări neaplicate. Previzualizarea îți arată exact ce s-ar întâmpla, înainte să aplici.", "You have unapplied changes. The preview shows exactly what would happen, before you apply.") : T("Folderele de mai sus sunt cele folosite acum.", "The folders above are the ones in use."));
    };
    upd();
  }

  pdfTab(el, S, T, conf) {
    el.createEl("p", { cls: "ts-intro", text: T("Când adaugi o sursă, Texere caută o copie gratuită în OpenAlex, Europe PMC, Crossref, arhive și la editurile cu acces deschis. Pentru o notă existentă: Ctrl/Cmd + P → Caută PDF-ul gratuit pentru această sursă.", "When you add a source, Texere looks for a free copy in OpenAlex, Europe PMC, Crossref, repositories and open-access publishers. For an existing note: Ctrl/Cmd + P → Find the free PDF for this source.") });
    new Setting(el).setName(T("Descarcă automat PDF-ul gratuit", "Download the free PDF automatically")).setDesc(T("PDF-ul ajunge în Documents și apare în attachment.", "The PDF goes to Documents and appears in attachment."))
      .addToggle(t => t.setValue(conf.pdf).onChange(async v => { conf.pdf = v; await S.save(); }));
    this.keyField(el, S, T, conf, "email", T("E-mail pentru Unpaywall (opțional)", "E-mail for Unpaywall (optional)"), T("Cu un e-mail, Texere caută PDF-uri gratuite și prin Unpaywall, iar Crossref răspunde mai repede.", "With an e-mail, Texere also looks for free PDFs through Unpaywall, and Crossref answers faster."), [
      [T("Nu trebuie cont: Unpaywall cere doar o adresă de e-mail la fiecare căutare, ca să te poată contacta dacă ceva nu merge.", "No account needed: Unpaywall only asks for an e-mail address with each request, so it can contact you if something goes wrong.")],
      [T("Scrie adresa ta în câmpul alăturat. Se trimite doar către Unpaywall și Crossref.", "Type your address into the field next to this. It's sent only to Unpaywall and Crossref.")]], "name@example.com");
  }

  css() {
    const id = "texere-settings-css"; document.getElementById(id)?.remove();   // după o actualizare, stilurile noi înlocuiesc pe cele vechi
    const s = document.head.appendChild(Object.assign(document.createElement("style"), { id }));
    // același limbaj ca fereastra „Adaugă o sursă”: antet cu file subliniate, rânduri liniștite, secțiuni despărțite de o linie, etichete rotunde
    s.textContent = `.texere-settings .ts-head{display:flex;align-items:flex-end;gap:8px 28px;flex-wrap:wrap;border-bottom:1px solid var(--background-modifier-border);margin:0 0 14px}
.texere-settings .ts-head-t{font-size:var(--font-ui-large);font-weight:600;padding-bottom:10px;line-height:1.3}
.texere-settings .ts-nav{display:flex;gap:20px;font-size:var(--font-ui-small);font-weight:500}
.ts-falert{margin:6px 0 14px;padding:10px 12px;border-radius:8px;background:rgba(var(--color-orange-rgb),.1);border:1px solid rgba(var(--color-orange-rgb),.3)}
.ts-falert-t{font-weight:600;font-size:var(--font-ui-small)}.ts-falert-d{color:var(--text-muted);font-size:var(--font-ui-smaller);margin-top:2px}
.ts-falert-b{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}.modal.ts-folder-ask{width:min(560px,94vw)}
.texere-settings .ts-navbtn{padding:2px 1px 10px;margin-bottom:-1px;border-bottom:2px solid transparent;color:var(--text-muted);cursor:pointer;user-select:none;white-space:nowrap;transition:color .12s}
.texere-settings .ts-navbtn:hover{color:var(--text-normal)}
.texere-settings .ts-navbtn.on{color:var(--text-normal);border-bottom-color:var(--interactive-accent)}
.texere-settings .ts-intro{color:var(--text-muted);font-size:var(--font-ui-small);margin:0 0 8px;line-height:1.5;max-width:62ch}
.texere-settings .ts-body > .ts-intro:not(:first-child){margin-top:14px}
.texere-settings .ts-body .setting-item{border-top:0;padding-top:9px;padding-bottom:9px;gap:16px}
.texere-settings .ts-body .setting-item-name{font-size:var(--font-ui-small);font-weight:500}
.texere-settings .ts-body .setting-item-description{font-size:var(--font-ui-smaller);color:var(--text-muted);padding-top:2px;line-height:1.45}
.texere-settings .ts-body .setting-item-description:empty{display:none}
.texere-settings .ts-body .setting-item-heading{border-top:1px solid var(--background-modifier-border);margin-top:14px;padding-top:14px;padding-bottom:4px;background:none;border-radius:0;box-shadow:none}
.texere-settings .ts-body .setting-item-heading .setting-item-name{font-size:var(--font-ui-small);font-weight:600;color:var(--text-normal)}
.texere-settings .ts-body .setting-item-control input[type=text],.texere-settings .ts-body .setting-item-control input[type=password],.texere-settings .ts-body .setting-item-control select{height:30px;font-size:var(--font-ui-small)}
.texere-settings .ts-body .setting-item-control button{font-size:var(--font-ui-small)}
.texere-settings .ts-chip,.texere-settings .ts-tag{display:inline-block;margin-left:8px;font-size:var(--font-ui-smaller);line-height:1.5;padding:0 8px;border-radius:999px;border:1px solid var(--background-modifier-border);color:var(--text-muted);font-weight:500;font-family:var(--font-interface);vertical-align:1px;white-space:nowrap}
.texere-settings .ts-chip.btn{cursor:pointer;user-select:none}.texere-settings .ts-chip.btn:hover{color:var(--text-normal);border-color:var(--text-faint)}
.texere-settings .ts-chip.ok,.texere-settings .ts-tag.ok{border-color:transparent;background:rgba(0,168,150,.14);color:#00897b}
.texere-settings .ts-chip.warn{border-color:transparent;background:rgba(245,168,0,.16);color:#a86300}
.texere-settings .ts-chip.bad{border-color:transparent;background:rgba(224,49,49,.13);color:#c92a2a}
.texere-settings .ts-chip.act{color:var(--text-accent);border-color:var(--text-accent)}.texere-settings .ts-chip.act:hover{background:var(--background-modifier-hover)}
.texere-settings .ts-zcolors{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px 12px;width:100%}
.texere-settings .ts-zc{display:flex;align-items:center;gap:6px;min-width:0}.texere-settings .ts-zc select{flex:1;min-width:0;height:28px;font-size:var(--font-ui-smaller)}
.texere-settings .ts-zsw{flex:0 0 14px;height:14px;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(0,0,0,.15)}
.texere-settings .ts-zstat{border-left:3px solid var(--background-modifier-border);padding-left:12px !important}
.texere-settings .ts-zstat.is-ok{border-left-color:#00a896}.texere-settings .ts-zstat.is-warn{border-left-color:#f5a800}.texere-settings .ts-zstat.is-bad{border-left-color:#e03131}
.texere-settings .ts-zstat .setting-item-name{font-weight:600}
.texere-settings .ts-zdot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:8px;vertical-align:1px;background:var(--text-faint)}
.texere-settings .ts-zdot.ok{background:#00a896}.texere-settings .ts-zdot.warn{background:#f5a800}.texere-settings .ts-zdot.bad{background:#e03131}
.texere-settings .ts-keybox{margin:-2px 0 8px;padding:2px 14px 12px;border-radius:8px;background:var(--background-secondary)}
.texere-settings .ts-keybox .setting-item{padding:10px 0 6px}
.texere-keyhelp{margin:-2px 0 12px;padding:10px 14px 10px 6px;border-radius:8px;background:var(--background-secondary);font-size:var(--font-ui-small);color:var(--text-muted)}
.texere-settings .ts-keybox .texere-keyhelp{margin:0;padding:0 0 0 2px;background:none;font-size:var(--font-ui-smaller)}
.texere-keyhelp ol{margin:0;padding-left:22px}.texere-keyhelp li{margin:3px 0}
.texere-settings .ts-field-row{padding-top:7px !important;padding-bottom:7px !important}
.texere-settings .ts-grid-row{align-items:center}
.texere-settings .ts-grid-row .setting-item-info{flex:0 0 clamp(200px,38%,300px);width:auto;min-width:0;margin-right:0}
.texere-settings .ts-grid-row .setting-item-control{flex:1 1 auto;min-width:0;justify-content:flex-end;flex-wrap:nowrap}
.texere-settings .ts-grid-row .setting-item-control input[type=text],.texere-settings .ts-grid-row .setting-item-control input[type=password],.texere-settings .ts-grid-row .setting-item-control input[type=email]{flex:1 1 auto;width:auto;min-width:0}
.texere-settings .ts-grid-row:not(.ts-field-row):not(.ts-new-field) .setting-item-control select{flex:1 1 auto;width:auto}
.texere-settings .ts-grid-row .setting-item-control select{flex:0 0 128px;width:128px;min-width:0}
.texere-settings .ts-new-field .setting-item-control select{flex:0 0 auto;width:auto}
.texere-settings .ts-grid-row .setting-item-control .checkbox-container,.texere-settings .ts-grid-row .setting-item-control .clickable-icon,.texere-settings .ts-grid-row .setting-item-control button{flex:none}
.texere-settings .ts-field-row .setting-item-description{cursor:default}
.texere-settings .ts-field-row .setting-item-name{font-family:var(--font-monospace);font-size:12.5px;font-weight:400}
.texere-settings .ts-field-row.is-off .setting-item-info,.texere-settings .ts-field-row.is-off input,.texere-settings .ts-field-row.is-off select{opacity:.5}
.texere-settings .ts-field-row .extra-setting-button{opacity:.45}.texere-settings .ts-field-row:hover .extra-setting-button{opacity:1}
.texere-settings input.ts-mono{font-family:var(--font-monospace);font-size:12px;min-width:240px}
.texere-settings .ts-grid-row input.ts-mono{min-width:0}
.texere-settings .ts-vars{margin:6px 0 14px;font-size:var(--font-ui-small);color:var(--text-muted)}
.texere-settings .ts-vars summary{cursor:pointer;color:var(--text-accent)}
.texere-settings .ts-vars code{font-size:11.5px}
.texere-settings textarea.ts-header-ta{width:100%;font-family:var(--font-monospace);font-size:12px;margin-bottom:12px}`;
    this.src.host.register(() => s.remove());
  }
}

module.exports = Sources;
module.exports.SearchModal = SearchModal;
module.exports.helpers = { latex, parseBibtex, parseRis, pastedKind, guessRef, toYaml, splitName, isbn13, titleWord, cleanCsl, cleanDoi, normTitle };
