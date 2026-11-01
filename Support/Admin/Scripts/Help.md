<%*
// Butonul „Ajutor” / „Help”: răspunde la întrebări pe baza ghidului, în română sau engleză. Versiune 3.1.0 (2026-11-01)
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
    ro: { names: ["02. Texere – Vault-ul cercetătorului.md", "01. Texere – Cercetare, lectură și scris, într-un singur loc.md", "Vault-ul cercetătorului.md", "Cercetare, lectură și scris, într-un singur loc.md", "Cercetarea într-un singur loc.md", "Ghid de cercetare.md", "Ghid pentru eficientizarea procesului de cercetare.md"], re: /Termeni folosiți în ghid/, step: ["**Pasul 1", "**Pasul 2"] },
    en: { names: ["01. Texere – The Researcher's Vault.md", "02. Texere – Research, reading and writing, in one place.md", "The Researcher's Vault.md", "Research, reading and writing, in one place.md", "Research in One Place.md"], re: /Terms used in this guide/, step: ["**Step 1", "**Step 2"] },
  };
  const findGhid = lg => {
    const g = GHIDS[lg];
    const strip = b => b.replace(/^\d+[.)]\s*/, "").replace(/^(Texere|Topos)\s*[–—-]\s*/, "");
    for (const n of g.names) { const f = app.vault.getAbstractFileByPath(n) || app.vault.getMarkdownFiles().find(x => x.name === n || strip(x.basename) + ".md" === n); if (f && f.stat && f.stat.size > 0) return f; }
    return app.vault.getMarkdownFiles().find(f => (app.metadataCache.getFileCache(f)?.headings || []).some(h => g.re.test(h.heading))) || null;
  };

  // ---------- Întrebări frecvente: [secțiunea din ghid (număr; „step1” = Pasul 1), [întrebare, cuvinte-cheie, răspuns] RO, [...] EN] ----------
  const QA = [
    [ ["step1"], ["Cum configurez vault-ul pe un laptop nou?", "configurare instalare laptop nou prima data incep start setari", "Copiază folderul vault-ului întreg, deschide-l cu **Open folder as vault** și alege **Trust author and enable plugins**. Configurarea pornește singură și îți arată pașii; dacă lipsește un plugin (ex. PDF++), fereastra **Texere · The Researcher's Vault** îl instalează dintr-un clic. Ca s-o rulezi din nou: **Ctrl/Cmd + P** → {{cmd:texere:setup|Texere · The Researcher's Vault: Setup}}."],
                ["How do I set up the vault on a new laptop?", "setup set up install new laptop first time start settings configure", "Copy the whole vault folder, open it with **Open folder as vault** and choose **Trust author and enable plugins**. The setup starts by itself and shows you each step; if a plugin is missing (e.g. PDF++), the **Texere · The Researcher's Vault** window installs it in one click. To run it again: **Ctrl/Cmd + P** → {{cmd:texere:setup|Texere · The Researcher's Vault: Setup}}."]],
    [ ["step1"], ["Ceva nu mai funcționează. Ce fac?", "nimic nu merge nu functioneaza stricat problema eroare repar reparare ajutor verific lipseste", "Deschide un tab nou: sus îți arată ce trebuie reparat, cu un buton. Sau {{set:texere|Settings → Texere · The Researcher's Vault}}: ce e pornit, oprit sau lipsește. Apoi rulează din nou configurarea: {{cmd:texere:setup|Texere · The Researcher's Vault: Setup}}. Dacă problema rămâne, caută mesajul în {{sec:8.2|tabelul de erori}}."],
                ["Something stopped working. What do I do?", "nothing works not working broken problem error fix repair help check missing", "Open a new tab: at the top it shows what needs fixing, with a button. Or {{set:texere|Settings → Texere · The Researcher's Vault}}: what's on, off or missing. Then run the setup again: {{cmd:texere:setup|Texere · The Researcher's Vault: Setup}}. If the problem persists, look up the message in {{sec:8.2|the error table}}."]],
    [ ["1.2", "Pluginurile", "plugins"], ["Ce fac cele trei pluginuri Texere?", "pluginuri plugin texere sources surse export researcher vault ce fac rol diferenta trei", "**Texere · The Researcher's Vault** configurează vault-ul, verifică ce lipsește, pune panoul în fiecare tab nou și are butonul Ajutor. **Texere · Sources** adaugă surse (din cataloage, din Zotero sau dintr-un PDF), arată citările în stilul ales și aduce evidențierile în note. **Texere · Export** face PDF, Word, LaTeX, HTML sau Markdown, cu citări, bibliografie și cuprins. Le vezi pe toate în {{set:texere|Settings → Texere · The Researcher's Vault}}."],
                ["What do the three Texere plugins do?", "plugins plugin texere sources export researcher vault what do role difference three", "**Texere · The Researcher's Vault** sets the vault up, checks what's missing, puts the panel in every new tab and has the Help button. **Texere · Sources** adds sources (from catalogs, from Zotero or from a PDF), shows citations in your style and brings highlights into your notes. **Texere · Export** makes PDF, Word, LaTeX, HTML or Markdown, with citations, bibliography and contents. You see all of them in {{set:texere|Settings → Texere · The Researcher's Vault}}."]],
    [ ["1.2", "Pluginurile", "plugins"], ["Ce e panoul din tab-ul nou?", "tab nou panou pagina goala ultimele fisiere deschise actiuni adauga sursa export probleme", "Fiecare tab nou arată ultimele 5 fișiere deschise, butoanele **Adaugă o sursă**, **Exportă** și **Ajutor**, și ce trebuie reparat în vault sau în setări, cu un buton care repară. Când nu e nimic de reparat, nu vezi nimic acolo."],
                ["What is the panel in a new tab?", "new tab panel empty page last recent files opened actions add source export problems dashboard", "Every new tab shows your last 5 files, the **Add a source**, **Export** and **Help** buttons, and anything that needs fixing in the vault or the settings, with a button that fixes it. When nothing needs fixing, you see nothing there."]],
    [ ["6", "export", "export"], ["Exportul nu merge sau nu găsesc butonul Exportă", "export exportul nu merge porneste buton exporta pdf word lipseste comanda", "Deschide nota și apasă **Exportă** în colțul din dreapta-jos (butonul apare doar când e deschisă o notă). Dacă lipsește, pornește **Texere · Export** din {{set:texere|Settings → Texere · The Researcher's Vault}}. PDF și Word nu au nevoie de alt program."],
                ["Export doesn't work or I can't find the Export button", "export not working button missing command pdf word", "Open the note and click **Export** at the bottom right (it shows only while a note is open). If it's missing, turn on **Texere · Export** in {{set:texere|Settings → Texere · The Researcher's Vault}}. PDF and Word need no other program."]],
    [ ["6", "export", "export"], ["Lipsește bibliografia sau apare „negăsite: @…”", "bibliografie lipseste citation not found negasite citare referinte", "Texere face bibliografia singur la export, din sursele citate în notă. Dacă în fereastra exportului apare „negăsite: @…”, acel citekey nu e în bibliografia ta: scrie `@` și alege sursa din listă (așa e scris corect) sau adaug-o cu {{cmd:texere-sources:sources-search|Texere · Surse}}. Dacă tot nu merge, {{cmd:texere-sources:sources-rebuild-bib|refă bibliografia din note}}."],
                ["The bibliography is missing or \"not found: @…\" appears", "bibliography missing citation not found cite references", "Texere builds the bibliography itself when you export, from the sources cited in the note. If the export window shows “not found: @…”, that citekey isn't in your bibliography: type `@` and pick the source from the list (that spells it right) or add it with {{cmd:texere-sources:sources-search|Texere · Sources}}. If it still fails, {{cmd:texere-sources:sources-rebuild-bib|rebuild the bibliography from notes}}."]],
    [ ["8.2", "eroare", "error"], ["Fontul din fișierul exportat e altul", "font alt diferit times arial lipsa instalat export arata", "Exportul folosește fontul ales în fereastra exportului (**Textul → Font**); lista arată doar fonturile instalate pe acest laptop. Un fișier Word deschis pe alt calculator folosește fonturile acelui calculator."],
                ["The exported file has a different font", "font different times arial missing installed export looks", "Export uses the font chosen in the export window (**Text → Font**); the list shows only the fonts installed on this laptop. A Word file opened on another computer uses that computer's fonts."]],
    [ ["8.1", "manual", "manual"], ["Nu găsesc fișierul exportat", "gasesc fisier exportat unde salvat folder export", "După export, mesajul are butonul **Deschide**. Fișierele ajung în folderul exportului: {{set:texere-export|Settings → Texere · Export → Folderul exportului}} (04. Export sau un folder ales de tine, chiar și în afara vault-ului)."],
                ["I can't find the exported file", "find exported file where saved folder export", "After exporting, the message has an **Open** button. Files go to the export folder: {{set:texere-export|Settings → Texere · Export → Export folder}} (04. Export or a folder you chose, even outside the vault)."]],
    [ ["8.2", "eroare", "error"], ["Lipsesc comenzile Texere sau PDF++", "lipsesc comenzi pluginuri plugin texere surse sources export pdf activare trust", "Deschide {{set:texere|Settings → Texere · The Researcher's Vault}}: pornește ce e oprit și apasă **Instalează și pornește** la ce lipsește. Dacă nu merge niciun plugin: {{set:community-plugins|Settings → Community plugins}} → **Turn on community plugins**. Verifică și că ai copiat vault-ul întreg, cu folderul ascuns `.obsidian`."],
                ["The Texere or PDF++ commands are missing", "missing commands plugins plugin texere sources export pdf enable trust", "Open {{set:texere|Settings → Texere · The Researcher's Vault}}: turn on what's off and click **Install and turn on** for what's missing. If no plugin works: {{set:community-plugins|Settings → Community plugins}} → **Turn on community plugins**. Also check that you copied the whole vault, including the hidden `.obsidian` folder."]],
    [ ["3.1", "Cauți", "Search"], ["Cum adaug o sursă (carte sau articol)?", "adaug sursa carte articol referinta import doi isbn arxiv cauta catalog", "Apasă {{cmd:texere-sources:sources-search|Texere · Surse}} (iconița cu cărți din stânga), scrie titlul, autorul, DOI-ul sau ISBN-ul, alege sursa și apasă **Adaugă în vault**. Nota apare în Literature Notes, iar PDF-ul gratuit, dacă există, în Documents."],
                ["How do I add a source (book or article)?", "add source book article reference import doi isbn arxiv search catalog", "Click {{cmd:texere-sources:sources-search|Texere · Sources}} (the books icon on the left), type the title, author, DOI or ISBN, pick the source and click **Add to vault**. The note appears in Literature Notes, and the free PDF, if there is one, in Documents."]],
    [ ["3.1", "Cauți", "Search"], ["Sursa mea nu are DOI sau ISBN", "fara doi isbn editie veche manual date nu gasesc catalog", "În {{cmd:texere-sources:sources-search|Texere · Surse}}, fila **Lipește** primește o citare copiată (ex. din Google Scholar), iar fila **Introdu manual** te lasă să completezi tu datele."],
                ["My source has no DOI or ISBN", "no without doi isbn old edition manual data not found catalog", "In {{cmd:texere-sources:sources-search|Texere · Sources}}, the **Paste** tab takes a copied citation (e.g. from Google Scholar), and the **Enter manually** tab lets you fill in the details yourself."]],
    [ ["3.2", "Zotero", "Zotero"], ["Cum import din Zotero, cu PDF-urile și evidențierile?", "zotero import biblioteca colectii evidentieri highlights pdf adnotari", "Deschide Zotero, apoi {{cmd:texere-sources:sources-zotero-import|Texere · Surse → fila Zotero}}: bifezi ce vrei (sursele cu evidențieri au ✎) și apeși **Importă**. Prima dată, în Zotero: **Setări → Avansat** → bifează **Permite altor aplicații de pe acest computer să comunice cu Zotero**. Ce etichetă primește fiecare culoare alegi în {{set:texere-sources|Settings → Texere · Sources → Cataloage → Zotero}}. Recomandat: tot acolo, o cheie Zotero; atunci importul merge și cu Zotero închis."],
                ["How do I import from Zotero, with PDFs and highlights?", "zotero import library collections highlights pdf annotations", "Open Zotero, then {{cmd:texere-sources:sources-zotero-import|Texere · Sources → the Zotero tab}}: tick what you want (items with highlights show ✎) and click **Import**. The first time, in Zotero: **Settings → Advanced** → tick **Allow other applications on this computer to communicate with Zotero**. Which tag each color becomes is set in {{set:texere-sources|Settings → Texere · Sources → Catalogs → Zotero}}. Recommended: add a Zotero key there too; then import works with Zotero closed."]],
    [ ["3.3", "browser", "browser"], ["Cum adaug o sursă din browser cu butonul Zotero?", "zotero connector browser chrome firefox safari buton import pagina", "Instalează [Zotero Connector](https://www.zotero.org/download/connectors) și pornește **Butonul Zotero din browser** în {{set:texere-sources|Settings → Texere · Sources → Cataloage → Zotero}}. Cu Obsidian deschis, apeși butonul pe pagina articolului: cu Zotero deschis, sursa intră în Zotero și apoi în vault; cu Zotero închis, direct în vault."],
                ["How do I add a source from the browser with the Zotero button?", "zotero connector browser chrome firefox safari button import page", "Install [Zotero Connector](https://www.zotero.org/download/connectors) and turn on **Zotero browser button** in {{set:texere-sources|Settings → Texere · Sources → Catalogs → Zotero}}. With Obsidian open, click the button on the article's page: with Zotero open, the source goes into Zotero and then into the vault; with Zotero closed, straight into the vault."]],
    [ ["3.3", "browser", "browser"], ["Butonul Zotero nu trimite sursa sau salvează o pagină web", "zotero connector nu trimite merge functioneaza date lipsa translators reset pagina web", "Vezi starea în {{set:texere-sources|Settings → Texere · Sources → Cataloage → Zotero}}. Pe Mac, dacă închizi fereastra Zotero, aplicația rămâne pornită: folosește **Quit Zotero** (Cmd + Q). Dacă salvează o pagină web, resetează translatorii din setările extensiei ({{sec:3.3|pașii sunt în ghid}})."],
                ["The Zotero button doesn't send the source or saves a web page", "zotero connector not sending working data missing translators reset web page", "See its state in {{set:texere-sources|Settings → Texere · Sources → Catalogs → Zotero}}. On a Mac, closing Zotero's window doesn't quit it: use **Quit Zotero** (Cmd + Q). If it saves a web page, reset the translators in the extension's settings ({{sec:3.3|the steps are in the guide}})."]],
    [ ["3.4", "PDF", "PDF"], ["Cum atașez un PDF la o sursă?", "atasez pdf atasament attachment document fisier am deja catalog", "Deschide PDF-ul în Obsidian și rulează {{cmd:texere-sources:sources-catalog|Texere · Surse · Adaugă acest PDF ca sursă}}: alegi sursa, iar PDF-ul se atașează și se mută în Documents. Pentru o sursă fără PDF, deschide-i nota și rulează {{cmd:texere-sources:sources-find-pdf|Caută PDF-ul gratuit}}. De mână: în proprietatea **attachment**, scrie `\x5B[` și alege fișierul."],
                ["How do I attach a PDF to a source?", "attach pdf attachment document file already have catalog", "Open the PDF in Obsidian and run {{cmd:texere-sources:sources-catalog|Texere · Sources · Add this PDF as a source}}: pick the source, and the PDF is attached and moved to Documents. For a source without a PDF, open its note and run {{cmd:texere-sources:sources-find-pdf|Find the free PDF}}. By hand: in the **attachment** property, type `\x5B[` and pick the file."]],
    [ ["3", "Administrarea", "Managing"], ["Ce sunt sursele din Literature Notes? Le pot șterge?", "exemple exemplu surse sterg sterge stergere documents demo model craig dummett vica", "Sursele care sunt deja în {{reveal:01. Sources/Literature Notes|Literature Notes}} sunt exemple, păstrate ca să vezi cum arată o notă de literatură. După configurare le poți șterge, împreună cu PDF-urile lor din {{reveal:01. Sources/Documents|Documents}}."],
                ["What are the sources in Literature Notes? Can I delete them?", "examples example sources delete remove documents demo sample craig dummett vica", "The sources already in {{reveal:01. Sources/Literature Notes|Literature Notes}} are examples, kept to show what a literature note looks like. After setup you can delete them, along with their PDFs in {{reveal:01. Sources/Documents|Documents}}."]],
    [ ["4", "Lectura", "Reading"], ["Cum evidențiez pasaje în PDF?", "evidentiez subliniez highlight pasaj pdf culoare copiez lectura", "Deschide PDF-ul din nota sursei, selectează pasajul, alege o culoare din paleta PDF++ și lipește-l în notă (Ctrl/Cmd + V). Pasajul începe cu eticheta culorii și se termină cu citarea cu pagina și un link înapoi la PDF."],
                ["How do I highlight passages in a PDF?", "highlight underline passage pdf color colour copy reading", "Open the PDF from the source's note, select the passage, choose a color from the PDF++ palette and paste it into the note (Ctrl/Cmd + V). The passage starts with the color's tag and ends with the citation, with its page and a link back to the PDF."]],
    [ ["4", "Lectura", "Reading"], ["Evidențierile din Zotero sau din alt program nu apar în notă", "evidentieri highlights zotero preview acrobat alt program nu apar lipsesc import adnotari", "Texere le aduce singur când adaugi PDF-ul. Pentru cele făcute după: deschide PDF-ul sau nota și rulează {{cmd:texere-sources:sources-import-highlights|Texere · Surse · Importă evidențierile din PDF}}. Fiecare primește eticheta celei mai apropiate culori; dacă sunt făcute sub alt nume, Texere te întreabă dacă sunt ale tale."],
                ["Highlights from Zotero or another app don't appear in the note", "highlights zotero preview acrobat other app missing not showing import annotations", "Texere brings them in by itself when you add the PDF. For later ones: open the PDF or the note and run {{cmd:texere-sources:sources-import-highlights|Texere · Sources · Import highlights from PDF}}. Each gets the tag of the nearest color; if they were made under another name, Texere asks whether they're yours."]],
    [ ["4", "Lectura", "Reading"], ["Ce înseamnă culorile de evidențiere?", "culori culoare roz maro turcoaz galben rosu verde albastru mov portocaliu gri fact claim agree disagree question definition word connection", "Roz = fapte și date, galben = afirmațiile și tezele autorului, roșu = nu sunt de acord, turcoaz = sunt de acord, albastru = legături, mov = întrebări, portocaliu = definiții, gri = termeni de reținut."],
                ["What do the highlight colors mean?", "colors colours color pink brown teal yellow red green blue purple orange grey gray fact claim agree disagree question definition word connection", "Pink = facts and data, yellow = the author's claims and theses, red = I disagree, teal = I agree, blue = connections, purple = questions, orange = definitions, grey = terms to remember."]],
    [ ["4", "Lectura", "Reading"], ["Cum găsesc toate ideile de un anumit tip (ex. cu care nu sunt de acord)?", "gasesc caut idei eticheta tag disagree agree cautare toate", "Caută eticheta în bara de căutare, de exemplu {{search:tag:#disagree|tag:#disagree}}."],
                ["How do I find all ideas of one type (e.g. the ones I disagree with)?", "find search ideas tag disagree agree all", "Search for the tag in the search bar, for example {{search:tag:#disagree|tag:#disagree}}."]],
    [ ["5.1", "șablon", "template"], ["Cum încep un articol nou?", "incep articol nou lucrare eseu sablon template new article scriu", "Duplică șablonul {{note:Support/Templates/New article.md|New article}} din folderul Support/Templates, redenumește copia și completează proprietatea **title**."],
                ["How do I start a new paper?", "start new paper article essay template new article write", "Duplicate the {{note:Support/Templates/New article.md|New article}} template in the Support/Templates folder, rename the copy and fill in the **title** property."]],
    [ ["5.1", "șablon", "template"], ["Cum fac lucrarea de licență sau de disertație după ghidul facultății?", "licenta disertatie lucrare facultate filosofie ub ghid redactare coperta sablon teza", "Duplică {{note:Support/Templates/Licență – Facultatea de Filosofie UB.md|Licență}} sau {{note:Support/Templates/Disertație – Facultatea de Filosofie UB.md|Disertație}} din Support/Templates și completează title, autor, coordonator și an. La export, șablonul facultății se alege singur: copertă, cuprins și pagina după ghid."],
                ["How do I write a bachelor's or master's thesis by the faculty's guide?", "thesis bachelor master dissertation faculty philosophy ub guide cover template licenta disertatie", "Duplicate {{note:Support/Templates/Licență – Facultatea de Filosofie UB.md|Licență}} or {{note:Support/Templates/Disertație – Facultatea de Filosofie UB.md|Disertație}} in Support/Templates and fill in title, autor, coordonator and an. On export, the faculty template is picked by itself: cover, contents and the page by the guide."]],
    [ ["5.2", "Citarea", "Citing"], ["Cum citez o sursă în text?", "citez citare citat referinta text pagina citekey paranteze", "Scrie `@` și un cuvânt din autor sau titlu, apoi alege sursa: Texere scrie `[@citekey]`. Cu pagina: `[@citekey, p. 34]`. În notă și la export devine, de exemplu, (Craig, 2002, p. 34)."],
                ["How do I cite a source in the text?", "cite citation quote reference text page citekey brackets", "Type `@` and a word from the author or title, then pick the source: Texere writes `[@citekey]`. With the page: `[@citekey, p. 34]`. In the note and on export it becomes, for example, (Craig, 2002, p. 34)."]],
    [ ["5.2", "Citarea", "Citing"], ["Unde găsesc citekey-ul unei surse?", "citekey cod sursa unde gasesc nume nota id", "Scrie `@` într-o notă: Texere îți arată sursele și scrie citekey-ul pentru tine. Citekey-ul unei surse e proprietatea `id` din nota ei (folderul Literature Notes)."],
                ["Where do I find a source's citekey?", "citekey code source where find note name id", "Type `@` in a note: Texere shows your sources and writes the citekey for you. A source's citekey is the `id` property of its note (Literature Notes folder)."]],
    [ ["9", "Întrebări", "questions"], ["Pot folosi alt stil de citare (ex. Chicago)?", "stil citare chicago apa mla csl schimb", "Da. Dă clic pe stilul din dreapta jos a ferestrei (ex. **APA**) și alege altul (Chicago, MLA, Harvard, IEEE). Citările din notă și exportul se schimbă împreună; alegerea se salvează în proprietatea `csl` a notei. Pentru un stil care nu e în listă, alege **Adaugă un stil…** din același meniu, caută-l după nume (ex. Vancouver sau numele unei reviste) și alege-l: se instalează și se folosește în notă."],
                ["Can I use another citation style (e.g. Chicago)?", "citation style chicago apa mla csl change", "Yes. Click the style at the bottom right of the window (e.g. **APA**) and choose another (Chicago, MLA, Harvard, IEEE). The citations in the note and the export change together; the choice is saved in the note's `csl` property. For a style that isn't in the list, choose **Add a style…** in the same menu, search by name (e.g. Vancouver, or a journal's name) and pick it: it's installed and used in the note."]],
    [ ["6", "export", "export"], ["Cum export în Word sau PDF?", "export word docx pdf latex html markdown salvez predau document", "Deschide nota și apasă **Exportă** în dreapta-jos (sau {{cmd:texere-export:export-pick|Texere · Export}} din bara din stânga). Alege formatul, verifică previzualizarea și apasă **Exportă**. Bibliografia se face singură, din sursele citate."],
                ["How do I export to Word or PDF?", "export word docx pdf latex html markdown save submit document", "Open the note and click **Export** at the bottom right (or {{cmd:texere-export:export-pick|Texere · Export}} in the left sidebar). Choose the format, check the preview and click **Export**. The bibliography is made by itself, from the sources you cite."]],
    [ ["6", "export", "export"], ["Cum schimb fontul, marginile, numerele paginilor sau cuprinsul?", "font margini cuprins aspect formatare dimensiune spatiere pagina numere numerotare pagina noua capitol aliniere", "În fereastra exportului: **Pagina** (format, margini, numerele paginilor și de la ce număr încep), **Textul** (font, mărime, spațiere, aliniere), **Documentul** (titlul, cuprinsul) și **Mai multe opțiuni** (fiecare secțiune H2 de la o pagină nouă, culorile). Cuprinsul în notă: {{cmd:texere-export:export-insert-toc|Texere · Export · Pune cuprinsul aici}}."],
                ["How do I change the font, margins, page numbers or contents?", "font margins contents layout formatting size spacing page numbers numbering new page chapter alignment", "In the export window: **Page** (size, margins, page numbers and the number they start from), **Text** (font, size, spacing, alignment), **Document** (title, contents) and **More options** (each H2 section on a new page, colors). Contents in the note: {{cmd:texere-export:export-insert-toc|Texere · Export · Insert the contents here}}."]],
    [ ["6", "export", "export"], ["Imaginile nu apar în documentul exportat", "imagini imagine poze nu apar export grafic tabel", "Salvează imaginea în vault și insereaz-o cu link Obsidian, de exemplu `!\x5B[nume imagine.png]]`."],
                ["Images don't appear in the exported document", "images image pictures missing export figure table", "Save the image in the vault and insert it with an Obsidian link, for example `!\x5B[image name.png]]`."]],
    [ ["2", "Structura", "structure"], ["Ce foldere sau note nu am voie să modific?", "modific sterg redenumesc foldere voie interzis media admin bibliography sources", "Nu redenumi și nu muta folderele 01. Sources (cu Documents și Literature Notes) și cele din Support. În notele din Literature Notes nu schimba proprietatea `id` (citekey-ul). Dacă vrei alte foldere pentru surse, schimbă-le și în {{set:texere-sources|Settings → Texere · Sources → Nume și foldere}}."],
                ["Which folders or notes must I not change?", "change delete rename folders allowed forbidden media admin bibliography sources", "Don't rename or move 01. Sources (with Documents and Literature Notes) or the Support folders. In the Literature Notes, don't change the `id` property (the citekey). If you want other folders for sources, change them in {{set:texere-sources|Settings → Texere · Sources → Names & folders}} too."]],
    [ ["2", "Structura", "structure"], ["Ce este nota Philosophy?", "philosophy nota structura domeniu ramuri concepte teorii curente harta fields", "Nota {{note:Philosophy|Philosophy}} conține structura domeniului (ramuri, subdomenii, perioade, curente, teorii, concepte, autori). Folosește valorile ei când completezi proprietățile notelor. Dacă lipsește folderul Fields: {{set:texere|Settings → Texere · The Researcher's Vault}} → **Harta domeniilor** → **Creează harta**."],
                ["What is the Philosophy note?", "philosophy note structure field branches concepts theories movements map fields", "The {{note:Philosophy|Philosophy}} note holds the field's structure (branches, subdomains, periods, movements, theories, concepts, authors). Use its values when you fill in your notes' properties. If the Fields folder is missing: {{set:texere|Settings → Texere · The Researcher's Vault}} → **Map of fields** → **Create the map**."]],
    [ ["9", "Întrebări", "questions"], ["Ce versiune am și cum actualizez vault-ul?", "versiune actualizare actualizez update nou noua istoric schimbari", "Versiunea și schimbările sunt la {{sec:11|11. Istoric versiuni}}. Ca să actualizezi: copiază din vault-ul nou folderul Support și folderele `.obsidian/plugins/texere`, `texere-sources` și `texere-export`, fără să înlocuiești 01. Sources, 02. Notes, 03. Workspace și notele tale."],
                ["Which version do I have, and how do I update the vault?", "version update upgrade new history changes", "The version and the changes are in {{sec:11|11. Version history}}. To update: from the new vault, copy the Support folder and the folders `.obsidian/plugins/texere`, `texere-sources` and `texere-export`, without replacing 01. Sources, 02. Notes, 03. Workspace or your notes."]],
    [ ["8.2", "eroare", "error"], ["Configurarea nu a pornit singură", "configurare nu porneste singura automat trust plugin", "Deschide {{set:texere|Settings → Texere · The Researcher's Vault}} și pornește ce lipsește (Templater rulează configurarea), apoi rulează **Ctrl/Cmd + P** → {{cmd:texere:setup|Texere · The Researcher's Vault: Setup}}. Dacă pagina nu există, pornește pluginul **Texere · The Researcher's Vault** din {{set:community-plugins|Settings → Community plugins}}."],
                ["The setup didn't start by itself", "setup not starting start automatically trust plugin", "Open {{set:texere|Settings → Texere · The Researcher's Vault}} and turn on what's missing (Templater runs the setup), then run **Ctrl/Cmd + P** → {{cmd:texere:setup|Texere · The Researcher's Vault: Setup}}. If that page doesn't exist, turn on the **Texere · The Researcher's Vault** plugin in {{set:community-plugins|Settings → Community plugins}}."]],
    [ ["2", "Structura", "structure"], ["Am șters folderul Scripts sau Templates. Ce fac?", "sters scripts templates folder lipseste buton ajutor configurare laptop nou disparut recuperez original", "Copiază folderul din vault-ul original (copia primită inițial) în vault-ul tău, repornește Obsidian și {{cmd:texere:setup|rulează din nou configurarea}}."],
                ["I deleted the Scripts or Templates folder. What do I do?", "deleted scripts templates folder missing help button setup new laptop gone recover original", "Copy the folder from the original vault (the copy you first received) into your vault, restart Obsidian and {{cmd:texere:setup|run the setup again}}."]],
    [ ["9", "Întrebări", "questions"], ["Am șters din greșeală un text. Îl pot recupera?", "sters greseala recuperez recuperare pierdut text versiune file recovery", "Da: {{set:file-recovery|Settings → File recovery}}. Obsidian păstrează automat versiunile anterioare ale notelor."],
                ["I accidentally deleted some text. Can I get it back?", "deleted mistake accidentally recover recovery lost text version file recovery", "Yes: {{set:file-recovery|Settings → File recovery}}. Obsidian automatically keeps earlier versions of your notes."]],
    [ ["7", "Copii", "Backups"], ["Cum fac o copie de siguranță?", "copie siguranta backup salvare hard stick drive cloud", "Copiază periodic tot {{os:vault|folderul vault-ului}} pe un hard disk extern sau pe un stick USB (și, dacă nu ai date sensibile, în cloud)."],
                ["How do I make a backup?", "backup back up copy save hard drive stick usb cloud", "Regularly copy the whole {{os:vault|vault folder}} to an external hard drive or a USB stick (and, if you have no sensitive data, to the cloud)."]],
    [null, ["Cum schimb limba (română sau engleză)?", "limba engleza romana english schimb comutator traducere", "La începutul configurării alegi limba. O poți schimba oricând din comutatorul **RO / EN** din colțul ferestrei Ajutor sau al configurării, ori din {{set:texere|Settings → Texere · The Researcher's Vault}} → **Limba**. Ghidul în engleză este {{guide:en|Texere: The Researcher's Vault}}."],
           ["How do I switch the language (Romanian or English)?", "language english romanian switch change translation", "You choose the language at the start of the setup. You can change it any time with the **RO / EN** switch in the corner of the Help or setup window, or in {{set:texere|Settings → Texere · The Researcher's Vault}} → **Language**. The Romanian guide is {{guide:ro|Texere: Vault-ul cercetătorului}}."]],
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
    const t = app.vault.getAbstractFileByPath("Support/Templates/New article.md");
    if (!t) return notice("Nu găsesc șablonul Support/Templates/New article.", "I can't find the Support/Templates/New article template.", lg);
    const b0 = lg === "en" ? "New paper" : "Articol nou"; let n = b0, i = 2;
    while (app.vault.getAbstractFileByPath(n + ".md")) n = `${b0} ${i++}`;
    const f = await app.vault.copy(t, n + ".md"); app.workspace.getLeaf("tab").openFile(f);
  };
  const isWin = !!(ob.Platform && ob.Platform.isWin);
  const exportFolder = () => { const e = app.plugins.plugins["texere-export"]?.settings?.export; return String((e && e.folder) || "04. Export").trim(); };
  const showExportDir = lg => {
    let o = exportFolder(); if (o.startsWith("~")) { try { o = window.require("os").homedir() + o.slice(1); } catch (e) {} }
    showOS(/^(\/|[A-Za-z]:[\\/]|\\\\)/.test(o) ? o : basePath() + "/" + o, lg);
  };
  const A = {
    setup: { icon: "settings", label: ["Rulează configurarea", "Run the setup"], run: lg => cmd("texere:setup", lg) },
    core: { icon: "sliders-horizontal", label: ["Ce e pornit și ce lipsește", "What's on and what's missing"], run: () => settings("texere") },
    errors: { icon: "table", label: ["Vezi tabelul de erori", "See the error table"], guide: ["8.2", "eroare", "error"] },
    bib: { icon: "book-open", label: ["Refă bibliografia din note", "Rebuild the bibliography from notes"], run: lg => cmd("texere-sources:sources-rebuild-bib", lg) },
    keys: { icon: "library", label: ["Caută o sursă (Texere · Surse)", "Search a source (Texere · Sources)"], run: lg => cmd("texere-sources:sources-search", lg) },
    add: { icon: "file-plus", label: ["Adaugă o sursă", "Add a source"], run: lg => cmd("texere-sources:sources-search", lg) },
    paste: { icon: "clipboard-paste", label: ["Lipește o referință", "Paste a reference"], run: lg => cmd("texere-sources:sources-bibtex", lg) },
    zotero: { icon: "download", label: ["Descarcă Zotero Connector", "Download Zotero Connector"], url: "https://www.zotero.org/download/connectors" },
    zImport: { icon: "download", label: ["Importă din Zotero", "Import from Zotero"], run: lg => cmd("texere-sources:sources-zotero-import", lg) },
    srcSet: { icon: "sliders-horizontal", label: ["Setările Texere · Sources", "Texere · Sources settings"], run: () => settings("texere-sources") },
    hl: { icon: "highlighter", label: ["Importă evidențierile din PDF", "Import highlights from PDF"], run: lg => cmd("texere-sources:sources-import-highlights", lg) },
    uncat: { icon: "file-search", label: ["PDF-uri fără sursă", "PDFs without a source"], run: lg => cmd("texere-sources:sources-uncataloged", lg) },
    plugins: { icon: "puzzle", label: ["Deschide Community plugins", "Open Community plugins"], run: () => settings("community-plugins") },
    docs: { icon: "folder-open", label: ["Arată folderul Documents", "Show the Documents folder"], run: () => reveal("01. Sources/Documents") },
    refs: { icon: "folder-open", label: ["Arată folderul Literature Notes", "Show the Literature Notes folder"], run: () => reveal("01. Sources/Literature Notes") },
    disagree: { icon: "search", label: ["Caută #disagree", "Search #disagree"], run: () => search("tag:#disagree") },
    paper: { icon: "file-plus", label: ["Creează un articol nou", "Create a new paper"], run: lg => newPaper(lg) },
    tpl: { icon: "file-text", label: ["Deschide șablonul New article", "Open the New article template"], run: lg => openNote("Support/Templates/New article.md", lg) },
    licenta: { icon: "graduation-cap", label: ["Șablonul de licență", "The bachelor's thesis template"], run: lg => openNote("Support/Templates/Licență – Facultatea de Filosofie UB.md", lg) },
    disertatie: { icon: "graduation-cap", label: ["Șablonul de disertație", "The master's thesis template"], run: lg => openNote("Support/Templates/Disertație – Facultatea de Filosofie UB.md", lg) },
    styles: { icon: "external-link", label: ["Zotero Style Repository", "Zotero Style Repository"], url: "https://www.zotero.org/styles" },
    exportNote: { icon: "file-output", label: ["Exportă nota deschisă", "Export the open note"], run: lg => cmd("texere-export:export-note", lg, true) },
    exportPick: { icon: "file-output", label: ["Alege nota pe care o exporți", "Choose a note to export"], run: lg => cmd("texere-export:export-pick", lg) },
    exportSet: { icon: "sliders-horizontal", label: ["Setările exportului", "Export settings"], run: () => settings("texere-export") },
    exportDir: { icon: "folder-open", label: ["Arată folderul de export", "Show the export folder"], run: lg => showExportDir(lg) },
    toc: { icon: "list", label: ["Pune cuprinsul în nota deschisă", "Insert the contents in the open note"], run: lg => cmd("texere-export:export-insert-toc", lg, true) },
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
    "Cum configurez vault-ul pe un laptop nou?": ["setup", "core"],
    "Ceva nu mai funcționează. Ce fac?": ["core", "setup", "errors"],
    "Ce fac cele trei pluginuri Texere?": ["core"],
    "Exportul nu merge sau nu găsesc butonul Exportă": ["exportPick", "core"],
    "Lipsește bibliografia sau apare „negăsite: @…”": ["keys", "bib"],
    "Fontul din fișierul exportat e altul": ["exportSet"],
    "Nu găsesc fișierul exportat": ["exportDir", "exportSet"],
    "Lipsesc comenzile Texere sau PDF++": ["core", "plugins"],
    "Cum adaug o sursă (carte sau articol)?": ["add"],
    "Sursa mea nu are DOI sau ISBN": ["paste", "add"],
    "Cum import din Zotero, cu PDF-urile și evidențierile?": ["zImport", "srcSet"],
    "Cum adaug o sursă din browser cu butonul Zotero?": ["zotero", "srcSet"],
    "Butonul Zotero nu trimite sursa sau salvează o pagină web": ["srcSet"],
    "Cum atașez un PDF la o sursă?": ["uncat", "docs"],
    "Ce sunt sursele din Literature Notes? Le pot șterge?": ["refs", "docs"],
    "Cum evidențiez pasaje în PDF?": ["refs"],
    "Evidențierile din Zotero sau din alt program nu apar în notă": ["hl"],
    "Cum găsesc toate ideile de un anumit tip (ex. cu care nu sunt de acord)?": ["disagree"],
    "Cum încep un articol nou?": ["paper", "tpl"],
    "Cum fac lucrarea de licență sau de disertație după ghidul facultății?": ["licenta", "disertatie"],
    "Cum citez o sursă în text?": ["keys"],
    "Unde găsesc citekey-ul unei surse?": ["keys"],
    "Pot folosi alt stil de citare (ex. Chicago)?": ["styles"],
    "Cum export în Word sau PDF?": ["exportNote", "exportPick"],
    "Cum schimb fontul, marginile, numerele paginilor sau cuprinsul?": ["exportSet", "toc"],
    "Ce foldere sau note nu am voie să modific?": ["srcSet"],
    "Ce este nota Philosophy?": ["philo", "core"],
    "Ce versiune am și cum actualizez vault-ul?": ["versions"],
    "Configurarea nu a pornit singură": ["core", "setup"],
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
        if (/^(Scrii|Etap[aă]|You write|Stage)/.test(header) || cells.length < 2) return;
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
          if (t === "cmd") cmd(v, lg, v === "texere-export:export-note" || v === "texere-export:export-insert-toc");
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
    { id: "ghid-ajutor:help", name: "Texere · The Researcher's Vault: Help", icon: "life-buoy", callback: () => ask() },
  ];
  cmds.forEach(c => { try { app.commands.addCommand(c); } catch (e) { try { T?.addCommand({ id: c.id.replace(":", "-"), name: c.name, callback: c.callback }); } catch (e2) {} } });
  try { T.addRibbonIcon("life-buoy", getLang() === "ro" ? "Texere · Ajutor" : "Texere · Help", () => ask()); } catch (e) {}
  window.__ghidAsk = ask;
}
%>
