// ORCID — profilul public al unui cercetător, cu lista lucrărilor lui (inclusiv în reviste fără DOI). https://info.orcid.org/documentation/
// Se folosește când cauți un nume („constantin vică”), un ORCID iD (0000-0002-…) sau lipești linkul orcid.org.
module.exports = {
  id: "orcid", name: "ORCID", order: 35, types: ["article", "book", "chapter"],
  desc: { en: "Researchers' public profiles: all the works an author has listed, including journals without a DOI. Used when you search a name or an ORCID iD.",
    ro: "Profilurile publice ale cercetătorilor: toate lucrările trecute de autor, inclusiv în reviste fără DOI. Se folosește când cauți un nume sau un ORCID iD." },
  async search(q, f, ctx) {
    const idm = /(\d{4}-\d{4}-\d{4}-\d{3}[\dX])/i.exec(q);
    let people = [];
    if (idm) people = [{ id: idm[1].toUpperCase() }];
    else if (ctx.looksLikeName(q)) {
      const r = await ctx.json(`https://pub.orcid.org/v3.0/expanded-search/?q=${encodeURIComponent(q)}&rows=10`);
      people = (r?.["expanded-result"] || []).filter(p => ctx.sameName(`${p["given-names"] || ""} ${p["family-names"] || ""}`, q))
        .slice(0, 2).map(p => ({ id: p["orcid-id"], given: p["given-names"], family: p["family-names"] }));
    }
    if (!people.length) return [];
    const T = { "journal-article": "article-journal", book: "book", "edited-book": "book", "book-chapter": "chapter", "conference-paper": "paper-conference",
      "dissertation-thesis": "thesis", dissertation: "thesis", "magazine-article": "article-magazine", "newspaper-article": "article-newspaper", report: "report", translation: "book" };
    const out = [];
    for (const p of people) {
      const r = await ctx.json(`https://pub.orcid.org/v3.0/${p.id}/works`);
      if (!p.family) { try { const n = await ctx.json(`https://pub.orcid.org/v3.0/${p.id}/personal-details`); p.given = n?.name?.["given-names"]?.value; p.family = n?.name?.["family-name"]?.value; } catch (e) {} }
      for (const g of r?.group || []) {
        const w = (g["work-summary"] || [])[0]; if (!w) continue;
        const ids = w["external-ids"]?.["external-id"] || [], ext = t => ids.find(x => x["external-id-type"] === t)?.["external-id-value"];
        const year = +w["publication-date"]?.year?.value || null;
        if ((f.from && year && year < +f.from) || (f.to && year && year > +f.to)) continue;
        out.push({
          title: w.title?.title?.value, year, type: T[w.type] || "document",
          authors: p.family ? [{ family: p.family, given: p.given }] : [],   // ORCID dă doar autorul profilului; restul vin din DOI, dacă există
          venue: w["journal-title"]?.value || "", doi: ctx.cleanDoi(ext("doi")), isbn: ext("isbn") || null,
          url: w.url?.value || (ext("doi") ? `https://doi.org/${ext("doi")}` : `https://orcid.org/${p.id}`), cited: null, oa: false, pdf: [],
        });
      }
    }
    return out;
  },
};
