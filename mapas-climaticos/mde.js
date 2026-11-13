/*
 * Relevo (MDE) para os Mapas Climáticos — 13/11/2026 (Patrick/Claude) — SIMGE/IGAM
 *
 * Lê as grades gravadas pelo robô do relevo (scripts/baixar_mde.py → mapas-climaticos/mde/):
 *   mde_mg.bin  altitude média da célula na grade do mapa (centro -51,06/-14,22, 0,01°)
 *   mde_ext.bin altitude média da célula de 0,02° na região das estações (para a altitude de cada estação)
 * Formato: Int16 little-endian, linhas do norte para o sul; -32768 = sem dado (vira NaN).
 * O SHA-256 gravado em mde.json é conferido no navegador (crypto.subtle) e no Node; se não bater, o relevo é recusado.
 *
 * Mde.carregarDeBuffers(meta, bufMg, bufExt) -> {mg, ext, meta}     (síncrono, sem conferência de SHA)
 * Mde.carregar(base) -> Promise<{mg, ext, meta}>                      (navegador: fetch + conferência de SHA)
 * Mde.altitudeEstacao(mde, lon, lat) -> metros | NaN                 (bilinear na grade ext; NaN fora/sem dado)
 * Mde.altitudeCelula(mde, i, j) -> metros | NaN                       (célula da grade do mapa)
 */
(function (raiz, fabrica) {
  'use strict';
  var M = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = M; else raiz.Mde = M;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var SEM = -32768;

  function grade(G, buf) {
    var esperado = G.nx * G.ny * 2;
    if (!buf || buf.byteLength !== esperado) throw new Error('relevo: tamanho inesperado de ' + G.arquivo + ' (' + (buf ? buf.byteLength : 0) + ' bytes; esperado ' + esperado + ')');
    var dv = new DataView(buf), z = new Float32Array(G.nx * G.ny);
    for (var k = 0; k < z.length; k++) { var v = dv.getInt16(k * 2, true); z[k] = v === SEM ? NaN : v; }
    return { lon0: G.lon0, lat0: G.lat0, d: G.d, nx: G.nx, ny: G.ny, z: z };
  }

  function carregarDeBuffers(meta, bufMg, bufExt) {
    if (!meta || !meta.grades || !meta.grades.mg || !meta.grades.ext) throw new Error('relevo: mde.json incompleto');
    return { mg: grade(meta.grades.mg, bufMg), ext: grade(meta.grades.ext, bufExt), meta: meta };
  }

  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }

  function carregar(base) {
    base = base || 'mde/';
    var pegar = function (n, tipo) {
      return fetch(base + n, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('relevo: ' + n + ' HTTP ' + r.status); return tipo === 'json' ? r.json() : r.arrayBuffer(); });
    };
    return pegar('mde.json', 'json').then(function (meta) {
      return Promise.all([pegar(meta.grades.mg.arquivo), pegar(meta.grades.ext.arquivo)]).then(function (bs) {
        var conf = (typeof crypto !== 'undefined' && crypto.subtle) ? Promise.all(bs.map(function (b) { return crypto.subtle.digest('SHA-256', b); })) : Promise.resolve(null);
        return conf.then(function (hs) {
          if (hs) {
            if (hex(hs[0]) !== meta.grades.mg.sha256 || hex(hs[1]) !== meta.grades.ext.sha256) throw new Error('relevo: conferência SHA-256 não bateu (arquivo corrompido ou desatualizado)');
          }
          var r = carregarDeBuffers(meta, bs[0], bs[1]); r.conferido = !!hs; return r;
        });
      });
    });
  }

  function valorGrade(G, i, j) { return (i < 0 || j < 0 || i >= G.nx || j >= G.ny) ? NaN : G.z[j * G.nx + i]; }

  // bilinear entre os centros das células; se faltar algum vizinho (litoral), usa a média dos que existem
  function bilinear(G, lon, lat) {
    var x = (lon - G.lon0) / G.d, y = (G.lat0 - lat) / G.d;
    var i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    var q = [[valorGrade(G, i, j), (1 - fx) * (1 - fy)], [valorGrade(G, i + 1, j), fx * (1 - fy)], [valorGrade(G, i, j + 1), (1 - fx) * fy], [valorGrade(G, i + 1, j + 1), fx * fy]];
    var s = 0, w = 0;
    q.forEach(function (p) { if (isFinite(p[0])) { s += p[0] * p[1]; w += p[1]; } });
    return w > 0.25 ? s / w : NaN;
  }

  function altitudeEstacao(mde, lon, lat) { return mde && mde.ext ? bilinear(mde.ext, lon, lat) : NaN; }
  function altitudeCelula(mde, i, j) { return mde && mde.mg ? valorGrade(mde.mg, i, j) : NaN; }
  function altitudePonto(mde, lon, lat) { return mde && mde.mg ? bilinear(mde.mg, lon, lat) : NaN; }

  return { SEM: SEM, carregar: carregar, carregarDeBuffers: carregarDeBuffers, altitudeEstacao: altitudeEstacao, altitudeCelula: altitudeCelula, altitudePonto: altitudePonto, bilinear: bilinear };
});
