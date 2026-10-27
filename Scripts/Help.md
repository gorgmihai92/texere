<%*
// Butonul „Ajutor” / „Help”: răspunde la întrebări pe baza ghidului, în română sau engleză. Versiune 2.1.0 (2026-10-27)
// Rulează automat la pornirea Obsidian (Templater → Startup templates). Nu modifica și nu rula manual.
if (!window.__ghidAjutor) {
  window.__ghidAjutor = true;
  const ob = tp.obsidian;

  // ---------- limba (RO / EN): aceeași alegere ca în fereastra de configurare ----------
  const LANG_KEY = "texere-lang";
  const getLang = () => {
    try { const s = app.loadLocalStorage(LANG_KEY); if (s === "ro" || s === "en") return s; } catch (e) {}
    let l = ""; try { l = window.localStorage.getItem("language") || navigator.language || ""; } catch (e) {}
    return !l || /^ro/i.test(l) ? "ro" : "en";
  };
  const setLang = l => { try { app.saveLocalStorage(LANG_KEY, l); } catch (e) {} };
  const UI = {
    title: ["Texere · Ajutor", "Texere · Help"],
    sub: ["Scrie întrebarea cu cuvintele tale sau alege una dintre întrebările frecvente de mai jos.", "Type your question in your own words or pick one of the frequent questions below."],
    ph: ["Scrie întrebarea sau problema ta (ex. „exportul în PDF nu merge”)", "Type your question or problem (e.g. \"PDF export doesn't work\")"],
    none: ["Nu am găsit nimic. Încearcă alte cuvinte sau deschide ghidul.", "Nothing found. Try other words or open the guide."],
    qa: ["Întrebare frecventă", "Frequent question"], from: ["Din ghid: ", "From the guide: "], sec: ["Secțiune din ghid", "Guide section"],
    back: ["← Înapoi la întrebări", "← Back to questions"], fromGhid: ["Din ghid", "From the guide"],
    other: ["Altă întrebare", "Another question"], open: ["Deschide în ghid", "Open in the guide"],
    noGhid: ["Nu găsesc ghidul în vault.", "I can't find the guide in the vault."], by: ["Creat de ", "Created by "],
  };
  const t = (k, lg) => UI[k][lg === "en" ? 1 : 0];

  // găsește ghidul chiar dacă a fost redenumit (după numele cunoscute sau după titlul glosarului)
  const GHIDS = {
    ro: { names: ["02. Texere – Cercetare, lectură și scris, într-un singur loc.md", "01. Texere – Cercetare, lectură și scris, într-un singur loc.md", "Cercetare, lectură și scris, într-un singur loc.md", "Cercetarea într-un singur loc.md", "Ghid de cercetare.md", "Ghid pentru eficientizarea procesului de cercetare.md"], re: /Termeni folosiți în ghid/, step: ["**Pasul 1", "**Pasul 2"] },
    en: { names: ["01. Texere – Research, reading and writing, in one place.md", "02. Texere – Research, reading and writing, in one place.md", "Research, reading and writing, in one place.md", "Research in One Place.md"], re: /Terms used in this guide/, step: ["**Step 1", "**Step 2"] },
  };
  const findGhid = lg => {
    const g = GHIDS[lg];
    const strip = b => b.replace(/^\d+[.)]\s*/, "").replace(/^(Texere|Topos)\s*[–—-]\s*/, "");
    for (const n of g.names) { const f = app.vault.getAbstractFileByPath(n) || app.vault.getMarkdownFiles().find(x => x.name === n || strip(x.basename) + ".md" === n); if (f && f.stat && f.stat.size > 0) return f; }
    return app.vault.getMarkdownFiles().find(f => (app.metadataCache.getFileCache(f)?.headings || []).some(h => g.re.test(h.heading))) || null;
  };

  // ---------- Întrebări frecvente: [secțiunea din ghid (număr; „step1” = Pasul 1), [întrebare, cuvinte-cheie, răspuns] RO, [...] EN] ----------
  const QA = [
    [ ["step1"], ["Cum configurez vault-ul pe un laptop nou?", "configurare instalare laptop nou prima data incep start setari", "Copiază folderul vault-ului întreg, deschide-l cu **Open folder as vault** și alege **Trust author and enable plugins**. Configurarea pornește singură și îți arată pașii. Ca s-o rulezi din nou: **Ctrl/Cmd + P** → {{cmd:texere:configurare|Texere: Configurare}}."],
                ["How do I set up the vault on a new laptop?", "setup set up install new laptop first time start settings configure", "Copy the whole vault folder, open it with **Open folder as vault** and choose **Trust author and enable plugins**. The setup starts by itself and shows you each step. To run it again: **Ctrl/Cmd + P** → {{cmd:texere:setup|Texere: Setup}}."]],
    [ ["step1"], ["Ceva nu mai funcționează. Ce fac?", "nimic nu merge nu functioneaza stricat problema eroare repar reparare ajutor", "Rulează din nou configurarea: **Ctrl/Cmd + P** → {{cmd:texere:configurare|Texere: Configurare}}. Dacă problema rămâne, caută mesajul de eroare în {{sec:8.2|tabelul de erori}}."],
                ["Something stopped working. What do I do?", "nothing works not working broken problem error fix repair help", "Run the setup again: **Ctrl/Cmd + P** → {{cmd:texere:setup|Texere: Setup}}. If the problem persists, look up the error message in {{sec:8.2|the error table}}."]],
    [ ["8.2", "eroare", "error"], ["Exportul în PDF nu merge", "export pdf nu merge xelatex latex mactex miktex eroare", "De obicei lipsește LaTeX ([MacTeX](https://tug.org/mactex/) pe Mac, [MiKTeX](https://miktex.org/download) pe Windows). Instalează-l, apoi {{cmd:texere:configurare|rulează din nou configurarea}}. Exportul în Word merge și fără LaTeX."],
                ["PDF export doesn't work", "export pdf not working xelatex latex mactex miktex error", "LaTeX is usually missing ([MacTeX](https://tug.org/mactex/) on Mac, [MiKTeX](https://miktex.org/download) on Windows). Install it, then {{cmd:texere:setup|run the setup again}}. Word export works without LaTeX."]],
    [ ["6", "export", "export"], ["Lipsește bibliografia sau apare „citation ... not found”", "bibliografie lipseste citation not found citare referinte citeproc undefined control sequence", "Înainte de export rulează {{cmd:biblib:build-bibliography|BibLib: Build bibliography}} (Ctrl/Cmd + P). Verifică și că citekey-ul e scris exact ca în {{note:citekeylist|citekeylist}}. Dacă tot nu merge, {{cmd:texere:configurare|rulează din nou configurarea}}."],
                ["The bibliography is missing or \"citation ... not found\" appears", "bibliography missing citation not found cite references citeproc undefined control sequence", "Before exporting, run {{cmd:biblib:build-bibliography|BibLib: Build bibliography}} (Ctrl/Cmd + P). Also check that the citekey is spelled exactly as in {{note:citekeylist|citekeylist}}. If it still fails, {{cmd:texere:setup|run the setup again}}."]],
    [ ["8.2", "eroare", "error"], ["Apare eroarea „Pandoc nu este găsit”", "pandoc negasit not found lipsa instalare", "Instalează Pandoc de pe [pandoc.org/installing.html](https://pandoc.org/installing.html), apoi {{cmd:texere:configurare|rulează din nou configurarea}}: îl găsește și completează singură setările."],
                ["The error \"Pandoc can't be found\" appears", "pandoc not found missing install", "Install Pandoc from [pandoc.org/installing.html](https://pandoc.org/installing.html), then {{cmd:texere:setup|run the setup again}}: it finds Pandoc and fills in the settings by itself."]],
    [ ["6", "export", "export"], ["Apare o eroare de font („The font ... cannot be found”)", "font eroare mainfont arial helvetica times", "Fontul din proprietatea `mainfont` a notei nu e instalat pe laptop. Pune un font pe care îl ai (ex. Arial sau Times New Roman), ca în șablonul {{note:Templates/New article.md|New article}}."],
                ["A font error appears (\"The font ... cannot be found\")", "font error mainfont arial helvetica times", "The font in the note's `mainfont` property isn't installed on your laptop. Use a font you have (e.g. Arial or Times New Roman), as in the {{note:Templates/New article.md|New article}} template."]],
    [ ["8.1", "manual", "manual"], ["Nu găsesc fișierul exportat", "gasesc fisier exportat unde salvat output folder export", "Fișierele apar în folderul ales la configurare: folderul Export din Obsidian sau folderul ales de tine. Ca să alegi altul, {{cmd:texere:configurare|rulează din nou configurarea}}: **Ctrl/Cmd + P** → {{cmd:texere:configurare|Texere: Configurare}}."],
                ["I can't find the exported file", "find exported file where saved output folder export", "Files appear in the folder chosen during setup: the Export folder in Obsidian or the folder you picked. To choose another one, {{cmd:texere:setup|run the setup again}}: **Ctrl/Cmd + P** → {{cmd:texere:setup|Texere: Setup}}."]],
    [ ["8.2", "eroare", "error"], ["Lipsesc comenzile BibLib, Pandoc sau PDF++", "lipsesc comenzi pluginuri plugin biblib pandoc pdf activare trust", "Pluginurile nu sunt activate: {{set:community-plugins|Settings → Community plugins}} → **Turn on community plugins**. Verifică și că ai copiat vault-ul întreg, cu folderul ascuns `.obsidian`."],
                ["The BibLib, Pandoc or PDF++ commands are missing", "missing commands plugins plugin biblib pandoc pdf enable trust", "The plugins aren't turned on: {{set:community-plugins|Settings → Community plugins}} → **Turn on community plugins**. Also check that you copied the whole vault, including the hidden `.obsidian` folder."]],
    [ ["8.2", "eroare", "error"], ["Obsidian e lent la prima deschidere", "lent incet greu prima deschidere smart connections", "E normal: pluginul Smart Connections indexează notele. Așteaptă câteva minute."],
                ["Obsidian is slow the first time it opens", "slow sluggish first open smart connections", "That's normal: the Smart Connections plugin is indexing your notes. Wait a few minutes."]],
    [ ["8.2", "eroare", "error"], ["MiKTeX îmi cere să instalez pachete", "miktex pachete instalare windows pdf", "E normal la primul export în PDF pe Windows. Acceptă instalarea."],
                ["MiKTeX asks me to install packages", "miktex packages install windows pdf", "That's normal on the first PDF export on Windows. Accept the installation."]],
    [ ["3.1", "Obsidian", "Obsidian"], ["Cum adaug o sursă (carte sau articol)?", "adaug sursa carte articol referinta import doi isbn arxiv biblib literature note", "**Ctrl/Cmd + P** → {{cmd:biblib:create-literature-note|BibLib: Create literature note}} → introdu DOI-ul, ISBN-ul sau arXiv-ul → **Lookup**. Nota sursei apare în folderul References."],
                ["How do I add a source (book or article)?", "add source book article reference import doi isbn arxiv biblib literature note", "**Ctrl/Cmd + P** → {{cmd:biblib:create-literature-note|BibLib: Create literature note}} → enter the DOI, ISBN or arXiv ID → **Lookup**. The source's note appears in the References folder."]],
    [ ["3.2", "Zotero", "Zotero"], ["Cum adaug o sursă din browser cu Zotero Connector?", "zotero connector browser chrome firefox import pagina", "Instalează [Zotero Connector](https://www.zotero.org/download/connectors), intră pe pagina articolului și apasă pe Zotero Connector în browser, cu Obsidian deschis și aplicația Zotero închisă."],
                ["How do I add a source from the browser with Zotero Connector?", "zotero connector browser chrome firefox import page", "Install [Zotero Connector](https://www.zotero.org/download/connectors), go to the article's page and click Zotero Connector in the browser, with Obsidian open and the Zotero app closed."]],
    [ ["3.2", "Zotero", "Zotero"], ["Zotero Connector nu trimite sursa sau nu apar toate datele", "zotero connector nu trimite merge functioneaza date lipsa translators reset", "Închide aplicația Zotero. Dacă lipsesc date, resetează translatorii din setările extensiei ({{sec:3.2|pașii sunt în ghid}}) și încearcă din nou."],
                ["Zotero Connector doesn't send the source or some data is missing", "zotero connector not sending working data missing translators reset", "Close the Zotero app. If data is missing, reset the translators in the extension's settings ({{sec:3.2|the steps are in the guide}}) and try again."]],
    [ ["3.3", "PDF", "PDF"], ["Cum atașez un PDF la o sursă?", "atasez pdf atasament attachment document fisier", "Trage PDF-ul în folderul {{reveal:Documents|Documents}}, deschide nota sursei și, în proprietatea **attachment**, tastează `\x5B[` și alege fișierul."],
                ["How do I attach a PDF to a source?", "attach pdf attachment document file", "Drag the PDF into the {{reveal:Documents|Documents}} folder, open the source's note and, in the **attachment** property, type `\x5B[` and pick the file."]],
    [ ["3.1", "Obsidian", "Obsidian"], ["Sursa mea nu are DOI sau ISBN", "fara doi isbn editie veche manual date", "Completează datele manual în fereastra {{cmd:biblib:create-literature-note|BibLib: Create literature note}}."],
                ["My source has no DOI or ISBN", "no without doi isbn old edition manual data", "Fill in the data by hand in the {{cmd:biblib:create-literature-note|BibLib: Create literature note}} window."]],
    [ ["3", "Administrarea", "Managing"], ["Ce sunt sursele din References? Le pot șterge?", "exemple exemplu surse sterg sterge stergere references documents demo model cinci 5 blackburn craig dummett vica constantinescu", "Cele 5 surse din {{reveal:References|References}} sunt exemple, păstrate ca să vezi cum arată o notă de literatură. După configurare le poți șterge, împreună cu PDF-urile lor din {{reveal:Documents|Documents}}. Dacă le ștergi, înlocuiește și citările-exemplu din șablonul {{note:Templates/New article.md|New article}}."],
                ["What are the sources in References? Can I delete them?", "examples example sources delete remove references documents demo sample five 5 blackburn craig dummett vica constantinescu", "The 5 sources in {{reveal:References|References}} are examples, kept to show what a literature note looks like. After setup you can delete them, along with their PDFs in {{reveal:Documents|Documents}}. If you delete them, also replace the example citations in the {{note:Templates/New article.md|New article}} template."]],
    [ ["4", "Lectura", "Reading"], ["Cum evidențiez pasaje în PDF?", "evidentiez subliniez highlight pasaj pdf culoare copiez lectura", "Deschide PDF-ul din nota sursei, selectează pasajul, alege o culoare din paleta PDF++ și lipește-l în notă (Ctrl/Cmd + V). Pasajul păstrează pagina și un link înapoi la PDF."],
                ["How do I highlight passages in a PDF?", "highlight underline passage pdf color colour copy reading", "Open the PDF from the source's note, select the passage, choose a color from the PDF++ palette and paste it into the note (Ctrl/Cmd + V). The passage keeps its page and a link back to the PDF."]],
    [ ["4", "Lectura", "Reading"], ["Ce înseamnă culorile de evidențiere?", "culori culoare galben rosu verde albastru mov portocaliu gri fact agree disagree question definition word connection", "Galben = fapte și teze, roșu = nu sunt de acord, verde = sunt de acord, albastru = legături, mov = întrebări, portocaliu = definiții, gri = termeni de reținut."],
                ["What do the highlight colors mean?", "colors colours color yellow red green blue purple orange grey gray fact agree disagree question definition word connection", "Yellow = facts and theses, red = I disagree, green = I agree, blue = connections, purple = questions, orange = definitions, grey = terms to remember."]],
    [ ["4", "Lectura", "Reading"], ["Cum găsesc toate ideile de un anumit tip (ex. cu care nu sunt de acord)?", "gasesc caut idei eticheta tag disagree agree cautare toate", "Caută eticheta în bara de căutare, de exemplu {{search:tag:#disagree|tag:#disagree}}."],
                ["How do I find all ideas of one type (e.g. the ones I disagree with)?", "find search ideas tag disagree agree all", "Search for the tag in the search bar, for example {{search:tag:#disagree|tag:#disagree}}."]],
    [ ["5.1", "șablon", "template"], ["Cum încep un articol nou?", "incep articol nou lucrare eseu sablon template new article scriu", "Duplică șablonul {{note:Templates/New article.md|New article}} din folderul Templates, redenumește copia și completează proprietatea **title**."],
                ["How do I start a new paper?", "start new paper article essay template new article write", "Duplicate the {{note:Templates/New article.md|New article}} template in the Templates folder, rename the copy and fill in the **title** property."]],
    [ ["5.2", "Citarea", "Citing"], ["Cum citez o sursă în text?", "citez citare citat referinta text pagina citekey paranteze", "Scrie `[@citekey]` sau, cu pagina, `[@citekey, p. 34]`. La export devine, de exemplu, (Craig, 2002, p. 34)."],
                ["How do I cite a source in the text?", "cite citation quote reference text page citekey brackets", "Write `[@citekey]` or, with the page, `[@citekey, p. 34]`. On export it becomes, for example, (Craig, 2002, p. 34)."]],
    [ ["5.2", "Citarea", "Citing"], ["Unde găsesc citekey-ul unei surse?", "citekey cod sursa unde gasesc nume nota citekeylist", "În nota {{note:citekeylist|citekeylist}} sau în numele notei sursei din folderul References (fără `@` din față)."],
                ["Where do I find a source's citekey?", "citekey code source where find note name citekeylist", "In the {{note:citekeylist|citekeylist}} note or in the name of the source's note in the References folder (without the leading `@`)."]],
    [ ["9", "Întrebări", "questions"], ["Pot folosi alt stil de citare (ex. Chicago)?", "stil citare chicago apa mla csl schimb", "Da. Descarcă stilul din [Zotero Style Repository](https://www.zotero.org/styles), salvează fișierul .csl în folderul biblib și înlocuiește `apa.csl` cu numele lui în **Extra Pandoc arguments** ({{set:obsidian-pandoc|Settings → Pandoc Plugin}})."],
                ["Can I use another citation style (e.g. Chicago)?", "citation style chicago apa mla csl change", "Yes. Download the style from the [Zotero Style Repository](https://www.zotero.org/styles), save the .csl file in the biblib folder and replace `apa.csl` with its name in **Extra Pandoc arguments** ({{set:obsidian-pandoc|Settings → Pandoc Plugin}})."]],
    [ ["6", "export", "export"], ["Cum export în Word sau PDF?", "export word docx pdf latex salvez predau document", "1. **Ctrl/Cmd + P** → {{cmd:biblib:build-bibliography|BibLib: Build bibliography}}. 2. **Ctrl/Cmd + P** → caută **Pandoc** și alege formatul, de exemplu {{cmd:obsidian-pandoc:pandoc-export-docx|Word}} sau {{cmd:obsidian-pandoc:pandoc-export-pdf|PDF}}."],
                ["How do I export to Word or PDF?", "export word docx pdf latex save submit document", "1. **Ctrl/Cmd + P** → {{cmd:biblib:build-bibliography|BibLib: Build bibliography}}. 2. **Ctrl/Cmd + P** → search for **Pandoc** and choose the format, for example {{cmd:obsidian-pandoc:pandoc-export-docx|Word}} or {{cmd:obsidian-pandoc:pandoc-export-pdf|PDF}}."]],
    [ ["6", "export", "export"], ["Cum schimb fontul, marginile sau cuprinsul documentului?", "font margini cuprins aspect formatare dimensiune spatiere proprietati toc", "Din proprietățile notei: `mainfont`, `fontsize`, `geometry`, `linestretch`, `toc`. Copiază-le din șablonul {{note:Templates/New article.md|New article}} și schimbă valorile."],
                ["How do I change the font, margins or table of contents?", "font margins contents layout formatting size spacing properties toc", "In the note's properties: `mainfont`, `fontsize`, `geometry`, `linestretch`, `toc`. Copy them from the {{note:Templates/New article.md|New article}} template and change the values."]],
    [ ["6", "export", "export"], ["Imaginile nu apar în documentul exportat", "imagini imagine poze nu apar export grafic tabel", "Salvează imaginea în vault și insereaz-o cu link Obsidian, de exemplu `!\x5B[nume imagine.png]]`."],
                ["Images don't appear in the exported document", "images image pictures missing export figure table", "Save the image in the vault and insert it with an Obsidian link, for example `!\x5B[image name.png]]`."]],
    [ ["2", "Structura", "structure"], ["Ce foldere sau note nu am voie să modific?", "modific sterg redenumesc foldere voie interzis media biblib references citekeylist", "Nu redenumi, nu muta și nu șterge folderele Media, biblib, References, Scripts, Templates și nota citekeylist. În notele din References nu schimba `id` și `citation-key`."],
                ["Which folders or notes must I not change?", "change delete rename folders allowed forbidden media biblib references citekeylist", "Don't rename, move or delete the Media, biblib, References, Scripts and Templates folders or the citekeylist note. In the References notes, don't change `id` and `citation-key`."]],
    [ ["2", "Structura", "structure"], ["Ce este nota Philosophy?", "philosophy nota structura domeniu ramuri concepte teorii curente", "Nota {{note:Philosophy|Philosophy}} conține structura domeniului (ramuri, subdomenii, perioade, curente, teorii, concepte, autori). Folosește valorile ei când completezi proprietățile notelor."],
                ["What is the Philosophy note?", "philosophy note structure field branches concepts theories movements", "The {{note:Philosophy|Philosophy}} note holds the field's structure (branches, subdomains, periods, movements, theories, concepts, authors). Use its values when you fill in your notes' properties."]],
    [ ["9", "Întrebări", "questions"], ["Ce versiune am și cum actualizez vault-ul?", "versiune actualizare actualizez update nou noua istoric schimbari", "Versiunea și schimbările sunt la {{sec:11|11. Istoric versiuni}}. Ca să actualizezi: copiază din vault-ul nou ghidurile, folderele Scripts și Templates și `.obsidian/plugins/texere`, fără să înlocuiești References, Documents și notele tale."],
                ["Which version do I have, and how do I update the vault?", "version update upgrade new history changes", "The version and the changes are in {{sec:11|11. Version history}}. To update: from the new vault, copy the guides, the Scripts and Templates folders and `.obsidian/plugins/texere`, without replacing References, Documents or your notes."]],
    [ ["8.2", "eroare", "error"], ["Configurarea nu a pornit singură", "configurare nu porneste singura automat trust plugin ghid cercetare topos", "Verifică în {{set:community-plugins|Settings → Community plugins}} că pluginul **Texere** e activ, apoi rulează **Ctrl/Cmd + P** → {{cmd:texere:configurare|Texere: Configurare}}."],
                ["The setup didn't start by itself", "setup not starting start automatically trust plugin research guide topos", "In {{set:community-plugins|Settings → Community plugins}}, check that the **Texere** plugin is on, then run **Ctrl/Cmd + P** → {{cmd:texere:setup|Texere: Setup}}."]],
    [ ["2", "Structura", "structure"], ["Am șters folderul Scripts sau Templates. Ce fac?", "sters scripts templates folder lipseste buton ajutor configurare laptop nou disparut recuperez original", "Copiază folderul din vault-ul original (copia primită inițial) în vault-ul tău, repornește Obsidian și {{cmd:texere:configurare|rulează din nou configurarea}}."],
                ["I deleted the Scripts or Templates folder. What do I do?", "deleted scripts scripts templates folder missing help button setup new laptop gone recover original", "Copy the folder from the original vault (the copy you first received) into your vault, restart Obsidian and {{cmd:texere:setup|run the setup again}}."]],
    [ ["9", "Întrebări", "questions"], ["Am șters din greșeală un text. Îl pot recupera?", "sters greseala recuperez recuperare pierdut text versiune file recovery", "Da: {{set:file-recovery|Settings → File recovery}}. Obsidian păstrează automat versiunile anterioare ale notelor."],
                ["I accidentally deleted some text. Can I get it back?", "deleted mistake accidentally recover recovery lost text version file recovery", "Yes: {{set:file-recovery|Settings → File recovery}}. Obsidian automatically keeps earlier versions of your notes."]],
    [ ["7", "Copii", "Backups"], ["Cum fac o copie de siguranță?", "copie siguranta backup salvare hard stick drive cloud", "Copiază periodic tot {{os:vault|folderul vault-ului}} pe un hard disk extern sau pe un stick USB (și, dacă nu ai date sensibile, în cloud)."],
                ["How do I make a backup?", "backup back up copy save hard drive stick usb cloud", "Regularly copy the whole {{os:vault|vault folder}} to an external hard drive or a USB stick (and, if you have no sensitive data, to the cloud)."]],
    [null, ["Cum schimb limba (română sau engleză)?", "limba engleza romana english schimb comutator traducere", "La începutul configurării alegi limba. O poți schimba oricând din comutatorul **RO / EN** din colțul ferestrei Ajutor sau al configurării. Ghidul în engleză este {{guide:en|Texere: Research, reading and writing, in one place}}."],
           ["How do I switch the language (Romanian or English)?", "language english romanian switch change translation", "You choose the language at the start of the setup. You can change it any time with the **RO / EN** switch in the corner of the Help or setup window. The Romanian guide is {{guide:ro|Texere: Cercetare, lectură și scris, într-un singur loc}}."]],
    [null, ["Cine a creat ghidul? Cum iau legătura?", "autor creat facut scris cine contact email mesaj george mihai", "Ghidul a fost creat de [George Mihai](https://www.georgemihai.com). Contact: [hi@georgemihai.com](mailto:hi@georgemihai.com)."],
           ["Who created the guide? How do I get in touch?", "author created made wrote creator who contact email message george mihai", "The guide was created by [George Mihai](https://www.georgemihai.com). Contact: [hi@georgemihai.com](mailto:hi@georgemihai.com)."]],
  ];
  // ---------- acțiuni rapide: butoane care fac direct ce recomandă răspunsul ----------
  const notice = (ro, en, lg) => new ob.Notice(lg === "en" ? en : ro, 6000);
  const cmd = (id, lg, needsNote) => {
    if (!app.commands.commands[id]) return notice("Comanda nu e disponibilă. Verifică dacă pluginul e pornit (Settings → Community plugins).", "The command isn't available. Check that the plugin is on (Settings → Community plugins).", lg);
    if (!app.commands.executeCommandById(id) && needsNote) notice("Deschide întâi nota pe care vrei s-o exporți, apoi încearcă din nou.", "First open the note you want to export, then try again.", lg);
  };
  const settings = tab => { try { app.setting.open(); app.setting.openTabById(tab); } catch (e) {} };
  const search = q => { try { app.internalPlugins.getPluginById("global-search").instance.openGlobalSearch(q); } catch (e) {} };
  const openNote = (name, lg) => {
    const f = app.vault.getAbstractFileByPath(name) || app.vault.getMarkdownFiles().find(x => x.basename === name);
    if (f) app.workspace.getLeaf("tab").openFile(f); else notice(`Nu găsesc nota „${name}”.`, `I can't find the note "${name}".`, lg);
  };
  const reveal = name => { try { const f = app.vault.getAbstractFileByPath(name); if (f) app.internalPlugins.getPluginById("file-explorer").instance.revealInFolder(f); } catch (e) {} };
  const showOS = (p, lg) => { try { window.require("electron").shell.openPath(p); } catch (e) { notice("Nu pot deschide folderul.", "I can't open the folder.", lg); } };
  const basePath = () => { const a = app.vault.adapter; return a.getBasePath ? a.getBasePath() : a.basePath; };
  const newPaper = async lg => {
    const t = app.vault.getAbstractFileByPath("Templates/New article.md");
    if (!t) return notice("Nu găsesc șablonul Templates/New article.", "I can't find the Templates/New article template.", lg);
    const b0 = lg === "en" ? "New paper" : "Articol nou"; let n = b0, i = 2;
    while (app.vault.getAbstractFileByPath(n + ".md")) n = `${b0} ${i++}`;
    const f = await app.vault.copy(t, n + ".md"); app.workspace.getLeaf("tab").openFile(f);
  };
  const isWin = !!(ob.Platform && ob.Platform.isWin);
  const A = {
    setup: { icon: "settings", label: ["Rulează configurarea", "Run the setup"], run: lg => cmd(lg === "en" ? "texere:setup" : "texere:configurare", lg) },
    errors: { icon: "table", label: ["Vezi tabelul de erori", "See the error table"], guide: ["8.2", "eroare", "error"] },
    latex: { icon: "download", label: [isWin ? "Descarcă MiKTeX" : "Descarcă MacTeX", isWin ? "Download MiKTeX" : "Download MacTeX"], url: isWin ? "https://miktex.org/download" : "https://tug.org/mactex/" },
    pandoc: { icon: "download", label: ["Descarcă Pandoc", "Download Pandoc"], url: "https://pandoc.org/installing.html" },
    bib: { icon: "book-open", label: ["Generează bibliografia", "Build the bibliography"], run: lg => cmd("biblib:build-bibliography", lg) },
    keys: { icon: "list", label: ["Deschide citekeylist", "Open citekeylist"], run: lg => openNote("citekeylist", lg) },
    add: { icon: "file-plus", label: ["Adaugă o sursă", "Add a source"], run: lg => cmd("biblib:create-literature-note", lg) },
    zotero: { icon: "download", label: ["Descarcă Zotero Connector", "Download Zotero Connector"], url: "https://www.zotero.org/download/connectors" },
    biblibSet: { icon: "sliders-horizontal", label: ["Setările BibLib", "BibLib settings"], run: () => settings("biblib") },
    plugins: { icon: "puzzle", label: ["Deschide Community plugins", "Open Community plugins"], run: () => settings("community-plugins") },
    docs: { icon: "folder-open", label: ["Arată folderul Documents", "Show the Documents folder"], run: () => reveal("Documents") },
    refs: { icon: "folder-open", label: ["Arată folderul References", "Show the References folder"], run: () => reveal("References") },
    disagree: { icon: "search", label: ["Caută #disagree", "Search #disagree"], run: () => search("tag:#disagree") },
    paper: { icon: "file-plus", label: ["Creează un articol nou", "Create a new paper"], run: lg => newPaper(lg) },
    tpl: { icon: "file-text", label: ["Deschide șablonul New article", "Open the New article template"], run: lg => openNote("Templates/New article.md", lg) },
    styles: { icon: "external-link", label: ["Zotero Style Repository", "Zotero Style Repository"], url: "https://www.zotero.org/styles" },
    pandocSet: { icon: "sliders-horizontal", label: ["Setările Pandoc Plugin", "Pandoc Plugin settings"], run: () => settings("obsidian-pandoc") },
    word: { icon: "file-down", label: ["Exportă în Word", "Export to Word"], run: lg => cmd("obsidian-pandoc:pandoc-export-docx", lg, true) },
    pdf: { icon: "file-down", label: ["Exportă în PDF", "Export to PDF"], run: lg => cmd("obsidian-pandoc:pandoc-export-pdf", lg, true) },
    exportDir: { icon: "folder-open", label: ["Arată folderul de export", "Show the export folder"], run: lg => { const o = app.plugins.plugins["obsidian-pandoc"]?.settings?.outputFolder; if (o) showOS(o, lg); else notice("Fișierele exportate apar lângă notă.", "Exported files appear next to the note.", lg); } },
    philo: { icon: "network", label: ["Deschide nota Philosophy", "Open the Philosophy note"], run: lg => openNote("Philosophy", lg) },
    versions: { icon: "history", label: ["Vezi istoricul versiunilor", "See the version history"], guide: ["11", "Istoric", "Version"] },
    recovery: { icon: "rotate-ccw", label: ["Deschide File recovery", "Open File recovery"], run: () => settings("file-recovery") },
    vault: { icon: "folder-open", label: ["Arată vault-ul în Finder / Explorer", "Show the vault in Finder / Explorer"], run: lg => showOS(basePath(), lg) },
    lang: { icon: "languages", label: ["Switch to English", "Treci la română"], stay: true },
    mail: { icon: "mail", label: ["Scrie un e-mail", "Send an e-mail"], url: "mailto:hi@georgemihai.com" },
    site: { icon: "globe", label: ["www.georgemihai.com", "www.georgemihai.com"], url: "https://www.georgemihai.com" },
  };
  // pentru fiecare întrebare frecventă (după întrebarea în română), acțiunile potrivite
  const ACT = {
    "Cum configurez vault-ul pe un laptop nou?": ["setup"],
    "Ceva nu mai funcționează. Ce fac?": ["setup", "errors"],
    "Exportul în PDF nu merge": ["latex", "setup"],
    "Lipsește bibliografia sau apare „citation ... not found”": ["bib", "keys", "setup"],
    "Apare eroarea „Pandoc nu este găsit”": ["pandoc", "setup"],
    "Apare o eroare de font („The font ... cannot be found”)": ["tpl"],
    "Nu găsesc fișierul exportat": ["exportDir", "setup"],
    "Lipsesc comenzile BibLib, Pandoc sau PDF++": ["plugins"],
    "Cum adaug o sursă (carte sau articol)?": ["add"],
    "Cum adaug o sursă din browser cu Zotero Connector?": ["zotero"],
    "Zotero Connector nu trimite sursa sau nu apar toate datele": ["biblibSet"],
    "Cum atașez un PDF la o sursă?": ["docs"],
    "Sursa mea nu are DOI sau ISBN": ["add"],
    "Ce sunt sursele din References? Le pot șterge?": ["refs", "docs", "tpl"],
    "Cum găsesc toate ideile de un anumit tip (ex. cu care nu sunt de acord)?": ["disagree"],
    "Cum încep un articol nou?": ["paper", "tpl"],
    "Cum citez o sursă în text?": ["keys"],
    "Unde găsesc citekey-ul unei surse?": ["keys"],
    "Pot folosi alt stil de citare (ex. Chicago)?": ["styles", "pandocSet"],
    "Cum export în Word sau PDF?": ["bib", "word", "pdf"],
    "Cum schimb fontul, marginile sau cuprinsul documentului?": ["tpl"],
    "Ce este nota Philosophy?": ["philo"],
    "Ce versiune am și cum actualizez vault-ul?": ["versions"],
    "Configurarea nu a pornit singură": ["plugins", "setup"],
    "Am șters din greșeală un text. Îl pot recupera?": ["recovery"],
    "Cum fac o copie de siguranță?": ["vault"],
    "Cum schimb limba (română sau engleză)?": ["lang"],
    "Cine a creat ghidul? Cum iau legătura?": ["mail", "site"],
  };
  // {{cmd:id|text}} comandă · {{sec:8.2|text}} secțiune din ghid · {{set:tab|text}} setări · {{note:nume|text}} notă
  // {{search:căutare|text}} căutare · {{reveal:folder|text}} folder în Obsidian · {{os:vault|text}} folderul vault-ului în Finder/Explorer
  const LINK = /\{\{(cmd|sec|set|note|search|reveal|os|guide):(.+?)\|([^}]+)\}\}/g;
  const linkify = s => (s || "").replace(LINK, (m, t, v, l) => `[${l}](#ghid=${t}=${encodeURIComponent(v)})`);
  const plain = s => (s || "").replace(LINK, "$3").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  const qaItems = lg => QA.map(([ref, ro, en], i) => { const x = lg === "en" ? en : ro; return { kind: "qa", i, title: x[0], k: x[1], a: x[2], ref, acts: (ACT[ro[0]] || []).map(k => A[k]).filter(Boolean) }; });

  // ---------- căutare ----------
  const LX = {
    ro: {
      STOP: new Set("a ai al ale am are as asa au ca cat ce cel cea cei cele cu cum da dar de din dintr dupa e ea ei el este eu fara fi in imi in intr la le lui ma mai mea meu mi mie n ne nici nu o or ori pe pentru poate pot prin sa sau se si sunt ta te tu un una unde unei unui va vreau apare apar alt alta alte alti".split(" ")),
      // rădăcina cuvântului: „citez”, „citare”, „citarea” → „cit”, dar „import” nu se confundă cu „important”
      SUF: ["urilor", "arilor", "ilor", "elor", "ului", "urile", "area", "arii", "este", "esti", "esc", "eaza", "eze", "ezi", "are", "ari", "ate", "ati", "ata", "uri", "ele", "ile", "ul", "ii", "ei", "ea", "le", "ez", "at", "a", "e", "i", "u"],
      DEF: /\b(inseamna|ce e|ce este|definitie|ce sunt)\b/, DEFW: /^(inseamna|definitie)$/,
    },
    en: {
      STOP: new Set("a an the and or but if of to in on at for from with by as is are was were be been being it its this that these those i me my we our you your he she they them their what which who whom how why when where do does did doing can could should would will shall may might must not no so than too very just about into over under again there here all any some such only own same other more most also up out off then once has have had having am get got isn doesn don won can't".split(" ")),
      SUF: ["ational", "ations", "ation", "ings", "ing", "ies", "ied", "edly", "ers", "ed", "es", "er", "ly", "ment", "s", "e"],
      DEF: /\b(mean|means|meaning|define|definition|what is|whats)\b/, DEFW: /^(mean|means|meaning|define|definition)$/,
    },
  };
  const norm = s => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const toks = (s, lg) => norm(s).split(/[^a-z0-9+#]+/).filter(w => w.length > 1 && !LX[lg].STOP.has(w));
  const stem = (w, lg) => { for (const x of LX[lg].SUF) if (w.length - x.length >= 3 && w.endsWith(x)) return w.slice(0, -x.length); return w; };
  const prep = (s, lg) => toks(s, lg).map(w => ({ w, s: stem(w, lg) }));
  // cât de bine se potrivește un cuvânt căutat: identic 1, aceeași rădăcină 0.85, început de cuvânt (doar pentru cuvântul pe care îl scrii acum) 0.6
  const match = (q, words) => {
    let best = 0;
    for (const x of words) {
      if (x.w === q.w) return 1;
      if (x.s === q.s) best = Math.max(best, 0.85);
      else if (q.partial && x.w.startsWith(q.w)) best = Math.max(best, 0.6);
    }
    return best;
  };

  const read = async lg => { const f = findGhid(lg); return f ? await app.vault.cachedRead(f) : ""; };
  const lines = s => s.split("\n");
  const headings = s => lines(s).map((l, i) => { const m = l.match(/^(#{1,6})\s+(.+)$/); return m ? { i, level: m[1].length, text: m[2].trim() } : null; }).filter(Boolean);
  const findHeading = (s, ref, lg) => {
    if (!ref || ref[0] === "step1") return null;
    const num = ref[0], word = lg === "en" ? ref[2] : ref[1], hs = headings(s);
    return hs.find(h => h.text.startsWith(num + " ") || h.text.startsWith(num + ". ")) || (word && hs.find(h => norm(h.text).includes(norm(word)))) || null;
  };
  const section = (s, ref, lg) => {
    const A = lines(s);
    if (ref && ref[0] === "step1") {
      const [m1, m2] = GHIDS[lg].step, a = A.findIndex(l => l.startsWith(m1)), b = A.findIndex(l => l.startsWith(m2));
      return a < 0 ? "" : A.slice(a, b > a ? b : a + 15).join("\n");
    }
    const h = findHeading(s, ref, lg); if (!h) return "";
    let end = A.length; for (let j = h.i + 1; j < A.length; j++) { const m = A[j].match(/^(#{1,6})\s/); if (m && m[1].length <= h.level) { end = j; break; } }
    return A.slice(h.i + 1, end).join("\n").trim();
  };
  // pasajele din ghid: fiecare secțiune, plus rândurile din tabele (erori, glosar etc.)
  const passages = s => {
    const out = [], hs = headings(s), A = lines(s);
    hs.forEach((h, k) => {
      const end = k + 1 < hs.length ? hs[k + 1].i : A.length;
      const body = A.slice(h.i + 1, end).join("\n");
      const ref = [h.text.split(" ")[0], h.text, h.text];
      out.push({ kind: "ghid", title: h.text, text: body, ref });
      // rândurile din tabele devin rezultate separate, în afară de tabelele cu exemple (citări, comparația de la început)
      let header = null;
      body.split("\n").forEach(l => {
        if (!/^\|/.test(l)) { header = null; return; }
        if (/^\|\s*-/.test(l)) return;
        const cells = l.split("|").map(c => c.trim()).filter(Boolean);
        if (header === null) { header = cells[0] || ""; return; }
        if (/^(Scrii|Etapă|You write|Stage)/.test(header) || cells.length < 2) return;
        out.push({ kind: "rand", title: cells[0].replace(/\*\*|`/g, ""), text: cells.slice(1).join(" — ").replace(/\*\*/g, ""), ref });
      });
    });
    return out;
  };
  const rank = (query, s, lg) => {
    const X = LX[lg], def = X.DEF.test(norm(query));
    let qw = toks(query, lg); if (!qw.length) return [];
    // la „ce înseamnă X” / „what does X mean” contează X
    if (def && qw.some(w => !X.DEFW.test(w))) qw = qw.filter(w => !X.DEFW.test(w));
    const typing = !/\s$/.test(query);
    const qt = qw.map((w, i) => ({ w, s: stem(w, lg), partial: typing && i === qw.length - 1 }));
    const items = [
      ...qaItems(lg).map(x => ({ ...x, Q: prep(x.title, lg), T: prep(x.title + " " + x.k, lg), X: prep(plain(x.a), lg) })),
      ...passages(s).map(p => ({ ...p, Q: prep(p.title, lg), T: prep(p.title, lg), X: prep(p.text, lg) })),
    ];
    // cuvintele rare (ex. „zotero”) contează mai mult decât cele comune (ex. „merge”)
    const df = {}; items.forEach(it => new Set([...it.T, ...it.X].map(x => x.s)).forEach(k => { df[k] = (df[k] || 0) + 1; }));
    const idf = q => Math.log(1 + items.length / (df[q.s] || 1));
    const sc = words => qt.reduce((sum, q) => sum + idf(q) * match(q, words), 0);
    const all = it => qt.every(q => match(q, [...it.T, ...it.X]) > 0);
    items.forEach(it => {
      it.score = it.kind === "qa" ? 3 * sc(it.T) + 2 * sc(it.Q) + sc(it.X) : 2.5 * sc(it.T) + Math.min(0.4 * sc(it.X), 2);
      if (def && it.kind === "rand" && it.ref && /Termeni|Terms/.test(it.ref[1])) it.score += 4 * sc(it.T);
      if (qt.length > 1 && all(it)) it.score *= 1.3;
    });
    const sorted = items.filter(x => x.score > 0).sort((x, y) => y.score - x.score);
    if (!sorted.length) return [];
    // doar rezultatele apropiate de cel mai bun, maximum 8
    return sorted.filter(x => x.score >= 0.4 * sorted[0].score).slice(0, 8);
  };
  const suggestions = (q, s, lg) => {
    const all = qaItems(lg);
    if (q.trim().length < 2) return all;
    const r = rank(q, s, lg);
    if (r.length) return r;
    if (!toks(q, lg).length) {   // doar cuvinte comune („ce”, „cum”, „how”, „what”)
      const nq = norm(q).trim().replace(/\s+/g, " ");
      const m = all.filter(x => (" " + norm(x.title) + " ").includes(" " + nq));
      return m.length ? m : all;
    }
    return [{ kind: "none", title: t("none", lg), ref: null }];
  };
  const hintOf = (x, lg) => x.kind === "qa" ? t("qa", lg) : x.kind === "rand" ? t("from", lg) + (x.ref ? x.ref[1] : "") : x.kind === "ghid" ? t("sec", lg) : "";

  // ---------- fereastra: o singură fereastră, de aceeași mărime; căutarea și răspunsul se afișează în ea ----------
  const openInGhid = (ref, lg, s) => {
    const f = findGhid(lg) || findGhid(lg === "en" ? "ro" : "en");
    if (!f) { new ob.Notice(t("noGhid", lg)); return; }
    const h = findHeading(s || "", ref, lg);
    app.workspace.getLeaf(false).openFile(f, h ? { eState: { subpath: "#" + h.text } } : {});
  };
  class Help extends ob.Modal {
    constructor(lg) { super(app); this.lg = lg; this.text = ""; this.comp = new ob.Component(); this.query = ""; this.items = []; this.sel = 0; this.item = null; }
    async onOpen() {
      this.comp.load();
      const m = this.modalEl; m.style.width = "min(760px, 92vw)"; m.style.height = "min(720px, 86vh)"; m.style.maxHeight = "86vh";
      const c = this.contentEl; c.style.cssText = "display:flex;flex-direction:column;height:100%;overflow:hidden";
      // titlu și comutatorul de limbă (rămân mereu sus)
      const h = c.createDiv(); h.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:4px";
      const ic = h.createSpan(); ob.setIcon(ic, "life-buoy"); ic.style.cssText = "display:inline-flex;color:var(--interactive-accent)";
      this.titleTx = h.createSpan(); this.titleTx.style.cssText = "font-size:1.2em;font-weight:600;flex:1";
      this.langEl = h.createDiv(); this.langEl.style.cssText = "display:flex;gap:2px;font-size:0.75em;border:1px solid var(--background-modifier-border);border-radius:6px;padding:2px;margin-right:28px";
      this.sub = c.createDiv(); this.sub.style.cssText = "color:var(--text-muted);font-size:0.9em;line-height:1.4;margin-bottom:12px";
      // vizualizarea „căutare”
      this.searchView = c.createDiv(); this.searchView.style.cssText = "display:flex;flex-direction:column;flex:1;min-height:0";
      this.input = this.searchView.createEl("input", { type: "text" }); this.input.style.cssText = "width:100%;margin-bottom:10px";
      this.list = this.searchView.createDiv(); this.list.style.cssText = "flex:1;overflow-y:auto;min-height:0";
      this.input.addEventListener("input", () => { this.query = this.input.value; this.sel = 0; this.renderList(); });
      this.input.addEventListener("keydown", e => {
        if (e.key === "ArrowDown") { e.preventDefault(); this.sel = Math.min(this.sel + 1, this.items.length - 1); this.highlight(); }
        else if (e.key === "ArrowUp") { e.preventDefault(); this.sel = Math.max(this.sel - 1, 0); this.highlight(); }
        else if (e.key === "Enter") { e.preventDefault(); if (this.items[this.sel]) this.choose(this.items[this.sel]); }
      });
      // vizualizarea „răspuns”
      this.answerView = c.createDiv(); this.answerView.style.cssText = "display:none;flex-direction:column;flex:1;min-height:0";
      // autor și contact, discret
      this.foot = c.createDiv(); this.foot.style.cssText = "font-size:0.75em;color:var(--text-faint);padding-top:10px";
      await this.setLanguage(this.lg);
      setTimeout(() => this.input.focus(), 0);
    }
    async setLanguage(lg) {
      this.lg = lg; setLang(lg);
      this.text = await read(lg) || await read(lg === "en" ? "ro" : "en");
      this.titleTx.setText(t("title", lg)); this.sub.setText(t("sub", lg)); this.input.placeholder = t("ph", lg);
      this.langEl.empty();
      ["ro", "en"].forEach(l => {
        const b = this.langEl.createSpan({ text: l.toUpperCase() });
        b.style.cssText = "cursor:pointer;padding:1px 7px;border-radius:4px;" + (l === lg ? "background:var(--background-modifier-hover);color:var(--text-normal);font-weight:600" : "color:var(--text-faint)");
        b.onclick = () => { if (l !== this.lg) this.setLanguage(l); };
      });
      this.foot.empty(); this.foot.appendText(t("by", lg));
      const link = (text, url) => { const a = this.foot.createEl("a", { text, href: url }); a.style.color = "var(--text-muted)"; a.onclick = e => { e.preventDefault(); window.open(url); }; };
      link("George Mihai", "https://www.georgemihai.com"); this.foot.appendText(" · "); link("hi@georgemihai.com", "mailto:hi@georgemihai.com");
      // dacă era deschis un răspuns la o întrebare frecventă, îl arată în limba nouă; altfel revine la listă
      if (this.item && this.item.kind === "qa") this.showAnswer(qaItems(lg)[this.item.i]);
      else if (this.item) this.backToList();
      else this.renderList();
    }
    renderList() {
      this.items = suggestions(this.query, this.text, this.lg); this.list.empty(); this.rows = [];
      this.items.forEach((x, i) => {
        const r = this.list.createDiv(); r.style.cssText = "padding:8px 12px;border-radius:6px;cursor:pointer";
        r.createDiv({ text: x.title });
        const hint = hintOf(x, this.lg); if (hint) { const s = r.createEl("small", { text: hint }); s.style.cssText = "color:var(--text-muted)"; }
        r.onmouseenter = () => { this.sel = i; this.highlight(); };
        r.onclick = () => this.choose(x);
        this.rows.push(r);
      });
      this.highlight();
    }
    highlight() {
      (this.rows || []).forEach((r, i) => { r.style.background = i === this.sel ? "var(--background-modifier-hover)" : ""; });
      const r = this.rows && this.rows[this.sel]; if (r && r.scrollIntoView) r.scrollIntoView({ block: "nearest" });
    }
    choose(x) { if (x.kind === "none") { this.close(); openInGhid(null, this.lg, this.text); } else this.showAnswer(x); }
    async showAnswer(item) {
      this.item = item; const lg = this.lg;
      this.searchView.style.display = "none"; this.sub.style.display = "none";
      const v = this.answerView; v.empty(); v.style.display = "flex";
      const back = v.createEl("a", { text: t("back", lg), href: "#" }); back.style.cssText = "font-size:0.9em;margin-bottom:10px";
      back.onclick = e => { e.preventDefault(); this.backToList(); };
      const q = v.createDiv({ text: item.title }); q.style.cssText = "font-weight:600;font-size:1.05em;margin-bottom:8px";
      const body = v.createDiv(); body.style.cssText = "flex:1;overflow-y:auto;min-height:0;padding-right:4px";
      const src = (findGhid(lg) || {}).path || "";
      const md = (s, el) => (ob.MarkdownRenderer.render ? ob.MarkdownRenderer.render(app, s, el, src, this.comp) : ob.MarkdownRenderer.renderMarkdown(s, el, src, this.comp));
      // clic pe un link din răspuns: comandă, secțiune din ghid, setări, notă, căutare sau site
      body.addEventListener("click", e => {
        const a = e.target && e.target.closest ? e.target.closest("a") : null; if (!a) return;
        const href = a.getAttribute("data-href") || a.getAttribute("href") || "";
        e.preventDefault(); e.stopPropagation();
        const m = href.match(/ghid=(\w+)=(.*)$/);
        if (m) return this.runLink(m[1], decodeURIComponent(m[2]));
        if (/^(https?:|mailto:)/i.test(href)) return window.open(href);
        if (href) { this.close(); app.workspace.openLinkText(href, src, "tab"); }
      }, true);
      if (item.a) await md(linkify(item.a), body.createDiv());
      if (item.acts && item.acts.length) {
        const ar = body.createDiv(); ar.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 4px";
        item.acts.forEach(a => {
          const b = ar.createEl("button"); b.style.cssText = "display:inline-flex;align-items:center;gap:6px";
          const ic = b.createSpan(); ob.setIcon(ic, a.icon); ic.style.cssText = "display:inline-flex;color:var(--interactive-accent)";
          b.appendText(a.label[lg === "en" ? 1 : 0]);
          if (a.url) { const e = b.createSpan(); ob.setIcon(e, "arrow-up-right"); e.style.cssText = "display:inline-flex;opacity:.6"; }
          b.onclick = () => {
            if (a.stay) return this.setLanguage(lg === "en" ? "ro" : "en");
            if (a.url) return window.open(a.url);
            this.close();
            if (a.guide) return openInGhid(a.guide, lg, this.text);
            setTimeout(() => { try { a.run(lg); } catch (e) { new ob.Notice(e.message); } }, 60);
          };
        });
      }
      if (item.kind === "rand") await md("**" + item.title + "**: " + item.text, body.createDiv());
      const sec = item.kind === "rand" ? "" : section(this.text, item.ref, lg);
      if (sec) { const d = body.createEl("details"); if (!item.a) d.open = true; d.createEl("summary", { text: t("fromGhid", lg) }); await md(sec, d.createDiv()); }
      const row = v.createDiv(); row.style.cssText = "display:flex;gap:8px;justify-content:flex-end;padding-top:12px;flex-wrap:wrap";
      const btn = (label, fn, cta) => { const b = row.createEl("button", { text: label }); if (cta) b.addClass("mod-cta"); b.onclick = fn; };
      btn(t("other", lg), () => { this.query = ""; this.input.value = ""; this.backToList(); });
      btn(t("open", lg), () => { this.close(); openInGhid(item.ref, lg, this.text); }, true);
    }
    runLink(t, v) {
      const lg = this.lg, text = this.text;
      this.close();
      setTimeout(() => {
        try {
          if (t === "cmd") cmd(v, lg, v.startsWith("obsidian-pandoc"));
          else if (t === "sec") openInGhid([v], lg, text);
          else if (t === "set") settings(v);
          else if (t === "note") openNote(v, lg);
          else if (t === "search") search(v);
          else if (t === "reveal") reveal(v);
          else if (t === "os") showOS(basePath(), lg);
          else if (t === "guide") { const f = findGhid(v); if (f) app.workspace.getLeaf("tab").openFile(f); }
        } catch (e) { new ob.Notice(e.message); }
      }, 60);
    }
    backToList() {
      this.item = null;
      this.answerView.style.display = "none"; this.answerView.empty();
      this.searchView.style.display = "flex"; this.sub.style.display = "";
      this.sel = 0; this.renderList(); setTimeout(() => this.input.focus(), 0);
    }
    onClose() { this.comp.unload(); this.contentEl.empty(); }
  }
  const ask = lg => new Help(lg || getLang()).open();

  // ---------- comenzile și butonul ----------
  const T = app.plugins.plugins["templater-obsidian"];
  const cmds = [
    { id: "ghid-ajutor:intreaba", name: "Texere: Ajutor", icon: "life-buoy", callback: () => ask("ro") },
    { id: "ghid-ajutor:help", name: "Texere: Help", icon: "life-buoy", callback: () => ask("en") },
  ];
  cmds.forEach(c => { try { app.commands.addCommand(c); } catch (e) { try { T?.addCommand({ id: c.id.replace(":", "-"), name: c.name, callback: c.callback }); } catch (e2) {} } });
  try { T.addRibbonIcon("life-buoy", "Texere · Ajutor / Help", () => ask()); } catch (e) {}
  window.__ghidAsk = ask;
}
%>
