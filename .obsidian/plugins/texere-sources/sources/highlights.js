// Texere · Sources · evidențierile din PDF ajung singure în nota sursei, în ordinea din PDF.
// Când evidențiezi în PDF, PDF++ pregătește rândul (eticheta, textul, [@citekey, p. …], linkul PDF) și îl „lipește” (auto-paste).
// Texere preia doar pasul „unde se lipește”:
//  • PDF-ul are o notă → nota se deschide lângă PDF (dacă nu e deja vizibilă) și rândul intră acolo;
//  • nu are notă → te întreabă dacă îl adaugi ca sursă; după ce nota e creată, rândul intră în ea;
//  • are mai multe note → cea vizibilă într-o coloană; altfel te întreabă, și ține minte alegerea cât e deschis PDF-ul.
// Locul din notă: după evidențierea care îl precede în PDF (pagina, apoi poziția pe pagină), după comentariile tale de sub ea;
// prima evidențiere dintr-un PDF merge la sfârșitul secțiunii „Reading Notes” (sau al notei).
//
// PDF-ul e memoria: evidențierile scrise în el (și cele făcute înainte de notă, sau în altă aplicație) se citesc din PDF
// și intră în notă, fiecare la locul ei, cu același format ca rândurile lipite de PDF++ (vezi importFromPdf):
//  • singur: când PDF-ul devine sursă, la pornire și când deschizi nota sau PDF-ul (doar evidențierile la care nu trimite nicio notă);
//  • oricând: „Importă evidențierile din PDF” (comenzi, clic dreapta pe notă sau pe PDF).
// Dacă nota trimite la o evidențiere care a dispărut din pagină, dar mai există în fișier, o pune înapoi.
const obsidian = require("obsidian");
const { Notice, Modal, SuggestModal, TFile, MarkdownView, loadPdfJs } = obsidian;

const LINK = /\[\[([^\]|#]+\.pdf)#([^\]|]+)(?:\|[^\]]*)?\]\]/i;
const LINKS = /\[\[([^\]|#]+\.pdf)#([^\]|]+)(?:\|[^\]]*)?\]\]/gi;
const ANY_PDF_LINK = /\[\[[^\]|#]+\.pdf#[^\]]*\]\]/i;
const HEAD = /^#{1,6}\s/;
const loc = frag => {
  const q = new URLSearchParams(frag), sel = (q.get("selection") || "").split(",").map(Number);
  return { page: +q.get("page") || 0, annot: q.get("annotation") || null, sel: sel.length === 4 && sel.every(n => Number.isFinite(n)) ? sel : null };
};

// ——— textul de sub o evidențiere, citit din PDF ———
const MARKUP = new Set(["Highlight", "Underline", "Squiggly", "StrikeOut"]);
// lățimile literelor (din mie de em) în fonturile cu care pdf.js așază textul selectabil: sans-serif (Helvetica), serif (Times)
const W_HELV = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const W_TIMES = [250,333,408,500,500,833,778,180,333,333,500,564,250,333,250,278,500,500,500,500,500,500,500,500,500,500,278,278,564,564,564,444,921,722,667,667,722,611,556,722,722,333,389,722,611,889,722,722,556,722,667,556,611,722,722,944,722,722,611,333,278,333,469,500,333,444,500,444,500,444,333,500,500,278,278,500,278,778,500,500,500,500,333,389,278,500,500,722,500,500,444,480,200,480,541];
const W_EXTRA = { "‘": [222, 333], "’": [222, 333], "“": [333, 444], "”": [333, 444], "–": [556, 500], "—": [1000, 1000], "…": [1000, 1000], "•": [350, 350], "«": [556, 500], "»": [556, 500], " ": [278, 250] };
const charW = (ch, serif) => {
  const W = serif ? W_TIMES : W_HELV;
  let c = ch.codePointAt(0); if (c >= 32 && c <= 126) return W[c - 32];
  if (W_EXTRA[ch]) return W_EXTRA[ch][serif ? 1 : 0];
  const base = ch.normalize("NFD")[0]; c = base.codePointAt(0); if (c >= 32 && c <= 126) return W[c - 32];
  return c > 0x2e80 ? 1000 : serif ? 500 : 556;
};
// fiecare literă a unui fragment de text, cu centrul ei pe pagină
function layout(it, styles) {
  const chars = Array.from(it.str || ""); if (!chars.length || !it.transform) return { chars: [] };
  const [a, b, c, d, e, f] = it.transform, st = styles?.[it.fontName] || {}, fam = String(st.fontFamily || "");
  const mono = /mono/i.test(fam), serif = !mono && /serif/i.test(fam) && !/sans/i.test(fam);
  const nat = chars.map(ch => (mono ? 600 : charW(ch, serif)));
  const total = nat.reduce((s, x) => s + x, 0) || 1;
  const L = Math.hypot(a, b) || 1, ux = a / L, uy = b / L, fs = Math.hypot(c, d) || it.height || L;
  const len = it.width || (total / 1000) * fs, asc = Number.isFinite(st.ascent) ? st.ascent : 0.8, desc = Number.isFinite(st.descent) ? st.descent : -0.2;
  const mid = fs * (asc + desc) / 2;
  let t = 0; const out = [];
  for (let i = 0; i < chars.length; i++) {
    const w = len * nat[i] / total, m = t + w / 2;
    out.push({ ch: chars[i], w, cx: e + ux * m - uy * mid, cy: f + uy * m + ux * mid });
    t += w;
  }
  return { chars: out, fs, ux, uy };
}
function quadsOf(a) {
  const q = a.quadPoints, out = [];
  const box = (xs, ys) => out.push({ x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) });
  if (q && q.length) {
    if (typeof q[0] === "number") { for (let i = 0; i + 7 < q.length; i += 8) box([q[i], q[i + 2], q[i + 4], q[i + 6]], [q[i + 1], q[i + 3], q[i + 5], q[i + 7]]); }
    else for (const quad of q) if (Array.isArray(quad)) box(quad.map(p => p.x), quad.map(p => p.y));
  }
  if (!out.length && a.rect) box([a.rect[0], a.rect[2]], [a.rect[1], a.rect[3]]);
  // găurile de pe același rând (unele aplicații nu desenează dreptunghiul cuvintelor scurte: „să”, „pe”) se umplu:
  // o selecție e continuă, deci între două bucăți apropiate de pe același rând textul e tot evidențiat
  const real = out.filter(q => q.y1 - q.y0 > 0.5 && q.x1 - q.x0 > 0.5), qs = real.length ? real : out, fill = [];
  for (const q of qs) for (const r of qs) {
    if (r === q || r.x0 < q.x1) continue;
    const h = Math.min(q.y1 - q.y0, r.y1 - r.y0), ov = Math.min(q.y1, r.y1) - Math.max(q.y0, r.y0), gap = r.x0 - q.x1;
    if (h > 0 && ov >= 0.5 * h && gap <= 1.5 * Math.max(q.y1 - q.y0, r.y1 - r.y0) && !qs.some(o => o !== q && o !== r && o.x0 >= q.x1 && o.x1 <= r.x0 && Math.min(o.y1, q.y1) - Math.max(o.y0, q.y0) > 0))
      fill.push({ x0: q.x1, x1: r.x0, y0: Math.max(q.y0, r.y0), y1: Math.min(q.y1, r.y1) });
  }
  return qs.concat(fill);
}
// marginile unui cuvânt prins pe jumătate: cuvântul întreg, dacă a scăpat puțin din el (≤ 2 litere, mai puțin decât s-a prins);
// scos, dacă s-au prins doar 1–2 litere din el; altfel rămâne cum e
function snap(C, inc) {
  const isW = i => i >= 0 && i < C.length && /[\p{L}\p{N}]/u.test(C[i].ch);
  for (let i = 0; i < C.length; i++) {   // începutul unei porțiuni prinse
    if (!inc[i] || (i > 0 && inc[i - 1]) || !isW(i) || !isW(i - 1)) continue;
    let ws = i; while (isW(ws - 1)) ws--;
    let we = i; while (isW(we)) we++;
    let re = i; while (re < C.length && inc[re]) re++;
    const miss = i - ws, got = Math.min(we, re) - i;
    if (miss <= 2 && miss <= got) for (let k = ws; k < i; k++) inc[k] = true;
    else if (got <= 2 && we <= re) for (let k = i; k < we; k++) inc[k] = false;
  }
  for (let i = C.length - 1; i >= 0; i--) {   // sfârșitul unei porțiuni prinse
    if (!inc[i] || (i < C.length - 1 && inc[i + 1]) || !isW(i) || !isW(i + 1)) continue;
    let we = i; while (isW(we + 1)) we++;
    let ws = i; while (isW(ws - 1)) ws--;
    let rs = i; while (rs > 0 && inc[rs - 1]) rs--;
    const miss = we - i, got = i - Math.max(ws, rs) + 1;
    if (miss <= 2 && miss <= got) for (let k = i + 1; k <= we; k++) inc[k] = true;
    else if (got <= 2 && ws >= rs) for (let k = ws; k <= i; k++) inc[k] = false;
  }
}
// literele exact cum le desenează PDF-ul (instrucțiunile paginii + lățimile din font): pozițiile adevărate, nu aproximate
async function glyphRuns(page, pdfjs) {
  const OPS = pdfjs?.OPS; if (!OPS) throw new Error("pdf.js fără OPS");
  const ol = await page.getOperatorList({ annotationMode: pdfjs.AnnotationMode ? pdfjs.AnnotationMode.DISABLE : 0 });
  const mul = (m, n) => [m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3], m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3], m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5]];
  const at = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const mat = a => { const v = a.length >= 6 && typeof a[0] === "number" ? a : a[0]; return v && v.length >= 6 ? Array.from(v).slice(0, 6).map(Number) : [1, 0, 0, 1, 0, 0]; };
  const fonts = new Map(), fontOf = n => { if (!fonts.has(n)) { let f = null; try { f = page.commonObjs.get(n); } catch (e) {} fonts.set(n, f); } return fonts.get(n); };
  let ctm = [1, 0, 0, 1, 0, 0], g = { Tc: 0, Tw: 0, Th: 1, TL: 0, Ts: 0, font: null, fs: 0, dir: 1 }, Tm = [1, 0, 0, 1, 0, 0], x0 = 0, y0 = 0, lx = 0, ly = 0;
  const stack = [], runs = []; let nGlyph = 0, nZero = 0;
  const nextLine = () => { ly -= g.TL; x0 = lx; y0 = ly; };
  const show = glyphs => {
    const f = fontOf(g.font); if (!f || !g.fs || !glyphs) return;
    const fm = f.fontMatrix || [0.001, 0, 0, 0.001, 0, 0], Th = g.Th * g.dir, was = g.fs * fm[0];
    const asc = Number.isFinite(f.ascent) ? f.ascent : 0.8, desc = Number.isFinite(f.descent) ? f.descent : -0.2;
    const M = mul(Tm, ctm), sx = Math.hypot(M[0], M[1]) || 1, sy = Math.hypot(M[2], M[3]) || 1;
    const chars = []; let x = 0;
    for (const gl of glyphs) {
      if (typeof gl === "number") { x += (f.vertical ? 1 : -1) * gl * g.fs / 1000; continue; }
      if (!gl) continue;
      const sp = (gl.isSpace ? g.Tw : 0) + g.Tc, w0 = (gl.width || 0) * was;
      if (!f.vertical) {
        let ch = String(gl.unicode ?? ""); if (/[ﬀ-ﭏ]/.test(ch)) ch = ch.normalize("NFKC");   // ligaturi: ﬁ → fi
        const parts = Array.from(ch), n = parts.length;
        parts.forEach((c, k) => { const [cx, cy] = at(M, x0 + (x + w0 * (k + 0.5) / n) * Th, y0 + g.Ts + g.fs * (asc + desc) / 2); chars.push({ ch: c, cx, cy, w: Math.abs(w0 * Th / n) * sx }); });
      }
      x += f.vertical ? w0 - sp * g.dir : w0 + sp * g.dir;
      nGlyph++; if (!(gl.width > 0) && String(gl.unicode ?? "").trim()) nZero++;
    }
    if (chars.length) runs.push({ chars, fs: g.fs * sy, ux: M[0] / sx, uy: M[1] / sx });
    if (!f.vertical) x0 += x * Th;
  };
  for (let k = 0; k < ol.fnArray.length; k++) {
    const fn = ol.fnArray[k], a = ol.argsArray[k] || [];
    switch (fn) {
      case OPS.save: stack.push({ ctm, g: { ...g } }); break;
      case OPS.restore: { const s = stack.pop(); if (s) { ctm = s.ctm; g = s.g; } break; }
      case OPS.transform: ctm = mul(mat(a), ctm); break;
      case OPS.paintFormXObjectBegin: stack.push({ ctm, g: { ...g } }); if (a[0]) ctm = mul(mat([a[0]]), ctm); break;
      case OPS.paintFormXObjectEnd: { const s = stack.pop(); if (s) { ctm = s.ctm; g = s.g; } break; }
      case OPS.beginText: Tm = [1, 0, 0, 1, 0, 0]; x0 = y0 = lx = ly = 0; break;
      case OPS.setCharSpacing: g.Tc = +a[0] || 0; break;
      case OPS.setWordSpacing: g.Tw = +a[0] || 0; break;
      case OPS.setHScale: g.Th = (+a[0] || 100) / 100; break;
      case OPS.setLeading: g.TL = +a[0] || 0; break;
      case OPS.setFont: g.font = a[0]; g.fs = Math.abs(+a[1] || 0); g.dir = +a[1] < 0 ? -1 : 1; break;
      case OPS.setTextRise: g.Ts = +a[0] || 0; break;
      case OPS.moveText: lx += +a[0] || 0; ly += +a[1] || 0; x0 = lx; y0 = ly; break;
      case OPS.setLeadingMoveText: g.TL = -(+a[1] || 0); lx += +a[0] || 0; ly += +a[1] || 0; x0 = lx; y0 = ly; break;
      case OPS.setTextMatrix: Tm = mat(a); x0 = y0 = lx = ly = 0; break;
      case OPS.nextLine: nextLine(); break;
      case OPS.showText: case OPS.showSpacedText: show(a[0]); break;
      case OPS.nextLineShowText: nextLine(); show(a[0]); break;
      case OPS.nextLineSetSpacingShowText: g.Tw = +a[0] || 0; g.Tc = +a[1] || 0; nextLine(); show(a[2]); break;
    }
  }
  // verificare: lățimi lipsă sau litere în afara paginii → nu ne bazăm pe ele (se folosește textul selectabil)
  if (nGlyph && nZero > 0.3 * nGlyph) throw new Error("lățimi lipsă");
  const v = page.view || [0, 0, 1e6, 1e6], wv = v[2] - v[0], hv = v[3] - v[1], all = runs.flatMap(r => r.chars);
  if (all.length && all.filter(c => c.cx > v[0] - 0.1 * wv && c.cx < v[2] + 0.1 * wv && c.cy > v[1] - 0.1 * hv && c.cy < v[3] + 0.1 * hv).length < 0.5 * all.length) throw new Error("poziții în afara paginii");
  return runs;
}
// bucățile de pe același rând se lipesc (unele PDF-uri desenează fiecare cuvânt sau literă separat), cu spațiu unde e loc gol
function mergeRuns(runs) {
  const lines = []; let cur = null;
  for (const r of runs) {
    if (!r.chars.length) continue;
    if (cur) {
      const a = cur.chars[cur.chars.length - 1], b = r.chars[0], dx = b.cx - a.cx, dy = b.cy - a.cy;
      const along = dx * cur.ux + dy * cur.uy, across = -dx * cur.uy + dy * cur.ux, gap = along - (a.w + b.w) / 2, fs = Math.max(cur.fs, r.fs);
      if (Math.abs(across) < 0.3 * fs && gap > -0.5 * fs && gap < 3 * fs) {
        if (gap > 0.15 * fs && !/\s/.test(a.ch) && !/\s/.test(b.ch)) cur.chars.push({ ch: " ", cx: a.cx + (a.w / 2 + gap / 2) * cur.ux, cy: a.cy + (a.w / 2 + gap / 2) * cur.uy, w: gap });
        cur.chars.push(...r.chars); cur.fs = fs; continue;
      }
    }
    cur = { chars: r.chars.slice(), fs: r.fs, ux: r.ux, uy: r.uy }; lines.push(cur);
  }
  return lines;
}
function textIn(lines, quads) {
  const inQ = (x, y) => quads.some(q => x >= q.x0 - 0.5 && x <= q.x1 + 0.5 && y >= q.y0 - 1 && y <= q.y1 + 1);
  let out = "", last = null;
  for (const Lt of lines) {
    const C = Lt.chars; if (!C.length) continue;
    const inc = C.map(c => inQ(c.cx, c.cy)); snap(C, inc);
    for (let i = 0; i < C.length; i++) {
      if (!inc[i]) continue;
      const c = C[i];
      if (last) {
        const dx = c.cx - last.c.cx, dy = c.cy - last.c.cy, along = dx * Lt.ux + dy * Lt.uy, across = -dx * Lt.uy + dy * Lt.ux;
        if (Math.abs(across) > 0.5 * Math.max(Lt.fs, last.L.fs) || along < -Lt.fs) {   // alt rând
          if (/\p{L}-$/u.test(out) && /\p{Ll}/u.test(c.ch)) out = out.slice(0, -1);      // cuvânt despărțit la capăt de rând
          else if (!/\s$/.test(out)) out += " ";
        } else if (along - (c.w + last.c.w) / 2 > 0.15 * Lt.fs && !/\s$/.test(out) && !/\s/.test(c.ch)) out += " ";
      }
      out += c.ch; last = { L: Lt, i, c };
    }
  }
  // fără resturi de la margini: punctuația care închide la început, cea care deschide la sfârșit
  return out.replace(/\s+/g, " ").trim().replace(/^[)\]}.,;:!?»”’\s]+/u, "").replace(/[(\[{«“‘\s]+$/u, "").trim();
}
// asemănarea a două texte (perechi de litere): pentru comentariul unei evidențieri care repetă textul ei
const norm = s => String(s).toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]/gu, "");
function similar(a, b) {
  const x = norm(a), y = norm(b); if (!x || !y) return false; if (x === y) return true;
  const bg = s => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const k = s.slice(i, i + 2); m.set(k, (m.get(k) || 0) + 1); } return m; };
  const A = bg(x), B = bg(y); let n = 0; for (const [k, v] of A) n += Math.min(v, B.get(k) || 0);
  return (2 * n) / (Math.max(x.length - 1, 0) + Math.max(y.length - 1, 0) || 1) >= 0.85;
}
// poziția unei evidențieri: începutul ei (primul rând, de la stânga), nu colțul dreptunghiului
function startOf(quads) {
  if (!quads.length) return { y: 0, x: 0 };
  const top = Math.max(...quads.map(q => q.y1)), first = quads.filter(q => top - q.y1 < 2);
  return { y: top, x: Math.min(...first.map(q => q.x0)) };
}
// paginile pe două coloane (articole de revistă, Nature, Springer…): culoarul gol dintre coloane, găsit după cât text e pe fiecare
// porțiune a lățimii paginii. { x, l, r } sau null (o singură coloană, sau prea puțin text ca să se poată spune)
function gutterOf(lines, view) {
  const x0 = Number(view?.[0]) || 0, W = (Number(view?.[2]) || 0) - x0; if (!(W > 100)) return null;
  const B = 2, n = Math.ceil(W / B), cov = new Float64Array(n); let chars = 0;
  for (const L of lines || []) for (const c of L.chars || []) {
    if (!c || /\s/.test(c.ch) || !Number.isFinite(c.cx)) continue; chars++;
    const a = Math.max(0, Math.floor((c.cx - (c.w || 0) / 2 - x0) / B)), b = Math.min(n - 1, Math.floor((c.cx + (c.w || 0) / 2 - x0) / B));
    for (let i = a; i <= b; i++) cov[i]++;
  }
  if (chars < 300) return null;
  const mean = (p, q) => { let s = 0, k = 0; for (let i = Math.floor(n * p); i < Math.floor(n * q); i++) { s += cov[i]; k++; } return k ? s / k : 0; };
  const side = Math.min(mean(0.12, 0.4), mean(0.6, 0.88)); if (!(side > 0)) return null;
  let best = null, run = null;
  for (let i = Math.floor(n * 0.35); i <= Math.ceil(n * 0.65) && i < n; i++) {
    if (cov[i] <= 0.2 * side) { if (!run) run = { a: i, b: i }; else run.b = i; }
    else if (run) { if (!best || run.b - run.a > best.b - best.a) best = run; run = null; }
  }
  if (run && (!best || run.b - run.a > best.b - best.a)) best = run;
  if (!best || (best.b - best.a + 1) * B < 6) return null;
  return { l: x0 + best.a * B, r: x0 + (best.b + 1) * B, x: x0 + (best.a + best.b + 1) * B / 2 };
}
// coloana unei evidențieri: 0 = stânga (sau pe toată lățimea), 1 = dreapta
function colOf(quads, g) {
  if (!g || !quads?.length) return 0;
  if (quads.some(q => q.x0 < g.l - 2 && q.x1 > g.r + 2)) return 0;
  return startOf(quads).x >= g.x ? 1 : 0;
}
// ordinea de citire pe o pagină: coloana, apoi de sus în jos, apoi de la stânga la dreapta
const ordKey = (col, y, x) => (col || 0) * 1e9 + posKey(y, x);
// toate evidențierile unui PDF deschis cu pdf.js: { id, page, label, rgb, text, comment, y, x, col }
async function readHighlights(doc, pdfjs) {
  const out = []; let labels = null;
  try { labels = await doc.getPageLabels(); } catch (e) {}
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    try {
      const annots = (await page.getAnnotations()).filter(a => MARKUP.has(a.subtype) && a.id);
      if (!annots.length) continue;
      let lines = null;
      try { lines = mergeRuns(await glyphRuns(page, pdfjs)); if (!lines.length) lines = null; } catch (e) { lines = null; }
      if (!lines) { const tc = await page.getTextContent(); lines = mergeRuns(tc.items.filter(it => typeof it.str === "string").map(it => layout(it, tc.styles))); }   // altfel: aproximat din textul selectabil
      let g = null; try { g = gutterOf(lines, page.view); } catch (e) {}
      for (const a of annots) {
        const quads = quadsOf(a); let text = textIn(lines, quads), comment = String(a.contentsObj?.str ?? a.contents ?? "").replace(/\s+/g, " ").trim();
        if ((text.match(/�/g) || []).length > 0.15 * text.length) text = "";   // litere pe care PDF-ul nu le poate transforma în text (font fără tabel de caractere)
        if (comment && (!text || similar(comment, text))) { text = comment; comment = ""; }   // unele aplicații (Preview) scriu textul evidențiat în comentariu
        const s0 = startOf(quads), tiny = quads.every(q => q.x1 - q.x0 < 6 || q.y1 - q.y0 < 3);
        const author = String(a.titleObj?.str ?? a.title ?? "").trim();   // cine a făcut evidențierea (PDF-urile descărcate pot veni cu evidențierile altcuiva)
        out.push({ id: a.id, page: p, label: labels?.[p - 1] || String(p), rgb: a.color && a.color.length >= 3 ? Array.from(a.color).slice(0, 3) : null, text, comment, tiny, author, y: s0.y, x: s0.x, col: colOf(quads, g), kind: a.subtype });
      }
    } finally { try { page.cleanup(); } catch (e) {} }
  }
  out.pageCount = doc.numPages;
  return out;
}
const posKey = (y, x) => Math.round(-y / 4) * 100000 + Math.round(x);   // același rând (±4pt) → după poziția pe orizontală
// culoarea cea mai apropiată din paletă, după cum arată (Oklab: nuanța, apoi saturația și luminozitatea; griul cu griul):
// galbenul → claim, roșul pal → disagree, verdele → agree, albastrul → connection, griul → word
const oklch = ([r, g, b]) => {
  const f = v => { v /= 255; return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92; }, R = f(r), G = f(g), B = f(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B), m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B), s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  return { L: L * 100, C: Math.hypot(a, bb) * 300, h: (Math.atan2(bb, a) * 180 / Math.PI + 360) % 360 };
};
function nearestTag(rgb, cols) {
  if (!rgb || rgb.length < 3) return null;
  const A = oklch(rgb.map(Number)), dist = c => { const B = oklch(c), ga = A.C < 12, gb = B.C < 12; if (ga || gb) return (ga !== gb ? 2 : 0) + Math.abs(A.L - B.L) / 100; const dh = Math.min(Math.abs(A.h - B.h), 360 - Math.abs(A.h - B.h)) / 180; return dh * 2 + Math.abs(A.C - B.C) / 300 + Math.abs(A.L - B.L) / 300; };
  let best = null, bd = Infinity;
  for (const [n, h] of Object.entries(cols || {})) { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(h)); if (!m) continue; const d = dist([1, 2, 3].map(k => parseInt(m[k], 16))); if (d < bd) { bd = d; best = n.toLowerCase(); } }
  return best;
}
// același om? (fără diacritice și majuscule; numele scurt din Preview, „George”, e inclus în „George Mihai”; numele de familie ajunge)
const nameToks = s => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length >= 2);
function sameAuthor(a, me) {
  const A = nameToks(a), M = nameToks(me); if (!A.length || !M.length) return true;
  if (A.join(" ") === M.join(" ")) return true;
  if (A.every(t => M.includes(t))) return true;
  return M.length > 1 && A.includes(M[M.length - 1]);
}

class Highlights {
  constructor(S) { this.S = S; this.app = S.app; this.remember = new Map(); this.q = new Map(); this.cache = new Map(); this.noHeal = new Set(); }
  T(a, b) { return this.S.T(a, b); }

  start() {
    this.patch();
    this.S.host.registerInterval(window.setInterval(() => this.patch(), 5000));   // PDF++ se poate încărca după Texere
    this.S.host.registerEvent(this.app.vault.on("rename", (f, old) => {
      const c = this.S.conf(); let ch = false;
      for (const k of ["hlPending", "hlSnooze", "hlScan"]) if (c[k]?.[old] !== undefined) { c[k][f.path] = c[k][old]; delete c[k][old]; ch = true; }
      if (this.cache.has(old)) { this.cache.set(f.path, this.cache.get(old)); this.cache.delete(old); }
      if (ch) this.S.save();
    }));
    // alegerea notei (când PDF-ul are mai multe) se uită când închizi PDF-ul
    if (this.app.workspace.on) this.S.host.registerEvent(this.app.workspace.on("layout-change", () => {
      for (const p of [...this.remember.keys()]) if (!this.app.workspace.getLeavesOfType("pdf").some(l => l.view?.file?.path === p)) this.remember.delete(p);
    }));
    // importul din PDF: comanda, meniul notei/PDF-ului, la deschidere și o dată la pornire
    this.S.host.addCommand?.({ id: "sources-import-highlights", name: "Import highlights from PDF / Importă evidențierile din PDF", checkCallback: chk => {
      const f = this.app.workspace.getActiveFile?.(), pairs = f ? this.pairsFor(f) : [];
      if (!pairs.length) return false; if (!chk) this.importManual(f); return true; } });
    if (this.app.workspace.on) {
      this.S.host.registerEvent(this.app.workspace.on("file-menu", (menu, f) => {
        if (!(f instanceof TFile) || !(f.extension === "md" || f.extension === "pdf") || !this.pairsFor(f).length) return;
        menu.addItem(i => i.setTitle(this.T("Importă evidențierile din PDF", "Import highlights from PDF")).setIcon("highlighter").onClick(() => this.importManual(f)));
      }));
      let t = null;
      this.S.host.registerEvent(this.app.workspace.on("file-open", f => {
        clearTimeout(t); if (!(f instanceof TFile)) return;
        t = setTimeout(() => this.autoFor(f).catch(e => console.warn("Texere: importul evidențierilor", e)), 1200);
      }));
    }
    this.app.workspace.onLayoutReady?.(() => setTimeout(() => this.sweep().catch(e => console.warn("Texere: importul evidențierilor", e)).then(() => this.retagSweep()).catch(e => console.warn("Texere: etichetele după culoare", e)), 6000));
  }
  // înlocuiește „auto-paste” din PDF++ cu rutarea noastră; dacă rândul nu e o evidențiere dintr-un PDF, PDF++ face ca de obicei
  patch() {
    const pp = this.app.plugins.plugins["pdf-plus"]; if (!pp?.lib) return;
    for (const lib of Object.values(pp.lib)) {
      if (!lib || typeof lib.autoPaste !== "function" || lib.autoPaste.__texere) continue;
      const orig = lib.autoPaste, H = this;
      const wrapped = async function (text, ...rest) {
        try { const r = await H.route(String(text ?? "")); if (r !== undefined) return r; } catch (e) { console.error("Texere: evidențierea", e); }
        return orig.call(this, text, ...rest);
      };
      wrapped.__texere = true; wrapped.__orig = orig; lib.autoPaste = wrapped;
      this.S.host.register(() => { if (lib.autoPaste === wrapped) lib.autoPaste = orig; });
    }
  }

  async route(text) {
    const m = LINK.exec(text); if (!m) return undefined;
    const pdf = this.app.metadataCache.getFirstLinkpathDest(m[1], "");
    if (!(pdf instanceof TFile)) return undefined;
    const notes = this.notesFor(pdf);
    let note = null;
    if (notes.length === 1) note = notes[0];
    else if (notes.length > 1) note = this.visibleOf(notes) || this.rememberedFor(pdf, notes) || await this.pick(pdf, notes);
    else {
      // PDF fără sursă: rândul se păstrează și intră în notă când îl adaugi ca sursă (oricând: colțul din dreapta-jos sau clic dreapta)
      this.keep(pdf, text);
      const c = this.S.conf(), sz = (c.hlSnooze = c.hlSnooze || {})[pdf.path];
      if (sz && (sz.stage >= 3 || --sz.left > 0)) { await this.S.save(); this.keptNotice(pdf); return true; }
      const stage = sz?.stage || 0, ans = await this.askSource(pdf, stage);
      if (ans === "add") {
        note = await new Promise(res => this.S.catalog(pdf, { after: res }));   // nota nouă primește toate rândurile păstrate (vezi flushPending)
        if (!note) this.keptNotice(pdf, true);
        return true;
      }
      const next = stage + 1; c.hlSnooze[pdf.path] = { stage: next, left: next === 1 ? 10 : next === 2 ? 50 : 0 };
      await this.S.save(); this.keptNotice(pdf, true);
      return true;
    }
    await this.insert(note, pdf, text);
    return true;
  }

  // notele care au PDF-ul în attachment (din bibliografie și din proprietățile notelor)
  notesFor(pdf) {
    const out = new Set(), mc = this.app.metadataCache, arr = v => Array.isArray(v) ? v : v ? [v] : [];
    for (const e of this.S.lib.all()) if (arr(e.attachment).some(a => typeof a === "string" && a.includes(pdf.name))) {
      const f = this.app.vault.getAbstractFileByPath(e.obsidianPath || ""); if (f instanceof TFile) out.add(f);
    }
    for (const f of this.app.vault.getMarkdownFiles()) {
      const fm = mc.getFileCache(f)?.frontmatter; if (!fm?.attachment) continue;
      for (const x of arr(fm.attachment)) { const l = /\[\[([^\]|#]+)/.exec(String(x))?.[1]; if (l && mc.getFirstLinkpathDest(l, f.path) === pdf) out.add(f); }
    }
    return [...out];
  }
  // PDF-urile unei note (din attachment)
  pdfsOf(note) {
    const mc = this.app.metadataCache, fm = mc.getFileCache(note)?.frontmatter, arr = v => Array.isArray(v) ? v : v ? [v] : [];
    return arr(fm?.attachment).map(x => /\[\[([^\]|#]+)/.exec(String(x))?.[1]).filter(Boolean).map(l => mc.getFirstLinkpathDest(l, note.path)).filter(p => p instanceof TFile && p.extension === "pdf");
  }
  // perechile { pdf, note } pentru fișierul deschis: o notă cu PDF-uri sau un PDF cu o singură notă
  pairsFor(f) {
    if (f.extension === "md") return this.pdfsOf(f).map(pdf => ({ pdf, note: f }));
    if (f.extension === "pdf") { const n = this.notesFor(f); return n.length === 1 ? [{ pdf: f, note: n[0] }] : []; }
    return [];
  }
  visible(leaf) {
    const el = leaf?.view?.containerEl; if (!el) return false;
    if (leaf.getRoot && leaf.getRoot() !== this.app.workspace.rootSplit) return false;   // nu barele laterale
    return el.isShown ? el.isShown() : el.offsetParent !== null;
  }
  visibleOf(notes) {
    const vis = [...new Set(this.app.workspace.getLeavesOfType("markdown").filter(l => this.visible(l) && notes.includes(l.view?.file)).map(l => l.view.file))];
    return vis.length === 1 ? vis[0] : null;
  }
  rememberedFor(pdf, notes) { const p = this.remember.get(pdf.path); return notes.find(n => n.path === p) || null; }

  pick(pdf, notes) {
    const T = (a, b) => this.T(a, b), H = this;
    return new Promise(res => {
      let chosen = null;
      const M = class extends SuggestModal {
        getSuggestions(q) { const s = q.toLowerCase(); return notes.filter(n => n.basename.toLowerCase().includes(s)); }
        renderSuggestion(n, el) { el.createDiv({ text: n.basename }); el.createDiv({ text: n.parent?.path || "", cls: "texere-pick-path" }).style.cssText = "font-size:.8em;color:var(--text-muted)"; }
        onChooseSuggestion(n) { chosen = n; H.remember.set(pdf.path, n.path); }
        onClose() { setTimeout(() => res(chosen), 0); }
      };
      const m = new M(this.app); m.setPlaceholder(T(`În ce notă intră evidențierile din ${pdf.basename}?`, `Which note should highlights from ${pdf.basename} go into?`)); m.open();
    });
  }
  askSource(pdf, stage) {
    const T = (a, b) => this.T(a, b);
    const later = stage === 0 ? T("Te întreb din nou după 10 evidențieri.", "I'll ask again after 10 highlights.") : stage === 1 ? T("Te întreb din nou după 50 de evidențieri.", "I'll ask again after 50 highlights.") : T("Nu te mai întreb pentru acest PDF.", "I won't ask again for this PDF.");
    return new Promise(res => {
      let ans = "later";
      const M = class extends Modal {
        onOpen() {
          this.modalEl.addClass("texere-ask-source");
          this.titleEl.setText(T("Salvează evidențierile într-o notă", "Save your highlights in a note"));
          const c = this.contentEl;
          c.createEl("p", { text: T(`„${pdf.basename}” nu e încă o sursă. Cu o notă a sursei:`, `“${pdf.basename}” isn't a source yet. With a source note:`) });
          const ul = c.createEl("ul");
          for (const t of [T("toate evidențierile se adună în notă, în ordinea din PDF", "all your highlights gather in the note, in the PDF's order"),
            T("citările sunt gata de folosit, cu pagina corectă: [@cheie, p. 19]", "citations are ready to use, with the right page: [@key, p. 19]"),
            T("bibliografia și exportul ies singure, în stilul ales", "the bibliography and export come out by themselves, in your style"),
            T("vezi datele și impactul sursei (citări, statistici)", "you see the source's details and impact (citations, stats)")]) ul.createEl("li", { text: t });
          c.createEl("p", { cls: "texere-ask-note", text: T("Evidențierile de până atunci nu se pierd: rămân în PDF și intră în notă când adaugi sursa. O poți adăuga oricând din colțul din dreapta-jos sau cu clic dreapta pe PDF.",
            "Highlights you make until then aren't lost: they stay in the PDF and go into the note when you add the source. You can add it anytime from the bottom-right corner or by right-clicking the PDF.") });
          const bar = c.createDiv("texere-ask-bar");
          bar.createSpan({ cls: "texere-ask-later", text: later });
          const no = bar.createEl("button", { text: T("Întreabă-mă mai târziu", "Ask me later") }); no.addEventListener("click", () => this.close());
          const ok = bar.createEl("button", { cls: "mod-cta", text: T("Adaugă ca sursă", "Add as source") }); ok.addEventListener("click", () => { ans = "add"; this.close(); });
          setTimeout(() => ok.focus(), 30);
        }
        onClose() { this.contentEl.empty(); res(ans); }
      };
      new M(this.app).open();
    });
  }
  // rândurile păstrate pentru un PDF fără notă (în setări, ca să nu se piardă la repornire)
  keep(pdf, text) {
    const c = this.S.conf(), p = (c.hlPending = c.hlPending || {}), list = (p[pdf.path] = p[pdf.path] || []);
    list.push({ line: text, name: pdf.name, fk: pdf.basename.replace(/^@/, "") });   // fk: ce a pus PDF++ în loc de cheia de citare
    if (list.length > 1000) list.splice(0, list.length - 1000);
    this.S.save();
  }
  keptNotice(pdf, force) {
    this._told = this._told || new Set(); if (!force && this._told.has(pdf.path)) return; this._told.add(pdf.path);
    const n = (this.S.conf().hlPending?.[pdf.path] || []).length;
    new Notice(this.T(`Evidențierea e salvată în PDF și păstrată pentru notă (${n}). Intră în notă când adaugi PDF-ul ca sursă.`, `The highlight is saved in the PDF and kept for its note (${n}). It goes into the note when you add the PDF as a source.`), 6000);
  }
  // după ce PDF-ul are notă: toate rândurile păstrate intră în ea, fiecare la locul lui din PDF
  async flushPending(pdf, note) {
    const c = this.S.conf(), list = c.hlPending?.[pdf.path]; if (!list?.length) return 0;
    delete c.hlPending[pdf.path]; if (c.hlSnooze) delete c.hlSnooze[pdf.path]; await this.S.save();
    const now = this.app.metadataCache.fileToLinktext(pdf, note.path, true);
    // cât PDF-ul n-a avut notă, PDF++ n-a știut cheia de citare și a pus numele PDF-ului: [@Vică et al. 2026 – …, p. 21] → [@vica_…_2026, p. 21]
    const id = await this.citekeyOf(note);
    for (const it of list) {
      let line = it.line; if (it.name && it.name !== pdf.name) line = line.split(`[[${it.name}#`).join(`[[${now}#`);
      if (id) line = line.replace(/\[@([^\]]+?)(,\s*p\.[^\]]*)?\]/g, (m, k, loc) => (it.fk ? k === it.fk : !/^[\w:.#$%&+?<>~\/-]+$/.test(k)) ? `[@${id}${loc || ""}]` : m);
      try { await this.insert(note, pdf, line); } catch (e) { console.error("Texere: rândul păstrat", e); }
    }
    new Notice(this.T(`Am pus în notă ${list.length} evidențieri păstrate.`, `Added ${list.length} kept highlights to the note.`), 5000);
    return list.length;
  }
  async citekeyOf(note) {
    let id = this.S.lib.all().find(e => e.obsidianPath === note.path)?.id || this.app.metadataCache.getFileCache(note)?.frontmatter?.id;
    if (!id) { try { id = /^id:\s*(\S+)/m.exec(await this.app.vault.read(note))?.[1]; } catch (e) {} }
    return id;
  }
  relink(text, oldPath, pdf, note) {
    const now = this.app.metadataCache.fileToLinktext(pdf, note.path, true);
    return text.split(`[[${oldPath}#`).join(`[[${now}#`);
  }

  // nota se arată lângă PDF (în cealaltă coloană, dacă există una), fără să-ți ia PDF-ul din față
  async showNote(note, pdf) {
    const ws = this.app.workspace;
    const pdfs = ws.getLeavesOfType("pdf").filter(l => l.view?.file === pdf), pdfLeaf = pdfs.find(l => this.visible(l)) || pdfs[0] || null;
    const mds = ws.getLeavesOfType("markdown");
    let leaf = mds.find(l => l.view?.file === note && this.visible(l));
    if (!leaf) { const hidden = mds.find(l => l.view?.file === note && (!l.getRoot || l.getRoot() === ws.rootSplit)); if (hidden) { await ws.revealLeaf(hidden); leaf = hidden; } }
    if (!leaf) {
      const other = mds.find(l => this.visible(l) && l.parent && l.parent !== pdfLeaf?.parent);
      leaf = other && ws.createLeafInParent ? ws.createLeafInParent(other.parent, other.parent.children?.length ?? 0) : pdfLeaf ? ws.createLeafBySplit(pdfLeaf, "vertical") : ws.getLeaf("split", "vertical");
      await leaf.openFile(note, { active: false });
      if (other) await ws.revealLeaf(leaf);
    }
    if (pdfLeaf) ws.setActiveLeaf(pdfLeaf, { focus: true });   // continui să citești
    return leaf;
  }
  // scrierile într-o notă se fac pe rând (lipirea din PDF++ și importul nu se calcă pe picioare)
  queue(key, fn) { const p = (this.q.get(key) || Promise.resolve()).then(() => fn(), () => fn()); this.q.set(key, p.catch(() => {})); return p; }
  // editorul deschis pe notă (sursă / Live Preview), dacă există
  editorOf(note, leaf) {
    const views = (leaf ? [leaf] : this.app.workspace.getLeavesOfType("markdown")).map(l => l?.view).filter(v => v instanceof MarkdownView && v.file === note && v.getMode?.() === "source");
    return views[0]?.editor || null;
  }
  // ID-urile evidențierilor din acest PDF la care trimite textul (rândurile notei)
  idsIn(src, pdf, notePath) {
    const out = new Map(), mc = this.app.metadataCache; let m; LINKS.lastIndex = 0;
    while ((m = LINKS.exec(src))) { const l = loc(m[2]); if (l.annot && mc.getFirstLinkpathDest(m[1], notePath) === pdf) out.set(l.annot, l.page); }
    return out;
  }

  insert(note, pdf, text) { return this.queue(note.path, () => this._insert(note, pdf, text)); }
  async _insert(note, pdf, text) {
    text = String(text).replace(/^\s*\n/, "").replace(/\s+$/, "");   // fără rânduri goale la început/sfârșit: spațierea o face Texere
    const id = loc(LINK.exec(text)?.[2] || "").annot;
    if (id) {   // deja în notă (de ex. adusă din PDF între timp): nu o mai punem o dată
      const ed0 = this.editorOf(note), cur = ed0 ? ed0.getValue() : await this.app.vault.read(note);
      if (this.idsIn(cur, pdf, note.path).has(id)) return false;
    }
    const leaf = await this.showNote(note, pdf);
    const ed = this.editorOf(note, leaf) || this.editorOf(note);
    const src = ed ? ed.getValue() : await this.app.vault.read(note);
    const L = src.split("\n"), at = await this.placeIn(L, pdf, text, note.path);
    const add = [];
    if (at > 0 && L[at - 1].trim() !== "") add.push("");
    add.push(text);
    if (at < L.length && L[at].trim() !== "") add.push("");
    if (ed) {
      if (at < L.length) ed.replaceRange(add.join("\n") + "\n", { line: at, ch: 0 });
      else ed.replaceRange("\n" + add.join("\n"), { line: L.length - 1, ch: L[L.length - 1].length });
      const first = at < L.length ? at : L.length;
      try { ed.scrollIntoView({ from: { line: first, ch: 0 }, to: { line: first + add.length, ch: 0 } }, true); } catch (e) {}
    } else {
      await this.app.vault.process(note, t => { const X = t.split("\n"); const pos = Math.min(at, X.length); X.splice(pos, 0, ...add); return X.join("\n"); });
    }
    return true;
  }

  // rândurile notei care trimit la acest PDF: { start, entries: [{ i, loc }] }
  linesOf(L, pdf, notePath) {
    let start = 0; if (L[0] === "---") { const e = L.indexOf("---", 1); if (e > 0) start = e + 1; }
    const mc = this.app.metadataCache, entries = [];
    for (let i = start; i < L.length; i++) { const m = LINK.exec(L[i]); if (m && mc.getFirstLinkpathDest(m[1], notePath) === pdf) entries.push({ i, loc: loc(m[2]) }); }
    return { start, entries };
  }
  // rândul pe care intră o evidențiere nouă, dată fiind ordinea (cmp) dintre evidențieri
  placeAt(L, start, entries, me, cmp) {
    const isHl = l => ANY_PDF_LINK.test(l);
    // începutul paragrafului unei evidențieri (textul poate fi pe rândul de deasupra linkului)
    const paraStart = (j, floor) => { let k = j; while (k - 1 > floor && L[k - 1].trim() !== "" && !HEAD.test(L[k - 1]) && !isHl(L[k - 1])) k--; return k; };
    if (!entries.length) {
      const h = L.findIndex((l, i) => i >= start && /^#{1,6}\s+(reading notes|note de lectur|notițe de lectur|lectur)/i.test(l));
      if (h >= 0) {
        const lvl = /^#+/.exec(L[h])[0].length; let e = h + 1;
        while (e < L.length && !(HEAD.test(L[e]) && /^#+/.exec(L[e])[0].length <= lvl)) e++;
        let at = e; while (at > h + 1 && L[at - 1].trim() === "") at--; return at;
      }
      let at = L.length; while (at > start && L[at - 1].trim() === "") at--; return at;
    }
    const before = entries.filter(e => cmp(e.loc, me) <= 0);
    if (before.length) {
      const pred = before.reduce((x, y) => (cmp(y.loc, x.loc) >= 0 ? y : x));
      let j = pred.i + 1; while (j < L.length && !isHl(L[j]) && !HEAD.test(L[j])) j++;
      if (j < L.length && isHl(L[j])) j = paraStart(j, pred.i);
      let at = j; while (at > pred.i + 1 && L[at - 1].trim() === "") at--;
      return at;
    }
    const succ = entries.reduce((x, y) => (cmp(y.loc, x.loc) < 0 ? y : x));
    return paraStart(succ.i, start - 1);
  }
  // rândul pe care intră evidențierea nouă (lipită de PDF++)
  async placeIn(L, pdf, text, notePath) {
    const { start, entries } = this.linesOf(L, pdf, notePath), me = loc(LINK.exec(text)[2]);
    // ordinea: pagina; pe aceeași pagină, poziția (de sus în jos, apoi de la stânga la dreapta)
    const same = entries.filter(e => e.loc.page === me.page);
    const pos = same.length ? await this.positions(pdf, me.page, [me, ...same.map(e => e.loc)]) : null;
    const key = x => [x.page, pos ? pos(x) : 0];
    const cmp = (a, b) => { const A = key(a), B = key(b); return A[0] - B[0] || A[1] - B[1]; };
    return this.placeAt(L, start, entries, me, cmp);
  }
  // pozițiile pe pagină: dreptunghiul evidențierii scrise în PDF (annotation=…) sau textul selectat (selection=…)
  async positions(pdf, pageNo, locs) {
    const map = new Map();
    try {
      const pdfjs = await loadPdfJs(), doc = await pdfjs.getDocument({ data: new Uint8Array(await this.app.vault.readBinary(pdf)) }).promise;
      try {
        const page = await doc.getPage(pageNo);
        const annots = locs.some(l => l.annot) ? await page.getAnnotations() : [];
        const items = locs.some(l => l.sel) ? (await page.getTextContent({ includeMarkedContent: true, disableNormalization: true })).items : [];
        let g = null; try { const tc = await page.getTextContent(); g = gutterOf(mergeRuns(tc.items.filter(it => typeof it.str === "string").map(it => layout(it, tc.styles))), page.view); } catch (e) {}   // două coloane?
        for (const l of locs) {
          let y = null, x = 0, col = 0;
          if (l.annot) { const a = annots.find(a => a.id === l.annot); if (a?.rect || a?.quadPoints) { const q = quadsOf(a), s0 = startOf(q); y = s0.y; x = s0.x; col = colOf(q, g); } }
          if (y === null && l.sel) { let k = l.sel[0]; while (k < items.length && !items[k]?.transform) k++; const it = items[k]; if (it) { y = it.transform[5] + (it.height || 0); x = it.transform[4]; col = g && x >= g.x ? 1 : 0; } }
          if (y !== null) map.set(l, ordKey(col, y, x));
        }
      } finally { try { doc.destroy(); } catch (e) {} }
    } catch (e) { console.warn("Texere: poziția evidențierii", e); }
    return l => (map.has(l) ? map.get(l) : Number.MAX_SAFE_INTEGER);   // necunoscută → după celelalte de pe pagină
  }

  // ——— importul din PDF ———
  // evidențierile PDF-ului (citite o dată pentru fiecare versiune a fișierului)
  async read(pdf) {
    const st = pdf.stat || {}, c = this.cache.get(pdf.path);
    if (c && c.mtime === st.mtime && c.size === st.size) return c.list;
    const key = `${pdf.path}|${st.mtime}|${st.size}`; this.reading = this.reading || new Map();
    if (this.reading.has(key)) return this.reading.get(key);   // deja în curs de citire (pornirea și deschiderea notei în același timp)
    const job = (async () => {
      const pdfjs = await loadPdfJs(), doc = await pdfjs.getDocument({ data: new Uint8Array(await this.app.vault.readBinary(pdf)) }).promise;
      let list; try { list = await readHighlights(doc, pdfjs); } finally { try { doc.destroy(); } catch (e) {} }
      this.cache.set(pdf.path, { mtime: st.mtime, size: st.size, list });
      return list;
    })();
    this.reading.set(key, job);
    try { return await job; } finally { this.reading.delete(key); }
  }
  markScanned(pdf) { const c = this.S.conf(); (c.hlScan = c.hlScan || {})[pdf.path] = pdf.stat?.mtime || 0; this.S.save(); }
  scanned(pdf) { return (this.S.conf().hlScan || {})[pdf.path] === (pdf.stat?.mtime || 0); }
  // ID-urile evidențierilor din PDF la care trimite vreo notă din vault
  linkedAnywhere(pdf) {
    const out = new Set(), mc = this.app.metadataCache;
    for (const f of this.app.vault.getMarkdownFiles()) {
      for (const l of (mc.getFileCache(f)?.links || [])) {
        const s = String(l.link || ""); if (!s.includes("annotation=") || !s.includes(pdf.name)) continue;
        const m = /^([^#]+)#(.+)$/.exec(s); if (!m) continue;
        const id = loc(m[2]).annot; if (id && mc.getFirstLinkpathDest(m[1], f.path) === pdf) out.add(id);
      }
    }
    return out;
  }
  // culoarea → eticheta din paleta PDF++ (fact, claim, agree…); culorile vechi (din altă paletă) → eticheta pe care ai pus-o
  // tu pe rândurile cu aceeași culoare (învățată din note)
  tagFor(rgb) {
    if (!rgb) return null;
    const cols = this.app.plugins.plugins["pdf-plus"]?.settings?.colors || {}; let best = null, bd = Infinity;
    for (const [n, h] of Object.entries(cols)) {
      const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(h)); if (!m) continue;
      const d = Math.max(...[1, 2, 3].map(k => Math.abs(parseInt(m[k], 16) - rgb[k - 1])));
      if (d < bd) { bd = d; best = n.toLowerCase(); }
    }
    if (bd <= 8) return best;
    const k = rgb.join(","), v = this.votes?.get(k);
    if (v) { const tot = Object.values(v).reduce((s, n) => s + n, 0), [t, n] = Object.entries(v).sort((x, y) => y[1] - x[1])[0]; if (n / tot >= 0.6) return t; }
    return this.S.conf().hlColors?.[k] || nearestTag(rgb, cols);   // altă culoare (Preview, Acrobat, Zotero, PDF-uri primite): eticheta culorii celei mai apropiate după nuanță
  }
  // e evidențierea ta? autorul din PDF față de cel din PDF++: „George-Emil Mihai” sau „George” (Preview, Acrobat) = „George Mihai”; „Picard” nu
  theirs(h) {
    const me = String(this.app.plugins.plugins["pdf-plus"]?.settings?.author || "").trim();
    if (!me || !h.author || sameAuthor(h.author, me)) return false;
    return !(this.S.conf().hlAlsoMe || []).some(n => sameAuthor(h.author, n));   // alte nume ale tale (ai spus „sunt ale mele”)
  }
  // evidențieri făcute sub alt nume: întreabă o dată dacă sunt ale tale (Da → le aduce și ține minte numele; Nu → nu mai întreabă de el)
  offerOthers(results) {
    const c = this.S.conf(), no = new Set((c.hlNotMine || []).map(s => s.toLowerCase()));
    const rs = results.filter(r => r.others && r.pdf && (r.authors || []).some(a => !no.has(a.toLowerCase()))); if (!rs.length) return false;
    const authors = [...new Set(rs.flatMap(r => r.authors))].filter(a => !no.has(a.toLowerCase())), n = rs.reduce((s, r) => s + r.others, 0), T = (a, b) => this.T(a, b);
    const frag = document.createDocumentFragment(), p = document.createElement("div"), row = document.createElement("div");
    p.textContent = T(`În PDF${rs.length > 1 ? "-uri" : ""} sunt ${n} evidențieri făcute de „${authors.join(", ")}”, așa că nu le-am adus în ${rs.length > 1 ? "note" : `„${rs[0].note.basename}”`}. Sunt ale tale?`,
      `The PDF${rs.length > 1 ? "s have" : " has"} ${n} highlights made by “${authors.join(", ")}”, so I left them out of ${rs.length > 1 ? "the notes" : `“${rs[0].note.basename}”`}. Are they yours?`);
    row.style.cssText = "display:flex;gap:8px;margin-top:8px"; frag.append(p, row);
    const btn = (label, cta, fn) => { const b = document.createElement("button"); b.textContent = label; if (cta) b.className = "mod-cta"; b.addEventListener("click", e => { e.stopPropagation(); note.hide(); fn().catch(err => console.error("Texere: evidențierile", err)); }); row.append(b); };
    const note = new Notice(frag, 0);
    btn(T("Da, adu-le", "Yes, bring them"), true, async () => {
      c.hlAlsoMe = [...new Set([...(c.hlAlsoMe || []), ...authors])]; await this.S.save();
      const out = []; for (const r of rs) { this.cache.delete(r.pdf.path); try { out.push({ ...(await this.importFromPdf(r.pdf, r.note)), note: r.note }); } catch (e) { console.warn("Texere: evidențierile", e); } }
      this.report(out);
    });
    btn(T("Nu", "No"), false, async () => { c.hlNotMine = [...new Set([...(c.hlNotMine || []), ...authors])]; await this.S.save(); });
    return true;
  }
  // rândurile din notă rămase fără etichetă (culoarea nu era în paletă la import): eticheta după culoare, o singură dată pe evidențiere
  async retag(pdf, note, list, ed) {
    const names = Object.keys(this.app.plugins.plugins["pdf-plus"]?.settings?.colors || {}).map(n => n.toLowerCase()); if (!names.length) return 0;
    const c = this.S.conf(), done = new Set((c.hlTagged = c.hlTagged || {})[pdf.path] || []), byId = new Map(list.map(h => [h.id, h])), mc = this.app.metadataCache;
    const scan = text => {
      const out = [];
      text.split("\n").forEach((line, i) => {
        if (/^\s*(>|#{1,6}\s|```|%%)/.test(line)) return;   // citate, callout-uri, titluri: eticheta are alt loc acolo
        const m = LINK.exec(line); if (!m) return;
        const id = loc(m[2]).annot, h = id && byId.get(id); if (!h || done.has(id) || mc.getFirstLinkpathDest(m[1], note.path) !== pdf) return;
        if ([...line.matchAll(/(?:^|\s)#([\w-]+)/g)].some(x => names.includes(x[1].toLowerCase()))) return;
        const tag = this.tagFor(h.rgb); if (tag) out.push({ i, tag, id, at: (/^\s*/.exec(line) || [""])[0].length });
      });
      return out;
    };
    let edits = [];
    if (ed) {
      edits = scan(ed.getValue());
      const changes = edits.map(e => ({ from: { line: e.i, ch: e.at }, text: `#${e.tag} ` }));
      if (changes.length) { if (typeof ed.transaction === "function") ed.transaction({ changes }); else for (const ch of [...changes].reverse()) ed.replaceRange(ch.text, ch.from); }
    } else if (this.app.vault.process) {
      await this.app.vault.process(note, text => { edits = scan(text); if (!edits.length) return text; const L = text.split("\n"); for (const e of edits) L[e.i] = L[e.i].slice(0, e.at) + `#${e.tag} ` + L[e.i].slice(e.at); return L.join("\n"); });
    }
    if (edits.length) { c.hlTagged[pdf.path] = [...done, ...edits.map(e => e.id)]; await this.S.save(); }
    return edits.length;
  }
  // ce etichetă ai pus pe rândurile fiecărei culori (din nota sursei); câștigătorii clari se țin minte
  learn(list, src, pdf, notePath) {
    const names = Object.keys(this.app.plugins.plugins["pdf-plus"]?.settings?.colors || {}).map(n => n.toLowerCase()); if (!names.length) return;
    const byId = new Map(list.map(h => [h.id, h])), mc = this.app.metadataCache;
    this.votes = this.votes || new Map(); this.voted = this.voted || new Set();
    for (const line of String(src).split("\n")) {
      const m = LINK.exec(line); if (!m) continue;
      const h = byId.get(loc(m[2]).annot); if (!h?.rgb || this.voted.has(pdf.path + "|" + h.id) || mc.getFirstLinkpathDest(m[1], notePath) !== pdf) continue;
      const tag = [...line.matchAll(/(?:^|\s)#([\w-]+)/g)].map(x => x[1].toLowerCase()).find(t => names.includes(t)); if (!tag) continue;
      this.voted.add(pdf.path + "|" + h.id);
      const k = h.rgb.join(","), v = this.votes.get(k) || {}; v[tag] = (v[tag] || 0) + 1; this.votes.set(k, v);
    }
    const c = this.S.conf(), best = (c.hlColors = c.hlColors || {}); let ch = false;
    for (const [k, v] of this.votes) {
      const tot = Object.values(v).reduce((s, n) => s + n, 0), [t, n] = Object.entries(v).sort((x, y) => y[1] - x[1])[0];
      if (n >= 3 && n / tot >= 0.7 && best[k] !== t) { best[k] = t; ch = true; }
    }
    if (ch) this.S.save();
  }
  // rândul unei evidențieri: formatul ales în PDF++ (același cu rândurile lipite), altfel formatul Texere
  lineFor(h, pdf, note, list, props) {
    const pp = this.app.plugins.plugins["pdf-plus"], set = pp?.settings || {}, mc = this.app.metadataCache;
    const rgb = h.rgb || null, tag = this.tagFor(rgb);
    const linktext = `${mc.fileToLinktext(pdf, note.path, true)}#page=${h.page}&annotation=${h.id}`;
    // fără mesajele de eroare ale șablonului (Notice mut); defineProperty, nu atribuire: exporturile lui Obsidian au doar getter
    const quiet = Object.create(obsidian); Object.defineProperty(quiet, "Notice", { value: class { setMessage() { return this; } hide() {} }, configurable: true });
    const vars = { app: this.app, obsidian: quiet, file: pdf, folder: pdf.parent, page: h.page, pageLabel: h.label, pageCount: list.pageCount, text: h.text, selection: h.text,
      color: rgb ? rgb.join(", ") : "", colorName: tag || (rgb ? rgb.join(", ") : ""), calloutType: set.calloutType || "PDF", md: note, properties: props, comment: h.comment || "",
      linktext, link: `[[${linktext}]]`, display: "", linkWithDisplay: "" };
    const render = tpl => String(tpl).replace(/\{\{([\s\S]*?)\}\}/g, (_, expr) => { const v = new Function(...Object.keys(vars), `return (${expr});`)(...Object.values(vars)); return v == null ? "" : String(v); });
    try { const d = set.displayTextFormats?.[set.defaultDisplayTextFormatIndex ?? -1]?.template; if (d) vars.display = render(d); } catch (e) {}
    vars.linkWithDisplay = vars.display ? `[[${linktext}|${vars.display}]]` : vars.link;
    const cmds = Array.isArray(set.copyCommands) ? set.copyCommands : [];
    const tpl = cmds[set.defaultColorPaletteActionIndex ?? -1]?.template || cmds.find(c => /paragraf/i.test(c.name || ""))?.template;
    if (tpl) {
      try {
        let out = render(tpl).replace(/^\s*\n/, "").replace(/\s+$/, "");
        if (!h.text) out = out.replace(/ {2,}/g, " ");
        if (out.includes(`annotation=${h.id}`)) return out;
      } catch (e) {}
    }
    return this.plainLine(h, pdf, note, list, props);
  }
  // formatul Texere: #eticheta text [@cheie, p. X] [[PDF#page=…&annotation=…|PDF]]
  plainLine(h, pdf, note, list, props) {
    const tag = this.tagFor(h.rgb || null), linktext = `${this.app.metadataCache.fileToLinktext(pdf, note.path, true)}#page=${h.page}&annotation=${h.id}`;
    let p = h.label; try { p = new Function("page", "pageLabel", "pageCount", "properties", `return (${this.S.pdfPageExpr()});`)(h.page, h.label, list.pageCount, props); } catch (e) {}
    const key = String(props?.id || note.basename).replace(/^@/, "");
    return `${tag ? "#" + tag + " " : ""}${h.text ? h.text + " " : ""}[@${key}, p. ${p}] [[${linktext}|PDF]]`;
  }
  // nota trimite la evidențieri care nu mai sunt în pagina lor, dar există în fișier → le pune înapoi (prin PDF++)
  async heal(pdf, missing) {
    const todo = [...missing].filter(([id]) => /^\d+R\d*$/.test(id) && !this.noHeal.has(pdf.path + "|" + id)); if (!todo.length) return 0;
    const io = this.app.plugins.plugins["pdf-plus"]?.lib?.highlight?.writeFile?.getPdfIo?.(); if (!io || typeof io.process !== "function") return 0;
    let n = 0; const done = new Set();
    await io.process(pdf, doc => {
      for (const [id, pageNo] of todo) {
        try {
          const m = /^(\d+)R(\d*)$/.exec(id), page = doc.getPage(pageNo - 1), Ref = page.ref.constructor, ref = Ref.of(+m[1], m[2] ? +m[2] : 0);
          const obj = doc.context.lookup(ref); if (!obj || typeof obj.entries !== "function") continue;
          const st = String(obj.entries().find(([k]) => String(k) === "/Subtype")?.[1] || "");
          if (!/^\/(Highlight|Underline|Squiggly|StrikeOut)$/.test(st)) continue;
          const annots = page.node.Annots?.(); if (annots && annots.asArray().some(x => String(x) === String(ref))) { done.add(id); continue; }
          page.node.addAnnot(ref); done.add(id); n++;
        } catch (e) {}
      }
    });
    for (const [id] of todo) if (!done.has(id)) this.noHeal.add(pdf.path + "|" + id);
    if (n) this.cache.delete(pdf.path);
    return n;
  }
  // aduce în notă evidențierile din PDF care lipsesc din ea, fiecare la locul ei; { added, healed }
  // orphans: doar cele la care nu trimite nicio notă (importul automat); altfel toate cele care lipsesc din notă
  importFromPdf(pdf, note, opts = {}) { return this.queue(note.path, () => this._import(pdf, note, opts)); }
  async _import(pdf, note, { orphans = false } = {}) {
    let list = await this.read(pdf);
    const ed = this.editorOf(note), src = ed ? ed.getValue() : await this.app.vault.read(note);
    const inNote = this.idsIn(src, pdf, note.path), inPdf = new Set(list.map(h => h.id));
    this.learn(list, src, pdf, note.path);
    let retagged = 0;
    try { retagged = await this.retag(pdf, note, list, ed); } catch (e) { console.warn("Texere: etichetele după culoare", e); }
    let healed = 0;
    const missing = [...inNote].filter(([id]) => !inPdf.has(id));
    if (missing.length) { try { healed = await this.heal(pdf, missing); if (healed) list = await this.read(pdf); } catch (e) { console.warn("Texere: evidențierile de pus înapoi", e); } }
    const skip = orphans ? this.linkedAnywhere(pdf) : new Set();
    // evidențierile altcuiva (alt autor decât cel din PDF++ → Author) nu intră în notă
    const theirs = h => this.theirs(h);
    const others = list.filter(h => !inNote.has(h.id) && theirs(h));
    const fresh = list.filter(h => !inNote.has(h.id) && !skip.has(h.id) && !(h.tiny && !h.text) && !theirs(h));
    const otherInfo = others.length ? { others: others.length, by: [...new Set(others.map(h => h.author))].slice(0, 3).join(", "), authors: [...new Set(others.map(h => h.author))], pdf } : {};
    if (!fresh.length) { this.markScanned(pdf); return { added: 0, healed, retagged, ...otherInfo }; }
    const cmpKey = x => [x.page, x.key];
    const keyOf = new Map(list.map(h => [h.id, ordKey(h.col, h.y, h.x)]));
    // proprietățile notei (o notă abia creată poate să nu fie încă citită de Obsidian: id și page se iau din text)
    let props = { ...(this.app.metadataCache.getFileCache(note)?.frontmatter || {}) };
    const fmText = /^---\n([\s\S]*?)\n---/.exec(src)?.[1] || "", fmVal = k => new RegExp(`^${k}:\\s*["']?([^"'\\n]+?)["']?\\s*$`, "m").exec(fmText)?.[1];
    if (!props.id) props.id = fmVal("id") || await this.citekeyOf(note);
    if (props.page == null && fmVal("page")) props.page = fmVal("page");
    const safeLine = h => { try { return this.lineFor(h, pdf, note, list, props); } catch (e) { console.warn("Texere: rândul evidențierii", h.id, e); return this.plainLine(h, pdf, note, list, props); } };
    const items = fresh.map(h => ({ h, line: safeLine(h), loc: { page: h.page, annot: h.id, key: keyOf.get(h.id) } }))
      .sort((a, b) => a.loc.page - b.loc.page || a.loc.key - b.loc.key || parseInt(a.h.id) - parseInt(b.h.id));
    // planul: fiecare evidențiere nouă după cea care o precede în PDF; mai multe în același loc rămân în ordinea din PDF
    const plan = text => {
      const L = text.split("\n"), { start, entries } = this.linesOf(L, pdf, note.path);
      for (const e of entries) e.loc.key = e.loc.annot && keyOf.has(e.loc.annot) ? keyOf.get(e.loc.annot) : Number.MAX_SAFE_INTEGER;
      const cmp = (a, b) => { const A = cmpKey(a), B = cmpKey(b); return A[0] - B[0] || A[1] - B[1]; };
      const groups = new Map(), have = this.idsIn(text, pdf, note.path);
      for (const it of items) { if (have.has(it.h.id)) continue; const at = this.placeAt(L, start, entries, it.loc, cmp); (groups.get(at) || groups.set(at, []).get(at)).push(it.line); }
      return { L, groups };
    };
    const block = (L, at, lines) => { const add = []; if (at > 0 && L[at - 1].trim() !== "") add.push(""); lines.forEach((l, k) => { if (k) add.push(""); add.push(l); }); if (at < L.length && L[at].trim() !== "") add.push(""); return add; };
    let added = 0;
    if (ed) {
      const { L, groups } = plan(ed.getValue());
      const changes = [...groups].sort((a, b) => b[0] - a[0]).map(([at, lines]) => { added += lines.length; const add = block(L, at, lines);
        return at < L.length ? { from: { line: at, ch: 0 }, text: add.join("\n") + "\n" } : { from: { line: L.length - 1, ch: L[L.length - 1].length }, text: "\n" + add.join("\n") }; });
      if (changes.length) { if (typeof ed.transaction === "function") ed.transaction({ changes }); else for (const c of changes) ed.replaceRange(c.text, c.from); }
    } else {
      await this.app.vault.process(note, text => {
        const { L, groups } = plan(text); if (!groups.size) return text;
        const out = [];
        for (let i = 0; i <= L.length; i++) { if (groups.has(i)) { added += groups.get(i).length; out.push(...block(L, i, groups.get(i))); } if (i < L.length) out.push(L[i]); }
        return out.join("\n");
      });
    }
    this.markScanned(pdf);
    return { added, healed, retagged, ...otherInfo };
  }
  report(results) {
    this.offerOthers(results);
    const add = results.filter(r => r.added), heal = results.filter(r => r.healed), tag = results.filter(r => r.retagged); if (!add.length && !heal.length && !tag.length) return;
    const T = (a, b) => this.T(a, b), parts = [];
    const sum = k => results.reduce((s, r) => s + (r[k] || 0), 0);
    if (add.length) parts.push(add.length === 1 ? T(`Am adus din PDF ${sum("added")} evidențieri în „${add[0].note.basename}”.`, `Brought ${sum("added")} highlights from the PDF into “${add[0].note.basename}”.`)
      : T(`Am adus din PDF-uri ${sum("added")} evidențieri în ${add.length} note: `, `Brought ${sum("added")} highlights from PDFs into ${add.length} notes: `) + add.map(r => `${r.note.basename.split(" – ")[0]} (${r.added})`).join(", ") + ".");
    if (heal.length) parts.push(T(`Am pus înapoi în PDF ${sum("healed")} evidențieri la care trimite nota.`, `Put back ${sum("healed")} highlights in the PDF that the note links to.`));
    if (tag.length) parts.push(T(`Am pus eticheta după culoare pe ${sum("retagged")} evidențieri fără etichetă`, `Tagged ${sum("retagged")} untagged highlights by their color`) + (tag.length === 1 ? ` („${tag[0].note.basename}”).` : ` (${tag.map(r => `${r.note.basename.split(" – ")[0]}: ${r.retagged}`).join(", ")}).`));
    new Notice(parts.join(" "), 9000);
  }
  // automat: la deschiderea notei sau a PDF-ului (doar dacă PDF-ul s-a schimbat de la ultima citire)
  async autoFor(f) {
    const out = [];
    for (const { pdf, note } of this.pairsFor(f)) {
      if (this.scanned(pdf)) continue;
      try { const r = await this.importFromPdf(pdf, note, { orphans: true }); out.push({ ...r, note }); } catch (e) { console.warn("Texere: importul evidențierilor", pdf.path, e); }
    }
    this.report(out);
  }
  // la pornire: sursele cu PDF schimbat de la ultima citire (prima dată, toate)
  async sweep() {
    const out = [], seen = new Set(), pairs = [];
    for (const note of this.app.vault.getMarkdownFiles()) {
      for (const pdf of this.pdfsOf(note)) {
        if (seen.has(pdf.path) || this.scanned(pdf)) continue; seen.add(pdf.path);
        if (this.notesFor(pdf).length === 1) pairs.push({ pdf, note });
      }
    }
    // întâi culorile → etichetele din toate notele (o culoare veche dintr-un PDF se recunoaște din altul)
    for (const { pdf, note } of pairs) { try { this.learn(await this.read(pdf), await this.app.vault.cachedRead(note), pdf, note.path); } catch (e) {} }
    for (const { pdf, note } of pairs) {
      try { const r = await this.importFromPdf(pdf, note, { orphans: true }); out.push({ ...r, note }); } catch (e) { console.warn("Texere: importul evidențierilor", pdf.path, e); }
    }
    this.report(out);
  }
  // o dată: rândurile vechi rămase fără etichetă (importate când culoarea nu era în paletă) primesc eticheta după culoare;
  // doar etichetele, fără să aducă înapoi evidențieri șterse din note
  async retagSweep() {
    const c = this.S.conf(); if (c.hlRetag === 1) return;
    const names = Object.keys(this.app.plugins.plugins["pdf-plus"]?.settings?.colors || {}).map(n => n.toLowerCase()); if (!names.length) return;
    const bare = l => LINK.test(l) && !/^\s*(>|#{1,6}\s)/.test(l) && ![...l.matchAll(/(?:^|\s)#([\w-]+)/g)].some(x => names.includes(x[1].toLowerCase()));
    const out = [];
    for (const note of this.app.vault.getMarkdownFiles()) {
      const pdfs = this.pdfsOf(note); if (!pdfs.length) continue;
      let text = ""; try { text = await this.app.vault.cachedRead(note); } catch (e) { continue; }
      if (!text.split("\n").some(bare)) continue;
      let n = 0;
      for (const pdf of pdfs) { try { n += await this.queue(note.path, async () => this.retag(pdf, note, await this.read(pdf), this.editorOf(note))); } catch (e) { console.warn("Texere: etichetele după culoare", pdf.path, e); } }
      if (n) out.push({ note, retagged: n });
    }
    c.hlRetag = 1; await this.S.save();
    this.report(out);
  }
  // la cerere (comanda sau meniul): toate cele care lipsesc din notă
  async importManual(f) {
    const out = [];
    for (const { pdf, note } of this.pairsFor(f)) {
      try { const r = await this.importFromPdf(pdf, note); out.push({ ...r, note }); } catch (e) { console.error("Texere: importul evidențierilor", e); new Notice(this.T("Nu am putut aduce evidențierile din PDF: ", "Couldn't bring the highlights from the PDF: ") + (e?.message || e), 10000); return; }
    }
    const did = out.some(r => r.added || r.healed || r.retagged);
    this.report(out);   // cu întrebarea despre evidențierile făcute sub alt nume, dacă sunt
    if (!did) new Notice(this.T("Nota are deja toate evidențierile tale din PDF.", "The note already has all your highlights from the PDF."), 7000);
  }
}

module.exports = { install(S) { const H = new Highlights(S); S.highlights = H; H.start(); return H; }, Highlights, loc, readHighlights, nearestTag, sameAuthor, textIn, layout, quadsOf, similar, glyphRuns, mergeRuns, gutterOf, colOf, ordKey };
