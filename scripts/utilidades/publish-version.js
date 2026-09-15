const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.cert(serviceAccount)
});

const db = getFirestore();

// Cada app publica su propio campo en config/version, siempre con merge — nunca se
// toca el campo de otra app. index.html → 'latest' (comportamiento por defecto,
// sin --app); moto.html → 'moto' (node publish-version.js --app moto).
const APPS = {
  index: { file: 'index.html', field: 'latest' },
  moto:  { file: 'moto.html',  field: 'moto' },
};

function parseApp(argv) {
  const idx = argv.indexOf('--app');
  if (idx === -1) return 'index';
  const val = argv[idx + 1];
  if (!val || !APPS[val]) {
    console.error(`❌ Argumento --app inválido: '${val || ''}'. Valores válidos: ${Object.keys(APPS).join(', ')}`);
    process.exit(1);
  }
  return val;
}

async function publish() {
  const appName = parseApp(process.argv.slice(2));
  const { file, field } = APPS[appName];

  const filePath = path.join(__dirname, '..', '..', file);
  const html = fs.readFileSync(filePath, 'utf8');
  const match = html.match(/const APP_VERSION\s*=\s*'([^']+)'/);
  if (!match) {
    console.error(`❌ No se encontró APP_VERSION en ${file}`);
    process.exit(1);
  }
  const version = match[1];

  await db.collection('config').doc('version').set({ [field]: version }, { merge: true });
  console.log(`✅ config/version.${field} = '${version}'`);
}

publish().catch(err => {
  console.error('❌', err.message);
  process.exit(1);
});
