/* Texere — versiune 2.1.0 (2026-10-27)
 * 1. Imediat după „Trust author and enable plugins”, pornește scriptul „Templates/New laptop setup”
 *    dacă vault-ul nu e configurat pe acest laptop (sau a fost mutat în alt folder).
 * 2. Activează scripturile de pornire din „Scripts” (butonul Ajutor, închiderea capitolelor ghidului).
 * 3. Adaugă comenzile „Texere – The Researcher's Vault: Setup” (fereastra urmează limba aleasă).
 */
const { Plugin, Notice, TFile } = require("obsidian");

const CONFIG = "Templates/New laptop setup.md";
const STARTS = ["Scripts/Guide folding.md", "Scripts/Help.md"];
const FLAG = "texere-setup";
const LANG = "texere-lang";   // limba aleasă în fereastra de configurare și în Ajutor (ro / en)
const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = class Texere extends Plugin {
  async onload() {
    this.addCommand({ id: "setup", name: "Setup", callback: () => this.runConfig(false) });
    this.app.workspace.onLayoutReady(() => { this.start().catch(e => console.error("Texere:", e)); });
  }

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
    if (!(await this.waitFor(["templater-obsidian"], 20000))) return;
    await this.enableStartupScripts();
    await this.waitFor(["biblib", "obsidian-pandoc"], 10000);
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
    if (!T || !(f instanceof TFile)) { new Notice(en ? "I can't find the setup script (Templates/New laptop setup)." : "Nu găsesc scriptul de configurare (Templates/New laptop setup)."); return; }
    // scriptul rulează direct (ca scripturile de pornire), fără să creeze o notă nouă „Untitled”;
    // raportul se scrie direct în nota „Raport configurare” / „Setup report”
    const t = T.templater;
    if (t.create_running_config && t.read_and_parse_template) {
      try { await t.read_and_parse_template(t.create_running_config(f, f, 5)); return; }
      catch (e) { console.error("Texere: configurarea", e); new Notice((en ? "The setup stopped: " : "Configurarea s-a oprit: ") + e.message); return; }
    }
    await t.create_new_note_from_template(f, undefined, undefined, true);   // versiuni vechi de Templater
  }
};
