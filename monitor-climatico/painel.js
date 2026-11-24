/*
 * Monitor Climático v0.1 (23/11/2026, Patrick/Claude) — SIMGE/IGAM
 * Aba 3 "Monitoramento" e ganchos na conferência. Cálculos em monitor-climatico/monitor.js; núcleo dos Mapas Climáticos
 * (mapas-climaticos/nucleo.js) sem alteração. Nada é enviado para fora: os dados do MERGE são arquivos estáticos do
 * próprio repositório (coleta automática .github/workflows/dados-merge.yml).
 */
(function () {
  'use strict';
  var N = window.MapasClimaticosNucleo, X = window.MonitorClimatico, MESOS = window.MESO_MC;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var fmt = function (v, c) { return isFinite(v) ? Number(v).toFixed(c == null ? 1 : c).replace('.', ',') : '—'; };
  var MC = function () { return window.MapasClimaticos; };
  var BASE = function () { return (window.BASE_DADOS || '../') + 'monitor-climatico/dados/merge/'; };
  var M = { per: null, merge: null, mergeEstado: 'nao', resumo: null, indice: null, prod: 'catEst', cache: {}, gen: 0, ext: [], extUsar: false, hist: X.lerHistorico(), histProd: 'prec' };

  /* ======================= ganchos chamados pela tela (app.js) ======================= */
  // (1) TXT da máxima: a coluna "Dias que Tmáx ≥ 30" não é lida pelo núcleo; lida aqui, pela mesma linha do arquivo.
  function aposLer(A, bytes) {
    if (A.tipo !== 'TMAX') return;
    try {
      var linhas = N.decodificar(bytes).texto.split(/\r\n|\n|\r/), cab = linhas[0].split('\t').map(N.norm), k = -1;
      cab.forEach(function (h, i) { if (/^DIAS QUE TMAX.*30$/.test(h)) k = i; });
      if (k < 0) return;
      A.estacoes.forEach(function (e) { var cel = (linhas[e.linha - 1] || '').split('\t'); var v = N.numero(cel[k]); if (isFinite(v) && v >= 0 && v <= 31) e.dados.dias30 = v; });
      A.temDias30 = true;
    } catch (e) { }
  }
  // (2) depois da conferência: MERGE no ponto de cada estação de chuva, teste contra o satélite e categoria do mês
  function aposConferir(S, per) {
    var A = S.arqs.PREC; if (!A) return;
    var Mg = M.merge && per && M.per === chavePer(per) ? M.merge : null;
    A.estacoes.forEach(function (e) { delete e.sat; delete e.catMes; delete e.dados.pct; });
    if (!Mg) return;
    var validas = A.estacoes.filter(function (e) { return e.gravidade !== 'invalida' && !e.problemas.some(function (p) { return p.g === 'invalida'; }) && isFinite(e.lat) && isFinite(e.dados.acum); });
    validas.forEach(function (e) {
      e.sat = X.amostrar(Mg, 'acum', e.lon, e.lat);
      var c = X.categoriaEstacao(e.dados.acum, e.dados.clim, X.amostrar(Mg, 'alpha', e.lon, e.lat), X.amostrar(Mg, 'p0', e.lon, e.lat));
      if (isFinite(c.H)) { e.catMes = c; e.dados.pct = c.pct; }
    });
    var q = X.testeSatelite(validas.filter(function (e) { return e.dentroMG || e.distMG <= 150; }).map(function (e) { return { chave: N.chave(e), v: e.dados.acum, sat: e.sat }; }));
    M.qc = q;
    if (!q.aplicado) return;
    var GRAV = { invalida: 4, forte: 3, atencao: 2, info: 1 };
    validas.forEach(function (e) {
      var r = q.res[N.chave(e)]; if (!r || !r.g) return;
      e.problemas.push({ g: r.g, cod: 'satelite', txt: 'Satélite (MERGE): ' + r.txt + '.', origem: 'conferencia' });
      if (!e.gravidade || GRAV[r.g] > GRAV[e.gravidade]) e.gravidade = r.g;
    });
  }
  function chavePer(p) { return p ? p.ano + '-' + ('0' + p.mes).slice(-2) : ''; }
  // (3) a tela mudou os dados: limpa o cache e, se o período mudou, carrega o MERGE do mês
  function dadosMudaram() {
    M.gen++; M.cache = {};
    var per = MC() && MC().periodoEscolhido(), k = chavePer(per);
    if (k && k !== M.per && M.mergeEstado !== 'carregando:' + k) carregarMerge(per);
    if (!$('abaMonitor').hidden) desenhar();
    statusMerge();
  }

  /* ======================= MERGE ======================= */
  function carregarMerge(per) {
    var k = chavePer(per);
    M.mergeEstado = 'carregando:' + k; M.merge = null; M.per = null; statusMerge();
    fetch(BASE() + k + '.json', { cache: 'no-cache' }).then(function (r) { if (r.status === 404) throw { semMes: true }; if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (doc) {
        if (doc.mes !== per.mes || doc.ano !== per.ano) throw new Error('arquivo do MERGE de outro mês');
        M.merge = X.decodificarMerge(doc); M.per = k; M.mergeEstado = 'ok';
        if (MC()) MC().conferir();   // refaz a conferência, agora com o teste contra o satélite
      })
      .catch(function (e) { M.per = k; M.merge = null; M.mergeEstado = e && e.semMes ? 'semMes' : 'erro:' + (e && e.message || e); statusMerge(); if (!$('abaMonitor').hidden) desenhar(); });
    if (!M.resumo) fetch(BASE() + 'resumo.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { M.resumo = j; if (!$('abaMonitor').hidden) desenhar(); }).catch(function () { });
  }
  function statusMerge() {
    var el = $('monMergeSt'); if (!el) return;
    var per = MC() && MC().periodoEscolhido();
    if (!per) { el.className = 'stbox'; el.innerHTML = 'Escolha o mês na etapa 1 para carregar o satélite.'; return; }
    var nome = N.MESES_BR[per.mes - 1] + '/' + per.ano;
    if (/^carregando/.test(M.mergeEstado)) { el.className = 'stbox'; el.innerHTML = 'Carregando o MERGE de ' + nome + '…'; return; }
    if (M.mergeEstado === 'ok' && M.merge) {
      var d = M.merge.doc, q = M.qc;
      el.className = 'stbox ok';
      el.innerHTML = '<strong>MERGE de ' + esc(nome) + ' carregado</strong> (' + esc(d.origem) + '; base ' + esc(d.base) + '; gerado ' + esc(d.gerado) + ').' +
        (q ? q.aplicado ? ' Teste contra o satélite: ' + q.n + ' estações; viés mediano estação − MERGE ' + fmt(q.mediana, 1) + ' mm; MAD ' + fmt(q.mad, 1) + ' mm.' : ' Teste contra o satélite não aplicado: ' + esc(q.motivo) + '.' : '');
      return;
    }
    el.className = 'stbox aviso';
    el.innerHTML = M.mergeEstado === 'semMes' ? '<strong>O MERGE de ' + esc(nome) + ' ainda não está disponível.</strong> O CPTEC publica o mês completo nos primeiros dias do mês seguinte; a coleta roda todo dia às 08h41. Os produtos de satélite e o teste contra o satélite ficam desligados.'
      : '<strong>Não foi possível carregar o MERGE.</strong> ' + esc(String(M.mergeEstado).replace(/^erro:/, '')) + '. Recarregue a página mais tarde.';
  }

  /* ======================= produtos da aba ======================= */
  var COR_SPI = ['#8c510a', '#bf812d', '#dfc27d', '#f6e8c3', '#f5f5f5', '#c7eae5', '#80cdc1', '#35978f', '#01665e'];
  var PRODS = {
    catEst: { nome: 'Categoria da chuva (estações)', sigla: 'CAT_PREC', fonte: 'est', unidade: '', titulo: 'Categoria da Precipitação Mensal',
      credito: 'Dados: INMET · Normal 1991-2020 (INMET) · Forma da distribuição: MERGE/CPTEC 1998-2025', precisaMerge: true },
    catMerge: { nome: 'Categoria da chuva (MERGE)', sigla: 'CAT_PREC_MERGE', fonte: 'merge', camada: 'pct', titulo: 'Categoria da Precipitação Mensal (MERGE)', credito: 'Dados: MERGE/CPTEC-INPE · Base 1998-2025', precisaMerge: true },
    spi1: { nome: 'SPI-1 (MERGE)', sigla: 'SPI1_MERGE', fonte: 'merge', camada: 'spi1', titulo: 'Índice de Precipitação Padronizado - 1 mês', credito: 'Dados: MERGE/CPTEC-INPE · SPI (McKee et al., 1993) · Base 1998-2025', precisaMerge: true },
    spi3: { nome: 'SPI-3 (MERGE)', sigla: 'SPI3_MERGE', fonte: 'merge', camada: 'spi3', titulo: 'Índice de Precipitação Padronizado - 3 meses', credito: 'Dados: MERGE/CPTEC-INPE · SPI (McKee et al., 1993) · Base 1998-2025', precisaMerge: true },
    spi6: { nome: 'SPI-6 (MERGE)', sigla: 'SPI6_MERGE', fonte: 'merge', camada: 'spi6', titulo: 'Índice de Precipitação Padronizado - 6 meses', credito: 'Dados: MERGE/CPTEC-INPE · SPI (McKee et al., 1993) · Base 1998-2025', precisaMerge: true },
    accMerge: { nome: 'Acumulado (MERGE)', sigla: 'PREC_MERGE', fonte: 'merge', camada: 'acum', unidade: 'mm', titulo: 'Acumulado de Precipitação (MERGE)', credito: 'Dados: MERGE/CPTEC-INPE (GPM-IMERG + pluviômetros)', precisaMerge: true },
    ked: { nome: 'Acumulado: estações + satélite', sigla: 'PREC_EST_SAT', fonte: 'ked', unidade: 'mm', titulo: 'Acumulado de Precipitação', credito: 'Dados: INMET e MERGE/CPTEC-INPE · Interpolação: regressão com o MERGE + krigagem dos resíduos', precisaMerge: true },
    sigma: { nome: 'Incerteza do acumulado', sigla: 'INCERTEZA_PREC', fonte: 'sigma', unidade: 'mm', titulo: 'Incerteza da Interpolação do Acumulado (desvio-padrão da krigagem)', credito: 'Dados: INMET · Krigagem ordinária' },
    dias30: { nome: 'Dias com máxima ≥ 30 °C', sigla: 'DIAS_TMAX30', fonte: 'est30', unidade: 'dias', titulo: 'Dias com Temperatura Máxima ≥ 30 °C', credito: 'Dados: INMET (coluna "Dias que Tmáx ≥ 30" do TXT)' }
  };
  var ORDEM_P = ['catEst', 'catMerge', 'spi1', 'spi3', 'spi6', 'accMerge', 'ked', 'sigma', 'dias30'];
  function escalaCategoria() {
    return { lim: [10, 100 / 3, 200 / 3, 90], cores: X.CATEGORIAS.map(function (c) { return c.cor; }), rotulos: X.CATEGORIAS.map(function (c) { return c.nome; }), unidade: '', tipoLeg: 'cat' };
  }
  function escalaSpi() {
    return { lim: [-2, -1.5, -1, -0.5, 0.5, 1, 1.5, 2], cores: COR_SPI,
      rotulos: ['≤ −2,0 extremamente seco', '−2,0 a −1,5 severamente seco', '−1,5 a −1,0 moderadamente seco', '−1,0 a −0,5 levemente seco', '−0,5 a 0,5 normal', '0,5 a 1,0 levemente úmido', '1,0 a 1,5 moderadamente úmido', '1,5 a 2,0 severamente úmido', '> 2,0 extremamente úmido'], unidade: '' };
  }
  function escalaPrec(vals) {   // mesma regra da escala automática do acumulado (núcleo), para comparar com o mapa da aba 2
    var es = N.escalaDe('prec', vals, {}); return { lim: es.lim, cores: es.cores, rotulos: es.rotulos.map(function (r) { return r + ' mm'; }) };
  }
  function escalaLivre(vals, cores, un, passos) {
    var v = vals.filter(isFinite).sort(function (a, b) { return a - b; }); if (!v.length) return null;
    var mx = v[Math.floor(0.98 * (v.length - 1))], n = cores.length - 1, passo = passos.filter(function (p) { return mx / p <= n; })[0] || passos[passos.length - 1], lim = [];
    for (var i = 1; i <= n; i++) lim.push(i * passo);
    var rot = []; rot.push('≤ ' + fmt(lim[0], 0)); for (i = 1; i < lim.length; i++) rot.push(fmt(lim[i - 1], 0) + ' – ' + fmt(lim[i], 0)); rot.push('> ' + fmt(lim[lim.length - 1], 0));
    return { lim: lim, cores: cores, rotulos: rot.map(function (r) { return r + ' ' + un; }) };
  }
  // escala entre os percentis 2 e 98 do próprio mapa, passo redondo (a incerteza varia pouco em valor absoluto)
  function escalaFaixa(vals, cores, un) {
    var v = vals.filter(isFinite).sort(function (a, b) { return a - b; }); if (!v.length) return null;
    var lo = v[Math.floor(0.02 * (v.length - 1))], hi = v[Math.floor(0.98 * (v.length - 1))], n = cores.length - 1;
    var passo = [0.5, 1, 2, 2.5, 5, 10, 20, 25, 50].filter(function (p) { return (hi - lo) / p <= n - 1; })[0] || 50, ini = Math.floor(lo / passo) * passo + passo, lim = [];
    for (var i = 0; i < n; i++) lim.push(ini + i * passo);
    var rot = ['≤ ' + fmt(lim[0], passo < 1 ? 1 : 0)]; for (i = 1; i < lim.length; i++) rot.push(fmt(lim[i - 1], passo < 1 ? 1 : 0) + ' – ' + fmt(lim[i], passo < 1 ? 1 : 0)); rot.push('> ' + fmt(lim[lim.length - 1], passo < 1 ? 1 : 0));
    return { lim: lim, cores: cores, rotulos: rot.map(function (r) { return r + ' ' + un; }) };
  }
  function valores(g) { var o = []; for (var i = 0; i < g.length; i++) if (isFinite(g[i])) o.push(g[i]); return o; }

  // pronto? { ok, motivo }  (salvar exige a conferência concluída, como na aba 2)
  function pronto(p) {
    var P = PRODS[p], mc = MC(); if (!mc) return { ok: false, motivo: 'Carregando…' };
    var S = mc._S, per = mc.periodoEscolhido();
    if (!per) return { ok: false, motivo: 'Escolha o mês e o ano na etapa 1.' };
    if (P.precisaMerge && !M.merge) return { ok: false, motivo: 'Precisa do MERGE do mês (veja o quadro do satélite).' };
    if (P.fonte === 'merge') return { ok: true, soSatelite: true };
    var arq = P.fonte === 'est30' ? 'TMAX' : 'PREC';
    if (!S.arqs[arq]) return { ok: false, motivo: 'Falta o arquivo ' + N.TIPOS[arq].arquivo + ' (etapa 1).' };
    if (P.fonte === 'est30' && !S.arqs.TMAX.temDias30) return { ok: false, motivo: 'O TXT da máxima não tem a coluna "Dias que Tmáx ≥ 30".' };
    var pr = mc.prontoProduto(arq === 'TMAX' ? 'tmax' : 'prec');
    return pr.ok ? { ok: true } : { ok: false, motivo: pr.motivo };
  }
  function pontos(campo, arq) { var mc = MC(), A = mc._S.arqs[arq]; return A ? N.pontosDoProduto(A, campo, mc.decisoesValidas()) : []; }
  function ptsExternos() { return M.extUsar ? M.ext.filter(function (e) { return e.status === 'ok'; }).map(function (e) { return { codigo: e.codigo, lon: e.lon, lat: e.lat, v: e.v, dentroMG: e.dentroMG, externo: true }; }) : []; }

  // calcula o produto (síncrono ou em pedaços). Devolve { grade, es, ... } ou { calculando, progresso } ou { erro }
  function calcular(p) {
    if (M.cache[p]) return M.cache[p];
    var P = PRODS[p], mc = MC(), masc = mc.mascara(), G = N.GRADE, gen = M.gen, C;
    if (P.fonte === 'merge') {
      var g = X.mergeNaGrade(M.merge, P.camada, masc, G);
      var es = P.camada === 'pct' ? escalaCategoria() : /^spi/.test(P.camada) ? escalaSpi() : escalaPrec(valores(g));
      return (M.cache[p] = { grade: g, es: es, pts: [] });
    }
    if (P.fonte === 'est') {
      var pts = pontos('pct', 'PREC'); if (pts.length < 10) return (M.cache[p] = { erro: 'Menos de 10 estações com categoria calculada (precisa da normal e do MERGE no ponto).' });
      var gi = N.idwGrade(pts, masc, 2);
      return (M.cache[p] = { grade: gi, es: escalaCategoria(), pts: pts, vc: N.validacaoCruzada(pts, 2, function (x) { return x.dentroMG; }) });
    }
    if (P.fonte === 'est30') {
      var p30 = pontos('dias30', 'TMAX'); if (p30.length < 10) return (M.cache[p] = { erro: 'Menos de 10 estações com a contagem de dias.' });
      var g30 = N.idwGrade(p30, masc, 2), cores = ['#fff5eb', '#fdd8b3', '#fdae6b', '#fd8d3c', '#f16913', '#d94801', '#a63603', '#7f2704'];
      var e30 = { lim: [0.5, 3, 6, 10, 15, 20, 25], cores: cores, rotulos: ['0 dia', '1 – 3 dias', '4 – 6 dias', '7 – 10 dias', '11 – 15 dias', '16 – 20 dias', '21 – 25 dias', '> 25 dias'] };
      return (M.cache[p] = { grade: g30, es: e30, pts: p30, vc: N.validacaoCruzada(p30, 2, function (x) { return x.dentroMG; }) });
    }
    // em pedaços: ked e sigma
    C = M.cache[p] = { calculando: true, progresso: 0 };
    var base = pontos('acum', 'PREC');
    if (base.length < 20) { C.calculando = false; C.erro = 'Menos de 20 estações aprovadas de chuva.'; return C; }
    var vivo = function () { return gen === M.gen && M.cache[p] === C; }, j = 0, PASSO = 25, passo, fim;
    try {
      if (P.fonte === 'ked') {
        var satG = X.mergeNaGrade(M.merge, 'acum', masc, G);
        var pk = base.concat(ptsExternos()).map(function (q) { return { codigo: q.codigo, lon: q.lon, lat: q.lat, v: q.v, dentroMG: q.dentroMG, externo: q.externo, s: X.amostrar(M.merge, 'acum', q.lon, q.lat) }; });
        var K = X.prepararKED(N, pk);
        C.K = K; C.pts = pk;
        passo = function (a, b) { X.kedLinhas(N, K, masc, satG, G, a, b); };
        fim = function () {
          C.grade = K.grade;
          var idw = mc.calcular('prec');
          C.es = escalaPrec(idw ? idw.vals : valores(K.grade));
          C.vc = X.validacaoCruzadaKED(N, pk.filter(function (q) { return !q.externo; }).concat(pk.filter(function (q) { return q.externo; }).map(function (q) { return Object.assign({}, q, { dentroMG: false }); })));
          C.vcIdw = idw && idw.vc;
          C.bloqueado = !K.ok;
        };
      } else {
        var vario = N.ajustarVariograma(base), ctx = N.prepararKrigagem(base, vario), alvo = new Float64Array(G.nx * G.ny).fill(NaN);
        C.vario = vario; C.pts = base;
        passo = function (a, b) { X.desvioLinhas(N, ctx, masc, G, a, b, alvo); };
        fim = function () { C.grade = alvo; C.es = escalaFaixa(valores(alvo), ['#f7fcfd', '#e0ecf4', '#bfd3e6', '#9ebcda', '#8c96c6', '#8c6bb1', '#88419d', '#6e016b'], 'mm'); };
      }
    } catch (e) { C.calculando = false; C.erro = e.usuario ? e.message : 'Não foi possível calcular (' + e.message + ').'; return C; }
    (function pedaco() {
      if (!vivo()) return;
      try { passo(j, j + PASSO); } catch (e) { C.calculando = false; C.erro = 'Erro no cálculo (' + e.message + ').'; desenhar(); return; }
      j += PASSO; C.progresso = Math.min(1, j / G.ny);
      var el = $('monMapa').querySelector('.vazio b'); if (el && M.prod === p) el.textContent = Math.round(C.progresso * 100) + ' %';
      if (j < G.ny) { setTimeout(pedaco, 0); return; }
      setTimeout(function () { if (!vivo()) return; try { fim(); } catch (e) { C.erro = 'Erro no cálculo (' + e.message + ').'; } C.calculando = false; desenhar(); }, 0);
    })();
    return C;
  }

  /* ======================= mapa ======================= */
  function opMapa(p) {
    var P = PRODS[p], C = M.cache[p], mc = MC(), per = mc.periodoEscolhido(), mm = ('0' + per.mes).slice(-2), dias = N.diasNoMes(per.mes, per.ano);
    var k = /^spi(\d)/.exec(P.camada || ''), meses = k ? +k[1] : 1, ini = new Date(Date.UTC(per.ano, per.mes - meses, 1));
    var op = {
      titulo: P.titulo + ' - ' + N.MESES_BR[per.mes - 1] + ' de ' + per.ano,
      textoValidade: 'PERÍODO: ' + ('0' + 1).slice(-2) + '/' + ('0' + (ini.getUTCMonth() + 1)).slice(-2) + '/' + ini.getUTCFullYear() + ' a ' + dias + '/' + mm + '/' + per.ano,
      credito: P.credito + ' - SIMGE/IGAM, ' + new Date().getFullYear(),
      fundo: '', areas: mc.areas(C.grade, C.es),
      legenda: C.es.rotulos.map(function (l, i) { return { fill: C.es.cores[i], label: l }; }),
      cidades: $('monCidades').checked ? mc.cidades() : []
    };
    if ($('monEst').checked && C.pts) op.pontos = C.pts.filter(function (x) { return x.lon > -52 && x.lon < -39 && x.lat > -23.5 && x.lat < -14; }).map(function (x) { return { lon: x.lon, lat: x.lat, rotulo: '', cor: x.externo ? '#7a2c00' : '#111' }; });
    return op;
  }
  function nomeArq(p, ext) { var per = MC().periodoEscolhido(); return PRODS[p].sigla + '_' + N.SIGLAS[per.mes - 1] + '_' + per.ano + '.' + ext; }
  function desenhar() {
    if (!MC()) return;
    $('monProd').innerHTML = ORDEM_P.map(function (p) { var pr = pronto(p); return '<button type="button" data-p="' + p + '"' + (p === M.prod ? ' class="on"' : '') + '>' + esc(PRODS[p].nome) + (pr.ok ? '' : ' ·') + '</button>'; }).join('');
    var p = M.prod, P = PRODS[p], pr = pronto(p), el = $('monMapa'), st = $('monProdSt');
    $('monMapaTit').textContent = P.titulo;
    metodologia(p);
    var podeCalcular = pr.ok || (pr.motivo && !/MERGE|Escolha|Falta o arquivo|não tem a coluna/.test(pr.motivo));   // prévia mesmo com pendentes
    if (!podeCalcular) { el.innerHTML = '<div class="vazio">' + esc(pr.motivo) + '</div>'; st.className = 'stbox aviso'; st.textContent = pr.motivo; botoes(false); resumo(); validacao(); return; }
    var C = calcular(p);
    if (C.erro) { el.innerHTML = '<div class="vazio">' + esc(C.erro) + '</div>'; st.className = 'stbox aviso'; st.textContent = C.erro; botoes(false); resumo(); validacao(); return; }
    if (C.calculando) { el.innerHTML = '<div class="vazio">Calculando… <b>' + Math.round(C.progresso * 100) + ' %</b></div>'; st.className = 'stbox'; st.textContent = 'Calculando (alguns segundos).'; botoes(false); return; }
    var info = '';
    if (P.fonte === 'ked') {
      var r = C.K.reg;
      info = ' Regressão do mês: estação = ' + fmt(r.b0, 1) + ' + ' + fmt(r.b1, 2) + ' × MERGE (R² ' + fmt(r.r2, 2) + ', ' + C.K.usadas + ' estações' + (ptsExternos().length ? ', ' + ptsExternos().length + ' de outras redes' : '') + '). Variograma dos resíduos: alcance ' + C.K.vario.alcance + ' km.' +
        (C.vc && C.vcIdw ? ' Validação cruzada em MG: erro médio <b>' + fmt(C.vc.mae, 1) + ' mm</b> contra ' + fmt(C.vcIdw.mae, 1) + ' mm do IDW padrão (' + (C.vc.mae < C.vcIdw.mae ? fmt(100 * (1 - C.vc.mae / C.vcIdw.mae), 0) + ' % menor' : 'não foi melhor neste mês') + ').' : '');
      if (C.bloqueado) info += ' <span class="g-forte">O satélite explica pouco este mês (R² < ' + fmt(X.KED.r2Min, 1) + ' ou inclinação ≤ 0): o PNG deste método fica bloqueado.</span>';
    } else if (P.fonte === 'sigma') info = ' Variograma: pepita ' + fmt(C.vario.pepita, 1) + ' · patamar ' + fmt(C.vario.patamar, 1) + ' · alcance ' + C.vario.alcance + ' km. Valores maiores = menos estações por perto.';
    else if (C.vc) info = ' Validação cruzada (IDW): erro médio ' + fmt(C.vc.mae, 1) + (P.fonte === 'est' ? ' pontos de percentil' : ' dias') + ' em ' + C.vc.n + ' estações de MG.';
    else if (P.fonte === 'merge') info = ' Produto só do satélite (com os pluviômetros que o CPTEC usa): não depende da conferência.';
    st.className = 'stbox ' + (pr.ok && !C.bloqueado ? 'ok' : 'aviso');
    st.innerHTML = (pr.ok ? (C.bloqueado ? '<strong>Bloqueado.</strong>' : '<strong>Pronto para salvar.</strong> Arquivo: ' + esc(nomeArq(p, 'png')) + '.') : '<strong>Prévia — ainda não dá para salvar.</strong> ' + esc(pr.motivo)) + info;
    var op = opMapa(p), img = new Image(); img.alt = op.titulo;
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(LayoutMapa.svg(op));
    el.innerHTML = ''; el.appendChild(img);
    botoes(pr.ok && !C.bloqueado);
    resumo(); validacao();
  }
  function botoes(ok) { ['monPng', 'monTif', 'monAsc'].forEach(function (id) { if ($(id).textContent.indexOf('Gerando') < 0) $(id).disabled = !ok; }); }
  function png() {
    var p = M.prod, b = $('monPng'), t = b.textContent; b.disabled = true; b.textContent = 'Gerando PNG…';
    LayoutMapa.png(opMapa(p)).then(function (blob) { MC().baixar(nomeArq(p, 'png'), blob); }).catch(function (e) { $('monProdSt').innerHTML += '<div class="warn">Não foi possível gerar o PNG: ' + esc(e.message) + '</div>'; }).then(function () { b.textContent = t; botoes(true); });
  }
  function exportarGrade(tipo, grade, base) {
    var G = N.GRADE;
    if (tipo === 'tif') MC().baixar(base + '.tif', new Blob([X.geotiff(grade, G)], { type: 'image/tiff' }));
    else { MC().baixar(base + '.asc', new Blob([X.ascii(grade, G)], { type: 'text/plain' })); setTimeout(function () { MC().baixar(base + '.prj', new Blob([X.PRJ_4674], { type: 'text/plain' })); }, 600); }
  }
  // grade do mapa da aba 2 (o produto e o método abertos lá)
  function exportarAba2(tipo) {
    var mc = MC(), S = mc._S, p = S.prod, g = mc.gradeDe(p, S.metodo);
    if (!g || !mc.prontoProduto(p).ok) { $('monExpSt').className = 'stbox aviso'; $('monExpSt').textContent = 'Abra a aba 2, confira o produto e espere o mapa ficar pronto (as pendentes precisam estar decididas).'; return; }
    exportarGrade(tipo, g, mc.nomeArquivo(p, 'x', S.metodo).replace(/\.x$/, ''));
    $('monExpSt').className = 'stbox ok'; $('monExpSt').textContent = 'Grade de ' + N.PRODUTOS[p].titulo + ' (' + (S.metodo === 'krig' ? 'krigagem' : S.metodo === 'rec' ? 'método recomendado' : 'IDW') + ') exportada.';
  }

  /* ======================= resumo do mês e texto ======================= */
  function estacaoExtremo(arq, campo, maior) {
    var mc = MC(), A = mc._S.arqs[arq]; if (!A) return null;
    var dec = mc.decisoesValidas(), best = null;
    A.estacoes.forEach(function (e) {
      var s = N.situacaoEstacao(e, dec[N.chave(e)]); if (!(s === 'usada' || s === 'mantida') || !e.dentroMG) return;
      var v = e.dados[campo]; if (!isFinite(v)) return;
      if (!best || (maior ? v > best.v : v < best.v)) best = { v: v, nome: (e.municipio || e.estacao) + ' (' + e.codigo + ')' };
    });
    return best;
  }
  function resumo() {
    var mc = MC(), per = mc && mc.periodoEscolhido(), corpo = $('monResBody');
    if (!per) { corpo.innerHTML = ''; $('monTexto').value = ''; serie(); return; }
    var masc = mc.mascara(), G = N.GRADE, nM = MESOS.features.length, R = { mesNome: N.MESES_BR[per.mes - 1], ano: per.ano }, linhas = [];
    function area(p) { var C = mc._S.arqs[N.PRODUTOS[p].arq] ? mc.calcular(p) : null; return C ? X.mediaArea(C.grade, masc, G, nM) : null; }
    var pr = area('prec'), ap = area('aprec'), at = area('atmed');
    var catC = M.cache.catEst && M.cache.catEst.grade ? M.cache.catEst : (pronto('catEst').ok || /pendente/.test(pronto('catEst').motivo || '') ? calcular('catEst') : null);
    var catF = null; if (catC && catC.grade) { var gi = new Int8Array(catC.grade.length).fill(-1); for (var i = 0; i < gi.length; i++) if (isFinite(catC.grade[i])) gi[i] = N.classe(catC.grade[i], catC.es.lim); catF = X.fracaoClasses(gi, masc, G, 5); }
    var rMerge = M.resumo && M.resumo.meses.filter(function (x) { return x.p === chavePer(per); })[0];
    if (pr) R.prec = { mg: pr.mg, aprecMg: ap ? ap.mg : NaN, mesos: MESOS.features.map(function (f, k) { return { nome: f.properties.name, v: pr.mesos[k] }; }), maxEst: estacaoExtremo('PREC', 'acum', true) };
    if (catF || rMerge) R.cat = { frac: catF || rMerge.cat, base: catF ? 'estações do INMET comparadas com a própria normal 1991-2020' : 'satélite MERGE, base 1998-2025' };
    if (rMerge && isFinite(rMerge.spi3)) R.spi3 = rMerge.spi3;
    if (at) R.atmed = { mg: at.mg };
    R.tmax = { est: estacaoExtremo('TMAX', 'abs', true) }; R.tmin = { est: estacaoExtremo('TMIN', 'abs', false) };
    var d30 = mc._S.arqs.TMAX && mc._S.arqs.TMAX.temDias30 ? (M.cache.dias30 && M.cache.dias30.grade ? M.cache.dias30 : calcular('dias30')) : null;
    if (d30 && d30.grade) R.dias30 = { mg: X.mediaArea(d30.grade, masc, G, 0).mg, est: estacaoExtremo('TMAX', 'dias30', true) };
    // tabela
    linhas.push(['Minas Gerais', pr && pr.mg, ap && ap.mg, at && at.mg]);
    MESOS.features.forEach(function (f, k) { linhas.push([f.properties.name, pr && pr.mesos[k], ap && ap.mesos[k], at && at.mesos[k]]); });
    corpo.innerHTML = linhas.map(function (l, k) { return '<tr' + (k ? '' : ' style="font-weight:700"') + '><td>' + esc(l[0]) + '</td><td class="num">' + fmt(l[1], 1) + '</td><td class="num">' + fmt(l[2], 0) + '</td><td class="num">' + fmt(l[3], 2) + '</td></tr>'; }).join('');
    $('monCatRes').innerHTML = R.cat ? X.CATEGORIAS.map(function (c, k) { return '<span class="chip" style="background:' + c.cor + ';color:' + (k === 0 || k === 4 ? '#fff' : '#222') + '">' + esc(c.nome) + ': ' + fmt(100 * R.cat.frac[k], 0) + ' %</span>'; }).join(' ') + '<span class="small"> da área de Minas (' + esc(R.cat.base) + ')</span>' : '<span class="small">Categoria indisponível (precisa do MERGE do mês).</span>';
    var txt = X.texto(R).join('\n\n');
    if (!$('monTexto').dataset.editado || $('monTexto').dataset.per !== chavePer(per)) { $('monTexto').value = txt; $('monTexto').dataset.editado = ''; $('monTexto').dataset.per = chavePer(per); }
    M.resumoMes = { per: chavePer(per), prec: pr && pr.mg, aprec: ap && ap.mg, atmed: at && at.mg };
    serie();
  }
  // série de Minas (MERGE desde 1998): últimos 24 meses, barras = acumulado, linha = climatologia, cor = categoria
  function serie() {
    var el = $('monSerie'); if (!M.resumo) { el.innerHTML = '<div class="small">Série do MERGE ainda não carregada.</div>'; return; }
    var per = MC() && MC().periodoEscolhido(), lista = M.resumo.meses, fimI = lista.length - 1;
    if (per) { var k = chavePer(per); for (var i = 0; i < lista.length; i++) if (lista[i].p === k) fimI = i; }
    var ms = lista.slice(Math.max(0, fimI - 23), fimI + 1); if (!ms.length) { el.innerHTML = ''; return; }
    var W = 720, H = 220, pl = 40, pb = 34, pt = 10, mx = Math.max.apply(null, ms.map(function (m) { return Math.max(m.acum || 0, m.clim || 0); })) * 1.1 || 1;
    var bw = (W - pl - 10) / ms.length, y = function (v) { return pt + (H - pt - pb) * (1 - v / mx); };
    var corCat = function (m) { if (!m.cat) return '#9aa3af'; var big = 0; for (var c = 1; c < 5; c++) if (m.cat[c] > m.cat[big]) big = c; return X.CATEGORIAS[big].cor; };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Chuva média de Minas, últimos meses (MERGE)" style="width:100%;height:auto">';
    for (var t = 0; t <= 4; t++) { var v = mx / 4 * t; s += '<line x1="' + pl + '" x2="' + (W - 10) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="#e3e8ef"/><text x="' + (pl - 4) + '" y="' + (y(v) + 4) + '" font-size="10" text-anchor="end" fill="#5c6878">' + Math.round(v) + '</text>'; }
    ms.forEach(function (m, i) {
      var x = pl + i * bw;
      s += '<rect x="' + (x + 2) + '" y="' + y(m.acum || 0) + '" width="' + (bw - 4) + '" height="' + (y(0) - y(m.acum || 0)) + '" fill="' + corCat(m) + '" stroke="#5b6b7c" stroke-width=".5"><title>' + m.p + ': ' + fmt(m.acum, 0) + ' mm (normal ' + fmt(m.clim, 0) + ' mm; SPI-3 ' + fmt(m.spi3, 1) + ')</title></rect>';
      if (i % 3 === 0 || i === ms.length - 1) s += '<text x="' + (x + bw / 2) + '" y="' + (H - pb + 14) + '" font-size="10" text-anchor="middle" fill="#5c6878">' + m.p.slice(5) + '/' + m.p.slice(2, 4) + '</text>';
    });
    s += '<polyline fill="none" stroke="#1f2a37" stroke-width="1.6" stroke-dasharray="4 3" points="' + ms.map(function (m, i) { return (pl + i * bw + bw / 2).toFixed(1) + ',' + y(m.clim || 0).toFixed(1); }).join(' ') + '"/>';
    s += '<text x="' + pl + '" y="' + (H - 4) + '" font-size="10" fill="#5c6878">mm · barras: acumulado médio de MG (cor = categoria predominante) · tracejado: média 1998-2025</text></svg>';
    el.innerHTML = s;
  }

  /* ======================= histórico da validação ======================= */
  var NOMES_MET = { idw: 'IDW (padrão)', krig: 'Krigagem', rec: 'Recomendado', ked: 'Estações + satélite' };
  // calcula antes tudo o que falta (krigagem e recomendado de cada produto, estações + satélite) e só então registra
  function registrarMes() {
    var mc = MC(), per = mc.periodoEscolhido(); if (!per) return;
    if (TIPOS_PEND()) { registrarAgora(); return; }
    var prods = N.ORDEM.filter(function (p) { return mc._S.arqs[N.PRODUTOS[p].arq]; });
    prods.forEach(function (p) { mc.iniciarKrig(p); mc.iniciarRec(p); });
    if (M.merge && !M.cache.ked) calcular('ked');
    var b = $('monRegistrar'); b.disabled = true; var t0 = Date.now();
    (function esperar() {
      var falta = prods.filter(function (p) { var R = mc._S.cacheR[p]; return !mc.calcularKrig(p) || !(R && (R.pronto || R.erro)); }).length + (M.merge && M.cache.ked && M.cache.ked.calculando ? 1 : 0);
      if (falta && Date.now() - t0 < 180000) { $('monValSt').className = 'stbox'; $('monValSt').textContent = 'Calculando todos os métodos para registrar… faltam ' + falta + ' (cerca de 1 minuto no total).'; setTimeout(esperar, 700); return; }
      b.disabled = false; registrarAgora();
    })();
  }
  function registrarAgora() {
    var mc = MC(), per = mc.periodoEscolhido(); if (!per) return;
    if (TIPOS_PEND()) { $('monValSt').className = 'stbox aviso'; $('monValSt').textContent = 'Decida as estações pendentes antes de registrar: a validação tem de ser a dos mapas finais.'; return; }
    var k = chavePer(per), n = 0, faltam = [];
    N.ORDEM.forEach(function (p) {
      if (!mc._S.arqs[N.PRODUTOS[p].arq]) return;
      var C = mc.calcular(p), Kk = mc.calcularKrig(p), R = mc.calcularRec(p);
      [['idw', C && C.vc], ['krig', Kk && Kk.vc], ['rec', R && R.vc]].forEach(function (z) {
        if (z[1]) { M.hist = X.registrarValidacao(M.hist, { periodo: k, produto: p, metodo: z[0], n: z[1].n, mae: z[1].mae, rmse: z[1].rmse, vies: z[1].vies }); n++; }
        else if (z[0] !== 'idw') faltam.push(N.PRODUTOS[p].sigla + ' ' + NOMES_MET[z[0]]);
      });
    });
    var Kd = M.cache.ked; if (Kd && Kd.vc && !Kd.calculando) { M.hist = X.registrarValidacao(M.hist, { periodo: k, produto: 'prec', metodo: 'ked', n: Kd.vc.n, mae: Kd.vc.mae, rmse: Kd.vc.rmse, vies: Kd.vc.vies }); n++; } else faltam.push('PREC Estações + satélite');
    X.gravarHistorico(M.hist);
    $('monValSt').className = 'stbox ok';
    $('monValSt').innerHTML = '<strong>' + n + ' resultados de ' + esc(N.MESES_BR[per.mes - 1] + '/' + per.ano) + ' registrados</strong> neste navegador.' + (faltam.length ? ' Não calculados (abra o método na aba 2 ou o produto aqui e registre de novo): ' + esc(faltam.slice(0, 8).join(', ')) + (faltam.length > 8 ? '…' : '') + '.' : '') + ' Baixe o CSV para guardar no Drive.';
    validacao();
  }
  function TIPOS_PEND() { var mc = MC(); return ['PREC', 'TMAX', 'TMIN', 'TMED'].some(function (t) { return mc._S.arqs[t] && mc.contagem(t).pendente; }); }
  function validacao() {
    var el = $('monValTab'), p = M.histProd, h = M.hist.filter(function (x) { return x.produto === p; });
    $('monValProd').innerHTML = N.ORDEM.map(function (q) { return '<button type="button" data-p="' + q + '"' + (q === p ? ' class="on"' : '') + '>' + esc(N.PRODUTOS[q].sigla) + '</button>'; }).join('');
    if (!h.length) { el.innerHTML = '<p class="small">Nenhum mês registrado para ' + esc(N.PRODUTOS[p].titulo) + '. Registre cada mês depois de concluir a conferência.</p>'; $('monValGraf').innerHTML = ''; return; }
    var pers = [], mets = ['idw', 'krig', 'rec', 'ked'].filter(function (m) { return h.some(function (x) { return x.metodo === m; }); });
    h.forEach(function (x) { if (pers.indexOf(x.periodo) < 0) pers.push(x.periodo); });
    var val = function (per, m) { var r = h.filter(function (x) { return x.periodo === per && x.metodo === m; })[0]; return r ? r.mae : NaN; };
    var medias = mets.map(function (m) { var v = pers.map(function (q) { return val(q, m); }).filter(isFinite); return v.length ? v.reduce(function (a, b) { return a + b; }, 0) / v.length : NaN; });
    // comparação justa: só meses em que o método e o IDW existem
    var ganho = mets.map(function (m) { var a = 0, b = 0, n = 0; pers.forEach(function (q) { var x = val(q, m), y = val(q, 'idw'); if (isFinite(x) && isFinite(y)) { a += x; b += y; n++; } }); return n ? { g: 100 * (1 - a / b), n: n } : null; });
    el.innerHTML = '<div class="scroll"><table class="mtab"><thead><tr><th>Mês</th>' + mets.map(function (m) { return '<th class="num">' + esc(NOMES_MET[m]) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      pers.map(function (q) { var vs = mets.map(function (m) { return val(q, m); }), mn = Math.min.apply(null, vs.filter(isFinite)); return '<tr><td>' + q.slice(5) + '/' + q.slice(0, 4) + '</td>' + vs.map(function (v) { return '<td class="num"' + (v === mn ? ' style="font-weight:700;color:#16663a"' : '') + '>' + fmt(v, 2) + '</td>'; }).join('') + '</tr>'; }).join('') +
      '<tr style="border-top:2px solid var(--line)"><td><b>Média</b></td>' + medias.map(function (v) { return '<td class="num"><b>' + fmt(v, 2) + '</b></td>'; }).join('') + '</tr>' +
      '<tr><td>Em relação ao IDW</td>' + ganho.map(function (g, i) { return '<td class="num">' + (mets[i] === 'idw' || !g ? '—' : (g.g >= 0 ? '−' : '+') + fmt(Math.abs(g.g), 0) + ' % (' + g.n + ' m.)') + '</td>'; }).join('') + '</tr></tbody></table></div>' +
      '<p class="small">Erro médio absoluto (' + esc(N.PRODUTOS[p].unidade) + ') da validação cruzada nas estações de MG; em verde, o menor do mês. ' +
      (pers.length < 6 ? '<b>' + pers.length + ' de 6 meses mínimos</b> para começar a comparar; o recomendado é 12 (um ciclo seco e um chuvoso).' : pers.length < 12 ? '<b>' + pers.length + ' meses</b>: já dá para ver a tendência; o recomendado é 12 antes de mudar o método oficial.' : '<b>' + pers.length + ' meses</b>: série suficiente para a equipe decidir.') + '</p>';
    grafVal(pers, mets, val);
  }
  function grafVal(pers, mets, val) {
    var W = 720, H = 180, pl = 40, pb = 26, pt = 10, todos = []; pers.forEach(function (q) { mets.forEach(function (m) { var v = val(q, m); if (isFinite(v)) todos.push(v); }); });
    if (pers.length < 2) { $('monValGraf').innerHTML = ''; return; }
    var mx = Math.max.apply(null, todos) * 1.1, x = function (i) { return pl + (W - pl - 10) * i / (pers.length - 1); }, y = function (v) { return pt + (H - pt - pb) * (1 - v / mx); };
    var cores = { idw: '#1f2a37', krig: '#2563eb', rec: '#d97706', ked: '#16a34a' }, s = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto" role="img" aria-label="Erro da validação por mês">';
    for (var t = 0; t <= 3; t++) { var v = mx / 3 * t; s += '<line x1="' + pl + '" x2="' + (W - 10) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="#e3e8ef"/><text x="' + (pl - 4) + '" y="' + (y(v) + 4) + '" font-size="10" text-anchor="end" fill="#5c6878">' + fmt(v, 1) + '</text>'; }
    mets.forEach(function (m) { var pts = []; pers.forEach(function (q, i) { var v = val(q, m); if (isFinite(v)) pts.push(x(i).toFixed(1) + ',' + y(v).toFixed(1)); }); s += '<polyline fill="none" stroke="' + cores[m] + '" stroke-width="2" points="' + pts.join(' ') + '"/>'; });
    pers.forEach(function (q, i) { s += '<text x="' + x(i) + '" y="' + (H - 8) + '" font-size="10" text-anchor="middle" fill="#5c6878">' + q.slice(5) + '/' + q.slice(2, 4) + '</text>'; });
    s += '</svg><div class="leg-est">' + mets.map(function (m) { return '<span><i style="background:' + cores[m] + ';border-radius:2px"></i>' + esc(NOMES_MET[m]) + '</span>'; }).join('') + '</div>';
    $('monValGraf').innerHTML = s;
  }

  /* ======================= pluviômetros de outras redes ======================= */
  // CSV: código; nome; latitude; longitude; acumulado do mês (mm). Separador ; , ou TAB; vírgula ou ponto decimal no ;.
  // Conferência automática (sem decisão manual, para não misturar com o registro do INMET):
  //   inválida: coordenada fora da caixa da região, valor não numérico, < 0 ou > 2000 mm, código repetido;
  //   comparação com o MERGE pelo mesmo escore robusto das estações do INMET (mediana e MAD do próprio grupo + INMET):
  //   forte → fica de fora; atenção → entra, marcada.
  function lerExternos(txt, nome) {
    var L = String(txt).replace(/^﻿/, '').split(/\r?\n/).filter(function (l) { return l.trim(); }), out = [], vistos = {};
    if (L.length < 2) throw new Error('arquivo vazio');
    var sep = L[0].indexOf('\t') >= 0 ? '\t' : L[0].indexOf(';') >= 0 ? ';' : ',';
    L.slice(1, 3001).forEach(function (l, i) {
      var c = l.split(sep).map(function (x) { return x.trim().replace(/^"|"$/g, ''); });
      var e = { linha: i + 2, codigo: (c[0] || '').slice(0, 20), nome: (c[1] || '').slice(0, 60), lat: N.numero(c[2]), lon: N.numero(c[3]), v: N.numero(c[4]), status: 'ok', txt: '' };
      if (!e.codigo) { e.status = 'invalida'; e.txt = 'sem código'; }
      else if (vistos[e.codigo]) { e.status = 'invalida'; e.txt = 'código repetido'; }
      else if (!isFinite(e.lat) || !isFinite(e.lon) || e.lat < -25 || e.lat > -12.5 || e.lon < -53 || e.lon > -38) { e.status = 'invalida'; e.txt = 'coordenada fora da região'; }
      else if (!isFinite(e.v) || e.v < 0 || e.v > 2000) { e.status = 'invalida'; e.txt = 'acumulado inválido'; }
      vistos[e.codigo] = 1;
      if (e.status === 'ok') { e.dentroMG = N.mesoDoPonto(e.lon, e.lat, MESOS) >= 0; }
      out.push(e);
    });
    M.extNome = nome;
    return out;
  }
  function conferirExternos() {
    if (!M.ext.length) return;
    M.ext.forEach(function (e) { if (e.status !== 'invalida') { e.status = 'ok'; e.txt = ''; } });
    if (!M.merge) { M.ext.forEach(function (e) { if (e.status === 'ok') e.txt = 'sem MERGE do mês: não conferida contra o satélite'; }); return; }
    var mc = MC(), A = mc._S.arqs.PREC, lista = [];
    if (A) A.estacoes.forEach(function (e) { if (isFinite(e.sat) && isFinite(e.dados.acum) && e.gravidade !== 'invalida') lista.push({ chave: 'I' + N.chave(e), v: e.dados.acum, sat: e.sat }); });
    M.ext.forEach(function (e) { if (e.status === 'ok') { e.sat = X.amostrar(M.merge, 'acum', e.lon, e.lat); lista.push({ chave: 'E' + e.codigo, v: e.v, sat: e.sat }); } });
    var q = X.testeSatelite(lista);
    M.ext.forEach(function (e) {
      if (e.status !== 'ok') return; var r = q.res['E' + e.codigo]; if (!r || !r.g) return;
      if (r.g === 'forte') { e.status = 'fora'; e.txt = r.txt; } else e.txt = r.txt;
    });
  }
  function tabelaExternos() {
    var b = $('monExtBody'); conferirExternos();
    if (!M.ext.length) { b.innerHTML = '<tr><td colspan="5" class="small">Nenhum arquivo carregado.</td></tr>'; $('monExtRes').textContent = ''; return; }
    var c = { ok: 0, fora: 0, invalida: 0 }; M.ext.forEach(function (e) { c[e.status]++; });
    $('monExtRes').textContent = (M.extNome ? M.extNome + ': ' : '') + c.ok + ' aprovadas, ' + c.fora + ' fora (diferença forte para o satélite), ' + c.invalida + ' inválidas.';
    b.innerHTML = M.ext.slice(0, 400).map(function (e) {
      var ch = e.status === 'ok' ? '<span class="chip st-usada">Aprovada</span>' : e.status === 'fora' ? '<span class="chip st-retirada">Fora</span>' : '<span class="chip st-invalida">Inválida</span>';
      return '<tr><td>' + ch + '</td><td><b>' + esc(e.codigo) + '</b> ' + esc(e.nome) + '</td><td class="num">' + fmt(e.v, 1) + '</td><td class="num">' + fmt(e.sat, 1) + '</td><td class="small">' + esc(e.txt) + '</td></tr>';
    }).join('');
  }

  /* ======================= metodologia por produto ======================= */
  var MET = {
    catEst: '<p><b>1.</b> Para cada estação de chuva aprovada, a ferramenta lê no MERGE (ponto da estação, interpolação bilinear) a <b>forma da distribuição gama</b> da chuva daquele mês (α) e a <b>chance de mês seco</b> (p0), ajustadas pela coleta com 1998-2025.</p><p><b>2.</b> A média vem da própria estação: a <b>normal 1991-2020 do INMET</b> (coluna CLIMATOLOGIA do TXT). Média dos meses com chuva = normal ÷ (1 − p0); escala β = essa média ÷ α.</p><p><b>3.</b> Probabilidade do acumulado observado: H = p0 + (1 − p0)·Gama(α, β). <b>Percentil = 100·H</b>.</p><p><b>4.</b> O percentil das estações é interpolado por IDW (potência 2, igual ao mapa oficial) e classificado: &lt; 10 muito abaixo, 10–33 abaixo, 33–67 normal, 67–90 acima, &gt; 90 muito acima (tercis, com os decis extremos destacados, como nos boletins da OMM).</p><p><b>Limite:</b> mistura a média do INMET com a forma do MERGE (28 anos); nos meses secos (p0 alto, ex.: julho no norte) a categoria fica instável e a estação sai do cálculo quando p0 ≥ 0,95.</p>',
    catMerge: '<p>Só satélite + pluviômetros do CPTEC. Para cada ponto de 0,1° (~10 km): gama ajustada (máxima verossimilhança, aproximação de Thom) com o mesmo mês de 1998 a 2025; H = p0 + (1 − p0)·G(x); percentil = 100·H; mesmas 5 categorias. Serve de referência independente para a categoria das estações.</p><p><b>Base 1998-2025</b>, e não 1991-2020 (o MERGE começa em 1998).</p>',
    spi1: '<p><b>SPI</b> (McKee et al., 1993; Guia do Usuário do SPI, OMM-Nº 1090): a soma da chuva nos últimos <i>k</i> meses é comparada com as mesmas somas de 1998-2025 no ponto; gama ajustada (Thom); H transformada na normal padrão (SPI = Φ⁻¹(H)). Classes da OMM: ≤ −2 extremamente seco … ≥ 2 extremamente úmido.</p><p>SPI-1 = mês; SPI-3 = trimestre (agricultura, umidade do solo); SPI-6 = semestre (vazões e reservatórios).</p>',
    accMerge: '<p>Soma mensal do MERGE (arquivo mensal do CPTEC; para o mês mais recente, soma dos 28 a 31 arquivos diários, 12Z-12Z). Grade de 0,1° levada à grade do mapa por interpolação bilinear. Mesma escala automática do Acumulado das estações, para comparar.</p>',
    ked: '<p><b>1.</b> MERGE no ponto de cada estação aprovada (bilinear).</p><p><b>2.</b> Regressão linear por mínimos quadrados: estação = b0 + b1·MERGE (MG e entorno de 150 km).</p><p><b>3.</b> Resíduo de cada estação = valor − regressão; variograma exponencial e krigagem ordinária dos resíduos (20 vizinhas), as mesmas funções da krigagem dos Mapas Climáticos.</p><p><b>4.</b> Mapa = b0 + b1·MERGE + resíduo krigado, com piso de 0 mm. Nas estações, o mapa reproduz a estação; entre elas, o desenho vem do satélite.</p><p><b>5.</b> Validação cruzada: tira cada estação de MG, refaz regressão + variograma + krigagem sem ela e compara. Bloqueio quando R² &lt; 0,2 ou b1 ≤ 0.</p><p>É a forma prática da <b>krigagem com deriva externa</b>, a técnica mais usada para combinar estação e satélite.</p>',
    sigma: '<p>Desvio-padrão da krigagem ordinária do acumulado: σ² = C(0) − Σ wᵢ·C(xᵢ, x) − μ, com o variograma do mês e as 20 estações mais próximas. Depende só de onde estão as estações e do variograma: é grande onde faltam estações. <b>Não</b> mede erro de medição. Use para dizer onde o mapa é frágil.</p>',
    dias30: '<p>Contagem de dias com máxima ≥ 30 °C de cada estação (coluna do TXT da máxima, lida pela mesma linha do arquivo) interpolada por IDW (potência 2), só com as estações aprovadas na conferência da máxima.</p><p>É um índice de limiar fixo (do tipo SU/TX30 do ETCCDI). O índice de <b>dias quentes</b> da OMM (acima do percentil 90 de cada dia) precisa da série diária, que o TXT mensal não traz.</p>'
  };
  MET.spi3 = MET.spi1; MET.spi6 = MET.spi1;
  function metodologia(p) { $('monMet').innerHTML = MET[p] || ''; }

  /* ======================= abrir e eventos ======================= */
  function abrir() { statusMerge(); desenhar(); tabelaExternos(); }
  function iniciar() {
    if (!$('abaMonitor')) return;
    $('monProd').addEventListener('click', function (e) { var b = e.target.closest('[data-p]'); if (b) { M.prod = b.dataset.p; desenhar(); } });
    ['monCidades', 'monEst'].forEach(function (id) { $(id).addEventListener('change', desenhar); });
    $('monPng').addEventListener('click', png);
    $('monTif').addEventListener('click', function () { var C = M.cache[M.prod]; if (C && C.grade) exportarGrade('tif', C.grade, nomeArq(M.prod, 'x').replace(/\.x$/, '')); });
    $('monAsc').addEventListener('click', function () { var C = M.cache[M.prod]; if (C && C.grade) exportarGrade('asc', C.grade, nomeArq(M.prod, 'x').replace(/\.x$/, '')); });
    $('monTif2').addEventListener('click', function () { exportarAba2('tif'); });
    $('monAsc2').addEventListener('click', function () { exportarAba2('asc'); });
    $('monTexto').addEventListener('input', function () { $('monTexto').dataset.editado = '1'; });
    $('monCopiar').addEventListener('click', function () { var t = $('monTexto'); t.select(); try { navigator.clipboard.writeText(t.value); } catch (e) { document.execCommand('copy'); } $('monCopiar').textContent = 'Copiado'; setTimeout(function () { $('monCopiar').textContent = 'Copiar texto'; }, 1500); });
    $('monRefazer').addEventListener('click', function () { $('monTexto').dataset.editado = ''; $('monTexto').dataset.per = ''; resumo(); });
    $('monRegistrar').addEventListener('click', registrarMes);
    $('monValProd').addEventListener('click', function (e) { var b = e.target.closest('[data-p]'); if (b) { M.histProd = b.dataset.p; validacao(); } });
    $('monValCsv').addEventListener('click', function () { MC().baixar('Historico_validacao_MonitorClimatico.csv', new Blob([X.historicoCSV(M.hist)], { type: 'text/csv;charset=utf-8' })); });
    $('monValImp').addEventListener('change', function () {
      var f = this.files[0]; this.value = ''; if (!f || f.size > 1048576) return;
      f.text().then(function (t) { var novos = X.historicoDeCSV(t); novos.forEach(function (r) { M.hist = X.registrarValidacao(M.hist, r); }); X.gravarHistorico(M.hist); $('monValSt').className = 'stbox ok'; $('monValSt').textContent = novos.length + ' linhas importadas.'; validacao(); });
    });
    $('monExtArq').addEventListener('change', function () {
      var f = this.files[0]; this.value = ''; if (!f) return;
      if (f.size > 2 * 1048576) { $('monExtRes').textContent = 'Arquivo maior que 2 MB.'; return; }
      f.arrayBuffer().then(function (b) { try { M.ext = lerExternos(N.decodificar(new Uint8Array(b)).texto, f.name); } catch (e) { M.ext = []; $('monExtRes').textContent = 'Não foi possível ler: ' + e.message; } delete M.cache.ked; tabelaExternos(); if (M.prod === 'ked') desenhar(); });
    });
    $('monExtUsar').addEventListener('change', function () { M.extUsar = this.checked; delete M.cache.ked; if (M.prod === 'ked') desenhar(); });
    $('monExtModelo').addEventListener('click', function () { MC().baixar('modelo_pluviometros.csv', new Blob(['﻿codigo;nome;latitude;longitude;acumulado_mm\r\n2043010;Exemplo (ANA);-19,92;-43,94;123,4\r\n'], { type: 'text/csv;charset=utf-8' })); });
    statusMerge();
  }
  window.MonitorPainel = { aposLer: aposLer, aposConferir: aposConferir, dadosMudaram: dadosMudaram, abrir: abrir, _M: M, calcular: calcular, PRODS: PRODS };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
