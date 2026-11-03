// Texere · Insights · instrumentele pentru text: litere fără diacritice, cuvinte, părțile notei care nu se iau în seamă,
// paragrafe și potrivirea termenilor (titluri și aliasuri) cu formele lor din română (acțiune → acțiunii, filosofie → filosofiei).

const WORD = /[\p{L}\p{N}]/u;
const isWord = c => !!c && WORD.test(c);

// o literă → litera mică, fără diacritice (ș, ş → s; ț, ţ → t; ă, â → a; î → i; é → e …); lungimea textului rămâne aceeași
const FOLD = new Map();
function foldChar(c) {
  let f = FOLD.get(c);
  if (f === undefined) {
    const code = c.charCodeAt(0);
    if (code >= 0xd800 && code <= 0xdfff) f = c;   // jumătăți de emoji: rămân
    else { const l = c.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); f = l.length ? l[0] : c; }
    FOLD.set(c, f);
  }
  return f;
}
function fold(s) { s = String(s || ""); let o = ""; for (let i = 0; i < s.length; i++) o += foldChar(s[i]); return o; }

// câte cuvinte încep în text (un cuvânt începe unde o literă vine după altceva); prev = litera dinaintea textului
function wordStarts(text, prev) {
  let n = 0, p = prev || "";
  for (const c of String(text || "")) { const w = isWord(c); if (w && !isWord(p)) n++; p = c; }
  return n;
}

// câte cuvinte are o notă, ca la Obsidian: fără proprietăți, cod, comentarii și sintaxa linkurilor
function countWords(text) {
  let t = String(text || "");
  t = t.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  t = t.replace(/(^|\n)(```|~~~)[\s\S]*?\n\2[^\n]*/g, "\n").replace(/<!--[\s\S]*?-->/g, " ").replace(/%%[\s\S]*?%%/g, " ");
  t = t.replace(/!?\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2").replace(/!?\[\[([^\]]*)\]\]/g, (m, a) => a.split("#")[0].split("/").pop());
  t = t.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/https?:\/\/\S+/g, " ");
  return wordStarts(t, "");
}

// părțile notei în care nu căutăm termeni: proprietăți, cod, linkuri, citări, titluri, etichete, comentarii, formule;
// la cerere și rândurile citate din cărți (evidențierile din notele de literatură: „#claim …” și rândul cu „.pdf#page=”)
function skipRanges(text, opts = {}) {
  const out = [], add = (a, b) => { if (b > a) out.push([a, b]); }, t = String(text || "");
  const fm = /^---\r?\n[\s\S]*?\r?\n---(\r?\n|$)/.exec(t); if (fm) add(0, fm[0].length);
  const rx = (re, f) => { re.lastIndex = 0; let m; while ((m = re.exec(t))) { f(m); if (m[0].length === 0) re.lastIndex++; } };
  rx(/(^|\n)(```|~~~)[^\n]*\n[\s\S]*?(\n\2[^\n]*|$)/g, m => add(m.index, m.index + m[0].length));
  rx(/`[^`\n]+`/g, m => add(m.index, m.index + m[0].length));
  rx(/!?\[\[[^\]\n]*\]\]/g, m => add(m.index, m.index + m[0].length));
  rx(/!?\[[^\]\n]*\]\([^)\n]*\)/g, m => add(m.index, m.index + m[0].length));
  rx(/https?:\/\/[^\s)\]]+/g, m => add(m.index, m.index + m[0].length));
  rx(/\[@[^\]\n]*\]|(?<![\w@])@[\w:.#$%&\-+?<>~/]+/g, m => add(m.index, m.index + m[0].length));
  rx(/<!--[\s\S]*?-->|%%[\s\S]*?%%/g, m => add(m.index, m.index + m[0].length));
  rx(/\$\$[\s\S]*?\$\$|\$[^$\n]+\$/g, m => add(m.index, m.index + m[0].length));
  rx(/<[^>\n]+>/g, m => add(m.index, m.index + m[0].length));
  rx(/(^|\n)#{1,6}\s[^\n]*/g, m => add(m.index, m.index + m[0].length));
  rx(/(^|\n)\s*>\s*\[![^\]]*\][^\n]*/g, m => add(m.index, m.index + m[0].length));   // titlul unui callout
  rx(/(?<![\p{L}\p{N}#])#[\p{L}\p{N}_/\-]+/gu, m => add(m.index, m.index + m[0].length));
  if (opts.skipQuotes) {
    const tags = opts.hlTags || HL_TAGS;
    let pos = 0;
    for (const line of t.split("\n")) {
      const s = line.trimStart(), tag = /^#([\p{L}\p{N}_\-]+)\s/u.exec(s);
      if (/\.pdf#page=/i.test(line) || /^>/.test(s) || (tag && tags.includes(tag[1].toLowerCase()))) add(pos, pos + line.length);
      pos += line.length + 1;
    }
  }
  out.sort((a, b) => a[0] - b[0]);
  const merged = []; for (const r of out) { const l = merged[merged.length - 1]; if (l && r[0] <= l[1]) l[1] = Math.max(l[1], r[1]); else merged.push(r.slice()); }
  return merged;
}
function inRanges(ranges, a, b) {   // [a,b) atinge vreo parte sărită?
  let lo = 0, hi = ranges.length - 1;
  while (lo <= hi) { const m = (lo + hi) >> 1, r = ranges[m]; if (r[1] <= a) lo = m + 1; else if (r[0] >= b) hi = m - 1; else return true; }
  return false;
}

// etichetele evidențierilor (culorile din PDF++); dacă PDF++ nu e pornit, cele obișnuite
const HL_TAGS = ["claim", "question", "word", "agree", "disagree", "connection", "definition", "fact", "important", "idea", "quote", "summary"];

// paragrafele notei (blocuri despărțite de rânduri goale), fără proprietăți
function paragraphs(text) {
  const t = String(text || ""), out = []; let start = 0;
  const fm = /^---\r?\n[\s\S]*?\r?\n---(\r?\n|$)/.exec(t); if (fm) start = fm[0].length;
  const re = /\n[ \t]*\n/g; re.lastIndex = start; let m, from = start;
  while ((m = re.exec(t))) { if (m.index > from) out.push({ from, to: m.index, text: t.slice(from, m.index) }); from = m.index + m[0].length; }
  if (from < t.length) out.push({ from, to: t.length, text: t.slice(from) });
  return out.filter(p => p.text.trim());
}

// ——— termenii: titlurile și aliasurile notelor, cu formele lor ———
const STOP = new Set(("the and with from that this there also more most about into over such than then them they their what when where which while will would could should "
  + "care este sunt pentru fiind prin doar dar sau mai cum unde acest aceasta aceste acesta acestei acelasi foarte poate dupa intre catre asupra fara despre astfel").split(" "));
const SUF = "(?:urilor|urile|ilor|elor|ului|uri|ile|ele|lor|ul|ii|ei|ea|le|es|'s|’s|a|e|i|u|s)?";
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// un termen → modelul lui (fără diacritice, cu terminațiile din română și engleză la ultimul cuvânt)
function termPattern(term) {
  const toks = fold(term).trim().split(/\s+/).filter(Boolean); if (!toks.length) return null;
  // fiecare cuvânt își poate lua terminația (gândire critică → gândirea critică; filosofia minții → filosofiei minții)
  const inflect = w => {
    if (!/^\p{L}+$/u.test(w) || w.length < 4) return esc(w);
    const stem = w.length >= 5 && /[aeiou]$/.test(w) ? esc(w.slice(0, -1)) : null;
    let t = `(?:${stem ? `${esc(w)}|${stem}` : esc(w)})${SUF}`;
    if (/[^aeiou]y$/.test(w)) t = `(?:${t}|${esc(w.slice(0, -1))}ies)`;   // duty → duties
    return t;
  };
  return toks.map(inflect).join("[\\s\\u00a0]+");
}
// „Renaissance (15th - 16th Century)” → „Renaissance”; „The Republic” rămâne
const cleanTitle = s => String(s || "").replace(/\s*\([^)]*\)\s*$/, "").trim();

// indexul: [{ path, terms:[…] }] → { re, groups:[{ term, paths }] }; opts.min = lungimea minimă, opts.ignore = termeni de sărit
function buildIndex(entries, opts = {}) {
  const min = opts.min || 4, ignore = new Set((opts.ignore || []).map(fold)), byKey = new Map();
  for (const e of entries) for (const raw of e.terms || []) {
    const term = cleanTitle(raw); const key = fold(term).replace(/\s+/g, " ").trim();
    if (!key || key.replace(/\s/g, "").length < min || STOP.has(key) || ignore.has(key) || /^[@#\d]/.test(key) || !/\p{L}/u.test(key)) continue;
    const g = byKey.get(key) || { key, term, paths: [] }; if (!g.paths.includes(e.path)) g.paths.push(e.path); byKey.set(key, g);
  }
  const groups = [...byKey.values()].sort((a, b) => b.key.length - a.key.length);
  const parts = []; const kept = [];
  for (const g of groups) { const p = termPattern(g.term); if (p) { parts.push(`(${p})`); kept.push(g); } }
  const re = parts.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${parts.join("|")})(?![\\p{L}\\p{N}])`, "gu") : null;
  return { re, groups: kept, size: kept.length };
}
// toate potrivirile din text: [{ g, from, to }] (pe textul fără diacritice; pozițiile sunt aceleași în textul original)
function matchAll(index, text, skip) {
  const out = []; if (!index?.re) return out;
  const f = fold(text), re = index.re; re.lastIndex = 0; let m;
  while ((m = re.exec(f))) {
    const from = m.index, to = from + m[0].length;
    if (!skip || !inRanges(skip, from, to)) { let gi = 1; while (gi < m.length && m[gi] === undefined) gi++; const g = index.groups[gi - 1]; if (g) out.push({ g, from, to }); }
    if (m[0].length === 0) re.lastIndex++;
  }
  return out;
}

// propoziția din jurul unei poziții (pentru previzualizare)
function context(text, from, to, w = 70) {
  const t = String(text || ""); let a = Math.max(0, from - w), b = Math.min(t.length, to + w);
  const nl1 = t.lastIndexOf("\n", from); if (nl1 >= a) a = nl1 + 1; const nl2 = t.indexOf("\n", to); if (nl2 >= 0 && nl2 < b) b = nl2;
  return { before: (a > 0 && t[a - 1] !== "\n" ? "…" : "") + t.slice(a, from), hit: t.slice(from, to), after: t.slice(to, b) + (b < t.length && t[b] !== "\n" ? "…" : "") };
}

// ziua locală „2026-11-03”, săptămâna ISO „2026-W45”, luna „2026-11”
const pad = n => String(n).padStart(2, "0");
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function weekKey(d = new Date()) {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())), wd = x.getUTCDay() || 7; x.setUTCDate(x.getUTCDate() + 4 - wd);
  const y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1)); return `${x.getUTCFullYear()}-W${pad(Math.ceil(((x - y0) / 864e5 + 1) / 7))}`;
}
const parseDay = k => { const [y, m, d] = String(k).split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };

module.exports = { WORD, isWord, fold, foldChar, wordStarts, countWords, skipRanges, inRanges, paragraphs, HL_TAGS, STOP, termPattern, cleanTitle, buildIndex, matchAll, context, dayKey, weekKey, parseDay, pad };
