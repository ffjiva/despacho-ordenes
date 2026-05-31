const admin = require('firebase-admin');
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: 'despacho-ordenes'
});

const db = admin.firestore();

async function fix() {
  const snap = await db.collection('users')
    .where('name', '==', 'Anderson de Sousa').get();

  if (snap.empty) {
    console.log('No se encontró "Anderson de Sousa" en users/');
    process.exit(0);
  }

  const doc = snap.docs[0];
  await doc.ref.update({ name: 'Anderson De Sousa' });
  console.log(`✅ Corregido: [${doc.id}] → name: "Anderson De Sousa"`);
  process.exit(0);
}

fix().catch(e => { console.error(e); process.exit(1); });
