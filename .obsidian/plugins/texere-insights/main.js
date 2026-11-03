/* Texere · Insights — versiune 1.0.0 (2026-11-03)
 * Plugin separat: câte cuvinte scrii, lipești, inserezi și ștergi; menționările fără link și aliasurile sugerate;
 * tiparele din lectura și scrisul tău (subiecte, perechi nelegate, note uitate, ritmul tezei, echilibrul surselor).
 * Codul e în insights/*.js; aici doar îl pornim. Datele stau pe laptop: stats/ (scrisul) și cache/ (trecerea prin vault).
 */
const { Plugin, PluginSettingTab, Setting, Notice } = require("obsidian");
const LANG = "texere-lang";

const DEFAULTS = {
  streakMin: 20, targetKey: "word-target", countExclude: [],
  targetFolders: ["Fields"], scanExclude: ["Support"], scanQuotes: false, scanTargets: false, autoScan: 30, minTerm: 4,
  thesisFolder: "03. Workspace/02. Thesis", thesisTarget: 0, thesisDeadline: "", claimFolders: ["03. Workspace"], claimsInEditor: true,
  pairFolder: "02. Notes", weekly: true, weeklyFolder: "02. Notes/Weekly reviews",
};

module.exports = class TexereInsights extends Plugin {
  get en() { return this.app.loadLocalStorage(LANG) === "en"; }
  T(ro, en) { return this.en ? en : ro; }
  async onload() {
    this.settings = Object.assign({}, DEFAULTS, (await this.loadData()) || {});
    // modulele din insights/: require("./text") între ele merge la fel
    const dir = this.manifest.dir, ad = this.app.vault.adapter, mods = {};
    const load = async name => { if (mods[name]) return mods[name].exports; const m = { exports: {} }; mods[name] = m; const src = await ad.read(`${dir}/insights/${name}.js`); new Function("module", "exports", "require", src)(m, m.exports, r => r.startsWith("./") ? (mods[r.slice(2)]?.exports || (() => { throw new Error("modul neîncărcat: " + r); })()) : require(r)); return m.exports; };
    for (const n of ["text", "writing", "links", "patterns", "ui"]) await load(n);
    Object.assign(this, mods.writing.exports.WritingMixin, mods.links.exports.LinksMixin, mods.patterns.exports.PatternsMixin, mods.ui.exports.UiMixin);
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
  scheduleScan() { clearInterval(this._scanI); const m = +this.settings.autoScan || 0; if (m > 0) this._scanI = window.setInterval(() => this.scan(false, true).catch(() => {}), m * 60000); }
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

// ——— setările: Scrisul · Linkuri · Insights ———
class InsightsSettingTab extends PluginSettingTab {
  constructor(P) { super(P.app, P); this.P = P; this.id = "texere-insights"; this.name = "Texere · Insights"; this.tab = "writing"; }
  display() {
    const P = this.P, T = (a, b) => P.T(a, b), c = this.containerEl, keep = c.scrollTop; c.empty(); c.addClass("texere-settings");
    try { P.app.plugins.plugins["texere-sources"]?.sources?.settingTab?.css?.(); } catch (e) {}
    const head = c.createDiv("ts-head"); head.createSpan({ cls: "ts-head-t", text: "Texere · Insights" });
    const nav = head.createDiv("ts-nav");
    for (const [id, l] of [["writing", T("Scrisul", "Writing")], ["links", T("Linkuri", "Links")], ["insights", T("Tipare", "Patterns")]]) { const b = nav.createSpan({ cls: "ts-navbtn" + (this.tab === id ? " on" : ""), text: l }); b.addEventListener("click", () => { this.tab = id; this.display(); c.scrollTop = 0; }); }
    const body = c.createDiv("ts-body"), save = async () => { await P.saveSettings(); };
    const folderList = (name, desc, key) => {
      const s = new Setting(body).setName(name).setDesc(desc), cur = P.settings[key] || [];
      const chips = s.descEl.createDiv(); chips.style.marginTop = "6px";
      for (const f of cur) { const ch = chips.createSpan({ cls: "ts-chip btn", text: f + "  ✕" }); ch.style.marginLeft = "0"; ch.style.marginRight = "6px"; ch.addEventListener("click", async () => { P.settings[key] = cur.filter(x => x !== f); await save(); this.display(); }); }
      s.addDropdown(d => { d.addOption("", T("Adaugă un folder…", "Add a folder…")); for (const f of P.vaultFolders()) if (!cur.includes(f)) d.addOption(f, f); d.onChange(async v => { if (!v) return; P.settings[key] = [...cur, v]; await save(); this.display(); }); });
    };
    const folderOne = (name, desc, key) => new Setting(body).setName(name).setDesc(desc).addDropdown(d => { const fs = P.vaultFolders(), cur = String(P.settings[key] || ""); if (cur && !fs.includes(cur)) d.addOption(cur, T(`${cur} (nu există)`, `${cur} (doesn't exist)`)); for (const f of fs) d.addOption(f, f); d.setValue(cur).onChange(async v => { P.settings[key] = v; await save(); P.changed(); }); });
    if (this.tab === "writing") {
      body.createDiv({ cls: "ts-intro", text: T("Cuvintele se numără din editor, pe măsură ce scrii: scrise de tine, lipite, inserate de alte unelte (de exemplu un plugin AI) și șterse. Ce scrie Texere singur în note nu intră la socoteală. Fiecare laptop își ține numărătoarea lui; totalurile le adună.", "Words are counted from the editor as you write: typed by you, pasted, inserted by other tools (for example an AI plugin) and deleted. What Texere writes into notes by itself doesn't count. Each laptop keeps its own count; the totals add them up.") });
      new Setting(body).setName(T("Zi de scris", "A writing day")).setDesc(T("Câte cuvinte trebuie să scrii într-o zi ca să conteze la „zile la rând”.", "How many words you need to write in a day for it to count towards your streak.")).addText(t => { t.setValue(String(P.settings.streakMin)).onChange(async v => { P.settings.streakMin = Math.max(1, parseInt(v, 10) || 20); await save(); }); t.inputEl.type = "number"; t.inputEl.style.width = "80px"; });
      new Setting(body).setName(T("Proprietatea țintei de cuvinte", "Word target property")).setDesc(T("În notă: „word-target: 3000” afișează o bară cu progresul deasupra textului. Comanda „Pune o țintă de cuvinte” o scrie pentru tine.", "In a note: “word-target: 3000” shows a progress bar above the text. The command “Set a word target” writes it for you.")).addText(t => t.setValue(P.settings.targetKey).onChange(async v => { P.settings.targetKey = v.trim() || "word-target"; await save(); }));
      folderList(T("Foldere care nu se numără", "Folders not counted"), T("De exemplu un folder de notițe rapide sau de jurnal.", "For example a quick-notes or journal folder."), "countExclude");
      new Setting(body).setName(T("Laptopurile tale", "Your laptops")).setHeading();
      const logs = P._logs || [P.mine]; for (const L of logs) { const days = Object.keys(L.days || {}).sort(), last = days[days.length - 1]; new Setting(body).setName((L.name || L.device) + (L.device === P.dev ? T(" (acesta)", " (this one)") : "")).setDesc(last ? T(`${days.length} zile numărate · ultima: ${last}`, `${days.length} days counted · last: ${last}`) : T("încă nimic numărat", "nothing counted yet")); }
    } else if (this.tab === "links") {
      body.createDiv({ cls: "ts-intro", text: T("Texere caută în notele tale titlurile și aliasurile notelor-concept (și formele lor: acțiune → acțiunii, filosofie → filosofiei) care nu sunt încă linkuri, și le leagă cu un clic. Doar prima menționare din fiecare notă; textul rămâne cum l-ai scris.", "Texere looks in your notes for the titles and aliases of your concept notes (and their forms: acțiune → acțiunii, filosofie → filosofiei) that aren't links yet, and links them in one click. Only the first mention in each note; your text stays as you wrote it.") });
      folderList(T("Notele-concept (ținta linkurilor)", "Concept notes (link targets)"), T("Titlurile și aliasurile notelor din aceste foldere se caută în text.", "The titles and aliases of the notes in these folders are looked for in your text."), "targetFolders");
      folderList(T("Foldere în care nu se caută", "Folders not scanned"), T("Ghidurile, șabloanele și altele care nu sunt textul tău.", "Guides, templates and anything else that isn't your writing."), "scanExclude");
      new Setting(body).setName(T("Și în citatele din cărți", "In quotes from books too")).setDesc(T("Evidențierile din notele de literatură sunt cuvintele autorului: de obicei nu le schimbăm. Pornește dacă vrei linkuri și acolo.", "Highlights in literature notes are the author's words: usually they stay as they are. Turn on if you want links there too.")).addToggle(t => t.setValue(!!P.settings.scanQuotes).onChange(async v => { P.settings.scanQuotes = v; await save(); }));
      new Setting(body).setName(T("Și între notele-concept", "Between concept notes too")).setDesc(T("Sugerează linkuri și în descrierile notelor-concept (de ex. „Dasein” menționat în „Being”). Oprit: doar în scrisul tău și în notele de lectură.", "Suggest links inside the concept notes' own descriptions too (e.g. “Dasein” mentioned in “Being”). Off: only in your writing and reading notes.")).addToggle(t => t.setValue(!!P.settings.scanTargets).onChange(async v => { P.settings.scanTargets = v; await save(); P.computeLinks(); P.changed(); }));
      new Setting(body).setName(T("Caută singur", "Scan automatically")).setDesc(T("Doar notele schimbate de la ultima trecere; durează de obicei sub o secundă.", "Only notes changed since the last scan; usually takes under a second.")).addDropdown(d => { for (const [v, l] of [["0", T("niciodată (doar când apeși)", "never (only when you ask)")], ["15", T("la 15 minute", "every 15 minutes")], ["30", T("la 30 de minute", "every 30 minutes")], ["60", T("în fiecare oră", "every hour")], ["240", T("la 4 ore", "every 4 hours")]]) d.addOption(v, l); d.setValue(String(P.settings.autoScan || 0)).onChange(async v => { P.settings.autoScan = +v; await save(); P.scheduleScan(); }); });
      new Setting(body).setName(T("Lungimea minimă a unui termen", "Minimum term length")).setDesc(T("Termenii mai scurți (de ex. „Art”) dau prea multe potriviri.", "Shorter terms (e.g. “Art”) give too many matches.")).addDropdown(d => { for (const v of ["3", "4", "5", "6"]) d.addOption(v, v); d.setValue(String(P.settings.minTerm || 4)).onChange(async v => { P.settings.minTerm = +v; await save(); }); });
      const ign = P.settings.ignoredTargets || [];
      if (ign.length) { const s = new Setting(body).setName(T("Termeni ignorați", "Ignored terms")).setDesc(T("Clic pe unul ca să-l sugerez iar.", "Click one to have it suggested again.")); const ch = s.descEl.createDiv(); ch.style.marginTop = "6px"; for (const t of ign) { const x = ch.createSpan({ cls: "ts-chip btn", text: P.nameOf(t) + "  ✕" }); x.style.margin = "0 6px 4px 0"; x.addEventListener("click", async () => { P.settings.ignoredTargets = ign.filter(y => y !== t); await save(); P.computeLinks(); this.display(); }); } }
      const nh = Object.values(P.settings.notHere || {}).reduce((a, l) => a + l.length, 0);
      if (nh) new Setting(body).setName(T("„Nu aici”", "“Not here”")).setDesc(T(`${nh} menționări pe care ai cerut să nu le mai sugerez.`, `${nh} mentions you asked me not to suggest again.`)).addButton(b => b.setButtonText(T("Sugerează-le iar", "Suggest them again")).onClick(async () => { P.settings.notHere = {}; await save(); P.computeLinks(); this.display(); }));
      new Setting(body).setName(T("Acum", "Now")).setDesc(P.scanCache?.at ? T(`Ultima trecere: ${P.ago(P.scanCache.at)} · ${P.visibleUnlinked().length} menționări fără link.`, `Last scan: ${P.ago(P.scanCache.at)} · ${P.visibleUnlinked().length} unlinked mentions.`) : "")
        .addButton(b => b.setButtonText(T("Caută acum", "Scan now")).onClick(async () => { b.setDisabled(true); b.setButtonText("…"); await P.scan(true); this.display(); }))
        .addButton(b => b.setButtonText(T("Revizuiește", "Review")).setCta().onClick(() => P.review("links")));
    } else {
      body.createDiv({ cls: "ts-intro", text: T("Tiparele se calculează pe laptop, din notele tale și din numărătoarea scrisului. Nimic nu pleacă din vault.", "Patterns are worked out on your laptop, from your notes and your writing count. Nothing leaves your vault.") });
      new Setting(body).setName(T("Teza", "Thesis")).setHeading();
      folderOne(T("Folderul tezei", "Thesis folder"), T("Ritmul se calculează din notele de aici.", "The pace is worked out from the notes here."), "thesisFolder");
      new Setting(body).setName(T("Ținta (cuvinte)", "Target (words)")).addText(t => { t.setValue(P.settings.thesisTarget ? String(P.settings.thesisTarget) : "").setPlaceholder("80000").onChange(async v => { P.settings.thesisTarget = parseInt(v, 10) || 0; await save(); P.changed(); }); t.inputEl.type = "number"; t.inputEl.style.width = "110px"; });
      new Setting(body).setName(T("Termenul", "Deadline")).addText(t => { t.setValue(P.settings.thesisDeadline || "").onChange(async v => { P.settings.thesisDeadline = v; await save(); P.changed(); }); t.inputEl.type = "date"; });
      new Setting(body).setName(T("Afirmații fără citare", "Uncited claims")).setHeading();
      folderList(T("Unde le caut", "Where to look"), T("Paragrafele de aici care afirmă ceva (de ex. „prin urmare”, „studiile arată”, un autor numit) și n-au citare.", "Paragraphs here that make a claim (e.g. “therefore”, “studies show”, a named author) and have no citation."), "claimFolders");
      new Setting(body).setName(T("Arată-le în notă, cât scrii", "Show them in the note while you write")).setDesc(T("O linie portocalie la stânga paragrafului și, la final, sursa pe care ai putea-o cita (un clic o adaugă).", "An orange line on the left of the paragraph and, at the end, a source you could cite (one click adds it).")).addToggle(t => t.setValue(P.settings.claimsInEditor !== false).onChange(async v => { P.settings.claimsInEditor = v; await save(); P.refreshEditors(); }));
      new Setting(body).setName(T("Note noi", "New notes")).setHeading();
      folderOne(T("Notele care leagă două concepte", "Notes connecting two concepts"), T("Unde se creează nota de la „Scrie o notă care le leagă”.", "Where “Write a note that connects them” creates the note."), "pairFolder");
      new Setting(body).setName(T("Recenzia săptămânii", "Weekly review")).setDesc(T("În fiecare luni, o notă scurtă cu săptămâna trecută: cuvinte, ce ai citit, subiecte în creștere, o legătură nefăcută, o notă de recitit.", "Every Monday, a short note about last week: words, reading, rising topics, an unmade connection, a note worth rereading.")).addToggle(t => t.setValue(P.settings.weekly !== false).onChange(async v => { P.settings.weekly = v; await save(); }));
      folderOne(T("Folderul recenziilor", "Reviews folder"), "", "weeklyFolder");
    }
    c.scrollTop = keep;
  }
}
