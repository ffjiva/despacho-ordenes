// Limpia prioritario:true pegado en domicilios ya resueltos (entregado / no_entregado).
// Bug: acabeDomicilio() nunca limpiaba `prioritario` al completar (a diferencia de
// completarVuelta(), que sí limpia `emergency`) — corregido en moto.html 03 Sep 2026.
// Este script es la limpieza retroactiva de los registros ya resueltos que quedaron
// con la etiqueta de emergencia pegada de antes del fix.
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({ credential: admin.cert(serviceAccount) });
const db = getFirestore();

const APPLY = process.argv.includes('--apply');

async function main() {
  const snap = await db.collection('domicilios')
    .where('prioritario', '==', true)
    .get();

  const stuck = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(d => d.status === 'entregado' || d.status === 'no_entregado');

  if (!stuck.length) {
    console.log('\nNo hay domicilios resueltos con prioritario:true pegado. Nada que hacer.');
    process.exit(0);
  }

  console.log(`\n${APPLY ? 'Limpiando' : 'Encontrados (dry-run, corré con --apply para aplicar)'}: ${stuck.length}\n`);
  stuck.forEach(d => {
    console.log(`  [${d.id}] ${d.date} — ${d.cliente || '(sin nombre)'} — status: ${d.status}`);
  });

  if (!APPLY) {
    console.log('\nNada modificado — corré de nuevo con --apply para limpiar estos registros.');
    process.exit(0);
  }

  const batch = db.batch();
  stuck.forEach(d => batch.update(db.doc(`domicilios/${d.id}`), { prioritario: false }));
  await batch.commit();
  console.log(`\n✅ ${stuck.length} registro(s) corregido(s).`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
