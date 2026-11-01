// Semantic Scholar — caută bine după sens și găsește PDF-uri gratuite. https://api.semanticscholar.org · gratuit, fără cheie (limită comună).
module.exports = {
  id: "semanticscholar", name: "Semantic Scholar", order: 30, types: ["article", "book", "chapter"],
  desc: { en: "Good relevance ranking and links to free PDFs.", ro: "Ordonează bine rezultatele după relevanță și găsește PDF-uri gratuite." },
  async search(q, f, ctx) {
    const fields = "paperId,title,authors,year,venue,publicationTypes,citationCount,externalIds,openAccessPdf,isOpenAccess,journal,url";
    const doi = ctx.cleanDoi(q);
    let url;
    if (doi) url = `https://api.semanticscholar.org/graph/v1/paper/DOI:${doi}?fields=${fields}`;
    else {
      const ty = { article: "JournalArticle", book: "Book", chapter: "BookSection" }[f.type];
      const yr = f.from || f.to ? `&year=${f.from || ""}-${f.to || ""}` : "";
      url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(q)}&limit=20&fields=${fields}${yr}${ty ? "&publicationTypes=" + ty : ""}`;
    }
    const r = await ctx.json(url, ctx.conf.s2Key ? { "x-api-key": ctx.conf.s2Key } : undefined);
    return (doi ? [r] : r?.data || []).filter(Boolean).map(p => {
      const t = p.publicationTypes || [];
      return {
        title: p.title, year: p.year, type: t.includes("Book") ? "book" : t.includes("BookSection") ? "chapter" : t.includes("Conference") ? "paper-conference" : "article-journal",
        authors: (p.authors || []).map(a => ctx.splitName(a.name)).filter(Boolean),
        venue: p.journal?.name || p.venue || "", doi: ctx.cleanDoi(p.externalIds?.DOI), cited: p.citationCount ?? null,
        oa: !!p.isOpenAccess, pdf: p.openAccessPdf?.url ? [p.openAccessPdf.url] : [],
        url: p.url || (p.paperId ? `https://www.semanticscholar.org/paper/${p.paperId}` : null),
        volume: p.journal?.volume, page: p.journal?.pages?.trim(),
      };
    });
  },
};
