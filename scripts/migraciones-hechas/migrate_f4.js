#!/usr/bin/env node
/* F4 — Limpieza de ops.html: elimina rep/inv/traz ya migrados a reposicion.html.
   - Borra los 5 bloques de módulo (globals, CSS, JS, HTML).
   - Elimina los DOS botones de Inventario (topbar + drawer).
   - Convierte el botón Reposición en navegación a reposicion.html (único acceso).
   Hace BACKUP (ops.html.bak). Requiere F1+F2+F3 en reposicion.html. Idempotente. */
const fs = require('fs');
const OPS = 'ops.html', REP = 'reposicion.html';
const die = m => { console.error('❌ ' + m); process.exit(1); };

const ops = fs.readFileSync(OPS, 'utf8').split('\n');
const rep = fs.existsSync(REP) ? fs.readFileSync(REP, 'utf8') : '';

if (!(rep.includes('window.analyzeWithAI') && rep.includes('window.renderTrazabilidad') && rep.includes('window.openInvModal')))
  die('reposicion.html no tiene los 3 módulos (F1+F2+F3 completos). Aborto F4.');
if (!ops.some(l => l.includes('const REP_SNAMES = {')))
  die('ops.html ya parece limpio (F4 ya aplicada). Aborto.');

const find = (needle, start = 0, label = '') => {
  for (let i = start; i < ops.length; i++) if (ops[i].includes(needle)) return i;
  die(`ANCLA NO ENCONTRADA [${label || needle}]`);
};

// R1: globals inventario
const r1s = find('let invUnsub = null;', 0, 'inv-glob-s');
const r1e = find('let currentInvId = null;', r1s, 'inv-glob-e');
// R2: globals reposición
const r2s = find('let repProductMap  = new Map();', 0, 'rep-glob-s');
const r2e = find('let repDisplayLimit   = 300;', r2s, 'rep-glob-e');
// R3: CSS módulos
let r3s = find('MÓDULO 6C — REPOSICIÓN', 0, 'css-s');
while (!ops[r3s].includes('/*')) r3s--;
const r3e = find('</style>', r3s, 'css-e') - 1;
// R4: JS módulos
let r4s = find('MÓDULO 6C — GENERADOR DE ÓRDENES DE REPOSICIÓN', 0, 'js-s');
while (!ops[r4s].includes('/*')) r4s--;
const dom = find("document.addEventListener('DOMContentLoaded', init);", r4s, 'js-e');
let r4e = dom - 1;
const trail = l => l.trim() === '' || l.includes('═') || l.trim() === 'START' || l.trimStart().startsWith('/*') || l.trimStart().startsWith('*/');
while (trail(ops[r4e])) r4e--;
// R5: HTML pantallas (+ comentario de sección previo)
let r5s = find('<div id="s-reposicion" class="scr">', 0, 'html-s');
let pPrev = r5s - 1;
while (pPrev >= 0 && ops[pPrev].trim() === '') pPrev--;
if (pPrev >= 0 && ops[pPrev].includes('<!--') && ops[pPrev].includes('REPOSICIÓN')) r5s = pPrev;
let r5e = find('</body>', r5s, 'html-e') - 1;
while (ops[r5e].trim() === '') r5e--;
// R6: botón Inventario en drawer móvil (multilínea) — ELIMINAR
const r6s = find('closeMobDrawer();goInventario()', 0, 'drawer-inv-s');
let r6e = r6s;
while (!ops[r6e].includes('</button>')) r6e++;
// R7: botón Inventario en topbar (1 línea) — ELIMINAR
const r7s = find('id="btn-inventario"', 0, 'topbar-inv');
const r7e = r7s;

const ranges = [[r1s, r1e], [r2s, r2e], [r3s, r3e], [r4s, r4e], [r5s, r5e], [r6s, r6e], [r7s, r7e]];
ranges.sort((a, b) => a[0] - b[0]);
for (let i = 1; i < ranges.length; i++) if (ranges[i][0] <= ranges[i - 1][1]) die('Rangos solapados — abortar por seguridad.');

const del = i => ranges.some(([a, b]) => a <= i && i <= b);
let out = ops.filter((_, i) => !del(i));

// Convertir SOLO el botón Reposición (único acceso a reposicion.html)
let swaps = 0;
out = out.map(l => {
  const o = l;
  if (l.includes('id="btn-reposicion"'))
    l = l.replace('onclick="goReposicion()"', "onclick=\"window.location.href='reposicion.html'\"");
  if (l !== o) swaps++;
  return l;
});

fs.writeFileSync(OPS + '.bak', ops.join('\n'), 'utf8');
fs.writeFileSync(OPS, out.join('\n'), 'utf8');

const res = out.join('\n');
const linesDeleted = ranges.reduce((s, [a, b]) => s + (b - a + 1), 0);
console.log('✅ F4 aplicada a ops.html (backup en ops.html.bak)');
console.log(`   Líneas borradas: ${linesDeleted}  | botón Reposición convertido: ${swaps}/1`);
console.log(`   Rangos (1-indexed): ` + ranges.map(([a, b]) => `${a + 1}-${b + 1}`).join(', '));
const checks = [
  ['goReposicion()', 0], ['goInventario', 0], ['id="btn-inventario"', 0], ['analyzeWithAI', 0],
  ['renderTrazabilidad', 0], ['openInvModal', 0], ['const REP_SNAMES', 0], ['.rep-dropzone', 0],
  ['.traz-card', 0], ['.inv-fab', 0], ['s-reposicion', 0], ['s-inventario', 0], ['s-trazabilidad', 0],
  ['id="btn-reposicion"', 1], ["window.location.href='reposicion.html'", 1]
];
console.log('   Verificación:');
checks.forEach(([d, exp]) => {
  const n = (res.match(new RegExp(d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
  console.log(`     ${n === exp ? 'OK ' : '⚠️ '} [${n}, esperado ${exp}] ${d}`);
});
console.log('   init() intacto:', res.includes("document.addEventListener('DOMContentLoaded', init);"));
console.log('   XLSX script intacto:', res.includes('xlsx.full.min.js'));
