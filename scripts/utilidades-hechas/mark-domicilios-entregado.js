const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({ credential: admin.cert(serviceAccount) });
const db = getFirestore();

// ── Corrección puntual de entregas pegadas en 'en_camino' ──────────────────
// Opera SOLO sobre la lista explícita de abajo (confirmada una por una por el super).
// Preserva 'date' real. Uso:
//   node scripts/utilidades/mark-domicilios-entregado.js            (dry-run, no escribe)
//   node scripts/utilidades/mark-domicilios-entregado.js --apply    (escribe)
const APPLY = process.argv.includes('--apply');

// Entregas confirmadas como ENTREGADAS por Fernando (03 Sep 2026, motorista Anderson).
const TARGETS = [
  { id: 'aWUrwnIcKuHbtmiQl3mu', cliente: 'Baltazar Alfaro' },
  { id: 'jFJF55YOZAMeWrxqN2jr', cliente: 'Eduardo Delgado' },
  { id: 'wQYT5uuefwTWOyWNYM8D', cliente: 'Nelly Beatriz Velasquez Ortiz' },
];

// Ancla a mediodía SV de la fecha real: día correcto, sin inventar hora exacta.
const completadoAtFor = dateStr => new Date(dateStr + 'T12:00:00-06:00').getTime();

(async () => {
  console.log(APPLY ? '=== MODO APPLY (escribe) ===' : '=== DRY-RUN (no escribe; usá --apply para aplicar) ===');
  const plan = [];
  for (const t of TARGETS) {
    const ref  = db.collection('domicilios').doc(t.id);
    const snap = await ref.get();
    if (!snap.exists) { console.log(`SKIP ${t.id} (${t.cliente}): NO EXISTE`); continue; }
    const d = snap.data();
    const nombre = d.cliente || '(sin nombre)';
    if (d.status !== 'en_camino') {
      console.log(`SKIP ${t.id} (${nombre}): status='${d.status}' (no 'en_camino') — por seguridad no se toca`);
      continue;
    }
    const update = {
      status: 'entregado',
      completadoAt: completadoAtFor(d.date),
      prioritario: false,        // limpia emergencia pegada, igual que acabeDomicilio()
      correccionManual: true,    // auditoría: no completada por la app
      correccionAt: Date.now(),
    };
    plan.push({ ref, update });
    console.log(`FIX  ${t.id} (${nombre}) date=${d.date}: '${d.status}' -> 'entregado'  completadoAt=${new Date(update.completadoAt).toISOString()}`);
  }
  console.log(`\nTotal a corregir: ${plan.length} de ${TARGETS.length}`);
  if (!APPLY) { console.log('DRY-RUN: no se escribió nada.'); process.exit(0); }
  if (!plan.length) { console.log('Nada que aplicar.'); process.exit(0); }
  const batch = db.batch();
  plan.forEach(p => batch.update(p.ref, p.update));
  await batch.commit();
  console.log(`\nOK: aplicado a ${plan.length} entrega(s). 'date' preservado.`);
  process.exit(0);
})().catch(e => { console.error('ERROR:', e); process.exit(1); });
