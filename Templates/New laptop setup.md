<%*
// Configurare automata pentru un laptop nou (Mac sau Windows). Versiune 2.2.0 (2026-10-27)
// Porneste singura dupa "Trust author" (pluginul Texere) sau din Ctrl/Cmd + P -> "Texere: Setup" / "Texere: Setup".
// O fereastra arata pasii pe rand (RO / EN). La final, raportul se scrie direct in nota "Setup report".
// Pluginul ruleaza scriptul fara nota noua; din Templater ("Create new note from template") se creeaza o nota goala, care se sterge la final.
const ob = tp.obsidian;
const isWin = ob.Platform.isWin, isMac = ob.Platform.isMacOS;
const os = isWin ? "Windows" : (isMac ? "Mac" : "Linux");
const sep = isWin ? "\\" : "/";
const ad = app.vault.adapter;
const base = ad.getBasePath ? ad.getBasePath() : ad.basePath;
const join = (...p) => p.join(sep);
let fs = null, cp = null;
try { fs = window.require("fs"); cp = window.require("child_process"); } catch (e) {}
const env = (typeof process !== "undefined" && process.env) ? process.env : {};
const exists = p => { try { return !!fs && fs.existsSync(p); } catch (e) { return false; } };
const which = cmd => {
  if (!cp) return null;
  try {
    const out = isWin ? cp.execSync(`where ${cmd}`, { encoding: "utf8" })
                      : cp.execSync(`/bin/zsh -lc "command -v ${cmd}"`, { encoding: "utf8" });
    const lines = out.split(/\r?\n/).map(s => s.trim()).filter(s => s && (isWin ? /\.exe$/i.test(s) : s.startsWith("/")));
    return lines.length ? lines[lines.length - 1] : null;
  } catch (e) { return null; }
};
const find = (cmd, cands) => cands.find(exists) || which(cmd);
const L = env.LOCALAPPDATA || "", PF = env.ProgramFiles || "C:\\Program Files";
const pandocC = isWin ? [`${L}\\Pandoc\\pandoc.exe`, `${PF}\\Pandoc\\pandoc.exe`] : ["/opt/homebrew/bin/pandoc", "/usr/local/bin/pandoc"];
const texC = isWin ? [`${L}\\Programs\\MiKTeX\\miktex\\bin\\x64\\xelatex.exe`, `${PF}\\MiKTeX\\miktex\\bin\\x64\\xelatex.exe`]
                   : ["/Library/TeX/texbin/xelatex", "/opt/homebrew/bin/xelatex", "/usr/local/bin/xelatex"];
const pause = ms => new Promise(r => setTimeout(r, ms));

// ---------- limba (RO / EN): aceeași alegere ca în butonul Ajutor ----------
const LANG_KEY = "texere-lang";
let lang = (() => {
  try { const s = app.loadLocalStorage(LANG_KEY); if (s === "ro" || s === "en") return s; } catch (e) {}
  let l = ""; try { l = window.localStorage.getItem("language") || navigator.language || ""; } catch (e) {}
  return !l || /^ro/i.test(l) ? "ro" : "en";
})();
const M = (ro, en) => ({ ro, en });
const tx = m => m == null ? "" : typeof m === "string" ? m : (m[lang] != null ? m[lang] : m.ro);
const setLang = l => { lang = l; try { app.saveLocalStorage(LANG_KEY, l); } catch (e) {} };

// ---------- ghidurile (română și engleză), chiar dacă au fost redenumite ----------
// numele notelor pot avea în față un număr și „Texere – ” (ex. „01. Texere – Cercetare, lectură și scris, într-un singur loc”)
const strip = b => b.replace(/^\d+[.)]\s*/, "").replace(/^(Texere|Topos)\s*[–—-]\s*/, "");
const findBy = (names, re) => {
  for (const n of names) { const f = app.vault.getAbstractFileByPath(n) || app.vault.getMarkdownFiles().find(x => x.name === n || strip(x.basename) + ".md" === n); if (f && (!f.stat || f.stat.size > 0)) return f; }
  return app.vault.getMarkdownFiles().find(f => (app.metadataCache.getFileCache(f)?.headings || []).some(h => re.test(h.heading))) || null;
};
const GHID = { ro: findBy(["02. Texere – Vault-ul cercetătorului.md", "01. Texere – Cercetare, lectură și scris, într-un singur loc.md", "Vault-ul cercetătorului.md", "Cercetare, lectură și scris, într-un singur loc.md", "Cercetarea într-un singur loc.md"], /Termeni folosiți în ghid/), en: findBy(["01. Texere – The Researcher's Vault.md", "02. Texere – Research, reading and writing, in one place.md", "The Researcher's Vault.md", "Research, reading and writing, in one place.md", "Research in One Place.md"], /Terms used in this guide/) };
const ghidTxt = { ro: GHID.ro ? await app.vault.cachedRead(GHID.ro) : "", en: GHID.en ? await app.vault.cachedRead(GHID.en) : "" };
const ghidVer = String(app.metadataCache.getFileCache(GHID.ro || GHID.en || {})?.frontmatter?.version || "");
const gl = () => (ghidTxt[lang] ? lang : (ghidTxt.ro ? "ro" : "en"));

// ce nu se poate face automat ajunge în raport, împreună cu pasul din ghid care îl rezolvă
// ref: { step: n } = pasul n din „8.1 Configurarea manuală”; { row: M(ro, en) } = rândul din tabelul de erori (8.2)
const secLines = (txt, num) => {
  const A = txt.split("\n"), i = A.findIndex(l => new RegExp("^#{2,6}\\s+" + num.replace(".", "\\.") + "\\s").test(l));
  if (i < 0) return [];
  let j = i + 1; while (j < A.length && !/^#{1,6}\s/.test(A[j])) j++;
  return A.slice(i + 1, j);
};
const guideFix = ref => {
  const txt = ghidTxt[gl()]; if (!ref || !txt) return "";
  if (ref.step) {
    const A = secLines(txt, "8.1"), i = A.findIndex(l => l.startsWith(ref.step + ". "));
    if (i < 0) return "";
    let j = i + 1; while (j < A.length && /^(\t|  )/.test(A[j])) j++;
    let out = `**${tx(M(`Pasul ${ref.step} din configurarea manuală`, `Step ${ref.step} of the manual setup`))}**\n\n` + [A[i].replace(/^\d+\.\s*/, "")].concat(A.slice(i + 1, j).map(l => l.replace(/^(\t|    |  )/, ""))).join("\n");
    if (ref.step === 5) { const k = A.findIndex(l => /^> \[!tip\] (Cum afli locația|How to find the vault)/.test(l)); if (k >= 0) { let e = k; while (e < A.length && A[e].startsWith(">")) e++; out += "\n\n" + A.slice(k, e).join("\n"); } }
    return out;
  }
  if (ref.row) {
    const row = secLines(txt, "8.2").find(l => l.startsWith("|") && l.includes(tx(ref.row)));
    if (!row) return "";
    const c = row.split("|").map(x => x.trim()).filter(Boolean);
    const head = c[0].replace(/\*\*/g, ""); return `**${head.charAt(0).toUpperCase() + head.slice(1)}**\n- ${tx(M("De ce", "Why"))}: ${c[1]}\n- ${tx(M("Ce faci", "What to do"))}: ${c[2]}`;
  }
  return "";
};
const refLabel = ref => tx(ref?.step ? M(`pasul ${ref.step} din ghid`, `step ${ref.step} in the guide`) : ref?.row ? M("tabelul de erori din ghid", "the error table in the guide") : "");
const REPORT = "Setup report";   // un singur raport, cu nume în engleză (conținutul urmează limba aleasă)
// „Începe aici”: etapele de lucru și secțiunea din ghid pentru fiecare (în fereastră și în raport)
const START = [
  ["3", M("Adaugi o sursă", "Add a source")],
  ["4", M("Citești și evidențiezi pasajele importante", "Read and highlight the key passages")],
  ["5", M("Scrii și citezi", "Write and cite")],
  ["6", M("Generezi bibliografia și exporți în Word sau PDF", "Build the bibliography and export to Word or PDF")],
];
const secHead = num => ((ghidTxt[gl()] || "").match(new RegExp("^#{2,3}\\s+(" + num + "\\.\\s[^\\n]+?)\\s*$", "m")) || [])[1];

// ---------- pașii afișați în fereastră ----------
const STEPS = [
  { icon: "languages", label: M("Limba", "Language"), title: M("Alege limba", "Choose the language"), ask: true,
    what: M("Configurarea, raportul și butonul Ajutor vor folosi limba aleasă. O poți schimba oricând din colțul ferestrei.", "The setup, the report and the Help button will use the language you choose. You can change it any time from the corner of the window.") },
  { icon: "puzzle", label: M("Pluginuri", "Plugins"), title: M("Verific pluginurile", "Checking the plugins"),
    what: M("Verific dacă pluginurile necesare sunt pornite.", "I check that the plugins the guide needs are on.") },
  { icon: "book-open", label: M("Bibliografie", "Bibliography"), title: M("Generez bibliografia", "Generating the bibliography"),
    what: M("Adun sursele din References într-o listă. Din ea se fac citările.", "I gather the sources in References into one list. Citations are made from it.") },
  { icon: "search", label: M("Programe", "Programs"), title: M("Caut programele pentru export", "Looking for the export programs"),
    what: M("Caut Pandoc (pentru Word și PDF) și LaTeX (doar pentru PDF).", "I look for Pandoc (for Word and PDF) and LaTeX (only for PDF).") },
  { icon: "download", label: M("Export", "Export"), title: M("Pregătesc exportul", "Setting up export"), ask: true,
    what: M("Pregătesc exportul pentru acest laptop. Tu alegi doar folderul.", "I set up export for this laptop. You only choose the folder.") },
  { icon: "life-buoy", label: M("Ajutor", "Help"), title: M("Pornesc butonul Ajutor", "Turning on the Help button"),
    what: M("Pornesc butonul Ajutor și închiderea capitolelor din ghid.", "I turn on the Help button and chapter folding in the guide.") },
  { icon: "flag", label: M("Gata", "Done"), title: M("Gata", "All done"), what: "" },
];
const N = STEPS.length - 1;               // pașii propriu-ziși (fără „Gata”)
STEPS.forEach(s => { s.items = []; s.state = "pending"; s.doing = null; });
const ok = [], todo = [], tech = [];
const techAdd = (label, value) => tech.push([label, value]);
let cur = 0, finished = false, report = null;
const openReport = async () => {
  if (!report) return;
  const ex = app.workspace.getLeavesOfType("markdown").find(l => l.view && l.view.file === report);
  if (ex) app.workspace.setActiveLeaf(ex, { focus: true }); else await app.workspace.getLeaf("tab").openFile(report);
};

// ---------- fereastra ----------
try {
  if (!document.getElementById("ghid-onb-css")) {
    const st = document.createElement("style"); st.id = "ghid-onb-css";
    st.textContent = "@keyframes ghid-spin{to{transform:rotate(360deg)}}.ghid-spin{display:inline-flex;animation:ghid-spin 1s linear infinite}"
      + ".ghid-optiune:hover,.ghid-optiune:focus{background:var(--background-modifier-hover);border-color:var(--interactive-accent)!important;outline:none}"
      + ".ghid-pas{cursor:pointer}.ghid-pas:hover .ghid-cerc{border-color:var(--interactive-accent)}.ghid-lang span{cursor:pointer;padding:1px 7px;border-radius:4px}"
      + "@keyframes ghid-ring{0%{transform:scale(.9);opacity:.9}100%{transform:scale(1.6);opacity:0}}.ghid-ring{position:absolute;inset:-2px;border-radius:50%;border:2px solid var(--interactive-accent);animation:ghid-ring 1.4s ease-out infinite;pointer-events:none}";
    document.head.appendChild(st);
  }
} catch (e) {}
const COLOR = { pending: "var(--background-modifier-border)", running: "var(--interactive-accent)", ask: "var(--interactive-accent)", done: "var(--color-green, #2e9e5b)", warn: "var(--color-orange, #d97706)" };
const STATE = { pending: M("Urmează", "Up next"), running: M("Lucrez automat", "Working automatically"), ask: M("Rândul tău", "Your turn"), done: M("Gata", "Done"), warn: M("Ai ceva de făcut", "Something for you to do") };
// text cu **îngroșat** și `cod`, fără Markdown complet
const rich = (el, s) => { String(s).split(/(\*\*[^*]+\*\*|`[^`]+`|\x5B[^\]]+\]\([^)]+\))/).forEach(p => {
  if (/^\*\*/.test(p)) el.createEl("strong", { text: p.slice(2, -2) });
  else if (/^`/.test(p)) el.createEl("code", { text: p.slice(1, -1) });
  else if (/^\[/.test(p)) { const m = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/); const a = el.createEl("a", { text: m[1], href: m[2] }); a.onclick = e => { e.preventDefault(); window.open(m[2]); }; }
  else if (p) el.appendText(p);
}); };

class Onboarding extends ob.Modal {
  constructor() { super(app); this.sel = 0; this.closed = false; this.ask = null; }
  onOpen() {
    const m = this.modalEl; m.style.width = "min(760px, 92vw)"; m.style.height = "min(640px, 86vh)"; m.style.maxHeight = "86vh";
    const c = this.contentEl; c.style.cssText = "display:flex;flex-direction:column;height:100%;overflow:hidden";
    const h = c.createDiv(); h.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:4px";
    const ic = h.createSpan(); ob.setIcon(ic, "settings"); ic.style.cssText = "display:inline-flex;color:var(--interactive-accent)";
    this.titleEl2 = h.createSpan(); this.titleEl2.style.cssText = "font-size:1.2em;font-weight:600;flex:1";
    this.langEl = h.createDiv(); this.langEl.addClass("ghid-lang");
    this.langEl.style.cssText = "display:flex;gap:2px;font-size:0.75em;border:1px solid var(--background-modifier-border);border-radius:6px;padding:2px;margin-right:28px";
    this.stepEl = c.createDiv(); this.stepEl.style.cssText = "position:relative;display:flex;margin:18px 0 14px";
    this.panelEl = c.createDiv(); this.panelEl.style.cssText = "flex:1;min-height:0;overflow-y:auto;border:1px solid var(--background-modifier-border);border-radius:8px;padding:14px 16px";
    this.footEl = c.createDiv(); this.footEl.style.cssText = "display:flex;align-items:center;gap:8px;padding-top:12px;flex-wrap:wrap";
    try { this.scope.register([], "ArrowLeft", () => { this.go(-1); return false; }); this.scope.register([], "ArrowRight", () => { this.go(1); return false; }); } catch (e) {}
    this.render();
  }
  // cel mai îndepărtat pas la care s-a ajuns; pașii de după el nu se pot deschide încă
  reach() { let r = 0; STEPS.forEach((s, i) => { if (s.state !== "pending") r = i; }); return r; }
  go(d) { const i = Math.max(0, Math.min(this.reach(), this.sel + d)); if (i !== this.sel) { this.sel = i; this.render(); } }
  follow(i) { this.sel = i; this.render(); }
  render() {
    if (this.closed || !this.panelEl) return;
    this.titleEl2.setText(tx(M("Texere · Configurare automată", "Texere · Automatic setup")));
    // comutatorul de limbă: discret, sus în dreapta
    this.langEl.empty();
    ["ro", "en"].forEach(l => {
      const b = this.langEl.createSpan({ text: l.toUpperCase() });
      b.style.cssText = l === lang ? "background:var(--background-modifier-hover);color:var(--text-normal);font-weight:600" : "color:var(--text-faint)";
      b.onclick = () => { setLang(l); this.render(); };
    });
    this.renderSteps(); this.renderPanel(); this.renderFoot();
  }
  renderSteps() {
    const e = this.stepEl; e.empty();
    const line = e.createDiv(); line.style.cssText = "position:absolute;top:14px;left:7%;right:7%;height:2px;background:var(--background-modifier-border)";
    const doneN = STEPS.filter(s => s.state === "done" || s.state === "warn").length;
    const fill = line.createDiv(); fill.style.cssText = `height:100%;width:${Math.min(100, 100 * doneN / N)}%;background:var(--interactive-accent);transition:width .3s`;
    STEPS.forEach((s, i) => {
      const open = i <= this.reach();
      const it = e.createDiv(); if (open) it.addClass("ghid-pas"); it.style.cssText = "flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;position:relative;min-width:0" + (open ? "" : ";cursor:default");
      const circ = it.createDiv(); circ.addClass("ghid-cerc");
      const filled = s.state === "done" || s.state === "warn" || s.state === "ask";
      circ.style.cssText = `position:relative;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.85em;font-weight:600;border:2px solid ${COLOR[s.state]};`
        + `background:${filled ? COLOR[s.state] : "var(--background-primary)"};color:${filled ? "#fff" : (s.state === "running" ? "var(--interactive-accent)" : "var(--text-muted)")};`
        + (i === this.sel ? "box-shadow:0 0 0 4px var(--background-modifier-hover);" : "");
      if (s.state === "running") { const sp = circ.createSpan(); sp.addClass("ghid-spin"); ob.setIcon(sp, "loader"); }
      else if (s.state === "ask") { const sp = circ.createSpan(); sp.addClass("ghid-spin"); ob.setIcon(sp, "loader"); circ.createSpan().addClass("ghid-ring"); circ.setAttr("title", tx(M("Aștept alegerea ta", "Waiting for you"))); }   // așteaptă după tine: rotiță + inel care pulsează
      else if (s.state === "done") ob.setIcon(circ, "check");
      else if (s.state === "warn") circ.setText("!");
      else if (i === N) ob.setIcon(circ, "flag");
      else circ.setText(String(i + 1));
      const lb = it.createDiv({ text: tx(s.label) });
      lb.style.cssText = `font-size:0.75em;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;color:${i === this.sel ? "var(--text-normal)" : "var(--text-muted)"};${i === this.sel ? "font-weight:600" : ""}`;
      if (open) it.onclick = () => { this.sel = i; this.render(); };
    });
  }
  renderPanel() {
    const p = this.panelEl, s = STEPS[this.sel]; p.empty();
    const top = p.createDiv(); top.style.cssText = "display:flex;align-items:center;gap:8px;font-size:0.8em;color:var(--text-muted);margin-bottom:6px";
    top.createSpan({ text: this.sel < N ? tx(M(`Pasul ${this.sel + 1} din ${N}`, `Step ${this.sel + 1} of ${N}`)) : tx(M("Rezumat", "Summary")) });
    const chip = top.createSpan({ text: tx(STATE[s.state]) });
    chip.style.cssText = `padding:1px 8px;border-radius:10px;border:1px solid ${COLOR[s.state]};` + (s.state === "ask" ? "background:var(--interactive-accent);color:#fff;font-weight:600" : `color:${s.state === "pending" ? "var(--text-muted)" : COLOR[s.state]}`);
    const t = p.createDiv(); t.style.cssText = "display:flex;align-items:center;gap:8px;font-size:1.1em;font-weight:600;margin-bottom:4px";
    const ti = t.createSpan(); ob.setIcon(ti, s.icon); ti.style.cssText = "display:inline-flex;color:var(--text-muted)";
    t.createSpan({ text: this.sel === N && finished ? tx(todo.length ? M("Aproape gata", "Almost ready") : M("Totul e pregătit. Cum vrei să continui?", "Everything is ready. How would you like to continue?")) : tx(s.title) });
    const w = p.createDiv(); w.style.cssText = "color:var(--text-muted);font-size:0.9em;line-height:1.45;margin-bottom:12px";
    w.setText(tx(s.what)); if (!tx(s.what)) w.style.display = "none";
    const row = (icon, color, text, spin) => {
      const r = p.createDiv(); r.style.cssText = "display:flex;gap:10px;align-items:flex-start;padding:5px 0;line-height:1.4";
      const i2 = r.createSpan(); ob.setIcon(i2, icon); i2.style.cssText = `display:inline-flex;flex-shrink:0;margin-top:1px;color:${color}`; if (spin) i2.addClass("ghid-spin");
      const d = r.createDiv(); d.style.cssText = "word-break:break-word"; rich(d, text); return r;
    };
    if (this.sel === N) return this.renderSummary(p, row);
    s.items.forEach(x => x.t === "ok" ? row("check", COLOR.done, tx(x.msg)) : x.t === "todo" ? this.todoRow(row, x) : row("minus", "var(--text-faint)", tx(x.msg)));
    if (s.doing) row("loader", "var(--interactive-accent)", tx(s.doing), true);
    if (s.state === "pending") { const n = p.createDiv({ text: tx(s.ask ? M("Urmează. Îl fac automat, apoi îți cer o alegere.", "Coming up. I'll do it automatically, then ask you one thing.") : M("Urmează. Îl fac automat.", "Coming up. I'll do it automatically.")) }); n.style.cssText = "color:var(--text-faint);font-size:0.9em"; }
    if (this.ask && this.sel === this.ask.step) this.renderAsk(p);
  }
  todoRow(row, x) {
    const r = row("alert-triangle", COLOR.warn, tx(x.msg));
    if (x.you) { const y = r.lastChild.createDiv(); y.style.cssText = "margin-top:2px"; const b = y.createEl("strong", { text: tx(M("Tu: ", "You: ")) }); b.style.color = COLOR.warn; rich(y, tx(x.you)); }
  }
  renderAsk(p) {
    const a = this.ask;
    const q = p.createDiv(); q.style.cssText = "display:flex;align-items:center;gap:10px;margin:14px 0 6px;padding:4px 0 4px 12px;border-left:3px solid var(--interactive-accent);font-weight:600";
    const qi = q.createSpan(); ob.setIcon(qi, "mouse-pointer-click"); qi.style.cssText = "display:inline-flex;color:var(--interactive-accent)";
    q.createSpan({ text: tx(a.q) });
    if (a.note) { const n = p.createDiv({ text: tx(a.note) }); n.style.cssText = "color:var(--text-error);font-size:0.9em;margin:2px 0"; }
    a.opts.forEach(o => {
      const r = p.createDiv(); r.setAttr("tabindex", "0"); r.addClass("ghid-optiune");
      r.style.cssText = "display:flex;align-items:center;gap:14px;padding:12px 14px;margin:8px 0;border:1px solid var(--background-modifier-border);border-radius:8px;cursor:pointer";
      if (o.tip) r.setAttr("title", o.tip);
      const ic = r.createSpan(); ob.setIcon(ic, o.icon); ic.style.cssText = "display:flex;flex-shrink:0;color:var(--text-muted)";
      const t = r.createDiv();
      const l = t.createDiv({ text: tx(o.label) }); l.style.fontWeight = "500";
      if (o.rec) { const tag = l.createSpan({ text: "  · " + tx(M("recomandat", "recommended")) }); tag.style.cssText = "color:var(--text-accent);font-weight:400;font-size:0.85em"; }
      if (o.desc) { const d = t.createDiv({ text: tx(o.desc) }); d.style.cssText = "font-size:0.85em;color:var(--text-muted);word-break:break-all"; }
      const pick = () => { const res = a.resolve; this.ask = null; res(o.v); this.render(); };
      r.onclick = pick;
      r.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } };
    });
  }
  renderSummary(p, row) {
    if (!finished) { const n = p.createDiv({ text: tx(M("Rezumatul apare când termin toți pașii.", "The summary appears when I finish all steps.")) }); n.style.cssText = "color:var(--text-faint);font-size:0.9em"; return; }
    if (todo.length) {
      const h = p.createDiv({ text: tx(M("Ce ai de făcut tu:", "What you need to do:")) }); h.style.cssText = "font-weight:600;margin:10px 0 2px";
      todo.forEach(x => this.todoRow(row, x));
    }
    this.renderStart(p);
    const r = p.createDiv(); r.style.cssText = "margin-top:14px;color:var(--text-muted);font-size:0.85em";
    const rn = report ? report.basename : tx(REPORT);
    rich(r, tx(M(`Detaliile sunt în nota **${rn}**.`, `Details are in the **${rn}** note.`)));
  }
  // „Începe aici”: etapele de lucru, cu link către secțiunea din ghid (în limba aleasă)
  renderStart(p) {
    const f = GHID[gl()] || GHID.ro || GHID.en;
    const h = p.createDiv({ text: tx(todo.length ? M("Apoi, începe aici:", "Then, start here:") : M("Începe aici:", "Start here:")) }); h.style.cssText = "font-weight:600;margin:14px 0 4px";
    START.forEach(([num, label], i) => {
      const sec = secHead(num);
      const r = p.createDiv(); r.setAttr("tabindex", "0"); r.addClass("ghid-optiune");
      r.style.cssText = "display:flex;align-items:center;gap:12px;padding:6px 12px;margin:5px 0;border:1px solid var(--background-modifier-border);border-radius:8px;cursor:pointer";
      const n = r.createDiv({ text: String(i + 1) });
      n.style.cssText = "width:22px;height:22px;flex-shrink:0;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.8em;font-weight:600;color:var(--interactive-accent);border:1.5px solid var(--interactive-accent)";
      const tx2 = r.createDiv(); tx2.style.cssText = "flex:1;min-width:0";
      const l = tx2.createDiv({ text: tx(label) }); l.style.fontWeight = "500";
      if (sec) { const d = tx2.createDiv({ text: sec }); d.style.cssText = "font-size:0.85em;color:var(--text-accent)"; }
      const ar = r.createSpan(); ob.setIcon(ar, "arrow-right"); ar.style.cssText = "display:flex;flex-shrink:0;color:var(--text-muted)";
      const go = () => { if (!f) return; this.close(); app.workspace.getLeaf(true).openFile(f, sec ? { eState: { subpath: "#" + sec } } : {}).catch(() => {}); };
      r.onclick = go; r.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } };
    });
    // întrebări: butonul Ajutor
    const q = p.createDiv(); q.style.cssText = "margin-top:10px;font-size:0.9em";
    q.appendText(tx(M("Ai o întrebare? Deschide ", "Have a question? Open ")));
    const a = q.createEl("a", { text: tx(M("Ajutor", "Help")), href: "#" });
    a.onclick = e => { e.preventDefault(); this.close(); if (window.__ghidAsk) window.__ghidAsk(lang); else new ob.Notice(tx(M("Butonul Ajutor pornește în câteva secunde.", "The Help button starts in a few seconds."))); };
    q.appendText(tx(M(" (colacul din bara din stânga).", " (the life buoy in the left sidebar).")));
  }
  renderFoot() {
    const f = this.footEl; f.empty();
    // autor și contact, discret
    const cr = f.createDiv(); cr.style.cssText = "flex:1;font-size:0.75em;color:var(--text-faint);min-width:180px";
    cr.appendText(tx(M("Creat de ", "Created by ")));
    const link = (text, url) => { const a = cr.createEl("a", { text, href: url }); a.style.color = "var(--text-muted)"; a.onclick = e => { e.preventDefault(); window.open(url); }; };
    link("George Mihai", "https://www.georgemihai.com"); cr.appendText(" · "); link("hi@georgemihai.com", "mailto:hi@georgemihai.com");
    const btn = (label, fn, opt = {}) => { const b = f.createEl("button", { text: label }); if (opt.cta) b.addClass("mod-cta"); if (opt.off) b.disabled = true; b.onclick = fn; return b; };
    btn("← " + tx(M("Înapoi", "Back")), () => this.go(-1), { off: this.sel === 0 });
    btn(tx(M("Înainte", "Next")) + " →", () => this.go(1), { off: this.sel >= this.reach() });
    if (finished) btn(tx(M(restart ? "Închide, citește raportul și repornește Obsidian" : "Închide și citește raportul", restart ? "Close, read the report and restart Obsidian" : "Close and read the report")), async () => {
      this.close();
      try { await openReport(); } catch (e) {}
      if (restart) { try { await app.workspace.saveLayout?.(); } catch (e) {} setTimeout(() => { try { app.commands.executeCommandById("app:reload"); } catch (e) { window.location.reload(); } }, 600); }
    }, { cta: true });
  }
  onClose() { this.closed = true; this.contentEl.empty(); if (this.ask) { const r = this.ask.resolve; this.ask = null; r(null); } }
}
const ui = new Onboarding();
try { ui.open(); } catch (e) { ui.closed = true; }

const begin = async i => { if (ui.closed) throw STOP; cur = i; STEPS[i].state = "running"; ui.follow(i); await pause(250); };
const end = async () => { const s = STEPS[cur]; s.doing = null; s.state = s.items.some(x => x.t === "todo") ? "warn" : "done"; ui.render(); await pause(450); };
const doing = msg => { STEPS[cur].doing = msg; ui.render(); };
const done = msg => { ok.push(msg); STEPS[cur].doing = null; STEPS[cur].items.push({ t: "ok", msg }); ui.render(); };
const fix = (msg, you, ref) => { todo.push({ msg, you, ref: ref || null }); STEPS[cur].doing = null; STEPS[cur].items.push({ t: "todo", msg, you }); ui.render(); };
const info = msg => { STEPS[cur].items.push({ t: "info", msg }); ui.render(); };
// alegerea din fereastră; dacă fereastra e închisă, întoarce null (se folosește folderul Export)
const EXP = 4;   // pasul Export
const STOP = new Error("texere-stop");   // fereastra a fost închisă: configurarea se oprește
let restart = false;                     // limba Obsidian se schimbă după repornire
const choose = (opts, note, step = EXP, q = M("Selectează locația unde salvez fișierele exportate:", "Select the location where I save exported files:")) => new Promise((resolve, reject) => {
  if (ui.closed) return reject(STOP);
  STEPS[step].state = "ask"; STEPS[step].doing = null;
  ui.ask = { step, q, opts, note, resolve: v => { if (v === null && ui.closed) return reject(STOP); STEPS[step].state = "running"; resolve(v); } }; ui.follow(step);
});

try {

// 1. Limba: prima alegere a ta
await begin(0);
const lgPick = await choose([{ v: "ro", icon: "languages", label: "Română" }, { v: "en", icon: "languages", label: "English" }], null, 0,
  "Alege limba configurării · Choose the setup language:");
if (lgPick) setLang(lgPick);
STEPS[0].items.push({ t: "ok", msg: M("Configurarea continuă în română.", "The setup continues in English.") });
// limba Obsidian urmează limba aleasă (română = "ro"; engleză = fără setare, adică limba implicită)
try {
  const want = lang === "ro" ? "ro" : "", now = window.localStorage.getItem("language") || "";
  if (want !== now) {
    if (want) window.localStorage.setItem("language", want); else window.localStorage.removeItem("language");
    restart = true;
    STEPS[0].items.push({ t: "ok", msg: M("Obsidian va fi în română după repornire.", "Obsidian will be in English after a restart.") });
  }
} catch (e) {}
ui.render();
await end();

// 2. Pluginurile
await begin(1);
const P = app.plugins.plugins, bib = P["biblib"], pan = P["obsidian-pandoc"];
const miss = [!bib && "BibLib", !pan && "Pandoc Plugin"].filter(Boolean);
if (miss.length) fix(M(`Nu sunt pornite: ${miss.join(", ")}.`, `Not turned on: ${miss.join(", ")}.`),
  M("pornește-le din Settings → Community plugins, apoi rulează din nou configurarea.", "turn them on in Settings → Community plugins, then run the setup again."), { step: 2 });
else done(M("Pluginurile de care ai nevoie sunt pornite.", "The plugins you need are on."));
await end();

// 2. Bibliografia (pasul 3 din ghid)
await begin(2);
if (!bib) info(M("Sărit: BibLib nu e pornit.", "Skipped: BibLib isn't on."));
else try {
  doing(M("Setez eticheta notelor de literatură…", "Setting the literature note tag…"));
  bib.settings.literatureNoteTag = "literature_note, #literature_note";
  await bib.saveSettings();
  techAdd(M("Eticheta notelor de literatură", "Literature note tag"), "`literature_note, #literature_note`");
  doing(M("Adun sursele din References…", "Gathering the sources in References…"));
  app.commands.executeCommandById("biblib:build-bibliography");
  await pause(2500);
  let n = 0;
  try { n = JSON.parse(await ad.read("biblib/bibliography.json")).length; } catch (e) {}
  const refs = app.vault.getMarkdownFiles().filter(f => f.path.startsWith("References/")).length;
  // sursele-exemplu din vault (păstrate ca model; se pot șterge după configurare)
  const EX = ["blackburn_think_2001", "constantinescu_understanding_2021", "craig_philosophy_2002", "dummett_origins_1996", "vica_constantin_avatarobots_2026"];
  const nEx = app.vault.getMarkdownFiles().filter(f => f.path.startsWith("References/") && EX.includes(f.basename.replace(/^@/, ""))).length;
  if (n >= refs) done(nEx && n <= nEx
    ? M(`Lista surselor e gata: ${n} surse-exemplu, păstrate ca să vezi cum arată o notă de literatură. Le poți șterge după configurare.`, `The source list is ready: ${n} example sources, kept to show what a literature note looks like. You can delete them after setup.`)
    : nEx ? M(`Lista surselor tale e gata: ${n} surse, dintre care ${nEx} exemple (le poți șterge).`, `Your source list is ready: ${n} sources, ${nEx} of them examples (you can delete those).`)
    : M(`Lista surselor tale e gata: ${n} ${n === 1 ? "sursă" : "surse"}, pe care le poți cita.`, `Your source list is ready: ${n} ${n === 1 ? "source" : "sources"} you can cite.`));
  else fix(M(`Am găsit ${n} surse, dar în References sunt ${refs} note.`, `I found ${n} sources, but References has ${refs} notes.`),
           M("adaugă eticheta literature_note notelor care nu o au, apoi rulează din nou configurarea.", "add the literature_note tag to the notes that lack it, then run the setup again."), { step: 3 });
} catch (e) { fix(M(`Nu am putut face bibliografia (${e.message}).`, `I couldn't build the bibliography (${e.message}).`), M("urmează pasul 3 din ghid.", "follow step 3 in the guide."), { step: 3 }); }
await end();

// 3. Programele pentru export (pasul 4 din ghid)
await begin(3);
doing(M("Caut Pandoc și LaTeX pe acest laptop…", "Looking for Pandoc and LaTeX on this laptop…"));
await pause(300);
let pandocPath = null, texPath = null;
try { pandocPath = find("pandoc", pandocC); texPath = find("xelatex", texC); } catch (e) {}
if (pandocPath) { done(M("Poți exporta în Word (Pandoc e instalat).", "You can export to Word (Pandoc is installed).")); techAdd("Pandoc", "`" + pandocPath + "`"); }
else fix(M("Pandoc nu e instalat, deci exportul nu merge.", "Pandoc isn't installed, so export won't work."),
         M("instalează [Pandoc](https://pandoc.org/installing.html), apoi rulează din nou configurarea.", "install [Pandoc](https://pandoc.org/installing.html), then run the setup again."), { step: 4 });
const texName = isWin ? "MiKTeX" : "MacTeX", texUrl = isWin ? "https://miktex.org/download" : "https://tug.org/mactex/";
if (texPath) { done(M("Poți exporta și în PDF (LaTeX e instalat).", "You can also export to PDF (LaTeX is installed).")); techAdd("LaTeX", "`" + texPath + "`"); }
else fix(M("LaTeX nu e instalat, deci exportul în PDF nu merge (Word merge).", "LaTeX isn't installed, so PDF export won't work (Word will)."),
         M(`instalează [${texName}](${texUrl}), apoi rulează din nou configurarea.`, `install [${texName}](${texUrl}), then run the setup again.`), { step: 4 });
await end();

// 4. Setările exportului (pasul 5 din ghid)
await begin(4);
if (!pan) info(M("Sărit: Pandoc Plugin nu e pornit.", "Skipped: Pandoc Plugin isn't on."));
else try {
  doing(M("Pregătesc exportul pentru acest laptop…", "Setting up export for this laptop…"));
  const s = pan.settings;
  const old = (s.extraArguments || "").split("\n").map(l => l.trim()).filter(Boolean);
  const oldCsl = old.find(l => l.startsWith("--csl="));
  let cslName = oldCsl ? oldCsl.split(/[\\/]/).pop() : "apa.csl";
  if (!exists(join(base, "biblib", cslName))) cslName = "apa.csl";
  const known = /^--(citeproc$|defaults=|bibliography=|csl=|from=|metadata=link-citations|pdf-engine=|shift-heading-level-by=)/;
  const engine = texPath || (isWin ? "xelatex" : "/Library/TeX/texbin/xelatex");
  // Pandoc Plugin împarte argumentele la spații, deci o cale cu spații (ex. „Texere EN”) strică exportul.
  // Căile (bibliografia, stilul, LaTeX, folderul Media pentru imagini) merg într-un fișier „defaults” din folderul Pandoc, folosit după nume: --defaults=texere-…
  const home = env.HOME || env.USERPROFILE || "";
  const pdDir = isWin ? join(env.APPDATA || join(home, "AppData", "Roaming"), "pandoc")
    : (exists(join(home, ".pandoc")) ? join(home, ".pandoc") : join(env.XDG_DATA_HOME || join(home, ".local", "share"), "pandoc"));
  const dfName = "texere-" + base.split("").reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36);
  const q = v => JSON.stringify(v);   // un șir JSON e și un șir YAML valid
  let dfOk = false;
  try {
    fs.mkdirSync(join(pdDir, "defaults"), { recursive: true });
    fs.writeFileSync(join(pdDir, "defaults", dfName + ".yaml"), [`bibliography: ${q(join(base, "biblib", "bibliography.json"))}`, `csl: ${q(join(base, "biblib", cslName))}`, `pdf-engine: ${q(engine)}`, `resource-path: [${q(".")}, ${q(join(base, "Media"))}, ${q(base)}]`].join("\n") + "\n");
    dfOk = true; techAdd(M("Fișier Pandoc defaults", "Pandoc defaults file"), "`" + join(pdDir, "defaults", dfName + ".yaml") + "`");
  } catch (e) {}
  s.extraArguments = (dfOk ? ["--citeproc", `--defaults=${dfName}`]
      : ["--citeproc", `--bibliography=${join(base, "biblib", "bibliography.json")}`, `--csl=${join(base, "biblib", cslName)}`, `--pdf-engine=${engine}`])
    .concat(["--from=markdown+wikilinks_title_after_pipe", "--metadata=link-citations:true", "--shift-heading-level-by=-1", ...old.filter(l => !known.test(l))]).join("\n");
  s.pandoc = pandocPath || "";
  await pause(300);
  done(M("Exportul e pregătit pentru acest laptop.", "Export is set up for this laptop."));
  techAdd(M("Stil de citare", "Citation style"), `${cslName.replace(/\.csl$/, "").toUpperCase()} (\`${cslName}\`)`);
  const prev = s.outputFolder && exists(s.outputFolder) ? s.outputFolder : "";
  const opts = [
    { v: "export", icon: "folder-open", label: M("Folderul Export din Obsidian", "The Export folder in Obsidian"), rec: true },
    { v: "pick", icon: "folder-open", label: M("Alege un fișier", "Choose a folder") },
  ];
  // „același folder ca data trecută” apare doar dacă e altul decât folderul Export
  const prevName = prev.replace(/[\\/]+$/, "").split(/[\\/]/).pop();
  if (prev && prev.replace(/[\\/]+$/, "") !== join(base, "Export")) opts.unshift({ v: "keep", icon: "folder-open", label: M(`Folderul de data trecută: ${prevName}`, `Last time's folder: ${prevName}`), tip: prev });
  // fereastra sistemului pentru alegerea unui folder: întoarce calea, "" dacă ai închis-o, null dacă nu se poate deschide
  const pickFolder = async () => {
    let dlg = null;
    for (const get of [() => window.require("electron").remote?.dialog, () => window.require("@electron/remote")?.dialog, () => window.electron?.remote?.dialog]) {
      try { dlg = get(); if (dlg) break; } catch (e) {}
    }
    if (!dlg) return null;
    try {
      const r = await dlg.showOpenDialog({ title: tx(M("Alege folderul pentru fișierele exportate", "Choose the folder for exported files")), properties: ["openDirectory", "createDirectory"] });
      return (!r.canceled && r.filePaths && r.filePaths[0]) || "";
    } catch (e) { return null; }
  };
  const useExport = async () => { if (!app.vault.getAbstractFileByPath("Export")) await app.vault.createFolder("Export"); s.outputFolder = join(base, "Export"); };
  let where = null, picked = "", note = null;
  while (true) {
    where = await choose(opts, note);
    if (where !== "pick") break;
    STEPS[EXP].state = "ask";
    doing(M("Aștept să alegi folderul în fereastra care s-a deschis…", "Waiting for you to choose the folder in the window that opened…"));
    picked = await pickFolder();
    STEPS[EXP].state = "running"; STEPS[EXP].doing = null;
    if (picked) break;
    if (picked === null) {             // fereastra de alegere nu e disponibilă pe acest laptop
      const k = opts.findIndex(o => o.v === "pick"); if (k >= 0) opts.splice(k, 1);
      note = M("Nu pot deschide fereastra pentru alegerea unui folder. Alege folderul Export.", "I can't open the folder picker here. Choose the Export folder.");
    } else note = null;                // ai închis fereastra fără să alegi: arată din nou opțiunile
  }
  doing(M("Salvez alegerea ta…", "Saving your choice…"));
  if (where === "pick") {
    if (picked && fs && !exists(picked)) { try { fs.mkdirSync(picked, { recursive: true }); } catch (e) {} }
    if (picked && (!fs || exists(picked))) s.outputFolder = picked;
    else {
      await useExport();
      fix(M("Nu am putut crea folderul ales, așa că folosesc folderul Export.", "I couldn't create the chosen folder, so I'm using the Export folder."),
          M("dacă vrei alt folder, rulează din nou configurarea.", "if you want another folder, run the setup again."), { step: 5 });
    }
  } else if (where === "keep") s.outputFolder = prev;
  else {
    await useExport();
    // fereastra a fost închisă înainte de alegere: folderul Export e doar o variantă provizorie, iar raportul o spune
    if (where === null) fix(M("Nu ai ales folderul pentru export (ai închis fereastra), așa că am folosit folderul Export.", "You didn't choose the export folder (you closed the window), so I used the Export folder."),
      M("dacă vrei alt folder, rulează din nou configurarea și alege-l.", "if you want another folder, run the setup again and choose it."), null);
  }
  await pan.saveSettings();
  const outName = (s.outputFolder || "").replace(/[\\/]+$/, "").split(/[\\/]/).pop();
  done(s.outputFolder ? M(`Fișierele exportate apar în folderul **${outName}**.`, `Exported files appear in the **${outName}** folder.`) : M("Fișierele exportate apar lângă notă.", "Exported files appear next to the note."));
  if (s.outputFolder) techAdd(M("Folderul pentru export", "Export folder"), "`" + s.outputFolder + "`");
} catch (e) { fix(M(`Nu am putut pregăti exportul (${e.message}).`, `I couldn't set up export (${e.message}).`), M("urmează pasul 5 din ghid.", "follow step 5 in the guide."), { step: 5 }); }
await end();

// 5. Scripturile de pornire: plierea ghidului și butonul Ajutor (startup templates Templater)
await begin(5);
const HELP_ROW = M("lipsește butonul", "**Help** button");
const T = app.plugins.plugins["templater-obsidian"], STARTS = ["Scripts/Guide folding.md", "Scripts/Help.md"].filter(x => app.vault.getAbstractFileByPath(x));
if (!T || !STARTS.length) fix(M("Lipsește folderul Scripts, deci butonul Ajutor nu poate porni.", "The Scripts folder is missing, so the Help button can't start."),
  M("copiază-l din vault-ul original, apoi repornește Obsidian.", "copy it from the original vault, then restart Obsidian."), { row: HELP_ROW });
else try {
  doing(M("Activez scripturile de pornire…", "Turning on the startup scripts…"));
  const loc = app.loadLocalStorage("templater-local-settings") || {};
  if (!loc.enable_startup_templates) app.saveLocalStorage("templater-local-settings", { ...loc, enable_startup_templates: true });
  let add = false; STARTS.forEach(x => { if (!T.settings.startup_templates.includes(x)) { T.settings.startup_templates.push(x); add = true; } });
  if (add) await T.save_settings();
  if (!window.__ghidPliere || !window.__ghidAjutor) setTimeout(() => T.templater.execute_startup_scripts(), 1500);
  await pause(300);
  done(M("Butonul **Ajutor** (colacul din stânga) e pornit: îl apeși când ai o întrebare.", "The **Help** button (the life buoy on the left) is on: click it when you have a question."));
} catch (e) {
  fix(M(`Nu am putut porni butonul Ajutor (${e.message}).`, `I couldn't turn on the Help button (${e.message}).`),
      M("pornește Settings → Templater → Enable startup templates.", "turn on Settings → Templater → Enable startup templates."), { row: HELP_ROW });
}
await end();

} catch (e) {
  if (e === STOP) { new ob.Notice(tx(M("Configurarea s-a oprit. O poți porni oricând: Ctrl/Cmd + P → Texere: Setup.", "Setup stopped. You can start it again any time: Ctrl/Cmd + P → Texere: Setup.")), 8000); return; }
  fix(M(`Configurarea s-a oprit neașteptat (${e.message}).`, `The setup stopped unexpectedly (${e.message}).`),
      M("rulează din nou configurarea; dacă se repetă, urmează pașii din ghid, secțiunea 8.", "run the setup again; if it happens again, follow the steps in section 8 of the guide."), null);
  STEPS.forEach(s => { if (s.state === "running") s.state = "warn"; s.doing = null; });
}

// ține minte că acest laptop e configurat pentru acest vault (pluginul nu mai pornește configurarea singur)
try { app.saveLocalStorage("texere-setup", { version: ghidVer, base, date: tp.date.now("YYYY-MM-DD") }); } catch (e) {}

// ---------- raportul: toate rulările într-o singură notă, fiecare cu data și ora; cea mai recentă e prima ----------
const NAME = tx(REPORT);
const INTRO = tx(M("Fiecare rulare a configurării adaugă aici un raport, cu data și ora. Cel mai recent e primul. Nota poate fi ștearsă oricând.",
                   "Each setup run adds a report here, with date and time. The newest comes first. You can delete this note at any time.")) + "\n\n";
const refs = []; todo.forEach(t => { if (t.ref && !refs.some(r => JSON.stringify(r) === JSON.stringify(t.ref))) refs.push(t.ref); });
const howTo = refs.map(guideFix).filter(Boolean).join("\n\n");
const gName = (GHID[gl()] || {}).basename || "01. Texere – The Researcher's Vault";
const h8 = ((ghidTxt[gl()] || "").match(/^#{2,3}\s+(8\.\s[^\n]+?)\s*$/m) || [])[1] || "8. Dacă ceva nu merge";
const entry = `## ${tp.date.now("YYYY-MM-DD HH:mm")}\n\n`
   // 1. de unde începi
   + `### ${tx(M("Începe aici", "Start here"))}\n\n`
   + START.map(([num, label], i) => { const h = secHead(num); return `${i + 1}. **${tx(label)}**` + (h ? ` → \x5B\x5B${gName}#${h}|${h}]]` : ""); }).join("\n")
   + "\n\n" + tx(M("Ai o întrebare? Apasă butonul **Ajutor** (colacul din bara din stânga) și scrie-o cu cuvintele tale.",
                     "Have a question? Click the **Help** button (the life buoy in the left sidebar) and type it in your own words."))
   // 2. ce ai de făcut tu (doar dacă e ceva) și cum rezolvi, din ghid
   + (todo.length ? `\n\n### ${tx(M("Ce ai de făcut", "What you need to do"))}\n`
       + todo.map(t => `- ${tx(t.msg)}${t.you ? ` **${tx(M("Tu:", "You:"))}** ${tx(t.you)}` : ""}${t.ref ? " " + tx(M("Vezi mai jos", "See below")) + ` (${refLabel(t.ref)}).` : ""}`).join("\n") : "")
   + (howTo ? `\n\n### ${tx(M("Cum rezolvi (din ghid)", "How to fix it (from the guide)"))}\n\n${howTo}\n\n\x5B\x5B${gName}#${h8}|${tx(M("Deschide în ghid", "Open in the guide"))}: ${h8.replace(/^8\.\s*/, "")}]]` : "")
   + (todo.length ? "\n\n" + tx(M("După ce rezolvi, rulează din nou configurarea: **Ctrl/Cmd + P** → **Texere: Setup**.",
                                   "Once fixed, run the setup again: **Ctrl/Cmd + P** → **Texere: Setup**.")) : "")
   // 3. ce am făcut eu, automat
   + `\n\n### ${tx(M("Ce am făcut automat", "Done automatically"))}\n`
   + (ok.length ? ok.map(x => `- ${tx(x)}`).join("\n") : `- ${tx(M("Nimic.", "Nothing."))}`)
   // 4. detalii tehnice, pentru cine are nevoie (închise implicit)
   + `\n\n> [!info]- ${tx(M("Detalii tehnice", "Technical details"))}\n`
   + [ [M("Sistem", "System"), os], ["Vault", "`" + base + "`"], ...tech].map(([k, v]) => `> - ${tx(k)}: ${v}`).join("\n");
const DATE_H = /^## \d{4}-\d{2}-\d{2} \d{2}:\d{2}/m;
// rulările dintr-o notă de raport; rapoartele vechi (fără dată) primesc data ultimei modificări
const entriesOf = async f => {
  let c = (await app.vault.read(f)).replace(/\r/g, "");
  if (!DATE_H.test(c)) {
    c = c.replace(/^# [^\n]*\n/m, "").replace(/Această notă poate fi ștearsă\.\s*/, "").replace(/^## /gm, "### ").trim();
    return c ? [`## ${(ob.moment || window.moment)(f.stat && f.stat.mtime).format("YYYY-MM-DD HH:mm")}\n\n${c}`] : [];
  }
  return c.slice(c.search(DATE_H)).split(/\n(?=## \d{4}-\d{2}-\d{2} \d{2}:\d{2})/).map(e => e.replace(/\n+---\s*$/, "").trim()).filter(Boolean);
};
const self = tp.config.target_file;
const HOME = "Texere";
const home = app.vault.getAbstractFileByPath(HOME) ? HOME : (((GHID[gl()] || {}).parent || {}).path || "");
const inHome = name => (home && home !== "/" ? home + "/" : "") + name;
// raportul nou primește același tip de nume ca ghidul (ex. „03. Texere – Setup report”)
const gb = (GHID.ro || GHID.en || {}).basename || "";
const num = gb.slice(0, gb.length - strip(gb).length).replace(/^\d+/, "03");
// notă temporară = nota goală creată de Templater când scriptul e rulat din „Create new note from template”
const isTemp = !!self && self !== tp.config.template_file && self.path !== (tp.config.template_file || {}).path;
try {
  const old = app.vault.getMarkdownFiles().filter(f => (strip(f.basename) === NAME || strip(f.basename).startsWith(NAME + " ") || strip(f.basename) === "Raport configurare" || strip(f.basename).startsWith("Raport configurare ")) && f !== self);
  const all = [entry];
  for (const f of old) all.push(...await entriesOf(f));
  all.sort((x, y) => y.slice(3, 19).localeCompare(x.slice(3, 19)));
  const body = INTRO + all.join("\n\n---\n\n") + "\n";
  // dacă există mai multe note de raport (ex. „03. Texere – Raport configurare” și „Raport configurare”), se păstrează cea numerotată; celelalte se mută în ea
  report = old.find(f => strip(f.basename) === NAME && f.basename !== NAME) || old.find(f => f.basename === NAME) || null;
  if (report) await app.vault.modify(report, body); else report = await app.vault.create(inHome(num + NAME + ".md"), body);
  // rapoartele separate (de la versiunile anterioare) au fost mutate în raport; merg în coș
  for (const f of old) if (f !== report) { try { await app.vault.trash(f, true); } catch (e) {} }
} catch (e) { report = null; }
if (report) {
  // raportul se deschide în spatele ferestrei; dacă a existat o notă temporară, se șterge (doar dacă e goală)
  setTimeout(async () => {
    try { await openReport(); } catch (e) {}
    try { if (isTemp && self !== report && app.vault.getAbstractFileByPath(self.path) && !(await app.vault.read(self)).trim()) await app.vault.delete(self); } catch (e) {}
  }, isTemp ? 1500 : 300);
} else if (isTemp) {
  // rezervă: raportul rămâne în nota temporară, redenumită cu data
  try { await tp.file.rename(NAME + " " + tp.date.now("YYYY-MM-DD HH-mm-ss")); } catch (e) {}
  tR += INTRO + entry + "\n";
} else {
  // rezervă: o notă separată, cu data în nume (următoarea rulare o mută în raport)
  try { report = await app.vault.create(inHome(`${NAME} ${tp.date.now("YYYY-MM-DD HH-mm-ss")}.md`), INTRO + entry + "\n"); setTimeout(() => openReport().catch(() => {}), 300); }
  catch (e) { new ob.Notice(tx(M(`Nu am putut salva raportul (${e.message}).`, `I couldn't save the report (${e.message}).`)), 10000); }
}

// ultimul pas din fereastră: rezumatul
cur = N; STEPS[N].state = todo.length ? "warn" : "done"; finished = true; ui.follow(N);
if (ui.closed) new ob.Notice(tx(todo.length ? M("Configurarea s-a încheiat. Ai ceva de făcut: citește raportul.", "Setup complete. There's something for you to do: read the report.")
                                             : M("Configurarea s-a încheiat. Citește raportul.", "Setup complete. Read the report.")), 8000);
%>
