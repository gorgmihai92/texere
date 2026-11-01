// Căutare după identificator, prin serviciul Citoid al Wikipedia:
// DOI, ISBN (inclusiv multe cărți românești, din catalogul WorldCat), arXiv, link (URL), PubMed (PMID), PubMed Central (PMCID), Wikidata (Q…).
// Se folosește doar când ce ai scris e un identificator. https://www.mediawiki.org/wiki/Citoid
const ITEM = { journalArticle: "article-journal", book: "book", bookSection: "chapter", webpage: "webpage", blogPost: "post-weblog", conferencePaper: "paper-conference",
  thesis: "thesis", report: "report", newspaperArticle: "article-newspaper", magazineArticle: "article-magazine", encyclopediaArticle: "entry-encyclopedia",
  dictionaryEntry: "entry-dictionary", preprint: "article", manuscript: "manuscript", document: "document" };

// ce fel de identificator e textul (null = nu e unul)
function idOf(q, ctx) {
  const s = q.trim();
  const doi0 = ctx.cleanDoi(s); if (doi0 && /^\s*(doi:\s*|https?:\/\/(dx\.)?doi\.org\/)?10\./i.test(s)) return { kind: "DOI", id: doi0 };
  if (/^https?:\/\//i.test(s)) {
    if (/scholar\.google\./i.test(s)) return null;                                          // profilurile Google Scholar au catalogul lor
    const ax = /arxiv\.org\/(?:abs|pdf)\/([\w.\/-]+?)(?:v\d+)?(?:\.pdf)?$/i.exec(s); if (ax) return { kind: "arXiv", id: `https://arxiv.org/abs/${ax[1]}` };
    return { kind: "URL", id: s };
  }
  const ax = /^(?:arxiv:\s*)?(\d{4}\.\d{4,5}|[a-z\-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?$/i.exec(s); if (ax) return { kind: "arXiv", id: `https://arxiv.org/abs/${ax[1]}` };
  const doi = ctx.cleanDoi(s); if (doi && /^\s*(doi:\s*|https?:\/\/(dx\.)?doi\.org\/)?10\./i.test(s)) return { kind: "DOI", id: doi };
  if (/^pmc\d+$/i.test(s)) return { kind: "PMCID", id: s.toUpperCase() };
  const pm = /^(?:pmid:?\s*)?(\d{1,8})$/i.exec(s); if (pm && (/^pmid/i.test(s) || pm[1].length >= 5)) return { kind: "PMID", id: pm[1] };
  if (/^q\d+$/i.test(s)) return { kind: "Wikidata", id: s.toUpperCase() };
  const isbn = ctx.isbn13(s.replace(/^isbn[:\s]*/i, "")); if (isbn) return { kind: "ISBN", id: isbn };
  return null;
}

module.exports = {
  id: "citoid", name: "Identifier (Citoid)", order: 3, types: ["article", "book", "chapter"],
  desc: { en: "Lookup by identifier (Wikipedia's Citoid): DOI, ISBN, arXiv ID, link (URL), PubMed, PubMed Central, Wikidata (Q…). Used when you paste an identifier.",
    ro: "Căutare după identificator (Citoid, serviciul Wikipedia): DOI, ISBN, arXiv, link (URL), PubMed, PubMed Central, Wikidata (Q…). Se folosește când lipești un identificator." },
  idOf,
  async search(q, f, ctx) {
    const k = idOf(q, ctx); if (!k) return [];
    const r = await ctx.json(`https://en.wikipedia.org/api/rest_v1/data/citation/mediawiki/${encodeURIComponent(k.id)}`, { "Api-User-Agent": "Texere (Obsidian research vault)" });
    const list = Array.isArray(r) ? r : r ? [r] : [];
    const people = a => (a || []).map(p => Array.isArray(p) ? (p[1] ? { family: p[1], given: p[0] || undefined } : p[0] ? { literal: p[0] } : null)
      : p && (p.lastName || p.firstName) ? { family: p.lastName, given: p.firstName } : p?.name ? { literal: p.name } : null).filter(Boolean);
    const first = v => Array.isArray(v) ? v[0] : v;
    return list.filter(x => x && x.title).map(x => {
      const year = +String(x.date || "").match(/\d{4}/)?.[0] || null;
      const csl = {
        type: ITEM[x.itemType] || "document", title: x.title, author: people(x.author), editor: people(x.editor), translator: people(x.translator),
        "container-title": x.publicationTitle || x.bookTitle || x.websiteTitle || x.proceedingsTitle || x.encyclopediaTitle || undefined,
        publisher: x.publisher || x.university || x.institution || undefined, "publisher-place": x.place || undefined,
        issued: year ? { "date-parts": [[year]] } : undefined, volume: x.volume, issue: x.issue, page: x.pages, edition: x.edition,
        "collection-title": x.series, "number-of-pages": x.numPages, ISBN: first(x.ISBN), ISSN: first(x.ISSN), DOI: x.DOI, URL: x.url,
        language: x.language, abstract: x.abstractNote,
      };
      return {
        title: x.title, year, type: csl.type, authors: csl.author.length ? csl.author : csl.editor, venue: csl["container-title"] || "", publisher: csl.publisher || "",
        doi: ctx.cleanDoi(x.DOI), isbn: ctx.isbn13(first(x.ISBN)), url: x.url || null, lang: x.language || null, abstract: ctx.stripTags(x.abstractNote || "").slice(0, 900),
        cited: null, oa: false, pdf: [], idKind: k.kind, csl,
      };
    });
  },
  async full(x) { return x.csl; },
};
