const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.cert(serviceAccount)
});

const db = getFirestore();

async function publish() {
  const indexPath = path.join(__dirname, '..', '..', 'index.html');
  const html = fs.readFileSync(indexPath, 'utf8');
  const match = html.match(/const APP_VERSION\s*=\s*'([^']+)'/);
  if (!match) {
    console.error('❌ No se encontró APP_VERSION en index.html');
    process.exit(1);
  }
  const version = match[1];

  const motoPath = path.join(__dirname, '..', '..', 'moto.html');
  const motoHtml = fs.readFileSync(motoPath, 'utf8');
  const motoMatch = motoHtml.match(/const APP_VERSION\s*=\s*'([^']+)'/);
  if (!motoMatch) {
    console.error('❌ No se encontró APP_VERSION en moto.html');
    process.exit(1);
  }
  const motoVersion = motoMatch[1];

  await db.collection('config').doc('version').set({ latest: version, moto: motoVersion }, { merge: true });
  console.log(`✅ config/version.latest = '${version}'`);
  console.log(`✅ config/version.moto = '${motoVersion}'`);
}

publish().catch(err => {
  console.error('❌', err.message);
  process.exit(1);
});
