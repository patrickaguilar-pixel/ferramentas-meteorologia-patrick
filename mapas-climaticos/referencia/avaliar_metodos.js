// Avaliação dos métodos (node avaliar_metodos.js [pasta dos TXT] [--sem-conferencia]) — 13/11/2026
// Compara, por produto, o erro da validação cruzada (deixa uma de fora, só nas estações de MG) de:
//   IDW do QGIS (padrão atual) · Krigagem ordinária local · IDW local (12 viz., km) · Regressão altitude+latitude + krigagem dos resíduos
// Conferência simulada: retira as estações com alerta forte (como o atalho "Retirar as pendentes com alerta forte") e mantém o resto.
// Altitude das estações: MDE Copernicus GLO-90 agregado (mde/mde_ext.bin, média da célula de 0,02°, bilinear).
const fs = require('fs'), path = require('path');
const N = require(path.join(__dirname, '..', 'nucleo.js'));
const M = require(path.join(__dirname, '..', 'mde.js'));
const pasta = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(__dirname, '..', 'exemplo');
const semConf = process.argv.includes('--sem-conferencia');
const src = fs.readFileSync(path.join(__dirname, '..', 'meso.js'), 'utf8');
const mesos = JSON.parse(src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1));
const meta = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'mde', 'mde.json'), 'utf8'));
const buf = n => { const b = fs.readFileSync(path.join(__dirname, '..', 'mde', n)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const mde = M.carregarDeBuffers(meta, buf('mde_mg.bin'), buf('mde_ext.bin'));

const arqs = {};
fs.readdirSync(pasta).filter(f => /\.txt$/i.test(f)).forEach(f => { const a = N.lerTxt(f, fs.readFileSync(path.join(pasta, f))); arqs[a.tipo] = a; });
N.conferir(arqs, mesos);
const decisoes = {};
Object.values(arqs).forEach(a => a.estacoes.forEach(e => { if (e.gravidade && e.gravidade !== 'invalida') decisoes[N.chave(e)] = { acao: (!semConf && e.gravidade === 'forte') ? 'retirar' : 'manter', motivo: 'teste' }; }));

const mg = p => p.dentroMG, f2 = v => v == null ? '—' : v.toFixed(2);
console.log('Conferência:', semConf ? 'nenhuma estação retirada' : 'retiradas as de alerta forte', '| pasta:', pasta);
console.log('produto   n(MG)  IDW-QGIS  Krigagem  IDW-local  Regr+Krig   (RMSE; MAE entre parênteses)  [regressão: °/km, R²]');
const linhas = [];
['prec', 'aprec', 'clima', 'atmed', 'tmax', 'tmin'].forEach(prod => {
  const P = N.PRODUTOS[prod], arq = arqs[P.arq]; if (!arq) return;
  const pts = N.pontosDoProduto(arq, P.campo, decisoes).filter(p => isFinite(p.v));
  pts.forEach(p => { p.alt = M.altitudeEstacao(mde, p.lon, p.lat); });
  const piso = prod === 'prec' || prod === 'clima' ? 0 : prod === 'aprec' ? -100 : null;
  const r = {
    qgis: N.validacaoCruzada(pts, 2, mg), krig: N.validacaoCruzadaKrig(pts, mg, piso), local: N.validacaoCruzadaLocal(pts, mg),
    rk: N.validacaoCruzadaRK(pts, mg, { anomalia: prod === 'atmed' })
  };
  let reg = ''; try { const rk = N.prepararRK(pts, { anomalia: prod === 'atmed' }); reg = `[${rk.reg.bAlt.toFixed(2)} °/km, R² ${rk.reg.r2.toFixed(2)}, ${rk.usadas} est., sem alt. ${rk.semAltitude}, gradiente ${rk.gradienteOk ? 'ok' : 'FORA DA FAIXA'}]`; } catch (e) { reg = '[' + e.message + ']'; }
  const c = k => `${f2(r[k] && r[k].rmse)} (${f2(r[k] && r[k].mae)})`.padEnd(14);
  console.log(prod.padEnd(9), String(r.qgis.n).padEnd(6), c('qgis'), c('krig'), c('local'), c('rk'), reg);
  linhas.push({ prod, n: r.qgis.n, qgis: r.qgis.rmse, krig: r.krig.rmse, local: r.local.rmse, rk: r.rk && r.rk.rmse, viesRk: r.rk && r.rk.vies, viesLocal: r.local.vies });
});
fs.writeFileSync(path.join(__dirname, 'avaliacao_' + (semConf ? 'sem_conf' : 'com_conf') + '.json'), JSON.stringify(linhas, null, 1));
