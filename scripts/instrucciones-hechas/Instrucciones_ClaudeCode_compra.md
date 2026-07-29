# Claude Code — Reposición: correo en modo compra + Reporte de Compras por Producto

**Archivo único a tocar:** `reposicion.html`
**Sin cambios en** `functions/index.js` (se reutiliza `sendProjection` tal cual) **ni en** `firestore.rules`
(la regla `config/{doc}` ya da read:auth / write:super, cubre `config/compraExclusions`).

Cambios quirúrgicos por anclas. Aplicá los edits en orden. Validá al final con smoke test en navegador.

---

## Qué se hace

1. **Correo de proyección en modo compra.** Hoy `maybeSendProjection` solo corre en flujo stock.
   Se extrae el envío a un helper compartido `sendProjectionFor(sucId, items)` y se agrega la
   variante de compra (origen B01, datos de `repCompraData`). Dispara **solo en "XLS activo"** por
   destino (igual que stock; nunca en "Todos"/"Filtrado").
2. **Nuevo input "Reporte de Compras por Producto".** Parser propio `parseCompraReporteXLS`, con
   **autodetección de formato** (`detectCompraFormat`) — coexiste con la factura de compra actual en
   el mismo botón de subida.
3. **Exclusión de no-inventariables** (combustibles/servicios, proveedor Roceli) vía blocklist
   **configurable en UI** (`config/compraExclusions`: proveedores + códigos + palabras clave),
   sembrada por defecto con Roceli/combustibles/lubricantes.
4. **Productos que no están en el Gerencial** → se **incluyen** pero se marcan en **ámbar** (`◆ NUEVO`).

---

## EDIT 1 — Estado global (exclusiones)

**Insertar** justo después de la línea:

```js
let repCompraPostMode = false; // true = usar stock Gerencial (B01+B02) como pool
```

este bloque:

```js
// ── Exclusiones del "Reporte de Compras por Producto" (no inventariables) ──
// Editable desde el panel ⚙️ del modo compra. Persiste en config/compraExclusions
// (regla existente: read auth / write super). Match sin acentos ni caso.
const COMPRA_EXCL_DEFAULT = {
  proveedores: ['ROCELI'],
  codigos:     ['420111'],
  keywords:    ['COMBUSTIBLE', 'LUBRICANTE', 'SERVICIO', 'FLETE'],
};
let repCompraExclusions    = JSON.parse(JSON.stringify(COMPRA_EXCL_DEFAULT));
let repCompraExclLoaded    = false;
let repCompraExcludedLines = [];   // líneas ignoradas del último parse (feedback UI)
```

---

## EDIT 2 — Helpers, config y parser del reporte

**Insertar** inmediatamente **antes** de `function parseCompraXLS(workbook) {`
(en la sección `// ── MODO COMPRA ──`):

```js
// Normaliza para comparar sin acentos, espacios ni caso.
function compraNorm(s) {
  return String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}
function compraExclProvider(prov) {
  const n = compraNorm(prov);
  return repCompraExclusions.proveedores.some(x => x && n.includes(compraNorm(x)));
}
function compraExclCode(code) {
  const n = compraNorm(code);
  return repCompraExclusions.codigos.some(x => compraNorm(x) === n);
}
function compraExclName(name) {
  const n = compraNorm(name);
  return repCompraExclusions.keywords.some(x => x && n.includes(compraNorm(x)));
}

async function loadCompraExclusions() {
  if (repCompraExclLoaded || !db || !fbMod) return;
  try {
    const snap = await fbMod.getDoc(fbMod.doc(db, 'config', 'compraExclusions'));
    if (snap.exists()) {
      const d = snap.data() || {};
      repCompraExclusions = {
        proveedores: Array.isArray(d.proveedores) ? d.proveedores : COMPRA_EXCL_DEFAULT.proveedores.slice(),
        codigos:     Array.isArray(d.codigos)     ? d.codigos     : COMPRA_EXCL_DEFAULT.codigos.slice(),
        keywords:    Array.isArray(d.keywords)    ? d.keywords    : COMPRA_EXCL_DEFAULT.keywords.slice(),
      };
    }
    repCompraExclLoaded = true;
  } catch (e) { console.warn('loadCompraExclusions:', e); }
}
async function saveCompraExclusions() {
  await fbMod.setDoc(fbMod.doc(db, 'config', 'compraExclusions'), repCompraExclusions, { merge: true });
}

// Detecta formato del XLS de compra: 'reporte' (Reporte de Compras por Producto)
// vs 'factura' (documento individual → parseCompraXLS).
function detectCompraFormat(workbook) {
  for (const sn of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sn], { header: 1, defval: '' });
    for (const row of rows.slice(0, 30)) {
      const c = row.map(v => String(v == null ? '' : v).trim());
      if (c.some(x => /Reporte de Compras por Producto/i.test(x))) return 'reporte';
      if (c[4] === 'Proveedor' && c[5] === 'Cant.') return 'reporte';
      if (c[1] === 'Unidades'  && c[3] === 'Código') return 'factura';
    }
  }
  return 'factura';
}

// Parser del "Reporte de Compras por Producto".
// Cabecera de producto: col[1]="CÓDIGO - NOMBRE" (sin cantidad).
// Transacciones bajo ella: col[1]=fecha, col[4]=Proveedor, col[5]=Cant.
// Cantidad a distribuir = suma de transacciones NO excluidas.
// Exclusión: proveedor (por línea) · código/palabra clave (producto entero).
function parseCompraReporteXLS(workbook) {
  const products = new Map();
  const excluded = [];
  const isDate = s => /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s);
  workbook.SheetNames.forEach(sheetName => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
    let cur = null;
    for (const row of rows) {
      const c1     = String(row[1] == null ? '' : row[1]).trim();
      const prov   = String(row[4] == null ? '' : row[4]).trim();
      const qtyRaw = String(row[5] == null ? '' : row[5]).trim();
      // Cabecera de producto
      if (c1.includes(' - ') && !isDate(c1) && !qtyRaw) {
        const dash = c1.indexOf(' - ');
        const code = c1.slice(0, dash).trim();
        const name = c1.slice(dash + 3).trim();
        if (/^[A-Za-z0-9]{3,}$/.test(code)) {
          const ec = compraExclCode(code), en = compraExclName(name);
          cur = { code, name, excluded: ec || en, reason: ec ? 'código' : (en ? 'palabra clave' : '') };
        } else { cur = null; }
        continue;
      }
      // Transacción
      if (cur && isDate(c1) && prov) {
        const qty = Math.round(parseFloat(qtyRaw) || 0);
        if (qty <= 0) continue;
        if (cur.excluded)             { excluded.push({ code: cur.code, name: cur.name, qty, reason: cur.reason }); continue; }
        if (compraExclProvider(prov)) { excluded.push({ code: cur.code, name: cur.name, qty, reason: 'proveedor ' + prov }); continue; }
        if (products.has(cur.code)) products.get(cur.code).qty += qty;
        else products.set(cur.code, { code: cur.code, name: cur.name, qty });
      }
    }
  });
  return { products: Array.from(products.values()), excluded };
}
```

---

## EDIT 3 — `handleCompraFile`: enrutar por formato

**Reemplazar** este bloque (dentro de `window.handleCompraFile`):

```js
  try {
    // Merge map: código → { name, qty } — conservar productos ya cargados
    const mergeMap = {};
    repCompraProducts.forEach(p => { mergeMap[p.code] = { name: p.name, qty: p.qty }; });

    const newFileEntries = [];
    for (const file of files) {
      const buf      = await file.arrayBuffer();
      const wb       = XLSX.read(buf, { type: 'array' });
      const products = parseCompraXLS(wb);
      if (!products.length) {
        alert(`"${file.name}" no tiene productos reconocibles. Se omitió.`);
        continue;
      }
      products.forEach(p => {
        if (mergeMap[p.code]) {
          // Mismo código → sumar cantidad, conservar nombre existente
          mergeMap[p.code].qty += (p.qty || 0);
        } else {
          mergeMap[p.code] = { name: p.name, qty: p.qty || 0 };
        }
      });
      newFileEntries.push({ name: file.name, added: new Date().toISOString() });
    }
```

por:

```js
  try {
    await loadCompraExclusions();
    repCompraExcludedLines = [];
    // Merge map: código → { name, qty } — conservar productos ya cargados
    const mergeMap = {};
    repCompraProducts.forEach(p => { mergeMap[p.code] = { name: p.name, qty: p.qty }; });

    const newFileEntries = [];
    for (const file of files) {
      const buf = await file.arrayBuffer();
      const wb  = XLSX.read(buf, { type: 'array' });
      const fmt = detectCompraFormat(wb);            // 'reporte' | 'factura'
      let products;
      if (fmt === 'reporte') {
        const res = parseCompraReporteXLS(wb);
        products  = res.products;
        repCompraExcludedLines.push(...res.excluded);
      } else {
        products = parseCompraXLS(wb);
      }
      if (!products.length) {
        alert(`"${file.name}" no tiene productos reconocibles. Se omitió.`);
        continue;
      }
      products.forEach(p => {
        if (mergeMap[p.code]) {
          mergeMap[p.code].qty += (p.qty || 0);      // mismo código → sumar
        } else {
          mergeMap[p.code] = { name: p.name, qty: p.qty || 0 };
        }
      });
      newFileEntries.push({ name: file.name, added: new Date().toISOString(), fmt });
    }
```

---

## EDIT 4 — `renderCompraPanelFiles`: botón ⚙️, nota de excluidos y panel

**Reemplazar la función completa** `function renderCompraPanelFiles() { ... }` por:
(corrige además un `}` sobrante en el `style` del botón "stock Gerencial")

```js
function renderCompraPanelFiles() {
  const uploadEl   = $('rep-compra-upload');
  const filelistEl = $('rep-compra-filelist');
  if (!uploadEl || !filelistEl) return;
  if (repCompraFiles.length) {
    uploadEl.style.display   = 'none';
    filelistEl.style.display = '';
    const exclNote = repCompraExcludedLines.length
      ? `<div class="box-warn" style="font-size:.56rem;margin-top:5px;padding:5px 7px;border-radius:5px">
           ⊘ ${repCompraExcludedLines.length} línea(s) ignoradas (no inventariables):
           ${escHtml([...new Set(repCompraExcludedLines.map(x => x.name + ' · ' + x.reason))].slice(0, 4).join('  |  '))}${repCompraExcludedLines.length > 4 ? ' …' : ''}
         </div>` : '';
    filelistEl.innerHTML = repCompraFiles.map(f => `
      <div class="rep-file-item">
        <span class="rep-file-icon">✓</span>
        <span class="rep-file-name" title="${escHtml(f.name)}">${escHtml(f.name)}</span>
        <span class="rep-file-count">${repCompraProducts.length} productos</span>
      </div>`).join('') +
      `<button class="btn btn-outline" style="font-size:.58rem;margin-left:4px"
        onclick="document.getElementById('rep-compra-input').click()">+ Agregar más</button>
       <button id="btn-compra-post-mode" class="btn btn-outline" style="font-size:.58rem;${repCompraPostMode ? 'color:var(--done-tx);border-color:var(--done-bd);' : ''}"
        onclick="toggleCompraPostMode()">📦 ${repCompraPostMode ? 'Usando stock Gerencial' : 'Usar stock Gerencial'}</button>
       <button class="btn btn-outline" style="font-size:.58rem" title="Proveedores/códigos/palabras a ignorar"
        onclick="toggleCompraExclPanel()">⚙️ Exclusiones</button>
       <button class="btn btn-outline" style="font-size:.58rem;color:var(--err-tx);border-color:var(--err-tx)"
        onclick="clearCompraFiles()">⊘ Limpiar compras</button>` +
      exclNote +
      `<div id="rep-compra-excl-panel" style="display:none;margin-top:6px;padding:8px;border:1px solid var(--border2);border-radius:6px;background:var(--surface2)">
         <div style="font-size:.58rem;color:var(--muted);margin-bottom:5px">
           Ignorar en el Reporte de Compras (separá por coma o salto de línea). Aplica al próximo archivo y a lo cargado por código/palabra.</div>
         <label style="font-size:.56rem;color:var(--text2)">Proveedores</label>
         <textarea id="excl-prov" rows="1" style="width:100%;font-size:.6rem;font-family:var(--mono)">${escHtml(repCompraExclusions.proveedores.join(', '))}</textarea>
         <label style="font-size:.56rem;color:var(--text2)">Códigos</label>
         <textarea id="excl-cod" rows="1" style="width:100%;font-size:.6rem;font-family:var(--mono)">${escHtml(repCompraExclusions.codigos.join(', '))}</textarea>
         <label style="font-size:.56rem;color:var(--text2)">Palabras clave (nombre)</label>
         <textarea id="excl-kw" rows="1" style="width:100%;font-size:.6rem;font-family:var(--mono)">${escHtml(repCompraExclusions.keywords.join(', '))}</textarea>
         <button class="btn btn-outline" style="font-size:.58rem;margin-top:5px" onclick="saveCompraExclFromUI()">Guardar exclusiones</button>
       </div>`;
  } else {
    uploadEl.style.display   = '';
    filelistEl.style.display = 'none';
  }
}
```

---

## EDIT 5 — `renderCompraTable`: marcar en ámbar los que no están en el Gerencial

**5a.** En la construcción de filas, **insertar** después de:

```js
    const sm = repProductMap.get(p.code);
```

la línea:

```js
    const nuevo = !sm;   // no existe en el Gerencial → posible producto nuevo
```

**5b. Reemplazar** la línea:

```js
      <td class="td-name">${escHtml(p.name)}</td>
```

(la que está dentro del `return` de `renderCompraTable`) por:

```js
      <td class="td-name"${nuevo ? ' style="color:var(--warn-tx)" title="No está en el Gerencial — posible producto nuevo"' : ''}>${escHtml(p.name)}${nuevo ? ' <span style="font-size:.5rem;color:var(--warn-tx);font-weight:700">◆ NUEVO</span>' : ''}</td>
```

**5c. Reemplazar** el bloque del resumen:

```js
  $('rep-summary').innerHTML =
    `${repCompraProducts.length} productos en compra · disponible a distribuir: <strong>${totalAvail}</strong> · asignado: <strong>${totalSend}</strong>`;
```

por:

```js
  const nuevosCount = repCompraProducts.filter(p => !repProductMap.has(p.code)).length;
  $('rep-summary').innerHTML =
    `${repCompraProducts.length} productos en compra · disponible a distribuir: <strong>${totalAvail}</strong> · asignado: <strong>${totalSend}</strong>` +
    (nuevosCount ? ` · <span style="color:var(--warn-tx)">◆ ${nuevosCount} sin Gerencial</span>` : '');
```

---

## EDIT 6 — `clearCompraFiles`: limpiar líneas excluidas

En `window.clearCompraFiles`, **insertar** después de `repCompraPostMode = false;`:

```js
  repCompraExcludedLines = [];
```

---

## EDIT 7 — `enterCompraMode`: precargar exclusiones para el panel

En `window.enterCompraMode`, **reemplazar**:

```js
  renderCompraPanelFiles();
  if (repCompraProducts.length) renderRepFull();
```

por:

```js
  renderCompraPanelFiles();
  loadCompraExclusions().then(() => renderCompraPanelFiles());
  if (repCompraProducts.length) renderRepFull();
```

---

## EDIT 8 — Funciones del panel de exclusiones

**Insertar** después de la función `window.toggleCompraPostMode = () => { ... };`:

```js
window.toggleCompraExclPanel = () => {
  const p = document.getElementById('rep-compra-excl-panel');
  if (p) p.style.display = p.style.display === 'none' ? '' : 'none';
};
window.saveCompraExclFromUI = async () => {
  const parse = id => (document.getElementById(id).value || '')
    .split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
  repCompraExclusions = {
    proveedores: parse('excl-prov'),
    codigos:     parse('excl-cod'),
    keywords:    parse('excl-kw'),
  };
  try { await saveCompraExclusions(); }
  catch (e) { alert('No se pudo guardar: ' + e.message); return; }
  // Re-filtrar lo ya cargado por código/palabra (el proveedor no se guarda por producto).
  const before = repCompraProducts.length;
  repCompraProducts = repCompraProducts.filter(p => !compraExclCode(p.code) && !compraExclName(p.name));
  if (repCompraProducts.length !== before) { repCompraData = {}; repCompraTouched = {}; computeComprasSuggestions(); }
  renderCompraPanelFiles();
  renderRepFull();
  alert('✓ Exclusiones guardadas. Aplican al próximo archivo y a lo ya cargado por código/palabra.');
};
```

---

## EDIT 9 — Proyección: helper compartido + variante de compra

**Reemplazar la función completa** `maybeSendProjection` (desde el comentario
`// Confirm + envío de la proyección al encargado (solo se llama en flujo stock).`
hasta su `}` de cierre) por:

```js
// Envío de la proyección al encargado — helper compartido (stock y compra).
// items: [{ code, qty, name, familia }] ya armados por el modo que llama.
async function sendProjectionFor(sucId, items, opts = {}) {
  if (!items.length) return;
  const destNombre = REP_FACT_NAMES[sucId] || sucId;
  const confirmMsg = opts.confirmMsg ||
    `¿Enviar la proyección de envío al encargado de ${REP_LBLS[sucId] || sucId}?`;
  if (!confirm(confirmMsg)) return;

  let encargado;
  try { encargado = await findEncargado(sucId); }
  catch (e) { alert('No se pudo consultar el encargado: ' + e.message); return; }
  if (!encargado || !encargado.correos.length) {
    alert(`No hay encargado con correo para ${REP_LBLS[sucId] || sucId}.\nRevisá en Colaboradores: cargo "Encargado" + correo (personal o de trabajo).`);
    return;
  }

  let ordenNo;
  try { ordenNo = await nextProyeccionNo(sucId); }
  catch (e) { alert('No se pudo generar el número de proyección: ' + e.message); return; }

  const doc = buildProjectionDoc(sucId, ordenNo, items);
  if (!doc) { alert('No se pudo generar el PDF.'); return; }
  const pdfBase64 = doc.output('datauristring').split(',')[1];
  const fecha = fmtDateDMY();
  const filename = `Proyeccion_${destNombre}_${fecha.replace(/\//g, '-')}.pdf`;
  const primerNombre = encargado.nombre ? encargado.nombre.split(' ')[0] : '';
  const html =
    `<p>${saludoHora()}${primerNombre ? ' ' + primerNombre : ''},</p>` +
    `<p>Adjunto la proyección de envío para <b>${destNombre}</b>. Esta orden está en cola de ` +
    `preparación — revisala y decime qué más querés que te envíe.</p>` +
    `<p>Va pues ooo,<br>Operaciones — Zona Digital</p>`;

  let idToken = null;
  try { if (authMod && auth?.currentUser) idToken = await authMod.getIdToken(auth.currentUser); } catch (e) {}

  let ok = false, errMsg = '';
  try {
    const resp = await fetch('https://us-central1-despacho-ordenes.cloudfunctions.net/sendProjection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {}) },
      body: JSON.stringify({
        toEmail: encargado.correos,
        bcc: 'operaciones@zonadigitalsv.com',
        subject: `Proyección de envío — ${destNombre} — ${fecha}`,
        html, pdfBase64, filename,
      }),
    });
    const data = await resp.json().catch(() => ({}));
    ok = resp.ok && data.ok;
    if (!ok) errMsg = data.error || ('HTTP ' + resp.status);
  } catch (e) { errMsg = e.message; }

  if (!ok) { alert(`No se pudo enviar la proyección: ${errMsg}`); return; }

  try { await saveProyeccionRecord(sucId, destNombre, ordenNo, encargado, items); }
  catch (e) { console.warn('saveProyeccionRecord:', e); }

  alert(`✓ Proyección "Provisional ${ordenNo}" enviada a ${encargado.correos.join(', ')}.`);
}

// Flujo STOCK: arma items desde repSendData (assignOrigins) y envía.
async function maybeSendProjection(sucId) {
  return sendProjectionFor(sucId, buildProjectionItems(sucId));
}

// Items de proyección en MODO COMPRA (origen B01, datos en repCompraData).
function buildProjectionItemsCompra(sucId) {
  const send = repCompraData[sucId] || {};
  const items = Object.entries(send)
    .filter(([, qty]) => qty > 0)
    .map(([code, qty]) => {
      const p  = repProductMap.get(code);
      const cp = repCompraProducts.find(x => x.code === code);
      return { code, qty, name: p ? p.name : (cp ? cp.name : code),
               familia: (p && p.cat) ? p.cat : '' };
    });
  items.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return items;
}

// Flujo COMPRA: arma items desde repCompraData y envía.
async function maybeSendProjectionCompra(sucId) {
  return sendProjectionFor(sucId, buildProjectionItemsCompra(sucId),
    { confirmMsg: `¿Enviar la proyección de envío (compra) al encargado de ${REP_LBLS[sucId] || sucId}?` });
}
```

---

## EDIT 10 — `buildProjectionDoc`: aceptar items override

**Reemplazar**:

```js
function buildProjectionDoc(sucId, ordenNo = 1) {
  if (!window.jspdf || !window.jspdf.jsPDF) return null;
  const items = buildProjectionItems(sucId);
```

por:

```js
function buildProjectionDoc(sucId, ordenNo = 1, itemsOverride = null) {
  if (!window.jspdf || !window.jspdf.jsPDF) return null;
  const items = itemsOverride || buildProjectionItems(sucId);
```

---

## EDIT 11 — Disparar el correo en "XLS activo" de compra

En `window.generateActiveRepXLS`, **reemplazar**:

```js
window.generateActiveRepXLS = () => {
  if (repMode === 'compra') { generateCompraRepXLS(repActiveTab); return; }
```

por:

```js
window.generateActiveRepXLS = () => {
  if (repMode === 'compra') {
    generateCompraRepXLS(repActiveTab);
    setTimeout(() => maybeSendProjectionCompra(repActiveTab), 300);   // confirm + envío (compra)
    return;
  }
```

---

## Smoke test (navegador)

1. Entrar a Reposición como super → cargar el **Gerencial** normal.
2. **📦 Dist. Compra** → subir `ReporteCompras.xls`.
   - El bloque `420111 COMBUSTIBLES Y LUBRICANTES` (proveedor ROCELI) **no** debe aparecer;
     debe verse la nota "⊘ 1 línea(s) ignoradas … proveedor ROCELI…".
   - Los productos reales (adaptadores, Echo Dot, etc.) deben cargar con su cantidad sumada.
   - Los que no estén en el Gerencial se ven en **ámbar** con `◆ NUEVO`.
3. Botón **⚙️ Exclusiones** → agregar un proveedor/palabra, Guardar → confirmar que persiste
   (recargar y reabrir el panel) y que re-filtra por código/palabra.
4. En una pestaña de sucursal con cantidades asignadas → **XLS activo** → debe pedir confirmación
   "¿Enviar la proyección de envío (compra)…?" y, al aceptar, enviar el correo y registrar en
   Proyecciones enviadas. **Todos** y **Filtrado** no deben enviar.
5. Verificar que el flujo **stock** de correo sigue igual (no se rompió `maybeSendProjection`).

## Cierre

Al terminar, mover el ítem correspondiente de `ROADMAP.md` → `CHANGELOG.md`
(entrada nueva arriba: "Correo de proyección en modo compra + Reporte de Compras por Producto
con exclusiones configurables"). Documentar en el esquema Firestore la nueva
`config/compraExclusions` (`{ proveedores[], codigos[], keywords[] }`).
