// Crossref — registrul DOI pentru reviste și edituri academice: date exacte pentru orice lucrare cu DOI.
// https://api.crossref.org · gratuit, fără cheie.
module.exports = {
  id: "crossref", name: "Crossref", order: 20, types: ["article", "book", "chapter"],
  desc: { en: "The DOI registry of academic publishers: exact data for anything with a DOI.", ro: "Registrul DOI al editurilor academice: date exacte pentru orice are DOI." },
  async search(q, f, ctx) {
    const filt = [];
    if (f.type === "article") filt.push("type:journal-article"); else if (f.type === "book") filt.push("type:book", "type:monograph", "type:edited-book"); else if (f.type === "chapter") filt.push("type:book-chapter");
    if (f.from) filt.push(`from-pub-date:${f.from}`); if (f.to) filt.push(`until-pub-date:${f.to}`);
    const doi = ctx.cleanDoi(q), isbn = !doi && ctx.isbn13(q.replace(/^isbn[:\s]*/i, ""));
    if (isbn) filt.push(`isbn:${isbn}`);   // un ISBN: cartea (sau capitolele ei) cu acest ISBN
    const sel = "DOI,title,subtitle,author,editor,issued,type,container-title,publisher,is-referenced-by-count,ISBN,link,license,volume,issue,page,URL,abstract";   // „language” nu e permis în select (Crossref răspundea cu eroare)
    const mail = ctx.conf.email ? `&mailto=${encodeURIComponent(ctx.conf.email)}` : "";   // cu e-mail, Crossref răspunde din „polite pool”, mai repede
    const asName = !doi && ctx.looksLikeName(q);
    // căutarea obișnuită și cea după autor pornesc în același timp
    const [r, ra] = await Promise.all([
      ctx.json(doi ? `https://api.crossref.org/works/${doi}` : `https://api.crossref.org/works?${isbn ? "" : "query.bibliographic=" + encodeURIComponent(q) + "&"}rows=20&select=${sel}${filt.length ? "&filter=" + filt.join(",") : ""}${mail}`),
      asName ? ctx.json(`https://api.crossref.org/works?query.author=${encodeURIComponent(q)}&rows=40&select=${sel}${filt.length ? "&filter=" + filt.join(",") : ""}${mail}`).catch(() => null) : null,
    ]);
    const T = { "journal-article": "article-journal", book: "book", monograph: "book", "edited-book": "book", "reference-book": "book", "book-chapter": "chapter", "book-section": "chapter",
      "proceedings-article": "paper-conference", "posted-content": "article", dissertation: "thesis", "reference-entry": "entry-encyclopedia", report: "report" };
    let items = doi ? [r?.message] : r?.message?.items || [];
    if (ra) items = [...(ra.message?.items || []).filter(x => (x.author || x.editor || []).some(p => ctx.sameName([p.given, p.family].filter(Boolean).join(" "), q))), ...items];
    return items.filter(Boolean).map(x => {
      const lic = (x.license || []).some(l => /creativecommons\.org/.test(l.URL || ""));
      const t = ctx.stripTags((x.title || [])[0] || ""), st = ctx.stripTags((x.subtitle || [])[0] || "");
      return {
        title: st && !t.toLowerCase().includes(st.toLowerCase()) ? `${t}: ${st}` : t,
        year: x.issued?.["date-parts"]?.[0]?.[0] || null, type: T[x.type] || "document",
        authors: (x.author || x.editor || []).map(a => a.family ? { family: a.family, given: a.given } : a.name ? { literal: a.name } : null).filter(Boolean),
        venue: ctx.stripTags((x["container-title"] || [])[0] || ""), publisher: x.publisher || "",
        doi: ctx.cleanDoi(x.DOI), isbn: (x.ISBN || [])[0], cited: x["is-referenced-by-count"] ?? null, oa: lic,
        pdf: lic ? (x.link || []).filter(l => /pdf/i.test(l["content-type"] || "")).map(l => l.URL) : [],
        abstract: ctx.stripTags(String(x.abstract || "").replace(/<jats:title>[^<]*<\/jats:title>/, "")).slice(0, 900), lang: null,
        url: x.URL, volume: x.volume, issue: x.issue, page: x.page,
      };
    });
  },
};
