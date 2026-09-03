// Corrige las 3 entregas de Anderson (02 Sep 2026) que quedaron pegadas en
// status='en_camino' por el bug de WhatsApp/moto.html (corregido 03 Sep 2026,
// commit 8c8bd23) — confirmado por Fernando que las 3 sí se entregaron.
// Ids fijados a mano (salida de find-stuck-domicilios.js) para no arrastrar
// ningún otro registro que aparezca después.
//
// Marca status: 'entregado' y completadoAt, SIN tocar el campo `date` (queda en
// 2026-09-02, la fecha real) — así no descuadra reportes/cierre de jornada de ayer.
const admin = require('firebase-admin');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({ credential: admin.cert(serviceAccount) });
const db = getFirestore();

const IDS = [
  'KZn5CJVITAl4W7WrAP6h', // Camila Mendoza
  'gr7WETEf3yxq4bsZEqmu', // Noelly Castro
  'tNXLNAM0T0E5XoMgq0yn', // MARTINEZ, WALTER FERNANDO
];

// completadoAt aproximado: fin de jornada del 02 Sep 2026, hora El Salvador (UTC-6).
// No tenemos la hora real de entrega — se deja una hora representativa, no exacta.
const COMPLETADO_APROX = new Date('2026-09-02T18:00:00-06:00').getTime();
const COMENTARIO_FIX = 'Corregido manualmente (03 Sep 2026) — el status quedó pegado en ' +
  '"en camino" por el bug de WhatsApp en moto.html (ver CHANGELOG, commit 8c8bd23). ' +
  'Entrega confirmada por Fernando, hora de completadoAt es aproximada.';

async function main() {
  console.log(`\nCorrigiendo ${IDS.length} domicilios…\n`);
  const batch = db.batch();
  for (const id of IDS) {
    const ref  = db.doc(`domicilios/${id}`);
    const snap = await ref.get();
    if (!snap.exists) { console.log(`  ⚠ ${id} no existe, se salta`); continue; }
    const d = snap.data();
    if (d.status !== 'en_camino') {
      console.log(`  ⚠ ${id} (${d.cliente}) ya no está en 'en_camino' (está en '${d.status}'), se salta`);
      continue;
    }
    batch.update(ref, {
      status: 'entregado',
      completadoAt: COMPLETADO_APROX,
      comentario: [d.comentario, COMENTARIO_FIX].filter(Boolean).join('\n\n'),
    });
    console.log(`  ✓ ${id} — ${d.cliente} → entregado (date se mantiene: ${d.date})`);
  }
  await batch.commit();
  console.log('\n✅ Listo.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
