/*
 * Ponte para o Drive — v6 (2026.10.28): botão "OPÇÕES DE SALVAMENTO" — salva no PC e no Drive ao mesmo tempo.
 * Usada por Previsão diária, Tempo Severo, Chuva e Tendência, Alertas e Reservatórios.
 *
 * Os botões de exportar das ferramentas saem do layout (ficam escondidos, só para a ponte acioná-los).
 * Em todas as ferramentas aparece o mesmo botão amarelo, no canto superior direito do cabeçalho:
 * "OPÇÕES DE SALVAMENTO". Ele abre um painel com a prévia do mapa da aba aberta e os materiais dessa aba
 * (mapa PNG, PDF, SVG, KML, CSV, TXT…). Cada material tem um botão "Salvar no PC e no Drive":
 * um clique gera o arquivo, baixa no PC e salva no Drive. O resultado aparece em cores:
 *   verde    = salvo no PC e no Drive (com link para o arquivo no Drive);
 *   laranja  = salvo só em um dos dois (diz qual faltou e por quê; "Tentar o Drive de novo");
 *   vermelho = não foi salvo.
 * O que a ferramenta já salva sozinha no Drive (KML na emissão do alerta, relatório final do plantão)
 * também baixa no PC e mostra o resultado em cores, num aviso no canto da tela.
 *
 * Como chega aqui:
 *   - automático: a ferramenta cria um link de download e chama .click(); a ponte intercepta e salva
 *     (um link com data-local="1" nunca é interceptado: download direto, uso interno da ponte);
 *   - direto: window.SalvarMaterial.abrir({nome, blob, ...}) — usado pelos Alertas e pela Previsão por cidade.
 *     Opções: driveFeito {url, nome, texto} (já salvo no Drive pela própria ferramenta);
 *     drivePromessa (Promise que resolve {url, nome} ou rejeita — salvamento no Drive já em andamento);
 *     salvarDrive (função própria que recebe (blob, base64) e devolve Promise {url, nome}); semPc (não baixar no PC).
 *
 * Drive: usa a MESMA função do Apps Script de antes, google.script.run.salvarArquivo(ferramenta, nome, tipo, base64).
 * Os arquivos do Apps Script (Codigo.gs, SalvarArquivo.gs) não mudam.
 * Fora do Apps Script (painel de testes / GitHub Pages) o arquivo é salvo no PC e o aviso fica laranja:
 * "esta plataforma de teste não está ligada ao Drive". NA PLATAFORMA OFICIAL ELE SALVA NO DRIVE.
 *
 * Depende de window.FERRAMENTA ('previsao', 'tempo-severo', 'chuva', 'alertas', 'reservatorios').
 */
(function () {
  if (window.SalvarMaterial) return;
  var VER = (function () { var c = document.currentScript; var m = c && /[?&]v=([^&]+)/.exec(c.src || ''); return m ? m[1] : 'tu3'; })();
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
    '#smJanela .nome{display:flex;align-items:center;gap:10px;font-weight:700;font-size:16px;word-break:break-all}',
    '#smJanela .tipo{flex:none;font:700 11.5px/1 "Barlow Semi Condensed","Barlow",Arial,sans-serif;letter-spacing:.05em;color:#fff;background:#092b6a;border-radius:5px;padding:4px 6px}',
    '#smJanela .bts{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}',
    '#smJanela .bt{display:inline-flex;align-items:center;gap:8px;border:1px solid #c9dbee;background:#fff;color:#092b6a;border-radius:9px;padding:9px 14px;font:700 15px "Barlow",Arial,sans-serif;cursor:pointer;min-height:40px}',
    '#smJanela .bt:hover{border-color:#006cbf}',
    '#smJanela .bt.pri{background:#006cbf;border-color:#006cbf;color:#fff}',
    '#smJanela .bt.pri:hover{background:#00559a}',
    '#smJanela .bt[disabled]{opacity:.55;cursor:default}',
    '#smJanela .bt svg{width:17px;height:17px;flex:none}',
    '#smJanela .rod{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:12px 18px 16px;border-top:1px solid #e1ebf4;background:#f6fafd;border-radius:0 0 14px 14px}',
    '#smJanela .sec{padding:12px 18px 4px}',
    '#smJanela .sec h3{margin:0 0 8px;font:700 13px/1.2 "Barlow Semi Condensed","Barlow",Arial,sans-serif;letter-spacing:.07em;text-transform:uppercase;color:#3d5a8a}',
    '#smJanela .mats{display:grid;gap:10px}',
    '#smJanela .mat{border:1px solid #c9dbee;border-radius:12px;background:#fff;padding:10px 12px}',
    '#smJanela .mat.info{background:#f3f8fd;border-style:dashed}',
    '#smJanela .mat.info .tipo{background:#5f7393}',
    '#smJanela .mat .ir{padding:8px 14px;border-color:#006cbf;color:#006cbf;background:#fff;font-weight:700}',
    '.sm-destaque{outline:4px solid #ffb703!important;outline-offset:3px;animation:smPisca2 .7s ease-in-out 4}',
    '@keyframes smPisca2{50%{outline-color:#092b6a}}',
    '#smJanela .mat.off{background:#f6f8fb;border-style:dashed;color:#7d8fab}',
    '#smJanela .mat.off .tipo{background:#9fb2c8}',
    '#smJanela .mat .lin{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
    '#smJanela .mat .tx{flex:1;min-width:150px;font:600 15px/1.3 "Barlow",Arial,sans-serif}',
    '#smJanela .mat small{display:block;font-weight:400;font-size:13px;color:#5f7393}',
    '#smJanela .mat .salvar{padding:8px 14px;gap:6px}',
    '#smJanela .mat .salvar svg+svg{margin-left:-2px}',
    '#smJanela .res,#smAviso.ok,#smAviso.parcial,#smAviso.erro,#smAviso.and{font:500 14px/1.4 "Barlow",Arial,sans-serif}',
    '#smJanela .res{margin-top:10px;border-radius:9px;padding:9px 12px;border:1px solid}',
    '.res.ok,#smJanela .resumo.ok,#smAviso.ok{background:#e7f6ec!important;border-color:#2e8b57!important;color:#14532d!important}',
    '.res.parcial,#smJanela .resumo.parcial,#smAviso.parcial{background:#fff3e0!important;border-color:#e07b00!important;color:#7a3e00!important}',
    '.res.erro,#smJanela .resumo.erro,#smAviso.erro{background:#fdecec!important;border-color:#c62828!important;color:#7f1d1d!important}',
    '.res.and,#smJanela .resumo.and,#smAviso.and{background:#eaf3fb!important;border-color:#7fb3e0!important;color:#0b3a75!important}',
    '#smJanela .res a,#smAviso a{color:inherit;font-weight:700;text-decoration:underline}',
    '#smJanela .mini,#smAviso .mini{margin-left:6px;border:1px solid currentColor;background:#fff;color:inherit;border-radius:7px;padding:3px 9px;font:700 13px "Barlow",Arial,sans-serif;cursor:pointer}',
    '#smJanela .res ul.fora{margin:6px 0 8px;padding-left:20px}',
    '#smJanela .res ul.fora li{margin:2px 0}',
    '#smJanela .resumo{font-size:14px;color:#3d5a8a;flex:1;min-width:220px;border:1px solid transparent;border-radius:9px;padding:7px 10px}',
    '#smAviso{border:1px solid transparent}',
    '#smAviso .x{float:right;margin-left:10px;border:0;background:none;color:inherit;font-size:18px;line-height:1;cursor:pointer}',
    '#smJanela .vazio{margin:0;color:#5f7393;font-size:14px}',
    '#smJanela .sec h3 .aqui{text-transform:none;letter-spacing:0;font-weight:600;color:#7d8fab}',
    '#smJanela .prev{display:grid;gap:10px;margin:0 0 10px}',
    '#smJanela .prev.duas{grid-template-columns:1fr 1fr}',
    '#smJanela .prev[hidden]{display:none}',
    '#smJanela .prev figure{margin:0;border:1px solid #d3e4f2;border-radius:10px;background:#f6fafd;padding:8px;overflow:hidden}',
    '#smJanela .prev svg,#smJanela .prev img{display:block;width:100%;height:auto;max-height:260px;object-fit:contain;background:#fff;pointer-events:none}',
    '#smJanela .prev figcaption{font:600 12.5px "Barlow",Arial,sans-serif;color:#5f7393;margin-top:6px}',
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
    'body.smTopo header .top{padding-right:190px}',   /* Reservatórios: espaço para o botão (o Planner entra no fim de .top) */
    '#smJanela .cab .mapa{display:block;font:600 14px/1.3 "Barlow",Arial,sans-serif;color:#3d5a8a;margin-top:3px}',
    '#smDica.topo{position:absolute;bottom:auto}',
    '#smDica.topo::after{bottom:auto;top:-8px;border-top:0;border-bottom:8px solid #092b6a;border-left-color:transparent;border-right-color:transparent}',
    '#smAviso.topo{bottom:auto;top:76px}',
    '#smAviso{position:fixed;right:22px;bottom:104px;z-index:99981;max-width:440px;background:#092b6a;color:#fff;border-radius:10px;padding:10px 14px;font:500 14px/1.4 "Barlow",Arial,sans-serif;box-shadow:0 8px 24px rgba(9,43,106,.3);display:none}',
    '#smAviso.on{display:block}',
    '.sm-oculto{display:none!important}',
    'body.smFlutua{padding-bottom:100px}',
    '@media print{#smBotao,#smAviso,#smDica,#smTeste{display:none!important}}',
    '#smTeste{position:relative;z-index:6;background:#fff3e0;color:#7a3e00;border-bottom:2px solid #e07b00;padding:6px 14px 6px 30px;font:500 13.5px/1.35 "Barlow",Arial,sans-serif;text-align:center}',
    '#smTeste::before{content:"";position:absolute;left:0;top:0;bottom:0;width:16px;background:repeating-linear-gradient(135deg,#ffb703 0 8px,#092b6a 8px 16px)}',
    '#smTeste b{color:#b71c1c;letter-spacing:.03em}',
    '#smTestePop{position:fixed;inset:0;z-index:99999;background:rgba(80,0,0,.35);display:flex;align-items:center;justify-content:center;padding:16px}',
    '#smTestePop .cx{width:min(440px,100%);background:#fff;border-radius:14px;border-top:10px solid #c62828;box-shadow:0 18px 50px rgba(0,0,0,.4);padding:20px 22px 18px;text-align:center;font:400 15px/1.45 "Barlow",Arial,sans-serif;color:#1f2937}',
    '#smTestePop .ic{width:58px;height:58px;margin:0 auto 6px;border-radius:50%;background:#c62828;color:#fff;display:grid;place-items:center;font:700 30px/1 Arial,sans-serif}',
    '#smTestePop h3{margin:0 0 8px;font:800 22px/1.2 "Barlow",Arial,sans-serif;color:#b71c1c;text-transform:uppercase;letter-spacing:.03em}',
    '#smTestePop p{margin:0 0 8px}',
    '#smTestePop button{margin-top:6px;border:0;border-radius:9px;background:#c62828;color:#fff;font:700 15px "Barlow",Arial,sans-serif;padding:10px 26px;cursor:pointer}',
    '#smTestePop button:hover{background:#a51d1d}',
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
      // o KML do alerta e o relatório final são salvos pelos próprios botões do Alertas: aqui só o aviso de onde fazer
      { info: true, alvo: '#create', tipo: 'KML', nome: 'KML do alerta', vista: '#viewMapa',
        desc: 'É salvo ao emitir o alerta (Drive e PC). Use Criar alerta › Emitir alerta.', botao: 'Ir para Criar alerta' },
      { id: 'downloadTxt', nome: 'Alertas do dia', tipo: 'TXT', desc: 'Registro do plantão', vista: '#viewMapa' },
      { id: 'baixarRel', nome: 'Prévia do relatório do plantão', tipo: 'PDF', desc: 'Não encerra o plantão', onde: 'Plantão e relatório', aba: '#abaPlantao' },
      { info: true, alvo: '#salvarPlantao', tipo: 'PDF', nome: 'Relatório final do plantão', vista: '#viewPlantao',
        desc: 'É salvo ao encerrar o plantão (Drive, PC e e-mail). Use Salvar passagem e gerar relatório.', botao: 'Ir para o botão' }
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
    if (m.info) {
      var a = document.querySelector(m.alvo);
      return (m.vista ? visivel(document.querySelector(m.vista)) : true) && a ? { ok: true, info: true, b: a } : { fora: true };
    }
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
  var SEMPRE_ESCONDER = { 'alertas': ['#downloadKml', '.alert-card .download-kml'] };   // salvos pelo Criar alerta
  function esconderBotoes() {
    (SEMPRE_ESCONDER[FERRAMENTA()] || []).forEach(function (q) { [].slice.call(document.querySelectorAll(q)).forEach(function (b) { if (!b.classList.contains('sm-oculto')) b.classList.add('sm-oculto'); }); });
    materiais().forEach(function (m) { var b = m.el || document.getElementById(m.id); if (b && !b.classList.contains('sm-oculto')) b.classList.add('sm-oculto'); });
  }

  /* ---------------- painel ---------------- */
  // Um clique em "Salvar no PC e no Drive" gera o material e salva nos dois lugares ao mesmo tempo.
  // Resultado: verde = salvo no PC e no Drive; laranja = salvo só em um dos dois; vermelho = não foi salvo.
  var fundo, janela, mats, resumo, botao, aviso, esperando = null, RES = {};
  var IC_SALVAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h11l3 3v15H5z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/></svg>';
  function montar() {
    if (fundo) return;
    fundo = document.createElement('div');
    fundo.id = 'smFundo';
    fundo.innerHTML = '<div id="smJanela" role="dialog" aria-modal="true" aria-labelledby="smTitulo">' +
      '<div class="cab"><h2 id="smTitulo">Opções de salvamento<span class="mapa"></span></h2>' +
      '<svg class="rs" viewBox="0 0 218 64" preserveAspectRatio="none" aria-hidden="true"><path d="M42 0H218V64H0Z" fill="#006cbf"/><path d="M42 0H83L40 64H0Z" fill="#a9e0f4"/><path d="M83 0H121L78 64H40Z" fill="#078fd2"/></svg></div>' +
      '<div class="sec"><div class="prev" hidden></div><div class="mats"></div></div>' +
      '<div class="rod"><div class="resumo" aria-live="polite"></div><button type="button" class="bt fechar">Fechar</button></div></div>';
    document.body.appendChild(fundo);
    janela = fundo.querySelector('#smJanela');
    mats = fundo.querySelector('.mats');
    resumo = fundo.querySelector('.resumo');
    fundo.querySelector('.fechar').onclick = fechar;
    fundo.addEventListener('click', function (e) { if (e.target === fundo) fechar(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && fundo.classList.contains('on')) fechar(); });
  }
  function fechar() { fundo.classList.remove('on'); if (botao) botao.focus(); }
  function aberto() { return !!(fundo && fundo.classList.contains('on')); }

  var NOMES = { 'previsao': 'Previsão diária', 'tempo-severo': 'Tempo Severo', 'chuva': 'Chuva e Tendência', 'alertas': 'Alertas', 'reservatorios': 'Reservatórios e Tendência' };
  function nomeDoMapa() {   // ferramenta · aba aberta (ex.: "Previsão diária · Boletim em PDF")
    var aba = document.querySelector('[role=tab][aria-selected=true], .tab.active');
    var t = aba ? aba.textContent.replace(/\s+/g, ' ').trim() : '';
    return (NOMES[FERRAMENTA()] || '') + (t ? ' · ' + t : '');
  }
  function chave(m) { return m.id || (m.nome + '|' + m.tipo); }
  function htmlRes(r) {
    return '<div class="res ' + r.estado + '" role="status">' + r.html + '</div>';
  }
  function desenharMateriais() {
    fundo.querySelector('.cab .mapa').textContent = nomeDoMapa();
    mats.innerHTML = '';
    desenharPrevias();
    var lst = materiais().filter(function (m) { return !situacao(m).fora; });
    if (!lst.length) { mats.innerHTML = '<p class="vazio">Nesta aba não há material para salvar. Os materiais aparecem de acordo com a aba aberta.</p>'; return; }
    lst.forEach(function (m) {
      var s = situacao(m), r = RES[chave(m)], andando = r && r.estado === 'and';
      if (s.info) {   // material salvo por outro botão da ferramenta: só o aviso e o atalho
        var ei = document.createElement('div');
        ei.className = 'mat info';
        ei.innerHTML = '<div class="lin"><span class="tipo">' + esc(m.tipo) + '</span><span class="tx">' + esc(m.nome) + '<small>' + esc(m.desc) + '</small></span>' +
          '<button type="button" class="bt ir">' + esc(m.botao) + ' ›</button></div>';
        ei.querySelector('.ir').onclick = function () { irPara(s.b); };
        mats.appendChild(ei);
        return;
      }
      var el = document.createElement('div');
      el.className = 'mat' + (s.ok ? '' : ' off');
      el.innerHTML = '<div class="lin"><span class="tipo">' + esc(m.tipo) + '</span><span class="tx">' + esc(m.nome) +
        '<small>' + esc(!s.ok ? s.motivo : (m.desc || '')) + '</small></span>' +
        (s.ok ? '<button type="button" class="bt pri salvar"' + (andando ? ' disabled' : '') + '>' + IC_PC + IC_DRIVE + (andando ? 'Salvando…' : 'Salvar no PC e no Drive') + '</button>' : '') + '</div>' +
        (r ? htmlRes(r) : '');
      var b = el.querySelector('.salvar');
      if (b) b.onclick = function () { gerar(m); };
      ligarAcoes(el, r);
      var ma = el.querySelector('[data-a=assim]'), mc = el.querySelector('[data-a=corrigir]');
      if (ma) ma.onclick = function () { gerar(m, true); };
      if (mc) mc.onclick = function () { delete RES[chave(m)]; fechar(); };
      mats.appendChild(el);
    });
  }
  function ligarAcoes(el, r) {
    var t = el.querySelector('[data-a=drive2]');
    if (t && r && r.it) t.onclick = function () { salvarAmbos(r.it, r.k, true); };
  }
  function irPara(b) {   // fecha o painel e destaca o botão certo da ferramenta
    fechar();
    try { b.scrollIntoView({ block: 'center' }); } catch (e) { }
    b.classList.add('sm-destaque');
    try { b.focus(); } catch (e) { }
    setTimeout(function () { b.classList.remove('sm-destaque'); }, 3500);
  }
  function gerar(m, mesmoAssim) {
    var s = situacao(m); if (!s.ok) { desenharMateriais(); return; }
    var k = chave(m);
    if (!mesmoAssim) {   // confere o padrão antes de salvar
      var fora = foraDoPadrao(m);
      if (fora.length) {
        RES[k] = { estado: 'parcial', html: '<b>Atenção: fora do padrão.</b><ul class="fora">' + fora.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>' +
          '<button type="button" class="mini" data-a="corrigir">Voltar e corrigir</button> <button type="button" class="mini" data-a="assim">Salvar assim mesmo</button>' };
        desenharMateriais();
        return;
      }
    }
    var meu = esperando = { m: m, k: k };
    RES[k] = { estado: 'and', html: 'Gerando o arquivo e salvando no PC e no Drive…' };
    desenharMateriais();
    setTimeout(function () {   // aviso de validação da ferramenta fica na página, atrás do painel
      if (esperando === meu) { RES[k] = { estado: 'and', html: 'Ainda gerando… Se nada acontecer, feche este painel e confira o aviso na página.' }; desenharMateriais(); }
    }, 8000);
    setTimeout(function () {
      if (esperando === meu) {
        esperando = null;
        RES[k] = { estado: 'erro', html: '<b>Não foi salvo:</b> nenhum arquivo foi gerado. Feche este painel, confira o aviso na página (pode faltar preencher algo) e tente de novo.' };
        desenharMateriais();
      }
    }, 60000);
    var antes = avisosDaPagina();
    s.b.click();
    // a ferramenta recusou (falta preencher algo)? mostra o aviso dela aqui, em vermelho, sem esperar
    [700, 1600, 3000].forEach(function (t) {
      setTimeout(function () {
        if (esperando !== meu) return;
        var novo = avisosDaPagina().filter(function (x) { return antes.indexOf(x) < 0; })[0];
        if (!novo) return;
        esperando = null;
        RES[k] = { estado: 'erro', html: '<b>Não foi salvo:</b> ' + esc(novo) };
        desenharMateriais();
      }, t);
    });
  }
  // mensagens de erro visíveis na página da ferramenta (ex.: "Escreva pelo menos um parágrafo")
  function avisosDaPagina() {
    return [].slice.call(document.querySelectorAll('.err, .erro, .error, [class*="msg"].err, [role="alert"]')).filter(function (e) {
      return !e.closest('#smFundo, #smAviso, #smTeste, #tuCamada, #smTestePop') && e.getClientRects().length && e.textContent.trim().length > 3;
    }).map(function (e) { return e.textContent.replace(/\s+/g, ' ').trim().slice(0, 300); });
  }

  /* ---------------- conferência do padrão (antes de salvar) ---------------- */
  // Padrões do Guia Rápido: mapa base OSM padrão; validade às 10h do dia seguinte; nenhuma cidade "Sem informação";
  // imagens do CPC com menos de 36 h. Fora do padrão, o painel avisa e pede confirmação antes de salvar.
  var NOME_FUNDO = { '': 'Nenhum', osm: 'OSM padrão', osmfr: 'OSM França', osmde: 'OSM Alemanha', ofm: 'OpenFreeMap (sem nomes)' };
  function valor(id) { var e = document.getElementById(id); return e ? e.value : null; }
  function maisUmDia(iso) { var d = new Date(iso + 'T12:00:00'); if (isNaN(d)) return ''; d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); }
  function br(iso) { var p = String(iso || '').split('-'); return p.length === 3 ? p[2] + '/' + p[1] : iso; }
  function fundoAtual() {
    if (FERRAMENTA() === 'previsao') {
      var r = document.querySelector('input[name=bgsel]:checked'); if (!r) return null;
      var t = r.parentNode ? r.parentNode.textContent.trim() : '';
      return { id: r.value, nome: NOME_FUNDO[r.value] || t || r.value };
    }
    var sel = document.getElementById('layoutFundo'); if (!sel) return null;
    return { id: sel.value, nome: NOME_FUNDO[sel.value] || (sel.options[sel.selectedIndex] || {}).text || sel.value };
  }
  function ehMapa(m) { return /^(PNG|PDF|SVG)$/.test(m.tipo) && !/cidade/i.test(m.nome) && !(FERRAMENTA() === 'alertas' && m.tipo !== 'PDF'); }
  function foraDoPadrao(m) {
    var f = [], fer = FERRAMENTA();
    if (ehMapa(m) && fer !== 'reservatorios') {
      var fu = fundoAtual();
      if (fu && fu.id !== 'osm') f.push('Mapa base: <b>' + esc(fu.nome) + '</b> (padrão: OSM padrão).');
    }
    if (fer === 'previsao' && ehMapa(m)) {
      var d = valor('date'), vt = valor('valTime'), vd = valor('valDate');
      if (d && vt != null && vd != null && (vt !== '10:00' || vd !== maisUmDia(d)))
        f.push('Validade: <b>' + esc(vt || '—') + ' do dia ' + esc(br(vd)) + '</b> (padrão: 10h do dia ' + esc(br(maisUmDia(d))) + ').');
      if (/Mapa do dia/.test(m.nome)) {
        var sem = [].slice.call(document.querySelectorAll('#rows .trow')).filter(function (r) { return /Sem informa/i.test(r.textContent); }).length;
        if (sem) f.push('<b>' + sem + ' cidade' + (sem > 1 ? 's' : '') + '</b> em “Sem informação”.');
      }
    }
    if ((fer === 'tempo-severo' || fer === 'chuva') && m.tipo === 'PNG') {
      var tend = fer === 'chuva' && (document.querySelector('#tabTend[aria-selected=true], #tabTend.active, #tabTend.on') || /tend/i.test(String(window.product || '')));
      var base = tend ? valor('trendDate2') : valor('forecastDate'), vu = valor('validUntil');
      if (base && vu && vu.slice(0, 16) !== maisUmDia(base) + 'T10:00')
        f.push('Válido até: <b>' + esc(br(vu.slice(0, 10)) + ' ' + vu.slice(11, 16)) + '</b> (padrão: 10h do dia ' + esc(br(maisUmDia(base))) + (tend ? ', dia seguinte ao 2º dia' : '') + ').');
    }
    if (fer === 'reservatorios' && document.querySelector('#cpcVersao .warn')) f.push('Imagens do CPC com <b>mais de 36 h</b>. Confira o ciclo e busque de novo.');
    return f;
  }
  // aviso na hora em que alguém escolhe um mapa base diferente do OSM padrão
  function avisoFundo() {
    setTimeout(function () {
      var fu = fundoAtual();
      if (fu && fu.id !== 'osm' && FERRAMENTA() !== 'reservatorios')
        avisar('<b>Atenção:</b> o mapa base padrão é o <b>OSM padrão</b>. Você escolheu <b>' + esc(fu.nome) + '</b>.', 'parcial', 9000);
    }, 50);
  }
  document.addEventListener('layoutfundo', avisoFundo);
  document.addEventListener('change', function (e) { if (e.target && e.target.name === 'bgsel') avisoFundo(); }, true);

  var tAviso;
  function avisar(html, estado, ms) {   // aviso fora do painel (ex.: KML salvo ao emitir o alerta)
    if (!aviso) return;
    aviso.className = (aviso.classList.contains('topo') ? 'topo ' : '') + 'on ' + (estado || '');
    aviso.innerHTML = '<button type="button" class="x" aria-label="Fechar aviso">&times;</button>' + html;
    aviso.querySelector('.x').onclick = function () { aviso.classList.remove('on'); };
    clearTimeout(tAviso);
    if (ms) tAviso = setTimeout(function () { aviso.classList.remove('on'); }, ms);
    return aviso;
  }
  function mostrarResumo() {
    if (resumo) resumo.innerHTML = 'Um clique salva no <b>PC</b> (pasta Downloads) e no <b>Drive</b> ao mesmo tempo.';
  }

  // salva o arquivo gerado no PC e no Drive ao mesmo tempo e mostra o resultado em cores
  function salvarAmbos(it, k, soDrive) {
    var pc = soDrive ? it.pcOk : false;
    if (!soDrive && !it.semPc) { try { baixarNoPc(it.nome, it.blob); pc = true; } catch (e) { pc = false; } }
    it.pcOk = pc;
    if (it.soPc) {   // tipo que o Drive da equipe não recebe (ex.: .txt dos alertas do dia)
      if (pc) fim(k, it, 'ok', '✓ <b>' + esc(it.nome) + '</b> salvo no PC (pasta Downloads). Este tipo de arquivo fica só no PC.');
      else fim(k, it, 'erro', '<b>' + esc(it.nome) + ' não foi salvo.</b>');
      return;
    }
    var r = RES[k] = { estado: 'and', html: 'Salvando <b>' + esc(it.nome) + '</b> no Drive…', it: it, k: k };
    atualizar(r);
    var p;
    if (it.driveFeito && !soDrive) p = Promise.resolve(it.driveFeito);
    else if (it.drivePromessa && !soDrive) p = it.drivePromessa;
    else if (it.salvarDrive) p = paraBase64(it.blob).then(function (b64) { return it.salvarDrive(it.blob, b64); });
    else if (temAppsScript()) p = salvarArquivoNoDrive(it.nome, it.blob);
    else p = Promise.reject({ semDrive: true });
    Promise.resolve(p).then(function (d) {
      var u = urlOk(d && d.url), lk = u ? ' — <a href="' + esc(u) + '" target="_blank" rel="noopener">abrir no Drive</a>' : '';
      if (pc) fim(k, it, 'ok', '✓ <b>' + esc(it.nome) + '</b> salvo no PC (pasta Downloads) e no Drive' + (d && d.texto ? ' ' + esc(d.texto) : '') + lk + '.');
      else if (it.semPc) fim(k, it, 'ok', '✓ <b>' + esc(it.nome) + '</b> salvo no Drive' + (d && d.texto ? ' ' + esc(d.texto) : '') + lk + '.');
      else fim(k, it, 'parcial', '<b>' + esc(it.nome) + '</b>: salvo no Drive' + lk + ', mas <b>não foi salvo no PC</b>.');
    }, function (e) {
      var motivo = e && e.semDrive ? 'esta plataforma de teste não está ligada ao Drive (na plataforma oficial, salva no Drive da equipe)'
        : ((e && e.message) ? e.message : String(e || 'erro'));
      var tentar = e && e.semDrive ? '' : ' <button type="button" class="mini" data-a="drive2">Tentar o Drive de novo</button>';
      if (pc) fim(k, it, 'parcial', '<b>' + esc(it.nome) + '</b>: salvo no PC (pasta Downloads), mas <b>não foi salvo no Drive</b>: ' + esc(motivo) + '.' + tentar);
      if (e && e.semDrive) alertaTeste(it.nome);
      else fim(k, it, 'erro', '<b>' + esc(it.nome) + ' não foi salvo</b> (Drive: ' + esc(motivo) + ').' + tentar);
    });
  }
  function fim(k, it, estado, html) { atualizar(RES[k] = { estado: estado, html: html, it: it, k: k }); }
  function atualizar(r) {
    var naLista = materiais().some(function (m) { return chave(m) === r.k && !situacao(m).fora; });
    if (aberto() && naLista) desenharMateriais();   // mensagem embaixo do material
    else {   // painel fechado ou arquivo salvo direto pela ferramenta: aviso no canto da tela
      var a = avisar(r.html, r.estado, r.estado === 'ok' ? 9000 : 0);
      if (a) ligarAcoes(a, r);
    }
  }

  function abrirPainel() {
    montar();
    desenharMateriais();
    mostrarResumo();
    fundo.classList.add('on');
    var b = mats.querySelector('.salvar:not([disabled])') || fundo.querySelector('.fechar');
    if (b) b.focus();
  }
  // chamado quando a ferramenta gera um arquivo (pelo painel, pela própria ferramenta ou pelos Alertas)
  // opções: driveFeito {url,nome,texto} (a ferramenta já salvou no Drive), drivePromessa, salvarDrive(blob,b64),
  // semPc (não baixar no PC — ex.: emissão do alerta com "baixar no PC" desligado).
  function abrir(o) {
    if (!o || !o.blob) return;
    montar();
    var k = esperando ? esperando.k : 'auto:' + (o.nome || 'arquivo');
    esperando = null;
    var it = { nome: o.nome || 'arquivo', blob: o.blob, salvarDrive: o.salvarDrive || null, driveFeito: o.driveFeito || null, drivePromessa: o.drivePromessa || null, semPc: !!o.semPc,
      soPc: !o.driveFeito && !o.drivePromessa && !o.salvarDrive && !/\.(png|kml|pdf|svg|csv)$/i.test(o.nome || '') };   // salvarArquivo (SalvarArquivo.gs) só aceita PNG, KML, PDF, SVG e CSV
    salvarAmbos(it, k);
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
        b.setAttribute('data-view', 'plantao');   // aparece na aba Plantão e relatório (o Alertas mostra/esconde pelo data-view)
        var vp = document.getElementById('viewPlantao'); b.hidden = !(vp && vp.getClientRects().length);
        b.innerHTML = IC_SALVAR + ' Salvar neste navegador';
        b.title = 'Guarda o plantão (alertas e campos do relatório) neste navegador (não gera arquivo)';
        b.onclick = function () { window.salvarNoNavegador(); avisar('✓ Plantão guardado neste navegador.', 'ok', 3500); };
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
    dica.innerHTML = 'Para <b>salvar o mapa</b> (PNG, PDF, KML…) <b>no PC e no Drive</b>, use este botão.<button type="button" aria-label="Fechar dica">&times;</button>';
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
  // botão de tutorial ("?", canto inferior direito; desligado por padrão) — assets/tutorial.js
  function carregarTutorial() {
    if (window.TutorialFerramentas || document.getElementById('tuScript')) return;
    var t = document.createElement('script'); t.id = 'tuScript';
    t.src = (window.BASE_DADOS || '../') + 'assets/tutorial.js?v=' + VER;
    document.head.appendChild(t);
  }
  // faixa "versão de testes": só no painel de testes do Patrick (e no computador de quem desenvolve)
  function ehTeste() { return /^(patrickaguilar-pixel\.github\.io|localhost|127\.0\.0\.1)$/.test(location.hostname); }
  // alerta vermelho ao salvar no painel de testes: lembra que não é a plataforma oficial
  function alertaTeste(nome) {
    if (!ehTeste() || window.__SEM_FAIXA_TESTE) return;
    var v = document.getElementById('smTestePop'); if (v) v.remove();
    v = document.createElement('div'); v.id = 'smTestePop';
    v.innerHTML = '<div class="cx" role="alertdialog" aria-modal="true" aria-labelledby="smTesteTit"><div class="ic" aria-hidden="true">⚠</div>' +
      '<h3 id="smTesteTit">Versão de testes</h3>' +
      '<p><b></b> foi salvo <b>só no PC</b>.</p><p>Esta <b>não é a plataforma oficial</b>: aqui nada vai para o Drive da equipe e o que for feito não vale como produto oficial.</p>' +
      '<button type="button">Entendi</button></div>';
    v.querySelector('p b').textContent = nome;
    document.body.appendChild(v);
    var b = v.querySelector('button'); b.onclick = function () { v.remove(); }; b.focus();
    v.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); v.remove(); } });
  }
  function faixaTeste() {
    if (window.__SEM_FAIXA_TESTE || document.getElementById('smTeste')) return;
    if (!ehTeste()) return;
    var f = document.createElement('div');
    f.id = 'smTeste'; f.setAttribute('role', 'note');
    f.innerHTML = '<b>⚠ VERSÃO DE TESTES</b> — não é a plataforma oficial. Nada feito aqui vale como produto oficial e os arquivos não vão para o Drive da equipe.';
    document.body.insertBefore(f, document.body.firstChild);
  }
  function iniciar() {
    faixaTeste();
    carregarTutorial();
    esconderBotoes();
    padronizarNavegador();
    [1500, 4000, 9000].forEach(function (t) { setTimeout(padronizarNavegador, t); });   // Alertas termina de iniciar depois
    if (!document.getElementById('smBotao')) {
      botao = document.createElement('button');
      botao.type = 'button'; botao.id = 'smBotao';
      botao.innerHTML = '<span class="ico">' + IC_BAIXAR + '</span><span class="tx">OPÇÕES DE<br>SALVAMENTO<small>Salvar mapas e arquivos no PC e no Drive</small></span>';
      botao.setAttribute('aria-label', 'Opções de salvamento: salvar mapas e arquivos no PC e no Drive');
      botao.title = 'Salvar mapas e arquivos no PC e no Drive';
      botao.onclick = function () { tirarDica(true); abrirPainel(); };
      var lugar = lugarDoBotao();
      if (lugar) { botao.classList.add('topo'); lugar.appendChild(botao); document.body.classList.add('smTopo'); }
      else { document.body.appendChild(botao); document.body.classList.add('smFlutua'); }   // sem cabeçalho: canto inferior direito
      aviso = document.createElement('div');
      aviso.id = 'smAviso'; aviso.setAttribute('role', 'status');
      if (lugar) aviso.classList.add('topo');
      document.body.appendChild(aviso);
      mostrarDica();
    }
    // botões que a ferramenta cria ou recria depois: esconde de novo
    try { new MutationObserver(esconderBotoes).observe(document.body, { childList: true, subtree: true }); } catch (e) { }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();

  window.SalvarMaterial = { abrir: abrir, abrirPainel: abrirPainel, baixarNoPc: baixarNoPc, materiais: MATERIAIS, avisar: avisar };

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
