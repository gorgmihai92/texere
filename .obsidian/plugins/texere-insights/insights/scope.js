// Texere · Insights · ce e ce în vault, recunoscut după convenții (merge în orice vault, cu sau fără celelalte pluginuri Texere):
// notele de literatură, etichetele evidențierilor, notele-concept, folderele care nu sunt scrisul tău, proiectele.
// Dacă Texere · Sources e pornit, de la el vin notele de literatură și datele surselor (mai precis); altfel, din proprietățile notelor.
const X = require("./text");

const LIT_TAGS = ["literature_note", "literature-note", "literaturenote", "lit_note", "source", "sources", "reference", "references"];
const SKIP_NAMES = ["support", "templates", "template", "attachments", "assets", "files", "media", "archive", "_archive"];
const PROJECT_RX = /(thesis|teza|tez[ăa]|disert|dissertation|licen[țt][ăa]|doctorat|phd)/i;

const ScopeMixin = {
  // Texere · Sources pornit: notele de literatură și datele surselor vin de la el
  hasSources() { const s = this.app.plugins.plugins["texere-sources"]; return !!(s && (s.cite || s.sources)); },
  fmOf(path) { const f = typeof path === "string" ? this.app.vault.getAbstractFileByPath(path) : path; return (f && this.app.metadataCache.getFileCache(f)?.frontmatter) || {}; },
  tagsOf(path) {
    const f = this.app.vault.getAbstractFileByPath(path), c = f && this.app.metadataCache.getFileCache(f); if (!c) return [];
    let fmt = c.frontmatter?.tags ?? c.frontmatter?.tag ?? []; if (!Array.isArray(fmt)) fmt = String(fmt).split(/[,\s]+/);
    return [...fmt.map(t => String(t || "").replace(/^#/, "").toLowerCase()), ...(c.tags || []).map(t => t.tag.replace(/^#/, "").toLowerCase())].filter(Boolean);
  },
  // nota de literatură: folderul lui Texere · Sources, sau (oriunde) o notă cu cheie de citare ori cu eticheta #literature_note
  isLit(path) {
    if (!path) return false;
    try { const d = String(this.app.plugins.plugins["texere-sources"]?.sources?.litDir?.() || "").replace(/\/+$/, ""); if (d && path.startsWith(d + "/")) return true; } catch (e) {}
    const fm = this.fmOf(path); if (fm["citation-key"] || fm.citekey || fm.citationKey || (fm.id && (fm.author || fm.authors || fm.title) && (fm.issued || fm.year || fm.type))) return true;
    return this.tagsOf(path).some(t => LIT_TAGS.includes(t));
  },
  litDir() { try { return String(this.app.plugins.plugins["texere-sources"]?.sources?.litDir?.() || "").replace(/\/+$/, ""); } catch (e) { return ""; } },
  // etichetele evidențierilor: culorile din PDF++, altfel cele obișnuite și cele pe care le folosești la început de rând în notele de literatură
  hlTags() {
    if (this._hl && Date.now() - this._hlAt < 300000) return this._hl;
    const c = this.app.plugins.plugins["pdf-plus"]?.settings?.colors; let out = c ? Object.keys(c).map(s => s.toLowerCase()) : [];
    if (!out.length) {
      const cnt = {};
      for (const f of this.app.vault.getMarkdownFiles()) { if (!this.isLit(f.path)) continue; for (const t of this.app.metadataCache.getFileCache(f)?.tags || []) if (t.position?.start?.col === 0) { const k = t.tag.replace(/^#/, "").toLowerCase(); cnt[k] = (cnt[k] || 0) + 1; } }
      out = [...new Set([...X.HL_TAGS, ...Object.entries(cnt).filter(([k, n]) => n >= 3 && !LIT_TAGS.includes(k)).map(([k]) => k)])];
    }
    this._hl = out; this._hlAt = Date.now(); return out;
  },
  // datele unei surse (autor, an, titlu, limbă, tip): din Texere · Sources, altfel din proprietățile notei de literatură
  sourceMeta(id, path) {
    try { const s = this.app.plugins.plugins["texere-sources"]?.cite?.raw?.[id]; if (s) return s; } catch (e) {}
    const fm = path ? this.fmOf(path) : {}; if (!Object.keys(fm).length) return null;
    let author = fm.author ?? fm.authors ?? fm.creator;
    if (typeof author === "string") author = author.split(/;| and | și /).map(a => { const p = a.split(",").map(x => x.trim()); return p.length > 1 ? { family: p[0], given: p[1] } : { family: a.trim().split(/\s+/).pop() }; });
    if (Array.isArray(author)) author = author.map(a => typeof a === "string" ? { family: a.replace(/^\[\[|\]\]$/g, "").split(",")[0].trim().split(/\s+/).pop() } : a);
    const y = +(fm.issued?.["date-parts"]?.[0]?.[0] || fm.year || String(fm.date || "").slice(0, 4) || 0) || null;
    return { author: author || [], issued: y ? { "date-parts": [[y]] } : null, title: fm.title, type: fm.type, language: fm.language || fm.lang };
  },
  // ——— notele-concept (ținta linkurilor): folderele alese, altfel recunoscute ———
  // un folder în care cele mai multe note au aliasuri e un folder de concepte (tot ce e sub el); în afara lui, orice notă cu aliasuri
  conceptFolders() {
    const set = (this.settings.targetFolders || []).filter(Boolean); if (set.length) return set.map(f => String(f).replace(/\/+$/, ""));
    return this.autoConceptFolders();
  },
  autoConceptFolders() {
    if (this._cf && Date.now() - this._cfAt < 600000) return this._cf;
    const stats = {};
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (this.isLit(f.path) || this.scanExcluded(f.path)) continue;
      const al = this.fmOf(f).aliases ?? this.fmOf(f).alias, has = Array.isArray(al) ? al.filter(Boolean).length > 0 : !!al;
      const parts = f.path.split("/").slice(0, -1); for (let i = 1; i <= parts.length; i++) { const k = parts.slice(0, i).join("/"); const s = stats[k] = stats[k] || { n: 0, a: 0 }; s.n++; if (has) s.a++; }
    }
    const ok = Object.entries(stats).filter(([, s]) => s.n >= 10 && s.a / s.n >= 0.5).map(([k]) => k).sort((a, b) => a.split("/").length - b.split("/").length);
    const out = []; for (const k of ok) if (!out.some(o => k.startsWith(o + "/"))) out.push(k);
    this._cf = out; this._cfAt = Date.now(); return out;
  },
  isTarget(path) {
    const folders = this.conceptFolders();
    if (folders.length) return this.inFolders(path, folders);
    if (this.isLit(path)) return false;   // niciun folder de concepte: orice notă cu aliasuri (în afară de cele de literatură)
    const al = this.fmOf(path).aliases; return Array.isArray(al) ? al.filter(Boolean).length > 0 : !!al;
  },
  targetFolders() { return this.conceptFolders(); },
  // ——— folderele care nu sunt scrisul tău: cele alese, altfel șabloanele, fișierele excluse în Obsidian și folderele de tip „Support”, „Attachments” ———
  excludedFolders() {
    const set = (this.settings.scanExclude || []).filter(Boolean); if (set.length) return set.map(f => String(f).replace(/\/+$/, ""));
    return this.autoExcluded();
  },
  autoExcluded() {
    const out = new Set();
    try { const t = this.app.internalPlugins?.plugins?.templates?.instance?.options?.folder; if (t) out.add(t); } catch (e) {}
    try { const t = this.app.plugins.plugins["templater-obsidian"]?.settings?.templates_folder; if (t) out.add(t); } catch (e) {}
    try { for (const t of this.app.vault.getConfig?.("userIgnoreFilters") || []) if (t && !/[*?]/.test(t)) out.add(t); } catch (e) {}
    try { for (const c of this.app.vault.getRoot().children || []) if (Array.isArray(c.children) && SKIP_NAMES.includes(c.name.toLowerCase())) out.add(c.path); } catch (e) {}
    return [...out].map(f => String(f).replace(/\/+$/, "")).filter(Boolean);
  },
  scanExcluded(path) { return path.startsWith(".trash/") || this.inFolders(path, this.excludedFolders()); },
  // ——— proiectele: un folder sau o etichetă, cu țintă și termen (opționale) ———
  projects() {
    if (!Array.isArray(this.settings.projects)) {   // prima dată: teza din setările vechi, altfel un folder care pare teză
      const list = [], old = this.settings.thesisFolder;
      if (old && this.app.vault.getAbstractFileByPath(old)) list.push({ value: old, target: +this.settings.thesisTarget || 0, deadline: this.settings.thesisDeadline || "" });
      else { const f = this.vaultFolders().find(p => PROJECT_RX.test(p.split("/").pop())); if (f) list.push({ value: f, target: 0, deadline: "" }); }
      this.settings.projects = list; delete this.settings.thesisFolder; delete this.settings.thesisTarget; delete this.settings.thesisDeadline; this.saveSettings();
    }
    return this.settings.projects;
  },
  projectName(p) { return String(p.value || "").startsWith("#") ? p.value : String(p.value || "").split("/").pop(); },
  inProject(path, p) {
    const v = String(p.value || ""); if (!v) return false;
    if (v.startsWith("#")) { const t = v.slice(1).toLowerCase(); return this.tagsOf(path).some(x => x === t || x.startsWith(t + "/")); }
    return path.startsWith(v.replace(/\/+$/, "") + "/");
  },
  inAnyProject(path) { return this.projects().some(p => this.inProject(path, p)); },
  vaultTags() { const t = this.app.metadataCache.getTags?.() || {}; return Object.keys(t).sort((a, b) => a.localeCompare(b)); },
};

module.exports = { ScopeMixin, LIT_TAGS };
