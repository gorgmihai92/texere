# Texere: The Researcher's Vault

*Texere: Vault-ul cercetătorului*

**An all-in-one Obsidian research vault: sources, reading notes, citations and export in one place.** It comes with a ready-made map of philosophy, but it works for research in any field or subject.

Texere is a ready-made [Obsidian](https://obsidian.md) vault for academic research. It brings your sources, PDFs, reading notes, ideas, drafts and the final paper into a single place, and it sets itself up on any laptop. It comes with a step-by-step guide in English and Romanian.

*Texere* (Latin, "to weave") is the root of the word *text*: a text is woven from ideas linked together.

> 🇷🇴 **În română:** Texere este un vault Obsidian gata pregătit pentru cercetare academică. Adună sursele, PDF-urile, notițele de lectură, ideile și lucrarea finală într-un singur loc și se configurează singur pe orice laptop. Ghidul complet în română este în nota `Support/Guides/02. Texere – Vault-ul cercetătorului`; pagina de start este `Home`. Configurarea și butonul Ajutor funcționează în română sau în engleză, la alegere. Primul pas: instalează [Obsidian](https://obsidian.md/download) (gratuit).

---

## The problem it solves

Research is usually a fractured experience. Each stage happens in a different app, and only your memory holds them together:

| Stage | Without Texere | With Texere |
| --- | --- | --- |
| Finding a source | Saved in Zotero, the browser or a downloads folder | Imported by DOI or ISBN; the note and the PDF appear in the vault |
| Reading | Underlined PDFs, notes on paper or in Word | Highlights land in the source's note, tagged by color, with the citation and a link back to the exact place in the PDF |
| Connecting ideas | You remember who said what, and where | Notes link to each other; every source on a concept is one click away |
| Finding a quote again | Searching PDFs, notebooks and folders | Search a word or a tag (e.g. `#disagree`) and get the passage with its page |
| Citing | Formatting every citation and the bibliography by hand | Type `@` and pick the source; citations show in your style (APA, Chicago, MLA…) and the bibliography is generated |
| Judging a source | Looking it up on several sites | Each source shows how many papers support, contrast or cite it, year by year |
| Submitting | Pasting into Word and redoing the layout | Export straight to Word or PDF |
| **Places you work in** | **6** | **1** |

## Who it is for

- **Students** (BA, MA, PhD) who write papers, theses or dissertations and want their readings to stay useful from the first seminar to the final thesis.
- **Researchers and teachers** who want one place for sources, notes and drafts, with citations that just work.
- **People who are not technical.** The vault configures itself; you only answer two questions. A built-in **Help** button answers questions in plain language.

The examples come from philosophy (the vault includes a map of the field with ~300 linked notes), but the workflow fits any discipline in the humanities and social sciences. Need a map for another field (e.g. sociology, history, law)? Write to [hi@georgemihai.com](mailto:hi@georgemihai.com).

## How it works

1. **Install Obsidian** (free) from [obsidian.md/download](https://obsidian.md/download).
2. **[Download](https://github.com/gorgmihai92/texere/archive/refs/heads/main.zip)** this repository (**Code → Download ZIP**) and unzip it.
3. In Obsidian, choose **Open folder as vault** and select the folder.
4. Choose **Trust author and enable plugins**.
5. **The setup starts by itself.** A window shows each step as it happens and tells you when it's your turn: you only choose the language (English or Romanian) and where exported files are saved. At the end you get a report with what was done and where to start.
6. **Reopen Obsidian**

Then you work in four stages, each explained in the guide:

1. **Add a source**: by DOI/ISBN from Obsidian, or from the browser with Zotero Connector.
2. **Read and highlight**: each highlight color is a type of idea (claim, fact, agreement, disagreement, question, definition…) and becomes a tagged passage in the source's note, ending with its citation and a link to the exact place in the PDF. Deleting or recoloring a highlight in the PDF updates the note, and the other way round.
3. **Write and cite**: start from the *New article* template, type `@` and pick the source. Citations appear already formatted, e.g. *(Craig, 2002, p. 34)*.
4. **Build the bibliography and export** to Word or PDF, in the same style.

Stuck? Click the **Help** button (the life buoy in the left sidebar) and type your question in your own words, in English or Romanian.

### Requirements

- [Obsidian](https://obsidian.md) (Mac or Windows; the Windows setup hasn't been fully tested yet)
- [Pandoc](https://pandoc.org/installing.html) for exporting to Word and PDF
- A LaTeX distribution for PDF only: [MacTeX](https://tug.org/mactex/) on Mac, [MiKTeX](https://miktex.org/download) on Windows

The setup checks for these and tells you what's missing.

### Citation styles

The text of a citation stays `[@citekey, p. 34]`; only its display changes. Click the style at the bottom right of the window (e.g. **APA**) to switch a note to Chicago, MLA, Harvard, IEEE or any of the 10,000+ styles of the [Zotero Style Repository](https://www.zotero.org/styles) (**Add a style…** searches and installs them). The note and the export change together, so you can export in APA and, a minute later, in Chicago.

### Source stats

At the top of every source's note, a small panel shows how the source is received: citations that **support**, **contrast** or **mention** it ([scite](https://scite.ai)), times cited, FWCI and percentile ([OpenAlex](https://openalex.org)), influential citations ([Semantic Scholar](https://www.semanticscholar.org)), open access, the number of citations in each year, and, from your own vault, your highlights by type and the notes that cite it. It refreshes by itself once a day.

## Why it matters

- **Your readings stop disappearing.** Every passage you highlight keeps its page and its source, so it can be found, cited and reused years later.
- **Ideas connect across sources.** Notes, concepts, theories and authors link to each other, so arguments emerge from what you've read instead of from memory.
- **Less time on formatting, more on thinking.** Citations, bibliography and layout are generated, so you don't redo them by hand for every paper.
- **Your work stays yours.** Everything is plain Markdown files on your own computer: no account, no subscription, no lock-in.
- **Bilingual by design.** Note names follow international terminology, and every concept has a Romanian alias (type `[[Etică` and you get the *Ethics* note), so papers in either language link to the same ideas.

## What's inside

| Folder | Contents |
| --- | --- |
| `Home` | The start page: the guides, the four stages and quick actions |
| `01. Sources/Literature Notes` | One note per source; the 5 included are examples you can delete after setup |
| `01. Sources/Documents` | The sources' PDFs |
| `02. Notes` | Your own notes (Essays, Personal, Poetry); empty |
| `03. Workspace` | Your work: Courses, Dissertation, Articles, Projects; empty |
| `04. Export` | Exported Word and PDF files |
| `Fields/Philosophy` | A map of philosophy (branches, subdomains, theories, concepts, movements, periods), one short linked note per item |
| `Support/Guides` | The guide in English and Romanian, the export test and research-methodology notes |
| `Support/Templates` | The *New article* and *New author* templates, plus the setup script |
| `Support/Admin` | The bibliography, the citation styles and the scripts behind the Help button |
| `Support/Media` | Images used in notes |

The vault uses these community plugins: Templater, BibLib, Pandoc Plugin, PDF++, Omnisearch, Smart Connections, Style Settings, Callout Manager, Editing Toolbar, Excalidraw, Importer, plus the **Texere** plugin: it starts the setup, keeps PDF highlights and notes in sync, formats citations in the chosen style and shows the source stats.

## Start here

Open the guide that matches your language:

- 🇬🇧 `Support/Guides/01. Texere – The Researcher's Vault`
- 🇷🇴 `Support/Guides/02. Texere – Vault-ul cercetătorului`

Or open `Home`, the start page.

## License

- **Code** (the setup, the Help and folding scripts, the Texere plugin): [MIT](LICENSE). The Texere plugin bundles [citeproc-js](https://github.com/Juris-M/citeproc-js) (CPAL/AGPL) and the [CSL styles and locales](https://citationstyles.org) (CC BY-SA 3.0).
- **Guides and notes** (the guides, the philosophy map, the templates): [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Share and adapt freely, with credit.
- The PDFs in `01. Sources/Documents` and the community plugins belong to their authors and keep their own licenses. Details in [LICENSE](LICENSE).

---

Created by [George Mihai](https://www.georgemihai.com) · [hi@georgemihai.com](mailto:hi@georgemihai.com)
