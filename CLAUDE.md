# CLAUDE.md — Despacho Ordenes

Archivo de convenciones para Claude Code. **Leer antes de cualquier tarea.**
El estado real y la cola priorizada del proyecto viven en `ROADMAP.md` — leerlo primero.
El historial de lo completado y desplegado vive en `CHANGELOG.md` (más reciente arriba).

@ROADMAP.md

## Contexto del proyecto

App web operativa de bodega de una distribuidora de electrónica en El Salvador. Owner:
Fernando (ffjiva), gerente operativo. Despacho desde la bodega principal (B01) a 2 bodegas
secundarias (B02, B03) y 6 sucursales. Usuarios: pickers con celular Android/iOS, a veces
con guantes, bajo presión de tiempo; también supervisores en laptop. Equipo de 1 a 10
personas por día.

**Stack:** HTML + CSS + JS vanilla, **una app standalone por archivo** (`index.html`,
`ops.html`, `moto.html`, `reposicion.html`). Firestore (real-time) + Firebase Auth. Backend
en **Cloud Functions v2** (Node.js, `functions/index.js`). IA vía Claude API
(`claude-haiku-4-5`). Hosting/Storage/Push en Firebase. **Sin frameworks, sin build step.**

**Repo:** https://github.com/ffjiva/despacho-ordenes ·
**Hosting:** https://despacho-ordenes.web.app

### Las 4 apps y su acceso por rol

| Archivo | Rol | Acceso |
|---|---|---|
| `index.html` | Despacho Manager — picking con IA | super, collaborator, motorista |
| `ops.html` | Operaciones — pendientes, vueltas/entregas, colaboradores, agenda, métricas, cierre | super |
| `moto.html` | Portal Motorista — vueltas y entregas | super, motorista |
| `reposicion.html` | Reposición + Inventario + Trazabilidad | super (vía ops) |

**Roles:** `super` (Fernando) · `collaborator` · `motorista`. Fuente autoritativa del rol:
`apps?.despacho?.role ?? role`. La UI se diferencia por rol en cada app.

### Bodegas
- **B01 (Hangar / Matrix SF)** — principal; aquí ingresa todo el producto.
- **B02 (Central)** — secundaria heredada; hoy casi solo salen cosas.
- **B03 (Oriente)** — auxiliar; adelanta voluminosos para S03 y S07.

## Reglas de desarrollo

- Cada app vive en su propio archivo standalone. Sin frameworks externos (sin React, Vue, jQuery).
- **Leer en frío antes de proponer.** Preguntas de diseño **antes** de escribir código.
- **Cambios quirúrgicos** (find/replace o anclas de texto exactas), nunca reescrituras de
  archivo completo. **Si un ancla no matchea el código actual, avisá y pará** en vez de improvisar.
- Al entregar código, **un solo bloque consolidado listo para pegar** — nunca fragmentos parciales.
- Respetar las variables CSS del `:root` existente — **nunca hardcodear colores.**
- Priorizar usabilidad móvil antes que desktop.
- Las modificaciones de **Cloud Functions** se indican por separado — no tocar los `.html` por eso.
- **Validación por fase antes de seguir:** `node --check` para `functions/index.js`; para los
  HTML, smoke test en navegador (no hay `node --check` de HTML — cargar la app y probar el
  flujo tocado).

## Convenciones de código

```javascript
// Pantallas: showScreen('s-nombre')
// Selección: $('id')
// Estado global: curId, curData, currentUser, currentRole, isLocal
// Guardar Firestore: dbUpdate(id, { campo: valor })
// Escuchar cambios: dbListen(id, callback)
// Roles: currentUser?.role === 'super' | 'collaborator' | 'motorista'
```

## Design System — reglas activas

### Tokens (no modificar sin justificación)
- Fuentes: **IBM Plex Mono** (primaria, identidad técnica) + IBM Plex Sans.
- Tema dark base **olive-black**. Los valores exactos viven en el `:root` de cada archivo —
  **usar siempre las variables, nunca el hex a mano.** (Referencia actual en `reposicion.html`:
  `--bg #161410`, `--surface #1f1c18`, `--accent2 #4caf7d` verde lima = "completado",
  `--r 6px`, `--r2 10px`. Pueden variar levemente entre archivos; el `:root` manda.)
- Semántica de color: `done` / `warn` / `err` / `info` — respetarla en todos los componentes.

### Principios de diseño
- INDUSTRIAL/UTILITARIO: claridad operativa sobre estética decorativa.
- Tapzones mínimos **44px** en móvil — se usa con dedos, a veces con guantes.
- Contraste alto en interactivos — bodega con luz variable.
- Animaciones solo donde aporten feedback operativo (check de ítem, carga, error).
- Sin decoración superflua: sin gradientes innecesarios, sin sombras pesadas.

### Al crear o modificar componentes visuales
1. Usar variables CSS del `:root` — nunca valores hardcodeados.
2. Verificar que funcione en **375px** de ancho (iPhone SE / Android entry-level).
3. Estados interactivos explícitos: hover, active, disabled, loading.
4. Consistencia con componentes existentes: `.btn`, `.badge`, `.ic`, `.dcard`, `.box`.

## Firestore / Firebase

- Colecciones principales: `despachos`, `users`, `vueltas`, `domicilios`, `reposiciones`,
  `proyecciones`, `inventarios`, `colaboradores`, y config en `config/*`. Esquema completo en
  `ROADMAP.md`.
- Usuarios y roles: `users/{uid}` (`role: super | collaborator | motorista`). Identidad de
  persona en `colaboradores/{id}`, vinculada por `uid`/`colaboradorId`.
- `config/team` está **DEPRECADO** — NO usar como fuente de usuarios (solo persiste por tokens
  FCM legacy).
- Siempre manejar errores de red con **feedback visual** al usuario.

## Flujo de deploy (obligatorio)

Siempre en este orden — **nunca saltarse el commit**:
1. `git add <archivos>`
2. `git commit -m "..."`
3. `firebase deploy --only hosting` y/o `firebase deploy --only functions`

Si se deploya antes de commitear, Firebase verá el código como "sin cambios" en el siguiente
deploy y lo saltará silenciosamente (bug difícil de detectar).

**Si el deploy toca `index.html`:** subir `APP_VERSION` (constante cerca de `uid()`) antes del
paso 1, y después del paso 3 correr `npm run version:publish` — lee `APP_VERSION` de
`index.html` y lo escribe en `config/version.latest` (Firestore), lo que dispara el banner de
"hay una actualización" (`initVersionCheck`) en las sesiones que quedaron con el build viejo
cacheado. Requiere `scripts/utilidades/serviceAccountKey.json` (gitignored, no versionado).

## Para cambios en Cloud Functions
Indicarlo por separado — no modificar los `.html` por esos cambios.

## Cierre de sesión (ritual — no omitir)

Al terminar, **reconciliar**: lo que pasó de *pendiente* a *hecho* se **mueve** de `ROADMAP.md`
a `CHANGELOG.md` — **nunca se documenta en ambos**. Entrada nueva del CHANGELOG arriba, con
fecha y archivos tocados. Actualizar el esquema Firestore del ROADMAP si se agregaron
colecciones o campos.
