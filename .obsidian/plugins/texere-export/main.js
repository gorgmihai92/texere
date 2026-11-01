/* Texere · Export — versiune 1.0.1 (2026-11-01)
 * Plugin separat: nota ta → PDF, Word (.docx), LaTeX, HTML sau Markdown, cu cuprins, pagină și șabloanele facultății.
 * Citările și bibliografia vin din Texere · Sources, dacă e pornit (îl găsește singur); fără el, exportul merge, iar citările
 * rămân cum le-ai scris. Codul e în export.js (și bibliotecile lib-*.js); aici doar îl pornim.
 * Setările vin, prima dată, din locul vechi (Texere – The Researcher's Vault → sources.export).
 */
const { Plugin, normalizePath } = require("obsidian");
const LANG = "texere-lang";

module.exports = class TexereExport extends Plugin {
  async onload() {
    await this.settingsReady();
    this.app.workspace.onLayoutReady(() => this.boot().catch(e => console.error("Texere · Export", e)));
  }
  // Texere · Sources (dacă e pornit): motorul citărilor, sugestiile de foldere, aspectul paginii de setări
  get src() { return this.app.plugins.plugins["texere-sources"] || null; }
  get cite() { return this.src?.cite || null; }

  async settingsReady() {
    let d = await this.loadData();
    if (!d || !d.export) {   // prima dată: setările exportului din locul vechi
      for (const p of ["texere-sources", "texere"]) {
        try { const old = JSON.parse(await this.app.vault.adapter.read(`${this.app.vault.configDir}/plugins/${p}/data.json`)); if (old?.sources?.export) { d = { ...(d || {}), export: old.sources.export }; await this.saveData(d); break; } } catch (e) {}
      }
    }
    this.settings = d || {};
  }

  async boot() {
    // Texere · Sources pornește după ce se încarcă interfața: îl așteptăm puțin (citările lui), apoi pornim oricum
    for (let i = 0; i < 40 && this.app.plugins.enabledPlugins?.has?.("texere-sources") && !this.cite?.ready; i++) await new Promise(r => setTimeout(r, 250));
    const plugin = this, ad = this.app.vault.adapter, dir = this.manifest.dir, m = { exports: {} };
    new Function("module", "exports", "require", await ad.read(dir + "/export.js"))(m, m.exports, require);
    const S = {   // ce folosea exportul din Texere · Sources, acum și fără el
      app: this.app, host: this,
      get en() { return plugin.app.loadLocalStorage(LANG) === "en"; },
      T(a, b) { return this.en ? b : a; },
      conf: () => plugin.settings,
      save: () => plugin.saveData(plugin.settings),
      async ensureFolder(p) {
        if (!p || plugin.app.vault.getAbstractFileByPath(p)) return;
        let cur = ""; for (const part of normalizePath(p).split("/")) { cur = cur ? cur + "/" + part : part; if (!plugin.app.vault.getAbstractFileByPath(cur)) { try { await plugin.app.vault.createFolder(cur); } catch (e) {} } }
      },
      get _mods() { return plugin.src?.sources?._mods; },
      get settingTab() { return plugin.src?.sources?.settingTab; },
      folderSuggest(el, f) { return plugin.src?.sources?.folderSuggest?.(el, f) ?? null; },
    };
    this.S = S;
    this.exporter = await m.exports.install(S, dir);
    // comenzile: „Texere · Export · …” (ca la celelalte pluginuri Texere)
    const name = () => { for (const [id, c] of Object.entries(this.app.commands?.commands || {})) { if (!id.startsWith(this.manifest.id + ":") || !c || c._texereNamed) continue; const raw = String(c.name).replace(/^[^:]*:\s*/, ""), [en, ro] = raw.split(" / "); c.name = `Texere · Export · ${(S.en ? en : (ro || en)).trim()}`; c._texereNamed = true; } };
    for (const ms of [0, 1500]) setTimeout(() => { try { name(); } catch (e) {} }, ms);
  }
};
