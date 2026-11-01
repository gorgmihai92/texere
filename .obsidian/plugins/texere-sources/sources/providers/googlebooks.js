// Google Books — cărți după titlu, autor sau ISBN, inclusiv multe cărți românești și traduceri. https://developers.google.com/books
// Gratuit, fără cheie (limită zilnică comună).
module.exports = {
  id: "googlebooks", name: "Google Books", order: 45, types: ["book"],
  desc: { en: "Books by title, author or ISBN, including many Romanian books and translations.", ro: "Cărți după titlu, autor sau ISBN, inclusiv multe cărți românești și traduceri." },
  async search(q, f, ctx) {
    if (f.type !== "all" && f.type !== "book") return [];
    const isbn = ctx.isbn13(q.replace(/^isbn[:\s]*/i, ""));
    const r = await ctx.json(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(isbn ? "isbn:" + isbn : q)}&maxResults=20&printType=books`);
    return (r?.items || []).map(v => {
      const i = v.volumeInfo || {}, ids = i.industryIdentifiers || [];
      const i13 = ids.find(x => x.type === "ISBN_13")?.identifier || ctx.isbn13(ids.find(x => x.type === "ISBN_10")?.identifier);
      const year = +String(i.publishedDate || "").slice(0, 4) || null;
      if ((f.from && year && year < +f.from) || (f.to && year && year > +f.to)) return null;
      const pdf = v.accessInfo?.pdf?.isAvailable && v.accessInfo?.pdf?.downloadLink ? [v.accessInfo.pdf.downloadLink] : [];
      return {
        title: i.subtitle ? `${i.title}: ${i.subtitle}` : i.title, year, type: "book",
        authors: (i.authors || []).map(ctx.splitName).filter(Boolean), publisher: i.publisher || "", isbn: i13 || null,
        pages: i.pageCount || null, lang: i.language || null, abstract: ctx.stripTags(i.description || "").slice(0, 900),
        url: i.infoLink || i.canonicalVolumeLink || null, cited: null, oa: v.accessInfo?.accessViewStatus === "FULL_PUBLIC_DOMAIN", pdf,
      };
    }).filter(Boolean);
  },
  async full(x) {
    return { type: "book", title: x.title, author: x.authors, publisher: x.publisher, ISBN: x.isbn, URL: x.url, language: x.lang,
      "number-of-pages": x.pages ? String(x.pages) : undefined, issued: x.year ? { "date-parts": [[x.year]] } : undefined, abstract: x.abstract };
  },
};
