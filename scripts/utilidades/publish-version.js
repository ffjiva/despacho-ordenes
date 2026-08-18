const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function publish() {
  const indexPath = path.join(__dirname, '..', '..', 'index.html');
  const html = fs.readFileSync(indexPath, 'utf8');
  const match = html.match(/const APP_VERSION = '([^']+)'/);
  if (!match) {
    console.error('❌ No se encontró APP_VERSION en index.html');
    process.exit(1);
  }
  const version = match[1];

  await db.collection('config').doc('version').set({ latest: version }, { merge: true });
  console.log(`✅ config/version.latest = '${version}'`);
}

publish().catch(err => {
  console.error('❌', err.message);
  process.exit(1);
});
