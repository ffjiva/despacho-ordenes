// Smoke test de Cloud Functions contra el Firebase Emulator Suite (Firestore + Auth + Functions).
// Cubre solo las funciones sin costo ni efectos externos reales:
//   createUser, los triggers de Firestore (onDespachoAssigned, onVueltaAssigned,
//   onInventarioAsignado) y parseXLS. Deja fuera parseDocument/suggestReplenishment
//   (llaman a la API de Claude, costo real) y sendProjection (correo real) — necesitan
//   ANTHROPIC_KEY/SMTP_PASS locales y autorización explícita para gastar/enviar de verdad.
//   autoCierreJornada (onSchedule) tampoco corre: el emulator la ignora sin el emulator de
//   pubsub, que no está configurado.
//
// Uso: npm run test:functions
// Requiere: dependencias de functions/ instaladas (functions/node_modules).

import { spawn, execSync } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');
const FIRESTORE_PORT = 8080;
const AUTH_PORT      = 9099;
const FUNCTIONS_PORT = 5001;
const PROJECT_ID     = 'despacho-ordenes';
const FN_BASE = `http://127.0.0.1:${FUNCTIONS_PORT}/${PROJECT_ID}/us-central1`;

process.env.FIRESTORE_EMULATOR_HOST      = `localhost:${FIRESTORE_PORT}`;
process.env.FIREBASE_AUTH_EMULATOR_HOST  = `localhost:${AUTH_PORT}`;

let failures = 0;
function check(label, cond) {
  if (cond) { console.log(`  ✅ ${label}`); }
  else { console.log(`  ❌ ${label}`); failures++; }
}

function waitForPort(port, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    (function attempt() {
      const req = http.get({ host: '127.0.0.1', port, timeout: 1500 }, res => { res.resume(); resolve(); });
      req.on('error', () => {
        if (Date.now() > deadline) reject(new Error(`Puerto ${port} no respondió a tiempo`));
        else setTimeout(attempt, 500);
      });
      req.on('timeout', () => { req.destroy(); if (Date.now() > deadline) reject(new Error(`Puerto ${port} no respondió a tiempo`)); else setTimeout(attempt, 500); });
    })();
  });
}

async function waitFor(fn, { timeoutMs = 10000, intervalMs = 300 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > deadline) return null;
    await new Promise(r => setTimeout(r, intervalMs));
  }
}

async function main() {
  const { initializeApp } = await import('firebase-admin/app');
  const { getFirestore }  = await import('firebase-admin/firestore');
  const { getAuth }       = await import('firebase-admin/auth');
  const XLSX = (await import('xlsx')).default ?? await import('xlsx');

  console.log('🚀 Levantando Firebase Emulator Suite (firestore + auth + functions)...');
  const emu = spawn('firebase', ['emulators:start', '--only', 'firestore,auth,functions'], { cwd: ROOT, stdio: 'ignore', detached: true });
  const cleanup = () => {
    try { process.kill(-emu.pid); } catch {}
    try { emu.kill(); } catch {}
    try { execSync('pkill -f "cloud-firestore-emulator" 2>/dev/null || true'); } catch {}
  };
  process.on('exit', cleanup);

  await waitForPort(FIRESTORE_PORT);
  await waitForPort(AUTH_PORT);
  await waitForPort(FUNCTIONS_PORT, 90000); // el functions emulator tarda más en arrancar (build + carga de index.js)
  // El puerto acepta conexiones ANTES de que las funciones terminen de registrarse — hasta
  // entonces cualquier request responde "Function ... does not exist" en texto plano (no
  // JSON) con 404. Reintentar contra un endpoint real hasta que deje de pasar eso.
  await waitFor(async () => {
    try {
      const r = await fetch(`${FN_BASE}/createUser`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      return r.status !== 404;
    } catch { return false; }
  }, { timeoutMs: 60000, intervalMs: 1000 });
  console.log('✅ Emulators arriba.');

  initializeApp({ projectId: PROJECT_ID });
  const db   = getFirestore();
  const auth = getAuth();

  try {
    // ── Setup: usuario 'super' (necesario para createUser) + un colaborador con token FCM falso ──
    const superRecord = await auth.createUser({ email: 'cf-super@test.local', password: 'test1234', displayName: 'Super CF Test' });
    await db.doc(`users/${superRecord.uid}`).set({
      name: 'Super CF Test', email: 'cf-super@test.local', role: 'super',
      apps: { despacho: { role: 'super' } }, estado: 'aprobado', colaboradorId: null,
      active: true, createdAt: Date.now(), fcmTokens: [],
    });
    const superIdToken = await auth.createCustomToken(superRecord.uid); // solo para armar el id token vía REST abajo

    const notSuperRecord = await auth.createUser({ email: 'cf-notsuper@test.local', password: 'test1234', displayName: 'No Super CF Test' });
    await db.doc(`users/${notSuperRecord.uid}`).set({
      name: 'No Super CF Test', email: 'cf-notsuper@test.local', role: 'collaborator',
      apps: { despacho: { role: 'collaborator' } }, estado: 'aprobado', colaboradorId: null,
      active: true, createdAt: Date.now(), fcmTokens: [],
    });

    const notifiedUserRecord = await auth.createUser({ email: 'cf-notify@test.local', password: 'test1234', displayName: 'Notify CF Test' });
    await db.doc(`users/${notifiedUserRecord.uid}`).set({
      name: 'Notify CF Test', email: 'cf-notify@test.local', role: 'motorista',
      apps: { despacho: { role: 'motorista' } }, estado: 'aprobado', colaboradorId: null,
      active: true, createdAt: Date.now(), fcmTokens: ['fake-fcm-token-para-test-e2e'],
    });

    // El emulator de Auth acepta id tokens "falsos" con este formato para pruebas locales
    // (no requiere pasar por signInWithCustomToken real): ver docs de Auth Emulator REST API.
    async function fakeIdTokenFor(uid) {
      const resp = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: await auth.createCustomToken(uid), returnSecureToken: true }),
      });
      const json = await resp.json();
      if (!json.idToken) throw new Error('No se pudo obtener idToken de prueba: ' + JSON.stringify(json));
      return json.idToken;
    }

    const superToken    = await fakeIdTokenFor(superRecord.uid);
    const notSuperToken = await fakeIdTokenFor(notSuperRecord.uid);

    // ── 1. createUser — caller no-super rechazado (403) ──
    console.log('\n▶ createUser — caller no-super');
    let resp = await fetch(`${FN_BASE}/createUser`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${notSuperToken}` },
      body: JSON.stringify({ name: 'X', email: 'x@test.local', password: 'test1234', role: 'collaborator' }),
    });
    check('rechaza con 403 a un caller no-super', resp.status === 403);

    // ── 2. createUser — sin token ──
    resp = await fetch(`${FN_BASE}/createUser`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'X', email: 'x2@test.local', password: 'test1234', role: 'collaborator' }),
    });
    check('rechaza con 401 sin token de autorización', resp.status === 401);

    // ── 3. createUser — happy path, vincula con colaboradores/{id} existente ──
    console.log('\n▶ createUser — happy path (con colaboradorId)');
    await db.doc('colaboradores/cf-colab-happy').set({ nombre: 'Colaborador Happy CF', cargo: 'Bodeguero', uid: null, activo: true });
    resp = await fetch(`${FN_BASE}/createUser`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
      body: JSON.stringify({ name: 'Colaborador Happy CF', email: 'cf-happy@test.local', password: 'test1234', role: 'collaborator', colaboradorId: 'cf-colab-happy' }),
    });
    const happyJson = await resp.json();
    check('createUser responde 200 con uid', resp.status === 200 && !!happyJson.uid);
    if (happyJson.uid) {
      const userSnap = await db.doc(`users/${happyJson.uid}`).get();
      check('users/{uid} se crea con role/apps.despacho.role correctos', userSnap.exists && userSnap.data().role === 'collaborator' && userSnap.data().apps?.despacho?.role === 'collaborator');
      const colabSnap = await db.doc('colaboradores/cf-colab-happy').get();
      check('colaboradores/{id}.uid queda vinculado (batch atómico)', colabSnap.exists && colabSnap.data().uid === happyJson.uid);
    }

    // ── 4. createUser — colaboradorId inexistente: NO debe crear cuenta huérfana ──
    // Regresión del bug encontrado en la sesión anterior: admin.auth().createUser() corría
    // ANTES del batch de Firestore (no atómico entre Auth y Firestore), así que si
    // batch.update() fallaba por colaboradorId inexistente, quedaba una cuenta huérfana en
    // Auth sin users/{uid}. Fix: valida que el colaborador exista antes de tocar Auth.
    console.log('\n▶ createUser — colaboradorId inexistente (caso borde, no happy path)');
    resp = await fetch(`${FN_BASE}/createUser`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
      body: JSON.stringify({ name: 'Huerfano CF', email: 'cf-huerfano@test.local', password: 'test1234', role: 'collaborator', colaboradorId: 'cf-colab-no-existe' }),
    });
    check('responde con error (no 200) cuando colaboradorId no existe', resp.status !== 200);
    let orphanAuthUser = null;
    try { orphanAuthUser = await auth.getUserByEmail('cf-huerfano@test.local'); } catch {}
    check('no queda cuenta huérfana en Auth cuando colaboradorId no existe', !orphanAuthUser);

    // ── 5. Trigger onDespachoAssigned ──
    console.log('\n▶ Firestore trigger — onDespachoAssigned');
    const despRef = await db.collection('despachos').add({
      name: 'Despacho CF trigger test', origin: 'B01', destination: 'M01',
      assignedTo: notifiedUserRecord.uid, assignedToName: 'Notify CF Test',
      createdBy: superRecord.uid, createdByName: 'Super CF Test',
      photos: [], products: [], checked: {}, status: 'pending',
      lockedBy: null, lockedAt: null, archived: false, originalUrl: '',
      startedAt: null, completedAt: null, dispatchedAt: null, createdAt: Date.now(), activeMs: 0,
    });
    const despAfter = await waitFor(async () => {
      const s = await despRef.get();
      return s.data()?.lastNotifiedAssignedTo === notifiedUserRecord.uid ? s : null;
    }, { timeoutMs: 15000 });
    check('onDespachoAssigned corre y marca lastNotifiedAssignedTo al asignar', !!despAfter);

    // ── 6. Trigger onVueltaAssigned ──
    console.log('\n▶ Firestore trigger — onVueltaAssigned');
    const vueltaRef = await db.collection('vueltas').add({
      date: new Date().toLocaleDateString('en-CA', { timeZone: 'America/El_Salvador' }), order: 99,
      destination: 'CF TRIGGER TEST', description: '', assignedTo: notifiedUserRecord.uid, assignedToName: 'Notify CF Test',
      urgency: 'normal', linkedOrderIds: [], status: 'pending', paradero: '',
      createdBy: superRecord.uid, createdByName: 'Super CF Test', createdAt: Date.now(), completedAt: null, photos: [],
    });
    const vueltaAfter = await waitFor(async () => {
      const s = await vueltaRef.get();
      return s.data()?.lastNotifiedAssignedTo === notifiedUserRecord.uid ? s : null;
    }, { timeoutMs: 15000 });
    check('onVueltaAssigned corre y marca lastNotifiedAssignedTo al asignar', !!vueltaAfter);

    // ── 7. Trigger onInventarioAsignado ──
    console.log('\n▶ Firestore trigger — onInventarioAsignado');
    const invRef = await db.collection('inventarios').add({
      sucursal: 'M01', sucursalNombre: 'M01 Merliot', titulo: 'Conteo CF trigger test',
      fecha: new Date().toISOString().slice(0, 10), asignadoA: notifiedUserRecord.uid, asignadoANombre: 'Notify CF Test',
      creadoPor: superRecord.uid, creadoPorNombre: 'Super CF Test', status: 'pendiente', productos: [],
      resumen: { total: 0, contados: 0, discrepancias: 0, pendientes: 0 },
      creadoAt: Date.now(), iniciadoAt: null, completadoAt: null,
    });
    const invAfter = await waitFor(async () => {
      const s = await invRef.get();
      return s.data()?.lastNotifiedAsignadoA === notifiedUserRecord.uid ? s : null;
    }, { timeoutMs: 15000 });
    check('onInventarioAsignado corre y marca lastNotifiedAsignadoA al asignar', !!invAfter);

    // ── 8. parseXLS — requiere token ──
    console.log('\n▶ parseXLS — sin token');
    resp = await fetch(`${FN_BASE}/parseXLS`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64Data: '' }),
    });
    check('rechaza con 401 sin token de autorización', resp.status === 401);

    // ── 9. parseXLS — happy path con un XLS mínimo armado en memoria ──
    console.log('\n▶ parseXLS — happy path');
    const ws = XLSX.utils.aoa_to_sheet([
      ['Nombre', 'Fecha', 'Telefono', 'Total', 'Direccion', 'Forma de Pago'],
      ['Cliente Piloto', '30/07/2026', '70001234', '25.50', 'Col. Test #1, Punto Referencia: frente a la plaza', 'Efectivo'],
      ['TOTAL', '', '', '25.50', '', ''],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Domicilios');
    const base64Data = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

    resp = await fetch(`${FN_BASE}/parseXLS`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
      body: JSON.stringify({ base64Data }),
    });
    const xlsJson = await resp.json();
    check('parseXLS responde 200', resp.status === 200);
    check('parseXLS extrae 1 domicilio (excluye la fila TOTAL)', xlsJson.total === 1 && xlsJson.domicilios?.length === 1);
    const dom = xlsJson.domicilios?.[0] || {};
    check(`cliente extraído correctamente (obtenido: "${dom.cliente}")`, dom.cliente === 'Cliente Piloto');
    check(`fecha normalizada a YYYY-MM-DD (obtenido: "${dom.fecha}")`, dom.fecha === '2026-07-30');
    check(`dirección separada del punto de referencia (dir: "${dom.direccion}", ref: "${dom.puntoReferencia}")`,
      dom.direccion === 'Col. Test #1,' && dom.puntoReferencia === 'frente a la plaza');
    check(`total parseado como número (obtenido: ${dom.total})`, dom.total === 25.5);

  } finally {
    cleanup();
  }

  console.log(failures === 0 ? '\n✅ Functions smoke test OK — todo verde.' : `\n❌ Functions smoke test con ${failures} falla(s).`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
