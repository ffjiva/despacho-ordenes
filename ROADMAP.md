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
| `index.html` | Despacho Manager — picking con IA | ~3,070 |
| `ops.html` | Operaciones — pendientes, vueltas, entregas, métricas, reposición | ~5,596 |
| `moto.html` | Portal Motorista | ~1,546 |
| `functions/index.js` | Cloud Functions | ~610 |

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
createdBy:      string
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
| `suggestReplenishment` | Sugerencias IA para módulo 6c (claude-haiku-4-5). Requiere Firebase Auth token. |
| `autoCierreJornada` | Cierre automático de jornada. |

**Patrones técnicos:**
- HTTP client: `https` nativo (no @anthropic-ai/sdk)
- API key env var: `ANTHROPIC_KEY`
- Modelo: `claude-haiku-4-5`

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


---

### 🔲 Features próximos

**Módulo 8b — Validación de Inventario Físico** *(ops.html)*
Sube reporte XLS de inventario de bodega/sucursal (uno o varios archivos simultáneos).
Parser SheetJS extrae productos con código, nombre, familia, Disponib. y E/Pedid.
Lista de conteo agrupada por familia. Input numérico por producto. Estados: pendiente / contado / discrepancia.
Progreso persistido en Firestore — puede salir y retomar sin perder avance.
Finalización habilitada solo cuando todos los ítems tienen valor numérico ingresado.
Si hay discrepancias al finalizar → modal de confirmación con conteo de diferencias.
Resultado guardado en Firestore con historial consultable por sucursal y mes.
Asignable a cualquier colaborador con notificación FCM al asignar.
Navegación: botón en topbar desktop + entrada en drawer móvil "⋯".
Prioridad: alta — visita bodega B03 el jueves 05 Jun 2026.

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

---

## Bodegas y sucursales

| Código | Nombre | Tipo | Prioridad reposición |
|---|---|---|---|
| B01 | BODEGA MATRIX SF (Hangar) | Origen | — |
| B02 | BODEGA CENTRAL | Origen | — |
| M01 | ZONA DIGITAL MATRIX (Merliot) | Destino | ALTA |
| S02 | ZONA DIGITAL SAN SALVADOR | Destino | ALTA |
| S04 | ZONA DIGITAL SOYAPANGO | Destino | MEDIA |
| S03 | ZONA DIGITAL SAN MIGUEL | Destino | BAJA |
| S07 | ZONA DIGITAL USULUTAN | Destino | BAJA |
| S06 | ZODITECH | Destino | BAJA |

---

## Cómo usar este archivo con Claude Code

Al abrir una sesión de implementación:
> "Lee el ROADMAP.md del proyecto e implementa [nombre del módulo o feature].
> Respeta las reglas de desarrollo y el stack técnico documentado."

---

*Última actualización: 03 Junio 2026 (bugs)*
