#!/usr/bin/env node
/* F2 — Migra Trazabilidad (módulo 7) de ops.html a reposicion.html.
   Determinista, por anclas. NO toca ops.html. Requiere F1 aplicada. Idempotente. */
const fs = require('fs');
const OPS = 'ops.html', REP = 'reposicion.html';
const ops = fs.readFileSync(OPS, 'utf8').split('\n');
let   rep = fs.readFileSync(REP, 'utf8').split('\n');

const die = m => { console.error('❌ ' + m); process.exit(1); };
const find = (lines, needle, start = 0, label = '') => {
  for (let i = start; i < lines.length; i++) if (lines[i].includes(needle)) return i;
  die(`ANCLA NO ENCONTRADA [${label || needle}]`);
};

if (!rep.some(l => l.includes('window.analyzeWithAI'))) die('Falta F1 (bloque rep). Aplicá F1 antes que F2.');
if (rep.some(l => l.includes('window.renderTrazabilidad'))) die('reposicion.html ya tiene Trazabilidad (F2 ya aplicada). Aborto.');

// 1) CSS: .empty-state (línea suelta) + bloque .traz-*
const eIdx = find(ops, '.empty-state {', 0, 'empty-state');
const emptyState = ops[eIdx];
const t0 = find(ops, '.traz-card {', 0, 'traz-css-start');
const t1 = find(ops, '.inv-fab {', t0, 'traz-css-end');
let trazCss = ops.slice(t0, t1);
while (trazCss.length && trazCss[trazCss.length - 1].trim() === '') trazCss.pop();

// 2) HTML s-trazabilidad
const h0 = find(ops, '<div id="s-trazabilidad" class="scr">', 0, 'html-start');
const h1 = find(ops, '<div id="s-inventario"', h0, 'html-end');
let html = ops.slice(h0, h1);
while (html.length && (html[html.length - 1].trim() === '' || html[html.length - 1].includes('MÓDULO 8b'))) html.pop();

// 3) JS traz (goTrazabilidad … toggleTrazDetail, incluye `let trazRecords`)
const a = find(ops, 'window.goTrazabilidad = () => {', 0, 'js-start');
const e = find(ops, 'window.toggleTrazDetail = (id) => {', a, 'js-end-anchor');
let end = e;
while (end < ops.length && ops[end].trim() !== '};') end++;
end++; // incluir el '};'
const js = ops.slice(a, end);

// 4) Inyectar
let i = find(rep, '</style>', 0, 'css-inject');
rep = [...rep.slice(0, i), '', '/* ═══ TRAZABILIDAD (migrado F2) ═══ */', emptyState, ...trazCss, ...rep.slice(i)];

let s = find(rep, '<div id="s-trazabilidad" class="scr">', 0, 'shell-s');
let se = find(rep, '<div id="s-inventario"', s + 1, 'shell-e');
while (se - 1 > s && rep[se - 1].trim() === '') se--;
rep = [...rep.slice(0, s), ...html, '', ...rep.slice(se)];

rep = rep.filter(l => l.trim() !== "window.goTrazabilidad = () => showScreen('s-trazabilidad');");

let initIdx = -1;
for (let k = rep.length - 1; k >= 0; k--) if (rep[k].trim() === 'init();') { initIdx = k; break; }
if (initIdx < 0) die('No se encontró init();');
const block = ['', '/* ═══════════════════════════════════',
  '   TRAZABILIDAD (migrado F2)',
  '═══════════════════════════════════ */', ...js, ''];
rep = [...rep.slice(0, initIdx), ...block, ...rep.slice(initIdx)];

fs.writeFileSync(REP, rep.join('\n'), 'utf8');

const res = rep.join('\n');
const cnt = s => (res.match(new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
console.log('✅ F2 aplicada a reposicion.html');
console.log(`   CSS:${trazCss.length + 1}  HTML:${html.length}  JS:${js.length} líneas`);
[['async function loadTrazabilidad', 1], ['window.renderTrazabilidad', 1], ['window.toggleTrazDetail', 1],
 ['let trazRecords', 1], ['.traz-card {', 1], ['.empty-state {', 1], ['id="traz-list"', 1]
].forEach(([k, exp]) => { const n = cnt(k); console.log(`   ${n === exp ? 'OK ' : 'FALLO'} [${n}] ${k}`); });
console.log('   goTrazabilidad real (1):', cnt('window.goTrazabilidad = () => {'));
console.log('   placeholder F2 eliminado:', !res.includes('se migra en <b>F2</b>'));
