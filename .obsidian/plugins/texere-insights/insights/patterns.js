// Texere · Insights · tiparele: ce subiecte cresc, ce citești și nu scrii, perechi de concepte pe care nu le-ai legat,
// note-punte, note uitate care contează acum, ritmul tezei, echilibrul surselor, afirmații și întrebări, lectura lângă scris.
// Totul se calculează din trecerea prin vault (links.js) și din jurnalul scrisului (writing.js); nimic nu pleacă de pe laptop.
const X = require("./text");

const month = ts => { const d = new Date(ts || 0); return `${d.getFullYear()}-${X.pad(d.getMonth() + 1)}`; };
const monthsBack = (n, now = new Date()) => { const out = []; const d = new Date(now.getFullYear(), now.getMonth(), 1); for (let i = 0; i < n; i++) { out.unshift(month(d)); d.setMonth(d.getMonth() - 1); } return out; };
const sum = o => Object.values(o || {}).reduce((a, b) => a + (+b || 0), 0);

const PatternsMixin = {
  notesC() { return this.scanCache?.notes || {}; },
  nameOf(path) { const f = this.app.vault.getAbstractFileByPath(path); return f ? f.basename : String(path).split("/").pop().replace(/\.md$/, ""); },
  conceptsOf(path, e) { const s = new Set([...Object.keys(e.counts || {}), ...(e.fm || [])]); s.delete(path); return s; },
  // activitatea fiecărei note pe luni, din jurnal: cuvinte scrise și evidențieri adăugate
  activity() {
    const act = {};
    for (const [k, D] of Object.entries(this.merged())) { const m = k.slice(0, 7); for (const [p, v] of Object.entries(D.n || {})) { const a = act[p] = act[p] || {}; const o = a[m] = a[m] || { w: 0, r: 0 }; o.w += v.t + v.p + v.x; o.r += v.r || 0; } }
    return act;
  },
  // interesul pentru fiecare concept, pe luni: r = cât ai citit (evidențieri), w = cât ai scris (cuvinte în notele care îl menționează)
  interest() {
    const act = this.activity(), out = {};
    for (const [path, e] of Object.entries(this.notesC())) {
      if (e.kind === "target") continue;
      const cs = this.conceptsOf(path, e); if (!cs.size) continue;
      const contrib = {}, cm = month(e.created), logged = act[path] || {};
      if (e.kind === "lit") contrib[cm] = { r: Math.max(1, sum(e.hl)), w: 0 }; else contrib[cm] = { w: Math.max(1, Math.min(e.words || 0, 3000)), r: 0 };
      for (const [m, v] of Object.entries(logged)) { const o = contrib[m] = contrib[m] || { w: 0, r: 0 }; if (m === cm) { if (e.kind === "lit") o.r = Math.max(o.r, v.r); else o.w = Math.max(v.w, 0); } else { o.w += v.w; o.r += v.r; } }
      for (const c of cs) { const C = out[c] = out[c] || {}; for (const [m, v] of Object.entries(contrib)) { const o = C[m] = C[m] || { r: 0, w: 0 }; o.r += v.r; o.w += v.w; } }
    }
    return out;
  },
  // subiectele care cresc, cele care scad și cele pe care le citești, dar nu scrii despre ele
  emerging(now = new Date()) {
    const I = this.interest(), ms = monthsBack(6, now), recent = ms.slice(-2), before = ms.slice(0, 4), score = v => v.r + v.w / 50;
    const rows = [];
    for (const [c, M] of Object.entries(I)) {
      if (!this.app.vault.getAbstractFileByPath(c)) continue;
      const rec = recent.reduce((a, m) => a + (M[m] ? score(M[m]) : 0), 0), bef = before.reduce((a, m) => a + (M[m] ? score(M[m]) : 0), 0) / 2;
      const r6 = ms.reduce((a, m) => a + (M[m]?.r || 0), 0), w6 = ms.reduce((a, m) => a + (M[m]?.w || 0), 0);
      rows.push({ path: c, name: this.nameOf(c), rec, bef, r6, w6, series: monthsBack(12, now).map(m => M[m] ? score(M[m]) : 0) });
    }
    const rising = rows.filter(r => r.rec >= 2 && r.rec > r.bef * 1.5).sort((a, b) => (b.rec - b.bef) - (a.rec - a.bef)).slice(0, 6);
    const fading = rows.filter(r => r.bef >= 2 && r.rec < r.bef * 0.4).sort((a, b) => (b.bef - b.rec) - (a.bef - a.rec)).slice(0, 4);
    const unwritten = rows.filter(r => r.r6 >= 3 && r.w6 < 50).sort((a, b) => b.r6 - a.r6).slice(0, 5);
    return { rising, fading, unwritten };
  },
  // povestea unui concept: când a apărut, din ce sursă, cum a crescut
  timeline(c, now = new Date()) {
    const I = this.interest()[c] || {}, N = this.notesC(); let first = null, firstSrc = null, own = 0, lit = 0;
    for (const [p, e] of Object.entries(N)) { if (e.kind === "target" || !this.conceptsOf(p, e).has(c)) continue; if (e.kind === "lit") { lit++; if (!firstSrc || e.created < N[firstSrc].created) firstSrc = p; } else own++; if (!first || e.created < N[first].created) first = p; }
    return { path: c, name: this.nameOf(c), first, firstAt: first ? N[first].created : null, firstSrc, own, lit, months: monthsBack(12, now), r: monthsBack(12, now).map(m => I[m]?.r || 0), w: monthsBack(12, now).map(m => I[m]?.w || 0) };
  },
  // perechi ascunse: concepte care apar des în aceleași paragrafe, mai des decât la întâmplare, dar fără link între ele
  pairs(n = 10) {
    const cc = {}, pc = {}, pn = {}, ignore = new Set(this.settings.ignoredPairs || []); let P = 0;
    for (const [path, e] of Object.entries(this.notesC())) {
      if (e.kind === "target") continue;
      for (const para of e.paras || []) {
        const c = [...new Set(para.c)].filter(x => this.app.vault.getAbstractFileByPath(x)); if (!c.length) continue; P++;
        for (const x of c) cc[x] = (cc[x] || 0) + 1;
        for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) { const [a, b] = [c[i], c[j]].sort(), k = a + "\u0000" + b; pc[k] = (pc[k] || 0) + 1; (pn[k] = pn[k] || new Set()).add(path); }
      }
    }
    const rl = this.app.metadataCache.resolvedLinks || {}, out = [];
    for (const [k, cnt] of Object.entries(pc)) {
      const [a, b] = k.split("\u0000"); if (cnt < 3 || pn[k].size < 2 || ignore.has(k)) continue;
      if (rl[a]?.[b] || rl[b]?.[a]) continue;
      const pmi = Math.log2(cnt * P / (cc[a] * cc[b])); if (pmi < 0.6) continue;
      out.push({ a, b, an: this.nameOf(a), bn: this.nameOf(b), count: cnt, notes: [...pn[k]], score: cnt * pmi });
    }
    return out.sort((x, y) => y.score - x.score).slice(0, n);
  },
  // notele-punte: singura legătură dintre un grup de note și restul vault-ului
  bridges(n = 5) {
    const rl = this.app.metadataCache.resolvedLinks || {}, adj = new Map(), ok = p => !this.scanExcluded(p) && p.endsWith(".md");
    const link = (a, b) => { if (a === b || !ok(a) || !ok(b)) return; (adj.get(a) || adj.set(a, new Set()).get(a)).add(b); (adj.get(b) || adj.set(b, new Set()).get(b)).add(a); };
    for (const [a, m] of Object.entries(rl)) for (const b of Object.keys(m)) link(a, b);
    const nodes = [...adj.keys()], disc = new Map(), low = new Map(), aps = new Set(); let t = 0;
    for (const root of nodes) {   // Tarjan, fără recursivitate
      if (disc.has(root)) continue; disc.set(root, t); low.set(root, t++); let rootKids = 0;
      const stack = [[root, null, [...adj.get(root)], 0]];
      while (stack.length) {
        const top = stack[stack.length - 1], [u, parent, nb] = top;
        if (top[3] < nb.length) {
          const v = nb[top[3]++];
          if (!disc.has(v)) { disc.set(v, t); low.set(v, t++); if (u === root) rootKids++; stack.push([v, u, [...adj.get(v)], 0]); }
          else if (v !== parent) low.set(u, Math.min(low.get(u), disc.get(v)));
        } else {
          stack.pop();
          if (parent !== null) { low.set(parent, Math.min(low.get(parent), low.get(u))); if (parent !== root && low.get(u) >= disc.get(parent)) aps.add(parent); }
        }
      }
      if (rootKids > 1) aps.add(root);
    }
    const out = [];
    for (const ap of aps) {
      const seen = new Set([ap]), comps = [];
      for (const s of adj.get(ap)) { if (seen.has(s)) continue; const q = [s]; seen.add(s); let size = 0, sample = []; while (q.length) { const x = q.pop(); size++; if (sample.length < 3) sample.push(x); for (const y of adj.get(x)) if (!seen.has(y)) { seen.add(y); q.push(y); } } comps.push({ size, sample }); }
      comps.sort((a, b) => b.size - a.size); if (comps.length < 2 || comps[1].size < 3) continue;
      out.push({ path: ap, name: this.nameOf(ap), small: comps[1], big: comps[0], own: this.isOwn(ap) });
    }
    return out.sort((a, b) => (b.own - a.own) || b.small.size - a.small.size).slice(0, n);
  },
  // note uitate (neatinse de peste 2 luni) care au concepte comune cu ce scrii acum
  resurface(n = 3, now = Date.now()) {
    const N = this.notesC(), days = this.merged(), recent = new Map(), df = {}; let docs = 0;
    for (const [p, e] of Object.entries(N)) { if (e.kind === "target") continue; docs++; for (const c of this.conceptsOf(p, e)) df[c] = (df[c] || 0) + 1; }
    const touched = new Set(); for (const [k, D] of Object.entries(days)) if (now - X.parseDay(k).getTime() < 8 * 864e5) for (const p of Object.keys(D.n || {})) touched.add(p);
    for (const [p, e] of Object.entries(N)) if (e.kind === "own" && (touched.has(p) || now - e.mtime < 7 * 864e5)) for (const c of this.conceptsOf(p, e)) recent.set(c, (recent.get(c) || 0) + 1);
    if (!recent.size) return [];
    const out = [];
    for (const [p, e] of Object.entries(N)) {
      if (e.kind === "target" || touched.has(p) || now - e.mtime < 60 * 864e5) continue;
      const shared = [...this.conceptsOf(p, e)].filter(c => recent.has(c)); if (!shared.length) continue;
      const score = shared.reduce((a, c) => a + Math.log((docs + 1) / (df[c] || 1)), 0);
      out.push({ path: p, name: this.nameOf(p), shared: shared.map(c => this.nameOf(c)).slice(0, 3), months: Math.round((now - e.mtime) / (30 * 864e5)), score });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, n);
  },
  // întrebările din lectură (#question) din surse pe care nu le-ai citat încă în notele tale
  openQuestions() {
    const N = this.notesC(), cited = new Set(); for (const e of Object.values(N)) for (const c of e.cites || []) cited.add(c);
    const out = []; for (const [p, e] of Object.entries(N)) if (e.kind === "lit" && e.qs?.length && !(e.id && cited.has(e.id))) for (const q of e.qs) if (q) out.push({ path: p, q, source: this.citeLabel(e.id, p) });
    return out;
  },
  // „surprinde-mă”: ceva uitat sau o legătură pe care n-ai făcut-o, cu motivul pentru care poate conta acum
  surprise() {
    const pool = [], T = (a, b) => this.T(a, b);
    for (const r of this.resurface(8)) pool.push({ kind: T("Notă uitată", "Forgotten note"), title: r.name, path: r.path, text: T(`Neatinsă de ${r.months} luni. Are în comun cu ce scrii acum: ${r.shared.join(", ")}.`, `Untouched for ${r.months} months. Shares with what you're writing now: ${r.shared.join(", ")}.`) });
    for (const q of this.openQuestions().slice(0, 40)) pool.push({ kind: T("Întrebare deschisă", "Open question"), title: q.source, path: q.path, text: q.q });
    for (const p of this.pairs(8)) pool.push({ kind: T("Legătură nefăcută", "Unmade connection"), title: `${p.an} + ${p.bn}`, path: p.notes[0], pair: p, text: T(`Apar împreună în ${p.count} paragrafe din ${p.notes.length} note, dar nicio notă nu le leagă.`, `They appear together in ${p.count} paragraphs across ${p.notes.length} notes, but no note connects them.`) });
    for (const e of this.emerging().unwritten) pool.push({ kind: T("Citit, nescris", "Read, not written"), title: e.name, path: e.path, text: T(`${Math.round(e.r6)} evidențieri în ultimele 6 luni, aproape nimic scris.`, `${Math.round(e.r6)} highlights in the last 6 months, almost nothing written.`) });
    if (!pool.length) return null;
    let last = this._lastSurprise, pick; for (let i = 0; i < 5; i++) { pick = pool[Math.floor(Math.random() * pool.length)]; if (pick.title !== last) break; }
    this._lastSurprise = pick.title; return pick;
  },
  // ritmul tezei: cuvinte acum, pe săptămână, când ajungi la țintă
  thesis(now = new Date()) {
    const folder = String(this.settings.thesisFolder || "03. Workspace/02. Thesis").replace(/\/+$/, ""), N = this.notesC();
    let words = 0, docs = 0; for (const [p, e] of Object.entries(N)) if (p.startsWith(folder + "/")) { words += e.words || 0; docs++; }
    const weeks = []; for (let i = 7; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i * 7); const wk = X.weekKey(d); weeks.push({ wk, net: 0 }); }
    for (const [k, D] of Object.entries(this.merged())) { const wk = X.weekKey(X.parseDay(k)), w = weeks.find(x => x.wk === wk); if (!w) continue; for (const [p, v] of Object.entries(D.n || {})) if (p.startsWith(folder + "/")) w.net += v.t + v.p + v.x - v.d; }
    const last4 = weeks.slice(-5, -1), logged = last4.filter(w => w.net !== 0).length, avg = logged ? last4.reduce((a, w) => a + w.net, 0) / 4 : 0;
    const target = +this.settings.thesisTarget || 0, deadline = this.settings.thesisDeadline ? new Date(this.settings.thesisDeadline) : null;
    let eta = null, perWeek = null;
    if (target && words < target && avg > 0) { eta = new Date(now.getTime() + (target - words) / avg * 7 * 864e5); }
    if (target && deadline && deadline > now) perWeek = Math.max(0, Math.ceil((target - words) / Math.max(1, (deadline - now) / (7 * 864e5))));
    return { folder, exists: !!this.app.vault.getAbstractFileByPath(folder), words, docs, weeks, avg: Math.round(avg), target, deadline, eta, perWeek };
  },
  // echilibrul surselor citate în notele tale (sau doar în teză): autori, decenii, limbi, tipuri
  balance(scope) {
    const N = this.notesC(), lib = this.library(), byId = {}; let total = 0;
    const litById = {}; for (const [p, e] of Object.entries(N)) if (e.kind === "lit" && e.id) litById[e.id] = p;
    for (const [p, e] of Object.entries(N)) { if (e.kind !== "own" || (scope && !p.startsWith(scope + "/"))) continue; for (const c of e.cites || []) { byId[c] = (byId[c] || 0) + 1; total++; } }
    const authors = {}, decades = {}, langs = {}, types = {}; let oldest = null, newest = null;
    for (const [id, n] of Object.entries(byId)) {
      const s = lib[id] || this.cslFromNote(litById[id]) || {};
      const fam = (s.author || [])[0]?.family || (s.author || [])[0]?.literal || "?"; authors[fam] = (authors[fam] || 0) + n;
      const y = +(s.issued?.["date-parts"]?.[0]?.[0] || s.year || 0); if (y) { const d = Math.floor(y / 10) * 10; decades[d] = (decades[d] || 0) + n; oldest = oldest === null ? y : Math.min(oldest, y); newest = newest === null ? y : Math.max(newest, y); }
      const lang = this.langOf(s); langs[lang] = (langs[lang] || 0) + n;
      const ty = s.type || "?"; types[ty] = (types[ty] || 0) + n;
    }
    const top = Object.entries(authors).sort((a, b) => b[1] - a[1])[0];
    return { total, unique: Object.keys(byId).length, authors, decades, langs, types, oldest, newest, top: top ? { name: top[0], n: top[1], share: total ? top[1] / total : 0 } : null };
  },
  cslFromNote(path) { const f = path && this.app.vault.getAbstractFileByPath(path); const fm = f && this.app.metadataCache.getFileCache(f)?.frontmatter; return fm ? { author: fm.author, issued: fm.issued, type: fm.type, language: fm.language, title: fm.title, year: fm.year } : null; },
  langOf(s) { const l = String(s.language || "").toLowerCase(); if (l) return l.startsWith("ro") ? "ro" : l.startsWith("en") ? "en" : l.slice(0, 2); return /[ăâîșşțţ]/i.test(String(s.title || "")) ? "ro" : "en"; },
  // afirmații și întrebări: cum citești (ce evidențiezi), pe surse
  claims() {
    const N = this.notesC(), tot = {}, per = [];
    for (const [p, e] of Object.entries(N)) { if (e.kind !== "lit" || !e.hl) continue; const s = sum(e.hl); if (!s) continue; for (const [k, v] of Object.entries(e.hl)) tot[k] = (tot[k] || 0) + v; per.push({ path: p, name: this.citeLabel(e.id, p), hl: e.hl, total: s }); }
    return { tot, per: per.sort((a, b) => b.total - a.total), total: sum(tot) };
  },
  // lectura lângă scris, pe săptămâni (evidențieri adăugate / cuvinte scrise)
  readingWriting(weeks = 12, now = new Date()) {
    const out = []; for (let i = weeks - 1; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i * 7); out.push({ wk: X.weekKey(d), r: 0, w: 0, est: false }); }
    const logged = new Set();
    for (const [k, D] of Object.entries(this.merged())) { const wk = X.weekKey(X.parseDay(k)), o = out.find(x => x.wk === wk); if (!o) continue; o.r += D.r || 0; o.w += D.t + D.p + D.x; logged.add(wk); }
    // săptămânile dinainte de jurnal: o estimare din notele create atunci
    for (const [p, e] of Object.entries(this.notesC())) { const wk = X.weekKey(new Date(e.created)), o = out.find(x => x.wk === wk); if (!o || logged.has(wk)) continue; o.est = true; if (e.kind === "lit") o.r += sum(e.hl); else if (e.kind === "own") o.w += e.words || 0; }
    return out;
  },
  // comportamentul tău, în propoziții: ora și ziua cea mai bună, ciornă sau revizie, cât lipești și cât inserezi
  habits() {
    const T = (a, b) => this.T(a, b), out = [], h = this.hours(90), wd = this.weekdays(180), m = this.totals("month"), kinds = this.dayKinds(60);
    const totH = h.reduce((a, b) => a + b, 0);
    if (totH > 200) { let best = 0; for (let i = 0; i < 24; i++) { const s = h[i] + h[(i + 1) % 24]; if (s > h[best] + h[(best + 1) % 24]) best = i; } out.push(T(`Scrii cel mai mult între ${best}:00 și ${(best + 2) % 24}:00.`, `You write most between ${best}:00 and ${(best + 2) % 24}:00.`)); }
    const totW = wd.reduce((a, b) => a + b, 0);
    if (totW > 300) { const names = this.en ? ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"] : ["lunea", "marțea", "miercurea", "joia", "vinerea", "sâmbăta", "duminica"]; const i = wd.indexOf(Math.max(...wd)); out.push(T(`Ziua ta cea mai bună: ${names[i]} (${Math.round(wd[i] / totW * 100)}% din cuvinte).`, `Your best day: ${names[i]} (${Math.round(wd[i] / totW * 100)}% of your words).`)); }
    if (kinds.draft + kinds.edit >= 4) out.push(kinds.edit > kinds.draft ? T(`Mai mult revizuiești decât scrii de la zero: ${kinds.edit} zile de revizie, ${kinds.draft} de ciornă (ultimele 2 luni).`, `You revise more than you draft: ${kinds.edit} editing days, ${kinds.draft} drafting days (last 2 months).`) : T(`Mai mult scrii de la zero decât revizuiești: ${kinds.draft} zile de ciornă, ${kinds.edit} de revizie (ultimele 2 luni).`, `You draft more than you revise: ${kinds.draft} drafting days, ${kinds.edit} editing days (last 2 months).`));
    if (m.added >= 200) { const pp = Math.round(m.p / m.added * 100), xp = Math.round(m.x / m.added * 100); out.push(T(`Luna aceasta: ${100 - pp - xp}% scris de tine, ${pp}% lipit, ${xp}% inserat de alte unelte.`, `This month: ${100 - pp - xp}% typed by you, ${pp}% pasted, ${xp}% inserted by other tools.`)); if (m.t > 100) out.push(T(`Ștergi ${Math.round(m.revision * 100)} de cuvinte la fiecare 100 scrise.`, `You delete ${Math.round(m.revision * 100)} words for every 100 you type.`)); }
    const rw = this.readingWriting(8), r = rw.reduce((a, x) => a + x.r, 0), w = rw.reduce((a, x) => a + x.w, 0);
    if (r + w > 0) out.push(r && w ? T(`În ultimele 8 săptămâni: ${r} evidențieri și ${w.toLocaleString("ro-RO")} cuvinte — ${Math.round(w / Math.max(1, r))} de cuvinte scrise la o evidențiere.`, `Last 8 weeks: ${r} highlights and ${w.toLocaleString("en-GB")} words — ${Math.round(w / Math.max(1, r))} words written per highlight.`) : r ? T(`În ultimele 8 săptămâni ai citit (${r} evidențieri), dar n-ai scris aproape nimic.`, `In the last 8 weeks you read (${r} highlights) but wrote almost nothing.`) : T(`În ultimele 8 săptămâni ai scris, dar n-ai evidențiat nimic nou.`, `In the last 8 weeks you wrote, but highlighted nothing new.`));
    return out;
  },
  // ——— ideea zilei pentru tab-ul nou: una singură, alta în fiecare zi ———
  insightOfTheDay() {
    const T = (a, b) => this.T(a, b), list = [];
    const em = this.emerging(); if (em.rising[0]) list.push({ icon: "trending-up", text: T(`În creștere: ${em.rising.slice(0, 3).map(r => r.name).join(", ")}.`, `Rising: ${em.rising.slice(0, 3).map(r => r.name).join(", ")}.`) });
    if (em.unwritten[0]) list.push({ icon: "book-open", text: T(`Citești despre ${em.unwritten[0].name}, dar n-ai scris încă despre asta.`, `You read about ${em.unwritten[0].name}, but haven't written about it yet.`), path: em.unwritten[0].path });
    const p = this.pairs(1)[0]; if (p) list.push({ icon: "git-merge", text: T(`${p.an} și ${p.bn} apar împreună în ${p.count} paragrafe, dar nu le-ai legat.`, `${p.an} and ${p.bn} appear together in ${p.count} paragraphs, but you haven't linked them.`), pair: p });
    const r = this.resurface(1)[0]; if (r) list.push({ icon: "history", text: T(`„${r.name}”, neatinsă de ${r.months} luni, are legătură cu ce scrii acum.`, `“${r.name}”, untouched for ${r.months} months, relates to what you're writing now.`), path: r.path });
    for (const s of this.habits()) list.push({ icon: "activity", text: s });
    if (!list.length) return null;
    const d = new Date(); return list[(d.getFullYear() * 400 + d.getMonth() * 31 + d.getDate()) % list.length];
  },
};

module.exports = { PatternsMixin, monthsBack, month };
