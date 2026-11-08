# Texere — The Researcher's Vault

> **This repository is the ready-made Obsidian vault**: download it, open it in Obsidian, and everything is set up. It is built on the [Texere plugin](https://github.com/gorgmihai92/texere-plugin), which you can also install in a vault you already have.

Research is usually scattered across many applications and places: Zotero, Mendeley or EndNote, Word or Google Docs, a laptop, the cloud, a phone, USB sticks and external drives. Moving between them costs time and loses things along the way.

Texere is a ready-made Obsidian vault for researchers who want one place for the whole process: finding references, reading PDFs, taking notes, writing, citing and exporting. This version comes with a map of philosophy, but you can reshape it for any discipline.

## Who it's for

- **Anyone, without technical knowledge.** Download the vault, open it in Obsidian, and a short setup does the rest. No code, no command line, no LaTeX.
- **English and Romanian writers.** The interface, the setup, Help and the guide work in both languages. Notes have English names and Romanian aliases: type `[[Etică` and you get **Ethics**.
- **University of Bucharest students.** Export templates for BA and MA theses at the Faculty of Philosophy, following the faculty's writing guide.

## Why

| Stage                  | Without Texere                       | With Texere                                                                            |
| ---------------------- | ------------------------------------ | -------------------------------------------------------------------------------------- |
| Finding a reference       | Zotero, the browser, Downloads       | Search by title, DOI or ISBN, or import from Zotero. The note and the PDF come with it |
| Reading                | Underlined PDFs, notes in Word       | Annotations go into the reading note, with tag, page and a link back                   |
| Citing                 | By hand, or through a Zotero plugin  | Type `@` and pick the reference                                                           |
| Submitting             | Copy into Word, redo the layout      | Export to PDF or Word                                                                  |
| **Places you work in** | **6**                                | **1**                                                                                  |

## Start

1. Install [Obsidian](https://obsidian.md/download). It's free.
2. [Download this repository](https://github.com/gorgmihai92/texere/archive/refs/heads/main.zip) and unzip it.
3. In Obsidian: **Open folder as vault**, then **Trust author and enable plugins**.
4. The setup starts by itself: choose the language, and add what's missing with one click.

Then open a new tab. You'll see your last files, **Add a reference**, **Export**, **Help**, and anything that needs fixing.

## What you get

- **References.** Search catalogs by title, author, DOI or ISBN, or import your Zotero library with its PDFs and annotations. The free PDF comes with the reference when there is one. The Zotero browser button works with Zotero open or closed.
- **Reading.** Each annotation color is a kind of idea: claim, fact, agree, disagree, question, definition. Annotations go into the reading note with the page and a link back to the PDF. Annotations made in Zotero, Preview or Acrobat come in too.
- **Citations.** Type `@` and pick the reference. Citations show in your style: APA, Chicago, MLA or any of 10,000+ styles.
- **Export.** PDF, Word or Markdown, with bibliography, contents and page numbers, using a general template or the University of Bucharest thesis templates.
- **Reference stats.** How others cite each reference (scite, OpenAlex, Semantic Scholar) and what you highlighted.
- **Insights** (Lab). How much you write, paste and delete; a writing companion for drafts; unlinked mentions; patterns in your reading and writing.
- **Help.** Frequent questions and the whole guide, in Romanian or English, inside Texere.
- **Updates.** When there's a new version, the home page shows it with an **Update** button; nothing installs without your click, and **What's new** tells you what changed. Your notes are never touched.

Everything is plain Markdown on your computer. No account, no subscription.

## Inside

One plugin, **Texere** (version 0.4.0), with modules you turn on or off in **Settings → Texere**:

- **References**: references, Zotero, citations, annotations and the bibliography.
- **Export**: documents with citations and bibliography from References.
- **Insights** (Lab): experimental, and getting better with each version.
- **Edit mode**: try versions of a word or sentence, dim a passage, move text to Cuts.

Texere uses one other plugin, PDF++, for annotations. The vault also has Style Settings, Omnisearch, Excalidraw and Editing Toolbar. You don't need Zotero, Word, Pandoc or LaTeX.

| Folder          | What's in it                                                                                                          |
| --------------- | --------------------------------------------------------------------------------------------------------------------- |
| `1. References` | one note per reference in `Reading Notes` and their PDFs in `PDFs` (the four notes are examples)                      |
| `2. Notes`      | your notes, and `Disciplines/Philosophy`: a map of philosophy with about 430 linked notes                             |
| `3. Workspace`  | your work: Courses, Thesis, Articles, Projects                                                                        |
| `4. Export`     | exported files                                                                                                        |
| `Support`       | images, templates, and `Texere`: the writing guides (with their references), the bibliography and the citation styles |

The example notes come from three books (Blackburn, Craig, Dummett) whose PDFs are under copyright and aren't included: if you have them, put them in `1. References/PDFs` with the names in each note's **attachment**, and the annotations link to their pages.

Texere comes with this structure so you can start right away. You can change it: move or rename folders in Obsidian and Texere follows.

Need a map for another discipline? Write to [hi@georgemihai.com](mailto:hi@georgemihai.com).

## Guides

The guide to Texere is inside Texere: click **Help** (🇬🇧) or **Ajutor** (🇷🇴). The writing guides are in `Support/Texere/Guides`.

## Requirements

Obsidian 1.4.10 or later, on a computer (Mac, Windows or Linux).

## License

- **Code** (the Texere plugin): [MIT](LICENSE). It bundles [citeproc-js](https://github.com/Juris-M/citeproc-js) (CPAL/AGPL) and the [CSL styles and locales](https://citationstyles.org) (CC BY-SA 3.0), docx, markdown-it and Paged.js (MIT).
- **Guides and notes** (the guides, the philosophy map, the templates): [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- The PDF in `1. References/PDFs` and the community plugins keep their own licenses. Details in [LICENSE](LICENSE).

The plugin's code and releases: [gorgmihai92/texere-plugin](https://github.com/gorgmihai92/texere-plugin).

---

Created by [George Mihai](https://www.georgemihai.com/?utm_source=texere&utm_medium=github_vault&utm_campaign=texere) · [hi@georgemihai.com](mailto:hi@georgemihai.com)
