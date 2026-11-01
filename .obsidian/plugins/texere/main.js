/* Texere · The Researcher's Vault — versiune 3.3.0 (2026-11-01)
 * Pluginul general al vault-ului și intrarea spre celelalte pluginuri Texere:
 *  1. Configurarea pe un laptop nou (scriptul „Support/Templates/New laptop setup”) și scripturile de pornire
 *     (butonul Ajutor, închiderea capitolelor ghidului), prin Templater.
 *  2. Setările lui (Setări → Texere · The Researcher's Vault): limba; pluginurile Texere (Sources, Export);
 *     pluginurile de care depinde Texere (PDF++, Templater), instalate și pornite dintr-un clic; harta domeniilor
 *     (Fields/Philosophy: ramuri, subdomenii, concepte, teorii, curente, perioade), creată la cerere.
 *  3. La prima pornire, o singură dată: ce lipsește, cu un buton care face tot (doar când configurarea nu poate porni,
 *     de ex. fără Templater; altfel o face configurarea, la pasul „Pluginuri”).
 *  4. Panoul din fiecare tab nou: ce trebuie reparat (cu un buton), Adaugă o sursă · Exportă · Ajutor, ultimele 5 fișiere.
 * Texere · Sources și Texere · Export sunt pluginuri separate (fiecare cu folderul lui în .obsidian/plugins).
 */
const { Plugin, Notice, TFile, Modal, Setting, PluginSettingTab, requestUrl, normalizePath, setIcon } = require("obsidian");

const CONFIG = "Support/Templates/New laptop setup.md";
const STARTS = ["Support/Admin/Scripts/Guide folding.md", "Support/Admin/Scripts/Help.md"];
const FLAG = "texere-setup";
const LANG = "texere-lang";   // limba aleasă în fereastra de configurare și în Ajutor (ro / en); o folosesc toate pluginurile Texere
const sleep = ms => new Promise(r => setTimeout(r, ms));

// pluginurile Texere (vin cu vault-ul)
const TEXERE = [
  { id: "texere-sources", name: "Texere · Sources", ro: "Caută surse în cataloage și le adaugă cu PDF-ul gratuit, importă din Zotero, citează în stilul ales și aduce evidențierile din PDF în notă.", en: "Searches catalogs and adds sources with their free PDF, imports from Zotero, cites in your chosen style and brings PDF highlights into your notes." },
  { id: "texere-export", name: "Texere · Export", ro: "Exportă nota în PDF, Word, LaTeX, HTML sau Markdown, cu cuprins, pagină și șabloanele facultății. Citările vin din Texere · Sources.", en: "Exports a note to PDF, Word, LaTeX, HTML or Markdown, with contents, page layout and thesis templates. Citations come from Texere · Sources." },
];
// pluginurile de care depinde Texere (doar acestea): din lista oficială Obsidian, instalate ca din Setări → Community plugins
const DEPS = [
  { id: "pdf-plus", name: "PDF++", repo: "RyotaUshio/obsidian-pdf-plus", by: "texere-sources", ro: "Evidențierile din PDF: culorile, etichetele și legăturile spre locul din PDF (Texere · Sources).", en: "PDF highlights: colors, tags and links back to the place in the PDF (Texere · Sources)." },
  { id: "templater-obsidian", name: "Templater", repo: "SilentVoid13/Templater", by: "texere", ro: "Butonul Ajutor, ghidurile și configurarea pe un laptop nou.", en: "The Help button, the guides and the setup on a new laptop." },
];
// hărțile domeniilor: notele din Fields/<domeniu>, din care vin valorile proprietăților notelor (ramură, concepte, teorii…)
const MAPS = [
  { id: "philosophy", folder: "Philosophy", ro: "Filosofie", en: "Philosophy", file: "fields/philosophy.json" },
];

module.exports = class Texere extends Plugin {
  async onload() {
    this.settings = Object.assign({ onboarded: false }, (await this.loadData()) || {});
    this.loadedAt = Date.now();
    // (setările vechi ale Sources și Export rămân aici neatinse: pluginurile lor le copiază de aici la prima pornire)
    this.register(() => document.getElementById("texere-core-css")?.remove());
    this.addCommand({ id: "setup", name: "Setup", callback: () => this.runConfig(false) });
    this.addCommand({ id: "set-up-plugins", name: this.T("Ce lipsește: pluginuri și hartă", "What's missing: plugins and map"), callback: () => this.onboard(true) });
    this.addSettingTab(new TexereSettingTab(this));
    this.app.workspace.onLayoutReady(() => { this.start().catch(e => console.error("Texere:", e)); });
    // panoul din tab-ul nou
    this.app.workspace.onLayoutReady(() => {
      try { this.home(); } catch (e) { console.error("Texere: panoul", e); }
      this.registerEvent(this.app.workspace.on("layout-change", () => this.home()));
      this.registerEvent(this.app.workspace.on("active-leaf-change", l => { if (l?.view?.getViewType?.() === "empty") this.home(l); }));
    });
    this.register(() => (this.app.workspace.getLeavesOfType?.("empty") || []).forEach(l => { const c = l.view?.contentEl; c?.querySelector(".texere-home")?.remove(); c?.removeClass("texere-home-on"); }));
    // fereastra „ce lipsește”: doar dacă nu pornește configurarea (ea face același lucru la pasul „Pluginuri”)
    this.app.workspace.onLayoutReady(() => setTimeout(() => { if (this._setup || (this.needsConfig() && this.app.plugins.plugins["templater-obsidian"])) return; this.onboard(false).catch(e => console.error("Texere: configurarea", e)); }, 4000));
  }
  save() { return this.saveData(this.settings); }
  get en() { return this.app.loadLocalStorage(LANG) === "en"; }
  T(a, b) { return this.en ? b : a; }

  base() { const a = this.app.vault.adapter; return a.getBasePath ? a.getBasePath() : a.basePath; }

  async waitFor(ids, ms) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (ids.every(id => this.app.plugins.plugins[id])) return true; await sleep(300); }
    return false;
  }

  needsConfig() {
    if (!this.app.loadLocalStorage(FLAG)) return true;              // niciodată configurat pe acest laptop
    const f = this.app.loadLocalStorage(FLAG);
    return !f || f.base !== this.base();                             // vault mutat sau copiat în alt folder
  }

  async start() {
    if (!(await this.waitFor(["templater-obsidian"], 20000))) return;   // fără Templater: fereastra de configurare îl oferă
    await this.enableStartupScripts();
    if (this.needsConfig()) { await sleep(1500); await this.runConfig(true); }
  }

  async enableStartupScripts() {
    try {
      const T = this.app.plugins.plugins["templater-obsidian"];
      const files = STARTS.filter(p => this.app.vault.getAbstractFileByPath(p));
      if (!T || !files.length) return;
      const loc = this.app.loadLocalStorage("templater-local-settings") || {};
      if (!loc.enable_startup_templates) this.app.saveLocalStorage("templater-local-settings", { ...loc, enable_startup_templates: true });
      let add = false;
      files.forEach(p => { if (!T.settings.startup_templates.includes(p)) { T.settings.startup_templates.push(p); add = true; } });
      if (add) await T.save_settings();
      if (!window.__ghidPliere || !window.__ghidAjutor) await T.templater.execute_startup_scripts();
    } catch (e) { console.error("Texere: scripturile de pornire", e); }
  }
  async runConfig(auto, lang) {
    if (lang) this.app.saveLocalStorage(LANG, lang);       // comanda în engleză deschide fereastra în engleză
    const en = this.app.loadLocalStorage(LANG) === "en";
    const T = this.app.plugins.plugins["templater-obsidian"];
    const f = this.app.vault.getAbstractFileByPath(CONFIG);
    if (!T || !(f instanceof TFile)) { new Notice(en ? "I can't find the setup script (Support/Templates/New laptop setup)." : "Nu găsesc scriptul de configurare (Support/Templates/New laptop setup)."); return; }
    // scriptul rulează direct (ca scripturile de pornire), fără să creeze o notă nouă „Untitled”;
    // raportul se scrie direct în nota „Raport configurare” / „Setup report”
    const t = T.templater;
    this._setup = true;
    try {
      if (t.create_running_config && t.read_and_parse_template) {
        try { await t.read_and_parse_template(t.create_running_config(f, f, 5)); }
        catch (e) { console.error("Texere: configurarea", e); new Notice((en ? "The setup stopped: " : "Configurarea s-a oprit: ") + e.message); }
        return;
      }
      await t.create_new_note_from_template(f, undefined, undefined, true);   // versiuni vechi de Templater
    } finally { this._setup = false; }
  }

  // ——— pluginurile: pornit / instalat, dar oprit / lipsă ———
  state(id) { const P = this.app.plugins; return P.enabledPlugins?.has?.(id) ? "on" : P.manifests?.[id] ? "off" : "missing"; }
  async enable(id) { await this.app.plugins.enablePluginAndSave(id); }
  async disable(id) { await this.app.plugins.disablePluginAndSave(id); }
  // instalează un plugin din lista oficială (ca din Setări → Community plugins → Install), apoi îl pornește
  async install(dep) {
    let repo = dep.repo;
    try {   // depozitul, din lista oficială Obsidian (dacă s-a mutat între timp)
      const r = await requestUrl({ url: "https://raw.githubusercontent.com/obsidianmd/obsidian-releases/HEAD/community-plugins.json", throw: false });
      const hit = (r.status === 200 ? r.json : []).find?.(p => p.id === dep.id); if (hit?.repo) repo = hit.repo;
    } catch (e) {}
    const mr = await requestUrl({ url: `https://github.com/${repo}/releases/latest/download/manifest.json`, throw: false });
    if (mr.status !== 200) throw new Error(this.T(`nu găsesc ${dep.name} pe GitHub`, `couldn't find ${dep.name} on GitHub`));
    const man = mr.json || JSON.parse(mr.text);
    const P = this.app.plugins;
    if (typeof P.installPlugin === "function") await P.installPlugin(repo, man.version, man);
    else {   // versiuni vechi: fișierele plugin-ului, direct în folderul lui
      const ad = this.app.vault.adapter, dir = normalizePath(`${this.app.vault.configDir}/plugins/${man.id}`);
      if (!(await ad.exists(dir))) await ad.mkdir(dir);
      for (const f of ["manifest.json", "main.js", "styles.css"]) { const r = await requestUrl({ url: `https://github.com/${repo}/releases/download/${man.version}/${f}`, throw: false }); if (r.status === 200) await ad.write(`${dir}/${f}`, r.text); else if (f !== "styles.css") throw new Error(`${dep.name}: ${f} ${r.status}`); }
      await P.loadManifests?.();
    }
    await P.enablePluginAndSave(man.id || dep.id);
  }
  // ——— harta domeniilor ———
  async mapData(m) { if (!this._maps) this._maps = {}; if (!this._maps[m.id]) this._maps[m.id] = JSON.parse(await this.app.vault.adapter.read(normalizePath(`${this.manifest.dir}/${m.file}`))); return this._maps[m.id]; }
  async mapStatus(m) {
    const d = await this.mapData(m), root = d.root || "Fields", files = Object.keys(d.files).filter(p => p.startsWith(m.folder + "/"));
    const have = files.filter(p => this.app.vault.getAbstractFileByPath(normalizePath(`${root}/${p}`))).length;
    return { total: files.length, have, folder: `${root}/${m.folder}` };
  }
  // creează notele care lipsesc (nu atinge ce ai deja)
  async createMap(m) {
    const d = await this.mapData(m), root = d.root || "Fields"; let made = 0;
    for (const [rel, text] of Object.entries(d.files)) {
      if (!rel.startsWith(m.folder + "/")) continue;
      const path = normalizePath(`${root}/${rel}`); if (this.app.vault.getAbstractFileByPath(path)) continue;
      const dir = path.slice(0, path.lastIndexOf("/")); let cur = "";
      for (const part of dir.split("/")) { cur = cur ? `${cur}/${part}` : part; if (!this.app.vault.getAbstractFileByPath(cur)) { try { await this.app.vault.createFolder(cur); } catch (e) {} } }
      try { await this.app.vault.create(path, text); made++; } catch (e) { console.warn("Texere: harta", path, e); }
    }
    return made;
  }
  // ce mai e de făcut: pluginurile lipsă sau oprite, harta
  async todo() {
    const T = (a, b) => this.T(a, b), out = [];
    for (const d of DEPS) { const st = this.state(d.id); if (st !== "on") out.push({ kind: "dep", d, st, label: st === "missing" ? T(`Instalează și pornește ${d.name}`, `Install and turn on ${d.name}`) : T(`Pornește ${d.name}`, `Turn on ${d.name}`), why: this.en ? d.en : d.ro }); }
    for (const p of TEXERE) { if (this.state(p.id) === "off") out.push({ kind: "texere", p, label: T(`Pornește ${p.name}`, `Turn on ${p.name}`), why: this.en ? p.en : p.ro }); }
    for (const m of MAPS) { try { const s = await this.mapStatus(m); if (!s.have) out.push({ kind: "map", m, label: T(`Creează harta: ${m.ro}`, `Create the map: ${m.en}`), why: T(`${s.total} note în ${s.folder}: ramuri, subdomenii, concepte, teorii, curente, perioade (valorile proprietăților notelor).`, `${s.total} notes in ${s.folder}: branches, subdomains, concepts, theories, movements, periods (the values of your notes' properties).`) }); } catch (e) {} }
    return out;
  }
  async doItem(it) {
    if (it.kind === "dep") {
      if (it.st === "missing") await this.install(it.d); else await this.enable(it.d.id);
      // Templater abia pornit: butonul Ajutor și, pe un laptop nou, configurarea
      if (it.d.id === "templater-obsidian" && !this._setup) setTimeout(() => this.start().catch(e => console.error("Texere:", e)), 1500);
      return;
    }
    if (it.kind === "texere") { await this.enable(it.p.id); return; }
    if (it.kind === "map") { await this.createMap(it.m); return; }
  }
  // ——— panoul din tab-ul nou ———
  // ce trebuie reparat în vault sau în setări: [{ text, why, btn, fn }]
  async problems() {
    const T = (a, b) => this.T(a, b), out = [], P = this.app.plugins;
    for (const d of DEPS) {
      const st = this.state(d.id); if (st === "on") continue;
      out.push({ text: st === "missing" ? T(`Lipsește ${d.name}.`, `${d.name} is missing.`) : T(`${d.name} e oprit.`, `${d.name} is off.`), why: d.id === "pdf-plus" ? T("Fără el, evidențierile din PDF nu ajung în note.", "Without it, PDF highlights don't reach your notes.") : T("Fără el nu merg butonul Ajutor și configurarea.", "Without it, Help and the setup don't work."),
        btn: st === "missing" ? T("Instalează", "Install") : T("Pornește", "Turn on"), fn: () => this.doItem({ kind: "dep", d, st }) });
    }
    for (const p of TEXERE) {
      const st = this.state(p.id); if (st === "on") continue;
      out.push({ text: st === "missing" ? T(`Lipsește ${p.name}.`, `${p.name} is missing.`) : T(`${p.name} e oprit.`, `${p.name} is off.`),
        why: st === "missing" ? T("Vine cu vault-ul, în .obsidian/plugins. Copiază-l din vault-ul Texere.", "It comes with the vault, in .obsidian/plugins. Copy it from the Texere vault.") : null,
        btn: st === "off" ? T("Pornește", "Turn on") : null, fn: () => this.enable(p.id) });
    }
    if (P.plugins["templater-obsidian"]) {
      if (this.needsConfig()) out.push({ text: T("Vault-ul nu e configurat pe acest laptop.", "The vault isn't set up on this laptop."), why: T("Limba, folderul exportului și verificarea pluginurilor.", "Language, export folder and a check of the plugins."), btn: T("Configurează", "Set up"), fn: () => this.runConfig(false) });
      else if (!window.__ghidAsk && Date.now() - this.loadedAt > 10000) out.push({ text: T("Lipsește butonul Ajutor.", "The Help button is missing."), why: T("Scripturile de pornire (Templater) nu au rulat.", "The startup scripts (Templater) didn't run."), btn: T("Repară", "Fix"), fn: () => this.enableStartupScripts() });
    }
    for (const m of MAPS) { try { const s = await this.mapStatus(m); if (!s.have) out.push({ text: T(`Harta domeniilor (${m.ro}) nu e creată.`, `The map of fields (${m.en}) isn't created.`), why: T(`${s.total} note în ${s.folder}.`, `${s.total} notes in ${s.folder}.`), btn: T("Creează", "Create"), fn: () => this.createMap(m) }); } catch (e) {} }
    if (this.app.vault.getConfig?.("alwaysUpdateLinks") === false) out.push({ text: T("Linkurile nu se actualizează când redenumești o notă.", "Links don't update when you rename a note."), why: T("Texere redenumește note; fără asta, linkurile spre ele se rup.", "Texere renames notes; without this, links to them break."), btn: T("Repară", "Fix"), fn: () => this.app.vault.setConfig("alwaysUpdateLinks", true) });
    return out;
  }
  // sursele din Literature Notes și PDF-urile care așteaptă în Inbox
  counts() {
    const src = this.app.plugins.plugins["texere-sources"]?.sources;
    const lit = (() => { try { return src?.litDir?.() || "01. Sources/Literature Notes/"; } catch (e) { return "01. Sources/Literature Notes/"; } })();
    const inbox = (() => { try { return (src?.inboxDir?.() || "01. Sources/Documents/Inbox") + "/"; } catch (e) { return "01. Sources/Documents/Inbox/"; } })();
    let sources = 0, pdfs = 0;
    for (const f of this.app.vault.getFiles()) {
      if (f.extension === "md" && f.path.startsWith(lit) && this.app.metadataCache.getFileCache(f)?.frontmatter?.id) sources++;
      else if (f.extension === "pdf" && f.path.startsWith(inbox)) pdfs++;
    }
    return { sources, pdfs };
  }
  cmd(id) { const c = this.app.commands; if (!c?.commands?.[id]) return false; c.executeCommandById(id); return true; }
  // pune panoul în tab-urile goale (doar în zona notelor, nu în barele laterale); redraw: true = toate din nou, sau un singur tab
  home(redraw) {
    const W = this.app.workspace, side = [W.leftSplit, W.rightSplit];
    const leaves = redraw && redraw !== true ? [redraw] : (W.getLeavesOfType?.("empty") || []);
    for (const leaf of leaves) {
      const el = leaf?.view?.contentEl; if (!el || side.includes(leaf.getRoot?.())) continue;
      if (!redraw && el.querySelector(".texere-home")) continue;
      this.renderHome(leaf).catch(e => console.error("Texere: panoul", e));
    }
  }
  async renderHome(leaf) {
    const T = (a, b) => this.T(a, b), el = leaf.view.contentEl, tok = (leaf.__txh = (leaf.__txh || 0) + 1);
    const probs = await this.problems(); if (leaf.__txh !== tok || !leaf.view?.contentEl) return;   // un desen mai nou a pornit între timp
    const { sources, pdfs } = this.counts();
    el.addClass("texere-home-on"); el.querySelector(".texere-home")?.remove();
    const box = el.createDiv("texere-home"), inner = box.createDiv("txh-inner");
    const redraw = () => setTimeout(() => this.home(true), 600);
    // 1. ce trebuie reparat (doar dacă e ceva)
    if (probs.length) {
      const pb = inner.createDiv("txh-problems");
      for (const p of probs) {
        const r = pb.createDiv("txh-problem"), t = r.createDiv("txh-pt");
        t.createDiv({ cls: "txh-ptext", text: p.text }); if (p.why) t.createDiv({ cls: "txh-pwhy", text: p.why });
        if (p.btn) { const b = r.createEl("button", { text: p.btn }); b.addEventListener("click", async () => { b.disabled = true; b.setText("…"); try { await p.fn(); } catch (e) { new Notice(e?.message || String(e), 8000); } redraw(); }); }
      }
    }
    // 2. acțiunile Texere
    const acts = inner.createDiv("txh-actions");
    const act = (icon, text, run, cta) => { const b = acts.createEl("button", { cls: cta ? "mod-cta" : "" }); const i = b.createSpan("txh-ic"); try { setIcon(i, icon); } catch (e) {} b.createSpan({ text }); b.addEventListener("click", run); return b; };
    act("library", T("Adaugă o sursă", "Add a source"), () => { if (!this.cmd("texere-sources:sources-search")) new Notice(T("Pornește Texere · Sources.", "Turn on Texere · Sources."), 6000); }, true);
    act("file-output", T("Exportă", "Export"), () => { if (!this.cmd("texere-export:export-pick")) new Notice(T("Pornește Texere · Export.", "Turn on Texere · Export."), 6000); });
    act("life-buoy", T("Ajutor", "Help"), () => { if (typeof window.__ghidAsk === "function") window.__ghidAsk(); else if (!this.cmd("ghid-ajutor:help")) new Notice(T("Butonul Ajutor nu e pornit: Setări → Texere · The Researcher's Vault → Rulează din nou.", "Help isn't on: Settings → Texere · The Researcher's Vault → Run again."), 8000); });
    // 3. ultimele 5 fișiere deschise
    const recent = this.app.workspace.getLastOpenFiles().map(p => this.app.vault.getAbstractFileByPath(p)).filter(f => f instanceof TFile).slice(0, 5);
    if (recent.length) {
      inner.createDiv({ cls: "txh-label", text: T("Recente", "Recent") });
      const ul = inner.createDiv("txh-recent");
      for (const f of recent) {
        const a = ul.createEl("a", { cls: "txh-file", href: "#" });
        a.createSpan({ cls: "txh-fname", text: f.extension === "md" ? f.basename : f.name });
        if (f.parent && f.parent.path !== "/") a.createSpan({ cls: "txh-fdir", text: f.parent.path });
        a.addEventListener("click", e => { e.preventDefault(); (e.metaKey || e.ctrlKey ? this.app.workspace.getLeaf("tab") : leaf).openFile(f); });
        a.addEventListener("auxclick", e => { if (e.button === 1) { e.preventDefault(); this.app.workspace.getLeaf("tab").openFile(f); } });
      }
    }
    // 4. pe scurt: câte surse; PDF-urile din Inbox (un clic: „PDF-uri fără sursă”)
    const ft = inner.createDiv("txh-foot");
    ft.createSpan({ text: sources === 1 ? T("1 sursă", "1 source") : T(`${sources} surse`, `${sources} sources`) });
    if (pdfs) { ft.createSpan({ text: " · " }); const a = ft.createEl("a", { href: "#", text: pdfs === 1 ? T("1 PDF în Inbox", "1 PDF in Inbox") : T(`${pdfs} PDF-uri în Inbox`, `${pdfs} PDFs in Inbox`) }); a.addEventListener("click", e => { e.preventDefault(); this.cmd("texere-sources:sources-uncataloged"); }); }
  }

  // fereastra de configurare: o singură dată, la prima pornire (sau din comandă / setări)
  async onboard(force) {
    if (!force && this.settings.onboarded) return;
    const items = await this.todo();
    if (!items.length) { if (!this.settings.onboarded) { this.settings.onboarded = true; await this.save(); } if (force) new Notice(this.T("Texere e configurat: nu lipsește nimic.", "Texere is set up: nothing's missing."), 6000); return; }
    new OnboardModal(this, items).open();
  }
};

// ——— fereastra de la prima pornire: ce lipsește, bifat; un buton face tot ———
class OnboardModal extends Modal {
  constructor(P, items) { super(P.app); this.P = P; this.items = items; this.sel = new Set(items.map((_, i) => i)); }
  onOpen() {
    const P = this.P, T = (a, b) => P.T(a, b), el = this.contentEl; this.modalEl.addClass("texere-onboard");
    this.titleEl.setText("Texere · The Researcher's Vault");
    el.createEl("p", { cls: "tx-ob-intro", text: T("Ca vault-ul să meargă întreg, mai sunt câteva lucruri de făcut. Bifează ce vrei; un clic le face pe toate.", "A few things are left for the vault to work fully. Tick what you want; one click does them all.") });
    const list = el.createDiv("tx-ob-list"); this.rows = [];
    this.items.forEach((it, i) => {
      const r = list.createEl("label", { cls: "tx-ob-item" }), cb = r.createEl("input", { type: "checkbox" }); cb.checked = true;
      cb.addEventListener("change", () => { if (cb.checked) this.sel.add(i); else this.sel.delete(i); this.go.disabled = !this.sel.size; });
      const b = r.createDiv("tx-ob-b"); b.createDiv({ cls: "tx-ob-t", text: it.label }); b.createDiv({ cls: "tx-ob-d", text: it.why }); const st = b.createDiv("tx-ob-s");
      this.rows.push({ cb, st });
    });
    el.createEl("p", { cls: "tx-ob-foot", text: T("Pluginurile vin din lista oficială Obsidian (ca din Setări → Community plugins). Oricând, din Setări → Texere · The Researcher's Vault.", "Plugins come from Obsidian's official list (as in Settings → Community plugins). Any time, from Settings → Texere · The Researcher's Vault.") });
    const ft = el.createDiv("tx-ob-btns");
    const later = ft.createEl("button", { text: T("Nu acum", "Not now") }); later.addEventListener("click", async () => { P.settings.onboarded = true; await P.save(); this.close(); });
    this.go = ft.createEl("button", { cls: "mod-cta", text: T("Configurează", "Set up") }); this.go.addEventListener("click", () => this.run());
  }
  async run() {
    const P = this.P, T = (a, b) => P.T(a, b); this.go.disabled = true; let ok = 0, bad = 0;
    for (const [i, it] of this.items.entries()) {
      const r = this.rows[i]; r.cb.disabled = true; if (!this.sel.has(i)) continue;
      r.st.setText(T("…", "…")); r.st.className = "tx-ob-s busy";
      try { await P.doItem(it); r.st.setText(T("gata", "done")); r.st.className = "tx-ob-s ok"; ok++; }
      catch (e) { console.error("Texere: configurarea", it.label, e); r.st.setText(T("n-a mers: ", "didn't work: ") + (e?.message || e)); r.st.className = "tx-ob-s bad"; bad++; }
    }
    P.settings.onboarded = true; await P.save();
    this.go.setText(T("Gata", "Done")); this.go.disabled = false; this.go.onclick = () => this.close();
    new Notice(bad ? T(`Am făcut ${ok}; ${bad} n-au mers (vezi fereastra).`, `Done ${ok}; ${bad} didn't work (see the window).`) : T("Texere e configurat.", "Texere is set up."), 8000);
  }
  onClose() { this.contentEl.empty(); }
}

// ——— Setări → Texere · The Researcher's Vault ———
class TexereSettingTab extends PluginSettingTab {
  constructor(P) { super(P.app, P); this.P = P; this.id = P.manifest.id; this.name = "Texere · The Researcher's Vault"; }
  display() {
    const P = this.P, T = (a, b) => P.T(a, b), el = this.containerEl; el.empty(); el.addClass("texere-core-settings");
    el.createEl("h2", { text: "Texere · The Researcher's Vault" });
    el.createEl("p", { cls: "tx-intro", text: T("Pluginul general al vault-ului: îl configurează, pornește celelalte pluginuri Texere și pe cele de care au nevoie, și creează harta domeniilor.", "The vault's general plugin: it sets the vault up, turns on the other Texere plugins and the ones they need, and creates the map of fields.") });
    const chip = (s, text, cls) => s.nameEl.createSpan({ cls: "tx-chip " + cls, text });
    const label = st => st === "on" ? [T("pornit", "on"), "ok"] : st === "off" ? [T("instalat, oprit", "installed, off"), "warn"] : [T("lipsește", "missing"), "bad"];
    const busy = async (b, fn) => { const old = b.buttonEl.getText(); b.setDisabled(true); b.setButtonText("…"); try { await fn(); } catch (e) { new Notice(e?.message || String(e), 8000); } finally { b.setButtonText(old); b.setDisabled(false); this.display(); } };

    new Setting(el).setName(T("Limba", "Language")).setDesc(T("Pentru toate pluginurile Texere (unele texte, după repornire).", "For all Texere plugins (some labels after a restart)."))
      .addDropdown(d => d.addOption("ro", "Română").addOption("en", "English").setValue(P.en ? "en" : "ro").onChange(v => { this.app.saveLocalStorage(LANG, v); this.display(); }));

    new Setting(el).setName(T("Pluginurile Texere", "Texere plugins")).setHeading();
    for (const p of TEXERE) {
      const st = P.state(p.id), s = new Setting(el).setName(p.name).setDesc(P.en ? p.en : p.ro); chip(s, ...label(st));
      if (st === "missing") { s.setDesc((P.en ? p.en : p.ro) + " " + T("Vine cu vault-ul Texere (folderul .obsidian/plugins).", "It comes with the Texere vault (the .obsidian/plugins folder).")); continue; }
      s.addToggle(t => t.setValue(st === "on").onChange(async v => { try { if (v) await P.enable(p.id); else await P.disable(p.id); } catch (e) { new Notice(e?.message || String(e)); } this.display(); }));
      if (st === "on") s.addExtraButton(b => b.setIcon("settings").setTooltip(T("Setările lui", "Its settings")).onClick(() => { this.app.setting.openTabById(p.id); }));
    }

    new Setting(el).setName(T("Pluginurile de care depinde Texere", "Plugins Texere needs")).setHeading();
    const missing = DEPS.filter(d => P.state(d.id) !== "on");
    if (missing.length > 1) new Setting(el).setName(T("Toate deodată", "All at once")).setDesc(T(`${missing.length} nu sunt pornite.`, `${missing.length} aren't on.`))
      .addButton(b => b.setButtonText(T("Instalează și pornește tot", "Install and turn on all")).setCta().onClick(() => busy(b, async () => { for (const d of missing) { if (P.state(d.id) === "missing") await P.install(d); else await P.enable(d.id); } })));
    for (const d of DEPS) {
      const st = P.state(d.id), s = new Setting(el).setName(d.name).setDesc(P.en ? d.en : d.ro); chip(s, ...label(st));
      if (st === "missing") s.addButton(b => b.setButtonText(T("Instalează și pornește", "Install and turn on")).setCta().onClick(() => busy(b, () => P.install(d))));
      else if (st === "off") s.addButton(b => b.setButtonText(T("Pornește", "Turn on")).onClick(() => busy(b, () => P.enable(d.id))));
    }

    new Setting(el).setName(T("Harta domeniilor", "Map of fields")).setHeading();
    el.createEl("p", { cls: "tx-intro", text: T("Notele din Fields/<domeniu>: ramuri, subdomenii, concepte, teorii, curente, perioade. Din ele vin valorile proprietăților notelor (branch, concepts, theories…). Crearea adaugă doar ce lipsește; ce ai deja rămâne neatins.", "The notes in Fields/<field>: branches, subdomains, concepts, theories, movements, periods. Your notes' property values (branch, concepts, theories…) come from them. Creating adds only what's missing; what you already have stays untouched.") });
    for (const m of MAPS) {
      const s = new Setting(el).setName(P.en ? m.en : m.ro).setDesc(T("Se verifică…", "Checking…"));
      P.mapStatus(m).then(st => {
        s.setDesc(st.have ? T(`${st.have} din ${st.total} note în ${st.folder}.`, `${st.have} of ${st.total} notes in ${st.folder}.`) : T(`${st.total} note, în ${st.folder}.`, `${st.total} notes, in ${st.folder}.`));
        chip(s, st.have >= st.total ? T("creată", "created") : st.have ? T("parțial", "partly") : T("necreată", "not created"), st.have >= st.total ? "ok" : st.have ? "warn" : "bad");
        if (st.have < st.total) s.addButton(b => b.setButtonText(st.have ? T(`Adaugă ce lipsește (${st.total - st.have})`, `Add what's missing (${st.total - st.have})`) : T("Creează harta", "Create the map")).setCta().onClick(() => busy(b, async () => { const n = await P.createMap(m); new Notice(T(`Am creat ${n} note în ${st.folder}.`, `Created ${n} notes in ${st.folder}.`), 6000); })));
      }).catch(e => s.setDesc(T("Nu pot citi harta: ", "Couldn't read the map: ") + e.message));
    }

    new Setting(el).setName(T("Configurarea", "Setup")).setHeading();
    new Setting(el).setName(T("Configurarea pe acest laptop", "Setup on this laptop")).setDesc(T("Scriptul care pregătește vault-ul pe un laptop nou (rulează singur prima dată).", "The script that prepares the vault on a new laptop (it runs by itself the first time)."))
      .addButton(b => b.setButtonText(T("Rulează din nou", "Run again")).onClick(() => P.runConfig(false)));
    new Setting(el).setName(T("Fereastra de la prima pornire", "First-start window")).setDesc(T("Ce lipsește, cu un buton care face tot.", "What's missing, with one button that does it all."))
      .addButton(b => b.setButtonText(T("Deschide", "Open")).onClick(() => P.onboard(true)));
  }
}

const CSS = `.texere-core-settings .tx-intro{color:var(--text-muted);font-size:var(--font-ui-small);margin:4px 0 12px}
.texere-core-settings .tx-chip,.texere-onboard .tx-chip{display:inline-block;margin-left:8px;font-size:var(--font-ui-smaller);line-height:1.5;padding:0 8px;border-radius:999px;border:1px solid var(--background-modifier-border);color:var(--text-muted);font-weight:400}
.texere-core-settings .tx-chip.ok{border-color:transparent;background:rgba(0,168,150,.14);color:#00897b}
.texere-core-settings .tx-chip.warn{border-color:transparent;background:rgba(245,168,0,.16);color:#a86300}
.texere-core-settings .tx-chip.bad{border-color:transparent;background:rgba(224,49,49,.13);color:#c92a2a}
.texere-onboard .tx-ob-intro{color:var(--text-muted);margin-top:0}
.texere-onboard .tx-ob-list{display:flex;flex-direction:column;gap:6px;margin:10px 0}
.texere-onboard .tx-ob-item{display:flex;gap:10px;align-items:flex-start;padding:8px 10px;border:1px solid var(--background-modifier-border);border-radius:8px;cursor:pointer}
.texere-onboard .tx-ob-item input{margin-top:3px}
.texere-onboard .tx-ob-t{font-weight:600}
.texere-onboard .tx-ob-d{color:var(--text-muted);font-size:var(--font-ui-small)}
.texere-onboard .tx-ob-s{font-size:var(--font-ui-small)}.texere-onboard .tx-ob-s.ok{color:#00897b}.texere-onboard .tx-ob-s.bad{color:#c92a2a}.texere-onboard .tx-ob-s.busy{color:var(--text-faint)}
.texere-onboard .tx-ob-foot{color:var(--text-faint);font-size:var(--font-ui-smaller)}
.texere-onboard .tx-ob-btns{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
.texere-home-on>.empty-state{display:none}
.texere-home{box-sizing:border-box;min-height:100%;display:flex;align-items:center;justify-content:center;padding:24px 16px}
.texere-home .txh-inner{width:100%;max-width:440px;display:flex;flex-direction:column;gap:14px}
.texere-home .txh-problems{display:flex;flex-direction:column;gap:6px}
.texere-home .txh-problem{display:flex;align-items:center;gap:12px;padding:8px 10px;border-radius:8px;background:rgba(var(--color-orange-rgb),.1);border:1px solid rgba(var(--color-orange-rgb),.25)}
.texere-home .txh-pt{flex:1;min-width:0}
.texere-home .txh-ptext{font-size:var(--font-ui-small);font-weight:600}
.texere-home .txh-pwhy{font-size:var(--font-ui-smaller);color:var(--text-muted)}
.texere-home .txh-problem button{flex:none}
.texere-home .txh-actions{display:flex;gap:8px}
.texere-home .txh-actions button{flex:1 1 auto;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:36px;padding:0 12px;white-space:nowrap}
.texere-home .txh-ic{display:inline-flex}.texere-home .txh-ic svg{width:16px;height:16px}
.texere-home .txh-label{font-size:var(--font-ui-smaller);color:var(--text-faint);text-transform:uppercase;letter-spacing:.05em;margin:6px 0 -8px}
.texere-home .txh-recent{display:flex;flex-direction:column}
.texere-home .txh-file{display:flex;align-items:baseline;gap:8px;padding:5px 6px;margin:0 -6px;border-radius:6px;color:var(--text-normal);text-decoration:none;min-width:0}
.texere-home .txh-file:hover{background:var(--background-modifier-hover)}
.texere-home .txh-fname{flex:0 1 auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.texere-home .txh-fdir{flex:1 1 0;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text-faint);font-size:var(--font-ui-smaller);text-align:right}
.texere-home .txh-foot{font-size:var(--font-ui-smaller);color:var(--text-faint);text-align:center}
.texere-home .txh-foot a{color:var(--text-muted)}`;
if (typeof document !== "undefined") { const st = document.createElement("style"); st.id = "texere-core-css"; document.getElementById(st.id)?.remove(); st.textContent = CSS; document.head.appendChild(st); }
