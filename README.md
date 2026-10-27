# Texere: The Researcher's Vault

*Texere: Vault-ul cercetătorului*

**An all-in-one Obsidian research vault: sources, reading notes, citations and export in one place.** It comes with a ready-made map of philosophy, but it works for research in any field or subject.

Texere is a ready-made [Obsidian](https://obsidian.md) vault for academic research. It brings your sources, PDFs, reading notes, ideas, drafts and the final paper into a single place, and it sets itself up on any laptop. It comes with a step-by-step guide in English and Romanian.

*Texere* (Latin, "to weave") is the root of the word *text*: a text is woven from ideas linked together.

> 🇷🇴 **În română:** Texere este un vault Obsidian gata pregătit pentru cercetare academică. Adună sursele, PDF-urile, notițele de lectură, ideile și lucrarea finală într-un singur loc și se configurează singur pe orice laptop. Ghidul complet în română este în nota `Texere/02. Texere – Vault-ul cercetătorului`. Configurarea și butonul Ajutor funcționează în română sau în engleză, la alegere. Primul pas: instalează [Obsidian](https://obsidian.md/download) (gratuit).

---

## The problem it solves

Research is usually a fractured experience. Each stage happens in a different app, and only your memory holds them together:

| Stage | Without Texere | With Texere |
| --- | --- | --- |
| Finding a source | Saved in Zotero, the browser or a downloads folder | Imported by DOI or ISBN; the note and the PDF appear in the vault |
| Reading | Underlined PDFs, notes on paper or in Word | Highlights land in the source's note, with the page and a link back to the PDF |
| Connecting ideas | You remember who said what, and where | Notes link to each other; every source on a concept is one click away |
| Finding a quote again | Searching PDFs, notebooks and folders | Search a word or a tag (e.g. `#disagree`) and get the passage with its page |
| Citing | Formatting every citation and the bibliography by hand | Write `[@citekey, p. 34]`; citations and bibliography are generated (APA by default) |
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

Then you work in four stages, each explained in the guide:

1. **Add a source**: by DOI/ISBN from Obsidian, or from the browser with Zotero Connector.
2. **Read and highlight**: each highlight color is a type of idea (claim, agreement, disagreement, question, definition…) and becomes a tagged passage in the source's note, linked to the exact page.
3. **Write and cite**: start from the *New article* template and cite with `[@citekey, p. 34]`.
4. **Build the bibliography and export** to Word or PDF.

Stuck? Click the **Help** button (the life buoy in the left sidebar) and type your question in your own words, in English or Romanian.

### Requirements

- [Obsidian](https://obsidian.md) (Mac or Windows; the Windows setup hasn't been fully tested yet)
- [Pandoc](https://pandoc.org/installing.html) for exporting to Word and PDF
- A LaTeX distribution for PDF only: [MacTeX](https://tug.org/mactex/) on Mac, [MiKTeX](https://miktex.org/download) on Windows

The setup checks for these and tells you what's missing.

## Why it matters

- **Your readings stop disappearing.** Every passage you highlight keeps its page and its source, so it can be found, cited and reused years later.
- **Ideas connect across sources.** Notes, concepts, theories and authors link to each other, so arguments emerge from what you've read instead of from memory.
- **Less time on formatting, more on thinking.** Citations, bibliography and layout are generated, so you don't redo them by hand for every paper.
- **Your work stays yours.** Everything is plain Markdown files on your own computer: no account, no subscription, no lock-in.
- **Bilingual by design.** Note names follow international terminology, and every concept has a Romanian alias (type `[[Etică` and you get the *Ethics* note), so papers in either language link to the same ideas.

## What's inside

| Folder | Contents |
| --- | --- |
| `Texere` | The guide in English and Romanian, export test notes and research-methodology notes |
| `References` | One note per source; the first 5 are examples you can delete after setup |
| `Documents` | The sources' PDFs |
| `Domains`, `Branch`, `Subdomains`, `Theories`, `Concepts`, `Movements`, `Historical Periods` | A map of philosophy, one short note per item, linked together |
| `Templates` | The *New article* and *New author* templates, plus the setup script |
| `Scripts` | The scripts behind the Help button and the guide's chapter folding |
| `biblib` | The bibliography and the citation style (APA) |
| `Export` | Exported files (examples included) |

The vault uses these community plugins: Templater, BibLib, Pandoc Plugin, PDF++, Omnisearch, Smart Connections, Style Settings, Callout Manager, Editing Toolbar, plus the small **Texere** plugin that starts the setup.

## Start here

Open the guide that matches your language:

- 🇬🇧 `Texere/01. Texere – The Researcher's Vault`
- 🇷🇴 `Texere/02. Texere – Vault-ul cercetătorului`

## License

- **Code** (the setup, the Help and folding scripts, the Texere plugin): [MIT](LICENSE)
- **Guides and notes** (the guides, the philosophy map, the templates): [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Share and adapt freely, with credit.
- The PDFs in `Documents` and the community plugins belong to their authors and keep their own licenses. Details in [LICENSE](LICENSE).

---

Created by [George Mihai](https://www.georgemihai.com) · [hi@georgemihai.com](mailto:hi@georgemihai.com)
