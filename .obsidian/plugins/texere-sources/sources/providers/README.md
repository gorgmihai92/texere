# Texere · Sources: catalogs

Each `.js` file in this folder is one catalog searched by **Search sources**. To add a catalog, add a file; nothing else changes.

```js
module.exports = {
  id: "mycatalog",            // unique, used in settings
  name: "My catalog",         // shown in the search bar
  order: 50,                  // position in the list
  types: ["article", "book", "chapter"],   // what it can find
  desc: { en: "…", ro: "…" }, // shown in Settings → Texere
  async search(query, filters, ctx) {      // filters: { type, from, to }
    const data = await ctx.json("https://…?q=" + encodeURIComponent(query));
    return data.items.map(x => ({
      title, authors: [{ family, given }], year, type /* CSL type */, venue, publisher,
      doi, isbn, cited, oa /* open access */, pdf: [/* direct PDF URLs */], url,
    }));
  },
  async full(item, ctx) { return { /* CSL-JSON */ }; },   // optional, for items without a DOI
};
```

`ctx` gives `json(url)` (throws with `.limit` on 429/403), `cleanDoi`, `isbn13`, `splitName`, `stripTags`, `normTitle` and `conf` (the settings).
Items with a DOI get their full record from doi.org automatically; results from several catalogs are merged by DOI, ISBN or title.
