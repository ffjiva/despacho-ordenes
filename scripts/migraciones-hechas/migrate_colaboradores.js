// migrate_colaboradores.js
// Migración única: lee Colaboradores.xlsx y siembra `colaboradores` en Firestore.
// Uso: node migrate_colaboradores.js   (o --force para reimportar)

const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const XLSX  = require('xlsx');
const path  = require('path');

const XLSX_PATH = path.join(__dirname, 'Colaboradores.xlsx');
const FORCE = process.argv.includes('--force');

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

const SHEET_TO_SUCURSAL = {
  'Zona Digital Matrix':       'M01',
  'Zona Digital San Salvador': 'S02',
  'Zoditech':                  'S06',
  'Zona Digital Soyapango':    'S04',
  'Zona Digital San Miguel':   'S03',
  'Zona Digital Usulutan':     'S07',
  'ZD Corporativo':            'CORP',
};

function num(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  if (s === '' || s === '-') return 0;
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? 0 : n;
}
function str(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}
function ts(v) {
  if (!v) return null;
  if (v instanceof Date) return v.getTime();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}
function isRowEmpty(row) {
  return Object.values(row).every(v => v == null || String(v).trim() === '');
}

function mapRow(row, sucursal) {
  return {
    nombre:              str(row['Colaborador']),
    dui:                 str(row['DUI']),
    telefono:            str(row['Telefono']),
    correo:              str(row['Correo'])?.toLowerCase() ?? null,
    sucursal,
    cargo:               str(row['Cargo']),
    alias:               str(row['Alias ZD']),
    preferenciaNombre:   str(row['Preferencia Nombre']),
    fechaIngreso:        ts(row['Ingreso a empresa']),
    fechaSalida:         null,
    cumpleanos:          ts(row['Cumpleaños']),
    valoracion:          str(row['Valoracion']),
    codigoUsuario:       str(row['Codigo Usuario']),
    nombreUsuario:       str(row['Nombre Usuario']),
    direccion:           str(row['Dirección Actual de Residencia']),
    municipio:           str(row['Municipio de Residencia']),
    departamento:        str(row['Departamento de Residencia']),
    numDependientes:     num(row['Número de Dependientes']),
    dependientesDetalle: str(row['Nombre de Dependientes y parentesco']),
    contactoEmergencia1: str(row['Contacto de Emergencia 1 (Nombre y Teléfono)']),
    contactoEmergencia2: str(row['Contacto de Emergencia 2 (Nombre y Teléfono)']),
    fotoUrl:             null,
    active:              true,
    linkedUid:           null,
    createdAt:           Date.now(),
    updatedAt:           Date.now(),
  };
}

async function commitInChunks(docs) {
  const CHUNK = 499;
  let written = 0;
  for (let i = 0; i < docs.length; i += CHUNK) {
    const batch = db.batch();
    const slice = docs.slice(i, i + CHUNK);
    for (const d of slice) {
      const ref = db.collection('colaboradores').doc();
      batch.set(ref, d);
      d.__id = ref.id;
    }
    await batch.commit();
    written += slice.length;
  }
  return written;
}

async function main() {
  console.log(`Leyendo ${XLSX_PATH} …`);
  const wb = XLSX.readFile(XLSX_PATH, { cellDates: true });

  const existing = await db.collection('colaboradores').limit(1).get();
  if (!existing.empty && !FORCE) {
    console.error('⛔ La colección "colaboradores" ya tiene documentos. Usa --force para reimportar (puede duplicar).');
    process.exit(1);
  }

  const docs = [];
  const skippedSheets = [];
  for (const sheetName of wb.SheetNames) {
    const sucursal = SHEET_TO_SUCURSAL[sheetName];
    if (!sucursal) { skippedSheets.push(sheetName); continue; }
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: null });
    for (const row of rows) {
      if (isRowEmpty(row)) continue;
      docs.push(mapRow(row, sucursal));
    }
  }
  if (skippedSheets.length) console.warn('⚠ Hojas ignoradas:', skippedSheets.join(', '));
  console.log(`${docs.length} colaboradores a importar.`);

  const count = await commitInChunks(docs);
  const incompletos = docs.filter(d => !d.nombre || !d.dui || !d.telefono);
  console.log(`✅ ${count} colaboradores importados.`);
  console.log(`\n⚠ ${incompletos.length} registros incompletos — completar desde la UI de Colaboradores:`);
  incompletos.forEach(d => console.log(`  - ${d.__id} — ${d.nombre || d.alias || d.nombreUsuario || '(sin nombre)'} [${d.sucursal}]`));
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
