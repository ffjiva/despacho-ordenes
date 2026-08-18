const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.cert(serviceAccount)
});

const db    = getFirestore();
const auth  = getAuth();

async function verify() {
  console.log('\n═══════════════════════════════════');
  console.log('  VERIFICACIÓN DE USUARIOS');
  console.log('═══════════════════════════════════\n');

  // 1. Todos los usuarios en Firebase Auth
  const authList = await auth.listUsers();
  const authUsers = authList.users.map(u => ({
    uid:   u.uid,
    email: u.email,
    name:  u.displayName || '(sin displayName)'
  }));

  console.log(`Firebase Auth — ${authUsers.length} usuarios:`);
  authUsers.forEach(u => console.log(`  [${u.uid}] ${u.email} — ${u.name}`));

  // 2. Todos los documentos en users/
  const usersSnap = await db.collection('users').get();
  const firestoreUsers = usersSnap.docs.map(d => ({
    uid:  d.id,
    ...d.data()
  }));

  console.log(`\nFirestore users/ — ${firestoreUsers.length} documentos:`);
  firestoreUsers.forEach(u => console.log(`  [${u.uid}] ${u.email} — name: "${u.name}" — role: ${u.role}`));

  // 3. Auth sin documento en Firestore
  const firestoreUids = new Set(firestoreUsers.map(u => u.uid));
  const sinDoc = authUsers.filter(u => !firestoreUids.has(u.uid));
  if (sinDoc.length) {
    console.log(`\n⚠️  En Auth pero SIN documento en users/ (${sinDoc.length}):`);
    sinDoc.forEach(u => console.log(`  ❌ [${u.uid}] ${u.email}`));
  } else {
    console.log('\n✅ Todos los usuarios de Auth tienen documento en users/');
  }

  // 4. Documentos en Firestore sin usuario en Auth
  const authUids = new Set(authUsers.map(u => u.uid));
  const sinAuth = firestoreUsers.filter(u => !authUids.has(u.uid));
  if (sinAuth.length) {
    console.log(`\n⚠️  En Firestore pero SIN usuario en Auth (${sinAuth.length}):`);
    sinAuth.forEach(u => console.log(`  ❌ [${u.uid}] ${u.email}`));
  } else {
    console.log('✅ Todos los documentos de users/ tienen usuario en Auth');
  }

  // 5. Últimos 20 despachos — verificar assignedTo vs users.name
  const despachosSnap = await db.collection('despachos')
    .orderBy('createdAt', 'desc').limit(20).get();

  const nombresEnUsers = new Set(firestoreUsers.map(u => u.name).filter(Boolean));
  const assignedToSet  = new Set();
  despachosSnap.docs.forEach(d => {
    const at = d.data().assignedTo;
    if (at) assignedToSet.add(at);
  });

  console.log('\nNombres únicos en assignedTo (últimos 20 despachos):');
  const sinMatch = [];
  assignedToSet.forEach(nombre => {
    const ok = nombresEnUsers.has(nombre);
    console.log(`  ${ok ? '✅' : '❌'} "${nombre}"`);
    if (!ok) sinMatch.push(nombre);
  });

  if (sinMatch.length) {
    console.log(`\n⚠️  Estos nombres en assignedTo NO coinciden con ningún users.name:`);
    sinMatch.forEach(n => console.log(`  ❌ "${n}"`));
    console.log('  → Las notificaciones FCM no llegarán para estas asignaciones.');
  }

  console.log('\n═══════════════════════════════════\n');
  process.exit(0);
}

verify().catch(e => { console.error(e); process.exit(1); });
