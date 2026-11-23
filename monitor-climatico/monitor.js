/*
 * Monitor Climático v0.1 (23/11/2026, Patrick/Claude) — SIMGE/IGAM
 * Funções de cálculo da ferramenta (sem tela). A tela fica em monitor-climatico/app.js.
 * Reaproveita, sem alterar, o núcleo dos Mapas Climáticos (mapas-climaticos/nucleo.js): leitura dos TXT, conferência,
 * IDW, krigagem e regressão-krigagem.
 *
 * O que este módulo acrescenta (metodologia de cada parte no comentário da função):
 *   1. MERGE (CPTEC/INPE): leitura dos produtos mensais gravados pela coleta (scripts/baixar_merge.py) e amostragem bilinear.
 *   2. Categoria do mês nas estações (tercis/percentil/SPI aproximado) com a forma da gama do MERGE e a normal do INMET.
 *   3. Teste de qualidade contra o satélite (diferença estação − MERGE, escore robusto pela mediana e MAD).
 *   4. Chuva com o MERGE como guia: regressão estação ~ MERGE + krigagem dos resíduos (krigagem com deriva externa
 *      na forma de regressão-krigagem), com validação cruzada.
 *   5. Desvio-padrão da krigagem (mapa de incerteza).
 *   6. Média ponderada pela área (Minas e mesorregiões), como pede a OMM para os produtos nacionais (NCMP).
 *   7. GeoTIFF (Float32, SIRGAS 2000) e ESRI ASCII da grade.
 *   8. Texto-rascunho do boletim.
 *   9. Histórico da validação cruzada mês a mês.
 */
(function (raiz, fabrica) {
  var M = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = M; else raiz.MonitorClimatico = M;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var VERSAO = '0.1';

  /* ======================= matemática ======================= */
  // gama incompleta regularizada inferior P(a, x) (Numerical Recipes: série para x < a+1, fração continuada senão)
  function lnGama(z) {
    var c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    var x = z, y = z, t = x + 5.5; t -= (x + 0.5) * Math.log(t);
    var s = 1.000000000190015; for (var j = 0; j < 6; j++) s += c[j] / ++y;
    return -t + Math.log(2.5066282746310005 * s / x);
  }
  function gamaInc(a, x) {
    if (!(a > 0) || !(x >= 0)) return NaN;
    if (x === 0) return 0;
    var gln = lnGama(a), n, sum, del, ap;
    if (x < a + 1) {
      ap = a; sum = del = 1 / a;
      for (n = 0; n < 500; n++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-12) break; }
      return sum * Math.exp(-x + a * Math.log(x) - gln);
    }
    var b = x + 1 - a, c = 1e300, d = 1 / b, h = d, an;
    for (n = 1; n < 500; n++) {
      an = -n * (n - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300; c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d; del = d * c; h *= del; if (Math.abs(del - 1) < 1e-12) break;
    }
    return 1 - Math.exp(-x + a * Math.log(x) - gln) * h;
  }
  // inversa da normal padrão (Acklam; erro relativo < 1,2e-9)
  function normInv(p) {
    if (!(p > 0 && p < 1)) return p <= 0 ? -Infinity : Infinity;
    var a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239],
      b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1],
      c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783],
      d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416], q, r, pl = 0.02425;
    if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p > 1 - pl) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    q = p - 0.5; r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  function mediana(a) { if (!a.length) return NaN; var b = a.slice().sort(function (x, y) { return x - y; }), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; }

  /* ======================= 1. MERGE ======================= */
  // JSON gravado pela coleta: camadas inteiras (valor × escala), linhas de sul para norte.
  function decodificarMerge(doc) {
    var G = doc.grade, n = G.nx * G.ny, out = { doc: doc, G: G, c: {} };
    Object.keys(doc.camadas).forEach(function (k) {
      var src = doc.camadas[k], esc = doc.escala[k] || 1, a = new Float32Array(n);
      for (var i = 0; i < n; i++) a[i] = src[i] == null ? NaN : src[i] / esc;
      out.c[k] = a;
    });
    return out;
  }
  // bilinear entre os 4 centros vizinhos (só os válidos, pesos renormalizados)
  function amostrar(Mg, camada, lon, lat) {
    var G = Mg.G, a = Mg.c[camada]; if (!a) return NaN;
    var fx = (lon - G.lon0) / G.d, fy = (lat - G.lat0) / G.d, i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j, s = 0, w = 0;
    [[0, 0, (1 - tx) * (1 - ty)], [1, 0, tx * (1 - ty)], [0, 1, (1 - tx) * ty], [1, 1, tx * ty]].forEach(function (q) {
      var ii = i + q[0], jj = j + q[1]; if (ii < 0 || jj < 0 || ii >= G.nx || jj >= G.ny) return;
      var v = a[jj * G.nx + ii]; if (isFinite(v) && q[2] > 0) { s += v * q[2]; w += q[2]; }
    });
    return w > 0 ? s / w : NaN;
  }
  // camada do MERGE levada para a grade do mapa (0,01°, norte → sul, como o núcleo)
  function mergeNaGrade(Mg, camada, masc, G) {
    var g = new Float64Array(G.nx * G.ny).fill(NaN);
    for (var j = 0; j < G.ny; j++) { var lat = G.lat0 - j * G.d; for (var i = 0; i < G.nx; i++) { var c = j * G.nx + i; if (masc[c] >= 0) g[c] = amostrar(Mg, camada, G.lon0 + i * G.d, lat); } }
    return g;
  }

  /* ======================= 2. categoria do mês nas estações ======================= */
  // Metodologia: a forma da distribuição (alpha) e a chance de mês seco (p0) vêm do MERGE no ponto da estação
  // (28 anos, 1998-2025); a média vem da própria estação (normal 1991-2020 do INMET, coluna CLIMATOLOGIA).
  // Média dos meses com chuva = normal / (1 − p0); beta = essa média / alpha. H = p0 + (1 − p0)·P(alpha, x/beta).
  // Percentil = 100·H; SPI aproximado = Φ⁻¹(H); tercis: H < 1/3 abaixo, > 2/3 acima.
  var CATEGORIAS = [
    { id: 'muitoAbaixo', nome: 'Muito abaixo do normal', h: 0.1, cor: '#8c510a' },
    { id: 'abaixo', nome: 'Abaixo do normal', h: 1 / 3, cor: '#d8b365' },
    { id: 'normal', nome: 'Dentro do normal', h: 2 / 3, cor: '#f2f0e6' },
    { id: 'acima', nome: 'Acima do normal', h: 0.9, cor: '#5ab4ac' },
    { id: 'muitoAcima', nome: 'Muito acima do normal', h: 1.01, cor: '#01665e' }
  ];
  function categoriaDeH(H) { if (!isFinite(H)) return null; for (var i = 0; i < CATEGORIAS.length; i++) if (H < CATEGORIAS[i].h) return CATEGORIAS[i]; return CATEGORIAS[CATEGORIAS.length - 1]; }
  function probGama(x, alpha, beta, p0) {
    if (!(alpha > 0 && beta > 0 && p0 >= 0 && p0 < 1) || !isFinite(x)) return NaN;
    var H = x <= 0.05 ? p0 : p0 + (1 - p0) * gamaInc(alpha, x / beta);
    return Math.min(1 - 1e-6, Math.max(1e-6, H));
  }
  function categoriaEstacao(acum, normal, alpha, p0) {
    if (!(normal > 0) || !(alpha > 0) || !isFinite(p0) || p0 >= 0.95) return { H: NaN, motivo: !(normal > 0) ? 'sem normal' : 'mês quase sempre seco no MERGE' };
    var beta = normal / (1 - p0) / alpha, H = probGama(acum, alpha, beta, p0);
    return { H: H, pct: 100 * H, spi: normInv(H), cat: categoriaDeH(H), beta: beta };
  }

  /* ======================= 3. teste de qualidade contra o satélite ======================= */
  // Metodologia: r = estação − MERGE no ponto (bilinear). Escore robusto z = (r − mediana(r)) / (1,4826·MAD(r)), com as
  // estações de MG e entorno do próprio mês (o viés comum entre satélite e estação sai pela mediana).
  // Forte: |z| ≥ 3,5 e |r| ≥ máx(25 mm, 50 % do MERGE). Atenção: |z| ≥ 2,5 e |r| ≥ 15 mm. Zero na estação com
  // MERGE ≥ 20 mm também é forte (falha de registro típica). Precisa de pelo menos 15 estações.
  var QC_SAT = { zForte: 3.5, zAtencao: 2.5, minForte: 25, fracForte: 0.5, minAtencao: 15, fracAtencao: 0.3, zeroSat: 20, minEst: 15 };
  function testeSatelite(lista) {   // lista: [{ chave, v, sat }]
    var ok = lista.filter(function (e) { return isFinite(e.v) && isFinite(e.sat); });
    if (ok.length < QC_SAT.minEst) return { aplicado: false, motivo: 'menos de ' + QC_SAT.minEst + ' estações com MERGE', res: {} };
    var r = ok.map(function (e) { return e.v - e.sat; }), med = mediana(r), mad = mediana(r.map(function (x) { return Math.abs(x - med); })) * 1.4826;
    if (!(mad > 0.5)) mad = 0.5;
    var res = {};
    ok.forEach(function (e) {
      var d = e.v - e.sat, z = (d - med) / mad, g = null, txt = '';
      if (e.v <= 0.05 && e.sat >= QC_SAT.zeroSat) { g = 'forte'; txt = '0 mm na estação e ' + Math.round(e.sat) + ' mm no MERGE'; }
      else if (Math.abs(z) >= QC_SAT.zForte && Math.abs(d) >= Math.max(QC_SAT.minForte, QC_SAT.fracForte * e.sat)) { g = 'forte'; txt = 'Diferença de ' + Math.round(d) + ' mm para o MERGE (escore ' + z.toFixed(1).replace('.', ',') + ')'; }
      else if (Math.abs(z) >= QC_SAT.zAtencao && Math.abs(d) >= Math.max(QC_SAT.minAtencao, QC_SAT.fracAtencao * Math.max(e.v, e.sat))) { g = 'atencao'; txt = 'Diferença de ' + Math.round(d) + ' mm para o MERGE (escore ' + z.toFixed(1).replace('.', ',') + ')'; }
      res[e.chave] = { d: d, z: z, g: g, txt: txt };
    });
    return { aplicado: true, mediana: med, mad: mad, n: ok.length, res: res };
  }

  /* ======================= 4. chuva guiada pelo MERGE ======================= */
  // Metodologia (regressão-krigagem com o satélite como covariável, forma prática da krigagem com deriva externa):
  //   (a) regressão linear por mínimos quadrados: estação = b0 + b1·MERGE, com as estações aprovadas (MG + entorno);
  //   (b) resíduo de cada estação = valor − regressão; variograma exponencial e krigagem ordinária dos resíduos
  //       (mesmas funções e parâmetros da krigagem dos Mapas Climáticos);
  //   (c) mapa = b0 + b1·MERGE(ponto) + resíduo krigado; piso 0 mm.
  //   Bloqueio: b1 ≤ 0 ou R² < 0,2 (o satélite não explica o mês) → o método não libera.
  var KED = { minEst: 20, r2Min: 0.2 };
  function regressao1(x, y) {
    var n = x.length, mx = 0, my = 0, i; for (i = 0; i < n; i++) { mx += x[i]; my += y[i]; } mx /= n; my /= n;
    var sxy = 0, sxx = 0, syy = 0; for (i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) * (x[i] - mx); syy += (y[i] - my) * (y[i] - my); }
    var b1 = sxx > 0 ? sxy / sxx : 0, b0 = my - b1 * mx, sse = 0; for (i = 0; i < n; i++) { var e = y[i] - b0 - b1 * x[i]; sse += e * e; }
    return { b0: b0, b1: b1, r2: syy > 0 ? 1 - sse / syy : NaN, n: n, rmse: Math.sqrt(sse / n) };
  }
  function prepararKED(N, pts) {   // pts: [{lon, lat, v, s (MERGE no ponto), dentroMG, codigo}]
    var com = pts.filter(function (p) { return isFinite(p.s); });
    if (com.length < KED.minEst) { var e = new Error('Só ' + com.length + ' estações com MERGE no ponto (mínimo ' + KED.minEst + ').'); e.usuario = true; throw e; }
    var reg = regressao1(com.map(function (p) { return p.s; }), com.map(function (p) { return p.v; }));
    var res = com.map(function (p) { return { codigo: p.codigo, lon: p.lon, lat: p.lat, v: p.v - (reg.b0 + reg.b1 * p.s), dentroMG: p.dentroMG }; });
    var vario = N.ajustarVariograma(res), ctx = N.prepararKrigagem(res, vario);
    return { reg: reg, vario: vario, ctx: ctx, usadas: com.length, semSat: pts.length - com.length, ok: reg.b1 > 0 && reg.r2 >= KED.r2Min };
  }
  function kedPonto(N, K, lon, lat, s) { if (!isFinite(s)) return NaN; var r = N.krigarPonto(K.ctx, lon, lat); var z = K.reg.b0 + K.reg.b1 * s + (isFinite(r) ? r : 0); return z < 0 ? 0 : z; }
  function kedLinhas(N, K, masc, satGrade, G, j0, j1) {
    if (!K.grade) K.grade = new Float64Array(G.nx * G.ny).fill(NaN);
    for (var j = j0; j < Math.min(j1, G.ny); j++) { var lat = G.lat0 - j * G.d; for (var i = 0; i < G.nx; i++) { var c = j * G.nx + i; if (masc[c] >= 0) K.grade[c] = kedPonto(N, K, G.lon0 + i * G.d, lat, satGrade[c]); } }
    return K.grade;
  }
  // validação cruzada: tira cada estação de MG, refaz regressão + variograma + krigagem sem ela e estima o valor dela
  function validacaoCruzadaKED(N, pts) {
    var com = pts.filter(function (p) { return isFinite(p.s); }), e = [];
    com.forEach(function (p, k) {
      if (!p.dentroMG) return;
      var resto = com.filter(function (_, i) { return i !== k; });
      try { var K = prepararKED(N, resto); var est = kedPonto(N, K, p.lon, p.lat, p.s); if (isFinite(est)) e.push({ codigo: p.codigo, obs: p.v, est: est, err: est - p.v }); } catch (x) { }
    });
    return resumoErros(e);
  }
  function resumoErros(e) {
    var mae = 0, rmse = 0, vies = 0; e.forEach(function (x) { mae += Math.abs(x.err); rmse += x.err * x.err; vies += x.err; });
    return e.length ? { n: e.length, mae: mae / e.length, rmse: Math.sqrt(rmse / e.length), vies: vies / e.length, pontos: e } : null;
  }

  /* ======================= 5. desvio-padrão da krigagem ======================= */
  // σ² = C(0) − Σ wᵢ·C(xᵢ, x) − μ, com o mesmo modelo exponencial, as mesmas 20 vizinhas e a mesma matriz do núcleo.
  // Mede só a geometria das estações e o variograma (onde faltam estações, σ cresce); não mede erro do dado.
  function vizinhasK(ctx, x, y) {
    var d = ctx.xy.map(function (q, i) { var dx = q[0] - x, dy = q[1] - y; return [dx * dx + dy * dy, i]; });
    d.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    return d.slice(0, ctx.k).map(function (z) { return z[1]; }).sort(function (a, b) { return a - b; });
  }
  function desvioKrigagem(N, ctx, lon, lat) {
    var q = N.planoKm(lon, lat), idx = vizinhasK(ctx, q[0], q[1]), n = idx.length, V = ctx.v, xy = ctx.xy;
    var inv = ctx.cache.get(idx.join(','));
    if (inv === undefined) { N.krigarPonto(ctx, lon, lat); inv = ctx.cache.get(idx.join(',')); }
    if (!inv) return NaN;
    var b = [], i, j;
    for (i = 0; i < n; i++) { var ex = xy[idx[i]][0] - q[0], ey = xy[idx[i]][1] - q[1]; b.push(V.patamar * Math.exp(-Math.sqrt(ex * ex + ey * ey) / V.alcance)); }
    b.push(1);
    var s2 = V.patamar + V.pepita;
    for (i = 0; i <= n; i++) { var w = 0; for (j = 0; j <= n; j++) w += inv[i][j] * b[j]; s2 -= w * b[i]; }
    return Math.sqrt(Math.max(0, s2));
  }
  function desvioLinhas(N, ctx, masc, G, j0, j1, alvo) {
    for (var j = j0; j < Math.min(j1, G.ny); j++) { var lat = G.lat0 - j * G.d; for (var i = 0; i < G.nx; i += 1) { var c = j * G.nx + i; if (masc[c] >= 0) alvo[c] = desvioKrigagem(N, ctx, G.lon0 + i * G.d, lat); } }
  }

  /* ======================= 6. média ponderada pela área ======================= */
  // Cada célula de 0,01° pesa cos(latitude) (área real da célula). Média de MG e de cada mesorregião (índice da máscara).
  function mediaArea(grade, masc, G, nMesos) {
    var s = 0, w = 0, sm = new Float64Array(nMesos || 0), wm = new Float64Array(nMesos || 0);
    for (var j = 0; j < G.ny; j++) {
      var cw = Math.cos((G.lat0 - j * G.d) * Math.PI / 180);
      for (var i = 0; i < G.nx; i++) { var c = j * G.nx + i, m = masc[c], v = grade[c]; if (m >= 0 && isFinite(v)) { s += v * cw; w += cw; if (nMesos) { sm[m] += v * cw; wm[m] += cw; } } }
    }
    var mesos = []; for (var k = 0; k < (nMesos || 0); k++) mesos.push(wm[k] > 0 ? sm[k] / wm[k] : NaN);
    return { mg: w > 0 ? s / w : NaN, mesos: mesos };
  }
  // fração da área de MG em cada classe de uma grade de categorias (índices 0..n-1)
  function fracaoClasses(gradeIdx, masc, G, n) {
    var w = new Float64Array(n), t = 0;
    for (var j = 0; j < G.ny; j++) { var cw = Math.cos((G.lat0 - j * G.d) * Math.PI / 180); for (var i = 0; i < G.nx; i++) { var c = j * G.nx + i, k = gradeIdx[c]; if (masc[c] >= 0 && k >= 0) { w[k] += cw; t += cw; } } }
    return Array.prototype.map.call(w, function (x) { return t > 0 ? x / t : 0; });
  }

  /* ======================= 7. GeoTIFF e ASCII ======================= */
  // GeoTIFF Float32, uma banda, sem compressão, centro do pixel no canto (PixelIsArea), SIRGAS 2000 (EPSG:4674), NoData −9999.
  function geotiff(grade, G) {
    var W = G.nx, H = G.ny, nodata = '-9999';
    var entradas = [], extra = [];
    function tag(id, tipo, n, valor) { entradas.push({ id: id, tipo: tipo, n: n, valor: valor }); }
    var bytesDados = W * H * 4;
    // tipos: 3 SHORT, 4 LONG, 12 DOUBLE, 2 ASCII
    tag(256, 4, 1, W); tag(257, 4, 1, H); tag(258, 3, 1, 32); tag(259, 3, 1, 1); tag(262, 3, 1, 1);
    tag(273, 4, 1, 0); /* StripOffsets: preenchido depois */ tag(277, 3, 1, 1); tag(278, 4, 1, H); tag(279, 4, 1, bytesDados);
    tag(284, 3, 1, 1); tag(339, 3, 1, 3);
    tag(33550, 12, 3, [G.d, G.d, 0]);                                                   // ModelPixelScale
    tag(33922, 12, 6, [0, 0, 0, G.lon0 - G.d / 2, G.lat0 + G.d / 2, 0]);               // ModelTiepoint (canto superior esquerdo)
    tag(34735, 3, 16, [1, 1, 0, 3, 1024, 0, 1, 2, 1025, 0, 1, 1, 2048, 0, 1, 4674]);     // GeoKeys: geográfico, PixelIsArea, EPSG 4674
    tag(42113, 2, nodata.length + 1, nodata);                                           // GDAL_NODATA
    var TAM = { 2: 1, 3: 2, 4: 4, 12: 8 };
    var nIfd = entradas.length, ifdTam = 2 + nIfd * 12 + 4, pos = 8 + ifdTam;
    entradas.forEach(function (e) { var t = TAM[e.tipo] * e.n; if (t > 4) { e.off = pos; pos += t + (t % 2); } });
    var dadosOff = pos, total = dadosOff + bytesDados;
    entradas.forEach(function (e) { if (e.id === 273) e.valor = dadosOff; });
    var buf = new ArrayBuffer(total), dv = new DataView(buf), u8 = new Uint8Array(buf);
    u8[0] = 0x49; u8[1] = 0x49; dv.setUint16(2, 42, true); dv.setUint32(4, 8, true);
    dv.setUint16(8, nIfd, true);
    function escrever(e, o) {
      var vs = Array.isArray(e.valor) ? e.valor : [e.valor];
      if (e.tipo === 2) { for (var k = 0; k < e.valor.length; k++) u8[o + k] = e.valor.charCodeAt(k); u8[o + e.valor.length] = 0; return; }
      vs.forEach(function (v, k) { if (e.tipo === 3) dv.setUint16(o + 2 * k, v, true); else if (e.tipo === 4) dv.setUint32(o + 4 * k, v, true); else dv.setFloat64(o + 8 * k, v, true); });
    }
    entradas.forEach(function (e, k) {
      var o = 10 + k * 12; dv.setUint16(o, e.id, true); dv.setUint16(o + 2, e.tipo, true); dv.setUint32(o + 4, e.n, true);
      if (e.off != null) { dv.setUint32(o + 8, e.off, true); escrever(e, e.off); } else escrever(e, o + 8);
    });
    dv.setUint32(10 + nIfd * 12, 0, true);
    for (var c = 0; c < W * H; c++) dv.setFloat32(dadosOff + 4 * c, isFinite(grade[c]) ? grade[c] : -9999, true);
    return u8;
  }
  function ascii(grade, G) {
    var L = ['ncols ' + G.nx, 'nrows ' + G.ny, 'xllcorner ' + (G.lon0 - G.d / 2).toFixed(4), 'yllcorner ' + (G.lat0 - (G.ny - 1) * G.d - G.d / 2).toFixed(4), 'cellsize ' + G.d, 'NODATA_value -9999'];
    for (var j = 0; j < G.ny; j++) { var l = new Array(G.nx); for (var i = 0; i < G.nx; i++) { var v = grade[j * G.nx + i]; l[i] = isFinite(v) ? (Math.round(v * 100) / 100) : -9999; } L.push(l.join(' ')); }
    return L.join('\n') + '\n';
  }
  var PRJ_4674 = 'GEOGCS["SIRGAS 2000",DATUM["Sistema_de_Referencia_Geocentrico_para_las_AmericaS_2000",SPHEROID["GRS 1980",6378137,298.257222101]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]';

  /* ======================= 8. texto-rascunho do boletim ======================= */
  function n1(v, c) { return isFinite(v) ? Number(v).toFixed(c == null ? 0 : c).replace('.', ',') : '—'; }
  var MIN = { de: 1, da: 1, do: 1, das: 1, dos: 1, e: 1 };
  function nomeMeso(n) { return String(n).toLowerCase().split(' ').map(function (w, i) { return i && MIN[w] ? w : w.charAt(0).toUpperCase() + w.slice(1); }).join(' ').replace('Jequitinhonha', 'Jequitinhonha'); }
  function texto(R) {   // R: { mesNome, ano, prec:{mg, mesos:[{nome,v}], aprecMg, maxEst, minEst}, cat:{frac,...}, atmed, tmax, tmin, dias30, spi3 }
    var P = [], s;
    if (R.prec) {
      var ms = R.prec.mesos.filter(function (m) { return isFinite(m.v); }).sort(function (a, b) { return b.v - a.v; });
      s = 'Em ' + R.mesNome.toLowerCase() + ' de ' + R.ano + ', a chuva média em Minas Gerais foi de ' + n1(R.prec.mg) + ' mm';
      if (isFinite(R.prec.aprecMg)) s += ', ' + (R.prec.aprecMg >= 0 ? n1(R.prec.aprecMg) + ' % acima' : n1(-R.prec.aprecMg) + ' % abaixo') + ' da climatologia';
      s += '.';
      if (ms.length > 1) s += ' Os maiores acumulados médios foram nas mesorregiões ' + nomeMeso(ms[0].nome) + ' (' + n1(ms[0].v) + ' mm) e ' + nomeMeso(ms[1].nome) + ' (' + n1(ms[1].v) + ' mm); o menor, na mesorregião ' + nomeMeso(ms[ms.length - 1].nome) + ' (' + n1(ms[ms.length - 1].v) + ' mm).';
      if (R.prec.maxEst) s += ' O maior total em uma estação foi em ' + R.prec.maxEst.nome + ' (' + n1(R.prec.maxEst.v, 1) + ' mm).';
      P.push(s);
    }
    if (R.cat) {
      var f = R.cat.frac;
      s = 'Pela categoria do mês (' + R.cat.base + '), ' + n1(100 * (f[0] + f[1])) + ' % da área do estado ficou abaixo do normal, ' + n1(100 * f[2]) + ' % dentro do normal e ' + n1(100 * (f[3] + f[4])) + ' % acima.';
      if (isFinite(R.spi3)) s += ' O SPI de 3 meses médio no estado foi de ' + n1(R.spi3, 1) + (R.spi3 <= -1 ? ', indicando seca moderada ou pior no trimestre.' : R.spi3 >= 1 ? ', indicando trimestre úmido.' : ', dentro da faixa normal.');
      P.push(s);
    }
    if (R.atmed && isFinite(R.atmed.mg)) P.push('A temperatura média ficou ' + (R.atmed.mg >= 0 ? n1(R.atmed.mg, 1) + ' °C acima' : n1(-R.atmed.mg, 1) + ' °C abaixo') + ' da normal, na média do estado.');
    if (R.tmax && R.tmax.est) P.push('A maior temperatura registrada foi ' + n1(R.tmax.est.v, 1) + ' °C em ' + R.tmax.est.nome + (R.tmin && R.tmin.est ? ', e a menor, ' + n1(R.tmin.est.v, 1) + ' °C em ' + R.tmin.est.nome : '') + '.');
    if (R.dias30 && isFinite(R.dias30.mg)) P.push('Em média, o estado teve ' + n1(R.dias30.mg) + ' dias com máxima de 30 °C ou mais' + (R.dias30.est ? '; o maior número foi em ' + R.dias30.est.nome + ' (' + n1(R.dias30.est.v) + ' dias)' : '') + '.');
    return P;
  }

  /* ======================= 9. histórico da validação ======================= */
  var CHAVE_HIST = 'monitorValidacao:v1';
  function lerHistorico() { try { var h = JSON.parse(localStorage.getItem(CHAVE_HIST) || '[]'); return Array.isArray(h) ? h : []; } catch (e) { return []; } }
  function gravarHistorico(h) { try { localStorage.setItem(CHAVE_HIST, JSON.stringify(h)); return true; } catch (e) { return false; } }
  function registrarValidacao(h, reg) {   // reg: { periodo:'2026-09', produto, metodo, n, mae, rmse, vies }
    h = h.filter(function (x) { return !(x.periodo === reg.periodo && x.produto === reg.produto && x.metodo === reg.metodo); });
    h.push(reg); h.sort(function (a, b) { return a.periodo < b.periodo ? -1 : a.periodo > b.periodo ? 1 : 0; }); return h;
  }
  function historicoCSV(h) {
    return '﻿' + [['Período', 'Produto', 'Método', 'Estações', 'MAE', 'RMSE', 'Viés'].join(';')].concat(h.map(function (x) {
      return [x.periodo, x.produto, x.metodo, x.n, n1(x.mae, 3), n1(x.rmse, 3), n1(x.vies, 3)].join(';');
    })).join('\r\n');
  }
  function historicoDeCSV(txt) {
    var L = String(txt).replace(/^﻿/, '').split(/\r?\n/).slice(1), out = [];
    L.forEach(function (l) {
      var c = l.split(';'); if (c.length < 7 || !/^\d{4}-\d{2}$/.test(c[0])) return;
      var num = function (s) { return parseFloat(String(s).replace(',', '.')); };
      var r = { periodo: c[0], produto: c[1].slice(0, 20), metodo: c[2].slice(0, 20), n: parseInt(c[3], 10), mae: num(c[4]), rmse: num(c[5]), vies: num(c[6]) };
      if (isFinite(r.mae) && isFinite(r.rmse)) out.push(r);
    });
    return out;
  }

  return {
    VERSAO: VERSAO, gamaInc: gamaInc, normInv: normInv, mediana: mediana,
    decodificarMerge: decodificarMerge, amostrar: amostrar, mergeNaGrade: mergeNaGrade,
    CATEGORIAS: CATEGORIAS, categoriaDeH: categoriaDeH, probGama: probGama, categoriaEstacao: categoriaEstacao,
    QC_SAT: QC_SAT, testeSatelite: testeSatelite,
    KED: KED, regressao1: regressao1, prepararKED: prepararKED, kedPonto: kedPonto, kedLinhas: kedLinhas, validacaoCruzadaKED: validacaoCruzadaKED, resumoErros: resumoErros,
    desvioKrigagem: desvioKrigagem, desvioLinhas: desvioLinhas,
    mediaArea: mediaArea, fracaoClasses: fracaoClasses, geotiff: geotiff, ascii: ascii, PRJ_4674: PRJ_4674,
    texto: texto, lerHistorico: lerHistorico, gravarHistorico: gravarHistorico, registrarValidacao: registrarValidacao, historicoCSV: historicoCSV, historicoDeCSV: historicoDeCSV
  };
});
