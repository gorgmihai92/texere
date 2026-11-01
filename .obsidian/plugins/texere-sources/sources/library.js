// Texere · Sources · biblioteca: singura copie a bibliografiei (bibliography.json) în memorie.
// Căutarea, sugestiile „@”, citările și statisticile citesc de aici. Când adaugi sau ștergi o sursă, lista se actualizează o dată
// și toți află imediat. Când fișierul se schimbă din afară (sincronizare, altă aplicație), se recitește.

class Library {
  constructor(app, pathFn) { this.app = app; this.pathFn = pathFn; this.entries = []; this.version = 0; this.cbs = new Set(); this.lastText = null; }
  path() { return this.pathFn?.() || "Support/Admin/Bibliography/bibliography.json"; }

  async load() {
    let text = null;
    try { text = await this.app.vault.adapter.read(this.path()); } catch (e) {}
    if (text !== null && text === this.lastText) return;   // propria noastră scriere: nimic nou
    let data = [];
    try { data = text ? JSON.parse(text) : []; } catch (e) { console.error("Texere: bibliografia nu se poate citi", e); return; }
    this.entries = Array.isArray(data) ? data : []; this.lastText = text; this.changed();
  }
  // fișierul schimbat din afară (sincronizare, altă aplicație) → îl recitim
  watch(host) {
    let t = null;
    const on = f => { if (f?.path !== this.path()) return; clearTimeout(t); t = setTimeout(() => this.load(), 250); };
    for (const ev of ["modify", "create"]) host.registerEvent(this.app.vault.on(ev, on));
    // o notă sau un PDF redenumit (ori mutat) în Obsidian: bibliografia urmează fișierul; citările merg oricum, după id
    host.registerEvent(this.app.vault.on("rename", (f, old) => this.renamed(f, old)));
  }
  async renamed(f, old) {
    if (!f || !old || f.path === old) return;
    const oldName = old.split("/").pop(), newName = f.path.split("/").pop();
    let n = 0;
    for (const e of this.entries) {
      if (e.obsidianPath === old) { e.obsidianPath = f.path; n++; }
      if (/\.pdf$/i.test(old) && Array.isArray(e.attachment)) {
        const a = e.attachment.map(x => typeof x === "string" && x.includes(oldName) ? x.split(oldName).join(newName) : x);
        if (a.some((x, i) => x !== e.attachment[i])) { e.attachment = a; n++; }
      }
    }
    if (n) await this.save();
  }
  onChange(cb) { this.cbs.add(cb); return () => this.cbs.delete(cb); }
  changed() { this.version++; for (const cb of this.cbs) { try { cb(); } catch (e) { console.error("Texere: bibliografia", e); } } }

  all() { return this.entries; }
  get(id) { return this.entries.find(e => e.id === id) || null; }
  has(id) { return this.entries.some(e => e.id === id); }

  async save() {
    const p = this.path(), dir = p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
    if (dir && !this.app.vault.getAbstractFileByPath(dir)) await this.app.vault.createFolder(dir);
    const text = JSON.stringify(this.entries, null, 2);
    this.lastText = text;
    await this.app.vault.adapter.write(p, text);
    this.changed();
  }
  async add(entry) { if (!entry?.id || this.has(entry.id)) return false; this.entries.push(entry); await this.save(); return true; }
  async update(id, fn) { const e = this.get(id); if (!e) return false; fn(e); await this.save(); return true; }
  async removePath(path) {
    const n = this.entries.length; this.entries = this.entries.filter(e => e.obsidianPath !== path);
    if (this.entries.length !== n) await this.save();
  }
}

module.exports = Library;
