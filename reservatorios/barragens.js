/*
 * Aba "Barragens e municípios" da ferramenta Reservatórios e Tendência (v0.1, 13/11/2026, Patrick/Claude) — SIMGE/IGAM
 *
 * Produtos: "Previsão para as próximas 72/96 horas — Barragens níveis 2 e 3 - MG" e "— Brumadinho - MG" (ou outro município).
 * Mesma metodologia das outras abas: chuva acumulada do GFS 0,25° (dado bruto da NOAA, reservatorios/gfs/<ciclo>/gfs.json).
 *
 * A aba é criada por este arquivo (botão + painel), para a página oficial só precisar de 2 linhas <script>.
 * Independente do app.js (que roda fechado numa função): só usa reservatorios/barragens-nucleo.js e window.CIDADES
 * (chuva/data/cidades.js, já carregado na página). Quando a aba abre, carrega: municípios (alertas/data/municipios.js),
 * mesorregiões (mapas-climaticos/meso.js — mesma geometria do app.js; reserva: tempo-severo/data/meso.js),
 * logos (assets/logo_simge.png e logo_igam.png) e, só para o PDF, o jsPDF (previsao/lib/jspdf.umd.min.js).
 *
 * Representações:
 *   Original · Estado (blocos)  — igual ao boletim de hoje (layout_chuva_72horas_barragens_semzoom / _brumadinho.qpt)
 *   Original · Zoom (blocos)    — igual ao layout_chuva_72horas_barragens.qpt (extensão do QGIS, nomes das barragens)
 *   Proposta · Região detalhada — chuva suavizada, limites municipais, barragens numeradas e mapa de localização
 *   Proposta · Por município    — cada município pintado pela chuva média na área dele (a unidade usada no texto)
 *   Proposta · Dia a dia        — um mapa por dia + total, e gráfico da chuva diária em cada município
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

  // extensões dos layouts do QGIS (layout_chuva_72horas_barragens*.qpt): moldura 282,504 × 196,344 mm
  var EXT_QGIS_ESTADO = { x0: -52.52044426363767, x1: -39.24051185085229, y0: -23.317320677034964, y1: -14.087572929732508 };
  var EXT_QGIS_ZOOM = { x0: -48.66398481946848, x1: -42.85731362208365, y0: -22.990239751065534, y1: -18.954518127076692 };
  var COR_BARRAGEM = '#db1e2a';   // losango vermelho do boletim de jan/2025
  // cor do losango por nível de emergência (N2 = vermelho do boletim; N3 mais escuro; N1 laranja; sem nível = cinza)
  var COR_NIVEL = { 3: '#7f0010', 2: '#db1e2a', 1: '#f28c28', 0: '#8c8c8c' };
  function corB(b) { return COR_NIVEL[b && b.nv != null ? b.nv : 0] || COR_BARRAGEM; }
  function nivelInt(t) { var m = /n[ií]vel\s*([0-3])|\bN\s*([0-3])\b/i.exec(String(t || '')); return m ? +(m[1] || m[2]) : null; }

  var REPRES = [
    { id: 'padrao', nome: 'Padrão das ferramentas', grupo: 'Padrão', desc: 'Mesmo layout dos outros mapas da plataforma (Reservatórios, Acumulados, Previsão): chuva do GFS interpolada em grade de 0,05°, como na aba Acumulados.' },
    { id: 'orig', nome: 'Original · Estado (blocos)', grupo: 'Original', desc: 'Como o boletim de hoje: Minas inteira, chuva nos blocos de 0,25° do GFS.' },
    { id: 'origzoom', nome: 'Original · Zoom (blocos)', grupo: 'Original', desc: 'Como o layout “com zoom” do QGIS (centro-sul de Minas), com o nome das barragens.' },
    { id: 'regiao', nome: 'Região detalhada', grupo: 'Proposta', desc: 'Zoom automático na região, chuva suavizada, limites municipais, barragens numeradas e localização no estado.' },
    { id: 'municipio', nome: 'Por município', grupo: 'Proposta', desc: 'Cada município com a chuva média na área dele: é a mesma unidade usada no texto do boletim.' },
    { id: 'diario', nome: 'Dia a dia', grupo: 'Proposta', desc: 'Um mapa por dia e o total, com o gráfico da chuva de cada dia nos municípios monitorados.' }
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
  var S = { figOp: null, anm: null, anmStatus: null, anmErro: null, fonte: 'anm', listaEquipe: [], meso: null, logos: {}, J: null, ciclo: null, mun: null, munIdx: null, barragens: [], avisosLista: [], origemLista: 'padrão', repr: 'padrao', fig: null, calc: null, carregando: null };

  /* ---------------- lista de barragens ---------------- */
  function lerBarragensTxt(txt) {
    var linhas = String(txt || '').replace(/^﻿/, '').split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (linhas.length < 2) throw new Error('o arquivo não tem linhas de barragens');
    var sep = linhas[0].indexOf('\t') >= 0 ? '\t' : (linhas[0].indexOf(';') >= 0 ? ';' : null);
    if (!sep) throw new Error('o arquivo não é separado por tabulação (como o BARRAGENS.txt do QGIS)');
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
    if (S.mun && S.meso) return;
    var q = QV ? '?' + QV : '';
    var tarefas = [];
    if (!window.MUNICIPIOS_MG) tarefas.push(carregarScript(BASE + 'alertas/data/municipios.js' + q));
    if (!window.MESO_MC && !window.MESO) tarefas.push(carregarScript(BASE + 'mapas-climaticos/meso.js' + q).catch(function () { return carregarScript(BASE + 'tempo-severo/data/meso.js' + q); }));
    tarefas.push(carregarLogo('simge', 'assets/logo_simge.png'), carregarLogo('igam', 'assets/logo_igam.png'));
    await Promise.all(tarefas);
    S.meso = window.MESO_MC || window.MESO;
    if (!S.meso || !S.meso.features || !window.MUNICIPIOS_MG) throw new Error('limites de municípios ou mesorregiões indisponíveis');
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
    return { produto: produto, horas: h, escala: N.ESCALAS[$('brEscala').value] || N.ESCALAS.boletim, escalaId: $('brEscala').value, munNome: munNome,
      cidades: $('brCidades').checked, rotulosBarr: $('brRotulos').checked, niveis: niveisEscolhidos(), raio: +$('brRaio').value };
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
  function gatilhoMunicipio(J, f, dias) {
    var pts = f._amostras || (f._amostras = N.amostras(f)), g = J.grade;
    var porDia = dias.map(function (k) { var mx = -Infinity; pts.forEach(function (p) { var v = N.bilinear(g, J.produtos[k].mm, p[0], p[1]); if (v > mx) mx = v; }); return mx; });
    var jan = [];
    for (var a = 0; a + 3 <= dias.length; a++) { var mx = -Infinity; pts.forEach(function (p) { var s = 0; for (var k = a; k < a + 3; k++) s += N.bilinear(g, J.produtos[dias[k]].mm, p[0], p[1]); if (s > mx) mx = s; }); jan.push({ ini: a, fim: a + 2, mm: mx }); }
    var dm = Math.max.apply(null, porDia), j72 = jan.reduce(function (b, x) { return !b || x.mm > b.mm ? x : b; }, null), mot = [];
    if (dm >= N.LIMIAR_DIA) mot.push('dia'); if (j72 && j72.mm >= N.LIMIAR_72H) mot.push('72h');
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
        gat: N.gatilho(J, b.lon, b.lat, o.raio, H.dias) };
    }) : [];
    // Brumadinho / município: gatilho no município (maior valor dentro do limite)
    var gatMun = o.produto !== 'barragens' && mons[0] ? gatilhoMunicipio(J, mons[0], H.dias) : null;
    var jan = N.janelas(J, o.horas);
    // faixa de cada dia: da menor à maior média dos municípios monitorados (como o "Acumulados totais" do boletim)
    var diasTxt = jan.map(function (w, k) {
      var meds = linhas.map(function (l) { return l.dias[k].media; }), maxs = linhas.map(function (l) { return l.dias[k].max; });
      return { w: w, faixa: linhas.length ? N.faixa(Math.min.apply(null, meds), Math.max.apply(null, meds)) : '—', maxMun: linhas.length ? Math.max.apply(null, maxs) : NaN };
    });
    var dispara = o.produto === 'barragens' ? pontos.some(function (p) { return p.gat.dispara; }) : !!(gatMun && gatMun.dispara);
    return { o: o, H: H, mons: mons, linhas: linhas, pontos: pontos, jan: jan, diasTxt: diasTxt, gatMun: gatMun, dispara: dispara,
      periodo: N.br(jan[0].data) + ' a ' + N.br(jan[jan.length - 1].data) };
  }

  /* =====================================================================================
   * DESENHO (SVG em milímetros, folha A4 deitada 297 × 210, igual ao layout do QGIS)
   * ===================================================================================== */
  var PAG = { w: 297, h: 210 };
  var FONTE = 'Arial, Helvetica, sans-serif';
  var uid = 0;
  function projecao(ext, r, igualGraus) {
    // igualGraus = true: 1° de longitude = 1° de latitude (como o QGIS em EPSG:4674); senão corrige pelo cosseno da latitude
    var cy = (ext.y0 + ext.y1) / 2, fx = igualGraus ? 1 : Math.cos(cy * Math.PI / 180);
    var k = Math.min(r.w / ((ext.x1 - ext.x0) * fx), r.h / (ext.y1 - ext.y0));
    var cx = (ext.x0 + ext.x1) / 2, hw = r.w / (k * fx) / 2, hh = r.h / k / 2;
    var e = { x0: cx - hw, x1: cx + hw, y0: cy - hh, y1: cy + hh };
    return { e: e, k: k, fx: fx, r: r, X: function (lon) { return r.x + (lon - e.x0) * k * fx; }, Y: function (lat) { return r.y + (e.y1 - lat) * k; } };
  }
  function bbGeom(f) { return f._bb || (f._bb = N.caixa(f.geometry)); }
  function cruza(bb, e) { return !(bb[2] < e.x0 || bb[0] > e.x1 || bb[3] < e.y0 || bb[1] > e.y1); }
  function caminho(geom, P) {
    var s = '', pol = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
    pol.forEach(function (p) { p.forEach(function (ring) {
      var ult = null;
      ring.forEach(function (c, i) {
        var x = P.X(c[0]).toFixed(2), y = P.Y(c[1]).toFixed(2), t = x + ' ' + y;
        if (i && t === ult) return; s += (i ? 'L' : 'M') + t; ult = t;
      });
      s += 'Z';
    }); });
    return s;
  }
  function clipMG(P, id) {
    return '<clipPath id="' + id + '">' + S.meso.features.map(function (f) { return '<path d="' + caminho(f.geometry, P) + '"/>'; }).join('') + '</clipPath>';
  }
  function corClasse(v, esc) { return esc.cores[N.classe(v, esc.lim)]; }
  function hexRgbArr(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  // chuva em blocos (cada célula de 0,25° do GFS)
  function camadaBlocos(J, m, P, esc) {
    var g = J.grade, s = '';
    for (var y = 0; y < g.lat.length; y++) for (var x = 0; x < g.lon.length; x++) {
      var lo = g.lon[x], la = g.lat[y];
      if (lo + 0.125 < P.e.x0 || lo - 0.125 > P.e.x1 || la + 0.125 < P.e.y0 || la - 0.125 > P.e.y1) continue;
      var x0 = P.X(lo - 0.125), x1 = P.X(lo + 0.125), y0 = P.Y(la + 0.125), y1 = P.Y(la - 0.125);
      s += '<rect x="' + x0.toFixed(2) + '" y="' + y0.toFixed(2) + '" width="' + (x1 - x0 + 0.03).toFixed(2) + '" height="' + (y1 - y0 + 0.03).toFixed(2) + '" fill="' + corClasse(m[y][x], esc) + '"/>';
    }
    return s;
  }
  // chuva suavizada (interpolação bilinear entre os pontos do GFS), desenhada como imagem
  function camadaSuave(J, m, P, esc, pxmm) {
    var W = Math.max(50, Math.min(2400, Math.round(P.r.w * pxmm))), H = Math.max(50, Math.min(2000, Math.round(P.r.h * pxmm)));
    var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var c = cv.getContext('2d'), img = c.createImageData(W, H), d = img.data, cores = esc.cores.map(hexRgbArr);
    for (var j = 0; j < H; j++) {
      var lat = P.e.y1 - (j + 0.5) / H * (P.e.y1 - P.e.y0);
      for (var i = 0; i < W; i++) {
        var lon = P.e.x0 + (i + 0.5) / W * (P.e.x1 - P.e.x0), v = N.bilinear(J.grade, m, lon, lat), o = (j * W + i) * 4;
        if (!isFinite(v)) { d[o + 3] = 0; continue; }
        var cc = cores[N.classe(v, esc.lim)]; d[o] = cc[0]; d[o + 1] = cc[1]; d[o + 2] = cc[2]; d[o + 3] = 255;
      }
    }
    c.putImageData(img, 0, 0);
    return '<image x="' + P.r.x + '" y="' + P.r.y + '" width="' + P.r.w + '" height="' + P.r.h + '" preserveAspectRatio="none" href="' + cv.toDataURL('image/png') + '"/>';
  }
  function linhasMeso(P, cor, larg) {
    return S.meso.features.map(function (f) { return '<path d="' + caminho(f.geometry, P) + '" fill="none" stroke="' + cor + '" stroke-width="' + larg + '" stroke-linejoin="round"/>'; }).join('');
  }
  function linhasMunicipios(P, cor, larg) {
    return S.mun.features.filter(function (f) { return cruza(bbGeom(f), P.e); }).map(function (f) { return '<path d="' + caminho(f.geometry, P) + '" fill="none" stroke="' + cor + '" stroke-width="' + larg + '" stroke-linejoin="round"/>'; }).join('');
  }
  function texto(x, y, t, tam, op) {
    op = op || {};
    var a = ' font-family="' + FONTE + '" font-size="' + tam + '"' + (op.peso ? ' font-weight="' + op.peso + '"' : '') + (op.anc ? ' text-anchor="' + op.anc + '"' : '') + (op.cor ? ' fill="' + op.cor + '"' : '') + (op.it ? ' font-style="italic"' : '');
    if (op.halo) a += ' stroke="#fff" stroke-width="' + (op.halo === true ? tam * 0.22 : op.halo) + '" stroke-linejoin="round" paint-order="stroke"';
    return '<text x="' + mm(x) + '" y="' + mm(y) + '"' + a + '>' + esc(t) + '</text>';
  }
  function losango(x, y, r, cor) { return '<path d="M' + mm(x) + ' ' + mm(y - r) + 'L' + mm(x + r) + ' ' + mm(y) + 'L' + mm(x) + ' ' + mm(y + r) + 'L' + mm(x - r) + ' ' + mm(y) + 'Z" fill="' + cor + '" stroke="#5a0b10" stroke-width="0.25"/>'; }
  function moldura(r, larg) { return '<rect x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h + '" fill="none" stroke="#000" stroke-width="' + (larg || 0.3) + '"/>'; }
  // coordenadas na borda da moldura (como a grade do QGIS)
  function gradeBorda(P, passo) {
    var s = '', e = P.e, r = P.r;
    function rot(v, lat) { var a = Math.abs(v), g = Math.floor(a + 1e-9), mi = Math.round((a - g) * 60); return g + '°' + (mi ? ('0' + mi).slice(-2) + '\'' : '') + (lat ? 'S' : 'W'); }
    for (var lo = Math.ceil(e.x0 / passo) * passo; lo <= e.x1; lo += passo) {
      var x = P.X(lo); if (x < r.x + 4 || x > r.x + r.w - 4) continue;
      s += '<path d="M' + mm(x) + ' ' + r.y + 'v1.4M' + mm(x) + ' ' + (r.y + r.h) + 'v-1.4" stroke="#000" stroke-width="0.2"/>' + texto(x, r.y + r.h + 2.6, rot(lo, false), 1.9, { anc: 'middle', cor: '#333' });
    }
    for (var la = Math.ceil(e.y0 / passo) * passo; la <= e.y1; la += passo) {
      var y = P.Y(la); if (y < r.y + 4 || y > r.y + r.h - 4) continue;
      s += '<path d="M' + r.x + ' ' + mm(y) + 'h1.4M' + (r.x + r.w) + ' ' + mm(y) + 'h-1.4" stroke="#000" stroke-width="0.2"/>' +
        '<text transform="translate(' + mm(r.x - 1) + ' ' + mm(y) + ') rotate(-90)" font-family="' + FONTE + '" font-size="1.9" text-anchor="middle" fill="#333">' + rot(la, true) + '</text>';
    }
    return s;
  }
  function barraEscala(P, x, y, kmMax) {
    var kmGrau = 111.32 * Math.cos(((P.e.y0 + P.e.y1) / 2) * Math.PI / 180), mmKm = P.k * P.fx / kmGrau;
    var passo = kmMax / 3, s = '';
    for (var i = 0; i < 3; i++) s += '<rect x="' + mm(x + i * passo * mmKm) + '" y="' + y + '" width="' + mm(passo * mmKm) + '" height="1.1" fill="' + (i % 2 ? '#fff' : '#000') + '" stroke="#000" stroke-width="0.15"/>';
    for (i = 0; i <= 3; i++) s += texto(x + i * passo * mmKm, y - 0.8, String(Math.round(i * passo)), 2.1, { anc: 'middle' });
    s += texto(x + 3 * passo * mmKm + 1.5, y + 1.1, 'km', 2.1);
    return s;
  }
  function cidadesMapa(P, tam) {
    var l = cidadesRef().filter(function (c) { return c[1] > P.e.x0 && c[1] < P.e.x1 && c[2] > P.e.y0 && c[2] < P.e.y1; });
    return l.map(function (c) {
      var x = P.X(c[1]), y = P.Y(c[2]);
      return '<circle cx="' + mm(x) + '" cy="' + mm(y) + '" r="' + (tam * 0.28) + '" fill="#fff" stroke="#222" stroke-width="0.25"/>' + texto(x + tam * 0.45, y - tam * 0.35, c[0], tam, { halo: true, cor: '#111' });
    }).join('');
  }
  function logos(x, y, h) {   // SIMGE à esquerda, IGAM à direita (como no boletim)
    var s = '', xx = x;
    ['simge', 'igam'].forEach(function (k) {
      var L = S.logos[k]; if (!L) return;
      var w = h * L.w / L.h;
      s += '<image x="' + mm(xx) + '" y="' + y + '" width="' + mm(w) + '" height="' + h + '" href="' + L.url + '"/>'; xx += w + h * 0.25;
    });
    return s;
  }
  function svgFolha(miolo) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + PAG.w + ' ' + PAG.h + '" width="' + PAG.w + 'mm" height="' + PAG.h + 'mm"><rect width="' + PAG.w + '" height="' + PAG.h + '" fill="#fff"/>' + miolo + '</svg>';
  }
  function tituloProduto(o) {
    if (o.produto !== 'barragens') return o.munNome + ' - MG';
    var nv = (o.niveis || [2, 3]).slice().sort();
    return 'Barragens ' + (nv.length > 1 ? 'níveis ' + lista(nv.map(String)) : 'nível ' + nv[0]) + ' - MG';
  }

  /* ---------- Original (estado e zoom): o layout do QGIS ---------- */
  function figOriginal(C, zoom) {
    var o = C.o, J = S.J, m = J.produtos[C.H.total].mm, esc = o.escala, id = 'b' + (++uid);
    var R = { x: 7.24821, y: 6.82794, w: 282.504, h: 196.344 };
    var P = projecao(zoom ? EXT_QGIS_ZOOM : EXT_QGIS_ESTADO, R, true);
    var s = '<defs><clipPath id="' + id + 'r"><rect x="' + R.x + '" y="' + R.y + '" width="' + R.w + '" height="' + R.h + '"/></clipPath>' + clipMG(P, id + 'mg') + '</defs>';
    s += '<g clip-path="url(#' + id + 'r)"><g clip-path="url(#' + id + 'mg)">' + camadaBlocos(J, m, P, esc) + '</g>';
    if (o.produto !== 'barragens') C.mons.forEach(function (f) { s += '<path d="' + caminho(f.geometry, P) + '" fill="#8c8c8c" fill-opacity="0.9" stroke="#232323" stroke-width="0.26"/>'; });
    s += linhasMeso(P, '#3c3c3c', 0.25);
    if (o.cidades) s += cidadesMapa(P, zoom ? 2.6 : 2.3);
    if (o.produto === 'barragens') S.barragens.forEach(function (b) {
      var x = P.X(b.lon), y = P.Y(b.lat);
      s += losango(x, y, zoom ? 1.3 : 1.05, corB(b));
      if (zoom && o.rotulosBarr) s += texto(x + 1.8, y + 1.1, b.nomeBda, 3.0, { halo: true });   // BARRAGENS_zoom.qml: rótulo NOME_BDA
    });
    s += '</g>' + moldura(R) + gradeBorda(P, zoom ? 1 : 2);
    // cabeçalho (caixas do .qpt)
    s += texto(71.8, 16, 'Total Previsto de Precipitação', 6.2, { anc: 'middle', peso: 700, halo: 1.2 });
    s += texto(71.8, 24, tituloProduto(o), 6.2, { anc: 'middle', peso: 700, halo: 1.2 });
    s += texto(68.5, 39.6, 'Modelo GFS', 4.2, { anc: 'middle', halo: 1 });
    s += texto(68.5, 51, C.periodo, 4.2, { anc: 'middle', halo: 1 });
    // legenda (3 colunas, como no boletim)
    var lx = 12.5, ly = 143.5;
    s += '<rect x="' + (lx - 1.5) + '" y="' + (ly - 4) + '" width="58" height="31" fill="#fff" fill-opacity="0.85"/>';
    s += '<path d="M' + lx + ' ' + (ly - 1) + 'h4" stroke="#3c3c3c" stroke-width="0.35"/>' + texto(lx + 5.5, ly, 'Mesorregiões', 2.4);
    s += texto(lx, ly + 4, 'Precipitação Prevista (mm)', 2.4);
    esc.rotulos.forEach(function (rt, i) {
      var cx = lx + Math.floor(i / 5) * 18.5, cy = ly + 6 + (i % 5) * 4.1;
      s += '<rect x="' + cx + '" y="' + cy + '" width="4" height="3" fill="' + esc.cores[i] + '" stroke="#777" stroke-width="0.12"/>' + texto(cx + 5.2, cy + 2.4, rt, 2.3);
    });
    if (o.produto === 'barragens') {
      var nvs = (o.niveis || [2, 3]).slice().sort(function (a, b) { return b - a; });
      nvs.forEach(function (n, i) { s += losango(lx + 2 + i * 17, ly + 28.6, 1.05, COR_NIVEL[n]) + texto(lx + 5 + i * 17, ly + 29.4, 'Nível ' + n, 2.3); });
    }
    else { s += '<rect x="' + lx + '" y="' + (ly + 27.2) + '" width="4" height="3" fill="#8c8c8c" stroke="#232323" stroke-width="0.2"/>' + texto(lx + 5.5, ly + 29.6, o.munNome, 2.3); }
    // créditos, escala e logos
    var cx2 = 257.4, cyy = 166;
    s += '<rect x="226" y="161.5" width="63" height="22" fill="#fff" fill-opacity="0.85"/>';
    ['Sistema de Coordenadas Geográficas', 'Datum SIRGAS 2000', 'Fonte de Dados: GFS/NCEP/NOAA', 'Rodada ' + J.ciclo + 'Z de ' + N.br(J.data_ciclo), 'Elaboração: SIMGE/GMHEC/IGAM - ' + J.data_ciclo.slice(0, 4)]
      .forEach(function (t, i) { s += texto(cx2, cyy + i * 3.4, t, 2.3, { anc: 'middle' }); });
    s += '<rect x="160" y="185" width="129" height="17.5" fill="#fff" fill-opacity="0.85"/>';
    s += barraEscala(P, 163, 194, zoom ? 60 : 150);
    s += logos(215.5, 186.5, 15);
    return svgFolha(s);
  }

  /* ---------- extensão regional automática ---------- */
  // separa os municípios monitorados em: grupo principal (perto uns dos outros) e afastados (viram quadro à parte),
  // para um município distante (ex.: Pouso Alegre) não obrigar o mapa a mostrar meio estado
  function separarRegiao(C) {
    var M = C.mons.slice(); if (M.length <= 1) return { principal: M, afastados: [] };
    var cen = function (f) { var bb = bbGeom(f); return [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2]; };
    var nb = function (f) { return S.barragens.filter(function (b) { return b.munCad === f; }).length; };
    var semente = M.slice().sort(function (a, b) { return nb(b) - nb(a); })[0], grupo = [semente], mudou = true;
    while (mudou) {
      mudou = false;
      M.forEach(function (f) { if (grupo.indexOf(f) >= 0) return; var c = cen(f);
        if (grupo.some(function (g) { var d = cen(g); return Math.hypot(c[0] - d[0], c[1] - d[1]) < 0.9; })) { grupo.push(f); mudou = true; } });
    }
    return { principal: grupo, afastados: M.filter(function (f) { return grupo.indexOf(f) < 0; }) };
  }
  function barragensDe(feats) {   // barragens do município (cadastro) ou a menos de 0,3° de um deles
    return S.barragens.map(function (b, i) { return { b: b, n: i + 1 }; }).filter(function (x) {
      return feats.some(function (f) { if (x.b.munCad === f) return true; var bb = bbGeom(f); return x.b.lon > bb[0] - 0.3 && x.b.lon < bb[2] + 0.3 && x.b.lat > bb[1] - 0.3 && x.b.lat < bb[3] + 0.3; }); });
  }
  function extRegiao(C, margem, feats, barrs) {
    var b = [Infinity, Infinity, -Infinity, -Infinity];
    function add(lo, la) { b[0] = Math.min(b[0], lo); b[1] = Math.min(b[1], la); b[2] = Math.max(b[2], lo); b[3] = Math.max(b[3], la); }
    (feats || C.mons).forEach(function (f) { var bb = bbGeom(f); add(bb[0], bb[1]); add(bb[2], bb[3]); });
    (barrs || []).forEach(function (x) { add(x.b.lon, x.b.lat); });
    if (!isFinite(b[0])) return EXT_QGIS_ZOOM;
    var mg = margem || 0.18, w = Math.max(0.5, b[2] - b[0] + 2 * mg), h = Math.max(0.4, b[3] - b[1] + 2 * mg), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    return { x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2 };
  }
  // barragens muito próximas viram um marcador só (ex.: Forquilha I, II, III e Dique de Pedra, a menos de 2 km)
  function agruparBarragens(P, distMm, lst) {
    var grupos = [];
    (lst || S.barragens.map(function (b, i) { return { b: b, n: i + 1 }; })).forEach(function (it) {
      var x = P.X(it.b.lon), y = P.Y(it.b.lat), g = null;
      for (var k = 0; k < grupos.length; k++) if (Math.hypot(grupos[k].x - x, grupos[k].y - y) < distMm) { g = grupos[k]; break; }
      if (!g) { g = { x: x, y: y, itens: [] }; grupos.push(g); }
      g.itens.push(it.n);
    });
    return grupos;
  }
  function numeros(it) { // [2,3,4,5] -> "2–5"; [1,3] -> "1,3"
    var s = [], i = 0;
    while (i < it.length) { var j = i; while (j + 1 < it.length && it[j + 1] === it[j] + 1) j++; s.push(j > i + 1 ? it[i] + '–' + it[j] : (j === i + 1 ? it[i] + ',' + it[j] : String(it[i]))); i = j + 1; }
    return s.join(',');
  }
  function localizacao(r, ext) { // mapa pequeno de Minas com o retângulo da região
    var P = projecao({ x0: -51.1, x1: -39.8, y0: -23.0, y1: -14.2 }, r, false);
    var s = '<rect x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h + '" fill="#fff" stroke="#9aa5b1" stroke-width="0.2"/>';
    s += S.meso.features.map(function (f) { return '<path d="' + caminho(f.geometry, P) + '" fill="#eef2f6" stroke="#9aa5b1" stroke-width="0.15"/>'; }).join('');
    s += '<rect x="' + mm(P.X(ext.x0)) + '" y="' + mm(P.Y(ext.y1)) + '" width="' + mm(P.X(ext.x1) - P.X(ext.x0)) + '" height="' + mm(P.Y(ext.y0) - P.Y(ext.y1)) + '" fill="none" stroke="#c0392b" stroke-width="0.45"/>';
    return s;
  }
  function legendaVertical(x, y, esc, titulo, alt) {
    var s = texto(x, y, titulo, 2.7, { peso: 700 });
    var n = esc.rotulos.length; alt = alt || 3.2;
    esc.rotulos.forEach(function (rt, i) {
      var yy = y + 2.2 + (n - 1 - i) * alt;   // maior em cima
      s += '<rect x="' + x + '" y="' + mm(yy) + '" width="6" height="' + alt + '" fill="' + esc.cores[i] + '" stroke="#fff" stroke-width="0.1"/>' + texto(x + 7.5, yy + alt * 0.75, rt + ' mm', Math.min(2.3, alt * 0.75));
    });
    return { svg: s + '<rect x="' + x + '" y="' + (y + 2.2) + '" width="6" height="' + mm(n * alt) + '" fill="none" stroke="#8795a1" stroke-width="0.15"/>', fim: y + 2.2 + n * alt };
  }
  function cabecalhoProposta(C, titulo) {
    var J = S.J, s = '<rect x="0" y="0" width="' + PAG.w + '" height="17" fill="#0d668f"/>';
    s += texto(8, 8.2, titulo, 5.2, { peso: 700, cor: '#fff' });
    s += texto(8, 13.6, tituloProduto(C.o) + '  ·  Modelo GFS 0,25° (rodada ' + J.ciclo + 'Z de ' + N.br(J.data_ciclo) + ')  ·  ' + C.periodo, 3.1, { cor: '#dbeefa' });
    return s;
  }
  function rodapeProposta(extra) {
    var s = '<path d="M8 197.6H289" stroke="#d8e1eb" stroke-width="0.3"/>';
    s += texto(8, 201.6, 'Fonte de dados: GFS/NCEP/NOAA (chuva acumulada, grade de 0,25°). Municípios: IBGE. Coordenadas geográficas, SIRGAS 2000. Elaboração: SIMGE/GMHEC/IGAM.', 2.2, { cor: '#4a5868' });
    if (extra) s += texto(8, 205.2, extra, 2.2, { cor: '#4a5868' });
    return s + logos(231, 198.4, 10.2);
  }

  /* ---------- Proposta: região detalhada / por município ---------- */
  // conteúdo de um quadro de mapa (principal ou quadro à parte): chuva, limites, municípios monitorados e barragens
  function quadroRegiao(C, P, porMunicipio, id, op) {
    var o = C.o, J = S.J, m = J.produtos[C.H.total].mm, esc = o.escala, R = P.r, s = '';
    s += '<defs><clipPath id="' + id + 'r"><rect x="' + R.x + '" y="' + R.y + '" width="' + R.w + '" height="' + R.h + '"/></clipPath>' + clipMG(P, id + 'mg') + '</defs>';
    s += '<g clip-path="url(#' + id + 'r)"><rect x="' + R.x + '" y="' + R.y + '" width="' + R.w + '" height="' + R.h + '" fill="#f3f5f7"/>';
    var visiveis = S.mun.features.filter(function (f) { return cruza(bbGeom(f), P.e); });
    if (porMunicipio) {
      visiveis.forEach(function (f) {
        var e = N.estatMunicipio(J, f, [C.H.total], 'suave')[C.H.total];
        s += '<path d="' + caminho(f.geometry, P) + '" fill="' + corClasse(e.media, esc) + '" stroke="#fff" stroke-width="0.25"/>';
      });
    } else {
      s += '<g clip-path="url(#' + id + 'mg)">' + camadaSuave(J, m, P, esc, op.pxmm || 7) + '</g>';
      s += linhasMunicipios(P, 'rgba(255,255,255,0.75)', 0.22);
    }
    // sem as linhas das mesorregiões no zoom: a geometria delas é de outra fonte e não casa com a dos municípios (linha dupla)
    var mons = C.mons.filter(function (f) { return cruza(bbGeom(f), P.e); });
    mons.forEach(function (f) { s += '<path d="' + caminho(f.geometry, P) + '" fill="none" stroke="#111" stroke-width="0.7" stroke-linejoin="round"/>'; });
    var nomesCid = {};
    if (o.cidades && !op.inset) cidadesRef().forEach(function (c) { nomesCid[norm(c[0])] = 1; });
    // outros municípios (só no mapa por município): nome pequeno, quando cabe e não repete uma cidade de referência
    var rotMon = mons.map(function (f) { var bb = bbGeom(f); return [P.X((bb[0] + bb[2]) / 2), P.Y(bb[1]) + 3.4]; });
    if ((porMunicipio || o.produto !== 'barragens') && !op.inset) visiveis.forEach(function (f) {
      if (mons.indexOf(f) >= 0 || nomesCid[norm(f.properties.nome)]) return; var p = f.properties, x = P.X(p.label_lon), y = P.Y(p.label_lat), bb = bbGeom(f);
      if (rotMon.some(function (r) { return Math.abs(r[0] - x) < 22 && Math.abs(r[1] - y) < 5; })) return;
      if ((bb[2] - bb[0]) * P.k * P.fx < 14 || x < R.x + 8 || x > R.x + R.w - 8 || y < R.y + 4 || y > R.y + R.h - 3) return;
      s += texto(x, y, p.nome, 1.9, { anc: 'middle', cor: '#33414f', halo: 0.6 });
    });
    if (o.cidades && !op.inset) s += cidadesMapa(P, 2.6);
    // barragens: losango + número (barragens a menos de ~4 mm viram um marcador só)
    if (o.produto === 'barragens') agruparBarragens(P, op.inset ? 3 : 4.2, op.barrs).forEach(function (g) {
      var nvg = Math.max.apply(null, g.itens.map(function (n) { var b = S.barragens[n - 1]; return b && b.nv != null ? b.nv : 0; }));
      s += losango(g.x, g.y, op.inset ? 1.2 : 1.6, COR_NIVEL[nvg]);
      s += texto(g.x + 2.2, g.y + 3.6, numeros(g.itens), op.inset ? 2.4 : 2.8, { peso: 700, halo: 0.8, cor: '#7a0d14' });
    });
    // nome dos municípios monitorados embaixo do limite (não cobre as barragens); valor médio no mapa por município
    C.linhas.forEach(function (l) {
      if (mons.indexOf(l.f) < 0) return;
      var bb = bbGeom(l.f), x = P.X((bb[0] + bb[2]) / 2), y = P.Y(bb[1]) + 3.4;
      if (y > R.y + R.h - 2) y = P.Y(bb[3]) - 1.4;
      s += texto(x, y, l.nome + (porMunicipio ? ' · ' + f0(l.total.media) + ' mm' : ''), op.inset ? 2.6 : 3.1, { anc: 'middle', peso: 700, halo: 0.9 });
    });
    return s + '</g>' + moldura(R, op.inset ? 0.3 : 0.35);
  }
  function figRegiao(C, porMunicipio) {
    var o = C.o, esc = o.escala, id = 'b' + (++uid);
    var R = { x: 8, y: 21, w: 196, h: 172 };
    var sep = separarRegiao(C), bPrin = o.produto === 'barragens' ? barragensDe(sep.principal) : [];
    var P = projecao(extRegiao(C, o.produto === 'barragens' ? 0.12 : 0.3, sep.principal, bPrin), R, false);
    var s = cabecalhoProposta(C, 'Chuva prevista para ' + o.horas + ' horas' + (porMunicipio ? ' — média por município' : ''));
    s += quadroRegiao(C, P, porMunicipio, id, { barrs: bPrin }) + gradeBorda(P, (P.e.x1 - P.e.x0) > 2.5 ? 0.5 : 0.25);
    s += '<rect x="' + (R.x + R.w - 45) + '" y="' + (R.y + R.h - 9) + '" width="43" height="7" fill="#fff" fill-opacity="0.85"/>' + barraEscala(P, R.x + R.w - 42, R.y + R.h - 4.6, (P.e.x1 - P.e.x0) > 2 ? 30 : (P.e.x1 - P.e.x0) > 1 ? 15 : 6);
    // municípios afastados: quadro à parte no canto inferior esquerdo
    sep.afastados.slice(0, 2).forEach(function (f, i) {
      var r = { x: R.x + 3 + i * 53, y: R.y + R.h - 50, w: 50, h: 40 };
      var bA = o.produto === 'barragens' ? barragensDe([f]).filter(function (x) { return bPrin.indexOf(x) < 0 && !bPrin.some(function (y) { return y.n === x.n; }); }) : [];
      var Pi = projecao(extRegiao(C, 0.1, [f], bA), r, false);
      s += '<rect x="' + (r.x - 1) + '" y="' + (r.y - 5) + '" width="' + (r.w + 2) + '" height="' + (r.h + 6) + '" fill="#fff"/>' + texto(r.x, r.y - 1.4, 'Fora do recorte: ' + f.properties.nome, 2.4, { peso: 700 });
      s += quadroRegiao(C, Pi, porMunicipio, id + 'i' + i, { inset: true, barrs: bA, pxmm: 6 });
    });
    if (sep.afastados.length > 2) s += texto(R.x + 3, R.y + R.h - 57, '+ ' + (sep.afastados.length - 2) + ' município(s) fora do recorte: ver a tabela', 2.3, { peso: 700, halo: true });
    // coluna da direita
    var X = 211, y = 22;
    s += localizacao({ x: X, y: y, w: 78, h: 44 }, P.e);
    y += 51;
    var lg = legendaVertical(X, y, esc, porMunicipio ? 'Chuva média no município' : 'Chuva prevista (' + o.horas + ' h)', 2.75);
    s += lg.svg; y = lg.fim + 6;
    s += texto(X, y, 'Município', 2.5, { peso: 700 }) + texto(X + 50, y, 'média', 2.5, { peso: 700, anc: 'end' }) + texto(X + 66, y, 'mín–máx', 2.5, { peso: 700, anc: 'end' }) + texto(X + 78, y, 'mm', 2.3, { anc: 'end', cor: '#4a5868' });
    C.linhas.slice().sort(function (a, b) { return b.total.media - a.total.media; }).forEach(function (l, i) {
      var yy = y + 4 + i * 3.5;
      s += texto(X, yy, l.nome, 2.5) + texto(X + 50, yy, f0(l.total.media), 2.5, { anc: 'end', peso: 700 }) + texto(X + 66, yy, f0(l.total.min) + '–' + f0(l.total.max), 2.5, { anc: 'end' });
    });
    y += 4 + C.linhas.length * 3.5 + 3;
    if (o.produto === 'barragens') {
      var n = S.barragens.length, dy = Math.min(3, (195 - y) / (n + 1)), fz = Math.min(2.15, dy * 0.75);
      s += texto(X, y, 'Barragens (nº no mapa)', 2.5, { peso: 700 }); y += dy + 0.6;
      S.barragens.forEach(function (b, i) {
        var niv = b.nv != null ? [0, b.nv] : null;
        s += losango(X + 1, y - fz * 0.38, fz * 0.42, corB(b)) + texto(X + 3, y, (i + 1) + '. ' + b.nome + ' — ' + (b.munCad ? b.munCad.properties.nome : b.municipio) + (niv ? ' (N' + niv[1] + ')' : ' (sem nível)') + ((b.avisos || []).length ? ' ⚠' : ''), fz);
        y += dy;
      });
    }
    var av = S.barragens.filter(function (b) { return (b.avisos || []).length; }).length;
    s += rodapeProposta((porMunicipio ? 'Cor de cada município = média da chuva prevista nos pontos dentro dele (grade de ~1 km sobre a interpolação bilinear do GFS).' : 'Chuva suavizada: interpolação bilinear entre os pontos de 0,25° do GFS (a mesma chuva dos blocos do mapa original, sem os degraus).') +
      (o.produto === 'barragens' && av ? ' ⚠ = conferir o cadastro da barragem.' : ''));
    return svgFolha(s);
  }

  /* ---------- Proposta: dia a dia ---------- */
  var CORES_DIAS = ['#9ecae1', '#4292c6', '#08519c', '#08306b'];
  function figDiario(C) {
    var o = C.o, J = S.J, esc = o.escala, id = 'b' + (++uid);
    var s = cabecalhoProposta(C, 'Chuva prevista dia a dia');
    var sep = separarRegiao(C), bPrin = o.produto === 'barragens' ? barragensDe(sep.principal) : [];
    var ext = extRegiao(C, o.produto === 'barragens' ? 0.12 : 0.3, sep.principal, bPrin);
    var paineis = C.H.dias.map(function (d, k) { return { m: J.produtos[d].mm, t: 'Dia ' + (k + 1) + ' — ' + C.jan[k].rotulo, sub: C.jan[k].local }; });
    paineis.push({ m: J.produtos[C.H.total].mm, t: 'Total de ' + o.horas + ' h', sub: C.periodo, total: true });
    var col = 3, pw = 91, ph = 66, gx = 8, gy = 22;
    paineis.forEach(function (pn, i) {
      var r = { x: gx + (i % col) * (pw + 4), y: gy + Math.floor(i / col) * (ph + 12) + 6, w: pw, h: ph };
      var P = projecao(ext, r, false), pid = id + 'p' + i;
      s += texto(r.x, r.y - 2.6, pn.t, 3.0, { peso: 700, cor: pn.total ? '#0d668f' : '#172033' }) + texto(r.x + r.w, r.y - 2.6, pn.sub, 2.0, { anc: 'end', cor: '#4a5868' });
      s += '<defs><clipPath id="' + pid + 'r"><rect x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h + '"/></clipPath>' + clipMG(P, pid + 'mg') + '</defs>';
      s += '<g clip-path="url(#' + pid + 'r)"><rect x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h + '" fill="#f3f5f7"/>';
      s += '<g clip-path="url(#' + pid + 'mg)">' + camadaSuave(J, pn.m, P, esc, 5) + '</g>';
      s += linhasMunicipios(P, 'rgba(255,255,255,0.6)', 0.15);
      C.mons.forEach(function (f) { s += '<path d="' + caminho(f.geometry, P) + '" fill="none" stroke="#111" stroke-width="0.45"/>'; });
      if (o.produto === 'barragens') agruparBarragens(P, 2.5, bPrin).forEach(function (g) { var nvg = Math.max.apply(null, g.itens.map(function (n) { var b = S.barragens[n - 1]; return b && b.nv != null ? b.nv : 0; })); s += losango(g.x, g.y, 0.95, COR_NIVEL[nvg]); });
      // valor máximo do painel nos municípios monitorados
      var mx = -Infinity; C.linhas.forEach(function (l) { if (sep.principal.indexOf(l.f) < 0) return; var v = pn.total ? l.total.max : l.dias[i].max; if (v > mx) mx = v; });
      s += '</g>' + moldura(r, 0.25);
      s += '<rect x="' + (r.x + 1) + '" y="' + (r.y + r.h - 5.2) + '" width="' + 46 + '" height="4.2" fill="#fff" fill-opacity="0.88"/>' + texto(r.x + 2, r.y + r.h - 2.1, 'máx. nos municípios do recorte: ' + f0(mx) + ' mm', 2.0);
    });
    // gráfico de barras empilhadas (média de cada dia em cada município)
    var gi = paineis.length, gr = { x: gx + (gi % col) * (pw + 4), y: gy + Math.floor(gi / col) * (ph + 12) + 6, w: pw, h: ph };
    if (gi < 6) {
      s += texto(gr.x, gr.y - 2.6, 'Média de cada dia por município (mm)', 3.0, { peso: 700 });
      var ls = C.linhas.slice().sort(function (a, b) { return b.total.media - a.total.media; }).slice(0, 10);
      var maxT = Math.max.apply(null, ls.map(function (l) { return l.total.media; }).concat([1]));
      var esc10 = maxT <= 20 ? 5 : maxT <= 50 ? 10 : maxT <= 120 ? 20 : maxT <= 250 ? 50 : 100, topo = Math.ceil(maxT / esc10) * esc10;
      var nomeW = 27, bx = gr.x + nomeW, bw = gr.w - nomeW - 9, bh = Math.min(6, (gr.h - 14) / Math.max(1, ls.length) - 1.2);
      for (var t = 0; t <= topo + 1e-9; t += esc10) { var xx = bx + t / topo * bw; s += '<path d="M' + mm(xx) + ' ' + gr.y + 'V' + (gr.y + gr.h - 9) + '" stroke="#e3e8ee" stroke-width="0.2"/>' + texto(xx, gr.y + gr.h - 6, String(t), 2.0, { anc: 'middle', cor: '#4a5868' }); }
      ls.forEach(function (l, i) {
        var yy = gr.y + 1 + i * (bh + 1.2), acc = 0;
        s += texto(bx - 1.2, yy + bh * 0.7, l.nome, 2.2, { anc: 'end' });
        l.dias.forEach(function (d, k) { var w = d.media / topo * bw; s += '<rect x="' + mm(bx + acc) + '" y="' + mm(yy) + '" width="' + mm(Math.max(0, w)) + '" height="' + mm(bh) + '" fill="' + CORES_DIAS[k] + '" stroke="#fff" stroke-width="0.15"/>'; acc += w; });
        s += texto(bx + acc + 1, yy + bh * 0.72, f0(l.total.media), 2.2, { peso: 700 });
      });
      C.H.dias.forEach(function (d, k) { var lx = gr.x + nomeW + k * 15; s += '<rect x="' + lx + '" y="' + (gr.y + gr.h - 3.6) + '" width="3" height="2.4" fill="' + CORES_DIAS[k] + '"/>' + texto(lx + 3.8, gr.y + gr.h - 1.6, 'Dia ' + (k + 1), 2.1); });
    }
    // legenda horizontal embaixo
    var ly = 186.5, lw = 11.5, lx0 = 8;
    s += texto(lx0, ly - 1.2, 'Chuva (mm)', 2.4, { peso: 700 });
    esc.rotulos.forEach(function (rt, i) { var x = lx0 + 17 + i * lw; s += '<rect x="' + mm(x) + '" y="' + (ly - 3.6) + '" width="' + lw + '" height="2.8" fill="' + esc.cores[i] + '" stroke="#fff" stroke-width="0.1"/>' + texto(x + lw / 2, ly + 1.6, rt.replace(' - ', '–'), 1.8, { anc: 'middle' }); });
    s += rodapeProposta('Mesma escala em todos os mapas. Dia = 24 h a partir da rodada (dia 1: ' + C.jan[0].local.replace(/ \(hora local\)/, '') + ', hora local).' + (sep.afastados.length ? ' Fora do recorte dos mapas (só no gráfico): ' + lista(sep.afastados.map(function (f) { return f.properties.nome; })) + '.' : ''));
    return svgFolha(s);
  }

  /* ---------- Padrão das ferramentas: o mesmo LayoutMapa dos outros mapas da plataforma ----------
   * Chuva: interpolação bilinear do GFS numa grade de 0,05° (igual à aba Acumulados), agrupada em faixas por linha. */
  function areasGfs(m, esc) {
    var g = S.J.grade, A = 0.05, C0 = -52.0, F0 = -13.5, W = Math.round((-38.9 - C0) / A) + 1, H = Math.round((F0 + 24.0) / A) + 1;
    var polys = esc.cores.map(function () { return []; });
    for (var y = 0; y < H; y++) {
      var lat = F0 - A * y, top = lat + A / 2, bot = lat - A / 2, x = 0, cl = [];
      for (var i = 0; i < W; i++) { var v = N.bilinear(g, m, C0 + A * i, lat); cl.push(isFinite(v) ? N.classe(v, esc.lim) : -1); }
      while (x < W) {
        var c = cl[x], xe = x; while (xe + 1 < W && cl[xe + 1] === c) xe++;
        if (c >= 0) { var l = C0 + A * (x - 0.5), r = C0 + A * (xe + 0.5); polys[c].push([[[l, top], [r, top], [r, bot], [l, bot], [l, top]]]); }
        x = xe + 1;
      }
    }
    return polys.map(function (pp, i) { return pp.length ? { geometry: { type: 'MultiPolygon', coordinates: pp }, fill: hexRgb(esc.cores[i]), strokeWidth: 0.15 } : null; }).filter(Boolean);
  }
  function hexRgb(h) { var a = hexRgbArr(h); return 'rgb(' + a.join(',') + ')'; }
  // "Forquilha II", "Forquilha III" -> "Forquilha II e III"; mais de 3 nomes -> "Nome +N"
  function juntarNomes(n) {
    if (n.length === 1) return n[0];
    var p = n.map(function (x) { return x.split(/\s+/); }), w = p[0][0];
    if (p.every(function (x) { return x[0] === w && x.length > 1; }) && n.length <= 3) return w + ' ' + lista(p.map(function (x) { return x.slice(1).join(' '); }));
    return n.length > 2 ? n[0] + ' +' + (n.length - 1) : n.join(' / ');
  }
  // caixas aproximadas (em graus) no mapa do LayoutMapa (~18,6 mm por grau): ponto 3,2 mm; cidade 3,5 mm embaixo do ponto
  function arrumarRotulos(pontos, cidades) {
    var GX = 0.097, GC = 0.105, H = 0.19;
    function caixaCidade(c) { var w = c.nome.length * GC; return [c.lon - w / 2, c.lat - 0.26, c.lon + w / 2, c.lat - 0.05]; }
    function caixaPonto(p, lado) {
      var w = p.rotulo.length * GX;
      if (lado === 'esquerda') return [p.lon - 0.07 - w, p.lat - H / 2, p.lon - 0.07, p.lat + H / 2];
      if (lado === 'acima') return [p.lon - w / 2, p.lat + 0.06, p.lon + w / 2, p.lat + 0.06 + H];
      return [p.lon + 0.07, p.lat - H / 2, p.lon + 0.07 + w, p.lat + H / 2];
    }
    function cruzaB(a, b) { return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]); }
    var ocupadas = [];
    pontos.forEach(function (p) {
      var cx = cidades.map(caixaCidade), melhor = null;
      ['direita', 'esquerda', 'acima'].some(function (lado) {
        var bx = caixaPonto(p, lado);
        var nCid = cx.filter(function (c) { return cruzaB(bx, c); }).length, nPt = ocupadas.filter(function (o) { return cruzaB(bx, o); }).length;
        if (!melhor || nCid + 10 * nPt < melhor.custo) melhor = { lado: lado, bx: bx, custo: nCid + 10 * nPt };
        return melhor.custo === 0;
      });
      p.lado = melhor.lado === 'direita' ? undefined : melhor.lado;
      ocupadas.push(melhor.bx);
      // nenhuma posição livre: sai o nome da cidade de referência (o rótulo da barragem é o que importa aqui)
      for (var i = cidades.length - 1; i >= 0; i--) if (cruzaB(melhor.bx, caixaCidade(cidades[i]))) cidades.splice(i, 1);
    });
  }
  function opPadrao(C) {
    var o = C.o, J = S.J, esc = o.escala, m = J.produtos[C.H.total].mm;
    var areas = areasGfs(m, esc), legenda = esc.rotulos.map(function (l, i) { return { fill: hexRgb(esc.cores[i]), label: l + ' mm' }; });
    var pontos = [];
    if (o.produto === 'barragens') {
      // barragens a menos de ~5 km viram um ponto só (nomes juntos), para os rótulos não se sobreporem
      var grupos = [];
      S.barragens.forEach(function (b) {
        var g = null; for (var k = 0; k < grupos.length; k++) if (Math.abs(grupos[k].lon - b.lon) < 0.05 && Math.abs(grupos[k].lat - b.lat) < 0.05) { g = grupos[k]; break; }
        if (!g) { g = { lon: b.lon, lat: b.lat, itens: [] }; grupos.push(g); } g.itens.push(b);
      });
      grupos.forEach(function (g) {
        var nv = Math.max.apply(null, g.itens.map(function (b) { return b.nv || 0; }));
        pontos.push({ lon: g.lon, lat: g.lat, cor: COR_NIVEL[nv], rotulo: juntarNomes(g.itens.map(function (b) { return b.nome.replace(/^Barragem\s+/i, ''); })) });
      });
      (o.niveis || []).slice().sort(function (a, b) { return b - a; }).forEach(function (n) { legenda.push({ fill: COR_NIVEL[n], label: 'Barragem nível ' + n }); });
    } else {
      C.mons.forEach(function (f) { areas.push({ geometry: f.geometry, fill: 'rgb(140,140,140)', opacity: 0.85, stroke: 'rgb(35,35,35)', strokeWidth: 0.35 }); });
      legenda.push({ fill: 'rgb(140,140,140)', label: o.munNome });
    }
    // rótulos sem sobreposição: para cada barragem tenta direita, esquerda e acima; se nada couber, tira o nome da cidade que atrapalha
    var cidades = o.cidades ? cidadesRef().map(function (c) { return { nome: c[0], lon: c[1], lat: c[2] }; }) : [];
    if (pontos.length) arrumarRotulos(pontos, cidades);
    var j0 = C.jan[0], jn = C.jan[C.jan.length - 1];
    var ini = j0.local.split(' a ')[0], fim = jn.local.split(' a ')[1].replace(' (hora local)', '');
    return {
      titulo: 'Total Previsto de Precipitação · ' + (o.produto === 'barragens' ? tituloProduto(o).replace(' - MG', '') : o.munNome),
      textoValidade: 'VÁLIDO: ' + ini.replace(' de ', ' ') + ' às ' + fim.replace(' de ', ' ') + ', hora local (' + o.horas + ' h)',
      credito: 'Fonte de dados: GFS/NCEP/NOAA (rodada ' + J.ciclo + 'Z de ' + N.br(J.data_ciclo) + ')' + (o.produto === 'barragens' ? ' · barragens: ' + (S.fonte === 'anm' && S.anm ? 'ANM/SIGBM' : 'lista da equipe') : '') + ' - SIMGE/IGAM, ' + J.data_ciclo.slice(0, 4),
      fundo: '', areas: areas, legenda: legenda,
      cidades: cidades,
      pontos: pontos
    };
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
      '#barr td.n{text-align:right;font-variant-numeric:tabular-nums}#barr .av{color:#9a5b00;font-size:12px}#barr .selo{display:inline-block;font-size:11px;font-weight:700;border-radius:999px;padding:2px 8px;margin-left:6px;vertical-align:middle}' +
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
      '<label class="check"><input type="checkbox" id="brRotulos" checked> Nome das barragens (Original · Zoom)</label>' +
      '<div id="brBarrBox"><h3>Barragens <span id="brBarrN" class="small"></span></h3>' +
      '<label for="brFonte" style="margin-top:0">Lista de barragens</label><select id="brFonte"><option value="anm">ANM/SIGBM (automático)</option><option value="equipe">Lista da equipe (BARRAGENS.txt)</option></select>' +
      '<div class="small" id="brAnmInfo" style="margin-top:4px"></div>' +
      '<label>Níveis de emergência</label><div class="niv"><label class="check"><input type="checkbox" id="brN3" checked> <span class="lz" style="background:#7f0010"></span>N3</label><label class="check"><input type="checkbox" id="brN2" checked> <span class="lz" style="background:#db1e2a"></span>N2</label><label class="check"><input type="checkbox" id="brN1"> <span class="lz" style="background:#f28c28"></span>N1</label></div>' +
      '<div class="small">O manual (4.6) pede N2 e N3. Para emitir por nível, deixe marcado só o nível desejado.</div>' +
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
      '<p><b>Mapas “Original”:</b> mesma extensão dos layouts do QGIS (<i>layout_chuva_72horas_barragens*.qpt</i>), chuva em blocos de 0,25°.</p></details>' +
      '</aside><div>' +
      '<div class="previewWrap"><div class="reprs" id="brReprs"></div><div class="rdesc" id="brReprDesc"></div><div id="brMapa" class="lmPrev"></div></div>' +
      '<div class="card tableCard" id="brGatCard"><h2>Gatilho do manual (4.6)</h2><div id="brGat" class="gat"></div>' +
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
      '<div class="card tableCard" id="brTabBarrCard"><h2>Barragens</h2><div class="small" style="margin-bottom:6px">Valor no ponto: “bloco” = célula de 0,25° do GFS (o que aparece no mapa original); “ponto” = interpolação bilinear.</div><div class="scroll"><table id="brTabBarr"></table></div></div>' +
      '</div></div>';
    main.appendChild(sec);
    // controles
    var rp = $('brReprs'), g0 = '';
    REPRES.forEach(function (r) {
      if (r.grupo !== g0) { g0 = r.grupo; var sp = document.createElement('span'); sp.className = 'g' + (r.grupo === 'Proposta' ? ' prop' : r.grupo === 'Padrão' ? ' pad' : ''); sp.textContent = r.grupo + ':'; rp.appendChild(sp); }
      var b = document.createElement('button'); b.type = 'button'; b.dataset.r = r.id; b.textContent = r.nome.replace(/^Original · /, ''); b.title = r.desc;
      b.addEventListener('click', function () { S.repr = r.id; ls('barrRepr2', r.id); desenhar(); });
      rp.appendChild(b);
    });
    var rs = ls('barrRepr2'); if (rs && REPRES.some(function (r) { return r.id === rs; })) S.repr = rs;
    $('brBuscar').addEventListener('click', buscarGfs);
    ['brProduto', 'brHorizonte', 'brEscala', 'brCidades', 'brRotulos'].forEach(function (k) { $(k).addEventListener('change', function () { if (k === 'brProduto') trocarProduto(); gerar(); }); });
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
    $('brForcar').addEventListener('change', function () { $('brForcarJust').hidden = !this.checked; liberarPdf(); });
    $('brForcarJust').addEventListener('input', liberarPdf);
    var fs = ls('barrFonte'); if (fs === 'equipe') { S.fonte = 'equipe'; $('brFonte').value = 'equipe'; }
    $('brBarrPadrao').addEventListener('click', function () { ls('barrLista', null); usarLista(BARRAGENS_TXT_PADRAO, 'padrão'); });
    var salvo = ls('barrLista');
    try { usarLista(salvo || BARRAGENS_TXT_PADRAO, salvo ? 'arquivo carregado neste navegador' : 'padrão'); } catch (e) { usarLista(BARRAGENS_TXT_PADRAO, 'padrão'); }
    trocarProduto();
  }
  function trocarProduto() {
    var b = $('brProduto').value === 'barragens';
    $('brMunBox').hidden = $('brProduto').value !== 'municipio'; $('brBarrBox').hidden = !b; $('brTabBarrCard').hidden = !b; $('brRotulos').parentNode.hidden = !b;
  }
  function usarLista(txt, origem) {
    var r = lerBarragensTxt(txt);
    r.lista.forEach(function (b) { b.nv = nivelInt(b.nivel); b.fonte = 'equipe'; });
    S.listaEquipe = r.lista; S.avisosEquipe = r.avisos; S.origemLista = origem;
    $('brBarrOrigem').innerHTML = 'Lista da equipe: <b>' + esc(origem) + '</b>' + (origem === 'padrão' ? ' (BARRAGENS.txt do projeto QGIS, níveis de quando a lista foi feita)' : '');
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
  // manual 4.6: o boletim só sai com gatilho; sem gatilho, só com a decisão do meteorologista e justificativa
  function forcado() { return $('brForcar').checked && $('brForcarJust').value.trim().length >= 10; }
  function liberarPdf() { var C = S.calc; $('brPdf').disabled = !C || !(C.dispara || forcado()); }
  function txtGat(g, jan) {
    if (!g) return { dia: '—', h72: '—' };
    var d = jan[g.iDia] ? jan[g.iDia].rotulo.slice(0, 5) : '';
    var w = g.max72 ? 'dias ' + (g.max72.ini + 1) + '–' + (g.max72.fim + 1) : '';
    return { dia: f0(g.diaMax) + ' mm (' + d + ')', h72: g.max72 ? f0(g.max72.mm) + ' mm (' + w + ')' : '—' };
  }
  function mostrarGatilho() {
    var C = S.calc, el = $('brGat'), h = '';
    var crit = 'Critério: chuva ≥ <b>100 mm em um dia</b> ou ≥ <b>100 mm somados em 72 h</b> na região' + (C.o.produto === 'barragens' ? ' da barragem (' + (C.o.raio ? 'raio de ' + C.o.raio + ' km' : 'só o ponto') + ')' : ' do município') +
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
    if (id === 'padrao') { S.figOp = opPadrao(C); return window.LayoutMapa.svg(S.figOp); }
    if (id === 'orig') return figOriginal(C, false);
    if (id === 'origzoom') return figOriginal(C, true);
    if (id === 'regiao') return figRegiao(C, false);
    if (id === 'municipio') return figRegiao(C, true);
    return figDiario(C);
  }
  function desenhar() {
    document.querySelectorAll('#brReprs button').forEach(function (b) { b.classList.toggle('on', b.dataset.r === S.repr); });
    var r = REPRES.filter(function (x) { return x.id === S.repr; })[0];
    $('brReprDesc').innerHTML = esc(r.desc) + (r.grupo === 'Original' ? '<span class="selo o">versão de hoje</span>' : r.grupo === 'Padrão' ? '<span class="selo o" style="background:#e3f1fb;color:#0d668f">layout da plataforma</span>' : '<span class="selo p">proposta</span>');
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
  function svgParaPng(svg, larg) {
    return new Promise(function (ok, erro) {
      var W = larg || 3508, H = Math.round(W * PAG.h / PAG.w), im = new Image();
      im.onload = function () {
        try { var cv = document.createElement('canvas'); cv.width = W; cv.height = H; var c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, W, H); c.drawImage(im, 0, 0, W, H); cv.toBlob(function (b) { b ? ok({ blob: b, canvas: cv }) : erro(new Error('falha ao gerar o PNG')); }, 'image/png'); }
        catch (e) { erro(e); }
      };
      im.onerror = function () { erro(new Error('o navegador não conseguiu desenhar a figura')); };
      im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }
  function baixar(blob, nome) { var a = document.createElement('a'); a.download = nome; a.href = URL.createObjectURL(blob); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 60000); }
  async function salvarPng() {
    if (!S.fig) return; var b = $('brPng'); b.disabled = true;
    try {
      if (S.repr === 'padrao' && S.figOp && window.LayoutMapa) baixar(await window.LayoutMapa.png(S.figOp), baseNome() + '.png');
      else { var r = await svgParaPng(S.fig); baixar(r.blob, baseNome() + '_' + S.repr + '.png'); }
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
      L.push([]); L.push(['Barragem', 'Nome_BDA', 'Municipio_cadastro', 'Municipio_coordenada', 'Nivel', 'Latitude', 'Longitude', 'Total_bloco_mm', 'Total_ponto_mm'].concat(C.jan.map(function (w, k) { return 'Dia' + (k + 1) + '_ponto_mm'; }), ['Fonte', 'Raio_km', 'Maior_dia_regiao_mm', 'Maior_72h_regiao_mm', 'Janela_72h', 'Gatilho', 'Aviso']));
      C.pontos.forEach(function (p) { var b = p.b; L.push([b.nome, b.nomeBda, b.municipio, b.munCoord, b.nivel, String(b.lat).replace('.', ','), String(b.lon).replace('.', ','), f1(p.bruto), f1(p.suave)].concat(p.dias.map(f1), [b.fonte || '', C.o.raio, f1(p.gat.diaMax), f1(p.gat.max72 ? p.gat.max72.mm : NaN), p.gat.max72 ? 'dias ' + (p.gat.max72.ini + 1) + '-' + (p.gat.max72.fim + 1) : '', p.gat.dispara ? 'DISPARA' : 'nao', (b.avisos || []).join('; ')])); });
    }
    baixarCsv(L, baseNome() + '.csv');
  }
  async function salvarPdf() {
    var C = S.calc; if (!C) return;
    if (!C.dispara && !forcado()) { alert('Sem gatilho do manual (4.6). Para emitir assim mesmo, marque “Emitir mesmo sem gatilho” e escreva a justificativa.'); return; }
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
      var fig = async function (svg, legenda) {
        var r = await svgParaPng(svg, 2400), w = W - 2 * M, h = w * PAG.h / PAG.w;
        if (y + h + 10 > 285) { doc.addPage(); cab(); y = 36; }
        doc.addImage(r.canvas.toDataURL('image/jpeg', 0.92), 'JPEG', M, y, w, h); y += h + 5;
        doc.setFont('times', 'bold'); var lb = 'Figura ' + legenda[0] + ':', lw = doc.getTextWidth(lb) + 1.6; doc.text(lb, M, y);
        doc.setFont('times', 'normal'); var ll = doc.splitTextToSize(legenda[1], W - 2 * M - lw);
        ll.forEach(function (l, i) { doc.text(l, i ? M : M + lw, y); y += 5; }); y += 3;
      };
      var leg1 = S.repr === 'diario' ? 'precipitação prevista em cada dia e total das próximas ' + C.o.horas + ' horas.'
        : (S.repr === 'municipio' ? 'precipitação média prevista em cada município para as próximas ' : 'acumulado previsto de precipitação para as próximas ') + C.o.horas + ' horas' + (C.o.produto !== 'barragens' && /^orig/.test(S.repr) ? '. A área de ' + C.o.munNome + ' está destacada em cinza.' : '.');
      await fig(S.fig, ['1', leg1]);
      if ($('brFig2').checked && S.repr !== 'diario') await fig(figura('diario'), ['2', 'precipitação prevista em cada dia e total de ' + C.o.horas + ' horas.']);
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
        if (!C.dispara && forcado()) doc.text(doc.splitTextToSize('Emitido sem atingir o gatilho do manual (4.6). Justificativa: ' + $('brForcarJust').value.trim(), W - 2 * M), M, 284); doc.setTextColor(0); }
      baixar(doc.output('blob'), baseNome() + '.pdf');
    } catch (e) { console.error(e); alert('Não foi possível gerar o PDF: ' + e.message); }
    finally { b.disabled = false; }
  }

  // para testes automáticos
  window.BarragensAba = { estado: S, figura: function (id) { return figura(id); }, gerar: gerar, lerBarragensTxt: lerBarragensTxt, versao: VERSAO_ABA };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montarAba); else montarAba();
})();
