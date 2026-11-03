---
title: Texere
subtitle: The Researcher's Vault
author: George Mihai
lang: en
version: "3.2.0"
date: "Version 3.2.0 · 3 November 2026"
---
*Ghidul este disponibil și în limba română: [[Texere – Vault-ul cercetătorului|Texere: Vault-ul cercetătorului]].*

Research is scattered. Sources in Zotero, PDFs in folders, notes on paper or in Word, drafts on two laptops. Texere puts everything in one Obsidian vault: sources, PDFs, reading notes, ideas, drafts and the final paper. The examples are from philosophy, but it works for any field.

![[Without and with Obsidian.png]]

| Stage | Without Texere | With Texere |
| --- | --- | --- |
| Finding a source | Zotero, the browser, Downloads | Search by title, DOI or ISBN, or bring it from Zotero. The note and the PDF come with it |
| Reading | Underlined PDFs, notes in Word | Highlights go into the source's note, with tag, page and a link back |
| Connecting ideas | You remember who said what | Notes link to each other |
| Finding a quote | You search everywhere | Search a word or a tag (`#disagree`) |
| Citing | By hand | Type `@` and pick the source |
| Submitting | Copy into Word, redo the layout | Export to PDF or Word |
| **Places you work in** | **6** | **1** |

**Step 1. Set up the vault (once)**

1. Install [Obsidian](https://obsidian.md/download). It's free.
2. Copy the vault folder to your laptop. In Obsidian: **Open folder as vault**.
3. Choose **Trust author and enable plugins**.
4. The setup starts by itself. You choose the language and the folder for exported files. If something is missing (PDF++, for example), one click installs it.
5. Open **Texere – Setup report** (next to this guide) and start with **Start here**.

> [!warning] Didn't trust the author?
> Obsidian opens the vault in **Restricted mode**. You can read the notes, but nothing else works. Turn the plugins on from **Settings → Community plugins**.

**Step 2. Work**

1. **Add a source** → [[#3. Managing references]]
2. **Read and highlight** → [[#4. Reading and literature notes]]
3. **Write and cite** → [[#5. Writing academic papers]]
4. **Export** → [[#6. Bibliography and export]]

A new tab shows your last files, the main actions and anything that needs fixing. Stuck? Click **Help** (the life buoy on the left) and ask in your own words. Something broken? See [[#8. Troubleshooting]].

*Created by [George Mihai](https://www.georgemihai.com) · [hi@georgemihai.com](mailto:hi@georgemihai.com)*

----
## 1. Introduction

Obsidian works with plain text files (Markdown) on your own computer. Notes link to each other, like Wikipedia pages. Plugins add features. The interface is explained in [this video](https://www.youtube.com/watch?v=z4AbijUCoKU).

### 1.1 Terms used in this guide

| Term | Meaning |
| --- | --- |
| **Vault** | The folder with all your notes and settings, including the hidden `.obsidian`. |
| **Link** | `[[Note name]]`, a reference to another note. **Backlinks** shows the notes that link to the open one. |
| **Tag** | A word with `#` in front (`#claim`). |
| **Properties** | The fields at the top of a note (**title**, **branch**, **attachment**). |
| **Literature note** | A source's note in **Literature Notes**: its data, its PDF and your highlights. |
| **Citekey** | A source's code, like `craig_philosophy_2002`. It's the note's `id`. |
| **Citation** | `[@citekey, p. 34]`. It shows as (Craig, 2002, p. 34). |
| **Bibliography** | `Support/Admin/Bibliography/bibliography.json`. Texere keeps it up to date from your literature notes. |
| **Command palette** | All commands: **Ctrl/Cmd + P**. |

### 1.2 The Texere plugins

| Plugin | What it does |
| --- | --- |
| **Texere · The Researcher's Vault** | Sets up the vault, checks what's missing, shows the dashboard in a new tab and runs the **Help** button. Its settings page shows what's on, off or missing. |
| **Texere · Sources** | Adds sources from catalogs, Zotero or a PDF. Shows citations in your style, brings highlights into notes and keeps the bibliography. Button: the books icon on the left. |
| **Texere · Export** | PDF, Word, LaTeX, HTML or Markdown, with citations, bibliography and contents. Button: **Export**, bottom right. |
| **Texere · Insights** | How much you write, paste and delete; unlinked mentions and aliases; patterns in your reading and writing. Button: the lightbulb on the left. |

They use two community plugins that come with the vault: **PDF++** (highlights) and **Templater** (setup and Help). You don't need Zotero, Word or LaTeX.

----
## 2. Vault structure

| Folder | What's in it |
| --- | --- |
| **01. Sources** | **Documents** (PDFs) and **Literature Notes** (one note per source) |
| **02. Notes** | your notes and ideas: **Essays**, **Personal**, **Poetry** |
| **03. Workspace** | your work: **Courses**, **Thesis** (bachelor's, master's, PhD), **Articles**, **Projects** |
| **04. Export** | exported files |
| **Fields** | maps of fields. **Philosophy** has [[Philosophy]] and notes for its branches, theories, concepts, movements, periods and authors |
| **Support** | guides, templates, images, and **Admin** (scripts, bibliography, citation styles) |

Three folders stay where they are: **Support/Admin/Bibliography** (the bibliography and the citation styles), **Support/Admin/Scripts** (Help) and **Support/Templates**. Rename or move one and Texere tells you, with a button that puts it back. The sources and export folders are yours: rename them and Texere asks where to save next time. Don't change a literature note's `id`.

The rest is a suggestion. Texere creates these folders the first time it starts; rename, move or delete them as you like. It won't put them back unless you ask: **Settings → Texere · The Researcher's Vault → Folders**.

Each note in **Fields/Philosophy** has an English name and a Romanian alias: type `[[Etică` and you get **Ethics**. Use these notes in your properties. [[Craig 2002 – Philosophy. A very short introduction]] has [[Introduction]] as **branch**; open [[Introduction]] and **Backlinks** shows every source in that branch. No **Fields** folder? **Settings → Texere · The Researcher's Vault → Create the map**. Need another field? Write to [hi@georgemihai.com](mailto:hi@georgemihai.com).

## 3. Managing references

Every source has a note in **Literature Notes**, named *Author Year – Title*, and a PDF in **Documents**. The sources already there are examples. Delete them whenever you want.

### 3.1 Search and add

1. Click **Texere · Sources** (the books icon), or **Ctrl/Cmd + P** → **Texere · Sources · Search sources**.
2. Type a title, an author, a DOI, an ISBN or a link. Filter by type, years or order.
3. Pick the source and click **Add to vault**. The free PDF comes with it, if there is one.

Already have the reference? **Paste** takes a citation, BibTeX, RIS or a DOI. No catalog has it? **Enter manually**. Some catalogs allow more searches with a free key: **Settings → Texere · Sources → Catalogs**.

### 3.2 From Zotero

1. Open Zotero. The first time: **Settings → Advanced** → tick **Allow other applications on this computer to communicate with Zotero**.
2. **Texere · Sources** → **Zotero**. ✎ marks the items with highlights; **With highlights** shows only those.
3. Tick what you want and click **Import**. You get the note, the PDF and the highlights, tagged by color.

Sources already in the vault get only what's missing, and nothing is doubled. A PDF that sits alone in Zotero, without title or authors, goes to **Documents/Inbox**, and Texere asks you to choose its source. Zotero's colors map to tags in **Settings → Texere · Sources → Catalogs → Zotero**. Add a Zotero key (**Settings → Texere · Sources → Catalogs → Zotero**): then import works with Zotero closed too, and you stop waiting for it. Recommended.

### 3.3 From the browser, with the Zotero button

1. Install [Zotero Connector](https://www.zotero.org/download/connectors).
2. Turn on **Settings → Texere · Sources → Catalogs → Zotero → Zotero browser button**.
3. On an article's page, click the Zotero button. Obsidian must be open.

With Zotero open, the source goes to Zotero and then to the vault. With Zotero closed, it goes straight to the vault.

> [!warning]- It saved a web page instead of the article?
> On a Mac, closing Zotero's window doesn't quit it: use **Cmd + Q**. Then **Zotero Connector → Preferences → Advanced → Reset Translators** and try again.

### 3.4 A PDF you already have

Open it, then **Ctrl/Cmd + P** → **Texere · Sources · Add this PDF as a source**. Pick the source. The PDF is attached and moved to **Documents**. **Texere · Sources · PDFs without a source…** lists the ones left. For a source without a PDF: **Find the free PDF for this source**.

## 4. Reading and literature notes

1. Open the source's note and click the PDF in **attachment**.
2. Select a passage and pick a color from the **PDF++** palette.
3. Paste it in the note (**Ctrl/Cmd + V**). It starts with the color's tag and ends with the citation and **· PDF**, a link to the exact place.

| Color | Tag | You mark |
| --- | --- | --- |
| pink | `#fact` | facts, dates, figures |
| yellow | `#claim` | the author's claims |
| red | `#disagree` | what you disagree with |
| teal | `#agree` | what you agree with |
| blue | `#connection` | links to other texts or ideas |
| purple | `#question` | questions |
| orange | `#definition` | definitions |
| grey | `#word` | terms to remember |

Highlights made in Zotero, Preview or Acrobat come into the note by themselves, with the closest color's tag. Made later? **Texere · Sources · Import highlights from PDF**.

> [!example] From a real note
> In [[Craig 2002 – Philosophy. A very short introduction]]:
> ```
> #claim In fact philosophy is extremely hard to avoid, even with a conscious effort.
> [@craig_philosophy_2002, p. 12] · PDF
> Even sceptics who said that philosophy is useless have a certain set of values…
> ```
> The highlight, and your comment under it. [[Texere – Export test]] cites it as `[@craig_philosophy_2002, p. 12]`.

Search a tag (`tag:#disagree`) to gather the same kind of idea from all your readings. After reading, fill in **Thesis**, **Arguments**, **Counterarguments** and **Conclusions**.

**Source stats**, at the top of each source's note, shows how others cite it ([scite](https://scite.ai), [OpenAlex](https://openalex.org), [Semantic Scholar](https://www.semanticscholar.org)) and what you highlighted. It refreshes once a day.

## 5. Writing academic papers

### 5.1 Start from a template (optional)

- [[New article]]: duplicate it and fill in **title**. Leave **Bibliography** empty; the bibliography goes there on export.
- [[Licență – Facultatea de Filosofie UB]] and [[Disertație – Facultatea de Filosofie UB]]: theses by the faculty's guide. Fill in **title**, **autor**, **coordonator** and **an**. The rules: [[Ghid de redactare – Licență și disertație (FF UB)]].

### 5.2 Citing sources

Type `@` and a word from the author or title, then pick the source. Texere writes `[@citekey]`; add the page after it.

| You write | Appears (APA) |
| --- | --- |
| `[@craig_philosophy_2002]` | (Craig, 2002) |
| `[@craig_philosophy_2002, p. 34]` | (Craig, 2002, p. 34) |
| `[@craig_philosophy_2002, pp. 34-36]` | (Craig, 2002, pp. 34–36) |
| `[@craig_philosophy_2002; @dummett_origins_1996]` | (Craig, 2002; Dummett, 1996) |
| `@craig_philosophy_2002 [p. 34]` | Craig (2002, p. 34) |
| `[see @craig_philosophy_2002, ch. 2]` | (see Craig, 2002, ch. 2) |

Always give the page when you quote or paraphrase.

The style is shown at the bottom right (**APA**). Click it to change the style of this note; the export follows. **Add a style…** searches 10,000+ styles. The choice is saved in the note's `csl` property. **Cmd/Ctrl + click** on a citation opens the source.

### 5.3 Writing guides

- [Guidelines on Writing a Philosophy Paper](https://www.jimpryor.net/teaching/guidelines/writing.html)
- [LEADERSHIP LAB: The Craft of Writing Effectively](https://www.youtube.com/watch?v=vtIzMaLkCaM)
- [[Metodologia cercetării - Literature Review]] (in Romanian)
- [[Metodologia cercetării - Structura unei lucrări științifice]] (in Romanian)

### 5.4 Insights: your writing, links and patterns

**Texere · Insights** shows how you work. Everything stays on your laptop. Open it from the lightbulb on the left; the new tab shows today's words and the unlinked mentions.

- **Words.** What you type, paste, insert with another tool (an AI plugin, a template) and delete, per day, week, month and year, with your streak and the hours you write best. Undo isn't counted. Each laptop keeps its own count and the totals add them up.
- **Word target.** In a note: **Texere · Insights · Set a word target**. A thin bar above the text shows how far you are and what you added today.
- **Unlinked mentions.** Concepts you wrote without a link (filosofiei, acțiunii, Dasein), in your notes and in your own lines in literature notes, not in the quotes. **Review** groups them; **Link selected** links the first mention in each note and keeps your words: `[[Action|acțiunii]]`. It also lists names that appear often but have no note (**Create note**), suggests aliases (from your link text, your spelling, short forms and, when you ask, translations from Wikidata, Wikipedia and MyMemory) and shows notes that look duplicated.
- **Projects.** A project is a folder or a tag (your thesis, an article, a course) with an optional target and deadline: words, weekly pace and when you'll get there.
- **Uncited claims.** In your projects, a paragraph that argues ("therefore", "studies show", a named author) but cites nothing gets an orange line on the left and, at the end, a source you could cite. One click adds it.
- **Patterns.** Rising topics and what you read without writing about it; concepts that keep appearing together but aren't linked; forgotten notes that matter now, and **Surprise me**; who you cite; what you highlight; reading next to writing.
- **Weekly review.** Every Monday, a short note in **02. Notes/Weekly reviews**.

Settings: **Settings → Texere · Insights** (Links · Projects). It works in any vault; with Texere · Sources its reading and citation numbers are more accurate.

## 6. Bibliography and export

> [!tip] Try it
> Open [[Texere – Export test]], click **Export** (bottom right), choose **PDF** and click **Export PDF**.

1. Open the note and click **Export**, bottom right. Or use the **Texere · Export** button on the left, which lists your notes.
2. Choose the format: **PDF**, **Word**, **LaTeX**, **HTML** or **Markdown**. The preview shows the result.
3. Click **Export PDF** (or Word…). The message has an **Open** button.

The bibliography makes itself, from the sources you cite. It goes under the **Bibliography** heading, or at the end.

In the export window you set the template (general, or the faculty's), the citation style, the page (size, margins, page numbers), the text (font, spacing, alignment), the contents and a few options (each H2 on a new page, colors, tags). Your choices are kept. Make your own templates in **Settings → Texere · Export → Templates**: start from one that exists, change it in **Page & text**, rename or delete it; a note uses it with `export: <its name>`. The default format and the export folder, inside or outside the vault, are in **Files**.

**Contents.** **Texere · Export · Insert the contents here** adds a table of contents that updates as you write. In PDF and Word it gets page numbers. Word asks to update the fields when you open the file: say **Yes**.

Images must be in the vault, linked with `![[image.png]]`.

## 7. Backups

Copy the vault folder to an external drive now and then. No sensitive data? A cloud copy works too.

## 8. Troubleshooting

Open a new tab, or **Settings → Texere · The Researcher's Vault**. Both show what's missing, with a button to fix it. Then run the setup again: **Ctrl/Cmd + P** → **Texere · The Researcher's Vault: Setup**.

### 8.1 Manual setup

The setup does steps 3 to 5 and 7 for you.

1. **Copy the whole vault**, with the hidden `.obsidian` folder. On a Mac, **Cmd + Shift + .** shows it.
2. **Turn on plugins:** **Settings → Community plugins → Turn on community plugins**.
3. **Texere plugins:** in **Settings → Texere · The Researcher's Vault**, turn on Sources and Export, and click **Install and turn on** for anything missing.
4. **Bibliography:** **Settings → Texere · Sources → Note template → Tag** must be `literature_note`. Then run **Texere · Sources · Rebuild the bibliography from notes**.
5. **Export folder:** **Settings → Texere · Export → Files → Export folder**.
6. **Font:** pick one from **Text → Font** in the export window. Only installed fonts are listed.
7. **Help button:** **Settings → Templater → Enable startup templates**, add `Support/Admin/Scripts/Help.md` and `Support/Admin/Scripts/Guide folding.md`, then restart Obsidian.

### 8.2 If an error appears

| What you see | Why | What to do |
| --- | --- | --- |
| "Restricted mode", no plugins | you didn't trust the author | step 2 |
| the setup doesn't start | Texere or Templater is off | step 3, then run the setup |
| Texere or PDF++ commands are missing | plugins off, or `.obsidian` missing | steps 1 and 3 |
| citations stay `[@citekey]` | Texere · Sources is off | step 3 |
| "not found: @…" on export | the citekey isn't in your bibliography | type `@` and pick the source |
| fewer sources than notes | notes without the `literature_note` tag | step 4 |
| no exported file | the export folder doesn't exist on this laptop | step 5 |
| another font in the export | the font isn't installed | step 6 |
| the **Help** button or the **New laptop setup** script is missing | a **Support** folder was moved, or startup templates are off | open a new tab and click **Put it back**; otherwise step 7 |
| "Zotero is closed" | Zotero isn't running | open it, or add a Zotero key |
| Zotero "doesn't let Texere in" | Zotero blocks other apps | Zotero **Settings → Advanced** → allow other applications |
| the Zotero button saves only to Zotero | the browser button is off | [[#3.3 From the browser, with the Zotero button]] |
| highlights missing from the note | made after the source was added | **Texere · Sources · Import highlights from PDF** |
| "limit reached" in search | a catalog's daily limit | add a free key in **Catalogs** |

## 9. Frequently asked questions

1. **Can I change the structure?** Yes. If you move the sources, change their folders in **Settings → Texere · Sources → Names & folders**.
2. **Another citation style?** Click the style at the bottom right. **Add a style…** finds any of the 10,000+ in the [Zotero Style Repository](https://www.zotero.org/styles).
3. **Do I need Zotero?** No. It helps if your library is already there.
4. **Deleted text by mistake?** **Settings → File recovery**.
5. **How do I update?** Back up the vault. From the new version, copy **Support** and the folders `.obsidian/plugins/texere`, `texere-sources` and `texere-export`. Don't replace your notes or **01. Sources**. Restart Obsidian.

## 10. Other guides

1. https://www.youtube.com/watch?v=S_-uD3GtFno
2. https://obsidian-guide.neocities.org/guide
3. https://girlinbluemusic.com/how-to-connect-zotero-and-obsidian-for-the-ultimate-phd-workflow/
4. [Obsidian documentation](https://help.obsidian.md)

## 11. Version history

- **3.2.0** · 3 November 2026 · **Texere · Insights**: words typed, pasted, inserted and deleted; word targets; unlinked mentions linked in one click; alias suggestions; uncited claims while you write; patterns, thesis pace and a weekly review
- **3.1.0** · 1 November 2026 · a shorter guide; Texere creates the suggested folders (**02. Thesis** replaces 02. Disertation) and guards the ones it needs; your own export templates; a dashboard in every new tab; the Zotero tab filters by highlights and doesn't double them; lost letters (ș, ț) come back from the page Zotero saved; the Zotero button no longer waits for the PDF and adds only one; a PDF the site won't hand over: **Open the PDF**, save it to Downloads or drag it into Inbox, and Texere attaches it; Zotero always finds its port free
- **3.0.0** · 1 November 2026 · sources, citations and export come from three Texere plugins, without BibLib, Pandoc or LaTeX; Zotero import with highlights; export with preview and thesis templates; the bibliography moved to **Support/Admin/Bibliography**
- **2.3.0** · 30 October 2026 · new folders: 01. Sources, 02. Notes, 03. Workspace, 04. Export, Fields, Support, and **Home**
- **2.0.0 – 2.2.1** · 27 October 2026 · one vault for both languages: English and Romanian guides, setup and Help in your language, English note names with Romanian aliases
- **1.0.0 – 1.6.1** · 26–27 October 2026 · the first guide, the automatic setup, the Help button and the philosophy map; the project was called Topos, then Texere (Lat. *to weave*)

<!--
For whoever maintains the vault:
1. Raise version and date (x.x.x): last digit for fixes, middle for new features, first for big changes. Add a line above.
2. Changed a script? Update the version in its first comment line. Changed a plugin? Update its manifest.json.
3. Keep both guides in step: same section numbers, same version. Help and the setup find answers by section number.
-->
