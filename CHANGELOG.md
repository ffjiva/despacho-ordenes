# Despacho Ordenes — CHANGELOG

> Historial de trabajo **completado y desplegado**. Cada entrada corresponde a una
> sesión o módulo ya cerrado. El plan vivo (referencia durable, frente activo,
> pendientes e ideas) vive en `ROADMAP.md`.
>
> **Orden:** lo más reciente primero. Al cierre de cada sesión, lo que pasó de
> *pendiente* a *hecho* se mueve desde ROADMAP.md hacia aquí (no se documenta dos veces).
>
> **Repo:** https://github.com/ffjiva/despacho-ordenes

---

## Sesiones y módulos

### Sesión carga XLS, escáner y fixes de campo — 12 Jul 2026 *(index.html + moto.html + reposicion.html + firestore.rules)*

**Carga de picking list por Excel** *(index.html)*. Camino híbrido en "Nuevo Despacho": `.xls/.xlsx/.csv` se leen local con SheetJS (instantáneo, sin IA ni costo de API); `.pdf`/imagen mantienen la ruta de IA (`parseDocument`) como fallback. `parseOrderXLS` detecta el header dinámicamente, mapea Cantidad/Codigo/Producto/Familia y extrae metadata (origen/destino/fecha/No. orden), devolviendo la misma forma `{products, header}` que la IA (flujo de revisión/guardado intacto). Soporta códigos alfanuméricos. Une nombres partidos por salto de página (fila sin cantidad + mismo código → se anexa al producto previo; evita productos/unidades fantasma). Validado con orden real (68 prod / 263 unid). Etiqueta de la lista pasó de "Productos detectados por IA" a "Productos detectados". SheetJS cargado en index.html.

**Escáner de picking → lectura única** *(index.html)*. Se retiró el requisito de doble lectura (invisible en la 1ª lectura, se percibía como "no funciona"). Un escaneo válido marca al instante. Protección: formatos restringidos a EAN/UPC (dígito verificador) + el código debe existir en la orden + cooldown global.

**Fix fotos de preparación para colaboradores** *(firestore.rules)*. La regla `allow update` de `despachos` para colaborador no incluía `photos` en su `hasOnly`, así que `updateDoc({photos})` se rechazaba con permission-denied (solo el super subía fotos). Agregado `photos`. Storage ya permitía escritura autenticada.

**Notificaciones — activación visible** *(index.html + moto.html)*. El permiso se pedía en auto al login (poco confiable en móvil, sin gesto). Ahora chip "🔔 Activar avisos" en el home (gesto real), con guía para iPhone (agregar a inicio) y para permiso bloqueado; si ya está concedido, el token se registra en silencio. La cadena FCM (`onDespachoAssigned`, sw, tokens) ya funcionaba.

**Inventario — parseInvXLS robusto** *(reposicion.html)*. Discrimina producto/familia por presencia de descripción, no por código numérico → recupera SKU alfanuméricos (antes cargaba 3 de 7). Salta el bloque de encabezado de página repetido (título→bodega→header), filas de continuación de nombre sin código, subtotales y basura `null`. Validado (62 prod, familia limpia).

**Inventario — auto-extraer sucursal del XLS** *(reposicion.html)*. `extractBodegaXLS` lee la bodega de la cabecera y mapea a sucursal reusando `REP_SNAMES` (fuente única: ZONA DIGITAL MATRIX→M01, BODEGA MATRIX SF→B01, BODEGA CENTRAL→B02, BODEGA ORIENTE→B03…), preseleccionando el select (editable; el override manual gana). Preview muestra la bodega leída; si no se reconoce (ej. "Exhibicion Zoditech", dejada fuera a propósito), aviso ámbar y selección manual. Agregado **B03 Oriente** al dropdown y a SNAMES de crearConteoInv.

**Inventario — reasignar usuario de un conteo** *(reposicion.html)*. Botón "🔄 Reasignar" en el detalle → modal con usuarios activos (preselecciona el actual) → actualiza `asignadoA`/`asignadoANombre`. La CF `onInventarioAsignado` (observa `asignadoA`) notifica al nuevo asignado automáticamente. ⚠️ Por ahora es solo lado super: `reposicion.html` sigue con `ALLOWED = ['super']`, así que el colaborador todavía no tiene una vista propia para ver/completar el conteo que le notifican — queda pendiente (ver "Mejoras inventario — post-migración").

**Inventario — escáner en el conteo** *(reposicion.html)*. Botón "📷 Escanear" en el detalle: un código EAN/UPC salta al ítem (expande su familia, scroll, resalta y enfoca el input de conteo). Lectura única, no autocompleta cantidad. `html5-qrcode` cargado en reposicion.html; `data-code` por ítem.

### Carga de picking list por Excel — 09 Jul 2026 *(index.html)*
Camino híbrido en la pantalla "Nuevo Despacho": `.xls/.xlsx/.csv` se leen **local con
SheetJS** (instantáneo, sin IA ni costo de API); `.pdf`/imagen mantienen la ruta de IA
(`parseDocument`) como fallback para fotos/impresos.
- `parseOrderXLS(workbook)`: detecta la fila de cabecera dinámicamente (busca "Cantidad"
  + "Codigo"), mapea columnas Cantidad/Codigo/Producto/Familia, y extrae metadata
  (origen, destino, fecha, No. orden) escaneando etiquetas sobre el header. Devuelve la
  MISMA forma que la IA `{ products, header }`, por lo que el flujo de revisión/guardado
  quedó intacto.
- **Códigos alfanuméricos soportados** (CM01Z9RA, DGM20S, TEGC…) — no se restringe a
  numéricos (evita de raíz el bug de `parseInvXLS`).
- Salta filas en blanco, headers repetidos por página, fila de total y firmas al pie.
- Plantilla `OrdenEnvio` estable; solo varían origen/destino/fecha/No. orden.
- SheetJS (`xlsx.full.min.js` de cdnjs) ahora cargado también en index.html.

### Sesión de seguridad, fiabilidad y auditoría — 09 Jul 2026 *(functions/index.js + firestore.rules + index.html + ops.html + moto.html + reposicion.html)*

Auditoría en frío de los 6 archivos a pedido del owner sobre tres ejes: bugs, seguridad
(puertas traseras) y escalabilidad. Hallazgos verificados en producción (navegador) y corregidos.

**Seguridad — 2 puertas traseras cerradas** *(firestore.rules)*
- **`vueltas`/`domicilios` abiertos a internet:** las reglas tenían `allow read, write: if true`
  (legacy de cuando moto.html no usaba Auth). Cualquiera con el `projectId` (público en el cliente)
  podía leer, escribir o borrar toda la base de entregas + PII de clientes (nombre, teléfono,
  dirección, montos, forma de pago). Cambiado a `if isAuth()`. Verificado: lectura sin sesión →
  `permission-denied` en las 6 colecciones probadas.
- **Escalada de privilegios en `users`:** `allow update: if isSuper() || request.auth.uid == uid`
  sin restricción de campos permitía que cualquier usuario se auto-asignara
  `apps.despacho.role: 'super'` desde DevTools (la regla `isSuper()` lee justo ese campo, sin
  fallback). Restringido el self-update a `hasOnly(['fcmTokens','name'])`. Verificado en prod:
  Anderson (collaborator) → `permission-denied` al intentar escribir un campo fuera de la lista.

**Seguridad — guard de costo de API** *(functions/index.js)*
- `parseDocument` y `suggestReplenishment` solo exigían token válido → cualquier autenticado
  (incluso motorista) podía quemar créditos de la API de Claude. Agregado helper `isCallerSuper(uid)`
  + guard 403 en ambas (mismo patrón que `createUser`). Crear órdenes y reposición ya son super-only,
  así que no rompe flujos. `parseXLS` se deja abierto-a-autenticado (usa SheetJS local, sin costo Anthropic).

**Bug — notificación de orden asignada rota** *(functions/index.js)*
- `onDespachoAssigned` buscaba al usuario con `where('name','==',assignedTo)`, pero `assignedTo`
  guarda UID desde la Fundación de Identidad → `usersSnap.empty` siempre, el push "📦 Nueva orden
  asignada" nunca se enviaba. Cambiado a lookup directo por UID (`doc(users/${assignedAfter})`),
  consistente con `onVueltaAssigned`/`onInventarioAsignado`.

**Bug crítico — degradación de rol por overwrite de perfil** *(index.html — commit 97d29d2)*
- Incidente real durante la sesión: el doc `super` de Fernando se sobrescribió a `collaborator`
  (perdió `apps`, `colaboradorId`, y el `name` pasó a "ffjiva"). Causa: `loadUserProfile` tenía
  `try { getDoc } catch { return null }` que se tragaba errores de lectura; ante un token vencido
  en una pestaña stale devolvía `null` → `getOrCreateUserProfile` lo interpretaba como "usuario
  inexistente" y sobrescribía el doc con un perfil collaborator nuevo.
- Fix: `loadUserProfile` ya no atrapa errores (los propaga; `null` solo significa doc inexistente).
  `getOrCreateUserProfile` solo crea si el doc confirmadamente no existe. `setupAuthListener` envuelve
  la carga en try/catch: ante error de lectura mantiene la sesión y reintenta (flag `_profileRetry`
  con guard anti-loop), sin degradar. Patrón de overwrite confirmado presente SOLO en index.html;
  ops/moto/reposicion solo leen el perfil. Doc de Fernando restaurado manualmente vía consola Firebase.

**Bug — botón de login atascado en "Entrando…"** *(index.html + ops.html + moto.html + reposicion.html)*
- Tras un login exitoso, `doEmailLogin` dejaba el botón en "Entrando…"/"Ingresando…" disabled
  (nunca se reseteaba porque `onAuthStateChanged` navegaba). Al cerrar sesión, el botón seguía
  atascado. Fix: reset del botón dentro de `showScreen` cuando `id === 's-login'` (cubre logout,
  expiración y acceso denegado). Aplicado en los 4 archivos con su id (btn-login / btn-moto-login /
  btn-rep-login). Verificado desplegado en los 4.

**Escalabilidad — revisión, sin cambios necesarios**
- Conclusión: la base soporta el crecimiento. Listeners con desuscripción disciplinada (sin fugas),
  lecturas acotadas (despachos: `archived`+lazy; reposiciones: `limit(100)`; inventarios: `limit(30)`;
  vueltas/domicilios por fecha; users cacheados por sesión). El crecimiento de `reposiciones` en
  almacenamiento no afecta rendimiento (queries acotadas e indexadas). Único techo cosmético:
  trazabilidad muestra las últimas 100 (paginar si algún día se necesita histórico más viejo).
  XSS bien cubierto (`esc`/`escHtml` aplicados en los 4 archivos). `apiKey` en cliente = identificador
  público de Firebase, no secreto.

**Flag `_profileRetry` con timestamp — resuelto** *(index.html — commit ca47136)*
- Refinado a versión con timestamp (auto-expira a los 30s), evitando que un flag viejo de una
  sesión anterior salte el primer reintento. Aplicado y desplegado en la misma sesión.

### Sesión de rendimiento, fiabilidad y fixes — 07 Jul 2026 *(index.html + ops.html + moto.html + reposicion.html + firestore.rules + firestore.indexes.json)*

Pasada de diagnóstico en frío + verificación en producción (navegador) sobre incidencias
reportadas: lentitud del home, "no carga al volver", desmarcado de ítems (Anderson), despacho
del colaborador "no hace nada", y banner de solo lectura mostrando el UID. Nueve unidades
validadas una por una.

**Rendimiento del home (U1 + U2 + U2b)** *(index.html + firestore.indexes.json)*
- **U1 — `2da05a4`:** usuarios de los filtros de super cacheados (`_supUsersCache`); antes se hacía
  un `getDocs` a `users` en CADA snapshot del listener. `goHome()` libera el lock en segundo plano
  (fire-and-forget) en vez de `await` con timeout de 10s → arregla "salgo de una orden y el home no
  carga / hay que refrescar".
- **U2 — `17bb044`:** el listener del super pasó de traer TODA la colección (medido: 182 docs, 180
  archivadas) a solo activas (`where('archived','==',false)`). Archivo bajo demanda (`toggleArchivoLazy`,
  últimos 60). `saveDespacho` escribe `archived:false`. Backfill one-time de `archived:false` en docs
  sin el campo. Medido en prod: DOM 3.693 → 282 nodos, cards 182 → 3.
- **U2b:** mismo patrón para colaborador/motorista: listener `assignedTo==uid AND archived==false` +
  archivo lazy acotado a su uid. Anderson: 50 → 1 en vivo.

**Desmarcado de ítems en picking (Anderson) — `8200be3`** *(index.html)*
- Persistencia offline: `initializeFirestore` con `persistentLocalCache({ tabManager:
  persistentMultipleTabManager() })` + fallback a memoria. Verificado: activa en single-tab (celular),
  fallback benigno en multi-tab de escritorio.
- Escritura atómica de `checked` por campo (`checked.<id>` / `deleteField()`) vía nueva `writeCheck()`;
  reemplaza el overwrite del mapa completo en `toggleItem`/`saveNote`/`markItemFromScanner`. Cierra la
  carrera de "lost update" que desmarcaba ítems al reconectar en móvil.

**Despacho del colaborador — `ca95e6f` + firestore.rules** *(index.html + firestore.rules)*
- Causa raíz (verificada en prod): las reglas rechazaban `activeMs` (no estaba en el `hasOnly` del
  update del asignado) → `permission-denied` en todo el write, y `doDispatch` lo tragaba en silencio.
  Se agregó `activeMs` y `archived` al `hasOnly`.
- `confirmDispatch` role-aware: super despacha directo; el colaborador pasa por la validación
  completa-o-notas (si faltan comentarios, se lo dirige a la orden). `doDispatch` con try/catch + banner
  de error; lock/estado se limpian solo tras éxito.
- Bonus: arregla bug latente donde completar una orden como colaborador perdía el `activeMs`.

**Lock del super** *(index.html)*
- `openDespacho` reescrita: el super, al abrir una orden asignada a OTRO, entra en solo lectura SIN
  poner lock, para no bloquear al colaborador asignado (era la causa de "toco el despacho y no pasa
  nada, me quedo en el home"). Para trabajar una orden ajena, el super la reasigna primero.

**Fixes de UI**
- **Color select de reasignar — `966fa92`:** usaba `color:#18180f` hardcodeado (invisible en tema
  oscuro) → variables del tema. Agregada regla `#assign-sel option`.
- **Mostrar/ocultar contraseña:** toggle 👁/🙈 inline en los 4 logins (index/ops/moto/reposicion) +
  el campo de contraseña temporal al crear cuentas (ops.html).
- **Banner solo-lectura ya no expone UID:** mostraba `lockedBy`/`assignedTo` (UID) cuando faltaba el
  nombre. Banner inicial neutro ("MODO LECTURA") + fallbacks a "otro usuario"/"otro colaborador".

**Índices compuestos agregados** *(firestore.indexes.json)*
- `despachos`: `(archived ASC, createdAt DESC)` — listener del super + archivo lazy.
- `despachos`: `(assignedTo ASC, archived ASC, createdAt DESC)` — listener del colaborador + su archivo lazy.

**Reglas** *(firestore.rules)*: el `hasOnly` del `update` del asignado en `despachos` ahora incluye
`activeMs` y `archived` (habilita despacho/cierre del colaborador y el auto-archivado de sus órdenes).

### Módulo 9 — Directorio de Colaboradores *(ops.html, super-only)* — 28 Jun 2026
CRUD completo: crear, editar, activar/desactivar, eliminar. Foto vía Firebase Storage
(`colaboradores/{id}/foto_{timestamp}.jpg`). Migrado desde `Colaboradores.xlsx` (54
registros; 18 quedaron incompletos para completar desde la UI). `CORP` es código nuevo
de sucursal (no existía antes). Acceso: botón en topbar de s-home + drawer móvil.

Esquema `colaboradores/{id}`:
```
nombre, dui, telefono, correo, sucursal, cargo, alias, preferenciaNombre,
fechaIngreso, fechaSalida, cumpleanos, valoracion, codigoUsuario,
nombreUsuario, direccion, municipio, departamento, numDependientes,
dependientesDetalle, contactoEmergencia1, contactoEmergencia2,
fotoUrl, active, uid,    ← FK → users/{uid} (desde Fundación de Identidad)
createdAt, updatedAt
```

### Módulo 1 — Autenticación
Firebase Auth email/password en los 3 archivos. `users/{uid}` con name, email, role, active, createdAt. Persistencia automática. Logout limpio.

### Módulo 2 — Roles
Roles `super`, `collaborator`, `motorista`. UI diferenciada según rol. Panel "👥 Equipo" en index.html para gestionar equipo (ver-only; creación de cuentas movida a ficha de colaborador en ops.html — Fase 4 Fundación de Identidad). Firestore Rules aplicadas.

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

**Reposición — Validación pre-XLS (cinturón y tirantes) (21 Jun 2026):**
- **Gate único `repPreflightGate()`** antes de generar, cableado solo en `generateActiveRepXLS()`
  y `generateAllRepXLS()` (flujo `stock`). El interno `generateRepXLS(sucId)` queda intacto para no
  avisar por destino. Compra y redist retornan antes; no se tocan.
- **Pieza 1 — frescura:** global `repLoadedAt` sellado en `handleRepFiles` al cargar el Gerencial,
  persistido como `loadedAt` en `saveRepSession`/`loadRepSession` (restaura el sello original, no
  re-sella) y limpiado en `clearRepSession`. Si pasaron >90 min avisa que el stock pudo bajar por
  ventas. Sesión vieja sin `loadedAt` → no avisa. Ataca la causa real de los dos desfases vs facturación.
- **Pieza 2 — re-chequeo liviano `repPreflightCheck()`:** corre `repAllocate()` sobre los códigos con
  cantidad y reporta tres bordes: sobre-pedido (el pool no alcanza), destino no servido por el origen
  (típico al pasar a B03 sin limpiar) y productos huérfanos (código ausente del Gerencial por sesión
  restaurada).
- **Un solo `confirm()`** consolidando ambas piezas; si todo está limpio y fresco genera directo, sin
  clicks extra. Ventana = 90 min.
- **Decisión (21 Jun 2026):** los huérfanos quedan **confirmables**, no bloqueantes. Un huérfano no
  corrompe el XLS (solo significa que ese código no sale) y bloquear obligaría a recargar por algo a
  veces intencional.

**Reposición — Export XLS según filtro activo (21 Jun 2026):**
- **`generateFilteredRepXLS()`** (botón "⬇ Filtrado", junto a "XLS activo"/"Todos"): exporta solo los
  productos visibles bajo el filtro activo (`repRowMatches` → cat/marca/búsqueda combinados), para la
  pestaña/destino activo. Acción separada — no reemplaza "XLS activo" ni "Todos". Solo
  flujo `stock`. Caso de uso: cambio de prioridad puntual (enfocarse en una marca/categoría/búsqueda),
  despacharlo, y seguir la revisión normal.
- **`generateRepXLS(sucId, codeSet)`** parametrizado con `codeSet` opcional (retrocompatible: sin
  `codeSet` = export completo idéntico). El XLS filtrado lleva sufijo `_filtrado` en el nombre.
- **Trazabilidad:** registra en `reposiciones` solo lo exportado, con marca `{ parcial: true }` (los
  registros completos quedan sin el campo). `saveReposicionRecord` acepta un `extra` opcional. Suma al
  historial para la futura sugerencia por consumo.
- **Gate:** corre `repPreflightGate()` completo (no acotado al filtro) — la frescura es global de todas
  formas. Si a futuro molesta el aviso por productos ajenos al filtro, se acota al `codeSet`.
- Exporta TODOS los productos que matchean, no solo los 300 renderizados (el límite de display no aplica
  al export).
- **Decisión — solo pestaña activa:** primera versión recorría todos los destinos; corregido a
  `repActiveTab` para coherencia con "XLS activo". "Todos los destinos filtrados" diferido como acción
  separada explícita si se necesita.

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

### Envío prioritario en domicilios — 28 Jun 2026 *(ops.html + moto.html)*
Campo `prioritario: bool` en colección `domicilios`. Gestión desde ops.html: badge 🔴
en el header de la card + botón "🔴 Prioritario / ✓ Normal" en las acciones del card
expandido (junto a Editar / Eliminar). Función `togglePrioritarioDom(id, current)` escribe
en Firestore. En moto.html: card con clase `.mcard.emergency` (fondo rojo, borde pulsante)
+ barra "🔴 ENTREGA PRIORITARIA" + sube al tope de lista en ambos sorts (`emergency ||
prioritario`). Listener de domicilios notifica push "🔴 Entrega prioritaria — [cliente]"
cuando llega una nueva entrega con `prioritario: true`.

### Fix tiempo de trabajo en picking — 28 Jun 2026 *(index.html)*
Cuatro bugs corregidos en el contador `activeMs`:

- **`localActiveMs`** — espejo local autoritativo del tiempo acumulado. Reemplaza el uso de
  `curData?.activeMs` (susceptible a race condition si el listener Firestore no había llegado
  al hacer goHome justo después de una pausa). Se inicializa en el primer snapshot.
- **`visibilitychange`** — al ocultar la pestaña (cambio de app en móvil, minimizar navegador)
  acumula el tiempo transcurrido y pausa el contador (`lockSessionStart = 0`). Al volver,
  reinicia el contador y actualiza `lockedAt` en Firestore para que el home del supervisor
  muestre el timer desde el punto correcto, no desde el inicio de la sesión original.
- **Completar orden** (`toggleItem` + `markItemFromScanner`) — al marcar el último ítem
  guarda `activeMs` final y limpia `lockedBy / lockedAt` en el mismo write. El chip del
  home queda congelado; antes seguía incrementando después de finalizar.
- **Despachar** (`doDispatch`) — mismo patrón: guarda tiempo final y limpia lock junto al
  cambio de status. Antes no tocaba `activeMs` ni el lock.

### Fundación de Identidad ✅ Completada — sesión 28 Jun a 06 Jul 2026 *(todos los archivos)*

Plan de 5 fases para unificar identidad persona↔credencial y preparar el módulo Ensamblador.
Directorio de colaboradores = registro maestro de personas; las cuentas de acceso se ligan
a él (`colaboradorId` / `uid`) y los permisos se manejan por app (`apps.*`). Ver tabla de
grants por cargo y esquema de datos completo en "Sistema de usuarios" más arriba.

**Fase 1 — Cargos controlados** *(ops.html)*
`<select>` en modal de colaborador con 8 valores canónicos (Administrativo, Bodeguero,
Cajera, Encargado, Motorista, Redes, Técnico, Vendedor). Migración de los 54 docs de
`colaboradores`: 17 valores libres → 8 controlados (24 docs actualizados via script admin).
`cargo` = puesto (RRHH); **no** es el permiso de acceso — eso lo decide el grant `apps.*`.

**Fase 2 — Auth gates a `apps.despacho.role`** *(todos los archivos)*
Todos los archivos leen `apps?.despacho?.role ?? role` en el gate de acceso y en
`currentUser`. Retrocompatible con docs legacy que solo tienen `role` plano.
`isSuper()` en `functions/index.js` actualizado al mismo patrón.

**Fase 3 — `createUser` con `colaboradorId`** *(functions/index.js)*
CF acepta `colaboradorId` opcional; hace batch atómico: crea `users/{uid}` con
`{ estado: 'aprobado', apps: { despacho: { role } }, colaboradorId }` +
actualiza `colaboradores/{id}.uid`. Reconciliación manual de 4 usuarios preexistentes
(match por email + confirmación). 1 usuario de prueba eliminado.

**Fase 4 — Gestión de cuentas desde ficha de colaborador** *(ops.html + index.html + firestore.rules)*
- `ops.html`: sección "Cuenta de acceso" en el modal de colaborador. Tres estados:
  sin cuenta (formulario de creación), con cuenta (permisos + reset). Toggle ensamblador
  con `accent-color: var(--ensamblador-bd)` (cyan). CF `createUser` llamado desde aquí.
  Función `guardarPermisosColab` escribe `role`, `apps.despacho.role` y
  `apps.ensamblador` (o `deleteField()` si se desactiva).
- `index.html`: panel "👥 Equipo" ya no incluye formulario de creación de usuarios.
  Mensaje vacío actualizado: "Crea cuentas desde la ficha del colaborador en Ops."
- `firestore.rules`: `isSuper()` actualizado a `apps.despacho.role == 'super'`.
  Regla `inventarios` consolidada para usar el helper (eliminado el `data.role` inline).
- **CI:** `deploy.yml` fija Node 20 (`setup-node@v4`) antes del deploy de Firebase Hosting
  — arregla el fallo por Node 24 (`npx` exit code 1).

**Indicadores visuales en tarjetas de colaborador** *(ops.html)*
- Borde derecho ámbar (3px): colaborador con cuenta de despacho (`colab-has-despacho`)
- Borde derecho cyan (6px): colaborador con cuenta + ensamblador ON (`colab-has-ensamblador`)
- Doble borde si tiene ambos (`inset -3px` ámbar + `inset -6px` cyan)
- Implementación: `refreshUserAppsMap()` fetcha `users` collection y construye
  mapa `uid → { ensamblador: bool }`, llamado en cada snapshot de colaboradores
  y tras guardar permisos. Fix para `colab-has-ensamblador` (datos de ensamblador
  viven en `users/{uid}`, no en `colaboradores/{id}`).

**Token CSS:** `--ensamblador-bd: #22cac8` agregado al `:root`.

**Próxima etapa — Conectar el Ensamblador** *(pendiente)*
Con la identidad lista, la conexión se reduce a: (1) apuntar el `firebaseConfig`
del Ensamblador al proyecto de Despacho; (2) re-sembrar `catalogo`/`parametros`/
`armados`; (3) fusionar sus reglas de Firestore; (4) leer `apps.ensamblador.role`
en su `AuthScreen`/`AdminPanel`. Los permisos ya se pueden pre-cargar desde ahora.

---

### Módulo 9 — Colaboradores · actualización — sesión 28 Jun 2026 *(ops.html)*

**Esquema ampliado** `colaboradores/{id}`:
- `estadoTipo`: `'vacaciones'` | `'incapacidad'` | `'permiso'` | `null` (null = activo)
- `estadoDesde`, `estadoHasta`: timestamps (ms) — rango de vigencia del estado
- `diaDescanso`: `'lunes'..'domingo'` | `null`

**Fixes de UI:**
- Orden por defecto alfabético, incompletos (sin nombre/dui/teléfono) al final — ordenado en cliente, ya no usa `orderBy` de Firestore.
- Búsqueda incluye `codigoUsuario`.
- Labels "(legacy)" → "(Wifin)" en Código/Nombre usuario.
- Reordenado: Alias ZD ↔ Teléfono; Código/Nombre usuario (Wifin) ahora antes de Fecha ingreso/salida.
- Contador de colaboradores por filtro de sucursal, en la misma línea que los chips.
- Badge de estado (🏖/🤒/📋) en la lista, visible solo si hoy cae dentro de `estadoDesde`/`estadoHasta`.

**Idea a futuro:** Brief matutino — mostrar quién tiene estado vigente hoy o cuyo día de descanso es hoy, reusando `colabEstadoActivo(c)`.

### Fix extracción de órdenes grandes — sesión 25 Jun 2026 *(functions/index.js)*
Órdenes con muchos productos (caso real: 109 SKUs, orden 25 → S03 San Miguel)
fallaban con "No se pudo extraer productos" + HTTP 500. Causa: `parseDocument`
usaba `max_tokens: 8000` (el límite viejo de Haiku 3.5); la salida JSON se truncaba
a mitad del array de productos → el header llegaba bien pero `products` no. Haiku 4.5
admite hasta 64K tokens de salida.
- **`max_tokens` 8000 → 16000:** ~2× de holgura para esta orden; cubre cómodo hasta
  ~300 productos, lejos del techo de 64K y sin riesgo de timeout (CF a 300s).
- **Guard de truncamiento:** se agregó `if (parsed.stop_reason === 'max_tokens')` con
  mensaje claro ("lista demasiado larga") en vez de un 500 opaco — mismo patrón que
  `suggestReplenishment`. Red de seguridad para órdenes aún más grandes.
- Deploy: `firebase deploy --only functions`. Validado: la orden 25 (109 prod / 376
  unid) extrae completa.
- A futuro (no accionado): para listas >300 productos, trocear el PDF y extraer por
  lotes, igual que `suggestReplenishment` (lotes de 60).

### Pasada de picking — sesión 24 Jun 2026 *(index.html + ops.html)*
Siete incidencias del backlog triado (🟢 DIARIO + ⚪ MENOR), una por unidad validada.

**🟢 DIARIO:**
- **B4 — Fotos de preparación tras despachar:** el gate de `renderPickPhotos` solo
  aceptaba `active`/`done`, así que al pasar a `dispatched`/`dispatched_incomplete`
  desaparecía el alta de fotos. Ahora diferencia por rol: `super` puede subir también
  en despachada (ambos estados `dispatched*`); el resto solo en proceso/completada.
  Las fotos existentes se ven siempre.
- **B1 + B3 — Gracia visual + flash al escanear:** `Map` global `pickGrace` dentro de
  `renderPick` (respetado por sus dos vías: `applyUpdate` y el listener). Al chequear
  bajo el filtro Pendientes, el ítem queda 3s con fade (`ic-leaving`) antes de salir.
  Al escanear en modo único, tras cerrar el escáner hace `scrollIntoView` + flash verde
  (`ic-flash`); la gracia lo mantiene vivo para tener a dónde scrollear. Sin flash si
  saltó la celebración de orden completa.
- **B3-hermano — Gracia en Pendientes de ops:** mismo patrón inline en `ops.html`
  (`pendGrace`, `pc-leaving`), 3s al completar antes de removerse de la vista activa.
- **B2 — Buscador + escáner sticky:** la fila se movió dentro del `.pick-header` (ya
  sticky) → viaja fija al hacer scroll. Los chips Todos/Pendientes/Listos/A–Z quedan
  en la `.filter-bar` no-sticky. Cero JS.

**⚪ MENOR:**
- **B5 — Botón escáner perdía su texto:** era colateral del reflow de la `.filter-bar`
  al hacer `flex-wrap` en móvil. Cayó de rebote con B2 (fila con ancho estable en el
  header). Sin cambio adicional.
- **B6 — Productos con nota más visibles:** badge `📝 nota` en los tags + texto de la
  nota en ámbar (`.ic.has-nota .note-in`), además del borde izquierdo existente.
- **B7 — Tiempo de trabajo en cards del home:** chip ⏱ en `dcard-meta` que mide
  tiempo de trabajo ACUMULADO (`activeMs`), no wall-clock. Solo corre mientras la
  orden está abierta (lock activo): `goHome` suma `ahora − lockedAt` a `activeMs` al
  cerrar. Abierta ahora → tictac en vivo (verde, `dcard-time-live`, `base+since`);
  nadie la tiene abierta → pausado en el acumulado (gris). Sin trabajo acumulado y
  cerrada → sin chip. Trade-off: cierre sucio pierde hasta 30 min (TTL del lock).
  Helper `fmtClock`, `setInterval` idempotente. Visible solo para `super`; los
  demás roles ven el tiempo total únicamente en el modal de celebración al finalizar.

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

---

## Reposición — hitos de migración y cierre

### ✅ Modularización reposición → reposicion.html (COMPLETA)
4ª app standalone (modelo `moto.html`) que reúne Reposición + Inventario + Trazabilidad. Init Firebase propio (resuelve el estado compartido). Acceso **solo vía ops**, gate **super-only** con costura ramificable por rol (para el futuro inventario asignable a colaborador). Home con 3 botones; back `← Ops`.
- **F0** ✅ Andamiaje (login + gate + home + mini-router + CSS base). Deploy + smoke OK.
- **F1** ✅ Reposición (stock/compra/redist) migrada vía `migrate_f1.js` (extracción por anclas de texto, `node --check` OK, sin duplicados, idempotente). Smoke 1–4 OK. `ops.html` **intacto** (limpieza diferida a F4).
- **F2** ✅ Trazabilidad migrada (`migrate_f2.js`).
- **F3** ✅ Inventario migrado (`migrate_f3.js`).
- **F4** ✅ Limpieza de ops.html + botón único de acceso (`migrate_f4.js`). ops 7487→3944 líneas. Botones de Inventario eliminados; entrada del colaborador planeada para index.html.
- **Entrada del colaborador (index.html):** cuando se active la asignación de inventarios, el botón vive en `index.html` (donde el colaborador ya entra), con deep-link directo a SU inventario asignado en reposicion.html (ej. `reposicion.html#inv=<id>`), saltándose el home. El super sigue entrando por el botón Reposición de ops. Requiere: ruteo por hash en `reposicion.html` + gate role-aware (la costura de F0).

### ✅ Issues IA reposición — cerrados (revisión 28 Jun 2026)
1. ✅ **Restricción de origen resuelta.** CF recibe `origin` + `servedDests`; construye pool
   por bodega origen y lo expone como `orig:N` en el prompt con regla dura ("nunca superar orig").
   Cliente manda `{ origin: repOrigin, servedDests: served }` en cada lote.
2. ✅ **JSON truncado resuelto.** Guard `stop_reason === 'max_tokens'` en CF devuelve error claro.
   Cliente corre en lotes de 60 con guard en 300 productos. `max_tokens: 8192` suficiente para
   lotes de 60 (se deja como está; subir solo si aparece truncamiento en producción).
3. *(Por diseño)* `analyzeWithAI` aplica sugerencias a todos los destinos servidos, no solo
   la pestaña activa. Comportamiento intencional — documentado.

### ✅ Acciones de limpieza — post F4 (23 Jun 2026)
- `ops.html.bak` (backup generado por `migrate_f4.js`) removido del tracking con `git rm --cached` y `*.bak` agregado a `.gitignore`. El archivo permanece en disco como seguridad local pero no se versiona.

---

## Deuda técnica resuelta

**[RESUELTO 21 Jun 2026] — Cerrar grifo `config/team`** *(index.html)*
El write real NO estaba en ops.html (solo un comentario) sino en index.html: cadena muerta pre-Auth
`showNameModal()` → `_saveName()` → `saveUsersRemote()` → `setDoc(config/team)`, con cero callers de
`showNameModal`. Eliminada toda la cadena (Opción B) + repuntado el ping de conectividad de
`ensureFirestoreConnection()` de `config/team` a `config/ubicaciones`. Verificado: cero `setDoc`/`getDoc`
a `config/team`; solo quedan comentarios documentales. `loadUsers()` (lee de `users/{uid}`) intacto.

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

