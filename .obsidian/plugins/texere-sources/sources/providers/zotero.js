// Zotero — biblioteca ta din Zotero: cu Zotero deschis (API-ul local) sau oricând, cu o cheie Zotero (Setări → Cataloage → Zotero).
// Sursa vine cu datele tale din Zotero și cu PDF-ul ei. Toată legătura cu Zotero e în sources/zotero.js.
module.exports = {
  id: "zotero", name: "Zotero", order: 1,
  desc: { en: "Your Zotero library, with its PDFs. Works when Zotero is open (turn on “Allow other applications on this computer to communicate with Zotero” in Zotero → Settings → Advanced), or anytime with a free Zotero key.",
    ro: "Biblioteca ta din Zotero, cu PDF-urile ei. Merge când Zotero e deschis (pornește „Permite altor aplicații de pe acest computer să comunice cu Zotero” în Zotero → Setări → Avansat) sau oricând, cu o cheie Zotero gratuită." },
  async search(q, f, ctx) { return ctx.zotero ? ctx.zotero.search(q, f) : []; },
  async full(x) { return x.zotero?.csl || null; },
};
