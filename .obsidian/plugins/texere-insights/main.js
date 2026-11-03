/* Texere · Insights — versiune 1.1.0 (2026-11-03)
 * Plugin separat: câte cuvinte scrii, lipești, inserezi și ștergi; menționările fără link și aliasurile sugerate;
 * tiparele din lectura și scrisul tău; ritmul proiectelor (teza, un articol, un curs).
 * Merge singur, în orice vault: recunoaște notele de literatură, evidențierile și notele-concept după convenții.
 * Cu Texere · Sources e mai precis (datele surselor), cu PDF++ știe culorile evidențierilor; niciunul nu e obligatoriu.
 * Codul e în insights/*.js; aici doar îl pornim. Datele stau pe laptop: stats/ (scrisul) și cache/ (trecerea prin vault).
 */
const { Plugin, PluginSettingTab, Setting, Notice } = require("obsidian");
const LANG = "texere-lang";

const DEFAULTS = { claimsInEditor: true, weekly: true };
// setări care nu mai există (acum sunt fixe sau recunoscute singure)
const GONE = ["streakMin", "targetKey", "countExclude", "scanQuotes", "scanTargets", "autoScan", "minTerm", "claimFolders", "pairFolder"];
const SCAN_MIN = 30;

module.exports = class TexereInsights extends Plugin {
  // limba: cea aleasă în Texere; fără Texere, limba lui Obsidian
  get en() { const l = this.app.loadLocalStorage(LANG); if (l === "en" || l === "ro") return l === "en"; let o = ""; try { o = window.localStorage.getItem("language") || ""; } catch (e) {} return !/^ro/i.test(o); }
  T(ro, en) { return this.en ? en : ro; }
  async onload() {
    this.settings = Object.assign({}, DEFAULTS, (await this.loadData()) || {});
    for (const k of GONE) delete this.settings[k];
    // valorile vechi implicite (folderele vault-ului Texere) devin „recunoscute singure”: același rezultat, și în alte vault-uri
    if (JSON.stringify(this.settings.targetFolders) === '["Fields"]') delete this.settings.targetFolders;
    if (JSON.stringify(this.settings.scanExclude) === '["Support"]') delete this.settings.scanExclude;
    // modulele din insights/: require("./text") între ele merge la fel
    const dir = this.manifest.dir, ad = this.app.vault.adapter, mods = {};
    const load = async name => { if (mods[name]) return mods[name].exports; const m = { exports: {} }; mods[name] = m; const src = await ad.read(`${dir}/insights/${name}.js`); new Function("module", "exports", "require", src)(m, m.exports, r => r.startsWith("./") ? (mods[r.slice(2)]?.exports || (() => { throw new Error("modul neîncărcat: " + r); })()) : require(r)); return m.exports; };
    for (const n of ["text", "scope", "writing", "links", "patterns", "ui"]) await load(n);
    Object.assign(this, mods.writing.exports.WritingMixin, mods.links.exports.LinksMixin, mods.patterns.exports.PatternsMixin, mods.ui.exports.UiMixin, mods.scope.exports.ScopeMixin);
    this.settingsCss();
    await this.writingInit();
    this.targetInit();
    this.uiInit();
    this.addSettingTab(new InsightsSettingTab(this));
    this.unlinked = []; this.names = []; this.aliasSugg = []; this.duplicates = [];
    this.app.workspace.onLayoutReady(async () => {
      await this.loadScanCache();
      await this.allLogs();
      try { this.computeLinks(); this.computeNames(); this.computeAliases(); this.computeDuplicates(); } catch (e) {}
      this.changed();
      setTimeout(() => this.scan(false, true).catch(e => console.error("Texere · Insights", e)), 8000);   // după pornire, fără grabă
      this.scheduleScan();
      setTimeout(() => this.weeklyCheck(), 20000); this.registerInterval(window.setInterval(() => this.weeklyCheck(), 3600000));
      // numele comenzilor, ca la celelalte pluginuri Texere
      const name = () => { for (const [id, c] of Object.entries(this.app.commands?.commands || {})) { if (!id.startsWith(this.manifest.id + ":") || !c || c._texereNamed) continue; const raw = String(c.name).replace(/^[^:]*:\s*/, ""), [en, ro] = raw.split(" / "); c.name = `Texere · Insights · ${(this.en ? en : (ro || en)).trim()}`; c._texereNamed = true; } };
      for (const ms of [0, 1500]) setTimeout(() => { try { name(); } catch (e) {} }, ms);
    });
  }
  onunload() { clearInterval(this._scanI); }
  async saveSettings() { await this.saveData(this.settings); }
  scheduleScan() { clearInterval(this._scanI); this._scanI = window.setInterval(() => this.scan(false, true).catch(() => {}), SCAN_MIN * 60000); }   // doar notele schimbate: sub o secundă
  // aspectul paginii de setări (al lui, ca să arate la fel și fără celelalte pluginuri Texere)
  settingsCss() {
    const st = document.createElement("style"); st.id = "texere-insights-settings-css";
    st.textContent = `.txi-settings .ts-head{display:flex;align-items:flex-end;gap:8px 28px;flex-wrap:wrap;border-bottom:1px solid var(--background-modifier-border);margin:0 0 14px}
.txi-settings .ts-head-t{font-size:var(--font-ui-large);font-weight:600;padding-bottom:10px;line-height:1.3}
.txi-settings .ts-nav{display:flex;gap:20px;font-size:var(--font-ui-small);font-weight:500}
.txi-settings .ts-navbtn{padding:2px 1px 10px;margin-bottom:-1px;border-bottom:2px solid transparent;color:var(--text-muted);cursor:pointer;user-select:none;white-space:nowrap}
.txi-settings .ts-navbtn:hover{color:var(--text-normal)}.txi-settings .ts-navbtn.on{color:var(--text-normal);border-bottom-color:var(--interactive-accent)}
.txi-settings .ts-intro{color:var(--text-muted);font-size:var(--font-ui-small);margin:0 0 8px;line-height:1.5;max-width:62ch}
.txi-settings .ts-body .setting-item{border-top:0;padding-top:9px;padding-bottom:9px;gap:16px}
.txi-settings .ts-body .setting-item-name{font-size:var(--font-ui-small);font-weight:500}
.txi-settings .ts-body .setting-item-description{font-size:var(--font-ui-smaller);color:var(--text-muted);padding-top:2px;line-height:1.45}
.txi-settings .ts-body .setting-item-heading{border-top:1px solid var(--background-modifier-border);margin-top:14px;padding-top:14px}
.txi-settings .ts-chip{display:inline-block;margin:0 6px 4px 0;font-size:var(--font-ui-smaller);line-height:1.5;padding:0 8px;border-radius:999px;border:1px solid var(--background-modifier-border);color:var(--text-muted);cursor:pointer;user-select:none}
.txi-settings .ts-chip:hover{color:var(--text-normal);border-color:var(--text-faint)}.txi-settings .ts-auto{color:var(--text-faint)}
.txi-settings .txi-proj .setting-item-control input[type=number]{width:96px}.txi-settings .txi-proj .setting-item-control select{max-width:260px}`;
    document.getElementById(st.id)?.remove(); document.head.appendChild(st); this.register(() => st.remove());
  }
  // ceva s-a schimbat: tab-ul nou (Texere · The Researcher's Vault) și pagina Insights se redesenează
  changed() {
    clearTimeout(this._chT);
    this._chT = setTimeout(() => { try { this.app.workspace.trigger("texere:changed"); } catch (e) {} try { this.refreshViews(); } catch (e) {} }, 300);
  }
  ago(t) {
    const s = Math.max(0, (Date.now() - t) / 1000), T = (a, b) => this.T(a, b);
    if (s < 60) return T("acum", "just now"); if (s < 3600) return T(`acum ${Math.round(s / 60)} min`, `${Math.round(s / 60)} min ago`);
    if (s < 86400) return T(`acum ${Math.round(s / 3600)} h`, `${Math.round(s / 3600)} h ago`); return T(`acum ${Math.round(s / 86400)} zile`, `${Math.round(s / 86400)} days ago`);
  }
  vaultFolders() { const out = []; const walk = f => { for (const c of f.children || []) if (Array.isArray(c.children) && !c.name.startsWith(".")) { out.push(c.path); walk(c); } }; try { walk(this.app.vault.getRoot()); } catch (e) {} return out.sort((a, b) => a.localeCompare(b)); }
  openSettings(tab) { try { this.app.setting.open(); this.app.setting.openTabById(this.manifest.id); const t = this.app.setting.activeTab; if (t && tab) { t.tab = tab; t.display(); } } catch (e) {} }
  // un panou în notă (ținta de cuvinte) are lățimea textului, în orice temă (la fel ca statisticile și bibliografia)
  fitPanel(box, watch) {
    const sizer = box?.isConnected && box.closest(".cm-sizer, .markdown-preview-sizer"); if (!sizer) return;
    const refs = [":scope > .cm-contentContainer .cm-line:not(.HyperMD-table-row)", ":scope > .inline-title", ":scope > div:not(.mod-header):not(.mod-footer) > :is(p, h1, h2, h3, ul, ol)", ":scope > .mod-header .inline-title"];
    let r = null; for (const q of refs) { for (const e of sizer.querySelectorAll(q)) { if (!e.offsetParent) continue; const b = e.getBoundingClientRect(); if (b.width > 120) { r = b; break; } } if (r) break; }
    if (r) { box.style.boxSizing = "border-box"; box.style.maxWidth = "100%"; box.style.width = r.width + "px"; const b = box.getBoundingClientRect(); const cur = parseFloat(box.style.marginLeft) || 0, ml = Math.round((cur + r.left - b.left) * 10) / 10; if (b.width && Math.abs(ml - cur) > 0.5) box.style.marginLeft = ml + "px"; }
    if (watch && !sizer._txiFit && typeof ResizeObserver !== "undefined") { let w = 0; sizer._txiFit = new ResizeObserver(en => { const nw = Math.round(en[0]?.contentRect?.width || 0); if (nw === w) return; w = nw; sizer.querySelectorAll(".txi-target").forEach(x => this.fitPanel(x)); }); sizer._txiFit.observe(sizer); this.register(() => { sizer._txiFit?.disconnect(); delete sizer._txiFit; }); }
  }
};

// ——— setările: doar ce nu se poate recunoaște singur. Linkuri · Proiecte ———
class InsightsSettingTab extends PluginSettingTab {
  constructor(P) { super(P.app, P); this.P = P; this.id = "texere-insights"; this.name = "Texere · Insights"; this.tab = "links"; }
  display() {
    const P = this.P, T = (a, b) => P.T(a, b), c = this.containerEl, keep = c.scrollTop; c.empty(); c.addClass("texere-settings"); c.addClass("txi-settings");
    if (this.tab !== "projects") this.tab = "links";
    const head = c.createDiv("ts-head"); head.createSpan({ cls: "ts-head-t", text: "Texere · Insights" });
    const nav = head.createDiv("ts-nav");
    for (const [id, l] of [["links", T("Linkuri", "Links")], ["projects", T("Proiecte", "Projects")]]) { const b = nav.createSpan({ cls: "ts-navbtn" + (this.tab === id ? " on" : ""), text: l }); b.addEventListener("click", () => { this.tab = id; this.display(); c.scrollTop = 0; }); }
    const body = c.createDiv("ts-body"), save = async () => { await P.saveSettings(); };
    // o listă de foldere: goală = recunoscută singură (și scrie ce a găsit)
    const folderList = (name, desc, key, auto) => {
      const s = new Setting(body).setName(name).setDesc(desc), cur = (P.settings[key] || []).filter(Boolean), box = s.descEl.createDiv(); box.style.marginTop = "6px";
      if (!cur.length) box.createSpan({ cls: "ts-auto", text: T("Recunoscute singure: ", "Found automatically: ") + (auto.length ? auto.join(", ") : T("niciunul", "none")) });
      for (const f of cur) box.createSpan({ cls: "ts-chip", text: f + "  ✕" }).addEventListener("click", async () => { P.settings[key] = cur.filter(x => x !== f); if (!P.settings[key].length) delete P.settings[key]; await save(); P._cf = null; this.display(); });
      s.addDropdown(d => { d.addOption("", T("Alege un folder…", "Choose a folder…")); for (const f of P.vaultFolders()) if (!cur.includes(f)) d.addOption(f, f); d.onChange(async v => { if (!v) return; P.settings[key] = [...cur, v]; await save(); P._cf = null; this.display(); }); });
    };
    if (this.tab === "links") {
      body.createDiv({ cls: "ts-intro", text: T("Texere caută în notele tale titlurile și aliasurile notelor-concept (și formele lor: acțiune → acțiunii) care nu sunt încă linkuri. Doar prima menționare din fiecare notă; citatele din cărți rămân neatinse. Caută singur, la 30 de minute.", "Texere looks in your notes for the titles and aliases of your concept notes (and their forms: acțiune → acțiunii) that aren't links yet. Only the first mention in each note; quotes from books stay untouched. It looks by itself every 30 minutes.") });
      folderList(T("Notele-concept", "Concept notes"), T("Ținta linkurilor. Gol: folderele în care cele mai multe note au aliasuri (sau, dacă nu sunt, orice notă cu aliasuri).", "Where links point. Empty: the folders where most notes have aliases (or, if there are none, any note with aliases)."), "targetFolders", P.autoConceptFolders());
      folderList(T("Foldere în care nu se caută", "Folders not scanned"), T("Ce nu e scrisul tău. Gol: șabloanele, fișierele excluse în Obsidian și folderele de tip Support sau Attachments.", "What isn't your writing. Empty: templates, Obsidian's excluded files and folders like Support or Attachments."), "scanExclude", P.autoExcluded());
      new Setting(body).setName(T("Acum", "Now")).setDesc(P.scanCache?.at ? T(`Ultima trecere: ${P.ago(P.scanCache.at)} · ${P.visibleUnlinked().length} menționări fără link.`, `Last scan: ${P.ago(P.scanCache.at)} · ${P.visibleUnlinked().length} unlinked mentions.`) : "")
        .addButton(b => b.setButtonText(T("Caută acum", "Scan now")).onClick(async () => { b.setDisabled(true); b.setButtonText("…"); await P.scan(true); this.display(); }))
        .addButton(b => b.setButtonText(T("Revizuiește", "Review")).setCta().onClick(() => P.review("links")));
      const ign = P.settings.ignoredTargets || [];
      if (ign.length) { const s = new Setting(body).setName(T("Termeni ignorați", "Ignored terms")).setDesc(T("Clic pe unul ca să fie sugerat iar.", "Click one to have it suggested again.")); const ch = s.descEl.createDiv(); ch.style.marginTop = "6px"; for (const t of ign) ch.createSpan({ cls: "ts-chip", text: P.nameOf(t) + "  ✕" }).addEventListener("click", async () => { P.settings.ignoredTargets = ign.filter(y => y !== t); await save(); P.computeLinks(); this.display(); }); }
      const nh = Object.values(P.settings.notHere || {}).reduce((a, l) => a + l.length, 0);
      if (nh) new Setting(body).setName(T("„Nu aici”", "“Not here”")).setDesc(T(`${nh} menționări pe care ai cerut să nu le mai sugerez.`, `${nh} mentions you asked not to be suggested again.`)).addButton(b => b.setButtonText(T("Sugerează-le iar", "Suggest them again")).onClick(async () => { P.settings.notHere = {}; await save(); P.computeLinks(); this.display(); }));
    } else {
      body.createDiv({ cls: "ts-intro", text: T("Un proiect e un folder sau o etichetă: teza, un articol, un curs. Vezi cât ai scris, ritmul pe săptămână, când ajungi la țintă și paragrafele care afirmă ceva fără citare.", "A project is a folder or a tag: your thesis, an article, a course. You see how much you've written, your weekly pace, when you'll reach the target and the paragraphs that make a claim without a citation.") });
      const list = P.projects(), folders = P.vaultFolders(), tags = P.vaultTags();
      list.forEach((p, i) => {
        const th = P.project(p), s = new Setting(body).setName(th.name || T("Proiect nou", "New project")).setDesc(th.exists ? T(`${th.words.toLocaleString("ro-RO")} cuvinte în ${th.docs} note`, `${th.words.toLocaleString("en-GB")} words in ${th.docs} notes`) : T("Alege un folder sau o etichetă.", "Choose a folder or a tag."));
        s.settingEl.addClass("txi-proj");
        s.addDropdown(d => { d.addOption("", T("Folder sau etichetă…", "Folder or tag…")); for (const f of folders) d.addOption(f, "📁 " + f); for (const t of tags) d.addOption(t, t); if (p.value && !folders.includes(p.value) && !tags.includes(p.value)) d.addOption(p.value, p.value); d.setValue(p.value || "").onChange(async v => { p.value = v; await save(); this.display(); P.changed(); }); });
        s.addText(t => { t.setPlaceholder(T("ținta (cuvinte)", "target (words)")).setValue(p.target ? String(p.target) : "").onChange(async v => { p.target = parseInt(v, 10) || 0; await save(); P.changed(); }); t.inputEl.type = "number"; });
        s.addText(t => { t.setValue(p.deadline || "").onChange(async v => { p.deadline = v; await save(); P.changed(); }); t.inputEl.type = "date"; t.inputEl.title = T("Termenul", "Deadline"); });
        s.addExtraButton(b => b.setIcon("x").setTooltip(T("Scoate proiectul (notele rămân)", "Remove the project (notes stay)")).onClick(async () => { list.splice(i, 1); await save(); this.display(); P.changed(); }));
      });
      new Setting(body).addButton(b => b.setButtonText(T("Adaugă un proiect", "Add a project")).onClick(async () => { list.push({ value: "", target: 0, deadline: "" }); await save(); this.display(); }));
      new Setting(body).setName(T("Afirmații fără citare, cât scrii", "Uncited claims while you write")).setDesc(T("În notele proiectelor: o linie portocalie la stânga paragrafului și sursa pe care ai putea-o cita (un clic o adaugă).", "In your projects' notes: an orange line on the left of the paragraph and a source you could cite (one click adds it).")).addToggle(t => t.setValue(P.settings.claimsInEditor !== false).onChange(async v => { P.settings.claimsInEditor = v; await save(); P.refreshEditors(); }));
      const wk = new Setting(body).setName(T("Recenzia săptămânii", "Weekly review")).setDesc(T("În fiecare luni, o notă scurtă cu săptămâna trecută.", "Every Monday, a short note about last week.")).addToggle(t => t.setValue(P.settings.weekly !== false).onChange(async v => { P.settings.weekly = v; await save(); this.display(); }));
      if (P.settings.weekly !== false) wk.addDropdown(d => { const cur = P.settings.weeklyFolder || P.weeklyDefault(); if (!folders.includes(cur)) d.addOption(cur, cur); for (const f of folders) d.addOption(f, f); d.setValue(cur).onChange(async v => { P.settings.weeklyFolder = v; await save(); }); });
    }
    c.scrollTop = keep;
  }
}
