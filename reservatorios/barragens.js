/*
 * Aba "Barragens e municípios" da ferramenta Reservatórios e Tendência (v0.1, 13/11/2026, Patrick/Claude) — SIMGE/IGAM
 *
 * Produtos: "Previsão para as próximas 72/96 horas — Barragens níveis 2 e 3 - MG" e "— Brumadinho - MG" (ou outro município).
 * Mesma metodologia das outras abas: chuva acumulada do GFS 0,25° (dado bruto da NOAA, reservatorios/gfs/<ciclo>/gfs.json).
 *
 * A aba é criada por este arquivo (botão + painel), para a página oficial só precisar de 2 linhas <script>.
 * Independente do app.js (que roda fechado numa função): só usa reservatorios/barragens-nucleo.js e window.CIDADES
 * (chuva/data/cidades.js, já carregado na página). Quando a aba abre, carrega: municípios (alertas/data/municipios.js),
 * logos (assets/logo_simge.png e logo_igam.png) e, só para o PDF, o jsPDF (previsao/lib/jspdf.umd.min.js).
 *
 * Visualizações (todas no layout padrão da plataforma, assets/layout-mapa.js):
 *   Minas Gerais · Zoom na região · Média por município · Dia a dia
 * Critério de emissão: padrão 100 mm em um dia ou 100 mm em 72 h na região (Manual de Procedimentos); ajustável na tela.
 */
(function () {
  'use strict';
  if (typeof BarragensNucleo === 'undefined') { console.error('barragens.js: falta reservatorios/barragens-nucleo.js'); return; }
  var N = BarragensNucleo;
  var VERSAO_ABA = '0.1';
  var SRC = (document.currentScript && document.currentScript.src) || '';
  var QV = (SRC.split('?')[1] || '');
  var BASE = window.BASE_DADOS || '../';

  /* ---------------- lista de barragens padrão ----------------
   * Cópia do BARRAGENS.txt do projeto QGIS da equipe (03_projeto_CHUVA, recebido em 13/11/2026), sem alterações.
   * Pode ser trocada na tela por um BARRAGENS.txt novo (mesmo formato). */
  var BARRAGENS_TXT_PADRAO = [
    'LATITUDE\tLONGITUDE\tNOME_SIGBM\tNOME_BDA\tMUNICIPIO\tDPA_ANM\tEMERGENCIA',
    '-20.4148\t-43.8650\tGrupo\tGRUPO\tOuro Preto\tAlto\tNível 2',
    '-20.2895\t-44.0055\tBARRAGEM XINGU\tMINA DE ALEGRIA\t MARIANA\tAlto\tNível 2',
    '-20.4062\t-43.8559\tForquilha I\tFORQUILHA I\tOuro Preto\tAlto\tNível 3',
    '-20.4085\t-43.8517\tForquilha II\tFORQUILHA II\tOuro Preto\tAlto\tNível 2',
    '-20.401980\t-43.851761\tDIQUE DE PEDRA\tMINA DE FÁBRICA\tOuro Preto\tALTO\tNível 2',
    '-20.0460\t-43.9550\tB3/B4\tB4 - MINA MAR AZUL\tNova Lima\tAlto\tNível 2',
    '-20.1378\t-44.3955\tBarragem de Rejeitos\tBARRAGEM DE REJEITOS\tItatiaiuçu\tAlto\tNível 3',
    '-19.9695\t-43.5968\tSul Superior\tSUL SUPERIOR\tBarão de Cocais\tAlto\tNível 3',
    '-20.4115\t-43.8368\tForquilha III\tFORQUILHA III\tOuro Preto\tAlto\tNível 3',
    '-22.2271\t-45.9394\tPouso Alegre\tPouso Alegre\tPouso Alegre'
  ].join('\n');

  // cor do losango por nível de emergência (N2 = vermelho do boletim; N3 mais escuro; N1 laranja; sem nível = cinza)
  // 13/11/2026: cores dos níveis de emergência no padrão usado para barragens (N1 amarelo, N2 laranja, N3 vermelho),
  // com contorno escuro para destacar sobre o azul da chuva. Antes: N3 vinho e N2 vermelho (pouca diferença entre eles).
  var COR_NIVEL = { 3: '#d7191c', 2: '#fd8d3c', 1: '#ffd92f', 0: '#8c8c8c' };
  var CONTORNO_BARRAGEM = '#1a1a1a';
  function corB(b) { return COR_NIVEL[b && b.nv != null ? b.nv : 0]; }
  function nivelInt(t) { var m = /n[ií]vel\s*([0-3])|\bN\s*([0-3])\b/i.exec(String(t || '')); return m ? +(m[1] || m[2]) : null; }

  var REPRES = [   // 13/11/2026 (v0.2): todas no layout padrão da plataforma
    { id: 'estado', nome: 'Minas Gerais', desc: 'Mapa de Minas inteiro, igual aos outros mapas da plataforma, com a chuva suavizada.' },
    { id: 'regiao', nome: 'Zoom na região', desc: 'Recorte automático na região (barragens ou município e entorno): limites municipais, nomes e cidades.' },
    { id: 'municipio', nome: 'Média por município', desc: 'No mesmo recorte, cada município pintado pela chuva média na área dele (o número que vai no texto).' },
    { id: 'diario', nome: 'Dia a dia', desc: 'Um mapa para cada dia, o total e o gráfico da chuva de cada dia nos municípios monitorados.' }
  ];

  /* ---------------- utilidades ---------------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim(); }
  function f1(v) { return isFinite(v) ? v.toFixed(1).replace('.', ',') : '—'; }
  function f0(v) { return isFinite(v) ? String(Math.round(v)) : '—'; }
  function mm(v) { return Math.round(v * 100) / 100; }
  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  function dataExtenso(iso) { var p = iso.split('-'); return (+p[2]) + ' de ' + MESES[+p[1] - 1] + ' de ' + p[0]; }
  function lista(arr) { return arr.length <= 1 ? (arr[0] || '') : arr.slice(0, -1).join(', ') + ' e ' + arr[arr.length - 1]; }
  function carregarScript(src) {
    return new Promise(function (ok, erro) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = function () { erro(new Error('não carregou ' + src)); }; document.head.appendChild(s); });
  }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }

  /* ---------------- estado ---------------- */
  var S = { figOp: null, anm: null, anmStatus: null, anmErro: null, fonte: 'anm', listaEquipe: [], meso: null, logos: {}, J: null, ciclo: null, mun: null, munIdx: null, barragens: [], avisosLista: [], origemLista: 'padrão', repr: 'estado', fig: null, calc: null, carregando: null };

  /* ---------------- lista de barragens ---------------- */
  function lerBarragensTxt(txt) {
    var linhas = String(txt || '').replace(/^﻿/, '').split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (linhas.length < 2) throw new Error('o arquivo não tem linhas de barragens');
    var sep = linhas[0].indexOf('\t') >= 0 ? '\t' : (linhas[0].indexOf(';') >= 0 ? ';' : null);
    if (!sep) throw new Error('o arquivo não é separado por tabulação (como o BARRAGENS.txt)');
    var cab = linhas[0].split(sep).map(norm), col = function (n) { return cab.indexOf(n); };
    var iLa = col('LATITUDE'), iLo = col('LONGITUDE'), iNo = col('NOME_SIGBM'), iBd = col('NOME_BDA'), iMu = col('MUNICIPIO'), iNi = col('EMERGENCIA'), iDp = col('DPA_ANM');
    if (iLa < 0 || iLo < 0 || iMu < 0 || (iNo < 0 && iBd < 0)) throw new Error('faltam colunas: LATITUDE, LONGITUDE, NOME_SIGBM/NOME_BDA e MUNICIPIO');
    var out = [], avisos = [];
    linhas.slice(1).forEach(function (l, i) {
      var c = l.split(sep).map(function (x) { return x.trim(); }), n = i + 2;
      var lat = parseFloat((c[iLa] || '').replace(',', '.')), lon = parseFloat((c[iLo] || '').replace(',', '.'));
      var nome = (iNo >= 0 && c[iNo]) || (iBd >= 0 && c[iBd]) || '';
      if (!isFinite(lat) || !isFinite(lon) || lat < -23.5 || lat > -14 || lon < -51.2 || lon > -39.8) { avisos.push('Linha ' + n + ' (' + (nome || 'sem nome') + '): coordenada inválida ou fora de Minas — não entrou.'); return; }
      var nivel = iNi >= 0 ? (c[iNi] || '') : '';
      out.push({ linha: n, lat: lat, lon: lon, nome: nome, nomeBda: (iBd >= 0 && c[iBd]) || nome, municipio: (c[iMu] || '').replace(/\s+/g, ' '), dpa: iDp >= 0 ? (c[iDp] || '') : '', nivel: nivel });
    });
    if (!out.length) throw new Error('nenhuma barragem válida no arquivo');
    return { lista: out, avisos: avisos };
  }
  function conferirBarragens() {
    // depois que os municípios carregam: município da coordenada x município do cadastro
    var F = S.mun ? S.mun.features : [];
    S.barragens.forEach(function (b) {
      var m = null; for (var i = 0; i < F.length; i++) { var bb = F[i]._bb || (F[i]._bb = N.caixa(F[i].geometry)); if (b.lon >= bb[0] && b.lon <= bb[2] && b.lat >= bb[1] && b.lat <= bb[3] && N.dentro(b.lon, b.lat, F[i].geometry)) { m = F[i]; break; } }
      b.munCoord = m ? m.properties.nome : '';
      b.munCad = S.munIdx ? S.munIdx[norm(b.municipio)] : null;
      b.avisos = [];
      if (!b.munCad) b.avisos.push('município “' + b.municipio + '” não encontrado na lista do IBGE');
      if (m && b.munCad && m !== b.munCad) b.avisos.push('a coordenada cai em ' + m.properties.nome + ', não em ' + b.munCad.properties.nome);
      if (b.nv == null) b.avisos.push(b.nivel ? 'nível “' + b.nivel + '” não reconhecido' : 'sem nível de emergência na lista');
    });
  }

  /* ---------------- dados ---------------- */
  async function garantirMunicipios() {
    if (S.mun) return;
    var q = QV ? '?' + QV : '';
    var tarefas = [];
    if (!window.MUNICIPIOS_MG) tarefas.push(carregarScript(BASE + 'alertas/data/municipios.js' + q));
    tarefas.push(carregarLogo('simge', 'assets/logo_simge.png'), carregarLogo('igam', 'assets/logo_igam.png'));
    await Promise.all(tarefas);
    if (!window.MUNICIPIOS_MG) throw new Error('limites municipais indisponíveis');
    if (typeof GEO === 'undefined' || !window.LayoutMapa) throw new Error('layout dos mapas indisponível (previsao/data/geo.js e assets/layout-mapa.js)');
    S.mun = window.MUNICIPIOS_MG; S.munIdx = {};
    S.mun.features.forEach(function (f) { S.munIdx[norm(f.properties.nome)] = f; });
  }
  // logo como data URL (para entrar no SVG, no PNG e no PDF); sem o arquivo, a figura sai sem o logo
  function carregarLogo(k, cam) {
    return fetch(BASE + cam).then(function (r) { if (!r.ok) throw new Error(); return r.blob(); }).then(function (bl) {
      return new Promise(function (ok) { var fr = new FileReader(); fr.onload = function () {
        var im = new Image(); im.onload = function () { S.logos[k] = { url: fr.result, w: im.naturalWidth, h: im.naturalHeight }; ok(); }; im.onerror = function () { ok(); }; im.src = fr.result; }; fr.onerror = function () { ok(); }; fr.readAsDataURL(bl); });
    }).catch(function () { console.warn('logo não carregado: ' + cam); });
  }
  function cidadesRef() {
    var fs = (window.CIDADES && window.CIDADES.features) || [];
    return fs.map(function (f) { return [f.properties.NM_LOCAL_1 || f.properties.NM_MUNICIP || '', f.geometry.coordinates[0], f.geometry.coordinates[1]]; }).filter(function (c) { return c[0] && isFinite(c[1]) && isFinite(c[2]); });
  }
  function fmtDataHora(iso) { if (!iso) return '—'; var d = new Date(iso); if (isNaN(d)) return '—'; return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  function baixarCsv(rows, nome) {
    var csv = rows.map(function (r) { return r.map(function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }).join(';'); }).join('\r\n');
    baixar(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }), nome);
  }
  async function garantirJsPdf() {
    if (window.jspdf && window.jspdf.jsPDF) return;
    await carregarScript(BASE + 'previsao/lib/jspdf.umd.min.js' + (QV ? '?' + QV : ''));
  }
  async function buscarGfs() {
    var c = $('brCiclo').value, btn = $('brBuscar');
    btn.disabled = true; status('Buscando a rodada <b>' + c + 'Z</b> do GFS…');
    try {
      await garantirMunicipios();
      var r = await fetch(BASE + 'reservatorios/gfs/' + c + '/gfs.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error('ainda não há dados do GFS para o ciclo ' + c + 'Z');
      var j = N.validar(await r.json());
      S.J = j; S.ciclo = c; S.calc = null;
      conferirBarragens();
      status('Rodada <b>' + c + 'Z de ' + N.br(j.data_ciclo) + '</b> carregada (baixada em ' + esc(fmtDataHora(j.baixado_em)) + '). Somas dos dias conferidas com o acumulado de 72 h e 96 h.', 'ok');
      gerar();
    } catch (e) {
      if (!e.faltamProdutos) console.error(e);
      S.J = null; S.calc = null; S.fig = null; habilitar(false);   // não deixa na tela números de outra rodada
      $('brMapa').innerHTML = ''; $('brTabMun').innerHTML = ''; $('brTabBarr').innerHTML = ''; $('brDias').innerHTML = ''; $('brTexto').value = '';
      status(e.faltamProdutos
        ? '<b>O arquivo do GFS desta rodada ainda não tem a chuva de cada dia.</b> O coletor foi atualizado para gerar o acumulado de 96 h e os dias 1 a 4; eles aparecem na próxima atualização automática (a cada 2 horas). Tente de novo mais tarde.'
        : 'Não foi possível usar o GFS: ' + esc(e.message), 'erro');
    } finally { btn.disabled = false; }
  }
  function status(html, tipo) { var el = $('brStatus'); el.innerHTML = html; el.className = 'status' + (tipo ? ' br-' + tipo : ''); }

  /* ---------------- opções da tela ---------------- */
  function opcoes() {
    var produto = $('brProduto').value, h = +$('brHorizonte').value;
    var munNome = produto === 'brumadinho' ? 'Brumadinho' : $('brMunicipio').value;
    if (produto === 'brumadinho') produto = 'municipio';
    return { produto: produto, horas: h, escala: escalaComPaleta(N.ESCALAS[$('brEscala').value] || N.ESCALAS.boletim), escalaId: $('brEscala').value, munNome: munNome,
      cidades: $('brCidades').checked, niveis: niveisEscolhidos(), raio: +$('brRaio').value, crit: criterioTela() };
  }
  // municípios monitorados: os das barragens (cadastro) ou o município escolhido
  function monitorados(o) {
    var out = [];
    if (o.produto === 'barragens') {
      S.barragens.forEach(function (b) { var f = b.munCad || (S.munIdx && S.munIdx[norm(b.munCoord)]); if (f && out.indexOf(f) < 0) out.push(f); });
    } else {
      var f = S.munIdx && S.munIdx[norm(o.munNome)]; if (f) out.push(f);
    }
    return out;
  }

  /* ---------------- cálculo ---------------- */
  // gatilho no município: maior chuva de um dia e maior soma de 72 h entre os pontos dentro do limite
  function gatilhoMunicipio(J, f, dias, crit) {
    crit = N.criterio(crit);
    var pts = f._amostras || (f._amostras = N.amostras(f)), g = J.grade;
    var porDia = dias.map(function (k) { var mx = -Infinity; pts.forEach(function (p) { var v = N.bilinear(g, J.produtos[k].mm, p[0], p[1]); if (v > mx) mx = v; }); return mx; });
    var jan = [];
    for (var a = 0; a + 3 <= dias.length; a++) { var mx = -Infinity; pts.forEach(function (p) { var s = 0; for (var k = a; k < a + 3; k++) s += N.bilinear(g, J.produtos[dias[k]].mm, p[0], p[1]); if (s > mx) mx = s; }); jan.push({ ini: a, fim: a + 2, mm: mx }); }
    var dm = Math.max.apply(null, porDia), j72 = jan.reduce(function (b, x) { return !b || x.mm > b.mm ? x : b; }, null), mot = [];
    if (crit.dia != null && dm >= crit.dia) mot.push('dia'); if (crit.h72 != null && j72 && j72.mm >= crit.h72) mot.push('72h');
    return { porDia: porDia, diaMax: dm, iDia: porDia.indexOf(dm), janelas: jan, max72: j72, dispara: mot.length > 0, motivos: mot };
  }
  function calcular(o) {
    var J = S.J, H = N.HORIZONTES[o.horas], prods = [H.total].concat(H.dias);
    var mons = monitorados(o);
    var linhas = mons.map(function (f) {
      var e = N.estatMunicipio(J, f, prods, 'suave');
      return { f: f, nome: f.properties.nome, total: e[H.total], dias: H.dias.map(function (d) { return e[d]; }), faixa: N.faixa(e[H.total].p10, e[H.total].p90) };
    });
    var pontos = o.produto === 'barragens' ? S.barragens.map(function (b) {
      return { b: b, bruto: N.celula(J.grade, J.produtos[H.total].mm, b.lon, b.lat), suave: N.bilinear(J.grade, J.produtos[H.total].mm, b.lon, b.lat),
        dias: H.dias.map(function (d) { return N.bilinear(J.grade, J.produtos[d].mm, b.lon, b.lat); }),
        gat: N.gatilho(J, b.lon, b.lat, o.raio, H.dias, o.crit) };
    }) : [];
    // Brumadinho / município: gatilho no município (maior valor dentro do limite)
    var gatMun = o.produto !== 'barragens' && mons[0] ? gatilhoMunicipio(J, mons[0], H.dias, o.crit) : null;
    var jan = N.janelas(J, o.horas);
    // faixa de cada dia: da menor à maior média dos municípios monitorados (como o "Acumulados totais" do boletim)
    var diasTxt = jan.map(function (w, k) {
      var meds = linhas.map(function (l) { return l.dias[k].media; }), maxs = linhas.map(function (l) { return l.dias[k].max; });
      return { w: w, faixa: linhas.length ? N.faixa(Math.min.apply(null, meds), Math.max.apply(null, meds)) : '—', maxMun: linhas.length ? Math.max.apply(null, maxs) : NaN };
    });
    // produto município: barragens da ANM (nível ≥ 1) dentro do município, só para localizar no mapa
    var barrMun = [];
    if (o.produto !== 'barragens' && S.anm && mons[0]) S.anm.barragens.forEach(function (b) {
      if (!(b.nivel >= 1) || b.pendencia || !N.dentro(b.lon, b.lat, mons[0].geometry)) return;
      barrMun.push({ lat: b.lat, lon: b.lon, nome: b.nome, municipio: b.municipio, nivel: 'Nível ' + b.nivel, nv: b.nivel, fonte: 'ANM' });
    });
    var dispara = o.produto === 'barragens' ? pontos.some(function (p) { return p.gat.dispara; }) : !!(gatMun && gatMun.dispara);
    return { o: o, H: H, mons: mons, linhas: linhas, pontos: pontos, jan: jan, diasTxt: diasTxt, gatMun: gatMun, dispara: dispara, barrMun: barrMun,
      periodo: N.br(jan[0].data) + ' a ' + N.br(jan[jan.length - 1].data) };
  }

  /* =====================================================================================
   * DESENHO — 13/11/2026 (v0.2): TODAS as figuras no layout padrão da plataforma (assets/layout-mapa.js):
   * cabeçalho, coluna de legenda, "VÁLIDO", créditos e rodapé iguais aos outros mapas. Nada de blocos do GFS:
   * a chuva é sempre a interpolação bilinear desenhada como imagem fina (sem degraus).
   *   estado    — Minas inteira (o mapa de Minas do LayoutMapa + chuva suavizada)
   *   regiao    — recorte automático (barragens ou município e entorno), limites municipais, nomes
   *   municipio — recorte com cada município pintado pela chuva média (a unidade do texto)
   *   diario    — no mesmo layout: um mapa por dia, o total e o gráfico por município
   * ===================================================================================== */
  var PAG = { w: 297, h: 210 };
  var NAVY = '#092b6a', FONTE = "Arial, 'Liberation Sans', Helvetica, sans-serif";
  var uid = 0;
  var medidor = document.createElement('canvas').getContext('2d');
  function larguraTexto(t, tam, peso) { medidor.font = (peso || 400) + ' 100px ' + FONTE; return medidor.measureText(String(t)).width * tam / 100; }
  function LM() { return window.LayoutMapa; }
  function bbGeom(f) { return f._bb || (f._bb = N.caixa(f.geometry)); }
  function cruza(bb, e) { return !(bb[2] < e.x0 || bb[0] > e.x1 || bb[3] < e.y0 || bb[1] > e.y1); }
  function caminho(geom, P) {
    var s = '', pol = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
    pol.forEach(function (p) { p.forEach(function (ring) {
      var ult = null;
      ring.forEach(function (c, i) { var t = P.X(c[0]).toFixed(2) + ' ' + P.Y(c[1]).toFixed(2); if (i && t === ult) return; s += (i ? 'L' : 'M') + t; ult = t; });
      s += 'Z';
    }); });
    return s;
  }
  function hexRgbArr(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  function hexRgb(h) { return 'rgb(' + hexRgbArr(h).join(',') + ')'; }
  function corClasse(v, esc) { return esc.cores[N.classe(v, esc.lim)]; }
  function texto(x, y, t, tam, op) {
    op = op || {};
    var a = ' font-family="' + FONTE + '" font-size="' + mm(tam) + '"' + (op.peso ? ' font-weight="' + op.peso + '"' : '') + (op.anc ? ' text-anchor="' + op.anc + '"' : '') + ' fill="' + (op.cor || '#000') + '"';
    if (op.halo) a += ' stroke="#fff" stroke-width="' + mm(op.halo === true ? tam * 0.25 : op.halo) + '" stroke-linejoin="round" paint-order="stroke"';
    return '<text x="' + mm(x) + '" y="' + mm(y) + '"' + a + '>' + esc(t) + '</text>';
  }
  function losango(x, y, r, cor) { return '<path d="M' + mm(x) + ' ' + mm(y - r) + 'L' + mm(x + r) + ' ' + mm(y) + 'L' + mm(x) + ' ' + mm(y + r) + 'L' + mm(x - r) + ' ' + mm(y) + 'Z" fill="' + cor + '" stroke="' + CONTORNO_BARRAGEM + '" stroke-width="0.3"/>'; }
  function tituloProduto(o) {
    if (o.produto !== 'barragens') return o.munNome + ' - MG';
    var nv = (o.niveis || [2, 3]).slice().sort();
    return 'Barragens ' + (nv.length > 1 ? 'níveis ' + lista(nv.map(String)) : 'nível ' + nv[0]) + ' - MG';
  }
  function tituloCurto(o) { return o.produto === 'barragens' ? tituloProduto(o).replace(' - MG', '') : o.munNome; }

  // chuva interpolada (bilinear) como imagem: e = extensão em graus, W × H pixels; fora da grade fica transparente
  function rasterChuva(m, e, W, H, esc) {
    W = Math.max(40, Math.min(2600, Math.round(W))); H = Math.max(40, Math.min(2000, Math.round(H)));
    var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var c = cv.getContext('2d'), img = c.createImageData(W, H), d = img.data, cores = esc.cores.map(hexRgbArr), g = S.J.grade;
    for (var j = 0; j < H; j++) {
      var lat = e.y1 - (j + 0.5) / H * (e.y1 - e.y0);
      for (var i = 0; i < W; i++) {
        var v = N.bilinear(g, m, e.x0 + (i + 0.5) / W * (e.x1 - e.x0), lat), o = (j * W + i) * 4;
        if (!isFinite(v)) continue;
        var cc = cores[N.classe(v, esc.lim)]; d[o] = cc[0]; d[o + 1] = cc[1]; d[o + 2] = cc[2]; d[o + 3] = 255;
      }
    }
    c.putImageData(img, 0, 0);
    return cv.toDataURL('image/png');
  }
  // projeção do recorte: graus iguais nos dois eixos (igual ao LayoutMapa), preenchendo a área w × h (mm) a partir de (ox, oy)
  function projRecorte(ext, w, h, ox, oy) {
    var k = Math.min(w / (ext.x1 - ext.x0), h / (ext.y1 - ext.y0)), cx = (ext.x0 + ext.x1) / 2, cy = (ext.y0 + ext.y1) / 2;
    var e = { x0: cx - w / k / 2, x1: cx + w / k / 2, y0: cy - h / k / 2, y1: cy + h / k / 2 };
    ox = ox || 0; oy = oy || 0;
    return { e: e, k: k, r: { x: ox, y: oy, w: w, h: h }, X: function (lon) { return ox + (lon - e.x0) * k; }, Y: function (lat) { return oy + (e.y1 - lat) * k; } };
  }
  // extensão que envolve os municípios monitorados e as barragens, com margem
  function extRegiao(C, margem, minW) {
    var b = [Infinity, Infinity, -Infinity, -Infinity];
    function add(lo, la) { b[0] = Math.min(b[0], lo); b[1] = Math.min(b[1], la); b[2] = Math.max(b[2], lo); b[3] = Math.max(b[3], la); }
    C.mons.forEach(function (f) { var bb = bbGeom(f); add(bb[0], bb[1]); add(bb[2], bb[3]); });
    barrMapa(C).forEach(function (x) { add(x.lon, x.lat); });
    if (!isFinite(b[0])) return { x0: -44.6, x1: -43.2, y0: -20.6, y1: -19.6 };
    var w = Math.max(minW || 0.8, b[2] - b[0] + 2 * margem), h = Math.max((minW || 0.8) * 0.75, b[3] - b[1] + 2 * margem), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    return { x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2 };
  }
  function dms(v, lat) { var a = Math.abs(v), g = Math.floor(a + 1e-9), mi = Math.round((a - g) * 60); if (mi === 60) { g++; mi = 0; } return g + '°' + ('0' + mi).slice(-2) + '\'00"' + (lat ? 'S' : 'W'); }
  function gradeRecorte(P) {
    var dx = P.e.x1 - P.e.x0, passo = dx > 6 ? 1.5 : dx > 3 ? 1 : dx > 1.6 ? 0.5 : 0.25, out = { lat: [], lon: [] };
    for (var lo = Math.ceil(P.e.x0 / passo) * passo; lo <= P.e.x1; lo += passo) { var x = P.X(lo); if (x > 12 && x < P.r.w - 12) out.lon.push([x, dms(lo, false)]); }
    for (var la = Math.ceil(P.e.y0 / passo) * passo; la <= P.e.y1; la += passo) { var y = P.Y(la); if (y > 12 && y < P.r.h - 12) out.lat.push([y, dms(la, true)]); }
    return out;
  }
  function escalaRecorte(P) {
    var kmMm = 111.32 * Math.cos(((P.e.y0 + P.e.y1) / 2) * Math.PI / 180) / P.k;   // km por mm
    var passo = [1, 2, 5, 10, 20, 25, 50, 100].filter(function (p) { return p / kmMm <= 14; }).pop() || 1;
    return { seg: passo / kmMm, rotulos: ['0', String(passo), String(2 * passo)] };
  }
  function cidadesNoRecorte(P) {
    return cidadesRef().filter(function (c) { return c[1] > P.e.x0 && c[1] < P.e.x1 && c[2] > P.e.y0 && c[2] < P.e.y1; });
  }

  /* ---------- rótulos sem sobreposição (mm) ---------- */
  function Rotulador() { this.caixas = []; }
  Rotulador.prototype.livre = function (b) { return !this.caixas.some(function (o) { return !(b[2] < o[0] || b[0] > o[2] || b[3] < o[1] || b[1] > o[3]); }); };
  Rotulador.prototype.ocupar = function (b) { this.caixas.push(b); };
  // tenta as posições na ordem; devolve {x, y, anc} ou null
  Rotulador.prototype.colocar = function (x, y, t, tam, peso, folga, lados) {
    var w = larguraTexto(t, tam, peso), h = tam * 1.05, self = this, res = null;
    (lados || ['direita', 'esquerda', 'acima', 'abaixo']).some(function (l) {
      var bx, tx, ty, anc;
      if (l === 'direita') { tx = x + folga; ty = y + tam * 0.35; anc = 'start'; bx = [tx, y - h / 2, tx + w, y + h / 2]; }
      else if (l === 'esquerda') { tx = x - folga; ty = y + tam * 0.35; anc = 'end'; bx = [tx - w, y - h / 2, tx, y + h / 2]; }
      else if (l === 'acima') { tx = x; ty = y - folga - tam * 0.2; anc = 'middle'; bx = [x - w / 2, ty - h + tam * 0.2, x + w / 2, ty + tam * 0.2]; }
      else if (l === 'abaixo') { tx = x; ty = y + folga + tam * 0.85; anc = 'middle'; bx = [x - w / 2, ty - tam * 0.85, x + w / 2, ty + tam * 0.25]; }
      else { tx = x; ty = y + tam * 0.35; anc = 'middle'; bx = [x - w / 2, y - h / 2, x + w / 2, y + h / 2]; }
      if (self.livre(bx)) { self.ocupar(bx); res = { x: tx, y: ty, anc: anc }; return true; }
      return false;
    });
    return res;
  };

  // barragens próximas (no desenho) viram um marcador só, com os nomes juntos
  // barragens desenhadas: as escolhidas (produto Barragens) ou, no produto município, as da ANM com nível ≥ 1 dentro dele
  function barrMapa(C) { return C.o.produto === 'barragens' ? S.barragens : (C.barrMun || []); }
  function gruposBarragens(P, distMm, lista) {
    var gr = [];
    lista.forEach(function (b) {
      var x = P.X(b.lon), y = P.Y(b.lat), g = null;
      for (var k = 0; k < gr.length; k++) if (Math.hypot(gr[k].x - x, gr[k].y - y) < distMm) { g = gr[k]; break; }
      if (!g) { g = { x: x, y: y, lon: b.lon, lat: b.lat, itens: [] }; gr.push(g); }
      g.itens.push(b);
    });
    gr.forEach(function (g) { g.nv = Math.max.apply(null, g.itens.map(function (b) { return b.nv || 0; })); g.nome = juntarNomes(g.itens.map(function (b) { return b.nome.replace(/^Barragem\s+(de\s+)?/i, ''); })); });
    return gr;
  }
  // "Forquilha II", "Forquilha III" -> "Forquilha II e III"; mais de 3 nomes -> "Nome +N"
  function juntarNomes(n) {
    if (n.length === 1) return n[0];
    var p = n.map(function (x) { return x.split(/\s+/); }), w = p[0][0];
    if (n.length <= 3 && p.every(function (x) { return x[0] === w && x.length > 1; })) return w + ' ' + lista(p.map(function (x) { return x.slice(1).join(' '); }));
    var curtos = n.map(function (x) { return x.replace(/^(Barragem|Dique)\s+(de\s+)?/i, ''); }), junto = lista(curtos);
    if (n.length <= 4 && junto.length <= 28) return junto;   // ex.: "B1A, Quéias, B3 e B4"
    return n.length > 2 ? n[0] + ' +' + (n.length - 1) : n.join(' / ');
  }

  /* ---------- miolo de um recorte (zoom): chuva, limites, municípios, cidades, barragens ---------- */
  function mioloRecorte(C, P, m, op) {
    var o = C.o, esc = o.escala, id = 'b' + (++uid), R = P.r, s = '';
    var rot = op.rot || new Rotulador();
    // limites (estado, mesorregiões, municípios) = os mesmos do mapa de Minas (geo.js do LayoutMapa), só reescalados para o recorte:
    // linhas únicas e coerentes com os outros mapas (sem linha dupla entre municípios vizinhos)
    var A = LM().MAPA, Kf = A.wTotal / (A.xmax - A.xmin), sc = P.k / Kf;
    var tr = 'matrix(' + sc + ' 0 0 ' + sc + ' ' + (R.x + (A.xmin - P.e.x0) * P.k) + ' ' + (R.y + (P.e.y1 - A.ymax) * P.k) + ')';
    var linha = function (d, cor, larg, opac) { return '<path transform="' + tr + '" d="' + d + '" fill="none" stroke="' + cor + '" stroke-width="' + (larg / sc) + '"' + (opac ? ' stroke-opacity="' + opac + '"' : '') + ' stroke-linejoin="round"/>'; };
    s += '<defs><clipPath id="' + id + 'r"><rect x="' + mm(R.x) + '" y="' + mm(R.y) + '" width="' + mm(R.w) + '" height="' + mm(R.h) + '"/></clipPath><clipPath id="' + id + 'mg"><path transform="' + tr + '" d="' + GEO.mg + '" clip-rule="evenodd"/></clipPath></defs>';
    s += '<g clip-path="url(#' + id + 'r)"><rect x="' + mm(R.x) + '" y="' + mm(R.y) + '" width="' + mm(R.w) + '" height="' + mm(R.h) + '" fill="#ffffff"/>';
    var vis = S.mun.features.filter(function (f) { return cruza(bbGeom(f), P.e); });
    if (op.porMunicipio) {
      s += '<g clip-path="url(#' + id + 'mg)">' + vis.map(function (f) { var e = N.estatMunicipio(S.J, f, [op.produto], 'suave')[op.produto], c = corClasse(e.media, esc); return '<path d="' + caminho(f.geometry, P) + '" fill="' + c + '" stroke="' + c + '" stroke-width="0.4" stroke-linejoin="round"/>'; }).join('') + '</g>';
    } else {
      s += '<g clip-path="url(#' + id + 'mg)"><image x="' + mm(R.x) + '" y="' + mm(R.y) + '" width="' + mm(R.w) + '" height="' + mm(R.h) + '" preserveAspectRatio="none" href="' + rasterChuva(m, P.e, R.w * (op.pxmm || 7), R.h * (op.pxmm || 7), esc) + '"/></g>';
    }
    // limites municipais (claros, como os do mapa de Minas) e contorno do estado
    s += linha(GEO.states, '#000', 0.22) + linha(GEO.munLines, '#ffffff', op.fino ? 0.14 : 0.22, 0.85) + linha(GEO.mesoLines, '#000', op.fino ? 0.3 : 0.5, 0.6) + linha(GEO.mg, '#000', op.fino ? 0.4 : 0.6);
    // municípios monitorados: contorno forte (branco por baixo para destacar sobre o azul escuro)
    var mons = C.mons.filter(function (f) { return cruza(bbGeom(f), P.e); });
    mons.forEach(function (f) { var d = caminho(f.geometry, P); s += '<path d="' + d + '" fill="none" stroke="#fff" stroke-width="' + (op.fino ? 1.0 : 1.6) + '" stroke-linejoin="round"/><path d="' + d + '" fill="none" stroke="#000" stroke-width="' + (op.fino ? 0.5 : 0.8) + '" stroke-linejoin="round"/>'; });
    // isolinhas (seletores "Isolinhas" e "Valores" no topo da ferramenta), só no mapa de chuva suavizada
    var isoRot = '';
    if (!op.porMunicipio && !op.semRotulos && isoLigada() && window.IsoLinhas) {
      var evZ = [];
      isoConjuntos(esc.lim).forEach(function (E) {
        if (!E.niveis.length) return;
        var I = IsoLinhas.calcular({ valor: function (lo, la) { return N.bilinear(S.J.grade, m, lo, la); }, ext: P.e, passo: (P.e.x1 - P.e.x0) / 420, niveis: E.niveis, mmGrau: P.k,
          rotulos: isoValores(), tam: E.rotTam * 0.85, minLinhaMm: 30, distRotulosMm: 28, entreRotulosMm: 90, cor: E.rotCor, opacidade: E.rotOpac, evitar: evZ.slice(),
          dentro: function (lo, la) { return lo > P.e.x0 && lo < P.e.x1 && la > P.e.y0 && la < P.e.y1; } });
        s += '<g clip-path="url(#' + id + 'mg)"><path d="' + I.linhas.map(function (ln) { return ln.map(function (q, i) { return (i ? 'L' : 'M') + mm(P.X(q[0])) + ' ' + mm(P.Y(q[1])); }).join(''); }).join('') + '" fill="none" stroke="' + E.linha + '" stroke-width="' + (E.largura * 1.36).toFixed(2) + '" stroke-opacity="' + E.opacLinha + '" stroke-linejoin="round"/></g>';
        I.rotulos.forEach(function (r) {
          var x = P.X(r.lon), y = P.Y(r.lat), dg = 4 / P.k;
          evZ.push([r.lon - dg, r.lat - dg / 2, r.lon + dg, r.lat + dg / 2]);
          isoRot += '<text x="' + mm(x) + '" y="' + mm(y + r.tamanho * 0.35) + '" transform="rotate(' + r.angulo + ' ' + mm(x) + ' ' + mm(y) + ')" font-family="' + FONTE + '" font-size="' + r.tamanho + '" fill="' + r.cor + '" fill-opacity="' + r.opacidade + '" text-anchor="middle"' + (E.halo ? ' stroke="#fff" stroke-width="' + mm(r.tamanho * 0.22) + '" stroke-linejoin="round" paint-order="stroke"' : '') + '>' + String(r.texto).replace(/[<&]/g, '') + '</text>';
        });
      });
    }
    s += '</g>' + isoRot;
    if (op.semRotulos) {
      if (barrMapa(C).length) gruposBarragens(P, 2.2, barrMapa(C)).forEach(function (g) { g.itens.forEach(function (b, i) { s += losango(g.x + (i - (g.itens.length - 1) / 2) * 2.3, g.y, 1.05, COR_NIVEL[b.nv || 0]); }); });
      return s;
    }
    var marcas = '', nomes = '';
    // barragens primeiro (reservam o lugar dos rótulos)
    var grupos = gruposBarragens(P, 3.2, barrMapa(C));
    // barragens muito próximas: losangos lado a lado (um por barragem, cada um com a cor do nível) e um nome só
    var PASSO = 3.8;
    grupos.forEach(function (g) { var meia = (g.itens.length - 1) / 2 * PASSO; rot.ocupar([g.x - meia - 1.9, g.y - 1.9, g.x + meia + 1.9, g.y + 1.9]); });
    grupos.forEach(function (g) {
      var n = g.itens.length, meia = (n - 1) / 2 * PASSO;
      g.itens.slice().sort(function (a, b) { return a.lon - b.lon; }).forEach(function (b, i) { marcas += losango(g.x - meia + i * PASSO, g.y, 1.7, COR_NIVEL[b.nv || 0]); });
      var t = g.nome, pos = rot.colocar(g.x + (n > 1 ? meia : 0), g.y, t, 3.0, 700, 2.4, ['direita', 'acima', 'abaixo']) || rot.colocar(g.x - meia, g.y, t, 3.0, 700, 2.4, ['esquerda']);
      if (pos) nomes += texto(pos.x, pos.y, t, 3.0, { peso: 700, anc: pos.anc, halo: true });
    });
    // nome (e valor, no mapa por município) dos municípios monitorados
    C.linhas.forEach(function (l) {
      if (mons.indexOf(l.f) < 0) return;
      var p = l.f.properties, x = P.X(p.label_lon), y = P.Y(p.label_lat), t = l.nome.toUpperCase() + (op.porMunicipio ? '  ' + f0(l.total.media) + ' mm' : '');
      var pos = rot.colocar(x, y, t, 3.4, 700, 0, ['centro', 'abaixo', 'acima']);
      if (pos) nomes += texto(pos.x, pos.y, t, 3.4, { peso: 700, anc: pos.anc, cor: NAVY, halo: 1.0 });
    });
    // cidades de referência (mesma marcação do LayoutMapa: ponto branco e nome embaixo)
    if (o.cidades) cidadesNoRecorte(P).forEach(function (c) {
      var x = P.X(c[1]), y = P.Y(c[2]);
      if (mons.some(function (f) { return norm(f.properties.nome) === norm(c[0]); })) return;
      var pos = rot.colocar(x, y, c[0], 3.0, 700, 1.2, ['abaixo', 'direita', 'esquerda', 'acima']);
      if (!pos) return;
      marcas += '<circle cx="' + mm(x) + '" cy="' + mm(y) + '" r="0.65" fill="#fff" stroke="#1f2328" stroke-width="0.25"/>';
      nomes += texto(pos.x, pos.y, c[0], 3.0, { peso: 700, anc: pos.anc, cor: NAVY, halo: true });
    });
    // vizinhos: nome pequeno, só onde couber (ajuda a localizar)
    if (op.vizinhos) vis.forEach(function (f) {
      if (mons.indexOf(f) >= 0) return;
      var p = f.properties, x = P.X(p.label_lon), y = P.Y(p.label_lat), bb = bbGeom(f);
      if ((bb[2] - bb[0]) * P.k < 13 || x < R.x + 6 || x > R.x + R.w - 6 || y < R.y + 4 || y > R.y + R.h - 4) return;
      if (cidadesRef().some(function (c) { return norm(c[0]) === norm(p.nome); }) && o.cidades) return;
      var pos = rot.colocar(x, y, p.nome, 2.2, 400, 0, ['centro']);
      if (pos) nomes += texto(pos.x, pos.y, p.nome, 2.2, { anc: 'middle', cor: '#33414f', halo: 0.6 });
    });
    return s + marcas + nomes;
  }

  // seletores do topo da ferramenta (app.js); sem eles, sem isolinhas
  function isoLigada() { return !!(window.RESERV_ISO && window.RESERV_ISO.linhas()); }
  function isoValores() { return !!(window.RESERV_ISO && window.RESERV_ISO.valores()); }
  // a cada 50 mm e no estilo da Umidade Mínima (definidos em app.js; reserva igual se faltar)
  function isoNiveis() { return (window.RESERV_ISO && window.RESERV_ISO.niveis) || [50, 100, 150, 200, 250, 300, 350, 400, 450, 500]; }
  // conjuntos de isolinhas (tipo escolhido no topo: a cada 50 mm, nas faixas ou as duas); reserva = a cada 50 mm
  function isoConjuntos(lim) { if (window.RESERV_ISO && window.RESERV_ISO.conjuntos) return window.RESERV_ISO.conjuntos(lim); return [Object.assign({ niveis: isoNiveis(), halo: false }, isoEstilo())]; }
  function isoEstilo() { return (window.RESERV_ISO && window.RESERV_ISO.estilo) || { linha: '#ffffff', largura: 0.22, opacLinha: 0.8, rotCor: '#3a3a3a', rotOpac: 0.7, rotTam: 3.6 }; }
  function dentroMinas(lon, lat) {   // dentro de algum município de MG (para os valores não caírem fora do estado)
    var F = S.mun.features;
    for (var i = 0; i < F.length; i++) { var b = bbGeom(F[i]); if (lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3] && N.dentro(lon, lat, F[i].geometry)) return true; }
    return false;
  }
  function legendaChuva(esc) { return esc.rotulos.map(function (l, i) { return { fill: hexRgb(esc.cores[i]), label: l + ' mm' }; }); }
  function legendaExtras(C, semBarragens) {
    var o = C.o, l = [], niv = o.produto === 'barragens' ? (o.niveis || []) : [];
    if (o.produto !== 'barragens') {
      l.push({ forma: 'contorno', fill: 'none', stroke: '#000', strokeWidth: 0.7, label: 'Município de ' + o.munNome });
      if (!semBarragens) (C.barrMun || []).forEach(function (b) { if (niv.indexOf(b.nv) < 0) niv.push(b.nv); });
    }
    niv.slice().sort(function (a, b) { return b - a; }).forEach(function (n) { l.push({ forma: 'losango', fill: COR_NIVEL[n], stroke: CONTORNO_BARRAGEM, label: 'Barragem nível ' + n + (o.produto === 'barragens' ? '' : ' (ANM)') }); });
    return l;
  }
  function validade(C) {
    var j0 = C.jan[0], jn = C.jan[C.jan.length - 1];
    var ini = j0.local.split(' a ')[0].replace(' de ', ' '), fim = jn.local.split(' a ')[1].replace(' (hora local)', '').replace(' de ', ' ');
    return 'VÁLIDO: ' + ini + ' às ' + fim + ', hora local (' + C.o.horas + ' h)';
  }
  function credito(C) {
    var J = S.J;
    return 'Fonte de dados: GFS/NCEP/NOAA (rodada ' + J.ciclo + 'Z de ' + N.br(J.data_ciclo) + ')' + (C.o.produto === 'barragens' ? '; barragens: ' + (S.fonte === 'anm' && S.anm ? 'ANM/SIGBM' : 'lista da equipe') : '') + ' - SIMGE/IGAM, ' + J.data_ciclo.slice(0, 4);
  }

  /* ---------- 1) Estado: o mapa de Minas do LayoutMapa com a chuva suavizada ---------- */
  function opEstado(C) {
    var o = C.o, esc = o.escala, A = LM().MAPA, m = S.J.produtos[C.H.total].mm;
    var e = { x0: A.xmin, x1: A.xmax, y0: A.ymin, y1: A.ymax };
    var op = { titulo: 'Total Previsto de Precipitação · ' + tituloCurto(o), textoValidade: validade(C), credito: credito(C), fundo: '',
      imagem: rasterChuva(m, e, A.wTotal * 6, A.h * 6, esc), areas: [], legenda: legendaChuva(esc).concat(legendaExtras(C, true)), pontos: [] };
    var cidades = o.cidades ? cidadesRef().map(function (c) { return { nome: c[0], lon: c[1], lat: c[2] }; }) : [];
    if (o.produto === 'barragens') {
      var grupos = [];
      S.barragens.forEach(function (b) {
        var g = null; for (var k = 0; k < grupos.length; k++) if (Math.abs(grupos[k].lon - b.lon) < 0.06 && Math.abs(grupos[k].lat - b.lat) < 0.06) { g = grupos[k]; break; }
        if (!g) { g = { lon: b.lon, lat: b.lat, itens: [] }; grupos.push(g); } g.itens.push(b);
      });
      // barragens a menos de ~6 km (que cairiam umas sobre as outras no mapa de Minas) ficam lado a lado, cada uma com a sua cor,
      // e o nome sai uma vez só (ex.: "Forquilha II e III"): o número de losangos é sempre o número de barragens
      grupos.forEach(function (g) {
        var n = g.itens.length, passo = 3.3 / 18.6, nome = juntarNomes(g.itens.map(function (b) { return b.nome.replace(/^Barragem\s+(de\s+)?/i, ''); }));
        g.itens.slice().sort(function (a, b) { return a.lon - b.lon; }).forEach(function (b, i) {
          op.pontos.push({ forma: 'losango', lon: g.lon + (i - (n - 1) / 2) * passo, lat: g.lat, cor: COR_NIVEL[b.nv || 0], rotulo: i === n - 1 ? nome : '' });
        });
      });
      arrumarRotulos(op.pontos, cidades);
    } else {
      // município: só o contorno (a chuva continua visível dentro dele) e o nome
      C.mons.forEach(function (f) {
        op.areas.push({ geometry: f.geometry, fill: 'rgba(0,0,0,0)', stroke: '#ffffff', strokeWidth: 1.1 });
        op.areas.push({ geometry: f.geometry, fill: 'rgba(0,0,0,0)', stroke: '#000000', strokeWidth: 0.55 });
        cidades = cidades.filter(function (c) { return norm(c.nome) !== norm(f.properties.nome); });
        op.pontos.push({ lon: f.properties.label_lon, lat: f.properties.label_lat, cor: '#000', rotulo: f.properties.nome, lado: 'esquerda' });
      });
      arrumarRotulos(op.pontos, cidades);
    }
    op.cidades = cidades;
    if (isoLigada() && window.IsoLinhas) {
      var evitar = cidades.map(function (c) { var w = c.nome.length * 0.105 / 2; return [c.lon - w, c.lat - 0.3, c.lon + w, c.lat + 0.04]; })
        .concat(op.pontos.map(function (p) { return [p.lon - 0.12, p.lat - 0.15, p.lon + 0.12 + (p.rotulo || '').length * 0.1, p.lat + 0.15]; }));
      op.isolinhas = []; op.rotulosIso = [];
      isoConjuntos(esc.lim).forEach(function (E) {
        if (!E.niveis.length) return;
        var I = IsoLinhas.calcular({ valor: function (lo, la) { return N.bilinear(S.J.grade, m, lo, la); }, ext: { x0: -51.2, x1: -39.7, y0: -23.2, y1: -14.1 }, passo: 0.025, niveis: E.niveis, mmGrau: 18.6,
          dentro: dentroMinas, evitar: evitar.slice(), rotulos: isoValores(), tam: E.rotTam, cor: E.rotCor, opacidade: E.rotOpac });
        op.isolinhas.push({ linhas: I.linhas, stroke: E.linha, width: E.largura, opacity: E.opacLinha });
        I.rotulos.forEach(function (r) { r.halo = E.halo; op.rotulosIso.push(r); evitar.push([r.lon - 0.2, r.lat - 0.12, r.lon + 0.2, r.lat + 0.12]); });
      });
    }
    return op;
  }
  // caixas aproximadas (em graus) no mapa de Minas (~18,6 mm por grau): ponto 3,2 mm; cidade 3,5 mm embaixo do ponto
  function arrumarRotulos(pontos, cidades) {
    var K = 18.6, H = 0.16, PADX = 0.02, MK = 0.07;   // MK: meio losango (1,45 mm) em graus
    function peso(c) { return /^Belo Horizonte$/.test(c.nome) ? 5 : 1; }   // a capital só sai em último caso
    function caixaCidade(c) { return caixaCidadeEm(c, c.posicao); }
    function caixaPonto(p, lado) {
      var w = larguraTexto(p.rotulo, 3.2, 700) / K + PADX, d = 0.1;
      if (lado === 'esquerda') return [p.lon - d - w, p.lat - H / 2, p.lon - d, p.lat + H / 2];
      if (lado === 'acima') return [p.lon - w / 2, p.lat + 0.08, p.lon + w / 2, p.lat + 0.08 + H];
      if (lado === 'abaixo') return [p.lon - w / 2, p.lat - 0.08 - H, p.lon + w / 2, p.lat - 0.08];
      return [p.lon + d, p.lat - H / 2, p.lon + d + w, p.lat + H / 2];
    }
    function cz(a, b) { return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]); }
    // antes de tudo: cidade com uma barragem embaixo do nome já muda o nome de lugar (acima ou à direita)
    cidades.forEach(function (c) {
      var temPonto = function (pos) { var bx = caixaCidadeEm(c, pos); return pontos.some(function (p) { return cz(bx, [p.lon - MK, p.lat - MK, p.lon + MK, p.lat + MK]); }); };
      if (!temPonto()) return;
      if (!temPonto('acima')) c.posicao = 'acima'; else if (!temPonto('direita')) c.posicao = 'direita';
    });
    var ocupadas = [];
    // marcas das barragens e dos pontos das cidades também contam como obstáculo
    pontos.forEach(function (p) { ocupadas.push([p.lon - MK, p.lat - MK, p.lon + MK, p.lat + MK]); });
    pontos.forEach(function (p) {
      var melhor = null;
      ['direita', 'esquerda', 'acima', 'abaixo'].some(function (lado) {
        var bx = caixaPonto(p, lado), custo = 0;
        cidades.forEach(function (c) { if (cz(bx, caixaCidade(c)) || cz(bx, [c.lon - 0.04, c.lat - 0.04, c.lon + 0.04, c.lat + 0.04])) custo += peso(c); });
        ocupadas.forEach(function (o) { if (cz(bx, o) && !(o[0] === p.lon - MK && o[1] === p.lat - MK)) custo += 10; });
        if (!melhor || custo < melhor.custo) melhor = { lado: lado, bx: bx, custo: custo };
        return custo === 0;
      });
      p.lado = melhor.lado === 'direita' ? undefined : melhor.lado;
      ocupadas.push(melhor.bx);
    });
    // cidade cujo nome bate numa barragem: tenta o nome acima ou à direita do ponto; se não couber, o nome sai
    function caixaCidadeEm(c, pos) {
      var w = larguraTexto(c.nome, 3.5, 700) / K + 2 * PADX;
      if (pos === 'acima') return [c.lon - w / 2, c.lat + 0.06, c.lon + w / 2, c.lat + 0.24];
      if (pos === 'direita') return [c.lon + 0.05, c.lat - 0.12, c.lon + 0.05 + w, c.lat + 0.12];
      var w0 = larguraTexto(c.nome, 3.5, 700) / K + 2 * PADX; return [c.lon - w0 / 2, c.lat - 0.28, c.lon + w0 / 2, c.lat - 0.04];
    }
    for (var i = cidades.length - 1; i >= 0; i--) {
      var c = cidades[i], livre = function (pos) { var bx = caixaCidadeEm(c, pos); return !ocupadas.some(function (o) { return cz(bx, o); }); };
      if (livre(c.posicao)) continue;
      if (livre()) { c.posicao = undefined; continue; }
      if (livre('acima')) c.posicao = 'acima'; else if (livre('direita')) c.posicao = 'direita'; else cidades.splice(i, 1);
    }
  }

  /* ---------- 2) e 3) Recorte regional: chuva suavizada ou média por município ---------- */
  function opRecorte(C, porMunicipio) {
    var o = C.o, A = LM().MAPA, m = S.J.produtos[C.H.total].mm;
    var P = projRecorte(extRegiao(C, o.produto === 'barragens' ? 0.15 : 0.32, o.produto === 'barragens' ? 1.0 : 0.9), A.w, A.h, 0, 0);
    var svg = mioloRecorte(C, P, m, { porMunicipio: porMunicipio, produto: C.H.total, vizinhos: true });
    var leg = legendaChuva(o.escala).concat(legendaExtras(C));
    return { titulo: (porMunicipio ? 'Precipitação Média por Município · ' : 'Total Previsto de Precipitação · ') + tituloCurto(o),
      regiao: o.produto === 'barragens' ? 'Minas Gerais (recorte)' : o.munNome + ' e entorno',
      textoValidade: validade(C), credito: credito(C), fundo: '', legenda: leg,
      mapaPersonalizado: { svg: svg, grade: gradeRecorte(P), escala: escalaRecorte(P) } };
  }

  /* ---------- 4) Dia a dia: vários mapas pequenos e o gráfico, dentro do mesmo layout ---------- */
  var CORES_DIAS = ['#c6dbef', '#6baed6', '#2171b5', '#08306b'];
  function opDiario(C) {
    var o = C.o, J = S.J, A = LM().MAPA, esc = o.escala, gap = 2.4, tb = 5.2;
    var paineis = C.H.dias.map(function (d, k) { return { m: J.produtos[d].mm, t: 'Dia ' + (k + 1) + ' · ' + C.jan[k].rotulo.slice(0, 5), sub: C.jan[k].local.replace(' (hora local)', '').replace(/\/\d{4}/g, '') }; });
    paineis.push({ m: J.produtos[C.H.total].mm, t: 'Total de ' + o.horas + ' h', sub: C.periodo.replace(/\/\d{4}/g, ''), total: true });
    var cols = 3, pw = (A.w - gap * (cols + 1)) / cols, ph = (A.h - gap * 3) / 2, ext = extRegiao(C, o.produto === 'barragens' ? 0.12 : 0.28, 0.9);
    var s = '<rect x="0" y="0" width="' + mm(A.w) + '" height="' + mm(A.h) + '" fill="#f7fbff"/>';
    paineis.forEach(function (pn, i) {
      var x = gap + (i % cols) * (pw + gap), y = gap + Math.floor(i / cols) * (ph + gap);
      var P = projRecorte(ext, pw, ph - tb, x, y + tb);
      s += '<rect x="' + mm(x) + '" y="' + mm(y) + '" width="' + mm(pw) + '" height="' + mm(tb) + '" fill="' + (pn.total ? NAVY : '#e3eef8') + '"/>';
      s += texto(x + 1.6, y + 3.6, pn.t, 3.0, { peso: 700, cor: pn.total ? '#fff' : NAVY }) + texto(x + pw - 1.4, y + 3.5, pn.sub, 2.0, { anc: 'end', cor: pn.total ? '#dbeefa' : '#33414f' });
      s += mioloRecorte(C, P, pn.m, { semRotulos: true, fino: true, pxmm: 5 });
      var mx = -Infinity; C.linhas.forEach(function (l) { var v = pn.total ? l.total.max : l.dias[i].max; if (v > mx) mx = v; });
      var tx = 'máx. nos municípios: ' + f0(mx) + ' mm';
      s += '<rect x="' + mm(x + 1) + '" y="' + mm(y + ph - 5.2) + '" width="' + mm(larguraTexto(tx, 2.4, 700) + 2.4) + '" height="4.2" rx="0.8" fill="#fff" fill-opacity="0.9"/>' + texto(x + 2.2, y + ph - 2.2, tx, 2.4, { peso: 700, cor: NAVY });
      s += '<rect x="' + mm(x) + '" y="' + mm(y) + '" width="' + mm(pw) + '" height="' + mm(ph) + '" fill="none" stroke="rgb(86,123,154)" stroke-width="0.3"/>';
    });
    // último quadro: gráfico de barras (média de cada dia em cada município)
    var gi = paineis.length, gx = gap + (gi % cols) * (pw + gap), gy = gap + Math.floor(gi / cols) * (ph + gap);
    if (gi < 6) {
      s += '<rect x="' + mm(gx) + '" y="' + mm(gy) + '" width="' + mm(pw) + '" height="' + mm(tb) + '" fill="#e3eef8"/>' + texto(gx + 1.6, gy + 3.6, 'Média de cada dia (mm)', 3.0, { peso: 700, cor: NAVY });
      s += '<rect x="' + mm(gx) + '" y="' + mm(gy + tb) + '" width="' + mm(pw) + '" height="' + mm(ph - tb) + '" fill="#fff"/>';
      var ls = C.linhas.slice().sort(function (a, b) { return b.total.media - a.total.media; }).slice(0, 8);
      var maxT = Math.max.apply(null, ls.map(function (l) { return l.total.media; }).concat([1]));
      var st = maxT <= 20 ? 5 : maxT <= 50 ? 10 : maxT <= 120 ? 20 : maxT <= 250 ? 50 : 100, topo = Math.ceil(maxT / st) * st;
      var nomeW = Math.min(26, Math.max.apply(null, ls.map(function (l) { return larguraTexto(l.nome, 2.4); })) + 2), bx = gx + nomeW + 1, bw = pw - nomeW - 9, by0 = gy + tb + 3, area = ph - tb - 15;
      var bh = Math.min(6, area / Math.max(1, ls.length) - 1.4);
      for (var t = 0; t <= topo + 1e-9; t += st) { var xx = bx + t / topo * bw; s += '<path d="M' + mm(xx) + ' ' + mm(by0 - 1) + 'V' + mm(by0 + area) + '" stroke="#e3e8ee" stroke-width="0.2"/>' + texto(xx, by0 + area + 3, String(t), 2.1, { anc: 'middle', cor: '#33414f' }); }
      ls.forEach(function (l, i) {
        var yy = by0 + i * (bh + 1.4), acc = 0;
        s += texto(bx - 1.2, yy + bh * 0.72, l.nome, 2.4, { anc: 'end', cor: NAVY });
        l.dias.forEach(function (d, k) { var w = Math.max(0, d.media / topo * bw); s += '<rect x="' + mm(bx + acc) + '" y="' + mm(yy) + '" width="' + mm(w) + '" height="' + mm(bh) + '" fill="' + CORES_DIAS[k] + '" stroke="#fff" stroke-width="0.15"/>'; acc += w; });
        s += texto(bx + acc + 1, yy + bh * 0.72, f0(l.total.media), 2.4, { peso: 700, cor: NAVY });
      });
      C.H.dias.forEach(function (d, k) { var lx = gx + 3 + k * 16; s += '<rect x="' + mm(lx) + '" y="' + mm(gy + ph - 4.4) + '" width="3" height="2.4" fill="' + CORES_DIAS[k] + '"/>' + texto(lx + 3.8, gy + ph - 2.4, 'Dia ' + (k + 1), 2.2, { cor: NAVY }); });
      s += '<rect x="' + mm(gx) + '" y="' + mm(gy) + '" width="' + mm(pw) + '" height="' + mm(ph) + '" fill="none" stroke="rgb(86,123,154)" stroke-width="0.3"/>';
    }
    if (gi + 1 < 6) {   // 72 h: sobra um quadro — vai o gatilho de cada município/barragem
      var qx = gap + ((gi + 1) % cols) * (pw + gap), qy = gap + Math.floor((gi + 1) / cols) * (ph + gap);
      s += '<rect x="' + mm(qx) + '" y="' + mm(qy) + '" width="' + mm(pw) + '" height="' + mm(tb) + '" fill="#e3eef8"/>' + texto(qx + 1.6, qy + 3.6, 'Critério de emissão', 3.0, { peso: 700, cor: NAVY });
      s += '<rect x="' + mm(qx) + '" y="' + mm(qy + tb) + '" width="' + mm(pw) + '" height="' + mm(ph - tb) + '" fill="#fff"/>';
      var linhasG = o.produto === 'barragens' ? C.pontos.map(function (p) { return [p.b.nome, p.gat]; }) : [[o.munNome, C.gatMun]];
      s += texto(qx + 2, qy + tb + 5, 'Local', 2.3, { peso: 700, cor: NAVY }) + texto(qx + pw - 22, qy + tb + 5, 'maior dia', 2.3, { peso: 700, anc: 'end', cor: NAVY }) + texto(qx + pw - 2, qy + tb + 5, '72 h', 2.3, { peso: 700, anc: 'end', cor: NAVY });
      linhasG.slice(0, 12).forEach(function (r, i) {
        var yy = qy + tb + 10 + i * 4.6, g = r[1];
        s += texto(qx + 2, yy, r[0], 2.3, { cor: g && g.dispara ? '#b10d1c' : '#000', peso: g && g.dispara ? 700 : 400 }) + texto(qx + pw - 22, yy, g ? f0(g.diaMax) + ' mm' : '—', 2.3, { anc: 'end' }) + texto(qx + pw - 2, yy, g && g.max72 ? f0(g.max72.mm) + ' mm' : '—', 2.3, { anc: 'end', peso: 700 });
      });
      s += texto(qx + 2, qy + ph - 2.4, 'Atinge com ' + textoCriterio(o.crit), 2.1, { cor: '#33414f' });
      s += '<rect x="' + mm(qx) + '" y="' + mm(qy) + '" width="' + mm(pw) + '" height="' + mm(ph) + '" fill="none" stroke="rgb(86,123,154)" stroke-width="0.3"/>';
    }
    return { titulo: 'Precipitação Prevista por Dia · ' + tituloCurto(o), regiao: o.produto === 'barragens' ? 'Minas Gerais (recorte)' : o.munNome + ' e entorno',
      textoValidade: validade(C), credito: credito(C), fundo: '', legenda: legendaChuva(esc).concat(legendaExtras(C)),
      mapaPersonalizado: { svg: s, grade: { lat: [], lon: [] }, semEscala: true } };
  }

  /* =====================================================================================
   * TELA
   * ===================================================================================== */
  function montarAba() {
    if ($('barr')) return;
    var tabs = document.querySelector('.tabs'), main = document.querySelector('main');
    if (!tabs || !main) return;
    var bt = document.createElement('button'); bt.className = 'tab'; bt.dataset.tab = 'barr'; bt.textContent = 'Barragens e municípios · 72 / 96 h';
    tabs.appendChild(bt);
    bt.addEventListener('click', function () {
      document.querySelectorAll('.tab').forEach(function (x) { x.classList.remove('active'); });
      document.querySelectorAll('.panel').forEach(function (x) { x.classList.remove('active'); });
      bt.classList.add('active'); $('barr').classList.add('active');
      abrir();
    });
    var st = document.createElement('style');
    st.textContent = '#barr .reprs{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 10px}#barr .reprs button{background:#fff;border:1px solid var(--line);color:#25354a;font-weight:700;font-size:12px;padding:7px 10px}' +
      '#barr .reprs button.on{background:var(--accent);border-color:var(--accent);color:#fff}#barr .reprs .g{font-size:11px;font-weight:700;color:var(--muted);align-self:center;margin:0 2px 0 6px}' +
      '#barr .reprs .g.prop{color:#146c56}#barr .reprs .g.pad{color:#0d668f}#barr .rdesc{font-size:12px;color:var(--muted);margin:-4px 0 10px}#barr .lmPrev{min-height:200px}' +
      '#barr .br-ok{border-color:#9fd8c2;background:#effaf5}#barr .br-erro{border-color:#f0b4b4;background:#fff3f3}#barr textarea{width:100%;border:1px solid var(--line);border-radius:9px;padding:9px;font:13px/1.45 Arial,Helvetica,sans-serif;resize:vertical}' +
      '#barr td.n,#barr th.n{text-align:right;font-variant-numeric:tabular-nums}#barr table th{vertical-align:bottom}#barr .av{color:#9a5b00;font-size:12px}#barr .selo{display:inline-block;font-size:11px;font-weight:700;border-radius:999px;padding:2px 8px;margin-left:6px;vertical-align:middle}' +
      '#barr .selo.o{background:#edf2f7;color:#25354a}#barr .selo.p{background:#e5f6ef;color:#146c56}#barr details{margin-top:10px;font-size:12px;line-height:1.5}#barr details summary{cursor:pointer;font-weight:700}#barr .diaLin{display:grid;grid-template-columns:86px 1fr;gap:6px;align-items:center;margin:4px 0}' +
      '#barr .diaLin span{font-size:12px;font-weight:700}#barr .diaLin input{padding:6px 8px;font-size:12px}#barr [hidden]{display:none!important}#barr .niv{display:flex;gap:14px}#barr .niv .check{margin:2px 0}#barr .lz{display:inline-block;width:9px;height:9px;transform:rotate(45deg);margin:0 2px 0 1px}' +
      '#barr .gat{font-size:13px;line-height:1.5}#barr .gat .sim{color:#b10d1c;font-weight:700}#barr .gat .nao{color:#146c56;font-weight:700}#barr tr.disp td{background:#fff1f1}';
    document.head.appendChild(st);
    var sec = document.createElement('section'); sec.id = 'barr'; sec.className = 'panel';
    sec.innerHTML =
      '<div class="grid"><aside class="card">' +
      '<h2>Barragens e municípios · 72 / 96 h</h2>' +
      '<div class="small">Boletins “Previsão para as próximas 72/96 horas” das <b>barragens níveis 2 e 3</b> e de <b>Brumadinho</b>. Mesma chuva do GFS das outras abas (acumulado desde a rodada).</div>' +
      '<label for="brCiclo">Rodada do GFS</label><div class="row"><select id="brCiclo"><option value="00">00Z</option><option value="06">06Z</option></select><button id="brBuscar" class="primary">Buscar dados do GFS</button></div>' +
      '<label for="brProduto">Produto</label><select id="brProduto"><option value="barragens">Barragens (níveis marcados abaixo)</option><option value="brumadinho">Brumadinho - MG</option><option value="municipio">Outro município</option></select>' +
      '<div id="brMunBox" hidden><label for="brMunicipio">Município em destaque</label><input id="brMunicipio" type="text" list="brMunLista" value="Brumadinho" autocomplete="off"><datalist id="brMunLista"></datalist></div>' +
      '<div class="row"><div><label for="brHorizonte">Horizonte</label><select id="brHorizonte"><option value="96">96 horas (4 dias)</option><option value="72">72 horas (3 dias)</option></select></div>' +
      '<div><label for="brEscala">Escala</label><select id="brEscala"><option value="boletim">Boletim (0–5 … &gt; 250)</option><option value="reserv15">15 faixas (0–10 … &gt; 300)</option></select></div></div>' +
      '<label class="check"><input type="checkbox" id="brCidades" checked> Cidades de referência</label>' +
      '<div id="brBarrBox"><h3>Barragens <span id="brBarrN" class="small"></span></h3>' +
      '<label for="brFonte" style="margin-top:0">Lista de barragens</label><select id="brFonte"><option value="anm">ANM/SIGBM (automático)</option><option value="equipe">Lista da equipe (BARRAGENS.txt)</option></select>' +
      '<div class="small" id="brAnmInfo" style="margin-top:4px"></div>' +
      '<label>Níveis de emergência</label><div class="niv"><label class="check"><input type="checkbox" id="brN3" checked> <span class="lz" style="background:#d7191c;outline:0.5px solid #1a1a1a"></span>N3</label><label class="check"><input type="checkbox" id="brN2" checked> <span class="lz" style="background:#fd8d3c;outline:0.5px solid #1a1a1a"></span>N2</label><label class="check"><input type="checkbox" id="brN1"> <span class="lz" style="background:#ffd92f;outline:0.5px solid #1a1a1a"></span>N1</label></div>' +
      '<div class="small">Padrão: N2 e N3. Para emitir por nível, deixe marcado só o nível desejado.</div>' +
      '<h3 style="margin-top:14px">Critério de emissão <span id="brCritSelo" class="selo o">padrão</span></h3>' +
      '<label class="check"><input type="checkbox" id="brCritDiaOn" checked> Chuva em um dia ≥ <input id="brCritDia" type="number" min="10" max="500" step="5" value="100" style="width:74px;padding:4px 6px;margin:0 4px"> mm</label>' +
      '<label class="check"><input type="checkbox" id="brCrit72On" checked> Soma em 72 h ≥ <input id="brCrit72" type="number" min="10" max="800" step="5" value="100" style="width:74px;padding:4px 6px;margin:0 4px"> mm</label>' +
      '<div class="small">Basta um dos marcados para disparar. 40–50 mm/h não é avaliado (o GFS tem passos de 6 h).</div>' +
      '<div class="actions" style="margin-top:6px"><button id="brCritPadrao" class="ghost" type="button">Voltar ao padrão (100 mm/dia ou 100 mm/72 h)</button></div>' +
      '<label for="brRaio">Região da barragem (para o gatilho)</label><select id="brRaio"><option value="0">Só o ponto da barragem</option><option value="10" selected>Raio de 10 km</option><option value="20">Raio de 20 km</option></select>' +
      '<div id="brEquipeBox"><div class="small" id="brBarrOrigem" style="margin-top:8px"></div>' +
      '<div class="actions" style="margin-top:6px"><label class="ghost" style="margin:0;display:inline-block;border-radius:9px;padding:8px 11px;font-weight:700;cursor:pointer;font-size:13px">Trocar lista (BARRAGENS.txt)<input id="brBarrArq" type="file" accept=".txt,.tsv,.csv,text/plain" hidden></label><button id="brBarrPadrao" class="ghost" type="button">Voltar à lista padrão</button></div>' +
      '</div>' +
      '<div id="brBarrAvisos" class="av" style="margin-top:6px"></div></div>' +
      '<h3>Salvar</h3><div class="small">PNG da figura aberta, PDF do boletim e CSV das tabelas: pelo botão amarelo <b>OPÇÕES DE SALVAMENTO</b>.</div>' +
      '<div class="actions" style="margin-top:0"><button id="brPng" class="secondary" disabled>PNG da figura</button><button id="brPdf" class="secondary" disabled>PDF do boletim</button><button id="brCsv" class="secondary" disabled>CSV (tabelas)</button></div>' +
      '<div id="brStatus" class="status">Carregando os limites municipais e o GFS…</div>' +
      '<details><summary>Como é calculado</summary>' +
      '<p><b>Chuva:</b> acumulado do GFS 0,25° (NOAA) desde a rodada: 72 h = 0 a 72 h; 96 h = 0 a 96 h; cada dia = 24 h (dia 1 = 0–24 h, …). Rodada 00Z começa às 21h do dia anterior (hora local). A soma dos dias é conferida com o acumulado antes de usar.</p>' +
      '<p><b>Município:</b> média, mínimo e máximo nos pontos de uma grade de ~1 km dentro do limite municipal (IBGE), sobre a interpolação bilinear do GFS. É o número que entra no texto e nas tabelas.</p>' +
      '<p><b>Faixas do texto:</b> limites da escala que envolvem 80 % da área do município (do percentil 10 ao 90, sem os extremos de borda; ex.: 42–58 mm → “40 - 60 mm”). Mínimo e máximo ficam na tabela. Por dia: da menor à maior média dos municípios monitorados.</p>' +
      '<p><b>Mapas:</b> todos no layout padrão da plataforma. A chuva é a interpolação bilinear do GFS desenhada em alta resolução (sem os blocos de 0,25°). O zoom enquadra sozinho os municípios e as barragens escolhidos.</p></details>' +
      '</aside><div>' +
      '<div class="previewWrap"><div class="reprs" id="brReprs"></div><div class="rdesc" id="brReprDesc"></div><div id="brMapa" class="lmPrev"></div></div>' +
      '<div class="card tableCard" id="brGatCard"><h2>Critério de emissão</h2><div id="brGat" class="gat"></div>' +
      '<label class="check"><input type="checkbox" id="brForcar"> Emitir mesmo sem gatilho (decisão do meteorologista)</label><input id="brForcarJust" type="text" placeholder="Justificativa (obrigatória, vai no rodapé do PDF)" hidden></div>' +
      '<div class="card tableCard"><h2>Texto do boletim <span class="small">(edite à vontade antes de gerar o PDF)</span></h2>' +
      '<label for="brCondicao">Condição do tempo (abre o texto)</label><input id="brCondicao" type="text" placeholder="Ex.: Previsão de tempo instável">' +
      '<label for="brTexto">Parágrafo principal</label><textarea id="brTexto" rows="6"></textarea>' +
      '<label>Previsão diária <span class="small">(condição de cada dia + faixa calculada)</span></label><div id="brDias"></div>' +
      '<label class="check"><input type="checkbox" id="brAtencao"> Incluir “Estado de Atenção” (decisão do meteorologista)</label>' +
      '<textarea id="brAtencaoTxt" rows="4" hidden></textarea>' +
      '<label class="check"><input type="checkbox" id="brFig2"> Incluir o mapa “Dia a dia” como Figura 2 no PDF</label>' +
      '<div class="actions"><button id="brRefazTexto" class="ghost" type="button">Refazer o texto com os números atuais</button></div></div>' +
      '<div class="card tableCard"><h2>Chuva nos municípios monitorados (mm)</h2><div class="scroll"><table id="brTabMun"></table></div></div>' +
      '<div class="card tableCard" id="brTabBarrCard"><h2>Barragens</h2><div class="small" style="margin-bottom:6px">Valor no ponto: “bloco” = célula de 0,25° do GFS; “ponto” = interpolação bilinear. No mapa, barragens muito próximas (ex.: Forquilha II e III, a 1,6 km) aparecem lado a lado com um nome só: cada losango é uma barragem.</div><div class="scroll"><table id="brTabBarr"></table></div></div>' +
      '</div></div>';
    main.appendChild(sec);
    // controles
    var rp = $('brReprs'), g0 = '';
    REPRES.forEach(function (r) {
      var b = document.createElement('button'); b.type = 'button'; b.dataset.r = r.id; b.textContent = r.nome; b.title = r.desc;
      b.addEventListener('click', function () { S.repr = r.id; ls('barrRepr3', r.id); desenhar(); });
      rp.appendChild(b);
    });
    var rs = ls('barrRepr3'); if (rs && REPRES.some(function (r) { return r.id === rs; })) S.repr = rs;
    $('brBuscar').addEventListener('click', buscarGfs);
    ['brProduto', 'brHorizonte', 'brEscala', 'brCidades'].forEach(function (k) { $(k).addEventListener('change', function () { if (k === 'brProduto') trocarProduto(); gerar(); }); });
    $('brMunicipio').addEventListener('change', function () { var f = S.munIdx && S.munIdx[norm(this.value)]; if (!f) { status('Município “' + esc(this.value) + '” não encontrado. Escolha um nome da lista.', 'erro'); return; } this.value = f.properties.nome; gerar(); });
    $('brAtencao').addEventListener('change', function () { $('brAtencaoTxt').hidden = !this.checked; });
    $('brCondicao').addEventListener('change', function () { textoAuto(true); });
    $('brRefazTexto').addEventListener('click', function () { textoAuto(true); });
    $('brPng').addEventListener('click', salvarPng);
    $('brPdf').addEventListener('click', salvarPdf);
    $('brCsv').addEventListener('click', salvarCsv);
    $('brBarrArq').addEventListener('change', trocarLista);
    $('brFonte').addEventListener('change', function () { S.fonte = this.value; ls('barrFonte', S.fonte); aplicarLista(); });
    ['brN1', 'brN2', 'brN3'].forEach(function (k) { $(k).addEventListener('change', function () { if (!niveisEscolhidos().length) { this.checked = true; return; } aplicarLista(); }); });
    $('brRaio').addEventListener('change', gerar);
    window.addEventListener('reservPaleta', function () { if (S.J) gerar(); });
    ['brCritDiaOn', 'brCrit72On', 'brCritDia', 'brCrit72'].forEach(function (k) { $(k).addEventListener('change', function () { seloCriterio(); gerar(); }); });
    $('brCritPadrao').addEventListener('click', function () { $('brCritDia').value = N.LIMIAR_DIA; $('brCrit72').value = N.LIMIAR_72H; $('brCritDiaOn').checked = true; $('brCrit72On').checked = true; seloCriterio(); gerar(); });
    $('brForcar').addEventListener('change', function () { $('brForcarJust').hidden = !this.checked; liberarPdf(); });
    $('brForcarJust').addEventListener('input', liberarPdf);
    var fs = ls('barrFonte'); if (fs === 'equipe') { S.fonte = 'equipe'; $('brFonte').value = 'equipe'; }
    $('brBarrPadrao').addEventListener('click', function () { ls('barrLista', null); usarLista(BARRAGENS_TXT_PADRAO, 'padrão'); });
    var salvo = ls('barrLista');
    try { usarLista(salvo || BARRAGENS_TXT_PADRAO, salvo ? 'arquivo carregado neste navegador' : 'padrão'); } catch (e) { usarLista(BARRAGENS_TXT_PADRAO, 'padrão'); }
    trocarProduto();
  }
  function seloCriterio() {
    var c = criterioTela(), el = $('brCritSelo'), pad = criterioPadrao(c);
    el.textContent = pad ? 'padrão' : 'alterado'; el.style.background = pad ? '' : '#fff3d6'; el.style.color = pad ? '' : '#8a5a00';
  }
  function trocarProduto() {
    var b = $('brProduto').value === 'barragens';
    $('brMunBox').hidden = $('brProduto').value !== 'municipio'; $('brBarrBox').hidden = !b; $('brTabBarrCard').hidden = !b;
  }
  function usarLista(txt, origem) {
    var r = lerBarragensTxt(txt);
    r.lista.forEach(function (b) { b.nv = nivelInt(b.nivel); b.fonte = 'equipe'; });
    S.listaEquipe = r.lista; S.avisosEquipe = r.avisos; S.origemLista = origem;
    $('brBarrOrigem').innerHTML = 'Lista da equipe: <b>' + esc(origem) + '</b>' + (origem === 'padrão' ? ' (BARRAGENS.txt da equipe, com os níveis da época em que foi feita)' : '');
    aplicarLista();
  }
  function niveisEscolhidos() { return [3, 2, 1].filter(function (n) { var el = $('brN' + n); return el && el.checked; }); }
  // monta S.barragens a partir da fonte escolhida e dos níveis marcados
  function aplicarLista() {
    var nv = niveisEscolhidos(), av = [];
    var usarAnm = S.fonte === 'anm' && S.anm;
    $('brEquipeBox').hidden = usarAnm;
    if (S.fonte === 'anm' && !S.anm) av.push('Lista automática da ANM indisponível' + (S.anmErro ? ' (' + esc(S.anmErro) + ')' : '') + ': usando a lista da equipe.');
    if (usarAnm) {
      S.barragens = S.anm.barragens.filter(function (b) { return nv.indexOf(b.nivel) >= 0 && !b.pendencia; }).map(function (b) {
        return { lat: b.lat, lon: b.lon, nome: b.nome, nomeBda: b.nome, municipio: b.municipio, nivel: 'Nível ' + b.nivel, nv: b.nivel, dpa: b.dpa, cri: b.cri, empreendedor: b.empreendedor, fonte: 'ANM' };
      });
      S.anm.barragens.forEach(function (b) { if (b.pendencia && (b.nivel == null || nv.indexOf(b.nivel) >= 0)) av.push('ANM, ' + esc(b.nome) + ' (' + esc(b.municipio) + '): ' + esc(b.pendencia) + ' — fora do mapa.'); });
    } else {
      S.barragens = S.listaEquipe.filter(function (b) { return nv.indexOf(b.nv) >= 0; });
      S.listaEquipe.forEach(function (b) { if (b.nv == null) av.push('<b>' + esc(b.nome) + '</b>: sem nível na lista da equipe — fora da seleção.'); });
      av = av.concat(S.avisosEquipe || []);
    }
    S.barragens.sort(function (a, b) { return (b.nv || 0) - (a.nv || 0) || String(a.municipio).localeCompare(String(b.municipio)); });
    S.avisosLista = av;
    if (S.mun) conferirBarragens();
    mostrarAvisosLista();
    if (S.J) gerar();
  }
  // lista automática: reservatorios/barragens/anm.json (GitHub Actions dados-barragens.yml, a partir dos dados abertos da ANM)
  async function carregarAnm() {
    var base = BASE + 'reservatorios/barragens/', info = $('brAnmInfo');
    try {
      var st = null;
      try { var rs = await fetch(base + 'status.json?t=' + Date.now(), { cache: 'no-store' }); if (rs.ok) st = await rs.json(); } catch (e) { st = null; }
      var r = await fetch(base + 'anm.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error('a lista da ANM ainda não foi baixada');
      var j = await r.json();
      if (!j || j.versao !== 1 || !Array.isArray(j.barragens) || j.barragens.length < 50) throw new Error('lista da ANM em formato inesperado');
      j.barragens.forEach(function (b) { if (!(typeof b.lat === 'number' && typeof b.lon === 'number' && isFinite(b.lat) && isFinite(b.lon)) && !b.pendencia) b.pendencia = 'sem coordenada'; });
      S.anm = j; S.anmStatus = st; S.anmErro = null;
      var nm = j.niveis_mg || {}, idade = st && st.verificado_em ? (Date.now() - Date.parse(st.verificado_em.replace('Z', ':00Z'))) / 3600000 : null;
      info.innerHTML = 'ANM/SIGBM: <b>' + (nm['3'] || 0) + '</b> em N3, <b>' + (nm['2'] || 0) + '</b> em N2, <b>' + (nm['1'] || 0) + '</b> em N1' + (nm.alerta ? ' e <b>' + nm.alerta + '</b> em nível de alerta' : '') + ' (MG). Arquivo baixado em ' + esc(fmtDataHora(j.baixado_em.replace('Z', ':00Z'))) +
        (st && st.verificado_em ? '; conferido em ' + esc(fmtDataHora(st.verificado_em.replace('Z', ':00Z'))) : '') + '.' +
        (st && st.ok === false ? '<br><span class="av">⚠ Última verificação não gravou: ' + esc(st.erro || '') + ' (usando a lista anterior).</span>' : '') +
        (idade != null && idade > 36 ? '<br><span class="av">⚠ Sem verificação há mais de 36 h.</span>' : '');
    } catch (e) {
      S.anm = null; S.anmErro = e.message;
      info.innerHTML = '<span class="av">⚠ ' + esc(e.message) + '. Usando a lista da equipe.</span>';
    }
  }
  function mostrarAvisosLista() {
    $('brBarrN').textContent = '(' + S.barragens.length + ')';
    var av = S.avisosLista.slice();
    S.barragens.forEach(function (b) { (b.avisos || []).forEach(function (a) { av.push('<b>' + esc(b.nome) + '</b>: ' + esc(a)); }); });
    $('brBarrAvisos').innerHTML = av.length ? '⚠ Confira a lista:<br>' + av.join('<br>') : '';
  }
  function trocarLista() {
    var f = this.files[0]; if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      var txt = String(rd.result || '');
      try { usarLista(txt, f.name); ls('barrLista', txt); }
      catch (e) { status('Lista de barragens não usada: ' + esc(e.message), 'erro'); }
    };
    rd.readAsText(f, 'utf-8');
    this.value = '';
  }
  var aberta = false;
  async function abrir() {
    if (aberta) return; aberta = true;
    try {
      await Promise.all([garantirMunicipios(), carregarAnm()]); aplicarLista();
      $('brMunLista').innerHTML = S.mun.features.map(function (f) { return '<option value="' + esc(f.properties.nome) + '">'; }).join('');
      var cs = document.getElementById('cpcCycle'); if (cs && cs.value) $('brCiclo').value = cs.value;
      if (!S.J) buscarGfs();   // 13/11: carrega sozinho ao abrir a aba (antes ficava em branco até clicar)
    } catch (e) { console.error(e); status('Não foi possível carregar os limites municipais: ' + esc(e.message), 'erro'); aberta = false; }
  }
  function habilitar(on) { ['brPng', 'brPdf', 'brCsv'].forEach(function (k) { $(k).disabled = !on; }); if (on) liberarPdf(); }
  // o boletim só sai com o critério de emissão atingido; sem gatilho, só com a decisão do meteorologista e justificativa
  function forcado() { return $('brForcar').checked && $('brForcarJust').value.trim().length >= 10; }
  function liberarPdf() { var C = S.calc; $('brPdf').disabled = !C || !(C.dispara || forcado()); }
  function txtGat(g, jan) {
    if (!g) return { dia: '—', h72: '—' };
    var d = jan[g.iDia] ? jan[g.iDia].rotulo.slice(0, 5) : '';
    var w = g.max72 ? 'dias ' + (g.max72.ini + 1) + '–' + (g.max72.fim + 1) : '';
    return { dia: f0(g.diaMax) + ' mm (' + d + ')', h72: g.max72 ? f0(g.max72.mm) + ' mm (' + w + ')' : '—' };
  }
  // critério de emissão escolhido na tela (padrão: 100 mm em um dia ou 100 mm em 72 h); não fica guardado: ao recarregar, volta ao padrão
  // cores dos mapas: a paleta escolhida no topo da ferramenta (seletor "Cores", app.js); sem ela, as cores da escala
  function escalaComPaleta(e) {
    var c = window.RESERV_PALETA && window.RESERV_PALETA.cores(e.cores.length);
    return c && c.length === e.cores.length ? { nome: e.nome, lim: e.lim, rotulos: e.rotulos, cores: c } : e;
  }
  function criterioTela() {
    var v = function (id, on) { var n = parseFloat(String($(id).value).replace(',', '.')); return $(on).checked && isFinite(n) && n > 0 ? n : null; };
    return { dia: v('brCritDia', 'brCritDiaOn'), h72: v('brCrit72', 'brCrit72On') };
  }
  function criterioPadrao(c) { return c.dia === N.LIMIAR_DIA && c.h72 === N.LIMIAR_72H; }
  function textoCriterio(c) {
    var p = [];
    if (c.dia != null) p.push('≥ ' + fmtN(c.dia) + ' mm em um dia');
    if (c.h72 != null) p.push('≥ ' + fmtN(c.h72) + ' mm em 72 h');
    return p.length ? p.join(' ou ') : 'nenhum critério marcado';
  }
  function fmtN(n) { return String(n).replace('.', ','); }
  function mostrarGatilho() {
    var C = S.calc, el = $('brGat'), h = '';
    var crit = 'Critério: <b>' + esc(textoCriterio(C.o.crit)) + '</b> na região' + (C.o.produto === 'barragens' ? ' da barragem (' + (C.o.raio ? 'raio de ' + C.o.raio + ' km' : 'só o ponto') + ')' : ' do município') +
      '. O critério de 40–50 mm/h não é avaliado (o GFS tem passos de 6 h): fica com o meteorologista.';
    if (C.o.produto === 'barragens') {
      var porNivel = {};
      C.pontos.forEach(function (p) { var n = p.b.nv != null ? p.b.nv : '?'; (porNivel[n] = porNivel[n] || []).push(p); });
      h += Object.keys(porNivel).sort().reverse().map(function (n) {
        var l = porNivel[n], d = l.filter(function (p) { return p.gat.dispara; });
        return '<div><b>Nível ' + n + ':</b> ' + (d.length ? '<span class="sim">DISPARA</span> em ' + d.length + ' de ' + l.length + ' (' + esc(d.map(function (p) { return p.b.nome; }).join(', ')) + ')' : '<span class="nao">não dispara</span> (' + l.length + (l.length > 1 ? ' barragens' : ' barragem') + ')') + '</div>';
      }).join('') || '<div>Nenhuma barragem nos níveis marcados.</div>';
      var mx = C.pontos.reduce(function (b, p) { return !b || p.gat.max72.mm > b.gat.max72.mm ? p : b; }, null);
      if (mx) h += '<div class="small">Maior soma de 72 h: ' + f0(mx.gat.max72.mm) + ' mm (' + esc(mx.b.nome) + '); maior dia: ' + f0(Math.max.apply(null, C.pontos.map(function (p) { return p.gat.diaMax; }))) + ' mm.</div>';
    } else if (C.gatMun) {
      var t = txtGat(C.gatMun, C.jan);
      h += '<div><b>' + esc(C.o.munNome) + ':</b> ' + (C.gatMun.dispara ? '<span class="sim">DISPARA</span>' : '<span class="nao">não dispara</span>') + ' · maior dia ' + t.dia + ' · maior 72 h ' + t.h72 + '</div>';
    }
    if (C.o.horas === 72) h += '<div class="small">Horizonte de 72 h: só a janela dos dias 1–3.</div>';
    el.innerHTML = h + '<div class="small" style="margin-top:6px">' + crit + (C.dispara ? '' : ' <b>Sem gatilho, o PDF fica bloqueado</b> (a não ser que o meteorologista decida emitir, com justificativa).') + '</div>';
    liberarPdf();
  }

  function gerar() {
    if (!S.J || !S.mun) return;
    var o = opcoes();
    if (o.produto === 'municipio' && !(S.munIdx[norm(o.munNome)])) { status('Escolha um município da lista.', 'erro'); return; }
    S.calc = calcular(o);
    if (!S.calc.linhas.length) { status('Nenhum município monitorado encontrado (confira a lista de barragens).', 'erro'); habilitar(false); return; }
    tabelas(); textoAuto(false); desenhar(); habilitar(true); mostrarGatilho();
  }
  function figura(id) {
    var C = S.calc;
    var op = id === 'regiao' ? opRecorte(C, false) : id === 'municipio' ? opRecorte(C, true) : id === 'diario' ? opDiario(C) : opEstado(C);
    S.figOp = op;
    return LM().svg(op);
  }
  function desenhar() {
    document.querySelectorAll('#brReprs button').forEach(function (b) { b.classList.toggle('on', b.dataset.r === S.repr); });
    var r = REPRES.filter(function (x) { return x.id === S.repr; })[0];
    $('brReprDesc').textContent = r.desc;
    if (!S.calc) return;
    var el = $('brMapa');
    try {
      S.fig = figura(S.repr);
      el.innerHTML = '';
      var im = new Image(); im.alt = r.nome; im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(S.fig); el.appendChild(im);
    } catch (e) { console.error(e); el.innerHTML = '<div class="small" style="padding:12px;line-height:1.4">Erro ao desenhar o mapa: ' + esc(e.message) + '</div>'; }
  }
  function tabelas() {
    var C = S.calc, dh = C.jan.map(function (w, k) { return '<th class="n" title="' + esc(w.local) + '">Dia ' + (k + 1) + '<br><span class="small">' + w.rotulo.slice(0, 5) + '</span></th>'; }).join('');
    var h = '<thead><tr><th>Município</th>' + dh + '<th class="n">Total (média)</th><th class="n">mín–máx</th><th>Faixa no texto</th></tr></thead><tbody>';
    C.linhas.forEach(function (l) {
      h += '<tr><td>' + esc(l.nome) + '</td>' + l.dias.map(function (d) { return '<td class="n">' + f1(d.media) + '</td>'; }).join('') +
        '<td class="n"><b>' + f1(l.total.media) + '</b></td><td class="n">' + f0(l.total.min) + '–' + f0(l.total.max) + '</td><td>' + esc(l.faixa) + '</td></tr>';
    });
    h += '<tr><td><b>Faixa do dia</b></td>' + C.diasTxt.map(function (d) { return '<td class="n">' + esc(d.faixa.replace(' mm', '')) + '</td>'; }).join('') + '<td></td><td></td><td></td></tr>';
    $('brTabMun').innerHTML = h + '</tbody>';
    if (C.o.produto !== 'barragens') return;
    var hb = '<thead><tr><th>Nº</th><th>Barragem</th><th>Município</th><th>Nível</th><th class="n">' + C.o.horas + ' h · bloco</th><th class="n">' + C.o.horas + ' h · ponto</th>' + C.jan.map(function (w, k) { return '<th class="n">Dia ' + (k + 1) + '</th>'; }).join('') + '<th class="n">Maior dia (região)</th><th class="n">Maior 72 h (região)</th><th>Gatilho</th><th>Aviso</th></tr></thead><tbody>';
    C.pontos.forEach(function (p, i) {
      var b = p.b;
      var tg = txtGat(p.gat, C.jan);
      hb += '<tr' + (p.gat.dispara ? ' class="disp"' : '') + '><td>' + (i + 1) + '</td><td>' + esc(b.nome) + (b.nomeBda && b.nomeBda !== b.nome ? '<br><span class="small">' + esc(b.nomeBda) + '</span>' : '') + '</td><td>' + esc(b.munCad ? b.munCad.properties.nome : b.municipio) + '</td><td>' + esc(b.nivel || '—') + '</td>' +
        '<td class="n">' + f1(p.bruto) + '</td><td class="n"><b>' + f1(p.suave) + '</b></td>' + p.dias.map(function (v) { return '<td class="n">' + f1(v) + '</td>'; }).join('') + '<td class="n">' + tg.dia + '</td><td class="n">' + tg.h72 + '</td><td>' + (p.gat.dispara ? '<b style="color:#b10d1c">DISPARA</b>' : 'não') + '</td><td class="av">' + esc((b.avisos || []).join('; ')) + '</td></tr>';
    });
    $('brTabBarr').innerHTML = hb + '</tbody>';
  }
  // texto automático no modelo dos boletins de jan/2025 (o meteorologista completa a condição do tempo)
  function textoAuto(forcar) {
    var C = S.calc; if (!C) return;
    var cond = $('brCondicao').value.trim() || '[condição do tempo]';
    var grupos = {};
    C.linhas.forEach(function (l) { (grupos[l.faixa] = grupos[l.faixa] || []).push(l); });
    var ordem = Object.keys(grupos).sort(function (a, b) { return Math.max.apply(null, grupos[b].map(function (l) { return l.total.max; })) - Math.max.apply(null, grupos[a].map(function (l) { return l.total.max; })); });
    var partes = ordem.map(function (fx, i) {
      var nomes = lista(grupos[fx].map(function (l) { return l.nome; }));
      var plural = grupos[fx].length > 1;
      if (fx === 'sem chuva significativa') return (plural ? 'nos municípios de ' : 'no município de ') + nomes + ' não há previsão de chuva significativa';
      var m = /^(\d+) - (\d+) mm$/.exec(fx), v = m ? 'entre ' + m[1] + ' e ' + m[2] + ' mm' : fx;
      return (i === 0 ? 'acumulados ' + v + ' são esperados ' : 'acumulados ' + v + ' ') + (plural ? 'nos municípios de ' : 'no município de ') + nomes;
    });
    var t = cond + ' sobre Minas Gerais e, em ' + C.o.horas + ' horas, ' + partes.join('; ') + ' (Figura 1). Não se descarta a possibilidade de os acumulados totais alcançarem valores acima dos previstos. Cabe ressaltar a importância do acompanhamento diário da previsão de tempo, já que ela tende a aumentar sua acurácia com a proximidade dos eventos.';
    var ta = $('brTexto');
    if (forcar || !ta.dataset.editado || ta.dataset.chave !== chaveTexto()) { ta.value = t; ta.dataset.editado = ''; ta.dataset.chave = chaveTexto(); }
    ta.oninput = function () { ta.dataset.editado = '1'; };
    // dias
    var box = $('brDias'), ant = {};
    box.querySelectorAll('input').forEach(function (i) { ant[i.dataset.k] = i.value; });
    box.innerHTML = C.diasTxt.map(function (d, k) {
      return '<div class="diaLin"><span>' + d.w.rotulo + '</span><input type="text" data-k="' + k + '" placeholder="Condição do dia (ex.: Tempo instável, com chuva)" value="' + esc(ant[k] || '') + '"></div>' +
        '<div class="small" style="margin:-2px 0 6px 92px">Acumulados totais: <b>' + esc(d.faixa) + '</b> · ' + esc(d.w.local) + '</div>';
    }).join('');
    var at = $('brAtencaoTxt');
    if (forcar || !at.dataset.editado || at.dataset.chave !== chaveTexto()) {
      at.value = 'Diante das condições atmosféricas na região, é recomendado estado de atenção na região ' + (C.linhas.length > 1 ? 'dos municípios de ' : 'do município de ') + lista(C.linhas.map(function (l) { return l.nome; })) + ', onde córregos e rios poderão encher e há risco de deslizamentos e enchentes.';
      at.dataset.editado = ''; at.dataset.chave = chaveTexto();
    }
    at.oninput = function () { at.dataset.editado = '1'; };
  }
  function chaveTexto() { var C = S.calc; return [S.J && S.J.data_ciclo, S.ciclo, C.o.produto, C.o.munNome, C.o.horas, S.barragens.length, (C.o.niveis || []).join('')].join('|'); }

  /* ---------------- salvar ---------------- */
  function baseNome() {
    var C = S.calc, o = C.o;
    return (o.produto === 'barragens' ? 'Barragens_Niveis_2e3' : o.munNome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_')) + '_' + o.horas + 'h_' + S.J.data_ciclo.replace(/-/g, '') + '_' + S.J.ciclo + 'Z';
  }
  function baixar(blob, nome) { var a = document.createElement('a'); a.download = nome; a.href = URL.createObjectURL(blob); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 60000); }
  async function salvarPng() {
    if (!S.fig) return; var b = $('brPng'); b.disabled = true;
    try {
      baixar(await LM().png(S.figOp), baseNome() + (S.repr === 'estado' ? '' : '_' + S.repr) + '.png');   // 300 dpi, igual aos outros mapas
    }
    catch (e) { console.error(e); alert('Não foi possível gerar o PNG: ' + e.message); }
    finally { b.disabled = false; }
  }
  function salvarCsv() {
    var C = S.calc; if (!C) return;
    var L = [['# Barragens e municípios — ' + tituloProduto(C.o) + ' — GFS rodada ' + S.J.ciclo + 'Z de ' + N.br(S.J.data_ciclo) + ' — ' + C.o.horas + ' h (' + C.periodo + ')'],
      ['Municipio', 'Geocodigo'].concat(C.jan.map(function (w, k) { return 'Dia' + (k + 1) + '_' + w.rotulo + '_media_mm'; }), ['Total_media_mm', 'Total_min_mm', 'Total_max_mm', 'Faixa_texto'])];
    C.linhas.forEach(function (l) { L.push([l.nome, l.f.properties.geocodigo].concat(l.dias.map(function (d) { return f1(d.media); }), [f1(l.total.media), f1(l.total.min), f1(l.total.max), l.faixa])); });
    if (C.o.produto === 'barragens') {
      L.push([]); L.push(['Barragem', 'Nome_BDA', 'Municipio_cadastro', 'Municipio_coordenada', 'Nivel', 'Latitude', 'Longitude', 'Total_bloco_mm', 'Total_ponto_mm'].concat(C.jan.map(function (w, k) { return 'Dia' + (k + 1) + '_ponto_mm'; }), ['Fonte', 'Raio_km', 'Criterio', 'Maior_dia_regiao_mm', 'Maior_72h_regiao_mm', 'Janela_72h', 'Gatilho', 'Aviso']));
      C.pontos.forEach(function (p) { var b = p.b; L.push([b.nome, b.nomeBda, b.municipio, b.munCoord, b.nivel, String(b.lat).replace('.', ','), String(b.lon).replace('.', ','), f1(p.bruto), f1(p.suave)].concat(p.dias.map(f1), [b.fonte || '', C.o.raio, textoCriterio(C.o.crit), f1(p.gat.diaMax), f1(p.gat.max72 ? p.gat.max72.mm : NaN), p.gat.max72 ? 'dias ' + (p.gat.max72.ini + 1) + '-' + (p.gat.max72.fim + 1) : '', p.gat.dispara ? 'DISPARA' : 'nao', (b.avisos || []).join('; ')])); });
    }
    baixarCsv(L, baseNome() + '.csv');
  }
  async function salvarPdf() {
    var C = S.calc; if (!C) return;
    if (!C.dispara && !forcado()) { alert('O critério de emissão não foi atingido. Para emitir assim mesmo, marque “Emitir mesmo sem gatilho” e escreva a justificativa.'); return; }
    var pend = [];
    if (!$('brCondicao').value.trim() && /\[condição do tempo\]/.test($('brTexto').value)) pend.push('a condição do tempo no parágrafo');
    if (pend.length && !confirm('Falta preencher ' + pend.join(' e ') + '. Gerar o PDF assim mesmo?')) return;
    var b = $('brPdf'); b.disabled = true;
    try {
      await garantirJsPdf();
      var J = S.J, doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' }), W = 210, M = 22, y;
      var cab = function () {
        var a = S.logos.simge, g = S.logos.igam;
        if (a) doc.addImage(a.url, 'PNG', M, 10, 15 * a.w / a.h, 15);
        if (g) doc.addImage(g.url, 'PNG', W - M - 15 * g.w / g.h, 10, 15 * g.w / g.h, 15);
      };
      cab(); y = 40;
      doc.setFont('times', 'bold'); doc.setFontSize(15);
      ['Previsão para as próximas ' + C.o.horas + ' horas', dataExtenso(J.data_ciclo), tituloProduto(C.o)].forEach(function (t) { doc.text(t, W / 2, y, { align: 'center' }); y += 6.6; });
      y += 5;
      doc.setFont('times', 'normal'); doc.setFontSize(12);
      var par = function (t, recuo) {
        var ls2 = doc.splitTextToSize((recuo ? '            ' : '') + t, W - 2 * M);
        ls2.forEach(function (l, i) { if (y > 280) { doc.addPage(); cab(); y = 36; } doc.text(l, M, y, i < ls2.length - 1 ? { align: 'justify', maxWidth: W - 2 * M } : {}); y += 5.6; });
      };
      par($('brTexto').value.trim(), true); y += 3;
      var fig = async function (op, legenda) {
        var cv = await LM().canvas(op, 220), w = W - 2 * M, h = w * PAG.h / PAG.w;
        if (y + h + 10 > 285) { doc.addPage(); cab(); y = 36; }
        doc.addImage(cv.toDataURL('image/jpeg', 0.92), 'JPEG', M, y, w, h); y += h + 5;
        doc.setFont('times', 'bold'); var lb = 'Figura ' + legenda[0] + ':', lw = doc.getTextWidth(lb) + 1.6; doc.text(lb, M, y);
        doc.setFont('times', 'normal'); var ll = doc.splitTextToSize(legenda[1], W - 2 * M - lw);
        ll.forEach(function (l, i) { doc.text(l, i ? M : M + lw, y); y += 5; }); y += 3;
      };
      var leg1 = S.repr === 'diario' ? 'precipitação prevista em cada dia e total das próximas ' + C.o.horas + ' horas.'
        : (S.repr === 'municipio' ? 'precipitação média prevista em cada município para as próximas ' : 'acumulado previsto de precipitação para as próximas ') + C.o.horas + ' horas' + (C.o.produto !== 'barragens' ? '. O limite de ' + C.o.munNome + ' está destacado em preto.' : '.');
      await fig(S.figOp, ['1', leg1]);
      if ($('brFig2').checked && S.repr !== 'diario') await fig(opDiario(C), ['2', 'precipitação prevista em cada dia e total de ' + C.o.horas + ' horas.']);
      if (y > 250) { doc.addPage(); cab(); y = 36; }
      doc.setFont('times', 'bold'); doc.text('Previsão diária:', M, y); y += 7; doc.setFont('times', 'normal');
      var ins = $('brDias').querySelectorAll('input');
      C.diasTxt.forEach(function (d, k) {
        var c = (ins[k] && ins[k].value.trim()) || '';
        var t = d.w.rotulo + ': ' + (c ? c.replace(/\.?$/, '. ') : '') + 'Acumulados totais: ' + d.faixa + (k === C.diasTxt.length - 1 ? '.' : ';');
        par(t, false); y += 1.5;
      });
      if ($('brAtencao').checked && $('brAtencaoTxt').value.trim()) {
        y += 4; if (y > 262) { doc.addPage(); cab(); y = 36; }
        doc.setFont('times', 'bold'); doc.text('Estado de Atenção:', M, y); y += 7; doc.setFont('times', 'normal');
        par($('brAtencaoTxt').value.trim(), true);
      }
      var np = doc.getNumberOfPages();
      for (var p = 1; p <= np; p++) { doc.setPage(p); doc.setFontSize(8); doc.setTextColor(110); doc.text('SIMGE/IGAM — GFS/NCEP/NOAA, rodada ' + J.ciclo + 'Z de ' + N.br(J.data_ciclo) + (C.o.produto === 'barragens' ? ' — barragens: ' + (S.fonte === 'anm' && S.anm ? 'ANM/SIGBM de ' + N.br(S.anm.baixado_em.slice(0, 10)) : 'lista da equipe') : '') + ' — página ' + p + ' de ' + np, W / 2, 291, { align: 'center' });
        if (!criterioPadrao(C.o.crit)) doc.text('Critério de emissão usado: ' + textoCriterio(C.o.crit).replace(/≥ /g, 'a partir de ') + ' (alterado em relação ao padrão).', M, 287);
        if (!C.dispara && forcado()) doc.text(doc.splitTextToSize('Emitido sem atingir o critério de emissão. Justificativa: ' + $('brForcarJust').value.trim(), W - 2 * M), M, 284); doc.setTextColor(0); }
      baixar(doc.output('blob'), baseNome() + '.pdf');
    } catch (e) { console.error(e); alert('Não foi possível gerar o PDF: ' + e.message); }
    finally { b.disabled = false; }
  }

  // para testes automáticos
  window.BarragensAba = { estado: S, figura: function (id) { return figura(id); }, gerar: gerar, lerBarragensTxt: lerBarragensTxt, versao: VERSAO_ABA };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montarAba); else montarAba();
})();
