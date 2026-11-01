/* Texere · Sources — versiune 1.2.1 (2026-11-01)
 * Plugin separat (înainte, parte din „Texere – The Researcher's Vault”):
 *  • căutarea surselor în cataloage și adăugarea lor cu PDF-ul gratuit; Zotero (fila lui, importul, butonul din browser);
 *  • biblioteca comună, citările în stilul ales (sugestiile @), statisticile surselor;
 *  • evidențierile din PDF în notă (cu PDF++): un clic pe o evidențiere existentă nu o mai adaugă, ștergerea ei din PDF
 *    o șterge din notă (și invers), PDF-ul nu se reîncarcă la fiecare evidențiere.
 * Codul e în folderul sources/; aici doar îl pornim. Setările vin, prima dată, din „Texere – The Researcher's Vault”.
 */
const { Plugin } = require("obsidian");

module.exports = class TexereSources extends Plugin {
  async onload() {
    this.guardPdfHighlights();
    this.app.workspace.onLayoutReady(() => this.quietPdfReload());
    this.app.workspace.onLayoutReady(() => this.syncHighlightDeletes());
    this.app.workspace.onLayoutReady(() => this.loadSources().catch(e => console.error("Texere · Sources", e)));
  }

  // setările (data.json); prima dată, cele din pluginul vechi (Texere – The Researcher's Vault, unde stătea Sources)
  settingsReady() {
    return (this._settingsP = this._settingsP || (async () => {
      let d = await this.loadData();
      if (!d || !d.sources) {
        try {
          const old = JSON.parse(await this.app.vault.adapter.read(`${this.app.vault.configDir}/plugins/texere/data.json`));
          if (old?.sources) { const { export: _x, ...src } = old.sources; d = { ...(d || {}), citationStyle: old.citationStyle, stats: old.stats, statsOpen: old.statsOpen, sources: src }; await this.saveData(d); }
        } catch (e) {}
      }
      return (this.settings = Object.assign({ citationStyle: "apa", stats: {}, statsOpen: true }, d || {}));
    })());
  }

  async loadSources() {
    await this.settingsReady();
    const dir = this.sourcesDir = this.manifest.dir + "/sources", mod = { exports: {} };
    new Function("module", "exports", "require", await this.app.vault.adapter.read(dir + "/sources.js"))(mod, mod.exports, require);
    this.sources = new mod.exports(this, dir);
    await this.sources.load();
  }

  // PDF++ cu auto-copy + auto-paste: lipește în notă doar o evidențiere nouă (text selectat cu o culoare).
  // Un clic pe o evidențiere existentă sau o opțiune din meniul ei (ex. Delete) nu mai adaugă nimic în notă,
  // iar o selecție se lipește o singură dată (PDF++ poate apela copierea de mai multe ori la același clic).
  guardPdfHighlights() {
    const st = { up: false, sel: false, used: false };
    const onUp = e => {
      let txt = "";
      try { txt = String((e.view || window).getSelection() || "").trim(); } catch (err) {}
      st.up = true; st.sel = txt.length > 0; st.used = false;
      setTimeout(() => { st.up = false; }, 0);
    };
    const listen = win => { try { this.registerDomEvent(win, "pointerup", onUp, true); } catch (err) {} };
    listen(window);
    this.registerEvent(this.app.workspace.on("window-open", w => listen(w.win)));
    const patch = () => {
      const cmds = this.app.plugins.plugins["pdf-plus"]?.lib?.commands;
      if (!cmds || typeof cmds.copyLink !== "function" || cmds.copyLink.__texere) return;
      const orig = cmds.copyLink;
      const wrapped = function (checking, ...rest) {
        if (st.up && !checking) {
          if (!st.sel || st.used) return true;   // fără text selectat sau deja lipit: nu face nimic
          st.used = true;
        }
        return orig.call(this, checking, ...rest);
      };
      wrapped.__texere = true;
      cmds.copyLink = wrapped;
    };
    patch();
    this.registerInterval(window.setInterval(patch, 5000));   // și după ce PDF++ e repornit sau actualizat
  }

  // Ștergerea evidențierilor, în ambele sensuri:
  // - ștergi evidențierea din PDF (meniul ei → Delete) → dispare și rândul din notă;
  // - ștergi rândul din notă → evidențierea dispare și din PDF, dacă nicio altă notă nu mai trimite la ea
  //   (imediat ce rândul dispare din editor).
  syncHighlightDeletes() {
    const mc = this.app.metadataCache, vault = this.app.vault;
    const WAIT = 250;   // aproape instant (doar cât să grupeze tastele apăsate rapid)
    // fiecare PDF are un număr al lui, care nu se schimbă când îl redenumești sau îl muți: o evidențiere rămâne aceeași
    // (înainte, cheia era calea PDF-ului, iar la redenumire linkurile „vechi” păreau șterse → evidențierile se ștergeau și se refăceau)
    const ids = new WeakMap(); let nid = 0;
    const pid = f => { if (!ids.has(f)) ids.set(f, ++nid); return ids.get(f); };
    let moved = 0;   // ultima redenumire/mutare: cât timp Obsidian actualizează linkurile, nu ștergem nimic
    const keysOf = (file, cache) => {
      const out = new Map();
      for (const l of (cache?.links || []).concat(cache?.embeds || [])) {
        const m = /^([^#]+\.pdf)#(.+)$/i.exec(l.link || ""); if (!m) continue;
        const q = new URLSearchParams(m[2]); const page = +q.get("page"), id = q.get("annotation");
        if (!page || !id) continue;
        const pdf = mc.getFirstLinkpathDest(m[1], file.path); if (!pdf) continue;
        out.set(`${pid(pdf)}|${page}|${id}`, { pdf, page, id });
      }
      return out;
    };
    // culorile din paleta PDF++ (numele lor sunt etichetele: claim, fact, agree…)
    const ppColors = () => this.app.plugins.plugins["pdf-plus"]?.settings?.colors || {};
    const colorNames = () => Object.keys(ppColors()).map(n => n.toLowerCase());
    const hexToRgb = h => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h || ""); return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null; };
    const nameForRgb = rgb => { for (const [n, h] of Object.entries(ppColors())) { const c = hexToRgb(h); if (c && Math.abs(c.r - rgb.r) < 3 && Math.abs(c.g - rgb.g) < 3 && Math.abs(c.b - rgb.b) < 3) return n.toLowerCase(); } return null; };
    const keysFromText = (file, text) => {
      const out = new Map(), re = /\[\[([^\]|#]+\.pdf)#([^\]|]+)/gi; let m;
      while ((m = re.exec(text))) {
        const q = new URLSearchParams(m[2]); const page = +q.get("page"), id = q.get("annotation");
        if (!page || !id) continue;
        const pdf = mc.getFirstLinkpathDest(m[1].trim(), file.path); if (!pdf) continue;
        const ls = text.lastIndexOf("\n", m.index) + 1, le = text.indexOf("\n", m.index);
        const line = text.slice(ls, le < 0 ? text.length : le);
        const tm = /(?:^|\s)#([\w-]+)/.exec(line.slice(0, m.index - ls)) || /(?:^|\s)#([\w-]+)/.exec(line);
        const tag = tm && colorNames().includes(tm[1].toLowerCase()) ? tm[1].toLowerCase() : null;
        out.set(`${pid(pdf)}|${page}|${id}`, { pdf, page, id, tag });
      }
      return out;
    };
    const known = new Map();   // nota → evidențierile la care trimite
    for (const f of vault.getMarkdownFiles()) { const k = keysOf(f, mc.getFileCache(f)); if (k.size) known.set(f.path, k); }
    // etichetele (#claim, #fact…) se citesc din textul notelor, ca o schimbare de etichetă să fie recunoscută de la început
    (async () => { for (const path of [...known.keys()]) { const f = vault.getAbstractFileByPath(path); if (!f) continue;
      try { const k = keysFromText(f, await vault.cachedRead(f)); const old = known.get(path); if (old && k.size >= old.size) known.set(path, k); } catch (e) {} } })();
    const gone = new Set();
    const skipColor = new Map();   // eticheta schimbată de noi după o schimbare de culoare în PDF (nu o mai trimitem înapoi)    // evidențieri deja șterse (nu le mai căutăm)
    const referenced = key => { for (const k of known.values()) if (k.has(key)) return true; return false; };
    const writeFile = () => this.app.plugins.plugins["pdf-plus"]?.lib?.highlight?.writeFile;
    const queues = new Map();   // ștergerile din același PDF se fac pe rând
    const enqueue = (path, fn) => { const p = (queues.get(path) || Promise.resolve()).then(fn, fn); queues.set(path, p.catch(() => {})); return p; };

    // nota → PDF (din editor, pe loc; și din cache, pentru modificări făcute în afara editorului)
    // Undo (Cmd + Z) în notă: evidențierea ștearsă revine în PDF. PDF++ scoate doar trimiterea din pagină,
    // obiectul evidențierii rămâne în fișier, așa că îl punem înapoi cu același ID (link-urile din note rămân valabile).
    const restore = a => enqueue(a.pdf.path, async () => {
      const io = writeFile()?.getPdfIo?.(); if (!io || typeof io.process !== "function") return;
      const m = /^(\d+)R(\d*)$/.exec(a.id); if (!m) return;
      await io.process(a.pdf, doc => {
        const page = doc.getPage(a.page - 1), Ref = page.ref.constructor, ref = Ref.of(+m[1], m[2] ? +m[2] : 0);
        if (!doc.context.lookup(ref)) return;
        const annots = page.node.Annots?.();
        if (annots && annots.asArray().some(x => x === ref || String(x) === String(ref))) return;
        page.node.addAnnot(ref);
      });
    });
    const compare = (file, now) => {
      const before = known.get(file.path) || new Map();
      // cât timp scrii eticheta (#c, #cl…) se păstrează ultima etichetă validă, ca schimbarea să fie recunoscută la final
      for (const [key, a] of now) { const b = before.get(key); if (!a.tag && b?.tag) a.tag = b.tag; }
      if (now.size) known.set(file.path, now); else known.delete(file.path);
      for (const [key, a] of now) {
        const b = before.get(key);
        if (b && a.tag && b.tag && a.tag !== b.tag) {
          if (skipColor.get(key) === a.tag) { skipColor.delete(key); continue; }
          const rgb = hexToRgb(Object.entries(ppColors()).find(([n]) => n.toLowerCase() === a.tag)?.[1]);
          const io = writeFile()?.getPdfIo?.();
          if (rgb && io?.setAnnotationColor) enqueue(a.pdf.path, () => io.setAnnotationColor(a.pdf, a.page, a.id, rgb)).catch(e => console.error("Texere: culoarea în PDF", e));
          continue;
        }
        if (before.has(key) || !gone.has(key)) continue;
        gone.delete(key);
        restore(a).catch(e => console.error("Texere: refacerea evidențierii", e));
      }
      for (const [key, a] of before) {
        if (now.has(key) || gone.has(key)) continue;
        const tryDelete = async () => {
          if (Date.now() - moved < 4000) { setTimeout(tryDelete, 1000); return; }   // o redenumire în curs: verificăm din nou după ce linkurile s-au actualizat
          if (gone.has(key) || referenced(key)) return;
          const wf = writeFile(); if (!wf) return;
          try {
            gone.add(key);
            await enqueue(a.pdf.path, () => (wf.deleteAnnotation.__orig || wf.deleteAnnotation).call(wf, a.pdf, a.page, a.id));
          } catch (e) { gone.delete(key); console.error("Texere: ștergerea din PDF", e); }
        };
        setTimeout(tryDelete, WAIT);
      }
    };
    this.registerEvent(mc.on("changed", (file, data, cache) => compare(file, typeof data === "string" ? keysFromText(file, data) : keysOf(file, cache))));
    this.registerEvent(this.app.workspace.on("editor-change", (editor, info) => { const f = info?.file; if (f && f.extension === "md") compare(f, keysFromText(f, editor.getValue())); }));
    this.registerEvent(vault.on("rename", (f, old) => { moved = Date.now(); if (known.has(old)) { known.set(f.path, known.get(old)); known.delete(old); } }));
    // o notă ștearsă întreagă nu șterge evidențierile din PDF (doar rândurile șterse le șterg)
    this.registerEvent(vault.on("delete", f => known.delete(f.path)));

    // PDF → nota
    const removeLines = async (pdf, page, id) => {
      const key = `${pid(pdf)}|${page}|${id}`; gone.add(key);
      const re = new RegExp(`annotation=${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w])`);
      for (const [path, k] of [...known]) {
        if (!k.has(key)) continue;
        const f = vault.getAbstractFileByPath(path); if (!f) continue;
        await vault.process(f, text => {
          const L = text.split("\n"), out = [];
          for (let i = 0; i < L.length; i++) {
            const line = L[i];
            if (re.test(line) && line.includes(`page=${page}`) && line.includes(pdf.name)) {
              if (/^\s*>/.test(line)) {             // într-un callout: scoate tot blocul
                while (out.length && /^\s*>/.test(out[out.length - 1])) out.pop();
                while (i + 1 < L.length && /^\s*>/.test(L[i + 1])) i++;
              }
              if (out.length && out[out.length - 1].trim() === "" && (i + 1 >= L.length || L[i + 1].trim() === "")) out.pop();
              continue;
            }
            out.push(line);
          }
          return out.join("\n");
        });
      }
    };
    const patch = () => {
      const wf = writeFile();
      if (!wf || typeof wf.deleteAnnotation !== "function" || wf.deleteAnnotation.__texere) return;
      const orig = wf.deleteAnnotation;
      const wrapped = async function (file, page, id, ...rest) {
        const r = await orig.call(this, file, page, id, ...rest);
        try { if (file && page && id) await removeLines(file, +page, String(id)); } catch (e) { console.error("Texere: ștergerea din notă", e); }
        return r;
      };
      wrapped.__texere = true; wrapped.__orig = orig;
      wf.deleteAnnotation = wrapped;
    };
    patch();
    this.registerInterval(window.setInterval(patch, 5000));

    // culoarea schimbată în PDF (meniul evidențierii → Edit) → eticheta din notă se schimbă la fel
    const retag = async (sourcePath, rgb, annotId) => {
      const name = nameForRgb(rgb); if (!name) return;
      const f = vault.getAbstractFileByPath(sourcePath); if (!f) return;
      const k = known.get(sourcePath) || new Map();
      await vault.process(f, text => text.split("\n").map(line => {
        for (const [key, a] of k) {
          if (a.id !== annotId) continue;
          if (!new RegExp(`annotation=${a.id}(?![\\w])`).test(line) || !line.includes(a.pdf.name)) continue;
          const t = /(^|\s)#([\w-]+)/.exec(line);
          if (!t || !colorNames().includes(t[2].toLowerCase()) || t[2].toLowerCase() === name) return line;
          skipColor.set(key, name);
          return line.slice(0, t.index) + t[1] + "#" + name + line.slice(t.index + t[0].length);
        }
        return line;
      }).join("\n"));
    };
    const patchColor = () => {
      const lu = this.app.plugins.plugins["pdf-plus"]?.lib?.composer?.linkUpdater;
      if (!lu || typeof lu.updateLinkColor !== "function" || lu.updateLinkColor.__texere) return;
      const orig = lu.updateLinkColor;
      const wrapped = async function (refCache, sourcePath, color, ...rest) {
        const r = await orig.call(this, refCache, sourcePath, color, ...rest);
        try {
          const link = String(refCache?.link || refCache?.original || ""), am = /annotation=([^&\]|]+)/.exec(link);
          if (color?.type === "rgb" && color.rgb && sourcePath && am) await retag(sourcePath, color.rgb, am[1]);
        } catch (e) { console.error("Texere: eticheta din notă", e); }
        return r;
      };
      wrapped.__texere = true; lu.updateLinkColor = wrapped;
    };
    patchColor();
    this.registerInterval(window.setInterval(patchColor, 5000));
  }

  // Când PDF++ scrie o evidențiere în PDF, Obsidian redeschide tot PDF-ul (view.onModify → onLoadFile).
  // Pentru modificările făcute din Obsidian, redesenăm doar paginile vizibile, din fișierul nou citit în fundal;
  // poziția și celelalte pagini rămân neatinse. Dacă ceva nu merge, revine la reîncărcarea obișnuită.
  quietPdfReload() {
    const app = this.app, silent = new Map();
    const isOpen = f => app.workspace.getLeavesOfType("pdf").some(l => l.view?.file === f);
    const vault = app.vault, origMB = vault.modifyBinary;
    if (!origMB.__texere) {
      const mb = function (file, data, ...rest) {
        if (file?.extension === "pdf" && isOpen(file)) silent.set(file.path, Date.now());
        return origMB.call(this, file, data, ...rest);
      };
      mb.__texere = true; vault.modifyBinary = mb;
      this.register(() => { if (vault.modifyBinary === mb) vault.modifyBinary = origMB; });
    }
    const KEYS = ["cMapUrl", "cMapPacked", "standardFontDataUrl", "wasmUrl", "iccUrl", "useSystemFonts", "isEvalSupported", "disableFontFace", "fontExtraProperties", "enableXfa"];
    const refresh = async view => {
      const pv = view.viewer?.child?.pdfViewer?.pdfViewer;
      if (!pv || !pv.pdfDocument || !window.pdfjsLib || typeof pv._getVisiblePages !== "function") throw new Error("no viewer");
      const data = new Uint8Array(await vault.readBinary(view.file));
      const base = pv.pdfDocument._transport?._params || {}, params = { data };
      for (const k of KEYS) if (base[k] !== undefined) params[k] = base[k];
      const doc = await window.pdfjsLib.getDocument(params).promise;
      const vis = pv._getVisiblePages().views || [];
      if (!vis.length) throw new Error("no visible pages");
      for (const { id, view: pageView } of vis) {
        if (!pageView || typeof pageView.setPdfPage !== "function") throw new Error("no page view");
        const page = await doc.getPage(id);
        // o „fotografie” a paginii vechi stă deasupra până când pagina nouă e complet desenată, apoi dispare
        // în același cadru: ochiul nu vede nicio schimbare în afară de evidențierea nouă
        // „fotografia” paginii: toate canvas-urile ei (PDF.js 5 desenează la zoom mare o imagine de bază
        // plus o imagine de detaliu, mai clară, pentru zona vizibilă), fiecare exact în locul ei
        const div = pageView.div, cs = getComputedStyle(div);
        const bl = parseFloat(cs.borderLeftWidth) || 0, bt = parseFloat(cs.borderTopWidth) || 0, d = div.getBoundingClientRect();
        const snaps = [];
        for (const old of div.querySelectorAll("canvas")) {
          if (!old.width || !old.height || old.hidden || getComputedStyle(old).display === "none") continue;
          const r = old.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
          const snap = document.createElement("canvas");
          snap.width = old.width; snap.height = old.height;
          try { snap.getContext("2d").drawImage(old, 0, 0); } catch (e) { continue; }
          snap.style.cssText = `position:absolute;left:${r.left - d.left - bl}px;top:${r.top - d.top - bt}px;width:${r.width}px;height:${r.height}px;z-index:10;pointer-events:none`;
          snaps.push(snap);
        }
        if (snaps.length) {
          let done = false;
          const drop = () => { if (done) return; done = true; try { pv.eventBus?.off?.("pagerendered", onRendered); } catch (e) {} requestAnimationFrame(() => requestAnimationFrame(() => { snaps.forEach(x => x.remove()); const ov = div.__texereOverlays || []; ov.forEach(o => o.remove()); div.__texereOverlays = []; div.classList.remove("texere-nosel"); })); };
          // la zoom mare vin două desene (imaginea de bază și cea de detaliu): așteptăm câte canvas-uri avea pagina
          let seen = 0;
          const onRendered = ev => { if (ev?.pageNumber === id) { seen++; if (seen >= snaps.length) drop(); } };
          try { pv.eventBus?.on?.("pagerendered", onRendered); } catch (e) {}
          setTimeout(drop, 2500);
        }
        pageView.setPdfPage(page);
        try { pageView.reset({ keepCanvasWrapper: true, keepTextLayer: true }); } catch (e) { pageView.reset(); }
        const overlays = div.__texereOverlays || [];
        overlays.forEach(o => div.appendChild(o));
        snaps.forEach(x => div.appendChild(x));   // după reset(), altfel reset() le scoate din pagină
      }
      if (typeof pv.update === "function") pv.update();
      if (typeof pv.forceRendering === "function") pv.forceRendering();
      // documentele temporare care nu mai sunt folosite de nicio pagină se închid (memorie)
      const docs = (view.__texereDocs = (view.__texereDocs || []).concat(doc));
      const pages = pv._pages || [];
      view.__texereDocs = docs.filter(d => {
        if (d === doc || pages.some(p => p.pdfPage?._transport === d._transport)) return true;
        try { d.destroy(); } catch (e) {}
        return false;
      });
    };
    const patch = () => {
      const leaf = app.workspace.getLeavesOfType("pdf")[0]; if (!leaf) return;
      const proto = Object.getPrototypeOf(leaf.view);
      if (!proto || typeof proto.onModify !== "function" || proto.onModify.__texere) return;
      const orig = proto.onModify;
      const wrapped = function (file, ...rest) {
        const t = file && silent.get(file.path);
        if (file === this.file && t && Date.now() - t < 10000) {
          setTimeout(() => silent.delete(file.path), 1500);   // toate ferestrele deschise pe același PDF
          refresh(this).catch(e => { console.warn("Texere: reîncărcare completă a PDF-ului", e); orig.call(this, file, ...rest); });
          return;
        }
        return orig.call(this, file, ...rest);
      };
      wrapped.__texere = true; proto.onModify = wrapped; this.__pdfOnModify = { orig, wrapped };
      this.register(() => { if (proto.onModify === wrapped) proto.onModify = orig; });
    };
    // ferestrele PDF deschise înainte de patch și-au înregistrat deja funcția veche: o înlocuim și acolo
    const relink = () => {
      const m = this.__pdfOnModify; if (!m) return;
      const store = vault._ || vault._events || {};
      for (const r of store.modify || []) if (r && r.fn === m.orig) r.fn = m.wrapped;
    };
    patch(); relink();
    this.registerEvent(app.workspace.on("layout-change", () => { patch(); relink(); }));
    this.registerInterval(window.setInterval(() => { patch(); relink(); }, 3000));
  }
};
