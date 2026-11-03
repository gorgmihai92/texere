// Texere · Insights · scrisul: câte cuvinte scrii, lipești, inserezi (alte unelte, ex. AI) și ștergi — pe zile, ore, foldere și note.
// Se numără din editor, schimbare cu schimbare (nu din mărimea fișierului): ce scrie Texere singur în note nu intră la „scris”,
// Anulează / Refă nu se numără de două ori. Fiecare laptop își ține fișierul lui (stats/<laptop>.json); totalurile le adună.
const { Notice, Modal, Setting } = require("obsidian");
const { wordStarts, countWords, dayKey, weekKey, parseDay, isWord, HL_TAGS } = require("./text");

const EMPTY = () => ({ t: 0, p: 0, x: 0, d: 0, r: 0 });
const KINDS = ["t", "p", "x", "d", "r"];

const WritingMixin = {
  async writingInit() {
    this.dev = this.app.loadLocalStorage("texere-insights-device");
    if (!this.dev) { this.dev = Math.random().toString(36).slice(2, 10); this.app.saveLocalStorage("texere-insights-device", this.dev); }
    this.wdir = `${this.manifest.dir}/stats`;
    this.mine = { device: this.dev, name: this.deviceName(), days: {}, hl: {} };
    try { const raw = await this.app.vault.adapter.read(`${this.wdir}/${this.dev}.json`); const d = JSON.parse(raw); if (d && d.days) this.mine = { ...this.mine, ...d, name: this.deviceName() }; } catch (e) {}
    this._pasteUntil = 0; this._dirty = false;
    // lipirea și trasul unui fișier în notă: tot ce intră în editor în clipa următoare e „lipit”
    const mark = () => { this._pasteUntil = Date.now() + 600; };
    this.registerEvent(this.app.workspace.on("editor-paste", mark));
    this.registerEvent(this.app.workspace.on("editor-drop", mark));
    try {
      const { EditorView } = require("@codemirror/view");
      this.registerEditorExtension(EditorView.updateListener.of(u => { if (u.docChanged) { try { this.onEdit(u); } catch (e) { console.error("Texere · Insights: numărarea", e); } } }));
    } catch (e) { console.error("Texere · Insights: editorul", e); }
    this.registerEvent(this.app.vault.on("rename", (f, old) => this.renameInLog(f, old)));
    this.registerInterval(window.setInterval(() => this.saveLog(), 15000));
    this.register(() => { this.saveLog(true); });
    // lectura: evidențierile noi din notele de literatură (din PDF++), numărate pe zile
    this.app.workspace.onLayoutReady(() => {
      this.hlBaseline();
      this.registerEvent(this.app.metadataCache.on("changed", (file, data, cache) => { try { this.trackHighlights(file, cache); } catch (e) {} }));
    });
  },
  deviceName() { try { return require("os").hostname(); } catch (e) { return "laptop"; } },

  // ——— numărarea, din editor ———
  onEdit(u) {
    let file = null; try { file = u.state.field(require("obsidian").editorInfoField)?.file; } catch (e) {}
    if (!file || file.extension !== "md" || this.excludedFromCount(file.path)) return;
    const focus = u.view.hasFocus, paste = Date.now() < this._pasteUntil;
    for (const tr of u.transactions) {
      if (!tr.docChanged || tr.isUserEvent("undo") || tr.isUserEvent("redo") || tr.isUserEvent("move")) continue;
      let kind;
      if (tr.isUserEvent("input.paste") || tr.isUserEvent("input.drop") || (paste && !tr.isUserEvent("delete"))) kind = "p";
      else if (tr.isUserEvent("input")) kind = "t";
      else if (tr.isUserEvent("delete")) kind = "d";
      else kind = "x";   // fără gestul tău: o altă unealtă (un plugin AI, un șablon) sau Obsidian însuși
      const old = tr.startState.doc, head = tr.startState.selection.main.head;
      let ins = 0, del = 0, near = false;
      tr.changes.iterChanges((fA, tA, fB, tB, text) => {
        if (tA > fA) { const prev = fA > 0 ? old.sliceString(fA - 1, fA) : ""; del += wordStarts(old.sliceString(fA, tA), prev); }
        const s = text.toString(); if (s) { const prev = fA > 0 ? old.sliceString(fA - 1, fA) : ""; ins += wordStarts(s, prev); }
        if (Math.abs(fA - head) <= 2 || (fA <= head && head <= tA)) near = true;
      });
      if (kind === "x") {   // o unealtă care scrie unde ești tu (la cursor, cu nota în față); restul (sincronizare, redenumiri) nu e scrisul tău
        if (!focus || !near) continue;
        this.addCount(file, "x", ins); continue;
      }
      if (!focus && kind !== "p") continue;
      if (kind === "d") this.addCount(file, "d", del);
      else { this.addCount(file, kind, ins); if (del) this.addCount(file, "d", del); }
    }
    this.targetSoon?.();
  },
  excludedFromCount(path) { return (this.settings.countExclude || []).some(f => f && (path === f || path.startsWith(f.replace(/\/+$/, "") + "/"))); },
  folderKey(path) { const parts = path.split("/").slice(0, -1); return parts.length ? parts.slice(0, 2).join("/") : "/"; },
  addCount(file, k, n) {
    if (!n || n < 0) return;
    const now = new Date(), D = this.mine.days[dayKey(now)] = this.mine.days[dayKey(now)] || { ...EMPTY(), h: {}, f: {}, n: {} };
    D[k] = (D[k] || 0) + n;
    if (k !== "d" && k !== "r") { const h = now.getHours(); D.h[h] = (D.h[h] || 0) + n; }
    const fk = this.folderKey(file.path); D.f[fk] = D.f[fk] || EMPTY(); D.f[fk][k] += n;
    D.n[file.path] = D.n[file.path] || EMPTY(); D.n[file.path][k] += n;
    this._dirty = true; this._merged = null;
    clearTimeout(this._homeT); this._homeT = setTimeout(() => this.changed(), 60000);   // tab-ul nou: cel mult o dată pe minut
  },
  renameInLog(f, old) {
    if (!f || f.extension !== "md") return; let ch = false;
    for (const D of Object.values(this.mine.days)) if (D.n && D.n[old]) { D.n[f.path] = D.n[old]; delete D.n[old]; ch = true; }
    if (this.mine.hl[old] !== undefined) { this.mine.hl[f.path] = this.mine.hl[old]; delete this.mine.hl[old]; ch = true; }
    if (ch) { this._dirty = true; this._merged = null; }
  },
  async saveLog(now) {
    if (!this._dirty) return; this._dirty = false;
    const ad = this.app.vault.adapter;
    try { if (!(await ad.exists(this.wdir))) await ad.mkdir(this.wdir); await ad.write(`${this.wdir}/${this.dev}.json`, JSON.stringify(this.mine)); }
    catch (e) { this._dirty = true; if (!now) console.error("Texere · Insights: salvarea", e); }
  },

  // ——— lectura: evidențierile adăugate, din etichetele notelor de literatură ———
  hlTags() { const c = this.app.plugins.plugins["pdf-plus"]?.settings?.colors; const n = c ? Object.keys(c).map(s => s.toLowerCase()) : []; return n.length ? n : HL_TAGS; },
  litDir() { try { return String(this.app.plugins.plugins["texere-sources"]?.sources?.litDir?.() || "").replace(/\/+$/, "") || "01. Sources/Literature Notes"; } catch (e) { return "01. Sources/Literature Notes"; } },
  isLit(path) { const l = this.litDir(); return path.startsWith(l + "/"); },
  hlCount(cache) { const tags = this.hlTags(); return (cache?.tags || []).filter(t => tags.includes(t.tag.replace(/^#/, "").toLowerCase())).length; },
  hlBaseline() {
    let ch = false;
    for (const f of this.app.vault.getMarkdownFiles()) if (this.isLit(f.path) && this.mine.hl[f.path] === undefined) { this.mine.hl[f.path] = this.hlCount(this.app.metadataCache.getFileCache(f)); ch = true; }
    if (ch) this._dirty = true;
  },
  trackHighlights(file, cache) {
    if (!file || !this.isLit(file.path)) return;
    const n = this.hlCount(cache), old = this.mine.hl[file.path];
    this.mine.hl[file.path] = n; this._dirty = true;
    if (old === undefined) return;   // o notă nouă: evidențierile ei vin dintr-un import, nu din lectura de azi
    const add = n - old; if (add > 0 && add <= 25) this.addCount(file, "r", add);   // mai multe deodată = un import, nu lectură
  },

  // ——— totalurile, de pe toate laptopurile ———
  async allLogs() {
    if (this._logs && Date.now() - this._logsAt < 60000) return this._logs;
    const out = [this.mine], ad = this.app.vault.adapter;
    try { const ls = await ad.list(this.wdir); for (const p of ls.files || []) { if (!p.endsWith(".json") || p.endsWith(`/${this.dev}.json`)) continue; try { const d = JSON.parse(await ad.read(p)); if (d?.days) out.push(d); } catch (e) {} } } catch (e) {}
    this._logs = out; this._logsAt = Date.now(); this._merged = null; return out;
  },
  merged() {
    if (this._merged) return this._merged;
    const days = {};
    for (const L of this._logs || [this.mine]) for (const [k, D] of Object.entries(L.days || {})) {
      const M = days[k] = days[k] || { ...EMPTY(), h: {}, f: {}, n: {} };
      for (const x of KINDS) M[x] += D[x] || 0;
      for (const [h, v] of Object.entries(D.h || {})) M.h[h] = (M.h[h] || 0) + v;
      for (const [f, v] of Object.entries(D.f || {})) { M.f[f] = M.f[f] || EMPTY(); for (const x of KINDS) M.f[f][x] += v[x] || 0; }
      for (const [n, v] of Object.entries(D.n || {})) { M.n[n] = M.n[n] || EMPTY(); for (const x of KINDS) M.n[n][x] += v[x] || 0; }
    }
    return (this._merged = days);
  },
  // perioada: "day" | "week" | "month" | "year" (cea de acum) sau { from, to } (chei de zi)
  inPeriod(k, period, now = new Date()) {
    if (period && typeof period === "object") return k >= period.from && k <= period.to;
    if (period === "day") return k === dayKey(now);
    if (period === "week") return weekKey(parseDay(k)) === weekKey(now);
    if (period === "month") return k.slice(0, 7) === dayKey(now).slice(0, 7);
    if (period === "year") return k.slice(0, 4) === String(now.getFullYear());
    return true;
  },
  totals(period, now) {
    const s = EMPTY(); for (const [k, D] of Object.entries(this.merged())) if (this.inPeriod(k, period, now)) for (const x of KINDS) s[x] += D[x] || 0;
    s.added = s.t + s.p + s.x; s.net = s.added - s.d; s.revision = s.t ? s.d / s.t : 0; return s;
  },
  // zile la rând în care ai scris (cel puțin „minWords” cuvinte); azi contează doar dacă ai și scris azi
  streak(now = new Date()) {
    const days = this.merged(), min = this.settings.streakMin || 20, ok = k => { const D = days[k]; return D && (D.t + D.p + D.x) >= min; };
    let n = 0; const d = new Date(now); if (!ok(dayKey(d))) d.setDate(d.getDate() - 1);
    while (ok(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
    let best = 0, cur = 0; for (const k of Object.keys(days).sort()) { if (ok(k)) { const prev = new Date(parseDay(k)); prev.setDate(prev.getDate() - 1); cur = days[dayKey(prev)] && ok(dayKey(prev)) ? cur + 1 : 1; best = Math.max(best, cur); } }
    return { now: n, best: Math.max(best, n) };
  },
  series(nDays, now = new Date()) {   // ultimele n zile, cea mai veche întâi
    const days = this.merged(), out = []; const d = new Date(now); d.setDate(d.getDate() - nDays + 1);
    for (let i = 0; i < nDays; i++) { const k = dayKey(d), D = days[k] || EMPTY(); out.push({ k, date: new Date(d), t: D.t || 0, p: D.p || 0, x: D.x || 0, d: D.d || 0, r: D.r || 0, added: (D.t || 0) + (D.p || 0) + (D.x || 0) }); d.setDate(d.getDate() + 1); }
    return out;
  },
  hours(nDays = 90) { const h = Array(24).fill(0); const from = dayKey(new Date(Date.now() - nDays * 864e5)); for (const [k, D] of Object.entries(this.merged())) if (k >= from) for (const [x, v] of Object.entries(D.h || {})) h[+x] += v; return h; },
  weekdays(nDays = 180) { const w = Array(7).fill(0); const from = dayKey(new Date(Date.now() - nDays * 864e5)); for (const [k, D] of Object.entries(this.merged())) if (k >= from) w[(parseDay(k).getDay() + 6) % 7] += D.t + D.p + D.x; return w; },
  topOf(period, key, n = 5) {   // key: "f" (foldere) | "n" (note)
    const acc = {}; for (const [k, D] of Object.entries(this.merged())) if (this.inPeriod(k, period)) for (const [p, v] of Object.entries(D[key] || {})) { const a = acc[p] = acc[p] || EMPTY(); for (const x of KINDS) a[x] += v[x] || 0; }
    return Object.entries(acc).map(([p, v]) => ({ path: p, ...v, added: v.t + v.p + v.x })).filter(r => r.added || r.d).sort((a, b) => b.added - a.added).slice(0, n);
  },
  // zile de „ciornă” (scrii mult, ștergi puțin) și de „revizie” (ștergi cel puțin jumătate din cât scrii), în ultimele n zile
  dayKinds(nDays = 60) {
    let draft = 0, edit = 0; for (const s of this.series(nDays)) { if (s.added + s.d < 30) continue; if (s.d >= s.t * 0.5) edit++; else draft++; } return { draft, edit };
  },
  wordsInFolder(folder, period) {   // cuvinte nete scrise într-un folder (de pe toate laptopurile)
    const f = String(folder || "").replace(/\/+$/, ""); let s = 0;
    for (const [k, D] of Object.entries(this.merged())) if (this.inPeriod(k, period)) for (const [p, v] of Object.entries(D.n || {})) if (p.startsWith(f + "/")) s += v.t + v.p + v.x - v.d;
    return s;
  },

  // ——— ținta de cuvinte a unei note: o bară subțire deasupra textului ———
  targetKey() { return this.settings.targetKey || "word-target"; },
  targetOf(file) { const v = this.app.metadataCache.getFileCache(file)?.frontmatter?.[this.targetKey()]; const n = parseInt(String(v ?? "").replace(/[^\d]/g, ""), 10); return n > 0 ? n : 0; },
  targetInit() {
    const css = document.createElement("style"); css.id = "texere-insights-target-css";
    css.textContent = `.txi-target{margin:4px 0 16px;font-size:var(--font-ui-smaller);color:var(--text-muted);cursor:pointer;user-select:none}
.txi-target .txi-tt{display:flex;gap:10px;align-items:baseline;margin-bottom:5px}.txi-target b{color:var(--text-normal);font-weight:600;font-variant-numeric:tabular-nums}
.txi-target .txi-tg{margin-left:auto;color:var(--text-faint)}.txi-target .txi-tbar{height:4px;border-radius:2px;background:var(--background-modifier-border);overflow:hidden}
.txi-target .txi-tfill{height:100%;background:var(--interactive-accent);border-radius:2px;transition:width .3s}.txi-target.done .txi-tfill{background:var(--color-green)}`;
    document.getElementById(css.id)?.remove(); document.head.appendChild(css);
    this.register(() => { css.remove(); document.querySelectorAll(".txi-target").forEach(e => e.remove()); });
    const tick = () => this.app.workspace.iterateAllLeaves(l => { if (l.view?.getViewType?.() === "markdown") { try { this.renderTarget(l.view); } catch (e) {} } });
    this.targetSoon = () => { clearTimeout(this._tgT); this._tgT = setTimeout(tick, 600); };
    for (const ev of ["file-open", "layout-change", "active-leaf-change"]) this.registerEvent(this.app.workspace.on(ev, () => this.targetSoon()));
    this.registerEvent(this.app.metadataCache.on("changed", () => this.targetSoon()));
    this.addCommand({ id: "word-target", name: "Set a word target for this note / Pune o țintă de cuvinte notei", checkCallback: c => { const f = this.app.workspace.getActiveFile(); if (!f || f.extension !== "md") return false; if (!c) this.askTarget(f); return true; } });
    this.app.workspace.onLayoutReady(tick);
  },
  renderTarget(view) {
    const file = view.file, root = view.containerEl; if (!file) return;
    const target = this.targetOf(file), sizers = [root.querySelector(".markdown-source-view .cm-sizer"), root.querySelector(".markdown-reading-view .markdown-preview-sizer .mod-header")].filter(Boolean);
    if (!target) { root.querySelectorAll(".txi-target").forEach(e => e.remove()); return; }
    let text = ""; try { text = view.getViewData?.() || ""; } catch (e) {}
    const words = countWords(text), pct = Math.min(100, Math.round(words / target * 100)), today = this.merged()[dayKey()]?.n?.[file.path];
    const todayNet = today ? today.t + today.p + today.x - today.d : 0, T = (a, b) => this.T(a, b), fmt = n => n.toLocaleString(this.en ? "en-GB" : "ro-RO");
    const sig = [words, target, todayNet, this.en].join("|");
    for (const tg of sizers) {
      let p = tg.querySelector(":scope > .txi-target"); if (p && p.dataset.sig === sig) { this.fitPanel(p); continue; }
      const box = document.createElement("div"); box.className = "txi-target" + (words >= target ? " done" : ""); box.dataset.sig = sig;
      const tt = box.appendChild(document.createElement("div")); tt.className = "txi-tt";
      const a = tt.appendChild(document.createElement("span")); a.innerHTML = ""; const b = a.appendChild(document.createElement("b")); b.textContent = fmt(words); a.append(T(` / ${fmt(target)} cuvinte · ${pct}%`, ` / ${fmt(target)} words · ${pct}%`));
      if (todayNet) { const t2 = tt.appendChild(document.createElement("span")); t2.textContent = T(`${todayNet > 0 ? "+" : ""}${fmt(todayNet)} azi`, `${todayNet > 0 ? "+" : ""}${fmt(todayNet)} today`); }
      const g = tt.appendChild(document.createElement("span")); g.className = "txi-tg"; g.textContent = words >= target ? T("ținta atinsă", "target reached") : T(`încă ${fmt(target - words)}`, `${fmt(target - words)} to go`);
      const bar = box.appendChild(document.createElement("div")); bar.className = "txi-tbar"; const fill = bar.appendChild(document.createElement("div")); fill.className = "txi-tfill"; fill.style.width = pct + "%";
      box.title = T("Clic: schimbă ținta", "Click: change the target");
      box.addEventListener("mousedown", e => e.stopPropagation());
      box.addEventListener("click", () => this.askTarget(file));
      if (p) p.replaceWith(box);
      else if (tg.classList.contains("cm-sizer")) { const st = tg.querySelector(":scope > .texere-stats"); tg.insertBefore(box, st ? st.nextSibling : tg.querySelector(":scope > .cm-contentContainer")); }
      else tg.appendChild(box);
      this.fitPanel(box, true);
    }
  },
  askTarget(file) {
    const T = (a, b) => this.T(a, b), P = this, cur = this.targetOf(file);
    const m = new Modal(this.app); m.titleEl.setText(T("Ținta de cuvinte", "Word target"));
    let val = cur ? String(cur) : "";
    m.contentEl.createDiv({ cls: "setting-item-description", text: T(`Câte cuvinte vrei să aibă „${file.basename}”. Apare o bară subțire deasupra textului, cu cât ai scris azi.`, `How many words “${file.basename}” should have. A thin bar shows above the text, with what you wrote today.`) });
    new Setting(m.contentEl).setName(T("Cuvinte", "Words")).addText(t => { t.setValue(val).setPlaceholder("3000").onChange(v => { val = v; }); t.inputEl.type = "number"; setTimeout(() => t.inputEl.focus(), 30); t.inputEl.addEventListener("keydown", e => { if (e.key === "Enter") save(); }); });
    const save = async () => { const n = parseInt(val, 10); await P.app.fileManager.processFrontMatter(file, fm => { if (n > 0) fm[P.targetKey()] = n; else delete fm[P.targetKey()]; }); m.close(); P.targetSoon(); };
    const bc = m.contentEl.createDiv("modal-button-container");
    if (cur) bc.createEl("button", { text: T("Scoate ținta", "Remove the target") }).addEventListener("click", () => { val = ""; save(); });
    bc.createEl("button", { cls: "mod-cta", text: T("Salvează", "Save") }).addEventListener("click", save);
    m.open();
  },
  targets() {   // notele cu țintă: progresul fiecăreia
    const out = []; for (const f of this.app.vault.getMarkdownFiles()) { const t = this.targetOf(f); if (t) { const c = this.scanCache?.notes?.[f.path]; out.push({ file: f, target: t, words: c?.words ?? null }); } }
    return out;
  },
};

module.exports = { WritingMixin, EMPTY };
