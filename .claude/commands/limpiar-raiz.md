---
description: Archivar scripts one-off de la raíz que ya cumplieron su función
argument-hint: "[patrones extra a considerar, ej. seed_* backfill_*]"
---

Revisá la raíz del repo para archivar scripts de un solo uso ya ejecutados.
Patrones extra a considerar además de los de siempre: $ARGUMENTS

1. Listá los candidatos: `migrate_*.js`, `migrate-team.js`, y cualquier script suelto que
   parezca one-off (migración / seed / backfill).
2. Para cada candidato, confirmá con grep que **ningún** archivo del proyecto lo importe o lo
   invoque en runtime (revisá los `.html`, `functions/`, y otros `.js`). Si algo lo referencia,
   **NO lo muevas y avisame.**
3. Mové los confirmados a `scripts/migraciones-hechas/` (creá la carpeta si no existe).
4. **No toques nunca:** `firebase-messaging-sw.js`, los `logo-zd*.png`, ni los archivos de
   config (`firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json`,
   `package*.json`).
5. Commit aparte: `chore: archivar scripts de migración ya ejecutados`. **Sin deploy** — no
   afecta hosting ni functions.
6. Mostrame la lista de lo que moviste y lo que dejaste (con el motivo de cada exclusión).
