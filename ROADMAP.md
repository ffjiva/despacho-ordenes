# Despacho Ordenes — ROADMAP

> Aplicación web para gestión de picking y despacho de órdenes desde bodega principal
> hacia 1 bodega secundaria y 6 sucursales.
>
> **Owner:** Fernando (ffjiva)
> **Repo:** https://github.com/ffjiva/despacho-ordenes
> **Hosting:** Firebase Hosting → https://despacho-ordenes.web.app

---

## Stack técnico

| Capa | Tecnología |
|---|---|
| Frontend | HTML + CSS + JS vanilla — un archivo por app |
| Base de datos | Firebase Firestore (real-time) |
| Autenticación | Firebase Auth (email/password) — unificado en los 3 archivos |
| Backend / IA | Google Cloud Functions (Node.js) — `functions/index.js` |
| IA de extracción | Claude API via Cloud Function `parseDocument` (claude-haiku-4-5) |
| Hosting | Firebase Hosting |

**Reglas de desarrollo:**
- Todo el frontend vive en un solo archivo por app (sin frameworks externos)
- Sin React, sin Vue, sin jQuery
- Respetar variables CSS del `:root` existente
- Priorizar usabilidad móvil (celular Android/iOS)
- Aquí en el chat se diseña — Claude Code implementa

---

## Archivos del proyecto

| Archivo | Descripción | Líneas aprox. |
|---|---|---|
| `index.html` | Despacho Manager — picking con IA | ~3,214 |
| `ops.html` | Operaciones — pendientes, vueltas, entregas, métricas, reposición | ~7,170 |
| `moto.html` | Portal Motorista | ~1,569 |
| `functions/index.js` | Cloud Functions | ~660 |

---

## Sistema de usuarios (unificado — Mayo 2026)

Todos los accesos usan **Firebase Auth (email/password)** + colección `users/{uid}`.
users/{uid}
name:      string
email:     string
role:      'super' | 'collaborator' | 'motorista'
active:    boolean
createdAt: number
fcmTokens: string[]

| Rol | index.html | ops.html | moto.html |
|---|---|---|---|
| `super` | ✅ acceso total | ✅ acceso total | ✅ puede entrar |
| `collaborator` | ✅ solo su orden asignada | ❌ bloqueado | ❌ bloqueado |
| `motorista` | ✅ picking si asignado | ❌ bloqueado | ✅ acceso total |

**Usuarios activos:**
- Fernando — `super` — ffjiva@gmail.com
- Miguel — `collaborator` — pedidos@zonadigitalsv.com
- Memo — `collaborator` — memo@despacho.com
- Anderson De Sousa — `motorista` — anderson@despacho.com

**Cloud Function `createUser`:**
`https://us-central1-despacho-ordenes.cloudfunctions.net/createUser`

---

## Esquema Firestore
despachos/{id}
name, orderNumber, orderDate, origin, destination
assignedTo:     string   ← uid Firebase Auth
assignedToName: string   ← nombre para display
createdBy:      string   ← uid Firebase Auth
createdByName:  string   ← nombre para display
photos:         string[] ← URLs de fotos de preparación (Storage)
products:       [{ id, name, code, qty, family }]
checked:        { [productId]: { done, time, note } }
status:         'pending'|'active'|'done'|'dispatched'|'dispatched_incomplete'
lockedBy, lockedAt, archived, originalUrl
startedAt, completedAt, dispatchedAt, createdAt: number
users/{uid}
(ver arriba)
vueltas/{id}
date, order, destination, description, assignedTo (uid)
status: 'pending'|'en_camino'|'done'
linkedOrderIds: string[]
emergency: boolean
photos: string[]
createdAt, completedAt: number
domicilios/{id}
type: 'domicilio', date, cliente, telefono, total
formaPago, direccion, puntoReferencia, departamento, municipio
empresaEnvio, assignedTo, status, motivoNoEntrega
fechaReagenda, photos, gpsInicio, gpsFin
createdAt, completadoAt: number
reposiciones/{id}
fecha, timestamp, origen, destino
productos: [{ codigo, nombre, cantidad }]
totalUnidades, generadoPor: string
config/agenda
events: []
config/team
← DEPRECADO como fuente de usuarios.
Solo persiste por FCM tokens legacy. No usar para nuevos desarrollos.

---

## Cloud Functions activas

| Función | Descripción |
|---|---|
| `parseDocument` | Extrae productos de PDF/imagen con Claude API. Requiere Firebase Auth token. |
| `parseXLS` | Parsea reporte de domicilios XLS (SheetJS). Requiere Firebase Auth token. |
| `createUser` | Crea usuario en Firebase Auth + Firestore sin cerrar sesión del super. |
| `onDespachoAssigned` | Trigger Firestore: notificación FCM al asignar orden. Busca por nombre en `users/`, `sendEach()`, limpieza de tokens inválidos. |
| `onVueltaAssigned` | Trigger Firestore: notificación FCM al asignar vuelta. Mismo patrón que `onDespachoAssigned`. |
| `onInventarioAsignado` | Trigger Firestore: notificación FCM al asignar validación de inventario físico (módulo 8b). Mismo patrón que `onDespachoAssigned`. |
| `suggestReplenishment` | Sugerencias IA para módulo 6c (claude-haiku-4-5). Requiere Firebase Auth token. |
| `autoCierreJornada` | Cierre automático de jornada. |

**Patrones técnicos:**
- HTTP client: `https` nativo (no @anthropic-ai/sdk)
- API key env var: `ANTHROPIC_KEY`
- Modelo: `claude-haiku-4-5`
- `parseDocument` y `suggestReplenishment` migradas a Cloud Functions **v2** (`onRequest`) con config inline (timeout/memoria estables al redeploy). Eliminado import muerto de `firebase-functions` en raíz. (17 Jun 2026)

---

## Convenciones de código

```javascript
// Pantallas: showScreen('s-nombre')
// IDs: $('id')
// Estado global: curId, curData, currentUser, currentRole, isLocal
// Guardar Firestore: dbUpdate(id, { campo: valor })
// Escuchar cambios: dbListen(id, callback)
// Renderizar picking: renderPick()
// Renderizar home: renderDash(list)
// Roles: currentUser?.role === 'super' | 'collaborator' | 'motorista'
```

---

## Módulos completados ✅

### Módulo 1 — Autenticación
Firebase Auth email/password en los 3 archivos. `users/{uid}` con name, email, role, active, createdAt. Persistencia automática. Logout limpio.

### Módulo 2 — Roles
Roles `super`, `collaborator`, `motorista`. UI diferenciada según rol. Panel "👥 Equipo" en index.html para crear/desactivar usuarios. Firestore Rules aplicadas.

### Módulo 3 — Asignación de órdenes
Asignación al crear orden. `assignedTo` (uid) + `assignedToName` (nombre para display). Collaborator ve solo sus órdenes. Botón Reasignar solo para super.

### Módulo 4 — Vista Supervisor
Filtros en s-home: Todas / Pendientes / En proceso / Completadas. Badge "🔒 En uso por X" (lock TTL 30 min). Badge "Tú". Generador de etiquetas de caja 4x6": destino grande, número de orden, "CAJA X DE Y", logo ZD base64, selector de diseño de logo (ícono / texto / completo).

### Módulo 5 — Vista Colaborador
Collaborator ve solo sus órdenes. "Esperando que me den" si no hay órdenes asignadas. Empty state correcto al filtrar. Banner de progreso: "📋 X orden(es) · Y/Z productos · N%". Filtros ocultos para collaborator. Título "📦 Mis Órdenes" vs "📦 Despachos". Mensaje de modo lectura diferenciado. Órdenes archivadas clickeables (solo lectura).

### Módulo 6c — Generador de Órdenes de Reposición
`ops.html` → pantalla `s-reposicion`. Parser SheetJS local + sugerencias IA. Algoritmo 2 fases (mínimos por prioridad + excedente proporcional). Panel ⚙ PARÁMETROS. Opción "Completar al tope". Modo Compra: sube GerencialTotal.xls + archivo de compra → sugiere distribución respetando topes por sucursal. Genera XLS biff8 por par Origen→Destino. Persistencia sessionStorage.

**Nota de diseño — Multi-archivo Gerencial:**
El soporte para múltiples archivos XLS en reposición normal fue diseñado
para enriquecer la columna "Marca" — el GerencialTotal aporta el stock
(first-write-wins) y los archivos adicionales por marca solo aportaban el
campo brand usando el nombre del archivo como fuente. Este flujo está
obsoleto: REP_KNOWN_BRANDS ya contiene el listado completo de 209 marcas
activas, por lo que el parser detecta la marca directamente desde el nombre
del producto en el GerencialTotal. El multi-archivo sigue funcionando por
compatibilidad pero no es necesario en el flujo diario.

**Reposición — Bodega Oriente (B03) + saneamiento de categorías (17 Jun 2026):**
- **Selector de origen:** control segmentado B01+B02 / B01 / B02 / B03. `repOrigin`
  + `repTargets()` calculan los destinos según el origen. Disponible y reservas
  centralizados en `repAvailable()` / `repPoolCeiling()` / `repReserveFor()`
  (B01 reserva 2; B02 y B03 reserva 0). `REP_DIST_PCT` 85% como tope byPct.
- **B03 como destino:** Bodega Oriente, regional (surte principalmente S03/S07).
  Recibe de B01/B02. Aparece como pestaña destino cuando el origen es B01/B02/B01+B02.
  Como origen, redistribuye a todas las sucursales (capacidad para casos ocasionales).
- **Mínimo por categoría en B03:** `REP_B03_CATEGORIES` (6 categorías voluminosas:
  Gaming Chairs, Monitores, Cases, Smart TV, Escritorios, Sillas) + helper
  `repMinFor(p, sid)`. B03 solo mantiene mínimo (6) en esas categorías; 0 en el resto.
  Lista confirmada cruzando el inventario físico de B03 contra el Gerencial.
- **Lista blanca de categorías:** `REP_CATEGORIES` (137 categorías activas). El parser
  solo acepta como categoría lo que esté en el catálogo; los nombres de producto sueltos
  ("NEGRO", "NAVYTECH…", etc.) se ignoran en vez de volverse categorías falsas. Log de
  auditoría `repRejectedCats` en consola para detectar desajustes de texto.
- **Auto-refresco de categoría:** al reutilizar un producto existente en el parser, su
  categoría se actualiza con el parse actual (`if (localCat) cur.cat = localCat`). Un
  re-upload del Gerencial corrige categorías viejas sin limpiar sessionStorage a mano.
- **Fix briefing:** `loadBriefingData` ahora cuenta motoristas activos desde `users/{uid}`
  vía `loadTeamMembers()` (antes leía `config/team`, deprecado).

**Reposición — Pool en vivo (Fase 4) + repartidor global + auto-fill a mínimos (20 Jun 2026):**
- **Pool en vivo:** el "disponible" por producto se descuenta en tiempo real al teclear
  cantidades entre destinos. Tope DURO en el input (no deja asignar de más). Zona ámbar al
  usar la reserva (stock−reserva → stock), roja al topar el pool. Variante B: el texto de
  aviso solo aparece en ámbar/rojo, nunca en verde.
- **Repartidor global `repAllocate(code)`:** reemplaza al viejo `assignOrigins()` por-destino.
  Drena las bodegas en orden de prioridad (M01→S02→S04→B03→S03→S07→S06) sobre todos los
  destinos a la vez, cerrando el bug latente donde B01 podía sobre-pedirse entre pestañas.
  `generateRepXLS`/`generateAllRepXLS` iteran dinámicamente sobre los orígenes; B03 genera
  archivo propio (`BodegaOriente`).
- **Columnas que drenan en vivo (Paso 2):** B01/B02 muestran `alloc.remain` y bajan al teclear
  (`data-stk` para updates puntuales del DOM). Footer TOTAL GENERAL y "asignado" en vivo vía
  `refreshRepStockTotals()` + predicado `repRowMatches()`. Cabecera "disponible" muestra el
  pool restante (`poolRemainF`), no el stock físico estático.
- **Columna B03 dedicada (Paso 2b):** B03 siempre visible en todas las pestañas; las columnas
  del origen activo drenan, las pasivas se atenúan (`td-stk-passive`, opacidad .42).
- **B03 como origen surte solo S03/S07:** `REP_ORIGIN_DESTS` + `repOriginServes()`. SUG y la
  distribución IA se limitan a destinos servidos; pestañas no servidas atenuadas
  (`rtab-unserved`) sin bloquear el input manual.
- **`repClampAll()`:** red de seguridad que recorta asignaciones sobre-pasadas en orden inverso
  de prioridad tras un re-upload. Queda casi siempre dormida: el merge usa "primer valor gana"
  por bodega (re-subir NO baja stock), `sessionStorage` se limpia entre sesiones, y los topes
  duros previenen la sobre-asignación. Correcto para el flujo "Limpiar todo → sesión nueva".
  **Nota arquitectónica:** si en el futuro se quiere que recargar el Gerencial refresque stock,
  hay que cambiar el merge a sobreescritura por bodega presente (opción A); ahí el clamp pasa a
  ser verificable y útil. Hoy = opción B (sin cambios), deliberada.
- **Auto-fill a mínimos al cargar:** `computeRepSuggestions(minimumsOnly)` salta la Fase 2
  (excedente) en carga y cambio de origen → ENVIAR arranca solo en mínimos (SUG) en orden de
  prioridad drenando el pool. El botón IA (`analyzeWithAI` → CF `suggestReplenishment`, Haiku)
  y "Completar al tope" en Parámetros conservan la distribución de excedente — caminos
  separados, intactos.

### Módulo 7 — Trazabilidad de Reposiciones
`ops.html` → pantalla `s-trazabilidad`. Registro automático en Firestore al generar XLS. Filtros por origen, destino, fecha. Cards expandibles con detalle de productos.

### Reabrir orden *(index.html — s-home + s-pick)*
Botón "🔓 Reabrir" visible solo para `super` en tarjeta home y en banner de s-pick.
Revierte `dispatched` / `dispatched_incomplete` / `done` → `active`.
Limpia `completedAt`, `dispatchedAt`, `incompleteItems`. Conserva checks de picking.

### Fotos de preparación *(index.html + moto.html)*
Sección "📷 Fotos de preparación" al final de s-pick. Botones Cámara y Galería.
Máximo 5 fotos por orden. Solo disponible en órdenes `active` o `done` y sin modo lectura.
Storage path: `despachos/{id}/fotos/{timestamp}_{name}.ext`.
Modal de celebración incluye botón "📷 Documentar preparación".
`moto.html`: tarjeta de vuelta muestra thumbnails del despacho vinculado (prefetch async con cache `despachoPhotosCache`).

### Módulo 8 — Domicilios (Entregas a clientes)
`ops.html` → tab Entregas en s-vueltas. Import XLS de domicilios → Firestore. Estados: pendiente / en_camino / entregado / no_entregado. Editar, eliminar, reagendar, reasignar individualmente. GPS en inicio y fin. Fotos por entrega. Arrastres de días anteriores (últimos 30 días). Integrado en cierre de jornada y métricas.

### Búsqueda en picking *(index.html — s-pick)*
Input de búsqueda por nombre o código en la barra de filtros de s-pick. Filtra productos en tiempo real. Útil en órdenes de 50+ productos para evitar scroll excesivo.

### Módulo 6d — Puente motorista↔bodeguero *(index.html)*
El rol `motorista` ahora puede acceder a `index.html` y ver solo sus órdenes asignadas, igual que `collaborator`. Tres ajustes en goHome() y renderDash(): query filtrado por UID, filtros ocultos, título "📦 Mis Órdenes". Anderson De Sousa validado en producción.

### Escáner de código de barras *(index.html — s-pick)*
Implementado con html5-qrcode@2.3.8. Modal con visor de cámara trasera, modo único y modo continuo (switch). Marca productos automáticamente por coincidencia de campo `code`. Feedback: sonido vía Web Audio API (tono ascendente en éxito, grave en error), vibración en Android. Mensajes: "Este código no va muñeco, revise bien" / "Ya lo habias puesto" / "✅ [nombre producto]". Validado en iOS Safari y Chrome Windows.

### Fix isReadOnly — comparación por UID únicamente *(index.html)*
Eliminadas comparaciones legacy por `currentUser.name` en el bloque isReadOnly. Ahora solo compara por `currentUser.uid`, consistente con el modelo Auth actual.

### Layout barra filtros móvil *(index.html — s-pick)*
Media query `@media (max-width: 600px)` aplica `flex-wrap: wrap` a `.filter-bar`. Buscador y botón escáner ocupan fila completa en móvil, con input expandible y botón fijo a la derecha. Sin cambios en escritorio.

### Módulo 8b — Validación de Inventario Físico ✅ *(ops.html)*
Parser XLS multi-archivo con detección dinámica de headers. Extrae código,
nombre, familia, Disponib. y E/Pedid. Lista de conteo agrupada por familia,
colapsable. Input numérico por producto con estados pendiente/contado/discrepancia
en tiempo real. Progreso persistido en Firestore — sale y retoma sin perder avance.
Finalización habilitada solo cuando todos los ítems tienen valor. Modal de
celebración con pixel art + confeti al completar. Historial consultable por
sucursal y mes, con secciones colapsables de discrepancias y coincidencias,
código UPC visible y exportación a XLS. Asignable a cualquier colaborador
con notificación FCM via `onInventarioAsignado`. Navegación: botón topbar
desktop + drawer móvil. Desplegado: 03 Jun 2026.

### Corrección de bugs — sesión 03 Jun 2026 *(index.html + ops.html + moto.html)*
Revisión minuciosa de los tres archivos. 25 bugs corregidos en total.

**Alto riesgo (12 bugs):**
- `index.html` — Filtro "Pendientes" mostraba órdenes activas (`'active'` → `'pending'`)
- `index.html` — `applyUpdate`: errores de Firestore silenciosos → ahora muestra banner `pick-save-err` por 5s
- `index.html` — `dbListen`: sin error handler → ahora muestra "Conexión perdida" en s-pick
- `index.html` — `getOrCreateUserProfile`: race condition asignaba rol `super` a múltiples usuarios simultáneos → siempre `collaborator`, super se asigna manualmente
- `ops.html` — `createVuelta` / `saveVueltaEdit`: `members` fuera de scope → crash en cada creación de vuelta; corregido con texto del `<option>` seleccionado
- `ops.html` — `initVueltasScreen` / `openNewVueltaModal`: selects de motorista con `value="[object Object]"` → corregido a `m.uid` / `m.name`
- `ops.html` — `markVueltaDone`: sobreescribía `date` de la vuelta al completar → campo eliminado del update
- `ops.html` — `saveAgendaEvent` / `deleteAgendaEvent`: `setDoc({events})` borraba el campo `eventos` completo → `setDoc(..., {merge:true})`
- `moto.html` — `init()`: sin guardia post-fallo de Firebase → pantalla de login bloqueada sin mensaje
- `moto.html` — `buildDomCard`: flujo "No pude entregar" sin botón en UI → añadido "✕ No pude" visible en estado `en_camino`
- `moto.html` — `escAttr`: solo escapaba `'`; ahora escapa también `<`, `>`, `"`
- `moto.html` — `active === false`: permitía entrada a usuarios con campo `active` ausente/null → cambiado a `active !== true`

**Riesgo medio (9 bugs):**
- `index.html` — `toggleItem` + `markItemFromScanner`: celebración podía dispararse dos veces → guarda `status !== 'done'`
- `index.html` — XSS stored en `innerHTML`: `p.name`, `p.code`, `p.family`, `d.name`, `d.assignedToName` → función `esc()` añadida y aplicada
- `index.html` — Auto-archivado en `renderDash`: podía generar ráfaga de escrituras por snapshot → `_archiveQueued` Set
- `ops.html` — `openEditDomModal`: sin try/catch → `editingDomId` podía quedar apuntando a orden incorrecta
- `ops.html` — `getYesterdaySV`: mezclaba zonas horarias → usa `toLocaleDateString('en-CA', {timeZone:'America/El_Salvador'})`
- `ops.html` — `buildCierreResumen`: `startOfDay` en zona local del browser → fijo a `T00:00:00-06:00`
- `ops.html` — `confirmImport`: sin límite de batch Firestore (max 500) → chunking de 499
- `moto.html` — `prefetchDespachoPhotos`: re-renderizaba toda la lista aunque no hubiese fotos nuevas
- `moto.html` — `uploadFoto`/`uploadFotoDom`: globals `fotoVueltaId`/`fotoDomId` con race condition + botón incorrecto deshabilitado

**Riesgo bajo (4 bugs):**
- `index.html` — Banner MODO LECTURA usaba variable `d` indefinida; modal "en uso" mostraba UID en vez de nombre
- `ops.html` — `setFilter`/`toggleDone`: recreaban listener Firestore en cada clic → ahora filtran `_allPendientes` en memoria
- `ops.html` — `repRedistData` no se persistía en sessionStorage al guardar sesión de reposición
- `moto.html` — `closeNoEntregaModal`: `e.target` → `e.currentTarget`; `toggleComentario`/`guardarComentario` sin null guards

---

## Pendientes

### 🔧 Deuda técnica

**[RESUELTO 03 Jun 2026] — assignedToName en domicilios**
`confirmImport()` solo guardaba `assignedTo` (UID) sin `assignedToName`.
Las cards de ops.html y moto.html mostraban el UID en lugar del nombre.
Fix: obtener el texto del option seleccionado al momento del import y
guardar `assignedToName` en Firestore junto con `assignedTo`.

**[RESUELTO 03 Jun 2026] — moto.html queries por nombre en lugar de UID**
`moto.html` filtraba los listeners de Firestore (vueltas, domicilios,
carryover) usando `profile.name` en lugar del UID. Al migrar a Firebase
Auth los assignedTo pasaron a guardar UIDs, causando que Anderson no viera
sus entregas asignadas. Fix: separar `currentDriverUid` (para queries
Firestore) de `currentDriver` (para display). Fallback uid||nombre para
documentos legacy.

**[RESUELTO 03 Jun 2026] — Timezone en nombres de archivos XLS**
4 ocurrencias de `new Date().toISOString().slice(0,10)` en generación de
nombres de archivos XLS usaban UTC, mostrando fecha del día siguiente
después de las 6 PM en El Salvador. Reemplazadas por `getTodaySV()`.

**[RESUELTO 04 Jun 2026] — Auditoría completa UID vs nombre (index.html + ops.html + moto.html)**
Revisión sistemática de los 3 archivos. Hallazgos y fixes aplicados:

- `moto.html` — filtros client-side en `fetchArrastre`/`fetchEnCola` comparaban
  `assignedTo` (UID) contra `currentDriver` (nombre) como fallback legacy → siempre
  fallaba. Eliminado el fallback; filtros usan solo `currentDriverUid`.
- `moto.html` — paths de Storage (`vueltas/` y `domicilios/`) usaban `currentDriver`
  (nombre con espacios/acentos) → paths inválidos. Cambiados a `currentDriverUid`.
- `index.html` — dropdown de filtro supervisor guardaba nombre en `value`; filtro
  comparaba `assignedToName || assignedTo` (nombre) contra ese valor → nunca matcheaba
  documentos nuevos (que guardan UID). Fix: dropdown ahora guarda UID en `value`,
  muestra nombre en texto, filtro compara `d.assignedTo === supUserFilter` (UID vs UID).
- `index.html` — banner modo lectura ya mostraba `lockedByName || lockedBy` ✓
- `index.html` — PDF export usa `assignedToName || assignedTo` ✓
- `index.html` — path foto Storage sanitizado: `currentUser.name` → `safeName` con regex
- `ops.html` — métricas y cierre agrupan motoristas por `assignedToName || assignedTo`
  en los dos bloques de cálculo (`buildMetricas` y `buildCierreResumen`).
- `ops.html` — cards de vueltas y domicilios, briefing y cierre incompletos ya usaban
  `assignedToName || assignedTo` ✓
- `moto.html` — cards de domicilios muestran `assignedToName || assignedTo` ✓

**[RESUELTO 17 Jun 2026] — Migración Cloud Functions v2**
`parseDocument` y `suggestReplenishment` migradas de `functions.https.onRequest` (v1)
a `onRequest` (v2) con timeout/memoria inline. Eliminado el `require("firebase-functions")`
muerto en raíz. Verificado en producción.

**[RESUELTO 17 Jun 2026] — Briefing contaba motoristas desde config/team**
`loadBriefingData` leía la colección deprecada `config/team` para el conteo de motoristas
activos. Ahora usa `loadTeamMembers()` (consulta `users/{uid}` por role + active).

**[RESUELTO 17 Jun 2026] — Bodega Oriente (B03) en reposición**
Ver Módulo 6c: selector de origen, B03 como destino, mínimo por categoría (6 voluminosas),
lista blanca de 137 categorías y auto-refresco de categoría al reutilizar.

---

### 🔲 Features próximos

**Reposición — Validación pre-XLS (cinturón y tirantes)** *(ops.html)* — **SIGUIENTE PASO**
Gate único antes de generar, solo en `generateActiveRepXLS()` y `generateAllRepXLS()` (NUNCA en
el interno `generateRepXLS(sucId)`, para no avisar por destino). Dos piezas:
1. **Aviso de frescura:** al cargar el Gerencial se guarda la hora (campo nuevo `loadedAt` en
   `saveRepSession`/`loadRepSession`). Si al generar pasaron >90 min, avisa "El Gerencial se
   cargó hace X. Si hubo ventas el stock pudo bajar. ¿Generar igual o recargar?". Ataca la
   causa real de los dos desfases vs facturación.
2. **Re-chequeo interno liviano:** vuelve a correr el repartidor y avisa si alguna bodega quedó
   sobre-pedida, si hay líneas a un destino no servido bajo origen B03, o líneas de productos ya
   ausentes del Gerencial (huérfanas de sesión restaurada). Rara vez dispara; cubre bordes.
Si todo está limpio y fresco, genera directo sin clicks extra. Ventana = 90 min. Diseñado,
pendiente de implementar.

**Navegación con URLs relativas** *(index.html + ops.html + moto.html)*
Botones "Ops"/"Órdenes" usan URLs absolutas hardcodeadas (`window.open('https://despacho-ordenes.web.app/...')`),
lo que en previews salta a producción. Cambiar a relativas (`window.open('ops.html')`).
**OJO:** los deep links `?orden=` que se comparten externamente deben quedar absolutos.

---

### 🔭 Ideas a futuro (diseñadas, sin fecha)

**Módulo 9 — Base de datos de colaboradores** *(ops.html)*
Directorio interno del equipo, diferente a `users/{uid}`. Campos: nombre, cargo, sucursal, fecha de ingreso, contacto, evaluación, fotografía. Futura relación con `users/{uid}` para vincular colaboradores que usen la app con los que no.

Esquema Firestore propuesto:
colaboradores/{id}
nombre, cargo, sucursal, fechaIngreso
contacto, evaluacion, fotoUrl, active

**Módulo 9b — Mapa de sucursales** *(ops.html o index.html)*
Mapa interactivo con Leaflet.js (gratuito) mostrando ubicaciones geográficas de bodegas y sucursales. Al tocar un marcador → tarjeta con datos: código, nombre, dirección, teléfono, encargado, horario.

Esquema Firestore propuesto:
ubicaciones/{id}
codigo, nombre, tipo: 'sucursal'|'bodega'
lat, lng, direccion, telefono
encargado, horario, fotoUrl, activo

**Módulo 10 — Mapeo de bodegas** *(index.html — s-pick)*
Plano visual interactivo de las bodegas con pasillos y estantes zonificados. Cada producto tiene asignada una ubicación (ej. "B-3"). Buscador: ingresar nombre o código → resalta la zona en el plano. En s-pick, cada ítem muestra badge "📍 B-3". Información alimentada desde reportes de inventario (Módulo 8b).

Esquema Firestore propuesto:
productos_ubicacion/{productCode}
code, name, bodega
zona (ej. "B-3"), updatedAt

**Reposición — Sugerencias basadas en historial** *(ops.html — diferida)*
Usar la colección `reposiciones` de Firestore para aprender la frecuencia de reposición y,
eventualmente, la velocidad de consumo a partir de snapshots del Gerencial. Plantear en tres
fases. Diferida hasta extraer reposición a su propio archivo (ver backlog "Modularizar ops.html").

**Rol `operador` — pendiente de definir**
Nuevo rol en consideración. Aún sin definir: archivos a los que tendrá acceso, acciones permitidas vs solo lectura, y qué miembros del equipo lo usarán.

---

### 📋 Backlog de mejoras (sin fecha)

Mejoras menores para implementar cuando haya espacio:
- **Exportar PDF mejorado** en picking — incluir logo, firma, totales (index.html)
- **Comentarios por orden** — chat interno entre Fernando y el bodeguero asignado (index.html)
- **Imagen en viñetas de vueltas** — foto adjunta en cards de vueltas (ops.html)
- **GPS picking** — registrar coordenadas al iniciar y completar una orden de bodega (index.html)
- **Agente WhatsApp** — notificaciones o comandos por WhatsApp (largo plazo)
- **Rediseño home ops.html** — revisión estética del layout de navegación principal. Dos conceptos bocetados en sesión 03 Jun 2026: (A) home con botones por módulo agrupados por sección, (B) tabs superiores por módulo. Pendiente de evaluar cuando haya espacio.
- **Modularizar ops.html** — supera 7,000 líneas, difícil de editar (agrava el stale-cache de Claude Code). Opción: módulos ES nativos (sin build), empezando por extraer reposición. Reto: estado compartido (`repProducts`, `repSendData`, etc.). También un `shared.js` para lógica duplicada entre index/ops/moto.
- **Export XLS según filtro activo** *(ops.html)* — exportar solo lo del filtro/pestaña visible, como acción separada y explícita, NUNCA reemplazando el export completo.
- **Debounce de `refreshRepStockTotals`** *(ops.html)* — condicional. Hoy no hay lag al teclear sobre las 3,668 filas sin filtrar. Si en el futuro se percibe delay, envolver en debounce (~120 ms) para no recalcular `repAllocate` sobre todo el filtrado en cada tecla. Mitigación lista, sin aplicar hasta que haga falta.
- **Revisar integración WhatsApp** *(moto.html)* — `wa.me/${WHATSAPP_GROUP}` (~líneas 1406/1460): la constante está definida pero no es funcional. Revisar si es código muerto a eliminar o feature a completar.

---

## Bodegas y sucursales

| Código | Nombre | Tipo | Prioridad reposición |
|---|---|---|---|
| B01 | BODEGA MATRIX SF (Hangar) | Origen | — |
| B02 | BODEGA CENTRAL | Origen | — |
| B03 | BODEGA ORIENTE | Origen + Destino (regional) | surte S03/S07 |
| M01 | ZONA DIGITAL MATRIX (Merliot) | Destino | ALTA |
| S02 | ZONA DIGITAL SAN SALVADOR | Destino | ALTA |
| S04 | ZONA DIGITAL SOYAPANGO | Destino | MEDIA |
| S03 | ZONA DIGITAL SAN MIGUEL | Destino | BAJA |
| S07 | ZONA DIGITAL USULUTAN | Destino | BAJA |
| S06 | ZODITECH | Destino | BAJA |

**Nota B03 (Bodega Oriente):** bodega regional con doble rol. Recibe de B01/B02 (como
destino, con mínimo por categoría en voluminosos) y redistribuye a sucursales (como origen,
principalmente S03/S07). En el reparto de destinos B03 va en prioridad 4 (después de
M01/S02/S04), así que para artículos escasos puede quedar en 0 si el pool se agota antes;
en ese caso se ajusta la cantidad a mano. Posible revisión futura de su prioridad.

---

## Cómo usar este archivo con Claude Code

Al abrir una sesión de implementación:
> "Lee el ROADMAP.md del proyecto e implementa [nombre del módulo o feature].
> Respeta las reglas de desarrollo y el stack técnico documentado."

---

*Última actualización: 20 Junio 2026*
