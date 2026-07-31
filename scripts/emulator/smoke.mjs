// Smoke test end-to-end contra el Firebase Emulator Suite (Firestore + Auth) + Chromium headless.
// Levanta los emulators, siembra datos de prueba, sirve el repo estático y verifica con un
// navegador real el gate por rol de "Conteos asignables al colaborador" (reposicion.html) y
// el botón 📋 Conteos de index.html.
//
// Uso: npm run test:e2e
// Requiere: `npx playwright install chromium` ya corrido una vez (browsers en ~/.cache/ms-playwright).

import { spawn, execSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');
const PORT = 8791;
const FIRESTORE_PORT = 8080;
const AUTH_PORT = 9099;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
};

let failures = 0;
function check(label, cond) {
  if (cond) { console.log(`  ✅ ${label}`); }
  else { console.log(`  ❌ ${label}`); failures++; }
}

function waitForPort(port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    (function attempt() {
      const req = http.get({ host: 'localhost', port, timeout: 1500 }, res => { res.resume(); resolve(); });
      req.on('error', () => {
        if (Date.now() > deadline) reject(new Error(`Puerto ${port} no respondió a tiempo`));
        else setTimeout(attempt, 500);
      });
      req.on('timeout', () => { req.destroy(); if (Date.now() > deadline) reject(new Error(`Puerto ${port} no respondió a tiempo`)); else setTimeout(attempt, 500); });
    })();
  });
}

function startStaticServer() {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    const filePath = path.join(ROOT, urlPath === '/' ? '/index.html' : urlPath);
    if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise(resolve => server.listen(PORT, 'localhost', () => resolve(server)));
}

// Los 4 archivos cargan Firebase vía import() dinámico desde CDN antes de que el login
// funcione de verdad; sin esto el click puede llegar mientras auth/db todavía están sin
// inicializar y el login falla en silencio (no es problema de red, es timing del test).
// La propia app loguea "conectado al Firebase Emulator Suite" justo cuando auth/db quedan
// listos — se usa esa señal en vez de networkidle (Firestore mantiene listeners realtime
// abiertos, así que la red nunca queda "quieta").
async function gotoAndWaitReady(page, url) {
  const ready = page.waitForEvent('console', m => m.text().includes('conectado al Firebase Emulator Suite'), { timeout: 15000 });
  await page.goto(url);
  await ready;
}

async function login(page, { emailSel, pwSel, btnSel, email, password }) {
  await page.fill(emailSel, email);
  await page.fill(pwSel, password);
  await page.click(btnSel);
  // Espera a que onAuthStateChanged saque la pantalla de login.
  await page.waitForFunction(() => !document.getElementById('s-login')?.classList.contains('on'), null, { timeout: 15000 });
}

async function waitInvListLoaded(page) {
  await page.waitForFunction(
    () => !document.getElementById('inv-list')?.textContent.includes('Cargando'),
    null, { timeout: 10000 }
  );
}

// Variante para apps con gate por rol donde el login puede terminar en éxito (#s-home)
// o en rebote con mensaje de error (ops.html/moto.html bloquean roles no permitidos).
async function attemptLogin(page, { emailSel, pwSel, btnSel, email, password, homeSel, errSel }) {
  await page.fill(emailSel, email);
  await page.fill(pwSel, password);
  await page.click(btnSel);
  await page.waitForFunction(
    ([h, e]) => {
      const home = document.querySelector(h);
      const err  = document.querySelector(e);
      return (home && home.classList.contains('on')) || (err && err.style.display !== 'none' && err.textContent.trim().length > 0);
    },
    [homeSel, errSel],
    { timeout: 15000 }
  );
  return page.evaluate(([h, e]) => {
    const home = document.querySelector(h);
    const err  = document.querySelector(e);
    const blocked = !!(err && err.style.display !== 'none' && err.textContent.trim().length > 0);
    return { granted: !!(home && home.classList.contains('on')), blocked, errText: blocked ? err.textContent.trim() : null };
  }, [homeSel, errSel]);
}

// Login solo-super en reposicion.html: los no-super ya no pueden entrar tecleando en su
// propio formulario, solo con sesión ya iniciada en index.html. La sesión de Firebase Auth
// persiste en IndexedDB por origen (no por página), así que logueando en index.html y abriendo
// reposicion.html en el MISMO contexto de browser, debe reconocerla sin pasar por su formulario.
async function openReposicionViaSSO(browser, contexts, { email, password }) {
  const ctx = await browser.newContext();
  contexts.push(ctx);
  const indexPage = await ctx.newPage();
  indexPage.on('dialog', d => d.accept());
  await gotoAndWaitReady(indexPage, `http://localhost:${PORT}/index.html`);
  await login(indexPage, { emailSel: '#login-email', pwSel: '#login-pw', btnSel: '#btn-login', email, password });

  const repPage = await ctx.newPage();
  repPage.on('dialog', d => d.accept());
  await gotoAndWaitReady(repPage, `http://localhost:${PORT}/reposicion.html`);
  // Esperar a que onAuthStateChanged resuelva el perfil (fetch async a Firestore) antes de
  // devolver la página — si no, los checks corren mientras todavía muestra s-login por defecto.
  await repPage.waitForFunction(() => !document.getElementById('s-login')?.classList.contains('on'), null, { timeout: 15000 });
  return repPage;
}

async function main() {
  console.log('🚀 Levantando Firebase Emulator Suite (firestore + auth)...');
  const emu = spawn('firebase', ['emulators:start', '--only', 'firestore,auth'], { cwd: ROOT, stdio: 'ignore', detached: true });
  const cleanup = () => {
    try { process.kill(-emu.pid); } catch {}
    try { emu.kill(); } catch {}
    try { execSync('pkill -f "cloud-firestore-emulator" 2>/dev/null || true'); } catch {}
  };
  process.on('exit', cleanup);

  await waitForPort(FIRESTORE_PORT);
  await waitForPort(AUTH_PORT);
  console.log('✅ Emulators arriba.');

  console.log('🌱 Sembrando datos de prueba...');
  execSync('node scripts/emulator/seed.js', { cwd: ROOT, stdio: 'inherit' });

  console.log(`🌐 Sirviendo ${ROOT} en http://localhost:${PORT} ...`);
  const server = await startStaticServer();

  const browser = await chromium.launch();
  const contexts = [];
  // Contexto de browser nuevo por escenario: Firebase Auth persiste sesión en IndexedDB,
  // así que reusar la misma page entre logins de distintos usuarios arrastra la sesión anterior.
  async function newPage() {
    const ctx = await browser.newContext();
    contexts.push(ctx);
    const p = await ctx.newPage();
    p.on('dialog', d => d.accept());
    return p;
  }

  try {
    // ── 1. Colaborador en reposicion.html: vista reducida, solo su conteo (vía SSO) ──
    // Login solo-super bloquea el form de reposicion.html a no-super, así que colaborador
    // entra logueándose primero en index.html y abriendo reposicion.html en el mismo contexto.
    console.log('\n▶ reposicion.html — colaborador (vía SSO desde index.html)');
    let page = await openReposicionViaSSO(browser, contexts, { email: 'colaborador@test.local', password: 'test1234' });
    check('colaborador con sesión SSO no cae en el formulario de login', !(await page.isVisible('#s-login')));
    await waitInvListLoaded(page);
    check('body.inv-collab presente', await page.evaluate(() => document.body.classList.contains('inv-collab')));
    check('FAB nuevo conteo oculto', !(await page.isVisible('#inv-fab-new')));
    check('Historial oculto', !(await page.isVisible('#inv-btn-historial')));
    const cards = await page.locator('.inv-card').count();
    check(`lista muestra solo 1 conteo propio (encontrados: ${cards})`, cards === 1);
    check('no ve el conteo del otro colaborador', !(await page.locator('.inv-card', { hasText: 'Otro Colaborador' }).count()));

    // Abrir su propio conteo (click en la card)
    await page.click('.inv-card');
    await page.waitForFunction(() => document.getElementById('inv-det-title')?.textContent.trim().length > 0, null, { timeout: 8000 });
    const invTitle = (await page.textContent('#inv-det-title')).trim();
    check(`detalle propio abre (título: "${invTitle}")`, invTitle.length > 0);
    check('Reasignar oculto en detalle', !(await page.isVisible('#inv-btn-reasignar')));

    // ── 2. Motorista en reposicion.html: misma vista reducida (vía SSO) ──
    console.log('\n▶ reposicion.html — motorista (vía SSO desde index.html)');
    page = await openReposicionViaSSO(browser, contexts, { email: 'motorista@test.local', password: 'test1234' });
    check('motorista con sesión SSO no cae en el formulario de login', !(await page.isVisible('#s-login')));
    await waitInvListLoaded(page);
    check('body.inv-collab también para motorista', await page.evaluate(() => document.body.classList.contains('inv-collab')));
    check('motorista ve solo su conteo', await page.locator('.inv-card').count() === 1);

    // ── 3. Super: acceso total, sigue entrando por el formulario propio ──
    console.log('\n▶ reposicion.html — super');
    page = await newPage();
    await gotoAndWaitReady(page, `http://localhost:${PORT}/reposicion.html`);
    await login(page, { emailSel: '#rep-email', pwSel: '#rep-pw', btnSel: '#btn-rep-login', email: 'super@test.local', password: 'test1234' });
    check('super entra al home completo (sin inv-collab)', !(await page.evaluate(() => document.body.classList.contains('inv-collab'))));

    // ── 4. index.html: botón 📋 Conteos según rol ──
    console.log('\n▶ index.html — botón Conteos');
    page = await newPage();
    await gotoAndWaitReady(page, `http://localhost:${PORT}/index.html`);
    await login(page, { emailSel: '#login-email', pwSel: '#login-pw', btnSel: '#btn-login', email: 'colaborador@test.local', password: 'test1234' });
    await page.waitForSelector('#btn-conteos', { state: 'visible', timeout: 8000 }).catch(() => {});
    check('botón 📋 Conteos visible para colaborador', await page.isVisible('#btn-conteos'));

    page = await newPage();
    await gotoAndWaitReady(page, `http://localhost:${PORT}/index.html`);
    await login(page, { emailSel: '#login-email', pwSel: '#login-pw', btnSel: '#btn-login', email: 'super@test.local', password: 'test1234' });
    check('botón 📋 Conteos ausente para super', !(await page.isVisible('#btn-conteos')));

    // ── 5. ops.html: gate solo-super ──
    console.log('\n▶ ops.html — gate solo-super');
    page = await newPage();
    await gotoAndWaitReady(page, `http://localhost:${PORT}/ops.html`);
    let r = await attemptLogin(page, { emailSel: '#login-email', pwSel: '#login-pw', btnSel: '#btn-login', email: 'super@test.local', password: 'test1234', homeSel: '#s-home', errSel: '#login-err' });
    check('super entra a ops.html', r.granted);

    page = await newPage();
    await gotoAndWaitReady(page, `http://localhost:${PORT}/ops.html`);
    r = await attemptLogin(page, { emailSel: '#login-email', pwSel: '#login-pw', btnSel: '#btn-login', email: 'colaborador@test.local', password: 'test1234', homeSel: '#s-home', errSel: '#login-err' });
    check(`colaborador bloqueado en ops.html (msg: "${r.errText}")`, r.blocked && !r.granted);

    page = await newPage();
    await gotoAndWaitReady(page, `http://localhost:${PORT}/ops.html`);
    r = await attemptLogin(page, { emailSel: '#login-email', pwSel: '#login-pw', btnSel: '#btn-login', email: 'motorista@test.local', password: 'test1234', homeSel: '#s-home', errSel: '#login-err' });
    check(`motorista bloqueado en ops.html (msg: "${r.errText}")`, r.blocked && !r.granted);

    // ── 6. moto.html: gate motorista + super, bloqueo colaborador ──
    console.log('\n▶ moto.html — gate motorista/super');
    page = await newPage();
    await gotoAndWaitReady(page, `http://localhost:${PORT}/moto.html`);
    r = await attemptLogin(page, { emailSel: '#moto-email', pwSel: '#moto-pw', btnSel: '#btn-moto-login', email: 'motorista@test.local', password: 'test1234', homeSel: '#s-home', errSel: '#moto-login-err' });
    check('motorista entra a moto.html', r.granted);

    page = await newPage();
    await gotoAndWaitReady(page, `http://localhost:${PORT}/moto.html`);
    r = await attemptLogin(page, { emailSel: '#moto-email', pwSel: '#moto-pw', btnSel: '#btn-moto-login', email: 'super@test.local', password: 'test1234', homeSel: '#s-home', errSel: '#moto-login-err' });
    check('super también entra a moto.html', r.granted);

    page = await newPage();
    await gotoAndWaitReady(page, `http://localhost:${PORT}/moto.html`);
    r = await attemptLogin(page, { emailSel: '#moto-email', pwSel: '#moto-pw', btnSel: '#btn-moto-login', email: 'colaborador@test.local', password: 'test1234', homeSel: '#s-home', errSel: '#moto-login-err' });
    check(`colaborador bloqueado en moto.html (msg: "${r.errText}")`, r.blocked && !r.granted);

    // ── 7. reposicion.html: login solo-super — bloqueo por formulario ──
    console.log('\n▶ reposicion.html — login solo-super (formulario)');
    page = await newPage();
    await gotoAndWaitReady(page, `http://localhost:${PORT}/reposicion.html`);
    r = await attemptLogin(page, { emailSel: '#rep-email', pwSel: '#rep-pw', btnSel: '#btn-rep-login', email: 'colaborador@test.local', password: 'test1234', homeSel: '#s-home', errSel: '#rep-login-err' });
    check(`colaborador bloqueado por formulario en reposicion.html (msg: "${r.errText}")`, r.blocked && !r.granted);

    page = await newPage();
    await gotoAndWaitReady(page, `http://localhost:${PORT}/reposicion.html`);
    r = await attemptLogin(page, { emailSel: '#rep-email', pwSel: '#rep-pw', btnSel: '#btn-rep-login', email: 'motorista@test.local', password: 'test1234', homeSel: '#s-home', errSel: '#rep-login-err' });
    check(`motorista bloqueado por formulario en reposicion.html (msg: "${r.errText}")`, r.blocked && !r.granted);

    page = await newPage();
    await gotoAndWaitReady(page, `http://localhost:${PORT}/reposicion.html`);
    r = await attemptLogin(page, { emailSel: '#rep-email', pwSel: '#rep-pw', btnSel: '#btn-rep-login', email: 'super@test.local', password: 'test1234', homeSel: '#s-home', errSel: '#rep-login-err' });
    check('super sigue entrando por formulario en reposicion.html', r.granted && !r.blocked);

  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await browser.close();
    server.close();
    cleanup();
  }

  console.log(failures === 0 ? '\n✅ Smoke test OK — todo verde.' : `\n❌ Smoke test con ${failures} falla(s).`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
