// Google Scholar — prin SerpApi (serpapi.com), pentru că Google Scholar nu are o interfață publică pentru programe.
// Apare doar dacă ai pus o cheie SerpApi în Settings → Texere. Poți lipi și linkul profilului unui autor (scholar.google…/citations?user=…).
module.exports = {
  id: "googlescholar", name: "Google Scholar", order: 5, types: ["article", "book", "chapter"], requires: "serpapiKey",
  desc: { en: "Through SerpApi (needs a SerpApi key, below). Searches Google Scholar and lists every article on an author's profile when you paste its link.",
    ro: "Prin SerpApi (are nevoie de o cheie SerpApi, mai jos). Caută în Google Scholar și listează toate articolele din profilul unui autor când îi lipești linkul." },
  async search(q, f, ctx) {
    const key = encodeURIComponent(ctx.conf.serpapiKey);
    const yr = (f.from ? `&as_ylo=${f.from}` : "") + (f.to ? `&as_yhi=${f.to}` : "");
    const prof = /scholar\.google\.[a-z.]+\/citations\?\S*?user=([\w-]+)/i.exec(q);
    // „C Vică, C Voinea - Információs Társadalom, 2021 - real.mtak.hu” → autori, revistă, an
    const parse = s => { const [a = "", mid = ""] = String(s || "").split(" - "); const ym = /(\d{4})\s*$/.exec(mid);
      return { authors: a.split(",").map(x => x.replace(/…/g, "").trim()).filter(Boolean).map(ctx.splitName), venue: mid.replace(/,?\s*\d{4}\s*$/, "").trim(), year: ym ? +ym[1] : null }; };
    if (prof) {
      const out = [];
      for (let start = 0; start < 300; start += 100) {
        const r = await ctx.json(`https://serpapi.com/search.json?engine=google_scholar_author&author_id=${prof[1]}&num=100&start=${start}&api_key=${key}`);
        const arts = r?.articles || [];
        for (const a of arts) {
          const year = +a.year || null;
          if ((f.from && year && year < +f.from) || (f.to && year && year > +f.to)) continue;
          out.push({ title: a.title, year, type: "article-journal", authors: String(a.authors || "").split(",").map(x => x.replace(/…/g, "").trim()).filter(Boolean).map(ctx.splitName),
            venue: String(a.publication || "").replace(/,?\s*\d{4}\s*$/, "").replace(/\s*\d+\s*\(.*$/, "").trim(), cited: a.cited_by?.value ?? null, url: a.link, oa: false, pdf: [] });
        }
        if (arts.length < 100) break;
      }
      return out;
    }
    const r = await ctx.json(`https://serpapi.com/search.json?engine=google_scholar&q=${encodeURIComponent(q)}&num=20${yr}&api_key=${key}`);
    return (r?.organic_results || []).map(o => {
      const p = parse(o.publication_info?.summary);
      const pdf = (o.resources || []).filter(x => /pdf/i.test(x.file_format || "")).map(x => x.link);
      if (o.publication_info?.authors?.length) p.authors = o.publication_info.authors.map(a => ctx.splitName(a.name)).filter(Boolean);
      return { title: o.title, year: p.year, type: /books\.google/.test(o.link || "") ? "book" : "article-journal", authors: p.authors, venue: p.venue,
        cited: o.inline_links?.cited_by?.total ?? null, url: o.link, oa: pdf.length > 0, pdf };
    });
  },
};
