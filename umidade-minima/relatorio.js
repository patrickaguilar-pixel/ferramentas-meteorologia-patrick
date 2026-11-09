/*
 * Umidade Mínima — aba "Relatório (PDF)" (v1, 09/11/2026, Patrick/Claude).
 * Monta o Aviso Meteorológico "UMIDADE RELATIVA DO AR MÍNIMA" no modelo da equipe (PDF de 05/11/2026):
 * cabeçalho laranja, título, período de vigência, linha, texto justificado (com **negrito**), mapa da ferramenta,
 * OBS com as cidades de referência e rodapé com os logos. A4 retrato.
 *
 * - Um só cálculo de posições (montar()) serve para a prévia (canvas) e para o PDF (jsPDF): as palavras são medidas
 *   com a mesma fonte (Open Sans, do previsao/modelo/modelo-boletim.js) e colocadas uma a uma, então os dois saem iguais.
 * - O mapa é o da aba Mapa (mesmas isolinhas e cidades), sem a faixa de logos de baixo (o relatório já tem rodapé).
 * - "Gerar texto a partir da tabela" escreve um rascunho com as mesorregiões e o estado do Manual; o texto é livre.
 * - O texto, a OBS e as datas ficam guardados neste navegador por rodada (só conveniência; try/catch).
 * Depende de: window.UmidadeMinima (app.js), window.LayoutMapa, window.MODELO_RELATORIO_UR (modelo-relatorio.js),
 * window.MODELO_BOLETIM (fontes) e window.jspdf (carregados quando a aba é aberta).
 */
(function () {
  'use strict';
  var BASE = window.BASE_DADOS || '../';
  var VER = (function () { var c = document.currentScript; var m = c && /[?&]v=([^&]+)/.exec(c.src || ''); return m ? m[1] : 'r1'; })();
  var $ = function (id) { return document.getElementById(id); };
  var PT = 25.4 / 72;                       // 1 pt em mm
  var PAG = { w: 210, h: 297 };
  // posições tiradas do PDF de exemplo (em pt, convertidas para mm)
  var L = {
    cab: { x: -2 * PT, y: 0, w: 596.3 * PT, h: 143.2 * PT },
    rod: { x: -0.5 * PT, y: 773.5 * PT, w: 595.5 * PT, h: 71.2 * PT },
    titulo: { y: 191.3 * PT, pt: 14 },
    periodo: { y: 220.0 * PT, pt: 12 },
    linha: { x1: 60 * PT, x2: 535 * PT, y: 245.5 * PT, cor: '#888888', w: 0.5 * PT },
    texto: { x: 56.7 * PT, w: 482.3 * PT, y: 274.6 * PT, pt: 11, lh: 16.45 * PT },
    obs: { pt: 9, lh: 13.5 * PT },
    limite: 765 * PT                         // nada passa daqui (rodapé começa em 773,5 pt)
  };
  var COR_TEXTO = '#000000';
  var OBS_PADRAO = 'Localização aproximada, para termos de referência, das cidades: Almenara, Barbacena, Buritis, Belo Horizonte, Campos Altos, Carneirinho, Curvelo, Diamantina, Divinópolis, Extrema, Governador Valadares, Ipatinga, Itamonte, Januária, Juiz de Fora, Manhuaçu, Montes Claros, Paracatu, Patos de Minas, Pirapora, Poços de Caldas, Teófilo Otoni, Uberaba, Uberlândia e Viçosa.';
  var FRASE_FOGO = 'Essas condições favorecem o ressecamento da vegetação e aumentam o risco de incêndios florestais.';

  /* ---------------- carregamento (só quando a aba abre) ---------------- */
  function script(src) {
    return new Promise(function (ok, falha) {
      var s = document.createElement('script'); s.src = src; s.async = false;
      s.onload = ok; s.onerror = function () { falha(new Error('Não carregou ' + src)); };
      document.head.appendChild(s);
    });
  }
  var pronto = null;
  function preparar() {
    if (pronto) return pronto;
    pronto = Promise.all([
      window.MODELO_RELATORIO_UR ? 1 : script(BASE + 'umidade-minima/modelo-relatorio.js?v=' + VER),
      window.MODELO_BOLETIM ? 1 : script(BASE + 'previsao/modelo/modelo-boletim.js?v=' + VER),
      (window.jspdf && window.jspdf.jsPDF) ? 1 : script(BASE + 'previsao/lib/jspdf.umd.min.js?v=' + VER)
    ]).then(function () {
      var F = window.MODELO_BOLETIM.fontes;
      var faces = [['regular', '400'], ['bold', '700'], ['extrabold', '800']].map(function (f) {
        var bin = atob(F[f[0]]), u = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        var ff = new FontFace('UROpenSans', u.buffer, { weight: f[1] });
        document.fonts.add(ff); return ff.load();
      });
      return Promise.all(faces);
    }).then(function () {
      M = novoDoc();   // documento só para medir
    });
    pronto.catch(function () { pronto = null; });
    return pronto;
  }
  function novoDoc() {
    var F = window.MODELO_BOLETIM.fontes, d = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    d.addFileToVFS('OpenSans-Regular.ttf', F.regular); d.addFont('OpenSans-Regular.ttf', 'OpenSans', 'normal');
    d.addFileToVFS('OpenSans-Bold.ttf', F.bold); d.addFont('OpenSans-Bold.ttf', 'OpenSans', 'bold');
    d.addFileToVFS('OpenSans-ExtraBold.ttf', F.extrabold); d.addFont('OpenSans-ExtraBold.ttf', 'OpenSansXB', 'normal');
    return d;
  }
  var M = null;
  function fonte(doc, f, pt) {
    if (f === 'X') doc.setFont('OpenSansXB', 'normal'); else doc.setFont('OpenSans', f === 'B' ? 'bold' : 'normal');
    doc.setFontSize(pt);
  }
  function larg(txt, f, pt) { fonte(M, f, pt); return M.getTextWidth(txt); }

  /* ---------------- texto: **negrito** + quebra justificada ---------------- */
  function palavras(par) {   // [{t, f}] — cada palavra com a fonte; "**" liga/desliga o negrito
    var out = [], negrito = false;
    par.split(/(\*\*)/).forEach(function (pedaco) {
      if (pedaco === '**') { negrito = !negrito; return; }
      // separa por espaço, mas mantém pontuação colada à palavra anterior (ex.: "**Atenção**.")
      var partes = pedaco.split(/(\s+)/);
      partes.forEach(function (p) {
        if (!p) return;
        if (/^\s+$/.test(p)) { out.push({ esp: true }); return; }
        out.push({ t: p, f: negrito ? 'B' : 'R' });
      });
    });
    // junta pedaços sem espaço entre si (palavra que muda de fonte no meio) num só "bloco"
    var blocos = [], atual = null;
    out.forEach(function (w) {
      if (w.esp) { atual = null; return; }
      if (!atual) { atual = { partes: [] }; blocos.push(atual); }
      atual.partes.push(w);
    });
    return blocos;
  }
  function quebrar(par, x, y, w, pt, lh, itens) {   // devolve o y da próxima linha
    var blocos = palavras(par);
    blocos.forEach(function (b) { b.w = b.partes.reduce(function (s, p) { p.w = larg(p.t, p.f, pt); return s + p.w; }, 0); });
    var esp = larg(' ', 'R', pt), linhas = [], lin = [], lw = 0;
    blocos.forEach(function (b) {
      var nw = lin.length ? lw + esp + b.w : b.w;
      if (lin.length && nw > w) { linhas.push(lin); lin = [b]; lw = b.w; } else { lin.push(b); lw = nw; }
    });
    if (lin.length) linhas.push(lin);
    linhas.forEach(function (ln, i) {
      var soma = ln.reduce(function (s, b) { return s + b.w; }, 0);
      var ultima = i === linhas.length - 1, gap = (!ultima && ln.length > 1) ? (w - soma) / (ln.length - 1) : esp;
      var cx = x;
      ln.forEach(function (b) {
        var px = cx;
        b.partes.forEach(function (p) { itens.push({ k: 't', s: p.t, f: p.f, pt: pt, x: px, y: y }); px += p.w; });
        cx += b.w + gap;
      });
      y += lh;
    });
    return y;
  }

  /* ---------------- página ---------------- */
  // mapa sem a faixa de logos (o rodapé do layout começa em 194,2 mm)
  var CORTE_MAPA = 193.6, MAPA_PROP = 297 / CORTE_MAPA;
  function montar(dados, mapaW) {
    var it = [], R = window.MODELO_RELATORIO_UR;
    it.push({ k: 'i', src: R.cabecalho.src, x: L.cab.x, y: L.cab.y, w: L.cab.w, h: L.cab.h, png: true });
    var tit = 'UMIDADE RELATIVA DO AR MÍNIMA';
    it.push({ k: 't', s: tit, f: 'X', pt: L.titulo.pt, x: (PAG.w - larg(tit, 'X', L.titulo.pt)) / 2, y: L.titulo.y });
    var per = dados.periodo;
    it.push({ k: 't', s: per, f: 'R', pt: L.periodo.pt, x: (PAG.w - larg(per, 'R', L.periodo.pt)) / 2, y: L.periodo.y });
    it.push({ k: 'l', x1: L.linha.x1, x2: L.linha.x2, y: L.linha.y, cor: L.linha.cor, w: L.linha.w });
    var y = L.texto.y;
    String(dados.texto || '').split(/\n\s*\n/).map(function (p) { return p.replace(/\s*\n\s*/g, ' ').trim(); }).filter(Boolean).forEach(function (p, i) {
      if (i) y += L.texto.lh * 0.45;
      y = quebrar(p, L.texto.x, y, L.texto.w, L.texto.pt, L.texto.lh, it);
    });
    // OBS (medida antes para saber quanto sobra para o mapa)
    var obs = String(dados.obs || '').trim(), itObs = [], hObs = 0;
    if (obs) {
      var yo = quebrar('**OBS:** ' + obs.replace(/\s*\n\s*/g, ' '), L.texto.x, 0, L.texto.w, L.obs.pt, L.obs.lh, itObs);
      hObs = yo;
    }
    var topoMapa = y - L.texto.lh + 6;                       // ~6 mm abaixo da última linha do texto
    var fimObs = L.limite, iniObs = fimObs - hObs;            // OBS colada perto do rodapé
    var dispH = iniObs - 5 - topoMapa;
    var mw = Math.min(mapaW || L.texto.w, dispH * MAPA_PROP), mh = mw / MAPA_PROP;
    var aviso = '';
    if (mw < 90) aviso = 'O texto está longo e o mapa ficou pequeno. Encurte o texto para o mapa crescer.';
    if (dados.mapa && mw > 20) it.push({ k: 'i', src: dados.mapa, x: (PAG.w - mw) / 2, y: topoMapa, w: mw, h: mh, png: false, borda: true });
    else if (!dados.mapa) it.push({ k: 'r', x: (PAG.w - mw) / 2, y: topoMapa, w: mw, h: Math.max(mh, 10), txt: 'Mapa: carregue os dados na aba Mapa' });
    // OBS logo abaixo do mapa (ou do texto), sem passar do limite
    var yObs = Math.min(topoMapa + mh + 7, iniObs) + L.obs.lh * 0.75;
    itObs.forEach(function (o) { o.y += yObs; it.push(o); });
    if (yObs + hObs - L.obs.lh > L.limite + 0.5) aviso = 'O texto não cabe na página. Encurte o texto ou a OBS.';
    it.push({ k: 'i', src: R.rodape.src, x: L.rod.x, y: L.rod.y, w: L.rod.w, h: L.rod.h, png: true });
    return { itens: it, aviso: aviso };
  }

  /* ---------------- desenho: canvas (prévia) e PDF ---------------- */
  var imgs = {}, prontas = {};
  function imagem(src) {
    if (imgs[src]) return imgs[src];
    imgs[src] = new Promise(function (ok, falha) { var im = new Image(); im.onload = function () { prontas[src] = im; ok(im); }; im.onerror = falha; im.src = src; });
    if (Object.keys(imgs).length > 12) { imgs = {}; prontas = {}; }   // mapas antigos saem da memória
    return imgs[src] || imagem(src);
  }
  function pesoCanvas(f) { return f === 'X' ? '800' : f === 'B' ? '700' : '400'; }
  function noCanvas(cv, pag) {
    var esc = cv.width / PAG.w, g = cv.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
    g.setTransform(esc, 0, 0, esc, 0, 0);
    return Promise.all(pag.itens.filter(function (o) { return o.k === 'i'; }).map(function (o) { return imagem(o.src); })).then(function () {
      pag.itens.forEach(function (o) {
        if (o.k === 'i') {
          var im = prontas[o.src]; if (im) g.drawImage(im, o.x, o.y, o.w, o.h);
          if (o.borda) { g.strokeStyle = '#c9d3dd'; g.lineWidth = 0.2; g.strokeRect(o.x, o.y, o.w, o.h); }
        } else if (o.k === 't') {
          g.font = pesoCanvas(o.f) + ' ' + (o.pt * PT) + 'px UROpenSans'; g.fillStyle = COR_TEXTO; g.textBaseline = 'alphabetic';
          g.fillText(o.s, o.x, o.y);
        } else if (o.k === 'l') {
          g.strokeStyle = o.cor; g.lineWidth = Math.max(o.w, 0.15); g.beginPath(); g.moveTo(o.x1, o.y); g.lineTo(o.x2, o.y); g.stroke();
        } else if (o.k === 'r') {
          g.fillStyle = '#f3f6f9'; g.fillRect(o.x, o.y, o.w, o.h); g.fillStyle = '#7a8b96'; g.font = '400 ' + (10 * PT) + 'px UROpenSans';
          g.textAlign = 'center'; g.fillText(o.txt, o.x + o.w / 2, o.y + o.h / 2); g.textAlign = 'left';
        }
      });
    });
  }
  function emPdf(pag) {
    var d = novoDoc();
    pag.itens.forEach(function (o) {
      if (o.k === 'i') {
        d.addImage(o.src, o.png ? 'PNG' : 'JPEG', o.x, o.y, o.w, o.h, undefined, 'FAST');
        if (o.borda) { d.setDrawColor(201, 211, 221); d.setLineWidth(0.2); d.rect(o.x, o.y, o.w, o.h); }
      } else if (o.k === 't') {
        fonte(d, o.f, o.pt); d.setTextColor(0, 0, 0); d.text(o.s, o.x, o.y);
      } else if (o.k === 'l') {
        d.setDrawColor(136, 136, 136); d.setLineWidth(o.w); d.line(o.x1, o.y, o.x2, o.y);
      }
    });
    d.setProperties({ title: 'Umidade Relativa do Ar Mínima', subject: 'Aviso Meteorológico - SIMGE/IGAM', creator: 'Ferramentas de Meteorologia SIMGE/IGAM' });
    return d.output('blob');
  }

  /* ---------------- mapa da aba Mapa (JPEG, sem a faixa de logos) ---------------- */
  var mapaCache = { chave: '', url: '' };
  function mapaJpeg() {
    var U = window.UmidadeMinima, op = U && U.opMapa();
    if (!op || !window.LayoutMapa) return Promise.resolve('');
    var chave = JSON.stringify([op.titulo, op.credito, (op.isolinhas || []).length && op.isolinhas[0].linhas.length, (op.rotulosIso || []).length, (op.cidades || []).length, op.areas.length]);
    if (mapaCache.chave === chave) return Promise.resolve(mapaCache.url);
    return LayoutMapa.canvas(op, 220).then(function (c) {
      var h = Math.round(c.height * CORTE_MAPA / 210), o = document.createElement('canvas');
      o.width = c.width; o.height = h; o.getContext('2d').drawImage(c, 0, 0);
      mapaCache = { chave: chave, url: o.toDataURL('image/jpeg', 0.9) };
      return mapaCache.url;
    });
  }

  /* ---------------- texto automático (rascunho a partir da tabela) ---------------- */
  var NOMES = {
    'NORTE': 'do Norte', 'NOROESTE': 'do Noroeste', 'JEQUITINHONHA': 'do Jequitinhonha', 'VALE DO MUCURI': 'do Vale do Mucuri',
    'TRIÂNGULO': 'do Triângulo Mineiro/Alto Paranaíba', 'CENTRAL': 'da região Central', 'METROPOLITANA': 'da Região Metropolitana de Belo Horizonte',
    'VALE DO RIO DOCE': 'do Vale do Rio Doce', 'OESTE': 'do Oeste de Minas', 'SUL DE MINAS': 'do Sul de Minas',
    'CAMPO DAS VERTENTES': 'do Campo das Vertentes', 'ZONA DA MATA': 'da Zona da Mata'
  };
  var ORDEM = ['NORTE', 'NOROESTE', 'JEQUITINHONHA', 'VALE DO MUCURI', 'TRIÂNGULO', 'CENTRAL', 'METROPOLITANA', 'OESTE', 'VALE DO RIO DOCE', 'CAMPO DAS VERTENTES', 'SUL DE MINAS', 'ZONA DA MATA'];
  function lista(xs) { return xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' e ' + xs[xs.length - 1]; }
  function nomes(gr) { return lista(gr.sort(function (a, b) { return ORDEM.indexOf(a.nome) - ORDEM.indexOf(b.nome); }).map(function (e) { return NOMES[e.nome] || ('de ' + e.nome); })); }
  function baixo5(v) { return Math.max(0, Math.floor(v / 5) * 5); }
  function cima5(v) { return Math.min(100, Math.ceil(v / 5) * 5); }
  function textoAutomatico() {
    var U = window.UmidadeMinima, est = U.estatMeso(), E = U.ESTADOS;   // ESTADOS: do mais grave ao mais leve (ate 11, 20, 30, 40)
    var partes = [];
    var comEstado = est.filter(function (e) { return e.estado; });
    if (comEstado.length) {
      var grupos = E.map(function (s) { return { s: s, ms: comEstado.filter(function (e) { return e.estado.nome === s.nome; }) }; }).filter(function (g) { return g.ms.length; });
      grupos.forEach(function (g, i) {
        var lo = baixo5(Math.min.apply(null, g.ms.map(function (e) { return e.minMedia; })));
        var hi = cima5(Math.max.apply(null, g.ms.map(function (e) { return e.p25; })));
        hi = Math.min(hi, cima5(g.s.ate) + 10);   // faixa do texto perto do limite do estado
        if (hi <= lo) hi = lo + 5;
        var todas = comEstado.length === est.length && grupos.length === 1;
        var onde = todas ? 'em praticamente todo o estado' : 'em áreas ' + nomes(g.ms.slice());
        if (i === 0) partes.push('São previstos baixos índices de umidade relativa do ar, com valores entre ' + lo + '% e ' + hi + '% ' + onde + ', caracterizando **Estado de ' + g.s.nome + '**.');
        else partes.push('Também ' + onde + ' os valores podem ficar entre ' + lo + '% e ' + hi + '%, caracterizando **Estado de ' + g.s.nome + '**.');
      });
      partes.push(FRASE_FOGO);
    } else {
      var m = est.reduce(function (a, b) { return b.minMedia < a.minMedia ? b : a; });
      partes.push('Não são previstos índices críticos de umidade relativa do ar em Minas Gerais. Os menores valores, em torno de ' + Math.round(m.minMedia) + '%, ficam em áreas ' + (NOMES[m.nome] || m.nome) + '.');
    }
    var semEstado = est.filter(function (e) { return !e.estado; });
    var medios = semEstado.filter(function (e) { return e.p50 < 60; }), altos = semEstado.filter(function (e) { return e.p50 >= 60; });
    if (medios.length) {
      var a = baixo5(Math.min.apply(null, medios.map(function (e) { return e.p10; }))), b = cima5(Math.max.apply(null, medios.map(function (e) { return e.p90; })));
      partes.push('Em áreas ' + nomes(medios) + ', os índices variam predominantemente entre ' + a + '% e ' + b + '%.');
    }
    if (altos.length) {
      var c = baixo5(Math.min.apply(null, altos.map(function (e) { return e.p10; }))), d = cima5(Math.max.apply(null, altos.map(function (e) { return e.p75; })));
      var mx = Math.max.apply(null, altos.map(function (e) { return e.max; }));
      partes.push('Já em áreas ' + nomes(altos) + ', a umidade tende a permanecer mais elevada, geralmente entre ' + c + '% e ' + d + '%' +
        (mx > d + 5 ? ', podendo superar ' + d + '% em alguns pontos' : '') + '.');
    }
    return partes.join(' ');
  }

  /* ---------------- tela ---------------- */
  var CH = 'urRelatorio:';
  function guardar() {
    var j = window.UmidadeMinima && window.UmidadeMinima.dados(); if (!j) return;
    try { localStorage.setItem(CH + j.data_ciclo, JSON.stringify({ ini: $('relIni').value, fim: $('relFim').value, hora: $('relHora').value, texto: $('relTexto').value, obs: $('relObs').value })); } catch (e) { }
  }
  function recuperar(j) {
    try { var v = JSON.parse(localStorage.getItem(CH + j.data_ciclo) || 'null'); return v; } catch (e) { return null; }
  }
  var rodadaPreenchida = '';
  function preencher() {
    var U = window.UmidadeMinima, j = U && U.dados(); if (!j || rodadaPreenchida === j.data_ciclo) return;
    rodadaPreenchida = j.data_ciclo;
    var g = recuperar(j);
    $('relIni').value = (g && g.ini) || String(j.dias[0].valido_local).slice(0, 10);
    $('relFim').value = (g && g.fim) || String(j.dias[2].valido_local).slice(0, 10);
    $('relHora').value = (g && g.hora) || '15h';
    $('relObs').value = (g && g.obs != null) ? g.obs : OBS_PADRAO;
    $('relTexto').value = (g && g.texto) || textoAutomatico();
  }
  function dataBR(iso) { var p = String(iso || '').split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : '—'; }
  function periodo() { return 'Período de Vigência: ' + dataBR($('relIni').value) + ' até às ' + ($('relHora').value.trim() || '15h') + ' do dia ' + dataBR($('relFim').value); }
  function st(t, c) { var e = $('relStatus'); e.className = 'stbox' + (c ? ' ' + c : ''); e.innerHTML = t; }

  var fila = 0;
  function previa() {
    var n = ++fila;
    return preparar().then(function () {
      preencher();
      return mapaJpeg();
    }).then(function (mapa) {
      if (n !== fila) return;
      var pag = montar({ periodo: periodo(), texto: $('relTexto').value, obs: $('relObs').value, mapa: mapa });
      var cv = $('relCanvas');
      return noCanvas(cv, pag).then(function () {
        $('relPdf').disabled = !mapa;
        if (!mapa) st('Carregue os dados na aba Mapa para o mapa entrar no relatório.', 'aviso');
        else if (pag.aviso) st(pag.aviso, 'aviso'); else st('Prévia atualizada. O PDF sai igual a esta página (A4).');
      });
    }).catch(function (e) { st('Não foi possível montar o relatório: ' + (e && e.message || e), 'erro'); });
  }
  var tm = 0;
  function depois() { clearTimeout(tm); tm = setTimeout(function () { guardar(); previa(); }, 350); }

  function baixarPdf() {
    var b = $('relPdf'), t = b.textContent; b.disabled = true; b.textContent = 'Gerando PDF…';
    preparar().then(mapaJpeg).then(function (mapa) {
      var pag = montar({ periodo: periodo(), texto: $('relTexto').value, obs: $('relObs').value, mapa: mapa });
      var blob = emPdf(pag), ini = $('relIni').value.replace(/-/g, '');
      var nome = ini + '_Umidade_Relativa_do_Ar_minima.pdf';
      window.UmidadeMinima.baixar(nome, blob);
      st('PDF gerado: ' + nome + (pag.aviso ? ' — atenção: ' + pag.aviso : ''), pag.aviso ? 'aviso' : 'ok');
    }).catch(function (e) { st('Não foi possível gerar o PDF: ' + (e && e.message || e), 'erro'); })
      .then(function () { b.disabled = false; b.textContent = t; });
  }

  function abas(qual) {
    var rel = qual === 'rel';
    $('abaMapaBtn').classList.toggle('ativa', !rel); $('abaRelBtn').classList.toggle('ativa', rel);
    $('abaMapaBtn').setAttribute('aria-selected', String(!rel)); $('abaRelBtn').setAttribute('aria-selected', String(rel));
    $('abaMapa').hidden = rel; $('abaRel').hidden = !rel;
    var pv = $('previewBtn'); if (pv) pv.hidden = rel;   // a prévia do relatório já está na tela
    try { sessionStorage.setItem('urAba', qual); } catch (e) { }
    if (rel) previa();
  }
  function iniciar() {
    if (!$('abaRel')) return;
    $('abaMapaBtn').addEventListener('click', function () { abas('mapa'); });
    $('abaRelBtn').addEventListener('click', function () { abas('rel'); });
    ['relIni', 'relFim', 'relHora', 'relTexto', 'relObs'].forEach(function (id) { $(id).addEventListener('input', depois); });
    $('relGerar').addEventListener('click', function () {
      if (!window.UmidadeMinima.dados()) { st('Carregue os dados primeiro.', 'aviso'); return; }
      if ($('relTexto').value.trim() && !confirmarTroca()) return;
      $('relTexto').value = textoAutomatico(); depois();
    });
    $('relObsPadrao').addEventListener('click', function () { $('relObs').value = OBS_PADRAO; depois(); });
    $('relPdf').addEventListener('click', baixarPdf);
    document.addEventListener('ur:mapa', function () { if (!$('abaRel').hidden) previa(); });
    var a = 'mapa'; try { a = sessionStorage.getItem('urAba') || 'mapa'; } catch (e) { }
    if (a === 'rel') abas('rel');
  }
  // confirmação sem janela do navegador (o Apps Script pode bloquear confirm): 2º clique em 4 s confirma
  var armado = 0;
  function confirmarTroca() {
    if (Date.now() - armado < 4000) { armado = 0; return true; }
    armado = Date.now(); st('O texto atual será substituído pelo rascunho automático. Clique de novo em "Gerar texto a partir da tabela" para confirmar.', 'aviso');
    return false;
  }
  window.UmidadeRelatorio = { previa: previa, textoAutomatico: function () { return textoAutomatico(); }, montar: function (d) { return montar(d); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
