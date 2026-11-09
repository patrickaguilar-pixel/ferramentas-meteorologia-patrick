/*
 * Pincel — desenho à mão livre das áreas (v1, 09/11/2026, Patrick/Claude). Tempo Severo e Chuva/Tendência.
 *
 * Ao lado de "Desenhar área" (clicar ponto a ponto, duplo clique para fechar) entra o botão "Pincel":
 * com ele ligado, é só SEGURAR o botão do mouse (ou o dedo/caneta) e contornar a área; ao SOLTAR, a área fecha.
 * O pincel continua ligado para a próxima área até clicar de novo nele, apertar Esc ou escolher "Desenhar área".
 *
 * A área criada passa pelo mesmo caminho do desenho por cliques (evento L.Draw.Event.CREATED do Leaflet.draw):
 * recorte em Minas, nível escolhido, Ctrl+Z, edição e cálculo das microrregiões não mudam.
 * O traço é simplificado (pontos a ~2 px) e, se cruzar sobre ele mesmo, é desfeito em partes e unido (Turf).
 */
(function () {
  'use strict';
  if (window.Pincel) return;

  var IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18.4 2.6a2 2 0 0 1 2.9 2.9L11 15.8l-3.6.7.7-3.6z"/><path d="M7.4 16.5c-2.2 0-3.4 1.4-3.4 3.4 0 .9-.6 1.5-1.5 1.6 4.7.7 6.9-1.2 6.9-3.7"/></svg>';

  function ligar(o) {
    var map = o.map, el = map.getContainer(), btnDesenho = document.getElementById(o.botaoDesenho || 'drawBtn');
    if (!btnDesenho || document.getElementById('pincelBtn')) return null;

    var b = document.createElement('button');
    b.type = 'button'; b.id = 'pincelBtn'; b.className = 'btn small';
    b.innerHTML = IC + 'Pincel'; b.title = 'Pincel: segure o botão do mouse e contorne a área; solte para fechar.';
    b.setAttribute('aria-pressed', 'false');
    b.style.display = 'inline-flex'; b.style.alignItems = 'center'; b.style.gap = '6px';
    var sv = b.querySelector('svg'); sv.style.width = '15px'; sv.style.height = '15px';
    btnDesenho.insertAdjacentElement('afterend', b);
    var css = document.createElement('style');
    css.textContent = '#pincelBtn[aria-pressed="true"]{background:var(--azure,#006cbf);border-color:var(--azure,#006cbf);color:#fff}' +
      '.pincel-on,.pincel-on .leaflet-interactive{cursor:crosshair!important}';
    document.head.appendChild(css);

    var ativo = false, traco = null, pts = [], ultimo = null, idPonteiro = null, eraDrag = false, eraDbl = false;

    function status(t) { if (o.status) o.status(t); }
    function ligarModo() {
      if (ativo) return;
      if (o.antes) o.antes();                       // ex.: desliga o desenho por cliques, se estiver ativo
      ativo = true; b.setAttribute('aria-pressed', 'true');
      eraDrag = map.dragging.enabled(); eraDbl = map.doubleClickZoom.enabled();
      map.dragging.disable(); map.doubleClickZoom.disable();
      el.classList.add('pincel-on'); el.style.touchAction = 'none';
      status('Pincel ligado (' + o.nivel() + '): segure o botão do mouse e contorne a área; solte para fechar. Esc ou clique em "Pincel" para sair.');
    }
    function desligar(msg) {
      if (!ativo) return;
      cancelarTraco();
      ativo = false; b.setAttribute('aria-pressed', 'false');
      if (eraDrag) map.dragging.enable(); if (eraDbl) map.doubleClickZoom.enable();
      el.classList.remove('pincel-on'); el.style.touchAction = '';
      if (msg !== false) status(msg || 'Pincel desligado.');
    }
    function cancelarTraco() {
      if (traco) { map.removeLayer(traco); traco = null; }
      pts = []; ultimo = null; idPonteiro = null;
    }
    b.addEventListener('click', function () { if (ativo) desligar(); else ligarModo(); });
    btnDesenho.addEventListener('click', function () { desligar(false); });   // "Desenhar área" (cliques) desliga o pincel

    function noMapa(ev) { var r = el.getBoundingClientRect(); return L.point(ev.clientX - r.left, ev.clientY - r.top); }
    function dentroDoMapa(ev) {   // não começa traço em cima dos controles (zoom, barras, legendas)
      var t = ev.target;
      return el.contains(t) && !(t.closest && t.closest('.leaflet-control, .leaflet-bar, button, a, input, select, label, .ea-barra, .ed-barra'));
    }
    el.addEventListener('pointerdown', function (ev) {
      if (!ativo || ev.button !== 0 || !dentroDoMapa(ev)) return;
      ev.preventDefault(); ev.stopPropagation();
      cancelarTraco();
      idPonteiro = ev.pointerId;
      try { el.setPointerCapture(ev.pointerId); } catch (e) { }
      var p = noMapa(ev); ultimo = p; pts = [p];
      traco = L.polyline([map.containerPointToLatLng(p)], Object.assign({}, o.estilo(), { fill: false, weight: 2.5, dashArray: null, interactive: false })).addTo(map);
    }, true);
    el.addEventListener('pointermove', function (ev) {
      if (!ativo || !traco || ev.pointerId !== idPonteiro) return;
      ev.preventDefault();
      var p = noMapa(ev);
      if (p.distanceTo(ultimo) < 3) return;         // um ponto a cada ~3 px
      ultimo = p; pts.push(p); traco.addLatLng(map.containerPointToLatLng(p));
    }, true);
    function fim(ev) {
      if (!ativo || !traco || ev.pointerId !== idPonteiro) return;
      ev.preventDefault(); ev.stopPropagation();
      try { el.releasePointerCapture(ev.pointerId); } catch (e) { }
      var cp = L.LineUtil.simplify(pts, 1.5);
      cancelarTraco();
      // o "click" que vem depois de soltar não pode abrir a edição de uma área que esteja embaixo
      var engole = function (e) { e.stopPropagation(); e.preventDefault(); };
      el.addEventListener('click', engole, true); setTimeout(function () { el.removeEventListener('click', engole, true); }, 350);
      var caixa = L.bounds(cp);
      if (cp.length < 3 || !caixa.isValid() || (caixa.getSize().x < 8 && caixa.getSize().y < 8)) { status('Traço muito curto: segure o botão e contorne a área.'); return; }
      criar(cp.map(function (p) { return map.containerPointToLatLng(p); }));
    }
    el.addEventListener('pointerup', fim, true);
    el.addEventListener('pointercancel', function (ev) { if (ev.pointerId === idPonteiro) cancelarTraco(); }, true);
    document.addEventListener('keydown', function (e) { if (ativo && e.key === 'Escape') { e.preventDefault(); desligar(); } });

    function criar(lls) {
      // sem vértices repetidos (o Turf recusa) e sem repetir o 1º ponto antes de fechar
      var visto = {}, anel = [];
      lls.forEach(function (ll) { var c = [ll.lng, ll.lat], k = c[0].toFixed(7) + ',' + c[1].toFixed(7); if (!visto[k]) { visto[k] = 1; anel.push(c); } });
      if (anel.length < 3) { status('Traço muito curto: segure o botão e contorne a área.'); return; }
      anel.push(anel[0]);
      var geo = { type: 'Polygon', coordinates: [anel] };
      try {   // traço que cruza sobre ele mesmo: desfaz em partes e une (senão o recorte em Minas falha)
        var T = window.turf, f = T.polygon([anel]);
        if (T.kinks(f).features.length) {
          var partes = T.unkinkPolygon(f).features.filter(function (p) { return T.area(p) > 5e4; });   // descarta laçinhos < 0,05 km²
          var u = partes.length > 1 ? T.union(T.featureCollection(partes)) : partes[0];
          if (u) geo = u.geometry;
        }
      } catch (e) { /* segue com o traço como está */ }
      // cada parte vira uma área do mesmo nível (o caminho do desenho por cliques trabalha com Polygon simples)
      var polys = geo.type === 'Polygon' ? [geo.coordinates] : geo.coordinates;
      polys.forEach(function (pg) {
        var latlngs = pg.map(function (r) { return r.map(function (c) { return [c[1], c[0]]; }); });
        map.fire(L.Draw.Event.CREATED, { layer: L.polygon(latlngs, o.estilo()), layerType: 'polygon' });
      });
      if (ativo) setTimeout(function () { if (ativo) status(((document.getElementById('status') || {}).textContent || '') + ' Pincel continua ligado.'); }, 0);
    }
    return { desligar: desligar, ativo: function () { return ativo; } };
  }
  window.Pincel = { ligar: ligar };
})();
