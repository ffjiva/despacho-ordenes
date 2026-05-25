/**
 * Migración /config/team: string[] → objeto[] con nuevo esquema
 * Uso: node migrate-team.js
 */
const { execSync } = require('child_process');
const https = require('https');

const PROJECT_ID = 'despacho-ordenes';
const DOC_PATH   = `projects/${PROJECT_ID}/databases/(default)/documents/config/team`;
const BASE_URL   = 'https://firestore.googleapis.com/v1';

function getToken() {
  return execSync('gcloud auth print-access-token --account ffjiva@gmail.com')
    .toString().trim();
}

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'firestore.googleapis.com',
      path: `/v1/${path}`,
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = https.request(options, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// Decode Firestore Value → JS primitive
function decodeValue(v) {
  if (v.stringValue  !== undefined) return v.stringValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.nullValue    !== undefined) return null;
  if (v.arrayValue)  return (v.arrayValue.values || []).map(decodeValue);
  if (v.mapValue)    return decodeMap(v.mapValue.fields || {});
  return null;
}
function decodeMap(fields) {
  const obj = {};
  for (const [k, v] of Object.entries(fields)) obj[k] = decodeValue(v);
  return obj;
}

// Encode JS value → Firestore Value
function encodeValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean')  return { booleanValue: v };
  if (typeof v === 'number')   return { integerValue: String(v) };
  if (typeof v === 'string')   return { stringValue: v };
  if (Array.isArray(v))        return { arrayValue: { values: v.map(encodeValue) } };
  if (typeof v === 'object')   return { mapValue: { fields: encodeMap(v) } };
  return { stringValue: String(v) };
}
function encodeMap(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) fields[k] = encodeValue(v);
  return fields;
}

async function migrate() {
  const token = getToken();

  // GET current document
  const get = await request('GET', DOC_PATH, null, token);
  if (get.status !== 200) {
    console.error('❌  GET falló:', get.status, JSON.stringify(get.body));
    process.exit(1);
  }

  const fields  = get.body.fields || {};
  const rawArr  = decodeValue(fields.members || { arrayValue: {} });
  console.log('\n📄  Datos actuales:');
  console.log(JSON.stringify(rawArr, null, 2));

  // Migrate
  let counter = 1;
  const members = rawArr.map(item => {
    const name = typeof item === 'string' ? item : item.name;

    if (name === 'Fernando') {
      return { id: 'u00', name: 'Fernando', pin: null, role: 'super', active: true, lastAccess: null };
    }

    const id = `u${String(counter).padStart(2, '0')}`;
    counter++;
    return { id, name, pin: '0000', role: 'bodeguero', active: true, lastAccess: null };
  });

  console.log('\n✅  Nuevo formato:');
  console.log(JSON.stringify(members, null, 2));

  // PATCH (update full document)
  const patchBody = {
    fields: encodeMap({ members }),
  };

  console.log('\n⏳  Escribiendo en Firestore...');
  const patch = await request('PATCH', DOC_PATH, patchBody, token);
  if (patch.status !== 200) {
    console.error('❌  PATCH falló:', patch.status, JSON.stringify(patch.body));
    process.exit(1);
  }
  console.log('✅  Migración completada.\n');
}

migrate().catch(e => { console.error('❌  Error:', e.message); process.exit(1); });
