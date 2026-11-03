/* Texere · The Researcher's Vault — versiune 3.5.0 (2026-11-01)
 * Pluginul general al vault-ului și intrarea spre celelalte pluginuri Texere:
 *  1. Configurarea pe un laptop nou (scriptul „Support/Templates/New laptop setup”) și scripturile de pornire
 *     (butonul Ajutor, închiderea capitolelor ghidului), prin Templater.
 *  2. Setările lui (Setări → Texere · The Researcher's Vault): limba; pluginurile Texere (Sources, Export);
 *     pluginurile de care depinde Texere (PDF++, Templater), instalate și pornite dintr-un clic; harta domeniilor
 *     (Fields/Philosophy: ramuri, subdomenii, concepte, teorii, curente, perioade), creată la cerere.
 *  3. La prima pornire, o singură dată: ce lipsește, cu un buton care face tot (doar când configurarea nu poate porni,
 *     de ex. fără Templater; altfel o face configurarea, la pasul „Pluginuri”).
 *  4. Panoul din fiecare tab nou: ce trebuie reparat (cu un buton), Adaugă o sursă · Exportă · Ajutor, ultimele 5 fișiere.
 *  5. Structura de foldere propusă (01. Sources … 04. Export): creată o singură dată, la prima pornire, doar ce lipsește;
 *     o poți schimba oricum, Texere n-o mai pune la loc decât dacă îi ceri (Setări).
 * Texere · Sources și Texere · Export sunt pluginuri separate (fiecare cu folderul lui în .obsidian/plugins).
 */
const { Plugin, Notice, TFile, Modal, Setting, PluginSettingTab, requestUrl, normalizePath, setIcon } = require("obsidian");

const CONFIG = "Support/Templates/New laptop setup.md";
const STARTS = ["Support/Admin/Scripts/Guide folding.md", "Support/Admin/Scripts/Help.md"];
const FLAG = "texere-setup";
const LANG = "texere-lang";
const INSTALL_URL = "https://github.com/gorgmihai92/texere";   // provizoriu: pagina vault-ului, până când pluginurile sunt publicate   // limba aleasă în fereastra de configurare și în Ajutor (ro / en); o folosesc toate pluginurile Texere
// limba: cea aleasă în Texere; dacă n-a fost aleasă, limba lui Obsidian (fiecare plugin Texere merge și singur)
const isEn = app => { const l = app?.loadLocalStorage?.(LANG); if (l === "en" || l === "ro") return l === "en"; let o = ""; try { o = window.localStorage.getItem("language") || ""; } catch (e) {} return !/^ro/i.test(o); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// pluginurile Texere (vin cu vault-ul)
const TEXERE = [
  { id: "texere-sources", name: "Texere · Sources", ro: "Caută surse în cataloage și le adaugă cu PDF-ul gratuit, importă din Zotero, citează în stilul ales și aduce evidențierile din PDF în notă.", en: "Searches catalogs and adds sources with their free PDF, imports from Zotero, cites in your chosen style and brings PDF highlights into your notes." },
  { id: "texere-export", name: "Texere · Export", ro: "Exportă nota în PDF, Word, LaTeX, HTML sau Markdown, cu cuprins, pagină și șabloanele facultății. Citările vin din Texere · Sources.", en: "Exports a note to PDF, Word, LaTeX, HTML or Markdown, with contents, page layout and thesis templates. Citations come from Texere · Sources." },
  { id: "texere-insights", name: "Texere · Insights", ro: "Câte cuvinte scrii, lipești și ștergi; menționările fără link și aliasurile sugerate; tiparele din lectura și scrisul tău.", en: "How much you write, paste and delete; unlinked mentions and suggested aliases; patterns in your reading and writing." },
];
// pluginurile de care depinde Texere (doar acestea): din lista oficială Obsidian, instalate ca din Setări → Community plugins
const DEPS = [
  { id: "pdf-plus", name: "PDF++", repo: "RyotaUshio/obsidian-pdf-plus", by: "texere-sources", ro: "Evidențierile din PDF: culorile, etichetele și legăturile spre locul din PDF (Texere · Sources).", en: "PDF highlights: colors, tags and links back to the place in the PDF (Texere · Sources)." },
  { id: "templater-obsidian", name: "Templater", repo: "SilentVoid13/Templater", by: "texere", ro: "Butonul Ajutor, ghidurile și configurarea pe un laptop nou.", en: "The Help button, the guides and the setup on a new laptop." },
];
// structura de foldere propusă: drumul de lucru, în ordine (sursele → notițele tale → lucrările → exportul)
const FOLDERS = ["02. Notes/Essays", "02. Notes/Personal", "02. Notes/Poetry", "03. Workspace/01. Courses", "03. Workspace/02. Thesis", "03. Workspace/03. Articles", "03. Workspace/04. Projects"];
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
    // folderele de care are nevoie Texere: când redenumești sau muți unul, îți spune pe loc ce înseamnă
    this.app.workspace.onLayoutReady(() => { if (this.app.vault.on) this.registerEvent(this.app.vault.on("rename", (f, old) => { try { this.onRename(f, old); } catch (e) { console.error("Texere: folderele", e); } })); });
    // ce repari într-un loc se vede și în celălalt: tab-ul nou și setările se redesenează când se schimbă un folder sau o setare a lor
    this.app.workspace.onLayoutReady(() => {
      if (this.app.workspace.on) this.registerEvent(this.app.workspace.on("texere:changed", () => this.changed()));
      if (this.app.vault.on) for (const ev of ["create", "delete", "rename"]) this.registerEvent(this.app.vault.on(ev, f => { if (Array.isArray(f?.children)) this.changed(); }));
    });
    // structura de foldere: o singură dată, după ce pornesc și celelalte pluginuri Texere (folderele lor pot avea alte nume)
    this.app.workspace.onLayoutReady(() => setTimeout(() => this.foldersOnce().catch(e => console.error("Texere: folderele", e)), 3000));
    // panoul din tab-ul nou
    this.app.workspace.onLayoutReady(() => {
      try { this.home(); } catch (e) { console.error("Texere: panoul", e); }
      this.registerEvent(this.app.workspace.on("layout-change", () => this.home()));
      this.registerEvent(this.app.workspace.on("active-leaf-change", l => { if (l?.view?.getViewType?.() === "empty") this.home(l); }));
      this.registerEvent(this.app.workspace.on("file-open", f => { try { if (!f?.path) return; const o = this.app.loadLocalStorage("texere-opened") || {}; o[f.path] = Date.now(); this.app.saveLocalStorage("texere-opened", Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 40))); } catch (e) {} }));
    });
    this.register(() => (this.app.workspace.getLeavesOfType?.("empty") || []).forEach(l => { const c = l.view?.contentEl; c?.querySelector(".texere-home")?.remove(); c?.removeClass("texere-home-on"); }));
    // fereastra „ce lipsește”: doar dacă nu pornește configurarea (ea face același lucru la pasul „Pluginuri”)
    this.app.workspace.onLayoutReady(() => setTimeout(() => { if (this._setup || (this.needsConfig() && this.app.plugins.plugins["templater-obsidian"])) return; this.onboard(false).catch(e => console.error("Texere: configurarea", e)); }, 4000));
  }
  save() { return this.saveData(this.settings); }
  get en() { return isEn(this.app); }
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
    const en = isEn(this.app);
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
    const names = new Set((this.app.vault.getMarkdownFiles?.() || []).map(f => f.name));
    const have = files.filter(p => this.app.vault.getAbstractFileByPath(normalizePath(`${root}/${p}`)) || names.has(p.split("/").pop())).length;
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
  // anunță că s-a schimbat ceva (un folder pus la loc, o setare): tab-urile noi și setările deschise se redesenează
  notify() { try { this.app.workspace.trigger?.("texere:changed"); } catch (e) {} this.changed(); }
  changed() {
    clearTimeout(this._chT);
    this._chT = setTimeout(() => {
      try { this.home(true); } catch (e) {}
      try {
        const t = this.app.setting?.activeTab, c = t?.containerEl; if (!t || !/^texere/.test(String(t.id || "")) || !c?.isConnected) return;
        // cât timp scrii într-un câmp din setări, nu le redesenăm: așteptăm să ieși din câmp
        const a = document.activeElement; if (a && c.contains(a) && /^(INPUT|TEXTAREA)$/.test(a.tagName) && a.type !== "checkbox") { if (!c._txWait) { c._txWait = true; c.addEventListener("focusout", () => { c._txWait = false; this.changed(); }, { once: true }); } return; }
        t.display();
      } catch (e) {}
    }, 250);
  }

  // ——— folderele de care are nevoie Texere ———
  // fixe: nu se redenumesc și nu se mută (bibliografia și stilurile de citare, scripturile de pornire, șabloanele și configurarea)
  fixedFolders() {
    const T = (a, b) => this.T(a, b), bib = String(this.app.plugins.plugins["texere-sources"]?.settings?.sources?.bibPath || "Support/Admin/Bibliography/bibliography.json");
    return [
      { path: bib.slice(0, bib.lastIndexOf("/")) || "Support/Admin/Bibliography", mark: bib.split("/").pop(), why: T("Texere ține aici bibliografia și stilurile de citare.", "Texere keeps the bibliography and the citation styles here."), breaks: T("Citările și bibliografia nu merg", "Citations and the bibliography don't work") },
      { path: "Support/Admin/Scripts", mark: "Help.md", why: T("Aici sunt butonul Ajutor și scripturile de pornire.", "The Help button and the startup scripts live here."), breaks: T("Butonul Ajutor nu merge", "The Help button doesn't work") },
      { path: "Support/Templates", mark: "New laptop setup.md", why: T("Aici sunt șabloanele și configurarea pe un laptop nou.", "The templates and the new-laptop setup live here."), breaks: T("Șabloanele și configurarea pe un laptop nou nu merg", "Templates and the new-laptop setup don't work") },
    ];
  }
  // pot fi schimbate (din Setări): folderele surselor și al exportului
  movableFolders() {
    const T = (a, b) => this.T(a, b), P = this.app.plugins.plugins, out = [];
    const src = P["texere-sources"]?.sources, f = P["texere-sources"]?.settings?.sources?.files || {}, root = p => { p = String(p || "").replace(/\/+$/, ""); const i = p.indexOf("{{"); return i < 0 ? p : p.slice(0, i).replace(/\/[^/]*$/, "").replace(/\/+$/, ""); };
    // breaks = ce nu mai merge (titlul alertei); next = ce se întâmplă la următoarea salvare
    for (const [k, def, label, breaks, next] of [["notes", "01. Sources/Literature Notes", T("folderul notelor de literatură", "the literature notes folder"), T("Sursele noi nu ajung în folderul tău de note", "New sources don't go into your notes folder"), T("următoarea sursă pe care o salvezi", "the next source you save")],
      ["pdfs", "01. Sources/Documents", T("folderul PDF-urilor", "the PDF folder"), T("PDF-urile noi nu ajung în folderul tău de PDF-uri", "New PDFs don't go into your PDF folder"), T("următorul PDF (al unei surse noi, din Zotero sau din Downloads)", "the next PDF (from a new source, Zotero or Downloads)")]])
      out.push({ key: k, path: root(f[k]) || def, label, breaks, next, plugin: "texere-sources", use: to => src?.setFolderRoot?.(k, to), choose: () => src?.checkFolders?.() });
    const X = P["texere-export"]?.exporter, ex = String(P["texere-export"]?.settings?.export?.folder || "04. Export").replace(/\/+$/, "");
    if (X && !/^([\/~]|[A-Za-z]:[\\/])/.test(ex)) out.push({ key: "export", path: ex, label: T("folderul exportului", "the export folder"), breaks: T("Exporturile nu ajung în folderul tău de export", "Exports don't go into your export folder"), next: T("următorul export", "the next export"), plugin: "texere-export",
      use: async to => { const c = X.conf(); c.folder = to; c.folderMoved = null; await X.save(); this.notify(); }, choose: async () => { const to = await X.askFolder(ex); if (to) { const c = X.conf(); c.folder = to; c.folderMoved = null; await X.save(); this.notify(); } } });
    return out;
  }
  // un folder redenumit sau mutat: unul fix → „trebuie să rămână acolo” + Pune-l la loc; unul al surselor sau al exportului → Folosește numele nou
  onRename(f, old) {
    if (!Array.isArray(f?.children) || this._putting) return;   // doar folderele; nu și când îl punem noi la loc
    const T = (a, b) => this.T(a, b), hit = p => old === p || p.startsWith(old + "/"), now = p => f.path + p.slice(old.length);
    const fixed = this.fixedFolders().filter(x => hit(x.path));
    if (fixed.length) {
      (this.settings.moved = (this.settings.moved || []).filter(m => m.to !== old)).push({ from: old, to: f.path }); this.save();
      const frag = document.createDocumentFragment();
      frag.append(T(`${fixed[0].breaks} până nu-l pui la loc: „${fixed[0].path}” trebuie să-și păstreze numele și locul. ${fixed[0].why} `, `${fixed[0].breaks} until you put it back: “${fixed[0].path}” must keep its name and place. ${fixed[0].why} `));
      const a = document.createElement("a"); a.href = "#"; a.textContent = T("Pune-l la loc", "Put it back"); frag.append(a);
      const n = new Notice(frag, 0); a.addEventListener("click", async e => { e.preventDefault(); n.hide(); await this.putBack(fixed[0].path); this.notify(); });
      this.notify(); return;
    }
    const mv = this.movableFolders().find(x => hit(x.path));
    if (mv) {
      const to = now(mv.path), frag = document.createDocumentFragment();
      frag.append(T(`Ai redenumit ${mv.label}: „${mv.path}” e acum „${to}”. ${mv.breaks}: Texere încă îl caută pe „${mv.path}”, așa că ${mv.next} se va opri și te va întreba unde să ajungă. `, `You renamed ${mv.label}: “${mv.path}” is now “${to}”. ${mv.breaks}: Texere still looks for “${mv.path}”, so ${mv.next} will stop and ask where to go. `));
      const a = document.createElement("a"); a.href = "#"; a.textContent = T(`Folosește „${to}”`, `Use “${to}”`); frag.append(a);
      const n = new Notice(frag, 15000); a.addEventListener("click", async e => { e.preventDefault(); n.hide(); await mv.use(to); this.notify(); });
      setTimeout(() => this.notify(), 300);
    }
  }
  // pune la loc un folder fix: după redenumirea ținută minte, altfel după fișierul lui (ex. bibliography.json)
  async putBack(path) {
    const T = (a, b) => this.T(a, b), V = this.app.vault; this._putting = true;
    try {
      if (V.getAbstractFileByPath(path)) return true;
      const rec = (this.settings.moved || []).slice().reverse().find(m => (path === m.from || path.startsWith(m.from + "/")) && V.getAbstractFileByPath(m.to) && !V.getAbstractFileByPath(m.from));
      let from = rec ? V.getAbstractFileByPath(rec.to) : null, to = rec ? rec.from : path;
      if (!from) { const x = this.fixedFolders().find(y => y.path === path), mark = x && V.getFiles().find(g => g.name === x.mark && g.parent && g.parent.path !== path); if (mark) from = mark.parent; }
      if (!from) { new Notice(T(`Nu găsesc „${path}” în vault. Copiază-l din vault-ul Texere.`, `I can't find “${path}” in the vault. Copy it from the Texere vault.`), 10000); return false; }
      const parent = to.includes("/") ? to.slice(0, to.lastIndexOf("/")) : ""; let cur = "";
      for (const part of parent ? parent.split("/") : []) { cur = cur ? `${cur}/${part}` : part; if (!V.getAbstractFileByPath(cur)) await V.createFolder(cur); }
      await this.app.fileManager.renameFile(from, to);
      this.settings.moved = (this.settings.moved || []).filter(m => m !== rec); await this.save();
      new Notice(T(`„${to}” e din nou la locul lui.`, `“${to}” is back in its place.`), 5000);
      return true;
    } catch (e) { new Notice(T("N-am putut pune folderul la loc: ", "Couldn't put the folder back: ") + e.message, 10000); return false; }
    finally { this._putting = false; }
  }

  // ——— structura de foldere ———
  // folderele propuse; cele ale surselor și exportului, cu numele din setările lor (dacă le-ai schimbat)
  folders() {
    const P = this.app.plugins.plugins, root = p => { p = String(p || "").replace(/\/+$/, ""); const i = p.indexOf("{{"); return i < 0 ? p : p.slice(0, i).replace(/\/[^/]*$/, "").replace(/\/+$/, ""); };
    const f = P["texere-sources"]?.settings?.sources?.files || {}, ex = String(P["texere-export"]?.settings?.export?.folder || "04. Export");
    const out = [root(f.pdfs) || "01. Sources/Documents", root(f.notes) || "01. Sources/Literature Notes", ...FOLDERS];
    // folderul exportului e al lui Texere · Export (îl creează la export și te întreabă dacă l-ai redenumit); fără el, îl creăm aici
    if (!P["texere-export"] && !/^([\/~]|[A-Za-z]:[\\/])/.test(ex)) out.push(root(ex) || "04. Export");
    return [...new Set(out.filter(Boolean))];
  }
  missingFolders() { return this.folders().filter(p => !this.app.vault.getAbstractFileByPath(normalizePath(p))); }
  async createFolders() {
    let made = 0;
    for (const p of this.missingFolders()) {
      let cur = ""; for (const part of normalizePath(p).split("/")) { cur = cur ? `${cur}/${part}` : part; if (!this.app.vault.getAbstractFileByPath(cur)) { try { await this.app.vault.createFolder(cur); made++; } catch (e) {} } }
    }
    return made;
  }
  // prima pornire: „02. Disertation” (din vault-urile vechi) devine „02. Thesis”, prin Obsidian (linkurile urmează); apoi folderele care lipsesc
  async foldersOnce() {
    if (!this.settings.thesisFolder) {
      const from = this.app.vault.getAbstractFileByPath("03. Workspace/02. Disertation"), to = "03. Workspace/02. Thesis";
      if (from && !this.app.vault.getAbstractFileByPath(to)) { try { await this.app.fileManager.renameFile(from, to); } catch (e) { console.warn("Texere: 02. Thesis", e); } }
      this.settings.thesisFolder = true; await this.save();
    }
    if (this.settings.foldersDone) return;
    const made = await this.createFolders();
    this.settings.foldersDone = true; await this.save();
    if (made) new Notice(this.T("Texere a creat structura de foldere propusă (01. Sources, 02. Notes, 03. Workspace). Schimb-o cum vrei.", "Texere created the suggested folders (01. Sources, 02. Notes, 03. Workspace). Change them as you like."), 10000);
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
    // folderele de care are nevoie Texere
    for (const x of this.fixedFolders()) if (!this.app.vault.getAbstractFileByPath(x.path))
      out.push({ text: x.breaks, why: T(`„${x.path}” a fost redenumit sau mutat. Trebuie să rămână acolo, cu numele lui: `, `“${x.path}” was renamed or moved. It must stay there, with its name: `) + x.why.charAt(0).toLowerCase() + x.why.slice(1), btn: T("Pune-l la loc", "Put it back"), fn: () => this.putBack(x.path) });
    for (const x of this.movableFolders()) if (!this.app.vault.getAbstractFileByPath(x.path)) {
      const m = x.key === "export" ? P.plugins["texere-export"]?.settings?.export?.folderMoved : P.plugins["texere-sources"]?.settings?.sources?.folderMoved?.[x.key], to = m && m.from === x.path && this.app.vault.getAbstractFileByPath(m.to) ? m.to : null;
      const L = x.label.charAt(0).toUpperCase() + x.label.slice(1), wait = T(`Până alegi, ${x.next} se oprește și te întreabă unde să ajungă.`, `Until you choose, ${x.next} will stop and ask where to go.`);
      out.push(to ? { text: x.breaks, why: T(`Ai redenumit ${x.label}: „${x.path}” e acum „${to}”, dar Texere încă îl caută pe „${x.path}”. `, `You renamed ${x.label}: “${x.path}” is now “${to}”, but Texere still looks for “${x.path}”. `) + wait, btn: T(`Folosește „${to}”`, `Use “${to}”`), fn: () => x.use(to) }
        : { text: x.breaks, why: T(`${L}, „${x.path}”, nu mai e în vault, iar Texere încă îl caută. `, `${L}, “${x.path}”, isn't in the vault anymore, but Texere still looks for it. `) + wait, btn: T("Alege…", "Choose…"), fn: () => x.choose() });
    }
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
  // „acum 5 min”, „ieri”, „31 oct.”
  ago(t) {
    const T = (a, b) => this.T(a, b), sec = (Date.now() - t) / 1000;
    if (sec < 60) return T("acum", "just now");
    if (sec < 3600) { const m = Math.floor(sec / 60); return T(`acum ${m} min`, `${m} min ago`); }
    if (sec < 86400) { const h = Math.floor(sec / 3600); return T(`acum ${h} h`, `${h} h ago`); }
    const d = Math.floor(sec / 86400); if (d === 1) return T("ieri", "yesterday"); if (d < 7) return T(`acum ${d} zile`, `${d} days ago`);
    try { return new Date(t).toLocaleDateString(this.en ? "en-GB" : "ro-RO", { day: "numeric", month: "short" }); } catch (e) { return new Date(t).toISOString().slice(0, 10); }
  }
  cmd(id) { const c = this.app.commands; if (!c?.commands?.[id]) return false; c.executeCommandById(id); return true; }
  // pune panoul în tab-urile goale (doar în zona notelor, nu în barele laterale); redraw: true = toate din nou, sau un singur tab
  home(redraw) {
    const W = this.app.workspace, side = [W.leftSplit, W.rightSplit];
    const leaves = redraw && redraw !== true ? [redraw] : (W.getLeavesOfType?.("empty") || []);
    for (const leaf of leaves) {
      const el = leaf?.view?.contentEl; if (!el || side.includes(leaf.getRoot?.())) continue;
      if (!redraw && el.querySelector(".texere-home")) continue;
      if (redraw === true && leaf.__txPage && leaf.__txPage !== "home") continue;   // nu redesenăm peste ce faci în altă pagină
      this.renderHome(leaf).catch(e => console.error("Texere: panoul", e));
    }
  }
  async renderHome(leaf) {
    const T = (a, b) => this.T(a, b), el = leaf.view.contentEl, tok = (leaf.__txh = (leaf.__txh || 0) + 1);
    const probs = await this.problems(); if (leaf.__txh !== tok || !leaf.view?.contentEl) return;   // un desen mai nou a pornit între timp
    const { sources, pdfs } = this.counts();
    el.addClass("texere-home-on"); el.querySelector(".texere-home")?.remove();
    const box = el.createDiv("texere-home"), page = leaf.__txPage || "home", area = box.createDiv("txh-page txh-page-" + (page === "home" ? "home" : "panel"));
    this.navBar(box, leaf, page);
    if (page !== "home") { this.renderPanel(page, area, leaf); return; }
    const inner = area.createDiv("txh-inner");
    const redraw = () => setTimeout(() => this.notify(), 400);
    // 1. bun venit: ce e Texere, într-o propoziție
    inner.createDiv({ cls: "txh-hi", text: T("Bun venit în Texere", "Welcome to Texere") });
    inner.createDiv({ cls: "txh-desc", text: T("Sursele, lectura și scrisul tău, într-un singur loc. Adaugi o sursă, o citești și evidențiezi, scrii cu citări, apoi exporți.", "Your sources, reading and writing, in one place. Add a source, read and highlight it, write with citations, then export.") });
    // 3. ce trebuie reparat (doar dacă e ceva)
    if (probs.length) {
      const pb = inner.createDiv("txh-problems");
      for (const p of probs) {
        const r = pb.createDiv("txh-problem"), t = r.createDiv("txh-pt");
        t.createDiv({ cls: "txh-ptext", text: p.text }); if (p.why) t.createDiv({ cls: "txh-pwhy", text: p.why });
        if (p.btn) { const b = r.createEl("button", { text: p.btn }); b.addEventListener("click", async () => { b.disabled = true; b.setText("…"); try { await p.fn(); } catch (e) { new Notice(e?.message || String(e), 8000); } redraw(); }); }
      }
    }
    // 3b. Texere · Insights (dacă e pornit): cât ai scris azi, menționările fără link, ideea zilei
    try { const I = this.app.plugins.plugins["texere-insights"]; if (I?.homeSection) I.homeSection(inner, leaf); } catch (e) { console.error("Texere: Insights în tab-ul nou", e); }
    // 4. ultimele 5 fișiere deschise, cu folderul și când le-ai deschis sau schimbat ultima dată
    let opened = {}; try { opened = this.app.loadLocalStorage("texere-opened") || {}; } catch (e) {}
    const recent = this.app.workspace.getLastOpenFiles().map(p => this.app.vault.getAbstractFileByPath(p)).filter(f => f instanceof TFile).slice(0, 5);
    if (recent.length) {
      inner.createDiv({ cls: "txh-label", text: T("Recente", "Recent") });
      const ul = inner.createDiv("txh-recent");
      for (const f of recent) {
        const a = ul.createEl("a", { cls: "txh-file", href: "#" });
        a.createSpan({ cls: "txh-fname", text: f.extension === "md" ? f.basename : f.name });
        const meta = a.createSpan("txh-fmeta"), op = opened[f.path] || 0, ed = f.stat?.mtime || 0, when = Math.max(op, ed);
        if (f.parent && f.parent.path !== "/") meta.createSpan({ cls: "txh-fdir", text: f.parent.path });
        if (when) { const w = meta.createSpan({ cls: "txh-ftime", text: this.ago(when) }); w.title = (op >= ed ? T("Deschis ", "Opened ") : T("Schimbat ", "Edited ")) + new Date(when).toLocaleString(this.en ? "en-GB" : "ro-RO"); }
        a.addEventListener("click", e => { e.preventDefault(); (e.metaKey || e.ctrlKey ? this.app.workspace.getLeaf("tab") : leaf).openFile(f); });
        a.addEventListener("auxclick", e => { if (e.button === 1) { e.preventDefault(); this.app.workspace.getLeaf("tab").openFile(f); } });
      }
    }
    // 5. doar dacă ai PDF-uri care așteaptă în Inbox (un clic: „PDF-uri fără sursă”); numărul surselor nu mai apare
    if (pdfs) { const ft = inner.createDiv("txh-foot"); const a = ft.createEl("a", { href: "#", text: pdfs === 1 ? T("1 PDF în Inbox", "1 PDF in Inbox") : T(`${pdfs} PDF-uri în Inbox`, `${pdfs} PDFs in Inbox`) }); a.addEventListener("click", e => { e.preventDefault(); this.cmd("texere-sources:sources-uncataloged"); }); }
  }

  // ——— bara de jos din tab-ul nou: Acasă · Surse · Export · Insights · Ajutor, și (+) pentru o notă nouă ———
  // fiecare pagină e ecranul pluginului desenat aici (aceeași clasă ca fereastra lui); dacă pluginul lipsește: ce face și cum îl instalezi
  navBar(box, leaf, page) {
    const T = (a, b) => this.T(a, b), wrap = box.createDiv("txh-navwrap"), nav = wrap.createDiv("txh-nav");
    for (const [id, icon, label] of [["home", "home", T("Acasă", "Home")], ["sources", "library", T("Surse", "Sources")], ["export", "file-output", T("Export", "Export")], ["insights", "lightbulb", "Insights"], ["help", "life-buoy", T("Ajutor", "Help")]]) {
      const b = nav.createEl("button", { cls: "txh-nb" + (page === id ? " on" : "") }); b.title = label;
      const ic = b.createSpan("txh-ic"); try { setIcon(ic, icon); } catch (e) {} b.createSpan({ cls: "txh-nl", text: label });
      b.addEventListener("click", () => { if (leaf.__txPage === id && id !== "home") return; leaf.__txPage = id; this.renderHome(leaf); });
    }
    const add = wrap.createEl("button", { cls: "txh-new" }); add.title = T("Notă nouă", "New note"); add.setAttr?.("aria-label", T("Notă nouă", "New note"));
    try { setIcon(add, "plus"); } catch (e) { add.setText("+"); }
    add.addEventListener("click", () => this.newNote(leaf));
  }
  // o notă nouă, în tab-ul acesta, în folderul ales în Obsidian pentru notele noi; titlul e selectat, ca să-l scrii direct
  async newNote(leaf) {
    const T = (a, b) => this.T(a, b);
    try {
      const fm = this.app.fileManager, parent = fm.getNewFileParent?.(this.app.workspace.getActiveFile()?.path || "") || this.app.vault.getRoot();
      const f = await fm.createNewMarkdownFile(parent, T("Fără titlu", "Untitled"));
      leaf.__txPage = "home"; await leaf.openFile(f, { active: true, eState: { rename: "all" } });
    } catch (e) { new Notice(T("N-am putut crea nota: ", "Couldn't create the note: ") + (e?.message || e), 8000); }
  }
  renderPanel(page, area, leaf) {
    const P = this.app.plugins.plugins, back = () => { leaf.__txPage = "home"; this.renderHome(leaf); };
    try {
      if (page === "sources" && P["texere-sources"]?.sources?.panel) return P["texere-sources"].sources.panel(area, back);
      if (page === "export" && P["texere-export"]?.exporter?.panel) return P["texere-export"].exporter.panel(area, back);
      if (page === "insights" && P["texere-insights"]?.panel) return P["texere-insights"].panel(area, back);
      if (page === "help" && typeof window.__ghidPanel === "function") { const m = window.__ghidPanel(area, back); area.querySelector(".tx-embedded")?.addClass("txh-help"); return m; }
    } catch (e) { console.error("Texere: pagina", page, e); }
    this.installPage(page, area);
  }
  // pluginul nu e pornit sau nu e instalat: ce face, și un buton (Pornește / Instalează)
  installPage(page, area) {
    const T = (a, b) => this.T(a, b), card = area.createDiv("txh-inst");
    const info = {
      sources: { id: "texere-sources", icon: "library", name: "Texere · Sources", ro: "Caută surse în cataloage și le adaugă cu PDF-ul gratuit, importă din Zotero, citează în orice stil și aduce evidențierile din PDF în note.", en: "Searches catalogs and adds sources with their free PDF, imports from Zotero, cites in any style and brings your PDF highlights into your notes." },
      export: { id: "texere-export", icon: "file-output", name: "Texere · Export", ro: "Face din nota ta un PDF, un document Word, LaTeX, HTML sau Markdown, cu cuprins, pagină și șabloanele facultății.", en: "Turns your note into a PDF, Word, LaTeX, HTML or Markdown file, with contents, page layout and thesis templates." },
      insights: { id: "texere-insights", icon: "lightbulb", name: "Texere · Insights", ro: "Câte cuvinte scrii, lipești și ștergi; menționările fără link și aliasurile; tiparele din lectura și scrisul tău; ritmul proiectelor.", en: "How much you write, paste and delete; unlinked mentions and aliases; patterns in your reading and writing; the pace of your projects." },
      help: { id: "templater-obsidian", icon: "life-buoy", name: T("Ajutor", "Help"), ro: "Răspunsuri la întrebări despre vault, din ghid, în română sau engleză. Pornește cu Templater, la deschiderea vault-ului.", en: "Answers to questions about the vault, from the guide, in English or Romanian. It starts with Templater when the vault opens." },
    }[page];
    const ic = card.createDiv("txh-inst-ic"); try { setIcon(ic, info.icon); } catch (e) {}
    card.createDiv({ cls: "txh-inst-t", text: info.name });
    card.createDiv({ cls: "txh-inst-d", text: T(info.ro, info.en) });
    const st = this.state(info.id), b = card.createEl("button", { cls: "mod-cta" });
    if (page === "help") {
      const dep = DEPS.find(d => d.id === "templater-obsidian");
      if (st === "on") { b.setText(T("Pornește Ajutorul", "Start Help")); b.addEventListener("click", async () => { b.disabled = true; await this.enableStartupScripts(); this.notify(); }); }
      else { b.setText(st === "missing" ? T("Instalează Templater", "Install Templater") : T("Pornește Templater", "Turn on Templater")); b.addEventListener("click", async () => { b.disabled = true; await this.doItem({ kind: "dep", d: dep, st }); this.notify(); }); }
      return;
    }
    if (st === "off") { b.setText(T("Pornește", "Turn on")); b.addEventListener("click", async () => { b.disabled = true; await this.enable(info.id); setTimeout(() => this.notify(), 800); }); }
    else { b.setText(T("Instalează", "Install")); b.addEventListener("click", () => window.open(INSTALL_URL)); card.createDiv({ cls: "txh-inst-n", text: T("Vine cu vault-ul Texere: îl copiezi în .obsidian/plugins.", "It comes with the Texere vault: copy it into .obsidian/plugins.") }); }
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
    const P = this.P, T = (a, b) => P.T(a, b), el = this.containerEl, keep = el.scrollTop; el.empty(); el.addClass("texere-core-settings"); el.addClass("texere-settings");
    try { this.app.plugins.plugins["texere-sources"]?.sources?.settingTab?.css?.(); } catch (e) {}   // același aspect ca Texere · Sources și Texere · Export
    const head = el.createDiv("ts-head"); head.createSpan({ cls: "ts-head-t", text: "Texere · The Researcher's Vault" });
    const body = el.createDiv("ts-body");
    body.createEl("p", { cls: "ts-intro", text: T("Pluginul general al vault-ului: îl configurează, pornește celelalte pluginuri Texere și pe cele de care au nevoie, ține folderele la locul lor și pune panoul în fiecare tab nou.", "The vault's general plugin: it sets the vault up, turns on the other Texere plugins and the ones they need, keeps the folders in place and puts the panel in every new tab.") });
    const chip = (s, text, cls) => s.nameEl.createSpan({ cls: "tx-chip " + cls, text });
    const label = st => st === "on" ? [T("pornit", "on"), "ok"] : st === "off" ? [T("instalat, oprit", "installed, off"), "warn"] : [T("lipsește", "missing"), "bad"];
    const busy = async (b, fn) => { const old = b.buttonEl.getText(); b.setDisabled(true); b.setButtonText("…"); try { await fn(); } catch (e) { new Notice(e?.message || String(e), 8000); } finally { b.setButtonText(old); b.setDisabled(false); this.display(); P.notify(); } };

    // 0. ce trebuie reparat (aceeași listă ca în tab-ul nou); când totul e bine, nu apare
    const fixes = body.createDiv("tx-fixes");
    P.problems().then(probs => {
      if (!probs.length || !fixes.isConnected) return;
      fixes.createDiv({ cls: "tx-fixes-t", text: probs.length === 1 ? T("Un lucru de reparat", "One thing to fix") : T(`${probs.length} lucruri de reparat`, `${probs.length} things to fix`) });
      for (const p of probs) {
        const r = fixes.createDiv("txh-problem"), t = r.createDiv("txh-pt"); t.createDiv({ cls: "txh-ptext", text: p.text }); if (p.why) t.createDiv({ cls: "txh-pwhy", text: p.why });
        if (p.btn) { const b = r.createEl("button", { text: p.btn }); b.addEventListener("click", async () => { b.disabled = true; b.setText("…"); try { await p.fn(); } catch (e) { new Notice(e?.message || String(e), 8000); } setTimeout(() => P.notify(), 400); }); }
      }
    }).catch(() => {});

    // 1. Pluginurile: cele Texere, apoi cele de care au nevoie
    new Setting(body).setName(T("Pluginurile", "Plugins")).setHeading();
    for (const p of TEXERE) {
      const st = P.state(p.id), s = new Setting(body).setName(p.name).setDesc(P.en ? p.en : p.ro); chip(s, ...label(st));
      if (st === "missing") { s.setDesc((P.en ? p.en : p.ro) + " " + T("Vine cu vault-ul Texere (folderul .obsidian/plugins).", "It comes with the Texere vault (the .obsidian/plugins folder).")); continue; }
      s.addToggle(t => t.setValue(st === "on").onChange(async v => { try { if (v) await P.enable(p.id); else await P.disable(p.id); } catch (e) { new Notice(e?.message || String(e)); } this.display(); }));
      if (st === "on") s.addExtraButton(b => b.setIcon("settings").setTooltip(T("Setările lui", "Its settings")).onClick(() => { this.app.setting.openTabById(p.id); }));
    }
    const missing = DEPS.filter(d => P.state(d.id) !== "on");
    for (const d of DEPS) {
      const st = P.state(d.id), s = new Setting(body).setName(d.name).setDesc((P.en ? d.en : d.ro) + " " + T("Din lista oficială Obsidian.", "From Obsidian's official list.")); chip(s, ...label(st));
      if (st === "missing") s.addButton(b => b.setButtonText(T("Instalează și pornește", "Install and turn on")).setCta().onClick(() => busy(b, () => P.install(d))));
      else if (st === "off") s.addButton(b => b.setButtonText(T("Pornește", "Turn on")).onClick(() => busy(b, () => P.enable(d.id))));
    }
    if (missing.length > 1) new Setting(body).setName(T("Toate deodată", "All at once")).setDesc(T(`${missing.length} nu sunt pornite.`, `${missing.length} aren't on.`))
      .addButton(b => b.setButtonText(T("Instalează și pornește tot", "Install and turn on all")).setCta().onClick(() => busy(b, async () => { for (const d of missing) { if (P.state(d.id) === "missing") await P.install(d); else await P.enable(d.id); } })));

    // 2. Vault-ul: limba, folderele, harta domeniilor
    new Setting(body).setName(T("Vault-ul", "The vault")).setHeading();
    new Setting(body).setName(T("Limba", "Language")).setDesc(T("Pentru toate pluginurile Texere (unele texte, după repornire).", "For all Texere plugins (some labels after a restart)."))
      .addDropdown(d => d.addOption("ro", "Română").addOption("en", "English").setValue(P.en ? "en" : "ro").onChange(v => { this.app.saveLocalStorage(LANG, v); this.display(); }));
    {
      const miss = P.missingFolders(), s = new Setting(body).setName(T("Structura de foldere propusă", "Suggested folders"))
        .setDesc(T("01. Sources · 02. Notes (Essays, Personal, Poetry) · 03. Workspace (Courses, Thesis, Articles, Projects) · 04. Export. Texere le creează o dată; le schimbi cum vrei, nu le mai pune la loc decât dacă îi ceri.",
          "01. Sources · 02. Notes (Essays, Personal, Poetry) · 03. Workspace (Courses, Thesis, Articles, Projects) · 04. Export. Texere creates them once; change them as you like, it won't put them back unless you ask."));
      chip(s, miss.length ? T(`lipsesc ${miss.length}`, `${miss.length} missing`) : T("toate", "all there"), miss.length ? "warn" : "ok");
      if (miss.length) s.addButton(b => b.setButtonText(T(`Creează ce lipsește (${miss.length})`, `Create what's missing (${miss.length})`)).onClick(() => busy(b, async () => { const n = await P.createFolders(); new Notice(T(`Am creat ${n} foldere.`, `Created ${n} folders.`), 5000); })));
    }
    {
      const fx = P.fixedFolders(), gone = fx.filter(x => !this.app.vault.getAbstractFileByPath(x.path)), s = new Setting(body).setName(T("Folderele de care are nevoie Texere", "Folders Texere needs"))
        .setDesc(fx.map(x => x.path).join(" · ") + ". " + T("Rămân unde sunt: dacă redenumești sau muți unul, Texere îți spune și îl pune la loc.", "They stay where they are: if you rename or move one, Texere tells you and puts it back."));
      chip(s, gone.length ? T(`mutate: ${gone.length}`, `${gone.length} moved`) : T("la locul lor", "in place"), gone.length ? "bad" : "ok");
      if (gone.length) s.addButton(b => b.setButtonText(T("Pune-le la loc", "Put them back")).setCta().onClick(() => busy(b, async () => { for (const x of gone) await P.putBack(x.path); })));
    }
    for (const m of MAPS) {
      const s = new Setting(body).setName(T(`Harta domeniilor: ${m.ro}`, `Map of fields: ${m.en}`)).setDesc(T("Se verifică…", "Checking…"));
      P.mapStatus(m).then(st => {
        s.setDesc(T(`Notele din ${st.folder}: ramuri, subdomenii, concepte, teorii, curente, perioade. Din ele vin valorile proprietăților (branch, concepts, theories…). ${st.have} din ${st.total}.`, `The notes in ${st.folder}: branches, subdomains, concepts, theories, movements, periods. Your properties (branch, concepts, theories…) link to them. ${st.have} of ${st.total}.`));
        chip(s, st.have >= st.total ? T("creată", "created") : st.have ? T("parțial", "partly") : T("necreată", "not created"), st.have >= st.total ? "ok" : st.have ? "warn" : "bad");
        if (st.have < st.total) s.addButton(b => b.setButtonText(st.have ? T(`Adaugă ce lipsește (${st.total - st.have})`, `Add what's missing (${st.total - st.have})`) : T("Creează harta", "Create the map")).setCta().onClick(() => busy(b, async () => { const n = await P.createMap(m); new Notice(T(`Am creat ${n} note în ${st.folder}.`, `Created ${n} notes in ${st.folder}.`), 6000); })));
      }).catch(e => s.setDesc(T("Nu pot citi harta: ", "Couldn't read the map: ") + e.message));
    }

    // 3. Configurarea
    new Setting(body).setName(T("Configurarea", "Setup")).setHeading();
    new Setting(body).setName(T("Configurarea pe acest laptop", "Setup on this laptop")).setDesc(T("Scriptul care pregătește vault-ul pe un laptop nou (rulează singur prima dată): limba, folderul exportului, pluginurile.", "The script that prepares the vault on a new laptop (it runs by itself the first time): language, export folder, plugins."))
      .addButton(b => b.setButtonText(T("Rulează din nou", "Run again")).onClick(() => P.runConfig(false)));
    new Setting(body).setName(T("Fereastra de la prima pornire", "First-start window")).setDesc(T("Ce lipsește, cu un buton care face tot.", "What's missing, with one button that does it all."))
      .addButton(b => b.setButtonText(T("Deschide", "Open")).onClick(() => P.onboard(true)));
    el.scrollTop = keep;
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
.texere-home-on{padding:0 !important;overflow:hidden !important}
.texere-home{box-sizing:border-box;height:100%;position:relative;display:flex;flex-direction:column;container-type:inline-size}
.texere-home .txh-page{flex:1;min-height:0;overflow:auto;box-sizing:border-box}
.texere-home .txh-page-home{display:flex;align-items:safe center;justify-content:center;padding:24px 16px 96px}
.texere-home .txh-page-panel{padding:0 0 84px}
.texere-home .txh-navwrap{position:absolute;left:50%;bottom:18px;transform:translateX(-50%);display:flex;align-items:center;gap:4px;z-index:5}
.texere-home .txh-nav{display:flex;gap:2px;padding:4px;border-radius:999px;background:var(--background-primary);border:1px solid var(--background-modifier-border);box-shadow:0 8px 28px rgba(0,0,0,.14)}
.texere-home .txh-nb{border:0 !important;display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 14px;border-radius:999px;background:transparent !important;box-shadow:none !important;color:var(--text-muted);font-size:var(--font-ui-small);white-space:nowrap;cursor:pointer}
.texere-home .txh-nb:hover{background:var(--background-modifier-hover) !important;color:var(--text-normal)}
.texere-home .txh-nb.on{background:var(--background-modifier-active-hover, var(--background-modifier-hover)) !important;color:var(--text-normal);font-weight:600}
.texere-home .txh-nb .txh-ic svg{width:16px;height:16px}
.texere-home .txh-new{flex:none;box-sizing:border-box;width:46px !important;height:46px !important;min-width:46px;aspect-ratio:1;border-radius:50% !important;padding:0 !important;display:inline-flex;align-items:center;justify-content:center;background:var(--background-primary) !important;border:1px solid var(--background-modifier-border) !important;color:var(--text-normal);box-shadow:0 8px 28px rgba(0,0,0,.14) !important;cursor:pointer}
.texere-home .txh-new svg{width:20px;height:20px}.texere-home .txh-new:hover{background:var(--background-modifier-hover) !important}
@container (max-width: 600px){.texere-home .txh-nl{display:none}.texere-home .txh-nb{padding:0 11px}}
.texere-home .tx-embedded{box-sizing:border-box;display:flex;flex-direction:column;width:min(900px,100%) !important;max-width:100% !important;height:100% !important;max-height:none !important;margin:0 auto !important;padding:22px 24px 0;background:transparent;border:0;box-shadow:none;position:relative}
.texere-home .tx-embedded>.modal-title:empty{display:none}
.texere-home .txh-page-panel .txi-wrap{max-width:900px;padding:22px 24px 24px}
.texere-home .tx-embedded.txh-help>.modal-content>div:first-child{border-bottom:1px solid var(--background-modifier-border);margin-bottom:12px !important;align-items:flex-end !important}
.texere-home .tx-embedded.txh-help>.modal-content>div:first-child>span:first-child{display:none !important}
.texere-home .tx-embedded.txh-help>.modal-content>div:first-child>span:nth-child(2){font-size:var(--font-ui-large) !important;font-weight:600 !important;line-height:1.3;padding-bottom:10px}
.texere-home .tx-embedded.txh-help>.modal-content>div:first-child>div{margin:0 0 8px !important}
.texere-home .tx-embedded .tx-file{position:static;margin-left:auto;align-self:center;max-width:40%;padding-bottom:10px}
.texere-home .tx-embedded>.modal-content{flex:1;min-height:0}
.texere-home .txh-inst{max-width:420px;margin:12vh auto 0;padding:0 16px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px}
.texere-home .txh-inst-ic{color:var(--interactive-accent)}.texere-home .txh-inst-ic svg{width:32px;height:32px}
.texere-home .txh-inst-t{font-size:var(--font-ui-large);font-weight:600}
.texere-home .txh-inst-d{color:var(--text-muted);font-size:var(--font-ui-small);line-height:1.5}
.texere-home .txh-inst button{margin-top:6px}.texere-home .txh-inst-n{color:var(--text-faint);font-size:var(--font-ui-smaller)}
.texere-home .txh-inner{width:100%;max-width:440px;display:flex;flex-direction:column;gap:14px}
.texere-home .txh-hi{font-size:var(--font-ui-large);font-weight:600;text-align:center;margin-bottom:-8px}
.texere-home .txh-desc{color:var(--text-muted);font-size:var(--font-ui-small);text-align:center;line-height:1.5;max-width:44ch;margin:0 auto}
.texere-home .txh-problems{display:flex;flex-direction:column;gap:6px}
.texere-core-settings .tx-fixes{display:flex;flex-direction:column;gap:6px;margin:4px 0 6px}.texere-core-settings .tx-fixes:empty{display:none}
.texere-core-settings .tx-fixes-t{font-size:var(--font-ui-small);font-weight:600;margin-bottom:2px}
.texere-core-settings .txh-problem{display:flex;align-items:center;gap:12px;padding:8px 10px;border-radius:8px;background:rgba(var(--color-orange-rgb),.1);border:1px solid rgba(var(--color-orange-rgb),.25)}
.texere-core-settings .txh-pt{flex:1;min-width:0}.texere-core-settings .txh-ptext{font-size:var(--font-ui-small);font-weight:600}.texere-core-settings .txh-pwhy{font-size:var(--font-ui-smaller);color:var(--text-muted)}
.texere-core-settings .ts-head{display:flex;align-items:flex-end;border-bottom:1px solid var(--background-modifier-border);margin:0 0 14px}.texere-core-settings .ts-head-t{font-size:var(--font-ui-large);font-weight:600;padding-bottom:10px}
.texere-core-settings .ts-intro{color:var(--text-muted);font-size:var(--font-ui-small);margin:0 0 8px;line-height:1.5;max-width:62ch}
.texere-home .txh-problem{display:flex;align-items:center;gap:12px;padding:8px 10px;border-radius:8px;background:rgba(var(--color-orange-rgb),.1);border:1px solid rgba(var(--color-orange-rgb),.25)}
.texere-home .txh-pt{flex:1;min-width:0}
.texere-home .txh-ptext{font-size:var(--font-ui-small);font-weight:600}
.texere-home .txh-pwhy{font-size:var(--font-ui-smaller);color:var(--text-muted)}
.texere-home .txh-problem button{flex:none}
.texere-home .txh-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.texere-home .txh-actions button{flex:1 1 auto;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:36px;padding:0 12px;white-space:nowrap}
.texere-home .txh-ic{display:inline-flex}.texere-home .txh-ic svg{width:16px;height:16px}
.texere-home .txh-label{font-size:var(--font-ui-smaller);color:var(--text-faint);text-transform:uppercase;letter-spacing:.05em;margin:6px 0 -8px}
.texere-home .txh-recent{display:flex;flex-direction:column}
.texere-home .txh-file{display:flex;align-items:baseline;gap:8px;padding:5px 6px;margin:0 -6px;border-radius:6px;color:var(--text-normal);text-decoration:none;min-width:0}
.texere-home .txh-file:hover{background:var(--background-modifier-hover)}
.texere-home .txh-fname{flex:1 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.texere-home .txh-fmeta{flex:0 1 auto;min-width:0;max-width:55%;display:flex;gap:8px;justify-content:flex-end;color:var(--text-faint);font-size:var(--font-ui-smaller)}
.texere-home .txh-fdir{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.texere-home .txh-ftime{flex:none;white-space:nowrap}
.texere-home .txh-foot{font-size:var(--font-ui-smaller);color:var(--text-faint);text-align:center}
.texere-home .txh-foot a{color:var(--text-muted)}`;
if (typeof document !== "undefined") { const st = document.createElement("style"); st.id = "texere-core-css"; document.getElementById(st.id)?.remove(); st.textContent = CSS; document.head.appendChild(st); }
