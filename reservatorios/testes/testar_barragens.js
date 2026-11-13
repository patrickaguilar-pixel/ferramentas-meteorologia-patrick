// Testes do núcleo da aba Barragens e municípios (node reservatorios/testes/testar_barragens.js)
'use strict';
const assert = require('assert');
const N = require('../barragens-nucleo.js');
let n = 0; const t = (nome, f) => { f(); n++; console.log('ok', nome); };

t('escalas', () => {
  const b = N.ESCALAS.boletim;
  assert.strictEqual(b.rotulos.length, 15); assert.strictEqual(b.rotulos[0], '0 - 5'); assert.strictEqual(b.rotulos[14], '> 250');
  assert.strictEqual(N.classe(5, b.lim), 0); assert.strictEqual(N.classe(5.01, b.lim), 1); assert.strictEqual(N.classe(250, b.lim), 13); assert.strictEqual(N.classe(251, b.lim), 14);
});
t('faixa do texto', () => {
  assert.strictEqual(N.faixa(42, 58), '40 - 60 mm');
  assert.strictEqual(N.faixa(100, 150), '100 - 150 mm');
  assert.strictEqual(N.faixa(103, 141), '100 - 150 mm');
  assert.strictEqual(N.faixa(60, 60), '60 - 80 mm');
  assert.strictEqual(N.faixa(0, 0.2), 'sem chuva significativa');
  assert.strictEqual(N.faixa(0, 3), '0 - 5 mm');
  assert.strictEqual(N.faixa(450, 520), 'acima de 500 mm');
});
// grade sintética: chuva = 10*(lon+52.5) + (lat+24) (plana, a bilinear tem que reproduzir exatamente)
const lat = [], lon = [];
for (let v = -13; v >= -24.0001; v -= 0.25) lat.push(+v.toFixed(2));
for (let v = -52.5; v <= -38.9999; v += 0.25) lon.push(+v.toFixed(2));
const plano = (a, b) => lat.map(la => lon.map(lo => +(a * (lo + 52.5) + b * (la + 24)).toFixed(4)));
const J = { versao: 1, ciclo: '00', data_ciclo: '2025-01-28', grade: { lat, lon }, produtos: {} };
const d = [plano(1, 1), plano(2, 0), plano(0.5, 2), plano(1, 0.5)];
['dia1', 'dia2', 'dia3', 'dia4'].forEach((k, i) => J.produtos[k] = { mm: d[i] });
const soma = ks => lat.map((_, y) => lon.map((_, x) => ks.reduce((s, k) => s + J.produtos[k].mm[y][x], 0)));
J.produtos.day3 = { mm: soma(['dia1', 'dia2', 'dia3']) }; J.produtos.day4 = { mm: soma(['dia1', 'dia2', 'dia3', 'dia4']) };
t('validar aceita o arquivo certo', () => N.validar(J));
t('validar recusa soma que não bate', () => {
  const K = JSON.parse(JSON.stringify(J)); K.produtos.day4.mm[10][10] += 2;
  assert.throws(() => N.validar(K), /soma dos dias/);
});
t('validar avisa quando faltam os produtos novos', () => {
  const K = JSON.parse(JSON.stringify(J)); delete K.produtos.dia4;
  try { N.validar(K); assert.fail(); } catch (e) { assert.ok(e.faltamProdutos); }
});
t('bilinear reproduz um plano', () => {
  const v = N.bilinear(J.grade, J.produtos.dia1.mm, -43.87, -20.41);
  assert.ok(Math.abs(v - ((-43.87 + 52.5) + (-20.41 + 24))) < 1e-9, v);
});
t('célula do GFS (bloco)', () => {
  const v = N.celula(J.grade, J.produtos.dia2.mm, -43.87, -20.41);   // centro mais próximo: -43.75 / -20.5
  assert.ok(Math.abs(v - 2 * (-43.75 + 52.5)) < 1e-9, v);
});
t('município: média de um quadrado = valor no centro (campo plano)', () => {
  const f = { properties: { label_lon: -44, label_lat: -20 }, geometry: { type: 'Polygon', coordinates: [[[-44.2, -20.2], [-43.8, -20.2], [-43.8, -19.8], [-44.2, -19.8], [-44.2, -20.2]]] } };
  const e = N.estatMunicipio(J, f, ['dia1', 'day4'], 'suave');
  assert.ok(Math.abs(e.dia1.media - ((-44 + 52.5) + (-20 + 24))) < 0.02, e.dia1.media);
  assert.ok(e.dia1.n > 1500 && e.dia1.min < e.dia1.media && e.dia1.max > e.dia1.media);
});
t('janelas dos dias (00Z e 06Z)', () => {
  const w = N.janelas(J, 96);
  assert.deepStrictEqual(w.map(x => x.rotulo), ['28/01/2025', '29/01/2025', '30/01/2025', '31/01/2025']);
  assert.strictEqual(w[0].local, '21h de 27/01/2025 a 21h de 28/01/2025 (hora local)');
  const w6 = N.janelas(Object.assign({}, J, { ciclo: '06' }), 72);
  assert.strictEqual(w6.length, 3); assert.strictEqual(w6[0].local, '03h de 28/01/2025 a 03h de 29/01/2025 (hora local)');
});
t('gatilho: 100 mm/dia, 100 mm em 72 h, raio', () => {
  const K = JSON.parse(JSON.stringify(J));
  const fill = (v) => lat.map(() => lon.map(() => v));
  K.produtos.dia1 = { mm: fill(30) }; K.produtos.dia2 = { mm: fill(40) }; K.produtos.dia3 = { mm: fill(29) }; K.produtos.dia4 = { mm: fill(5) };
  let g = N.gatilho(K, -44, -20, 0);
  assert.strictEqual(g.dispara, false); assert.ok(Math.abs(g.max72.mm - 99) < 1e-9);
  K.produtos.dia3 = { mm: fill(30) };
  g = N.gatilho(K, -44, -20, 0); assert.deepStrictEqual(g.motivos, ['72h']); assert.strictEqual(g.max72.ini, 0);
  K.produtos.dia4 = { mm: fill(100) };
  g = N.gatilho(K, -44, -20, 0); assert.deepStrictEqual(g.motivos, ['dia', '72h']); assert.strictEqual(g.iDia, 3); assert.strictEqual(g.max72.ini, 1);
  // pico de 150 mm num ponto a ~15 km: raio 0 não vê, raio 20 km vê
  const P = JSON.parse(JSON.stringify(J)); ['dia1','dia2','dia3','dia4'].forEach(k => P.produtos[k] = { mm: fill(0) });
  const y = lat.indexOf(-20), x = lon.indexOf(-43.75); P.produtos.dia2.mm[y][x] = 150;
  assert.strictEqual(N.gatilho(P, -44, -20, 0).dispara, false);
  assert.strictEqual(N.gatilho(P, -44, -20, 30).dispara, true);
  assert.ok(N.gatilho(P, -44, -20, 10).diaMax < 100);
});
console.log(n + ' testes ok');
