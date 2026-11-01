// OpenAlex — peste 250 de milioane de lucrări (articole, cărți, capitole), cu citări și linkuri spre PDF-uri gratuite.
// https://docs.openalex.org · fără cheie: puține căutări pe zi; cu o cheie gratuită (Settings → Texere): 100.000 de credite pe zi.
module.exports = {
  id: "openalex", name: "OpenAlex", order: 10, types: ["article", "book", "chapter"],
  desc: { en: "250M+ articles, books and chapters, with citation counts and free PDFs.", ro: "Peste 250 de milioane de articole, cărți și capitole, cu numărul de citări și PDF-uri gratuite." },
  async search(q, f, ctx) {
    const filt = [];
    if (f.type === "article") filt.push("type:article|review|preprint"); else if (f.type === "book") filt.push("type:book"); else if (f.type === "chapter") filt.push("type:book-chapter");
    if (f.from && f.to) filt.push(`publication_year:${f.from}-${f.to}`); else if (f.from) filt.push(`publication_year:>${+f.from - 1}`); else if (f.to) filt.push(`publication_year:<${+f.to + 1}`);
    const doi = ctx.cleanDoi(q);
    const key = ctx.conf.openalexKey ? `&api_key=${encodeURIComponent(ctx.conf.openalexKey)}` : "";
    const sel = "id,doi,display_name,publication_year,type,authorships,primary_location,cited_by_count,open_access,best_oa_location,biblio,fwci,citation_normalized_percentile,is_retracted,abstract_inverted_index,language";
    const url = doi ? `https://api.openalex.org/works/doi:${doi}?select=${sel}${key}`
      : `https://api.openalex.org/works?search=${encodeURIComponent(q)}&per-page=20${filt.length ? "&filter=" + filt.join(",") : ""}&select=${sel}${key}`;
    const r = await ctx.json(url);
    // un nume de autor (ex. „constantin vică”): adaugă toate lucrările profilurilor OpenAlex cu acest nume, cele mai citate întâi
    let byAuthor = [], card = null;
    if (!doi && ctx.looksLikeName(q)) {
      try {
        const a = await ctx.json(`https://api.openalex.org/authors?search=${encodeURIComponent(q)}&per-page=10&select=id,display_name,display_name_alternatives,works_count,cited_by_count,summary_stats,last_known_institutions,orcid${key}`);
        const found = (a?.results || []).filter(x => [x.display_name, ...(x.display_name_alternatives || [])].some(n => ctx.sameName(n, q))).slice(0, 4);
        const ids = found.map(x => String(x.id).split("/").pop());
        // fișa autorului: profilurile cu același nume adunate (OpenAlex desparte uneori același autor în mai multe profiluri)
        if (found.length) card = { name: found[0].display_name, works: found.reduce((n, x) => n + (x.works_count || 0), 0), cited: found.reduce((n, x) => n + (x.cited_by_count || 0), 0),
          h: Math.max(...found.map(x => x.summary_stats?.h_index || 0)), inst: found.map(x => x.last_known_institutions?.[0]?.display_name).find(Boolean) || "",
          orcid: found.map(x => x.orcid).find(Boolean) || "", url: String(found[0].id), profiles: found.length };
        if (ids.length) {
          const w = await ctx.json(`https://api.openalex.org/works?filter=author.id:${ids.join("|")}${filt.length ? "," + filt.join(",") : ""}&per-page=100&sort=cited_by_count:desc&select=${sel}${key}`);
          byAuthor = w?.results || [];
        }
      } catch (e) {}
    }
    const T = { article: "article-journal", review: "article-journal", preprint: "article", book: "book", "book-chapter": "chapter", dissertation: "thesis", "reference-entry": "entry-encyclopedia", report: "report" };
    const abs = ix => { if (!ix) return ""; const w = []; for (const [k, ps] of Object.entries(ix)) for (const p of ps) w[p] = k; return w.filter(Boolean).join(" ").slice(0, 900); };
    const out = [...byAuthor, ...(doi ? [r] : r?.results || [])].filter(Boolean).map(w => {
      const b = w.biblio || {};
      return {
        title: w.display_name, year: w.publication_year, type: T[w.type] || "document",
        authors: (w.authorships || []).map(a => ctx.splitName(a.author?.display_name || a.raw_author_name)).filter(Boolean),
        venue: w.primary_location?.source?.display_name || "", publisher: w.primary_location?.source?.host_organization_name || "",
        doi: ctx.cleanDoi(w.doi), cited: w.cited_by_count ?? null, oa: !!w.open_access?.is_oa,
        fwci: typeof w.fwci === "number" ? w.fwci : null, top1: !!w.citation_normalized_percentile?.is_in_top_1_percent, top10: !!w.citation_normalized_percentile?.is_in_top_10_percent, retracted: !!w.is_retracted,
        pdf: [w.best_oa_location?.pdf_url, w.primary_location?.pdf_url].filter(Boolean),
        abstract: abs(w.abstract_inverted_index), lang: w.language || null,
        url: w.id, volume: b.volume, issue: b.issue, page: b.first_page ? b.first_page + (b.last_page && b.last_page !== b.first_page ? "-" + b.last_page : "") : null,
      };
    });
    out.card = card;   // fișa autorului, dacă ai căutat un nume
    return out;
  },
};
