/*
 * Ponte para o Drive — v5 (2026.10.28): botão único "OPÇÕES DE SALVAMENTO".
 * Usada por Previsão diária, Tempo Severo, Chuva e Tendência, Alertas e Reservatórios.
 *
 * Os botões de exportar das ferramentas saem do layout (ficam escondidos, só para a ponte acioná-los).
 * Em todas as ferramentas aparece o mesmo botão, sempre no canto superior direito do cabeçalho (sobre a faixa azul):
 * "OPÇÕES DE SALVAMENTO". Ele abre um painel com todo o controle:
 *   1. Materiais da ferramenta (mapa PNG, PDF, SVG, KML, CSV, TXT…): um clique gera o arquivo;
 *   2. Arquivos gerados nesta sessão, cada um com "Salvar no Drive" e "Salvar no PC", dizendo
 *      o que já foi salvo e onde, e avisando onde AINDA NÃO foi salvo.
 * Nada é salvo sem o meteorologista escolher (exceto o que a ferramenta já salvava sozinha no Drive,
 * como o KML na emissão do alerta e o relatório final do plantão — o painel mostra o resultado).
 *
 * Como chega aqui:
 *   - automático: a ferramenta cria um link de download e chama .click(); a ponte intercepta e abre a janela
 *     (um link com data-local="1" nunca é interceptado: download direto, uso interno da ponte);
 *   - direto: window.SalvarMaterial.abrir({nome, blob, ...}) — usado pelos Alertas e pela Previsão por cidade.
 *     Opções: driveFeito {url, nome} (já salvo no Drive pela própria ferramenta, ex.: KML na emissão do alerta);
 *     drivePromessa (Promise que resolve {url, nome} ou rejeita — salvamento no Drive já em andamento);
 *     salvarDrive (função própria que recebe (blob, base64) e devolve Promise {url, nome}); nota (texto curto).
 *
 * Drive: usa a MESMA função do Apps Script de antes, google.script.run.salvarArquivo(ferramenta, nome, tipo, base64).
 * Os arquivos do Apps Script (Codigo.gs, SalvarArquivo.gs) não mudam.
 * Fora do Apps Script (painel de testes / GitHub Pages) o botão "Salvar no Drive" aparece, mas avisa que
 * esta plataforma não está ligada ao Drive. NA PLATAFORMA OFICIAL ELE SALVA NO DRIVE.
 *
 * Depende de window.FERRAMENTA ('previsao', 'tempo-severo', 'chuva', 'alertas', 'reservatorios').
 */
(function () {
  if (window.SalvarMaterial) return;
  var temAppsScript = function () { return !!(window.google && google.script && google.script.run); };
  var FERRAMENTA = function () { return window.FERRAMENTA || ''; };

  /* ---------------- estilo (identidade das ferramentas) ---------------- */
  var estilo = document.createElement('style');
  estilo.textContent = [
    '#smFundo{position:fixed;inset:0;z-index:99990;background:rgba(9,43,106,.38);display:none;align-items:center;justify-content:center;padding:16px}',
    '#smFundo.on{display:flex}',
    '#smJanela{width:min(620px,100%);max-height:calc(100vh - 32px);overflow:auto;background:#fff;color:#092b6a;border-radius:14px;box-shadow:0 18px 50px rgba(9,43,106,.35);font:15px/1.45 "Barlow",Arial,"Liberation Sans",sans-serif}',
    '#smJanela .cab{display:flex;align-items:center;gap:12px;padding:16px 18px 12px;border-bottom:1px solid #e1ebf4;position:relative;overflow:hidden}',
    '#smJanela .cab h2{margin:0;font:700 19px/1.2 "Barlow",Arial,sans-serif;color:#092b6a;flex:1}',
    '#smJanela .cab svg.rs{position:absolute;right:0;top:0;height:100%;width:120px;pointer-events:none}',
    '#smJanela .cab h2{margin-right:110px}',
    '#smJanela .itens{padding:6px 18px}',
    '#smJanela .it{padding:14px 0;border-top:1px solid #eef3f8}',
    '#smJanela .it:first-child{border-top:0}',
    '#smJanela .nome{display:flex;align-items:center;gap:10px;font-weight:700;font-size:16px;word-break:break-all}',
    '#smJanela .tipo{flex:none;font:700 11.5px/1 "Barlow Semi Condensed","Barlow",Arial,sans-serif;letter-spacing:.05em;color:#fff;background:#092b6a;border-radius:5px;padding:4px 6px}',
    '#smJanela .nota{margin:4px 0 0;color:#5f7393;font-size:13.5px}',
    '#smJanela .bts{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}',
    '#smJanela .bt{display:inline-flex;align-items:center;gap:8px;border:1px solid #c9dbee;background:#fff;color:#092b6a;border-radius:9px;padding:9px 14px;font:700 15px "Barlow",Arial,sans-serif;cursor:pointer;min-height:40px}',
    '#smJanela .bt:hover{border-color:#006cbf}',
    '#smJanela .bt.pri{background:#006cbf;border-color:#006cbf;color:#fff}',
    '#smJanela .bt.pri:hover{background:#00559a}',
    '#smJanela .bt[disabled]{opacity:.55;cursor:default}',
    '#smJanela .bt svg{width:17px;height:17px;flex:none}',
    '#smJanela .st{list-style:none;margin:10px 0 0;padding:0;display:grid;gap:4px;font-size:14.5px}',
    '#smJanela .st li{display:flex;gap:8px;align-items:flex-start}',
    '#smJanela .st .ic{flex:none;width:18px;height:18px;border-radius:50%;margin-top:1px;display:inline-grid;place-items:center;font:700 12px/1 Arial,sans-serif}',
    '#smJanela .st .ok .ic{background:#1d7a46;color:#fff}',
    '#smJanela .st .pend .ic{border:2px solid #9fb2c8}',
    '#smJanela .st .and .ic{border:2px solid #006cbf;border-right-color:transparent;animation:smGira .8s linear infinite}',
    '#smJanela .st .err .ic{background:#b3261e;color:#fff}',
    '#smJanela .st .ok{color:#1d5c37}#smJanela .st .err{color:#8a2025}#smJanela .st .pend{color:#5f7393}',
    '#smJanela .st a{color:#00559a;font-weight:700}',
    '#smJanela .rod{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:12px 18px 16px;border-top:1px solid #e1ebf4;background:#f6fafd;border-radius:0 0 14px 14px}',
    '#smJanela .resumo{font-size:14px;color:#3d5a8a;flex:1;min-width:220px}',
    '#smJanela .resumo b{color:#092b6a}',
    '#smJanela .sec{padding:12px 18px 4px}',
    '#smJanela .sec h3{margin:0 0 8px;font:700 13px/1.2 "Barlow Semi Condensed","Barlow",Arial,sans-serif;letter-spacing:.07em;text-transform:uppercase;color:#3d5a8a}',
    '#smJanela .mats{display:grid;gap:8px}',
    '#smJanela .mat{display:flex;align-items:center;gap:10px;width:100%;text-align:left;border:1px solid #c9dbee;background:#fff;color:#092b6a;border-radius:10px;padding:10px 12px;cursor:pointer;font:600 15px/1.3 "Barlow",Arial,sans-serif}',
    '#smJanela .mat:hover{border-color:#006cbf;background:#f3f8fd}',
    '#smJanela .mat[disabled]{cursor:default;background:#f6f8fb;color:#7d8fab;border-style:dashed}',
    '#smJanela .mat .tx{flex:1}',
    '#smJanela .mat small{display:block;font-weight:400;font-size:13px;color:#5f7393}',
    '#smJanela .mat .ger{flex:none;font:700 13px "Barlow",Arial,sans-serif;color:#006cbf}',
    '#smJanela .mat[disabled] .tipo{background:#9fb2c8}',
    '#smJanela .vazio{margin:0;color:#5f7393;font-size:14px}',
    '#smJanela .sec h3 .aqui{text-transform:none;letter-spacing:0;font-weight:600;color:#7d8fab}',
    '#smJanela .prev{display:grid;gap:10px;margin:0 0 10px}',
    '#smJanela .prev.duas{grid-template-columns:1fr 1fr}',
    '#smJanela .prev[hidden]{display:none}',
    '#smJanela .prev figure{margin:0;border:1px solid #d3e4f2;border-radius:10px;background:#f6fafd;padding:8px;overflow:hidden}',
    '#smJanela .prev svg,#smJanela .prev img{display:block;width:100%;height:auto;max-height:260px;object-fit:contain;background:#fff;pointer-events:none}',
    '#smJanela .prev figcaption{font:600 12.5px "Barlow",Arial,sans-serif;color:#5f7393;margin-top:6px}',
    '#smJanela .it.novo{animation:smPisca 1.6s ease-out}',
    '@keyframes smPisca{from{background:#e3f1fb}to{background:transparent}}',
    '#smBotao{position:fixed;right:22px;bottom:22px;z-index:99980;display:inline-flex;align-items:center;gap:12px;border:3px solid #fff;border-radius:16px;background:#ffb703;color:#092b6a;padding:12px 20px 12px 14px;font:800 16px/1.1 "Barlow",Arial,"Liberation Sans",sans-serif;letter-spacing:.04em;cursor:pointer;text-align:left;box-shadow:0 0 0 2px #092b6a,0 10px 28px rgba(0,0,0,.35);transition:transform .15s,box-shadow .15s}',
    '#smBotao:hover{transform:translateY(-2px);background:#ffc93c;box-shadow:0 0 0 2px #092b6a,0 14px 34px rgba(0,0,0,.4)}',
    '#smBotao:focus-visible{outline:3px solid #006cbf;outline-offset:3px}',
    '#smBotao .ico{flex:none;width:40px;height:40px;border-radius:11px;background:#092b6a;color:#fff;display:grid;place-items:center}',
    '#smBotao .ico svg{width:23px;height:23px}',
    '#smBotao .tx small{display:block;font:600 12.5px/1.2 "Barlow",Arial,sans-serif;letter-spacing:0;margin-top:3px;color:#3d3000}',
    '#smBotao .n{position:absolute;top:-10px;right:-10px;min-width:24px;height:24px;border-radius:12px;background:#d62828;color:#fff;border:2px solid #fff;font:800 12.5px/1 Arial,sans-serif;display:grid;place-items:center;padding:0 6px;letter-spacing:0}',
    '#smBotao .n[hidden]{display:none}',
    '#smBotao.pend{animation:smPulso 1.8s ease-in-out infinite}',
    '@keyframes smPulso{0%,100%{box-shadow:0 0 0 2px #092b6a,0 10px 28px rgba(0,0,0,.35)}50%{box-shadow:0 0 0 2px #092b6a,0 0 0 10px rgba(255,183,3,.35),0 10px 28px rgba(0,0,0,.35)}}',
    '#smDica{position:fixed;right:22px;bottom:104px;z-index:99981;max-width:300px;background:#092b6a;color:#fff;border-radius:12px;padding:12px 38px 12px 14px;font:500 14.5px/1.4 "Barlow",Arial,sans-serif;box-shadow:0 10px 28px rgba(0,0,0,.3)}',
    '#smDica::after{content:"";position:absolute;right:44px;bottom:-8px;border:8px solid transparent;border-bottom:0;border-top-color:#092b6a}',
    '#smDica b{color:#ffb703}',
    '#smDica button{position:absolute;right:6px;top:6px;border:0;background:transparent;color:#fff;font-size:18px;cursor:pointer;width:26px;height:26px;border-radius:6px}',
    '@media (prefers-reduced-motion:reduce){#smBotao.pend{animation:none}#smBotao{transition:none}}',
    /* no canto superior direito do cabeçalho, sobre a faixa decorativa: não cobre mapa, legenda nem botões */
    '#smBotao.topo{position:absolute;right:12px;top:50%;bottom:auto;transform:translateY(-50%);z-index:3;gap:8px;padding:5px 12px 5px 5px;border-width:2px;border-radius:12px;font-size:13px;line-height:1.1;letter-spacing:.05em;box-shadow:0 0 0 1px #092b6a,0 4px 12px rgba(9,43,106,.3)}',
    '#smBotao.topo:hover{transform:translateY(-50%) scale(1.03);box-shadow:0 0 0 1px #092b6a,0 6px 16px rgba(9,43,106,.35)}',
    '#smBotao.topo .ico{width:32px;height:32px;border-radius:8px}',
    '#smBotao.topo .ico svg{width:19px;height:19px}',
    '#smBotao.topo .tx small{display:none}',
    '#smBotao.topo .n{top:-9px;right:-9px}',
    '#smBotao.topo.pend{animation:smPulso2 1.8s ease-in-out infinite}',
    '@keyframes smPulso2{0%,100%{box-shadow:0 0 0 1px #092b6a,0 4px 12px rgba(9,43,106,.3)}50%{box-shadow:0 0 0 1px #092b6a,0 0 0 8px rgba(255,183,3,.45)}}',
    'body.smTopo .bar .actions{margin-right:196px!important}',
    'body.smTopo header .badge{margin-right:190px}',
    '#smJanela .cab .mapa{display:block;font:600 14px/1.3 "Barlow",Arial,sans-serif;color:#3d5a8a;margin-top:3px}',
    '#smDica.topo{position:absolute;bottom:auto}',
    '#smDica.topo::after{bottom:auto;top:-8px;border-top:0;border-bottom:8px solid #092b6a;border-left-color:transparent;border-right-color:transparent}',
    '#smAviso.topo{bottom:auto;top:76px}',
    '#smAviso{position:fixed;right:22px;bottom:104px;z-index:99981;max-width:340px;background:#092b6a;color:#fff;border-radius:10px;padding:10px 14px;font:500 14px/1.4 "Barlow",Arial,sans-serif;box-shadow:0 8px 24px rgba(9,43,106,.3);display:none}',
    '#smAviso.on{display:block}',
    '.sm-oculto{display:none!important}',
    'body.smFlutua{padding-bottom:100px}',
    '@media print{#smBotao,#smAviso,#smDica{display:none!important}}',
    '@keyframes smGira{to{transform:rotate(360deg)}}',
    '@media (prefers-reduced-motion:reduce){#smJanela .st .and .ic{animation:none}}'
  ].join('');
  (document.head || document.documentElement).appendChild(estilo);

  var IC_DRIVE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18a4 4 0 0 1-.6-7.96A6 6 0 0 1 18 9a4.5 4.5 0 0 1 0 9Z"/><path d="M12 16v-5M9.5 13.5 12 11l2.5 2.5"/></svg>';
  var IC_PC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/><path d="M12 7v5M9.5 9.5 12 12l2.5-2.5"/></svg>';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function urlOk(u) { return /^https:\/\//.test(u || '') ? u : ''; }

  /* ---------------- PC ---------------- */
  var clickOriginal = HTMLAnchorElement.prototype.click;
  function baixarNoPc(nome, blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nome;
    a.setAttribute('data-local', '1');
    document.body.appendChild(a);
    clickOriginal.call(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  window.ponteBaixarNoPc = baixarNoPc;

  /* ---------------- Drive ---------------- */
  function paraBase64(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result).split(',')[1] || ''); };
      r.onerror = function () { reject(new Error('falha ao ler o arquivo')); };
      r.readAsDataURL(blob);
    });
  }
  function salvarArquivoNoDrive(nome, blob) {
    return paraBase64(blob).then(function (b64) {
      return new Promise(function (ok, erro) {
        google.script.run.withSuccessHandler(function (r) { ok({ url: r && r.url, nome: (r && r.nome) || nome }); })
          .withFailureHandler(function (e) { erro(e); })
          .salvarArquivo(FERRAMENTA(), nome, blob.type || 'application/octet-stream', b64);
      });
    });
  }

  /* ---------------- materiais de cada ferramenta (botão original que gera o arquivo) ---------------- */
  // id: botão da ferramenta (fica escondido). O painel mostra só os materiais da aba/página aberta:
  // o botão original precisa estar na parte visível da tela (ou, com vista, essa área precisa estar visível).
  // requer: outro botão que precisa estar ativo; precisa: o que fazer antes, quando ainda não dá para gerar.
  var MATERIAIS = {
    'previsao': [
      { id: 'btnPng', nome: 'Mapa do dia', tipo: 'PNG', desc: 'Imagem 300 dpi (3508 × 2480 px)', onde: 'Mapa do dia', aba: '#tabMap' },
      { id: 'btnPdf', nome: 'Mapa do dia', tipo: 'PDF', desc: 'A4 paisagem', onde: 'Mapa do dia', aba: '#tabMap' },
      { id: 'btnSvg', nome: 'Mapa do dia', tipo: 'SVG', desc: 'Vetorial, para edição', onde: 'Mapa do dia', aba: '#tabMap' },
      { id: 'btnBulPdf', nome: 'Boletim', tipo: 'PDF', desc: 'Boletim completo', onde: 'Boletim em PDF', aba: '#tabBul' },
      { id: 'btnCidPdf', nome: 'Previsão por cidade', tipo: 'PDF', desc: 'Uma página por cidade', onde: 'Previsão por cidade', aba: '#tabCid' }
    ],
    'tempo-severo': [
      { id: 'pngBtn', nome: 'Mapa de tempo severo', tipo: 'PNG', desc: 'Imagem 300 dpi' },
      { id: 'kmlBtn', nome: 'Polígonos', tipo: 'KML', desc: 'Para o Google Earth / QGIS' }
    ],
    'chuva': [
      { id: 'pngBtn', nome: 'Mapa de chuva e tendência', tipo: 'PNG', desc: 'Imagem 300 dpi' }
    ],
    'alertas': [
      { id: 'downloadKml', nome: 'Municípios selecionados', tipo: 'KML', desc: 'Contorno dos municípios selecionados no mapa', vista: '#viewMapa', requer: 'create', precisa: 'Selecione os municípios no mapa' },
      { id: 'downloadTxt', nome: 'Alertas do dia', tipo: 'TXT', desc: 'Registro do plantão', vista: '#viewMapa' },
      { seletor: '.alert-card .download-kml', tipo: 'KML', nome: 'KML do alerta', vista: '#viewMapa',   // um item por alerta ativo
        rotulo: function (b) { var c = b.closest('.alert-card'); var t = c && c.querySelector('b'); var h = c && c.querySelector('b + div'); return 'KML do alerta: ' + (t ? t.textContent : '') + (h ? ' · ' + h.textContent.split('•')[0].trim() : ''); } },
      { id: 'baixarRel', nome: 'Prévia do relatório do plantão', tipo: 'PDF', desc: 'Não encerra o plantão', onde: 'Plantão e relatório', aba: '#abaPlantao' }
    ],
    'reservatorios': [
      { id: 'resPng', nome: 'Reservatórios', tipo: 'PNG', desc: 'Mapa Week 1', onde: 'Reservatórios · Week 1', aba: '.tab[data-tab=reserv]', precisa: 'Clique em “Gerar mapa” na aba Reservatórios' },
      { id: 'resCsv', nome: 'Reservatórios', tipo: 'CSV', desc: 'Tabela de precipitação', onde: 'Reservatórios · Week 1', aba: '.tab[data-tab=reserv]', precisa: 'Clique em “Gerar mapa” na aba Reservatórios' },
      { id: 'wk1Png', nome: 'Tendência Week 1', tipo: 'PNG', onde: 'Tendência · Week 1 + Week 2', aba: '.tab[data-tab=weekly]', precisa: 'Clique em “Gerar Week 1 + Week 2”' },
      { id: 'wk2Png', nome: 'Tendência Week 2', tipo: 'PNG', onde: 'Tendência · Week 1 + Week 2', aba: '.tab[data-tab=weekly]', precisa: 'Clique em “Gerar Week 1 + Week 2”' },
      { id: 'a24Png', nome: 'Acumulado 24 h', tipo: 'PNG', onde: 'Acumulados · 24h / 3 dias / 5 dias', aba: '.tab[data-tab=accum]', precisa: 'Gere os acumulados na aba Acumulados' },
      { id: 'a72Png', nome: 'Acumulado 3 dias', tipo: 'PNG', onde: 'Acumulados · 24h / 3 dias / 5 dias', aba: '.tab[data-tab=accum]', precisa: 'Gere os acumulados na aba Acumulados' },
      { id: 'a120Png', nome: 'Acumulado 5 dias', tipo: 'PNG', onde: 'Acumulados · 24h / 3 dias / 5 dias', aba: '.tab[data-tab=accum]', precisa: 'Gere os acumulados na aba Acumulados' }
    ]
  };
  function materiais() {
    var lst = [];
    (MATERIAIS[FERRAMENTA()] || []).forEach(function (m) {
      if (!m.seletor) return lst.push(m);
      [].slice.call(document.querySelectorAll(m.seletor)).forEach(function (b) {
        lst.push({ el: b, nome: m.rotulo ? m.rotulo(b) : m.nome, tipo: m.tipo, desc: m.desc, vista: m.vista });
      });
    });
    return lst;
  }
  function visivel(el) { return !!(el && el.getClientRects().length); }
  function situacao(m) {
    var b = m.el || document.getElementById(m.id);
    if (!b) return { fora: true };
    var aqui = m.vista ? visivel(document.querySelector(m.vista)) : (!b.hidden && visivel(b.parentElement));
    if (!aqui) return { fora: true };   // material de outra aba: não aparece
    var r = m.requer && document.getElementById(m.requer);
    if (r && r.disabled) return { ok: false, motivo: m.precisa || 'indisponível agora' };
    if (b.disabled) return { ok: false, motivo: m.precisa || 'gere o material primeiro' };
    return { ok: true, b: b };
  }

  /* ---------------- prévia do mapa (da aba aberta) ---------------- */
  // seletores dos mapas/páginas que a ferramenta mostra na tela; aparece a que estiver visível.
  var PREVIAS = {
    'previsao': [['#paper svg', 'Mapa do dia'], ['#bPages .a4 svg', 'Boletim (página 1)'], ['#cPages .a4 svg', 'Previsão por cidade (página 1)']],
    'tempo-severo': [['#lmPainel [data-folha]', 'Mapa final', layoutAoVivo]],
    'chuva': [['#lmPainel [data-folha]', 'Mapa final', layoutAoVivo]],
    'alertas': [['#mapSvg', 'Mapa de alertas'], ['#relPages .a4 svg', 'Relatório (página 1)']],
    'reservatorios': [['#resCanvas', 'Reservatórios'], ['#wk1Canvas', 'Week 1'], ['#wk2Canvas', 'Week 2'],
      ['#a24Canvas', '24 h'], ['#a72Canvas', '3 dias'], ['#a120Canvas', '5 dias']]
  };
  // Tempo Severo e Chuva: o "Mapa final" só é desenhado quando aparece na tela; se ainda não foi,
  // a prévia é montada na hora com o mesmo layout (sem o mapa base, que demora a carregar).
  function layoutAoVivo() {
    try { if (window.LayoutMapa && typeof window.opcoesMapa === 'function') return LayoutMapa.svg(window.opcoesMapa()); } catch (e) { }
    return '';
  }
  function copiaDaTela(el) {   // devolve o desenho (svg, img ou canvas) que está dentro de el
    var d = /^(svg|img|canvas)$/i.test(el.tagName) ? el : el.querySelector('svg, img, canvas');
    if (!d || !d.getClientRects().length) return null;
    if (/canvas/i.test(d.tagName)) { var i = new Image(); try { i.src = d.toDataURL('image/png'); } catch (e) { return null; } return i; }
    var c = d.cloneNode(true);       // cópia do que está na tela (mesmos mapas base e camadas)
    c.removeAttribute('id');
    if (/svg/i.test(d.tagName)) {
      c.removeAttribute('width'); c.removeAttribute('height');
      if (!c.getAttribute('viewBox')) { var r = d.getBoundingClientRect(); c.setAttribute('viewBox', '0 0 ' + Math.round(r.width) + ' ' + Math.round(r.height)); }
      c.removeAttribute('style');
    }
    return c;
  }
  function desenharPrevias() {
    var box = fundo.querySelector('.prev');
    box.innerHTML = '';
    var achou = 0;
    (PREVIAS[FERRAMENTA()] || []).forEach(function (pv) {
      var el = document.querySelector(pv[0]);
      if (!visivel(el)) return;
      var c = copiaDaTela(el);
      if (!c && pv[2]) { var h = pv[2](); if (h) { var t = document.createElement('div'); t.innerHTML = h; c = t.querySelector('svg'); if (c) { c.removeAttribute('width'); c.removeAttribute('height'); } } }
      if (!c) return;
      c.setAttribute('aria-hidden', 'true');
      var f = document.createElement('figure');
      f.appendChild(c);
      var cap = document.createElement('figcaption'); cap.textContent = pv[1]; f.appendChild(cap);
      box.appendChild(f); achou++;
    });
    box.className = 'prev' + (achou > 1 ? ' duas' : '');
    box.hidden = !achou;
  }
  function esconderBotoes() {
    materiais().forEach(function (m) { var b = m.el || document.getElementById(m.id); if (b && !b.classList.contains('sm-oculto')) b.classList.add('sm-oculto'); });
  }

  /* ---------------- painel ---------------- */
  var fundo, janela, lista, mats, resumo, botao, contador, aviso, itens = [], esperando = null;
  var IC_SALVAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h11l3 3v15H5z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/></svg>';
  function montar() {
    if (fundo) return;
    fundo = document.createElement('div');
    fundo.id = 'smFundo';
    fundo.innerHTML = '<div id="smJanela" role="dialog" aria-modal="true" aria-labelledby="smTitulo">' +
      '<div class="cab"><h2 id="smTitulo">Opções de salvamento<span class="mapa"></span></h2>' +
      '<svg class="rs" viewBox="0 0 218 64" preserveAspectRatio="none" aria-hidden="true"><path d="M42 0H218V64H0Z" fill="#006cbf"/><path d="M42 0H83L40 64H0Z" fill="#a9e0f4"/><path d="M83 0H121L78 64H40Z" fill="#078fd2"/></svg></div>' +
      '<div class="sec"><h3>1. Gerar material <span class="aqui">· desta aba</span></h3><div class="prev" hidden></div><div class="mats"></div></div>' +
      '<div class="sec"><h3>2. Salvar no Drive ou no PC</h3><div class="itens"></div></div>' +
      '<div class="rod"><div class="resumo" aria-live="polite"></div><button type="button" class="bt fechar">Fechar</button></div></div>';
    document.body.appendChild(fundo);
    janela = fundo.querySelector('#smJanela');
    lista = fundo.querySelector('.itens');
    mats = fundo.querySelector('.mats');
    resumo = fundo.querySelector('.resumo');
    fundo.querySelector('.fechar').onclick = fechar;
    fundo.addEventListener('click', function (e) { if (e.target === fundo) fechar(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && fundo.classList.contains('on')) fechar(); });
  }
  function fechar() { fundo.classList.remove('on'); if (botao) botao.focus(); }
  function tipoDe(nome) { var m = /\.([a-z0-9]+)$/i.exec(nome || ''); return m ? m[1].toUpperCase() : 'ARQ'; }

  var NOMES = { 'previsao': 'Previsão diária', 'tempo-severo': 'Tempo Severo', 'chuva': 'Chuva e Tendência', 'alertas': 'Alertas', 'reservatorios': 'Reservatórios e Tendência' };
  function nomeDoMapa() {   // ferramenta · aba aberta (ex.: "Previsão diária · Boletim em PDF")
    var aba = document.querySelector('[role=tab][aria-selected=true], .tab.active');
    var t = aba ? aba.textContent.replace(/\s+/g, ' ').trim() : '';
    return (NOMES[FERRAMENTA()] || '') + (t ? ' · ' + t : '');
  }
  function desenharMateriais() {
    fundo.querySelector('.cab .mapa').textContent = nomeDoMapa();
    mats.innerHTML = '';
    desenharPrevias();
    var lst = materiais().filter(function (m) { return !situacao(m).fora; });
    if (!lst.length) { mats.innerHTML = '<p class="vazio">Nesta aba não há material para salvar. Os materiais aparecem de acordo com a aba aberta.</p>'; return; }
    lst.forEach(function (m) {
      var s = situacao(m);
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'mat'; b.disabled = !s.ok;
      b.innerHTML = '<span class="tipo">' + esc(m.tipo) + '</span><span class="tx">' + esc(m.nome) +
        '<small>' + esc(!s.ok ? s.motivo : (m.desc || '')) + '</small></span>' + (s.ok ? '<span class="ger">Gerar</span>' : '');
      b.onclick = function () { gerar(m); };
      mats.appendChild(b);
    });
  }
  function gerar(m) {
    var s = situacao(m); if (!s.ok) { desenharMateriais(); return; }
    disparar(m, s.b);
  }
  function disparar(m, b) {
    // fecha o painel enquanto a ferramenta gera (avisos de validação aparecem na própria página);
    // quando o arquivo fica pronto, o painel reabre sozinho com ele na lista.
    fundo.classList.remove('on');
    avisar('Gerando ' + m.nome + ' (' + m.tipo + ')…');
    var meu = esperando = { m: m };
    setTimeout(function () {
      if (esperando === meu) { esperando = null; avisar('Nenhum arquivo foi gerado. Confira o aviso na página (pode faltar preencher algo) e tente de novo.', 7000); }
    }, 12000);
    b.click();
  }
  var tAviso;
  function avisar(t, ms) {
    if (!aviso) return;
    aviso.textContent = t; aviso.classList.add('on');
    clearTimeout(tAviso);
    if (ms) tAviso = setTimeout(function () { aviso.classList.remove('on'); }, ms);
  }

  function linhaDrive(it) {
    var d = it.drive;
    if (d.estado === 'ok') {
      var u = urlOk(d.url);
      return '<li class="ok"><span class="ic">✓</span><span><b>Drive:</b> salvo' + (u ? ' — <a href="' + esc(u) + '" target="_blank" rel="noopener">abrir ' + esc(d.nome || it.nome) + '</a>' : '') + (d.texto ? ' ' + esc(d.texto) : '') + '</span></li>';
    }
    if (d.estado === 'and') return '<li class="and"><span class="ic"></span><span><b>Drive:</b> salvando…</span></li>';
    if (d.estado === 'err') return '<li class="err"><span class="ic">!</span><span><b>Drive:</b> não foi salvo (' + esc(d.erro) + '). Tente de novo.</span></li>';
    if (d.estado === 'semdrive') return '<li class="err"><span class="ic">!</span><span><b>Drive:</b> esta plataforma de teste não está ligada ao Drive. Na plataforma oficial, este botão salva no Drive da equipe.</span></li>';
    return '<li class="pend"><span class="ic"></span><span><b>Drive:</b> ainda não foi salvo no Drive.</span></li>';
  }
  function linhaPc(it) {
    if (it.pc) return '<li class="ok"><span class="ic">✓</span><span><b>PC:</b> salvo no computador (pasta Downloads, ou a que o navegador pedir).</span></li>';
    return '<li class="pend"><span class="ic"></span><span><b>PC:</b> ainda não foi salvo no PC.</span></li>';
  }
  function desenhar(novo) {
    if (!fundo) return;
    lista.innerHTML = '';
    if (!itens.length) lista.innerHTML = '<p class="vazio">Nenhum arquivo gerado ainda. Escolha um material acima.</p>';
    itens.slice().reverse().forEach(function (it) {
      var el = document.createElement('div');
      el.className = 'it' + (it === novo ? ' novo' : '');
      var andando = it.drive.estado === 'and', driveFeito = it.drive.estado === 'ok';
      el.innerHTML = '<div class="nome"><span class="tipo">' + esc(tipoDe(it.nome)) + '</span><span>' + esc(it.nome) + '</span></div>' +
        (it.nota ? '<p class="nota">' + esc(it.nota) + '</p>' : '') +
        '<div class="bts"><button type="button" class="bt pri" data-a="drive"' + (andando || driveFeito ? ' disabled' : '') + '>' + IC_DRIVE + (driveFeito ? 'Salvo no Drive' : 'Salvar no Drive') + '</button>' +
        '<button type="button" class="bt pri" data-a="pc">' + IC_PC + (it.pc ? 'Salvar no PC de novo' : 'Salvar no PC') + '</button></div>' +
        '<ul class="st">' + linhaDrive(it) + linhaPc(it) + '</ul>';
      el.querySelector('[data-a=drive]').onclick = function () { salvarDrive(it); };
      el.querySelector('[data-a=pc]').onclick = function () { baixarNoPc(it.nome, it.blob); it.pc = true; desenhar(); };
      lista.appendChild(el);
    });
    resumo.innerHTML = itens.length ? itens.slice().reverse().map(textoResumo).join('<br>') : 'Nada salvo ainda nesta sessão.';
    contar();
  }
  function pendente(it) { return it.drive.estado !== 'ok' && !it.pc; }   // gerado, mas ainda não salvo em lugar nenhum
  function contar() {
    if (!contador) return;
    var n = itens.filter(pendente).length;
    contador.textContent = n; contador.hidden = !n;
    botao.classList.toggle('pend', n > 0);
    botao.title = n ? n + ' arquivo(s) gerado(s) ainda não salvo(s) em lugar nenhum' : 'Gerar e salvar materiais (Drive ou PC)';
  }
  function textoResumo(it) {
    var n = '<b>' + esc(it.nome) + '</b>', d = it.drive.estado === 'ok', p = it.pc;
    if (d && p) return n + ': salvo no Drive e no PC.';
    if (d) return n + ': salvo no Drive. <b>Ainda não foi salvo no PC.</b>';
    if (p) return n + ': salvo no PC. <b>Ainda não foi salvo no Drive.</b>';
    if (it.drive.estado === 'and') return n + ': salvando no Drive…';
    return n + ': <b>ainda não foi salvo</b> no Drive nem no PC.';
  }
  function salvarDrive(it) {
    if (!it.salvarDrive && !temAppsScript()) { it.drive = { estado: 'semdrive' }; desenhar(); return; }
    it.drive = { estado: 'and' }; desenhar();
    var p = it.salvarDrive ? paraBase64(it.blob).then(function (b64) { return it.salvarDrive(it.blob, b64); }) : salvarArquivoNoDrive(it.nome, it.blob);
    acompanhar(it, p);
  }
  function acompanhar(it, p) {
    Promise.resolve(p).then(function (r) {
      it.drive = { estado: 'ok', url: r && r.url, nome: (r && r.nome) || it.nome, texto: r && r.texto };
      if (itens.indexOf(it) >= 0) desenhar();
    }, function (e) {
      it.drive = { estado: 'err', erro: (e && e.message) ? e.message : String(e || 'erro') };
      if (itens.indexOf(it) >= 0) desenhar();
    });
  }

  function abrirPainel() {
    montar();
    desenharMateriais();
    desenhar();
    fundo.classList.add('on');
    var b = mats.querySelector('.mat:not([disabled])') || fundo.querySelector('.fechar');
    if (b) b.focus();
  }
  // chamado quando um arquivo fica pronto (pelo painel, pela ferramenta ou pelos Alertas)
  function abrir(o) {
    if (!o || !o.blob) return;
    montar();
    esperando = null;
    if (aviso) aviso.classList.remove('on');
    var it = { nome: o.nome || 'arquivo', blob: o.blob, nota: o.nota || '', pc: false, salvarDrive: o.salvarDrive || null, drive: { estado: 'pend' } };
    if (o.driveFeito) it.drive = { estado: 'ok', url: o.driveFeito.url, nome: o.driveFeito.nome || it.nome, texto: o.driveFeito.texto };
    itens = itens.filter(function (x) { return x.nome !== it.nome; });
    itens.push(it);
    if (itens.length > 12) itens = itens.slice(-12);
    if (o.drivePromessa) { it.drive = { estado: 'and' }; acompanhar(it, o.drivePromessa); }
    desenharMateriais();
    desenhar(it);
    fundo.classList.add('on');
    var b = lista.querySelector('.it [data-a=' + (it.drive.estado === 'ok' ? 'pc' : 'drive') + ']');
    if (b && !b.disabled) b.focus();
    return it;
  }

  /* ---------------- "Salvar neste navegador" (mesmo nome em todas as ferramentas) ---------------- */
  // Guarda o que foi preenchido/desenhado só neste navegador; não gera arquivo, por isso fica no layout.
  // Alertas: o app-drive.js expõe window.salvarNoNavegador (rascunho do plantão).
  function padronizarNavegador() {
    ['btnSave', 'saveBtn'].forEach(function (id) {
      var b = document.getElementById(id); if (!b || b.getAttribute('data-sm') === '1') return;
      [].slice.call(b.childNodes).forEach(function (n) { if (n.nodeType === 3) n.remove(); });
      b.appendChild(document.createTextNode((b.querySelector('svg') ? ' ' : '') + 'Salvar neste navegador'));
      b.title = 'Guarda o que você preencheu/desenhou neste navegador (não gera arquivo)';
      b.setAttribute('data-sm', '1');
    });
    // Alertas: o rascunho já é guardado sozinho; o botão guarda na hora e confirma
    if (FERRAMENTA() === 'alertas' && typeof window.salvarNoNavegador === 'function' && !document.getElementById('smNavegador')) {
      var ref = document.getElementById('novo');
      if (ref && ref.parentElement) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'btn'; b.id = 'smNavegador';
        b.innerHTML = IC_SALVAR + ' Salvar neste navegador';
        b.title = 'Guarda o plantão (alertas e campos do relatório) neste navegador (não gera arquivo)';
        b.onclick = function () { window.salvarNoNavegador(); avisar('Plantão guardado neste navegador.', 3500); };
        ref.parentElement.insertBefore(b, ref);
      }
    }
  }

  /* ---------------- botão "OPÇÕES DE SALVAMENTO" (no cabeçalho, canto superior direito, em todas) ---------------- */
  // Fica no canto superior direito do cabeçalho de cada ferramenta (sobre a faixa azul), para nunca cobrir mapa ou legenda.
  function lugarDoBotao() {
    return document.querySelector('body > .bar') ||    // Previsão, Tempo Severo, Chuva, Alertas (barra do topo)
      document.querySelector('body > header');         // Reservatórios
  }
  var IC_BAIXAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v3h16v-3"/></svg>';
  // dica ao abrir a ferramenta, até a pessoa usar o botão 3 vezes neste navegador
  var CHAVE_DICA = 'smDicaUsos', dica;
  function usos() { try { return +localStorage.getItem(CHAVE_DICA) || 0; } catch (e) { return 0; } }
  function mostrarDica() {
    if (usos() >= 3) return;
    dica = document.createElement('div');
    dica.id = 'smDica'; dica.setAttribute('role', 'note');
    dica.innerHTML = 'Para <b>salvar o mapa</b> (PNG, PDF, KML…) <b>no Drive ou no PC</b>, use este botão.<button type="button" aria-label="Fechar dica">&times;</button>';
    dica.querySelector('button').onclick = function () { tirarDica(false); };
    document.body.appendChild(dica);
    if (botao.classList.contains('topo')) {   // balão logo abaixo do botão, apontando para ele
      var r = botao.getBoundingClientRect();
      dica.classList.add('topo');
      dica.style.top = (r.bottom + window.scrollY + 12) + 'px';
      dica.style.right = Math.max(8, document.documentElement.clientWidth - r.right) + 'px';
    }
    setTimeout(function () { tirarDica(false); }, 12000);
  }
  function tirarDica(usou) {
    if (dica) { dica.remove(); dica = null; }
    if (usou) { try { localStorage.setItem(CHAVE_DICA, String(usos() + 1)); } catch (e) { } }
  }
  function iniciar() {
    esconderBotoes();
    padronizarNavegador();
    [1500, 4000, 9000].forEach(function (t) { setTimeout(padronizarNavegador, t); });   // Alertas termina de iniciar depois
    if (!document.getElementById('smBotao')) {
      botao = document.createElement('button');
      botao.type = 'button'; botao.id = 'smBotao';
      botao.innerHTML = '<span class="ico">' + IC_BAIXAR + '</span><span class="tx">OPÇÕES DE<br>SALVAMENTO<small>Salvar mapas e arquivos · Drive ou PC</small></span><span class="n" hidden>0</span>';
      botao.setAttribute('aria-label', 'Opções de salvamento: salvar mapas e arquivos no Drive ou no PC');
      botao.onclick = function () { tirarDica(true); abrirPainel(); };
      contador = botao.querySelector('.n');
      var lugar = lugarDoBotao();
      if (lugar) { botao.classList.add('topo'); lugar.appendChild(botao); document.body.classList.add('smTopo'); }
      else { document.body.appendChild(botao); document.body.classList.add('smFlutua'); }   // sem cabeçalho: canto inferior direito
      aviso = document.createElement('div');
      aviso.id = 'smAviso'; aviso.setAttribute('role', 'status');
      if (lugar) aviso.classList.add('topo');
      document.body.appendChild(aviso);
      contar();
      mostrarDica();
    }
    // botões que a ferramenta cria ou recria depois: esconde de novo
    try { new MutationObserver(esconderBotoes).observe(document.body, { childList: true, subtree: true }); } catch (e) { }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();

  window.SalvarMaterial = { abrir: abrir, abrirPainel: abrirPainel, baixarNoPc: baixarNoPc, materiais: MATERIAIS };

  /* ---------------- intercepta os downloads das ferramentas ---------------- */
  HTMLAnchorElement.prototype.click = function () {
    if (this.hasAttribute('download') && this.getAttribute('data-local') !== '1' && /^(blob:|data:)/.test(this.href || '')) {
      var nome = this.getAttribute('download') || 'arquivo';
      fetch(this.href).then(function (r) { return r.blob(); }).then(function (blob) { abrir({ nome: nome, blob: blob }); })
        .catch(function () { /* não conseguiu ler: download direto, para nada se perder */ });
      return;
    }
    return clickOriginal.apply(this, arguments);
  };

  /* selo antigo ("Baixar também no PC") deixa de existir: a escolha agora é na janela */
  function tirarSeloAntigo() { var s = document.getElementById('ponteSelo'); if (s) s.hidden = true, s.style.display = 'none'; }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tirarSeloAntigo); else tirarSeloAntigo();
})();
