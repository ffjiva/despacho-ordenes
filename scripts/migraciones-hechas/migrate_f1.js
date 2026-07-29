#!/usr/bin/env node
/* F1 — Migra el módulo Reposición (stock+compra+redist) de ops.html a reposicion.html.
   Determinista, por anclas de texto. NO toca ops.html. Aborta si ya fue aplicada. */
const fs = require('fs');
const OPS = 'ops.html', REP = 'reposicion.html';

const ops = fs.readFileSync(OPS, 'utf8').split('\n');
let   rep = fs.readFileSync(REP, 'utf8').split('\n');

const die = m => { console.error('❌ ' + m); process.exit(1); };
const find = (lines, needle, start = 0, label = '') => {
  for (let i = start; i < lines.length; i++) if (lines[i].includes(needle)) return i;
  die(`ANCLA NO ENCONTRADA [${label || needle}]`);
};

// Guard de idempotencia
if (rep.some(l => l.includes('window.analyzeWithAI')))
  die('reposicion.html ya contiene el bloque rep (F1 ya aplicada). Aborto.');

// 1) CSS rep: header "MÓDULO 6C" (subir al /* de apertura) … antes de .traz-card
let c0 = find(ops, 'MÓDULO 6C — REPOSICIÓN', 0, 'css-start') - 1;
while (!ops[c0].trimStart().startsWith('/*')) c0--;
const c1 = find(ops, '.traz-card {', c0, 'css-end');
const css = ops.slice(c0, c1);

// 2) Pantalla HTML s-reposicion
const h0 = find(ops, '<div id="s-reposicion" class="scr">', 0, 'html-start');
const h1 = find(ops, '<div id="s-trazabilidad"', h0, 'html-end');
let html = ops.slice(h0, h1);
while (html.length && html[html.length - 1].trim() === '') html.pop();

// 3) JS rep (4 tramos)
let a = find(ops, 'let repProductMap  = new Map();', 0, 'js1');
let b = find(ops, 'let repDisplayLimit   = 300;', a, 'js1-end');
const js1 = ops.slice(a, b + 1);

a = find(ops, 'const REP_SNAMES = {', 0, 'js2');
b = find(ops, 'window.goInventario = () => {', a, 'js2-end');
const js2 = ops.slice(a, b);

a = find(ops, 'window.goReposicion = () => {', 0, 'js3');
b = find(ops, "window.goBackFromReposicion = () => { showScreen('s-home'); };", a, 'js3-end');
const js3 = ops.slice(a, b + 1);

a = find(ops, 'window.clearRepSession = () => {', 0, 'js4');
const dom = find(ops, "document.addEventListener('DOMContentLoaded', init);", a, 'js4-end');
let end = dom;
const trail = l => l.trim() === '' || l.includes('═') || l.trim() === 'START' || l.trimStart().startsWith('/*') || l.trimStart().startsWith('*/');
while (trail(ops[end - 1])) end--;
const js4 = ops.slice(a, end);

// 4) Inyectar en reposicion.html
// 4a) CSS antes de </style>
let i = find(rep, '</style>', 0, 'css-inject');
rep = [...rep.slice(0, i), '', '/* ═══ MÓDULO REPOSICIÓN (migrado F1) ═══ */', ...css, ...rep.slice(i)];

// 4b) Reemplazar shell s-reposicion por la pantalla real
let s = find(rep, '<div id="s-reposicion" class="scr">', 0, 'shell-s');
let e = find(rep, '<div id="s-trazabilidad"', s + 1, 'shell-e');
while (e - 1 > s && rep[e - 1].trim() === '') e--;
rep = [...rep.slice(0, s), ...html, '', ...rep.slice(e)];

// 4c) Globals rep tras `let currentUser = null;`
i = find(rep, 'let currentUser = null;', 0, 'globals-anchor');
rep = [...rep.slice(0, i + 1), '', '/* ── Estado Reposición (migrado F1) ── */', ...js1, ...rep.slice(i + 1)];

// 4d) Quitar el stub F0 de goReposicion
rep = rep.filter(l => l.trim() !== "window.goReposicion   = () => showScreen('s-reposicion');");

// 4e) Funciones rep antes del init(); final (última ocurrencia exacta)
let initIdx = -1;
for (let k = rep.length - 1; k >= 0; k--) if (rep[k].trim() === 'init();') { initIdx = k; break; }
if (initIdx < 0) die('No se encontró init();');
const block = ['', '/* ═══════════════════════════════════',
  '   MÓDULO REPOSICIÓN (migrado F1)',
  '═══════════════════════════════════ */', ...js2, '', ...js3, '', ...js4, ''];
rep = [...rep.slice(0, initIdx), ...block, ...rep.slice(initIdx)];

fs.writeFileSync(REP, rep.join('\n'), 'utf8');

// 5) Verificación
const res = rep.join('\n');
const cnt = s => (res.match(new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
console.log('✅ F1 aplicada a reposicion.html');
console.log(`   CSS:${css.length}  HTML:${html.length}  JS:${js1.length + js2.length + js3.length + js4.length} líneas`);
[['window.analyzeWithAI', 1], ['function computeRepSuggestions', 1], ['function repAllocate', 1],
 ['window.generateActiveRepXLS', 1], ['function parseCompraXLS', 1], ['function renderRedistTable', 1],
 ['const REP_KNOWN_BRANDS', 1], ['class="rep-table-wrap"', 1]
].forEach(([k, exp]) => { const n = cnt(k); console.log(`   ${n === exp ? 'OK ' : 'FALLO'} [${n}] ${k}`); });
console.log('   goReposicion real (1 esperado):', cnt('window.goReposicion = () => {'));
console.log('   placeholder F1 eliminado:', !res.includes('se migra en <b>F1</b>'));
