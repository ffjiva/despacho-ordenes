// Seed de datos de prueba para el Firebase Emulator Suite (Firestore + Auth).
// Requiere que los emulators estén corriendo: `firebase emulators:start --only firestore,auth`
// Uso: node scripts/emulator/seed.js

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || 'localhost:9099';

const { initializeApp } = require('firebase-admin/app');
const { getFirestore }  = require('firebase-admin/firestore');
const { getAuth }       = require('firebase-admin/auth');

initializeApp({ projectId: 'despacho-ordenes' });

const db   = getFirestore();
const auth = getAuth();

async function upsertUser({ email, password, name, role, colaboradorId }) {
  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch {
    user = await auth.createUser({ email, password, displayName: name });
  }
  await db.doc(`users/${user.uid}`).set({
    name, email, role,
    apps: { despacho: { role } },
    estado: 'aprobado',
    colaboradorId: colaboradorId || null,
    active: true,
    createdAt: Date.now(),
    fcmTokens: [],
  });
  return user.uid;
}

async function seed() {
  const superUid = await upsertUser({
    email: 'super@test.local', password: 'test1234',
    name: 'Fernando (test)', role: 'super',
  });

  const collabUid = await upsertUser({
    email: 'colaborador@test.local', password: 'test1234',
    name: 'Colaborador Piloto', role: 'collaborator', colaboradorId: 'colab-piloto',
  });
  await db.doc('colaboradores/colab-piloto').set({
    nombre: 'Colaborador Piloto', cargo: 'Bodeguero', uid: collabUid, activo: true,
  });

  // Segundo colaborador — solo para probar el rebote de "conteo que no es mío" (paso 5 del smoke test).
  const otroUid = await upsertUser({
    email: 'otro@test.local', password: 'test1234',
    name: 'Otro Colaborador', role: 'collaborator', colaboradorId: 'colab-otro',
  });
  await db.doc('colaboradores/colab-otro').set({
    nombre: 'Otro Colaborador', cargo: 'Bodeguero', uid: otroUid, activo: true,
  });

  const productos = [
    { codigo: 'P001', nombre: 'Mouse Inalámbrico', familia: 'Accesorios', disponib: 10, enPedido: 0, stockFisico: null, estado: 'pendiente' },
    { codigo: 'P002', nombre: 'Teclado Mecánico',   familia: 'Accesorios', disponib: 5,  enPedido: 2, stockFisico: null, estado: 'pendiente' },
    { codigo: 'P003', nombre: 'Monitor 24"',        familia: 'Monitores',  disponib: 3,  enPedido: 0, stockFisico: null, estado: 'pendiente' },
  ];

  const invRef = await db.collection('inventarios').add({
    sucursal: 'M01', sucursalNombre: 'M01 Merliot', titulo: 'Conteo piloto emulator',
    fecha: new Date().toISOString().slice(0, 10),
    asignadoA: collabUid, asignadoANombre: 'Colaborador Piloto',
    creadoPor: superUid, creadoPorNombre: 'Fernando (test)',
    status: 'pendiente', productos,
    resumen: { total: productos.length, contados: 0, discrepancias: 0, pendientes: productos.length },
    creadoAt: Date.now(), iniciadoAt: null, completadoAt: null,
  });

  const invOtroRef = await db.collection('inventarios').add({
    sucursal: 'S02', sucursalNombre: 'S02 San Salvador', titulo: 'Conteo de otro colaborador',
    fecha: new Date().toISOString().slice(0, 10),
    asignadoA: otroUid, asignadoANombre: 'Otro Colaborador',
    creadoPor: superUid, creadoPorNombre: 'Fernando (test)',
    status: 'pendiente', productos: [],
    resumen: { total: 0, contados: 0, discrepancias: 0, pendientes: 0 },
    creadoAt: Date.now(), iniciadoAt: null, completadoAt: null,
  });

  // Motorista — Fase 1.1: los motoristas también hacen conteos (gate "no-super").
  const motoUid = await upsertUser({
    email: 'motorista@test.local', password: 'test1234',
    name: 'Motorista Piloto', role: 'motorista', colaboradorId: 'colab-moto',
  });
  await db.doc('colaboradores/colab-moto').set({
    nombre: 'Motorista Piloto', cargo: 'Motorista', uid: motoUid, activo: true,
  });

  const invMotoRef = await db.collection('inventarios').add({
    sucursal: 'B03', sucursalNombre: 'B03 Oriente', titulo: 'Conteo piloto motorista',
    fecha: new Date().toISOString().slice(0, 10),
    asignadoA: motoUid, asignadoANombre: 'Motorista Piloto',
    creadoPor: superUid, creadoPorNombre: 'Fernando (test)',
    status: 'pendiente', productos: productos.map(p => ({ ...p })),
    resumen: { total: productos.length, contados: 0, discrepancias: 0, pendientes: productos.length },
    creadoAt: Date.now(), iniciadoAt: null, completadoAt: null,
  });

  console.log('\n✅ Seed listo en el emulator:');
  console.log('  super:       super@test.local / test1234');
  console.log('  colaborador: colaborador@test.local / test1234  →  conteo asignado:', invRef.id);
  console.log('  otro:        otro@test.local / test1234        →  conteo asignado:', invOtroRef.id);
  console.log('  motorista:   motorista@test.local / test1234    →  conteo asignado:', invMotoRef.id);
  console.log('\nProbá (logueado como colaborador@test.local):');
  console.log('  reposicion.html#inv=' + invRef.id + '        (abre directo — es suyo)');
  console.log('  reposicion.html#inv=' + invOtroRef.id + '        (debe rebotar — no es suyo)');
  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });
