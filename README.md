# Texere: The Researcher's Vault

*Texere: Vault-ul cercetătorului*

An Obsidian vault for research. Sources, PDFs, reading notes, citations and export, in one place. It comes with a map of philosophy, but it works for any field.

*Texere* is Latin for "to weave". The word *text* comes from it: a text is woven from ideas.

> 🇷🇴 **În română:** un vault Obsidian pentru cercetare. Surse, PDF-uri, notițe de lectură, citări și export, într-un singur loc. Se configurează singur. Ghidul în română: `Support/About/Texere – Vault-ul cercetătorului`. Primul pas: instalează [Obsidian](https://obsidian.md/download).

## Why

Research is scattered. Sources in Zotero, PDFs in folders, notes in Word, the bibliography by hand, the layout redone before you submit. Texere keeps all of it in one vault.

| Stage | Without Texere | With Texere |
| --- | --- | --- |
| Finding a source | Zotero, the browser, Downloads | Search by title, DOI or ISBN, or import from Zotero. The note and the PDF come with it |
| Reading | Underlined PDFs, notes in Word | Highlights go into the source's note, with tag, page and a link back |
| Citing | By hand | Type `@` and pick the source |
| Submitting | Copy into Word, redo the layout | Export to PDF or Word |
| **Places you work in** | **6** | **1** |

## Start

1. Install [Obsidian](https://obsidian.md/download). It's free.
2. [Download this repository](https://github.com/gorgmihai92/texere/archive/refs/heads/main.zip) and unzip it.
3. In Obsidian: **Open folder as vault**, then **Trust author and enable plugins**.
4. The setup starts by itself. Choose the language and the export folder. If something is missing, one click installs it.

Then open a new tab. You'll see your last files, **Add a source**, **Export**, **Help**, and anything that needs fixing.

## What you get

- **Sources.** Search catalogs by title, author, DOI or ISBN, or import your Zotero library with its PDFs and highlights. The free PDF comes with the source when there is one. The Zotero browser button works with Zotero open or closed.
- **Reading.** Each highlight color is a kind of idea: claim, fact, agree, disagree, question, definition. Highlights go into the source's note with the page and a link back to the PDF. Highlights made in Zotero, Preview or Acrobat come in too.
- **Citations.** Type `@` and pick the source. Citations show in your style: APA, Chicago, MLA or any of 10,000+ styles.
- **Export.** PDF, Word, LaTeX, HTML or Markdown, with bibliography, contents and page numbers. Thesis templates for the Faculty of Philosophy, University of Bucharest, are included.
- **Source stats.** How others cite each source (scite, OpenAlex, Semantic Scholar) and what you highlighted.
- **Help.** A button that answers questions in English or Romanian.

Everything is plain Markdown on your computer. No account, no subscription.

## Inside

Four plugins made for Texere:

- **Texere · The Researcher's Vault**: the setup, the checks, the new-tab dashboard and the Help button.
- **Texere · Sources**: sources, Zotero, citations, highlights and the bibliography.
- **Texere · Export**: export, with citations and bibliography from Sources.
- **Texere · Insights**: how much you write, paste and delete; unlinked mentions and aliases; patterns in your reading and writing.

They use PDF++ (highlights) and Templater (setup and Help). The vault also has Style Settings, Omnisearch, Excalidraw and Editing Toolbar. You don't need Zotero, Word, Pandoc or LaTeX.

| Folder | What's in it |
| --- | --- |
| `01. Sources` | PDFs in `Documents`, one note per source in `Literature Notes` (the ones included are examples) |
| `02. Notes` | your notes: Essays, Personal, Poetry (empty) |
| `03. Workspace` | your work: Courses, Thesis, Articles, Projects (empty) |
| `04. Export` | exported files |

The folders are a suggestion: Texere creates them the first time it starts, and you can change them as you like.
| `Fields/Philosophy` | a map of philosophy, about 300 linked notes |
| `Support` | guides, templates, images, scripts, the bibliography and the citation styles |

Need a map for another field? Write to [hi@georgemihai.com](mailto:hi@georgemihai.com).

## Guides

- 🇬🇧 `Support/About/Texere – The Researcher's Vault`
- 🇷🇴 `Support/About/Texere – Vault-ul cercetătorului`

## Requirements

Obsidian, on Mac or Windows. Windows isn't fully tested yet.

## License

- **Code** (the scripts, the setup and the four Texere plugins): [MIT](LICENSE). Texere · Sources bundles [citeproc-js](https://github.com/Juris-M/citeproc-js) (CPAL/AGPL) and the [CSL styles and locales](https://citationstyles.org) (CC BY-SA 3.0). Texere · Export bundles docx, markdown-it and Paged.js (MIT).
- **Guides and notes** (the guides, the philosophy map, the templates): [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- The PDFs in `01. Sources/Documents` and the community plugins keep their own licenses. Details in [LICENSE](LICENSE).

---

Created by [George Mihai](https://www.georgemihai.com) · [hi@georgemihai.com](mailto:hi@georgemihai.com)
