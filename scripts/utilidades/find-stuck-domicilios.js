// Lista domicilios con status 'en_camino' de días anteriores a hoy — candidatos a
// haber quedado "pegados" por el bug de WhatsApp/moto.html (corregido 03 Sep 2026,
// commit 8c8bd23). Solo lectura, no modifica nada.
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({ credential: admin.cert(serviceAccount) });
const db = getFirestore();

function getTodaySV() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/El_Salvador' });
}

async function main() {
  const todaySV = getTodaySV();
  console.log(`\nBuscando domicilios status='en_camino' con date < ${todaySV}…\n`);

  const snap = await db.collection('domicilios')
    .where('status', '==', 'en_camino')
    .get();

  const stuck = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(d => d.date && d.date < todaySV);

  if (!stuck.length) {
    console.log('No se encontró ninguno. (Puede que ya estén marcados de otra forma, o que el filtro de fecha no matchee — revisar a mano si Fernando esperaba ver algo acá.)');
    process.exit(0);
  }

  stuck.forEach(d => {
    console.log(`[${d.id}] ${d.date} — ${d.cliente || '(sin nombre)'} — asignado: ${d.assignedToName || d.assignedTo || '—'} — $${d.total || 0} — ${d.direccion || ''}`);
  });
  console.log(`\nTotal: ${stuck.length}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
