---
description: Ritual de cierre de sesión — reconciliar ROADMAP.md → CHANGELOG.md
argument-hint: "[nota opcional para la entrada del CHANGELOG]"
---

Ejecutá el ritual de cierre de sesión de Despacho Ordenes. Es solo documentación —
NO toques código de las apps en este comando.

1. Leé `ROADMAP.md` y `CHANGELOG.md`.
2. Identificá qué pasó en esta sesión de *pendiente* a *hecho*. Basate en los cambios reales
   (revisá `git status` / `git diff` y lo trabajado), no asumas.
3. **Mové** esos ítems de `ROADMAP.md` a `CHANGELOG.md` — nunca los dejes en ambos:
   - Entrada nueva en `CHANGELOG.md` **arriba de todo** (más reciente primero), con: fecha de
     hoy, archivos tocados, y una descripción concisa de qué se hizo y por qué.
   - Quitá del `ROADMAP.md` los pendientes ya cubiertos y actualizá el "Frente activo".
4. Si se agregaron colecciones o campos de Firestore, actualizá el esquema en `ROADMAP.md`.
5. Nota extra para la entrada (si la doy): $ARGUMENTS
6. Mostrame un resumen de los cambios a ROADMAP y CHANGELOG **antes de guardar** y esperá mi OK.
7. Recordatorio de deploy (no lo ejecutes salvo que te lo pida): `git add` → `git commit` →
   `firebase deploy`.
