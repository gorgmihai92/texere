// Texere · Sources · Zotero
//  • biblioteca ta din Zotero e un catalog în „Adaugă o sursă” (cu Zotero deschis, prin API-ul local; sau oricând, cu o cheie Zotero);
//    sursa vine cu datele din Zotero și cu PDF-ul ei;
//  • importul unei colecții sau al întregii biblioteci, dintr-odată (sursele care există deja se sar);
//  • butonul Zotero din browser (Zotero Connector) aduce sursa în Texere, singură, cu PDF-ul:
//    – cu Zotero deschis, butonul salvează în Zotero, ca de obicei, iar Texere ia sursa nouă din Zotero (prin API-ul local);
//    – cu Zotero închis, Texere ține locul lui Zotero pe portul 23119 și vorbește protocolul conectorului;
//      cât timp Zotero rulează, Texere NU ține portul (Zotero nu mai încearcă a doua oară: și-ar pierde conexiunea până la repornire).
const { Notice, Modal, TFile, requestUrl, Platform, loadPdfJs, setIcon } = require("obsidian");
// Obsidian în fundal (salvezi din browser, lucrezi în Zotero): ceasurile ferestrei merg încetinite, cele ale lui Node nu.
// Așteptările butonului Zotero (PDF-ul care vine, sursa nouă din Zotero) folosesc ceasurile lui Node, ca să nu rămână „în așteptare”.
const NT = (() => { try { const t = require("timers"); return typeof t?.setTimeout === "function" ? t : null; } catch (e) { return null; } })();
const later = (f, ms) => (NT ? NT.setTimeout(f, ms) : setTimeout(f, ms));
const unlater = h => { if (h == null) return; try { if (NT) NT.clearTimeout(h); else clearTimeout(h); } catch (e) {} };
const sleep = ms => new Promise(r => later(r, ms));
// diacriticele scrise în LaTeX (unele situri le dau așa: PhilPapers scrie „Etic\ua” pentru „Etică”): Vic{\u{a}}, \ua, \c{s}, {\'e}
const ACC = { "`": "\u0300", "'": "\u0301", "^": "\u0302", "~": "\u0303", "=": "\u0304", u: "\u0306", ".": "\u0307", '"': "\u0308", r: "\u030A", H: "\u030B", v: "\u030C", c: "\u0327", k: "\u0328" };
const deLatex = v => {
  if (typeof v !== "string" || !v.includes("\\")) return v;
  const o = v.replace(/\{?\\([`'^~=."])\s*\{?\s*(\\?[a-zA-Z])\s*\}?\}?|\{?\\([uvHckr])(?:\s*\{\s*(\\?[a-zA-Z])\s*\}|\s+(\\?[a-zA-Z])(?![a-zA-Z])|(\\?[a-zA-Z])(?![a-zA-Z]))\}?/g,
    (m, a1, c1, a2, c2, c3, c4) => { const a = a1 || a2, ch = c1 || c2 || c3 || c4; return (ch === "\\i" ? "i" : ch.replace("\\", "")) + (ACC[a] || ""); });
  return o === v ? v : o.normalize("NFC");
};
// litere pierdute: „?” în locul lui ș sau ț („Bucure?ti”, „?i”); un „?” adevărat stă la sfârșit de cuvânt
const MOJI = /\p{L}\?\p{L}|(^|\s)\?\p{L}/u;
const wild = s => new RegExp("(?<![\\p{L}\\p{N}])" + String(s).normalize("NFC").trim().replace(/[.*+^${}()|[\]\\]/g, "\\$&").replace(/\?/g, "\\p{L}").replace(/\s+/g, "\\s+") + "(?![\\p{L}\\p{N}])", "iu");
// când nu există nicio pagină din care să refacem literele: cuvintele românești frecvente, dacă un singur cuvânt se potrivește („Bucure?ti” → „București”)
const RO = ("și să că în într după până față fără când cât câte către între asupra despre adăugită revăzută ediția ediție ediții prefață notă întrebări întrebare răspuns răspunsuri "
  + "bucurești iași timișoara brașov constanța galați pitești ploiești târgu mureș românia română române românesc românească românilor universității editura științe științei științele "
  + "științelor științific științifică științifice filosofică filosofice filozofică etică politică politice critică critice istorică literatură literară limbă limbii gândire gândirea "
  + "ființă ființa ființei conștiință conștiința conștiinței cunoaștere cunoașterea cunoașterii judecată judecata rațiune rațiunea rațiunii societății educație educația educației "
  + "cultură cultura culturii culturală introducere lecții lecție practică practica academică academice morală morale responsabilitate responsabilității tehnologiei inteligență "
  + "inteligența inteligenței artificială artificiale digitală digitale metodă metodologie cercetării națională naționale națiunii traducerea traducători mințile mintea lume lumii "
  + "știință știința renaștere renașterea mișcare mișcarea țară țara țării țări noțiune noțiunea noțiuni funcție funcția relație relația relații acțiune acțiunea acțiuni "
  + "intenție intenția atenție atenția percepție percepția experiență experiența experienței existență existența existenței esență esența esenței școală școala școlii lucrări lucrărilor româniei "
  + "omul omului oameni ființe credință credința viață viața vieții moarte moartea frumusețe frumusețea dreptate dreptatea libertății adevăr adevărul învățământ învățare învățământului").split(" ").filter(w => /[șțăâîşţ]/.test(w));
const roGuess = str => String(str).replace(/[\p{L}?]*\?[\p{L}?]*/gu, (tok, at) => {
  if (!/\p{L}/u.test(tok)) return tok;
  const re = new RegExp("^" + tok.toLowerCase().replace(/\?/g, "[șțăâîşţ]") + "$", "u"), hits = RO.filter(w => re.test(w));
  if (hits.length !== 1) return tok;
  const w = hits[0], letters = tok.replace(/\?/g, "");
  if (letters.length > 1 && letters === letters.toUpperCase()) return w.toUpperCase();                 // „BUCURE?TI”
  return /\p{Lu}/u.test(tok[0]) || (tok[0] === "?" && at === 0) ? w[0].toUpperCase() + w.slice(1) : w;   // „Bucure?ti”, „?tiin?a …” la început
});
// dintr-o pagină întreagă (snapshot-ul trimis de browser, câțiva MB) păstrăm doar titlul și etichetele <meta>
const pageHead = html => { const h = String(html || ""); return [(/<title[^>]*>[\s\S]*?<\/title>/i.exec(h) || [""])[0], ...(h.match(/<meta\b[^>]*>/gi) || [])].join("\n"); };
const unHtml = s => String(s).replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
// etichetele <meta> ale unei pagini (cu sau fără ghilimele): [[nume, conținut], …]
const metaOf = html => {
  const out = [], re = /<meta\b([^>]*)>/gi; let m;
  while ((m = re.exec(html))) {
    const at = {}, ar = /([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g; let a;
    while ((a = ar.exec(m[1]))) at[a[1].toLowerCase()] = a[3] ?? a[4] ?? a[5] ?? "";
    const k = String(at.name || at.property || "").toLowerCase(); if (k && at.content != null) out.push([k, unHtml(at.content)]);
  }
  return out;
};
// DOI-ul dintr-o adresă (…/articles/10.3389/frvir.2025.1502450/full → 10.3389/frvir.2025.1502450)
const doiIn = s => { const m = /\b(10\.\d{4,9}\/[^\s?#"<>&]+)/.exec(decodeURIComponent(String(s || ""))); return m ? m[1].replace(/\/(full|pdf|epdf|abstract|summary|html|meta|fulltext|references|figures|text)(\/.*)?$/i, "").replace(/[.,;:)\]]+$/, "") : null; };
// un PDF minuscul: prin el luăm clasa pdf-lib din PDF++ (cea care știe să descuie PDF-urile cu parolă goală)
const TINY_PDF = "JVBERi0xLjcKJYGBgYEKCjEgMCBvYmoKPDwKL1R5cGUgL1BhZ2VzCi9LaWRzIFsgNCAwIFIgXQovQ291bnQgMQo+PgplbmRvYmoKCjIgMCBvYmoKPDwKL1R5cGUgL0NhdGFsb2cKL1BhZ2VzIDEgMCBSCj4+CmVuZG9iagoKMyAwIG9iago8PAovUHJvZHVjZXIgPEZFRkYwMDcwMDA2NDAwNjYwMDJEMDA2QzAwNjkwMDYyMDAyMDAwMjgwMDY4MDA3NDAwNzQwMDcwMDA3MzAwM0EwMDJGMDAyRjAwNjcwMDY5MDA3NDAwNjgwMDc1MDA2MjAwMkUwMDYzMDA2RjAwNkQwMDJGMDA0ODAwNkYwMDcwMDA2NDAwNjkwMDZFMDA2NzAwMkYwMDcwMDA2NDAwNjYwMDJEMDA2QzAwNjkwMDYyMDAyOT4KL01vZERhdGUgKEQ6MjAyNjEwMzEyMjAxMzlaKQovQ3JlYXRvciA8RkVGRjAwNzAwMDY0MDA2NjAwMkQwMDZDMDA2OTAwNjIwMDIwMDAyODAwNjgwMDc0MDA3NDAwNzAwMDczMDAzQTAwMkYwMDJGMDA2NzAwNjkwMDc0MDA2ODAwNzUwMDYyMDAyRTAwNjMwMDZGMDA2RDAwMkYwMDQ4MDA2RjAwNzAwMDY0MDA2OTAwNkUwMDY3MDAyRjAwNzAwMDY0MDA2NjAwMkQwMDZDMDA2OTAwNjIwMDI5PgovQ3JlYXRpb25EYXRlIChEOjIwMjYxMDMxMjIwMTM5WikKPj4KZW5kb2JqCgo0IDAgb2JqCjw8Ci9UeXBlIC9QYWdlCi9QYXJlbnQgMSAwIFIKL1Jlc291cmNlcyA8PAo+PgovTWVkaWFCb3ggWyAwIDAgMTAgMTAgXQo+PgplbmRvYmoKCnhyZWYKMCA1CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAxNiAwMDAwMCBuIAowMDAwMDAwMDc2IDAwMDAwIG4gCjAwMDAwMDAxMjYgMDAwMDAgbiAKMDAwMDAwMDU5NiAwMDAwMCBuIAoKdHJhaWxlcgo8PAovU2l6ZSA1Ci9Sb290IDIgMCBSCi9JbmZvIDMgMCBSCj4+CgpzdGFydHhyZWYKNjg1CiUlRU9G";
// „[[zz-]hh:]mm:ss” (ps -o etime) → secunde
const etime = s => { const m = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/.exec(String(s).trim()); return m ? (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + +m[3] * 60 + +m[4] : null; };

// ——— din Zotero în CSL (aceleași corespondențe ca în Zotero) ———
const TYPES = { book: "book", bookSection: "chapter", journalArticle: "article-journal", magazineArticle: "article-magazine", newspaperArticle: "article-newspaper",
  thesis: "thesis", letter: "personal_communication", manuscript: "manuscript", interview: "interview", film: "motion_picture", artwork: "graphic", webpage: "webpage",
  report: "report", bill: "bill", case: "legal_case", hearing: "bill", patent: "patent", statute: "legislation", email: "personal_communication", map: "map",
  blogPost: "post-weblog", instantMessage: "personal_communication", forumPost: "post", audioRecording: "song", presentation: "speech", videoRecording: "motion_picture",
  tvBroadcast: "broadcast", radioBroadcast: "broadcast", podcast: "song", computerProgram: "software", document: "document", encyclopediaArticle: "entry-encyclopedia",
  dictionaryEntry: "entry-dictionary", conferencePaper: "paper-conference", preprint: "article", dataset: "dataset", standard: "standard" };
const FIELDS = { title: "title", shortTitle: "title-short", publicationTitle: "container-title", bookTitle: "container-title", proceedingsTitle: "container-title",
  encyclopediaTitle: "container-title", dictionaryTitle: "container-title", websiteTitle: "container-title", blogTitle: "container-title", forumTitle: "container-title",
  programTitle: "container-title", journalAbbreviation: "container-title-short", series: "collection-title", seriesTitle: "collection-title", seriesNumber: "collection-number",
  volume: "volume", issue: "issue", pages: "page", numPages: "number-of-pages", numberOfVolumes: "number-of-volumes", edition: "edition", publisher: "publisher",
  university: "publisher", institution: "publisher", label: "publisher", distributor: "publisher", place: "publisher-place", DOI: "DOI", ISBN: "ISBN", ISSN: "ISSN",
  url: "URL", abstractNote: "abstract", language: "language", thesisType: "genre", reportType: "genre", reportNumber: "number", archive: "archive", archiveLocation: "archive_location",
  callNumber: "call-number", rights: "rights", section: "section", conferenceName: "event-title", meetingName: "event-title" };
const CREATORS = { author: "author", editor: "editor", translator: "translator", contributor: "contributor", bookAuthor: "container-author", seriesEditor: "collection-editor",
  reviewedAuthor: "reviewed-author", director: "director", interviewer: "interviewer", recipient: "recipient", composer: "composer", illustrator: "illustrator" };
const dateParts = s => { const m = /(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?/.exec(String(s || "")); if (!m) return undefined; const p = [+m[1]]; if (+m[2]) { p.push(+m[2]); if (+m[3]) p.push(+m[3]); } return { "date-parts": [p] }; };
function toCsl(it) {
  if (!it) return null;
  const c = { type: TYPES[it.itemType] || "document" };
  for (const [z, k] of Object.entries(FIELDS)) if (it[z] != null && String(it[z]).trim() !== "" && c[k] == null) c[k] = String(it[z]).trim();
  if (it.date) c.issued = dateParts(it.date);
  if (it.accessDate) c.accessed = dateParts(it.accessDate);
  for (const p of it.creators || []) {
    const role = CREATORS[p.creatorType] || "author", who = p.name ? { literal: p.name } : { family: p.lastName || "", given: p.firstName || "" };
    (c[role] = c[role] || []).push(who);
  }
  // „Extra”: rânduri „Câmp: valoare” (Original Date, DOI, Citation Key…)
  for (const line of String(it.extra || "").split(/\n/)) {
    const m = /^\s*([A-Za-z][\w -]*?)\s*:\s*(.+?)\s*$/.exec(line); if (!m) continue;
    const k = m[1].toLowerCase().replace(/\s+/g, "-"), v = m[2];
    if (k === "original-date") c["original-date"] = dateParts(v); else if (k === "doi" && !c.DOI) c.DOI = v; else if (k === "original-title") c["original-title"] = v;
    else if (k === "citation-key") c["citation-key"] = v; else if (k === "isbn" && !c.ISBN) c.ISBN = v; else if (k === "issued" && !c.issued) c.issued = dateParts(v);
  }
  if (it.citationKey && !c["citation-key"]) c["citation-key"] = it.citationKey;
  return c;
}
// culorile evidențierilor din Zotero (paleta lui implicită), cu numele lor
const ZCOLORS = [["#ffd400", "Galben", "Yellow"], ["#ff6666", "Roșu", "Red"], ["#5fb236", "Verde", "Green"], ["#2ea8e5", "Albastru", "Blue"], ["#a28ae5", "Mov", "Purple"], ["#e56eee", "Magenta", "Magenta"], ["#f19837", "Portocaliu", "Orange"], ["#aaaaaa", "Gri", "Gray"]];
const hexRgb = h => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(h || "").trim()); return m ? [1, 2, 3].map(i => parseInt(m[i], 16)) : null; };
const isPdf = a => /pdf/i.test(a?.contentType || a?.mimeType || "") || /\.pdf$/i.test(a?.filename || a?.path || a?.title || "");

class Zotero {
  constructor(S) { this.S = S; this.app = S.app; this.state = { local: null, at: 0 }; this.sessions = new Map(); this.quietInbox = new Set(); this.st = null; this.listeners = new Set(); this.taking = new Set(); this.seenRun = 0; }
  T(a, b) { return this.S.T(a, b); }
  conf() { return this.S.conf(); }
  node(name) { try { return Platform?.isDesktopApp ? require(name) : null; } catch (e) { return null; } }

  // ——— API-ul local (Zotero deschis; Zotero → Setări → Avansat → „Permite altor aplicații de pe acest computer să comunice cu Zotero”) ———
  rawLocal(path, timeout = 4000) {
    const http = this.node("http"); if (!http) return Promise.reject(new Error("no http"));
    return new Promise((res, rej) => {
      const req = http.get({ host: "127.0.0.1", port: 23119, path, headers: { "Zotero-API-Version": "3", Accept: "application/json" }, timeout }, r => {
        const chunks = []; r.on("data", d => chunks.push(d)); r.on("end", () => res({ status: r.statusCode, headers: r.headers, body: Buffer.concat(chunks) }));
      });
      req.on("timeout", () => { req.destroy(); rej(new Error("timeout")); }); req.on("error", rej);
    });
  }
  async localJson(path) {
    const closed = () => Object.assign(new Error(this.T("Zotero e închis (deschide-l din nou: PDF-urile și evidențierile vin din el)", "Zotero is closed (open it again: the PDFs and highlights come from it)")), { status: 0, closed: true });
    if (this.server) throw closed();   // portul e al lui Texere (pentru butonul din browser): Zotero e închis
    let r; try { r = await this.rawLocal("/api/users/0/" + path, 45000); }   // o bibliotecă mare cere timp: doar lipsa răspunsului înseamnă „închis”
    catch (e) { if (/timeout/.test(e?.message)) throw Object.assign(new Error(this.T("Zotero răspunde prea încet; încearcă din nou peste câteva secunde", "Zotero is answering too slowly; try again in a few seconds")), { status: 0, slow: true }); throw closed(); }
    if (r.status !== 200 && !r.headers?.["x-zotero-version"]) throw closed();
    if (r.status !== 200) throw Object.assign(new Error("Zotero local API " + r.status), { status: r.status });
    return { json: JSON.parse(r.body.toString("utf8") || "null"), headers: r.headers };
  }
  // cine răspunde pe portul 23119: Zotero (cu API-ul local pornit sau nu), altă aplicație sau nimeni
  async probe() {
    try {
      const r = await this.rawLocal("/connector/ping", 1500), v = String(r.headers?.["x-zotero-version"] || "");
      if (!/^\d/.test(v)) return { port: "other", version: v };
      const a = await this.rawLocal("/api/users/0/items?limit=1", 2500);
      return { port: "zotero", api: a.status === 200 ? "on" : "off", version: v };
    } catch (e) { return { port: "closed" }; }
  }
  // e Zotero deschis, cu API-ul local pornit? „on”, „off” (deschis, dar nu lasă alte aplicații) sau „closed”; „on” ținut minte 30 s, restul 3 s
  async localState(force) {
    if (this.server) return (this.state = { local: "closed", at: Date.now(), port: "texere" }).local;   // portul e al nostru: Zotero e închis
    const ttl = this.state.local === "on" ? 30000 : 3000;
    if (!force && this.state.local && Date.now() - this.state.at < ttl) return this.state.local;
    const pr = await this.probe();
    this.state = { local: pr.port === "zotero" ? (pr.api === "on" ? "on" : "off") : "closed", at: Date.now(), port: pr.port };
    return this.state.local;
  }
  // rulează Zotero pe acest calculator? { running: true/false/null (nu se poate ști), age: secunde de când a pornit }
  proc() {
    const cp = this.node("child_process"); if (!cp) return Promise.resolve({ running: null, age: null });
    return new Promise(res => {
      try {
        if (process.platform === "win32") cp.execFile("tasklist", ["/FI", "IMAGENAME eq zotero.exe", "/NH", "/FO", "CSV"], { timeout: 4000, windowsHide: true }, (e, out) => res({ running: e ? null : /zotero\.exe/i.test(String(out)), age: null }));
        else cp.execFile(process.platform === "darwin" ? "/bin/ps" : "ps", ["-A", "-o", "etime=,comm="], { timeout: 4000, maxBuffer: 8 << 20 }, (e, out) => {
          if (e) return res({ running: null, age: null });
          let running = false, age = null;
          for (const line of String(out).split("\n")) {
            const m = /^\s*([\d:-]+)\s+(.+?)\s*$/.exec(line); if (!m || !/(^|\/)zotero(-bin)?$/i.test(m[2])) continue;
            running = true; const a = etime(m[1]); if (a != null) age = age == null ? a : Math.max(age, a);
          }
          res({ running, age });
        });
      } catch (e) { res({ running: null, age: null }); }
    });
  }
  // starea, pe înțeles: ce merge acum și ce oprește restul (o arată Setările și se reface la câteva secunde)
  async refresh(p) {
    p = p || await this.proc();
    if (p.running) { if (!this.seenRun) this.seenRun = Date.now(); } else this.seenRun = 0;
    const age = p.age ?? (this.seenRun ? (Date.now() - this.seenRun) / 1000 : null);
    let z;
    if (this.server) z = "closed";
    else {
      const local = await this.localState(true), port = this.state.port;
      z = local === "on" ? "on" : local === "off" ? "api-off" : port === "other" ? "other" : p.running ? (age != null && age < 40 ? "starting" : "blocked") : "closed";
    }
    const want = this.wantConnector();
    const button = !want ? "off" : z === "on" ? "zotero" : this.server ? "direct" : z === "api-off" ? "wait-api" : z === "starting" ? "wait-start"
      : z === "blocked" ? "wait-blocked" : z === "other" ? "wait-other" : p.running === null ? "wait-unknown" : "wait";
    const st = { zotero: z, key: !!this.key(), button, running: p.running }, sig = JSON.stringify(st);
    this.st = st;
    if (sig !== this._sig) { this._sig = sig; for (const f of [...this.listeners]) { try { f(st); } catch (e) {} } }
    return st;
  }
  onChange(f) { this.listeners.add(f); return () => this.listeners.delete(f); }
  // textele stării (Setări, mesaje)
  describe(st) {
    const T = (a, b) => this.T(a, b); st = st || this.st || { zotero: "closed", key: !!this.key(), button: this.wantConnector() ? "wait" : "off", running: null };
    const keyNote = st.key ? T(" Până atunci, Texere folosește cheia ta Zotero.", " Until then, Texere uses your Zotero key.") : "";
    const Z = {
      on: ["ok", T("Conectat la Zotero", "Connected to Zotero"), T("Zotero e deschis pe acest calculator și îl lasă pe Texere să-ți citească biblioteca.", "Zotero is open on this computer and lets Texere read your library.")],
      "api-off": ["warn", T("Zotero e deschis, dar nu-l lasă pe Texere să intre", "Zotero is open, but doesn't let Texere in"), T("În Zotero: Setări → Avansat → bifează „Permite altor aplicații de pe acest computer să comunice cu Zotero”.", "In Zotero: Settings → Advanced → tick “Allow other applications on this computer to communicate with Zotero”.") + keyNote],
      starting: ["warn", T("Zotero pornește…", "Zotero is starting…"), T("Se conectează în câteva secunde.", "It connects in a few seconds.")],
      blocked: ["bad", T("Zotero e deschis, dar conexiunea lui n-a pornit", "Zotero is open, but its connection didn't start"), T("Când s-a deschis Zotero, portul lui (23119) era ocupat, așa că Zotero a renunțat să se conecteze (de aceea Setările lui arată „{$url}”). Închide Zotero de tot și deschide-l din nou.", "When Zotero opened, its port (23119) was taken, so Zotero gave up connecting (that's why its settings show “{$url}”). Quit Zotero completely and open it again.") + keyNote],
      other: ["bad", T("Altă aplicație folosește portul lui Zotero", "Another app is using Zotero's port"), st.running ? T("Probabil un alt plugin care răspunde și el butonului Zotero: oprește-i opțiunea (sau pluginul), apoi închide Zotero de tot și deschide-l din nou.", "Probably another plugin that also answers the Zotero button: turn its option (or the plugin) off, then quit Zotero completely and open it again.") + keyNote : T("Probabil un alt plugin care răspunde și el butonului Zotero: oprește-i opțiunea (sau pluginul), ca Texere să poată prelua butonul.", "Probably another plugin that also answers the Zotero button: turn its option (or the plugin) off, so Texere can take over the button.")],
      closed: st.key ? ["ok", T("Zotero e închis · merge cheia ta", "Zotero is closed · your key works"), T("Căutarea și importul folosesc biblioteca ta de pe zotero.org (ce a sincronizat Zotero ultima dată).", "Search and import use your library on zotero.org (what Zotero last synced).")]
        : ["warn", T("Zotero e închis", "Zotero is closed"), T("Deschide Zotero ca să-ți folosești biblioteca. Ca s-o folosești și cu Zotero închis, adaugă o cheie Zotero (eticheta „+ cheie” de lângă Zotero, mai sus).", "Open Zotero to use your library. To use it even with Zotero closed, add a Zotero key (the “+ key” label next to Zotero, above).")],
    }[st.zotero] || ["warn", "Zotero", ""];
    const ready = st.zotero === "on" || st.key;
    const B = {
      off: ["", T("oprit", "off"), T("Oprit. Butonul Zotero din browser salvează doar în Zotero. Pornește-l și ce salvezi intră și în Texere, singur, cu PDF-ul.", "Off. The Zotero button in your browser saves only into Zotero. Turn it on and what you save also comes into Texere by itself, with its PDF.")],
      zotero: ["ok", T("pornit · prin Zotero", "on · through Zotero"), T("Pornit. Salvezi cu butonul Zotero ca de obicei: sursa intră în Zotero, iar după câteva secunde Texere o adaugă în vault, cu PDF-ul. La fel și ce adaugi direct în Zotero.", "On. Save with the Zotero button as usual: the source goes into Zotero, and a few seconds later Texere adds it to your vault, with its PDF. The same for what you add in Zotero itself.")],
      direct: ["ok", T("pornit · direct în Texere", "on · straight to Texere"), T("Pornit. Zotero e închis, așa că butonul salvează direct în Texere (scrie „Saving to Texere”), cu PDF-ul. Când deschizi Zotero, Texere îi lasă imediat locul, ca Zotero să-și găsească portul liber.", "On. Zotero is closed, so the button saves straight into Texere (it shows “Saving to Texere”), with the PDF. When you open Zotero, Texere steps aside right away, so Zotero finds its port free.")],
      "wait-api": ["warn", T("așteaptă", "waiting"), T("Așteaptă: Zotero nu-l lasă încă pe Texere să intre (vezi mai sus). Până atunci, butonul salvează doar în Zotero.", "Waiting: Zotero doesn't let Texere in yet (see above). Until then, the button saves only into Zotero.")],
      "wait-start": ["warn", T("așteaptă", "waiting"), T("Așteaptă: Zotero pornește.", "Waiting: Zotero is starting.")],
      "wait-blocked": ["bad", T("blocat", "blocked"), T("Blocat: conexiunea lui Zotero n-a pornit (vezi mai sus). Până redeschizi Zotero, butonul din browser nu poate salva nicăieri.", "Blocked: Zotero's connection didn't start (see above). Until you reopen Zotero, the browser button can't save anywhere.")],
      "wait-other": ["bad", T("blocat", "blocked"), T("Blocat: altă aplicație răspunde butonului Zotero (vezi mai sus).", "Blocked: another app answers the Zotero button (see above).")],
      "wait-unknown": ["warn", T("așteaptă", "waiting"), T("Așteaptă: pe acest calculator Texere nu poate ști când pornește Zotero, așa că nu-i ține locul. Deschide Zotero.", "Waiting: on this computer Texere can't tell when Zotero starts, so it doesn't stand in for it. Open Zotero.")],
      wait: ["warn", T("așteaptă", "waiting"), T("Texere încearcă să preia butonul…", "Texere is taking over the button…")],
    }[st.button] || ["", "", ""];
    return { dot: Z[0], head: Z[1], detail: Z[2],
      import: { ok: ready, cls: ready ? "ok" : "warn", text: st.zotero === "on" ? T("prin Zotero", "through Zotero") : st.key ? T("prin cheia ta", "through your key") : T("indisponibil acum", "not available now") },
      button: { cls: B[0], chip: B[1], desc: B[2] },
      catalog: st.zotero === "on" ? { cls: "ok", text: T("conectat", "connected") } : st.key ? { cls: "ok", text: T("prin cheie", "via key") } : { cls: "warn", text: T("neconectat", "not connected") } };
  }
  // ——— API-ul web (cu o cheie gratuită de pe zotero.org) ———
  key() { return String(this.conf().zoteroKey || "").trim(); }
  async userId() {
    const c = this.conf(), k = this.key(); if (!k) return null;
    if (c.zoteroUser?.key === k) return c.zoteroUser.id;
    const r = await requestUrl({ url: `https://api.zotero.org/keys/${encodeURIComponent(k)}`, headers: { "Zotero-API-Version": "3" }, throw: false });
    const id = r.status === 200 ? r.json?.userID : null; if (!id) throw new Error(this.T("Cheia Zotero nu e bună.", "The Zotero key isn't valid."));
    c.zoteroUser = { key: k, id, name: r.json?.username || "" }; await this.S.save();
    return id;
  }
  async webJson(path) {
    const id = await this.userId(); if (!id) throw new Error("no key");
    const r = await requestUrl({ url: `https://api.zotero.org/users/${id}/${path}${path.includes("?") ? "&" : "?"}key=${encodeURIComponent(this.key())}`, headers: { "Zotero-API-Version": "3" }, throw: false });
    if (r.status !== 200) throw Object.assign(new Error("Zotero API " + r.status), { status: r.status });
    return { json: r.json, headers: r.headers || {} };
  }
  // pe unde vorbim cu Zotero acum: local (dacă e deschis) sau web (dacă ai cheie)
  async mode() { if (await this.localState() === "on") return "local"; if (this.key()) return "web"; return null; }
  async get(path, mode) { return (mode || await this.mode()) === "local" ? this.localJson(path) : this.webJson(path); }

  // căutarea în biblioteca ta (pentru catalogul „Zotero”)
  async search(q, f) {
    const mode = await this.mode(); if (!mode) return [];
    const { json } = await this.get(`items/top?q=${encodeURIComponent(q)}&qmode=titleCreatorYear&limit=25&include=data,csljson`, mode);
    return (Array.isArray(json) ? json : []).filter(r => r?.data && !["note", "attachment", "annotation"].includes(r.data.itemType)).map(r => this.result(r, mode))
      .filter(x => f?.type === "all" || !f?.type || this.S.kind(x.type) === f.type);
  }
  // dosarul de date al lui Zotero: cel din setări, apoi ~/Zotero
  dataDirs() { const os = this.node("os"), path = this.node("path"); return [this.conf().zoteroDataDir, os && path && path.join(os.homedir(), "Zotero")].filter(Boolean); }
  needsPage(item) { const c = toCsl(item || {}); return ["title", "container-title", "publisher", "publisher-place"].some(k => typeof c[k] === "string" && MOJI.test(c[k])) || (c.author || []).concat(c.editor || []).some(p => MOJI.test(`${p.family || ""} ${p.given || ""} ${p.literal || ""}`)); }
  cslOf(r) { const c = r.csljson && typeof r.csljson === "object" ? { ...r.csljson } : toCsl(r.data); delete c.id; if (!c.ISBN && r.data?.ISBN) c.ISBN = r.data.ISBN; return c; }
  // datele stricate de traducătorul unui sit: LaTeX („Etic\ua” → „Etică”) și literele pierdute („Bucure?ti”), refăcute din pagina sursei
  // (etichetele citation_* pe care le citesc Google Scholar și Zotero); de acolo vine și PDF-ul gratuit (citation_pdf_url), dacă există.
  // pages: () => [html…] (snapshot-ul din Zotero sau pagina de pe care ai salvat); se cere doar când e nevoie
  async repairCsl(csl, pages, opts = {}) {
    const out = { pdf: null, url: null, fixed: false }; if (!csl) return out;
    const STR = ["title", "title-short", "container-title", "publisher", "publisher-place", "collection-title", "event-title", "abstract"], ROLES = ["author", "editor", "translator", "container-author"];
    for (const k of STR) { const v = deLatex(csl[k]); if (v !== csl[k]) { csl[k] = v; out.fixed = true; } }
    for (const r of ROLES) for (const p of csl[r] || []) for (const part of ["family", "given", "literal"]) { const v = deLatex(p[part]); if (v !== p[part]) { p[part] = v; out.fixed = true; } }
    const badStr = STR.filter(k => k !== "abstract" && typeof csl[k] === "string" && MOJI.test(csl[k]));
    const badNames = ROLES.flatMap(r => (csl[r] || []).flatMap(p => ["family", "given", "literal"].filter(part => typeof p[part] === "string" && MOJI.test(p[part])).map(part => [p, part])));
    const short0 = csl["title-short"], title0 = csl.title;
    if (badStr.length || badNames.length || opts.wantPdf) {
      let htmls = []; try { htmls = (await pages()).filter(Boolean); } catch (e) {}
      out.read = htmls.length;
      const meta = htmls.flatMap(h => metaOf(String(h).slice(0, 600000)));
      const corpus = [...meta.map(([, v]) => v), ...htmls.map(h => unHtml((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(h) || [])[1] || ""))].join("\n");
      for (const k of badStr) { if (k === "title-short") continue; const m = wild(csl[k]).exec(corpus); if (m) { csl[k] = m[0].replace(/\s+/g, " ").trim(); out.fixed = true; } }
      for (const [p, part] of badNames) { const m = wild(p[part]).exec(corpus); if (m) { p[part] = m[0]; out.fixed = true; } }
      out.pdf = meta.find(([k]) => k === "citation_pdf_url")?.[1] || null;
      out.url = meta.find(([k]) => k === "og:url" || k === "citation_abstract_html_url" || k === "citation_public_url")?.[1] || null;
    }
    // ce a rămas stricat: o încercare cu cuvintele românești frecvente (doar dacă nu e o limbă străină)
    const left = () => [...STR.filter(k => k !== "abstract" && k !== "title-short" && typeof csl[k] === "string" && MOJI.test(csl[k])).map(k => [csl, k]),
      ...ROLES.flatMap(r => (csl[r] || []).flatMap(p => ["family", "given", "literal"].filter(part => typeof p[part] === "string" && MOJI.test(p[part])).map(part => [p, part])))];
    out.left = left().length;
    if (out.left && (!csl.language || /^ro/i.test(csl.language)) && !opts.noGuess) {
      for (const [o, k] of left()) { const v = roGuess(o[k]); if (v !== o[k]) { o[k] = v; out.fixed = true; } }
      out.left = left().length;
    }
    // titlul scurt făcut de Zotero din titlul stricat (tăiat la „?”): se reface din titlul bun
    if (csl.title !== title0 && short0 && (MOJI.test(short0) || /\?\s*$/.test(short0) || String(title0 || "").startsWith(String(short0).replace(/\?\s*$/, "")))) {
      const i = csl.title.indexOf(": "); if (i > 0) csl["title-short"] = csl.title.slice(0, i); else delete csl["title-short"];
    }
    return out;
  }
  // paginile din care se pot reface datele unei surse din Zotero: snapshot-ul salvat odată cu ea (fișierul HTML), apoi adresa ei
  async pagesOf(r, mode) {
    const out = [], key = r.key || r.data?.key;
    try {
      const { json } = await this.get(`items/${key}/children`, mode);
      for (const c of (Array.isArray(json) ? json : []).map(x => ({ key: x.key, ...x.data }))) {
        if (c.itemType !== "attachment" || !/html/i.test(c.contentType || "")) continue;
        if (c.linkMode !== "linked_url") { try { const f = await this.fileOf({ ...c, mode }); if (f?.data) { out.push(Buffer.from(f.data).toString("utf8")); break; } } catch (e) {} }
        if (c.url && !out.length) { try { const p = await requestUrl({ url: c.url, throw: false }); if (p.status === 200 && p.text) { out.push(p.text); break; } } catch (e) {} }
      }
    } catch (e) {}
    const url = r.data?.url || r.csljson?.URL;
    if (!out.length && url && /^https?:/.test(url)) { try { const p = await requestUrl({ url, throw: false }); if (p.status === 200 && p.text) out.push(p.text); } catch (e) {} }
    return out;
  }
  // o sursă din Zotero, cu datele reparate (dacă era nevoie) și cu PDF-ul gratuit anunțat de pagina ei
  async fixed(r, mode, opts = {}) {
    let csl = this.cslOf(r), fix = await this.repairCsl(csl, () => this.pagesOf(r, mode), { ...opts, noGuess: !!opts.retry });
    for (let i = 0; opts.retry && fix.left && !fix.read && i < 4; i++) {   // snapshot-ul încă nu e în Zotero: încă o dată, peste câteva secunde
      await sleep(2500); csl = this.cslOf(r); fix = await this.repairCsl(csl, () => this.pagesOf(r, mode), { ...opts, noGuess: i < 3 });
    }
    if (opts.retry && fix.left && fix.read) { const f2 = await this.repairCsl(csl, async () => [], { ...opts, wantPdf: false }); fix.fixed = fix.fixed || f2.fixed; }
    if (fix.fixed) r = { ...r, csljson: csl };
    const x = this.result(r, mode);
    if (fix.pdf && !x.pdf.includes(fix.pdf)) x.pdf.push(fix.pdf);
    if (fix.url && !x.url) x.url = fix.url;
    return x;
  }
  result(r, mode) {
    const csl = this.cslOf(r), d = r.data || {};
    return { title: csl.title || d.title, year: csl.issued?.["date-parts"]?.[0]?.[0] || null, type: csl.type, authors: csl.author || csl.editor || [],
      venue: csl["container-title"] || "", publisher: csl.publisher || "", doi: csl.DOI || null, isbn: csl.ISBN || null, url: csl.URL || null,
      volume: csl.volume, issue: csl.issue, page: csl.page, abstract: csl.abstract, cited: null, oa: false, pdf: [],
      zotero: { key: r.key || d.key, mode, csl, n: r.meta?.numChildren || 0 } };
  }
  // PDF-ul unei intrări din Zotero (atașamentul, fără fișier): { key, md5, filename, linkMode, … } sau null
  async attachment(z) {
    const mode = z.mode || await this.mode(); if (!mode || !z.key) return null;
    const { json } = await this.get(`items/${z.key}/children`, mode);
    const att = (Array.isArray(json) ? json : []).map(r => ({ key: r.key, ...r.data })).filter(a => a?.itemType === "attachment" && isPdf(a)).sort((a, b) => (a.linkMode === "linked_url") - (b.linkMode === "linked_url"))[0];
    return att && att.linkMode !== "linked_url" ? { ...att, key: att.key || att.data?.key, mode } : null;
  }
  // fișierul unui atașament: { name, data } sau null
  async fileOf(att) {
    const mode = att.mode, name = att.filename || att.title || "Zotero.pdf", fs = this.node("fs");
    if (mode === "local") {
      // fișierul e pe acest calculator: Zotero spune unde (…/file/view/url), sau îl iei din calea legată
      if (att.linkMode === "linked_file" && att.path && fs?.existsSync(att.path)) return { name, data: fs.readFileSync(att.path) };
      // fișierele salvate de Zotero stau în <dosarul Zotero>/storage/<cheie>/<nume>: citite direct, fără să-l mai întrebăm
      if (att.linkMode !== "linked_file" && att.filename && att.key) for (const d of this.dataDirs()) {
        try { const p = this.node("path").join(d, "storage", att.key, att.filename); if (fs?.existsSync(p)) return { name, data: fs.readFileSync(p) }; } catch (e) {}
      }
      try {
        const r = await this.rawLocal(`/api/users/0/items/${att.key}/file/view/url`);
        const u = r.status === 200 ? r.body.toString("utf8").trim() : String(r.headers?.location || "");
        if (/^file:/.test(u)) { const p = decodeURIComponent(new URL(u).pathname).replace(/^\/([A-Za-z]:)/, "$1"); if (fs?.existsSync(p)) return { name, data: fs.readFileSync(p) }; }
      } catch (e) {}
      try { const r = await this.rawLocal(`/api/users/0/items/${att.key}/file`, 20000); if (r.status === 200 && r.body.length > 100) return { name, data: r.body }; } catch (e) {}
      return null;
    }
    const id = await this.userId();
    const r = await requestUrl({ url: `https://api.zotero.org/users/${id}/items/${att.key}/file?key=${encodeURIComponent(this.key())}`, headers: { "Zotero-API-Version": "3" }, throw: false });
    return r.status === 200 && r.arrayBuffer?.byteLength > 100 ? { name, data: r.arrayBuffer } : null;
  }
  async pdf(z) { const att = await this.attachment(z); if (!att) return null; const f = await this.fileOf(att); return f ? { ...f, att } : null; }
  // ——— evidențierile din Zotero (stau în baza lui de date, nu în PDF) ———
  // evidențierile unui PDF din Zotero. API-ul web le dă drept „copii” ale atașamentului; API-ul local NU (căutarea lui Zotero
  // adaugă la copii doar atașamente și note): acolo le cerem pe toate, după tip (itemType=annotation), și le luăm pe ale acestui PDF
  async annotations(att) {
    const out = []; let start = 0;
    for (;;) {
      const { json, headers } = await this.get(`items/${att.key}/children?limit=100&start=${start}`, att.mode);
      for (const r of json || []) if (r?.data?.itemType === "annotation") out.push({ ...r.data, key: r.key || r.data.key });
      const total = +(headers?.["total-results"] || headers?.["Total-Results"] || 0); start += 100; if (!json?.length || start >= total) break;
    }
    if (!out.length) { const m = await this.allAnnotations(att.mode); out.push(...(m.get(att.key) || [])); }
    return out;
  }
  // toate evidențierile din bibliotecă, pe PDF-uri (cheia atașamentului → evidențierile lui); ținute minte 2 minute
  async allAnnotations(mode) {
    const c = this._ann; if (c && c.mode === mode && Date.now() - c.at < 120000) return c.byParent;
    const byParent = new Map(); let start = 0;
    for (;;) {
      const { json, headers } = await this.get(`items?itemType=annotation&limit=100&start=${start}`, mode);
      for (const r of json || []) { const d = r?.data; if (d?.itemType !== "annotation" || !d.parentItem) continue; if (!byParent.has(d.parentItem)) byParent.set(d.parentItem, []); byParent.get(d.parentItem).push({ ...d, key: r.key || d.key }); }
      if (!json?.length) break; start += json.length;
      const total = +(headers?.["total-results"] || headers?.["Total-Results"] || 0); if (total ? start >= total : json.length < 100) break;
    }
    this._ann = { mode, at: Date.now(), byParent }; return byParent;
  }
  // câte evidențieri are fiecare sursă (cheia sursei sau a PDF-ului fără sursă → număr), pentru fila Zotero
  async highlightCounts(mode) {
    const ann = await this.allAnnotations(mode), parentOf = new Map(); let start = 0;
    if (!ann.size) return new Map();
    for (;;) {
      const { json, headers } = await this.get(`items?itemType=attachment&limit=100&start=${start}`, mode);
      for (const r of json || []) { const d = r?.data; if (d?.parentItem) parentOf.set(r.key || d.key, d.parentItem); }
      if (!json?.length) break; start += json.length;
      const total = +(headers?.["total-results"] || headers?.["Total-Results"] || 0); if (total ? start >= total : json.length < 100) break;
    }
    const out = new Map(); for (const [att, list] of ann) { const n = list.filter(a => a.annotationType === "highlight" || a.annotationType === "underline").length; if (!n) continue; const k = parentOf.get(att) || att; out.set(k, (out.get(k) || 0) + n); }   // doar evidențierile și sublinierile (nu notele lipite, imaginile, desenele)
    return out;
  }
  palette() { return this.app.plugins?.plugins?.["pdf-plus"]?.settings?.colors || {}; }
  zcolors() { return ZCOLORS; }
  // culoarea din Zotero → eticheta ta (un nume din paleta PDF++): alegerea ta din Setări, altfel ce a învățat Texere din notele tale, altfel culoarea cea mai apropiată
  guessTag(hex) {
    const rgb = hexRgb(hex); if (!rgb) return null;
    const t = this.S.highlights?.tagFor?.(rgb); if (t) return t;
    // culoarea cea mai apropiată după nuanță (gri cu gri, nu cu culoarea cea mai apropiată în RGB)
    const hsl = ([r, g, b]) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn; if (!d) return { h: 0, s: 0, l }; const sat = d / (1 - Math.abs(2 * l - 1)); const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return { h: h * 60, s: sat, l }; };
    const A = hsl(rgb), dist = c => { const B = hsl(c), ga = A.s < 0.15, gb = B.s < 0.15; if (ga || gb) return (ga !== gb ? 2 : 0) + Math.abs(A.l - B.l); const dh = Math.min(Math.abs(A.h - B.h), 360 - Math.abs(A.h - B.h)) / 180; return dh * 2 + Math.abs(A.s - B.s) * 0.4 + Math.abs(A.l - B.l) * 0.4; };
    let best = null, bd = Infinity;
    for (const [n, h] of Object.entries(this.palette())) { const c = hexRgb(h); if (!c) continue; const d = dist(c); if (d < bd) { bd = d; best = n.toLowerCase(); } }
    return best;
  }
  colorMap() { const own = this.conf().zoteroColors || {}, out = {}; for (const [hex] of ZCOLORS) out[hex] = own[hex] !== undefined ? own[hex] : this.guessTag(hex); return out; }
  tagOf(a) {
    const names = Object.keys(this.palette()).map(n => n.toLowerCase());
    const t = (a.tags || []).map(x => String(x?.tag ?? x).toLowerCase().replace(/^#/, "")).find(x => names.includes(x)); if (t) return t;   // o etichetă pusă în Zotero pe evidențiere (ex. „claim”)
    const hex = String(a.annotationColor || "").toLowerCase(), own = this.conf().zoteroColors || {};
    if (hex in own) return own[hex] || null;
    return this.guessTag(hex);
  }
  // evidențierile din Zotero → evidențieri adevărate în PDF-ul din vault (prin PDF++), cu culoarea etichetei tale, comentariul și autorul tău;
  // apoi Texere le aduce în notă ca pe orice evidențiere. Cele scrise deja (după NM „zotero:<cheie>”) nu se dublează.
  async writeHighlights(file, anns) {
    const res = { written: 0, already: 0, other: 0 };
    const marks = anns.filter(a => a.annotationType === "highlight" || a.annotationType === "underline");
    res.other = anns.length - marks.length;   // note lipite, imagini, desen: nu sunt evidențieri de text
    if (!marks.length) return res;
    const pp = this.app.plugins?.plugins?.["pdf-plus"], io = pp?.lib?.highlight?.writeFile?.getPdfIo?.();
    if (!io || typeof io.process !== "function" || typeof io.addAnnotation !== "function" || typeof io.setContentsToAnnotation !== "function") { res.noWriter = true; return res; }
    try { const u = await this.unlock(file, io); if (u === "unlocked") res.unlocked = true; else if (u !== "open") { res.locked = u; return res; } } catch (e) { res.error = e?.message || String(e); return res; }
    const author = String(pp.settings?.author || "").trim(), pal = this.palette(), op = pp.settings?.writeHighlightToFileOpacity ?? 0.2;
    const palHex = tag => pal[tag] || pal[Object.keys(pal).find(k => k.toLowerCase() === tag)];
    await io.process(file, doc => {
      const pages = doc.getPages(); if (!pages.length) return;
      const N = [...pages[0].node.keys()][0].constructor;   // PDFName: PDF++ nu exportă clasele pdf-lib, le luăm din document
      const have = new Set(), marked = pages.map(() => []);   // marked: dreptunghiurile evidențierilor care sunt deja în PDF, pe pagini
      const nums = a => (a?.asArray?.() || []).map(v => typeof v?.asNumber === "function" ? v.asNumber() : Number(v?.numberValue ?? v?.value?.() ?? v));
      pages.forEach((pg, pi) => { for (const ref of pg.node.Annots?.()?.asArray?.() || []) {
        try {
          const d = doc.context.lookup(ref), t = d?.get?.(N.of("NM"))?.decodeText?.(); if (t && t.startsWith("zotero:")) have.add(t.slice(7));
          if (!/Highlight|Underline|Squiggly|StrikeOut/.test(String(d?.get?.(N.of("Subtype")) || ""))) continue;
          const q = nums(d.get(N.of("QuadPoints"))), r = nums(d.get(N.of("Rect")));
          if (q.length >= 8) for (let i = 0; i + 7 < q.length; i += 8) marked[pi].push([Math.min(q[i], q[i + 2], q[i + 4], q[i + 6]), Math.min(q[i + 1], q[i + 3], q[i + 5], q[i + 7]), Math.max(q[i], q[i + 2], q[i + 4], q[i + 6]), Math.max(q[i + 1], q[i + 3], q[i + 5], q[i + 7])]);
          else if (r.length >= 4) marked[pi].push([Math.min(r[0], r[2]), Math.min(r[1], r[3]), Math.max(r[0], r[2]), Math.max(r[1], r[3])]);
        } catch (e) {}
      } });
      // aceeași evidențiere e deja în PDF? (PDF-urile cu evidențieri scrise în fișier: Zotero le arată și le ține în baza lui ca „externe”;
      // dacă le-am scrie din nou, ar apărea de două ori). Măsura: cât din suprafața ei e acoperită de o evidențiere existentă.
      const covered = (pi, rects) => {
        const box = r => [Math.min(r[0], r[2]), Math.min(r[1], r[3]), Math.max(r[0], r[2]), Math.max(r[1], r[3])];
        let all = 0, cov = 0;
        for (const r0 of rects) { const r = box(r0), area = (r[2] - r[0]) * (r[3] - r[1]); if (!(area > 0)) continue; all += area;
          let best = 0; for (const q of marked[pi] || []) { const w = Math.min(r[2], q[2]) - Math.max(r[0], q[0]), h = Math.min(r[3], q[3]) - Math.max(r[1], q[1]); if (w > 0 && h > 0) best = Math.max(best, w * h); }
          cov += Math.min(best, area); }
        return all > 0 && cov / all >= 0.6;
      };
      let Str = null;
      const put = (page, subtype, rects, rgb, comment, id) => {
        rects = rects.filter(r => Array.isArray(r) && r.length >= 4).map(r => r.slice(0, 4).map(Number)); if (!rects.length) return false;
        const box = [Math.min(...rects.map(r => r[0])), Math.min(...rects.map(r => r[1])), Math.max(...rects.map(r => r[2])), Math.max(...rects.map(r => r[3]))];
        const ref = io.addAnnotation(page, { Subtype: subtype, Rect: box, QuadPoints: rects.flatMap(([l, b, r, t]) => [l, t, r, t, l, b, r, b]), C: rgb.map(v => v / 255), CA: subtype === "Highlight" ? op : 1, Border: [0, 0, 0], F: 4 });
        const d = doc.context.lookup(ref);
        io.setContentsToAnnotation(d, comment || "");
        Str = Str || d.get(N.of("Contents")).constructor;   // PDFHexString
        if (author) d.set(N.of("T"), Str.fromText(author));
        d.set(N.of("NM"), Str.fromText("zotero:" + id));
        return true;
      };
      for (const a of marks) {
        if (have.has(a.key) || a.annotationIsExternal === true) { res.already++; continue; }
        let pos; try { pos = typeof a.annotationPosition === "string" ? JSON.parse(a.annotationPosition) : a.annotationPosition; } catch (e) { pos = null; }
        const page = pos && pages[pos.pageIndex]; if (!page || !pos.rects?.length) { res.other++; continue; }
        const rects4 = pos.rects.filter(r => Array.isArray(r) && r.length >= 4).map(r => r.slice(0, 4).map(Number));
        if (covered(pos.pageIndex, rects4)) { res.already++; continue; }   // e deja în PDF: nu o dublăm
        marked[pos.pageIndex].push(...rects4.map(r => [Math.min(r[0], r[2]), Math.min(r[1], r[3]), Math.max(r[0], r[2]), Math.max(r[1], r[3])]));
        const tag = this.tagOf(a), rgb = (tag && hexRgb(palHex(tag))) || hexRgb(a.annotationColor) || [255, 212, 0], sub = a.annotationType === "underline" ? "Underline" : "Highlight";
        if (!put(page, sub, pos.rects, rgb, a.annotationComment || "", a.key)) { res.other++; continue; }
        if (pos.nextPageRects?.length && pages[pos.pageIndex + 1]) put(pages[pos.pageIndex + 1], sub, pos.nextPageRects, rgb, "", a.key + ":2");   // evidențiere pe două pagini
        res.written++;
      }
    });
    return res;
  }
  // PDF-urile „încuiate” de editor (se deschid fără parolă, dar nu se pot modifica): PDF++ nu scrie în ele. Copia din vault se descuie
  // (cu parola goală, cea cu care se deschide oricum), ca evidențierile să intre în ea; originalul din Zotero rămâne neatins.
  isLocked(buf) { return /\/Encrypt\s+\d+\s+\d+\s+R|\/Encrypt\s*<</.test(Buffer.from(buf).toString("latin1")); }
  async pdfLibClass(io) {
    if (this._PD) return this._PD;
    try { const tiny = Uint8Array.from(atob(TINY_PDF), c => c.charCodeAt(0)); const d = await io?.lib?.loadPdfLibDocumentFromArrayBuffer?.(tiny.buffer); this._PD = d?.constructor || null; } catch (e) { this._PD = null; }
    return this._PD;
  }
  async unlock(file, io) {
    const buf = await this.app.vault.readBinary(file); if (!this.isLocked(buf)) return "open";
    const D = await this.pdfLibClass(io); if (!D?.load) return "no";
    const d = await D.load(buf, { password: "", updateMetadata: false });
    if (d.isEncrypted) return "password";   // cere o parolă adevărată: nu se poate
    await this.app.vault.modifyBinary(file, await d.save()); return "unlocked";
  }
  md5(buf) { try { return this.node("crypto").createHash("md5").update(Buffer.from(buf)).digest("hex"); } catch (e) { return null; } }
  // același document? Aceleași octeți, sau același conținut: numărul paginilor, mărimea lor și textul câtorva pagini.
  // (PDF++ rescrie fișierul când pune evidențieri, iar pentru fișierele legate Zotero nu știe md5: octeții diferă, paginile nu)
  async fingerprint(buf) {
    const pdfjs = await loadPdfJs(), doc = await pdfjs.getDocument({ data: new Uint8Array(buf).slice() }).promise;
    try {
      const n = doc.numPages, out = { n, pages: [] };
      for (const p of [...new Set([1, 2, Math.ceil(n / 2), n])].filter(p => p >= 1 && p <= n)) {
        const pg = await doc.getPage(p), tc = await pg.getTextContent(), v = pg.view;
        out.pages.push({ w: Math.round(v[2] - v[0]), h: Math.round(v[3] - v[1]), t: tc.items.map(i => i.str || "").join(" ").toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "").slice(0, 600) });
        try { pg.cleanup(); } catch (e) {}
      }
      return out;
    } finally { try { doc.destroy(); } catch (e) {} }
  }
  sameFp(a, b) {
    if (!a || !b || a.n !== b.n || a.pages.length !== b.pages.length) return false;
    return a.pages.every((p, i) => { const q = b.pages[i]; return Math.abs(p.w - q.w) <= 2 && Math.abs(p.h - q.h) <= 2 && p.t.slice(0, 300) === q.t.slice(0, 300); });
  }
  async samePdf(file, zbuf, zmd5, cache = {}) {
    const vb = await this.app.vault.readBinary(file), zm = zmd5 || (zbuf ? (cache.md5 = cache.md5 || this.md5(zbuf)) : null);
    if (zm && this.md5(vb) === zm) return true;
    if (!zbuf) return false;
    try { cache.fp = cache.fp || await this.fingerprint(zbuf); return this.sameFp(await this.fingerprint(vb), cache.fp); } catch (e) { console.warn("Texere Zotero: compararea PDF-urilor", file.path, e); return false; }
  }
  // PDF-ul fără sursă din Zotero e deja în vault (după nume, fără „ (2)”, sau după mărime)? atunci nu-l mai copiază
  async findCopy(f) {
    const base = s => String(s).replace(/\.pdf$/i, "").replace(/ \(\d+\)$/, "").replace(/[\\/:*?"<>|#^[\]]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
    const want = base(f.name), size = f.data?.byteLength ?? f.data?.length, cache = {};
    const cands = (this.app.vault.getFiles?.() || []).filter(x => x.extension === "pdf" && !x.path.startsWith(".trash/") && (base(x.name) === want || x.stat?.size === size))
      .sort((a, b) => (base(b.name) === want) - (base(a.name) === want) || a.path.length - b.path.length);
    for (const x of cands.slice(0, 8)) if (await this.samePdf(x, f.data, null, cache)) return x;
    return null;
  }
  // o sursă care e deja în vault: evidențierile ei din Zotero intră în PDF-ul ei, dacă e același PDF ca în Zotero (sau nu are încă PDF: îl aduce)
  async highlightsForExisting(x, note, { pdfs, highlights = true } = {}) {
    const att = await this.attachment(x.zotero); if (!att) return { written: 0 };
    const mc = this.app.metadataCache, fm = mc.getFileCache(note)?.frontmatter || {}, arr = v => Array.isArray(v) ? v : v ? [v] : [];
    const files = arr(fm.attachment).map(a => /\[\[([^\]|#]+)/.exec(String(a))?.[1]).filter(Boolean).map(l => mc.getFirstLinkpathDest(l, note.path)).filter(f => f instanceof TFile && f.extension === "pdf");
    if (!files.length && pdfs) {   // nota n-are PDF (de ex. Zotero s-a închis la import): îl aduce acum, cu evidențierile dacă le vrei
      const f = await this.pdfToVault(x, { highlights }); if (f) { await this.S.attachToNote(note, f); return { ...(x.zotero.hl || { written: 0 }), pdf: true }; }
      return { written: 0 };
    }
    if (!highlights) return { written: 0 };
    const anns = await this.annotations(att); if (!anns.length) return { written: 0 };
    let target = null;
    for (const f of files) {
      if (att.md5 && this.md5(await this.app.vault.readBinary(f)) === att.md5) { target = f; break; }   // aceeași copie, neschimbată
      try { const io = this.app.plugins.plugins["pdf-plus"]?.lib?.highlight?.writeFile?.getPdfIo?.(); const marked = io && await io.read(f, doc => doc.getPages().some(pg => (pg.node.Annots?.()?.asArray?.() || []).some(ref => { try { const N = [...pg.node.keys()][0].constructor; return String(doc.context.lookup(ref)?.get?.(N.of("NM"))?.decodeText?.() || "").startsWith("zotero:"); } catch (e) { return false; } }))); if (marked) { target = f; break; } } catch (e) {}
    }
    if (!target && files.length) {   // octeții diferă: același document? (rescris de PDF++, sau fișier legat în Zotero, fără md5)
      try { const zf = await this.fileOf(att), cache = {}; if (zf) for (const f of files) if (await this.samePdf(f, zf.data, att.md5, cache)) { target = f; break; } } catch (e) { console.warn("Texere Zotero: compararea PDF-urilor", e); }
    }
    if (!target && !files.length && pdfs) {   // nota n-are PDF: îl aduce din Zotero, cu evidențierile
      const f = await this.pdfToVault(x); if (f) { await this.S.attachToNote(note, f); return x.zotero.hl || { written: 0 }; }
    }
    if (!target) return { written: 0, different: files.length > 0 };
    const r = await this.writeHighlights(target, anns);
    if (r.written || r.already) { try { await this.S.highlights?.importFromPdf(target, note); } catch (e) { console.warn("Texere Zotero: evidențierile în notă", e); } }
    return r;
  }
  // PDF-ul intră în vault (în folderul PDF-urilor; Texere îl redenumește și îl atașează notei)
  async pdfToVault(x, opts = {}) {
    const p = await this.pdf(x.zotero); if (!p) return null;
    const dir = this.S.docDir(); await this.S.ensureFolder(dir);
    const base = String(p.name).replace(/\.pdf$/i, "").replace(/[\\/:*?"<>|#^[\]]+/g, " ").trim() || "Zotero";
    const path = this.S.freePath(dir, base, "pdf");
    const buf = p.data instanceof ArrayBuffer ? p.data : p.data.buffer.slice(p.data.byteOffset, p.data.byteOffset + p.data.byteLength);
    const file = await this.app.vault.createBinary(path, buf);
    // evidențierile tale din Zotero intră în PDF (Texere le aduce apoi în notă, când îl atașează)
    if (opts.highlights !== false && this.conf().zoteroHighlights !== false) {
      try { const anns = await this.annotations(p.att); if (anns.length) x.zotero.hl = await this.writeHighlights(file, anns); } catch (e) { console.warn("Texere Zotero: evidențierile", e); x.zotero.hl = { written: 0, error: e?.message || String(e) }; }
    }
    return file;
  }

  // ——— importul unei colecții sau al întregii biblioteci ———
  async collections(mode) {
    const out = []; let start = 0;
    for (;;) {
      const { json, headers } = await this.get(`collections?limit=100&start=${start}`, mode);
      for (const c of json || []) out.push({ key: c.key, name: c.data?.name || c.key, parent: c.data?.parentCollection || null, n: c.meta?.numItems ?? null });
      const total = +(headers?.["total-results"] || headers?.["Total-Results"] || 0); start += 100; if (!json?.length || start >= total) break;
    }
    return out;
  }
  // tot ce e în colecție (sus, fără copii), pe categorii: surse, PDF-uri fără sursă (atașamente singure), restul (note, linkuri)
  async topItems(collection, mode, onProgress) {
    const out = { sources: [], pdfs: [], other: [], total: 0 }; let start = 0, total = 0;
    for (;;) {
      const path = (collection ? `collections/${collection}/items/top` : "items/top") + `?limit=100&start=${start}&include=data,csljson`;
      const { json, headers } = await this.get(path, mode);
      for (const r of json || []) {
        const t = r?.data?.itemType; if (!t || t === "annotation") continue;
        if (t === "attachment") (isPdf(r.data) && r.data.linkMode !== "linked_url" ? out.pdfs : out.other).push(r);
        else if (t === "note") out.other.push(r);
        else out.sources.push(r);
      }
      total = +(headers?.["total-results"] || headers?.["Total-Results"] || 0); start += 100; onProgress?.(Math.min(start, total), total);
      if (!json?.length || start >= total) break;
    }
    out.total = out.sources.length + out.pdfs.length + out.other.length;
    return out;
  }
  // ce a ieșit dintr-un import, într-o propoziție (pentru fila Zotero și mesaj)
  summary(res, pdfs) {
    const T = (a, b) => this.T(a, b);
    if (res.notStarted) return T("Zotero e închis, așa că n-am importat nimic. Deschide Zotero și importă din nou: PDF-urile și evidențierile vin din el.", "Zotero is closed, so nothing was imported. Open Zotero and import again: the PDFs and highlights come from it.");
    const bits = [];
    bits.push(T(`Am adăugat ${res.added} ${res.added === 1 ? "sursă" : "surse"}`, `Added ${res.added} ${res.added === 1 ? "source" : "sources"}`) + (pdfs && res.added ? T(` (${res.zpdfs} cu PDF-ul din Zotero${res.free ? `, ${res.free} cu un PDF gratuit` : ""})`, ` (${res.zpdfs} with the PDF from Zotero${res.free ? `, ${res.free} with a free PDF` : ""})`) : ""));
    if (res.hl) bits.push(T(`${res.hl} evidențieri`, `${res.hl} highlights`));
    if (res.skipped) bits.push(T(`${res.skipped} erau deja în vault`, `${res.skipped} were already in your vault`) + (res.hlOld ? T(` (+${res.hlOld} evidențieri noi)`, ` (+${res.hlOld} new highlights)`) : ""));
    const names = l => l.slice(0, 3).map(s => `„${String(s).slice(0, 50)}”`).join(", ") + (l.length > 3 ? " …" : "");
    if (res.different) bits.push(T(`${res.different} au în vault alt PDF decât cel din Zotero, așa că evidențierile lor ar fi ieșit în alte locuri (${names(res.diff)})`, `${res.different} have a different PDF in the vault than in Zotero, so their highlights would land in the wrong places (${names(res.diff)})`));
    if (res.inbox) bits.push(T(`${res.inbox} PDF-uri fără sursă au intrat în Inbox`, `${res.inbox} PDFs without a source went to Inbox`));
    if (res.had) bits.push(T(`${res.had} PDF-uri fără sursă erau deja în vault (doar evidențierile)`, `${res.had} PDFs without a source were already in your vault (highlights only)`));
    if (res.unlocked) bits.push(T(`${res.unlocked} PDF-uri erau încuiate de editor: le-am descuiat copia din vault, ca evidențierile să intre (cel din Zotero a rămas neatins)`, `${res.unlocked} PDFs were locked by the publisher: I unlocked the vault copy so the highlights could go in (the one in Zotero is untouched)`));
    if (res.pdfOld) bits.push(T(`${res.pdfOld} surse din vault și-au primit PDF-ul`, `${res.pdfOld} sources in your vault got their PDF`));
    if (res.failed) bits.push(T(`${res.failed} n-au mers`, `${res.failed} failed`));
    if (res.closed) bits.push(T("Zotero s-a închis în timpul importului: restul n-au intrat; deschide Zotero și importă din nou", "Zotero closed during the import: the rest didn't come in; open Zotero and import again"));
    if (res.errors.length) bits.push(T("Probleme: ", "Problems: ") + res.errors.slice(0, 3).map(e => `„${String(e.title).slice(0, 40)}”: ${e.msg}`).join("; ") + (res.errors.length > 3 ? " …" : ""));
    return bits.join("; ") + ".";
  }
  // mesajul de la sfârșitul unui import: ce s-a întâmplat, cu butoane (deschide nota; alege sursa unui PDF rămas fără sursă)
  doneNotice(res, msg) {
    const T = (a, b) => this.T(a, b), S = this.S, frag = document.createDocumentFragment();
    frag.append(msg || T("Gata.", "Done."));
    const notes = [...new Map((res.notes || []).filter(Boolean).map(f => [f.path, f])).values()], loose = (res.loose || []).filter(f => this.app.vault.getAbstractFileByPath?.(f.path));
    const row = document.createElement("div"); row.className = "ts-notice-acts"; let n = null;
    const btn = (label, fn) => { const b = document.createElement("button"); b.textContent = label; b.addEventListener("click", e => { e.stopPropagation(); n?.hide(); fn(); }); row.appendChild(b); };
    if (notes.length === 1) btn(T("Deschide nota", "Open the note"), () => this.app.workspace.getLeaf("tab").openFile(notes[0]));
    else if (notes.length > 1) btn(T(`Deschide ultima notă`, `Open the last note`), () => this.app.workspace.getLeaf("tab").openFile(notes[notes.length - 1]));
    if (loose.length === 1) btn(T("Alege sursa PDF-ului…", "Choose the PDF's source…"), () => S.catalog?.(loose[0]));
    else if (loose.length > 1) btn(T(`Alege sursele PDF-urilor (${loose.length})…`, `Choose the PDFs' sources (${loose.length})…`), () => S.uncataloged?.());
    if (row.childElementCount) frag.append(row);
    n = new Notice(frag, row.childElementCount ? 20000 : 12000);
    // un singur PDF fără sursă (ex. un PDF pus singur în Zotero): îi alegi sursa imediat, ca să aibă notă și citare
    if (loose.length === 1 && !notes.length) later(() => S.catalog?.(loose[0]), 400);
  }
  async openImport() {
    if (this.S.open) { this.S.open("", "zotero"); return; }   // fila „Zotero” din „Adaugă o sursă”
    const st = await this.refresh(), mode = st.zotero === "on" ? "local" : st.key ? "web" : null;
    if (!mode) { const d = this.describe(st); new Notice(d.head + ". " + d.detail, 15000); return; }
    new ImportModal(this, mode).open();
  }
  // importul: sursele noi (cu PDF-ul și evidențierile din Zotero; fără PDF în Zotero → caută unul gratuit), evidențierile noi ale celor
  // care sunt deja în vault, iar PDF-urile fără sursă intră în Inbox (de acolo le adaugi ca surse)
  async importItems(cat, mode, { pdfs, highlights, onStep, cancelled }) {
    const S = this.S, res = { added: 0, skipped: 0, failed: 0, zpdfs: 0, free: 0, hl: 0, hlOld: 0, inbox: 0, had: 0, different: 0, diff: [], errors: [], notes: [], loose: [] };
    const err = (title, e) => { const m = typeof e === "string" ? e : e?.message || String(e); res.errors.push({ title, msg: m }); };
    const hlErr = (title, r) => { if (r?.unlocked) res.unlocked = (res.unlocked || 0) + 1; if (r?.locked) err(title, this.T("PDF-ul e protejat cu parolă, așa că nu se pot scrie evidențieri în el", "the PDF is password-protected, so highlights can't be written into it")); else if (r?.noWriter) err(title, this.T("PDF++ nu e pornit (el scrie evidențierile în PDF)", "PDF++ isn't enabled (it writes the highlights into the PDF)")); else if (r?.error) err(title, r.error); };
    const n = cat.sources.length + (pdfs ? cat.pdfs.length : 0); let i = 0;
    if (mode === "local") { const st = await this.refresh(); if (st.zotero !== "on") { res.closed = true; res.notStarted = true; return res; } }
    this._ann = null;   // evidențierile, citite din nou (le poți fi adăugat chiar acum în Zotero)   // Zotero s-a închis între timp: nu începe (sursele ar intra fără PDF și evidențieri)
    const old = this.conf().zoteroHighlights; if (!highlights) this.conf().zoteroHighlights = false;
    try {
      for (const r of cat.sources) {
        if (cancelled?.()) break;
        if (mode === "local" && this.server) { res.closed = true; break; }
        let x = this.result(r, mode); onStep?.(i++, n, x.title);
        try {
          const have = S.library().find(x);
          if (have) {
            res.skipped++; res.notes.push(have);
            if (highlights || pdfs) { try { const h = await this.highlightsForExisting(x, have, { pdfs, highlights }); res.hlOld += h.written || 0; if (h.pdf) res.pdfOld = (res.pdfOld || 0) + 1; if (h.different) { res.different++; res.diff.push(x.title); } hlErr(x.title, h); } catch (e) { console.warn("Texere Zotero: evidențierile", x.title, e); if (e.closed) { res.closed = true; break; } err(x.title, e); } }
            continue;
          }
          try { x = await this.fixed(r, mode); } catch (e) { console.warn("Texere Zotero: datele sursei", x.title, e); }
          let pdfFile = null;
          if (pdfs) { try { pdfFile = await this.pdfToVault(x, { highlights }); if (pdfFile) { res.zpdfs++; res.hl += x.zotero.hl?.written || 0; hlErr(x.title, x.zotero.hl); } } catch (e) { console.warn("Texere Zotero: PDF", x.title, e); if (e.closed) { res.closed = true; break; } err(x.title, e); } }
          const file = await S.add(x, { csl: x.zotero.csl, silent: true, pdfFile, noZoteroPdf: true });
          res.added++; if (file) res.notes.push(file);
          if (pdfs && !pdfFile && file) { try { if (!x.pdf.length) { const h = await this.repairCsl({}, () => this.pagesOf(r, mode), { wantPdf: true }); if (h.pdf) x.pdf.push(h.pdf); if (h.url && !x.url) x.url = h.url; } if (await S.freePdfFor?.(file, x)) res.free++; } catch (e) { console.warn("Texere Zotero: PDF gratuit", x.title, e); } }   // Zotero n-are PDF: caută unul gratuit
        } catch (e) { res.failed++; console.error("Texere Zotero: import", x.title, e); err(x.title, e); }
      }
      if (pdfs && !res.closed) for (const r of cat.pdfs) {
        if (cancelled?.()) break;
        if (mode === "local" && this.server) { res.closed = true; break; }
        const att = { ...r.data, key: r.key || r.data.key, mode }; onStep?.(i++, n, att.title || att.filename || "PDF");
        try {
          const title = att.title || att.filename || "PDF";
          const f = await this.fileOf(att); if (!f) { res.failed++; err(title, this.T("Zotero n-a dat fișierul PDF", "Zotero didn't hand over the PDF file")); continue; }
          let file = await this.findCopy(f);   // deja în vault (de la un import anterior): nu-l mai copiază, doar îi pune evidențierile
          if (file) { res.had++; if (file.path.startsWith(S.inboxDir() + "/")) res.loose.push(file); }
          else {
            const dir = S.inboxDir(); await S.ensureFolder(dir);
            const path = S.freePath(dir, String(f.name).replace(/\.pdf$/i, "").replace(/[\\/:*?"<>|#^[\]]+/g, " ").trim() || "Zotero", "pdf");
            this.quietInbox.add(path);
            const buf = f.data instanceof ArrayBuffer ? f.data : f.data.buffer.slice(f.data.byteOffset, f.data.byteOffset + f.data.byteLength);
            file = await this.app.vault.createBinary(path, buf); res.inbox++; res.loose.push(file);
          }
          if (highlights) { try { const anns = await this.annotations(att); if (anns.length) { const w = await this.writeHighlights(file, anns); res.hl += w.written; hlErr(title, w); } } catch (e) { console.warn("Texere Zotero: evidențierile", title, e); err(title, e); } }
        } catch (e) { res.failed++; console.error("Texere Zotero: PDF fără sursă", e); err(att.title || "PDF", e); }
      }
    } finally { this.conf().zoteroHighlights = old; }
    return res;
  }


  // ——— butonul Zotero din browser → Texere ———
  // cu Zotero deschis: Texere urmărește sursele noi din Zotero; cu Zotero închis: Texere îi ține locul pe portul 23119 (și i-l dă înapoi imediat ce pornește)
  wantConnector() { return !!this.conf().zoteroConnector && Platform?.isDesktopApp; }
  async setWanted(v) {
    const c = this.conf(); c.zoteroConnector = !!v; if (v) c.zoteroSeen = new Date().toISOString();   // de acum înainte; ce era deja în Zotero se ia cu „Importă…”
    await this.S.save();
    if (!v) await this.stopConnector();
    await this.tick(); this.schedule();
  }
  // o dată la câteva secunde (la 1,5 s cât timp Texere ține portul): Zotero pornește? atunci portul e al lui, imediat
  async tick() {
    if (this._ticking || !Platform?.isDesktopApp) return; this._ticking = true;
    try {
      const p = await this.proc();
      if (p.running !== false && this.server) await this.stopConnector();
      let st = await this.refresh(p);
      if (!this.wantConnector()) return;
      // după ce Zotero a dat semne că pornește, nu mai luăm portul cel puțin un minut (să-l găsească liber)
      if (p.running === false && !this.server && st.zotero === "closed" && Date.now() - (this.zoteroStarting || 0) > 60000) { await this.startConnector(); st = await this.refresh(p); }
      if (st.zotero === "on") await this.watch();
    } catch (e) { console.warn("Texere Zotero", e); }
    finally { this._ticking = false; }
  }
  schedule() {
    unlater(this._tt); if (this.dead) return;
    const d = this.server ? 1000 : this.wantConnector() ? 3000 : 0;
    if (d) this._tt = later(() => this.tick().catch(() => {}).finally(() => this.schedule()), d);
  }
  async startConnector() {
    if (this.server || !this.wantConnector()) return;
    const http = this.node("http"), os = this.node("os"), path = this.node("path"), fs = this.node("fs"); if (!http) return;
    this.tmp = path.join(os.tmpdir(), "texere-zotero"); try { fs.mkdirSync(this.tmp, { recursive: true }); } catch (e) {}
    const srv = http.createServer((req, res) => this.handle(req, res).catch(e => { console.error("Texere Zotero: conector", e); this.send(res, 500, { error: String(e.message || e) }); }));
    await new Promise(resolve => {
      srv.once("error", () => { this.server = null; resolve(); });
      srv.listen(23119, "127.0.0.1", () => { this.server = srv; this.watchZoteroStart(); resolve(); });
    });
  }
  // Zotero, când pornește, își deschide întâi profilul și baza de date și abia apoi conexiunea (portul 23119), o singură dată:
  // dacă portul e ocupat atunci, renunță. Cât timp Texere ține portul, urmărim folderele lui Zotero și îl eliberăm pe loc,
  // la primul semn (nu așteptăm verificarea de la o secundă, pe care macOS o poate întârzia când Obsidian e în fundal).
  watchZoteroStart() {
    if (this._zw) return; const fs = this.node("fs"), path = this.node("path"), os = this.node("os"); if (!fs?.watch || !path || !os) return;
    const home = os.homedir(), dirs = [], prof = process.platform === "darwin" ? path.join(home, "Library", "Application Support", "Zotero", "Profiles")
      : process.platform === "win32" ? path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "Zotero", "Zotero", "Profiles") : path.join(home, ".zotero", "zotero");
    for (const d of this.dataDirs()) dirs.push([d, n => /^zotero\.sqlite-(wal|journal|shm)$|^zotero\.sqlite$/i.test(n)]);   // baza de date: Zotero o deschide printre primele
    try { for (const n of fs.readdirSync(prof)) { const p = path.join(prof, n); try { if (fs.statSync(p).isDirectory()) dirs.push([p, () => true]); } catch (e) {} } } catch (e) {}   // profilul: nimic altceva nu-l atinge
    const go = () => { if (!this.server) return; this.zoteroStarting = Date.now(); this.stopConnector().then(() => this.refresh().catch(() => {})); };
    this._zw = [];
    for (const [d, ok] of dirs) { try { if (fs.existsSync(d)) this._zw.push(fs.watch(d, { persistent: false }, (ev, name) => { if (name && ok(String(name))) go(); })); } catch (e) {} }
  }
  unwatchZoteroStart() { for (const w of this._zw || []) { try { w.close(); } catch (e) {} } this._zw = null; }
  // portul se eliberează imediat (conexiunile deschise se închid și ele)
  stopConnector() {
    this.unwatchZoteroStart();
    const s = this.server; this.server = null; if (!s) return Promise.resolve();
    return new Promise(r => { try { s.close(() => r()); s.closeAllConnections?.(); } catch (e) { r(); } setTimeout(r, 1000); });
  }
  // cu Zotero deschis: sursele adăugate în Zotero de la ultima privire intră în Texere (cu PDF-ul, când ajunge în Zotero)
  async watch() {
    if (this._watching || Date.now() - (this._wAt || 0) < 4000) return; this._wAt = Date.now(); this._watching = true;
    const T = (a, b) => this.T(a, b), c = this.conf();
    try {
      if (!c.zoteroSeen) { c.zoteroSeen = new Date().toISOString(); await this.S.save(); return; }
      const since = Date.parse(c.zoteroSeen) || Date.now();
      const { json } = await this.localJson("items/top?sort=dateAdded&direction=desc&limit=10&include=data,csljson");
      const fresh = (Array.isArray(json) ? json : []).filter(r => r?.data && !["note", "attachment", "annotation"].includes(r.data.itemType) && Date.parse(r.data.dateAdded) > since && !this.taking.has(r.key));
      if (!fresh.length) return;
      c.zoteroSeen = new Date(Math.max(...fresh.map(r => Date.parse(r.data.dateAdded)))).toISOString(); await this.S.save();
      if (fresh.length > 3) {   // multe deodată (ex. un import în Zotero): nu fac zeci de note fără să întreb
        const frag = document.createDocumentFragment(); frag.append(T(`${fresh.length}+ surse noi în Zotero. `, `${fresh.length}+ new sources in Zotero. `));
        const a = document.createElement("a"); a.textContent = T("Importă-le…", "Import them…"); a.href = "#"; frag.append(a);
        const n = new Notice(frag, 15000); a.addEventListener("click", e => { e.preventDefault(); n.hide(); this.openImport(); });
        return;
      }
      for (const r of fresh.reverse()) await this.take(r);
    } catch (e) { console.warn("Texere Zotero: sursele noi", e); }
    finally { this._watching = false; }
  }
  async hasPdf(key) {
    try { const { json } = await this.localJson(`items/${key}/children`); return (json || []).some(r => r.data?.itemType === "attachment" && isPdf(r.data) && r.data.linkMode !== "linked_url"); } catch (e) { return false; }
  }
  async take(r) {
    const T = (a, b) => this.T(a, b), key = r.key; this.taking.add(key);
    try {
      let x = this.result(r, "local");
      if (this.S.library().find(x)) { new Notice(T(`Din Zotero: „${x.title}” e deja în vault.`, `From Zotero: “${x.title}” is already in your vault.`), 6000); return; }
      // PDF-ul ajunge în Zotero la câteva secunde după sursă (îl descarcă browserul): îl aștept puțin; dacă nu e gata, nota se face acum
      // și PDF-ul se atașează când ajunge (nu mai stai după el)
      const wait = new Notice(T(`Din Zotero: „${x.title}”…`, `From Zotero: “${x.title}”…`), 0);
      let got = false;
      try { for (let i = 0; i < 5 && !(got = await this.hasPdf(key)); i++) await sleep(1000); } finally { wait.hide(); }
      try { x = await this.fixed(r, "local", { wantPdf: !got, retry: true }); } catch (e) { console.warn("Texere Zotero: datele sursei", e); }
      if (got) { x.pdf = []; await this.S.add(x, { csl: x.zotero.csl }); return; }
      const free = x.pdf.slice(); x.pdf = [];
      const note = await this.S.add(x, { csl: x.zotero.csl, noZoteroPdf: true, noFreePdf: true, addedMsg: k => T(`Sursă adăugată din Zotero: @${k}. PDF-ul se atașează când ajunge.`, `Source added from Zotero: @${k}. Its PDF is attached when it arrives.`) });
      if (note) this.pdfAfter(note, { ...x, pdf: free }, key);   // fără await
    } catch (e) { console.error("Texere Zotero: sursa nouă", e); new Notice(T("Sursa din Zotero n-a intrat în Texere: ", "The source from Zotero didn't come into Texere: ") + e.message, 10000); }
    finally { setTimeout(() => this.taking.delete(key), 120000); }
  }
  // după ce nota există: PDF-ul din Zotero (încă vreo 40 s), altfel cel gratuit (dacă e pornită căutarea PDF-urilor)
  async pdfAfter(note, x, key) {
    const T = (a, b) => this.T(a, b);
    try {
      for (let i = 0; i < 20; i++) {
        await sleep(2000);
        if (!(await this.hasPdf(key))) continue;
        if (this.S.attachedPdfs?.(this.app.vault.getAbstractFileByPath(note.path) || note)?.length) return;   // are deja unul
        const pdf = await this.pdfToVault(x); if (!pdf) break;
        await this.S.placeLater(note, pdf, x.zotero?.csl);
        new Notice(T(`PDF-ul din Zotero e atașat: „${x.title}”`, `The PDF from Zotero is attached: “${x.title}”`), 5000);
        return;
      }
      if (this.S.conf().pdf === false || (!x.doi && !x.pdf?.length)) return;   // căutarea PDF-urilor gratuite e oprită în setări
      const f = this.app.vault.getAbstractFileByPath(note.path) || note, name = await this.S.freePdfFor(f, x);
      if (name) new Notice(T(`PDF găsit și atașat: „${x.title}”`, `PDF found and attached: “${x.title}”`), 5000);
      else if (!this.S.attachedPdfs?.(f)?.length) this.S.noPdfNotice?.({ note: f, x });
    } catch (e) { console.warn("Texere Zotero: PDF-ul venit mai târziu", e); }
  }
  send(res, code, body) { if (res.headersSent) return; res.setHeader("Content-Type", "application/json"); res.writeHead(code); res.end(body === undefined ? "" : JSON.stringify(body)); }
  async body(req) { const chunks = []; for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c); return Buffer.concat(chunks).toString("utf8"); }
  async handle(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Zotero-Version, X-Zotero-Connector-API-Version, X-Metadata, Authorization");
    res.setHeader("Access-Control-Expose-Headers", "X-Zotero-Version"); res.setHeader("X-Zotero-Version", "Texere 1.0");
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
    const u = new URL(req.url || "/", "http://127.0.0.1"), ep = u.pathname.replace(/^\/connector\//, "");
    if (!u.pathname.startsWith("/connector/")) return this.send(res, u.pathname === "/" ? 200 : 404, u.pathname === "/" ? { message: "Texere is listening for Zotero Connector" } : { error: "Not Found" });
    const json = async () => { try { return JSON.parse(await this.body(req) || "{}"); } catch (e) { return null; } };
    switch (ep) {
      case "ping": { if (req.method === "POST") await this.body(req);
        return this.send(res, 200, { authenticated: false, loggedIn: false, storage: [1, 0, 0], version: "Texere 1.0",
          prefs: { downloadAssociatedFiles: true, automaticSnapshots: true, reportActiveURL: false, googleDocsAddNoteEnabled: false, googleDocsCitationExplorerEnabled: false, supportsAttachmentUpload: true } }); }   // fără translatorsHash: altfel butonul și-ar reîncărca traducătoarele de site-uri de la Texere (o listă goală)
      case "getSelectedCollection": return this.send(res, 200, { id: "texere", name: "Texere", libraryID: 1, libraryEditable: true, filesEditable: true, targets: [{ id: "texere", name: "Texere", type: "library", libraryID: 1, level: 0, filesEditable: true }] });
      case "saveItems": {
        // butonul trimite întâi sursa, apoi (separat, după ce browserul îl descarcă) PDF-ul, prin saveAttachment
        const d = await json(); if (!d?.items?.length) return this.send(res, 400, { error: "No items provided" });
        const id = d.sessionID || this.node("crypto").randomUUID(), it = d.items[0];
        this.sessions.set(id, { item: it, uri: d.uri, files: {}, at: Date.now(), t0: Date.now(), done: false });
        this.send(res, 201, { sessionID: id });   // Zotero răspunde 201
        new Notice(this.T(`Butonul Zotero: primesc „${String(it.title || "sursa").slice(0, 80)}”…`, `Zotero button: receiving “${String(it.title || "the source").slice(0, 80)}”…`), 4000);
        return this.wait(id, 15000);   // dacă nu mai vine nimic (nici PDF, nici semnalul „fără PDF”), sursa intră după 15 s; un PDF venit mai târziu se atașează oricum
      }
      case "saveSnapshot": {
        const d = await json() || {}, id = d.sessionID || this.node("crypto").randomUUID();
        if (!this.sessions.has(id)) this.sessions.set(id, { item: { itemType: "webpage", title: d.title || d.url, url: d.url, accessDate: new Date().toISOString(), creators: [] }, uri: d.url, files: {}, at: Date.now(), done: false });
        this.send(res, 201, { sessionID: id }); return this.wait(id, 3000);
      }
      case "saveAttachment": case "saveStandaloneAttachment": {
        const sid = u.searchParams.get("sessionID"), s = this.sessions.get(sid); if (!s) { await this.body(req); return this.send(res, 404, { error: "Session not found" }); }
        let meta = {}; try { meta = JSON.parse(req.headers["x-metadata"] || "{}"); } catch (e) {}
        const type = String(req.headers["content-type"] || ""), aid = meta.id || this.node("crypto").randomUUID();
        if (!/pdf/i.test(type)) { await this.body(req); this.send(res, 201, { status: "success", canRecognize: false }); return this.wait(sid, 8000); }
        const fs = this.node("fs"), path = this.node("path"), file = path.join(this.tmp, `${Date.now()}-${aid}.pdf`.replace(/[^\w.-]+/g, "_"));
        const chunks = []; for await (const c of req) chunks.push(c); fs.writeFileSync(file, Buffer.concat(chunks));
        s.files[aid] = { path: file, title: meta.title || "PDF" }; s.at = Date.now();
        this.send(res, 201, { status: "success", filename: path.basename(file), canRecognize: false });
        if (s.done) return this.late(s, file);   // a ajuns după ce sursa a intrat: se atașează notei
        return this.wait(sid, 1500);
      }
      // pagina salvată de browser (o cere „automaticSnapshots”): nu o păstrăm, doar titlul și etichetele <meta>, din care se refac literele pierdute
      case "saveSingleFile": {
        const raw = await this.body(req); let d = null; try { d = JSON.parse(raw); } catch (e) {}
        const sid = d?.sessionID || u.searchParams.get("sessionID") || (/"sessionID"\s*:\s*"([^"]+)"/.exec(raw.slice(0, 20000)) || [])[1];
        const html = typeof d?.snapshotContent === "string" ? d.snapshotContent : (/<(?:!doctype|html)[\s\S]*<\/html>/i.exec(raw) || [""])[0];
        const s = sid && this.sessions.get(sid); if (s && html) s.page = pageHead(html);
        res.writeHead(201); res.end();
        if (s && !s.done) this.wait(sid, 300);
        return;
      }
      case "sessionProgress": {
        const d = await json() || {}, s = this.sessions.get(d.sessionID); if (!s) return this.send(res, 404, { error: "Session not found" });
        return this.send(res, 200, { items: [{ id: s.item.id || "item", progress: 100, attachments: Object.keys(s.files).map(a => ({ id: a, progress: 100 })) }], done: s.done });
      }
      // butonul întreabă asta doar când n-a putut lua PDF-ul (sau sursa n-are): nu mai vine nimic, sursa poate intra
      case "hasAttachmentResolvers": { const d = await json() || {}, s = this.sessions.get(d.sessionID); if (s && !Object.keys(s.files).length) this.wait(d.sessionID, 300); return this.send(res, 200, false); }
      // traducătoarele de site-uri (cele care fac dintr-o pagină de revistă un articol cu DOI, autori și PDF): din folderul lui Zotero,
      // ca butonul să lucreze la fel și când Zotero e închis (altfel salvează doar „pagina web”)
      case "getTranslators": { const d = await json() || {}; return this.send(res, 200, this.translatorList(d.url)); }
      case "getTranslatorCode": {
        const d = await json() || {}, code = this.translatorCode(d.translatorID);
        if (!code) return this.send(res, 404, { error: "Translator not found" });
        res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" }); return res.end(code);
      }
      // „Done” în fereastra butonului: sursa intră acum (PDF-ul, dacă încă se descarcă, se atașează când ajunge)
      case "updateSession": { const d = await json() || {}, s = this.sessions.get(d.sessionID); if (s && !s.done) this.wait(d.sessionID, Object.keys(s.files).length ? 500 : 4000); return this.send(res, 200, {}); }
      case "delaySync": { if (req.method === "POST") await this.body(req); return this.send(res, 200, {}); }
      default: { if (req.method === "POST") await this.body(req); return this.send(res, 501, { error: "Not implemented in Texere" }); }
    }
  }
  // traducătoarele lui Zotero (~/Zotero/translators): antetul fiecăruia (JSON) și codul, citite o dată
  translators() {
    if (this._tr && Date.now() - this._tr.at < 10 * 60000) return this._tr.map;
    const map = new Map(), fs = this.node("fs"), path = this.node("path"), os = this.node("os");
    const dirs = this.dataDirs().map(d => path.join(d, "translators"));
    for (const dir of dirs) {
      try {
        if (!fs.existsSync(dir)) continue;
        for (const n of fs.readdirSync(dir)) {
          if (!n.endsWith(".js")) continue;
          try { const f = path.join(dir, n), head = fs.readFileSync(f, "utf8").slice(0, 8000), m = /^\s*(\{[\s\S]*?\n\})/.exec(head); if (!m) continue; const meta = JSON.parse(m[1]); if (meta.translatorID && !map.has(meta.translatorID)) map.set(meta.translatorID, { meta, file: f }); } catch (e) {}
        }
        if (map.size) break;
      } catch (e) {}
    }
    this._tr = { at: Date.now(), map }; return map;
  }
  translatorList(url) {
    const keys = ["translatorID", "translatorType", "label", "creator", "target", "targetAll", "minVersion", "maxVersion", "priority", "browserSupport", "inRepository", "lastUpdated"];
    let list = [...this.translators().values()].map(t => t.meta);
    if (url) list = list.filter(m => (m.translatorType & 4) && (() => { try { return !m.target || new RegExp(m.target, "i").test(url); } catch (e) { return false; } })());
    return list.map(m => Object.fromEntries(keys.filter(k => m[k] !== undefined).map(k => [k, m[k]])));
  }
  translatorCode(id) { const t = this.translators().get(id); if (!t) return null; try { return this.node("fs").readFileSync(t.file, "utf8"); } catch (e) { return null; } }
  // sursa intră când a venit PDF-ul (și 1,5 s n-a mai venit nimic) sau când butonul spune că nu are PDF
  wait(id, ms) {
    const s = this.sessions.get(id); if (!s || s.done) return;
    unlater(s.timer); s.timer = later(() => this.finish(id), ms);
  }
  // PDF-ul care sosește după ce sursa a intrat în Texere (ai apăsat „Done” devreme): intră în Inbox și se atașează notei
  async late(s, tmpPath) {
    if (s.hasPdf || s.lateBusy) return; s.lateBusy = true;
    try {
      const fs = this.node("fs"), dir = this.S.inboxDir(); await this.S.ensureFolder(dir);
      const cur = s.note && (this.app.vault.getAbstractFileByPath?.(s.note.path) || s.note), had = cur ? this.S.attachedPdfs?.(cur) || [] : [];
      if (had.length) {   // nota are deja un PDF: unul ajunge
        const b = fs.readFileSync(tmpPath);
        for (const f of had) { try { const o = new Uint8Array(await this.app.vault.readBinary(f)); if (o.length === b.length && Buffer.compare(Buffer.from(o), b) === 0) { try { fs.unlinkSync(tmpPath); } catch (e) {} s.hasPdf = true; return; } } catch (e) {} }
      }
      const base = String(s.item.title || "Zotero").replace(/[\\/:*?"<>|#^[\]]+/g, " ").slice(0, 120).trim(), path = this.S.freePath(dir, base, "pdf");
      this.quietInbox.add(path);
      const b = fs.readFileSync(tmpPath), pdf = await this.app.vault.createBinary(path, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
      try { fs.unlinkSync(tmpPath); } catch (e) {}
      const note = s.note && (this.app.vault.getAbstractFileByPath?.(s.note.path) || s.note);
      if (note && had.length) { new Notice(this.T(`„${s.item.title}” avea deja un PDF; cel de la butonul Zotero e în Inbox.`, `“${s.item.title}” already had a PDF; the one from the Zotero button is in Inbox.`), 8000); s.hasPdf = true; }
      else if (note) { await this.S.attachToNote(note, pdf); s.hasPdf = true; }
    } catch (e) { console.warn("Texere Zotero: PDF-ul venit mai târziu", e); }
    finally { s.lateBusy = false; }
  }
  // sursa intră singură în Texere, cu PDF-ul (ca orice sursă adăugată din „Adaugă o sursă”)
  async finish(id) {
    const s = this.sessions.get(id); if (!s || s.done) return;
    // litere pierdute („Bucure?ti”) și pagina încă n-a sosit de la browser: o mai așteptăm puțin (cel mult 8 s de la primire)
    if (!s.page && Date.now() - (s.t0 || 0) < 8000 && this.needsPage(s.item)) { s.timer = later(() => this.finish(id), 1000); return; }
    s.done = true;
    const T = (a, b) => this.T(a, b); let csl = toCsl(s.item), fix = { pdf: null, url: null };
    try { const page = s.uri || s.item.url; fix = await this.repairCsl(csl, async () => { if (s.page) return [s.page]; if (!page || !/^https?:/.test(page)) return []; const p = await Promise.race([requestUrl({ url: page, throw: false }), sleep(12000).then(() => ({ status: 0 }))]); return p.status === 200 ? [p.text] : []; }, { wantPdf: !Object.keys(s.files).length && !!s.page }); } catch (e) { console.warn("Texere Zotero: datele sursei", e); }
    if (!csl.DOI && (csl.type === "webpage" || !(csl.author || []).length)) {   // salvată ca „pagină web” (fără traducător): dacă adresa are un DOI, datele întregi vin din DOI
      const doi = doiIn(s.item.url || s.uri || "");
      if (doi) { try { const full = await this.S.fullCsl?.({ doi }); if (full?.title) { csl = { ...full, DOI: full.DOI || doi, URL: csl.URL || full.URL }; s.fromDoi = true; } } catch (e) { console.warn("Texere Zotero: DOI din adresă", e); } }
    }
    const declared = (s.item.attachments || []).filter(a => a?.url && /pdf/i.test(a.mimeType || "")).map(a => { try { return new URL(a.url, s.uri || s.item.url).href; } catch (e) { return null; } }).filter(Boolean);
    const x = { title: csl.title, authors: csl.author || [], year: csl.issued?.["date-parts"]?.[0]?.[0] || null, doi: csl.DOI || null, isbn: csl.ISBN || null, type: csl.type, url: csl.URL || fix.url || s.uri || null, pdf: [...new Set([...declared, ...(fix.pdf ? [fix.pdf] : [])])], sources: [] };
    setTimeout(() => this.sessions.delete(id), 30 * 60000);
    let pdf = null; const f = Object.values(s.files)[0];
    if (f) {
      try {   // PDF-ul intră întâi în Inbox (fără mesajul obișnuit „PDF nou în Inbox”): dacă ceva nu merge, rămâne acolo și îl poți adăuga oricând
        const fs = this.node("fs"), dir = this.S.inboxDir(); await this.S.ensureFolder(dir);
        const base = (csl.title || "Zotero").replace(/[\\/:*?"<>|#^[\]]+/g, " ").slice(0, 120).trim(), path = this.S.freePath(dir, base, "pdf");
        this.quietInbox.add(path);
        const b = fs.readFileSync(f.path); pdf = await this.app.vault.createBinary(path, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
        try { fs.unlinkSync(f.path); } catch (e) {}
      } catch (e) { console.warn("Texere Zotero: PDF-ul primit", e); }
    }
    const have = this.S.library().find(x);
    if (have) { new Notice(T(`Butonul Zotero: „${x.title}” e deja în vault.`, `Zotero button: “${x.title}” is already in your vault.`) + (pdf ? T(" PDF-ul primit e în Inbox.", " The PDF it sent is in Inbox.") : ""), 8000); return; }
    try {
      s.note = await this.S.add(x, { csl, pdfFile: pdf || undefined }); s.hasPdf = !!pdf;
    }
    catch (e) { console.error("Texere Zotero: butonul", e); new Notice(T("Sursa de la butonul Zotero n-a intrat în Texere: ", "The source from the Zotero button didn't come into Texere: ") + e.message + (pdf ? T(" PDF-ul e în Inbox.", " The PDF is in Inbox.") : ""), 10000); }
  }
}

// ——— fereastra de import (același aspect ca „Adaugă o sursă”: filele sus, butoanele în subsol) ———
class ImportModal extends Modal {
  constructor(Z, mode) { super(Z.app); this.Z = Z; this.mode = mode; this.sel = null; this.items = null; }
  T(a, b) { return this.Z.T(a, b); }
  async onOpen() {
    const T = (a, b) => this.T(a, b), Z = this.Z;
    this.modalEl.addClass("texere-src"); this.modalEl.addClass("texere-zimport"); this.titleEl.empty();
    this.titleEl.createSpan({ cls: "ts-head-t", text: T("Importă din Zotero", "Import from Zotero") });
    this.titleEl.createSpan({ cls: "ts-zmode", text: this.mode === "local" ? T("Zotero deschis pe acest calculator", "Zotero open on this computer") : T("prin cheia Zotero", "through your Zotero key") + (Z.conf().zoteroUser?.name ? ` · ${Z.conf().zoteroUser.name}` : "") });
    const pane = this.contentEl.createDiv("ts-pane");
    pane.createDiv({ cls: "ts-hint", text: T("Alege ce imporți. Sursele care sunt deja în vault se sar; fiecare primește o notă de literatură, cu PDF-ul ei din Zotero.", "Choose what to import. Sources already in your vault are skipped; each one gets a literature note, with its PDF from Zotero.") });
    this.list = pane.createDiv("ts-zlist"); this.list.setText(T("Încarc colecțiile…", "Loading the collections…"));
    const ft = this.contentEl.createDiv("ts-foot"); this.footL = ft.createDiv("ts-foot-l"); this.footR = ft.createDiv("ts-foot-r");
    const pl = this.footL.createEl("label", { cls: "ts-zpdf" }); this.pdfs = pl.createEl("input", { type: "checkbox" }); this.pdfs.checked = true; pl.appendText(" " + T("Cu PDF-urile", "With the PDFs"));
    pl.title = T("PDF-ul din Zotero (cu evidențierile tale); dacă Zotero n-are PDF, Texere caută unul gratuit.", "The PDF from Zotero (with your highlights); if Zotero has none, Texere looks for a free one.");
    const hl = this.footL.createEl("label", { cls: "ts-zpdf" }); this.hl = hl.createEl("input", { type: "checkbox" }); this.hl.checked = Z.conf().zoteroHighlights !== false; hl.appendText(" " + T("Cu evidențierile", "With highlights"));
    hl.title = T("Evidențierile și comentariile tale din Zotero intră în PDF și în notă, cu eticheta culorii (Setări → Texere · Sources → Cataloage → Zotero). Și pentru sursele care sunt deja în vault.", "Your Zotero highlights and comments go into the PDF and the note, tagged by color (Settings → Texere · Sources → Catalogs → Zotero). Also for sources already in your vault.");
    const sync = () => this.refreshButton();
    this.pdfs.addEventListener("change", sync); this.hl.addEventListener("change", () => { Z.conf().zoteroHighlights = this.hl.checked; Z.S.save(); sync(); });
    this.info = this.footL.createSpan({ cls: "ts-foot-q" });
    this.go = this.footR.createEl("button", { cls: "mod-cta", text: T("Importă", "Import") }); this.go.disabled = true;
    this.go.addEventListener("click", () => this.run());
    let cols = [];
    try { cols = await Z.collections(this.mode); } catch (e) { this.list.setText(T("Nu pot citi colecțiile din Zotero: ", "Couldn't read your Zotero collections: ") + e.message); return; }
    this.list.empty();
    const row = (key, name, depth, n) => {
      const r = this.list.createDiv("ts-zrow"); r.style.paddingLeft = 10 + depth * 18 + "px";
      r.createSpan({ cls: "ts-zname", text: name }); if (n != null) r.createSpan({ cls: "ts-zn", text: String(n) });
      r.addEventListener("click", () => { this.list.querySelectorAll(".ts-zrow").forEach(e => e.toggleClass("on", e === r)); this.pick(key, name, n); });
      return r;
    };
    row(null, T("Toată biblioteca", "The whole library"), 0, null).addClass("ts-zall");
    const kids = p => cols.filter(c => c.parent === p).sort((a, b) => a.name.localeCompare(b.name));
    const walk = (p, d) => { for (const c of kids(p)) { row(c.key, c.name, d, c.n); walk(c.key, d + 1); } };
    walk(null, 0); for (const c of cols.filter(c => c.parent && !cols.some(x => x.key === c.parent))) row(c.key, c.name, 0, c.n);
  }
  // ce e în colecție, numărat ca în Zotero: surse (noi / deja în vault), PDF-uri fără sursă, note; și ce e în coșul lui Zotero
  async pick(key, name, zn) {
    const T = (a, b) => this.T(a, b); this.sel = key; this.cat = null; this.go.disabled = true;
    this.info.setText(T("Număr…", "Counting…"));
    try {
      const cat = await this.Z.topItems(key, this.mode, (i, n) => this.info.setText(T(`Citesc ${i} / ${n}…`, `Reading ${i} / ${n}…`)));
      if (this.sel !== key) return;
      const lib = this.Z.S.library();
      cat.have = cat.sources.filter(r => lib.find(this.Z.result(r, this.mode))).length; cat.name = name;
      this.cat = cat;
      const parts = [];
      parts.push(cat.sources.length === 1 ? T("1 sursă", "1 source") : T(`${cat.sources.length} surse`, `${cat.sources.length} sources`));
      if (cat.have) parts[0] += T(` (${cat.have} deja în vault)`, ` (${cat.have} already in your vault)`);
      if (cat.pdfs.length) parts.push(cat.pdfs.length === 1 ? T("1 PDF fără sursă (intră în Inbox)", "1 PDF without a source (goes to Inbox)") : T(`${cat.pdfs.length} PDF-uri fără sursă (intră în Inbox)`, `${cat.pdfs.length} PDFs without a source (go to Inbox)`));
      if (cat.other.length) parts.push(cat.other.length === 1 ? T("1 notă sau link (nu se importă)", "1 note or link (not imported)") : T(`${cat.other.length} note sau linkuri (nu se importă)`, `${cat.other.length} notes or links (not imported)`));
      const trash = zn != null && zn > cat.total ? zn - cat.total : 0;
      this.info.setText(T(`„${name}”: ${cat.total} în Zotero — `, `“${name}”: ${cat.total} in Zotero — `) + parts.join(" · ") + (trash ? T(` · ${trash} în coșul lui Zotero`, ` · ${trash} in Zotero's trash`) : ""));
      this.refreshButton();
    } catch (e) { this.info.setText(T("Nu pot citi colecția: ", "Couldn't read the collection: ") + e.message); }
  }
  refreshButton() {
    const T = (a, b) => this.T(a, b), c = this.cat; if (!c || this.busy) return;
    const fresh = c.sources.length - c.have + (this.pdfs.checked ? c.pdfs.length : 0);
    if (fresh) { this.go.setText(T(`Importă ${fresh}`, `Import ${fresh}`)); this.go.disabled = false; }
    else if (c.have && this.hl.checked) { this.go.setText(T("Adu evidențierile", "Bring the highlights")); this.go.disabled = false; this.go.title = T("Toate sursele sunt deja în vault: adaug doar evidențierile noi din Zotero.", "All sources are already in your vault: I'll add only the new highlights from Zotero."); }
    else { this.go.setText(T("Toate sunt deja în vault", "All already in your vault")); this.go.disabled = true; }
  }
  async run() {
    const T = (a, b) => this.T(a, b), c = this.cat; if (!c) return;
    let stop = false; this.busy = true; this.go.disabled = true; this.list.addClass("is-busy");
    const cancel = this.footR.createEl("button", { text: T("Oprește", "Stop") }); cancel.addEventListener("click", () => { stop = true; cancel.disabled = true; });
    const pdfs = this.pdfs.checked, hl = this.hl.checked;
    const res = await this.Z.importItems(c, this.mode, { pdfs, highlights: hl, cancelled: () => stop, onStep: (i, n, t) => this.info.setText(`${i + 1} / ${n} · ${t}`) });
    cancel.remove(); this.list.removeClass("is-busy"); this.busy = false;
    const msg = this.Z.summary(res, pdfs);
    this.info.setText(msg); new Notice(msg, 10000);
    this.go.setText(T("Gata", "Done")); this.go.disabled = false; this.go.onclick = () => this.close();
  }
  onClose() { this.contentEl.empty(); }
}

// ——— fila „Zotero” din „Adaugă o sursă”: colecțiile în stânga, ce e în ele în dreapta; alegi ce imporți (sau tot), cu PDF-urile și evidențierile ———
const plain = s => String(s || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
class ZoteroPane {
  constructor(Z, host) { this.Z = Z; this.host = host || {}; this.key = undefined; this.cat = null; this.rows = []; this.checked = new Set(); this.busy = false; this.pdfs = true; this.hl = Z.conf().zoteroHighlights !== false; this.only = "all"; this.tok = 0; }
  T(a, b) { return this.Z.T(a, b); }
  foot0() { this.host.refreshFoot?.(); }
  // Zotero s-a închis / s-a deschis cât timp fila e deschisă: fila se reface (nu mai arată „deschis” când nu e)
  watch() {
    if (this.off) return;
    this.off = this.Z.onChange(st => this.onState(st));
    this.iv = window.setInterval(() => { if (this.dead) return this.destroy(); if (!this.busy) this.Z.refresh().catch(() => {}); }, 4000);
    // te întorci în Obsidian (după ce ai deschis Zotero): fila se uită imediat, nu peste câteva secunde
    this.onBack = () => { if (this.dead || this.busy || document.visibilityState === "hidden") return; if (!this.el?.isConnected) return this.destroy(); this.Z.refresh().catch(() => {}); };
    window.addEventListener("focus", this.onBack); document.addEventListener("visibilitychange", this.onBack);
  }
  onState(st) { const m = st?.zotero === "on" ? "local" : st?.key ? "web" : null; if (m !== this.mode && !this.busy && !this.dead && this.el) this.build(this.el); }
  destroy() { this.dead = true; this.off?.(); this.off = null; if (this.iv) window.clearInterval(this.iv); this.iv = null; if (this.onBack) { window.removeEventListener("focus", this.onBack); document.removeEventListener("visibilitychange", this.onBack); this.onBack = null; } }
  async build(el) {
    const T = (a, b) => this.T(a, b), Z = this.Z, tok = ++this.tok, stale = () => tok !== this.tok || this.dead;   // doar ultima reconstruire contează
    this.el = el; el.empty(); el.addClass("ts-zpane"); this.watch(); this.cat = null; this.rows = []; this.key = undefined;
    const head = el.createDiv("ts-zhead"); head.setText(T("Verific Zotero…", "Checking Zotero…"));
    let st; try { st = await Z.refresh(); } catch (e) { st = Z.st || {}; }
    if (stale()) return;
    this.mode = st?.zotero === "on" ? "local" : st?.key ? "web" : null;
    const d = Z.describe(st || {}); head.empty();
    head.createSpan({ cls: "ts-zdot " + (this.mode ? "ok" : d.dot || "warn") });
    head.createSpan({ cls: "ts-zhead-t", text: this.mode === "local" ? T("Zotero e deschis pe acest calculator", "Zotero is open on this computer") : this.mode === "web" ? T("Biblioteca ta, prin cheia Zotero", "Your library, through your Zotero key") + (Z.conf().zoteroUser?.name ? ` · ${Z.conf().zoteroUser.name}` : "") : d.head });
    if (this.mode) head.createSpan({ cls: "ts-zhead-d", text: T("Alege o colecție, bifează ce vrei (sau nimic, pentru tot) și importă: fiecare sursă primește o notă, cu PDF-ul și evidențierile ei din Zotero.", "Pick a collection, tick what you want (or nothing, for everything) and import: each source gets a note, with its PDF and highlights from Zotero.") });
    if (!this.mode) {
      el.createDiv({ cls: "ts-hint", text: d.detail });
      const row = el.createDiv("ts-zacts");
      const again = row.createEl("button", { cls: "mod-cta", text: T("Verifică din nou", "Check again") }); again.addEventListener("click", () => this.build(el));
      if (this.host.settings) { const set = row.createEl("button", { text: T("Setările Zotero…", "Zotero settings…") }); set.addEventListener("click", () => this.host.settings()); }
      this.foot0(); return;
    }
    const body = el.createDiv("ts-zbody");
    this.side = body.createDiv("ts-zside"); const main = body.createDiv("ts-zmain");
    const top = main.createDiv("ts-ztop");
    const qb = top.createDiv("ts-q"); try { setIcon(qb.createSpan(), "search"); } catch (e) {}
    this.inp = qb.createEl("input", { type: "text", placeholder: T("Filtrează: titlu, autor, an…", "Filter: title, author, year…") });
    this.inp.addEventListener("input", () => this.renderList());
    // toate sursele sau doar cele cu evidențieri în Zotero
    const seg = top.createDiv("ts-tabs ts-zonly");
    for (const [v, a, b] of [["all", "Toate", "All"], ["hl", "Cu evidențieri", "With highlights"]]) {
      const tb = seg.createSpan({ cls: "ts-tab" + (this.only === v ? " on" : ""), text: T(a, b) });
      tb.title = v === "hl" ? T("Doar sursele și PDF-urile cu evidențieri în Zotero", "Only the sources and PDFs with highlights in Zotero") : "";
      tb.addEventListener("click", () => { if (this.only === v) return; this.only = v; seg.querySelectorAll(".ts-tab").forEach(e => e.toggleClass("on", e === tb)); this.renderList(); this.foot0(); });
    }
    this.stat = main.createDiv("ts-status"); this.list = main.createDiv("ts-list");
    this.side.setText(T("Încarc colecțiile…", "Loading the collections…")); this.stat.setText(T("Citesc biblioteca…", "Reading your library…")); this.foot0();
    let cols = []; try { cols = await Z.collections(this.mode); } catch (e) { if (stale()) return; if (e.closed) { await Z.refresh().catch(() => {}); if (!stale() && Z.st?.zotero !== "on") return this.build(el); } this.side.setText(T("Nu pot citi colecțiile: ", "Couldn't read the collections: ") + e.message); this.retry(this.stat); return; }
    if (stale()) return;
    this.side.empty();
    const row = (key, name, depth, n) => {
      const r = this.side.createDiv("ts-zrow"); r.style.paddingLeft = 10 + depth * 16 + "px";
      r.createSpan({ cls: "ts-zname", text: name }).title = name; if (n != null) r.createSpan({ cls: "ts-zn", text: String(n) });
      r.addEventListener("click", () => { if (this.busy) return; this.side.querySelectorAll(".ts-zrow").forEach(e => e.toggleClass("on", e === r)); this.pick(key, name, n); });
      return r;
    };
    const all = row(null, T("Toată biblioteca", "The whole library"), 0, null); all.addClass("ts-zall");
    const kids = p => cols.filter(c => c.parent === p).sort((a, b) => a.name.localeCompare(b.name));
    const walk = (p, dd) => { for (const c of kids(p)) { row(c.key, c.name, dd, c.n); walk(c.key, dd + 1); } };
    walk(null, 0); for (const c of cols.filter(c => c.parent && !cols.some(x => x.key === c.parent))) row(c.key, c.name, 0, c.n);
    all.addClass("on"); await this.pick(null, T("Toată biblioteca", "The whole library"), null);
  }
  // „Încearcă din nou” lângă un mesaj de eroare
  retry(el) { const a = el.createEl("a", { cls: "ts-zretry", text: " " + this.T("Încearcă din nou", "Try again") }); a.addEventListener("click", () => this.build(this.el)); }
  idOf(o) { return o.r.key || o.r.data?.key; }
  async pick(key, name, zn) {
    const T = (a, b) => this.T(a, b), Z = this.Z;
    const tok = this.tok, stale = () => tok !== this.tok || this.dead || this.key !== key;
    this.key = key; this.name = name; this.zn = zn; this.cat = null; this.rows = []; this.counts = null; this.checked.clear(); this.list.empty(); this.foot0();
    this.stat.setText(T(`Citesc „${name}”…`, `Reading “${name}”…`));
    try {
      const cat = await Z.topItems(key, this.mode, (i, n) => { if (!stale()) this.stat.setText(T(`Citesc „${name}”: ${i} / ${n}…`, `Reading “${name}”: ${i} / ${n}…`)); });
      if (stale()) return;
      const lib = Z.S.library();
      this.rows = [...cat.sources.map(r => { const x = Z.result(r, this.mode); return { r, x, kind: "src", have: !!lib.find(x) }; }),
        ...cat.pdfs.map(r => ({ r, kind: "pdf", x: { title: r.data?.title || r.data?.filename || "PDF" } }))];
      this.cat = cat; this.renderList(); this.foot0();
      try { const n = await Z.highlightCounts(this.mode); if (!stale()) { this.counts = n; this.renderList(); this.foot0(); } } catch (e) { console.warn("Texere Zotero: evidențierile din listă", e); if (!stale()) { this.counts = new Map(); this.renderList(); } }
    } catch (e) {
      if (stale()) return;
      // Zotero s-a închis între timp: fila arată asta (cu ce ai de făcut), nu „deschis” cu o eroare
      if (e.closed) { await Z.refresh().catch(() => {}); if (!stale() && Z.st?.zotero !== "on" && !Z.st?.key) return this.build(this.el); }
      this.stat.setText(T("Nu pot citi colecția: ", "Couldn't read the collection: ") + e.message); this.retry(this.stat);
    }
  }
  visible() {
    const q = (this.inp?.value || "").trim().toLowerCase();
    const rows = this.only === "hl" ? this.rows.filter(o => (this.counts?.get(this.idOf(o)) || 0) > 0) : this.rows;
    if (!q) return rows;
    return rows.filter(o => [o.x.title, (o.x.authors || []).map(a => [a.given, a.family, a.literal].filter(Boolean).join(" ")).join(" "), o.x.year, o.r.meta?.creatorSummary].join(" ").toLowerCase().includes(q));
  }
  renderList() {
    const T = (a, b) => this.T(a, b), S = this.Z.S, vis = this.visible(); this.list.empty();
    const kinds = { article: T("Articol", "Article"), book: T("Carte", "Book"), chapter: T("Capitol", "Chapter") };
    if (this.cat && !this.rows.length) this.list.createDiv({ cls: "ts-empty", text: T("Nimic de importat aici.", "Nothing to import here.") });
    else if (this.cat && !vis.length && this.only === "hl" && !this.counts) this.list.createDiv({ cls: "ts-empty", text: T("Număr evidențierile…", "Counting the highlights…") });
    else if (this.cat && !vis.length && this.only === "hl" && !(this.inp?.value || "").trim()) this.list.createDiv({ cls: "ts-empty", text: T("Nicio sursă de aici nu are evidențieri în Zotero.", "No source here has highlights in Zotero.") });
    else if (this.cat && !vis.length) this.list.createDiv({ cls: "ts-empty", text: T("Nimic nu se potrivește cu filtrul.", "Nothing matches the filter.") });
    for (const o of vis) {
      const id = this.idOf(o), on = this.checked.has(id);
      const row = this.list.createDiv("ts-item ts-zitem" + (on ? " sel" : ""));
      const cb = row.createEl("input", { type: "checkbox", cls: "ts-zchk" }); cb.checked = on;
      const b0 = row.createDiv("ts-zitem-b");
      b0.createDiv({ cls: "ts-title", text: plain(o.x.title) });
      if (o.kind === "src") {
        const who = o.r.meta?.creatorSummary || (o.x.authors || []).slice(0, 3).map(a => a.family || a.literal).filter(Boolean).join(", ");
        const meta = [who, o.x.year, o.x.venue || o.x.publisher].filter(Boolean).join(" · "); if (meta) b0.createDiv({ cls: "ts-meta", text: meta });
      }
      const b = b0.createDiv("ts-badges");
      if (o.kind === "src") { b.createSpan({ cls: "ts-b kind", text: kinds[S.kind?.(o.x.type)] || T("Sursă", "Source") }); if (o.have) b.createSpan({ cls: "ts-b have", text: T("✓ deja în vault", "✓ already in your vault") }); }
      else b.createSpan({ cls: "ts-b", text: T("PDF fără sursă · intră în Inbox", "PDF without a source · goes to Inbox") });
      const hn = this.counts?.get(id) || 0; if (hn) b.createSpan({ cls: "ts-b hl", text: T(`✎ ${hn} evidențieri`, `✎ ${hn} highlight${hn === 1 ? "" : "s"}`) });
      const toggle = v => { if (v) this.checked.add(id); else this.checked.delete(id); cb.checked = v; row.toggleClass("sel", v); this.foot0(); };
      row.addEventListener("click", e => { if (e.target === cb || this.busy) return; toggle(!this.checked.has(id)); });
      cb.addEventListener("change", () => toggle(cb.checked));
    }
    const src = this.rows.filter(o => o.kind === "src"), have = src.filter(o => o.have).length, pdfs = this.rows.length - src.length, other = this.cat?.other.length || 0;
    const parts = [src.length === 1 ? T("1 sursă", "1 source") : T(`${src.length} surse`, `${src.length} sources`)];
    if (have) parts[0] += T(` (${have} deja în vault)`, ` (${have} already in your vault)`);
    if (pdfs) parts.push(pdfs === 1 ? T("1 PDF fără sursă", "1 PDF without a source") : T(`${pdfs} PDF-uri fără sursă`, `${pdfs} PDFs without a source`));
    if (other) parts.push(other === 1 ? T("1 notă sau link (nu se importă)", "1 note or link (not imported)") : T(`${other} note sau linkuri (nu se importă)`, `${other} notes or links (not imported)`));
    const trash = this.zn != null && this.cat && this.zn > this.cat.total ? this.zn - this.cat.total : 0;
    if (this.cat) this.stat.setText(`${this.name}: ` + parts.join(" · ") + (trash ? T(` · ${trash} în coșul lui Zotero`, ` · ${trash} in Zotero's trash`) : "") + (vis.length !== this.rows.length ? T(` · arăt ${vis.length}`, ` · showing ${vis.length}`) : ""));
  }
  targets() { return this.checked.size ? this.rows.filter(o => this.checked.has(this.idOf(o))) : this.visible(); }
  foot(L, R) {
    const T = (a, b) => this.T(a, b), Z = this.Z;
    if (!this.mode) { L.createSpan({ cls: "ts-foot-q", text: T("Deschide Zotero sau adaugă cheia ta Zotero.", "Open Zotero or add your Zotero key.") }); return; }
    const chk = (label, get, set, tip) => { const l = L.createEl("label", { cls: "ts-zpdf" }); const i = l.createEl("input", { type: "checkbox" }); i.checked = get(); i.disabled = this.busy; l.appendText(" " + label); if (tip) l.title = tip; i.addEventListener("change", () => { set(i.checked); this.foot0(); }); };
    chk(T("Cu PDF-urile", "With the PDFs"), () => this.pdfs, v => { this.pdfs = v; }, T("PDF-ul din Zotero; dacă Zotero n-are PDF, Texere caută unul gratuit.", "The PDF from Zotero; if Zotero has none, Texere looks for a free one."));
    chk(T("Cu evidențierile", "With highlights"), () => this.hl, v => { this.hl = v; Z.conf().zoteroHighlights = v; Z.S.save(); }, T("Evidențierile și comentariile tale din Zotero intră în PDF și în notă, cu eticheta culorii. Și la sursele care sunt deja în vault.", "Your Zotero highlights and comments go into the PDF and the note, tagged by color. Also for sources already in your vault."));
    if (this.busy) { const stop = R.createEl("button", { text: T("Oprește", "Stop") }); stop.addEventListener("click", () => { this.stop = true; stop.disabled = true; }); return; }
    if (this.checked.size) { const a = L.createEl("a", { text: T(`Deselectează (${this.checked.size})`, `Clear selection (${this.checked.size})`) }); a.addEventListener("click", () => { this.checked.clear(); this.renderList(); this.foot0(); }); }
    const sel = this.targets(), fresh = sel.filter(o => o.kind === "src" ? !o.have : this.pdfs).length, have = sel.filter(o => o.have).length;
    const go = R.createEl("button", { cls: "mod-cta" });
    if (!this.cat) { go.setText(T("Importă", "Import")); go.disabled = true; }
    else if (fresh) go.setText(this.checked.size ? T(`Importă ${fresh}`, `Import ${fresh}`) : T(`Importă tot (${fresh})`, `Import all (${fresh})`));
    else if (have && (this.hl || this.pdfs)) { go.setText(T("Actualizează din Zotero", "Update from Zotero")); go.title = T("Sunt deja în vault: aduc PDF-ul celor care nu-l au și evidențierile noi din Zotero.", "Already in your vault: I'll bring the PDF to those without one, and the new highlights from Zotero."); }
    else { go.setText(T("Deja în vault", "Already in your vault")); go.disabled = true; }
    go.addEventListener("click", () => this.run());
  }
  async run() {
    const T = (a, b) => this.T(a, b), Z = this.Z, sel = this.targets(); if (!sel.length || this.busy) return;
    const st = await Z.refresh().catch(() => null), m = st?.zotero === "on" ? "local" : st?.key ? "web" : null;
    if (m !== this.mode) { new Notice(m ? T("Zotero s-a schimbat între timp: am reîncărcat lista.", "Zotero changed in the meantime: I reloaded the list.") : T("Zotero e închis: deschide-l și importă din nou (PDF-urile și evidențierile vin din el).", "Zotero is closed: open it and import again (the PDFs and highlights come from it)."), 8000); this.build(this.el); return; }
    const cat = { sources: sel.filter(o => o.kind === "src").map(o => o.r), pdfs: sel.filter(o => o.kind === "pdf").map(o => o.r), other: [] };
    this.busy = true; this.stop = false; this.list.addClass("is-busy"); this.foot0();
    let res = null;
    try { res = await Z.importItems(cat, this.mode, { pdfs: this.pdfs, highlights: this.hl, cancelled: () => this.stop, onStep: (i, n, t) => this.stat.setText(`${i + 1} / ${n} · ${plain(t)}`) }); }
    catch (e) { new Notice(T("Importul n-a mers: ", "The import failed: ") + e.message, 10000); }
    finally { this.busy = false; this.list.removeClass("is-busy"); }
    const msg = res ? Z.summary(res, this.pdfs) : "";
    if (res && !res.notStarted && this.host.close) { this.host.close(); Z.doneNotice(res, msg); return; }   // gata: fereastra se închide, mesajul are butoanele
    if (msg) new Notice(msg, 12000);
    await this.pick(this.key, this.name, this.zn);   // „deja în vault” se reîmprospătează
    if (msg) { this.stat.setText(msg); this.stat.addClass("ts-zdone"); setTimeout(() => this.stat?.removeClass("ts-zdone"), 4000); }
  }
}

module.exports = {
  toCsl, Zotero, ZoteroPane,
  install(S) {
    const Z = new Zotero(S); S.zotero = Z; S.ZoteroPane = ZoteroPane;   // fila „Zotero” din „Adaugă o sursă”
    const h = S.host;
    h.addCommand({ id: "sources-zotero-import", name: "Import from Zotero / Importă din Zotero", callback: () => Z.openImport() });
    // butonul din browser și starea lui Zotero: verificate la câteva secunde (doar cât timp butonul e pornit)
    S.app.workspace.onLayoutReady?.(() => later(() => Z.tick().catch(() => {}).finally(() => Z.schedule()), 2000));
    h.register(() => { Z.dead = true; unlater(Z._tt); Z.stopConnector(); });
    return Z;
  },
};
