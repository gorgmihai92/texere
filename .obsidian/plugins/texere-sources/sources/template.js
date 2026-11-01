// Texere · Sources · șablonul notei de literatură: câmpurile proprii (domain, branch, reading-status…), eticheta și titlul notei,
// cu un limbaj de șabloane simplu: {{title}}, {{year}}, {{citekey}}, {{#authors}}…{{/authors}}, {{title|lowercase}} etc.
// Îl schimbi în Setări → Texere · Sources → Șablonul notei.

// ——— limbajul de șabloane ———
const STOP = new Set(["a", "an", "the", "and", "or", "but", "on", "in", "at", "to", "for", "with", "of", "from", "by", "as", "into", "like", "near", "over", "past", "since", "upon"]);
const isObj = v => v && typeof v === "object" && !Array.isArray(v);
const str = v => typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v == null ? String(v) : (() => { try { return JSON.stringify(v); } catch (e) { return String(v); } })();
function titleWord(t, n = 1) {
  if (!t) return "";
  const w = String(t).replace(/<[^>]+>/g, "").split(/\s+/), clean = x => x.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, "");
  const keep = w.map(clean).filter(x => x && !STOP.has(x.toLowerCase()));
  const pick = keep.length ? keep.slice(0, n) : w.slice(0, n).map(clean).filter(Boolean);
  return pick.join("").toLowerCase().replace(/[^a-z0-9]/gi, "");
}
function get(o, path) {
  if (o[path] !== undefined) return o[path];
  if (!path.includes(".")) { const k = Object.keys(o).find(x => x.toLowerCase() === path.toLowerCase()); if (k) return o[k]; }   // {{Title}} = {{title}}
  let cur = o;
  for (const k of path.split(".")) { if (cur == null) return undefined; cur = Array.isArray(cur) && /^\d+$/.test(k) ? cur[+k] : isObj(cur) ? cur[k] : undefined; }
  return cur;
}
function format(v, spec) {
  const [name, ...args] = spec.split(":"), s = String(v);
  switch (name) {
    case "upper": case "uppercase": return s.toUpperCase();
    case "lower": case "lowercase": return s.toLowerCase();
    case "capitalize": case "title": return s.replace(/(?:^|\s)\S/g, x => x.toUpperCase());
    case "sentence": return s.charAt(0).toUpperCase() + s.slice(1);
    case "truncate": { const n = args.length ? parseInt(args[0], 10) : 30; return s.length > n ? s.slice(0, n) : s; }
    case "ellipsis": { const n = args.length ? parseInt(args[0], 10) : 30; return s.length > n ? s.slice(0, n) + "..." : s; }
    case "replace": return args.length >= 2 ? s.replace(new RegExp(args[0], "g"), args[1]) : s;
    case "trim": return s.trim();
    case "prefix": return args.length ? args[0] + s : s;
    case "suffix": return args.length ? s + args[0] : s;
    case "pad": return args.length >= 2 ? s.padStart(parseInt(args[0], 10), args[1] || " ") : s;
    case "slice": return args.length >= 2 ? s.slice(+args[0], +args[1]) : args.length ? s.slice(+args[0]) : s;
    case "number": { const n = parseFloat(s); return isNaN(n) ? s : args.length ? n.toFixed(+args[0]) : String(n); }
    case "json": try { return JSON.stringify(v); } catch (e) { return ""; }
    case "count": return Array.isArray(v) ? String(v.length) : "0";
    case "date": { const d = new Date(v); if (isNaN(d)) return s; const f = args[0]; return f === "iso" ? d.toISOString() : f === "year" ? String(d.getFullYear()) : f === "month" ? String(d.getMonth() + 1) : f === "day" ? String(d.getDate()) : d.toLocaleDateString(); }
    case "abbr": case "abbr1": return s.charAt(0);
    case "titleword": return titleWord(s, 1);
    case "shorttitle": return titleWord(s, 3);
    case "split": return args.length ? s.split(args[0] || ",").join(",") : s;
    case "join": return Array.isArray(v) ? v.join(args[0] || ",") : s;
    case "urlencode": return encodeURIComponent(s);
    case "urldecode": try { return decodeURIComponent(s); } catch (e) { return s; }
    default: {
      let m = /^truncate(\d+)$/.exec(name); if (m) return s.slice(0, +m[1]);
      m = /^abbr(\d+)$/.exec(name); if (m) return s.slice(0, +m[1]);
      return s;
    }
  }
}
function blocks(t, vars) {
  t = t.replace(/\{\{#([^}]+)\}\}(.*?)\{\{\/\1\}\}/gs, (m, k, inner) => {
    const v = get(vars, k.trim());
    if (Array.isArray(v)) return v.map((x, i) => { const ctx = { ...vars, ...(isObj(x) ? x : {}), ".": x, "@index": i, "@number": i + 1, "@first": i === 0, "@last": i === v.length - 1, "@length": v.length };
      return variables(neg(blocks(inner, ctx), ctx), ctx); }).join("");
    return v ? inner : "";
  });
  return t;
}
function neg(t, vars) { return t.replace(/\{\{\^([^}]+)\}\}(.*?)\{\{\/\1\}\}/gs, (m, k, inner) => { const v = get(vars, k.trim()); return v == null || v === "" || (Array.isArray(v) && !v.length) ? inner : ""; }); }
function variables(t, vars) {
  return t.replace(/\{\{([^#^}|]+)(?:\|([^}]+))?\}\}/g, (m, k, f) => {
    const v = get(vars, k.trim()); if (v == null) return "";
    if (f) return format(v, f.trimStart());
    return typeof v === "object" ? str(v) : String(v);
  });
}
// listă scrisă ca „[a, "b", [[c]],]” → JSON corect
function fixArray(e) {
  const t = e.trim(); if (t === "[]" || t === "[ ]") return "[]";
  if (!(t.startsWith("[") && t.endsWith("]"))) return e;
  try { JSON.parse(t); return t; } catch (x) {}
  const inner = t.slice(1, -1).trim(); if (!inner) return "[]";
  const parts = inner.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(x => x.trim()).filter(Boolean);
  return "[" + parts.map(x => x.startsWith('"') && x.endsWith('"') ? x : x.includes("[[") && x.includes("]]") ? `"${x.replace(/"/g, '\\"')}"` : x).join(",") + "]";
}
function render(tpl, vars, opts = {}) {
  let out = variables(neg(blocks(String(tpl || ""), vars), vars), vars);
  return opts.yamlArray && tpl.trim().startsWith("[") && tpl.trim().endsWith("]") ? fixArray(out) : out;
}

// ——— variabilele unei surse ———
function variables0(citation, contributors, attachments, links) {
  const today = new Date();
  const v = { currentDate: today.toISOString().split("T")[0], currentTime: today.toISOString().split("T")[1].split(".")[0], ...citation, citekey: citation.id || "" };
  const authors = contributors.filter(c => c.role === "author");
  const short = c => c.literal || (c.family ? (c.given ? `${c.given.charAt(0).toUpperCase()}. ${c.family}` : c.family) : c.given || "");
  const ad = authors.map(short).filter(Boolean);
  v.authorsDisplay = ad.length === 1 ? ad[0] : ad.length === 2 ? `${ad[0]} and ${ad[1]}` : ad.length ? `${ad[0]} et al.` : "";
  const byRole = {};
  for (const c of contributors) (byRole[c.role || "author"] = byRole[c.role || "author"] || []).push(c);
  for (const [r, list] of Object.entries(byRole)) {
    v[`${r}s_raw`] = list;
    v[`${r}s`] = list.map(a => a.literal || [a.given, a.family].filter(Boolean).join(" ")).filter(Boolean);
    v[`${r}s_family`] = list.map(a => a.family || a.literal || "").filter(Boolean);
    v[`${r}s_given`] = list.map(a => a.given || "").filter(Boolean);
  }
  if (v.year == null) { const y = citation.issued?.["date-parts"]?.[0]?.[0]; if (y) v.year = String(y); }
  const att = (attachments || []).map(p => `[[${p.split("/").pop()}]]`);   // linkul arată numele fișierului (și urmează redenumirile)
  Object.assign(v, { pdflink: attachments || [], raw_pdflinks: attachments || [], attachments: att, quoted_attachments: att.map(a => `"${a}"`),
    raw_pdflink: attachments?.[0] || "", attachment: att[0] || "", quoted_attachment: att[0] ? `"${att[0]}"` : "" });
  // pentru numele fișierelor: „Blackburn”, „Craig & West”, „Constantinescu et al.”; titlul scurt = până la subtitlu, cel mult ~60 de caractere
  const fam = (authors.length ? authors : contributors.filter(c => c.role === "editor")).map(c => c.family || c.literal || c.given || "").filter(Boolean);
  v.authorsShort = fam.length === 1 ? fam[0] : fam.length === 2 ? `${fam[0]} & ${fam[1]}` : fam.length ? `${fam[0]} et al.` : "";
  let st = String(citation["title-short"] || citation.title || "").replace(/<[^>]+>/g, "").split(/\s*[:?!]\s+|\.\s+(?=[A-ZĂÂÎȘȚ])|\s+[—–]\s+/)[0].trim();
  if (st.length > 60) { st = st.slice(0, 60); st = st.slice(0, st.lastIndexOf(" ") > 30 ? st.lastIndexOf(" ") : 60).replace(/[\s,;.-]+$/, ""); }
  v.shortTitle = st;
  // anul pentru nume: al ediției citate; la traduceri și reeditări, întâi anul original: „1927 (2003)”
  const oy = citation["original-date"]?.["date-parts"]?.[0]?.[0];
  // tipul, pentru foldere („Books”, „Articles”…)
  const TN = { book: "Books", chapter: "Chapters", "article-journal": "Articles", "article-magazine": "Articles", "article-newspaper": "Newspaper articles", "paper-conference": "Conference papers",
    "entry-encyclopedia": "Encyclopedia entries", "entry-dictionary": "Encyclopedia entries", thesis: "Theses", report: "Reports", webpage: "Web pages", "post-weblog": "Web pages" };
  v.typeName = TN[citation.type] || "Other";
  v.yearLabel = oy && v.year && String(oy) !== String(v.year) ? `${oy} (${v.year})` : String(v.year || oy || "");
  const ln = (links || []).map(p => `[[${p}]]`);
  Object.assign(v, { links: ln, linkPaths: links || [], links_string: ln.join(", ") });
  return v;
}

// valoarea unui câmp (o listă „[…]” devine listă în proprietăți)
const esc = v => typeof v === "string" ? JSON.stringify(v).slice(1, -1) : Array.isArray(v) ? v.map(esc) : v;
function jsonSafe(vars) { const o = {}; for (const [k, v] of Object.entries(vars)) o[k] = esc(v); return o; }
function fieldValue(field, vars) {
  const tpl = String(field.template || ""), arr = tpl.trim().startsWith("[") && tpl.trim().endsWith("]");
  if (field.name === "attachment" && tpl === "{{attachment}}") return vars.attachments.length ? vars.attachments : undefined;
  if (field.name === "pdflink" && tpl === "{{pdflink}}") return vars.pdflink.length ? vars.pdflink : undefined;
  // într-o listă scrisă ca JSON („["{{title}}"]”), ghilimelele și backslash-urile din titlu nu trebuie să o strice
  const out = render(tpl, arr ? jsonSafe(vars) : vars, { yamlArray: arr });
  if ((out.startsWith("[") && out.endsWith("]")) || (out.startsWith("{") && out.endsWith("}"))) {
    try { return JSON.parse(arr ? fixArray(out) : out); } catch (e) { return arr && /^\[\s*\]$/.test(out.trim()) ? [] : out; }
  }
  if (out.trim() === "") return arr ? [] : undefined;
  return out;
}

// un câmp pe care îl completezi tu (nu se calculează din datele sursei): ex. domain: [] sau o listă fixă
const isFill = f => !/\{\{/.test(f.template || "") || /\{\{\s*variables\./.test(f.template || "");
const isList = f => { const t = String(f.template || "").trim(); return t.startsWith("[") && t.endsWith("]"); };

// șablonul implicit: același cu cel din vault-ul Texere
const FILENAME = "{{authorsShort}} {{yearLabel}} – {{shortTitle}}";
const FILENAME_V1 = "{{authorsShort}} {{year}} – {{shortTitle}}";   // prima variantă, fără anul original
const DEFAULT = {
  filename: FILENAME,
  tag: "literature_note",
  header: "# {{title}}\n\n## Abstract\n\n## Thesis\n\n## Arguments\n\n## Counterarguments\n\n## Conclusions\n\n## Reading Notes",
  fields: [
    { name: "year", template: "{{year}}", enabled: true },
    { name: "dateCreated", template: "{{currentDate}}", enabled: true },
    { name: "reading-status", template: "#unread", enabled: true },
    { name: "aliases", template: '["{{title|sentence}}"]', enabled: true },
    { name: "author-links", template: '[{{#authors}}"[[Author/{{.}}]]",{{/authors}}]', enabled: true },
    { name: "attachment", template: "[{{#attachments}}{{.}},{{/attachments}}]", enabled: true },
    ...["domain", "branch", "subdomain", "concepts", "theories", "historical-period"].map(name => ({ name, template: "[]", enabled: true })),
  ],
};
// eticheta: „literature_note, #literature_note” → o singură etichetă (Obsidian le socotește la fel)
function tags(tag) {
  const m = new Map();
  for (const t of String(tag || "").split(/[,\s]+/)) { const v = t.trim(); if (v && !m.has(v.replace(/^#/, ""))) m.set(v.replace(/^#/, ""), v.replace(/^#/, "")); }
  return [...m.values()];
}

// un nume de fișier valid din șablon: fără caractere interzise, fără spații duble sau liniuță la margini
function fileBase(tpl, vars) {
  let s = render(tpl || FILENAME, vars)
    .replace(/\s*[:?!]\s+(\S)/g, (m, c) => ". " + c.toUpperCase())            // „Think: A compelling…” → „Think. A compelling…”
    .replace(/[\\/:*?"<>|#^[\]]+/g, " ").replace(/\s+/g, " ")
    .replace(/^[\s–—-]+|[\s–—.-]+$/g, "").replace(/\s+([–—-])\s+(?=[–—-]|$)/g, "").trim();
  if (s.length > 150) { s = s.slice(0, 150); const sp = s.lastIndexOf(" "); s = (sp > 100 ? s.slice(0, sp) : s).replace(/[\s,;.–—-]+$/, ""); }   // nume lungi: tăiate la un cuvânt
  return s;
}
module.exports = { render, fileBase, FILENAME, FILENAME_V1, variables: variables0, fieldValue, isFill, isList, tags, titleWord, DEFAULT };
