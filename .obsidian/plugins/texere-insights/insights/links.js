// Texere · Insights · vault-ul citit o dată, pentru toate: menționările fără link (și linkul cu un clic), numele care n-au încă notă,
// aliasurile sugerate, notele care par dublate și, pentru tipare, ce concepte apar în fiecare paragraf, citările și evidențierile.
// Se citesc doar notele schimbate de la ultima trecere; rezultatele stau în cache/<laptop>.json (nu ajung pe GitHub).
const { Notice, TFile, requestUrl } = require("obsidian");
const X = require("./text");

const sleep = ms => new Promise(r => setTimeout(r, ms));
const MONTHS = new Set("january february march april may june july august september october november december ianuarie februarie martie aprilie mai iunie iulie august septembrie octombrie noiembrie decembrie monday tuesday wednesday thursday friday saturday sunday luni marti miercuri joi vineri sambata duminica".split(" "));
const NOT_NAMES = new Set("texere obsidian zotero chapter capitolul introducere introduction conclusion concluzie figure figura tabel table note nota pdf the this that these those there what when where which while however therefore also according conform potrivit astfel deci asadar insa totusi daca cand unde care acest aceasta aceste acesta prin pentru dupa intre despre".split(" "));
const CLAIM_RX = /\b(therefore|thus|hence|consequently|shows? that|argues?|claims?|according to|evidence|studies|research|suggests? that|demonstrates?|proves?|it follows|deci|așadar|asadar|prin urmare|rezultă|rezulta|arată că|arata ca|susține|sustine|afirmă|afirma|potrivit lui|conform lui|după cum arată|studiile|cercetările|demonstrează|demonstreaza|dovedește|dovedeste)\b|\d+\s?%/i;

function lev1(a, b) {   // distanța de editare este 1 (o literă schimbată, adăugată, ștearsă sau două inversate)?
  if (a === b) return false; const la = a.length, lb = b.length; if (Math.abs(la - lb) > 1) return false;
  let i = 0; while (i < la && i < lb && a[i] === b[i]) i++;
  if (la === lb) { if (a.slice(i + 1) === b.slice(i + 1)) return true; return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2); }
  return la > lb ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

const LinksMixin = {
  // ——— ce se caută și unde ———
  targetFolders() { return (this.settings.targetFolders?.length ? this.settings.targetFolders : ["Fields"]).map(f => String(f).replace(/\/+$/, "")); },
  inFolders(path, list) { return list.some(f => f && (path === f || path.startsWith(f + "/"))); },
  isTarget(path) { return this.inFolders(path, this.targetFolders()); },
  scanExcluded(path) { return this.inFolders(path, (this.settings.scanExclude || ["Support"]).map(f => String(f).replace(/\/+$/, ""))) || path.startsWith(".trash/"); },
  isOwn(path) { return !this.isLit(path) && !this.isTarget(path) && !this.scanExcluded(path); },
  termEntries() {
    const out = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!this.isTarget(f.path)) continue;
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter || {}; let al = fm.aliases ?? fm.alias ?? [];
      if (!Array.isArray(al)) al = String(al).split(","); al = al.map(a => String(a || "").trim()).filter(a => a && !a.startsWith("@"));
      out.push({ path: f.path, terms: [f.basename, ...al], mtime: f.stat?.mtime || 0 });
    }
    return out;
  },
  termIndex() {
    const entries = this.termEntries(), ign = this.settings.ignoreTerms || [];
    const sig = JSON.stringify([entries.map(e => [e.path, e.terms]), ign, this.settings.minTerm || 4]);
    if (this._idx && this._idxSig === sig) return this._idx;
    this._idx = X.buildIndex(entries, { ignore: ign, min: this.settings.minTerm || 4 }); this._idx.sig = sig; this._idx.entries = entries; this._idxSig = sig;
    return this._idx;
  },

  // ——— trecerea prin vault ———
  async loadScanCache() {
    try { const d = JSON.parse(await this.app.vault.adapter.read(`${this.manifest.dir}/cache/${this.dev}.json`)); if (d?.notes) this.scanCache = d; } catch (e) {}
    if (!this.scanCache) this.scanCache = { at: 0, sig: "", notes: {} };
  },
  async saveScanCache() {
    const ad = this.app.vault.adapter, dir = `${this.manifest.dir}/cache`;
    try { if (!(await ad.exists(dir))) await ad.mkdir(dir); await ad.write(`${dir}/${this.dev}.json`, JSON.stringify(this.scanCache)); } catch (e) { console.error("Texere · Insights: cache", e); }
  },
  // full = citește tot (altfel doar notele schimbate); întoarce numărul de menționări fără link
  async scan(full, quiet) {
    if (this._scanning) return this._scanning;
    this._scanning = (async () => {
      const t0 = Date.now(), idx = this.termIndex(), C = this.scanCache || (this.scanCache = { at: 0, sig: "", notes: {} });
      const sig = idx.sig + "|" + JSON.stringify([this.settings.scanQuotes, this.settings.scanExclude, this.hlTags(), 3]);
      if (C.sig !== sig) { full = true; C.sig = sig; }
      const files = this.app.vault.getMarkdownFiles().filter(f => !this.scanExcluded(f.path)), seen = new Set();
      let n = 0;
      for (const f of files) {
        seen.add(f.path);
        const old = C.notes[f.path];
        if (!full && old && old.mtime === f.stat.mtime && old.size === f.stat.size) continue;
        try { C.notes[f.path] = await this.scanNote(f, idx); } catch (e) { console.error("Texere · Insights: nota", f.path, e); }
        if (++n % 15 === 0) await sleep(0);   // interfața rămâne liberă
      }
      for (const p of Object.keys(C.notes)) if (!seen.has(p)) delete C.notes[p];
      C.at = Date.now(); C.ms = Date.now() - t0; C.read = n;
      // „linkurile existente” se schimbă și fără să se schimbe nota (ai creat nota-țintă): le verificăm la fiecare trecere
      this.computeLinks(); this.computeNames(); this.computeAliases(); this.computeDuplicates();
      await this.saveScanCache(); this.changed();
      if (!quiet) new Notice(this.T(`Texere · Insights: ${this.unlinked.length} menționări fără link în ${new Set(this.unlinked.map(u => u.note)).size} note.`, `Texere · Insights: ${this.unlinked.length} unlinked mentions in ${new Set(this.unlinked.map(u => u.note)).size} notes.`), 5000);
      return this.unlinked.length;
    })();
    try { return await this._scanning; } finally { this._scanning = null; }
  },
  async scanNote(f, idx) {
    const text = await this.app.vault.cachedRead(f), lit = this.isLit(f.path), cache = this.app.metadataCache.getFileCache(f) || {};
    const hlTags = this.hlTags(), skip = X.skipRanges(text, { skipQuotes: !this.settings.scanQuotes, hlTags });
    const all = X.matchAll(idx, text, skip), ent = { mtime: f.stat.mtime, size: f.stat.size, ctime: f.stat.ctime, kind: lit ? "lit" : this.isTarget(f.path) ? "target" : "own" };
    const fm = cache.frontmatter || {}, created = Date.parse(fm.dateCreated || fm.created || fm["date-created"] || "") || f.stat.ctime;
    ent.created = created;
    ent.words = X.countWords(text);
    // prima menționare a fiecărui concept (pentru linkuri) și câte menționări are fiecare
    const first = {}, counts = {};
    for (const m of all) for (const p of m.g.paths) { counts[p] = (counts[p] || 0) + 1; if (!first[p] && p !== f.path) { const c = X.context(text, m.from, m.to); first[p] = { from: m.from, to: m.to, hit: text.slice(m.from, m.to), b: c.before, a: c.after, amb: m.g.paths.length > 1 }; } }
    ent.first = first; ent.counts = counts;
    // paragrafele: ce concepte apar împreună (cu sau fără link), pentru tipare
    const resolve = l => { const t = this.app.metadataCache.getFirstLinkpathDest(String(l).split("#")[0].split("|")[0], f.path); return t && this.isTarget(t.path) ? t.path : null; };
    const paras = [];
    for (const p of X.paragraphs(text)) {
      const set = new Set();
      for (const m of all) if (m.from >= p.from && m.to <= p.to) m.g.paths.forEach(x => set.add(x));
      const lr = /\[\[([^\]|#]+)/g; let lm; while ((lm = lr.exec(p.text))) { const r = resolve(lm[1]); if (r) set.add(r); }
      set.delete(f.path);
      const isHl = lit && (/\.pdf#page=/i.test(p.text) || new RegExp(`(^|\\n)#(${hlTags.join("|")})\\s`, "i").test(p.text));
      if (set.size) paras.push({ c: [...set].slice(0, 14), hl: isHl ? 1 : 0 });
    }
    ent.paras = paras;
    // conceptele din proprietăți (domain, concepts, theories…) și linkurile notei
    const fmLinks = new Set(); for (const l of cache.frontmatterLinks || []) { const r = resolve(l.link); if (r) fmLinks.add(r); }
    ent.fm = [...fmLinks];
    if (lit) {
      const hl = {}, qs = []; let tag;
      for (const t of cache.tags || []) { tag = t.tag.replace(/^#/, "").toLowerCase(); if (hlTags.includes(tag)) { hl[tag] = (hl[tag] || 0) + 1; if (tag === "question" && qs.length < 40) { const line = text.split("\n")[t.position.start.line] || ""; qs.push(line.replace(/^#\w+\s*/, "").replace(/\s*\[@[^\]]*\].*$/, "").trim().slice(0, 300)); } } }
      ent.hl = hl; ent.qs = qs; ent.id = fm.id || fm["citation-key"] || null;
      // cuvintele importante ale sursei (pentru citările sugerate)
      ent.toks = this.topTokens(text, 120);
    } else {
      const cites = []; const cr = /\[@([^\],;\s]+)/g; let cm; while ((cm = cr.exec(text))) cites.push(cm[1].replace(/[.,;:]+$/, ""));
      const more = /;\s*@([^\],;\s]+)/g; while ((cm = more.exec(text))) cites.push(cm[1].replace(/[.,;:]+$/, ""));
      ent.cites = cites;
      // numele cu literă mare din textul tău (pentru „nume fără notă”) și cuvintele lungi (pentru variante de scriere)
      if (ent.kind === "own") { ent.names = this.nameCandidates(text, skip); ent.lw = this.longWords(text, skip); ent.acr = (text.match(/\b[A-Z]{2,6}\b/g) || []).reduce((o, a) => (o[a] = (o[a] || 0) + 1, o), {}); }
    }
    return ent;
  },
  topTokens(text, n) {
    const f = X.fold(text.replace(/^---[\s\S]*?\n---/, "")), cnt = {}; const re = /[\p{L}]{5,}/gu; let m;
    while ((m = re.exec(f))) { const w = m[0]; if (X.STOP.has(w)) continue; cnt[w] = (cnt[w] || 0) + 1; }
    return Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, n).map(e => e[0]);
  },
  nameCandidates(text, skip) {
    const out = {}; const re = /(?<![\p{L}\p{N}])(\p{Lu}[\p{Ll}’'\-]{2,}(?:\s+(?:de|von|van|du|la|der|al|ibn)?\s*\p{Lu}[\p{Ll}’'\-]{2,}){0,2})(?![\p{L}\p{N}])/gu; let m;
    while ((m = re.exec(text))) {
      const a = m.index, b = a + m[0].length; if (X.inRanges(skip, a, b)) continue;
      const before = text.slice(Math.max(0, a - 3), a), start = a === 0 || /(^|[.!?:…]\s*|\n\s*[-*>\d.]*\s*)$/.test(before) || /\n\s*$/.test(text.slice(Math.max(0, a - 12), a));
      // la început de propoziție orice cuvânt are literă mare: „Pentru Heidegger” → „Heidegger”; un singur cuvânt acolo nu contează
      const ws = m[1].trim().split(/\s+/); if (start) ws.shift();
      while (ws.length && (NOT_NAMES.has(X.fold(ws[0])) || X.STOP.has(X.fold(ws[0])) || MONTHS.has(X.fold(ws[0])) || !/^\p{Lu}/u.test(ws[0]))) ws.shift();
      const name = ws.join(" "), k = X.fold(name); if (!name || k.length < 4 || NOT_NAMES.has(k) || MONTHS.has(k) || X.STOP.has(k)) continue;
      out[name] = (out[name] || 0) + 1;
    }
    return out;
  },
  longWords(text, skip) {
    const out = {}; const re = /[\p{L}]{6,}/gu; let m; while ((m = re.exec(text))) { if (X.inRanges(skip, m.index, m.index + m[0].length)) continue; out[m[0]] = (out[m[0]] || 0) + 1; }
    return out;
  },

  // ——— menționările fără link: prima din fiecare notă, dacă nota nu are deja linkul ———
  computeLinks() {
    const C = this.scanCache, out = [], notHere = this.settings.notHere || {}, rl = this.app.metadataCache.resolvedLinks || {};
    // un concept găsit în foarte multe note e probabil și un cuvânt obișnuit („being”, „existence”): îl arătăm, dar nu-l bifăm
    const df = {}; let docs = 0; for (const e of Object.values(C.notes)) { if (e.kind === "target" && !this.settings.scanTargets) continue; docs++; for (const t of Object.keys(e.first || {})) df[t] = (df[t] || 0) + 1; }
    const commonAt = Math.max(10, Math.ceil(docs * 0.06));
    for (const [path, e] of Object.entries(C.notes)) {
      if (!e.first || (e.kind === "target" && !this.settings.scanTargets)) continue;   // notele-concept între ele: doar dacă vrei (setări)
      const linked = rl[path] || {}, skipHere = new Set(notHere[path] || []);
      for (const [target, m] of Object.entries(e.first)) {
        if (linked[target] || skipHere.has(target) || !this.app.vault.getAbstractFileByPath(target)) continue;
        out.push({ note: path, target, ...m, common: (df[target] || 0) >= commonAt });
      }
    }
    out.sort((a, b) => a.target.localeCompare(b.target) || a.note.localeCompare(b.note));
    this.unlinked = out;
  },
  // pune linkurile alese; textul rămâne cum l-ai scris: [[Action|acțiunii]]
  async applyLinks(items) {
    const byNote = {}; for (const it of items) (byNote[it.note] = byNote[it.note] || []).push(it);
    let done = 0, missed = 0;
    for (const [path, list] of Object.entries(byNote)) {
      const file = this.app.vault.getAbstractFileByPath(path); if (!(file instanceof TFile)) { missed += list.length; continue; }
      await this.app.vault.process(file, text => {
        const skip = X.skipRanges(text, { skipQuotes: !this.settings.scanQuotes, hlTags: this.hlTags() }), used = [];
        for (const it of list.slice().sort((a, b) => b.from - a.from)) {
          const target = this.app.vault.getAbstractFileByPath(it.target); if (!(target instanceof TFile)) { missed++; continue; }
          let a = it.from, b = it.to;
          if (text.slice(a, b) !== it.hit || X.inRanges(skip, a, b)) {   // nota s-a schimbat de la căutare: găsim din nou prima apariție
            a = -1; let i = -1; while ((i = text.indexOf(it.hit, i + 1)) >= 0) { const j = i + it.hit.length; if (!X.inRanges(skip, i, j) && !X.isWord(text[i - 1]) && !X.isWord(text[j])) { a = i; break; } }
            if (a < 0) { missed++; continue; } b = a + it.hit.length;
          }
          if (used.some(([x, y]) => a < y && b > x)) { missed++; continue; }
          const lt = this.app.metadataCache.fileToLinktext(target, path, true);
          const link = lt === it.hit ? `[[${lt}]]` : `[[${lt}|${it.hit}]]`;
          text = text.slice(0, a) + link + text.slice(b); used.push([a, a + link.length]); done++;
        }
        return text;
      });
    }
    const set = new Set(items.map(i => i.note + "\u0000" + i.target));
    this.unlinked = (this.unlinked || []).filter(u => !set.has(u.note + "\u0000" + u.target));
    this.changed();
    return { done, missed };
  },
  async ignoreTerm(target) { const name = this.app.vault.getAbstractFileByPath(target)?.basename || target; this.settings.ignoredTargets = [...new Set([...(this.settings.ignoredTargets || []), target])]; await this.saveSettings(); this.unlinked = (this.unlinked || []).filter(u => u.target !== target); this.changed(); return name; },
  async notHereAdd(note, target) { const m = this.settings.notHere = this.settings.notHere || {}; m[note] = [...new Set([...(m[note] || []), target])]; await this.saveSettings(); this.unlinked = (this.unlinked || []).filter(u => !(u.note === note && u.target === target)); this.changed(); },
  visibleUnlinked() { const ign = new Set(this.settings.ignoredTargets || []); return (this.unlinked || []).filter(u => !ign.has(u.target)); },

  // ——— nume care apar des în textul tău, dar n-au notă ———
  computeNames() {
    const acc = {}, idx = this.termIndex();
    for (const [path, e] of Object.entries(this.scanCache.notes)) for (const [name, n] of Object.entries(e.names || {})) { const a = acc[name] = acc[name] || { name, count: 0, notes: [] }; a.count += n; a.notes.push(path); }
    const ign = new Set((this.settings.ignoredNames || []).map(X.fold)), out = [];
    for (const a of Object.values(acc)) {
      if (a.count < 3 || a.notes.length < 2 || ign.has(X.fold(a.name))) continue;
      if (this.app.metadataCache.getFirstLinkpathDest(a.name, "")) continue;   // are deja notă
      if (X.matchAll(idx, a.name).some(m => m.from === 0 && m.to === a.name.length)) continue;   // e un titlu sau alias
      out.push(a);
    }
    // „René Descartes” și „Descartes”: îl păstrăm pe cel mai lung, cu numerele adunate
    out.sort((a, b) => b.name.length - a.name.length);
    const kept = []; for (const a of out) { const sub = kept.find(k => (" " + k.name + " ").includes(" " + a.name + " ")); if (sub) { sub.count += a.count; sub.notes = [...new Set([...sub.notes, ...a.notes])]; } else kept.push({ ...a }); }
    this.names = kept.sort((a, b) => b.count - a.count).slice(0, 60);
  },
  async createNote(name, folder, template) {
    const dir = String(folder || "").replace(/\/+$/, ""), path = (dir ? dir + "/" : "") + name.replace(/[\\/:*?"<>|#^[\]]/g, " ").trim() + ".md";
    if (this.app.vault.getAbstractFileByPath(path)) return this.app.vault.getAbstractFileByPath(path);
    if (dir && !this.app.vault.getAbstractFileByPath(dir)) { let cur = ""; for (const part of dir.split("/")) { cur = cur ? cur + "/" + part : part; if (!this.app.vault.getAbstractFileByPath(cur)) await this.app.vault.createFolder(cur); } }
    const tp = this.app.plugins.plugins["templater-obsidian"]?.templater, tf = template && this.app.vault.getAbstractFileByPath(template);
    let file = null;
    if (tp?.create_new_note_from_template && tf instanceof TFile) { try { file = await tp.create_new_note_from_template(tf, this.app.vault.getAbstractFileByPath(dir) || this.app.vault.getRoot(), name, false); } catch (e) { file = null; } }
    if (!file) { let body = ""; if (tf instanceof TFile) { body = (await this.app.vault.read(tf)).replace(/<%[\s\S]*?%>/g, ""); } file = await this.app.vault.create(path, body || `---\naliases: []\n---\n`); }
    try { await this.app.fileManager.processFrontMatter(file, fm => { if (!fm.dateCreated) fm.dateCreated = X.dayKey(); }); } catch (e) {}
    this._idx = null; this.names = (this.names || []).filter(n => n.name !== name);
    return file;
  },

  // ——— aliasuri sugerate ———
  aliasesOf(file) { const fm = this.app.metadataCache.getFileCache(file)?.frontmatter || {}; let al = fm.aliases ?? fm.alias ?? []; if (!Array.isArray(al)) al = String(al).split(","); return al.map(a => String(a || "").trim()).filter(Boolean); },
  // un alias e sugerat doar dacă îl confirmă cel puțin 2 surse (setări: 2 sau 3): note diferite în care apare, plus Wikidata
  computeAliases() {
    const idx = this.termIndex(), out = {}, ignored = this.settings.ignoredAliases || {}, min = Math.max(2, +this.settings.aliasMinSources || 2);
    const known = new Map(); for (const e of idx.entries) known.set(e.path, new Set(e.terms.map(t => X.fold(X.cleanTitle(t)))));
    const covered = (path, alias) => { const k = X.fold(alias); if (known.get(path)?.has(k)) return true; return X.matchAll(idx, alias).some(m => m.from === 0 && m.to === alias.length && m.g.paths.includes(path)); };
    const add = (path, alias, why, src, n) => {
      alias = String(alias || "").trim(); if (!alias || alias.length < 2 || covered(path, alias) || (ignored[path] || []).map(X.fold).includes(X.fold(alias))) return;
      const key = path + "\u0000" + X.fold(alias), o = out[key] = out[key] || { target: path, alias, why: new Set(), count: 0, src: new Set() };
      o.why.add(why); o.count += n || 1; for (const x of [].concat(src)) if (x) o.src.add(x);
    };
    // 1. textul linkurilor tale: [[Consciousness|conștiința]] — fiecare notă în care îl folosești e o sursă
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (this.scanExcluded(f.path)) continue;
      for (const l of this.app.metadataCache.getFileCache(f)?.links || []) {
        if (!l.displayText || !/\|/.test(l.original || "")) continue;
        const t = this.app.metadataCache.getFirstLinkpathDest(l.link.split("#")[0], f.path); if (!t || !this.isTarget(t.path)) continue;
        const d = l.displayText.trim(); if (d.split(/\s+/).length > 5) continue; add(t.path, d, "link", f.path, 1);
      }
    }
    // 2. variante de scriere din textul tău (filozofie / filosofie): notele în care apar
    const byFold = {};
    for (const [p, e] of Object.entries(this.scanCache.notes)) for (const [w, n] of Object.entries(e.lw || {})) { const k = X.fold(w), o = byFold[k] = byFold[k] || { w, n: 0, best: 0, notes: new Set() }; o.n += n; o.notes.add(p); if (n > o.best) { o.best = n; o.w = w; } }
    const dels = new Map(); const keyDel = (str, fn) => { fn(str); for (let i = 0; i < str.length; i++) fn(str.slice(0, i) + str.slice(i + 1)); };
    for (const [k, o] of Object.entries(byFold)) if (o.n >= 3 && k.length >= 6) keyDel(k, d => { const a = dels.get(d) || []; a.push(k); dels.set(d, a); });
    for (const e of idx.entries) for (const term of e.terms) {
      const tk = X.fold(X.cleanTitle(term)); if (tk.includes(" ") || tk.length < 6) continue;
      const cands = new Set(); keyDel(tk, d => (dels.get(d) || []).forEach(c => cands.add(c)));
      for (const c of cands) if (c !== tk && lev1(c, tk) && !X.matchAll(idx, byFold[c].w).length) add(e.path, byFold[c].w, "spelling", [...byFold[c].notes], byFold[c].n);
    }
    // 3. prescurtări pe care le folosești (AI pentru Artificial Intelligence): notele în care apar
    const acr = {}; for (const [p, e] of Object.entries(this.scanCache.notes)) for (const [a, n] of Object.entries(e.acr || {})) { const o = acr[a] = acr[a] || { n: 0, notes: new Set() }; o.n += n; o.notes.add(p); }
    for (const e of idx.entries) { const ws = X.cleanTitle(e.terms[0]).split(/\s+/).filter(w => /^\p{Lu}/u.test(w) && !/^(Of|And|The|De|Și|Si|A)$/i.test(w)); if (ws.length < 2) continue; const a = ws.map(w => w[0].toUpperCase()).join(""); if (acr[a]) add(e.path, a, "short", [...acr[a].notes], acr[a].n); }
    // 4. traducerile de pe Wikidata (după ce le cauți): Wikidata e o sursă, iar notele în care apare traducerea sunt celelalte
    for (const [path, list] of Object.entries(this.settings.wikidata || {})) for (const it of list) { const a = typeof it === "string" ? it : it.a, notes = typeof it === "string" ? [] : it.notes || []; add(path, a, "wikidata", ["wikidata", ...notes], 1); }
    this.aliasSugg = Object.values(out).filter(o => o.src.size >= min).map(o => ({ ...o, why: [...o.why], sources: o.src.size, notes: [...o.src].filter(x => x !== "wikidata").length, src: undefined }))
      .sort((a, b) => b.sources - a.sources || b.count - a.count);
  },
  async addAlias(target, alias) {
    const f = this.app.vault.getAbstractFileByPath(target); if (!(f instanceof TFile)) return false;
    await this.app.fileManager.processFrontMatter(f, fm => { let a = fm.aliases ?? fm.alias ?? []; if (!Array.isArray(a)) a = String(a).split(",").map(s => s.trim()).filter(Boolean); if (!a.map(X.fold).includes(X.fold(alias))) a.push(alias); fm.aliases = a; delete fm.alias; });
    this.aliasSugg = (this.aliasSugg || []).filter(s => !(s.target === target && X.fold(s.alias) === X.fold(alias))); this._idx = null; this.changed(); return true;
  },
  async ignoreAlias(target, alias) { const m = this.settings.ignoredAliases = this.settings.ignoredAliases || {}; m[target] = [...new Set([...(m[target] || []), alias])]; await this.saveSettings(); this.aliasSugg = (this.aliasSugg || []).filter(s => !(s.target === target && X.fold(s.alias) === X.fold(alias))); this.changed(); },
  // traducerea titlului pe Wikidata (doar când apeși butonul): pentru notele fără alias în cealaltă limbă
  async wikidata(onProgress) {
    const idx = this.termIndex(), todo = idx.entries.filter(e => e.terms.length < 2).slice(0, 80), found = this.settings.wikidata = this.settings.wikidata || {};
    let done = 0, got = 0, texts = null;
    // în ce note apare deja traducerea (cu formele ei): textele se citesc o singură dată
    const seen = async a => {
      if (!texts) { texts = []; for (const f of this.app.vault.getMarkdownFiles()) if (!this.scanExcluded(f.path) && !this.isTarget(f.path)) { try { texts.push([f.path, X.fold(await this.app.vault.cachedRead(f))]); } catch (err) {} } }
      const p = X.termPattern(a); if (!p) return []; const re = new RegExp(`(?<![\\p{L}\\p{N}])${p}(?![\\p{L}\\p{N}])`, "u");
      return texts.filter(([, t]) => re.test(t)).map(([path]) => path);
    };
    const one = async e => {
      const title = X.cleanTitle(e.terms[0]);
      try {
        const s = await requestUrl({ url: `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&uselang=en&type=item&limit=1&search=${encodeURIComponent(title)}`, throw: false });
        const id = s.json?.search?.[0]?.id;
        if (id) {
          const g = await requestUrl({ url: `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=labels|aliases&languages=ro|en&ids=${id}`, throw: false });
          const ent = g.json?.entities?.[id], ro = ent?.labels?.ro?.value;
          const list = [ro, ...(ent?.aliases?.ro || []).slice(0, 2).map(a => a.value)].filter(Boolean);
          if (list.length) { const have = (found[e.path] || []).map(x => typeof x === "string" ? { a: x, notes: [] } : x); for (const a of list) if (!have.some(h => X.fold(h.a) === X.fold(a))) have.push({ a, notes: await seen(a) }); found[e.path] = have; got++; }
        }
      } catch (err) {}
      done++; onProgress?.(done, todo.length);
    };
    for (let i = 0; i < todo.length; i += 3) await Promise.all(todo.slice(i, i + 3).map(one));
    await this.saveSettings(); this.computeAliases(); this.changed();
    return { asked: todo.length, got };
  },

  // ——— note care par dublate: același titlu sau alias (sau aproape) la două note ———
  computeDuplicates() {
    const idx = this.termIndex(), pairs = new Map(), ign = new Set(this.settings.notDuplicates || []);
    const add = (a, b, why) => { if (a === b) return; const [x, y] = [a, b].sort(), k = x + "\u0000" + y; if (ign.has(k)) return; const o = pairs.get(k) || { a: x, b: y, why: new Set() }; o.why.add(why); pairs.set(k, o); };
    const nameOf = p => p.split("/").pop().replace(/\.md$/, ""), disamb = (a, b) => /\([^)]*\)\s*$/.test(nameOf(a)) && /\([^)]*\)\s*$/.test(nameOf(b)) && X.cleanTitle(nameOf(a)) === X.cleanTitle(nameOf(b));   // „Formalism (Aesthetics)” și „Formalism (Mathematics)”: deosebite intenționat
    for (const g of idx.groups) if (g.paths.length > 1) for (let i = 0; i < g.paths.length; i++) for (let j = i + 1; j < g.paths.length; j++) if (!disamb(g.paths[i], g.paths[j])) add(g.paths[i], g.paths[j], g.term);
    // un titlu care se potrivește, cu terminație, cu termenul altei note (Mind / Minds; Acțiune / Acțiunea)
    for (const e of idx.entries) { const t = X.cleanTitle(e.terms[0]); for (const m of X.matchAll(idx, t)) if (m.from === 0 && m.to === t.length) for (const p of m.g.paths) if (p !== e.path && !disamb(e.path, p)) add(e.path, p, t); }
    this.duplicates = [...pairs.values()].map(o => ({ ...o, why: [...o.why] }));
  },
  async notDuplicate(a, b) { const [x, y] = [a, b].sort(); this.settings.notDuplicates = [...new Set([...(this.settings.notDuplicates || []), x + "\u0000" + y])]; await this.saveSettings(); this.duplicates = (this.duplicates || []).filter(d => !(d.a === x && d.b === y)); this.changed(); },

  // ——— afirmații fără citare (în paragrafele tale din folderele alese) ———
  claimFolders() { return (this.settings.claimFolders?.length ? this.settings.claimFolders : ["03. Workspace"]).map(f => String(f).replace(/\/+$/, "")); },
  uncitedIn(text, path) {
    if (!this.inFolders(path, this.claimFolders())) return [];
    const out = [], idx = this.termIndex(), skipped = new Set(this.settings.notClaims || []);
    for (const p of X.paragraphs(text)) {
      const t = p.text, words = X.wordStarts(t, "");
      if (words < 25 || /^\s*(#|>|```|\||- \[|!\[)/.test(t) || /\[@|\[\^|\]\(https?:|\(\s*\p{Lu}[\p{L}\-]+,?\s+\d{4}\s*[,)]/u.test(t)) continue;
      const h = this.hash(X.fold(t).replace(/\s+/g, " ").trim()); if (skipped.has(h)) continue;
      const marker = CLAIM_RX.exec(t), concepts = new Set(); for (const m of X.matchAll(idx, t, X.skipRanges(t))) m.g.paths.forEach(x => concepts.add(x));
      const names = Object.keys(this.nameCandidates(t, X.skipRanges(t)));
      if (!marker && !names.length) continue;
      out.push({ from: p.from, to: p.to, hash: h, why: marker ? marker[0] : names[0], concepts: [...concepts], names });
    }
    return out;
  },
  hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); },
  // ce sursă ai putea cita: autorul numit în paragraf, conceptele comune, cuvintele comune cu evidențierile ei
  suggestCitations(p, text, n = 2) {
    const C = this.scanCache?.notes || {}, lib = this.library(), toks = new Set(this.topTokens(text, 60)), out = [];
    const names = p.names.map(X.fold);
    for (const [path, e] of Object.entries(C)) {
      if (e.kind !== "lit" || !e.id) continue;
      const src = lib[e.id] || {}, fams = (src.author || []).map(a => X.fold(a.family || a.literal || "")).filter(Boolean);
      let score = 0, why = [];
      if (fams.some(f => names.some(nm => nm.split(/\s+/).includes(f)))) { score += 6; why.push("author"); }
      const shared = p.concepts.filter(c => (e.counts?.[c] || 0) > 0 || (e.fm || []).includes(c)); if (shared.length) { score += shared.length * 2; why.push("concepts"); }
      let tk = 0; for (const w of e.toks || []) if (toks.has(w)) tk++; if (tk >= 3) { score += Math.min(4, tk / 3); why.push("words"); }
      if (score >= 3) out.push({ path, id: e.id, score, why, label: this.citeLabel(e.id, path) });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, n);
  },
  library() { try { return this.app.plugins.plugins["texere-sources"]?.cite?.raw || {}; } catch (e) { return {}; } },
  citeLabel(id, path) {
    const s = this.library()[id]; if (s) { const a = s.author?.[0]; const fam = a?.family || a?.literal || ""; const y = s.issued?.["date-parts"]?.[0]?.[0] || ""; return `${fam}${(s.author || []).length > 1 ? " et al." : ""} ${y}`.trim(); }
    const f = this.app.vault.getAbstractFileByPath(path); return f ? f.basename.split(" – ")[0] : id;
  },
};

module.exports = { LinksMixin, lev1, CLAIM_RX };
