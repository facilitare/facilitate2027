# Decizii și întrebări deschise

Document pentru tine, nu pentru agentul care implementează. Aici e „de ce"-ul din spatele
specificației. Restul fișierelor din `plan/` sunt în engleză, fiindcă interfața e în engleză
și agentul de implementare lucrează pe ele direct.

---

## 1. Decizii luate (implementate ca atare în spec)

### 1.1 Scala 0/1/2 pentru toate criteriile

Trecerea de la -1/0/1 la 0/1/2 e o simplă translatare: fiecare scor crește cu 1, totalul cu 4.
**Ranking-ul rămâne identic.** Câștigul e altul: dispar totalurile negative (care descurajează
evaluatorii și complică mediile) și dispare ambiguitatea „scor mic vs. lipsă de scor".

În fișierul Excel actual, coloana *Facilitation Focus* e deja pe 0/1/2, iar celelalte pe
-1/0/1 — iar coloana Score le adună laolaltă. Aplicația elimină problema din construcție:
0/1/2 e singura scală care există în cod.

### 1.2 „No evidence provided" nu mai e o valoare de scor

În foaia actuală e o a patra opțiune într-un dropdown de numere, ceea ce rupe `SUM()`.
În aplicație devine: **scor 0 + un checkbox „No evidence provided"**. Scorul rămâne numeric
și însumabil; flag-ul se păstrează pentru că e util în feedbackul către aplicant
(„nu ai spus nimic despre X" e alt mesaj decât „ce ai spus despre X e slab").

### 1.3 IAF Bonus se calculează automat și e criteriu de departajare, nu de scor

Apartenența la IAF și acreditarea sunt **fapte** din Q17/Q18, nu judecăți. Nu are sens ca
6 oameni să scoreze un fapt — produce doar zgomot și muncă. Aplicația îl derivă automat.

Ca pondere: dacă rămânea al cincilea criteriu cu 0-2 puncte, calitatea de membru IAF ar fi
valorat 20% din scorul total al unei propuneri. Prea mult pentru o conferință care spune
explicit că judecă propunerea, nu reputația. Deci:

- **Scor principal: 0-8** (4 criterii × 0-2).
- **IAF standing: 0/1/2**, afișat separat, folosit doar la egalitate.
- Ordinea de departajare: scor principal → IAF standing → Interactivity → Session Content.

Există un flag de configurare (`IAF_BONUS_MODE = 'tiebreak' | 'additive'`) dacă panelul
decide altfel. Default: `tiebreak`.

### 1.4 Facilitation Focus e poartă, nu criteriu

Politica spune: *„Sessions must be centred on facilitation."* Formulare de tip „must" nu se
compensează cu puncte din altă parte. O propunere excelentă la Content și Interactivity, dar
care nu e despre facilitare, nu are ce căuta în program.

Regula implementată: dacă media la Facilitation Focus < 1.0, aplicația e marcată
**Below quality standard** indiferent de totalul general. Poate fi suprascrisă manual de un
lead, cu motivare obligatorie, care intră în audit log.

### 1.5 Pragul minim de calitate

Politica spune că menținerea calității are prioritate față de umplerea sloturilor. Ca să fie
operabil, îi trebuie o cifră stabilită *înainte* să se vadă scorurile — altfel se negociază
pragul în funcție de câte sesiuni lipsesc.

Propunere implementată ca valoare implicită, editabilă în Settings:

- Media scorului principal ≥ **5.0 din 8**, ȘI
- nicio medie pe criteriu sub **1.0**, ȘI
- Facilitation Focus ≥ 1.0 (poarta de la 1.4).

### 1.6 Anonimizarea e impusă de server

Rundă 1: endpoint-urile returnează exclusiv câmpurile de conținut. Identitatea nu ajunge în
răspuns nici ascunsă în DOM. Nu e o chestiune de disciplină a evaluatorilor — în Sheets,
anonimatul ține doar cât ține atenția celui care ascunde coloane.

În plus: la import, sistemul scanează Q7, Q16 și Q19 (textele libere din runda 1) după numele
aplicantului din Q20, după partea locală a emailului și după domenii/URL-uri. Ce se potrivește
ridică un flag, iar un admin poate redacta textul înainte ca aplicația să intre la scorare.
Textul original rămâne în baza de date, dar nu e servit în runda 1.

### 1.7 Blocarea scorurilor înainte de submit

Un evaluator nu vede scorurile celorlalți pe o aplicație până nu îl trimite pe al lui.
E cel mai important lucru pe care Sheets nu-l poate face: acolo, al treilea care deschide
fișierul vede deja două scoruri și se ancorează în ele. Regula e verificată pe server, nu
doar în UI.

### 1.8 Alocare: 3 din 6, automată

Fiecare aplicație primește 3 evaluatori, aleși ca să echilibreze încărcarea. Configurabil
(2-6). La 3 evaluatori din 6, severitatea individuală contează, deci aplicația afișează și un
**scor normalizat** lângă cel brut (vezi `04-SPEC.md §6.3`). Nu înlocuiește scorul brut —
îl însoțește, ca panelul să vadă când clasamentul depinde de cine a nimerit să evalueze.

Recomandare de proces, nu de cod: primele 3-5 aplicații să fie evaluate de **toți 6**, iar
rezultatele comparate înainte de a împărți restul. Aplicația are un mod „Calibration set"
pentru asta (task T17).

### 1.9 Autentificare: parolă unică + alegerea numelui

Cum ai cerut. E important să știi ce înseamnă: **nu e autentificare reală.** Oricine are
parola poate alege orice nume din listă. Pentru 6 oameni care se cunosc, e un compromis
rezonabil. Două atenuări implementate:

- alegerea unei identități de **lead** cere o a doua parolă (`ADMIN_PASSWORD`);
- fiecare acțiune intră în audit log cu numele ales, ora și IP-ul.

Dacă la un moment dat vrei autentificare reală, calea cea mai ieftină e magic link pe email —
schimbă doar `lib/auth.ts` și un ecran, restul aplicației nu se atinge.

### 1.10 Import CSV, nu formular propriu

Google Forms rămâne cum e. Aplicația importă exportul CSV per val, cu previzualizare și
dry-run. Motivul: formularul e deja live, iar înlocuirea lui ar muta în aplicație problema
uploadului de poze, a emailurilor de confirmare și a validărilor — mult efort pentru zero
câștig în evaluare.

---

## 2. Inconsistențe găsite în documentație — au nevoie de decizia ta

Le-am marcat în cod cu `TODO(policy)` acolo unde afectează comportamentul. Două dintre
ele sunt rezolvate (19.08.2026); a treia e încă deschisă.

### 2.1 ✅ REZOLVAT — 50 de minute

- Politica, *Initial Ranking Criteria*, pct. 2: „...achievable within a **50-minute** session
  (allowing time for introduction and close)".
- Politica, *Application Requirements*: „Applicants must confirm that they are aware that the
  session is scheduled for **60 minutes**, and this includes their introduction and wrap up time".
- Formularul, secțiunea Timekeeping: „**50 mins** reminder".

**Decizie (19.08.2026): 50 de minute, inclusiv introducerea și încheierea.** Aplicația
afișează linia asta fix deasupra descrierii sesiunii, în secțiunea Session Content de pe
ecranul de scorare, ca toți cei 6 evaluatori să judece „e realizabil în timpul alocat?"
pornind de la aceeași cifră.

**Rămâne de făcut în afara aplicației:** politica, la *Application Requirements*, îi cere
aplicantului să confirme 60 de minute. Textul acela trebuie corectat la 50 înainte de
deschiderea valului 1, altfel aplicanții își proiectează sesiunea pe 60 și sunt scorați pe 50.

### 2.2 ✅ REZOLVAT — sub 35 de ani

- Politica: „at least 10% of lead hosts **under 30**".
- Formularul, Q27: „Are you **under 35**? (We're aiming for at least 10% of session hosts to
  be under 35.)"

**Decizie (19.08.2026): sub 35**, cifra pe care formularul o culege deja. Ținta rămâne
10%. Dashboardul afișează explicit pragul folosit, ca să nu se citească niciodată drept
„sub 30".

**Rămâne de făcut în afara aplicației:** textul politicii spune „under 30" și trebuie
aliniat la 35.

### 2.3 Q25 (background rasial și etnic) nu are opțiuni

În formular, singura opțiune listată e literalmente *„What are the options we should be using
here?"*. Politica cere activ îmbunătățirea reprezentării din medii diverse rasial și etnic —
dar fără opțiuni definite, nu există date de raportat.

Recomandare: folosiți o listă standard (de ex. categoriile de etnicitate ONS din UK, dacă
conferința e în UK), plus „Prefer not to say", cu răspuns opțional. Aplicația tratează Q25 ca
text liber până când primește lista finală, iar dashboardul afișează „not configured" în loc
să calculeze pe date incomplete.

### 2.4 Bug în Assessor Score Sheet.xlsx

Coloana Score are două formule diferite:

- rândurile 2-7: `SUM(B2:F2)` — cinci criterii;
- rândurile 8-15: `SUM(B8:D8)` — trei criterii, **pierd Credibility & Experience și IAF Bonus**.

Dacă foaia a fost deja folosită pe date reale, aplicanții de la rândul 8 în jos au fost
punctați pe altă bază. Merită verificat înainte de a migra orice scor existent.

### 2.5 Secțiunea rundei 2 din formular e neterminată

Titlul secțiunii e „Supporting Information to be used in 2nd selection round (not sure how to
write this!)". Nu afectează aplicația, dar afectează ce văd aplicanții.

### 2.6 Q13 (nivelul de participare, 1-5) e autoevaluare

E util ca semnal, dar nu e o măsură. Aplicația îl arată evaluatorului ca dată brută în
secțiunea Interactivity, **fără** să-l convertească automat în scor. Un aplicant care se dă 5
și descrie o prelegere trebuie să poată primi 0.

---

## 3. Ce am ales să NU construiesc

Ca să fie clar unde se oprește scopul:

- **Nu** înlocuim Google Forms (vezi 1.10).
- **Nu** trimitem emailuri către aplicanți din aplicație. Feedbackul agregat se exportă ca
  text gata de lipit. Trimiterea automată adaugă un furnizor de email, șabloane, dezabonări și
  riscul unui email trimis din greșeală către 80 de oameni.
- **Nu** facem programare orară a sesiunilor (ce sesiune în ce sală, la ce oră). E o problemă
  diferită, de după selecție.
- **Nu** facem scorare asistată de AI. Politica spune că evaluarea se face pe informația din
  aplicație, de către panel. Un scor sugerat de un model ar ancora evaluatorii exact ca
  scorurile colegilor — problema pe care o rezolvăm la 1.7.
- **Nu** facem management de bilete / plăți.
