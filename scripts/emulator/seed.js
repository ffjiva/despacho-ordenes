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

  // Despacho — happy path de picking en index.html (asignado al colaborador).
  const despRef = await db.collection('despachos').add({
    name: 'Despacho piloto emulator',
    origin: 'B01', destination: 'M01',
    assignedTo: collabUid, assignedToName: 'Colaborador Piloto',
    createdBy: superUid, createdByName: 'Fernando (test)',
    photos: [],
    products: [
      { id: 'p1', name: 'Mouse Inalámbrico', code: 'P001', qty: 2, family: 'Accesorios' },
      { id: 'p2', name: 'Teclado Mecánico',  code: 'P002', qty: 1, family: 'Accesorios' },
    ],
    checked: {},
    status: 'pending',
    lockedBy: null, lockedAt: null, archived: false, originalUrl: '',
    startedAt: null, completedAt: null, dispatchedAt: null, createdAt: Date.now(),
    activeMs: 0,
  });

  // Vueltas — happy path de cambio de estado. Dos vueltas separadas: una se completa desde
  // ops.html (supervisor) y la otra desde moto.html (motorista), para no pisarse entre checks.
  // Misma fórmula que getTodaySV() en ops.html/moto.html — el date-picker filtra por este
  // formato exacto (día en El Salvador, no el UTC del proceso que corre el seed).
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/El_Salvador' });
  const vueltaOpsRef = await db.collection('vueltas').add({
    date: today, order: 1,
    destination: 'S02 SAN SALVADOR', description: 'Vuelta piloto — completar desde ops.html',
    assignedTo: motoUid, assignedToName: 'Motorista Piloto',
    urgency: 'normal', linkedOrderIds: [], status: 'pending', paradero: '',
    createdBy: superUid, createdByName: 'Fernando (test)',
    createdAt: Date.now(), completedAt: null, photos: [],
  });
  const vueltaMotoRef = await db.collection('vueltas').add({
    date: today, order: 2,
    destination: 'M01 MERLIOT', description: 'Vuelta piloto — completar desde moto.html',
    assignedTo: motoUid, assignedToName: 'Motorista Piloto',
    urgency: 'normal', linkedOrderIds: [], status: 'pending', paradero: '',
    createdBy: superUid, createdByName: 'Fernando (test)',
    createdAt: Date.now(), completedAt: null, photos: [],
  });

  // Domicilios — happy path de las acciones con confirmación WhatsApp en moto.html.
  // Dos docs separados: uno se completa (Salir → ACABÉ), el otro se marca no-entregado
  // (Salir → No pude), para no pisarse entre checks.
  const domAcabeRef = await db.collection('domicilios').add({
    type: 'domicilio', date: today, cliente: 'Cliente Piloto Acabé',
    telefono: '70001111', total: 25.5, formaPago: 'Efectivo',
    direccion: 'Colonia Test #1, San Salvador', puntoReferencia: '',
    departamento: 'San Salvador', municipio: 'San Salvador', empresaEnvio: '',
    assignedTo: motoUid, assignedToName: 'Motorista Piloto',
    status: 'pendiente', motivoNoEntrega: '', fechaReagenda: '',
    prioritario: true, // regresión: la etiqueta de emergencia debe limpiarse al completar
    photos: [], gpsInicio: null, gpsFin: null,
    createdAt: Date.now(), completadoAt: null,
  });
  const domNoEntregaRef = await db.collection('domicilios').add({
    type: 'domicilio', date: today, cliente: 'Cliente Piloto No Entrega',
    telefono: '70002222', total: 40, formaPago: 'Tarjeta',
    direccion: 'Colonia Test #2, San Salvador', puntoReferencia: '',
    departamento: 'San Salvador', municipio: 'San Salvador', empresaEnvio: '',
    assignedTo: motoUid, assignedToName: 'Motorista Piloto',
    status: 'pendiente', motivoNoEntrega: '', fechaReagenda: '',
    photos: [], gpsInicio: null, gpsFin: null,
    createdAt: Date.now(), completadoAt: null,
  });

  // Pendiente — happy path del módulo Pendientes en ops.html (s-home).
  const pendRef = await db.collection('ops_pendientes').add({
    type: 'dist', subtype: null, urgency: 'normal',
    title: 'Pendiente piloto emulator', detail: '',
    done: false, doneAt: null, doneBy: null,
    createdBy: superUid, createdByName: 'Fernando (test)', createdAt: Date.now(),
  });

  console.log('\n✅ Seed listo en el emulator:');
  console.log('  super:       super@test.local / test1234');
  console.log('  colaborador: colaborador@test.local / test1234  →  conteo asignado:', invRef.id);
  console.log('  otro:        otro@test.local / test1234        →  conteo asignado:', invOtroRef.id);
  console.log('  motorista:   motorista@test.local / test1234    →  conteo asignado:', invMotoRef.id);
  console.log('  despacho piloto (colaborador):', despRef.id);
  console.log('  vuelta piloto ops.html:', vueltaOpsRef.id, '/ moto.html:', vueltaMotoRef.id);
  console.log('  domicilio piloto ACABÉ:', domAcabeRef.id, '/ No pude:', domNoEntregaRef.id);
  console.log('  pendiente piloto ops.html:', pendRef.id);
  console.log('\nProbá (logueado como colaborador@test.local):');
  console.log('  reposicion.html#inv=' + invRef.id + '        (abre directo — es suyo)');
  console.log('  reposicion.html#inv=' + invOtroRef.id + '        (debe rebotar — no es suyo)');
  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });
