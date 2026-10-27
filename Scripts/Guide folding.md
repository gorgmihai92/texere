<%*
// Deschide ghidul (română sau engleză) cu proprietățile și toate capitolele/subcapitolele închise. Versiune 2.1.0 (2026-10-27)
// Rulează automat la pornirea Obsidian (Templater → Startup templates). Nu modifica și nu rula manual.
if (!window.__ghidPliere) {
  window.__ghidPliere = true;
  const GHIDS = [
    { names: ["02. Texere – Cercetare, lectură și scris, într-un singur loc.md", "01. Texere – Cercetare, lectură și scris, într-un singur loc.md", "Cercetare, lectură și scris, într-un singur loc.md", "Cercetarea într-un singur loc.md", "Ghid de cercetare.md", "Ghid pentru eficientizarea procesului de cercetare.md"], re: /Termeni folosiți în ghid/ },
    { names: ["01. Texere – Research, reading and writing, in one place.md", "02. Texere – Research, reading and writing, in one place.md", "Research, reading and writing, in one place.md", "Research in One Place.md"], re: /Terms used in this guide/ },
  ];
  // găsește ghidurile chiar dacă au fost redenumite (după numele cunoscute sau după titlul glosarului)
  const findOne = g => {
    const strip = b => b.replace(/^\d+[.)]\s*/, "").replace(/^(Texere|Topos)\s*[–—-]\s*/, "");
    for (const n of g.names) { const f = app.vault.getAbstractFileByPath(n) || app.vault.getMarkdownFiles().find(x => x.name === n || strip(x.basename) + ".md" === n); if (f && f.stat && f.stat.size > 0) return f; }
    return app.vault.getMarkdownFiles().find(f => (app.metadataCache.getFileCache(f)?.headings || []).some(h => g.re.test(h.heading))) || null;
  };
  const isGhidFile = f => !!f && GHIDS.some(g => findOne(g) === f);
  const MV = tp.obsidian.MarkdownView;
  const run = id => app.commands.executeCommandById(id);
  const isGhid = v => v instanceof MV && !!v.file && isGhidFile(v.file) && v.getMode() === "source";
  const active = v => app.workspace.getActiveViewOfType(MV) === v;
  let lastNav = 0; const opened = new Set();

  const closeProps = v => {
    const mc = v.containerEl.querySelector(".metadata-container");
    if (!mc || mc.classList.contains("is-collapsed")) return;
    const id = Object.keys(app.commands.commands).find(c => /fold/i.test(c) && /propert/i.test(c));
    if (id) run(id); else mc.querySelector(".metadata-properties-heading")?.click();
  };
  // Închide toate titlurile, în afară de drumul către titlul de pe rândul `keep` (dacă există).
  const fold = (v, keep) => {
    if (!isGhid(v) || !active(v)) return;
    const c = app.metadataCache.getFileCache(v.file) || {};
    const hs = (c.headings || []).map(h => ({ line: h.position.start.line, level: h.level }));
    const path = new Set();
    if (keep != null) { let lvl = 99; for (let i = hs.length - 1; i >= 0; i--) { const h = hs[i]; if (h.line <= keep && h.level < lvl) { path.add(h.line); lvl = h.level; } } }
    const ed = v.editor;
    run("editor:unfold-all");
    [...hs].sort((a, b) => b.level - a.level || a.line - b.line).forEach(h => {
      if (path.has(h.line)) return;
      ed.setCursor({ line: h.line, ch: 0 }); run("editor:toggle-fold");
    });
    const body = c.frontmatterPosition ? c.frontmatterPosition.end.line + 1 : 0;
    const at = keep != null ? keep : body;
    ed.setCursor({ line: at, ch: 0 });
    if (keep != null) ed.scrollIntoView({ from: { line: at, ch: 0 }, to: { line: at, ch: 0 } }, true); else ed.scrollTo(0, 0);
    closeProps(v);
  };

  // La prima deschidere din sesiune: totul închis.
  app.workspace.on("file-open", file => {
    if (!isGhidFile(file) || opened.has(file.path)) return;
    opened.add(file.path);
    setTimeout(() => {
      if (Date.now() - lastNav < 800) return;
      const v = app.workspace.getActiveViewOfType(MV); if (v) fold(v, null);
    }, 250);
  });
  // La un link către un titlu din ghid: deschide doar drumul până la el.
  const orig = MV.prototype.setEphemeralState;
  MV.prototype.setEphemeralState = function (state) {
    let target = null;
    try {
      if (isGhid(this) && state && typeof state.subpath === "string" && state.subpath.startsWith("#") && !state.subpath.startsWith("#^")) {
        const name = state.subpath.split("#").filter(Boolean).pop().trim().toLowerCase();
        const h = (app.metadataCache.getFileCache(this.file)?.headings || []).find(x => x.heading.trim().toLowerCase() === name);
        if (h) { target = h.position.start.line; lastNav = Date.now(); opened.add(this.file.path); run("editor:unfold-all"); }
      }
    } catch (e) {}
    const r = orig.apply(this, arguments);
    if (target != null) { const v = this; setTimeout(() => fold(v, target), 80); }
    return r;
  };
  // Dacă ghidul e deja deschis la pornire.
  app.workspace.onLayoutReady(() => setTimeout(() => {
    const v = app.workspace.getActiveViewOfType(MV);
    if (isGhid(v) && !opened.has(v.file.path)) { opened.add(v.file.path); fold(v, null); }
  }, 500));
}
%>
