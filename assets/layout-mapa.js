/*
 * Layout do mapa final — o MESMO desenho da Previsão diária (previsao/app-drive.js v1.14),
 * compartilhado por Chuva, Tendência e Tempo Severo.
 *
 * A folha inteira é um SVG em milímetros: 297 × 210 mm (A4 deitada). Cabeçalho, moldura, grade, norte,
 * escala, legenda, validade, créditos, rodapé, marcação das cidades (ponto + nome abaixo) e mapas base
 * são os mesmos da Previsão. Só o miolo do mapa muda: áreas coloridas em vez de ícones.
 * O PNG sai em 3508 × 2480 px (300 dpi), igual ao da Previsão.
 *
 * Depende de previsao/data/geo.js (GEO e DEFAULT_LOGOS), carregado antes deste arquivo.
 *
 * Uso:
 *   LayoutMapa.svg(op)        -> texto do SVG (usa o mapa de fundo já carregado)
 *   LayoutMapa.png(op)        -> Promise<Blob> (PNG 300 dpi; carrega o mapa de fundo escolhido antes)
 *   LayoutMapa.previa(op)     -> abre a prévia na tela (idem)
 *   op = { titulo, validade:{date:'AAAA-MM-DD', time:'HH:MM'}, credito,
 *          areas:[{geometry, fill, stroke}], legenda:[{fill, label}],
 *          cidades:[{nome, lon, lat}], municipios:false, fundo:'osm'|'osmfr'|'osmde'|'ofm'|'' }
 *   Sem op.fundo, vale a escolha do seletor "Mapa de fundo" que este arquivo coloca ao lado do botão
 *   "Prévia do mapa" (lembrada neste navegador).
 */
(function () {
  'use strict';
  if (typeof GEO === 'undefined' || typeof DEFAULT_LOGOS === 'undefined') {
    console.error('layout-mapa.js: previsao/data/geo.js não foi carregado.');
    return;
  }
  var SCRIPT_SRC = (document.currentScript && document.currentScript.src) || '';

  /* ===== constantes (iguais às da Previsão 1.14) ===== */
  var PAGE = { w: 297, h: 210 };
  var GEO_YMAX = -13.93919886637183225;            // topo da extensão em que o geo.js foi gerado
  var MAP = { x: 6.86137, y: 19.8108, w: 287.879, h: 168, xmin: -51.37697910145185887, xmax: -35.90814406617541721 };
  var K = MAP.w / (MAP.xmax - MAP.xmin);
  var GEO_DY = 3.4;                                  // mm: o mapa sobe 3,4 mm em relação ao geo.js
  MAP.ymax = GEO_YMAX - GEO_DY / K; MAP.ymin = MAP.ymax - MAP.h / K;
  if (GEO.__dy == null) {                            // desloca as geometrias do geo.js uma única vez (vale também para a Previsão)
    ['land', 'states', 'mg', 'munLines', 'mesoLines'].forEach(function (k) {
      if (typeof GEO[k] === 'string') GEO[k] = GEO[k].replace(/M(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, function (m, x, y) { return 'M' + x + ' ' + Math.round((+y - GEO_DY) * 100) / 100; });
    });
    GEO.__dy = GEO_DY;
  }
  var PT = 25.4 / 72;
  var NAVY = '#092b6a';
  var FONT = "Arial, 'Liberation Sans', Helvetica, sans-serif";
  var RODAPE = 'Iniciativa realizada com recursos do Acordo de Reparação do Rio Doce, firmado em decorrência do rompimento da Barragem de Fundão, da Samarco S.A. O rompimento, ocorrido em 5 de novembro de 2015, tirou a vida de 19 pessoas.';
  var CREDITOS_FIXOS = ['Limites municipais e mesorregiões - IBGE', 'Base cartográfica: IBGE', 'Projeção: Latitude/Longitude - Datum SIRGAS 2000'];
  var LOGO_SLOTS = ['igam', 'simge', 'appa', 'riodoce'];
  var LOGO_Y = 196.35, LOGO_H = 10, LOGO_X0 = 10.5, LOGO_X1 = 196.4;
  var PT_R = 0.65, NOME_TAM = 3.5;                  // ponto da sede com metade do tamanho anterior (igual à Previsão)
  var COL = 258.49, LIN_W = 51.28;                   // eixo e largura das linhas da coluna da legenda (iguais à Previsão 1.15)
  var MG_FILL = '#ecf4f5';                           // Minas sem mapa base: o mesmo tom claro da Previsão                    // marcação das cidades: a mesma da Previsão
  var STATE_LABELS = [['MT', -51.18, -14.494], ['GO', -49.744, -16.279], ['DF', -47.797, -15.7755], ['BA', -40.865, -14.794], ['MS', -51.0, -20.45],
    ['SP', -48.785, -21.709], ['RJ', -42.536, -22.359], ['ES', -40.361, -19.342]];
  var NORTH_ARROW = '<g transform="translate(-1.438 30.744)"><path d="m32-9.453l28.938 73.826-29-29-29 29z" fill="#000" stroke="#fff" stroke-width="3"/><path d="m32-9.453l29 73.45-29-29-29 29z" fill="none" stroke="#fff" stroke-linecap="square"/><text fill="#000" font-family="' + FONT + '" font-size="26" x="22.71" y="-10.854">N</text></g><g fill="none" stroke="#fff" stroke-width=".25" transform="translate(0 -3.829)"><path d="m4 92.82l6.74-3.891M4.603 90.7l10.397-6M3 95.17l4-2.309M5.442 88.45l13.856-8M12 72.26l18.686-10.812M14.593 65.45l16.09-9.291M15.343 63.24l15.343-8.858M16.877 60.58l13.809-7.972M17.511 58.45l13.174-7.606M18.412 56.15l12.274-7.087M19 54.04l11.427-6.597M20 51.757l10.822-6.311M20.826 49.45l9.86-5.693M21.48 47.3l9.206-5.315M23 44.647l7.686-4.437M23.744 42.45l6.928-4M24.549 40.21l6.137-3.543M25 38.18l5.686-3.283M26.663 35.446l4.02-2.323M27.617 33.12l3.069-1.772M28 31.13l2.686-1.551M29.15 28.694l1.534-.886M13 69.909l17.686-10.211M9.206 79.19l21.48-12.402M8.36 81.45l22.326-12.89M7.671 83.62l19.946-11.516M6.137 86.27l17.02-9.827M10 76.956l20.686-11.943M11.279 74.45l19.407-11.205M14 67.56l16.686-9.634"/><path d="m30.562 69.573v-43.566"/></g>';
  var ASC = .905, DESC = .212, LH = 1.117;

  /* ===== utilidades (iguais às da Previsão) ===== */
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function f2(n) { return (Math.round(n * 100) / 100).toString(); }
  function proj(lon, lat) { return [MAP.x + (lon - MAP.xmin) * K, MAP.y + (MAP.ymax - lat) * K]; }
  var measureCtx = document.createElement('canvas').getContext('2d');
  function textW(text, sizeMM, weight) { measureCtx.font = (weight || 400) + ' 100px ' + FONT; return measureCtx.measureText(text).width * sizeMM / 100; }
  function fitSize(lines, sizeMM, maxW, weight) {
    var w = Math.max.apply(null, lines.map(function (l) { return textW(l, sizeMM, weight); }));
    return w > maxW ? sizeMM * maxW / w : sizeMM;
  }
  // quebra o texto na largura e escolhe a maior letra em que tudo cabe na altura (como no rodapé da Previsão)
  function wrapFit(text, maxW, maxH, sMax, sMin, weight) {
    var paras = String(text).replace(/\r/g, '').split(/\n\s*\n/).map(function (p) { return p.replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim(); }).filter(Boolean);
    function wrap(s) {
      var out = [];
      paras.forEach(function (p) {
        var line = '';
        p.split(' ').forEach(function (w) { var t = line ? line + ' ' + w : w; if (!line || textW(t, s, weight) <= maxW) line = t; else { out.push(line); line = w; } });
        if (line) out.push(line);
      });
      return out;
    }
    function alt(n, s) { return n * s * LH - (LH - (ASC + DESC)) * s; }
    var s = sMax, lines = wrap(s);
    while (s > sMin && (alt(lines.length, s) > maxH || lines.some(function (l) { return textW(l, s, weight) > maxW; }))) { s = Math.max(sMin, s - 0.02); lines = wrap(s); }
    if (lines.length > 1 && textW(lines[lines.length - 1], s, weight) < maxW * 0.35) {
      for (var s2 = s - 0.02; s2 >= Math.max(sMin, s * 0.92); s2 -= 0.02) { var l2 = wrap(s2); if (l2.length < lines.length) { s = s2; lines = l2; break; } }
    }
    return { lines: lines, size: s };
  }
  function textBlock(o) {
    var total = o.lines.length * o.size * LH - (LH - (ASC + DESC)) * o.size;
    var y = o.yTop + (o.h - total) / 2 + ASC * o.size;
    return o.lines.map(function (l, i) {
      return '<text x="' + f2(o.x) + '" y="' + f2(y + i * o.size * LH) + '" font-family="' + FONT + '" font-size="' + f2(o.size) +
        '" font-weight="' + (o.weight || 400) + '" fill="' + o.fill + '" text-anchor="' + (o.anchor || 'start') + '">' + esc(l) + '</text>';
    }).join('');
  }
  function dms(v, pos, neg) {
    var h = v < 0 ? neg : pos; v = Math.abs(v);
    var d = Math.floor(v), m = Math.floor((v - d) * 60 + 1e-9), s = Math.round(((v - d) * 60 - m) * 60);
    if (s === 60) { s = 0; m++; } if (m === 60) { m = 0; d++; }
    return d + '°' + String(m).padStart(2, '0') + "'" + String(s).padStart(2, '0') + '"' + h;
  }
  function fmtDateBR(iso) { return iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : ''; }
  function validadeTexto(v) {
    if (!v || !v.date || !v.time) return '';
    var p = v.time.split(':');
    return 'Válido até às ' + (+p[0]) + 'h' + (p[1] && p[1] !== '00' ? p[1] : '') + ' do dia ' + fmtDateBR(v.date);
  }
  function logoLayout() {
    var GAP = 6.5, avail = LOGO_X1 - LOGO_X0, H = 12.5;
    var items = LOGO_SLOTS.map(function (k) { var L = DEFAULT_LOGOS[k] || null; return { L: L, ratio: L ? L.w / L.h : 2.6 }; });
    var need = function (H) { return items.reduce(function (a, it) { return a + H * it.ratio; }, 0) + GAP * (items.length - 1); };
    if (need(H) > avail) H *= (avail - GAP * (items.length - 1)) / (need(H) - GAP * (items.length - 1));
    items.forEach(function (it) { it.h = Math.min(LOGO_H, H); it.w = it.h * it.ratio; });
    var total = items.reduce(function (a, it) { return a + it.w; }, 0);
    var gap = Math.min(22, (avail - total) / (items.length - 1));
    var x = LOGO_X0 + (avail - total - gap * (items.length - 1)) / 2, out = [];
    items.forEach(function (it, i) { it.x = x; out.push(it); x += it.w; if (i < items.length - 1) { out.push({ sep: x + gap / 2 - 0.14 }); x += gap; } });
    return out;
  }

  /* GeoJSON (lon/lat) -> caminho SVG em mm, relativo ao canto do mapa */
  function caminho(geom) {
    if (!geom) return '';
    var polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
    var d = [];
    polys.forEach(function (poly) {
      poly.forEach(function (ring) {
        ring.forEach(function (c, i) {
          d.push((i ? 'L' : 'M') + f2((c[0] - MAP.xmin) * K) + ' ' + f2((MAP.ymax - c[1]) * K));
        });
        d.push('Z');
      });
    });
    return d.join('');
  }

  /* ===================== mapas base (os mesmos da Previsão) =====================
     Carregados ao vivo a cada sessão; a imagem é montada no navegador e reprojetada de Web Mercator para
     latitude/longitude. Não é guardada (os servidores não permitem uso offline). */
  var OSM_Z = 8, OSM_W = 3400;
  function sub(x, y) { return 'abc'[(x + y) % 3]; }
  var FUNDOS = [
    { id: 'osm', nome: 'OpenStreetMap — padrão', curto: 'OpenStreetMap padrão', amarelo: true,
      url: function (z, x, y) { return 'https://tile.openstreetmap.org/' + z + '/' + x + '/' + y + '.png'; }, credito: '© OpenStreetMap — estilo padrão' },
    { id: 'osmfr', nome: 'OpenStreetMap França (reserva 1)', curto: 'OpenStreetMap França',
      url: function (z, x, y) { return 'https://' + sub(x, y) + '.tile.openstreetmap.fr/osmfr/' + z + '/' + x + '/' + y + '.png'; }, credito: '© OpenStreetMap — estilo OSM França' },
    { id: 'osmde', nome: 'OpenStreetMap Alemanha (reserva 2)', curto: 'OpenStreetMap Alemanha',
      url: function (z, x, y) { return 'https://tile.openstreetmap.de/' + z + '/' + x + '/' + y + '.png'; }, credito: '© OpenStreetMap — estilo OSM Alemanha' },
    { id: 'ofm', nome: 'OpenFreeMap — sem nomes', curto: 'OpenFreeMap (sem nomes)', reserva: false, vector: true,
      style: 'https://tiles.openfreemap.org/styles/liberty', credito: '© OpenStreetMap © OpenMapTiles — estilo OpenFreeMap' }
  ];
  FUNDOS.forEach(function (F) { F.src = null; F.promise = null; });
  function fundoPorId(id) { for (var i = 0; i < FUNDOS.length; i++) if (FUNDOS[i].id === id) return FUNDOS[i]; return null; }
  function ext() { return { w: MAP.xmin, e: MAP.xmax, s: MAP.ymin, n: MAP.ymax }; }
  var semEndereco = function () { return location.protocol === 'file:' && !window.__OSM_TESTE; };
  var noClaude = function () { return !!(window.claude && typeof window.claude.use === 'function') && !window.__OSM_TESTE; };

  function rasterLoad(F) {
    var n = Math.pow(2, OSM_Z), T = 256, ex = ext();
    var lx = function (lon) { return (lon + 180) / 360 * n * T; };
    var my = function (lat) { var r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n * T; };
    var x0 = Math.floor(lx(ex.w) / T), x1 = Math.floor(lx(ex.e) / T), y0 = Math.floor(my(ex.n) / T), y1 = Math.floor(my(ex.s) / T);
    var st = document.createElement('canvas'); st.width = (x1 - x0 + 1) * T; st.height = (y1 - y0 + 1) * T;
    var g = st.getContext('2d'), jobs = [], i = 0, falhas = 0, bloqueado = false, estourou = false, t0 = Date.now();
    for (var x = x0; x <= x1; x++) for (var y = y0; y <= y1; y++) jobs.push([x, y]);
    var tc = document.createElement('canvas'); tc.width = tc.height = 64; var tg = tc.getContext('2d', { willReadFrequently: true });
    function ehBloqueio(bm) {   // imagem amarela e preta "Access blocked" do servidor do OSM
      tg.clearRect(0, 0, 64, 64); tg.drawImage(bm, 0, 0, 64, 64); var d = tg.getImageData(0, 0, 64, 64).data, am = 0;
      for (var k = 0; k < d.length; k += 4) if (d[k] > 220 && d[k + 1] > 190 && d[k + 2] < 70) am++; return am > 64 * 64 * 0.02;
    }
    function work() {
      if (i >= jobs.length || bloqueado || estourou) return Promise.resolve();
      if (Date.now() - t0 > 30000) { estourou = true; return Promise.resolve(); }
      var j = jobs[i++], ac = typeof AbortController === 'function' ? new AbortController() : null, tm = ac && setTimeout(function () { ac.abort(); }, 10000);
      return fetch(F.url(OSM_Z, j[0], j[1]), { mode: 'cors', credentials: 'omit', signal: ac ? ac.signal : undefined })
        .then(function (r) { clearTimeout(tm); if (r.status === 403 || r.status === 429) { bloqueado = true; return null; } if (!r.ok) throw new Error(r.status); return r.blob(); })
        .then(function (b) { return b ? createImageBitmap(b) : null; })
        .then(function (bm) { if (!bm) return; if (F.amarelo && ehBloqueio(bm)) { bloqueado = true; return; } g.drawImage(bm, (j[0] - x0) * T, (j[1] - y0) * T); })
        .catch(function () { clearTimeout(tm); falhas++; })
        .then(function () { if (falhas > jobs.length * 0.2) return; return work(); });
    }
    return Promise.all([work(), work(), work(), work()]).then(function () {
      if (bloqueado) throw new Error('bloqueado');
      if (estourou || falhas > jobs.length * 0.2) throw new Error('tiles');
      var W = OSM_W, H = Math.round(OSM_W * (ex.n - ex.s) / (ex.e - ex.w));
      var out = document.createElement('canvas'); out.width = W; out.height = H;
      var o = out.getContext('2d'); o.imageSmoothingQuality = 'high';
      var sx = lx(ex.w) - x0 * T, sw = lx(ex.e) - lx(ex.w);
      for (var r = 0; r < H; r++) { var lat = ex.n - (r + 0.5) / H * (ex.n - ex.s); o.drawImage(st, sx, my(lat) - y0 * T - 0.5, sw, 1, 0, r, W, 1); }
      return out.toDataURL('image/jpeg', 0.92);
    });
  }
  var mlPromise = null;
  function loadMapLibre() {
    if (window.maplibregl) return Promise.resolve(window.maplibregl);
    if (mlPromise) return mlPromise;
    var base = window.BASE_DADOS || (SCRIPT_SRC ? SCRIPT_SRC.replace(/assets\/layout-mapa\.js.*$/, '') : '');
    if (!base) return Promise.reject(new Error('sem-lib'));
    mlPromise = new Promise(function (res, rej) {
      var sc = document.createElement('script'); sc.src = base + 'previsao/lib/maplibre-gl.js';
      sc.onload = function () { window.maplibregl ? res(window.maplibregl) : rej(new Error('lib')); };
      sc.onerror = function () { mlPromise = null; rej(new Error('lib')); };
      document.head.appendChild(sc);
    });
    return mlPromise;
  }
  function vectorLoad(F) {   // estilo vetorial sem nenhuma camada de texto, desenhado fora da tela
    var ex = ext(), W = OSM_W, world = W * 360 / (ex.e - ex.w);
    var my = function (lat) { var r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * world; };
    var Hm = Math.round(my(ex.s) - my(ex.n)), div = null, map = null;
    return loadMapLibre().then(function (ml) {
      return fetch(F.style, { mode: 'cors', credentials: 'omit' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (style) {
        style.layers = (style.layers || []).filter(function (l) { return l.type !== 'symbol'; });
        div = document.createElement('div');
        div.style.cssText = 'position:fixed;left:-' + (W + 50) + 'px;top:0;width:' + W + 'px;height:' + Hm + 'px;pointer-events:none';
        document.body.appendChild(div);
        var erros = 0;
        map = new ml.Map({ container: div, style: style, interactive: false, attributionControl: false, preserveDrawingBuffer: true,
          pixelRatio: 1, fadeDuration: 0, bounds: [[ex.w, ex.s], [ex.e, ex.n]], fitBoundsOptions: { padding: 0 } });
        return new Promise(function (res, rej) {
          var t = setTimeout(function () { rej(new Error('tempo')); }, 45000);
          map.on('error', function () { if (++erros > 40) { clearTimeout(t); rej(new Error('tiles')); } });
          map.once('idle', function () { clearTimeout(t); res(); });
        });
      }).then(function () {
        var cv = map.getCanvas(), H = Math.round(W * (ex.n - ex.s) / (ex.e - ex.w));
        try { F.srcMerc = cv.toDataURL('image/jpeg', 0.9); } catch (e) {}   // versão em Web Mercator, para o editor (Leaflet)
        var out = document.createElement('canvas'); out.width = W; out.height = H;
        var o = out.getContext('2d'); o.imageSmoothingQuality = 'high';
        var sy = cv.height / Hm, y0 = my(ex.n);
        for (var r = 0; r < H; r++) { var lat = ex.n - (r + 0.5) / H * (ex.n - ex.s); o.drawImage(cv, 0, (my(lat) - y0) * sy - 0.5, cv.width, 1, 0, r, W, 1); }
        return out.toDataURL('image/jpeg', 0.92);
      });
    }).then(function (src) { cleanup(); return src; }, function (e) { cleanup(); throw e; });
    function cleanup() { try { map && map.remove(); } catch (e) {} if (div) div.remove(); }
  }
  function carregarUm(F) {
    if (F.src) return Promise.resolve(F.src);
    if (!F.promise) F.promise = (F.vector ? vectorLoad(F) : rasterLoad(F)).then(function (s) { F.src = s; return s; }, function (e) { F.promise = null; throw e; });
    return F.promise;
  }
  // Carrega o mapa escolhido; se não responder, tenta as reservas (OSM padrão, França, Alemanha).
  // Resolve com {fundo, aviso} — fundo null quando nenhum carregou (o mapa sai sem fundo).
  function carregarFundo(id) {
    var F = fundoPorId(id);
    if (!F) return Promise.resolve({ fundo: null, aviso: '' });
    if (semEndereco()) return Promise.resolve({ fundo: null, aviso: 'Os mapas base da internet só carregam com a ferramenta aberta pelo painel (endereço da web). O mapa saiu sem mapa de fundo.' });
    if (noClaude()) return Promise.resolve({ fundo: null, aviso: 'Nesta pré-visualização os mapas base da internet não carregam. O mapa saiu sem mapa de fundo.' });
    var tentados = [], primeiro = F;
    function tentar(G) {
      tentados.push(G.id);
      return carregarUm(G).then(function () {
        return { fundo: G, aviso: G === primeiro ? '' : 'O mapa de fundo “' + primeiro.curto + '” não carregou; foi usado o ' + G.curto + '. Se preferir outro, troque em “Mapa de fundo”.' };
      }, function () {
        var prox = FUNDOS.filter(function (o) { return o.reserva !== false && tentados.indexOf(o.id) < 0; })[0];
        if (prox) return tentar(prox);
        return { fundo: null, aviso: 'O mapa de fundo não carregou (nenhum dos mapas da internet respondeu agora — pode ser a internet ou a rede bloqueando esses endereços). O mapa saiu sem mapa de fundo; troque o mapa em “Mapa de fundo” ou tente de novo mais tarde.' };
      });
    }
    return tentar(F);
  }

  /* ===== seletor "Mapa de fundo" ao lado do botão "Prévia do mapa" ===== */
  var LS_FUNDO = 'layoutMapa:fundo2', FUNDO_PADRAO = 'osm';   // padrão: OpenStreetMap padrão, como na Previsão
  function fundoSalvo() {
    try { var v = localStorage.getItem(LS_FUNDO); if (v != null && (v === '' || fundoPorId(v))) return v; } catch (e) {}
    return FUNDO_PADRAO;
  }
  function fundoEscolhido() {
    var sel = document.getElementById('layoutFundo');
    if (sel) return sel.value;
    try { var v = localStorage.getItem(LS_FUNDO); if (v != null && (v === '' || fundoPorId(v))) return v; } catch (e) {}
    return FUNDO_PADRAO;
  }
  function avisar(txt, erro) {
    var el = document.getElementById('layoutFundoAviso');
    if (!el) { if (txt) console.warn(txt); return; }
    el.textContent = txt || ''; el.hidden = !txt; el.style.color = erro ? '#b42318' : '';
  }
  function montarSeletor(ancora) {
    var cab = null, ref = null;
    if (ancora && ancora.nodeType === 1) { if (ancora.tagName === 'H2') cab = ancora.closest('header'); else ref = ancora; }
    else { var h = document.getElementById('hMap'); cab = h ? h.closest('header') : null; if (!cab) ref = document.getElementById('previewBtn'); }
    if ((!ref && !cab) || document.getElementById('layoutFundo')) return;
    var lab = document.createElement('label');
    lab.className = 'btn'; lab.style.cssText = 'gap:6px;cursor:default';
    lab.title = 'Mapa de fundo do mapa final (PNG e prévia). Os mapas da internet são carregados na hora.';
    var curtos = { osm: 'OSM padrão', osmfr: 'OSM França (reserva)', osmde: 'OSM Alemanha (reserva)', ofm: 'OpenFreeMap (sem nomes)' };
    var opts = [['', 'Nenhum']].concat(FUNDOS.map(function (F) { return [F.id, curtos[F.id] || F.nome]; }));
    lab.innerHTML = '<span aria-hidden="true">Fundo</span><select id="layoutFundo" aria-label="Mapa de fundo do mapa final" style="border:0;background:transparent;font:inherit;color:inherit;max-width:200px">' +
      opts.map(function (o) { return '<option value="' + o[0] + '">' + esc(o[1]) + '</option>'; }).join('') + '</select>';
    if (cab) { cab.style.display = 'flex'; cab.style.alignItems = 'flex-start'; cab.style.gap = '12px'; cab.style.flexWrap = 'wrap'; lab.style.marginLeft = 'auto'; cab.appendChild(lab); }
    else ref.parentNode.insertBefore(lab, ref);
    var sel = lab.querySelector('select');
    sel.value = fundoSalvo();
    sel.addEventListener('change', function () { try { localStorage.setItem(LS_FUNDO, sel.value); } catch (e) {} avisar('');
      try { document.dispatchEvent(new CustomEvent('layoutfundo', { detail: sel.value })); } catch (e) {} });
    var av = document.createElement('div');
    av.id = 'layoutFundoAviso'; av.hidden = true; av.setAttribute('role', 'status');
    av.style.cssText = 'flex-basis:100%;font-size:13px;margin-top:4px';
    (cab || ref.parentNode).appendChild(av);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montarSeletor); else montarSeletor();

  /* ===== a folha ===== */
  function svg(op) {
    op = op || {};
    var o = [], navy = NAVY;
    var fid = op.fundo != null ? op.fundo : fundoEscolhido(), F = op._fundo !== undefined ? op._fundo : fundoPorId(fid);
    if (F && !F.src) F = null;
    o.push('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="' + PAGE.w + 'mm" height="' + PAGE.h + 'mm" viewBox="0 0 ' + PAGE.w + ' ' + PAGE.h + '">');
    o.push('<defs><clipPath id="mapclip"><rect x="0" y="0" width="' + MAP.w + '" height="' + MAP.h + '"/></clipPath>' +
      '<clipPath id="mgclip"><path d="' + GEO.mg + '" clip-rule="evenodd"/></clipPath></defs>');
    o.push('<rect width="' + PAGE.w + '" height="' + PAGE.h + '" fill="#f7fcff"/>');

    /* ---- cabeçalho ---- */
    [[4.10221, 2.0511, 291.257, 14.9731, 4.10221], [4.30732, 2.25622, 290.847, 14.5628, 3.8971], [4.51243, 2.46133, 290.436, 14.1526, 3.69199], [4.30732, 2.66644, 290.436, 13.7424, 3.48688]]
      .forEach(function (r) { o.push('<rect x="' + r[0] + '" y="' + r[1] + '" width="' + r[2] + '" height="' + r[3] + '" rx="' + r[4] + '" fill="rgb(49,142,206)" fill-opacity=".02"/>'); });
    o.push('<rect x="4.92265" y="2.87155" width="289.616" height="13.1271" rx="3.28177" fill="#fff" stroke="rgb(135,196,239)" stroke-width="0.287155"/>');
    o.push('<svg x="250.619" y="2.87155" width="44.7141" height="13.1271" viewBox="0 0 218 64" preserveAspectRatio="none"><path d="M42 0H218V46Q218 64 202 64H0Z" fill="#006cbf"/><path d="M42 0H83L40 64H0Z" fill="#a9e0f4"/><path d="M83 0H121L78 64H40Z" fill="#078fd2"/></svg>');
    o.push('<rect x="199.778" y="5.53798" width="0.348688" height="7.58909" fill="' + navy + '"/>');
    o.push('<svg x="277.515" y="4.10221" width="12.7169" height="10.0504" viewBox="0 0 70 55"><g fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M41 10V3M55 14L60 9M59 28H67M54 40L60 45M27 10L23 5"/><path d="M30 19A14 14 0 0 1 50 36"/><path d="M12 35C12 22 29 18 35 31C47 29 54 43 46 50H12C1 50 0 38 12 35Z"/></g></svg>');
    var title = op.titulo || 'Mapa';
    o.push(textBlock({ lines: [title], x: 11.6913 + 182.343 / 2, yTop: 4.10221, h: 11.2811, size: fitSize([title], 24.4195 * PT, 182.343, 700), weight: 700, fill: navy, anchor: 'middle' }));
    var region = 'Minas Gerais';
    o.push(textBlock({ lines: [region], x: 204.905, yTop: 5.33287, h: 9.22997, size: fitSize([region], 16.8611 * PT, 46, 400), fill: navy }));

    /* ---- mapa ---- */
    o.push('<g transform="translate(' + MAP.x + ' ' + MAP.y + ')"><g clip-path="url(#mapclip)">');
    o.push('<rect width="' + MAP.w + '" height="' + MAP.h + '" fill="#ffffff"/>');
    o.push('<path d="' + GEO.states + '" fill="none" stroke="#000" stroke-width="0.22" stroke-linejoin="round"/>');
    if (F) {   // mapa base só dentro de Minas, como na Previsão
      o.push('<g clip-path="url(#mgclip)"><image href="' + F.src + '" xlink:href="' + F.src + '" x="0" y="0" width="' + f2(MAP.w) + '" height="' + f2(MAP.h) + '" preserveAspectRatio="none"/></g>');
    } else o.push('<path d="' + GEO.mg + '" fill="' + MG_FILL + '" stroke="none"/>');
    // áreas desenhadas, recortadas exatamente no contorno de MG usado no mapa
    o.push('<g clip-path="url(#mgclip)">');
    (op.areas || []).forEach(function (a) {
      var d = caminho(a.geometry); if (!d) return;
      o.push('<path d="' + d + '" fill="' + a.fill + '"' + (a.opacity != null ? ' fill-opacity="' + a.opacity + '"' : '') + ' fill-rule="evenodd" stroke="' + (a.stroke || a.fill) + '" stroke-width="' + (a.strokeWidth || 0.2) + '" stroke-linejoin="round"/>');
    });
    o.push('</g>');
    if (op.municipios) o.push('<path d="' + GEO.munLines + '" fill="none" stroke="#c9d6dc" stroke-width="0.09" stroke-linejoin="round"/>');
    o.push('<path d="' + GEO.mesoLines + '" fill="none" stroke="#000" stroke-width="0.5" stroke-linejoin="round"/>');
    o.push('<path d="' + GEO.mg + '" fill="none" stroke="#000" stroke-width="0.6" stroke-linejoin="round"/>');
    STATE_LABELS.forEach(function (s) {
      var p = proj(s[1], s[2]), fz = s[0] === 'DF' ? 2.7 : 3.2;
      o.push('<text x="' + f2(p[0] - MAP.x) + '" y="' + f2(p[1] - MAP.y + (ASC - DESC) / 2 * fz) + '" font-family="' + FONT + '" font-size="' + fz + '" font-weight="700" fill="#2f3640" text-anchor="middle" stroke="#fff" stroke-width=".5" stroke-linejoin="round" paint-order="stroke">' + esc(s[0]) + '</text>');
    });
    // cidades de referência: a MESMA marcação da Previsão (ponto branco r 0,9 mm e nome de 3,5 mm logo abaixo)
    var ns = NOME_TAM, pts = [], nomes = [], cidades = (op.cidades || []).slice();
    (op.cidadesNomes || []).forEach(function (n) {   // cidades pelo nome: posição da sede no geo.js
      for (var i = 0; i < GEO.mun.length; i++) if (GEO.mun[i][0] === n) { cidades.push({ nome: n, lat: GEO.mun[i][1], lon: GEO.mun[i][2] }); break; }
    });
    cidades.forEach(function (c) {
      if (!isFinite(c.lon) || !isFinite(c.lat)) return;
      var p = proj(c.lon, c.lat), x = p[0] - MAP.x, y = p[1] - MAP.y;
      pts.push('<circle cx="' + f2(x) + '" cy="' + f2(y) + '" r="' + PT_R + '" fill="#ffffff" stroke="#1f2328" stroke-width="0.25"/>');
      nomes.push('<text x="' + f2(x) + '" y="' + f2(y + PT_R + 0.35 + ASC * ns) + '" font-family="' + FONT + '" font-size="' + f2(ns) + '" font-weight="700" fill="' + navy + '" text-anchor="middle" stroke="#fff" stroke-width="' + f2(ns * 0.3) + '" stroke-linejoin="round" paint-order="stroke">' + esc(c.nome) + '</text>');
    });
    o.push(pts.join(''), nomes.join(''));
    o.push('</g>');
    o.push('<rect width="' + MAP.w + '" height="' + MAP.h + '" fill="none" stroke="rgb(86,123,154)" stroke-width="0.307666"/>');
    o.push('</g>');
    // grade (1,5°, fora da moldura: esquerda e base)
    var gs = 8.43053 * PT, gc = 'rgb(39,71,129)', lat, lon;
    for (lat = Math.ceil(MAP.ymin / 1.5) * 1.5; lat <= MAP.ymax; lat += 1.5) {
      var py = proj(MAP.xmin, lat)[1];
      o.push('<text transform="translate(' + f2(MAP.x - 2.46133) + ' ' + f2(py) + ') rotate(-90)" font-family="' + FONT + '" font-size="' + f2(gs) + '" fill="' + gc + '" text-anchor="middle">' + dms(lat, 'N', 'S') + '</text>');
    }
    for (lon = Math.ceil(MAP.xmin / 1.5) * 1.5; lon <= MAP.xmax; lon += 1.5) {
      var px = proj(lon, MAP.ymin)[0], lbl = dms(lon, 'E', 'W');
      if (px + textW(lbl, gs) / 2 > PAGE.w - 0.5) continue;
      o.push('<text x="' + f2(px) + '" y="' + f2(MAP.y + MAP.h + 2.46133 + ASC * gs) + '" font-family="' + FONT + '" font-size="' + f2(gs) + '" fill="' + gc + '" text-anchor="middle">' + lbl + '</text>');
    }
    // seta norte e escala gráfica
    o.push('<svg x="19.3411" y="166.3" width="7.7942" height="9.08866" viewBox="0 0 61.06 96.62">' + NORTH_ARROW + '</svg>');
    (function () {
      var seg = 8.35894, ss = 9 * PT, bx = 11.6913 + 1 + textW('0', ss) / 2, by = 184.0, ly = by - 1.6 - DESC * ss;
      o.push('<rect x="' + f2(bx) + '" y="' + by + '" width="' + seg + '" height="3" fill="#000" stroke="#000" stroke-width=".3"/>');
      o.push('<rect x="' + f2(bx + seg) + '" y="' + by + '" width="' + seg + '" height="3" fill="#fff" stroke="#000" stroke-width=".3"/>');
      [['0', 0], ['50', seg], ['100', 2 * seg]].forEach(function (t) { o.push('<text x="' + f2(bx + t[1]) + '" y="' + f2(ly) + '" font-family="' + FONT + '" font-size="' + f2(ss) + '" fill="#000" text-anchor="middle">' + t[0] + '</text>'); });
      o.push('<text x="' + f2(bx + 2 * seg + textW('100', ss) / 2 + 1) + '" y="' + f2(ly) + '" font-family="' + FONT + '" font-size="' + f2(ss) + '" fill="#000">km</text>');
    })();

    /* ---- legenda (mesma área e título da Previsão; chave de cor no lugar do ícone) ---- */
    o.push(textBlock({ lines: ['Legenda'], x: COL, yTop: 22.7706, h: 6.78946, size: 16 * PT, weight: 700, fill: navy, anchor: 'middle' }));
    o.push('<rect x="' + f2(COL - LIN_W / 2) + '" y="34.1727" width="' + LIN_W + '" height="0.266644" fill="rgb(138,187,228)"/>');
    (function () {
      var itens = op.legenda || [];
      if (!itens.length) return;
      var top = 36.6, bottom = 157.8, cx = COL, maxW = 61.5;
      var rh = Math.min(10, (bottom - top) / itens.length);
      var sw = 9, sh = Math.min(6, rh - 1.6), gap = 2.6;
      var labels = itens.map(function (i) { return i.label; });
      var fs = fitSize(labels, 10 * PT, maxW - sw - gap, 400);
      var blockW = sw + gap + Math.max.apply(null, labels.map(function (l) { return textW(l, fs); }));
      var x0 = cx - blockW / 2, tx0 = x0 + sw + gap, y = top;
      itens.forEach(function (it) {
        var cy = y + rh / 2;
        if (/^(#fff|#ffffff|white)$/i.test(it.fill || '')) {
          // "sem cor" (Sem Tempestades, Sem Previsão, Sem alerta): mostra como Minas aparece no mapa —
          // um recorte do mapa base escolhido ou o tom claro de Minas sem mapa base
          if (F) {   // só a cor base do mapa base (o "chão" do mapa dentro de Minas)
            o.push('<rect x="' + f2(x0) + '" y="' + f2(cy - sh / 2) + '" width="' + sw + '" height="' + f2(sh) + '" fill="' + (F.cor || '#f2efe9') + '" stroke="#555" stroke-width="0.2"/>');
          } else o.push('<rect x="' + f2(x0) + '" y="' + f2(cy - sh / 2) + '" width="' + sw + '" height="' + f2(sh) + '" fill="' + MG_FILL + '" stroke="#555" stroke-width="0.2"/>');
        } else
        {   // com transparência: a cor sobre o "chão" de Minas, como aparece no mapa
          if (it.opacity != null && it.opacity < 1) o.push('<rect x="' + f2(x0) + '" y="' + f2(cy - sh / 2) + '" width="' + sw + '" height="' + f2(sh) + '" fill="' + (F ? (F.cor || '#f2efe9') : MG_FILL) + '"/>');
          o.push('<rect x="' + f2(x0) + '" y="' + f2(cy - sh / 2) + '" width="' + sw + '" height="' + f2(sh) + '" fill="' + it.fill + '"' + (it.opacity != null && it.opacity < 1 ? ' fill-opacity="' + it.opacity + '"' : '') + ' stroke="#555" stroke-width="0.2"/>');
        }
        o.push('<text x="' + f2(tx0) + '" y="' + f2(cy + (ASC - DESC) / 2 * fs) + '" font-family="' + FONT + '" font-size="' + f2(fs) + '" fill="#000" stroke="#fff" stroke-width="' + f2(fs * 0.25) + '" stroke-linejoin="round" paint-order="stroke">' + esc(it.label) + '</text>');
        y += rh;
      });
    })();
    o.push('<rect x="' + f2(COL - LIN_W / 2) + '" y="159.499" width="' + LIN_W + '" height="0.256388" fill="rgb(138,187,228)"/>');
    var vt = op.textoValidade || validadeTexto(op.validade), val = vt || 'Validade não informada';
    o.push(textBlock({ lines: [val], x: COL, yTop: 160.906, h: 8.28892, size: fitSize([val], 10 * PT, 67.7, 400), fill: vt ? navy : '#8a97a8', anchor: 'middle' }));
    o.push('<rect x="' + f2(COL - LIN_W / 2) + '" y="170.345" width="' + LIN_W + '" height="0.256388" fill="rgb(138,187,228)"/>');
    var cred = [op.credito || 'SIMGE/IGAM'].concat(CREDITOS_FIXOS);
    if (F) cred.push('Mapa base: ' + F.credito);   // mesmo formato de crédito da Previsão
    o.push(textBlock({ lines: cred, x: COL, yTop: 172.909, h: 13.3322, size: fitSize(cred, 6.68628 * PT, 62, 400), fill: navy, anchor: 'middle' }));

    /* ---- rodapé ---- */
    [[4.30732, 194.2, 289.001, 14.3, 3.28177], [4.51243, 194.4, 288.59, 13.9, 3.07666], [4.71754, 194.6, 288.18, 13.5, 2.87155]]
      .forEach(function (r) { o.push('<rect x="' + r[0] + '" y="' + r[1] + '" width="' + r[2] + '" height="' + r[3] + '" rx="' + r[4] + '" fill="rgb(57,152,207)" fill-opacity=".02"/>'); });
    o.push('<rect x="4.92265" y="194.8" width="287.77" height="13.1" rx="2.46133" fill="rgb(249,252,255)" stroke="rgb(135,196,239)" stroke-width="0.307666"/>');
    logoLayout().forEach(function (it) {
      if (it.sep != null) { o.push('<rect x="' + f2(it.sep) + '" y="197.4" width="0.276899" height="7.9" fill="rgb(32,153,234)"/>'); return; }
      if (!it.L) return;
      var cy = LOGO_Y + LOGO_H / 2;
      o.push('<image href="' + it.L.src + '" xlink:href="' + it.L.src + '" x="' + f2(it.x) + '" y="' + f2(cy - it.h / 2) + '" width="' + f2(it.w) + '" height="' + f2(it.h) + '"/>');
    });
    var ft = wrapFit(RODAPE, 90.5, 11.5, 8.5 * PT, 5.5 * PT, 400);
    o.push(textBlock({ lines: ft.lines, x: 200.624, yTop: 195.6, h: 11.5, size: ft.size, fill: navy }));
    o.push('</svg>');
    return o.join('');
  }

  // carrega o mapa de fundo escolhido (se houver) antes de desenhar; avisa no seletor se trocou ou falhou
  function corBase(F) {
    if (!F || !F.src) return Promise.resolve(null);
    if (F.cor) return Promise.resolve(F.cor);
    return new Promise(function (res) {
      var img = new Image();
      img.onload = function () {
        try {
          var ex = ext(), W = img.width, H = img.height, c = document.createElement('canvas'); c.width = 160; c.height = 110;
          var g = c.getContext('2d', { willReadFrequently: true });
          var x0 = (-47.5 - ex.w) / (ex.e - ex.w) * W, y0 = (ex.n + 16.5) / (ex.n - ex.s) * H, x1 = (-42.0 - ex.w) / (ex.e - ex.w) * W, y1 = (ex.n + 21.0) / (ex.n - ex.s) * H;
          g.drawImage(img, x0, y0, x1 - x0, y1 - y0, 0, 0, 160, 110);
          var d = g.getImageData(0, 0, 160, 110).data, cont = {}, best = null, bn = 0;
          for (var i = 0; i < d.length; i += 4) { var k = (d[i] >> 2) + ',' + (d[i + 1] >> 2) + ',' + (d[i + 2] >> 2); var nk = (cont[k] || 0) + 1; cont[k] = nk; if (nk > bn) { bn = nk; best = k; } }
          var q = best.split(',').map(function (v) { return Math.min(255, (+v << 2) + 2); });
          F.cor = '#' + q.map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join('');
        } catch (e) { F.cor = null; }
        res(F.cor);
      };
      img.onerror = function () { res(null); }; img.src = F.src;
    });
  }
  function comFundo(op) {
    op = op || {};
    var fid = op.fundo != null ? op.fundo : fundoEscolhido();
    if (!fid) { avisar(''); return Promise.resolve(Object.assign({}, op, { _fundo: null })); }
    avisar('Carregando o mapa de fundo…');
    return carregarFundo(fid).then(function (r) {
      avisar(r.aviso, !r.fundo);
      return corBase(r.fundo).then(function () { return Object.assign({}, op, { _fundo: r.fundo }); });
    });
  }

  /* ===== PNG 300 dpi (mesmo processo da Previsão) ===== */
  function canvas(op, dpi) {
    dpi = dpi || 300;
    return comFundo(op).then(function (op2) {
      return new Promise(function (res, rej) {
        var W = Math.round(PAGE.w / 25.4 * dpi), H = Math.round(PAGE.h / 25.4 * dpi);
        var texto = svg(op2).replace('width="' + PAGE.w + 'mm" height="' + PAGE.h + 'mm"', 'width="' + W + '" height="' + H + '"');
        var img = new Image();
        img.onload = function () {
          var c = document.createElement('canvas'); c.width = W; c.height = H;
          var g = c.getContext('2d'); g.fillStyle = '#f7fcff'; g.fillRect(0, 0, W, H); g.drawImage(img, 0, 0, W, H); res(c);
        };
        img.onerror = function () { rej(new Error('O navegador não conseguiu desenhar o mapa.')); };
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(texto);
      });
    });
  }
  function crc32(buf) { var c, crc = 0xFFFFFFFF; for (var n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xFF; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xFFFFFFFF) >>> 0; }
  function comDpi(blob, dpi) {
    return blob.arrayBuffer().then(function (ab) {
      var src = new Uint8Array(ab), ppm = Math.round(dpi / 0.0254);
      var chunk = new Uint8Array(21), dv = new DataView(chunk.buffer);
      dv.setUint32(0, 9); chunk.set([0x70, 0x48, 0x59, 0x73], 4); dv.setUint32(8, ppm); dv.setUint32(12, ppm); chunk[16] = 1;
      dv.setUint32(17, crc32(chunk.subarray(4, 17)));
      var at = 33, out = new Uint8Array(src.length + 21);
      out.set(src.subarray(0, at)); out.set(chunk, at); out.set(src.subarray(at), at + 21);
      return new Blob([out], { type: 'image/png' });
    });
  }
  function png(op) {
    return canvas(op, 300).then(function (c) {
      return new Promise(function (r) { c.toBlob(r, 'image/png'); });
    }).then(function (b) { return comDpi(b, 300); });
  }

  /* ===== prévia na tela ===== */
  function previa(op) {
    var m = document.getElementById('layoutMapaPrevia');
    if (!m) {
      m = document.createElement('div');
      m.id = 'layoutMapaPrevia';
      m.setAttribute('role', 'dialog');
      m.setAttribute('aria-label', 'Prévia do mapa final');
      m.style.cssText = 'position:fixed;inset:0;z-index:99990;background:rgba(9,43,106,.45);display:flex;align-items:center;justify-content:center;padding:16px';
      m.innerHTML = '<div style="background:#fff;border-radius:12px;padding:14px;width:min(1200px,96vw);max-height:94vh;overflow:auto;box-shadow:0 12px 40px rgba(0,0,0,.3)">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font:600 15px Barlow,Arial,sans-serif;color:#092b6a">' +
        '<span style="flex:1" data-titulo>Prévia do mapa final (297 × 210 mm · PNG 3508 × 2480 px)</span>' +
        '<button type="button" data-fechar style="border:1px solid #c9d8ea;background:#fff;border-radius:8px;padding:5px 12px;font:600 13px Barlow,Arial,sans-serif;color:#092b6a;cursor:pointer">Fechar</button></div>' +
        '<div data-aviso style="display:none;font:500 13px Barlow,Arial,sans-serif;color:#b42318;margin-bottom:8px"></div>' +
        '<div data-folha style="line-height:0"></div></div>';
      m.addEventListener('click', function (e) { if (e.target === m || e.target.hasAttribute('data-fechar')) m.style.display = 'none'; });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') m.style.display = 'none'; });
      document.body.appendChild(m);
    }
    var folha = m.querySelector('[data-folha]'), aviso = m.querySelector('[data-aviso]');
    function mostrar(op2) {
      folha.innerHTML = svg(op2);
      var s = folha.querySelector('svg'); s.setAttribute('width', '100%'); s.removeAttribute('height');
      var t = (document.getElementById('layoutFundoAviso') || {}).textContent || '';
      aviso.textContent = t && t.indexOf('Carregando') < 0 ? t : ''; aviso.style.display = aviso.textContent ? 'block' : 'none';
    }
    mostrar(Object.assign({}, op || {}, { _fundo: null }));   // abre na hora; o mapa de fundo entra quando carregar
    m.style.display = 'flex';
    return comFundo(op).then(mostrar);
  }

  /* ===== mapa base também no editor (Leaflet) do Tempo Severo e da Chuva =====
     Usa o mesmo seletor "Fundo". Os mapas do OSM entram como camada de blocos; o OpenFreeMap, como imagem.
     Fora de Minas fica uma máscara clara, como na Previsão (o fundo aparece só dentro do estado). */
  var TILES = { osm: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', osmfr: 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', osmde: 'https://tile.openstreetmap.de/{z}/{x}/{y}.png' };
  function fundoNoEditor(map, opts) {
    opts = opts || {};
    var L = window.L; if (!L || !map) return;
    if (!map.getPane('lmFundo')) { map.createPane('lmFundo'); map.getPane('lmFundo').style.zIndex = 250; map.getPane('lmFundo').style.pointerEvents = 'none'; }
    if (!map.getPane('lmMascara')) { map.createPane('lmMascara'); map.getPane('lmMascara').style.zIndex = 260; map.getPane('lmMascara').style.pointerEvents = 'none'; }
    var camada = null, mascara = null, mgFundo = null, pedido = 0;
    if (opts.mg && opts.mg.geometry) {
      var g = opts.mg.geometry, polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
      var aneis = [[[-89, -179], [-89, 179], [89, 179], [89, -179]]], mgAneis = [];
      polys.forEach(function (poly) { var r = poly[0].map(function (c) { return [c[1], c[0]]; }); aneis.push(r); mgAneis.push(r); });
      // fora de Minas: branco, como no mapa final; Minas sem mapa base: o tom claro da Previsão
      mascara = L.polygon(aneis, { pane: 'lmMascara', stroke: false, fillColor: opts.corFora || '#ffffff', fillOpacity: 1, interactive: false }).addTo(map);
      mgFundo = L.polygon(mgAneis, { pane: 'lmFundo', stroke: false, fillColor: MG_FILL, fillOpacity: 1, interactive: false });
    }
    function aplicar(id) {
      var n = ++pedido;
      if (camada) { map.removeLayer(camada); camada = null; }
      if (mgFundo) { if (id && !semEndereco() && !noClaude()) map.removeLayer(mgFundo); else mgFundo.addTo(map); }
      if (opts.aoMudar) opts.aoMudar(!!id);
      if (!id) return;
      if (semEndereco() || noClaude()) return;
      if (TILES[id]) {
        camada = L.tileLayer(TILES[id], { pane: 'lmFundo', subdomains: 'abc', maxZoom: 19, crossOrigin: true }).addTo(map);
        return;
      }
      var F = fundoPorId(id);
      if (F && F.vector) carregarUm(F).then(function () {
        if (n !== pedido || !F.srcMerc) return;
        var ex = ext();
        camada = L.imageOverlay(F.srcMerc, [[ex.s, ex.w], [ex.n, ex.e]], { pane: 'lmFundo', interactive: false }).addTo(map);
      }, function () { if (n === pedido) avisar('O mapa de fundo “' + F.curto + '” não carregou agora. Troque em “Fundo” ou tente mais tarde.', true); });
    }
    document.addEventListener('layoutfundo', function (e) { aplicar(e.detail || ''); });
    aplicar(fundoEscolhido());
  }

  /* ===== extras do editor (Leaflet): primeiro ponto do desenho destacado, botão de centralizar Minas,
     estados vizinhos com a sigla da UF (como na Previsão) e ajuste de tamanho automático ===== */
  function editorExtras(map, opts) {
    opts = opts || {};
    var L = window.L; if (!L || !map) return;
    var css = document.createElement('style');
    css.textContent = '.leaflet-editing-icon.lm-primeiro{background:#e11d48!important;border:2px solid #7f1d1d!important;border-radius:50%}' +
      '.lm-uf{color:#2f3640;font:700 13px Arial,"Liberation Sans",Helvetica,sans-serif;text-shadow:1px 1px 0 #fff,-1px -1px 0 #fff,1px -1px 0 #fff,-1px 1px 0 #fff;white-space:nowrap;text-align:center;line-height:16px;pointer-events:none}' +
      '.lm-centro a{display:flex!important;align-items:center;justify-content:center;width:30px;height:30px;color:#092b6a}';
    document.head.appendChild(css);
    // primeiro ponto do polígono em vermelho: é nele que se clica para fechar o desenho
    // prévia da borda suave enquanto desenha (inclui a posição do mouse), antes de fechar o polígono
    var verts = [], desenhando = false, previa = null;
    function limparPrevia() { if (previa) { map.removeLayer(previa); previa = null; } }
    function mostrarPrevia(cursor) {
      if (!opts.suavizarAnel) return;
      var pts = verts.map(function (v) { return [v.lng, v.lat]; });
      if (cursor) pts.push([cursor.lng, cursor.lat]);
      if (pts.length < 3) { limparPrevia(); return; }
      var anel = opts.suavizarAnel(pts.concat([pts[0]]), 10).map(function (c) { return [c[1], c[0]]; });
      var cor = (opts.corDesenho && opts.corDesenho()) || '#0b57c8';
      if (!previa) previa = L.polygon(anel, { interactive: false, color: cor, weight: 2, dashArray: '5 4', fillColor: cor, fillOpacity: 0.18 }).addTo(map);
      else { previa.setLatLngs(anel); previa.setStyle({ color: cor, fillColor: cor }); }
    }
    map.on('draw:drawstart', function () { verts = []; desenhando = true; limparPrevia(); });
    map.on('draw:drawstop draw:created', function () { desenhando = false; verts = []; limparPrevia(); });
    map.on('mousemove', function (e) { if (desenhando && verts.length) mostrarPrevia(e.latlng); });
    map.on('draw:drawvertex', function (e) {
      var ms = e.layers && e.layers.getLayers ? e.layers.getLayers() : [];
      ms.forEach(function (m, i) { if (m._icon) m._icon.classList.toggle('lm-primeiro', i === 0); });
      verts = ms.map(function (m) { return m.getLatLng(); });
      mostrarPrevia(null);
    });
    // centralizar Minas
    var limites = null;
    if (opts.mg) try { limites = L.geoJSON(opts.mg).getBounds(); } catch (e) {}
    function centralizar() { if (limites) map.fitBounds(limites, { padding: [18, 18] }); }
    var Centro = L.Control.extend({ options: { position: 'topleft' }, onAdd: function () {
      var d = L.DomUtil.create('div', 'leaflet-bar lm-centro'), a2 = L.DomUtil.create('a', '', d);
      a2.href = '#'; a2.title = 'Centralizar Minas Gerais'; a2.setAttribute('role', 'button'); a2.setAttribute('aria-label', 'Centralizar Minas Gerais');
      a2.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3"/></svg>';
      L.DomEvent.on(a2, 'click', function (ev) { L.DomEvent.stop(ev); centralizar(); });
      L.DomEvent.disableClickPropagation(d);
      return d;
    } });
    new Centro().addTo(map);
    // o mapa acompanha o tamanho do painel e volta a enquadrar Minas
    var cont = map.getContainer(), ultimo = '';
    if (window.ResizeObserver) new ResizeObserver(function () {
      var k = cont.clientWidth + 'x' + cont.clientHeight; if (k === ultimo) return; ultimo = k;
      map.invalidateSize(); centralizar();
    }).observe(cont);
    // estados vizinhos (linha preta fina) e siglas das UF, como na Previsão
    if (!map.getPane('lmEstados')) { map.createPane('lmEstados'); map.getPane('lmEstados').style.zIndex = 270; map.getPane('lmEstados').style.pointerEvents = 'none'; }
    if (opts.estados && opts.desenharEstados !== false) {
      L.geoJSON(opts.estados, { pane: 'lmEstados', interactive: false,
        filter: function (f) { return (f.properties || {}).UF !== 'MG'; },
        style: { color: '#000', weight: 0.8, fill: false } }).addTo(map);
    }
    STATE_LABELS.forEach(function (s) {
      L.marker([s[2], s[1]], { pane: 'lmEstados', interactive: false, keyboard: false,
        icon: L.divIcon({ className: 'lm-uf', html: s[0], iconSize: [30, 16], iconAnchor: [15, 8] }) }).addTo(map);
    });
    setTimeout(centralizar, 50);
  }
  // amostra do mapa base (para a legenda da tela): recorte em volta de Belo Horizonte
  function amostraFundo(id) {   // cor base do mapa base (para a legenda da tela)
    if (!id) return Promise.resolve(null);
    return carregarFundo(id).then(function (r) { return r.fundo ? corBase(r.fundo) : null; });
  }


  /* ===== painel "Mapa final" na tela (atualiza sozinho, como a folha da Previsão) ===== */
  // assinatura(): texto barato que muda quando o desenho/datas mudam. Só então o mapa é recalculado
  // (o recorte pelas divisas de Minas é pesado), com uma pequena espera, e só se o painel estiver à vista.
  function painelAoVivo(ancora, getOp, titulo, assinatura) {
    if (!ancora || document.getElementById('lmPainel')) return;
    var sec = document.createElement('section');
    sec.className = ancora.className || 'panel'; sec.id = 'lmPainel';
    sec.style.cssText = 'grid-column:1/-1';
    sec.innerHTML = '<header style="padding:14px 18px 6px"><h2 style="margin:0;font-size:17px">' + esc(titulo || 'Mapa final') + '</h2>' +
      '<p class="lede" style="margin:4px 0 0">Layout de impressão (297 × 210 mm), igual ao da Previsão diária. Atualiza sozinho; o PNG sai assim.</p></header>' +
      '<div data-folha style="padding:6px 18px 18px;line-height:0"></div>';
    ancora.parentNode.insertBefore(sec, ancora.nextSibling);
    var folha = sec.querySelector('[data-folha]'), feita = null, vista = true, ocupado = false, timer = 0;
    function marca() { var s = ''; try { s = assinatura ? assinatura() : JSON.stringify(getOp()); } catch (e) {} return s + '#' + fundoEscolhido(); }
    function desenhar() {
      if (ocupado || document.hidden || !vista) return;
      var m = marca(); if (m === feita) return;
      var op; try { op = getOp(); } catch (e) { return; }
      feita = m; ocupado = true;
      comFundo(op).then(function (op2) {
        folha.innerHTML = svg(op2);
        var s = folha.querySelector('svg'); s.setAttribute('width', '100%'); s.removeAttribute('height');
        s.style.cssText = 'border-radius:6px;box-shadow:0 1px 2px rgba(9,43,106,.12),0 8px 24px rgba(9,43,106,.10)';
      }).catch(function () {}).then(function () { ocupado = false; });
    }
    function agendar() { clearTimeout(timer); timer = setTimeout(desenhar, 500); }
    if (window.IntersectionObserver) new IntersectionObserver(function (es) { vista = es.some(function (e) { return e.isIntersecting; }); if (vista) agendar(); }, { rootMargin: '200px' }).observe(sec);
    document.addEventListener('layoutfundo', function () { feita = null; agendar(); });
    var ultima = '';
    setInterval(function () { if (document.hidden || !vista || ocupado) return; var m = marca(); if (m !== ultima) { ultima = m; agendar(); } }, 800);
    agendar();
  }

  window.LayoutMapa = { svg: svg, png: png, previa: previa, canvas: canvas, validadeTexto: validadeTexto, fmtDateBR: fmtDateBR,
    fundos: FUNDOS.map(function (F) { return { id: F.id, nome: F.nome }; }), carregarFundo: carregarFundo, PAGE: PAGE,
    montarSeletor: montarSeletor, fundoEscolhido: fundoEscolhido, extensao: ext, fundoNoEditor: fundoNoEditor, painelAoVivo: painelAoVivo,
    editorExtras: editorExtras, amostraFundo: amostraFundo, MG_FILL: MG_FILL, STATE_LABELS: STATE_LABELS,
    PT_R: PT_R, NOME_TAM: NOME_TAM };
})();
