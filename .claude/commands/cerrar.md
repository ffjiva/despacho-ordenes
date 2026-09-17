---
description: Ritual de cierre de sesión — reconciliar ROADMAP.md → CHANGELOG.md y publicar (commit + push + deploy)
argument-hint: "[nota opcional para la entrada del CHANGELOG]"
---

Ejecutá el ritual de cierre de sesión de Despacho Ordenes: reconciliá la documentación
y luego PUBLICÁ (commit → push → deploy). NO edites código de las apps en este comando;
el código de la sesión ya debió quedar trabajado antes de correr /cerrar.

1. Leé `ROADMAP.md` y `CHANGELOG.md`.
2. Identificá qué pasó en esta sesión de *pendiente* a *hecho*, basándote en los cambios
   REALES: revisá `git status`, `git diff` y `git log origin/main..HEAD --oneline`
   (commits de la sesión que aún NO están en GitHub). No asumas.
3. **Mové** esos ítems de `ROADMAP.md` a `CHANGELOG.md` — nunca los dejes en ambos:
   - Entrada nueva en `CHANGELOG.md` **arriba de todo** (más reciente primero), con:
     fecha de hoy, archivos tocados, y una descripción concisa de qué se hizo y por qué.
   - Quitá del `ROADMAP.md` los pendientes ya cubiertos y actualizá el "Frente activo"
     y la línea de "Última actualización" al pie.
4. Si se agregaron colecciones o campos de Firestore, actualizá el esquema en `ROADMAP.md`.
5. Nota extra para la entrada (si la doy): $ARGUMENTS
6. Mostrame un resumen de los cambios a ROADMAP y CHANGELOG y esperá mi OK.
   ⚠ Mi OK autoriza TODO el cierre: guardar los docs Y publicar (commit + push + deploy).
   Si no doy OK, DETENTE y no toques nada.

--- Publicación (ejecutar SOLO después de mi OK, en este orden) ---

7. Guardá los cambios de `ROADMAP.md` y `CHANGELOG.md`.
8. Publicá:
   - `git add -A`
   - Si hay cambios staged: `git commit -m "docs: cerrar sesión — <resumen corto>"`
     (si no hay nada nuevo que comitear, saltá el commit: pueden existir commits de
      código de la sesión ya hechos que igual hay que pushear).
   - `git push origin main`   ← IMPRESCINDIBLE: GitHub es de donde se alimenta el
     contexto del proyecto. Sin push, el sitio queda desplegado pero el contexto lee viejo.
   - `firebase deploy`
9. **Verificación final (siempre):** corré `git status -sb` y `git log origin/main..HEAD --oneline`.
   - Si dice "up to date with 'origin/main'" y no hay commits pendientes → confirmame en
     una línea: documentado, pusheado a GitHub y desplegado.
   - Si algo quedó sin pushear o el `firebase deploy` falló → avisame EN GRANDE qué falló
     y exactamente qué comando reintentar.
