/*
 * Isolinhas com rótulos — módulo comum (13/11/2026, Patrick/Claude) — SIMGE/IGAM
 *
 * Usado pela ferramenta Reservatórios (mapas de Minas) e pela aba Barragens (mapas de Minas e recortes).
 * Mesmo método da Umidade Mínima (umidade-minima/app.js): marching squares numa grade fina, segmentos emendados
 * em linhas contínuas, rótulo no sentido da linha e linha interrompida embaixo do texto. Aqui o espaçamento dos
 * rótulos é medido em milímetros do mapa (vale para qualquer escala) e o campo NÃO é suavizado: as linhas passam
 * exatamente pelos valores da interpolação usada no mapa (os picos de chuva não são rebaixados).
 *
 * IsoLinhas.calcular({
 *   valor(lon, lat) -> número | NaN,     campo (ex.: bilinear do GFS)
 *   ext {x0, x1, y0, y1},                área em graus
 *   passo,                               tamanho da grade em graus (ex.: 0,025 no mapa de Minas)
 *   niveis [..],                         valores das linhas (ex.: limites das faixas)
 *   mmGrau,                              mm do mapa por grau (Minas no LayoutMapa: ~18,6)
 *   dentro(lon, lat) -> bool,            (opcional) onde pode haver rótulo
 *   evitar [[lon0, lat0, lon1, lat1]],   (opcional) caixas sem rótulo (nomes de cidades, legenda…)
 *   rotulos: true/false, tam (mm), minLinhaMm, distRotulosMm
 * }) -> { linhas: [[[lon, lat], …], …], rotulos: [{lon, lat, texto, angulo, tamanho, cor, opacidade, halo}] }
 */
(function (raiz, fabrica) {
  'use strict';
  var M = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = M; else raiz.IsoLinhas = M;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function fmt(v) { return String(v).replace('.', ','); }
  // anda dist (graus) pela linha a partir do ponto k; devolve o ponto do corte e o índice do trecho (null se a linha acaba antes)
  function andar(ln, k, dir, dist) {
    var acc = 0;
    for (var m = k; dir < 0 ? m > 0 : m < ln.length - 1; m += dir) {
      var a = ln[m], b = ln[m + dir], seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (acc + seg >= dist) { var t = seg ? (dist - acc) / seg : 0; return { i: dir < 0 ? m - 1 : m, p: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])] }; }
      acc += seg;
    }
    return null;
  }
  var TAB = { 1: [['l', 't']], 2: [['t', 'r']], 3: [['l', 'r']], 4: [['r', 'b']], 5: [['l', 't'], ['r', 'b']], 6: [['t', 'b']], 7: [['l', 'b']],
    8: [['b', 'l']], 9: [['b', 't']], 10: [['t', 'r'], ['b', 'l']], 11: [['b', 'r']], 12: [['r', 'l']], 13: [['r', 't']], 14: [['t', 'l']] };

  function calcular(o) {
    var e = o.ext, d = o.passo || 0.025, K = o.mmGrau || 18.6, tam = o.tam || 3.2;
    var nx = Math.max(2, Math.round((e.x1 - e.x0) / d) + 1), ny = Math.max(2, Math.round((e.y1 - e.y0) / d) + 1);
    var dx = (e.x1 - e.x0) / (nx - 1), dy = (e.y1 - e.y0) / (ny - 1);
    var v = new Float64Array(nx * ny);
    for (var y = 0; y < ny; y++) for (var x = 0; x < nx; x++) v[y * nx + x] = o.valor(e.x0 + dx * x, e.y1 - dy * y);
    var ll = function (x, y) { return [e.x0 + dx * x, e.y1 - dy * y]; };
    var minLinha = (o.minLinhaMm || 30) / K, distRot = (o.distRotulosMm || 30) / K, entre = (o.entreRotulosMm || 80) / K;
    var linhas = [], rotulos = [], usados = [];
    (o.niveis || []).forEach(function (nv) {
      var segs = [];
      for (var y = 0; y < ny - 1; y++) for (var x = 0; x < nx - 1; x++) {
        var a = v[y * nx + x], b = v[y * nx + x + 1], c = v[(y + 1) * nx + x + 1], dd = v[(y + 1) * nx + x];
        if (!(isFinite(a) && isFinite(b) && isFinite(c) && isFinite(dd))) continue;
        var idx = (a >= nv) | ((b >= nv) << 1) | ((c >= nv) << 2) | ((dd >= nv) << 3);
        if (idx === 0 || idx === 15) continue;
        var ed = {
          t: function () { return { k: 'h' + x + ',' + y, p: ll(x + (nv - a) / (b - a), y) }; },
          r: function () { return { k: 'v' + (x + 1) + ',' + y, p: ll(x + 1, y + (nv - b) / (c - b)) }; },
          b: function () { return { k: 'h' + x + ',' + (y + 1), p: ll(x + (nv - dd) / (c - dd), y + 1) }; },
          l: function () { return { k: 'v' + x + ',' + y, p: ll(x, y + (nv - a) / (dd - a)) }; }
        };
        TAB[idx].forEach(function (pq) { segs.push([ed[pq[0]](), ed[pq[1]]()]); });
      }
      var porPonta = new Map();
      segs.forEach(function (s, i) { s.forEach(function (q) { if (!porPonta.has(q.k)) porPonta.set(q.k, []); porPonta.get(q.k).push(i); }); });
      var usado = new Uint8Array(segs.length);
      for (var i = 0; i < segs.length; i++) {
        if (usado[i]) continue;
        usado[i] = 1;
        var pts = [segs[i][0], segs[i][1]];
        var crescer = function (fim) {
          for (;;) {
            var q = fim ? pts[pts.length - 1] : pts[0], lst = porPonta.get(q.k) || [], j = null;
            for (var u = 0; u < lst.length; u++) if (!usado[lst[u]]) { j = lst[u]; break; }
            if (j == null) return;
            usado[j] = 1;
            var prox = segs[j][0].k === q.k ? segs[j][1] : segs[j][0];
            if (fim) pts.push(prox); else pts.unshift(prox);
          }
        };
        crescer(true); crescer(false);
        var ln = pts.map(function (q) { return q.p; });
        // comprimento acumulado (graus) para posicionar rótulos por distância
        var acum = [0]; for (var m = 1; m < ln.length; m++) acum.push(acum[m - 1] + Math.hypot(ln[m][0] - ln[m - 1][0], ln[m][1] - ln[m - 1][1]));
        var total = acum[acum.length - 1], cortes = [];
        if (o.rotulos !== false && total >= minLinha) {
          var texto = fmt(nv), meiaVao = (texto.length * 0.556 * tam / 2 + 0.7) / K;
          // candidatos: meio da linha e depois a cada "entre" para os dois lados
          var alvos = [total / 2]; for (var s2 = entre; total / 2 - s2 > distRot || total / 2 + s2 < total - distRot; s2 += entre) { alvos.push(total / 2 - s2); alvos.push(total / 2 + s2); }
          alvos.forEach(function (alvo) {
            if (alvo < meiaVao * 2 || alvo > total - meiaVao * 2) return;
            var k = 0; while (k < acum.length - 1 && acum[k] < alvo) k++;
            var lo = ln[k][0], la = ln[k][1];
            if (o.dentro && ![[0, 0], [meiaVao, 0], [-meiaVao, 0], [0, tam / K], [0, -tam / K]].every(function (q) { return o.dentro(lo + q[0], la + q[1]); })) return;
            if (usados.some(function (q) { return Math.hypot(q[0] - lo, q[1] - la) < distRot; })) return;
            if ((o.evitar || []).some(function (bx) { return lo > bx[0] - meiaVao && lo < bx[2] + meiaVao && la > bx[1] - tam / K && la < bx[3] + tam / K; })) return;
            var ini = andar(ln, k, -1, meiaVao), fim = andar(ln, k, 1, meiaVao);
            if (!ini || !fim) return;
            var p = ln[Math.max(0, k - 3)], q2 = ln[Math.min(ln.length - 1, k + 3)];
            var ang = Math.atan2(-(q2[1] - p[1]), q2[0] - p[0]) * 180 / Math.PI;
            if (ang > 90) ang -= 180; else if (ang < -90) ang += 180;
            usados.push([lo, la]); cortes.push({ ini: ini, fim: fim });
            rotulos.push({ lon: lo, lat: la, texto: texto, angulo: +ang.toFixed(1), tamanho: tam, cor: o.cor || '#2b2b2b', opacidade: o.opacidade || 0.8, halo: false });
          });
        }
        cortes.sort(function (a2, b2) { return a2.ini.i - b2.ini.i; });
        var de = { i: 0, p: ln[0] };
        cortes.forEach(function (c2) {
          if (c2.ini.i < de.i) return;
          linhas.push([de.p].concat(ln.slice(de.i + 1, c2.ini.i + 1), [c2.ini.p]));
          de = c2.fim;
        });
        linhas.push([de.p].concat(ln.slice(de.i + 1)));
      }
    });
    return { linhas: linhas, rotulos: rotulos };
  }
  return { calcular: calcular };
});
