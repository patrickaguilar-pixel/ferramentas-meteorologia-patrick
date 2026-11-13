// Usado por testar_equivalencia.py: calcula as 5 grades com o nucleo.js (como o navegador) e grava em binário.
const fs = require('fs'), path = require('path');
const N = require(path.join(__dirname, '..', 'nucleo.js'));
const [dirTxt, saida] = process.argv.slice(2);
const src = fs.readFileSync(path.join(__dirname, '..', 'meso.js'), 'utf8');
const mesos = JSON.parse(src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1));
const arqs = {}, nomes = {};
for (const f of fs.readdirSync(dirTxt).filter(f => /\.txt$/i.test(f))) { const A = N.lerTxt(f, fs.readFileSync(path.join(dirTxt, f))); arqs[A.tipo] = A; nomes[A.tipo] = f; }
N.conferir(arqs, mesos);
const dec = {};   // fortes retiradas, o resto mantido (decisão fixa só para o teste)
for (const t in arqs) for (const e of arqs[t].estacoes) { const s = N.situacaoEstacao(e, null); if (s === 'pendente') dec[N.chave(e)] = { acao: e.gravidade === 'forte' ? 'retirar' : 'manter', motivo: 'teste' }; }
const m = N.mascara(mesos); fs.writeFileSync(path.join(saida, 'mascara.i8'), Buffer.from(m.buffer));
const info = { produtos: {} };
for (const p of N.ORDEM) {
  const P = N.PRODUTOS[p], A = arqs[P.arq];
  const ok = A.estacoes.filter(e => { const s = N.situacaoEstacao(e, dec[N.chave(e)]); return (s === 'usada' || s === 'mantida') && isFinite(e.dados[P.campo]); });
  const g = N.idwGrade(N.pontosDoProduto(A, P.campo, dec), m, 2);
  fs.writeFileSync(path.join(saida, p + '.f64'), Buffer.from(g.buffer));
  const es = N.escalaDe(p, [...g].filter(isFinite));
  const K = N.krigagemGrade(N.pontosDoProduto(A, P.campo, dec), m, null, P.piso);
  fs.writeFileSync(path.join(saida, p + '_krig.f64'), Buffer.from(K.grade.buffer));
  const vk = p === 'atmed' || p === 'prec' ? N.validacaoCruzadaKrig(N.pontosDoProduto(A, P.campo, dec), x => x.dentroMG, P.piso) : null;
  info.produtos[p] = { arquivo: nomes[P.arq], linhas: ok.map(e => e.linha), lim: es.lim, piso: P.piso == null ? null : P.piso, vario: K.v, loo: vk && { n: vk.n, rmse: vk.rmse, mae: vk.mae } };
}
fs.writeFileSync(path.join(saida, 'info.json'), JSON.stringify(info));
