/*
 * Barragens e municípios — núcleo de cálculo (v0.1, 13/11/2026, Patrick/Claude) — SIMGE/IGAM
 *
 * Aba nova da ferramenta Reservatórios e Tendência. Usa o MESMO dado do GFS bruto da ferramenta
 * (reservatorios/gfs/<ciclo>/gfs.json, baixado pelo GitHub Actions, scripts/baixar_gfs.py), com os produtos
 *   day3 (0–72 h), day4 (0–96 h) e cada dia separado dia1…dia4 (0–24, 24–48, 48–72, 72–96 h desde a rodada).
 * É a mesma metodologia dos boletins "Previsão para as próximas 72/96 horas — Barragens níveis 2 e 3" e "— Brumadinho":
 *   chuva acumulada do GFS 0,25° a partir da rodada; os dias são contados a partir da data da rodada (00Z = 21h local).
 * Sem tela: roda no navegador (window.BarragensNucleo) e no Node (testes em reservatorios/testes/).
 */
(function (raiz, fabrica) {
  'use strict';
  var M = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = M; else raiz.BarragensNucleo = M;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var VERSAO = '0.1';

  // Escala dos boletins de Barragens/Brumadinho (jan/2025): mesmas 15 cores azuis da ferramenta, limites 0–5 … > 250.
  // Cores amostradas da legenda do boletim (iguais às CLASS_COLORS dos Reservatórios). Classe: valor <= limite (QGIS).
  var CORES15 = ['#f7fbff', '#ebf3fb', '#deebf7', '#d1e3f3', '#c4daef', '#b0d2e8', '#9ac8e1', '#80badb', '#67abd5', '#3b7395', '#296084', '#19476a', '#0e395c', '#052542', '#010913'];
  var ESCALAS = {
    boletim: { nome: 'Boletins de barragens (0–5 … > 250 mm)', lim: [5, 10, 15, 20, 25, 30, 40, 60, 80, 100, 125, 150, 200, 250], cores: CORES15 },
    reserv15: { nome: '15 faixas dos Reservatórios (0–10 … > 300 mm)', lim: [10, 15, 20, 25, 30, 40, 60, 80, 100, 125, 150, 200, 250, 300], cores: CORES15 }
  };
  function fmt(v) { return String(v).replace('.', ','); }
  function rotulos(lim) { var r = ['0 - ' + fmt(lim[0])]; for (var i = 1; i < lim.length; i++) r.push(fmt(lim[i - 1]) + ' - ' + fmt(lim[i])); r.push('> ' + fmt(lim[lim.length - 1])); return r; }
  Object.keys(ESCALAS).forEach(function (k) {
    var e = ESCALAS[k];
    if (e.cores.length !== e.lim.length + 1) throw new Error('escala ' + k + ' inconsistente');
    for (var i = 1; i < e.lim.length; i++) if (!(e.lim[i] > e.lim[i - 1])) throw new Error('escala ' + k + ' fora de ordem');
    e.rotulos = rotulos(e.lim);
  });
  function classe(v, lim) { for (var i = 0; i < lim.length; i++) if (v <= lim[i]) return i; return lim.length; }

  /* ---------------- conferência do JSON do GFS (o que esta aba precisa) ---------------- */
  var HORIZONTES = { 72: { total: 'day3', dias: ['dia1', 'dia2', 'dia3'] }, 96: { total: 'day4', dias: ['dia1', 'dia2', 'dia3', 'dia4'] } };
  function validar(j) {
    var ok = function (v) { return typeof v === 'number' && isFinite(v); };
    if (!j || j.versao !== 1 || !j.grade || !Array.isArray(j.grade.lat) || !Array.isArray(j.grade.lon)) throw new Error('arquivo do GFS em formato inesperado');
    var la = j.grade.lat, lo = j.grade.lon;
    if (la.length < 20 || lo.length < 20 || la.length > 200 || lo.length > 200 || !la.every(ok) || !lo.every(ok)) throw new Error('grade do GFS inválida');
    for (var i = 1; i < la.length; i++) if (!(la[i] < la[i - 1]) || Math.abs(la[i - 1] - la[i] - 0.25) > 1e-3) throw new Error('latitudes do GFS fora de ordem');
    for (i = 1; i < lo.length; i++) if (!(lo[i] > lo[i - 1]) || Math.abs(lo[i] - lo[i - 1] - 0.25) > 1e-3) throw new Error('longitudes do GFS fora de ordem');
    if (lo[0] > -51.6 || lo[lo.length - 1] < -39.4 || la[0] < -14.0 || la[la.length - 1] > -23.4) throw new Error('a grade do GFS não cobre Minas Gerais');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(j.data_ciclo || '') || !/^(00|06)$/.test(j.ciclo || '')) throw new Error('data ou ciclo do GFS inválidos');
    var faltam = ['day3', 'day4', 'dia1', 'dia2', 'dia3', 'dia4'].filter(function (k) { return !(j.produtos && j.produtos[k]); });
    if (faltam.length) { var e = new Error('o arquivo do GFS ainda não tem os acumulados diários (' + faltam.join(', ') + ')'); e.faltamProdutos = true; throw e; }
    ['day3', 'day4', 'dia1', 'dia2', 'dia3', 'dia4'].forEach(function (k) {
      var m = j.produtos[k].mm;
      if (!Array.isArray(m) || m.length !== la.length || !m.every(function (l) { return Array.isArray(l) && l.length === lo.length && l.every(function (v) { return ok(v) && v >= 0 && v <= 3000; }); })) throw new Error('produto ' + k + ' do GFS inválido');
    });
    // a soma dos dias tem que bater com o acumulado (tolerância do arredondamento a 0,1 mm)
    [[72, 'day3'], [96, 'day4']].forEach(function (p) {
      var dias = HORIZONTES[p[0]].dias, tot = j.produtos[p[1]].mm, pior = 0;
      for (var y = 0; y < la.length; y++) for (var x = 0; x < lo.length; x++) {
        var s = 0; dias.forEach(function (d) { s += j.produtos[d].mm[y][x]; });
        pior = Math.max(pior, Math.abs(s - tot[y][x]));
      }
      if (pior > 0.6) throw new Error('a soma dos dias não bate com o acumulado de ' + p[0] + ' h (diferença de ' + pior.toFixed(1) + ' mm)');
    });
    return j;
  }

  /* ---------------- valores no ponto ---------------- */
  // célula do GFS que contém o ponto (o "bloco" que aparece no mapa original)
  function celula(g, m, lon, lat) {
    var y = Math.round((g.lat[0] - lat) / 0.25), x = Math.round((lon - g.lon[0]) / 0.25);
    if (y < 0 || x < 0 || y >= g.lat.length || x >= g.lon.length) return NaN;
    return m[y][x];
  }
  // bilinear entre os 4 pontos da grade em volta (mapa suavizado)
  function bilinear(g, m, lon, lat) {
    var fy = (g.lat[0] - lat) / 0.25, fx = (lon - g.lon[0]) / 0.25;
    if (fy < 0 || fx < 0 || fy > g.lat.length - 1 || fx > g.lon.length - 1) return NaN;
    var y = Math.min(g.lat.length - 2, Math.floor(fy)), x = Math.min(g.lon.length - 2, Math.floor(fx)), ty = fy - y, tx = fx - x;
    return (m[y][x] * (1 - tx) + m[y][x + 1] * tx) * (1 - ty) + (m[y + 1][x] * (1 - tx) + m[y + 1][x + 1] * tx) * ty;
  }

  /* ---------------- municípios ---------------- */
  function aneis(geom) { return geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates; }
  function dentro(lon, lat, geom) {
    var ins = false;
    aneis(geom).forEach(function (poly) { poly.forEach(function (ring) {
      for (var i = 0, k = ring.length - 1; i < ring.length; k = i++) {
        var xi = ring[i][0], yi = ring[i][1], xk = ring[k][0], yk = ring[k][1];
        if ((yi > lat) !== (yk > lat) && lon < (xk - xi) * (lat - yi) / (yk - yi) + xi) ins = !ins;
      }
    }); });
    return ins;
  }
  function caixa(geom) {
    var b = [Infinity, Infinity, -Infinity, -Infinity];
    aneis(geom).forEach(function (p) { p[0].forEach(function (c) { b[0] = Math.min(b[0], c[0]); b[1] = Math.min(b[1], c[1]); b[2] = Math.max(b[2], c[0]); b[3] = Math.max(b[3], c[1]); }); });
    return b;
  }
  // pontos de amostra dentro do município: grade de 0,01° (~1 km); município muito pequeno = ponto do rótulo
  function amostras(f) {
    var b = caixa(f.geometry), pts = [], d = 0.01;
    for (var la = Math.ceil(b[1] / d) * d; la <= b[3]; la += d) for (var lo = Math.ceil(b[0] / d) * d; lo <= b[2]; lo += d) if (dentro(lo, la, f.geometry)) pts.push([lo, la]);
    if (!pts.length) pts.push([f.properties.label_lon, f.properties.label_lat]);
    return pts;
  }
  // mínimo, média e máximo da chuva no município, para cada produto (suavizado = bilinear; bruto = células do GFS)
  function estatMunicipio(j, f, produtos, modo) {
    var pts = f._amostras || (f._amostras = amostras(f)), g = j.grade, out = {};
    produtos.forEach(function (k) {
      var m = j.produtos[k].mm, vs = [], s = 0;
      pts.forEach(function (p) { var v = modo === 'bruto' ? celula(g, m, p[0], p[1]) : bilinear(g, m, p[0], p[1]); if (isFinite(v)) { vs.push(v); s += v; } });
      vs.sort(function (a, b) { return a - b; });
      var n = vs.length, q = function (f) { var i = (n - 1) * f, a = Math.floor(i); return a + 1 < n ? vs[a] + (vs[a + 1] - vs[a]) * (i - a) : vs[a]; };
      // p10/p90: faixa do texto sem os extremos de borda (o mínimo e o máximo continuam na tabela)
      out[k] = n ? { min: vs[0], media: s / n, max: vs[n - 1], p10: q(0.1), p90: q(0.9), n: n } : { min: NaN, media: NaN, max: NaN, p10: NaN, p90: NaN, n: 0 };
    });
    return out;
  }
  // faixa para o texto ("40 - 60 mm"): limites da escala do boletim que envolvem o mínimo e o máximo
  var CORTES = [0, 5, 10, 15, 20, 25, 30, 40, 50, 60, 80, 100, 125, 150, 200, 250, 300, 400, 500];
  function faixa(mn, mx) {
    if (!isFinite(mn) || !isFinite(mx)) return '—';
    if (mx < 0.5) return 'sem chuva significativa';
    var a = 0, b = CORTES[CORTES.length - 1];
    for (var i = 0; i < CORTES.length; i++) if (CORTES[i] <= mn) a = CORTES[i];
    for (i = CORTES.length - 1; i >= 0; i--) if (CORTES[i] >= mx) b = CORTES[i];
    if (mx > CORTES[CORTES.length - 1]) return 'acima de ' + CORTES[CORTES.length - 1] + ' mm';
    if (a === b) { var k = CORTES.indexOf(b); b = CORTES[Math.min(CORTES.length - 1, k + 1)]; }
    return a + ' - ' + b + ' mm';
  }

  /* ---------------- datas ---------------- */
  function soma(dataISO, dias) { var p = dataISO.split('-').map(Number), d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + dias)); return d.toISOString().slice(0, 10); }
  function br(dataISO) { var p = dataISO.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  // dia k da previsão: janela de 24 h a partir da rodada (00Z = 21h do dia anterior, hora local; 06Z = 03h)
  function janelas(j, horas) {
    var n = horas / 24, h0 = +j.ciclo, out = [];
    for (var k = 0; k < n; k++) {
      var ini = soma(j.data_ciclo, k), fim = soma(j.data_ciclo, k + 1), hl = (h0 + 21) % 24, dl = h0 < 3 ? -1 : 0;
      out.push({ k: k, data: ini, rotulo: br(ini), utc: j.ciclo + 'Z de ' + br(ini) + ' a ' + j.ciclo + 'Z de ' + br(fim),
        local: ('0' + hl).slice(-2) + 'h de ' + br(soma(ini, dl)) + ' a ' + ('0' + hl).slice(-2) + 'h de ' + br(soma(fim, dl)) + ' (hora local)' });
    }
    return out;
  }

  return { VERSAO: VERSAO, ESCALAS: ESCALAS, HORIZONTES: HORIZONTES, classe: classe, validar: validar, celula: celula, bilinear: bilinear,
    dentro: dentro, caixa: caixa, amostras: amostras, estatMunicipio: estatMunicipio, faixa: faixa, janelas: janelas, br: br, soma: soma, fmt: fmt };
});
