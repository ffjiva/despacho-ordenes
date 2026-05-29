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
| Frontend | HTML + CSS + JS vanilla — todo en `index.html` |
| Base de datos | Firebase Firestore (real-time) |
| Autenticación | Firebase Auth (pendiente de implementar) |
| Backend / IA | Google Cloud Functions (Node.js) |
| IA de extracción | Claude API via Cloud Function `parseDocument` |
| Hosting | Firebase Hosting |

**Reglas de desarrollo:**
- Todo el frontend vive en un solo archivo `index.html`
- Sin frameworks externos (sin React, sin Vue, sin jQuery)
- Respetar variables CSS del `:root` existente
- Priorizar usabilidad móvil (celular Android/iOS)

---

## Estado actual (Mayo 2026)

### Módulos completados
- **Módulo 1** ✅ — Firebase Auth con email/password en index.html y ops.html
- **Módulo 2** ✅ — Roles super/collaborator, assignedTo con UID, Firestore Rules, índices
- **Módulo 3** ✅ — Banner colaborador en s-home, FCM corregido para usar users/{uid}

### Bug pendiente — Creación de usuarios desde la app
`_createUser` en `index.html` falla silenciosamente al crear app secundaria de Firebase.
El usuario se crea en Firebase Authentication pero no en Firestore `users/{uid}`.
Workaround actual: crear el documento en Firestore manualmente.
Próximo fix: revisar por qué `FIREBASE_CFG` no resuelve el problema en runtime.

### Cambios recientes aplicados
- `assignedTo` migrado a UID + `assignedToName` como display
- `currentUser` es objeto `{uid, email, name, role}` en index.html y ops.html
- Cloud Functions `parseDocument`, `suggestReplenishment`, `parseXLS` protegidas con Firebase Auth token
- Firestore Rules cubre todas las colecciones incluyendo ops_pendientes, cierres, agenda
- `config/team` permite lectura sin auth para moto.html
- `ops.html` fix: loader `s-loading` se oculta correctamente en onAuthStateChanged
- `s-pick` topbar reorganizada en 2 filas para móvil
- Despacho incompleto: status `dispatched_incomplete`, validación de notas obligatorias
- `window.fbApp = fbApp` expuesto globalmente en initFirebase()

### Usuarios activos en el sistema
- Fernando — super — ffjiva@gmail.com
- Miguel (pedidos) — collaborator — pedidos@zonadigitalsv.com
- Memo — collaborator — memo@despacho.com (perfil Firestore creado manualmente)
- Anderson De Sousa — collaborator — anderson@despacho.com (pendiente crear perfil Firestore)

### Pendiente inmediato
- Crear perfil Firestore de Anderson manualmente (igual que Memo)
- Corregir nombres en Firestore: ffjiva → Fernando, pedidos → Miguel
- Módulo 4 — Vista Supervisor + Generador de etiquetas

---

## Módulos pendientes

### Módulo 1 — Autenticación `[PRIORIDAD ALTA]`
**Firebase Auth con email/password**

- Pantalla de login/registro antes de `s-home`
- Guardar `uid` y `email` en perfil de usuario
- Migrar `currentUser` (actualmente solo nombre local) a usuario autenticado
- Logout desde menú de equipo o header
- Persistencia de sesión entre visitas

**Cambios en Firestore:**
```
users/{uid}
  name: string
  email: string
  role: 'super' | 'collaborator'
  createdAt: number
```

---

### Módulo 2 — Roles `[PRIORIDAD ALTA — depende de Módulo 1]`
**Dos roles: `super` y `collaborator`**

- `super` → Fernando (ffjiva). Acceso total.
- `collaborator` → personal de bodega. Acceso restringido.
- El primer usuario registrado se auto-asigna como `super`
- Fernando puede cambiar el rol de cualquier usuario desde el panel de equipo

**Reglas de Firestore a actualizar:**
```javascript
// Solo usuarios autenticados pueden leer/escribir
// Solo super puede crear/eliminar despachos
// Collaborator solo puede actualizar checked{}
```

---

### Módulo 3 — Asignación de órdenes `[depende de Módulo 2]`
**Flujo mejorado de asignación**

- Al crear una orden, Fernando asigna directamente a un colaborador
- Notificación visual en `s-home` para el colaborador: "Tienes X órdenes asignadas"
- El colaborador solo puede ser asignado a su propia orden (no puede reasignar)

---

### Módulo 4 — Vista Supervisor `[depende de Módulo 2]`
**Fernando ve todo el panorama operativo**

- `s-home` muestra todas las órdenes del día con progreso en tiempo real
- Filtros por: estado (en proceso / listo), colaborador asignado, sucursal destino
- Indicador visual de quién está trabajando activamente en cada orden
- **Generador de etiquetas de caja** (ver sección separada abajo)

---

### Módulo 5 — Vista Colaborador `[depende de Módulo 2]`
**El colaborador ve solo lo que le corresponde**

- Al iniciar sesión, va directo a `s-pick` de su orden asignada
- No ve otras órdenes en curso
- No puede crear ni eliminar órdenes
- Si no tiene orden asignada, ve pantalla de espera: "Sin órdenes asignadas por ahora"

---

## Feature: Generador de etiquetas de caja `[diseñado — pendiente de implementar]`

**Contexto del negocio:**
El equipo empaca 20–50 cajas por despacho. Actualmente escriben el destino a mano
sobre cada caja. Se necesita una solución de impresión rápida desde bodega.

**Recursos disponibles:** Impresora de papel normal Letter/A4.

**Flujo:**
1. Desde `s-pick`, botón "📦 Etiquetas" (visible solo para `super`)
2. Modal de configuración:
   - Destino → pre-lleno desde `curData.destination`, editable
   - Número de orden → pre-lleno desde `curData.orderNumber`
   - Total de cajas → input numérico
3. Genera ventana de impresión: **2 etiquetas por hoja** (media carta c/u)
4. Cada etiqueta muestra:
   - **DESTINO** — texto grande, fondo negro, letras blancas (legible a distancia)
   - Número de orden
   - **CAJA X DE Y** — en recuadro con borde grueso
   - Fecha y logo de la empresa

**Encaje en módulos:** Se implementa dentro del Módulo 4 (Vista Supervisor),
ya que el botón es exclusivo del rol `super`.

---

## Convenciones de código

```javascript
// Pantallas: showScreen('s-nombre')
// IDs de elementos: $('id')
// Estado global: curId, curData, currentUser, isLocal
// Guardar en Firestore: dbUpdate(id, { campo: valor })
// Escuchar cambios: dbListen(id, callback)
// Renderizar picking: renderPick()
// Renderizar home: renderDash(list)
```

---

## Módulo 6c — Generador de Órdenes de Reposición [COMPLETADO — Mayo 2026]

### Ubicación
ops.html → pantalla s-reposicion

### Acceso
Botón "📊 Reposición" en topbar de s-home (id="btn-reposicion")

### Flujo
1. Subir GerencialTotal.xls + archivos por marca opcionales
2. Parser local (SheetJS) extrae stock por producto y ubicación
3. Algoritmo 2 fases sugiere cantidades automáticamente
4. Fernando revisa, ajusta con panel ⚙ PARÁMETROS
5. Genera XLS por par Origen→Destino
6. Carga al sistema: Nueva Orden → Origen → Destino → Import. Excel

### Algoritmo de sugerencias
Fase 1 — Cubrir mínimos en orden de prioridad:
  M01(5) → S02(5) → S04(3) → S03(2) → S07(2) → S06(2)

Fase 2 — Distribuir excedente proporcionalmente:
  Pesos: M01:4, S02:4, S04:4, S03:3, S07:3, S06:2
  Solo si stock actual < tope: M01=10, S02=10, S04=6, S03=5, S07=4, S06=5

Parámetros configurables (panel ⚙):
  - Reserva B01: 2 uds (default)
  - % a distribuir: 85% (default)
  - Mínimos por sucursal (ajustables)
  - Topes por sucursal (ajustables)

### Stack técnico
- Parser: SheetJS 0.18.5 (local, sin Cloud Function)
- Marcas: 209 marcas oficiales del sistema de facturación
- Persistencia: sessionStorage (persiste al recargar, limpia al cerrar tab)
- Cloud Function IA: suggestReplenishment (claude-haiku-4-5, ANTHROPIC_KEY)
- Salida: .xls formato biff8 (compatible sistema facturación)
- Archivo: Reposicion_BodegaCentral_Merliot_2026-05-24.xls

### Bodegas origen
- B01: BODEGA MATRIX SF (Hangar)
- B02: BODEGA CENTRAL

### Sucursales destino
- M01: ZONA DIGITAL MATRIX (Merliot) — prioridad ALTA
- S02: ZONA DIGITAL SAN SALVADOR — prioridad ALTA
- S04: ZONA DIGITAL SOYAPANGO — prioridad MEDIA
- S03: ZONA DIGITAL SAN MIGUEL — prioridad BAJA
- S07: ZONA DIGITAL USULUTAN — prioridad BAJA
- S06: ZODITECH — prioridad BAJA

### Pendientes (Feature B)
- Distribución por ingreso de compra (Compra604.xls formato confirmado)
- Opción B: umbrales por categoría
- Redistribución sucursal→sucursal

### Patrones técnicos confirmados (Cloud Functions)
- HTTP client: https nativo (no @anthropic-ai/sdk)
- API key env var: ANTHROPIC_KEY
- Modelo activo: claude-haiku-4-5

---

## Módulo 7 — Trazabilidad [COMPLETADO — Mayo 2026]
- Registro Firestore de cada vuelta/entrega con timestamps
- Pantalla historial en ops.html con filtros origen/destino/fecha
- Campo fecha en modal Editar Vuelta
- Botones Cámara/Galería en modales Nueva/Editar Vuelta (ops.html)

---

## Sesión Mayo 26 2026 — Fixes y mejoras moto.html + ops.html

### moto.html — completado
- Filtros Vueltas/Entregas/Terminadas/En cola funcionando
- escHtml → esc reemplazo global
- Cards de entrega (domicilios) colapsables con toggle ▾/▲
- Botón comentario sin uppercase ni spinner en vueltas y entregas
- Orden correcto: ACABÉ → foto → comentario
- cachedArrastre independiente del listener (arrastres visibles en "Todas")
- Carryover domicilios: query simplificada sin índice compuesto
- iniciarCamaraMovil / elegirDeGaleria separados para domicilios
- Botones Salir/ACABÉ con feedback inmediato (GPS fire-and-forget)
- merge() prioriza todayItems sobre carryoverItems

### ops.html — completado
- loadArrastre sin índice compuesto (date >= + date < mismo campo)
- switchVueltasTab deduplicado (eliminada versión sync duplicada)
- renderTodas incluye arrVueltas y arrDomicilios deduplicados
- renderEntregasFiltradas muestra sección de arrastres
- Badge "VENCIDA" oculto en vueltas con status done

---

## Rediseño visual — Design System unificado [PRÓXIMA SESIÓN]

### Objetivo
Aplicar un design system con identidad propia a los 3 archivos
del proyecto: moto.html, ops.html e index.html.
El objetivo es diferenciarse del "AI app aesthetic" genérico
(fondo negro puro + verde neón + mono font + borde brillante)
sin romper la funcionalidad actual.

### Dirección elegida: Opción A — Industrial/Logística
Inspirado en interfaces de almacén y transporte real.
- Fondo: no negro puro sino dark slate/charcoal (ej. #1a1c1e, #22252a)
- Acento: ámbar/naranja quemado en lugar de verde genérico
  (ej. #c87941, #d4894a) — evoca etiquetas, advertencias, carga
- Tipografía: mantener mono font pero con pesos más marcados
  y jerarquía más clara (title/body/meta bien diferenciados)
- Cards: bordes sutiles sin glow, sombras suaves con color
- Sensación general: herramienta de trabajo seria y funcional,
  no dashboard de startup

### Opciones documentadas (descartadas por ahora)

**Opción B — Dark UI con personalidad propia**
- Mantener dark mode pero con acento único no genérico:
  teal oscuro (#2a9d8f), naranja quemado o azul índigo (#3d5a80)
- Cards con bordes más sutiles y sombras en lugar de glow
- Más respiro entre elementos, menos densidad visual

**Opción C — Refinamiento del sistema actual**
- No cambiar paleta base, solo afinar proporciones:
  mejores tamaños tipográficos, espaciado más consistente,
  jerarquía más clara entre título/subtítulo/metadata
- El cambio se nota en calidad de ejecución, no en estilo

### Alcance
- Definir nuevas variables CSS :root compartidas (design tokens)
- Aplicar a los 3 archivos: moto.html, ops.html, index.html
- Priorizar moto.html (más usado por el equipo en campo)
- No tocar lógica JS, solo CSS y estructura HTML de las cards

### Skill requerida
Leer /mnt/skills/public/frontend-design/SKILL.md antes de
proponer cualquier cambio visual.

---

## Cómo usar este archivo con Claude Code

Al abrir una sesión de implementación:
> "Lee el ROADMAP.md del proyecto e implementa [nombre del módulo o feature].
> Respeta las reglas de desarrollo y el stack técnico documentado."

---

## Módulo 7 — Trazabilidad de Reposiciones [COMPLETADO — Mayo 2026]

### Ubicación
ops.html → pantalla s-trazabilidad (acceso desde botón 📋 Historial en s-reposicion)

### Objetivo
Registrar y consultar el historial de órdenes de reposición generadas con el módulo 6c.

### Flujo
1. Fernando genera XLS desde s-reposicion
2. Al hacer clic en "Generar XLS" → se guarda automáticamente un registro en Firestore
3. Desde botón "📋 Historial" accede a s-trazabilidad
4. Consulta con filtros por origen, destino y fecha
5. Toca una card para ver el detalle de productos enviados

### Colección Firestore
reposiciones/{id}
fecha:         string    // "2026-05-24"
timestamp:     number    // Date.now()
origen:        string    // "B01" | "B02" | sucursal
destino:       string    // "M01" | "S02" | "S03" | "S04" | "S06" | "S07"
productos:     Array<{ codigo, nombre, cantidad }>
totalUnidades: number
generadoPor:   string

### Funciones clave
- `saveReposicionRecord()` — escribe en Firestore, fallo silencioso
- `loadTrazabilidad()` — query últimos 100 registros desc
- `renderTrazabilidad()` — filtra y renderiza cards expandibles
- `goTrazabilidad()` / `goBackFromTrazabilidad()` — navegación

---

## Mejoras Mayo 2026 — ops.html

- Campo fecha editable en modal Editar Vuelta (ve-fecha)
- Botones Cámara / Galería en modales Nueva Vuelta y Editar Vuelta
- Fix dark mode: selects motorista usan var(--text)/var(--surface)
- Opción "Completar al tope" en módulo 6c: sugiere tope−stock en lugar de distribución proporcional

---

## Mejoras Mayo 2026 — moto.html

- Cards expandibles con toggle ▼/▲ (header siempre visible, detalle colapsado)
- Feedback visual en botones "En camino" y "ACABÉ" mientras espera GPS
- Fix re-render arrastre: actualiza cachedList en memoria tras updateDoc
- Campo comentario por vuelta dentro del detalle expandible
- Botones Cámara / Galería para fotos de vueltas
- Filtros: Todas / Vueltas / Entregas / ✓ Terminadas / ⏳ En cola
- "En cola": muestra vueltas y domicilios pendientes de los últimos 30 días

---

## Mejoras de diseño pendientes (moto.html)

### Rediseño visual de fichas (vueltas y entregas)
- Revisar jerarquía tipográfica: tamaños, pesos y colores de fuente
  para mejorar legibilidad en móvil
- Revisar paleta de colores de los estados (pendiente, en camino,
  completado, no entregado) en modo oscuro
- Mejorar separación visual entre la cabecera colapsada y el
  detalle expandido
- Considerar micro-animación suave en el toggle expand/collapse
- Revisar consistencia entre estilos de cards de vueltas vs entregas
  (actualmente tienen estructuras CSS distintas)

---

*Última actualización: Mayo 2026*

---

## Módulo 7 — Design System Unificado [COMPLETADO — Mayo 2026]

### Cambios aplicados
- Paleta cálida oscura unificada en index.html, ops.html y moto.html
- Nueva variable --brand: #c8922a (ámbar) como acento principal
- --accent2: #4caf7d (verde) reservado exclusivamente para estados completados
- Tapzones mínimos 44px en s-pick (checkbox 26px, padding aumentado)
- Contraste mejorado en pick-header con border-bottom: 2px solid var(--brand)
- Font sizes mínimos corregidos (.48rem → .58rem, .57rem → .65rem)
- Transición suave entre pantallas (scrFadeIn .18s)
- body.dark de moto.html sincronizado con paleta nueva
- CLAUDE.md creado con design system y principios de diseño documentados

### Principios establecidos
- Industrial/utilitario: claridad operativa sobre estética decorativa
- Verde exclusivo para "completado", ámbar para "en proceso/activo"
- IBM Plex Mono como tipografía principal — identidad técnica
- Base: dark theme café-oscuro (#161410), no negro genérico

---

## Módulo 7 — Validación de Inventario Físico

### Contexto
Fernando sube un reporte XLS de inventario (formato similar al GerencialTotal)
de una bodega o sucursal. La app presenta la lista y el equipo va marcando
ítem por ítem durante el conteo físico. El resultado se guarda para consulta posterior.

### Flujo
1. Desde `ops.html` → botón "📋 Validar Inventario" en topbar de s-home
2. Nueva pantalla `s-inventario`
3. Subir archivo XLS del reporte de inventario
4. Parser local (SheetJS) extrae productos con código, nombre, cantidad sistema
5. Se presenta lista con:
   - Código y nombre del producto
   - Cantidad según sistema
   - Input numérico para cantidad contada físicamente
   - Estado: pendiente / contado / discrepancia
6. Al finalizar → resumen de discrepancias (faltantes, sobrantes)
7. Resultado se guarda en Firestore: `inventarios/{id}`

### Esquema Firestore propuesto
```
inventarios/{id}
  fecha: string (YYYY-MM-DD)
  ubicacion: string (bodega/sucursal)
  creadoPor: string (uid)
  items: [{ code, name, qtySistema, qtyFisico, diff }]
  resumen: { total, contados, discrepancias, faltantes, sobrantes }
  createdAt: number
  status: 'en_proceso' | 'completado'
```

### Archivo de entrada
- Formato XLS similar a GerencialTotal
- A confirmar columnas exactas cuando se tenga un archivo de muestra

### Pendientes de definir
- ¿Desde qué página accede? ¿`ops.html` o `index.html`?
- Formato exacto del XLS de inventario (necesita archivo de muestra)
- ¿Quién puede hacer validaciones? ¿Solo super o también colaboradores?

---

## Módulo 8 — Base de Datos de Colaboradores

### Contexto
Directorio interno de todos los empleados de la empresa, independiente
de los usuarios del sistema. En el futuro podría relacionarse con `users/{uid}`
para los colaboradores que usen la app.

### Datos por colaborador
- Nombre completo
- Cargo
- Sucursal asignada
- Fecha de ingreso
- Contacto (teléfono / email)
- Evaluación del supervisor (texto libre, privado)
- Fotografía

### Esquema Firestore propuesto
```
colaboradores/{id}
  nombre: string
  cargo: string
  sucursal: string (ID de ubicación)
  fechaIngreso: string (YYYY-MM-DD)
  telefono: string
  email: string
  evaluacion: string (privado, solo visible para super)
  fotoUrl: string (Firebase Storage)
  uid: string | null (si está vinculado a users/{uid})
  activo: boolean
  createdAt: number
```

### Ubicación en la app
- Panel exclusivo para `super` en `ops.html`
- Nueva pantalla `s-colaboradores`

### Seguridad
- Solo `super` puede ver evaluaciones y datos de contacto completos
- Foto almacenada en Firebase Storage bajo `colaboradores/{id}/foto.jpg`
- Regla Firestore: lectura y escritura solo para `super`

### Relación futura con users/{uid}
- Campo `uid` en el documento del colaborador apunta a su cuenta Firebase Auth
- Permite cruzar historial de órdenes con perfil del colaborador

---

## Módulo 9 — Mapa de Sucursales

### Contexto
Visualización geográfica de todas las sucursales y bodegas de la empresa.

### Datos por ubicación
- Nombre y código (ya existe en `UBICACIONES[]`)
- Coordenadas (lat/lng)
- Dirección física
- Teléfono y encargado
- Horario de atención
- Foto (opcional)

### Esquema Firestore propuesto
```
ubicaciones/{id}
  codigo: string (M01, S02, B01, etc.)
  nombre: string
  tipo: 'sucursal' | 'bodega'
  lat: number
  lng: number
  direccion: string
  telefono: string
  encargado: string
  horario: string
  fotoUrl: string
  activo: boolean
```

### Implementación
- Mapa interactivo usando Leaflet.js (libre, sin costo) o Google Maps Embed
- Marcadores diferenciados por tipo (bodega vs sucursal)
- Al tocar un marcador → tarjeta con datos de la ubicación
- Accesible desde `ops.html` y posiblemente desde `index.html`

### Pendientes de definir
- ¿Leaflet (gratuito) o Google Maps?
- ¿Editable desde la app o datos fijos en código?

---

## Módulo 10 — Mapeo de Bodegas (Ubicación de Productos)

### Contexto
Plano visual interactivo de las bodegas con zonificación de estantes.
Permite saber exactamente dónde está almacenado cada producto.
La información se alimenta desde los reportes de inventario (Módulo 7).

### Funcionalidades
1. **Plano visual** de la bodega con pasillos, estantes y zonas numeradas
2. **Asignación de productos a zonas**: cada producto tiene una ubicación
   (ej. "Zona B / Estante 3 / Nivel 2")
3. **Buscador**: ingresar nombre o código → resalta la zona en el plano
4. **Integración con picking**: en `s-pick`, cada ítem muestra su ubicación
   (ej. "📍 B-3") para que el bodeguero sepa a dónde ir
5. **Alimentación desde inventario**: al procesar un reporte (Módulo 7),
   se puede actualizar/confirmar la ubicación de cada producto

### Esquema Firestore propuesto
```
zonas/{bodegaId}/estantes/{zonaId}
  codigo: string (ej. "B-3")
  descripcion: string (ej. "Pasillo B, Estante 3")
  productos: [{ code, name, qty }]
  updatedAt: number

productos_ubicacion/{productCode}
  code: string
  name: string
  bodega: string
  zona: string (ej. "B-3")
  updatedAt: number
```

### Integración con picking (`index.html`)
- En `buildItem()`, si el producto tiene ubicación registrada,
  mostrar badge "📍 B-3" junto al nombre
- Al abrir `s-pick`, el super puede ver el mapa de la bodega
  con los ítems de esa orden resaltados en sus zonas

### Pendientes de definir
- ¿El plano se dibuja con SVG personalizado o es un grid configurable?
- ¿Cuántas bodegas necesitan mapeo? (B01 y B02)
- ¿El plano es estático (dibujado una vez) o editable desde la app?

---

## Feature: Generador de Etiquetas de Caja
[Ya documentado arriba en el ROADMAP — ver sección correspondiente]
