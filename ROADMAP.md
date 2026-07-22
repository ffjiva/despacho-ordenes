# Despacho Ordenes — ROADMAP

> Aplicación web para gestión de picking y despacho de órdenes desde bodega principal
> hacia 2 bodegas secundarias y 6 sucursales.
>
> **Owner:** Fernando (ffjiva)
> **Repo:** https://github.com/ffjiva/despacho-ordenes
> **Hosting:** Firebase Hosting → https://despacho-ordenes.web.app
> **Historial:** trabajo completado en `CHANGELOG.md`

---

## Stack técnico

| Capa | Tecnología |
|---|---|
| Frontend | HTML + CSS + JS vanilla — un archivo por app |
| Base de datos | Firebase Firestore (real-time) |
| Autenticación | Firebase Auth (email/password) — unificado en los 4 archivos |
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

| Archivo | Descripción |
|---|---|
| `index.html` | Despacho Manager — picking con IA |
| `ops.html` | Operaciones — pendientes, vueltas, entregas, colaboradores, agenda, métricas |
| `moto.html` | Portal Motorista |
| `reposicion.html` | Reposición + Inventario + Trazabilidad |
| `functions/index.js` | Cloud Functions |

*Tamaños al 12 Jul 2026 (indicativos, cambian cada sesión): index 3.551 · ops 4.672 ·
moto 1.641 · reposicion 4.189 · functions/index.js 710. Para el número real: `wc -l`.*

---

## Sistema de usuarios (Fundación de Identidad — ✅ completada 06 Jul 2026)

Todos los accesos usan **Firebase Auth (email/password)** + colección `users/{uid}`.
La identidad de persona vive en `colaboradores/{id}` (directorio); la credencial de
acceso vive en `users/{uid}`. Ambas se vinculan mutuamente (`colaboradorId` / `uid`).

users/{uid}
name:         string
email:        string
role:         'super' | 'collaborator' | 'motorista'   ← alias (mantener por compatibilidad)
apps:
  despacho:   { role: 'super' | 'collaborator' | 'motorista' }   ← FUENTE AUTORITATIVA
  ensamblador: { role: 'admin' | 'colaborador' }                  ← presente solo si ON
estado:       'aprobado'
colaboradorId: string | null    ← FK → colaboradores/{id}
active:       boolean
createdAt:    number
fcmTokens:    string[]

colaboradores/{id}  (campos de vinculación)
uid:          string | null     ← FK → users/{uid} — presente solo cuando tiene cuenta

| Rol | index.html | ops.html | moto.html | reposicion.html |
|---|---|---|---|---|
| `super` | ✅ acceso total | ✅ acceso total | ✅ puede entrar | ✅ acceso total |
| `collaborator` | ✅ solo su orden asignada | ❌ bloqueado | ❌ bloqueado | ❌ bloqueado |
| `motorista` | ✅ picking si asignado | ❌ bloqueado | ✅ acceso total | ❌ bloqueado |

Todos los archivos leen `apps?.despacho?.role ?? role` (fallback al alias plano).

**Roles y acceso — grant explícito por app, no automático:**
- `super` = solo Fernando (control total). Nadie más accede a apartados super-only.
- "Encargado" es solo etiqueta de `cargo`; su rol de app hoy es `collaborator`
  (se creará un rol `gerente` cuando se le dé una función propia).
- El acceso a cada app es un **grant explícito** (`apps.*`), precargado según el
  `cargo` pero anulable por el admin. El cargo sugiere; el grant decide.

| Cargo | `apps.despacho.role` | Acceso Ensamblador (default) |
|---|---|---|
| Encargado (etiqueta) | collaborator | Sí |
| Vendedor | collaborator | Sí |
| Técnico | collaborator | Sí |
| Cajera | collaborator | No |
| Redes | collaborator | No |
| Bodeguero | collaborator | No |
| Administrativo | collaborator | No (revisar caso a caso) |
| Motorista | motorista | No |

**Alta, vínculo y recuperación de cuentas:**
- **Provisión por admin** (super): desde la **ficha del colaborador en ops.html**,
  "Crear cuenta de acceso" → email + contraseña temporal + rol (precargado por cargo).
- La CF `createUser` escribe el vínculo en ambos lados: `users/{uid}.colaboradorId`
  y `colaboradores/{id}.uid`.
- Recuperación de acceso: "Restablecer contraseña" por correo (las contraseñas no
  son recuperables; Auth solo guarda hash).

**Usuarios activos (28 Jun 2026):**
- Fernando — `super` — ffjiva@gmail.com — colabId: BZab0b70iiSW96HaORO9
- Miguel Miranda — `collaborator` — pedidos@zonadigitalsv.com — colabId: F55arT4Age5HXJKrao7R
- Guillermo Pleitez — `collaborator` — memo@despacho.com — colabId: 35uEzHoQpFr0OBrkUj5P
- Anderson García — `collaborator` — anderson@despacho.com — colabId: NWnHj4sazyZgGs4L2urP
- Blanca Estela Rivera — `collaborator` — ensamblador ON

**Cloud Function `createUser`:**
`https://us-central1-despacho-ordenes.cloudfunctions.net/createUser`
Acepta parámetro opcional `colaboradorId`; si viene, hace batch atómico:
escribe `users/{uid}` + actualiza `colaboradores/{colaboradorId}.uid`.

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
activeMs: number   ← tiempo de trabajo acumulado; corre solo con la orden abierta (lock activo)
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
| `createUser` | Crea usuario en Firebase Auth + Firestore sin cerrar sesión del super. Acepta `colaboradorId` opcional — si viene, batch atómico escribe `users/{uid}` y actualiza `colaboradores/{id}.uid`. |
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

## 🎯 Frente activo

Sin código aún — los "Historial" que hoy existen en reposicion.html son la trazabilidad e
inventario, no sugerencias por consumo. Prerrequisito cumplido (reposición extraída, F0–F4).

**Reposición — Sugerencias basadas en historial** *(reposicion.html — A3, frente activo)*
Usar la colección `reposiciones` de Firestore para aprender la frecuencia de reposición y,
eventualmente, la velocidad de consumo a partir de snapshots del Gerencial. Plantear en tres
fases. Prerrequisito completado: reposición extraída a `reposicion.html` (F0–F4, Jun 2026).

---

## 🔲 Pendientes (por impacto operativo)

### 🟢 Habilitan operación / delegación

**Falta vista de colaborador para conteos asignados.** `reposicion.html` tiene el acceso cerrado a `ALLOWED = ['super']` (línea ~1076, con comentario "costura" ya dejado en el código). Asignar/reasignar un conteo hoy solo etiqueta el doc y dispara la notificación push — el colaborador no tiene dónde aterrizar esa notificación: ninguna otra app (`index.html`/`ops.html`/`moto.html`) referencia `inventarios`, y el gate de `reposicion.html` lo bloquea. Para cerrar el ciclo falta: (a) ramificar el gate agregando `'collaborator'` a `ALLOWED`, (b) una vista reducida solo-mis-conteos-asignados, (c) revisar `firestore.rules` de `inventarios` (hoy `allow write: if isSuper()` — el colaborador necesitaría poder guardar su propio avance de conteo).
**Nota (12 Jul 2026):** cuando se diseñe esta vista, revisar también a fondo todo el apartado de asignación/reasignación de usuario para conteos (creación en `crearConteoInv`, botón "🔄 Reasignar" del punto 2) — no dar por buena la UI actual de super sin repasarla en conjunto con el flujo de colaborador.

- **Entrada del colaborador (index.html):** cuando se active la asignación de inventarios, el botón vive en `index.html` (donde el colaborador ya entra), con deep-link directo a SU inventario asignado en reposicion.html (ej. `reposicion.html#inv=<id>`), saltándose el home. El super sigue entrando por el botón Reposición de ops. Requiere: ruteo por hash en `reposicion.html` + gate role-aware (la costura de F0).

**Conectar el Ensamblador-ZD** — pausado, a retomar con los archivos del Ensamblador actualizados.
Con la identidad lista, la conexión se reduce a: (1) apuntar el `firebaseConfig`
del Ensamblador al proyecto de Despacho; (2) re-sembrar `catalogo`/`parametros`/
`armados`; (3) fusionar sus reglas de Firestore; (4) leer `apps.ensamblador.role`
en su `AuthScreen`/`AdminPanel`. Los permisos ya se pueden pre-cargar desde ahora.

### 🟡 Soporte

- Geocodificar dirección del XLS de envíos → ubicación en la ficha de moto,
  para que Anderson tenga mejor referencia. *(moto.html)* ⚠️ Bandera de costo:
  Google Geocoding API es de paga (cupo gratis mensual). Alternativa gratis:
  OpenStreetMap/Nominatim, alineada con la preferencia de no sumar pagos y con
  el Leaflet ya previsto para Módulo 9b. Direcciones SV informales → precisión
  variable. Comparar Google-pago vs OSM-gratis con números antes de decidir.

**Recepción en sucursal destino — cotejo de despacho** *(por diseñar — nueva vista, posible `recepcion.html` o pantalla en `index.html`)*
Hoy quien recibe en la sucursal imprime la hoja y coteja los productos a mano.
Idea: una vista para el **recepcionista de cada sucursal**. Cuando una orden pasa a
`dispatched` / `dispatched_incomplete`, "le cae" al recepcionista de la sucursal
destino; al llegar el producto físico, coteja lo despachado de bodega contra lo
recibido (checklist espejo del picking). Cierra el loop del faltante: confirma
discrepancias de despacho incompleto o daños/faltantes en tránsito.

- **Reutiliza `despachos`:** filtrar por `destination == <sucursal del recepcionista>`
  y `status ∈ [dispatched, dispatched_incomplete]`. Registrar el cotejo en un mapa
  espejo aparte (ej. `received: { [productId]: { ok, qtyRecibida, note, time } }`)
  **sin tocar** el `checked` del picking de bodega.
- **Rol nuevo `recepcionista`** scopeado por sucursal — evaluar si absorbe el
  `operador` "pendiente de definir" ya listado en el ROADMAP, o es rol propio.

Preguntas de diseño abiertas (resolver antes de código):
1. ¿El recepcionista se ata a `colaboradores`/`users` con un campo `sucursal`?
2. ¿Vista propia (`recepcion.html`) o pantalla dentro de `index.html` con gate por rol?
3. ¿Estado al terminar el cotejo — nuevo `recibida` / `recibida_con_diferencias`,
   y notificación de vuelta a bodega/super?
4. `firestore.rules`: que el recepcionista escriba solo el mapa `received` de las
   órdenes de SU sucursal.

### ⚪ Menor / estético

**Modal de celebración (pixel-art):** el actual es SVG/CSS hecho a mano. Explorar mejora con herramienta externa de pixel-art (ej. sprite sheet de Aseprite/Piskel animado con `steps()`, o asset con licencia abierta), conservando la estética. *(Claude no genera pixel-art animado directamente; se diseña aparte y se integra.)*

### 🔧 Deuda técnica

**Notificaciones FCM — unificar los 3 triggers** *(`functions/index.js`)*. `onDespachoAssigned`, `onVueltaAssigned` y `onInventarioAsignado` arrancaron iguales y divergieron por copy-paste: solo el de despachos limpia tokens FCM inválidos y envía a **todos** los dispositivos (`sendEach`); vueltas e inventario envían a **uno solo** (`tokens[tokens.length-1]`) y no limpian. Además el comentario de la línea ~128 dice "enviar a todos los tokens" pero el código de abajo envía a uno. Consecuencia: en un segundo dispositivo se pierden las notificaciones de vuelta/inventario y los tokens muertos se acumulan. **Fix:** extraer un helper `notifyOnAssignment(event, { field, notifiedField, buildMessage })` con limpieza de inválidos y envío multi-dispositivo para los tres → corrige el comportamiento y elimina ~70 líneas.

**Menor — consolidar al tocar el archivo:** el plumbing de la API de Claude (options/headers, strip de markdown, guard de `max_tokens`) está duplicado en `parseDocument` y `suggestReplenishment`, con el modelo `'claude-haiku-4-5'` hardcodeado en dos lugares; y el bloque CORS repetido 3×. Un helper `callClaude(body)` y uno de CORS centralizan ambos.

---

## 🔭 Futuro (diseñado, sin fecha)

**Brief matutino — ausencias del equipo** *(ops.html)*
Cuando un colaborador tiene `estadoTipo` (vacaciones/incapacidad/permiso) vigente hoy
(según `estadoDesde`/`estadoHasta` en `colaboradores/{id}`), mostrarlo en el brief
matutino diario (`loadBriefingData`) — ej. "2 colaboradores fuera hoy: Juan Pérez
(vacaciones, hasta 30 jun), María López (incapacidad, hasta 02 jul)". Reutilizar
`colabEstadoActivo(c)`, ya implementada en el módulo Colaboradores.

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

**Otros (parqueados — no suman operatividad diaria; sub-proyectos dedicados):**
- Ruta sugerida optimizada para entregas (TSP): con direcciones geocodificadas,
  armar recorrido que minimice tiempo/distancia. Depende de la geocodificación.
  Ruta gratis posible: OSRM. *(moto.html / nuevo)*
- Rediseño general: el diseño se siente genérico de IA; el funcionamiento es
  correcto. Explorar dirección visual propia respetando el Design System de
  CLAUDE.md (IBM Plex Mono, tema olive-black, industrial/utilitario).
  Sub-proyecto dedicado.
- Pixelart al completar ciertos procesos (estético, no operativo). Ver también
  "Mejoras inventario" punto 4. Sub-proyecto dedicado.

**Rol `operador` — pendiente de definir**
Nuevo rol en consideración. Aún sin definir: archivos a los que tendrá acceso, acciones permitidas vs solo lectura, y qué miembros del equipo lo usarán.

---

## 📋 Backlog de mejoras menores (sin fecha)

- **Exportar PDF mejorado** en picking — incluir logo, firma, totales (index.html)
- **Comentarios por orden** — chat interno entre Fernando y el bodeguero asignado (index.html)
- **Imagen en viñetas de vueltas** — foto adjunta en cards de vueltas (ops.html)
- **GPS picking** — registrar coordenadas al iniciar y completar una orden de bodega (index.html)
- **Agente WhatsApp** — notificaciones o comandos por WhatsApp (largo plazo)
- **Rediseño home ops.html** — revisión estética del layout de navegación principal. Dos conceptos bocetados en sesión 03 Jun 2026: (A) home con botones por módulo agrupados por sección, (B) tabs superiores por módulo. Pendiente de evaluar cuando haya espacio.
- **Modularizar ops.html** — *condicional, no prioritario.* Medición 12 Jul: ops.html
  ~4.672 líneas y **ningún apartado justifica archivo propio** (el más pesado es
  Vueltas+Entregas, que comparten pantalla `s-vueltas`; Colaboradores y Agenda serían los
  candidatos más limpios si algún día hiciera falta). Revisar solo si ops cruza ~6.000
  líneas o un apartado se dispara. Palanca previa recomendada antes de partir ops: un
  `shared.js` para lo duplicado entre index/ops/moto (`esc`/`escHtml`, `fmt*`, auth, FCM)
  — ataca duplicación real sin fragmentar ops.
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

Para consultar qué se hizo y cuándo, ver `CHANGELOG.md` (historial completado, más reciente
arriba). Al cerrar cada sesión, mover lo que pasó de *pendiente* a *hecho* desde este archivo
hacia el CHANGELOG.

---

*Última actualización: 12 Julio 2026 — Reorganización del ROADMAP: historial completado
migrado a `CHANGELOG.md`; este archivo queda como referencia viva (arquitectura + frente
activo + pendientes + futuro). Sesión previa (12 Jul): carga de picking list por XLS, escáner
de lectura única, robustez de `parseInvXLS`, auto-sucursal y reasignación de conteos (lado
super), y fixes de campo — ver CHANGELOG.*
