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
fcmTokens:    { [deviceId]: string } | string[]   ← mapa por dispositivo (nuevo, un token
                                                     por aparato); arreglo legacy tolerado
                                                     por compatibilidad en el backend

colaboradores/{id}  (campos de vinculación)
uid:          string | null     ← FK → users/{uid} — presente solo cuando tiene cuenta
telefono:     string | null     ← principal, destino de WhatsApp (aviso de asignación en index.html)
telefono2:    string | null     ← secundario, opcional

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
running:  boolean  ← true mientras el picker tiene la app visible/activa; false al pausar
                     (visibilitychange oculto) o volver al home — el chip en vivo solo
                     tickea si running !== false
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
proyecciones/{id}
destino, destinoNombre, fecha, timestamp
ordenNo, provisional: string   ← "Provisional N" (correlativo por sucursal)
encargadoNombre, encargadoCorreos: string[]
productos: [{ codigo, nombre, cantidad, familia }]
totalUnidades, enviadoPor: string
config/proyeccion
counters: { [sucId]: number }   ← correlativo Provisional por sucursal (desde 1)
config/agenda
events: []
config/version
latest: string   ← APP_VERSION del build actualmente desplegado; publicado por
                   `npm run version:publish` tras cada deploy que toque index.html.
                   index.html escucha este doc (initVersionCheck) y muestra un
                   banner de actualización si su APP_VERSION quedó desactualizado.
config/team
← DEPRECADO como fuente de usuarios.
Solo persiste por FCM tokens legacy. No usar para nuevos desarrollos.
config/compraExclusions
proveedores: string[], codigos: string[], keywords: string[]
← no inventariables a ignorar al parsear "Reporte de Compras por Producto"
(reposicion.html, modo compra). Editable desde panel ⚙️ Exclusiones.
productImages/{code}
code, name, url, source: 'upload'|'link'
updatedAt: number, updatedBy, updatedByName, updatedByRole
← catálogo compartido de fotos de producto para picking (index.html);
  cualquier autenticado crea, solo super reemplaza/borra
stock_snapshots/{fecha}
fecha: string   ← YYYY-MM-DD (fecha SV, doc id) — una foto por día, la última carga gana
timestamp: number, cargadoPor: string, totalProductos: number
productos: { [code]: { [sucId]: qty } }   ← solo sucursales (SNAP_SUCS), omite ceros
← retrato del stock por sucursal cada vez que se carga el Gerencial (reposicion.html);
  base del Radar de Reposición (A3). Solo super escribe.
sales_snapshots/{rango}
rangoInicio, rangoFin: string   ← YYYY-MM-DD (doc id = "{rangoInicio}_{rangoFin}")
dias: number, timestamp: number, cargadoPor: string
totalProductos: number, sinGerencial: string[]   ← códigos del reporte no encontrados en repProductMap
ventas: { [code]: { [sucId]: unidadesEnLaVentana } }   ← TOTALES, no normalizado; se
  divide por `dias` al leer para obtener unidades/día
← reporte "ProductoPorSucursal" cargado a demanda (botón 📈 Recalibrar en el Radar A3);
  recalibra el consumo al instante. Solo super escribe.

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
| `sendProjection` | Envía por correo (SMTP nodemailer, `mail.zonadigitalsv.com:465`, remitente `operaciones@zonadigitalsv.com`, secret `SMTP_PASS`) el PDF de proyección de envío al encargado. v2, super-only. |

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

*(sin frente activo definido — A3 Radar de Reposición se cerró completo en sus 3 fases
el 24 Ago 2026, ver CHANGELOG. Candidatos en "🔲 Pendientes" más abajo: retomar
"Conectar el Ensamblador-ZD", o diseñar "Recepción en sucursal destino — cotejo de
despacho". A definir con Fernando en la próxima sesión.)*

*Ciclos previos cerrados — historial: "Conteos asignables al colaborador" (fases 1, 1.1, 2)
cerrado, desplegado y movido al CHANGELOG (30 Jul 2026); filtro de asignables por rol
+ etiqueta también cerrado y movido al CHANGELOG (30 Jul 2026); SSO (unificación del nombre
de instancia Firebase App a `despacho-main` en las 4 apps) cerrado, desplegado y validado en
real por Fernando (30 Jul 2026); login solo-super en reposicion.html (bloquea a no-super por
formulario, entran vía SSO) también cerrado, desplegado y cubierto por test e2e (30 Jul 2026,
ver CHANGELOG); ciclo de testing de Cloud Functions vía emulator (cobertura e2e happy-path +
smoke test de Functions + fix de cuentas huérfanas en `createUser`) cerrado y movido al
CHANGELOG (31 Jul 2026), incluyendo el deploy de `createUser` a producción (31 Jul 2026,
ver CHANGELOG); teléfono secundario en ficha de colaborador y aviso semi-automático por
WhatsApp al asignar orden (ítems ad-hoc, no listados previamente en pendientes) cerrados y
movidos al CHANGELOG (07 Ago 2026); botón "Sucursal a 0" y modal de confirmación genérico
(`confirmModal`) en reposicion.html (ítems ad-hoc, no listados previamente en pendientes)
cerrados y movidos al CHANGELOG (10 Ago 2026); migración del resto de `confirm()` nativos a
`confirmModal` en reposicion.html (ítem ad-hoc, continuación de la sesión anterior) cerrada y
movida al CHANGELOG (10 Ago 2026); redistribución del pool liberado al poner una sucursal en 0
+ exclusión persistente de sugerencias futuras (`repZeroedSucs`) en reposicion.html (ítem
ad-hoc, continuación de la misma sesión) cerrada, validada con smoke test Playwright y movida
al CHANGELOG (10 Ago 2026); migración de los 33 `alert()` nativos restantes a `alertModal` en
reposicion.html (ítem ad-hoc, detectado por Fernando al probar en real, continuación de la
misma sesión) cerrada, validada con smoke test Playwright y movida al CHANGELOG (10 Ago 2026);
ocultar sugerencias de sucursales puestas en 0 en `renderRepTable()` (ítem ad-hoc) y aviso por
WhatsApp tras enviar la proyección vía `wa.me` (resuelve el ítem de Backlog homónimo) en
reposicion.html cerrados, probados en producción por Fernando y movidos al CHANGELOG
(13 Ago 2026); congelar el timer de órdenes al pausar (`running` en `despachos`, ítem ad-hoc,
pedido directamente por Fernando) en index.html cerrado y movido al CHANGELOG (18 Ago 2026);
PDF de orden calcado del formato de facturación (jsPDF) + chequeo de versión desplegada
(banner de actualización) en index.html, junto con el fix de compatibilidad de
`firebase-admin` v14 en los scripts de `scripts/utilidades/`, cerrados, desplegados en
producción y movidos al CHANGELOG (18 Ago 2026); fotos de producto en la picking list (chip
+ catálogo compartido `productImages/{code}`, ítem ad-hoc pedido directamente por Fernando) en
index.html cerrada, validada en celular vía canal preview de Firebase Hosting y movida al
CHANGELOG (19 Ago 2026); notificaciones FCM duplicadas en el mismo dispositivo (`fcmTokens`
de arreglo acumulativo a mapa por `deviceId`, ítem ad-hoc reportado por Fernando) en
`functions/index.js`, `index.html` y `moto.html` cerrada, desplegada en producción y movida
al CHANGELOG (20 Ago 2026); UI optimista en las acciones de vueltas y domicilios (`irEnCamino`,
`completarVuelta`, `salirDomicilio`, `acabeDomicilio`, `confirmarNoEntrega`, `revertirVuelta`,
`reintentarEntrega`; ítem ad-hoc, continuación de un refactor local interrumpido por un
reinicio del equipo) en moto.html cerrada, desplegada en producción y movida al CHANGELOG
(24 Ago 2026); A3 — Radar de Reposición (`reposicion.html`, `firestore.rules`) cerrado
completo en sus 3 fases y desplegado a producción (24 Ago 2026, ver CHANGELOG): F1
captura de snapshots (`stock_snapshots/{fecha}`) + vista Radar por frecuencia; F2
consumo por deltas de 2 snapshots + parser/carga del reporte de ventas
*ProductoPorSucursal* (`sales_snapshots/{rango}`) + señal 🔴 crítico / 🟠 ya toca /
⚫ estancado; F3 cantidad sugerida por consumo (`radarSugerido()`, horizonte 14 días,
tope por sucursal) + botón "pasar a reposición" que pre-llena la tabla respetando el
pool de bodega. Pendiente de esta sesión: validar en producción con datos reales de una
sucursal (incluye el reporte de ventas real de F2, que seguía sin probarse con datos
de verdad).*

---

## 🔲 Pendientes (por impacto operativo)

### 🟢 Habilitan operación / delegación

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

- **Logo en el PDF de orden** *(index.html)* — el PDF de "ORDEN DE ENVIO" (jsPDF, cerrado
  18 Ago 2026) ya incluye firma y totales calcados de facturación; falta insertar el logo.
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

*Última actualización: 24 Agosto 2026 — A3 Radar de Reposición cerrado completo en sus
3 fases (F1 frecuencia, F2 consumo, F3 cantidad sugerida + botón "pasar a reposición"),
desplegado a producción (ver CHANGELOG); pendiente validar en real con datos de una
sucursal. Sin frente activo definido para la próxima sesión.*
