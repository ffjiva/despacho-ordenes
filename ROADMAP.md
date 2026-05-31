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
assignedTo:     string   ← nombre del collaborator
assignedToUid:  string   ← uid Firebase Auth
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
Asignación al crear orden. `assignedTo` (nombre) + `assignedToUid` (uid). Collaborator ve solo sus órdenes. Botón Reasignar solo para super.

### Módulo 4 — Vista Supervisor
Filtros en s-home: Todas / Pendientes / En proceso / Completadas. Badge "🔒 En uso por X" (lock TTL 30 min). Badge "Tú". Generador de etiquetas de caja 4x6": destino grande, número de orden, "CAJA X DE Y", logo ZD base64, selector de diseño de logo (ícono / texto / completo).

### Módulo 5 — Vista Colaborador
Collaborator ve solo sus órdenes. "Esperando que me den" si no hay órdenes asignadas. Empty state correcto al filtrar. Banner de progreso: "📋 X orden(es) · Y/Z productos · N%". Filtros ocultos para collaborator. Título "📦 Mis Órdenes" vs "📦 Despachos". Mensaje de modo lectura diferenciado. Órdenes archivadas clickeables (solo lectura).

### Módulo 6c — Generador de Órdenes de Reposición
`ops.html` → pantalla `s-reposicion`. Parser SheetJS local + sugerencias IA. Algoritmo 2 fases (mínimos por prioridad + excedente proporcional). Panel ⚙ PARÁMETROS. Opción "Completar al tope". Modo Compra: sube GerencialTotal.xls + archivo de compra → sugiere distribución respetando topes por sucursal. Genera XLS biff8 por par Origen→Destino. Persistencia sessionStorage.

**Feature B — Pendiente:**
- Umbrales por categoría (en lugar de mínimos/topes planos)
- Redistribución sucursal→sucursal

### Módulo 7 — Trazabilidad de Reposiciones
`ops.html` → pantalla `s-trazabilidad`. Registro automático en Firestore al generar XLS. Filtros por origen, destino, fecha. Cards expandibles con detalle de productos.

### Módulo 8 — Domicilios (Entregas a clientes)
`ops.html` → tab Entregas en s-vueltas. Import XLS de domicilios → Firestore. Estados: pendiente / en_camino / entregado / no_entregado. Editar, eliminar, reagendar, reasignar individualmente. GPS en inicio y fin. Fotos por entrega. Arrastres de días anteriores (últimos 30 días). Integrado en cierre de jornada y métricas.

---

## Pendientes

### 🔧 Deuda técnica

**Código PIN legacy en index.html**
`s-pin`, `loadPinScreen`, `doPinLogin`, `showSuperPin` siguen en el código pero nunca se activan — el flujo real usa Firebase Auth. Candidato a limpiar en próxima sesión de refactor.

**`config/team` escrito por ops.html**
Al modificar usuarios desde `s-equipo` en ops.html, se reescribe el array `config/team.members` completo, lo que puede borrar campos no contemplados. Riesgo bajo en producción actual ya que config/team está deprecado como fuente de usuarios, pero conviene revisar si ops.html aún escribe ahí.

---

### 🔲 Features próximos

**Reabrir orden** *(index.html — s-pick)*
Botón visible solo para `super` que revierte `dispatched` → `pending`. Previene errores operativos al despachar por accidente. Acordado en sesión 30/05/2026.

**Búsqueda de productos en picking** *(index.html — s-pick)*
Input de búsqueda por nombre o código. Útil en órdenes de 50+ productos para evitar scroll.

**Modo escáner de código de barras** *(index.html — s-pick)*
Abrir cámara, escanear código del producto → marcarlo automáticamente. Requiere librería de lectura de códigos (ZXing o similar).

**Módulo 6d — Puente identidades motorista↔bodeguero**
Si Anderson necesita hacer picking desde index.html, requiere vincular su cuenta `motorista` con acceso a despachos. Pendiente de confirmar con Anderson: ¿usa index.html? ¿desde qué dispositivo? No implementar hasta confirmar el flujo real.

---

### 🔭 Ideas a futuro (diseñadas, sin fecha)

**Módulo 8b — Validación de Inventario Físico** *(ops.html)*
Sube reporte XLS de inventario de bodega/sucursal. Parser SheetJS extrae productos con código, nombre y cantidad del sistema. Lista para marcar ítem por ítem durante el conteo físico con cantidad contada y estado (pendiente / contado / discrepancia). Resultado guardado en Firestore para consulta posterior.

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

---

### 📋 Backlog de mejoras (sin fecha)

Mejoras menores para implementar cuando haya espacio:
- **Exportar PDF mejorado** en picking — incluir logo, firma, totales (index.html)
- **Comentarios por orden** — chat interno entre Fernando y el bodeguero asignado (index.html)
- **Imagen en viñetas de vueltas** — foto adjunta en cards de vueltas (ops.html)
- **GPS picking** — registrar coordenadas al iniciar y completar una orden de bodega (index.html)
- **Agente WhatsApp** — notificaciones o comandos por WhatsApp (largo plazo)

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

*Última actualización: Mayo 2026*
