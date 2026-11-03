// Texere · Insights · ce vezi: pagina Insights, fereastra de revizuire (linkuri, nume, aliasuri, dubluri), semnele din notă pentru
// afirmațiile fără citare, recenzia săptămânii și secțiunea din tab-ul nou.
const { ItemView, Modal, Setting, Notice, TFile, setIcon, Menu } = require("obsidian");
const X = require("./text");

const VIEW = "texere-insights";
const fmt = (n, en) => Math.round(n || 0).toLocaleString(en ? "en-GB" : "ro-RO");
const el = (parent, tag, cls, text) => { const e = parent.createEl(tag, { cls }); if (text != null) e.setText(text); return e; };
const SVG = "http://www.w3.org/2000/svg";
const svg = (parent, w, h) => { const s = document.createElementNS(SVG, "svg"); s.setAttribute("viewBox", `0 0 ${w} ${h}`); s.setAttribute("width", "100%"); s.setAttribute("preserveAspectRatio", "xMinYMin meet"); parent.appendChild(s); return s; };
const rect = (s, x, y, w, h, cls, title) => { const r = document.createElementNS(SVG, "rect"); r.setAttribute("x", x); r.setAttribute("y", y); r.setAttribute("width", Math.max(0, w)); r.setAttribute("height", Math.max(0, h)); r.setAttribute("rx", Math.min(2, w / 2)); if (cls) r.setAttribute("class", cls); if (title) { const t = document.createElementNS(SVG, "title"); t.textContent = title; r.appendChild(t); } s.appendChild(r); return r; };
const txt = (s, x, y, t, cls, anchor) => { const e = document.createElementNS(SVG, "text"); e.setAttribute("x", x); e.setAttribute("y", y); if (cls) e.setAttribute("class", cls); if (anchor) e.setAttribute("text-anchor", anchor); e.textContent = t; s.appendChild(e); return e; };

const CSS = `
.txi-view{padding:0 !important}
.txi-wrap{box-sizing:border-box;max-width:900px;margin:0 auto;padding:22px 24px 60px}
.txi-head{display:flex;align-items:flex-end;gap:12px;border-bottom:1px solid var(--background-modifier-border);margin-bottom:12px}
.txi-head .txi-title,.txi-head h2{margin:0;padding-bottom:10px;font-size:var(--font-ui-large);font-weight:600;line-height:1.3}
.txi-head .txi-sub{padding-bottom:8px}.txi-head .txi-sub{color:var(--text-faint);font-size:var(--font-ui-smaller);margin-left:auto;display:flex;gap:10px;align-items:center}
.txi-sec{margin:0 0 26px}.txi-sec>h3{font-size:var(--font-ui-small);text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin:0 0 10px;font-weight:600}
.txi-sec>.txi-lead{color:var(--text-muted);font-size:var(--font-ui-smaller);margin:-6px 0 10px;max-width:70ch;line-height:1.5}
.txi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px}
.txi-card{border:1px solid var(--background-modifier-border);border-radius:10px;padding:12px 14px;background:var(--background-primary);min-width:0}
.txi-card h4{margin:0 0 8px;font-size:var(--font-ui-small);font-weight:600;display:flex;gap:8px;align-items:center}.txi-card h4 .txi-hint{margin-left:auto;font-weight:400;color:var(--text-faint);font-size:var(--font-ui-smaller)}
.txi-card p,.txi-muted{color:var(--text-muted);font-size:var(--font-ui-smaller);line-height:1.5;margin:4px 0}
.txi-nums{display:flex;flex-wrap:wrap;gap:6px 20px}.txi-num{display:flex;flex-direction:column}.txi-num b{font-size:1.45em;font-weight:600;font-variant-numeric:tabular-nums;line-height:1.2}.txi-num span{color:var(--text-faint);font-size:var(--font-ui-smaller)}
.txi-num.neg b{color:var(--text-muted)}
.txi-tabs{display:flex;gap:4px;margin-bottom:10px}.txi-tabs button{font-size:var(--font-ui-smaller);height:24px;padding:0 10px;box-shadow:none;background:transparent;color:var(--text-muted)}.txi-tabs button.on{background:var(--background-modifier-hover);color:var(--text-normal)}
.txi-list{display:flex;flex-direction:column;gap:2px;margin:0;padding:0}
.txi-row{display:flex;align-items:baseline;gap:8px;padding:4px 6px;margin:0 -6px;border-radius:6px;font-size:var(--font-ui-small);min-width:0}
.txi-row.click{cursor:pointer}.txi-row.click:hover{background:var(--background-modifier-hover)}
.txi-row .txi-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}.txi-row .txi-meta{margin-left:auto;color:var(--text-faint);font-size:var(--font-ui-smaller);white-space:nowrap;font-variant-numeric:tabular-nums}
.txi-row button{height:22px;font-size:var(--font-ui-smaller);padding:0 8px;flex:none}
.txi-detail{margin:2px 0 8px;padding:8px 10px;border-radius:8px;background:var(--background-secondary);font-size:var(--font-ui-smaller);color:var(--text-muted)}
.txi-chart{margin-top:8px}.txi-chart text{font-size:8px;fill:var(--text-faint)}
.txi-chart .b{fill:var(--interactive-accent);opacity:.75}.txi-chart .b2{fill:var(--text-faint);opacity:.55}.txi-chart .b0{fill:var(--background-modifier-border)}
.txi-chart .h0{fill:var(--background-modifier-border)}.txi-chart .h1{fill:var(--interactive-accent);opacity:.3}.txi-chart .h2{fill:var(--interactive-accent);opacity:.5}.txi-chart .h3{fill:var(--interactive-accent);opacity:.75}.txi-chart .h4{fill:var(--interactive-accent)}
.txi-gh{--g0:#ebedf0;--g1:#9be9a8;--g2:#40c463;--g3:#30a14e;--g4:#216e39}
.theme-dark .txi-gh{--g0:#161b22;--g1:#0e4429;--g2:#006d32;--g3:#26a641;--g4:#39d353}
.txi-gh-head h4{margin:0 0 8px;font-weight:500}.txi-gh-scroll{overflow-x:auto;padding-bottom:2px}.txi-gh-svg{display:block}
.txi-gh-svg .g0{fill:var(--g0);outline:1px solid rgba(27,31,35,.06);outline-offset:-1px}.txi-gh-svg .g1{fill:var(--g1)}.txi-gh-svg .g2{fill:var(--g2)}.txi-gh-svg .g3{fill:var(--g3)}.txi-gh-svg .g4{fill:var(--g4)}
.txi-gh-svg rect{shape-rendering:geometricPrecision}.txi-gh-svg rect:hover{stroke:var(--text-faint);stroke-width:1}.txi-gh-l{font-size:9px;fill:var(--text-muted)}
.txi-gh-foot{display:flex;align-items:center;gap:12px;margin-top:6px}.txi-gh-foot .txi-muted{margin:0}
.txi-gh-legend{margin-left:auto;display:flex;align-items:center;gap:3px;font-size:var(--font-ui-smaller);color:var(--text-muted)}.txi-gh-legend span:first-child{margin-right:3px}.txi-gh-legend span:last-child{margin-left:3px}
.txi-gh-sq{display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--g0)}.txi-gh-sq.g1{background:var(--g1)}.txi-gh-sq.g2{background:var(--g2)}.txi-gh-sq.g3{background:var(--g3)}.txi-gh-sq.g4{background:var(--g4)}
.txi-legend{display:flex;gap:12px;font-size:var(--font-ui-smaller);color:var(--text-faint);margin-top:4px}.txi-legend i{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:4px;vertical-align:0}
.txi-big{font-size:var(--font-ui-medium);line-height:1.45;margin:6px 0 10px;color:var(--text-normal)}
.txi-kind{display:inline-block;font-size:var(--font-ui-smaller);color:var(--text-accent);text-transform:uppercase;letter-spacing:.05em}
.txi-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.txi-actions button{height:26px;font-size:var(--font-ui-smaller)}
.txi-bar{height:6px;border-radius:3px;background:var(--background-modifier-border);overflow:hidden;margin:4px 0}.txi-bar>div{height:100%;background:var(--interactive-accent);border-radius:3px}
.txi-note{margin:-2px 0 12px;padding:8px 12px;border-radius:8px;background:var(--background-secondary);color:var(--text-muted);font-size:var(--font-ui-smaller);line-height:1.45;max-width:72ch}
.txi-empty{color:var(--text-faint);font-size:var(--font-ui-smaller);font-style:italic}
/* fereastra de revizuire */
.modal.txi-review{width:min(860px,96vw);height:min(760px,92vh);padding:0;display:flex;flex-direction:column}
.txi-review .modal-content{flex:1;display:flex;flex-direction:column;min-height:0;padding:0}
.txi-review .modal-title{padding:16px 20px 0;margin:0}
.txi-rnav{display:flex;gap:18px;padding:10px 20px 0;border-bottom:1px solid var(--background-modifier-border);font-size:var(--font-ui-small)}
.txi-rnav span{padding:2px 1px 9px;margin-bottom:-1px;border-bottom:2px solid transparent;color:var(--text-muted);cursor:pointer;white-space:nowrap}.txi-rnav span.on{color:var(--text-normal);border-bottom-color:var(--interactive-accent)}.txi-rnav span em{font-style:normal;color:var(--text-faint);margin-left:4px}
.txi-rbody{flex:1;overflow:auto;padding:12px 20px}
.txi-rfoot{display:flex;gap:8px;align-items:center;padding:10px 20px;border-top:1px solid var(--background-modifier-border)}.txi-rfoot .txi-muted{margin-right:auto}
.txi-grp{margin:0 0 14px}.txi-grp-h{display:flex;align-items:center;gap:8px;font-weight:600;font-size:var(--font-ui-small);padding:4px 0}.txi-grp-h .txi-meta{font-weight:400;color:var(--text-faint);font-size:var(--font-ui-smaller)}.txi-grp-h .txi-gact{margin-left:auto;display:flex;gap:6px}.txi-grp-h button{height:22px;font-size:var(--font-ui-smaller);padding:0 8px}
.txi-hit{display:flex;gap:8px;align-items:flex-start;padding:5px 6px;border-radius:6px;font-size:var(--font-ui-smaller)}.txi-hit:hover{background:var(--background-modifier-hover)}
.txi-hit input{margin-top:2px;flex:none}.txi-hit .txi-ctx{flex:1;min-width:0;color:var(--text-muted);line-height:1.45}.txi-hit .txi-ctx mark{background:rgba(var(--color-yellow-rgb),.35);color:var(--text-normal);border-radius:2px;padding:0 1px}
.txi-hit .txi-in{color:var(--text-faint);display:block;margin-top:1px}.txi-hit .txi-alt-to{color:var(--text-accent)}
.txi-hit .txi-alt{white-space:nowrap;font-size:var(--font-ui-smaller);padding:0 6px !important;border-radius:999px;border:1px solid var(--background-modifier-border)}.txi-hit .txi-alt:hover{color:var(--text-normal)}.txi-hit .txi-x{flex:none;opacity:0;cursor:pointer;color:var(--text-faint);padding:0 4px}.txi-hit:hover .txi-x{opacity:1}
.txi-why{display:inline-block;font-size:var(--font-ui-smaller);padding:0 6px;border-radius:999px;border:1px solid var(--background-modifier-border);color:var(--text-muted);margin-left:6px}
/* tab-ul nou */
.texere-home .txh-ins{display:flex;flex-direction:column;gap:8px}
.texere-home .txh-ins-row{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 14px;font-size:var(--font-ui-small);color:var(--text-muted);cursor:pointer;padding:6px 8px;margin:0 -8px;border-radius:8px}
.texere-home .txh-ins-row:hover{background:var(--background-modifier-hover)}.texere-home .txh-ins-row b{color:var(--text-normal);font-weight:600;font-variant-numeric:tabular-nums}
.texere-home .txh-ins-streak{margin-left:auto;color:var(--text-faint)}
.texere-home .txh-ins-link{display:flex;align-items:center;gap:10px;font-size:var(--font-ui-small);padding:8px 10px;border-radius:8px;background:var(--background-secondary)}
.texere-home .txh-ins-link span{flex:1;min-width:0}.texere-home .txh-ins-link button{flex:none}
.texere-home .txh-ins-idea{display:flex;gap:10px;align-items:flex-start;font-size:var(--font-ui-small);padding:10px;border-radius:8px;border:1px solid var(--background-modifier-border)}
.texere-home .txh-ins-idea .txh-ins-ic{color:var(--text-accent);flex:none;display:inline-flex;margin-top:1px}.texere-home .txh-ins-idea .txh-ins-ic svg{width:16px;height:16px}
.texere-home .txh-ins-idea .txh-ins-t{flex:1;min-width:0;line-height:1.45}.texere-home .txh-ins-idea .txh-ins-t a{cursor:pointer}
.texere-home .txh-ins-idea button{flex:none;height:26px;font-size:var(--font-ui-smaller)}
/* afirmațiile fără citare, în notă */
.txi-uncited{background:linear-gradient(to right, rgba(var(--color-orange-rgb),.55) 0 2px, transparent 2px)}
.txi-cite{display:inline-flex;gap:4px;align-items:center;margin-left:6px;font-size:var(--font-ui-smaller);font-family:var(--font-interface);color:var(--text-faint);vertical-align:1px;user-select:none}
.txi-cite span{padding:0 6px;border-radius:999px;border:1px solid var(--background-modifier-border);cursor:pointer;white-space:nowrap}.txi-cite span:hover{color:var(--text-normal);border-color:var(--text-faint)}
.txi-cite .txi-cq{border:0;padding:0;cursor:default;color:rgba(var(--color-orange-rgb),.9)}.txi-cite .txi-cx{border:0;padding:0 2px}
`;

const UiMixin = {
  uiInit() {
    const st = document.createElement("style"); st.id = "texere-insights-css"; st.textContent = CSS;
    document.getElementById(st.id)?.remove(); document.head.appendChild(st); this.register(() => st.remove());
    const P = this;
    this.registerView(VIEW, leaf => new InsightsView(leaf, P));
    this.addRibbonIcon("lightbulb", "Texere · Insights", () => this.openView());
    this.addCommand({ id: "open", name: "Open Insights / Deschide Insights", callback: () => this.openView() });
    this.addCommand({ id: "review", name: "Review unlinked mentions / Revizuiește menționările fără link", callback: () => this.review("links") });
    this.addCommand({ id: "scan", name: "Scan the vault now / Caută acum în vault", callback: () => this.scan(false) });
    this.addCommand({ id: "surprise", name: "Surprise me / Surprinde-mă", callback: () => { const s = this.surprise(); if (!s) return new Notice(this.T("Încă nu am destule date. Scrie și citește puțin, apoi încearcă iar.", "Not enough data yet. Write and read a bit, then try again."), 6000); this.showSurprise(s); } });
    this.addCommand({ id: "claims-toggle", name: "Show or hide uncited claims while writing / Arată sau ascunde afirmațiile fără citare", callback: async () => { this.settings.claimsInEditor = this.settings.claimsInEditor === false; await this.saveSettings(); this.refreshEditors(); new Notice(this.settings.claimsInEditor ? this.T("Afirmațiile fără citare se văd în note.", "Uncited claims show in your notes.") : this.T("Afirmațiile fără citare nu se mai văd.", "Uncited claims are hidden."), 4000); } });
    this.claimsInit();
  },
  async openView() {
    const ex = this.app.workspace.getLeavesOfType(VIEW)[0];
    if (ex) { this.app.workspace.revealLeaf(ex); return ex; }
    const leaf = this.app.workspace.getLeaf("tab"); await leaf.setViewState({ type: VIEW, active: true }); this.app.workspace.revealLeaf(leaf); return leaf;
  },
  refreshViews() { for (const l of this.app.workspace.getLeavesOfType(VIEW)) { try { l.view.render(); } catch (e) {} } },
  review(tab) { new ReviewModal(this, tab).open(); },
  // pagina Insights, desenată în altă pagină (tab-ul nou din Texere)
  panel(el) { el.empty(); const v = Object.create(InsightsView.prototype); Object.assign(v, { P: this, contentEl: el, period: "week", balScope: "", expanded: null }); v.render(); return v; },
  openPath(path, newTab) { const f = this.app.vault.getAbstractFileByPath(path); if (f instanceof TFile) this.app.workspace.getLeaf(newTab ? "tab" : false).openFile(f); },
  showSurprise(s) {
    const m = new Modal(this.app), T = (a, b) => this.T(a, b); m.titleEl.setText(T("Surprinde-mă", "Surprise me"));
    el(m.contentEl, "div", "txi-kind", s.kind); el(m.contentEl, "div", "txi-big", s.title); el(m.contentEl, "p", "txi-muted", s.text);
    const bc = m.contentEl.createDiv("modal-button-container");
    bc.createEl("button", { text: T("Încă una", "Another one") }).addEventListener("click", () => { m.close(); const n = this.surprise(); if (n) this.showSurprise(n); });
    if (s.pair) bc.createEl("button", { text: T("Scrie o notă care le leagă", "Write a note that connects them") }).addEventListener("click", async () => { m.close(); await this.connectPair(s.pair); });
    if (s.path) bc.createEl("button", { cls: "mod-cta", text: T("Deschide", "Open") }).addEventListener("click", () => { m.close(); this.openPath(s.path); });
    m.open();
  },
  // o notă nouă care leagă două concepte, cu locurile în care apar împreună
  async connectPair(p) {
    const T = (a, b) => this.T(a, b), dir = String(this.app.fileManager.getNewFileParent?.("")?.path || "").replace(/^\/$/, "").replace(/\/+$/, "");   // unde pune Obsidian notele noi
    const A = this.app.vault.getAbstractFileByPath(p.a), B = this.app.vault.getAbstractFileByPath(p.b); if (!A || !B) return;
    const name = `${A.basename} – ${B.basename}`, path = (dir ? dir + "/" : "") + name.replace(/[\\/:*?"<>|#^[\]]/g, " ") + ".md";
    let f = this.app.vault.getAbstractFileByPath(path);
    if (!f) {
      if (dir && !this.app.vault.getAbstractFileByPath(dir)) await this.app.vault.createFolder(dir).catch(() => {});
      const lk = x => this.app.metadataCache.fileToLinktext(x, path, true);
      const body = `---\ndateCreated: ${X.dayKey()}\n---\n[[${lk(A)}]] · [[${lk(B)}]]\n\n${T("Unde apar împreună:", "Where they meet:")}\n${p.notes.map(n => { const g = this.app.vault.getAbstractFileByPath(n); return g ? `- [[${this.app.metadataCache.fileToLinktext(g, path, true)}]]` : ""; }).filter(Boolean).join("\n")}\n\n`;
      f = await this.app.vault.create(path, body);
    }
    await this.app.workspace.getLeaf("tab").openFile(f);
  },
  // ——— secțiunea din tab-ul nou (o desenează Texere · The Researcher's Vault, dacă Insights e pornit) ———
  homeSection(parent, leaf) {
    const T = (a, b) => this.T(a, b), en = this.en, d = this.totals("day"), st = this.streak(), un = this.visibleUnlinked();
    const box = parent.createDiv("txh-ins");
    el(box, "div", "txh-label", T("Insights", "Insights"));
    const row = box.createDiv("txh-ins-row"); row.title = T("Deschide Insights", "Open Insights");
    const part = (n, label) => { const s = row.createSpan(); s.createEl("b", { text: fmt(n, en) }); s.appendText(" " + label); };
    part(d.t, T("scrise azi", "typed today")); if (d.p + d.x) part(d.p + d.x, T("lipite sau inserate", "pasted or inserted")); part(d.d, T("șterse", "deleted"));
    if (st.now) row.createSpan({ cls: "txh-ins-streak", text: st.now === 1 ? T("1 zi la rând", "1-day streak") : T(`${st.now} zile la rând`, `${st.now}-day streak`) });
    row.addEventListener("click", () => this.openView());
    if (un.length) {
      const l = box.createDiv("txh-ins-link"), notes = new Set(un.map(u => u.note)).size;
      l.createSpan({ text: T(`${un.length} menționări fără link în ${notes} ${notes === 1 ? "notă" : "note"}`, `${un.length} unlinked ${un.length === 1 ? "mention" : "mentions"} in ${notes} ${notes === 1 ? "note" : "notes"}`) });
      l.createEl("button", { text: T("Revizuiește", "Review") }).addEventListener("click", () => this.review("links"));
    }
    let idea = null;   // ideea zilei nu mai apare în tab-ul nou (e în pagina Insights, la „Surprinde-mă”)
    if (idea) {
      const c = box.createDiv("txh-ins-idea"), ic = c.createSpan("txh-ins-ic"); try { setIcon(ic, idea.icon || "lightbulb"); } catch (e) {}
      const t = c.createDiv("txh-ins-t"); t.setText(idea.text);
      const go = idea.pair ? () => this.connectPair(idea.pair) : idea.path ? () => this.openPath(idea.path) : null;
      if (go) { t.addClass("click"); t.style.cursor = "pointer"; t.addEventListener("click", go); }
      c.createEl("button", { text: T("Surprinde-mă", "Surprise me") }).addEventListener("click", () => { const s = this.surprise(); if (s) this.showSurprise(s); else new Notice(T("Încă nu am destule date.", "Not enough data yet."), 4000); });
    }
  },

  // ——— afirmațiile fără citare, în notă: o linie subțire la stânga paragrafului și sursa pe care ai putea-o cita ———
  claimsInit() {
    let VP, Decoration, WidgetType, StateEffect;
    try { ({ ViewPlugin: VP, Decoration, WidgetType } = require("@codemirror/view")); ({ StateEffect } = require("@codemirror/state")); } catch (e) { return; }
    const P = this, refresh = this._claimFx = StateEffect.define();
    class Chip extends WidgetType {
      constructor(p, sugg, path) { super(); this.p = p; this.sugg = sugg; this.path = path; }
      eq(o) { return o.p.hash === this.p.hash && o.sugg.map(s => s.id).join() === this.sugg.map(s => s.id).join(); }
      toDOM(view) {
        const T = (a, b) => P.T(a, b), w = document.createElement("span"); w.className = "txi-cite";
        const q = w.appendChild(document.createElement("span")); q.className = "txi-cq"; q.textContent = T("citare?", "cite?");
        q.title = T(`Paragraful pare o afirmație („${this.p.why}”), dar n-are citare.`, `This paragraph reads like a claim (“${this.p.why}”), but has no citation.`);
        for (const s of this.sugg) { const b = w.appendChild(document.createElement("span")); b.textContent = s.label; b.title = T(`Adaugă [@${s.id}] la finalul paragrafului`, `Add [@${s.id}] at the end of the paragraph`); b.addEventListener("mousedown", e => { e.preventDefault(); e.stopPropagation(); P.insertCite(view, this.p, s.id); }); }
        const x = w.appendChild(document.createElement("span")); x.className = "txi-cx"; x.textContent = "✕"; x.title = T("Nu e o afirmație: nu mai arăta", "Not a claim: don't show again");
        x.addEventListener("mousedown", async e => { e.preventDefault(); e.stopPropagation(); P.settings.notClaims = [...new Set([...(P.settings.notClaims || []), this.p.hash])]; await P.saveSettings(); P.refreshEditors(); });
        return w;
      }
      ignoreEvent() { return true; }
    }
    const build = view => {
      if (P.settings.claimsInEditor === false) return Decoration.none;
      let file = null; try { file = view.state.field(require("obsidian").editorInfoField)?.file; } catch (e) {}
      if (!file || !P.inAnyProject(file.path)) return Decoration.none;
      const text = view.state.doc.toString(), list = P.uncitedIn(text, file.path), deco = [];
      for (const p of list) {
        const sugg = P.suggestCitations(p, text.slice(p.from, p.to), 2);
        const l1 = view.state.doc.lineAt(p.from).number, l2 = view.state.doc.lineAt(Math.max(p.from, p.to - 1)).number;
        for (let l = l1; l <= l2; l++) deco.push(Decoration.line({ class: "txi-uncited" }).range(view.state.doc.line(l).from));
        deco.push(Decoration.widget({ widget: new Chip(p, sugg, file.path), side: 1 }).range(p.to));
      }
      return Decoration.set(deco, true);
    };
    this.registerEditorExtension(VP.fromClass(class {
      constructor(view) { this.view = view; this.decorations = safe(view); }
      update(u) {
        if (u.transactions.some(t => t.effects.some(e => e.is(refresh)))) { this.decorations = safe(u.view); return; }
        if (u.docChanged) { this.decorations = this.decorations.map(u.changes); clearTimeout(this.t); this.t = setTimeout(() => { try { u.view.dispatch({ effects: refresh.of(null) }); } catch (e) {} }, 900); }
      }
      destroy() { clearTimeout(this.t); }
    }, { decorations: v => v.decorations }));
    const safe = view => { try { return build(view); } catch (e) { console.error("Texere · Insights: afirmațiile", e); return Decoration.none; } };
  },
  refreshEditors() { this.app.workspace.iterateAllLeaves(l => { try { l.view?.editor?.cm?.dispatch({ effects: this._claimFx.of(null) }); } catch (e) {} }); },
  insertCite(view, p, id) {
    const doc = view.state.doc, para = doc.sliceString(p.from, p.to), m = /([.!?…])(\s*)$/.exec(para);
    const at = m ? p.from + m.index : p.to, ins = ` [@${id}]`;
    view.dispatch({ changes: { from: at, insert: ins }, userEvent: "input.complete" });
  },

  // ——— recenzia săptămânii: în fiecare luni, o notă scurtă cu săptămâna trecută ———
  async weeklyCheck() {
    if (this.settings.weekly === false) return;
    const now = new Date(), prev = new Date(now); prev.setDate(prev.getDate() - 7); const wk = X.weekKey(prev);
    if (this.settings.lastWeekly === wk) return;
    await this.allLogs();
    const mon = new Date(prev); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7)); const sun = new Date(mon); sun.setDate(sun.getDate() + 6);
    const range = { from: X.dayKey(mon), to: X.dayKey(sun) }, s = this.totals(range);
    this.settings.lastWeekly = wk; await this.saveSettings();
    if (s.added + s.d + s.r < 30) return;   // o săptămână fără scris și citit: nicio notă
    const dir = String(this.settings.weeklyFolder || this.weeklyDefault()).replace(/\/+$/, ""), path = `${dir}/${wk}.md`;
    if (this.app.vault.getAbstractFileByPath(path)) return;
    try {
      let cur = ""; for (const part of dir.split("/")) { cur = cur ? cur + "/" + part : part; if (!this.app.vault.getAbstractFileByPath(cur)) await this.app.vault.createFolder(cur); }
      const f = await this.app.vault.create(path, this.weeklyText(wk, range, s));
      const T = (a, b) => this.T(a, b), frag = document.createDocumentFragment(); frag.append(T(`Recenzia săptămânii ${wk} e gata. `, `Your review of ${wk} is ready. `));
      const a = document.createElement("a"); a.href = "#"; a.textContent = T("Deschide", "Open"); frag.append(a); const n = new Notice(frag, 15000);
      a.addEventListener("click", e => { e.preventDefault(); n.hide(); this.app.workspace.getLeaf("tab").openFile(f); });
    } catch (e) { console.error("Texere · Insights: recenzia", e); }
  },
  weeklyDefault() { const p = String(this.app.fileManager.getNewFileParent?.("")?.path || "").replace(/^\/$/, ""); return (p ? p + "/" : "") + "Weekly reviews"; },
  weeklyText(wk, range, s) {
    const T = (a, b) => this.T(a, b), en = this.en, n = x => fmt(x, en), lines = [];
    const lk = p => { const f = this.app.vault.getAbstractFileByPath(p); return f ? `[[${this.app.metadataCache.fileToLinktext(f, "", true)}]]` : p; };
    lines.push(`---\ndateCreated: ${X.dayKey()}\ntags:\n  - weekly_review\n---`, `# ${T("Săptămâna", "Week")} ${wk}`, "");
    lines.push(`## ${T("Scris", "Writing")}`, `- ${T("Scrise", "Typed")}: **${n(s.t)}** · ${T("lipite", "pasted")}: ${n(s.p)} · ${T("inserate", "inserted")}: ${n(s.x)} · ${T("șterse", "deleted")}: ${n(s.d)} · ${T("net", "net")}: **${n(s.net)}**`);
    const days = this.series(400).filter(d => d.k >= range.from && d.k <= range.to), best = days.slice().sort((a, b) => b.added - a.added)[0];
    if (best?.added) lines.push(`- ${T("Ziua cea mai bună", "Best day")}: ${best.date.toLocaleDateString(en ? "en-GB" : "ro-RO", { weekday: "long", day: "numeric", month: "long" })} (${n(best.added)})`);
    const top = this.topOf(range, "n", 5); if (top.length) { lines.push(`- ${T("Ai lucrat la", "You worked on")}:`); for (const t of top) lines.push(`  - ${lk(t.path)} (+${n(t.added)} / −${n(t.d)})`); }
    lines.push("", `## ${T("Lectură", "Reading")}`, `- ${T("Evidențieri noi", "New highlights")}: **${n(s.r)}**`);
    const em = this.emerging(); if (em.rising.length) lines.push("", `## ${T("În creștere", "Rising")}`, ...em.rising.slice(0, 5).map(r => `- ${lk(r.path)}`));
    const p = this.pairs(1)[0]; if (p) lines.push("", `## ${T("O legătură nefăcută", "An unmade connection")}`, `- ${lk(p.a)} + ${lk(p.b)}: ${T(`împreună în ${p.count} paragrafe, fără link între ele`, `together in ${p.count} paragraphs, with no link between them`)}`);
    const r = this.resurface(1)[0]; if (r) lines.push("", `## ${T("De recitit", "Worth rereading")}`, `- ${lk(r.path)} — ${T(`neatinsă de ${r.months} luni; are în comun: ${r.shared.join(", ")}`, `untouched for ${r.months} months; shares: ${r.shared.join(", ")}`)}`);
    const q = this.openQuestions(); if (q.length) lines.push("", `## ${T("O întrebare deschisă", "An open question")}`, `> ${q[Math.floor(Math.random() * q.length)].q}`);
    return lines.join("\n") + "\n";
  },
};

// ——— pagina Insights ———
class InsightsView extends ItemView {
  constructor(leaf, P) { super(leaf); this.P = P; this.period = "week"; this.balScope = ""; this.expanded = null; }
  getViewType() { return VIEW; }
  getDisplayText() { return "Texere · Insights"; }
  getIcon() { return "lightbulb"; }
  async onOpen() {
    this.contentEl.addClass("txi-view");
    try { await this.P.allLogs(); } catch (e) {}
    if (!this.P.scanCache?.at) this.P.scan(false, true).then(() => this.render()).catch(e => console.error("Texere · Insights", e));
    await this.render();
  }
  // o eroare nu lasă pagina goală: o arată, ca să știi ce s-a întâmplat
  showError(e) { console.error("Texere · Insights: pagina", e); const d = this.contentEl.createDiv("txi-wrap"); d.createEl("h2", { text: "Texere · Insights" }); d.createEl("p", { cls: "txi-muted", text: this.P.T("Pagina n-a putut fi desenată: ", "The page couldn't be drawn: ") + (e?.message || e) }); }
  async render() { try { await this.draw(); } catch (e) { this.contentEl.empty(); this.showError(e); } }
  async draw() {
    const P = this.P, T = (a, b) => P.T(a, b), en = P.en, c = this.contentEl, keep = c.scrollTop;
    c.empty(); const w = c.createDiv("txi-wrap");
    const head = w.createDiv("txi-head"); head.createDiv({ cls: "txi-title", text: "Texere · Insights" });
    const sub = head.createDiv("txi-sub"); sub.createSpan({ text: P.scanCache?.at ? T(`actualizat ${P.ago(P.scanCache.at)}`, `updated ${P.ago(P.scanCache.at)}`) : T("se citește vault-ul…", "reading your vault…") });
    const rb = sub.createEl("button", { text: T("Actualizează", "Refresh") }); rb.addEventListener("click", async () => { rb.disabled = true; rb.setText("…"); await P.allLogs(); P._logsAt = 0; await P.allLogs(); await P.scan(false, true); this.render(); });
    try { this.writing(w); } catch (e) { console.error(e); }
    try { this.behaviour(w); } catch (e) { console.error(e); }
    try { this.topics(w); } catch (e) { console.error(e); }
    try { this.patterns(w); } catch (e) { console.error(e); }
    try { this.forgotten(w); } catch (e) { console.error(e); }
    try { await this.projectsSec(w); } catch (e) { console.error(e); }
    try { this.sources(w); } catch (e) { console.error(e); }
    try { this.links(w); } catch (e) { console.error(e); }
    c.scrollTop = keep;
  }
  sec(w, title, lead) { const s = w.createDiv("txi-sec"); s.createEl("h3", { text: title }); if (lead) s.createDiv({ cls: "txi-lead", text: lead }); return s; }
  card(parent, title, hint) { const c = parent.createDiv("txi-card"); const h = c.createEl("h4", { text: title }); if (hint) h.createSpan({ cls: "txi-hint", text: hint }); return c; }
  num(parent, n, label, neg) { const d = parent.createDiv("txi-num" + (neg ? " neg" : "")); d.createEl("b", { text: fmt(n, this.P.en) }); d.createSpan({ text: label }); }
  row(parent, name, meta, onClick) { const r = parent.createDiv("txi-row" + (onClick ? " click" : "")); r.createSpan({ cls: "txi-name", text: name }); if (meta != null) r.createSpan({ cls: "txi-meta", text: meta }); if (onClick) r.addEventListener("click", onClick); return r; }

  writing(w) {
    const P = this.P, T = (a, b) => P.T(a, b), en = P.en;
    const s = this.sec(w, T("Scrisul", "Writing"), T("Numărat din editor: ce scrii tu, ce lipești, ce inserează alte unelte (de ex. un plugin AI) și ce ștergi. Anulează nu se numără.", "Counted from the editor: what you type, what you paste, what other tools insert (e.g. an AI plugin) and what you delete. Undo isn't counted."));
    const g = s.createDiv("txi-grid"), c1 = this.card(g, T("Cuvinte", "Words"));
    const tabs = c1.createDiv("txi-tabs");
    for (const [id, l] of [["day", T("Azi", "Today")], ["week", T("Săptămâna", "Week")], ["month", T("Luna", "Month")], ["year", T("Anul", "Year")]]) { const b = tabs.createEl("button", { text: l, cls: this.period === id ? "on" : "" }); b.addEventListener("click", () => { this.period = id; this.render(); }); }
    const t = P.totals(this.period), nums = c1.createDiv("txi-nums");
    this.num(nums, t.t, T("scrise", "typed")); this.num(nums, t.p, T("lipite", "pasted")); this.num(nums, t.x, T("inserate", "inserted")); this.num(nums, t.d, T("șterse", "deleted"), true); this.num(nums, t.net, T("net", "net"));
    if (t.t) c1.createEl("p", { text: T(`Ștergi ${Math.round(t.revision * 100)} de cuvinte la 100 scrise.`, `You delete ${Math.round(t.revision * 100)} words for every 100 you type.`) });
    const st = P.streak(), c2 = this.card(g, T("Zile la rând", "Streak"), T("minim 20 de cuvinte pe zi", "min. 20 words a day")), n2 = c2.createDiv("txi-nums");
    this.num(n2, st.now, T("acum", "now")); this.num(n2, st.best, T("cel mai lung", "longest"));
    const top = P.topOf(this.period, "n", 4); if (top.length) { el(c2, "p", null, T("Ai lucrat cel mai mult la:", "You worked most on:")); const l = c2.createDiv("txi-list"); for (const r of top) this.row(l, P.nameOf(r.path), `+${fmt(r.added, en)} / −${fmt(r.d, en)}`, () => P.openPath(r.path)); }
    // calendarul anului, ca pe GitHub: 53 de săptămâni, de duminică la sâmbătă, pătrățele mici, lunile sus, „Mai puțin … Mai mult” jos
    const c3 = s.createDiv("txi-card txi-gh"); c3.style.marginTop = "12px";
    const now = new Date(), end = new Date(now.getFullYear(), now.getMonth(), now.getDate()), start = new Date(end); start.setDate(start.getDate() - 52 * 7 - end.getDay());
    const nDays = Math.round((end - start) / 864e5) + 1, days = P.series(nDays), total = days.reduce((a, d) => a + d.added, 0);
    const hd = c3.createDiv("txi-gh-head"); hd.createEl("h4", { text: T(`${fmt(total, en)} de cuvinte în ultimul an`, `${fmt(total, en)} words in the last year`) });
    const nz = days.map(d => d.added).filter(v => v > 0).sort((a, b) => a - b), q = f => nz.length ? nz[Math.min(nz.length - 1, Math.floor(nz.length * f))] : 0;
    const q1 = q(.25), q2 = q(.5), q3 = q(.75), level = v => !v ? 0 : v <= q1 ? 1 : v <= q2 ? 2 : v <= q3 ? 3 : 4;
    const C = 10, G = 3, S = C + G, L = 30, Tp = 16, cols = Math.ceil(nDays / 7), W = L + cols * S, H = Tp + 7 * S;
    const box = c3.createDiv("txi-gh-scroll"), sv = document.createElementNS(SVG, "svg"); sv.setAttribute("width", W); sv.setAttribute("height", H); sv.setAttribute("viewBox", `0 0 ${W} ${H}`); sv.classList.add("txi-gh-svg"); box.appendChild(sv);
    const loc = en ? "en-GB" : "ro-RO"; let lastLabel = -9;
    days.forEach((d, i) => {
      const col = Math.floor(i / 7), row = i % 7, v = d.added;
      const tip = v ? T(`${fmt(v, en)} cuvinte pe ${d.date.toLocaleDateString(loc, { weekday: "long", day: "numeric", month: "long" })}`, `${fmt(v, en)} words on ${d.date.toLocaleDateString(loc, { weekday: "long", day: "numeric", month: "long" })}`) + (d.d ? T(` · ${fmt(d.d, en)} șterse`, ` · ${fmt(d.d, en)} deleted`) : "")
        : T(`Niciun cuvânt pe ${d.date.toLocaleDateString(loc, { day: "numeric", month: "long" })}`, `No words on ${d.date.toLocaleDateString(loc, { day: "numeric", month: "long" })}`);
      const r = rect(sv, L + col * S, Tp + row * S, C, C, "g" + level(v), tip); r.setAttribute("rx", 2);
      if (d.date.getDate() <= 7 && row === 0 || (i === 0)) { if (col - lastLabel >= 3 && cols - col >= 3) { txt(sv, L + col * S, 10, d.date.toLocaleDateString(loc, { month: "short" }).replace(".", ""), "txi-gh-l"); lastLabel = col; } }
    });
    (en ? ["", "Mon", "", "Wed", "", "Fri", ""] : ["", "Lu", "", "Mi", "", "Vi", ""]).forEach((l, i) => l && txt(sv, 0, Tp + i * S + 9, l, "txi-gh-l"));
    const ft = c3.createDiv("txi-gh-foot"); ft.createSpan({ cls: "txi-muted", text: T("Cuvinte scrise, lipite și inserate, pe zi.", "Words typed, pasted and inserted, per day.") });
    const lg = ft.createDiv("txi-gh-legend"); lg.createSpan({ text: T("Mai puțin", "Less") }); for (let k = 0; k <= 4; k++) lg.createSpan({ cls: "txi-gh-sq g" + k }); lg.createSpan({ text: T("Mai mult", "More") });
    if (!total) el(c3, "p", "txi-empty", T("Numărătoarea a început acum: calendarul se umple pe măsură ce scrii.", "Counting has just started: the calendar fills in as you write."));
  }
  behaviour(w) {
    const P = this.P, T = (a, b) => P.T(a, b), en = P.en;
    const s = this.sec(w, T("Cum lucrezi", "How you work"), T("Tipare din scrisul și lectura ta: când scrii, cum scrii, cât citești față de cât scrii.", "Patterns in your writing and reading: when you write, how you write, how much you read compared to how much you write."));
    const g = s.createDiv("txi-grid"), c1 = this.card(g, T("Pe scurt", "In short")), hab = P.habits();
    if (hab.length) for (const h of hab) c1.createEl("p", { text: h }); else el(c1, "p", "txi-empty", T("Apar după câteva zile de scris.", "These appear after a few days of writing."));
    const c2 = this.card(g, T("Orele în care scrii", "When you write"), T("ultimele 90 de zile", "last 90 days")), h = P.hours(90), mh = Math.max(1, ...h), sv = svg(c2.createDiv("txi-chart"), 24 * 11, 70);
    h.forEach((v, i) => { rect(sv, i * 11, 56 - v / mh * 50, 8, Math.max(1, v / mh * 50), v ? "b" : "b0", `${i}:00 — ${v}`); if (i % 6 === 0) txt(sv, i * 11, 67, `${i}`); });
    const wd = P.weekdays(180), mw = Math.max(1, ...wd), sv2 = svg(c2.createDiv("txi-chart"), 7 * 36, 56), names = en ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] : ["Lu", "Ma", "Mi", "Jo", "Vi", "Sâ", "Du"];
    wd.forEach((v, i) => { rect(sv2, i * 36, 42 - v / mw * 36, 28, Math.max(1, v / mw * 36), v ? "b" : "b0", `${names[i]}: ${v}`); txt(sv2, i * 36 + 14, 53, names[i], null, "middle"); });
    const c3 = this.card(s.createDiv("txi-grid"), T("Lectura lângă scris", "Reading next to writing"), T("ultimele 12 săptămâni", "last 12 weeks")), rw = P.readingWriting(12);
    const mr = Math.max(1, ...rw.map(x => x.r)), mw2 = Math.max(1, ...rw.map(x => x.w)), sv3 = svg(c3.createDiv("txi-chart"), 12 * 44, 84);
    rw.forEach((x, i) => { rect(sv3, i * 44, 70 - x.r / mr * 60, 16, Math.max(1, x.r / mr * 60), x.r ? "b2" : "b0", `${x.wk}: ${x.r} ${T("evidențieri", "highlights")}${x.est ? T(" (estimat)", " (estimated)") : ""}`); rect(sv3, i * 44 + 18, 70 - x.w / mw2 * 60, 16, Math.max(1, x.w / mw2 * 60), x.w ? "b" : "b0", `${x.wk}: ${x.w} ${T("cuvinte", "words")}${x.est ? T(" (estimat)", " (estimated)") : ""}`); txt(sv3, i * 44 + 17, 81, x.wk.slice(6), null, "middle"); });
    const lg = c3.createDiv("txi-legend"); lg.createSpan().innerHTML = ""; const a = lg.createSpan(); a.createEl("i").style.background = "var(--text-faint)"; a.appendText(T("evidențieri", "highlights")); const b = lg.createSpan(); b.createEl("i").style.background = "var(--interactive-accent)"; b.appendText(T("cuvinte scrise", "words written"));
    if (rw.some(x => x.est)) el(c3, "p", "txi-muted", T("Săptămânile dinainte de numărare sunt estimate din notele create atunci.", "Weeks before counting started are estimated from the notes created then."));
  }
  topics(w) {
    const P = this.P, T = (a, b) => P.T(a, b), em = P.emerging();
    const s = this.sec(w, T("Subiecte", "Topics"), T("Ce te interesează mai mult în ultimele două luni, ce lași deoparte și ce citești fără să scrii despre asta. Clic pe un concept: povestea lui în vault.", "What interests you more in the last two months, what you're leaving aside, and what you read without writing about it. Click a concept to see its story in your vault."));
    const g = s.createDiv("txi-grid");
    const list = (title, rows, meta) => { const c = this.card(g, title), l = c.createDiv("txi-list"); if (!rows.length) el(c, "p", "txi-empty", T("Nimic încă.", "Nothing yet.")); for (const r of rows) { const row = this.row(l, r.name, meta(r), () => { this.expanded = this.expanded === r.path ? null : r.path; this.render(); }); if (this.expanded === r.path) this.timeline(l, r.path); } };
    const trend = r => r.bef < 0.5 ? T("nou", "new") : `×${(r.rec / r.bef).toFixed(1)}`;
    list(T("În creștere", "Rising"), em.rising, trend);
    list(T("Citite, nescrise", "Read, not written"), em.unwritten, r => T(`${r.r6} evid.`, `${r.r6} highl.`));
    list(T("Lăsate deoparte", "Fading"), em.fading, trend);
  }
  timeline(parent, path) {
    const P = this.P, T = (a, b) => P.T(a, b), en = P.en, t = P.timeline(path), d = parent.createDiv("txi-detail");
    const when = t.firstAt ? new Date(t.firstAt).toLocaleDateString(en ? "en-GB" : "ro-RO", { month: "long", year: "numeric" }) : "?";
    d.createDiv({ text: T(`Prima dată: ${when}${t.firstSrc ? `, citind ${P.nameOf(t.firstSrc)}` : ""}. În ${t.lit} surse și ${t.own} note de-ale tale.`, `First seen: ${when}${t.firstSrc ? `, reading ${P.nameOf(t.firstSrc)}` : ""}. In ${t.lit} sources and ${t.own} of your notes.`) });
    const mr = Math.max(1, ...t.r), mw = Math.max(1, ...t.w), sv = svg(d.createDiv("txi-chart"), 12 * 30, 50);
    t.months.forEach((m, i) => { rect(sv, i * 30, 38 - t.r[i] / mr * 32, 11, Math.max(1, t.r[i] / mr * 32), t.r[i] ? "b2" : "b0", `${m}: ${t.r[i]}`); rect(sv, i * 30 + 12, 38 - t.w[i] / mw * 32, 11, Math.max(1, t.w[i] / mw * 32), t.w[i] ? "b" : "b0", `${m}: ${t.w[i]}`); txt(sv, i * 30 + 11, 48, m.slice(5), null, "middle"); });
    const a = d.createDiv("txi-actions"); a.createEl("button", { text: T("Deschide nota", "Open the note") }).addEventListener("click", () => P.openPath(path));
  }
  patterns(w) {
    const P = this.P, T = (a, b) => P.T(a, b), pairs = P.pairs(8), br = P.bridges(4);
    const s = this.sec(w, T("Tipare ascunse", "Hidden patterns"), T("Perechi: concepte care apar împreună în aceleași paragrafe mai des decât la întâmplare, dar pe care nu le-ai legat — adesea, ideile pe care nu le-ai scris încă. Punți: singura notă care leagă un grup de note de restul vault-ului.", "Pairs: concepts that appear together in the same paragraphs more often than chance, but that you haven't linked — often the ideas you haven't written yet. Bridges: the only note connecting a group of notes to the rest of your vault."));
    const g = s.createDiv("txi-grid"), c1 = this.card(g, T("Perechi nelegate", "Unlinked pairs")), l1 = c1.createDiv("txi-list");
    if (!pairs.length) el(c1, "p", "txi-empty", T("Apar când ai mai multe note și evidențieri cu aceleași concepte.", "These appear once you have more notes and highlights sharing concepts."));
    for (const p of pairs) {
      const r = this.row(l1, `${p.an} + ${p.bn}`, T(`${p.count} parag. · ${p.notes.length} note`, `${p.count} para. · ${p.notes.length} notes`), e => { const m = new Menu(); m.addItem(i => i.setTitle(T("Scrie o notă care le leagă", "Write a note that connects them")).setIcon("file-plus").onClick(() => P.connectPair(p))); for (const n of p.notes.slice(0, 8)) m.addItem(i => i.setTitle(P.nameOf(n)).setIcon("file").onClick(() => P.openPath(n, true))); m.addSeparator(); m.addItem(i => i.setTitle(T("Nu sunt legate", "Not related")).setIcon("x").onClick(async () => { P.settings.ignoredPairs = [...new Set([...(P.settings.ignoredPairs || []), [p.a, p.b].sort().join("\u0000")])]; await P.saveSettings(); this.render(); })); m.showAtMouseEvent(e); });
    }
    const c2 = this.card(g, T("Punți", "Bridges")), l2 = c2.createDiv("txi-list");
    if (!br.length) el(c2, "p", "txi-empty", T("Nicio notă nu ține singură legătura dintre două părți ale vault-ului.", "No note is the only link between two parts of your vault."));
    for (const b of br) { this.row(l2, b.name, T(`leagă ${b.small.size} note`, `links ${b.small.size} notes`), () => P.openPath(b.path)).title = T(`Fără ea, ${b.small.size} note (de ex. ${b.small.sample.map(x => P.nameOf(x)).join(", ")}) n-ar mai avea legătură cu restul.`, `Without it, ${b.small.size} notes (e.g. ${b.small.sample.map(x => P.nameOf(x)).join(", ")}) would lose their connection to the rest.`); }
  }
  forgotten(w) {
    const P = this.P, T = (a, b) => P.T(a, b);
    const s = this.sec(w, T("De recitit", "Worth rereading"), T("Note neatinse de peste două luni care au concepte comune cu ce scrii acum.", "Notes untouched for over two months that share concepts with what you're writing now."));
    const g = s.createDiv("txi-grid"), c1 = this.card(g, T("Note uitate", "Forgotten notes")), l = c1.createDiv("txi-list"), rs = P.resurface(5);
    if (!rs.length) el(c1, "p", "txi-empty", T("Nimic acum. Apar după ce scrii câteva zile.", "Nothing now. These appear after a few days of writing."));
    for (const r of rs) this.row(l, r.name, T(`${r.months} luni · ${r.shared.join(", ")}`, `${r.months} mo · ${r.shared.join(", ")}`), () => P.openPath(r.path));
    const c2 = this.card(g, T("Surprinde-mă", "Surprise me")), box = c2.createDiv();
    const show = () => { box.empty(); const x = P.surprise(); if (!x) return el(box, "p", "txi-empty", T("Încă nu am destule date.", "Not enough data yet.")); el(box, "div", "txi-kind", x.kind); el(box, "div", "txi-big", x.title); el(box, "p", null, x.text); const a = box.createDiv("txi-actions"); a.createEl("button", { text: T("Încă una", "Another one") }).addEventListener("click", show); if (x.pair) a.createEl("button", { text: T("Scrie o notă care le leagă", "Write a note that connects them") }).addEventListener("click", () => P.connectPair(x.pair)); if (x.path) a.createEl("button", { cls: "mod-cta", text: T("Deschide", "Open") }).addEventListener("click", () => P.openPath(x.path)); };
    show();
  }
  async projectsSec(w) {
    const P = this.P, T = (a, b) => P.T(a, b), en = P.en, list = P.projects(), loc = en ? "en-GB" : "ro-RO", dfmt = d => d.toLocaleDateString(loc, { day: "numeric", month: "long", year: "numeric" });
    const s = this.sec(w, T("Proiectele tale", "Your projects"), T("Ritmul fiecărui proiect (un folder sau o etichetă), țintele de cuvinte ale notelor și paragrafele care afirmă ceva fără citare.", "The pace of each project (a folder or a tag), word targets of your notes, and paragraphs that make a claim without a citation."));
    const g = s.createDiv("txi-grid");
    if (!list.length) { const c = this.card(g, T("Niciun proiect", "No project yet")); c.createEl("p", { text: T("Un proiect e un folder sau o etichetă: teza, un articol, un curs. Îi vezi ritmul, când ajungi la țintă și afirmațiile fără citare.", "A project is a folder or a tag: your thesis, an article, a course. You see its pace, when you'll reach the target and its uncited claims.") }); c.createDiv("txi-actions").createEl("button", { cls: "mod-cta", text: T("Adaugă un proiect", "Add a project") }).addEventListener("click", () => P.openSettings("projects")); }
    for (const p of list) {
      const th = P.project(p), c1 = this.card(g, th.name, th.value.startsWith("#") ? th.value : null), n = c1.createDiv("txi-nums");
      this.num(n, th.words, T("cuvinte acum", "words now")); this.num(n, th.avg, T("pe săptămână", "per week")); if (th.target) this.num(n, th.target, T("ținta", "target"));
      if (th.target) { const bar = c1.createDiv("txi-bar"); bar.createDiv().style.width = Math.min(100, th.words / th.target * 100) + "%"; }
      const dl = th.deadline ? dfmt(th.deadline) : null;
      if (!th.exists) c1.createEl("p", { text: T(`„${th.value}” nu mai e în vault. Alege-l din nou în setări.`, `“${th.value}” isn't in the vault anymore. Choose it again in the settings.`) });
      else if (!th.target) c1.createEl("p", { text: T("Pune o țintă (și un termen) ca să vezi când ajungi acolo.", "Set a target (and a deadline) to see when you'll get there.") });
      else if (th.words >= th.target) c1.createEl("p", { text: T("Ținta e atinsă.", "Target reached.") });
      else { c1.createEl("p", { text: th.eta ? T(`În ritmul ăsta ajungi la țintă pe ${dfmt(th.eta)}${dl ? ` (termenul: ${dl})` : ""}.`, `At this pace you reach the target on ${dfmt(th.eta)}${dl ? ` (deadline: ${dl})` : ""}.`) : T("N-ai scris aici în ultimele 4 săptămâni.", "You haven't written here in the last 4 weeks.") }); if (th.perWeek != null) c1.createEl("p", { text: T(`Ca să prinzi termenul: ~${fmt(th.perWeek, en)} cuvinte pe săptămână.`, `To make the deadline: ~${fmt(th.perWeek, en)} words a week.`) }); }
      const mx = Math.max(1, ...th.weeks.map(x => Math.abs(x.net))), sv = svg(c1.createDiv("txi-chart"), 8 * 40, 50);
      th.weeks.forEach((x, i) => { rect(sv, i * 40, 38 - Math.max(0, x.net) / mx * 32, 26, Math.max(1, Math.max(0, x.net) / mx * 32), x.net > 0 ? "b" : "b0", `${x.wk}: ${x.net}`); txt(sv, i * 40 + 13, 48, x.wk.slice(6), null, "middle"); });
    }
    if (list.length) { const a = s.createDiv("txi-actions"); a.createEl("button", { text: T("Proiectele, în setări", "Projects in the settings") }).addEventListener("click", () => P.openSettings("projects")); }
    const g2 = s.createDiv("txi-grid"); g2.style.marginTop = "12px";
    // țintele notelor
    const c2 = this.card(g2, T("Ținte de cuvinte", "Word targets")), l2 = c2.createDiv("txi-list"), tg = P.targets();
    if (!tg.length) el(c2, "p", "txi-empty", T("Nicio notă cu țintă. Într-o notă: comanda „Texere · Insights · Pune o țintă de cuvinte”.", "No note has a target. In a note: the command “Texere · Insights · Set a word target”."));
    for (const t of tg) { const r = this.row(l2, t.file.basename, t.words == null ? `${fmt(t.target, en)}` : `${fmt(t.words, en)} / ${fmt(t.target, en)}`, () => P.openPath(t.file.path)); if (t.words != null) { const b = l2.createDiv("txi-bar"); b.createDiv().style.width = Math.min(100, t.words / t.target * 100) + "%"; } }
    // afirmații fără citare
    const c3 = this.card(g2, T("Afirmații fără citare", "Uncited claims"), T("în proiecte", "in your projects")), l3 = c3.createDiv("txi-list"); let total = 0;
    for (const f of this.P.app.vault.getMarkdownFiles()) {
      if (!P.inAnyProject(f.path)) continue;
      const list = P.uncitedIn(await P.app.vault.cachedRead(f), f.path); if (!list.length) continue; total += list.length;
      this.row(l3, f.basename, T(`${list.length} parag.`, `${list.length} para.`), async () => { const leaf = P.app.workspace.getLeaf(false); await leaf.openFile(f); const ed = leaf.view?.editor; if (ed) { const pos = ed.offsetToPos(list[0].from); ed.setCursor(pos); ed.scrollIntoView({ from: pos, to: pos }, true); } });
    }
    if (!list.length) el(c3, "p", "txi-empty", T("Se caută în notele proiectelor: adaugă un proiect.", "Looked for in your projects' notes: add a project."));
    else if (!total) el(c3, "p", "txi-empty", T("Niciunul. Bravo.", "None. Well done."));
    else c3.createEl("p", { text: T("În notă, paragraful are o linie portocalie la stânga și, la final, sursa pe care ai putea-o cita.", "In the note, the paragraph has an orange line on the left and, at the end, a source you could cite.") });
  }
  sources(w) {
    const P = this.P, T = (a, b) => P.T(a, b), en = P.en, projects = P.projects();
    const s = this.sec(w, T("Sursele și lectura", "Sources and reading"), T("Pe cine citezi și cum citești: ce evidențiezi și ce întrebări îți rămân.", "Who you cite and how you read: what you highlight and which questions stay open."));
    if (!P.hasSources()) { const n = s.createDiv("txi-note"); n.setText(T("Texere · Sources nu e pornit: autorii, anii și evidențierile se citesc din proprietățile și etichetele notelor tale, așa că cifrele de aici pot fi mai puțin precise.", "Texere · Sources isn't on: authors, years and highlights are read from your notes' properties and tags, so these numbers may be less accurate.")); }
    const g = s.createDiv("txi-grid"), c1 = this.card(g, T("Echilibrul citărilor", "Balance of citations"));
    const tabs = c1.createDiv("txi-tabs"); for (const [id, l] of [["", T("Toate notele", "All notes")], ...projects.map((p, i) => [String(i), P.projectName(p)])]) { const b = tabs.createEl("button", { text: l, cls: this.balScope === id ? "on" : "" }); b.addEventListener("click", () => { this.balScope = id; this.render(); }); }
    const b = P.balance(this.balScope ? projects[+this.balScope] : null);
    if (!b.total) el(c1, "p", "txi-empty", T("Nicio citare [@…] încă.", "No [@…] citations yet."));
    else {
      const n = c1.createDiv("txi-nums"); this.num(n, b.total, T("citări", "citations")); this.num(n, b.unique, T("surse", "sources"));
      if (b.top && b.unique > 2) c1.createEl("p", { text: T(`${Math.round(b.top.share * 100)}% din citări sunt la ${b.top.name}${b.top.share > .35 ? " — te sprijini mult pe un singur autor." : "."}`, `${Math.round(b.top.share * 100)}% of your citations are to ${b.top.name}${b.top.share > .35 ? " — you lean heavily on one author." : "."}`) });
      if (b.newest) c1.createEl("p", { text: T(`Sursele tale: ${b.oldest}–${b.newest}${new Date().getFullYear() - b.newest > 8 ? ` — nimic din ultimii ${new Date().getFullYear() - b.newest} ani.` : "."}`, `Your sources: ${b.oldest}–${b.newest}${new Date().getFullYear() - b.newest > 8 ? ` — nothing from the last ${new Date().getFullYear() - b.newest} years.` : "."}`) });
      const langs = Object.entries(b.langs).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k.toUpperCase()} ${Math.round(v / b.total * 100)}%`).join(" · "); c1.createEl("p", { text: T(`Limbi: ${langs}`, `Languages: ${langs}`) });
      const dec = Object.entries(b.decades).sort((x, y) => x[0] - y[0]); if (dec.length > 1) { const md = Math.max(...dec.map(d => d[1])), sv = svg(c1.createDiv("txi-chart"), dec.length * 34, 50); dec.forEach(([d, v], i) => { rect(sv, i * 34, 38 - v / md * 32, 24, Math.max(1, v / md * 32), "b", `${d}s: ${v}`); txt(sv, i * 34 + 12, 48, `’${String(d).slice(2)}`, null, "middle"); }); }
    }
    const cl = P.claims(), c2 = this.card(g, T("Ce evidențiezi", "What you highlight"));
    if (!cl.total) el(c2, "p", "txi-empty", T("Nicio evidențiere încă.", "No highlights yet."));
    else {
      const n = c2.createDiv("txi-nums"); for (const [k, v] of Object.entries(cl.tot).sort((x, y) => y[1] - x[1]).slice(0, 5)) this.num(n, v, `#${k}`);
      const q = cl.tot.question || 0, c = cl.tot.claim || 0; if (c && q) c2.createEl("p", { text: c > q * 3 ? T(`Evidențiezi de ${Math.round(c / q)} ori mai multe afirmații decât întrebări: citești mai mult ca să aduni decât ca să întrebi.`, `You highlight ${Math.round(c / q)}× more claims than questions: you read more to collect than to question.`) : T(`Un echilibru bun între afirmații (${c}) și întrebări (${q}).`, `A good balance of claims (${c}) and questions (${q}).`) });
      const ag = cl.tot.agree || 0, dg = cl.tot.disagree || 0; if (ag + dg >= 5) c2.createEl("p", { text: dg < ag / 3 ? T(`Rar nu ești de acord (${dg} față de ${ag}). Caută și autori cu care nu ești de acord.`, `You rarely disagree (${dg} vs ${ag}). Look for authors you disagree with, too.`) : T(`De acord: ${ag} · Nu: ${dg}.`, `Agree: ${ag} · Disagree: ${dg}.`) });
      const l = c2.createDiv("txi-list"); for (const r of cl.per.slice(0, 4)) this.row(l, r.name, Object.entries(r.hl).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k, v]) => `${v} ${k}`).join(" · "), () => P.openPath(r.path));
    }
    const oq = P.openQuestions(), c3 = this.card(g, T("Întrebări deschise", "Open questions"), T(`${oq.length}`, `${oq.length}`));
    if (!oq.length) el(c3, "p", "txi-empty", T("Nicio întrebare din lectură fără răspuns în notele tale.", "No question from your reading left unanswered in your notes."));
    else { c3.createEl("p", { text: T("Întrebări (#question) din surse pe care nu le-ai citat încă:", "Questions (#question) from sources you haven't cited yet:") }); const l = c3.createDiv("txi-list"); for (const q of oq.slice(0, 5)) { const r = this.row(l, q.q, q.source, () => P.openPath(q.path)); r.querySelector(".txi-name").style.whiteSpace = "normal"; } }
  }
  links(w) {
    const P = this.P, T = (a, b) => P.T(a, b), un = P.visibleUnlinked();
    const tf = P.targetFolders(), where = tf.length ? tf.join(", ") : T("notele cu aliasuri", "notes with aliases");
    const s = this.sec(w, T("Linkuri și aliasuri", "Links and aliases"), T(`Menționările fără link se caută singure, la 30 de minute, în notele tale, după titlurile și aliasurile notelor-concept (${where}).`, `Unlinked mentions are found automatically every 30 minutes in your notes, from the titles and aliases of your concept notes (${where}).`));
    const g = s.createDiv("txi-grid"); g.style.gridTemplateColumns = "repeat(auto-fit,minmax(190px,1fr))";
    const tile = (title, n, text, tab) => { const c = this.card(g, title); c.createDiv("txi-nums"); this.num(c.querySelector(".txi-nums"), n, text); c.createDiv("txi-actions").createEl("button", { text: T("Revizuiește", "Review"), cls: n ? "mod-cta" : "" }).addEventListener("click", () => P.review(tab)); };
    tile(T("Menționări fără link", "Unlinked mentions"), un.length, T(`în ${new Set(un.map(u => u.note)).size} note`, `in ${new Set(un.map(u => u.note)).size} notes`), "links");
    tile(T("Nume fără notă", "Names without a note"), (P.names || []).length, T("apar des în textul tău", "appear often in your text"), "names");
    tile(T("Aliasuri sugerate", "Suggested aliases"), (P.aliasSugg || []).length, T("pentru conceptele tale", "for your concepts"), "aliases");
    tile(T("Posibile dubluri", "Possible duplicates"), (P.duplicates || []).length, T("perechi de note", "pairs of notes"), "dups");
  }
  async onClose() {}
}

// ——— fereastra de revizuire: menționări fără link, nume fără notă, aliasuri, dubluri ———
class ReviewModal extends Modal {
  constructor(P, tab) { super(P.app); this.P = P; this.tab = tab || "links"; this.sel = new Set(); this.inited = false; }
  async onOpen() {
    this.modalEl.addClass("txi-review"); this.titleEl.setText(this.P.T("Linkuri și aliasuri", "Links and aliases"));
    if (!this.P.scanCache?.at) { this.contentEl.setText(this.P.T("Citesc vault-ul…", "Reading your vault…")); await this.P.scan(false, true); }
    this.draw();
  }
  draw() {
    const P = this.P, T = (a, b) => P.T(a, b), c = this.contentEl, keep = c.querySelector(".txi-rbody")?.scrollTop || 0; c.empty();
    const nav = c.createDiv("txi-rnav"), un = P.visibleUnlinked();
    if (!this.inited) { this.inited = true; for (const u of un) if (!u.amb && !u.common) this.sel.add(u.note + "\u0000" + u.target); }
    for (const [id, l, n] of [["links", T("Menționări fără link", "Unlinked mentions"), un.length], ["names", T("Nume fără notă", "Names without a note"), (P.names || []).length], ["aliases", T("Aliasuri", "Aliases"), (P.aliasSugg || []).length], ["dups", T("Dubluri", "Duplicates"), (P.duplicates || []).length]]) {
      const s = nav.createSpan({ cls: this.tab === id ? "on" : "", text: l }); s.createEl("em", { text: String(n) }); s.addEventListener("click", () => { this.tab = id; this.draw(); });
    }
    const body = c.createDiv("txi-rbody"), foot = c.createDiv("txi-rfoot");
    const rescan = foot.createEl("button", { text: T("Caută din nou", "Scan again") }); rescan.addEventListener("click", async () => { rescan.disabled = true; rescan.setText("…"); await P.scan(true, true); this.draw(); });
    if (this.tab === "links") this.drawLinks(body, foot, un);
    else if (this.tab === "names") this.drawNames(body, foot);
    else if (this.tab === "aliases") this.drawAliases(body, foot);
    else this.drawDups(body, foot);
    body.scrollTop = keep;
  }
  drawLinks(body, foot, un) {
    const P = this.P, T = (a, b) => P.T(a, b);
    foot.createDiv({ cls: "txi-muted", text: T("Se leagă doar prima menționare din fiecare notă; textul rămâne cum l-ai scris.", "Only the first mention in each note is linked; your text stays as you wrote it.") });
    if (!un.length) { body.createDiv({ cls: "txi-empty", text: T("Nicio menționare fără link. Totul e legat.", "No unlinked mentions. Everything is linked.") }); return; }
    const groups = {}; for (const u of un) (groups[u.target] = groups[u.target] || []).push(u);
    // întâi conceptele clare, apoi cele care sunt și cuvinte obișnuite (nebifate: verifică-le)
    let commonShown = false;
    for (const [target, list] of Object.entries(groups).sort((a, b) => (a[1][0].common - b[1][0].common) || b[1].length - a[1].length)) {
      if (list[0].common && !commonShown) { commonShown = true; body.createDiv({ cls: "txi-lead", text: T("Mai jos: concepte care sunt și cuvinte obișnuite (apar în foarte multe note). Nu sunt bifate — bifează doar unde chiar e conceptul.", "Below: concepts that are also everyday words (they appear in very many notes). They're not ticked — tick only where it really is the concept.") }).style.cssText = "margin:14px 0 8px;color:var(--text-muted);font-size:var(--font-ui-smaller)"; }
      const g = body.createDiv("txi-grp"), h = g.createDiv("txi-grp-h"), all = h.createEl("input", { type: "checkbox" }), key = u => u.note + "\u0000" + u.target;
      all.checked = list.every(u => this.sel.has(key(u))); all.addEventListener("change", () => { for (const u of list) all.checked ? this.sel.add(key(u)) : this.sel.delete(key(u)); this.draw(); });
      h.createSpan({ text: P.nameOf(target) }); h.createSpan({ cls: "txi-meta", text: T(`${list.length} ${list.length === 1 ? "notă" : "note"} · ${target}`, `${list.length} ${list.length === 1 ? "note" : "notes"} · ${target}`) });
      const ga = h.createDiv("txi-gact");
      ga.createEl("button", { text: T("Deschide nota", "Open note") }).addEventListener("click", () => P.openPath(target, true));
      ga.createEl("button", { text: T("Ignoră termenul", "Ignore term") }).addEventListener("click", async () => { await P.ignoreTerm(target); this.draw(); });
      for (const u of list) {
        const r = g.createDiv("txi-hit"), cb = r.createEl("input", { type: "checkbox" }); cb.checked = this.sel.has(key(u)); cb.addEventListener("change", () => { cb.checked ? this.sel.add(key(u)) : this.sel.delete(key(u)); this.updateFoot(); });
        const cx = r.createDiv("txi-ctx"); cx.appendText(u.b); cx.createEl("mark", { text: u.hit }); cx.appendText(u.a);
        cx.createSpan({ cls: "txi-in", text: P.nameOf(u.note) + (u.amb ? T(" · mai multe note au acest termen", " · several notes share this term") : "") }); cx.style.cursor = "pointer"; cx.addEventListener("click", () => { cb.checked = !cb.checked; cb.dispatchEvent(new Event("change")); });
        if (u.alt) cx.createSpan({ cls: "txi-in txi-alt-to", text: T(`→ se leagă cu „${P.nameOf(u.alt)}”`, `→ links to “${P.nameOf(u.alt)}”`) });
        const al = r.createSpan({ cls: "txi-x txi-alt", text: T("Leagă cu…", "Link with…") }); al.title = T("Alege altă notă pentru acest link", "Choose another note for this link");
        al.addEventListener("click", () => new NotePicker(P, f => { u.alt = f.path === u.target ? null : f.path; this.sel.add(key(u)); this.draw(); }).open());
        const x = r.createSpan({ cls: "txi-x", text: "✕" }); x.title = T("Nu aici: nu mai sugera acest link în nota asta", "Not here: don't suggest this link in this note again"); x.addEventListener("click", async () => { await P.notHereAdd(u.note, u.target); this.sel.delete(key(u)); this.draw(); });
      }
    }
    this.linkBtn = foot.createEl("button", { cls: "mod-cta" }); this.updateFoot();
    this.linkBtn.addEventListener("click", async () => {
      const items = un.filter(u => this.sel.has(u.note + "\u0000" + u.target)); if (!items.length) return;
      this.linkBtn.disabled = true; this.linkBtn.setText("…");
      const r = await P.applyLinks(items); for (const i of items) this.sel.delete(i.note + "\u0000" + i.target);
      new Notice(T(`Am pus ${r.done} linkuri${r.missed ? `; ${r.missed} n-au mai fost găsite (nota s-a schimbat)` : ""}.`, `Added ${r.done} links${r.missed ? `; ${r.missed} couldn't be found anymore (the note changed)` : ""}.`), 6000);
      this.draw();
    });
  }
  updateFoot() { if (!this.linkBtn) return; const n = this.P.visibleUnlinked().filter(u => this.sel.has(u.note + "\u0000" + u.target)).length; this.linkBtn.setText(this.P.T(`Leagă ${n} selectate`, `Link ${n} selected`)); this.linkBtn.disabled = !n; }
  drawNames(body, foot) {
    const P = this.P, T = (a, b) => P.T(a, b), names = P.names || [];
    foot.createDiv({ cls: "txi-muted", text: T("Nume cu literă mare care apar de cel puțin 3 ori, în cel puțin 2 note, și n-au notă.", "Capitalised names that appear at least 3 times, in at least 2 notes, and have no note.") });
    if (!names.length) { body.createDiv({ cls: "txi-empty", text: T("Niciun nume fără notă.", "No names without a note.") }); return; }
    for (const n of names) {
      const r = body.createDiv("txi-row"); r.createSpan({ cls: "txi-name", text: n.name }); r.createSpan({ cls: "txi-meta", text: T(`${n.count}× · ${n.notes.length} note`, `${n.count}× · ${n.notes.length} notes`) });
      r.createEl("button", { text: T("Creează nota", "Create note") }).addEventListener("click", () => new CreateNoteModal(P, n.name, async () => { await P.scan(false, true); this.draw(); }).open());
      r.createEl("button", { text: T("Ignoră", "Ignore") }).addEventListener("click", async () => { P.settings.ignoredNames = [...new Set([...(P.settings.ignoredNames || []), n.name])]; await P.saveSettings(); P.names = names.filter(x => x !== n); this.draw(); });
    }
  }
  drawAliases(body, foot) {
    const P = this.P, T = (a, b) => P.T(a, b), list = P.aliasSugg || [];
    const why = { link: T("textul linkurilor tale", "your link text"), spelling: T("cum scrii", "how you spell it"), short: T("formă scurtă", "short form"), wikidata: "Wikidata", wikipedia: "Wikipedia", mymemory: "MyMemory" };
    const wd = foot.createEl("button", { text: T("Caută traduceri", "Look up translations") }); wd.title = T("Pentru conceptele fără alias: numele în română din Wikidata, Wikipedia și MyMemory. Cu cât sunt de acord mai multe, cu atât sugestia e mai sigură. Singura parte care folosește internetul.", "For concepts without an alias: the Romanian name from Wikidata, Wikipedia and MyMemory. The more of them agree, the safer the suggestion. The only part that uses the internet.");
    wd.addEventListener("click", async () => { wd.disabled = true; const r = await P.translate((d, t) => wd.setText(`${d}/${t}`)); new Notice(T(`Traduceri pentru ${r.got} din ${r.asked} concepte (Wikidata, Wikipedia, MyMemory).`, `Translations for ${r.got} of ${r.asked} concepts (Wikidata, Wikipedia, MyMemory).`), 6000); this.draw(); });
    foot.createDiv({ cls: "txi-muted", text: T("Aliasurile noi ajută la găsirea menționărilor și la căutare.", "New aliases help find mentions and search.") });
    if (!list.length) { body.createDiv({ cls: "txi-empty", text: T("Nicio sugestie acum.", "No suggestions right now.") }); return; }
    for (const s of list) {
      const r = body.createDiv("txi-row"); const nm = r.createSpan({ cls: "txi-name" }); nm.createEl("b", { text: s.alias }); nm.appendText(T(" → ", " → ") + P.nameOf(s.target)); for (const w of s.why) nm.createSpan({ cls: "txi-why", text: why[w] || w });
      const tr = s.why.filter(w => ["wikidata", "wikipedia", "mymemory"].includes(w)).length;
      r.createSpan({ cls: "txi-meta", text: tr ? T(`${tr}/3 surse`, `${tr}/3 sources`) : s.count > 1 ? `${s.count}×` : "" });
      r.createEl("button", { cls: "mod-cta", text: T("Adaugă", "Add") }).addEventListener("click", async () => { await P.addAlias(s.target, s.alias); this.draw(); });
      r.createEl("button", { text: T("Ignoră", "Ignore") }).addEventListener("click", async () => { await P.ignoreAlias(s.target, s.alias); this.draw(); });
    }
  }
  drawDups(body, foot) {
    const P = this.P, T = (a, b) => P.T(a, b), list = P.duplicates || [];
    foot.createDiv({ cls: "txi-muted", text: T("Note cu același titlu sau alias (sau aproape). Unește-le tu, dacă sunt aceeași idee.", "Notes with the same title or alias (or nearly). Merge them yourself if they're the same idea.") });
    if (!list.length) { body.createDiv({ cls: "txi-empty", text: T("Nicio dublură.", "No duplicates.") }); return; }
    for (const d of list) {
      const r = body.createDiv("txi-row"); r.createSpan({ cls: "txi-name", text: `${P.nameOf(d.a)} ↔ ${P.nameOf(d.b)}` }); r.createSpan({ cls: "txi-meta", text: d.why.join(", ") });
      r.createEl("button", { text: T("Deschide-le", "Open both") }).addEventListener("click", () => { P.openPath(d.a, true); P.openPath(d.b, true); });
      r.createEl("button", { text: T("Nu sunt dubluri", "Not duplicates") }).addEventListener("click", async () => { await P.notDuplicate(d.a, d.b); this.draw(); });
    }
  }
}

// alegi nota cu care se face linkul (oricare din vault)
class NotePicker extends require("obsidian").FuzzySuggestModal {
  constructor(P, done) { super(P.app); this.P = P; this.done = done; this.setPlaceholder(P.T("Leagă cu nota…", "Link with the note…")); }
  getItems() { return this.app.vault.getMarkdownFiles(); }
  getItemText(f) { return f.path.replace(/\.md$/, ""); }
  onChooseItem(f) { this.done(f); }
}

class CreateNoteModal extends Modal {
  constructor(P, name, done) { super(P.app); this.P = P; this.name = name; this.done = done; }
  onOpen() {
    const P = this.P, T = (a, b) => P.T(a, b), c = this.contentEl; this.titleEl.setText(T("Notă nouă", "New note"));
    const folders = P.vaultFolders(); let name = this.name, folder = P.settings.namesFolder || (folders.find(f => /authors$/i.test(f)) || P.targetFolders()[0] || "");
    const tpls = this.app.vault.getMarkdownFiles().filter(f => /templates?\//i.test(f.path)); let tpl = (tpls.find(f => /new author/i.test(f.basename)) || {}).path || "";
    new Setting(c).setName(T("Nume", "Name")).addText(t => t.setValue(name).onChange(v => { name = v; }));
    new Setting(c).setName(T("Folder", "Folder")).addDropdown(d => { for (const f of folders) d.addOption(f, f); d.setValue(folder).onChange(v => { folder = v; }); });
    new Setting(c).setName(T("Șablon", "Template")).addDropdown(d => { d.addOption("", T("fără", "none")); for (const f of tpls) d.addOption(f.path, f.basename); d.setValue(tpl).onChange(v => { tpl = v; }); });
    const bc = c.createDiv("modal-button-container");
    bc.createEl("button", { text: T("Renunț", "Cancel") }).addEventListener("click", () => this.close());
    bc.createEl("button", { cls: "mod-cta", text: T("Creează", "Create") }).addEventListener("click", async () => { P.settings.namesFolder = folder; await P.saveSettings(); const f = await P.createNote(name, folder, tpl); this.close(); new Notice(T(`Am creat „${f.basename}”. Menționările ei apar acum la „Menționări fără link”.`, `Created “${f.basename}”. Its mentions now show under “Unlinked mentions”.`), 6000); this.done?.(); });
  }
  onClose() { this.contentEl.empty(); }
}

module.exports = { UiMixin, VIEW, InsightsView, ReviewModal };
