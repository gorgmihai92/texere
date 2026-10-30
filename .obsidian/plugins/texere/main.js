/* Texere — versiune 2.9.0 (2026-10-31)
 * 1. Imediat după „Trust author and enable plugins”, pornește scriptul „Support/Templates/New laptop setup”
 *    dacă vault-ul nu e configurat pe acest laptop (sau a fost mutat în alt folder).
 * 2. Activează scripturile de pornire din „Support/Admin/Scripts” (butonul Ajutor, închiderea capitolelor ghidului).
 * 3. PDF++: un clic pe o evidențiere existentă nu o mai adaugă în notă.
 * 4. Ștergerea unei evidențieri din PDF o șterge din notă, și invers.
 * 5. PDF-ul nu se mai reîncarcă la fiecare evidențiere: se redesenează doar paginile vizibile.
 * 6. Citări din mers: scrii @ și alegi sursa din bibliografie.
 * 7. Citările [@citekey, p. 61] se afișează în stilul ales (APA, Chicago, MLA…): proprietatea csl a notei sau stilul implicit;
 *    butonul din bara de jos schimbă stilul. Exportul Pandoc folosește același stil.
 * 8. Notele surselor au un panou de statistici: scite (susțin / contrazic / menționează), OpenAlex, Semantic Scholar și evidențierile tale.
 * 9. Adaugă comenzile „Texere – The Researcher's Vault: Setup” (fereastra urmează limba aleasă).
 */
const { Plugin, Notice, TFile, EditorSuggest } = require("obsidian");

const CONFIG = "Support/Templates/New laptop setup.md";
const STARTS = ["Support/Admin/Scripts/Guide folding.md", "Support/Admin/Scripts/Help.md"];
const FLAG = "texere-setup";
const LANG = "texere-lang";   // limba aleasă în fereastra de configurare și în Ajutor (ro / en)
const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = class Texere extends Plugin {
  async onload() {
    this.addCommand({ id: "setup", name: "Setup", callback: () => this.runConfig(false) });
    this.app.workspace.onLayoutReady(() => { this.start().catch(e => console.error("Texere:", e)); });
    this.guardPdfHighlights();
    this.registerEditorSuggest(new CiteSuggest(this));   // scrii @ → alegi sursa → [@citekey]
    this.citations().catch(e => console.error("Texere: citările", e));   // [@citekey, p. 61] → (Autor, an, p. 61) în stilul ales
    // (scos: fragmentul pentru „overrides” din Page preview reseta setările PDF++ la deschiderea Settings)
    this.app.workspace.onLayoutReady(() => this.quietPdfReload());
    this.app.workspace.onLayoutReady(() => this.syncHighlightDeletes());
    this.app.workspace.onLayoutReady(() => this.statsPanel().catch(e => console.error("Texere: statistici", e)));   // panoul de statistici din notele surselor
  }

  // PDF++ cu auto-copy + auto-paste: lipește în notă doar o evidențiere nouă (text selectat cu o culoare).
  // Un clic pe o evidențiere existentă sau o opțiune din meniul ei (ex. Delete) nu mai adaugă nimic în notă,
  // iar o selecție se lipește o singură dată (PDF++ poate apela copierea de mai multe ori la același clic).
  guardPdfHighlights() {
    // evidențierea apare pe loc, desenată peste text în culoarea aleasă, până când PDF-ul salvat e redesenat
    const previewHighlight = win => {
      const lib = this.app.plugins.plugins["pdf-plus"]?.lib, pal = lib?.getColorPaletteAssociatedWithSelection?.();
      if (!pal || !pal.writeFile || !pal.selectedColorName) return;
      const ppSet = this.app.plugins.plugins["pdf-plus"].settings, hex = ppSet.colors?.[pal.selectedColorName]; if (!hex) return;
      const op = typeof ppSet.writeHighlightToFileOpacity === "number" ? ppSet.writeHighlightToFileOpacity : 0.2;   // aceeași transparență ca evidențierea scrisă în PDF
      const sel = win.getSelection(); if (!sel || !sel.rangeCount) return;
      const range = sel.getRangeAt(0), node = range.startContainer, el = node.nodeType === 1 ? node : node.parentElement;
      const page = el?.closest?.(".page"); if (!page) return;
      const d = page.getBoundingClientRect(), bl = page.clientLeft || 0, bt = page.clientTop || 0;
      const layer = page.ownerDocument.createElement("div");
      layer.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:20";
      for (const r of range.getClientRects()) {
        if (r.width < 1 || r.height < 1) continue;
        const b = page.ownerDocument.createElement("div");
        b.style.cssText = `position:absolute;left:${r.left - d.left - bl}px;top:${r.top - d.top - bt}px;width:${r.width}px;height:${r.height}px;background:${hex};opacity:${op}`;
        layer.appendChild(b);
      }
      page.appendChild(layer);
      // selecția (mov) se ascunde cât timp e afișată evidențierea provizorie, ca să nu se amestece culorile
      const doc = page.ownerDocument;
      if (!doc.getElementById("texere-nosel")) { const st = doc.createElement("style"); st.id = "texere-nosel"; st.textContent = ".texere-nosel ::selection{background:transparent!important}"; doc.head.appendChild(st); }
      page.classList.add("texere-nosel"); setTimeout(() => page.classList.remove("texere-nosel"), 5000);
      (page.__texereOverlays = page.__texereOverlays || []).push(layer);
      setTimeout(() => { layer.remove(); page.__texereOverlays = (page.__texereOverlays || []).filter(x => x !== layer); }, 5000);
    };
    const st = { up: false, sel: false, used: false };
    const onUp = e => {
      let txt = "";
      try { txt = String((e.view || window).getSelection() || "").trim(); } catch (err) {}
      st.up = true; st.sel = txt.length > 0; st.used = false; st.win = e.view || window;
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
          // try { previewHighlight(st.win); } catch (e) {}   // oprit temporar (evidențierea provizorie)
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
    const keysOf = (file, cache) => {
      const out = new Map();
      for (const l of (cache?.links || []).concat(cache?.embeds || [])) {
        const m = /^([^#]+\.pdf)#(.+)$/i.exec(l.link || ""); if (!m) continue;
        const q = new URLSearchParams(m[2]); const page = +q.get("page"), id = q.get("annotation");
        if (!page || !id) continue;
        const pdf = mc.getFirstLinkpathDest(m[1], file.path); if (!pdf) continue;
        out.set(`${pdf.path}|${page}|${id}`, { pdf, page, id });
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
        out.set(`${pdf.path}|${page}|${id}`, { pdf, page, id, tag });
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
        setTimeout(async () => {
          if (gone.has(key) || referenced(key)) return;
          const wf = writeFile(); if (!wf) return;
          try {
            gone.add(key);
            await enqueue(a.pdf.path, () => (wf.deleteAnnotation.__orig || wf.deleteAnnotation).call(wf, a.pdf, a.page, a.id));
          } catch (e) { gone.delete(key); console.error("Texere: ștergerea din PDF", e); }
        }, WAIT);
      }
    };
    this.registerEvent(mc.on("changed", (file, data, cache) => compare(file, typeof data === "string" ? keysFromText(file, data) : keysOf(file, cache))));
    this.registerEvent(this.app.workspace.on("editor-change", (editor, info) => { const f = info?.file; if (f && f.extension === "md") compare(f, keysFromText(f, editor.getValue())); }));
    this.registerEvent(vault.on("rename", (f, old) => { if (known.has(old)) { known.set(f.path, known.get(old)); known.delete(old); } }));
    // o notă ștearsă întreagă nu șterge evidențierile din PDF (doar rândurile șterse le șterg)
    this.registerEvent(vault.on("delete", f => known.delete(f.path)));

    // PDF → nota
    const removeLines = async (pdf, page, id) => {
      const key = `${pdf.path}|${page}|${id}`; gone.add(key);
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
    const LOG = "Support/Admin/pdf-log.txt";   // TEMPORAR: diagnostic
    const log = (...a) => { try { app.vault.adapter.append(LOG, new Date().toISOString().slice(11, 23) + " " + a.map(x => typeof x === "string" ? x : JSON.stringify(x)).join(" ") + "\n"); } catch (e) {} };
    this.__log = log; log("start");
    const isOpen = f => app.workspace.getLeavesOfType("pdf").some(l => l.view?.file === f);
    const vault = app.vault, origMB = vault.modifyBinary;
    if (!origMB.__texere) {
      const mb = function (file, data, ...rest) {
        if (file?.extension === "pdf") log("modifyBinary", file.path, "open:", isOpen(file), (new Error().stack || "").split("\n").slice(2, 6).join(" | "));
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
        this.__log?.("snapshot", id, "canvases:", snaps.length);
        if (snaps.length) {
          let done = false;
          const drop = () => { if (done) return; done = true; try { pv.eventBus?.off?.("pagerendered", onRendered); } catch (e) {} requestAnimationFrame(() => requestAnimationFrame(() => { snaps.forEach(x => x.remove()); const ov = div.__texereOverlays || []; ov.forEach(o => o.remove()); div.__texereOverlays = []; div.classList.remove("texere-nosel"); })); };
          const t0 = performance.now();
          // la zoom mare vin două desene (imaginea de bază și cea de detaliu): așteptăm câte canvas-uri avea pagina
          let seen = 0;
          const onRendered = ev => { if (ev?.pageNumber === id) { seen++; this.__log?.("pagerendered", id, Math.round(performance.now() - t0) + "ms", "detail:", !!ev.isDetailView, seen + "/" + snaps.length); if (seen >= snaps.length) drop(); } };
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
        if (file?.extension === "pdf") log("onModify", file.path, "silent:", !!t, "same:", file === this.file);
        if (file === this.file && t && Date.now() - t < 10000) {
          setTimeout(() => silent.delete(file.path), 1500);   // toate ferestrele deschise pe același PDF
          const sc = this.viewer?.child?.pdfViewer?.pdfViewer?.container, top0 = sc?.scrollTop;
          refresh(this).then(() => { log("refresh ok", "scroll before:", top0); setTimeout(() => log("scroll after 600ms:", sc?.scrollTop, "pdf.js:", window.pdfjsLib?.version), 600); }).catch(e => { log("refresh FAILED", String(e && e.stack || e)); console.warn("Texere: reîncărcare completă a PDF-ului", e); orig.call(this, file, ...rest); });
          return;
        }
        return orig.call(this, file, ...rest);
      };
      wrapped.__texere = true; proto.onModify = wrapped; this.__pdfOnModify = { orig, wrapped };
      log("patched proto", String(orig).slice(0, 80));
      this.register(() => { if (proto.onModify === wrapped) proto.onModify = orig; });
    };
    // ferestrele PDF deschise înainte de patch și-au înregistrat deja funcția veche: o înlocuim și acolo
    const relink = () => {
      const m = this.__pdfOnModify; if (!m) return;
      const store = vault._ || vault._events || {};
      let n = 0; for (const r of store.modify || []) if (r && r.fn === m.orig) { r.fn = m.wrapped; n++; }
      if (n || !this.__relinkLogged) { this.__relinkLogged = true; log("relink", n, "listeners:", (store.modify || []).length, "store:", Object.keys(vault).filter(k => k.startsWith("_"))); }
      if (!this.__listenersLogged) { this.__listenersLogged = true; (store.modify || []).forEach((r, i) => log("L" + i, String(r.fn).slice(0, 300).replace(/\s+/g, " "))); 
        const leaf = app.workspace.getLeavesOfType("pdf")[0];
        if (leaf) { const v = leaf.view, ch = v.viewer?.child;
          for (const [obj, name] of [[v, "view.onLoadFile"], [v.viewer, "viewer.loadFile"], [ch, "child.loadFile"], [ch?.pdfViewer, "pdfViewer.loadFile"], [ch?.pdfViewer?.pdfViewer, "pdfjs.setDocument"]]) {
            const k = name.split(".")[1]; if (!obj || typeof obj[k] !== "function" || obj[k].__tlog) continue;
            const o = obj[k]; const w = function (...a) { log("CALL " + name, (new Error().stack || "").split("\n").slice(2, 9).join(" | ").replace(/\s+/g, " ")); return o.apply(this, a); }; w.__tlog = true; obj[k] = w; } } }
    };
    patch(); relink();
    this.registerEvent(app.workspace.on("layout-change", () => { patch(); relink(); }));
    this.registerInterval(window.setInterval(() => { patch(); relink(); }, 3000));
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
    if (!T || !(f instanceof TFile)) { new Notice(en ? "I can't find the setup script (Support/Templates/New laptop setup)." : "Nu găsesc scriptul de configurare (Support/Templates/New laptop setup)."); return; }
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

// ---------- Citări din mers: scrii „@” (sau „[@”) și alegi sursa din bibliografie ----------
class CiteSuggest extends EditorSuggest {
  constructor(plugin) { super(plugin.app); this.plugin = plugin; this.items = null; this.mtime = 0; this.limit = 30; }
  bibPath() { return this.app.plugins.plugins["biblib"]?.settings?.bibliographyJsonPath || "Support/Admin/biblib/bibliography.json"; }
  async load() {
    const f = this.app.vault.getAbstractFileByPath(this.bibPath());
    if (!f) return (this.items = []);
    if (this.items && f.stat.mtime === this.mtime) return this.items;
    try {
      const data = JSON.parse(await this.app.vault.cachedRead(f)); this.mtime = f.stat.mtime;
      this.items = data.map(e => {
        const au = (e.author || e.editor || []).map(a => a.family || a.literal || "").filter(Boolean);
        const year = e.issued?.["date-parts"]?.[0]?.[0] || "";
        const who = au.length > 2 ? au[0] + " et al." : au.join(" & ");
        return { key: e.id, who, year: String(year), title: e.title || "", hay: [e.id, au.join(" "), year, e.title].join(" ").toLowerCase() };
      });
    } catch (err) { this.items = []; }
    return this.items;
  }
  onTrigger(cursor, editor) {
    const line = editor.getLine(cursor.line).slice(0, cursor.ch);
    const m = /(^|[\s\[;(])@([\w:.\-]*)$/.exec(line);
    if (!m) return null;
    // citekey deja complet (ex. imediat după ce l-ai ales): lista nu se mai deschide, poți scrie mai departe
    if (m[2] && (this.items || []).some(it => it.key === m[2])) return null;
    this.load();   // se încarcă în fundal; lista apare la tasta următoare dacă nu e gata
    return { start: { line: cursor.line, ch: cursor.ch - m[2].length - 1 }, end: cursor, query: m[2] };
  }
  async getSuggestions(ctx) {
    const items = await this.load(), q = ctx.query.toLowerCase().split(/\s+/).filter(Boolean);
    return items.filter(it => q.every(w => it.hay.includes(w))).slice(0, 30);
  }
  renderSuggestion(it, el) {
    el.createDiv({ text: `${it.who || it.key}${it.year ? " (" + it.year + ")" : ""}` }).style.fontWeight = "500";
    const d = el.createDiv({ text: `${it.title}` }); d.style.cssText = "font-size:0.85em;color:var(--text-muted)";
    const k = el.createDiv({ text: "@" + it.key }); k.style.cssText = "font-size:0.8em;color:var(--text-faint);font-family:var(--font-monospace)";
  }
  selectSuggestion(it) {
    const ctx = this.context; if (!ctx) return;
    const ed = ctx.editor, line = ed.getLine(ctx.start.line);
    const inBracket = ctx.start.ch > 0 && /[\[;]\s*$/.test(line.slice(0, ctx.start.ch));
    const after = line.slice(ctx.end.ch);
    // după alegere, cursorul trece după „]” și urmează un spațiu, ca să scrii mai departe
    const closes = /^\s*\]/.test(after);
    let text = inBracket ? "@" + it.key + (closes ? "" : "]") : "[@" + it.key + "]";
    ed.replaceRange(text, ctx.start, ctx.end);
    let ch = ctx.start.ch + text.length;
    if (closes) ch += after.indexOf("]") + 1;
    const rest = ed.getLine(ctx.start.line).slice(ch);
    if (!rest.startsWith(" ")) ed.replaceRange(" ", { line: ctx.start.line, ch });
    ed.setCursor({ line: ctx.start.line, ch: ch + 1 });
  }
}

// ---------- Stilul citărilor: [@citekey, p. 61] se afișează ca în stilul ales (APA, Chicago, MLA…) ----------
// Textul notei rămâne [@citekey, p. 61] (formatul Pandoc); se schimbă doar afișarea. Cu cursorul pe citare apare textul sursă.
// Stilul: proprietatea „csl” a notei (ex. csl: chicago-author-date), altfel stilul implicit al vault-ului.
// Același „csl” îl folosește Pandoc la export. Orice fișier .csl pus în folderul bibliografiei apare în listă.
const CITE_LABELS = {
  "apa": "APA", "chicago-author-date": "Chicago (author-date)", "chicago-notes-bibliography": "Chicago (notes)",
  "modern-language-association": "MLA", "harvard-cite-them-right": "Harvard", "ieee": "IEEE",
};
const CITE_ORDER = Object.keys(CITE_LABELS);
const CITE_KEY = "[\\w](?:[\\w:.#$%&\\-+?<>~/]*[\\w])?";
const LOC_TERMS = {
  p: "page", pp: "page", pg: "page", pag: "page", page: "page", pages: "page",
  ch: "chapter", chap: "chapter", chapter: "chapter", chapters: "chapter", cap: "chapter",
  sec: "section", section: "section", par: "paragraph", para: "paragraph", paragraph: "paragraph",
  vol: "volume", volume: "volume", fig: "figure", figure: "figure", n: "note", nn: "note", note: "note",
  l: "line", ll: "line", line: "line", bk: "book", book: "book", pt: "part", part: "part", col: "column",
  v: "verse", vv: "verse", fol: "folio", op: "opus", no: "issue",
};

// „p. 61”, „pp. 3–5”, „61”, „chap. 2, see also” → { label, locator, suffix }
function parseLocator(s) {
  let r = (s || "").trim().replace(/^,\s*/, ""); if (!r) return {};
  const NUM = "(?:[\\divxlcdm]+[a-z]?)(?:\\s*[-–—,&]\\s*[\\divxlcdm]+[a-z]?)*";
  let m = new RegExp("^([A-Za-z]+)\\.?\\s*(" + NUM + ")(.*)$", "i").exec(r), out = {};
  if (m && LOC_TERMS[m[1].toLowerCase()]) { out.label = LOC_TERMS[m[1].toLowerCase()]; out.locator = m[2]; r = m[3]; }
  else if ((m = /^(\d+[a-z]?(?:\s*[-–—,&]\s*\d+[a-z]?)*)(.*)$/i.exec(r))) { out.label = "page"; out.locator = m[1]; r = m[2]; }
  r = r.trim();
  if (r) out.suffix = /^[,;.]/.test(r) ? r : ", " + r;
  return out;
}
// interiorul unei paranteze [ … ]: „see @a, p. 3; -@b” → elementele citării (null dacă nu e o citare)
function parseCluster(body) {
  const out = [];
  for (const part of body.split(";")) {
    const m = new RegExp("^([^@]*?)(-?)@(" + CITE_KEY + ")(.*)$", "s").exec(part);
    if (!m) return null;
    const it = { id: m[3] };
    if (m[2]) it["suppress-author"] = true;
    if (m[1].trim()) it.prefix = m[1].trim() + " ";
    const loc = parseLocator(m[4]);
    if (loc.locator) { it.locator = loc.locator; it.label = loc.label; }
    if (loc.suffix) it.suffix = loc.suffix;
    out.push(it);
  }
  return out.length ? out : null;
}
// toate citările dintr-un text, în ordine: [@a, p. 1] (kind "c") și @a [p. 1] în frază (kind "n")
function scanCites(text) {
  const out = [], RE = /\[([^\[\]\n]*?@[^\[\]\n]*?)\](?![(\[:])/g; let m;
  while ((m = RE.exec(text))) {
    const from = m.index; if (from > 0 && /[\[!\]]/.test(text[from - 1])) continue;
    const items = parseCluster(m[1]); if (!items) continue;
    const to = from + m[0].length, dot = text.slice(to, to + 5) === " · [[";
    out.push({ kind: "c", from, to, end: dot ? to + 3 : to, items });
  }
  const inC = p => out.some(c => p >= c.from && p < c.to);
  const RN = new RegExp("(^|[\\s(\"“„'])@(" + CITE_KEY + ")(?:\\s\\[([^\\[\\]\\n@]*)\\](?![(\\[:]))?", "g");
  const narr = [];
  while ((m = RN.exec(text))) {
    const from = m.index + m[1].length; if (inC(from)) continue;
    const it = { id: m[2] }, loc = parseLocator(m[3]);
    if (loc.locator) { it.locator = loc.locator; it.label = loc.label; }
    if (loc.suffix) it.suffix = loc.suffix;
    const to = m.index + m[0].length; narr.push({ kind: "n", from, to, end: to, items: [it] });
  }
  return out.concat(narr).sort((a, b) => a.from - b.from);
}
// proprietățile csl și lang din antetul notei (citite direct din text, ca afișarea să se schimbe pe loc)
function citeFm(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text), o = { end: 0 };
  if (!m) return o; o.end = m[0].length;
  for (const k of ["csl", "lang"]) {
    const r = new RegExp("^" + k + ":[ \\t]*[\"']?([^\"'\\n#]*?)[\"']?[ \\t]*$", "m").exec(m[1]);
    if (r && r[1]) o[k] = r[1].trim();
  }
  return o;
}
const stripTags = h => String(h || "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#38;/g, "&").replace(/&quot;/g, '"');

class CiteEngine {
  constructor(plugin) {
    this.plugin = plugin; this.app = plugin.app; this.ready = false;
    this.CSL = null; this.items = {}; this.raw = {}; this.styles = new Map(); this.locales = {};
    this.engines = new Map(); this.cache = new Map(); this.scanMemo = { text: null, res: null };
  }
  bibPath() { return this.app.plugins.plugins["biblib"]?.settings?.bibliographyJsonPath || "Support/Admin/biblib/bibliography.json"; }
  styleDir() { const p = this.bibPath(); return p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : ""; }
  async load() {
    const ad = this.app.vault.adapter, dir = this.plugin.manifest.dir;
    if (!this.CSL) {
      const code = await ad.read(dir + "/citeproc.js"), mod = { exports: {} };
      new Function("module", "exports", code)(mod, mod.exports);
      this.CSL = mod.exports;
    }
    for (const l of ["en-US", "ro-RO"]) { try { this.locales[l] = await ad.read(`${dir}/locales/locales-${l}.xml`); } catch (e) {} }
    await this.loadBib(); await this.loadStyles();
    this.ready = true;
  }
  async loadBib() {
    this.items = {}; this.raw = {};
    try {
      const data = JSON.parse(await this.app.vault.adapter.read(this.bibPath()));
      for (const e of data) {
        // biblib adaugă câmpuri proprii (liste de linkuri, etichete); citeproc vrea doar câmpurile CSL, cu numere ca text
        const o = {};
        for (const [k, v] of Object.entries(e)) {
          if (typeof v === "number") o[k] = String(v);
          else if (Array.isArray(v) && !/^(author|editor|translator|container-author|collection-editor|director|interviewer|recipient|reviewed-author|composer|illustrator)$/.test(k)) continue;
          else o[k] = v;
        }
        this.items[e.id] = o; this.raw[e.id] = e;
      }
    } catch (e) { console.error("Texere: bibliografia", e); }
    this.engines.clear(); this.cache.clear();
  }
  async loadStyles() {
    this.styles = new Map();
    const dir = this.styleDir(), f = this.app.vault.getAbstractFileByPath(dir || "/");
    const files = (f?.children || []).filter(x => x.extension === "csl");
    for (const x of files) {
      try {
        const xml = await this.app.vault.adapter.read(x.path);
        const title = (/<title>([^<]*)<\/title>/.exec(xml) || [])[1] || x.basename;
        const label = CITE_LABELS[x.basename] || title.replace(/\s*\d+(st|nd|rd|th)\s+edition/i, "").replace(/\s+/g, " ").trim();
        this.styles.set(x.basename, { id: x.basename, xml, title, label, note: /class="note"/.test(xml) });
      } catch (e) {}
    }
    this.engines.clear(); this.cache.clear();
  }
  list() {
    return [...this.styles.values()].sort((a, b) => {
      const i = CITE_ORDER.indexOf(a.id), j = CITE_ORDER.indexOf(b.id);
      return (i < 0 ? 99 : i) - (j < 0 ? 99 : j) || a.label.localeCompare(b.label);
    });
  }
  // „chicago-author-date”, „chicago-author-date.csl” sau o cale → id-ul stilului (null dacă nu există)
  styleId(v) { if (!v) return null; const id = String(v).trim().split(/[\\/]/).pop().replace(/\.csl$/i, ""); return this.styles.has(id) ? id : null; }
  defaultId() { return this.styleId(this.plugin.settings?.citationStyle) || (this.styles.has("apa") ? "apa" : this.list()[0]?.id) || null; }
  current(fm) { return this.styleId(fm?.csl) || this.defaultId(); }
  label(id) { return this.styles.get(id)?.label || id || "—"; }
  locale(lang) { return /^ro/i.test(lang || "") ? "ro-RO" : "en-US"; }
  scan(text) { if (this.scanMemo.text !== text) this.scanMemo = { text, res: scanCites(text) }; return this.scanMemo.res; }
  known(c) { return c.items.every(i => this.items[i.id]); }
  engine(style, lang, order) {
    const k = style + "|" + lang; let e = this.engines.get(k);
    if (!e) {
      const sys = {
        retrieveLocale: l => this.locales[l] || this.locales[/^ro/i.test(l) ? "ro-RO" : "en-US"] || this.locales["en-US"],
        retrieveItem: id => this.items[id],
      };
      e = new this.CSL.Engine(sys, this.styles.get(style).xml, lang);
      e.__ord = null; this.engines.set(k, e);
    }
    const ord = order.join("|");
    if (e.__ord !== ord) { e.updateItems(order.length ? order : Object.keys(this.items).slice(0, 1)); e.__ord = ord; }
    return e;
  }
  authors(id) {
    const a = (this.items[id]?.author || this.items[id]?.editor || []).map(x => x.family || x.literal || "").filter(Boolean);
    return a.length > 2 ? a[0] + " et al." : a.join(" & ") || id;
  }
  tip(c) {
    const en = this.app.loadLocalStorage(LANG) === "en";
    const lines = c.items.map(i => { const r = this.items[i.id]; const y = r?.issued?.["date-parts"]?.[0]?.[0] || ""; return `${this.authors(i.id)}${y ? " (" + y + ")" : ""}. ${r?.title || ""}`; });
    return lines.join("\n") + "\n" + (en ? "⌘/Ctrl + click: open the source note" : "⌘/Ctrl + clic: deschide nota sursei");
  }
  // o citare → { html, title } în stilul dat; n = numărul notei de subsol (pentru stilurile cu note)
  render(style, lang, order, c, n) {
    const key = [style, lang, order.join("|"), c.kind, JSON.stringify(c.items), n].join("§");
    if (this.cache.has(key)) return this.cache.get(key);
    if (this.cache.size > 3000) this.cache.clear();
    let res;
    try {
      const e = this.engine(style, lang, order), note = this.styles.get(style).note, tip = this.tip(c);
      if (c.kind === "c") {
        const html = e.makeCitationCluster(c.items);
        res = note ? { html: `<sup>${n}</sup>`, title: stripTags(html) + "\n\n" + tip, note } : { html, title: tip };
      } else {
        const it = c.items[0];
        let a = e.makeCitationCluster([{ id: it.id, "author-only": true }]);
        if (!stripTags(a).trim() || /NO_PRINTED_FORM/.test(a)) res = { html: e.makeCitationCluster([it]), title: tip };   // stiluri numerotate (IEEE): ca Pandoc, doar [1, p. 4]
        else if (note) res = { html: `${a}<sup>${n}</sup>`, title: stripTags(e.makeCitationCluster([it])) + "\n\n" + tip, note };
        else { const rest = e.makeCitationCluster([{ ...it, "suppress-author": true }]);   // MLA fără pagină: doar autorul
          res = { html: !stripTags(rest).trim() || /NO_PRINTED_FORM/.test(rest) ? a : a + " " + rest, title: tip }; }
      }
    } catch (err) { console.error("Texere: citarea", err); res = null; }
    this.cache.set(key, res); return res;
  }
  // ordinea surselor în notă (pentru stilurile numerotate, ex. IEEE) și numerele notelor de subsol
  plan(text, style) {
    const fm = citeFm(text), cites = this.scan(text).filter(c => c.from >= fm.end && this.known(c));
    const order = []; for (const c of cites) for (const i of c.items) if (!order.includes(i.id)) order.push(i.id);
    const nums = new Map(); let n = 0; if (this.styles.get(style)?.note) for (const c of cites) nums.set(c.from, ++n);
    return { fm, order, nums };
  }
}

function makeCiteWidget(plugin) {
  const { WidgetType } = require("@codemirror/view");
  return class CiteWidget extends WidgetType {
    constructor(r, ids, trail) { super(); this.r = r; this.ids = ids; this.trail = trail; }
    eq(o) { return o.r.html === this.r.html && o.r.title === this.r.title && o.trail === this.trail; }
    toDOM() { return plugin.citeEl(this.r, this.ids, this.trail); }
    ignoreEvent(e) { return e.type === "mousedown" && (e.metaKey || e.ctrlKey); }   // clic simplu: cursorul intră în citare
  };
}

const CiteStyleMixin = {
  async citations() {
    const { MarkdownView, Menu, setIcon, editorLivePreviewField } = require("obsidian");
    const { ViewPlugin, Decoration } = require("@codemirror/view");
    const { RangeSetBuilder, StateEffect } = require("@codemirror/state");
    let syntaxTree = null; try { syntaxTree = require("@codemirror/language").syntaxTree; } catch (e) {}
    const E = this.cite = new CiteEngine(this);
    const plugin = this, CiteWidget = makeCiteWidget(this);
    const refreshFx = this.citeRefreshFx = StateEffect.define();

    // aspect: citarea arată ca textul din jur; la trecerea cu mouse-ul se vede că e o citare
    const css = document.createElement("style"); css.id = "texere-cite-css";
    css.textContent = `.texere-cite{border-radius:3px;cursor:text}
.texere-cite:hover{background:var(--background-modifier-hover)}
.texere-cite sup{font-size:.72em;line-height:0;color:var(--text-accent);padding-left:1px}
.texere-cite-missing{text-decoration:underline wavy var(--text-error);text-decoration-thickness:1px;text-underline-offset:3px}
.status-bar-item.texere-cite-status{gap:4px;cursor:pointer}
.texere-cite-status svg{width:13px;height:13px}`;
    document.getElementById("texere-cite-css")?.remove(); document.head.appendChild(css);
    this.register(() => css.remove());

    const skipNode = (st, pos) => {
      if (!syntaxTree) return false;
      try { for (let n = syntaxTree(st).resolveInner(pos, 1); n; n = n.parent) if (/code|math|frontmatter|internal-link|url/i.test(n.name)) return true; } catch (e) {}
      return false;
    };
    const build = view => {
      const st = view.state;
      if (!E.ready || !st.field(editorLivePreviewField, false)) return Decoration.none;
      const text = st.doc.toString(), style0 = E.current(citeFm(text));
      if (!style0) return Decoration.none;
      const { fm, order, nums } = E.plan(text, style0), lang = E.locale(fm.lang);
      const b = new RangeSetBuilder(), sel = st.selection.ranges;
      for (const c of E.scan(text)) {
        if (c.from < fm.end || skipNode(st, c.from)) continue;
        if (!E.known(c)) {
          if (c.kind === "c") b.add(c.from, c.to, Decoration.mark({ class: "texere-cite-missing",
            attributes: { title: (this.app.loadLocalStorage(LANG) === "en" ? "Not in the bibliography: " : "Nu e în bibliografie: ") + c.items.filter(i => !E.items[i.id]).map(i => "@" + i.id).join(", ") } }));
          continue;
        }
        if (sel.some(r => r.from <= c.end && r.to >= c.from)) continue;   // cursorul e pe citare: se vede textul sursă
        const r = E.render(style0, lang, order, c, nums.get(c.from)); if (!r) continue;
        b.add(c.from, c.end, Decoration.replace({ widget: new CiteWidget(r, c.items.map(i => i.id), c.end > c.to) }));
      }
      return b.finish();
    };
    const safe = view => { try { return build(view); } catch (e) { console.error("Texere: afișarea citărilor", e); return Decoration.none; } };
    this.registerEditorExtension(ViewPlugin.fromClass(class {
      constructor(view) { this.decorations = safe(view); }
      update(u) {
        const lp = f => { try { return f.field(editorLivePreviewField, false); } catch (e) { return false; } };
        if (u.docChanged || u.selectionSet || lp(u.state) !== lp(u.startState) || u.transactions.some(t => t.effects.some(e => e.is(refreshFx))))
          this.decorations = safe(u.view);
      }
    }, { decorations: v => v.decorations }));

    // modul Citire (Reading view)
    this.registerMarkdownPostProcessor((el, ctx) => { try { readCites(el, ctx); } catch (e) { console.error("Texere: citările (Citire)", e); } });
    const readCites = (el, ctx) => {
      if (!E.ready) return;
      const info = ctx.getSectionInfo?.(el), full = info?.text || "";
      const style0 = E.styleId(ctx.frontmatter?.csl) || E.current(citeFm(full)); if (!style0) return;
      const { order, nums } = E.plan(full || el.textContent, style0), lang = E.locale(ctx.frontmatter?.lang || citeFm(full).lang);
      // numărul primei note din această secțiune (citările de dinainte de secțiune)
      let n = 0;
      if (E.styles.get(style0).note && info) { const off = full.split("\n").slice(0, info.lineStart).join("\n").length; for (const k of nums.keys()) if (k < off) n++; }
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: t => t.parentElement?.closest("code, pre, a, .frontmatter, .math") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
      const nodes = []; while (walker.nextNode()) if (walker.currentNode.nodeValue.includes("@")) nodes.push(walker.currentNode);
      for (const t of nodes) {
        const s = t.nodeValue, cites = scanCites(s).filter(c => E.known(c)); if (!cites.length) continue;
        const frag = document.createDocumentFragment(); let at = 0;
        for (const c of cites) {
          const nx = t.nextSibling, dot = c.kind === "c" && s.slice(c.to) === " · " && nx?.nodeName === "A";
          const r = E.render(style0, lang, order, c, E.styles.get(style0).note ? ++n : 0); if (!r) continue;
          frag.append(s.slice(at, c.from), this.citeEl(r, c.items.map(i => i.id), dot));
          at = dot ? s.length : c.to;
        }
        frag.append(s.slice(at)); t.replaceWith(frag);
      }
    };

    // bara de jos: stilul notei deschise; clic → alegi alt stil
    const sb = this.citeStatus = this.addStatusBarItem();
    sb.addClass("texere-cite-status"); sb.addClass("mod-clickable");
    const icon = sb.createSpan(), txt = sb.createSpan(); try { setIcon(icon, "quote"); } catch (e) {}
    this.updateCiteStatus = () => {
      const v = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!E.ready || !v?.file || !E.styles.size) { sb.style.display = "none"; return; }
      const fm = citeFm(v.editor?.getValue?.().slice(0, 4000) || ""), id = E.current(fm), en = this.app.loadLocalStorage(LANG) === "en";
      sb.style.display = ""; txt.setText(E.label(id));
      sb.setAttribute("aria-label", en ? "Citation style of this note (click to change)" : "Stilul citărilor din această notă (clic pentru a-l schimba)");
      sb.setAttribute("data-tooltip-position", "top");
    };
    this.registerDomEvent(sb, "click", e => this.citeMenu(e));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.updateCiteStatus()));
    this.registerEvent(this.app.workspace.on("file-open", () => this.updateCiteStatus()));
    this.registerEvent(this.app.metadataCache.on("changed", () => this.updateCiteStatus()));

    this.addCommand({ id: "citation-style-note", name: "Citation style for this note… / Stilul citărilor din notă…", checkCallback: chk => {
      const v = this.app.workspace.getActiveViewOfType(MarkdownView); if (!v?.file) return false;
      if (!chk) this.citePicker(false); return true; } });
    this.addCommand({ id: "citation-style-add", name: "Add a citation style… / Adaugă un stil de citare…", callback: () => this.citeAdd() });
    this.addCommand({ id: "citation-style-default", name: "Default citation style… / Stilul implicit al citărilor…", callback: () => this.citePicker(true) });

    // bibliografia sau stilurile se schimbă → afișarea se actualizează
    let t = null;
    const watch = f => {
      if (!E.ready || !f?.path) return;
      const isBib = f.path === E.bibPath(), isCsl = f.extension === "csl" && f.path.startsWith(E.styleDir());
      if (!isBib && !isCsl) return;
      clearTimeout(t); t = setTimeout(async () => { if (isBib) await E.loadBib(); else await E.loadStyles(); this.refreshCites(); }, 300);
    };
    for (const ev of ["modify", "create", "delete", "rename"]) this.registerEvent(this.app.vault.on(ev, watch));

    await this.settingsReady();
    try { await E.load(); } catch (e) { console.error("Texere: citările", e); return; }
    this.refreshCites();
    this.syncPandocStyle();
  },

  citeEl(r, ids, trail) {
    const { sanitizeHTMLToDom } = require("obsidian");
    const s = document.createElement("span"); s.className = "texere-cite"; s.title = r.title;
    try { s.appendChild(sanitizeHTMLToDom(r.html)); } catch (e) { s.textContent = stripTags(r.html); }
    if (trail) s.appendChild(document.createTextNode(" "));
    s.addEventListener("mousedown", e => {
      if (!(e.metaKey || e.ctrlKey)) return;
      e.preventDefault(); e.stopPropagation();
      const p = this.cite.raw[ids[0]]?.obsidianPath; if (p) this.app.workspace.openLinkText(p, "", true);
    });
    return s;
  },

  refreshCites() {
    this.app.workspace.iterateAllLeaves(l => {
      const v = l.view; if (v?.getViewType?.() !== "markdown") return;
      try { v.editor?.cm?.dispatch({ effects: this.citeRefreshFx.of(null) }); } catch (e) {}
      try { if (v.getMode?.() === "preview") v.previewMode?.rerender(true); } catch (e) {}
    });
    this.updateCiteStatus?.();
  },

  // meniul din bara de jos: stilurile, cel curent bifat
  citeMenu(evt) {
    const { Menu, MarkdownView } = require("obsidian");
    const E = this.cite, en = this.app.loadLocalStorage(LANG) === "en";
    const v = this.app.workspace.getActiveViewOfType(MarkdownView); if (!v?.file) return;
    const cur = E.current(citeFm(v.editor.getValue().slice(0, 4000))), def = E.defaultId();
    const m = new Menu();
    m.addItem(i => i.setTitle(en ? "Citation style for this note" : "Stilul citărilor din această notă").setDisabled(true));
    for (const s of E.list()) m.addItem(i => i.setTitle(s.label + (s.id === def ? (en ? "  · default" : "  · implicit") : "")).setChecked(s.id === cur).onClick(() => this.setNoteStyle(v.file, s.id)));
    m.addSeparator();
    m.addItem(i => i.setTitle(en ? `Default for all notes: ${E.label(def)}…` : `Implicit pentru toate notele: ${E.label(def)}…`).setIcon("settings-2").onClick(() => this.citePicker(true)));
    m.addItem(i => i.setTitle(en ? "Add a style…" : "Adaugă un stil…").setIcon("plus").onClick(() => this.citeAdd()));
    if (E.styles.size > 1) m.addItem(i => i.setTitle(en ? "Remove a style…" : "Șterge un stil…").setIcon("trash-2").onClick(() => this.citeRemove()));
    m.showAtMouseEvent(evt);
  },

  citePicker(isDefault) {
    const { FuzzySuggestModal, MarkdownView } = require("obsidian");
    const E = this.cite, en = this.app.loadLocalStorage(LANG) === "en", plugin = this;
    const v = this.app.workspace.getActiveViewOfType(MarkdownView);
    const M = class extends FuzzySuggestModal {
      getItems() { return E.list(); }
      getItemText(s) { return s.label + "  —  " + s.title; }
      onChooseItem(s) { if (isDefault) plugin.setDefaultStyle(s.id); else if (v?.file) plugin.setNoteStyle(v.file, s.id); }
    };
    const md = new M(this.app);
    md.setPlaceholder(isDefault ? (en ? "Default citation style for all notes" : "Stilul implicit al citărilor, pentru toate notele") : (en ? "Citation style for this note" : "Stilul citărilor din această notă"));
    md.open();
  },

  // stilul notei = proprietatea csl (o citește și Pandoc la export); stilul implicit nu mai are nevoie de proprietate
  // „Adaugă un stil”: caută printre cele ~10.000 de stiluri CSL (indexul din folderul pluginului) și îl instalează dintr-un clic
  async citeIndex() {
    if (this._citeIdx) return this._citeIdx;
    const raw = JSON.parse(await this.app.vault.adapter.read(this.manifest.dir + "/styles-index.json"));
    return (this._citeIdx = raw.styles.map(([name, title, f, parent]) => ({ name, title: title || name, format: raw.formats[f], dep: parent !== undefined, hay: (name + " " + (title || "")).toLowerCase() })));
  },

  async citeAdd() {
    const { SuggestModal, MarkdownView } = require("obsidian");
    const E = this.cite, en = this.app.loadLocalStorage(LANG) === "en", plugin = this;
    let idx; try { idx = await this.citeIndex(); } catch (e) { new Notice(en ? "I can't find the list of styles (styles-index.json in the Texere plugin)." : "Nu găsesc lista stilurilor (styles-index.json din pluginul Texere)."); return; }
    const file = this.app.workspace.getActiveViewOfType(MarkdownView)?.file;
    const FMT = { "author-date": en ? "Author–date · (Smith, 2020)" : "Autor–an · (Smith, 2020)", numeric: en ? "Numbered · [1]" : "Numerotat · [1]",
      note: en ? "Footnotes" : "Note de subsol", author: en ? "Author · (Smith 12)" : "Autor · (Smith 12)", label: en ? "Label · [Smi20]" : "Etichetă · [Smi20]" };
    const POPULAR = ["apa", "chicago-author-date", "chicago-notes-bibliography", "modern-language-association", "harvard-cite-them-right", "ieee",
      "nlm-citation-sequence", "american-medical-association", "american-sociological-association", "american-political-science-association", "turabian-author-date", "nature", "elsevier-harvard", "springer-basic-author-date", "iso690-author-date-en"];
    const M = class extends SuggestModal {
      getSuggestions(q) {
        const w = q.toLowerCase().split(/\s+/).filter(Boolean);
        const st = x => (x.title.toLowerCase().startsWith(w[0]) || x.name.startsWith(w[0]) || x.title.toLowerCase().includes("/" + w[0])) ? 0 : 1;   // titlul începe cu ce ai scris
        if (!w.length) return POPULAR.map(n => idx.find(x => x.name === n)).filter(Boolean);
        // întâi stilurile principale (nu variantele unei reviste), apoi titlurile scurte
        return idx.filter(x => w.every(t => x.hay.includes(t))).sort((a, b) => (st(a) - st(b)) || (a.dep - b.dep) || (a.title.length - b.title.length)).slice(0, 60);
      }
      renderSuggestion(x, el) {
        el.createDiv({ text: x.title }).style.fontWeight = "500";
        const has = E.styles.has(x.name);
        const d = el.createDiv({ text: [FMT[x.format] || x.format, x.name, has ? (en ? "✓ installed" : "✓ instalat") : ""].filter(Boolean).join("  ·  ") });
        d.style.cssText = "font-size:0.82em;color:var(--text-muted)";
      }
      onChooseSuggestion(x) { plugin.citeInstall(x, file); }
    };
    const md = new M(this.app);
    md.setPlaceholder(en ? "Search a style: APA, Vancouver, a journal's name…" : "Caută un stil: APA, Vancouver, numele unei reviste…");
    md.setInstructions([{ command: "↵", purpose: file ? (en ? "install and use in this note" : "instalează și folosește în notă") : (en ? "install" : "instalează") }]);
    md.limit = 60; md.open();
  },

  async citeInstall(x, file) {
    const { requestUrl } = require("obsidian");
    const E = this.cite, en = this.app.loadLocalStorage(LANG) === "en", ad = this.app.vault.adapter;
    const path = (E.styleDir() ? E.styleDir() + "/" : "") + x.name + ".csl";
    if (!(await ad.exists(path))) {
      const get = async (name, dep) => {
        for (const url of [`https://raw.githubusercontent.com/citation-style-language/styles/master/${dep ? "dependent/" : ""}${name}.csl`, `https://www.zotero.org/styles/${name}`]) {
          try { const r = await requestUrl({ url, throw: false }); if (r.status === 200 && /<style[\s>]/.test(r.text)) return r.text; } catch (e) {}
        }
        throw new Error(name);
      };
      const wait = new Notice((en ? "Installing " : "Instalez ") + x.title + "…", 0);
      try {
        let xml = await get(x.name, x.dep);
        // stilul unei reviste (dependent) folosește regulile altui stil: le copiem, cu titlul revistei, ca să meargă și fără internet
        const par = /href="https?:\/\/www\.zotero\.org\/styles\/([^"]+)"\s+rel="independent-parent"/.exec(xml);
        if (par) {
          let p = await get(par[1], false);
          const title = (/<title>([^<]*)<\/title>/.exec(xml) || [])[1], loc = (/default-locale="([^"]+)"/.exec(xml) || [])[1];
          if (title) p = p.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);
          if (loc) p = /default-locale="/.test(p) ? p.replace(/default-locale="[^"]*"/, `default-locale="${loc}"`) : p.replace(/<style\b/, `<style default-locale="${loc}"`);
          xml = p;
        }
        await ad.write(path, xml);
      } catch (e) {
        wait.hide();
        new Notice(en ? `I couldn't download ${x.title}. Check the internet connection and try again.` : `Nu am putut descărca ${x.title}. Verifică conexiunea la internet și încearcă din nou.`, 8000);
        return;
      }
      wait.hide();
    }
    await E.loadStyles(); this.refreshCites();
    if (file) { await this.setNoteStyle(file, x.name); new Notice((en ? "Installed and used in this note: " : "Instalat și folosit în această notă: ") + E.label(x.name)); }
    else new Notice((en ? "Installed: " : "Instalat: ") + E.label(x.name));
  },

  // „Șterge un stil”: fișierul .csl merge la coșul de gunoi; notele care îl foloseau trec la stilul implicit
  citeRemove() {
    const { FuzzySuggestModal } = require("obsidian");
    const E = this.cite, en = this.app.loadLocalStorage(LANG) === "en", plugin = this, def = E.defaultId();
    const M = class extends FuzzySuggestModal {
      getItems() { return E.list().filter(s => s.id !== def); }
      getItemText(s) { return s.label + "  —  " + s.title; }
      async onChooseItem(s) {
        const f = plugin.app.vault.getAbstractFileByPath((E.styleDir() ? E.styleDir() + "/" : "") + s.id + ".csl"); if (!f) return;
        await plugin.app.vault.trash(f, true); await E.loadStyles(); plugin.refreshCites();
        new Notice((en ? "Removed: " : "Șters: ") + s.label);
      }
    };
    const md = new M(this.app);
    md.setPlaceholder(en ? "Which style do you want to remove? (the default style can't be removed)" : "Ce stil vrei să ștergi? (stilul implicit nu se poate șterge)");
    md.open();
  },

  async setNoteStyle(file, id) {
    await this.app.fileManager.processFrontMatter(file, fm => { if (id === this.cite.defaultId()) delete fm.csl; else fm.csl = id; });
  },

  async setDefaultStyle(id) {
    this.settings.citationStyle = id; await this.saveData(this.settings);
    this.syncPandocStyle(); this.refreshCites();
    new Notice((this.app.loadLocalStorage(LANG) === "en" ? "Default citation style: " : "Stilul implicit al citărilor: ") + this.cite.label(id));
  },

  // exportul: stilul implicit merge într-un fișier „metadata-files” al lui Pandoc, ca proprietatea csl a notei să aibă prioritate;
  // folderul stilurilor intră în resource-path, ca „csl: chicago-author-date” să fie găsit după nume
  syncPandocStyle() {
    try {
      const E = this.cite, id = E?.defaultId(); if (!id) return;
      const args = this.app.plugins.plugins["obsidian-pandoc"]?.settings?.extraArguments || "";
      const m = /--defaults=(\S+)/.exec(args); if (!m) return;
      const fs = require("fs"), path = require("path"), os = require("os"), env = process.env, home = os.homedir();
      const pdDir = process.platform === "win32" ? path.join(env.APPDATA || path.join(home, "AppData", "Roaming"), "pandoc")
        : (fs.existsSync(path.join(home, ".pandoc")) ? path.join(home, ".pandoc") : path.join(env.XDG_DATA_HOME || path.join(home, ".local", "share"), "pandoc"));
      const name = m[1].replace(/\.ya?ml$/, ""), df = path.join(pdDir, "defaults", name + ".yaml");
      if (!fs.existsSync(df)) return;
      const base = this.app.vault.adapter.getBasePath(), dir = path.join(base, ...E.styleDir().split("/"));
      const meta = path.join(pdDir, "defaults", name + "-style.yaml"), q = v => JSON.stringify(v);
      fs.writeFileSync(meta, `csl: ${q(path.join(dir, id + ".csl"))}\n`);
      let lines = fs.readFileSync(df, "utf8").split(/\r?\n/).filter(l => l.trim() && !/^(csl|metadata-files?):/.test(l));
      const rp = lines.findIndex(l => /^resource-path:/.test(l));
      let arr = ["."]; if (rp >= 0) { try { arr = JSON.parse(lines[rp].replace(/^resource-path:\s*/, "")); } catch (e) {} }
      if (!arr.includes(dir)) arr.push(dir);
      const rl = `resource-path: [${arr.map(q).join(", ")}]`;
      if (rp >= 0) lines[rp] = rl; else lines.push(rl);
      lines.push(`metadata-files: [${q(meta)}]`);
      fs.writeFileSync(df, lines.join("\n") + "\n");
    } catch (e) { console.error("Texere: stilul pentru export", e); }
  },
};
Object.assign(module.exports.prototype, CiteStyleMixin);

// ---------- Statistici pentru surse: un panou mic în fiecare notă din Literature Notes ----------
// În literatură: scite (citări care susțin / contrazic / doar menționează, publicații care citează) — pentru surse cu DOI.
// Impact: OpenAlex (citări, FWCI, percentilă, referințe, acces deschis, citări pe an) și Semantic Scholar (citări influente).
// În vault: evidențierile pe tipuri, paginile, notele tale care citează sursa, statutul lecturii.
// Datele din internet se păstrează 7 zile în data.json al pluginului (butonul ⟳ le reîncarcă); nota nu se modifică.
const StatsMixin = {
  settingsReady() {
    return (this._settingsP = this._settingsP || this.loadData().then(d => (this.settings = Object.assign({ citationStyle: "apa", stats: {}, statsOpen: true }, d || {}))));
  },

  async statsPanel() {
    await this.settingsReady();
    if (!this.settings.stats) this.settings.stats = {};
    const css = document.createElement("style"); css.id = "texere-stats-css";
    css.textContent = `.texere-stats{margin:6px 0 20px;border:1px solid var(--background-modifier-border);border-radius:8px;font-size:var(--font-ui-small);background:var(--background-secondary);overflow:hidden;user-select:text}
.texere-stats .ts-head{display:flex;align-items:center;gap:8px;padding:6px 8px 6px 10px;cursor:pointer;color:var(--text-muted)}
.texere-stats .ts-title{font-weight:600;color:var(--text-normal);display:flex;align-items:center;gap:6px}
.texere-stats .ts-title svg,.texere-stats .ts-btn svg{width:14px;height:14px}
.texere-stats .ts-meta{margin-left:auto;font-size:.9em;color:var(--text-faint)}
.texere-stats .ts-btn{display:flex;padding:3px;border-radius:4px;color:var(--text-faint);cursor:pointer}
.texere-stats .ts-btn:hover{background:var(--background-modifier-hover);color:var(--text-normal)}
.texere-stats:not(.is-open) .ts-body{display:none}
.texere-stats:not(.is-open) .ts-chev{transform:rotate(-90deg)}
.texere-stats .ts-sum{color:var(--text-muted);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.texere-stats.is-open .ts-sum{display:none}
.texere-stats .ts-retracted{background:#F45B5B;color:#fff;font-weight:600;font-size:.85em;padding:1px 7px;border-radius:10px}
.texere-stats .ts-body{padding:2px 12px 10px;display:grid;grid-template-columns:max-content 1fr;gap:7px 16px;align-items:baseline}
.texere-stats .ts-label{color:var(--text-faint);font-size:.8em;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap}
.texere-stats .ts-row{display:flex;flex-wrap:wrap;gap:4px 14px;align-items:center;color:var(--text-muted)}
.texere-stats .ts-chip{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
.texere-stats .ts-chip b{font-weight:600;color:var(--text-normal);font-variant-numeric:tabular-nums}
.texere-stats .ts-dot{width:8px;height:8px;border-radius:50%;display:inline-block;flex:none}
.texere-stats .ts-muted{color:var(--text-faint)}
.texere-stats a.ts-link{color:var(--text-faint);text-decoration:none;font-size:.9em}
.texere-stats a.ts-link:hover,.texere-stats .ts-click:hover{color:var(--text-accent)}
.texere-stats .ts-click{cursor:pointer}
.texere-stats .ts-years{display:flex;align-items:flex-end;gap:4px}
.texere-stats .ts-yr{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;width:24px}
.texere-stats .ts-yn{font-size:.8em;color:var(--text-normal);font-variant-numeric:tabular-nums;line-height:1.3}
.texere-stats .ts-yb{width:14px;background:var(--text-faint);border-radius:2px 2px 0 0;opacity:.7}
.texere-stats .ts-yr.is-now .ts-yb{background:var(--text-accent);opacity:.6}
.texere-stats .ts-yy{font-size:.75em;color:var(--text-faint);margin-top:2px}
.texere-stats svg.ts-spark rect{fill:var(--text-faint)}
.texere-stats svg.ts-spark rect.last{fill:var(--text-accent)}
@media (max-width:520px){.texere-stats .ts-body{grid-template-columns:1fr;gap:3px}.texere-stats .ts-label{margin-top:6px}}`;
    document.getElementById("texere-stats-css")?.remove(); document.head.appendChild(css);
    this.register(() => { css.remove(); document.querySelectorAll(".texere-stats").forEach(e => e.remove()); });

    const tick = this.statsTick = () => this.app.workspace.iterateAllLeaves(l => { if (l.view?.getViewType?.() === "markdown") { try { this.renderStats(l.view); } catch (e) { console.error("Texere: statistici", e); } } });
    let t = null; const soon = (ms = 60) => { clearTimeout(t); t = setTimeout(tick, ms); };
    this.registerEvent(this.app.workspace.on("file-open", () => soon()));
    this.registerEvent(this.app.workspace.on("layout-change", () => soon()));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => soon()));
    this.registerEvent(this.app.metadataCache.on("changed", () => soon(300)));
    this.registerEvent(this.app.workspace.on("editor-change", () => soon(800)));   // evidențieri noi → numărul se actualizează
    this.registerEvent(this.app.vault.on("modify", f => { if (f.extension === "md" && !this.litKey(f)) this._citedAt = 0; }));
    this.registerInterval(window.setInterval(tick, 2000));   // Obsidian redesenează uneori antetul notei
    tick();
  },

  litDir() { return (this.app.plugins.plugins["biblib"]?.settings?.literatureNotePath || "01. Sources/Literature Notes/").replace(/\/?$/, "/"); },
  // citekey-ul unei note de sursă (null pentru alte note)
  litKey(file) {
    if (!file || file.extension !== "md") return null;
    if (!file.path.startsWith(this.litDir()) && !file.basename.startsWith("@")) return null;
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
    return fm.id || fm["citation-key"] || (file.basename.startsWith("@") ? file.basename.slice(1) : null);
  },

  // notele tale (în afara Literature Notes) care citează sursa: [@key] sau @key
  citedIn(key) {
    const now = Date.now();
    if (this._citedMap && now - (this._citedAt || 0) < 300000) return this._citedMap.get(key) || [];
    if (!this._citedBusy) {
      this._citedBusy = (async () => {
        const map = new Map(), lit = this.litDir();
        for (const f of this.app.vault.getMarkdownFiles()) {
          if (f.path.startsWith(lit) || f.path.startsWith("Support/")) continue;
          let s = ""; try { s = await this.app.vault.cachedRead(f); } catch (e) { continue; }
          if (!s.includes("@")) continue;
          const re = new RegExp("@(" + CITE_KEY + ")", "g"); let m; const seen = new Set();
          while ((m = re.exec(s))) if (!seen.has(m[1])) { seen.add(m[1]); if (!map.has(m[1])) map.set(m[1], []); map.get(m[1]).push(f); }
        }
        this._citedMap = map; this._citedAt = Date.now(); this._citedBusy = null; this.statsTick?.();
      })();
    }
    return this._citedMap?.get(key) || [];
  },

  // datele din internet (scite, OpenAlex, Semantic Scholar), păstrate 7 zile
  remoteStats(key, fm, force) {
    const c = this.settings.stats[key], DAY = 864e5;
    this._statsBusy = this._statsBusy || new Set();
    const failed = c && [c.scite, c.oa, c.s2].some(x => x?.err);   // un serviciu n-a răspuns: se reîncearcă după o oră
    if ((force || !c || c.v !== 2 || Date.now() - c.t > (failed ? 36e5 : DAY)) && !this._statsBusy.has(key)) {
      this._statsBusy.add(key);
      this.fetchStats(fm).then(async r => { this.settings.stats[key] = r; await this.saveData(this.settings); })
        .catch(e => console.error("Texere: statistici", e))
        .finally(() => { this._statsBusy.delete(key); this.statsTick?.(); });
    }
    return c;
  },

  async fetchStats(fm) {
    const { requestUrl } = require("obsidian");
    const J = async url => {
      try { const r = await requestUrl({ url, throw: false, headers: { Accept: "application/json" } }); return r.status === 200 ? r.json : r.status === 404 ? null : undefined; }
      catch (e) { return undefined; }
    };
    const fold = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const title = String(fm.title || "").trim(), fam = fold((fm.author || fm.editor || [])[0]?.family || "");
    let doi = String(fm.DOI || fm.doi || "").trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").replace(/^doi:\s*/i, ""), doiFrom = doi ? "note" : null;
    // cărți fără DOI: îl căutăm în Crossref după ISBN (multe cărți academice au DOI)
    if (!doi && fm.ISBN) {
      for (const isbn of String(fm.ISBN).split(/[\s,;]+/).map(x => x.replace(/[^0-9Xx]/g, "")).filter(x => x.length >= 10)) {
        const r = await J(`https://api.crossref.org/works?filter=isbn:${isbn}&rows=10&select=DOI,title,type,author`);
        const its = (r?.message?.items || []).filter(x => !fam || (x.author || []).some(a => fold(a.family).includes(fam)));
        const it = its.find(x => /^(book|monograph|edited-book|reference-book)$/.test(x.type)) || its[0];
        if (it?.DOI) { doi = it.DOI; doiFrom = "isbn"; break; }
      }
    }
    const out = { v: 2, t: Date.now(), doi: doi || null, doiFrom, scite: null, oa: null, s2: null };
    const tasks = [];
    // scite: doar cu DOI
    if (doi) tasks.push(J(`https://api.scite.ai/tallies/${doi}`).then(r => {
      out.scite = r ? { s: r.supporting || 0, c: r.contradicting || 0, m: r.mentioning || 0, u: r.unclassified || 0, cp: r.citingPublications ?? null, tot: r.total || 0 } : r === null ? { none: true } : { err: true };
    }));
    // OpenAlex: după DOI; cărțile fără DOI, după titlu + primul autor
    const key = this.settings.openalexKey ? `&api_key=${encodeURIComponent(this.settings.openalexKey)}` : "";
    const SEL = "id,display_name,is_retracted,publication_year,cited_by_count,fwci,citation_normalized_percentile,referenced_works_count,open_access,counts_by_year,primary_topic,authorships";
    tasks.push((async () => {
      let w = null, byTitle = false;
      if (doi) w = await J(`https://api.openalex.org/works/doi:${doi}?select=${SEL}${key}`);
      if (!w && w !== undefined && title && fam) {
        const r = await J(`https://api.openalex.org/works?filter=title.search:${encodeURIComponent(title.replace(/[,:;|]/g, " ").replace(/\s+/g, " ").trim())}&per-page=10&select=${SEL}${key}`);
        if (r === undefined) w = undefined;
        else {
          const hits = (r?.results || []).filter(x => (x.authorships || []).some(a => fold(a.author?.display_name).includes(fam)));
          w = hits.sort((a, b) => (b.cited_by_count || 0) - (a.cited_by_count || 0))[0] || null; byTitle = !!w;
        }
      }
      if (w === undefined) { out.oa = { err: true }; return; }
      if (!w) { out.oa = { none: true }; return; }
      const p = w.citation_normalized_percentile || {};
      out.oa = { id: String(w.id || "").replace(/^https?:\/\/openalex\.org\//, ""), cited: w.cited_by_count ?? null, fwci: typeof w.fwci === "number" ? w.fwci : null,
        pct: typeof p.value === "number" ? p.value : null, top1: !!p.is_in_top_1_percent, top10: !!p.is_in_top_10_percent,
        refs: w.referenced_works_count ?? null, isOa: !!w.open_access?.is_oa, oaStatus: w.open_access?.oa_status || null, oaUrl: w.open_access?.oa_url || null,
        years: (w.counts_by_year || []).map(y => [y.year, y.cited_by_count]).sort((a, b) => a[0] - b[0]),
        topic: w.primary_topic?.display_name || null, retracted: !!w.is_retracted, byTitle };
    })());
    // Semantic Scholar: citări influente
    tasks.push((async () => {
      const F = "fields=title,authors,year,citationCount,influentialCitationCount,referenceCount,url";
      let p = doi ? await J(`https://api.semanticscholar.org/graph/v1/paper/DOI:${doi}?${F}`) : null, byTitle = false;
      if (!p && p !== undefined && title && fam) {
        const r = await J(`https://api.semanticscholar.org/graph/v1/paper/search/match?query=${encodeURIComponent(title)}&${F}`);
        if (r === undefined) p = undefined;
        else { p = (r?.data || []).find(x => (x.authors || []).some(a => fold(a.name).includes(fam))) || null; byTitle = !!p; }
      }
      out.s2 = p === undefined ? { err: true } : !p ? { none: true } : { cited: p.citationCount ?? null, infl: p.influentialCitationCount ?? null, refs: p.referenceCount ?? null, url: p.url || null, byTitle };
    })());
    await Promise.all(tasks);
    return out;
  },

  renderStats(view) {
    const file = view.file, key = this.litKey(file), root = view.containerEl;
    const targets = [root.querySelector(".markdown-source-view .cm-sizer"), root.querySelector(".markdown-reading-view .markdown-preview-sizer .mod-header")].filter(Boolean);
    if (!key) { root.querySelectorAll(".texere-stats").forEach(e => e.remove()); return; }
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
    const remote = this.remoteStats(key, fm, false), busy = this._statsBusy?.has(key);
    const text = (() => { try { return view.getViewData?.() || view.data || ""; } catch (e) { return ""; } })();
    const cited = this.citedIn(key);
    const sig = JSON.stringify([key, remote?.t, busy, this.settings.statsOpen, text.length, text.split("#").length, cited.map(f => f.path), fm["reading-status"], this.app.loadLocalStorage(LANG)]);
    for (const tg of targets) {
      let p = tg.querySelector(":scope > .texere-stats");
      if (p && p.dataset.sig === sig) continue;
      const fresh = this.buildStats(key, fm, remote, busy, text, cited, view);
      fresh.dataset.sig = sig;
      if (p) p.replaceWith(fresh);
      else if (tg.classList.contains("cm-sizer")) tg.insertBefore(fresh, tg.querySelector(":scope > .cm-contentContainer"));
      else tg.appendChild(fresh);
    }
  },

  buildStats(key, fm, remote, busy, text, cited, view) {
    const { setIcon, Menu } = require("obsidian");
    const en = this.app.loadLocalStorage(LANG) === "en", T = (ro, e) => en ? e : ro;
    const num = n => (n == null ? "—" : Number(n).toLocaleString(en ? "en-US" : "ro-RO"));
    const el = (tag, cls, txt) => { const x = document.createElement(tag); if (cls) x.className = cls; if (txt != null) x.textContent = txt; return x; };
    const chip = (row, n, label, color, tip) => {
      const c = el("span", "ts-chip"); if (color) { const d = el("span", "ts-dot"); d.style.background = color; c.appendChild(d); }
      c.appendChild(el("b", null, num(n))); c.appendChild(document.createTextNode(label)); if (tip) c.title = tip; row.appendChild(c); return c;
    };
    const link = (row, text, url) => { const a = el("a", "ts-link", text + " ↗"); a.href = url; a.target = "_blank"; a.rel = "noopener"; row.appendChild(a); };
    const muted = (row, s) => row.appendChild(el("span", "ts-muted", s));
    const pal = this.app.plugins.plugins["pdf-plus"]?.settings?.colors || {};
    const colorOf = n => { for (const [k, v] of Object.entries(pal)) if (k.toLowerCase() === n) return v; return null; };

    const box = el("div", "texere-stats" + (this.settings.statsOpen ? " is-open" : ""));
    box.addEventListener("mousedown", e => e.stopPropagation());   // clicurile din panou nu mută cursorul în notă
    const head = el("div", "ts-head"), ttl = el("span", "ts-title"), ic = el("span");
    try { setIcon(ic, "bar-chart-3"); } catch (e) {}
    ttl.append(ic, T("Statistici sursă", "Source stats")); head.appendChild(ttl);
    const ago = t => { const d = Math.floor((Date.now() - t) / 864e5); return d < 1 ? T("azi", "today") : d === 1 ? T("ieri", "yesterday") : en ? `${d} days ago` : `acum ${d} zile`; };
    { const sc0 = remote?.scite, oa0 = remote?.oa, parts = [];
      if (sc0 && !sc0.err && !sc0.none) parts.push(`${num(sc0.s)} ${T("susțin", "supporting")}`, `${num(sc0.c)} ${T("contrazic", "contrasting")}`);
      const cit0 = oa0 && !oa0.err && !oa0.none ? oa0.cited : remote?.s2?.cited;
      if (cit0 != null) parts.push(`${num(cit0)} ${T("citări", "cited by")}`);
      const hl0 = (text.match(/(?:^|\s)#[\w-]+/gm) || []).filter(t => Object.keys(this.app.plugins.plugins["pdf-plus"]?.settings?.colors || {}).map(n => n.toLowerCase()).includes(t.trim().slice(1).toLowerCase())).length;
      parts.push(`${num(hl0)} ${T("evidențieri", "highlights")}`);
      head.appendChild(el("span", "ts-sum", parts.join("  ·  "))); }
    if (remote?.oa?.retracted) { const b = el("span", "ts-retracted", T("Retrasă", "Retracted")); b.title = T("Lucrarea a fost retrasă de editor (OpenAlex). Verifică înainte s-o citezi.", "The publisher retracted this work (OpenAlex). Check before citing it."); head.appendChild(b); }
    head.appendChild(el("span", "ts-meta", busy ? T("se încarcă…", "loading…") : remote?.t ? T("actualizat ", "updated ") + ago(remote.t) : ""));
    const rb = el("span", "ts-btn"); try { setIcon(rb, "refresh-cw"); } catch (e) {}
    rb.title = T("Reîncarcă statisticile", "Refresh the stats");
    rb.addEventListener("click", e => { e.stopPropagation(); this._citedAt = 0; this.remoteStats(key, fm, true); this.statsTick(); });
    const cb = el("span", "ts-btn ts-chev"); try { setIcon(cb, "chevron-down"); } catch (e) {}
    head.append(rb, cb);
    head.addEventListener("click", async () => { this.settings.statsOpen = !this.settings.statsOpen; await this.saveData(this.settings); this.statsTick(); });
    box.appendChild(head);
    const body = el("div", "ts-body"); box.appendChild(body);
    const row = label => { body.appendChild(el("span", "ts-label", label)); const r = el("div", "ts-row"); body.appendChild(r); return r; };
    const loading = !remote && busy;

    // 1. În literatură (scite)
    const r1 = row(T("În literatură", "In the literature")), sc = remote?.scite, doi = remote?.doi || fm.DOI || fm.doi;
    if (loading) muted(r1, "…");
    else if (!doi && fm.ISBN) muted(r1, T("Nu am găsit un DOI pentru această carte (după ISBN). scite acoperă doar lucrările cu DOI.", "No DOI found for this book (searched by ISBN). scite only covers works with a DOI."));
    else if (!doi) muted(r1, T("Adaugă un DOI în proprietățile notei ca să vezi citările care o susțin sau o contrazic.", "Add a DOI to the note's properties to see the citations that support or contrast it."));
    else if (!sc || sc.err) muted(r1, T("scite nu răspunde acum; se reîncearcă automat.", "scite isn't responding right now; it retries automatically."));
    else if (sc.none) muted(r1, T("scite nu are încă date pentru acest DOI.", "scite has no data for this DOI yet."));
    else {
      chip(r1, sc.s, T(" susțin", " supporting"), "#00A896", T("Citări care aduc dovezi în favoarea sursei", "Citation statements that provide evidence for this source"));
      chip(r1, sc.c, T(" contrazic", " contrasting"), "#F45B5B", T("Citări care aduc dovezi împotriva sursei", "Citation statements that provide evidence against this source"));
      chip(r1, sc.m, T(" menționează", " mentioning"), "#8a8a8a", T("Citări care doar menționează sursa", "Citation statements that only mention this source"));
      if (sc.cp != null) chip(r1, sc.cp, T(" publicații care citează", " citing publications"), null, T("Publicații distincte care citează sursa", "Distinct publications that cite this source"));
      link(r1, "scite", `https://scite.ai/reports/${encodeURIComponent(String(doi))}`);
      if (remote?.doiFrom === "isbn") muted(r1, T(`· DOI găsit după ISBN: ${doi}`, `· DOI found from the ISBN: ${doi}`));
    }

    // 2. Impact (OpenAlex + Semantic Scholar)
    const r2 = row("Impact"), oa = remote?.oa, s2 = remote?.s2;
    if (loading) muted(r2, "…");
    else {
      const okOa = oa && !oa.err && !oa.none, okS2 = s2 && !s2.err && !s2.none;
      if (!okOa && !okS2) muted(r2, (oa?.err || s2?.err) ? T("OpenAlex sau Semantic Scholar nu răspunde acum; se reîncearcă automat.", "OpenAlex or Semantic Scholar isn't responding right now; it retries automatically.") : T("Sursa nu apare în OpenAlex sau Semantic Scholar.", "This source isn't in OpenAlex or Semantic Scholar."));
      if (okOa) {
        chip(r2, oa.cited, T(" citări", " cited by"), null, T("Lucrări care citează sursa (OpenAlex)", "Works that cite this source (OpenAlex)"));
        if (oa.fwci != null) { const c = chip(r2, null, "", null, T("Field-Weighted Citation Impact: 1 = media domeniului; 2 = de două ori mai citată decât media", "Field-Weighted Citation Impact: 1 = field average; 2 = cited twice as much as the average")); c.querySelector("b").textContent = "FWCI " + oa.fwci.toFixed(2); }
        if (oa.top1 || oa.top10 || oa.pct != null) { const c = el("span", "ts-chip"); c.appendChild(el("b", null, oa.top1 ? "Top 1%" : oa.top10 ? "Top 10%" : `${Math.round(oa.pct * 100)}%`));
          c.appendChild(document.createTextNode(oa.top1 || oa.top10 ? "" : T(" percentilă", " percentile"))); c.title = T("Cât de citată e față de lucrările din același domeniu și an", "How cited it is compared with works of the same field and year"); r2.appendChild(c); }
      }
      if (okS2 && s2.infl != null) chip(r2, s2.infl, T(" citări influente", " influential citations"), "#9254DE", T("Citări în care sursa a influențat semnificativ lucrarea care citează (Semantic Scholar)", "Citations where this source significantly influenced the citing work (Semantic Scholar)"));
      if (okS2 && !okOa && s2.cited != null) chip(r2, s2.cited, T(" citări", " cited by"), null, "Semantic Scholar");
      if (okOa) {
        if (oa.isOa) { const c = el("span", "ts-chip"); const d = el("span", "ts-dot"); d.style.background = "#F5A800"; c.append(d, T("Acces deschis", "Open access") + (oa.oaStatus ? ` (${oa.oaStatus})` : ""));
          if (oa.oaUrl) { c.classList.add("ts-click"); c.title = T("Deschide versiunea gratuită", "Open the free version"); c.addEventListener("click", () => window.open(oa.oaUrl)); } r2.appendChild(c); }
        if (oa.id) link(r2, "OpenAlex", `https://openalex.org/works/${oa.id}`);
      }
      if (okS2 && s2.url) link(r2, "Semantic Scholar", s2.url);
      if ((okOa && oa.byTitle) || (okS2 && s2.byTitle && !okOa)) muted(r2, T("· găsită după titlu", "· matched by title"));
    }

    // 2b. Citări pe an (OpenAlex), cu anii fără citări completați cu 0
    const yrs = remote?.oa?.years || [];
    if (!loading && yrs.length) {
      const now = new Date().getFullYear(), m = new Map(yrs), y0 = Math.max(Math.min(...yrs.map(y => y[0])), now - 9);
      const ys = []; for (let y = y0; y <= now; y++) ys.push([y, m.get(y) || 0]);
      const rY = row(T("Citări pe an", "Citations per year")), max = Math.max(1, ...ys.map(y => y[1]));
      const ch = el("div", "ts-years");
      for (const [y, n] of ys) {
        const col = el("div", "ts-yr" + (y === now ? " is-now" : ""));
        col.appendChild(el("span", "ts-yn", n ? String(n) : ""));
        const bar = el("span", "ts-yb"); bar.style.height = Math.max(n ? 3 : 1, Math.round(n / max * 30)) + "px"; col.appendChild(bar);
        col.appendChild(el("span", "ts-yy", "’" + String(y).slice(2)));
        col.title = `${y}: ${n}` + (y === now ? T(" (anul în curs)", " (so far this year)") : ""); ch.appendChild(col);
      }
      rY.appendChild(ch);
    }

    // 3. În vault: evidențieri pe tipuri, pagini, note care citează, lectura
    const r3 = row(T("În vault", "In your vault")), names = Object.keys(pal).map(n => n.toLowerCase());
    const counts = new Map(), pages = new Set(); let total = 0;
    for (const line of text.split("\n")) {
      const m = /(?:^|\s)#([\w-]+)/.exec(line);
      if (m && names.includes(m[1].toLowerCase())) { const n = m[1].toLowerCase(); counts.set(n, (counts.get(n) || 0) + 1); total++; }
      const pm = /\.pdf#page=(\d+)/i.exec(line); if (pm) pages.add(pm[1]);
    }
    const hc = chip(r3, total, T(" evidențieri", " highlights"));
    if (pages.size) hc.appendChild(document.createTextNode(T(` pe ${pages.size} pagini`, ` on ${pages.size} pages`)));
    for (const n of names) if (counts.get(n)) chip(r3, counts.get(n), " " + n, colorOf(n), "#" + n);
    const ci = chip(r3, cited.length, cited.length === 1 ? T(" notă a ta o citează", " of your notes cites it") : T(" note ale tale o citează", " of your notes cite it"));
    if (cited.length) {
      ci.classList.add("ts-click"); ci.title = cited.map(f => f.basename).join("\n");
      ci.addEventListener("click", e => { const m = new Menu(); for (const f of cited) m.addItem(i => i.setTitle(f.basename).setIcon("file-text").onClick(() => this.app.workspace.getLeaf(true).openFile(f))); m.showAtMouseEvent(e); });
    }
    const rs = String(fm["reading-status"] || "").replace(/^#/, "");
    if (rs) { const L = { unread: T("necitită", "unread"), reading: T("în lectură", "reading"), read: T("citită", "read"), toread: T("de citit", "to read") }; muted(r3, "· " + (L[rs.toLowerCase()] || rs)); }
    return box;
  },
};
Object.assign(module.exports.prototype, StatsMixin);
