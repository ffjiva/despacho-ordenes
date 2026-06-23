#!/usr/bin/env node
/* F3 — Migra Inventario (módulo 8b) de ops.html a reposicion.html.
   Determinista, por anclas. NO toca ops.html. Requiere F1. Idempotente. */
const fs = require('fs');
const OPS = 'ops.html', REP = 'reposicion.html';
const ops = fs.readFileSync(OPS, 'utf8').split('\n');
let   rep = fs.readFileSync(REP, 'utf8').split('\n');

const die = m => { console.error('❌ ' + m); process.exit(1); };
const find = (lines, needle, start = 0, label = '') => {
  for (let i = start; i < lines.length; i++) if (lines[i].includes(needle)) return i;
  die(`ANCLA NO ENCONTRADA [${label || needle}]`);
};

if (!rep.some(l => l.includes('window.analyzeWithAI'))) die('Falta F1 (bloque rep). Aplicá F1 antes que F3.');
if (rep.some(l => l.includes('window.openInvModal'))) die('reposicion.html ya tiene Inventario (F3 ya aplicada). Aborto.');

// 1) CSS inv: comentario "MÓDULO 8b" … antes de </style> (incluye @keyframes)
const c0 = find(ops, '/* ── MÓDULO 8b — INVENTARIO ── */', 0, 'css-start');
const c1 = find(ops, '</style>', c0, 'css-end');
let css = ops.slice(c0, c1);
while (css.length && css[css.length - 1].trim() === '') css.pop();

// 2) HTML inv: s-inventario … antes de </body> (3 pantallas + 2 modales)
const h0 = find(ops, '<div id="s-inventario" class="scr">', 0, 'html-start');
const h1 = find(ops, '</body>', h0, 'html-end');
let html = ops.slice(h0, h1);
while (html.length && html[html.length - 1].trim() === '') html.pop();

// 3) Globals inv (1402-1404)
const g0 = find(ops, 'let invUnsub = null;', 0, 'globals-start');
const g1 = find(ops, 'let currentInvId = null;', g0, 'globals-end');
const globals = ops.slice(g0, g1 + 1);

// 4) JS inv: goInventario … fin de exportInvXLS (antes de goReposicion)
const a = find(ops, 'window.goInventario = () => {', 0, 'js-start');
const b = find(ops, 'window.goReposicion = () => {', a, 'js-end');
let js = ops.slice(a, b);
while (js.length && js[js.length - 1].trim() === '') js.pop();

// ── Inyección ──
// 4a) CSS antes de </style>
let i = find(rep, '</style>', 0, 'css-inject');
rep = [...rep.slice(0, i), '', '/* ═══ INVENTARIO 8b (migrado F3) ═══ */', ...css, ...rep.slice(i)];

// 4b) Reemplazar las 3 shells inv por el bloque real (preservando el <script> SheetJS)
let s = find(rep, '<div id="s-inventario" class="scr">', 0, 'shell-s');
let scriptIdx = find(rep, 'xlsx.full.min.js', s, 'sheetjs');
let e = scriptIdx;
while (e - 1 > s && (rep[e - 1].trim() === '' || rep[e - 1].includes('SheetJS'))) e--;
rep = [...rep.slice(0, s), ...html, '', ...rep.slice(e)];

// 4c) Globals inv tras `let currentUser = null;`
i = find(rep, 'let currentUser = null;', 0, 'globals-anchor');
rep = [...rep.slice(0, i + 1), '', '/* ── Estado Inventario (migrado F3) ── */', ...globals, ...rep.slice(i + 1)];

// 4d) Quitar el stub F0 de goInventario
const stubRe = /^window\.goInventario\s*=\s*\(\)\s*=>\s*showScreen\('s-inventario'\);$/;
rep = rep.filter(l => !stubRe.test(l.trim()));

// 4e) Funciones inv antes del init(); final
let initIdx = -1;
for (let k = rep.length - 1; k >= 0; k--) if (rep[k].trim() === 'init();') { initIdx = k; break; }
if (initIdx < 0) die('No se encontró init();');
const block = ['', '/* ═══════════════════════════════════',
  '   INVENTARIO 8b (migrado F3)',
  '═══════════════════════════════════ */', ...js, ''];
rep = [...rep.slice(0, initIdx), ...block, ...rep.slice(initIdx)];

fs.writeFileSync(REP, rep.join('\n'), 'utf8');

// ── Verificación ──
const res = rep.join('\n');
const cnt = x => (res.match(new RegExp(x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
console.log('✅ F3 aplicada a reposicion.html');
console.log(`   CSS:${css.length}  HTML:${html.length}  globals:${globals.length}  JS:${js.length} líneas`);
[['async function initInvScreen', 1], ['window.openInvModal', 1], ['window.crearConteoInv', 1],
 ['window.finalizarConteo', 1], ['function drawInvPixelArt', 1], ['window.exportInvXLS', 1],
 ['let invUnsub', 1], ['let currentInvId', 1],
 ['id="inv-modal"', 1], ['id="inv-cel-overlay"', 1], ['.inv-fab {', 1], ['@keyframes inv-confetti-fall', 1]
].forEach(([k, exp]) => { const n = cnt(k); console.log(`   ${n === exp ? 'OK ' : 'FALLO'} [${n}] ${k}`); });
console.log('   goInventario real (1):', cnt('window.goInventario = () => {'));
console.log('   placeholder F3 eliminado:', !res.includes('se migra en <b>F3</b>'));
console.log('   <body>:', cnt('<body>'), '</body>:', cnt('</body>'), 'pantallas .scr:', (res.match(/<div id="s-[\w-]+" class="scr/g) || []).length);
