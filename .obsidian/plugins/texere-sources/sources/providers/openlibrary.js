// Open Library (Internet Archive) — cărți după titlu, autor sau ISBN, unde celelalte cataloage sunt slabe. https://openlibrary.org/developers/api
module.exports = {
  id: "openlibrary", name: "Open Library", order: 40, types: ["book"],
  desc: { en: "Books by title, author or ISBN, where the other catalogs are weak.", ro: "Cărți după titlu, autor sau ISBN, unde celelalte cataloage sunt slabe." },
  async search(q, f, ctx) {
    if (f.type !== "all" && f.type !== "book") return [];
    const isbn = ctx.isbn13(q.replace(/^isbn[:\s]*/i, ""));
    let query = isbn ? `isbn:${isbn}` : q;
    if (f.from || f.to) query += ` first_publish_year:[${f.from || "*"} TO ${f.to || "*"}]`;
    const fields = "key,title,subtitle,author_name,first_publish_year,publisher,publish_place,isbn,language,number_of_pages_median,edition_count";
    const r = await ctx.json(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=20&fields=${fields}`);
    return (r?.docs || []).map(d => {
      const isbns = (d.isbn || []).map(ctx.isbn13).filter(Boolean);
      return {
        title: d.subtitle ? `${d.title}: ${d.subtitle}` : d.title, year: d.first_publish_year || null, type: "book",
        authors: (d.author_name || []).map(ctx.splitName).filter(Boolean), publisher: (d.publisher || [])[0] || "", place: (d.publish_place || [])[0] || "",
        isbn: (isbn && isbns.includes(isbn) ? isbn : isbns.find(i => i.startsWith("978")) || isbns[0]) || null,
        pages: d.number_of_pages_median || null, url: d.key ? `https://openlibrary.org${d.key}` : null, cited: null, oa: false, pdf: [],
      };
    });
  },
  // datele pentru notă (cărțile fără DOI)
  async full(x) {
    return { type: "book", title: x.title, author: x.authors, publisher: x.publisher, "publisher-place": x.place, ISBN: x.isbn, URL: x.url,
      "number-of-pages": x.pages ? String(x.pages) : undefined, issued: x.year ? { "date-parts": [[x.year]] } : undefined };
  },
};
