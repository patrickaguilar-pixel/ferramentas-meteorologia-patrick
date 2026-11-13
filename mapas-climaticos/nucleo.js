/*
 * Mapas Climáticos — núcleo de cálculo (v0.1, 13/11/2026, Patrick/Claude) — SIMGE/IGAM
 *
 * Tudo o que decide números fica AQUI, sem tela: leitura dos TXT, conferência dos dados, interpolação, escalas e registro.
 * Roda igual no navegador (window.MapasClimaticosNucleo) e no Node (require), para ser testado contra a referência
 * em Python (mapas-climaticos/referencia/referencia.py). Qualquer mudança aqui precisa passar nos testes de lá.
 *
 * Método (fase 1): o mesmo do QGIS do Anexo M — "Interpolação IDW" do QGIS (QgsIDWInterpolator): potência 2, TODAS as
 * estações do arquivo, distância em graus (a camada de texto está em EPSG:4326), valor exato em cima da estação;
 * recorte pelas mesorregiões; classes "Banda simples falsa-cor, método discreto" (valor <= limite da classe).
 *
 * Nada aqui envia dado para fora: os arquivos são lidos no próprio navegador.
 */
(function (raiz, fabrica) {
  'use strict';
  var M = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = M;
  else raiz.MapasClimaticosNucleo = M;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var VERSAO = '0.1';

  /* ======================= períodos ======================= */
  var MESES = ['JANEIRO', 'FEVEREIRO', 'MARCO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
  var MESES_BR = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  var SIGLAS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
  function diasNoMes(mes, ano) { return new Date(Date.UTC(ano, mes, 0)).getUTCDate(); }

  /* ======================= limites e critérios (trocar aqui muda tudo; registrados no CSV) ======================= */
  var CRITERIOS = {
    raioVizinhasKm: 150,          // vizinhas usadas na comparação espacial
    minVizinhas: 3,               // menos que isso: "isolada", não dá para comparar
    raioInfluenciaKm: 150,        // estações até essa distância de MG precisam de decisão quando têm alerta
    zeroVizinhasForte: 20,        // 0 mm com mediana das 5 vizinhas >= 20 mm: forte
    zeroVizinhasAtencao: 10,      // ... >= 10 mm: atenção
    zForte: { PREC: 3.5, TMAX: 4.0, TMIN: 4.0, TMED: 3.5 },     // desvio robusto em relação às vizinhas
    zAtencao: { PREC: 2.5, TMAX: 3.0, TMIN: 3.0, TMED: 2.5 },
    falhasForte: 20,              // % de falhas horárias no mês (coluna "Falhas" das temperaturas)
    falhasAtencao: 10,
    tolContas: { mm: 0.05, pct: 0.1, c: 0.02 }                  // tolerância ao refazer as contas da planilha
  };
  var LIMITES = {                 // fora disso o valor é fisicamente impossível para o mês: linha inválida
    PREC: { acum: [0, 1500], clim: [0, 1500] },
    TMAX: { abs: [5, 50], media: [0, 46] },
    TMIN: { abs: [-12, 35], media: [-8, 32] },
    TMED: { tmed: [-5, 40], anom: [-12, 12] }
  };
  var CAIXA = { lat: [-35, -5], lon: [-62, -33] };          // coordenada fora disso: inválida

  /* ======================= utilidades ======================= */
  function norm(s) {   // cabeçalho: sem acento, maiúsculo, espaços simples, só letras/números/%/()
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
      .replace(/[^A-Z0-9%() ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  var RE_NUM = /^[-+]?(\d+([.,]\d*)?|[.,]\d+)([eE][-+]?\d+)?$/;
  function numero(s) {   // aceita "12,5", "12.5", "-0,3"; recusa "1.234,5", texto e vazio
    var t = String(s == null ? '' : s).trim();
    if (!t || !RE_NUM.test(t)) return NaN;
    return parseFloat(t.replace(',', '.'));
  }
  function mediana(a) { if (!a.length) return NaN; var b = a.slice().sort(function (x, y) { return x - y; }), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; }
  function km(lon1, lat1, lon2, lat2) {   // equiretangular (erro < 0,5 % na escala de MG)
    var R = 6371.0088, f = Math.PI / 180, x = (lon2 - lon1) * f * Math.cos((lat1 + lat2) / 2 * f), y = (lat2 - lat1) * f;
    return R * Math.sqrt(x * x + y * y);
  }
  function arred(v, c) { var k = Math.pow(10, c); return Math.round(v * k) / k; }

  /* ======================= leitura dos TXT ======================= */
  // texto: decodifica UTF-8; se não for UTF-8 válido, usa Windows-1252 (o "ISO-8859" que a planilha exporta)
  function decodificar(bytes) {
    var u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (u8.length > LIMITE_BYTES) throw erroUsuario('Arquivo maior que ' + (LIMITE_BYTES / 1048576) + ' MB: não parece um TXT de estações.');
    var t;
    try { t = new TextDecoder('utf-8', { fatal: true }).decode(u8); return { texto: t.replace(/^﻿/, ''), codificacao: 'UTF-8' }; }
    catch (e) { t = new TextDecoder('windows-1252').decode(u8); return { texto: t, codificacao: 'Windows-1252 (ISO-8859-1)' }; }
  }
  var LIMITE_BYTES = 3 * 1048576, LIMITE_LINHAS = 5000;
  function erroUsuario(msg) { var e = new Error(msg); e.usuario = true; return e; }

  // colunas: chave interna -> teste no nome normalizado. "obrig" = sem ela o arquivo é recusado.
  var COMUNS = [
    { k: 'codigo', re: /^CODIGO$/, obrig: true },
    { k: 'estacao', re: /^ESTACAO$/, obrig: true },
    { k: 'municipio', re: /^MUNICIPIO$/ },
    { k: 'meso', re: /^MES+ORREGIAO$/ },          // aparece como MESORREGIÃO e MESSORREGIÃO
    { k: 'ch', re: /^CH$/ },
    { k: 'uf', re: /^UF$/, obrig: true },
    { k: 'lat', re: /^LATITUDE$/, obrig: true },
    { k: 'lon', re: /^LONGITUDE$/, obrig: true }
  ];
  var TIPOS = {
    PREC: { nome: 'Precipitação', arquivo: 'PREC', cols: [
      { k: 'clim', re: /^CLIMATOLOGIA [A-Z]+$/, obrig: true, num: true },
      { k: 'acum', re: /^ACUMULADO [A-Z]+ \(MM\)$/, obrig: true, num: true },
      { k: 'pctAtendida', re: /^% CLIMATOLOGIA ATENDIDA$/, num: true },
      { k: 'anomMm', re: /^ANOMALIA [A-Z]+ \(MM\)$/, num: true },
      { k: 'anomPct', re: /^ANOMALIA [A-Z]+ \(%\)$/, num: true },
      { k: 'falhasPrec', re: /^% FALHAS [A-Z]+$/, num: true }
    ] },
    TMAX: { nome: 'Temperatura máxima', arquivo: 'TEMP_MAX', cols: [
      { k: 'falhas', re: /^FALHAS TMAX$/, num: true },
      { k: 'diasFalha', re: /^DIAS COM FALHA TMAX$/, num: true },
      { k: 'nc', re: /^NC TMAX$/, num: true },
      { k: 'abs', re: /^TMAXABS DO PERIODO$/, obrig: true, num: true },
      { k: 'media', re: /^TMAXMEDIA DO PERIODO$/, num: true },
      { k: 'anom', re: /^ANOMALIA TMAXMEDIA$/, num: true }
    ] },
    TMIN: { nome: 'Temperatura mínima', arquivo: 'TEMP_MIN', cols: [
      { k: 'falhas', re: /^FALHAS( TMIN)?$/, num: true },
      { k: 'diasFalha', re: /^DIAS COM FALHA TMIN$/, num: true },
      { k: 'nc', re: /^NC TMIN$/, num: true },
      { k: 'abs', re: /^TMINABS DO PERIODO$/, obrig: true, num: true },
      { k: 'media', re: /^TMINMEDIA DO PERIODO$/, num: true },
      { k: 'anom', re: /^ANOMALIA TMINMEDIA$/, num: true }
    ] },
    TMED: { nome: 'Temperatura média', arquivo: 'TEMP_MED', cols: [
      { k: 'falhas', re: /^FALHAS TMED$/, num: true },
      { k: 'diasFalha', re: /^DIAS COM FALHA TMED$/, num: true },
      { k: 'nc', re: /^NC TMED$/, obrig: true, num: true },
      { k: 'tmed', re: /^TMED DO PERIODO$/, obrig: true, num: true },
      { k: 'anom', re: /^ANOMALIA TMED$/, obrig: true, num: true }
    ] }
  };
  function detectarTipo(cab) {   // pelo conteúdo do cabeçalho, não pelo nome do arquivo
    var achou = [];
    Object.keys(TIPOS).forEach(function (t) {
      var ok = TIPOS[t].cols.filter(function (c) { return c.obrig; }).every(function (c) { return cab.some(function (h) { return c.re.test(h); }); });
      if (ok) achou.push(t);
    });
    return achou;
  }
  function periodoDoNome(nome) {   // PREC_SET_2026.txt, TEMP_MAX_SET_2026.txt
    var m = norm(nome).replace(/ /g, '_').match(/(^|_)(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)_?((19|20)\d\d)(_|$|TXT)/);
    return m ? { mes: SIGLAS.indexOf(m[2]) + 1, ano: +m[3] } : null;
  }
  function mesDoCabecalho(cab) {   // "CLIMATOLOGIA SETEMBRO" (só na precipitação)
    for (var i = 0; i < cab.length; i++) { var m = cab[i].match(/^(CLIMATOLOGIA|ACUMULADO|ANOMALIA) ([A-Z]+)/); if (m && MESES.indexOf(m[2]) >= 0) return MESES.indexOf(m[2]) + 1; }
    return null;
  }

  // lê um TXT. Devolve { tipo, nome, codificacao, periodo, linhas:[estações], avisos:[], erros:[] }.
  // Erro de estrutura (não é TXT de estação, coluna obrigatória faltando) -> exceção com mensagem para o usuário.
  function lerTxt(nomeArquivo, bytes) {
    var dec = decodificar(bytes), texto = dec.texto;
    if (/\u0000/.test(texto)) throw erroUsuario('O arquivo tem conteúdo binário: não é um TXT de estações.');
    var linhas = texto.split(/\r\n|\n|\r/);
    while (linhas.length && !linhas[linhas.length - 1].trim()) linhas.pop();
    if (linhas.length < 2) throw erroUsuario('O arquivo está vazio ou só tem o cabeçalho.');
    if (linhas.length > LIMITE_LINHAS) throw erroUsuario('O arquivo tem mais de ' + LIMITE_LINHAS + ' linhas: não parece um TXT mensal de estações.');
    if (linhas[0].indexOf('\t') < 0) throw erroUsuario('O cabeçalho não é separado por tabulação (TAB), como o TXT exportado da planilha.');
    var cabBruto = linhas[0].split('\t'), cab = cabBruto.map(norm);
    var tipos = detectarTipo(cab);
    if (!tipos.length) throw erroUsuario('Não reconheci as colunas. Esperava um dos TXT da planilha: PREC, TEMP_MAX, TEMP_MIN ou TEMP_MED.');
    if (tipos.length > 1) throw erroUsuario('O cabeçalho mistura colunas de mais de uma variável (' + tipos.join(', ') + ').');
    var tipo = tipos[0], T = TIPOS[tipo], idx = {}, avisos = [], erros = [];
    COMUNS.concat(T.cols).forEach(function (c) {
      var achadas = []; cab.forEach(function (h, i) { if (c.re.test(h)) achadas.push(i); });
      if (achadas.length > 1) throw erroUsuario('A coluna "' + cabBruto[achadas[1]].trim() + '" aparece mais de uma vez.');
      if (!achadas.length) { if (c.obrig) throw erroUsuario('Falta a coluna obrigatória "' + c.k + '" (' + c.re.source.replace(/[\^$\\]/g, '') + ').'); }
      else idx[c.k] = achadas[0];
    });
    var desconhecidas = cab.filter(function (h, i) { return h && !Object.keys(idx).some(function (k) { return idx[k] === i; }); });
    if (desconhecidas.length) avisos.push('Colunas não usadas: ' + desconhecidas.join(', ') + '.');
    var pNome = periodoDoNome(nomeArquivo), mesCab = mesDoCabecalho(cab);
    if (pNome && mesCab && pNome.mes !== mesCab) erros.push('O nome do arquivo diz ' + MESES_BR[pNome.mes - 1] + ', mas o cabeçalho diz ' + MESES_BR[mesCab - 1] + '.');
    var estacoes = [];
    for (var n = 1; n < linhas.length; n++) {
      var bruto = linhas[n];
      if (!bruto.trim()) continue;
      var cel = bruto.split('\t'), e = { linha: n + 1, tipo: tipo, problemas: [], dados: {} };
      if (cel.length > cabBruto.length) e.problemas.push({ g: 'invalida', cod: 'colunas', txt: 'Linha com ' + cel.length + ' colunas (o cabeçalho tem ' + cabBruto.length + ').' });
      ['codigo', 'estacao', 'municipio', 'meso', 'ch', 'uf'].forEach(function (k) { e[k] = idx[k] != null ? String(cel[idx[k]] == null ? '' : cel[idx[k]]).trim() : ''; });
      e.uf = e.uf.toUpperCase();
      e.lat = numero(cel[idx.lat]); e.lon = numero(cel[idx.lon]);
      T.cols.forEach(function (c) { if (idx[c.k] != null) e.dados[c.k] = numero(cel[idx[c.k]]); });
      if (!e.codigo) e.problemas.push({ g: 'invalida', cod: 'semcodigo', txt: 'Sem código da estação.' });
      else if (!/^[A-Za-z0-9_-]{2,12}$/.test(e.codigo)) e.problemas.push({ g: 'invalida', cod: 'codigo', txt: 'Código fora do padrão.' });
      if (!isFinite(e.lat) || !isFinite(e.lon)) e.problemas.push({ g: 'invalida', cod: 'coord', txt: 'Latitude ou longitude vazia ou não numérica.' });
      else if (e.lat < CAIXA.lat[0] || e.lat > CAIXA.lat[1] || e.lon < CAIXA.lon[0] || e.lon > CAIXA.lon[1]) e.problemas.push({ g: 'invalida', cod: 'coord', txt: 'Coordenada fora da região (lat ' + e.lat + ', lon ' + e.lon + '): sinal trocado ou erro de digitação?' });
      T.cols.forEach(function (c) {
        if (idx[c.k] == null) return;
        var bruta = String(cel[idx[c.k]] == null ? '' : cel[idx[c.k]]).trim();
        if (!isFinite(e.dados[c.k]) && (c.obrig || bruta)) e.problemas.push({ g: c.obrig ? 'invalida' : 'atencao', cod: 'num_' + c.k, txt: 'Valor não numérico em "' + cabBruto[idx[c.k]].trim() + '": "' + bruta.slice(0, 20) + '".' });
      });
      var lim = LIMITES[tipo];
      Object.keys(lim).forEach(function (k) {
        var v = e.dados[k];
        if (isFinite(v) && (v < lim[k][0] || v > lim[k][1])) e.problemas.push({ g: 'invalida', cod: 'limite_' + k, txt: 'Valor fisicamente impossível para o mês: ' + k + ' = ' + v + ' (aceito de ' + lim[k][0] + ' a ' + lim[k][1] + ').' });
      });
      estacoes.push(e);
    }
    if (!estacoes.length) throw erroUsuario('O arquivo não tem nenhuma estação.');
    return { tipo: tipo, nome: String(nomeArquivo || ''), codificacao: dec.codificacao, periodo: pNome ? { mes: pNome.mes, ano: pNome.ano } : null,
      mesCabecalho: mesCab, estacoes: estacoes, avisos: avisos, erros: erros, colunas: cabBruto.map(function (s) { return s.trim(); }) };
  }

  /* ======================= geometria de MG (mesorregiões) ======================= */
  function aneis(geom) { return (geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates); }
  function dentroGeom(lon, lat, geom) {   // par-ímpar, todos os anéis (buracos inclusos)
    var ins = false;
    aneis(geom).forEach(function (poly) {
      poly.forEach(function (ring) {
        for (var i = 0, k = ring.length - 1; i < ring.length; k = i++) {
          var xi = ring[i][0], yi = ring[i][1], xk = ring[k][0], yk = ring[k][1];
          if ((yi > lat) !== (yk > lat) && lon < (xk - xi) * (lat - yi) / (yk - yi) + xi) ins = !ins;
        }
      });
    });
    return ins;
  }
  function mesoDoPonto(lon, lat, mesos) {
    for (var i = 0; i < mesos.features.length; i++) if (dentroGeom(lon, lat, mesos.features[i].geometry)) return i;
    return -1;
  }
  function distMGkm(lon, lat, mesos) {   // 0 dentro de MG; senão, distância ao vértice mais próximo da divisa
    if (mesoDoPonto(lon, lat, mesos) >= 0) return 0;
    var best = Infinity;
    mesos.features.forEach(function (f) { aneis(f.geometry).forEach(function (p) { p[0].forEach(function (c) { var d = km(lon, lat, c[0], c[1]); if (d < best) best = d; }); }); });
    return best;
  }

  // grade fixa de 0,01° (~1,1 km) sobre MG (centro das células). lon0/lat0 = centro da célula do canto noroeste.
  var GRADE = { lon0: -51.06, lat0: -14.22, d: 0.01, nx: 1123, ny: 873 };
  function lonDe(G, i) { return G.lon0 + i * G.d; }
  function latDe(G, j) { return G.lat0 - j * G.d; }
  // máscara por varredura de linhas (rápido): índice da mesorregião em cada célula (-1 fora de MG)
  function mascara(mesos, G) {
    G = G || GRADE;
    var m = new Int8Array(G.nx * G.ny).fill(-1);
    mesos.features.forEach(function (f, mi) {
      var rings = []; aneis(f.geometry).forEach(function (p) { p.forEach(function (r) { rings.push(r); }); });
      for (var j = 0; j < G.ny; j++) {
        var lat = latDe(G, j), xs = [];
        rings.forEach(function (ring) {
          for (var i = 0, k = ring.length - 1; i < ring.length; k = i++) {
            var xi = ring[i][0], yi = ring[i][1], xk = ring[k][0], yk = ring[k][1];
            if ((yi > lat) !== (yk > lat)) xs.push((xk - xi) * (lat - yi) / (yk - yi) + xi);
          }
        });
        xs.sort(function (a, b) { return a - b; });
        for (var q = 0; q + 1 < xs.length; q += 2) {
          // células com centro em (xs[q], xs[q+1]) — mesmo critério do teste par-ímpar (lon < x de cruzamento)
          var i0 = Math.max(0, Math.ceil((xs[q] - G.lon0) / G.d - 1e-9)), i1 = Math.min(G.nx - 1, Math.ceil((xs[q + 1] - G.lon0) / G.d - 1e-9) - 1);
          for (var ii = i0; ii <= i1; ii++) { var lon = lonDe(G, ii); if (lon > xs[q] && lon < xs[q + 1]) m[j * G.nx + ii] = mi; }
        }
      }
    });
    return m;
  }

  /* ======================= interpolação ======================= */
  // IDW do QGIS (QgsIDWInterpolator): todas as estações, w = 1/d^p com d em graus; em cima da estação, o valor dela.
  function idwPonto(pts, lon, lat, p) {
    var sw = 0, swv = 0, meia = p / 2;
    for (var k = 0; k < pts.length; k++) {
      var dx = pts[k].lon - lon, dy = pts[k].lat - lat, d2 = dx * dx + dy * dy;
      if (d2 < 1e-20) return pts[k].v;
      var w = meia === 1 ? 1 / d2 : 1 / Math.pow(d2, meia);
      sw += w; swv += w * pts[k].v;
    }
    return sw > 0 ? swv / sw : NaN;
  }
  function idwGrade(pts, masc, p, G) {
    G = G || GRADE; p = p || 2;
    if (!pts.length) throw erroUsuario('Nenhuma estação válida para interpolar.');
    var out = new Float64Array(G.nx * G.ny).fill(NaN);
    for (var j = 0; j < G.ny; j++) {
      var lat = latDe(G, j);
      for (var i = 0; i < G.nx; i++) { var c = j * G.nx + i; if (masc[c] >= 0) out[c] = idwPonto(pts, lonDe(G, i), lat, p); }
    }
    return out;
  }
  // validação cruzada (deixa uma de fora): erro nas estações de MG
  function validacaoCruzada(pts, p, filtro) {
    var e = [];
    pts.forEach(function (pt, i) {
      if (filtro && !filtro(pt)) return;
      var resto = pts.filter(function (_, k) { return k !== i; });
      var est = idwPonto(resto, pt.lon, pt.lat, p || 2);
      e.push({ codigo: pt.codigo, obs: pt.v, est: est, erro: est - pt.v });
    });
    if (!e.length) return null;
    var mae = 0, rmse = 0, vies = 0;
    e.forEach(function (x) { mae += Math.abs(x.erro); rmse += x.erro * x.erro; vies += x.erro; });
    return { n: e.length, mae: mae / e.length, rmse: Math.sqrt(rmse / e.length), vies: vies / e.length, pontos: e };
  }

  /* ======================= produtos e escalas ======================= */
  // cores: escalas da equipe (pasta ROTINA MAPAS/txt) e rampas do QGIS amostradas nos mapas oficiais de set/2026
  var RAMPA = {
    blues12: ['#f7fbff', '#e6f0f9', '#d4e5f4', '#c2d9ee', '#a6cde4', '#85bcdc', '#63a9d3', '#4695c8', '#2e7ebc', '#1967ad', '#084e98', '#08306b'],
    reds10: ['#fff5f0', '#fee3d6', '#fdc6af', '#fca486', '#fc8161', '#f85d42', '#ea372a', '#cc191d', '#a91016', '#67000d'],
    bluesInv10: ['#08519c', '#1d6cb1', '#3585bf', '#529dcc', '#73b2d8', '#9ac8e0', '#bad6eb', '#d1e2f3', '#e4eff9', '#f7fbff']
  };
  function rgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  function hex(c) { return '#' + c.map(function (v) { return ('0' + Math.round(v).toString(16)).slice(-2); }).join(''); }
  function rampa(cores, n) {   // n cores ao longo da rampa (interpolação linear em RGB, como o QGIS)
    if (n === cores.length) return cores.slice();
    var out = [];
    for (var i = 0; i < n; i++) {
      var t = n === 1 ? 0 : i * (cores.length - 1) / (n - 1), a = Math.floor(t), b = Math.min(cores.length - 1, a + 1), f = t - a;
      var A = rgb(cores[a]), B = rgb(cores[b]);
      out.push(hex([0, 1, 2].map(function (k) { return A[k] + (B[k] - A[k]) * f; })));
    }
    return out;
  }
  function fmt(v) { return (Math.round(v * 100) / 100).toString().replace('.', ','); }
  function rotulos(lim) {   // "<= 15", "15 - 20", …, "> 65" (como o QGIS)
    var r = ['<= ' + fmt(lim[0])];
    for (var i = 1; i < lim.length; i++) r.push(fmt(lim[i - 1]) + ' - ' + fmt(lim[i]));
    r.push('> ' + fmt(lim[lim.length - 1]));
    return r;
  }
  function escalaFixa(lim, cores) {
    if (cores.length !== lim.length + 1) throw new Error('escala inconsistente');
    for (var i = 1; i < lim.length; i++) if (!(lim[i] > lim[i - 1])) throw new Error('limites da escala fora de ordem');
    return { lim: lim.slice(), cores: cores.slice(), rotulos: rotulos(lim) };
  }
  var PRODUTOS = {
    prec: { arq: 'PREC', campo: 'acum', titulo: 'Acumulado de Precipitação', sigla: 'PREC', unidade: 'mm', legenda: 'Precipitação (mm)',
      escala: { tipo: 'variavel', rampa: 'blues12', classes: 12, passos: [1, 2, 2.5, 5, 10, 20, 25, 50, 100], minimo: 0 },
      credito: 'Dados: INMET' },
    aprec: { arq: 'PREC', campo: 'anomPct', titulo: 'Anomalia de Precipitação Mensal', sigla: 'A_PREC', unidade: '%', legenda: 'Anomalia (%)',
      // ESCALA_APREC_EXTENSA_90_90.txt (igual ao mapa oficial de set/2026)
      escala: { tipo: 'fixa', fonte: 'ESCALA_APREC_EXTENSA_90_90',
        lim: [-90, -80, -70, -60, -50, -40, -30, -20, -10, 10, 20, 30, 40, 50, 60, 70, 80, 90],
        cores: ['#da3c43', '#e15a55', '#e97867', '#f19679', '#f5ad8d', '#f5bca2', '#f6cbb7', '#f6dacd', '#f7e8e2', '#fefefe', '#e5eef3', '#d3e5ee', '#c0dcea', '#aed3e5', '#9bcae1', '#85beda', '#6baed2', '#529fc9', '#0571b0'] },
      credito: 'Dados: INMET · Climatologia: 1991-2020 - INMET' },
    atmed: { arq: 'TMED', campo: 'anom', titulo: 'Anomalia de Temperatura Média Mensal', sigla: 'A_TMED', unidade: '°C', legenda: 'Anomalia (°C)',
      // ESCALA_EXTENSA_ATEMP_CORR_3.txt CORRIGIDA: no arquivo da equipe os limites -3,5 e -4 estavam trocados/repetidos
      // (a legenda do mapa de set/2026 saiu "-3.5 - -3" antes de "-4 - -3.5"). Cores na mesma ordem do arquivo.
      escala: { tipo: 'fixa', fonte: 'ESCALA_EXTENSA_ATEMP_CORR_3 (corrigida)',
        lim: [-4.5, -4, -3.5, -3, -2.5, -2, -1.5, -1, -0.1, 0.1, 1, 2, 3, 4, 5, 6, 7, 8],
        cores: ['#034b75', '#3a7ab1', '#4083c1', '#6db3d6', '#9bcae1', '#aed3e5', '#c0dcea', '#d3e5ee', '#e5eef3', '#fefefe', '#f7e8e2', '#f6dacd', '#f6cbb7', '#f5bca2', '#f5ad8d', '#f19679', '#e97867', '#e15a55', '#da3c43'] },
      credito: 'Dados: INMET · Climatologia: 1991-2020 - INMET' },
    tmax: { arq: 'TMAX', campo: 'abs', titulo: 'Temperatura Máxima Absoluta', sigla: 'T_MAX_ABS', unidade: '°C', legenda: 'Temperatura (°C)',
      escala: { tipo: 'variavel', rampa: 'reds10', classes: 10, passos: [0.5, 1, 1.5, 2, 2.5, 3, 5] }, credito: 'Dados: INMET' },
    tmin: { arq: 'TMIN', campo: 'abs', titulo: 'Temperatura Mínima Absoluta', sigla: 'T_MIN_ABS', unidade: '°C', legenda: 'Temperatura (°C)',
      escala: { tipo: 'variavel', rampa: 'bluesInv10', classes: 10, passos: [0.5, 1, 1.5, 2, 2.5, 3, 5] }, credito: 'Dados: INMET' }
  };
  var ORDEM = ['prec', 'aprec', 'atmed', 'tmax', 'tmin'];
  Object.keys(PRODUTOS).forEach(function (k) { var e = PRODUTOS[k].escala; if (e.tipo === 'fixa') escalaFixa(e.lim, e.cores); });   // confere na carga

  function percentil(ord, q) { if (!ord.length) return NaN; var p = (ord.length - 1) * q, a = Math.floor(p), b = Math.ceil(p); return ord[a] + (ord[b] - ord[a]) * (p - a); }
  // escala automática das variáveis sem escala fixa: n classes com passo "redondo" cobrindo do percentil 2 ao 98 da grade em MG
  function escalaAuto(prod, valores, opc) {
    var E = PRODUTOS[prod].escala; opc = opc || {};
    var n = Math.max(3, Math.min(20, Math.round(opc.classes || E.classes)));
    var ord = []; for (var i = 0; i < valores.length; i++) if (isFinite(valores[i])) ord.push(valores[i]);
    ord.sort(function (a, b) { return a - b; });
    if (!ord.length) throw erroUsuario('Grade vazia: sem valores para montar a escala.');
    var lo = percentil(ord, 0.02), hi = percentil(ord, 0.98), passo = opc.passo, primeiro = opc.primeiro;
    if (!(passo > 0)) { var alvo = (hi - lo) / (n - 2); passo = E.passos.filter(function (s) { return s >= alvo; })[0] || E.passos[E.passos.length - 1]; while (passo < alvo) passo *= 2; }
    if (!isFinite(primeiro)) { primeiro = Math.ceil(lo / passo - 1e-9) * passo; if (E.minimo != null && primeiro <= E.minimo) primeiro = E.minimo + passo; }
    var lim = []; for (var k = 0; k < n - 1; k++) lim.push(arred(primeiro + k * passo, 6));
    var es = escalaFixa(lim, rampa(RAMPA[E.rampa], n));
    es.auto = !(opc.passo > 0) || !isFinite(opc.primeiro); es.passo = passo; es.primeiro = primeiro; es.classes = n;
    es.p2 = lo; es.p98 = hi; es.min = ord[0]; es.max = ord[ord.length - 1];
    return es;
  }
  function escalaDe(prod, valores, opc) {
    var E = PRODUTOS[prod].escala;
    if (E.tipo === 'fixa') { var f = escalaFixa(E.lim, E.cores); f.fonte = E.fonte; return f; }
    return escalaAuto(prod, valores, opc);
  }
  function classe(v, lim) {   // QGIS discreto: primeira classe com v <= limite; acima do último, a última classe
    for (var i = 0; i < lim.length; i++) if (v <= lim[i]) return i;
    return lim.length;
  }

  /* ======================= conferência dos dados ======================= */
  var GRAV = { invalida: 4, forte: 3, atencao: 2, info: 1 };
  function pior(problemas) { var g = null; problemas.forEach(function (p) { if (!g || GRAV[p.g] > GRAV[g]) g = p.g; }); return g; }
  function valorMapa(e) {   // valor de cada arquivo usado na comparação espacial
    return e.tipo === 'PREC' ? e.dados.acum : e.tipo === 'TMED' ? e.dados.anom : e.dados.abs;
  }
  // confere tudo e marca cada estação. arqs = { PREC: lido, TMAX: lido, ... } (os que existirem). mesos = GeoJSON das mesorregiões.
  function conferir(arqs, mesos, periodo) {
    var geral = [], porCodigo = {};
    Object.keys(arqs).forEach(function (t) {
      var A = arqs[t], vistos = {}, coords = {};
      A.estacoes.forEach(function (e) {
        e.problemas = e.problemas.filter(function (p) { return p.origem !== 'conferencia'; });   // reconferir do zero
        var add = function (g, cod, txt) { e.problemas.push({ g: g, cod: cod, txt: txt, origem: 'conferencia' }); };
        if (vistos[e.codigo]) { add('forte', 'duplicada', 'Código repetido no arquivo (linhas ' + vistos[e.codigo].linha + ' e ' + e.linha + '). Retire uma das duas.'); vistos[e.codigo].problemas.push({ g: 'forte', cod: 'duplicada', txt: 'Código repetido no arquivo (linha ' + e.linha + ').', origem: 'conferencia' }); }
        else vistos[e.codigo] = e;
        if (isFinite(e.lat) && isFinite(e.lon)) {
          var ck = e.lat.toFixed(4) + ',' + e.lon.toFixed(4);
          if (coords[ck] && coords[ck].codigo !== e.codigo) add('atencao', 'mesmacoord', 'Mesma coordenada da estação ' + coords[ck].codigo + '.');
          else coords[ck] = e;
          var mi = mesoDoPonto(e.lon, e.lat, mesos);
          e.dentroMG = mi >= 0; e.mesoMapa = mi >= 0 ? mesos.features[mi].properties.name : '';
          e.distMG = distMGkm(e.lon, e.lat, mesos);
          if (e.uf === 'MG' && !e.dentroMG && e.distMG > 5) add('atencao', 'ufcoord', 'UF = MG, mas a coordenada fica fora de Minas (' + Math.round(e.distMG) + ' km da divisa).');
          if (e.uf && e.uf !== 'MG' && e.dentroMG) add('atencao', 'ufcoord', 'UF = ' + e.uf + ', mas a coordenada fica dentro de Minas.');
        }
        var d = e.dados, tol = CRITERIOS.tolContas;
        if (t === 'PREC') {
          if (isFinite(d.acum) && isFinite(d.clim)) {
            if (isFinite(d.anomMm) && Math.abs(d.acum - d.clim - d.anomMm) > tol.mm) add('forte', 'conta', 'Anomalia (mm) não confere: acumulado − climatologia = ' + fmt(d.acum - d.clim) + ', planilha = ' + fmt(d.anomMm) + '.');
            if (d.clim > 0 && isFinite(d.anomPct) && Math.abs((d.acum / d.clim - 1) * 100 - d.anomPct) > tol.pct) add('forte', 'conta', 'Anomalia (%) não confere: calculada ' + fmt((d.acum / d.clim - 1) * 100) + ' %, planilha ' + fmt(d.anomPct) + ' %.');
            if (d.clim > 0 && isFinite(d.pctAtendida) && Math.abs(d.acum / d.clim * 100 - d.pctAtendida) > tol.pct) add('atencao', 'conta', '% da climatologia não confere.');
            if (!(d.clim > 0)) add('forte', 'clim', 'Climatologia zero ou ausente: a anomalia (%) não pode ser calculada.');
          }
        } else if (t === 'TMAX' || t === 'TMIN') {
          if (isFinite(d.media) && isFinite(d.nc) && isFinite(d.anom) && Math.abs(d.media - d.nc - d.anom) > tol.c) add('forte', 'conta', 'Anomalia não confere: média − normal = ' + fmt(d.media - d.nc) + ', planilha = ' + fmt(d.anom) + '.');
          if (isFinite(d.abs) && isFinite(d.media)) {
            if (t === 'TMAX' && d.abs < d.media - tol.c) add('forte', 'absmedia', 'Máxima absoluta (' + fmt(d.abs) + ') menor que a média das máximas (' + fmt(d.media) + ').');
            if (t === 'TMIN' && d.abs > d.media + tol.c) add('forte', 'absmedia', 'Mínima absoluta (' + fmt(d.abs) + ') maior que a média das mínimas (' + fmt(d.media) + ').');
          }
        } else if (t === 'TMED') {
          if (isFinite(d.tmed) && isFinite(d.nc) && Math.abs(d.tmed - d.nc - d.anom) > tol.c) add('forte', 'conta', 'Anomalia não confere: média − normal = ' + fmt(d.tmed - d.nc) + ', planilha = ' + fmt(d.anom) + '.');
        }
        if (t !== 'PREC' && isFinite(d.falhas)) {
          if (d.falhas >= CRITERIOS.falhasForte) add('forte', 'falhas', fmt(arred(d.falhas, 1)) + ' % de falhas no mês' + (isFinite(d.diasFalha) ? ' (' + d.diasFalha + ' dias com falha)' : '') + '.');
          else if (d.falhas >= CRITERIOS.falhasAtencao) add('atencao', 'falhas', fmt(arred(d.falhas, 1)) + ' % de falhas no mês.');
        }
        (porCodigo[e.codigo] = porCodigo[e.codigo] || {})[t] = e;
      });
      if (t === 'PREC') {   // coluna de falhas da precipitação igual em todas: não informa nada
        var fs = A.estacoes.map(function (e) { return e.dados.falhasPrec; }).filter(isFinite);
        if (fs.length > 5 && fs.every(function (v) { return v === fs[0]; })) A.avisos.push('A coluna "% FALHAS" tem o mesmo valor (' + fmt(fs[0]) + ') em todas as estações: ela não mostra as falhas reais. Confira as falhas na planilha diária.');
      }
      espacial(A);
    });
    // consistência entre arquivos (mesma estação)
    Object.keys(porCodigo).forEach(function (c) {
      var P = porCodigo[c], x = P.TMAX, n = P.TMIN, m = P.TMED;
      var add = function (e, cod, txt) { if (e) e.problemas.push({ g: 'forte', cod: cod, txt: txt, origem: 'conferencia' }); };
      if (x && n && isFinite(x.dados.abs) && isFinite(n.dados.abs) && n.dados.abs >= x.dados.abs) { add(x, 'cruzado', 'Mínima absoluta (' + fmt(n.dados.abs) + ') >= máxima absoluta (' + fmt(x.dados.abs) + ') na mesma estação.'); add(n, 'cruzado', 'Mínima absoluta >= máxima absoluta na mesma estação.'); }
      if (x && n && isFinite(x.dados.media) && isFinite(n.dados.media) && n.dados.media >= x.dados.media) { add(x, 'cruzado', 'Média das mínimas >= média das máximas na mesma estação.'); add(n, 'cruzado', 'Média das mínimas >= média das máximas na mesma estação.'); }
      if (m && x && n && isFinite(m.dados.tmed) && isFinite(x.dados.media) && isFinite(n.dados.media) && (m.dados.tmed > x.dados.media + 0.5 || m.dados.tmed < n.dados.media - 0.5))
        add(m, 'cruzado', 'Temperatura média (' + fmt(m.dados.tmed) + ') fora do intervalo entre a média das mínimas (' + fmt(n.dados.media) + ') e a das máximas (' + fmt(x.dados.media) + ').');
      ['PREC', 'TMAX', 'TMIN', 'TMED'].forEach(function (t) {   // coordenada diferente da mesma estação em outro arquivo
        var a = P[t]; if (!a) return;
        ['PREC', 'TMAX', 'TMIN', 'TMED'].forEach(function (u) { var b = P[u]; if (b && u > t && isFinite(a.lat) && isFinite(b.lat) && km(a.lon, a.lat, b.lon, b.lat) > 1) { add(a, 'coordarq', 'Coordenada diferente da mesma estação no arquivo ' + u + '.'); add(b, 'coordarq', 'Coordenada diferente da mesma estação no arquivo ' + t + '.'); } });
      });
    });
    // período: todos os arquivos do mesmo mês/ano
    var per = null, nomes = [];
    Object.keys(arqs).forEach(function (t) {
      var A = arqs[t], p = A.periodo || (A.mesCabecalho && periodo ? { mes: A.mesCabecalho, ano: periodo.ano } : null);
      if (!p) return;
      if (!per) { per = p; nomes.push(A.nome); }
      else if (p.mes !== per.mes || p.ano !== per.ano) geral.push({ g: 'invalida', txt: 'Os arquivos são de meses diferentes: ' + nomes[0] + ' (' + SIGLAS[per.mes - 1] + '/' + per.ano + ') e ' + A.nome + ' (' + SIGLAS[p.mes - 1] + '/' + p.ano + ').' });
      A.erros.forEach(function (x) { geral.push({ g: 'invalida', txt: A.nome + ': ' + x }); });
    });
    if (periodo && per && (periodo.mes !== per.mes || periodo.ano !== per.ano)) geral.push({ g: 'invalida', txt: 'O período escolhido (' + SIGLAS[periodo.mes - 1] + '/' + periodo.ano + ') é diferente do período dos arquivos (' + SIGLAS[per.mes - 1] + '/' + per.ano + ').' });
    Object.keys(arqs).forEach(function (t) { arqs[t].estacoes.forEach(function (e) { e.gravidade = pior(e.problemas); e.influente = isFinite(e.distMG) && e.distMG <= CRITERIOS.raioInfluenciaKm; }); });
    return { geral: geral, periodoArquivos: per };
  }
  // comparação com as vizinhas (até 150 km): desvio robusto e "zero com vizinhas chovendo"
  function espacial(A) {
    var t = A.tipo, ok = A.estacoes.filter(function (e) { return !e.problemas.some(function (p) { return p.g === 'invalida'; }) && isFinite(valorMapa(e)); });
    var tr = function (v) { return t === 'PREC' ? Math.sqrt(Math.max(0, v)) : v; };
    var res = [];
    ok.forEach(function (e) {
      var viz = ok.filter(function (o) { return o !== e && o.codigo !== e.codigo; }).map(function (o) { return { o: o, d: km(e.lon, e.lat, o.lon, o.lat) }; })
        .filter(function (x) { return x.d <= CRITERIOS.raioVizinhasKm && x.d > 0.01; }).sort(function (a, b) { return a.d - b.d; });
      e.vizinhas = viz.slice(0, 8).map(function (x) { return { codigo: x.o.codigo, estacao: x.o.estacao, km: Math.round(x.d), v: valorMapa(x.o) }; });
      if (viz.length < CRITERIOS.minVizinhas) { e.estimativaViz = NaN; e.problemas.push({ g: 'info', cod: 'isolada', txt: 'Menos de ' + CRITERIOS.minVizinhas + ' estações num raio de ' + CRITERIOS.raioVizinhasKm + ' km: sem comparação com vizinhas.', origem: 'conferencia' }); return; }
      var sw = 0, swv = 0; viz.forEach(function (x) { var w = 1 / (x.d * x.d); sw += w; swv += w * tr(valorMapa(x.o)); });
      e.estimativaViz = t === 'PREC' ? Math.pow(swv / sw, 2) : swv / sw;
      e.residuo = tr(valorMapa(e)) - swv / sw;
      res.push(e.residuo);
      if (t === 'PREC' && valorMapa(e) === 0) {
        var med5 = mediana(viz.slice(0, 5).map(function (x) { return valorMapa(x.o); }));
        e.medianaViz5 = med5;
        if (med5 >= CRITERIOS.zeroVizinhasForte) e.problemas.push({ g: 'forte', cod: 'zero', txt: '0 mm no mês, mas as 5 vizinhas mais próximas tiveram mediana de ' + fmt(arred(med5, 1)) + ' mm: provável falha de registro.', origem: 'conferencia' });
        else if (med5 >= CRITERIOS.zeroVizinhasAtencao) e.problemas.push({ g: 'atencao', cod: 'zero', txt: '0 mm no mês com vizinhas entre ' + CRITERIOS.zeroVizinhasAtencao + ' e ' + CRITERIOS.zeroVizinhasForte + ' mm (mediana ' + fmt(arred(med5, 1)) + ' mm).', origem: 'conferencia' });
      }
    });
    if (res.length < 8) return;
    var med = mediana(res), mad = mediana(res.map(function (r) { return Math.abs(r - med); })) * 1.4826;
    mad = Math.max(mad, t === 'PREC' ? 0.8 : 0.4);   // piso: evita alarme quando todas as estações concordam muito
    ok.forEach(function (e) {
      if (!isFinite(e.residuo)) return;
      var z = (e.residuo - med) / mad; e.z = z;
      if (e.problemas.some(function (p) { return p.cod === 'zero'; })) return;   // o zero já foi explicado
      var dif = valorMapa(e) - e.estimativaViz, un = t === 'PREC' ? ' mm' : ' °C';
      var txt = 'Valor ' + (dif > 0 ? 'acima' : 'abaixo') + ' das vizinhas: ' + fmt(arred(valorMapa(e), 1)) + un + ' contra ~' + fmt(arred(e.estimativaViz, 1)) + un + ' esperado pelas vizinhas (desvio ' + fmt(arred(z, 1)) + ').' + (t === 'TMAX' || t === 'TMIN' ? ' Pode ser efeito da altitude.' : '');
      if (Math.abs(z) >= CRITERIOS.zForte[t]) e.problemas.push({ g: 'forte', cod: 'vizinhas', txt: txt, origem: 'conferencia' });
      else if (Math.abs(z) >= CRITERIOS.zAtencao[t]) e.problemas.push({ g: 'atencao', cod: 'vizinhas', txt: txt, origem: 'conferencia' });
    });
  }

  /* ======================= decisões e situação ======================= */
  // decisao: { acao: 'manter'|'retirar', motivo, obs, por, em }
  function situacaoEstacao(e, decisao) {
    if (e.gravidade === 'invalida') return 'invalida';
    if (decisao && decisao.acao === 'retirar') return 'retirada';
    if (decisao && decisao.acao === 'manter') return 'mantida';
    if ((e.gravidade === 'forte' || e.gravidade === 'atencao') && e.influente) return 'pendente';
    return 'usada';
  }
  function pontosDoProduto(arq, campo, decisoes) {
    return arq.estacoes.filter(function (e) {
      var s = situacaoEstacao(e, decisoes[arq.tipo + ':' + e.codigo + ':' + e.linha]);
      return (s === 'usada' || s === 'mantida') && isFinite(e.dados[campo]) && isFinite(e.lat) && isFinite(e.lon);
    }).map(function (e) { return { codigo: e.codigo, lon: e.lon, lat: e.lat, v: e.dados[campo], dentroMG: e.dentroMG }; });
  }
  function chave(e) { return e.tipo + ':' + e.codigo + ':' + e.linha; }

  /* ======================= estatística por mesorregião ======================= */
  function estatMeso(grade, masc, mesos) {
    return mesos.features.map(function (f, mi) {
      var n = 0, s = 0, mn = Infinity, mx = -Infinity;
      for (var c = 0; c < masc.length; c++) if (masc[c] === mi && isFinite(grade[c])) { n++; s += grade[c]; if (grade[c] < mn) mn = grade[c]; if (grade[c] > mx) mx = grade[c]; }
      return { nome: f.properties.name, n: n, media: n ? s / n : NaN, min: n ? mn : NaN, max: n ? mx : NaN };
    });
  }

  /* ======================= registro (CSV) ======================= */
  function seguro(s) {   // texto vindo do arquivo ou digitado: não vira fórmula no Excel
    var t = String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ');
    if (/^[=+\-@]/.test(t)) t = "'" + t;
    return /[;"]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  }
  function numBR(v, c) { return isFinite(v) ? (c == null ? String(v) : v.toFixed(c)).replace('.', ',') : ''; }
  function registroCSV(info) {
    // info = { periodo, conferente, geradoEm, versaoFerramenta, arquivos:[{tipo,nome,sha256,codificacao,linhas}], arqs, decisoes, produtos:[{id,escala,validacao,n}], criterios }
    var L = [];
    L.push(['# REGISTRO DE CONFERÊNCIA — MAPAS CLIMÁTICOS (SIMGE/IGAM)']);
    L.push(['# Período', info.periodo ? MESES_BR[info.periodo.mes - 1] + '/' + info.periodo.ano : '']);
    L.push(['# Conferido por', info.conferente || '']);
    L.push(['# Gerado em', info.geradoEm || '']);
    L.push(['# Ferramenta', 'Mapas Climáticos v' + (info.versaoFerramenta || VERSAO) + ' · núcleo v' + VERSAO]);
    L.push(['# Método', 'IDW do QGIS: potência 2, todas as estações válidas do arquivo, distância em graus (EPSG:4326); grade de 0,01°; recorte pelas mesorregiões de MG; classes com valor <= limite']);
    L.push(['# Critérios', seguro(JSON.stringify(info.criterios || CRITERIOS))]);
    (info.arquivos || []).forEach(function (a) { L.push(['# Arquivo', a.tipo, a.nome, 'SHA-256 ' + a.sha256, a.codificacao, a.linhas + ' estações']); });
    (info.produtos || []).forEach(function (p) {
      var P = PRODUTOS[p.id];
      L.push(['# Produto', P.sigla, P.titulo, p.n + ' estações usadas', 'escala: ' + (p.escala ? p.escala.rotulos.join(' | ') : ''), p.escala && p.escala.fonte ? 'fonte: ' + p.escala.fonte : (p.escala && p.escala.auto ? 'escala automática' : 'escala ajustada à mão'),
        p.validacao ? 'validação cruzada em MG (n=' + p.validacao.n + '): MAE ' + numBR(p.validacao.mae, 2) + ' · RMSE ' + numBR(p.validacao.rmse, 2) + ' · viés ' + numBR(p.validacao.vies, 2) : '']);
    });
    L.push([]);
    L.push(['Arquivo', 'Linha', 'Código', 'Estação', 'Município', 'UF', 'Latitude', 'Longitude', 'Dentro de MG', 'Distância de MG (km)', 'Valor do mapa', 'Esperado pelas vizinhas', 'Alertas', 'Situação', 'Motivo', 'Observação', 'Decidido por', 'Decidido em']);
    Object.keys(info.arqs).forEach(function (t) {
      info.arqs[t].estacoes.forEach(function (e) {
        var d = info.decisoes[chave(e)], s = situacaoEstacao(e, d);
        L.push([t, e.linha, seguro(e.codigo), seguro(e.estacao), seguro(e.municipio), seguro(e.uf), numBR(e.lat), numBR(e.lon), e.dentroMG ? 'sim' : 'não', isFinite(e.distMG) ? numBR(Math.round(e.distMG)) : '',
          numBR(valorMapa(e)), isFinite(e.estimativaViz) ? numBR(e.estimativaViz, 1) : '', seguro(e.problemas.map(function (p) { return '[' + p.g + '] ' + p.txt; }).join(' | ')),
          s, seguro(d && d.motivo || (s === 'invalida' ? 'Linha inválida (retirada automaticamente)' : '')), seguro(d && d.obs || ''), seguro(d && d.por || ''), seguro(d && d.em || '')]);
      });
    });
    return '﻿' + L.map(function (l) { return l.map(function (v) { return v == null ? '' : String(v).indexOf(';') >= 0 && !/^".*"$/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v; }).join(';'); }).join('\r\n');
  }

  return {
    VERSAO: VERSAO, MESES_BR: MESES_BR, SIGLAS: SIGLAS, CRITERIOS: CRITERIOS, LIMITES: LIMITES, TIPOS: TIPOS, PRODUTOS: PRODUTOS, ORDEM: ORDEM, GRADE: GRADE, RAMPA: RAMPA,
    diasNoMes: diasNoMes, norm: norm, numero: numero, decodificar: decodificar, lerTxt: lerTxt, periodoDoNome: periodoDoNome,
    mascara: mascara, mesoDoPonto: mesoDoPonto, dentroGeom: dentroGeom, lonDe: lonDe, latDe: latDe, km: km,
    idwPonto: idwPonto, idwGrade: idwGrade, validacaoCruzada: validacaoCruzada,
    escalaDe: escalaDe, escalaAuto: escalaAuto, escalaFixa: escalaFixa, classe: classe, rampa: rampa, rotulos: rotulos,
    conferir: conferir, situacaoEstacao: situacaoEstacao, pontosDoProduto: pontosDoProduto, chave: chave, valorMapa: valorMapa,
    estatMeso: estatMeso, registroCSV: registroCSV, seguro: seguro, fmt: fmt
  };
});
