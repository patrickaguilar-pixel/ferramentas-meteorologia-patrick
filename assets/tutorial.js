/*
 * Tutorial das ferramentas — v1 (2026.10.28).
 * Carregado pela assets/ponte-drive.js em todas as ferramentas (Previsão diária, Tempo Severo,
 * Chuva e Tendência, Alertas e Reservatórios). Não depende do Apps Script.
 *
 * Botão discreto "?" no canto inferior direito da tela. Desligado por padrão; a escolha fica
 * guardada neste navegador. Ligado, aparecem números pequenos ao lado de cada item da aba aberta
 * (a mesma ordem do Guia Rápido). Passar o mouse (ou clicar) no número mostra um balão curto
 * dizendo o que o item faz, e o item fica destacado.
 *
 * Para incluir um item: acrescente {s: 'seletor CSS', t: 'título', d: 'texto curto'} na ferramenta
 * em PASSOS. Itens que não estão visíveis na tela (outra aba, janela fechada) não aparecem.
 */
(function () {
  if (window.TutorialFerramentas) return;
  var FERR = function () { return window.FERRAMENTA || ''; };
  var CHAVE = 'tutorialLigado';

  // seletor que acha o seletor de mapa base ("Fundo") pelo rótulo
  function fundo() {
    var l = [].slice.call(document.querySelectorAll('label, span, b')).filter(function (e) {
      return /^\s*Fundo\b/.test(e.textContent) && e.getClientRects().length && e.textContent.length < 40;
    })[0];
    if (!l) return null;
    return l.closest('label') || l.parentElement;
  }

  var SALVAR = { s: '#smBotao', t: 'Opções de salvamento', d: 'Salva o mapa e os arquivos desta aba no PC e no Drive ao mesmo tempo. A mensagem fica verde quando salvou nos dois.' };
  var NAVEGADOR = { s: '#btnSave, #saveBtn, #smNavegador', t: 'Salvar neste navegador', d: 'Guarda o que você preencheu ou desenhou neste computador. Não gera arquivo.' };
  var FUNDO = { s: fundo, t: 'Fundo do mapa', d: 'Use OSM padrão nos mapas de Minas.' };
  var PLANNER = { s: '#plannerBtn', t: 'Planner da semana', d: 'Quadro com os produtos de cada dia e turno, feriados e anotações da equipe.' };
  // itens do quadro do Planner (aparecem quando ele está aberto)
  var QUADRO = [
    { s: '.pln-sem', t: 'Semana', d: '‹ e › trocam de semana. ● volta para a semana atual.' },
    { s: '.pln-leg', t: 'Legenda', d: 'Fixo, extra do dia e especial (com data). “Envio: só CEDEC” quando a entrega cai em fim de semana ou feriado.' },
    { s: '.pln-cel.agora', t: 'Turno atual', d: 'O que precisa ser feito agora.' },
    { s: '.pln-cel.n .pln-ent', t: 'Noturno', d: 'Fica no dia em que começa. “Entrega” mostra para qual manhã é o boletim.' },
    { s: '.pln-anot', t: 'Anotações', d: 'Regras que valem para todos os produtos.' },
    { s: '[data-modo=editar]', t: 'Editar', d: 'Só para quem está autorizado: muda produtos, feriados e anotações na planilha.' },
    { s: '.pln-modal [data-fechar]', t: 'Fechar', d: 'Ou tecla Esc.' }
  ];
  // itens do painel "Opções de salvamento" (aparecem quando ele está aberto)
  var PAINEL = [
    { s: '#smJanela .prev', t: 'Prévia', d: 'O mapa da aba aberta, como vai ser salvo.' },
    { s: '#smJanela .salvar', t: 'Salvar no PC e no Drive', d: 'Gera o arquivo e salva nos dois lugares ao mesmo tempo. Só aparecem os materiais desta aba.' },
    { s: '#smJanela .res', t: 'Resultado', d: 'Verde: salvo no PC e no Drive. Laranja: salvo só em um (tente o Drive de novo). Vermelho: não foi salvo.' },
    { s: '#smJanela .fechar', t: 'Fechar', d: 'Ou tecla Esc.' }
  ];

  var PASSOS = {
    'previsao': [
      { s: '#date', t: 'Data da previsão', d: 'Dia da previsão.' },
      { s: '#valTime', t: 'Validade', d: 'Já vem com 10h do dia seguinte.' },
      { s: '#rows .trow .cond', t: 'Condição do tempo', d: 'Escolha o ícone de cada cidade.' },
      { s: '#rows .trow .wmx', t: 'Máxima e mínima', d: 'Ex.: 30 ou 18,5. A tecla Tab avança para o próximo campo.' },
      { s: '#bulkCond', t: 'Várias cidades de uma vez', d: 'Marque as linhas e aplique a mesma condição a todas.' },
      { s: '#paper', t: 'Mapa', d: 'Atualiza sozinho. Ícone cobrindo um nome: arraste o ícone.' },
      { s: '#bDate', t: 'Data por extenso', d: 'Automática.' },
      { s: '#bVal', t: 'Período de vigência', d: 'Automático: 10h do dia seguinte.' },
      { s: '#bBlocks, #bParas', t: 'Blocos do PDF', d: 'Na ordem do PDF. Ícones, Tempo Severo e Chuva já vêm; as setas mudam a ordem. Escreva os parágrafos de cada bloco.' },
      { s: '#bAddMapa', t: 'Adicionar mapa', d: 'Para o que varia no dia (ex.: tendência, fim de semana). Os mapas vêm do Drive ou do computador.' },
      { s: 'button[data-ins="Nível 1"]', t: 'Botões Inserir', d: '°C, Nível 1, regiões e cores, sempre escritos do mesmo jeito.' },
      { s: '#cBtnImport', t: 'Puxar do Mapa do dia', d: 'Traz o ícone e as temperaturas de cada cidade.' },
      { s: '#cTempsSeg', t: 'Temperatura no PDF', d: 'Máxima, mínima ou as duas.' },
      { s: '#cList > *:first-child', t: 'Chuva e umidade', d: 'Preencha se houver. Só "até" = "Até 5 mm"; os dois = "15 a 30 mm".' },
      NAVEGADOR, SALVAR
    ],
    'tempo-severo': [
      { s: '#forecastDate', t: 'Data da previsão', d: 'Dia da previsão.' },
      { s: '#validUntil', t: 'Válido até', d: '10h do dia seguinte.' },
      { s: '#levels', t: 'Categoria', d: 'Comece pela menos severa. A mais severa fica por cima.' },
      { s: '#drawBtn', t: 'Desenhar área', d: 'Clique ponto a ponto no mapa e dê duplo clique para fechar.' },
      { s: '#map', t: 'Mapa', d: 'Clique numa área pronta para editar: arraste os pontos, Enter conclui, Esc cancela.' },
      FUNDO,
      { s: '#copyBtn', t: 'Copiar microrregiões', d: 'Copia a lista para o texto do boletim.' },
      { s: '#modelBtn', t: 'Ver mapa-modelo', d: 'Mostra o mapa de referência.' },
      { s: '#clearBtn', t: 'Limpar tudo', d: 'Apaga todas as áreas desenhadas.' },
      NAVEGADOR, SALVAR
    ],
    'chuva': [
      { s: '#tabChuva', t: 'Previsão de Chuva', d: 'Mapa de chuva do dia.' },
      { s: '#tabTend', t: 'Tendência 48h', d: 'Mapa da tendência para os próximos 2 dias.' },
      { s: '#forecastDate', t: 'Data da previsão', d: 'Dia da previsão.' },
      { s: '#trendDate1', t: '1º e 2º dia', d: 'A validade se ajusta sozinha.' },
      { s: '#validUntil', t: 'Válido até', d: '10h do dia seguinte.' },
      { s: '#levels', t: 'Faixa', d: 'Escolha a faixa de chuva. O maior acumulado fica por cima.' },
      { s: '#drawBtn', t: 'Desenhar área', d: 'Clique ponto a ponto no mapa e dê duplo clique para fechar.' },
      { s: '#map', t: 'Mapa', d: 'Clique numa área pronta para editar: arraste os pontos, Enter conclui, Esc cancela.' },
      FUNDO,
      { s: '#labelEditor', t: 'Textos da legenda', d: 'Mude o nome das faixas, se precisar.' },
      { s: '#clearBtn', t: 'Limpar tudo', d: 'Apaga todas as áreas deste produto.' },
      NAVEGADOR, SALVAR
    ],
    'alertas': [
      { s: '#toolClick', t: 'Selecionar', d: 'Clique em cada município.' },
      { s: '#toolDraw', t: 'Desenho livre', d: 'Contorne a área com o mouse.' },
      { s: '#searchCity', t: 'Localizar município', d: 'Digite o nome e clique em Ir.' },
      { s: '#create', t: 'Criar alerta', d: 'Abre a janela do alerta com os municípios selecionados.' },
      { s: '#activeList', t: 'Alertas ativos', d: 'Alertas do plantão. A cor muda conforme o prazo.' },
      { s: '#type', t: 'Tipo', d: 'Tipo do alerta.' },
      { s: '#duration', t: 'Duração', d: 'Padrão: 2 h.' },
      { s: '#time', t: 'Horário', d: 'Início do alerta (HH:MM).' },
      { s: '#owner', t: 'Responsável', d: 'Marque também os fenômenos.' },
      { s: '#copy', t: 'Copiar mensagem', d: 'Para divulgar.' },
      { s: '#emit', t: 'Emitir alerta', d: 'Registra na planilha e salva o KML no Drive.' },
      { s: '#pResp', t: 'Responsável', d: 'Quem está no plantão.' },
      { s: '#pData', t: 'Data e turno', d: 'Dia e turno do plantão.' },
      { s: '#pInicio', t: 'Entrada e saída', d: 'Horário do plantão.' },
      { s: '#grpIntervalo', t: 'Escala e revezamento', d: 'Início e retorno do descanso, só se houve.' },
      { s: '#grpPublicacao', t: 'Entregas e produtos', d: 'Marque cada produto entregue e o horário.' },
      { s: '#grpInter', t: 'Ocorrências operacionais', d: 'Obrigatório. Registre cada ocorrência, ou que não houve.' },
      { s: '#grpFerr', t: 'Ferramentas utilizadas', d: 'Obrigatório.' },
      { s: '#pPassagem', t: 'Passagem de plantão', d: 'Áreas suscetíveis e pendências.' },
      { s: '#prodOutrosAdd', t: 'Outro produto', d: 'Nome e horário de produto fora da lista.' },
      { s: '#pMapaPrev', t: 'Evidência de Publicação', d: 'Obrigatória: print da tela do SIMGE. Anexe ou cole com Ctrl+V.' },
      { s: 'label:has(#pOutras), #pOutras', t: 'Outras imagens', d: 'Opcional: “+ Imagens” ou Ctrl+V.' },
      { s: '#salvarPlantao', t: 'Salvar passagem e gerar relatório', d: 'Encerra o plantão: o relatório vai para o Drive e para o PC. Depois, confirme o e-mail.' },
      NAVEGADOR, SALVAR
    ],
    'reservatorios': [
      { s: '#cpcCycle', t: 'Ciclo', d: '00Z (≈3h) ou 06Z (≈9h).' },
      { s: '#cpcLoad', t: 'Buscar imagens do CPC', d: 'Gera todos os mapas e preenche as datas.' },
      { s: '.tabs', t: 'Abas', d: 'Reservatórios, Tendência (Week 1 e 2) e Acumulados.' },
      { s: '#resStart', t: 'Período', d: 'Mude só se precisar e clique em Gerar mapa.' },
      { s: '#resGenerate', t: 'Gerar mapa', d: 'Só depois de mudar a data.' },
      { s: '#wkGenerate', t: 'Gerar Week 1 + Week 2', d: 'Só se mudar as imagens ou as datas.' },
      { s: '#accGenerate', t: 'Gerar acumulados', d: 'Só se mudar as imagens ou as datas.' },
      SALVAR
    ]
  };

  /* ---------------- estilo ---------------- */
  var css = document.createElement('style');
  css.textContent = [
    '#tuBotao{position:fixed;right:12px;bottom:12px;z-index:100001;width:34px;height:34px;border-radius:50%;border:1px solid rgba(9,43,106,.25);background:rgba(255,255,255,.85);color:#5f7393;font:700 17px/1 "Barlow",Arial,sans-serif;cursor:pointer;box-shadow:0 2px 8px rgba(9,43,106,.15);display:grid;place-items:center;opacity:.7;transition:opacity .15s}',
    '#tuBotao:hover,#tuBotao:focus-visible{opacity:1}',
    '#tuBotao.on{background:#092b6a;color:#ffb703;border-color:#092b6a;opacity:1}',
    '#tuBotao .rot{position:absolute;right:42px;white-space:nowrap;background:#092b6a;color:#fff;font:600 12.5px/1 "Barlow",Arial,sans-serif;padding:6px 9px;border-radius:7px;opacity:0;pointer-events:none;transition:opacity .15s}',
    '#tuBotao:hover .rot,#tuBotao:focus-visible .rot{opacity:1}',
    '#tuCamada{position:fixed;inset:0;z-index:100010;pointer-events:none}',
    '#tuCamada .tuN{position:fixed;width:22px;height:22px;border-radius:50%;background:#ffb703;color:#092b6a;border:2px solid #092b6a;font:800 12px/18px "Barlow",Arial,sans-serif;text-align:center;cursor:help;pointer-events:auto;box-shadow:0 2px 6px rgba(0,0,0,.25)}',
    '#tuCamada .tuN:hover,#tuCamada .tuN.ativo{background:#092b6a;color:#ffb703;border-color:#ffb703}',
    '#tuCamada .tuAlvo{position:fixed;border:2px dashed #ffb703;border-radius:8px;box-shadow:0 0 0 3px rgba(9,43,106,.25);display:none}',
    '#tuCamada .tuBalao{position:fixed;max-width:280px;background:#092b6a;color:#fff;border-radius:10px;padding:10px 13px;font:400 14px/1.4 "Barlow",Arial,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.3);display:none}',
    '#tuCamada .tuBalao b{display:block;color:#ffb703;font-weight:700;margin-bottom:2px}',
    '#tuAviso{position:fixed;right:54px;bottom:12px;z-index:100002;max-width:300px;background:#092b6a;color:#fff;border-radius:10px;padding:10px 13px;font:400 14px/1.4 "Barlow",Arial,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.3)}',
    '#tuAviso b{color:#ffb703}',
    '@media print{#tuBotao,#tuCamada,#tuAviso{display:none!important}}'
  ].join('');
  (document.head || document.documentElement).appendChild(css);

  var botao, camada, alvo, balao, ligado = false, timer = 0, fixo = null;

  function lerLigado() { try { return localStorage.getItem(CHAVE) === '1'; } catch (e) { return false; } }
  function gravar(v) { try { localStorage.setItem(CHAVE, v ? '1' : '0'); } catch (e) { } }
  function visivel(el) {
    if (!el || !el.getClientRects().length) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
  }
  // janela aberta por cima (painel de salvamento, janela do alerta…): só os itens de dentro dela
  function janelaAberta() {
    var f = document.getElementById('smFundo');
    if (f && f.classList.contains('on')) return f;
    return [].slice.call(document.querySelectorAll('[aria-modal="true"]')).filter(visivel)[0] || null;
  }
  function achar(p) {
    if (typeof p.s === 'function') return p.s();
    var l = [].slice.call(document.querySelectorAll(p.s));
    return l.filter(visivel)[0] || null;
  }

  function desenhar() {
    if (!ligado) return;
    var topo = janelaAberta(), n = 0, usados = [];
    [].slice.call(camada.querySelectorAll('.tuN')).forEach(function (x) { x.remove(); });
    (PASSOS[FERR()] || []).concat([PLANNER], PAINEL, QUADRO).forEach(function (p) {
      var el = achar(p);
      if (!el || usados.indexOf(el) >= 0) return;
      if (topo && !topo.contains(el)) return;
      if (!topo && el.closest('#smFundo')) return;
      usados.push(el);
      var r = el.getBoundingClientRect(), num = ++n;
      var m = document.createElement('span');
      m.className = 'tuN' + (fixo && fixo.p === p ? ' ativo' : '');
      m.textContent = num;
      m.tabIndex = 0;
      m.setAttribute('role', 'button');
      m.setAttribute('aria-label', num + '. ' + p.t + (p.d ? ': ' + p.d : ''));
      var grande = r.width > 300 && r.height > 200;
      var x = grande ? r.right - 32 : r.left - 9, y = grande ? r.top + 8 : r.top - 9;   // áreas grandes (mapa): canto superior direito, por dentro
      m.style.left = Math.max(2, Math.min(innerWidth - 24, x)) + 'px';
      m.style.top = Math.max(2, Math.min(innerHeight - 24, y)) + 'px';
      m.onmouseenter = m.onfocus = function () { mostrar(p, el, m); };
      m.onmouseleave = m.onblur = function () { if (!fixo || fixo.p !== p) esconder(); };
      m.onclick = function (e) { e.stopPropagation(); if (fixo && fixo.p === p) { fixo = null; esconder(); } else { fixo = { p: p }; mostrar(p, el, m); } };
      camada.appendChild(m);
      if (fixo && fixo.p === p) mostrar(p, el, m);
    });
  }
  function mostrar(p, el, m) {
    var r = el.getBoundingClientRect();
    alvo.style.cssText = 'display:block;left:' + (r.left - 4) + 'px;top:' + (r.top - 4) + 'px;width:' + (r.width + 8) + 'px;height:' + (r.height + 8) + 'px';
    balao.innerHTML = '<b></b><span></span>';
    balao.querySelector('b').textContent = p.t;
    balao.querySelector('span').textContent = p.d || '';
    balao.style.display = 'block';
    var mr = m.getBoundingClientRect(), bw = balao.offsetWidth, bh = balao.offsetHeight;
    var x = mr.right + 8, y = mr.top - 4;
    if (x + bw > innerWidth - 8) x = mr.left - bw - 8;
    if (x < 8) x = 8;
    if (y + bh > innerHeight - 8) y = innerHeight - bh - 8;
    balao.style.left = x + 'px'; balao.style.top = Math.max(8, y) + 'px';
  }
  function esconder() { alvo.style.display = 'none'; balao.style.display = 'none'; }

  function ligar(v, avisar) {
    ligado = v; gravar(v);
    botao.classList.toggle('on', v);
    botao.setAttribute('aria-pressed', v ? 'true' : 'false');
    botao.querySelector('.rot').textContent = v ? 'Tutorial ligado · clique para desligar' : 'Tutorial · clique para ligar';
    camada.hidden = !v;
    clearInterval(timer); fixo = null; esconder();
    var a = document.getElementById('tuAviso'); if (a) a.remove();
    if (v) {
      desenhar();
      timer = setInterval(desenhar, 600);   // acompanha troca de aba, rolagem e janelas
      if (avisar) {
        a = document.createElement('div'); a.id = 'tuAviso'; a.setAttribute('role', 'status');
        a.innerHTML = '<b>Tutorial ligado.</b> Passe o mouse nos números amarelos para ver o que cada item faz. Para desligar, clique de novo no <b>?</b>.';
        document.body.appendChild(a);
        setTimeout(function () { if (a) a.remove(); }, 9000);
      }
    }
  }

  function iniciar() {
    if (document.getElementById('tuBotao')) return;
    botao = document.createElement('button');
    botao.type = 'button'; botao.id = 'tuBotao';
    botao.innerHTML = '?<span class="rot"></span>';
    botao.setAttribute('aria-label', 'Tutorial: mostra o que cada item da ferramenta faz');
    botao.onclick = function () { ligar(!ligado, true); };
    document.body.appendChild(botao);
    camada = document.createElement('div'); camada.id = 'tuCamada';
    camada.innerHTML = '<div class="tuAlvo"></div><div class="tuBalao" role="tooltip"></div>';
    document.body.appendChild(camada);
    alvo = camada.querySelector('.tuAlvo'); balao = camada.querySelector('.tuBalao');
    document.addEventListener('click', function () { if (fixo) { fixo = null; esconder(); desenhar(); } });
    addEventListener('scroll', function () { if (ligado) { esconder(); desenhar(); } }, true);
    addEventListener('resize', function () { if (ligado) desenhar(); });
    ligar(lerLigado(), false);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();

  window.TutorialFerramentas = { ligar: function (v) { ligar(!!v, false); }, passos: PASSOS };
})();
