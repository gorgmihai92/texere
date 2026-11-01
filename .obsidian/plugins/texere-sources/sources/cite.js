// Texere · Sources · citările: sugestiile „@”, afișarea [@citekey, p. 61] în stilul ales, alegerea stilului, exportul în același stil.
// Mutat din main.js fără schimbări de comportament; bibliografia vine din biblioteca comună (library.js).
const { Notice, EditorSuggest } = require("obsidian");
const LANG = "texere-lang";

// ---------- Citări din mers: scrii „@” (sau „[@”) și alegi sursa din bibliografie ----------
class CiteSuggest extends EditorSuggest {
  constructor(plugin) { super(plugin.app); this.plugin = plugin; this.items = null; this.mtime = 0; this.limit = 30; }
  bibPath() { return this.plugin?.sources?.bibPath?.() || "Support/Admin/Bibliography/bibliography.json"; }
  async load() {
    const lib = this.plugin.lib;
    if (this.items && this.ver === lib.version) return this.items;
    try {
      const data = lib.all(); this.ver = lib.version;
      this.items = data.map(e => {
        const au = (e.author || e.editor || []).map(a => a.family || a.literal || "").filter(Boolean);
        const year = e.issued?.["date-parts"]?.[0]?.[0] || "";
        const who = au.length > 2 ? au[0] + " et al." : au.join(" & ");
        return { key: e.id, who, year: String(year), title: e.title || "", hay: [e.id, au.join(" "), year, e.title].join(" ").toLowerCase() };
      });
    } catch (err) { this.items = []; }
    return this.items;
  }
  onTrigger(cursor, editor) {
    const line = editor.getLine(cursor.line).slice(0, cursor.ch);
    const m = /(^|[\s\[;(])@([\w:.\-]*)$/.exec(line);
    if (!m) return null;
    // citekey deja complet (ex. imediat după ce l-ai ales): lista nu se mai deschide, poți scrie mai departe
    if (m[2] && (this.items || []).some(it => it.key === m[2])) return null;
    this.load();   // se încarcă în fundal; lista apare la tasta următoare dacă nu e gata
    return { start: { line: cursor.line, ch: cursor.ch - m[2].length - 1 }, end: cursor, query: m[2] };
  }
  async getSuggestions(ctx) {
    const items = await this.load(), q = ctx.query.toLowerCase().split(/\s+/).filter(Boolean);
    return items.filter(it => q.every(w => it.hay.includes(w))).slice(0, 30);
  }
  renderSuggestion(it, el) {
    el.createDiv({ text: `${it.who || it.key}${it.year ? " (" + it.year + ")" : ""}` }).style.fontWeight = "500";
    const d = el.createDiv({ text: `${it.title}` }); d.style.cssText = "font-size:0.85em;color:var(--text-muted)";
    const k = el.createDiv({ text: "@" + it.key }); k.style.cssText = "font-size:0.8em;color:var(--text-faint);font-family:var(--font-monospace)";
  }
  selectSuggestion(it) {
    const ctx = this.context; if (!ctx) return;
    const ed = ctx.editor, line = ed.getLine(ctx.start.line);
    const inBracket = ctx.start.ch > 0 && /[\[;]\s*$/.test(line.slice(0, ctx.start.ch));
    const after = line.slice(ctx.end.ch);
    // după alegere, cursorul trece după „]” și urmează un spațiu, ca să scrii mai departe
    const closes = /^\s*\]/.test(after);
    let text = inBracket ? "@" + it.key + (closes ? "" : "]") : "[@" + it.key + "]";
    ed.replaceRange(text, ctx.start, ctx.end);
    let ch = ctx.start.ch + text.length;
    if (closes) ch += after.indexOf("]") + 1;
    const rest = ed.getLine(ctx.start.line).slice(ch);
    if (!rest.startsWith(" ")) ed.replaceRange(" ", { line: ctx.start.line, ch });
    ed.setCursor({ line: ctx.start.line, ch: ch + 1 });
  }
}

// ---------- Stilul citărilor: [@citekey, p. 61] se afișează ca în stilul ales (APA, Chicago, MLA…) ----------

// Textul notei rămâne [@citekey, p. 61] (formatul obișnuit al citărilor în Markdown); se schimbă doar afișarea. Cu cursorul pe citare apare textul sursă.
// Stilul: proprietatea „csl” a notei (ex. csl: chicago-author-date), altfel stilul implicit al vault-ului.
// Același „csl” îl folosește Texere · Export. Orice fișier .csl pus în folderul bibliografiei apare în listă.
const CITE_LABELS = {
  "apa": "APA", "chicago-author-date": "Chicago (author-date)", "chicago-notes-bibliography": "Chicago (notes)",
  "modern-language-association": "MLA", "harvard-cite-them-right": "Harvard", "ieee": "IEEE",
};
const CITE_ORDER = Object.keys(CITE_LABELS);
const CITE_KEY = "[\\w](?:[\\w:.#$%&\\-+?<>~/]*[\\w])?";
const LOC_TERMS = {
  p: "page", pp: "page", pg: "page", pag: "page", page: "page", pages: "page",
  ch: "chapter", chap: "chapter", chapter: "chapter", chapters: "chapter", cap: "chapter",
  sec: "section", section: "section", par: "paragraph", para: "paragraph", paragraph: "paragraph",
  vol: "volume", volume: "volume", fig: "figure", figure: "figure", n: "note", nn: "note", note: "note",
  l: "line", ll: "line", line: "line", bk: "book", book: "book", pt: "part", part: "part", col: "column",
  v: "verse", vv: "verse", fol: "folio", op: "opus", no: "issue",
};

// „p. 61”, „pp. 3–5”, „61”, „chap. 2, see also” → { label, locator, suffix }
function parseLocator(s) {
  let r = (s || "").trim().replace(/^,\s*/, ""); if (!r) return {};
  const NUM = "(?:[\\divxlcdm]+[a-z]?)(?:\\s*[-–—,&]\\s*[\\divxlcdm]+[a-z]?)*";
  let m = new RegExp("^([A-Za-z]+)\\.?\\s*(" + NUM + ")(.*)$", "i").exec(r), out = {};
  if (m && LOC_TERMS[m[1].toLowerCase()]) { out.label = LOC_TERMS[m[1].toLowerCase()]; out.locator = m[2]; r = m[3]; }
  else if ((m = /^(\d+[a-z]?(?:\s*[-–—,&]\s*\d+[a-z]?)*)(.*)$/i.exec(r))) { out.label = "page"; out.locator = m[1]; r = m[2]; }
  r = r.trim();
  if (r) out.suffix = /^[,;.]/.test(r) ? r : ", " + r;
  return out;
}
// interiorul unei paranteze [ … ]: „see @a, p. 3; -@b” → elementele citării (null dacă nu e o citare)
function parseCluster(body) {
  const out = [];
  for (const part of body.split(";")) {
    const m = new RegExp("^([^@]*?)(-?)@(" + CITE_KEY + ")(.*)$", "s").exec(part);
    if (!m) return null;
    const it = { id: m[3] };
    if (m[2]) it["suppress-author"] = true;
    if (m[1].trim()) it.prefix = m[1].trim() + " ";
    const loc = parseLocator(m[4]);
    if (loc.locator) { it.locator = loc.locator; it.label = loc.label; }
    if (loc.suffix) it.suffix = loc.suffix;
    out.push(it);
  }
  return out.length ? out : null;
}
// toate citările dintr-un text, în ordine: [@a, p. 1] (kind "c") și @a [p. 1] în frază (kind "n")
function scanCites(text) {
  const out = [], RE = /\[([^\[\]\n]*?@[^\[\]\n]*?)\](?![(\[:])/g; let m;
  while ((m = RE.exec(text))) {
    const from = m.index; if (from > 0 && /[\[!\]]/.test(text[from - 1])) continue;
    const items = parseCluster(m[1]); if (!items) continue;
    const to = from + m[0].length, dot = text.slice(to, to + 5) === " · [[";
    out.push({ kind: "c", from, to, end: dot ? to + 3 : to, items });
  }
  const inC = p => out.some(c => p >= c.from && p < c.to);
  const RN = new RegExp("(^|[\\s(\"“„'])@(" + CITE_KEY + ")(?:\\s\\[([^\\[\\]\\n@]*)\\](?![(\\[:]))?", "g");
  const narr = [];
  while ((m = RN.exec(text))) {
    const from = m.index + m[1].length; if (inC(from)) continue;
    const it = { id: m[2] }, loc = parseLocator(m[3]);
    if (loc.locator) { it.locator = loc.locator; it.label = loc.label; }
    if (loc.suffix) it.suffix = loc.suffix;
    const to = m.index + m[0].length; narr.push({ kind: "n", from, to, end: to, items: [it] });
  }
  return out.concat(narr).sort((a, b) => a.from - b.from);
}
// proprietățile csl și lang din antetul notei (citite direct din text, ca afișarea să se schimbe pe loc)
function citeFm(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text), o = { end: 0 };
  if (!m) return o; o.end = m[0].length;
  for (const k of ["csl", "lang"]) {
    const r = new RegExp("^" + k + ":[ \\t]*[\"']?([^\"'\\n#]*?)[\"']?[ \\t]*$", "m").exec(m[1]);
    if (r && r[1]) o[k] = r[1].trim();
  }
  return o;
}
const stripTags = h => String(h || "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#38;/g, "&").replace(/&quot;/g, '"');

class CiteEngine {
  constructor(plugin) {
    this.plugin = plugin; this.app = plugin.app; this.ready = false;
    this.CSL = null; this.items = {}; this.raw = {}; this.styles = new Map(); this.locales = {};
    this.engines = new Map(); this.cache = new Map(); this.scanMemo = { text: null, res: null };
  }
  bibPath() { return this.plugin?.sources?.bibPath?.() || "Support/Admin/Bibliography/bibliography.json"; }
  styleDir() { const p = this.bibPath(); return p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : ""; }
  async load() {
    const ad = this.app.vault.adapter, dir = this.plugin.sourcesDir;
    if (!this.CSL) {
      const code = await ad.read(dir + "/citeproc.js"), mod = { exports: {} };
      new Function("module", "exports", code)(mod, mod.exports);
      this.CSL = mod.exports;
    }
    for (const l of ["en-US", "ro-RO"]) { try { this.locales[l] = await ad.read(`${dir}/locales/locales-${l}.xml`); } catch (e) {} }
    await this.loadBib(); await this.loadStyles();
    this.ready = true;
  }
  async loadBib() {
    this.items = {}; this.raw = {};
    try {
      const data = this.plugin.lib.all();
      for (const e of data) {
        // notele au și câmpuri proprii (liste de linkuri, etichete); citeproc vrea doar câmpurile CSL, cu numere ca text
        const o = {};
        for (const [k, v] of Object.entries(e)) {
          if (typeof v === "number") o[k] = String(v);
          else if (Array.isArray(v) && !/^(author|editor|translator|container-author|collection-editor|director|interviewer|recipient|reviewed-author|composer|illustrator)$/.test(k)) continue;
          else o[k] = v;
        }
        // nota ține numărul revistei în „number”; citeproc îl caută în „issue”
        if (o.number && !o.issue && /^(article-journal|article-magazine|article-newspaper|article)$/.test(o.type)) o.issue = o.number;
        this.items[e.id] = o; this.raw[e.id] = e;
      }
    } catch (e) { console.error("Texere: bibliografia", e); }
    this.engines.clear(); this.cache.clear();
  }
  async loadStyles() {
    this.styles = new Map();
    const dir = this.styleDir(), f = this.app.vault.getAbstractFileByPath(dir || "/");
    const files = (f?.children || []).filter(x => x.extension === "csl");
    for (const x of files) {
      try {
        const xml = await this.app.vault.adapter.read(x.path);
        const title = (/<title>([^<]*)<\/title>/.exec(xml) || [])[1] || x.basename;
        const label = CITE_LABELS[x.basename] || title.replace(/\s*\d+(st|nd|rd|th)\s+edition/i, "").replace(/\s+/g, " ").trim();
        this.styles.set(x.basename, { id: x.basename, xml, title, label, note: /class="note"/.test(xml) });
      } catch (e) {}
    }
    this.engines.clear(); this.cache.clear();
  }
  list() {
    return [...this.styles.values()].sort((a, b) => {
      const i = CITE_ORDER.indexOf(a.id), j = CITE_ORDER.indexOf(b.id);
      return (i < 0 ? 99 : i) - (j < 0 ? 99 : j) || a.label.localeCompare(b.label);
    });
  }
  // „chicago-author-date”, „chicago-author-date.csl” sau o cale → id-ul stilului (null dacă nu există)
  styleId(v) { if (!v) return null; const id = String(v).trim().split(/[\\/]/).pop().replace(/\.csl$/i, ""); return this.styles.has(id) ? id : null; }
  defaultId() { return this.styleId(this.plugin.settings?.citationStyle) || (this.styles.has("apa") ? "apa" : this.list()[0]?.id) || null; }
  current(fm) { return this.styleId(fm?.csl) || this.defaultId(); }
  label(id) { return this.styles.get(id)?.label || id || "—"; }
  // încearcă un stil nou pe o carte de probă: întoarce citarea și intrarea din bibliografie, sau aruncă o eroare dacă stilul e stricat
  sample(xml) {
    const item = { id: "texere-sample", type: "book", title: "Think: A compelling introduction to philosophy", author: [{ family: "Blackburn", given: "Simon" }],
      issued: { "date-parts": [[1999]] }, publisher: "Oxford University Press", "publisher-place": "Oxford" };
    const sys = { retrieveLocale: l => this.locales[l] || this.locales[/^ro/i.test(l) ? "ro-RO" : "en-US"] || this.locales["en-US"], retrieveItem: () => item };
    const e = new this.CSL.Engine(sys, xml, "en-US"); e.updateItems([item.id]);
    const cite = e.makeCitationCluster([{ id: item.id, locator: "34", label: "page" }]);
    const bib = e.makeBibliography();
    const strip = h => String(h || "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#38;/g, "&").replace(/\s+/g, " ").trim();
    return { cite: strip(cite), bib: bib ? strip(bib[1].join(" ")) : "" };
  }
  locale(lang) { return /^ro/i.test(lang || "") ? "ro-RO" : "en-US"; }
  scan(text) { if (this.scanMemo.text !== text) this.scanMemo = { text, res: scanCites(text) }; return this.scanMemo.res; }
  known(c) { return c.items.every(i => this.items[i.id]); }
  engine(style, lang, order) {
    const k = style + "|" + lang; let e = this.engines.get(k);
    if (!e) {
      const sys = {
        retrieveLocale: l => this.locales[l] || this.locales[/^ro/i.test(l) ? "ro-RO" : "en-US"] || this.locales["en-US"],
        retrieveItem: id => this.items[id],
      };
      e = new this.CSL.Engine(sys, this.styles.get(style).xml, lang);
      e.__ord = null; this.engines.set(k, e);
    }
    const ord = order.join("|");
    if (e.__ord !== ord) { e.updateItems(order.length ? order : Object.keys(this.items).slice(0, 1)); e.__ord = ord; }
    return e;
  }
  authors(id) {
    const a = (this.items[id]?.author || this.items[id]?.editor || []).map(x => x.family || x.literal || "").filter(Boolean);
    return a.length > 2 ? a[0] + " et al." : a.join(" & ") || id;
  }
  tip(c) {
    const en = this.app.loadLocalStorage(LANG) === "en";
    const lines = c.items.map(i => { const r = this.items[i.id]; const y = r?.issued?.["date-parts"]?.[0]?.[0] || ""; return `${this.authors(i.id)}${y ? " (" + y + ")" : ""}. ${r?.title || ""}`; });
    return lines.join("\n") + "\n" + (en ? "⌘/Ctrl + click: open the source note" : "⌘/Ctrl + clic: deschide nota sursei");
  }
  // o citare → { html, title } în stilul dat; n = numărul notei de subsol (pentru stilurile cu note)
  render(style, lang, order, c, n) {
    const key = [style, lang, order.join("|"), c.kind, JSON.stringify(c.items), n].join("§");
    if (this.cache.has(key)) return this.cache.get(key);
    if (this.cache.size > 3000) this.cache.clear();
    let res;
    try {
      const e = this.engine(style, lang, order), note = this.styles.get(style).note, tip = this.tip(c);
      if (c.kind === "c") {
        const html = e.makeCitationCluster(c.items);
        res = note ? { html: `<sup>${n}</sup>`, title: stripTags(html) + "\n\n" + tip, note } : { html, title: tip };
      } else {
        const it = c.items[0];
        let a = e.makeCitationCluster([{ id: it.id, "author-only": true }]);
        if (!stripTags(a).trim() || /NO_PRINTED_FORM/.test(a)) res = { html: e.makeCitationCluster([it]), title: tip };   // stiluri numerotate (IEEE): doar [1, p. 4]
        else if (note) res = { html: `${a}<sup>${n}</sup>`, title: stripTags(e.makeCitationCluster([it])) + "\n\n" + tip, note };
        else { const rest = e.makeCitationCluster([{ ...it, "suppress-author": true }]);   // MLA fără pagină: doar autorul
          res = { html: !stripTags(rest).trim() || /NO_PRINTED_FORM/.test(rest) ? a : a + " " + rest, title: tip }; }
      }
    } catch (err) { console.error("Texere: citarea", err); res = null; }
    this.cache.set(key, res); return res;
  }
  // ordinea surselor în notă (pentru stilurile numerotate, ex. IEEE) și numerele notelor de subsol
  // bibliografia unei note: { html: [intrări], hanging, missing: [citekey-uri necunoscute] }
  bibliography(text) {
    const fm = citeFm(text), style = this.current(fm); if (!style) return null;
    const lang = this.locale(fm.lang), order = [], missing = [];
    // toate sursele citate (și cele dintr-o citare care mai conține un citekey greșit), în ordinea apariției
    for (const c of this.scan(text)) if (c.from >= fm.end) for (const i of c.items) { const l = this.items[i.id] ? order : missing; if (!l.includes(i.id)) l.push(i.id); }
    if (!order.length) return missing.length ? { html: [], hanging: false, missing, style } : null;
    const key = ["bib", style, lang, order.join("|")].join("§");
    let res = this.cache.get(key);
    if (!res) {
      try { const e = this.engine(style, lang, order), [meta, entries] = e.makeBibliography(); res = { html: entries, hanging: !!meta?.hangingindent, style }; }
      catch (err) { console.error("Texere: bibliografia notei", err); res = { html: [], hanging: false, style }; }
      this.cache.set(key, res);
    }
    return { ...res, missing };
  }
  plan(text, style) {
    const fm = citeFm(text), cites = this.scan(text).filter(c => c.from >= fm.end && this.known(c));
    const order = []; for (const c of cites) for (const i of c.items) if (!order.includes(i.id)) order.push(i.id);
    const nums = new Map(); let n = 0; if (this.styles.get(style)?.note) for (const c of cites) nums.set(c.from, ++n);
    return { fm, order, nums };
  }
}

function makeCiteWidget(plugin) {
  const { WidgetType } = require("@codemirror/view");
  return class CiteWidget extends WidgetType {
    constructor(r, ids, trail) { super(); this.r = r; this.ids = ids; this.trail = trail; }
    eq(o) { return o.r.html === this.r.html && o.r.title === this.r.title && o.trail === this.trail; }
    toDOM() { return plugin.citeEl(this.r, this.ids, this.trail); }
    ignoreEvent(e) { return e.type === "mousedown" && (e.metaKey || e.ctrlKey); }   // clic simplu: cursorul intră în citare
  };
}

const CiteStyleMixin = {
  async citations() {
    const { MarkdownView, setIcon, editorLivePreviewField } = require("obsidian");
    const { ViewPlugin, Decoration } = require("@codemirror/view");
    const { RangeSetBuilder, StateEffect } = require("@codemirror/state");
    let syntaxTree = null; try { syntaxTree = require("@codemirror/language").syntaxTree; } catch (e) {}
    const E = this.cite = new CiteEngine(this);
    const CiteWidget = makeCiteWidget(this);
    const refreshFx = this.citeRefreshFx = StateEffect.define();

    // aspect: citarea arată ca textul din jur; la trecerea cu mouse-ul se vede că e o citare
    const css = document.createElement("style"); css.id = "texere-cite-css";
    css.textContent = `.texere-cite-link{color:var(--link-color);text-decoration-line:var(--link-decoration);text-decoration-thickness:var(--link-decoration-thickness, auto);text-underline-offset:var(--link-underline-offset, auto);cursor:var(--cursor-link, pointer)}
.texere-cite-link:hover{color:var(--link-color-hover);text-decoration-line:var(--link-decoration-hover)}
.texere-cite sup{font-size:.72em;line-height:0;color:var(--text-accent);padding-left:1px}
.texere-cite-missing{text-decoration:underline wavy var(--text-error);text-decoration-thickness:1px;text-underline-offset:3px}
.status-bar-item.texere-cite-status{gap:4px;cursor:pointer}
.texere-cite-status svg{width:13px;height:13px}
.texere-csl-guide ol{padding-left:1.3em;margin:0 0 12px}.texere-csl-guide li{margin:0 0 8px;line-height:1.45}
.texere-csl-tip{font-size:var(--font-ui-small);color:var(--text-muted)}
.texere-csl-bar{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
.texere-csl-drop{border:2px dashed var(--background-modifier-border);border-radius:10px;padding:26px 16px;text-align:center;color:var(--text-muted);display:flex;flex-direction:column;align-items:center;gap:8px}
.texere-csl-drop.on{border-color:var(--interactive-accent);background:var(--background-modifier-hover)}
.texere-csl-or{font-size:var(--font-ui-smaller);color:var(--text-faint)}
.texere-csl-pick{position:relative;display:inline-block;padding:6px 16px;border-radius:var(--button-radius,6px);background:var(--interactive-accent);color:var(--text-on-accent);cursor:pointer;font-size:var(--font-ui-small)}
.texere-csl-pick input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%}
.texere-csl-err{margin-bottom:10px;padding:8px 10px;border-radius:6px;background:rgba(var(--color-red-rgb),.1);color:var(--text-error);font-size:var(--font-ui-small)}
.texere-csl-paste{margin-top:12px;font-size:var(--font-ui-small)}.texere-csl-paste summary{cursor:pointer;color:var(--text-muted)}
.texere-csl-paste textarea{width:100%;min-height:120px;margin:8px 0;font-family:var(--font-monospace);font-size:11.5px}
.texere-csl-own{padding:8px 16px 10px;border-top:1px solid var(--background-modifier-border);font-size:var(--font-ui-small);color:var(--text-muted);text-align:center}
.texere-csl-own a{cursor:pointer;color:var(--text-accent)}`;
    document.getElementById("texere-cite-css")?.remove(); document.head.appendChild(css);
    this.register(() => css.remove());

    const skipNode = (st, pos) => {
      if (!syntaxTree) return false;
      try { for (let n = syntaxTree(st).resolveInner(pos, 1); n; n = n.parent) if (/code|math|frontmatter|internal-link|url/i.test(n.name)) return true; } catch (e) {}
      return false;
    };
    const build = view => {
      const st = view.state;
      if (!E.ready || !st.field(editorLivePreviewField, false)) return Decoration.none;
      const text = st.doc.toString(), style0 = E.current(citeFm(text));
      if (!style0) return Decoration.none;
      const { fm, order, nums } = E.plan(text, style0), lang = E.locale(fm.lang);
      const b = new RangeSetBuilder(), sel = st.selection.ranges;
      for (const c of E.scan(text)) {
        if (c.from < fm.end || skipNode(st, c.from)) continue;
        if (!E.known(c)) {
          if (c.kind === "c") b.add(c.from, c.to, Decoration.mark({ class: "texere-cite-missing",
            attributes: { title: (this.app.loadLocalStorage(LANG) === "en" ? "Not in the bibliography: " : "Nu e în bibliografie: ") + c.items.filter(i => !E.items[i.id]).map(i => "@" + i.id).join(", ") } }));
          continue;
        }
        if (sel.some(r => r.from <= c.end && r.to >= c.from)) continue;   // cursorul e pe citare: se vede textul sursă
        const r = E.render(style0, lang, order, c, nums.get(c.from)); if (!r) continue;
        b.add(c.from, c.end, Decoration.replace({ widget: new CiteWidget(r, c.items.map(i => i.id), c.end > c.to) }));
      }
      return b.finish();
    };
    const safe = view => { try { return build(view); } catch (e) { console.error("Texere: afișarea citărilor", e); return Decoration.none; } };
    this.registerEditorExtension(ViewPlugin.fromClass(class {
      constructor(view) { this.decorations = safe(view); }
      update(u) {
        const lp = f => { try { return f.field(editorLivePreviewField, false); } catch (e) { return false; } };
        if (u.docChanged || u.selectionSet || lp(u.state) !== lp(u.startState) || u.transactions.some(t => t.effects.some(e => e.is(refreshFx))))
          this.decorations = safe(u.view);
      }
    }, { decorations: v => v.decorations }));

    // modul Citire (Reading view)
    this.registerMarkdownPostProcessor((el, ctx) => { try { readCites(el, ctx); } catch (e) { console.error("Texere: citările (Citire)", e); } });
    const readCites = (el, ctx) => {
      if (!E.ready) return;
      const info = ctx.getSectionInfo?.(el), full = info?.text || "";
      const style0 = E.styleId(ctx.frontmatter?.csl) || E.current(citeFm(full)); if (!style0) return;
      const { order, nums } = E.plan(full || el.textContent, style0), lang = E.locale(ctx.frontmatter?.lang || citeFm(full).lang);
      // numărul primei note din această secțiune (citările de dinainte de secțiune)
      let n = 0;
      if (E.styles.get(style0).note && info) { const off = full.split("\n").slice(0, info.lineStart).join("\n").length; for (const k of nums.keys()) if (k < off) n++; }
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: t => t.parentElement?.closest("code, pre, a, .frontmatter, .math") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
      const nodes = []; while (walker.nextNode()) if (walker.currentNode.nodeValue.includes("@")) nodes.push(walker.currentNode);
      for (const t of nodes) {
        const s = t.nodeValue, cites = scanCites(s).filter(c => E.known(c)); if (!cites.length) continue;
        const frag = document.createDocumentFragment(); let at = 0;
        for (const c of cites) {
          const nx = t.nextSibling, dot = c.kind === "c" && s.slice(c.to) === " · " && nx?.nodeName === "A";
          const r = E.render(style0, lang, order, c, E.styles.get(style0).note ? ++n : 0); if (!r) continue;
          frag.append(s.slice(at, c.from), this.citeEl(r, c.items.map(i => i.id), dot));
          at = dot ? s.length : c.to;
        }
        frag.append(s.slice(at)); t.replaceWith(frag);
      }
    };

    // bara de jos: stilul notei deschise; clic → alegi alt stil
    const sb = this.citeStatus = this.addStatusBarItem();
    sb.addClass("texere-cite-status"); sb.addClass("mod-clickable");
    const icon = sb.createSpan(), txt = sb.createSpan(); try { setIcon(icon, "quote"); } catch (e) {}
    this.updateCiteStatus = () => {
      const v = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!E.ready || !v?.file || !E.styles.size) { sb.style.display = "none"; return; }
      const fm = citeFm(v.editor?.getValue?.().slice(0, 4000) || ""), id = E.current(fm), en = this.app.loadLocalStorage(LANG) === "en";
      sb.style.display = ""; txt.setText(E.label(id));
      sb.setAttribute("aria-label", en ? "Citation style of this note (click to change)" : "Stilul citărilor din această notă (clic pentru a-l schimba)");
      sb.setAttribute("data-tooltip-position", "top");
    };
    this.registerDomEvent(sb, "click", e => this.citeMenu(e));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.updateCiteStatus()));
    this.registerEvent(this.app.workspace.on("file-open", () => this.updateCiteStatus()));
    this.registerEvent(this.app.metadataCache.on("changed", () => this.updateCiteStatus()));

    this.addCommand({ id: "citation-style-note", name: "Citation style for this note… / Stilul citărilor din notă…", checkCallback: chk => {
      const v = this.app.workspace.getActiveViewOfType(MarkdownView); if (!v?.file) return false;
      if (!chk) this.citePicker(false); return true; } });
    this.addCommand({ id: "citation-style-add", name: "Add a citation style… / Adaugă un stil de citare…", callback: () => this.citeAdd() });
    this.addCommand({ id: "citation-style-default", name: "Default citation style… / Stilul implicit al citărilor…", callback: () => this.citePicker(true) });

    // bibliografia sau stilurile se schimbă → afișarea se actualizează
    let t = null;
    const watch = f => {
      if (!E.ready || !f?.path) return;
      const isCsl = f.extension === "csl" && f.path.startsWith(E.styleDir());   // bibliografia o urmărește biblioteca comună (lib)
      if (!isCsl) return;
      clearTimeout(t); t = setTimeout(async () => { await E.loadStyles(); this.refreshCites(); }, 300);
    };
    for (const ev of ["modify", "create", "delete", "rename"]) this.registerEvent(this.app.vault.on(ev, watch));

    await this.settingsReady();
    try { await E.load(); } catch (e) { console.error("Texere: citările", e); return; }
    this.lib.onChange(async () => { await E.loadBib(); this.refreshCites(); });   // sursă nouă, ștearsă sau bibliografie refăcută
    this.refreshCites();
  },

  // la finalul fiecărei note cu citări: bibliografia, în stilul notei (ca la export; nota nu se modifică)
  bibliographyPanel() {
    const css = document.createElement("style"); css.id = "texere-biblio-css";
    css.textContent = `.texere-biblio{margin:36px 0 24px;padding-top:14px;border-top:1px solid var(--background-modifier-border);user-select:text}
.texere-biblio .tb-h{font-size:var(--h3-size,1.2em);font-weight:var(--h3-weight,600);margin-bottom:10px;color:var(--text-normal)}
.texere-biblio .csl-entry{margin:0 0 8px;line-height:1.5}
.texere-biblio.hang .csl-entry{padding-left:2em;text-indent:-2em}
.texere-biblio .tb-miss{margin-top:10px;font-size:var(--font-ui-small);color:var(--text-error)}
.texere-biblio .tb-note{margin-top:6px;font-size:var(--font-ui-smaller);color:var(--text-faint)}`;
    document.getElementById("texere-biblio-css")?.remove(); document.head.appendChild(css);
    this.register(() => { css.remove(); document.querySelectorAll(".texere-biblio").forEach(e => e.remove()); });
    const tick = this.bibTick = () => this.app.workspace.iterateAllLeaves(l => { if (l.view?.getViewType?.() === "markdown") { try { this.renderBiblio(l.view); } catch (e) { console.error("Texere: bibliografia notei", e); } } });
    let t = null; const soon = (ms = 80) => { clearTimeout(t); t = setTimeout(tick, ms); };
    for (const ev of ["file-open", "layout-change", "active-leaf-change"]) this.registerEvent(this.app.workspace.on(ev, () => soon()));
    this.registerEvent(this.app.workspace.on("editor-change", () => soon(700)));
    this.registerInterval(window.setInterval(tick, 2000));   // modul Citire își redesenează uneori conținutul
    tick();
  },
  renderBiblio(view) {
    const E = this.cite, root = view.containerEl; if (!E?.ready) return;
    let text = ""; try { text = view.getViewData?.() || view.data || ""; } catch (e) {}
    const b = E.bibliography(text);
    const targets = [root.querySelector(".markdown-source-view .cm-sizer"), root.querySelector(".markdown-reading-view .markdown-preview-sizer")].filter(Boolean);
    if (!b) { root.querySelectorAll(".texere-biblio").forEach(e => e.remove()); return; }
    const en = this.app.loadLocalStorage(LANG) === "en";
    // dacă nota are deja un titlu „Bibliografie” (ex. șablonul New article), panoul nu-l mai repetă
    const hasHead = /^#{1,6}\s*(bibliography|bibliografie|references|referințe|referinte|works cited)\s*$/im.test(text);
    const sig = JSON.stringify([b.style, b.html, b.missing, hasHead, en]);
    for (const tg of targets) {
      let p = tg.querySelector(":scope > .texere-biblio");
      if (p && p.dataset.sig === sig) continue;
      const box = document.createElement("div"); box.className = "texere-biblio" + (b.hanging ? " hang" : ""); box.dataset.sig = sig;
      box.addEventListener("mousedown", e => e.stopPropagation());
      if (!hasHead) { const h = document.createElement("div"); h.className = "tb-h"; h.textContent = en ? "Bibliography" : "Bibliografie"; box.appendChild(h); }
      const { sanitizeHTMLToDom } = require("obsidian");
      for (const html of b.html) { try { box.appendChild(sanitizeHTMLToDom(html)); } catch (e) { const d = document.createElement("div"); d.className = "csl-entry"; d.textContent = stripTags(html); box.appendChild(d); } }
      if (b.missing.length) { const m = document.createElement("div"); m.className = "tb-miss";
        m.textContent = (en ? "Not in the bibliography (add the source or fix the citekey): " : "Nu sunt în bibliografie (adaugă sursa sau corectează citekey-ul): ") + b.missing.map(k => "@" + k).join(", "); box.appendChild(m); }
      const n = document.createElement("div"); n.className = "tb-note";
      n.textContent = (en ? `Generated from the citations in this note · ${E.label(b.style)} · updates by itself; export adds it the same way.` : `Generată din citările acestei note · ${E.label(b.style)} · se actualizează singură; exportul o adaugă la fel.`); box.appendChild(n);
      if (p) p.replaceWith(box);
      else if (tg.classList.contains("cm-sizer")) { const cc = tg.querySelector(":scope > .cm-contentContainer"); tg.insertBefore(box, cc ? cc.nextSibling : null); }
      else { const ft = tg.querySelector(":scope > .mod-footer"); tg.insertBefore(box, ft || null); }
    }
  },

  citeEl(r, ids, trail) {
    const { sanitizeHTMLToDom } = require("obsidian");
    // arată ca un link Obsidian (la fel ca „PDF”): un clic deschide nota sursei, Cmd/Ctrl+clic într-un tab nou
    const s = document.createElement("span"); s.className = "texere-cite";
    const a = s.appendChild(document.createElement("span")); a.className = "texere-cite-link"; a.title = r.title;
    try { a.appendChild(sanitizeHTMLToDom(r.html)); } catch (e) { a.textContent = stripTags(r.html); }
    if (trail) s.appendChild(document.createTextNode(" "));
    const path = () => this.cite.raw[ids[0]]?.obsidianPath;
    a.addEventListener("mousedown", e => { if (e.button === 0 && path()) { e.preventDefault(); e.stopPropagation(); } });
    a.addEventListener("click", e => {
      const p = path(); if (!p) return;
      e.preventDefault(); e.stopPropagation();
      this.app.workspace.openLinkText(p, this.app.workspace.getActiveFile()?.path || "", e.metaKey || e.ctrlKey);
    });
    return s;
  },

  refreshCites() {
    for (const f of this._citeHooks || []) { try { f(); } catch (e) {} }   // ex. pagina de setări deschisă se actualizează
    try { this.bibTick?.(); } catch (e) {}
    this.app.workspace.iterateAllLeaves(l => {
      const v = l.view; if (v?.getViewType?.() !== "markdown") return;
      try { v.editor?.cm?.dispatch({ effects: this.citeRefreshFx.of(null) }); } catch (e) {}
      try { if (v.getMode?.() === "preview") v.previewMode?.rerender(true); } catch (e) {}
    });
    this.updateCiteStatus?.();
  },

  // meniul din bara de jos: stilurile, cel curent bifat
  citeMenu(evt) {
    const { Menu, MarkdownView } = require("obsidian");
    const E = this.cite, en = this.app.loadLocalStorage(LANG) === "en";
    const v = this.app.workspace.getActiveViewOfType(MarkdownView); if (!v?.file) return;
    const cur = E.current(citeFm(v.editor.getValue().slice(0, 4000))), def = E.defaultId();
    const m = new Menu();
    m.addItem(i => i.setTitle(en ? "Citation style for this note" : "Stilul citărilor din această notă").setDisabled(true));
    for (const s of E.list()) m.addItem(i => i.setTitle(s.label + (s.id === def ? (en ? "  · default" : "  · implicit") : "")).setChecked(s.id === cur).onClick(() => this.setNoteStyle(v.file, s.id)));
    m.addSeparator();
    m.addItem(i => i.setTitle(en ? `Default for all notes: ${E.label(def)}…` : `Implicit pentru toate notele: ${E.label(def)}…`).setIcon("settings-2").onClick(() => this.citePicker(true)));
    m.addItem(i => i.setTitle(en ? "Add a style…" : "Adaugă un stil…").setIcon("plus").onClick(() => this.citeAdd()));
    if (E.styles.size > 1) m.addItem(i => i.setTitle(en ? "Remove a style…" : "Șterge un stil…").setIcon("trash-2").onClick(() => this.citeRemove()));
    m.showAtMouseEvent(evt);
  },

  citePicker(isDefault) {
    const { FuzzySuggestModal, MarkdownView } = require("obsidian");
    const E = this.cite, en = this.app.loadLocalStorage(LANG) === "en", plugin = this;
    const v = this.app.workspace.getActiveViewOfType(MarkdownView);
    const M = class extends FuzzySuggestModal {
      getItems() { return E.list(); }
      getItemText(s) { return s.label + "  —  " + s.title; }
      onChooseItem(s) { if (isDefault) plugin.setDefaultStyle(s.id); else if (v?.file) plugin.setNoteStyle(v.file, s.id); }
    };
    const md = new M(this.app);
    md.setPlaceholder(isDefault ? (en ? "Default citation style for all notes" : "Stilul implicit al citărilor, pentru toate notele") : (en ? "Citation style for this note" : "Stilul citărilor din această notă"));
    md.open();
  },

  // stilul notei = proprietatea csl (o citește și Texere · Export); stilul implicit nu mai are nevoie de proprietate
  // „Adaugă un stil”: caută printre cele ~10.000 de stiluri CSL (indexul din folderul pluginului) și îl instalează dintr-un clic
  async citeIndex() {
    if (this._citeIdx) return this._citeIdx;
    const raw = JSON.parse(await this.app.vault.adapter.read(this.sourcesDir + "/styles-index.json"));
    return (this._citeIdx = raw.styles.map(([name, title, f, parent]) => ({ name, title: title || name, format: raw.formats[f], dep: parent !== undefined, hay: (name + " " + (title || "")).toLowerCase() })));
  },

  async citeAdd(noNote) {
    const { SuggestModal, MarkdownView } = require("obsidian");
    const E = this.cite, en = this.app.loadLocalStorage(LANG) === "en", plugin = this;
    let idx; try { idx = await this.citeIndex(); } catch (e) { new Notice(en ? "I can't find the list of styles (styles-index.json in the Texere plugin)." : "Nu găsesc lista stilurilor (styles-index.json din pluginul Texere)."); return; }
    const file = noNote ? null : this.app.workspace.getActiveViewOfType(MarkdownView)?.file;   // din Settings: doar instalează, nu schimbă nota deschisă
    const FMT = { "author-date": en ? "Author–date · (Smith, 2020)" : "Autor–an · (Smith, 2020)", numeric: en ? "Numbered · [1]" : "Numerotat · [1]",
      note: en ? "Footnotes" : "Note de subsol", author: en ? "Author · (Smith 12)" : "Autor · (Smith 12)", label: en ? "Label · [Smi20]" : "Etichetă · [Smi20]" };
    const POPULAR = ["apa", "chicago-author-date", "chicago-notes-bibliography", "modern-language-association", "harvard-cite-them-right", "ieee",
      "nlm-citation-sequence", "american-medical-association", "american-sociological-association", "american-political-science-association", "turabian-author-date", "nature", "elsevier-harvard", "springer-basic-author-date", "iso690-author-date-en"];
    const M = class extends SuggestModal {
      getSuggestions(q) {
        const w = q.toLowerCase().split(/\s+/).filter(Boolean);
        const st = x => (x.title.toLowerCase().startsWith(w[0]) || x.name.startsWith(w[0]) || x.title.toLowerCase().includes("/" + w[0])) ? 0 : 1;   // titlul începe cu ce ai scris
        if (!w.length) return POPULAR.map(n => idx.find(x => x.name === n)).filter(Boolean);
        // întâi stilurile principale (nu variantele unei reviste), apoi titlurile scurte
        return idx.filter(x => w.every(t => x.hay.includes(t))).sort((a, b) => (st(a) - st(b)) || (a.dep - b.dep) || (a.title.length - b.title.length)).slice(0, 60);
      }
      renderSuggestion(x, el) {
        el.createDiv({ text: x.title }).style.fontWeight = "500";
        const has = E.styles.has(x.name);
        const d = el.createDiv({ text: [FMT[x.format] || x.format, x.name, has ? (en ? "✓ installed" : "✓ instalat") : ""].filter(Boolean).join("  ·  ") });
        d.style.cssText = "font-size:0.82em;color:var(--text-muted)";
      }
      onChooseSuggestion(x) { plugin.citeInstall(x, file); }
    };
    const md = new M(this.app);
    md.setPlaceholder(en ? "Search a style: APA, Vancouver, a journal's name…" : "Caută un stil: APA, Vancouver, numele unei reviste…");
    md.setInstructions([{ command: "↵", purpose: file ? (en ? "install and use in this note" : "instalează și folosește în notă") : (en ? "install" : "instalează") }]);
    md.limit = 60; md.open();
    // stilul tău nu e un rezultat al căutării: un rând discret, sub listă
    const ft = md.modalEl.createDiv("texere-csl-own");
    ft.createSpan({ text: en ? "Your own style? " : "Ai un stil propriu? " });
    const a1 = ft.createEl("a", { text: en ? "Import a .csl file" : "Importă un fișier .csl" }); a1.addEventListener("click", () => { md.close(); this.citeImport(file); });
    ft.createSpan({ text: " · " });
    const a2 = ft.createEl("a", { text: en ? "How to make one" : "Cum îl faci" }); a2.addEventListener("click", () => { md.close(); this.citeGuide(file); });
  },

  async citeInstall(x, file) {
    const { requestUrl } = require("obsidian");
    const E = this.cite, en = this.app.loadLocalStorage(LANG) === "en", ad = this.app.vault.adapter;
    const path = (E.styleDir() ? E.styleDir() + "/" : "") + x.name + ".csl";
    if (!(await ad.exists(path))) {
      const get = async (name, dep) => {
        for (const url of [`https://raw.githubusercontent.com/citation-style-language/styles/master/${dep ? "dependent/" : ""}${name}.csl`, `https://www.zotero.org/styles/${name}`]) {
          try { const r = await requestUrl({ url, throw: false }); if (r.status === 200 && /<style[\s>]/.test(r.text)) return r.text; } catch (e) {}
        }
        throw new Error(name);
      };
      const wait = new Notice((en ? "Installing " : "Instalez ") + x.title + "…", 0);
      try {
        let xml = await get(x.name, x.dep);
        // stilul unei reviste (dependent) folosește regulile altui stil: le copiem, cu titlul revistei, ca să meargă și fără internet
        const par = /href="https?:\/\/www\.zotero\.org\/styles\/([^"]+)"\s+rel="independent-parent"/.exec(xml);
        if (par) {
          let p = await get(par[1], false);
          const title = (/<title>([^<]*)<\/title>/.exec(xml) || [])[1], loc = (/default-locale="([^"]+)"/.exec(xml) || [])[1];
          if (title) p = p.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);
          if (loc) p = /default-locale="/.test(p) ? p.replace(/default-locale="[^"]*"/, `default-locale="${loc}"`) : p.replace(/<style\b/, `<style default-locale="${loc}"`);
          xml = p;
        }
        await ad.write(path, xml);
      } catch (e) {
        wait.hide();
        new Notice(en ? `I couldn't download ${x.title}. Check the internet connection and try again.` : `Nu am putut descărca ${x.title}. Verifică conexiunea la internet și încearcă din nou.`, 8000);
        return;
      }
      wait.hide();
    }
    await E.loadStyles(); this.refreshCites();
    if (file) { await this.setNoteStyle(file, x.name); new Notice((en ? "Installed and used in this note: " : "Instalat și folosit în această notă: ") + E.label(x.name)); }
    else new Notice((en ? "Installed: " : "Instalat: ") + E.label(x.name));
  },

  // stilul tău: o fereastră mică în care alegi fișierul .csl, îl tragi din Finder sau lipești codul
  citeImport(file) {
    const { Modal } = require("obsidian");
    const en = this.app.loadLocalStorage(LANG) === "en", T = (ro, e) => en ? e : ro, plugin = this;
    const M = class extends Modal {
      onOpen() {
        this.titleEl.setText(T("Importă un stil (.csl)", "Import a style (.csl)"));
        const c = this.contentEl; c.addClass("texere-csl-import");
        const err = c.createDiv("texere-csl-err"); err.style.display = "none";
        const run = async (text) => {
          err.style.display = "none";
          try { await plugin.citeImportText(text, file); this.close(); }
          catch (e) { console.error("Texere: stilul importat", e); err.setText(T("Nu pot folosi acest stil: ", "I can't use this style: ") + e.message); err.style.display = ""; }
        };
        // zona în care tragi fișierul; „Alege un fișier” e chiar câmpul de fișier (clicul ajunge direct la el)
        const drop = c.createDiv("texere-csl-drop");
        drop.createDiv({ text: T("Trage aici fișierul .csl", "Drag the .csl file here") });
        drop.createDiv({ cls: "texere-csl-or", text: T("sau", "or") });
        const lab = drop.createEl("label", { cls: "texere-csl-pick mod-cta", text: T("Alege un fișier…", "Choose a file…") });
        const inp = lab.createEl("input", { type: "file" }); inp.accept = ".csl,.xml,application/xml,text/xml";
        inp.addEventListener("change", async () => { const f = inp.files?.[0]; if (f) await run(await f.text()); inp.value = ""; });
        for (const ev of ["dragenter", "dragover"]) drop.addEventListener(ev, e => { e.preventDefault(); drop.addClass("on"); });
        for (const ev of ["dragleave", "drop"]) drop.addEventListener(ev, () => drop.removeClass("on"));
        drop.addEventListener("drop", async e => { e.preventDefault(); const f = e.dataTransfer?.files?.[0]; if (f) await run(await f.text()); });
        // sau codul lipit (ex. copiat din Visual CSL Editor → Style → View CSL code)
        const det = c.createEl("details", { cls: "texere-csl-paste" }); det.createEl("summary", { text: T("Sau lipește codul stilului", "Or paste the style's code") });
        const ta = det.createEl("textarea", { attr: { placeholder: '<?xml version="1.0" encoding="utf-8"?>\n<style xmlns="http://purl.org/net/xbiblio/csl" …' } });
        const go = det.createEl("button", { cls: "mod-cta", text: T("Importă", "Import") });
        go.addEventListener("click", () => { if (ta.value.trim()) run(ta.value); });
        const help = c.createEl("p", { cls: "texere-csl-tip" }); help.appendText(T("Nu ai încă un stil? ", "No style yet? "));
        const g = help.createEl("a", { text: T("Vezi cum îl faci, fără cod", "See how to make one, without code") }); g.addEventListener("click", () => { this.close(); plugin.citeGuide(file); });
      }
      onClose() { this.contentEl.empty(); }
    };
    new M(this.app).open();
  },
  async citeImportText(xml, file) {
    const { requestUrl } = require("obsidian");
    const E = this.cite, en = this.app.loadLocalStorage(LANG) === "en", ad = this.app.vault.adapter;
    xml = String(xml).replace(/^\uFEFF/, "");
    if (!/<style\b[^>]*xmlns="http:\/\/purl\.org\/net\/xbiblio\/csl"/.test(xml)) throw new Error(en ? "this isn't a CSL style file (.csl)." : "acesta nu e un fișier de stil CSL (.csl).");
    // stilul unei reviste care doar trimite la alt stil: aducem regulile acelui stil, ca la „+ Adaugă un stil”
    const par = /href="https?:\/\/www\.zotero\.org\/styles\/([^"]+)"\s+rel="independent-parent"/.exec(xml) || /rel="independent-parent"\s+href="https?:\/\/www\.zotero\.org\/styles\/([^"]+)"/.exec(xml);
    if (par && !/<citation\b/.test(xml)) {
      let p = null;
      for (const url of [`https://raw.githubusercontent.com/citation-style-language/styles/master/${par[1]}.csl`, `https://www.zotero.org/styles/${par[1]}`]) {
        try { const r = await requestUrl({ url, throw: false }); if (r.status === 200 && /<style[\s>]/.test(r.text)) { p = r.text; break; } } catch (e) {}
      }
      if (!p) throw new Error(en ? `it relies on the “${par[1]}” style, which I couldn't download. Check the internet connection.` : `se bazează pe stilul „${par[1]}”, pe care nu l-am putut descărca. Verifică conexiunea la internet.`);
      const t = (/<title>([^<]*)<\/title>/.exec(xml) || [])[1]; if (t) p = p.replace(/<title>[^<]*<\/title>/, `<title>${t}</title>`);
      xml = p;
    }
    // fișierul trebuie să fie XML corect și să aibă regulile pentru citare
    try { const doc = new window.DOMParser().parseFromString(xml, "application/xml"); const pe = doc.getElementsByTagName("parsererror")[0];
      if (pe) throw new Error((pe.textContent || "").split("\n").find(Boolean)?.slice(0, 140) || "XML"); } catch (e) { throw new Error((en ? "the file is damaged (" : "fișierul e deteriorat (") + e.message + ")."); }
    if (!/<citation\b/.test(xml)) throw new Error(en ? "the style has no citation rules (<citation>)." : "stilul nu are regulile pentru citare (<citation>).");
    let title = ((/<title>([^<]*)<\/title>/.exec(xml) || [])[1] || "").trim();
    if (!title) throw new Error(en ? "the style has no title (Style Info → Title in the Visual CSL Editor)." : "stilul nu are titlu (Style Info → Title în Visual CSL Editor).");
    // același titlu ca un stil instalat, dar alt fișier (ex. o copie a APA nemodificată la nume): îl marcăm ca al tău, ca să nu le confunzi
    const slug = t => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "my-style";
    let id = slug(title);
    const twin = [...E.styles.values()].find(st => st.title === title && st.id !== id);
    if (twin) { title += en ? " (mine)" : " (al meu)"; xml = xml.replace(/<title>[^<]*<\/title>/, `<title>${title.replace(/&/g, "&amp;")}</title>`); id = slug(title); }
    const old = E.styles.get(id);
    if (old && old.title !== title) { let n = 2; while (E.styles.has(`${id}-${n}`)) n++; id = `${id}-${n}`; }
    // îl încercăm înainte să-l copiem: un stil stricat nu trebuie să strice citările din note
    let probe;
    try { probe = E.sample(xml); } catch (e) { throw new Error((en ? "citeproc can't read it (" : "citeproc nu îl poate citi (") + String(e.message || e).slice(0, 160) + ")."); }
    const path = (E.styleDir() ? E.styleDir() + "/" : "") + id + ".csl";
    if (E.styleDir() && !(await ad.exists(E.styleDir()))) await this.app.vault.createFolder(E.styleDir());
    await ad.write(path, xml);
    await E.loadStyles(); this.refreshCites();
    if (file) await this.setNoteStyle(file, id);
    const msg = document.createDocumentFragment(), line = (t, css) => { const d = document.createElement("div"); d.textContent = t; if (css) d.style.cssText = css; msg.appendChild(d); };
    line((old ? (en ? "Updated: " : "Actualizat: ") : (en ? "Added: " : "Adăugat: ")) + E.label(id) + (file ? (en ? " (used in this note)" : " (folosit în această notă)") : ""));
    line(probe.cite, "margin-top:6px;opacity:.85"); if (probe.bib) line(probe.bib, "opacity:.85");
    new Notice(msg, 10000);
    return id;
  },
  // ghidul pentru un stil propriu: pașii, cu butoanele pentru editor și pentru import
  citeGuide(file) {
    const { Modal } = require("obsidian");
    const en = this.app.loadLocalStorage(LANG) === "en", plugin = this, T = (ro, e) => en ? e : ro, dir = this.cite.styleDir();
    const M = class extends Modal {
      onOpen() {
        this.titleEl.setText(T("Propriul tău stil de citare", "Your own citation style"));
        const c = this.contentEl; c.addClass("texere-csl-guide");
        c.createEl("p", { text: T("Un stil de citare e un fișier .csl. Nu trebuie scris de mână: îl faci în Visual CSL Editor, gratuit, în browser, fără cont, pornind de la stilul cel mai apropiat.",
          "A citation style is a .csl file. You don't have to write it by hand: you make it in the Visual CSL Editor, free, in the browser, no account, starting from the closest style.") });
        const ol = c.createEl("ol");
        const step = (b, t) => { const li = ol.createEl("li"); li.createEl("strong", { text: b }); li.appendText(" " + t); };
        step(T("Pornește de la un stil.", "Start from a style."), T("În editor: Search by Name (ex. APA) sau Search by Example: scrii cum vrei să arate o citare și găsește stilul cel mai apropiat. Apoi Edit Style.",
          "In the editor: Search by Name (e.g. APA) or Search by Example: you type how a citation should look and it finds the closest style. Then Edit Style."));
        step(T("Dă-i numele tău.", "Give it your name."), T("Style Info → Title (ex. „APA – departamentul de filosofie”), ca să nu înlocuiască stilul de la care ai pornit.",
          "Style Info → Title (e.g. “APA – philosophy department”), so it doesn't replace the style you started from."));
        step(T("Schimbă ce ai nevoie.", "Change what you need."), T("Dai clic pe o parte din exemplu (autor, an, titlu, pagină) și îi schimbi ordinea, punctuația, cursivele. Exemplul se actualizează pe loc.",
          "Click a part of the example (author, year, title, page) and change its order, punctuation, italics. The example updates as you go."));
        step(T("Salvează.", "Save it."), T("Style → Save Style descarcă fișierul .csl.", "Style → Save Style downloads the .csl file."));
        step(T("Adaugă-l aici.", "Add it here."), T("„Importă fișierul .csl”, mai jos. Apare la Stilurile instalate și în meniul din bara de jos, iar exportul îl folosește la fel.",
          "“Import the .csl file”, below. It appears under Installed styles and in the menu at the bottom of the window, and the export uses it too."));
        c.createEl("p", { cls: "texere-csl-tip", text: T(`Ca să-l modifici mai târziu: în editor, Style → Load Style și alegi fișierul din ${dir}. Îl imporți din nou cu același titlu și îl înlocuiește pe cel vechi. Un stil primit de la universitate sau de la o revistă (.csl) se importă la fel.`,
          `To change it later: in the editor, Style → Load Style and pick the file in ${dir}. Import it again with the same title and it replaces the old one. A style you got from your university or a journal (.csl) is imported the same way.`) });
        const bar = c.createDiv("texere-csl-bar");
        const open = bar.createEl("button", { text: T("Deschide Visual CSL Editor ↗", "Open the Visual CSL Editor ↗") });
        open.addEventListener("click", () => window.open("https://editor.citationstyles.org/searchByName/"));
        const imp = bar.createEl("button", { cls: "mod-cta", text: T("Importă fișierul .csl…", "Import the .csl file…") });
        imp.addEventListener("click", () => { this.close(); plugin.citeImport(file); });
      }
      onClose() { this.contentEl.empty(); }
    };
    new M(this.app).open();
  },

  // „Șterge un stil”: fișierul .csl merge la coșul de gunoi; notele care îl foloseau trec la stilul implicit
  // șterge un stil: fișierul .csl merge la coșul de gunoi; notele care îl foloseau trec la stilul implicit
  async removeStyle(id) {
    const E = this.cite, en = this.app.loadLocalStorage(LANG) === "en";
    if (id === E.defaultId()) { new Notice(en ? "The default style can't be removed; choose another default first." : "Stilul implicit nu se poate șterge; alege întâi alt stil implicit."); return; }
    const f = this.app.vault.getAbstractFileByPath((E.styleDir() ? E.styleDir() + "/" : "") + id + ".csl"); if (!f) return;
    const label = E.label(id);
    await this.app.vault.trash(f, true); await E.loadStyles(); this.refreshCites();
    new Notice((en ? "Removed: " : "Șters: ") + label);
  },

  citeRemove() {
    const { FuzzySuggestModal } = require("obsidian");
    const E = this.cite, en = this.app.loadLocalStorage(LANG) === "en", plugin = this, def = E.defaultId();
    const M = class extends FuzzySuggestModal {
      getItems() { return E.list().filter(s => s.id !== def); }
      getItemText(s) { return s.label + "  —  " + s.title; }
      async onChooseItem(s) { await plugin.removeStyle(s.id); }
    };
    const md = new M(this.app);
    md.setPlaceholder(en ? "Which style do you want to remove? (the default style can't be removed)" : "Ce stil vrei să ștergi? (stilul implicit nu se poate șterge)");
    md.open();
  },

  async setNoteStyle(file, id) {
    await this.app.fileManager.processFrontMatter(file, fm => { if (id === this.cite.defaultId()) delete fm.csl; else fm.csl = id; });
  },

  async setDefaultStyle(id) {
    this.settings.citationStyle = id; await this.saveData(this.settings);
    this.refreshCites();
    new Notice((this.app.loadLocalStorage(LANG) === "en" ? "Default citation style: " : "Stilul implicit al citărilor: ") + this.cite.label(id));
  },
};


// instalează citările pe pluginul gazdă (metodele rulează cu „this” = pluginul, ca înainte)
module.exports = {
  async install(host) {
    Object.assign(host, CiteStyleMixin);
    host.registerEditorSuggest(new CiteSuggest(host));   // scrii @ → alegi sursa → [@citekey]
    await host.citations();                                // [@citekey, p. 61] → (Autor, an, p. 61) în stilul ales
    host.bibliographyPanel();                              // bibliografia la finalul fiecărei note cu citări
  },
  CITE_KEY, scanCites, citeFm,
};
