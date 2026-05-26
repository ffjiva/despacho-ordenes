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

## Estado actual (v1 — producción)

### Pantallas implementadas
- **`s-setup`** — Configuración inicial de Firebase (se omite si ya hay config guardada)
- **`s-home`** — Lista de órdenes con progreso en tiempo real
- **`s-new`** — Crear orden: subir PDF/imagen → extracción con IA → revisión → guardar
- **`s-pick`** — Pantalla de picking: marcar ítems, notas, filtros, progreso

### Funcionalidades activas
- Extracción automática de productos desde PDF/imagen usando Claude API
- Sincronización en tiempo real con Firestore
- Sistema de bloqueo de orden (lock) cuando alguien la está trabajando
- Gestión de equipo: agregar/eliminar usuarios (`config/team` en Firestore)
- Asignación de órdenes a usuarios
- Modo offline/local (sin Firebase)
- Filtros en picking: Todos / Pendientes / Listos
- Ordenamiento: Alfabético / Por categoría
- Impresión a PDF del picking list (`window.print()`)

### Esquema Firestore actual
```
despachos/{id}
  name: string
  orderNumber: string
  orderDate: string
  origin: string
  destination: string
  assignedTo: string
  createdBy: string
  products: [ { id, name, code, qty, family } ]
  checked: { [productId]: { done, time, note } }
  lockedBy: string | null
  lockedAt: number | null
  createdAt: number

config/team
  members: string[]
```

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

*Última actualización: Mayo 2026*
