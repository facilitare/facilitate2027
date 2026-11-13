# 12 — Wrangling (după mailul „Wrangling Meeting", 13 nov. 2026)

Context: ținta e ~20 de sesiuni selectate înainte de Crăciun (4 camere = 32 de locuri). Ședință de decizie pe 16 dec.; mailurile către aplicanți pleacă pe 18 dec. Deadline evaluări: 11 dec. Termenul-cheie pentru T-W1…T-W3: **înainte de 30 nov.** (orientarea evaluatorilor noi).

Reguli de execuție: modificări chirurgicale; o migrare nouă (`008_…sql`) înainte de push (vezi memoria „Deploy și DB"); repo public, fără date reale în git; un test pentru logica nouă; `npm test` + `tsc` trec înainte de „gata".

---

## T-W1 — Status evaluatori în admin (cerut de Alice)

**Scop:** un lead vede dintr-o privire cine a terminat, cine e în lucru, cine n-a început, și cine mai poate primi aplicații.

**Unde:** extinde `app/admin/evaluators/` (pagina + `evaluators-client.tsx`) și `app/api/evaluators/route.ts` (GET). Nu crea pagină nouă.

**Date per evaluator** (din `assessments`, `state in assigned|draft|submitted|recused`; exclude conturile cu `takes_assessments = false`):
- alocate, trimise (`submitted`), în lucru (`draft`), neîncepute (`assigned`), recuzate (`recused`);
- status derivat: **Terminat** (toate trimise), **Aproape** (≥ 70 % trimise), **În lucru**, **Neînceput** (0 trimise);
- **loc liber**: `10 − (alocate − recuzate)`, minim 0; afișat ca „+N posibile"; avertisment la peste 15 (maximul convenit).

**Rezumat sus:** „X/Y evaluări trimise" (țintă totală = aplicații × 4), N evaluatori Terminat / Aproape / Neînceput, număr de recuzări de realocat.

**Condiție de oprire:** testul pe funcția de derivare a statusului trece; pagina arată pe date seed același rezumat ca un calcul manual; un non-lead tot primește 403.

## T-W2 — Calibrare manuală (cerut de Christine)

**Scop:** când flag-ul „needs calibration" (`divergence >= 2`, `lib/scoring.ts:194`) apare, panelul îl poate marca drept revizuit, cu notă. Scorul rămâne neschimbat.

**Migrare `008_calibration_reviewed.sql`:** pe `applications` adaugă `calibration_reviewed_by uuid references evaluators(id)`, `calibration_reviewed_at timestamptz`, `calibration_note text`.

**API:** `POST /api/applications/[id]/calibration-review` — doar lead, notă ≥ 10 caractere (ca la decizie), scrie în `audit_log` (`writeAudit`). `DELETE` anulează marcajul, tot cu audit.

**UI:**
- `app/applications/[id]/detail-client.tsx` (rândul de la ~334): buton „Marchează ca revizuit manual" + câmp de notă; după marcare, textul „needs calibration" devine „calibrare revizuită de <nume>, <dată>" cu nota vizibilă.
- `app/applications/applications-client.tsx`: rândurile revizuite nu mai sunt evidențiate cu fundalul de avertisment; filtrul „needs calibration only" le exclude, cu opțiune de a le include.
- `GET /api/applications` returnează câmpurile noi.

**Nu atinge** `lib/scoring.ts`: `needsCalibration` rămâne un fapt calculat, iar marcajul e separat.

**Condiție de oprire:** marcare → flag stins în listă și în detaliu → audit scris → anulare restabilește flag-ul. Un non-lead primește 403.

## T-W3 — Decizii pe trei rezultate (Yes / Maybe / No)

**Observație:** `decision/route.ts` are deja `accept | decline | defer | standby | reserve`. Nu schimba enum-ul.

**Mapare de afișat (UI + export), fără schimbare de DB:**
- `accept` → **Yes**
- `defer` → **Maybe** („revenim după runda din ianuarie")
- `decline` → **No**
- `standby` / `reserve` → nu apar în fluxul de comunicare; în UI le ascunzi sub „Altele" sau le marchezi „nefolosit în acest flux".

**De confirmat cu Christine/Paul înainte de implementare** (întrebarea lui Paul): „No" are o variantă sau două (respins definitiv vs. „bun, dar nu în top 20")? Implementare implicită: **o singură variantă**, în acord cu Alice. Dacă se aleg două, se adaugă un câmp `decline_kind` într-o migrare separată.

**Lead-only rămâne.** Verifică dacă Alice are `role = 'lead'`. Dacă nu, ea nu poate înregistra decizii. Întreabă-l pe Bogdan înainte de a schimba ceva la roluri.

**UI:** în panelul de decizie, etichete „Yes / Maybe / No" lângă valorile tehnice; în listă, o coloană „Rezultat comunicare".

**Condiție de oprire:** o decizie înregistrată apare cu eticheta corectă în listă și în export; testele existente pentru `decision` trec neschimbate.

---

## Ordine și dependențe
T-W1 și T-W2 sunt independente (fișiere diferite), se pot executa în paralel; T-W3 vine după ele (atinge `applications-client.tsx`, ca T-W2). Nu pune două sarcini să editeze simultan `applications-client.tsx`.

## Ulterior (în afara acestui plan, nu se implementează acum)
- Șabloane de email Yes / Maybe / No (cu feedback anonimizat) + export CSV de destinatari.
- Vedere „program" pentru 16 dec.: aplicații cu 4 evaluări, sortate după scorul normalizat, contor „X/32 locuri".
- Trimitere din adresa IAF: depinde de accesul pe care îl obține Christine; amânat până se clarifică.
