const admin = require("firebase-admin");
const https = require("https");
const XLSX = require("xlsx");

if (!admin.apps.length) admin.initializeApp();

// ── Auth helper ──────────────────────────────────────────
async function verifyFirebaseToken(req, res) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'No autorizado. Token requerido.' });
    return null;
  }
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    return decoded;
  } catch(e) {
    res.status(401).json({ error: 'Token inválido o expirado.' });
    return null;
  }
}

// ── Verifica que el usuario autenticado sea super ──────────
async function isCallerSuper(uid) {
  const snap = await admin.firestore().doc(`users/${uid}`).get();
  const d = snap.exists ? snap.data() : null;
  return !!d && (d.apps?.despacho?.role ?? d.role) === 'super';
}

// ── CORS + preflight helper ──────────────────────────────
// Aplica cabeceras CORS y resuelve preflight/método inválido.
// Devuelve true si la petición ya fue respondida (el handler debe cortar):
//   if (handleCors(req, res)) return;
function handleCors(req, res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return true; }
  if (req.method !== 'POST')   { res.status(405).json({ error: 'Method Not Allowed' }); return true; }
  return false;
}

// ── Cliente Claude API (https nativo, sin SDK) ───────────
// Recibe { messages, max_tokens }, agrega el modelo, hace la request,
// valida errores/truncado y devuelve el texto ya limpio de markdown.
const CLAUDE_MODEL = 'claude-haiku-4-5';

function callClaude({ messages, max_tokens }) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.ANTHROPIC_KEY;
    if (!apiKey) { reject(new Error('API key not configured')); return; }

    const body = JSON.stringify({ model: CLAUDE_MODEL, max_tokens, messages });
    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const apiReq = https.request(options, apiRes => {
      let data = '';
      apiRes.on('data', chunk => data += chunk);
      apiRes.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) throw new Error(parsed.error.message);
          if (parsed.stop_reason === 'max_tokens') {
            throw new Error('Respuesta truncada: el modelo alcanzó max_tokens (reducí el lote o subí max_tokens).');
          }
          const text = parsed.content.filter(b => b.type === 'text').map(b => b.text).join('').trim()
            .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
          resolve(text);
        } catch(e) { reject(e); }
      });
    });
    apiReq.on('error', reject);
    apiReq.write(body);
    apiReq.end();
  });
}

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onRequest }         = require('firebase-functions/v2/https');
const { onSchedule }        = require('firebase-functions/v2/scheduler');

// ── Push a un usuario (multi-dispositivo + limpieza de tokens) ──────
// Envía a TODOS los dispositivos del usuario (sendEach), deduplica el array
// de tokens y limpia los inválidos. Devuelve true si logró enviar.
async function pushToUser(uid, { title, body, link }) {
  const userSnap = await admin.firestore().doc(`users/${uid}`).get();
  if (!userSnap.exists) {
    console.log(`Usuario no encontrado en users/: ${uid}`);
    return false;
  }
  const userData = userSnap.data();
  // fcmTokens puede ser un MAPA { deviceId: token } (esquema nuevo, un token por
  // dispositivo) o un arreglo legacy. Normalizamos a lista y deduplicamos. El mapa
  // por dispositivo evita que los tokens rotados se acumulen y dupliquen el push.
  const rawTokens = userData.fcmTokens || (userData.fcmToken ? [userData.fcmToken] : []);
  const tokenList = Array.isArray(rawTokens) ? rawTokens : Object.values(rawTokens || {});
  const tokens = [...new Set(tokenList.filter(Boolean))];
  if (!tokens.length) {
    console.log(`Sin tokens FCM para ${userData.name || uid}`);
    return false;
  }

  const messages = tokens.map(token => ({
    token,
    notification: { title, body },
    android: { priority: 'high' },
    webpush: {
      notification: { icon: 'https://despacho-ordenes.web.app/favicon.png' },
      fcmOptions:   { link }
    }
  }));

  const response = await admin.messaging().sendEach(messages);
  console.log(`Notificaciones: ${response.successCount}/${messages.length} a ${uid}`);

  const invalidTokens = response.responses
    .map((r, i) => (!r.success && r.error?.code === 'messaging/registration-token-not-registered') ? tokens[i] : null)
    .filter(Boolean);
  if (invalidTokens.length) {
    const bad = new Set(invalidTokens);
    let cleaned;
    if (Array.isArray(rawTokens)) {
      cleaned = tokens.filter(t => !bad.has(t));
    } else {
      cleaned = {};
      for (const [dev, tok] of Object.entries(rawTokens || {})) {
        if (!bad.has(tok)) cleaned[dev] = tok;
      }
    }
    await admin.firestore().doc(`users/${uid}`).update({ fcmTokens: cleaned });
    console.log(`Tokens inválidos removidos: ${invalidTokens.length}`);
  }
  return true;
}

// ── Helper unificado de notificación por asignación ──────────
// Detecta el cambio de asignación y delega el envío en pushToUser.
//   field:         campo del doc con el uid asignado (ej. 'assignedTo')
//   notifiedField: campo espejo anti-doble-envío (ej. 'lastNotifiedAssignedTo')
//   buildMessage:  (after) => ({ title, body, link })
async function notifyOnAssignment(event, { field, notifiedField, buildMessage }) {
  const before = event.data.before.exists ? event.data.before.data() : null;
  const after  = event.data.after.exists  ? event.data.after.data()  : null;
  if (!after) return null;

  const assignedBefore = before?.[field] || '';
  const assignedAfter  = after[field]    || '';
  if (!assignedAfter || assignedAfter === assignedBefore) return null;
  if (after[notifiedField] === assignedAfter) return null;

  try {
    const sent = await pushToUser(assignedAfter, buildMessage(after, event.data.after.ref.id));
    if (sent) await event.data.after.ref.update({ [notifiedField]: assignedAfter });
  } catch(e) {
    console.error('Error enviando notificación:', e.message);
  }
  return null;
}

exports.onDespachoAssigned = onDocumentWritten('despachos/{despachoId}', (event) =>
  notifyOnAssignment(event, {
    field: 'assignedTo',
    notifiedField: 'lastNotifiedAssignedTo',
    buildMessage: (after) => {
      const orderLabel = after.orderNumber ? `Orden ${after.orderNumber}` : (after.name || 'Nueva orden');
      const dest = after.destination || '';
      return {
        title: '📦 Nueva orden asignada',
        body:  `${orderLabel}${dest ? ' → ' + dest : ''}`,
        link:  'https://despacho-ordenes.web.app'
      };
    }
  })
);

exports.onVueltaAssigned = onDocumentWritten('vueltas/{vueltaId}', (event) =>
  notifyOnAssignment(event, {
    field: 'assignedTo',
    notifiedField: 'lastNotifiedAssignedTo',
    buildMessage: (after) => {
      const dest  = after.destination || '';
      const fecha = after.date || '';
      return {
        title: '🚐 Nueva vuelta asignada',
        body:  `${dest ? dest : 'Revisa tus vueltas'}${fecha ? ' — ' + fecha : ''}`,
        link:  'https://despacho-ordenes.web.app/moto.html'
      };
    }
  })
);

// Push cuando una vuelta pasa de normal → emergencia (transición false→true),
// dirigido al motorista asignado. Independiente del trigger de asignación.
exports.onVueltaEmergencia = onDocumentWritten('vueltas/{vueltaId}', async (event) => {
  const before = event.data.before.exists ? event.data.before.data() : null;
  const after  = event.data.after.exists  ? event.data.after.data()  : null;
  if (!after) return null;

  // Solo al ENCENDER la emergencia (no en cada re-escritura ni al apagarla)
  if (before?.emergency || !after.emergency) return null;

  const uid = after.assignedTo || '';
  if (!uid) return null; // sin motorista asignado, no hay a quién avisar

  const dest  = after.destination || '';
  const fecha = after.date || '';
  try {
    await pushToUser(uid, {
      title: '🚨 Vuelta marcada como EMERGENCIA',
      body:  `${dest ? dest : 'Revisa tus vueltas'}${fecha ? ' — ' + fecha : ''}`,
      link:  'https://despacho-ordenes.web.app/moto.html'
    });
  } catch(e) {
    console.error('Error enviando notificación emergencia:', e.message);
  }
  return null;
});

exports.onInventarioAsignado = onDocumentWritten('inventarios/{invId}', (event) =>
  notifyOnAssignment(event, {
    field: 'asignadoA',
    notifiedField: 'lastNotifiedAsignadoA',
    buildMessage: (after, invId) => {
      const suc    = after.sucursalNombre || after.sucursal || '';
      const titulo = after.titulo || 'Conteo';
      return {
        title: '📋 Conteo de inventario asignado',
        body:  `${suc} — ${titulo}`,
        link:  'https://despacho-ordenes.web.app/reposicion.html#inv=' + invId
      };
    }
  })
);

exports.parseDocument = onRequest(
  { timeoutSeconds: 300, memory: '1GiB' },
  async (req, res) => {
  console.log("Request received:", req.method);
  if (handleCors(req, res)) return;

  const user = await verifyFirebaseToken(req, res);
  if (!user) return;
  if (!(await isCallerSuper(user.uid))) {
    res.status(403).json({ error: 'Solo el supervisor puede usar esta función.' });
    return;
  }

  const { base64Data, mediaType } = req.body;
  if (!base64Data || !mediaType) { res.status(400).json({ error: "Missing base64Data or mediaType" }); return; }

  const isPDF = mediaType === "application/pdf";
  const contentBlock = isPDF
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64Data } }
    : { type: "image", source: { type: "base64", media_type: mediaType, data: base64Data } };

  const prompt = `Analiza este documento de orden de envío. Responde SOLO con JSON válido, sin backticks ni texto adicional.

Formato exacto requerido:
{"header":{"orderNumber":"numero","orderDate":"DD/MM/YYYY","origin":"sucursal origen","destination":"sucursal destino"},"products":[{"qty":1,"code":"codigo","name":"NOMBRE EN MAYUSCULAS","family":"categoria"}]}

Reglas:
- orderNumber: solo el número (ejemplo: "18")
- orderDate: fecha en formato DD/MM/YYYY
- origin: nombre de Sucursal Origen
- destination: nombre de Sucursal Destino
- Si un campo no existe usa null
- Extrae TODOS los productos sin omitir ninguno
- qty debe ser número entero

IMPORTANTE — Filas cortadas entre páginas:
Este PDF puede contener filas de productos que se cortan al final de una página y continúan en la siguiente. Cuando esto ocurre, el sistema de facturación repite el mismo código (UPC/código de barras) en ambas partes de la fila. Si encuentras dos entradas con el mismo código de producto, NO las trates como productos separados — son la misma fila partida. Fusiónalas en un único producto usando:
- El nombre más completo y descriptivo de las dos entradas
- La cantidad de la entrada que la tenga (la otra puede tener 0 o estar vacía)
- El código compartido
Nunca incluyas duplicados de un mismo código en el resultado final.`;

  try {
    const text = await callClaude({
      max_tokens: 16000,
      messages: [{ role: "user", content: [contentBlock, { type: "text", text: prompt }] }]
    });
    console.log("Model response preview:", text.substring(0, 300));

    const normalizeQty = p => ({
      ...p,
      qty: Math.round(parseFloat(String(p.qty)) || 0)
    });

    // Intentar como objeto {header, products}
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        const result = JSON.parse(objMatch[0]);
        if (result.products && Array.isArray(result.products)) {
          res.json({ header: result.header || null, products: result.products.map(normalizeQty) });
          return;
        }
      } catch(e) {}
    }

    // Intentar como array directo [...]
    const arrMatch = text.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      const products = JSON.parse(arrMatch[0]).map(normalizeQty);
      res.json({ header: null, products });
      return;
    }

    throw new Error("No se pudo extraer productos. Respuesta: " + text.substring(0, 150));
  } catch (e) {
    console.error("Parse error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

exports.parseXLS = onRequest({
  cors: true,
  timeoutSeconds: 60,
  memory: '256MiB'
}, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const user = await verifyFirebaseToken(req, res);
  if (!user) return;

  try {
    const { base64Data } = req.body;
    if (!base64Data) return res.status(400).json({ error: 'base64Data requerido' });

    const buffer = Buffer.from(base64Data, 'base64');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Read as raw arrays to handle files where headers are not in row 0
    const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '', header: 1 });

    // Find the header row: first row that contains both "Nombre" and "Fecha"
    let headerIdx = -1;
    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      const lower = row.map(c => String(c).trim().toLowerCase());
      if (lower.includes('nombre') && lower.includes('fecha')) { headerIdx = i; break; }
    }

    if (headerIdx === -1) return res.status(200).json({ domicilios: [], total: 0, rawColumns: [] });

    const headers  = rawRows[headerIdx].map(h => String(h).trim());
    const dataRows = rawRows.slice(headerIdx + 1).map(row =>
      Object.fromEntries(headers.map((h, i) => [h, row[i] !== undefined ? row[i] : '']))
    );

    function findCol(row, candidates) {
      const keys = Object.keys(row);
      for (const c of candidates) {
        const found = keys.find(k => k.toLowerCase().includes(c.toLowerCase()));
        if (found !== undefined) return row[found];
      }
      return '';
    }

    const domicilios = dataRows
      .filter(row => {
        const nombre = String(findCol(row, ['nombre', 'name', 'cliente']) || '').trim();
        return nombre !== '' && !nombre.toLowerCase().startsWith('total');
      })
      .map(row => {
        const dirRaw = String(findCol(row, ['direcci', 'direccion', 'dir']) || '');
        const partes = dirRaw.split(/punto\s+referencia\s*:/i);
        const direccion      = partes[0]?.trim() || dirRaw;
        const puntoReferencia = partes[1]?.trim() || '';

        const fechaRaw = String(findCol(row, ['fecha']) || '');
        let fecha = '';
        try {
          const parts = fechaRaw.split('/');
          if (parts.length === 3) {
            const yr = parts[2].length === 2 ? '20' + parts[2] : parts[2];
            fecha = `${yr}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
          }
        } catch(e) { fecha = ''; }

        let total = 0;
        try {
          total = parseFloat(String(findCol(row, ['total']) || '').replace(/[^0-9.]/g, '')) || 0;
        } catch(e) {}

        return {
          fecha,
          cliente:      String(findCol(row, ['nombre', 'name', 'cliente']) || '').trim(),
          telefono:     String(findCol(row, ['telefono', 'tel']) || '').trim(),
          total,
          formaPago:    String(findCol(row, ['forma', 'pago', 'payment']) || '').trim(),
          direccion,
          puntoReferencia,
          departamento: String(findCol(row, ['departamento', 'depto']) || '').trim(),
          municipio:    String(findCol(row, ['municipio']) || '').trim(),
          empresaEnvio: String(findCol(row, ['emp', 'envio', 'empresa']) || '').trim(),
        };
      });

    return res.status(200).json({
      domicilios,
      total:      domicilios.length,
      rawColumns: headers.filter(h => h !== '')
    });

  } catch(e) {
    console.error('parseXLS error:', e);
    return res.status(500).json({
      error: 'Error al procesar el archivo: ' + e.message
    });
  }
});

/* ═══════════════════════════════════════
   AUTO-CIERRE JORNADA — Scheduled 2:00am El Salvador
═══════════════════════════════════════ */
async function buildCierreResumenAdmin(db, fecha) {
  const COLL_PEND = 'ops_pendientes';
  const PAGOS     = ['Efectivo','Tarjeta Credito','Contra Entrega','Transferencia Electronica','Credito'];

  const [vueltasSnap, domSnap, pendSnap] = await Promise.all([
    db.collection('vueltas').where('date', '==', fecha).get(),
    db.collection('domicilios').where('date', '==', fecha).get(),
    db.collection(COLL_PEND).where('done', '==', true).get(),
  ]);

  const vueltas = vueltasSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const doms    = domSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const startOfDay = new Date(fecha + 'T00:00:00-06:00').getTime();
  const endOfDay   = startOfDay + 86399999;
  const pendResueltos = pendSnap.docs.filter(d => {
    const at = d.data().doneAt || 0;
    return at >= startOfDay && at <= endOfDay;
  }).length;

  const vueltasStats = {
    total:       vueltas.length,
    completadas: vueltas.filter(v => v.status === 'done').length,
    enCamino:    vueltas.filter(v => v.status === 'en_camino').length,
    pendientes:  vueltas.filter(v => v.status === 'pending').length,
  };

  const porPago = {};
  PAGOS.forEach(p => { porPago[p] = 0; });
  let cobradoTotal = 0;
  doms.filter(d => d.status === 'entregado').forEach(d => {
    const pago  = d.formaPago || 'Otros';
    const monto = parseFloat(d.total) || 0;
    porPago[pago] = (porPago[pago] || 0) + monto;
    cobradoTotal += monto;
  });

  const entregasStats = {
    total:        doms.length,
    entregadas:   doms.filter(d => d.status === 'entregado').length,
    noEntregadas: doms.filter(d => d.status === 'no_entregado').length,
    enCamino:     doms.filter(d => d.status === 'en_camino').length,
    pendientes:   doms.filter(d => d.status === 'pendiente').length,
    cobrado:      cobradoTotal,
    porPago,
  };

  const motoristasMap = {};
  vueltas.forEach(v => {
    const m = v.assignedTo || 'Sin asignar';
    if (!motoristasMap[m]) motoristasMap[m] = { nombre: m, vueltas: 0, vueltasDone: 0, entregas: 0, entregasDone: 0 };
    motoristasMap[m].vueltas++;
    if (v.status === 'done') motoristasMap[m].vueltasDone++;
  });
  doms.forEach(d => {
    const m = d.assignedTo || 'Sin asignar';
    if (!motoristasMap[m]) motoristasMap[m] = { nombre: m, vueltas: 0, vueltasDone: 0, entregas: 0, entregasDone: 0 };
    motoristasMap[m].entregas++;
    if (d.status === 'entregado') motoristasMap[m].entregasDone++;
  });

  return {
    fecha,
    creadoAt:            Date.now(),
    vueltas:             vueltasStats,
    entregas:            entregasStats,
    motoristas:          Object.values(motoristasMap),
    pendientesResueltos: pendResueltos,
    vueltasIncompletas:  vueltas.filter(v => v.status !== 'done')
                           .map(v => ({ id: v.id, destination: v.destination || '—', assignedTo: v.assignedTo || '' })),
    entregasIncompletas: doms.filter(d => d.status !== 'entregado')
                           .map(d => ({ id: d.id, cliente: d.cliente || '—', assignedTo: d.assignedTo || '', status: d.status })),
  };
}

exports.suggestReplenishment = onRequest(
  { timeoutSeconds: 120, memory: '512MiB' },
  async (req, res) => {
  if (handleCors(req, res)) return;

  const user = await verifyFirebaseToken(req, res);
  if (!user) return;
  if (!(await isCallerSuper(user.uid))) {
    res.status(403).json({ error: 'Solo el supervisor puede usar esta función.' });
    return;
  }

  const { products, origin = 'B01B02', servedDests } = req.body;
  if (!products?.length) { res.status(400).json({ error: 'No products' }); return; }

  // Bodegas que forman el pool del origen seleccionado
  const ORIGIN_SRC = { B01B02: ['B01','B02'], B01: ['B01'], B02: ['B02'], B03: ['B03'] };
  const srcs = ORIGIN_SRC[origin] || ['B01','B02'];

  // Destinos que este origen surte (el cliente los manda; fallback a todos)
  const ALL_DESTS = ['M01','S02','S03','S04','S06','S07'];
  const dests = Array.isArray(servedDests) && servedDests.length
    ? servedDests.filter(d => ALL_DESTS.includes(d))
    : ALL_DESTS;

  const lines = products.map(p => {
    const st   = p.stock || {};
    const pool = srcs.reduce((s, w) => s + (st[w] || 0), 0);
    const cols = dests.map(d => `${d}:${st[d] || 0}`).join('|');
    return `${p.code}|${(p.name || '').substring(0,40)}|orig:${pool}|${cols}`;
  }).join('\n');

  const schema = `{"suggestions":[{"code":"COD",${dests.map(d => `"${d}":0`).join(',')}}]}`;

  const prompt = `Sos un asistente de gestión de inventario para una distribuidora tecnológica en El Salvador.

ORIGEN de este envío: ${origin}. Solo podés sugerir envíos a estos destinos: ${dests.join(', ')}.

REGLAS DE NEGOCIO (prioridad de atención):
- M01 (Merliot) y S02 (San Salvador): PRIORIDAD ALTA. Nunca deben quedar en 0. Atendelas primero.
- S04 (Soyapango): PRIORIDAD MEDIA. Reponer si llega a 0.
- S03 (San Miguel), S06 (Zoditech), S07 (Usulután): PRIORIDAD BAJA. Con lo que quede.

RESTRICCIÓN DURA DE ORIGEN (obligatoria):
- "orig" = unidades disponibles en el ORIGEN (${origin}) para ese código en este envío.
- La SUMA de tus sugerencias de un código entre todos los destinos NUNCA puede superar su "orig".
- Si orig = 0, todas las sugerencias de ese código son 0.
- Solo sugerí destinos de la lista permitida (${dests.join(', ')}). Para cualquier otro, 0.

INVENTARIO (Código|Nombre|orig|${dests.join('|')}):
${lines}

Respondé ÚNICAMENTE con JSON válido sin markdown:
${schema}`;

  try {
    const text = await callClaude({
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    });
    const result = JSON.parse(text.match(/\{[\s\S]*\}/)[0]);
    res.json(result);
  } catch(e) {
    console.error('suggestReplenishment parse error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

exports.autoCierreJornada = onSchedule({
  schedule: '0 2 * * *',
  timeZone: 'America/El_Salvador',
}, async () => {
  const db = admin.firestore();

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const fecha = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/El_Salvador'
  }).format(yesterday);

  const cierreRef  = db.doc(`cierres/${fecha}`);
  const cierreSnap = await cierreRef.get();
  if (cierreSnap.exists) {
    console.log(`Auto-cierre: ya existe cierre para ${fecha}`);
    return;
  }

  try {
    const resumen = await buildCierreResumenAdmin(db, fecha);
    await cierreRef.set({ ...resumen, autoCierre: true });
    console.log(`Auto-cierre registrado para ${fecha}`);
  } catch(e) {
    console.error('Auto-cierre error:', e.message);
  }
});

exports.createUser = onRequest(
  { timeoutSeconds: 60, memory: '256MiB' },
  async (req, res) => {
    if (handleCors(req, res)) return;

    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!idToken) { res.status(401).json({ error: 'No autorizado' }); return; }

    try {
      const decoded = await admin.auth().verifyIdToken(idToken);
      const callerDoc = await admin.firestore().doc(`users/${decoded.uid}`).get();
      const _callerD = callerDoc.exists ? callerDoc.data() : null;
      if (!_callerD || (_callerD.apps?.despacho?.role ?? _callerD.role) !== 'super') {
        res.status(403).json({ error: 'Solo el supervisor puede crear usuarios' });
        return;
      }
    } catch(e) {
      res.status(401).json({ error: 'Token inválido' });
      return;
    }

    const { name, email, password, role, colaboradorId } = req.body;
    if (!name || !email || !password || !role) {
      res.status(400).json({ error: 'Faltan campos requeridos' });
      return;
    }

    // Validar colaboradorId ANTES de crear la cuenta en Auth: el batch de abajo hace
    // batch.update() sobre ese doc (requiere que ya exista) y no es atómico con
    // admin.auth().createUser() — si se crea la cuenta primero y el batch falla después,
    // queda una cuenta huérfana en Auth sin users/{uid}.
    if (colaboradorId) {
      const colabSnap = await admin.firestore().doc(`colaboradores/${colaboradorId}`).get();
      if (!colabSnap.exists) {
        res.status(400).json({ error: 'El colaborador vinculado ya no existe.' });
        return;
      }
    }

    try {
      const userRecord = await admin.auth().createUser({ email, password, displayName: name });
      const now = Date.now();
      const batch = admin.firestore().batch();
      batch.set(admin.firestore().doc(`users/${userRecord.uid}`), {
        name,
        email,
        role,
        estado: 'aprobado',
        apps: { despacho: { role } },
        colaboradorId: colaboradorId || null,
        createdAt: now,
        active: true,
        fcmTokens: []
      });
      if (colaboradorId) {
        batch.update(admin.firestore().doc(`colaboradores/${colaboradorId}`), {
          uid: userRecord.uid,
          updatedAt: now
        });
      }
      await batch.commit();
      console.log(`Usuario creado: ${name} (${email}) — uid: ${userRecord.uid}${colaboradorId ? ` → colab ${colaboradorId}` : ''}`);
      res.status(200).json({ success: true, uid: userRecord.uid });
    } catch(e) {
      console.error('Error creando usuario:', e.message);
      let error = 'Error al crear usuario';
      if (e.code === 'auth/email-already-exists') error = 'Este email ya está registrado';
      else if (e.code === 'auth/invalid-email')   error = 'Email inválido';
      else if (e.code === 'auth/weak-password')   error = 'Contraseña muy débil (mínimo 6 caracteres)';
      res.status(400).json({ error });
    }
  }
);

const nodemailer = require('nodemailer');
const { defineSecret } = require('firebase-functions/params');
const SMTP_PASS = defineSecret('SMTP_PASS');

// Envía la proyección de envío por correo (SMTP del dominio) con el PDF adjunto.
exports.sendProjection = onRequest(
  { timeoutSeconds: 120, memory: '512MiB', secrets: [SMTP_PASS] },
  async (req, res) => {
    if (handleCors(req, res)) return;

    const user = await verifyFirebaseToken(req, res);
    if (!user) return;
    if (!(await isCallerSuper(user.uid))) {
      res.status(403).json({ error: 'Solo el supervisor puede usar esta función.' });
      return;
    }

    const { toEmail, subject, html, pdfBase64, filename, bcc } = req.body || {};
    if (!toEmail || !pdfBase64) {
      res.status(400).json({ error: 'Faltan toEmail o pdfBase64.' });
      return;
    }

    const SMTP_USER = 'operaciones@zonadigitalsv.com';
    const transporter = nodemailer.createTransport({
      host: 'mail.zonadigitalsv.com',
      port: 465,
      secure: true,
      auth: { user: SMTP_USER, pass: SMTP_PASS.value() },
    });

    try {
      await transporter.sendMail({
        from: `"Zona Digital — Operaciones" <${SMTP_USER}>`,
        to: toEmail,
        bcc: bcc || undefined,
        subject: subject || 'Proyección de envío',
        html: html || '<p>Proyección de envío adjunta.</p>',
        attachments: [{
          filename: filename || 'Proyeccion.pdf',
          content: Buffer.from(pdfBase64, 'base64'),
          contentType: 'application/pdf',
        }],
      });
      res.status(200).json({ ok: true });
    } catch (e) {
      console.error('sendProjection error:', e);
      res.status(500).json({ error: 'No se pudo enviar el correo: ' + e.message });
    }
  }
);
