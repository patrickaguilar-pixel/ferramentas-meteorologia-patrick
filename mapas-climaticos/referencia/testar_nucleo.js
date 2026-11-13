// Testes do núcleo (node testar_nucleo.js): leitura defensiva e conferência. Sai com erro se algum falhar.
const fs = require('fs'), path = require('path'), assert = require('assert');
const N = require(path.join(__dirname, '..', 'nucleo.js'));
const src = fs.readFileSync(path.join(__dirname, '..', 'meso.js'), 'utf8');
const mesos = JSON.parse(src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1));
const ex = f => fs.readFileSync(path.join(__dirname, '..', 'exemplo', f));
const base = ex('PREC_SET_2026.txt').toString('latin1').split('\r\n');
const lat1 = s => Buffer.from(s, 'latin1');
let ok = 0, falhas = 0;
function t(nome, fn) { try { fn(); ok++; console.log('ok   ', nome); } catch (e) { falhas++; console.log('FALHA', nome, '—', e.message); } }
const erroCom = (fn, re) => { try { fn(); } catch (e) { assert(e.usuario, 'erro sem mensagem para o usuário: ' + e.message); assert(re.test(e.message), 'mensagem inesperada: ' + e.message); return; } throw new Error('deveria recusar'); };

t('lê os 4 TXT de exemplo (Windows-1252) e reconhece o tipo pelo cabeçalho', () => {
  const tipos = ['PREC_SET_2026.txt', 'TEMP_MAX_SET_2026.txt', 'TEMP_MIN_SET_2026.txt', 'TEMP_MED_SET_2026.txt'].map(f => N.lerTxt('x.txt', ex(f)).tipo);
  assert.deepStrictEqual(tipos, ['PREC', 'TMAX', 'TMIN', 'TMED']);
});
t('UTF-8 com BOM dá o mesmo resultado', () => {
  const a = N.lerTxt('PREC_SET_2026.txt', ex('PREC_SET_2026.txt')), b = N.lerTxt('PREC_SET_2026.txt', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(ex('PREC_SET_2026.txt').toString('latin1'), 'utf8')]));
  assert.strictEqual(b.codificacao, 'UTF-8'); assert.deepStrictEqual(a.estacoes.map(e => e.dados.acum), b.estacoes.map(e => e.dados.acum)); assert.strictEqual(b.estacoes[0].estacao, a.estacoes[0].estacao);
});
t('recusa arquivo separado por ponto e vírgula', () => erroCom(() => N.lerTxt('a.txt', lat1(base.map(l => l.replace(/\t/g, ';')).join('\r\n'))), /tabula/));
t('recusa arquivo sem coluna obrigatória (LATITUDE)', () => erroCom(() => N.lerTxt('a.txt', lat1(base.map(l => l.split('\t').filter((_, i) => i !== 6).join('\t')).join('\r\n'))), /obrigat|reconhe/));
t('recusa coluna repetida', () => erroCom(() => N.lerTxt('a.txt', lat1(base.map(l => l + '\t' + l.split('\t')[9]).join('\r\n'))), /mais de uma vez/));
t('recusa arquivo vazio, só cabeçalho e binário', () => { erroCom(() => N.lerTxt('a.txt', Buffer.alloc(0)), /vazio/); erroCom(() => N.lerTxt('a.txt', lat1(base[0])), /vazio/); erroCom(() => N.lerTxt('a.txt', Buffer.from([0, 1, 2, 9, 10, 0, 0])), /bin/); });
t('recusa arquivo grande demais', () => erroCom(() => N.lerTxt('a.txt', Buffer.alloc(4 * 1048576, 65)), /maior que/));
t('recusa TXT de outra coisa', () => erroCom(() => N.lerTxt('a.txt', lat1('A\tB\tC\r\n1\t2\t3')), /reconhe/));
t('valor não numérico na coluna do mapa: linha inválida', () => {
  const L = base.slice(); const c = L[1].split('\t'); c[9] = '12,5mm'; L[1] = c.join('\t');
  const A = N.lerTxt('PREC_SET_2026.txt', lat1(L.join('\r\n'))); N.conferir({ PREC: A }, mesos);
  assert.strictEqual(A.estacoes[0].gravidade, 'invalida'); assert.strictEqual(N.situacaoEstacao(A.estacoes[0], { acao: 'manter' }), 'invalida');
});
t('"1.234,5" (milhar) não é aceito como número', () => assert(isNaN(N.numero('1.234,5'))));
t('coordenada com sinal trocado: linha inválida', () => {
  const L = base.slice(); const c = L[2].split('\t'); c[6] = c[6].replace('-', ''); L[2] = c.join('\t');
  const A = N.lerTxt('PREC_SET_2026.txt', lat1(L.join('\r\n'))); assert(A.estacoes[1].problemas.some(p => p.cod === 'coord' && p.g === 'invalida'));
});
t('chuva negativa ou acima de 1500 mm: inválida', () => {
  const L = base.slice(); let c = L[3].split('\t'); c[9] = '-3'; L[3] = c.join('\t'); c = L[4].split('\t'); c[9] = '2000'; L[4] = c.join('\t');
  const A = N.lerTxt('PREC_SET_2026.txt', lat1(L.join('\r\n'))); assert(A.estacoes[2].problemas.some(p => p.g === 'invalida')); assert(A.estacoes[3].problemas.some(p => p.g === 'invalida'));
});
t('código repetido vira alerta forte nas duas linhas', () => {
  const L = base.slice(); L.push(L[5]); const A = N.lerTxt('PREC_SET_2026.txt', lat1(L.join('\r\n'))); N.conferir({ PREC: A }, mesos);
  assert.strictEqual(A.estacoes.filter(e => e.problemas.some(p => p.cod === 'duplicada')).length, 2);
});
t('conta da planilha errada (anomalia %) é apontada', () => {
  const L = base.slice(); const c = L[10].split('\t'); c[12] = '55'; L[10] = c.join('\t');
  const A = N.lerTxt('PREC_SET_2026.txt', lat1(L.join('\r\n'))); N.conferir({ PREC: A }, mesos); assert(A.estacoes[9].problemas.some(p => p.cod === 'conta'));
});
t('meses diferentes entre arquivos bloqueiam', () => {
  const a = N.lerTxt('PREC_SET_2026.txt', ex('PREC_SET_2026.txt')), b = N.lerTxt('TEMP_MAX_OUT_2026.txt', ex('TEMP_MAX_SET_2026.txt'));
  const r = N.conferir({ PREC: a, TMAX: b }, mesos); assert(r.geral.some(g => g.g === 'invalida' && /meses diferentes/.test(g.txt)));
});
t('nome do arquivo e cabeçalho com meses diferentes bloqueiam', () => {
  const a = N.lerTxt('PREC_OUT_2026.txt', ex('PREC_SET_2026.txt')); const r = N.conferir({ PREC: a }, mesos); assert(r.geral.some(g => /cabeçalho diz Setembro/.test(g.txt)));
});
t('Ibirité (0 mm com vizinhas chovendo) fica pendente com alerta forte', () => {
  const a = N.lerTxt('PREC_SET_2026.txt', ex('PREC_SET_2026.txt')); N.conferir({ PREC: a }, mesos);
  const e = a.estacoes.find(x => x.codigo === 'A555'); assert.strictEqual(e.gravidade, 'forte'); assert.strictEqual(N.situacaoEstacao(e, null), 'pendente');
});
t('temperatura cruzada: mínima >= máxima na mesma estação', () => {
  const x = N.lerTxt('TEMP_MAX_SET_2026.txt', ex('TEMP_MAX_SET_2026.txt')), n = N.lerTxt('TEMP_MIN_SET_2026.txt', ex('TEMP_MIN_SET_2026.txt'));
  n.estacoes[0].dados.abs = x.estacoes[0].dados.abs + 1; N.conferir({ TMAX: x, TMIN: n }, mesos);
  assert(n.estacoes[0].problemas.some(p => p.cod === 'cruzado'));
});
t('estação retirada não entra na interpolação; inválida nunca entra', () => {
  const a = N.lerTxt('PREC_SET_2026.txt', ex('PREC_SET_2026.txt')); N.conferir({ PREC: a }, mesos);
  const e = a.estacoes.find(x => x.codigo === 'A521'); const n0 = N.pontosDoProduto(a, 'acum', {}).length;
  assert.strictEqual(N.pontosDoProduto(a, 'acum', { [N.chave(e)]: { acao: 'retirar' } }).length, n0 - 1);
});
t('IDW: em cima da estação devolve o valor dela; entre duas iguais devolve o mesmo valor', () => {
  const p = [{ lon: -44, lat: -19, v: 10 }, { lon: -43, lat: -19, v: 10 }, { lon: -44, lat: -20, v: 30 }];
  assert.strictEqual(N.idwPonto(p, -44, -20, 2), 30); assert(Math.abs(N.idwPonto(p.slice(0, 2), -43.5, -19.3, 2) - 10) < 1e-12);
});
t('classe segue o QGIS discreto (valor <= limite)', () => { assert.strictEqual(N.classe(15, [15, 20]), 0); assert.strictEqual(N.classe(15.0001, [15, 20]), 1); assert.strictEqual(N.classe(99, [15, 20]), 2); });
t('escalas fixas coerentes (19 classes, limites em ordem)', () => { ['aprec', 'atmed'].forEach(p => { const e = N.escalaDe(p, []); assert.strictEqual(e.cores.length, 19); assert.strictEqual(e.rotulos.length, 19); }); });
t('CSV: texto do arquivo não vira fórmula', () => { assert.strictEqual(N.seguro('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"'); assert.strictEqual(N.seguro('@cmd'), "'@cmd"); assert.strictEqual(N.seguro('Belo; Horizonte'), '"Belo; Horizonte"'); });
t('nome de estação com HTML fica como texto (a tela escapa)', () => {
  const L = base.slice(); const c = L[1].split('\t'); c[1] = '<img src=x onerror=alert(1)>'; L[1] = c.join('\t');
  const A = N.lerTxt('PREC_SET_2026.txt', lat1(L.join('\r\n'))); assert.strictEqual(A.estacoes[0].estacao, '<img src=x onerror=alert(1)>');
});
t('krigagem: campo constante devolve a constante; pesos somam 1', () => {
  const pts = []; for (let i = 0; i < 40; i++) pts.push({ lon: -50 + (i % 8) * 1.3, lat: -22 + Math.floor(i / 8) * 1.7, v: 7 });
  const ctx = N.prepararKrigagem(pts, { pepita: 0.1, patamar: 1, alcance: 300 });
  assert(Math.abs(N.krigarPonto(ctx, -45.3, -19.1) - 7) < 1e-9);
});
t('krigagem: sem pepita, em cima da estação devolve o valor dela', () => {
  const pts = [{ lon: -44, lat: -19, v: 10 }, { lon: -43, lat: -19.5, v: 20 }, { lon: -44.5, lat: -20, v: 30 }, { lon: -43.2, lat: -20.4, v: 5 }];
  const ctx = N.prepararKrigagem(pts, { pepita: 0, patamar: 50, alcance: 200 });
  assert(Math.abs(N.krigarPonto(ctx, -43, -19.5) - 20) < 1e-8);
});
t('krigagem: piso físico (chuva nunca negativa)', () => {
  const pts = [{ lon: -44, lat: -19, v: 0 }, { lon: -43.9, lat: -19, v: 0 }, { lon: -43.95, lat: -19.05, v: 80 }, { lon: -42, lat: -21, v: 0 }];
  const ctx = N.prepararKrigagem(pts, { pepita: 0, patamar: 100, alcance: 50 });
  for (const q of [[-44.2, -18.8], [-43.6, -19.3], [-41, -22]]) assert(N.krigarPonto(ctx, q[0], q[1], 0) >= 0);
});
t('variograma: ajuste determinístico (mesma entrada, mesmo resultado) e alcance dentro de 20–1200 km', () => {
  const a = N.lerTxt('TEMP_MAX_SET_2026.txt', ex('TEMP_MAX_SET_2026.txt')); const p = N.pontosDoProduto(a, 'abs', {});
  const v1 = N.ajustarVariograma(p), v2 = N.ajustarVariograma(p);
  assert.deepStrictEqual(v1, v2); assert(v1.alcance >= 20 && v1.alcance <= 1200 && v1.pepita >= 0 && v1.patamar > 0);
});
t('produto Climatologia usa a coluna CLIMATOLOGIA do TXT de precipitação', () => { assert.strictEqual(N.PRODUTOS.clima.arq, 'PREC'); assert.strictEqual(N.PRODUTOS.clima.campo, 'clim'); assert(N.ORDEM.includes('clima')); });
console.log(`\n${ok} ok, ${falhas} falha(s)`); process.exit(falhas ? 1 : 0);
