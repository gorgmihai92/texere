---
title: Texere
subtitle: Vault-ul cercetătorului
author: George Mihai
lang: ro
version: "3.2.0"
date: "Versiunea 3.2.0 · 3 noiembrie 2026"
---
*This guide is also available in English: [[Texere – The Researcher's Vault|Texere: The Researcher's Vault]].*

Cercetarea e împrăștiată. Sursele în Zotero, PDF-urile prin foldere, notițele pe hârtie sau în Word, ciornele pe două laptopuri. Texere le pune pe toate într-un singur vault Obsidian: surse, PDF-uri, notițe de lectură, idei, ciorne și lucrarea finală. Exemplele sunt din filosofie, dar merge pentru orice domeniu.

![[Fara si cu Obsidian (varianta 4).png]]

| Etapa | Fără Texere | Cu Texere |
| --- | --- | --- |
| Găsești o sursă | Zotero, browserul, Descărcări | Cauți după titlu, DOI sau ISBN ori o aduci din Zotero. Nota și PDF-ul vin cu ea |
| Citești | Sublinieri în PDF, notițe în Word | Pasajele subliniate intră în nota sursei, cu eticheta, pagina și link înapoi |
| Legi ideile | Ții minte cine ce a spus | Notele sunt legate între ele |
| Regăsești un citat | Cauți peste tot | Cauți un cuvânt sau o etichetă (`#disagree`) |
| Citezi | De mână | Scrii `@` și alegi sursa |
| Predai lucrarea | Copiezi în Word și refaci formatarea | Exporți în PDF sau Word |
| **Locuri în care lucrezi** | **6** | **1** |

**Pasul 1. Configurează vault-ul (o singură dată)**

1. Instalează [Obsidian](https://obsidian.md/download). E gratuit.
2. Copiază folderul vault-ului pe laptop. În Obsidian: **Open folder as vault**.
3. Alege **Trust author and enable plugins**.
4. Configurarea pornește singură. Alegi limba și folderul pentru fișierele exportate. Dacă lipsește ceva (de exemplu PDF++), un clic îl instalează.
5. Deschide **Texere – Setup report** (lângă acest ghid) și pornește de la **Începe aici**.

> [!warning] N-ai ales „Trust author”?
> Obsidian deschide vault-ul în **Restricted mode**. Poți citi notele, dar nimic altceva nu merge. Pornești pluginurile din **Settings → Community plugins**.

**Pasul 2. Lucrează**

1. **Adaugi o sursă** → [[#3. Administrarea referințelor]]
2. **Citești și subliniezi** → [[#4. Lectura și notele de literatură]]
3. **Scrii și citezi** → [[#5. Scrierea articolelor științifice]]
4. **Exporți** → [[#6. Bibliografia și exportul documentului]]

Un tab nou îți arată ultimele fișiere, acțiunile principale și ce trebuie reparat. Te-ai blocat? Apasă **Ajutor** (colacul din stânga) și întreabă cu cuvintele tale. Nu merge ceva? Vezi [[#8. Dacă ceva nu merge]].

*Creat de [George Mihai](https://www.georgemihai.com) · [hi@georgemihai.com](mailto:hi@georgemihai.com)*

----
## 1. Introducere

Obsidian lucrează cu fișiere text (Markdown), pe calculatorul tău. Notele trimit unele la altele, ca paginile Wikipedia. Pluginurile adaugă funcții. Interfața e explicată în [acest video](https://www.youtube.com/watch?v=z4AbijUCoKU).

### 1.1 Termeni folosiți în ghid

| Termen | Ce înseamnă |
| --- | --- |
| **Vault** | Folderul cu toate notele și setările, inclusiv folderul ascuns `.obsidian`. |
| **Link** | `[[Numele notei]]`, trimiterea la altă notă. **Backlinks** arată notele care trimit la nota deschisă. |
| **Etichetă** (tag) | Un cuvânt cu `#` în față (`#claim`). |
| **Proprietăți** | Câmpurile din partea de sus a notei (**title**, **branch**, **attachment**). |
| **Notă de literatură** | Nota unei surse din **Literature Notes**: datele ei, PDF-ul și pasajele tale. |
| **Citekey** | Codul unei surse, ca `craig_philosophy_2002`. E proprietatea `id` a notei. |
| **Citare** | `[@citekey, p. 34]`. Apare ca (Craig, 2002, p. 34). |
| **Bibliografie** | `Support/Admin/Bibliography/bibliography.json`. Texere o ține la zi din notele de literatură. |
| **Command palette** | Toate comenzile: **Ctrl/Cmd + P**. |

### 1.2 Pluginurile Texere

| Plugin | Ce face |
| --- | --- |
| **Texere · The Researcher's Vault** | Configurează vault-ul, verifică ce lipsește, arată panoul din tabul nou și pornește butonul **Ajutor**. Pagina lui din setări arată ce e pornit, oprit sau lipsește. |
| **Texere · Sources** | Adaugă surse din cataloage, din Zotero sau dintr-un PDF. Arată citările în stilul ales, aduce evidențierile în note și ține bibliografia. Butonul: iconița cu cărți din stânga. |
| **Texere · Export** | PDF, Word, LaTeX, HTML sau Markdown, cu citări, bibliografie și cuprins. Butonul: **Exportă**, dreapta-jos. |
| **Texere · Insights** | Cât scrii, lipești și ștergi; menționările fără link și aliasurile; tiparele din lectura și scrisul tău. Butonul: becul din stânga. |

Folosesc două pluginuri din comunitate, care vin cu vault-ul: **PDF++** (sublinierile) și **Templater** (configurarea și Ajutorul). Nu ai nevoie de Zotero, Word sau LaTeX.

----
## 2. Structura generală

| Folder | Ce conține |
| --- | --- |
| **01. Sources** | **Documents** (PDF-urile) și **Literature Notes** (câte o notă pentru fiecare sursă) |
| **02. Notes** | notițele și ideile tale: **Essays**, **Personal**, **Poetry** |
| **03. Workspace** | lucrul tău: **Courses**, **Thesis** (licență, disertație, doctorat), **Articles**, **Projects** |
| **04. Export** | fișierele exportate |
| **Fields** | hărți ale domeniilor. **Philosophy** are nota [[Philosophy\|Filosofie]] și note pentru ramuri, teorii, concepte, curente, perioade și autori |
| **Support** | ghiduri, șabloane, imagini și **Admin** (scripturi, bibliografie, stiluri de citare) |

Trei foldere rămân unde sunt: **Support/Admin/Bibliography** (bibliografia și stilurile de citare), **Support/Admin/Scripts** (Ajutorul) și **Support/Templates**. Dacă redenumești sau muți unul, Texere îți spune și îți dă un buton care îl pune la loc. Folderele surselor și al exportului sunt ale tale: le redenumești, iar Texere te întreabă unde salvează data viitoare. Nu schimba `id`-ul unei note de literatură.

Restul e o propunere. Texere creează folderele astea la prima pornire; redenumește-le, mută-le sau șterge-le cum vrei. Nu le mai pune la loc decât dacă îi ceri: **Settings → Texere · The Researcher's Vault → Folderele**.

Fiecare notă din **Fields/Philosophy** are nume în engleză și alias în română: scrii `[[Etică` și primești **Ethics**. Folosește aceste note în proprietăți. [[Craig 2002 – Philosophy. A very short introduction]] are la **branch** valoarea [[Introduction|Introduceri]]; deschide [[Introduction|Introduceri]], iar **Backlinks** arată toate sursele din ramura asta. Nu ai folderul **Fields**? **Settings → Texere · The Researcher's Vault → Creează harta**. Ai nevoie de alt domeniu? Scrie la [hi@georgemihai.com](mailto:hi@georgemihai.com).

## 3. Administrarea referințelor

Fiecare sursă are o notă în **Literature Notes**, cu numele *Autor An – Titlu*, și un PDF în **Documents**. Sursele care sunt deja acolo sunt exemple. Le poți șterge oricând.

### 3.1 Cauți și adaugi

1. Apasă **Texere · Surse** (iconița cu cărți) sau **Ctrl/Cmd + P** → **Texere · Surse · Caută surse**.
2. Scrie un titlu, un autor, un DOI, un ISBN sau un link. Filtrezi după tip, ani sau ordine.
3. Alege sursa și apasă **Adaugă în vault**. PDF-ul gratuit vine cu ea, dacă există.

Ai deja referința? **Lipește** primește o citare, BibTeX, RIS sau un DOI. Nu e în niciun catalog? **Introdu manual**. Unele cataloage permit mai multe căutări cu o cheie gratuită: **Settings → Texere · Sources → Cataloage**.

### 3.2 Din Zotero

1. Deschide Zotero. Prima dată: **Setări → Avansat** → bifează **Permite altor aplicații de pe acest computer să comunice cu Zotero**.
2. **Texere · Surse** → **Zotero**. ✎ arată sursele cu evidențieri; **Cu evidențieri** le arată doar pe ele.
3. Bifează ce vrei și apasă **Importă**. Primești nota, PDF-ul și evidențierile, cu eticheta culorii.

Sursele care sunt deja în vault primesc doar ce lipsește și nimic nu se dublează. Un PDF ținut singur în Zotero, fără titlu și autori, intră în **Documents/Inbox**, iar Texere îți cere să-i alegi sursa. Ce etichetă primește fiecare culoare din Zotero alegi în **Settings → Texere · Sources → Cataloage → Zotero**. Adaugă o cheie Zotero (**Settings → Texere · Sources → Cataloage → Zotero**): importul merge și cu Zotero închis și nu mai aștepți după el. Recomandat.

### 3.3 Din browser, cu butonul Zotero

1. Instalează [Zotero Connector](https://www.zotero.org/download/connectors).
2. Pornește **Settings → Texere · Sources → Cataloage → Zotero → Butonul Zotero din browser**.
3. Pe pagina unui articol, apasă butonul Zotero. Obsidian trebuie să fie deschis.

Cu Zotero deschis, sursa intră în Zotero și apoi în vault. Cu Zotero închis, intră direct în vault.

> [!warning]- A salvat o pagină web în loc de articol?
> Pe Mac, dacă închizi fereastra, Zotero rămâne pornit: folosește **Cmd + Q**. Apoi **Zotero Connector → Preferences → Advanced → Reset Translators** și încearcă din nou.

### 3.4 Un PDF pe care îl ai deja

Deschide-l, apoi **Ctrl/Cmd + P** → **Texere · Surse · Adaugă acest PDF ca sursă**. Alegi sursa. PDF-ul se atașează și se mută în **Documents**. **Texere · Surse · PDF-uri fără sursă…** arată ce a rămas. Pentru o sursă fără PDF: **Caută PDF-ul gratuit pentru această sursă**.

## 4. Lectura și notele de literatură

1. Deschide nota sursei și apasă pe PDF-ul din **attachment**.
2. Selectează un pasaj și alege o culoare din paleta **PDF++**.
3. Lipește-l în notă (**Ctrl/Cmd + V**). Începe cu eticheta culorii și se termină cu citarea și **· PDF**, link spre locul exact.

| Culoare | Etichetă | Ce marchezi |
| --- | --- | --- |
| roz | `#fact` | fapte, date, cifre |
| galben | `#claim` | afirmațiile autorului |
| roșu | `#disagree` | ce nu crezi |
| turcoaz | `#agree` | ce crezi și tu |
| albastru | `#connection` | legături cu alte texte sau idei |
| mov | `#question` | întrebări |
| portocaliu | `#definition` | definiții |
| gri | `#word` | termeni de reținut |

Evidențierile făcute în Zotero, Preview sau Acrobat intră singure în notă, cu eticheta celei mai apropiate culori. Le-ai făcut mai târziu? **Texere · Surse · Importă evidențierile din PDF**.

> [!example] Dintr-o notă reală
> În [[Dummett 1996 – Origins of Analytical Philosophy]]:
> ```
> #claim Gottlob Frege, fondatorul filosofiei analitice, [@dummett_origins_1996, p. 7] · PDF
> Contra credinței populare, nu Russell a fost părintele filosofiei analitice.
> ```
> Pasajul și, dedesubt, comentariul tău. [[Texere – Export test]] îl citează ca `[@dummett_origins_1996, pp. 7, 11]`.

Cauți o etichetă (`tag:#disagree`) ca să aduni același tip de idei din toate lecturile. După lectură, completezi **Thesis**, **Arguments**, **Counterarguments** și **Conclusions**.

**Source stats**, sus în nota fiecărei surse, arată cum o citează alții ([scite](https://scite.ai), [OpenAlex](https://openalex.org), [Semantic Scholar](https://www.semanticscholar.org)) și ce ai subliniat tu. Se actualizează o dată pe zi.

## 5. Scrierea articolelor științifice

### 5.1 Pornește de la un șablon (opțional)

- [[New article]]: duplică-l și completează **title**. Lasă **Bibliography** goală; acolo intră bibliografia la export.
- [[Licență – Facultatea de Filosofie UB]] și [[Disertație – Facultatea de Filosofie UB]]: lucrările după ghidul facultății. Completezi **title**, **autor**, **coordonator** și **an**. Regulile: [[Ghid de redactare – Licență și disertație (FF UB)]].

### 5.2 Citarea surselor

Scrie `@` și un cuvânt din autor sau titlu, apoi alege sursa. Texere scrie `[@citekey]`; pagina o adaugi după.

| Scrii | Apare (APA) |
| --- | --- |
| `[@craig_philosophy_2002]` | (Craig, 2002) |
| `[@craig_philosophy_2002, p. 34]` | (Craig, 2002, p. 34) |
| `[@craig_philosophy_2002, pp. 34-36]` | (Craig, 2002, pp. 34–36) |
| `[@craig_philosophy_2002; @dummett_origins_1996]` | (Craig, 2002; Dummett, 1996) |
| `@craig_philosophy_2002 [p. 34]` | Craig (2002, p. 34) |
| `[see @craig_philosophy_2002, ch. 2]` | (see Craig, 2002, ch. 2) |

Dă mereu pagina când citezi sau parafrazezi.

Stilul apare în dreapta jos (**APA**). Dă clic pe el ca să schimbi stilul notei; exportul îl urmează. **Adaugă un stil…** caută printre peste 10.000 de stiluri. Alegerea se salvează în proprietatea `csl` a notei. **Cmd/Ctrl + clic** pe o citare deschide sursa.

### 5.3 Ghiduri de scriere

- [Guidelines on Writing a Philosophy Paper](https://www.jimpryor.net/teaching/guidelines/writing.html)
- [LEADERSHIP LAB: The Craft of Writing Effectively](https://www.youtube.com/watch?v=vtIzMaLkCaM)
- [[Metodologia cercetării - Literature Review]]
- [[Metodologia cercetării - Structura unei lucrări științifice]]

### 5.4 Insights: scrisul, linkurile și tiparele tale

**Texere · Insights** îți arată cum lucrezi. Totul rămâne pe laptop. Îl deschizi din becul din stânga; tab-ul nou arată cuvintele de azi și menționările fără link.

- **Cuvintele.** Ce scrii, lipești, inserezi cu altă unealtă (un plugin AI, un șablon) și ștergi, pe zi, săptămână, lună și an, cu zilele la rând și orele în care scrii cel mai bine. Anulează nu se numără. Fiecare laptop își ține numărătoarea; totalurile le adună.
- **Ținta de cuvinte.** Într-o notă: **Texere · Insights · Pune o țintă de cuvinte**. O bară subțire deasupra textului arată cât mai ai și ce ai adăugat azi.
- **Menționările fără link.** Conceptele scrise fără link (filosofiei, acțiunii, Dasein), în notele tale și în rândurile tale din notele de literatură, nu în citate. **Revizuiește** le grupează; **Leagă selectate** leagă prima menționare din fiecare notă și îți păstrează cuvintele: `[[Action|acțiunii]]`. Mai arată numele care apar des, dar n-au notă (**Creează nota**), sugerează aliasuri (din textul linkurilor, din felul în care scrii, forme scurte și, la cerere, traduceri din Wikidata, Wikipedia și MyMemory) și notele care par dublate.
- **Proiecte.** Un proiect e un folder sau o etichetă (teza, un articol, un curs), cu țintă și termen opționale: cuvinte, ritmul pe săptămână și când ajungi acolo.
- **Afirmații fără citare.** În proiectele tale, un paragraf care argumentează („prin urmare”, „studiile arată”, un autor numit), dar nu citează nimic, primește o linie portocalie la stânga și, la final, o sursă pe care ai putea-o cita. Un clic o adaugă.
- **Tipare.** Subiectele în creștere și ce citești fără să scrii despre asta; concepte care apar mereu împreună, dar nu sunt legate; note uitate care contează acum și **Surprinde-mă**; pe cine citezi; ce evidențiezi; lectura lângă scris.
- **Recenzia săptămânii.** În fiecare luni, o notă scurtă în **02. Notes/Weekly reviews**.

Setări: **Settings → Texere · Insights** (Linkuri · Proiecte). Merge în orice vault; cu Texere · Sources, cifrele despre lectură și citări sunt mai precise.

## 6. Bibliografia și exportul documentului

> [!tip] Încearcă
> Deschide [[Texere – Export test]] (în engleză), apasă **Exportă** (dreapta-jos), alege **PDF** și apasă **Exportă PDF**.

1. Deschide nota și apasă **Exportă**, dreapta-jos. Sau butonul **Texere · Export** din stânga, care îți arată notele.
2. Alege formatul: **PDF**, **Word**, **LaTeX**, **HTML** sau **Markdown**. Previzualizarea arată rezultatul.
3. Apasă **Exportă PDF** (sau Word…). Mesajul are butonul **Deschide**.

Bibliografia se face singură, din sursele pe care le citezi. Intră sub titlul **Bibliografie**, sau la final.

În fereastra exportului alegi șablonul (general sau al facultății), stilul citărilor, pagina (format, margini, numerele paginilor), textul (font, spațiere, aliniere), cuprinsul și câteva opțiuni (fiecare H2 de la pagină nouă, culori, etichete). Alegerile rămân. Îți faci propriile șabloane în **Settings → Texere · Export → Șabloane**: pornești din unul existent, îl schimbi în **Pagina și textul**, îl redenumești sau îl ștergi; o notă îl folosește cu `export: <numele lui>`. Formatul implicit și folderul exportului, în vault sau în afara lui, sunt în **Fișierele**.

**Cuprinsul.** **Texere · Export · Pune cuprinsul aici** adaugă un cuprins care se actualizează pe măsură ce scrii. În PDF și Word primește numerele paginilor. Word cere să actualizeze câmpurile când deschizi fișierul: răspunde **Da**.

Imaginile trebuie să fie în vault, inserate cu `![[imagine.png]]`.

## 7. Copii de siguranță

Copiază din când în când folderul vault-ului pe un hard disk extern. Nu ai date sensibile? Merge și o copie în cloud.

## 8. Dacă ceva nu merge

Deschide un tab nou sau **Settings → Texere · The Researcher's Vault**. Amândouă arată ce lipsește, cu un buton care repară. Apoi rulează din nou configurarea: **Ctrl/Cmd + P** → **Texere · The Researcher's Vault: Setup**.

### 8.1 Configurarea manuală

Configurarea face singură pașii 3–5 și 7.

1. **Copiază tot vault-ul**, cu folderul ascuns `.obsidian`. Pe Mac, **Cmd + Shift + .** îl arată.
2. **Pornește pluginurile:** **Settings → Community plugins → Turn on community plugins**.
3. **Pluginurile Texere:** în **Settings → Texere · The Researcher's Vault**, pornește Sources și Export și apasă **Instalează și pornește** la ce lipsește.
4. **Bibliografia:** **Settings → Texere · Sources → Șablonul notei → Eticheta** trebuie să fie `literature_note`. Apoi rulează **Texere · Surse · Refă bibliografia din note**.
5. **Folderul exportului:** **Settings → Texere · Export → Fișierele → Folderul exportului**.
6. **Fontul:** alege unul din **Textul → Font**, în fereastra exportului. Apar doar fonturile instalate.
7. **Butonul Ajutor:** **Settings → Templater → Enable startup templates**, adaugă `Support/Admin/Scripts/Help.md` și `Support/Admin/Scripts/Guide folding.md`, apoi repornește Obsidian.

### 8.2 Dacă apare o eroare

| Ce vezi | De ce | Ce faci |
| --- | --- | --- |
| „Restricted mode”, niciun plugin | n-ai ales „Trust author” | pasul 2 |
| configurarea nu pornește | Texere sau Templater e oprit | pasul 3, apoi rulezi configurarea |
| lipsesc comenzile Texere sau PDF++ | pluginuri oprite sau lipsește `.obsidian` | pașii 1 și 3 |
| citările rămân `[@citekey]` | Texere · Sources e oprit | pasul 3 |
| „negăsite: @…” la export | citekey-ul nu e în bibliografie | scrie `@` și alege sursa |
| mai puține surse decât note | note fără eticheta `literature_note` | pasul 4 |
| nu apare fișierul exportat | folderul exportului nu există pe acest laptop | pasul 5 |
| alt font în export | fontul nu e instalat | pasul 6 |
| lipsește butonul **Ajutor** sau scriptul **New laptop setup** | un folder din **Support** a fost mutat sau scripturile de pornire sunt oprite | deschide un tab nou și apasă **Pune-l la loc**; altfel, pasul 7 |
| „Zotero e închis” | Zotero nu e pornit | deschide-l sau adaugă o cheie Zotero |
| Zotero „nu-l lasă pe Texere să intre” | Zotero blochează alte aplicații | în Zotero: **Setări → Avansat** → permite altor aplicații |
| butonul Zotero salvează doar în Zotero | butonul din browser e oprit | [[#3.3 Din browser, cu butonul Zotero]] |
| lipsesc evidențieri din notă | au fost făcute după ce ai adăugat sursa | **Texere · Surse · Importă evidențierile din PDF** |
| „limită atinsă” la căutare | limita pe zi a unui catalog | adaugă o cheie gratuită la **Cataloage** |

## 9. Întrebări frecvente

1. **Pot schimba structura?** Da. Dacă muți sursele, schimbă-le folderele în **Settings → Texere · Sources → Nume și foldere**.
2. **Alt stil de citare?** Dă clic pe stilul din dreapta jos. **Adaugă un stil…** găsește oricare dintre cele peste 10.000 din [Zotero Style Repository](https://www.zotero.org/styles).
3. **Am nevoie de Zotero?** Nu. Te ajută dacă biblioteca ta e deja acolo.
4. **Am șters din greșeală un text?** **Settings → File recovery**.
5. **Cum actualizez?** Fă o copie a vault-ului. Din versiunea nouă copiază **Support** și folderele `.obsidian/plugins/texere`, `texere-sources` și `texere-export`. Nu înlocui notele tale și **01. Sources**. Repornește Obsidian.

## 10. Alte ghiduri

1. https://www.youtube.com/watch?v=S_-uD3GtFno
2. https://obsidian-guide.neocities.org/guide
3. https://girlinbluemusic.com/how-to-connect-zotero-and-obsidian-for-the-ultimate-phd-workflow/
4. [Documentația Obsidian](https://help.obsidian.md)

## 11. Istoric versiuni

- **3.2.0** · 3 noiembrie 2026 · **Texere · Insights**: cuvinte scrise, lipite, inserate și șterse; ținte de cuvinte; menționări fără link legate cu un clic; aliasuri sugerate; afirmații fără citare cât scrii; tipare, ritmul tezei și recenzia săptămânii
- **3.1.0** · 1 noiembrie 2026 · un ghid mai scurt; Texere creează structura de foldere propusă (**02. Thesis** în loc de 02. Disertation) și le păzește pe cele de care are nevoie; șabloane de export proprii; un panou în fiecare tab nou; fila Zotero filtrează după evidențieri și nu le dublează; literele pierdute (ș, ț) se refac din pagina salvată de Zotero; butonul Zotero nu mai așteaptă după PDF și adaugă unul singur; un PDF pe care situl nu-l dă: **Deschide PDF-ul**, salvează-l în Downloads sau trage-l în Inbox, iar Texere îl atașează; Zotero își găsește mereu portul liber
- **3.0.0** · 1 noiembrie 2026 · sursele, citările și exportul vin din trei pluginuri Texere, fără BibLib, Pandoc sau LaTeX; importul din Zotero cu evidențieri; exportul cu previzualizare și șabloanele facultății; bibliografia s-a mutat în **Support/Admin/Bibliography**
- **2.3.0** · 30 octombrie 2026 · foldere noi: 01. Sources, 02. Notes, 03. Workspace, 04. Export, Fields, Support și **Home**
- **2.0.0 – 2.2.1** · 27 octombrie 2026 · un singur vault pentru ambele limbi: ghiduri în română și engleză, configurarea și Ajutorul în limba ta, note cu nume în engleză și aliasuri în română
- **1.0.0 – 1.6.1** · 26–27 octombrie 2026 · primul ghid, configurarea automată, butonul Ajutor și harta filosofiei; proiectul s-a numit Topos, apoi Texere (lat. *a țese*)

<!--
Pentru cine întreține vault-ul:
1. Crește versiunea și data (x.x.x): ultima cifră pentru corecturi, a doua pentru funcții noi, prima pentru schimbări mari. Adaugă un rând mai sus.
2. Ai schimbat un script? Actualizează versiunea din primul lui rând. Un plugin? Actualizează manifest.json-ul lui.
3. Ține cele două ghiduri la fel: aceleași numere de secțiuni, aceeași versiune. Ajutorul și configurarea găsesc răspunsurile după numărul secțiunii.
-->
