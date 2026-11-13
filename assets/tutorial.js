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
      { s: '#valTime', t: 'Validade', d: 'Já vem com 09h do dia seguinte. No mapa: VÁLIDO: 09h DD/MM às 09h DD/MM, hora local.' },
      { s: '#rows .trow .cond', t: 'Condição do tempo', d: 'Escolha o ícone de cada cidade.' },
      { s: '#rows .trow .wmx', t: 'Máxima e mínima', d: 'Ex.: 30 ou 18,5. A tecla Tab avança para o próximo campo.' },
      { s: '#bulkCond', t: 'Várias cidades de uma vez', d: 'Marque as linhas e aplique a mesma condição a todas.' },
      { s: '#paper', t: 'Mapa', d: 'Atualiza sozinho. Ícone cobrindo um nome: arraste o ícone.' },
      { s: '#bDate', t: 'Data por extenso', d: 'Automática.' },
      { s: '#bVal', t: 'Período de vigência', d: 'Automático: 09h do dia seguinte.' },
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
      { s: '#validUntil', t: 'Válido até', d: '09h do dia seguinte. No mapa: VÁLIDO: 09h DD/MM às 09h DD/MM, hora local.' },
      { s: '#levels', t: 'Categoria', d: 'Comece pela menos severa. A mais severa fica por cima.' },
      { s: '#drawBtn', t: 'Desenhar área', d: 'Clique ponto a ponto no mapa e dê duplo clique para fechar.' },
      { s: '#pincelBtn', t: 'Pincel', d: 'Ou segure o botão do mouse e contorne a área à mão livre; ao soltar, a área fecha. Esc desliga.' },
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
      { s: '#validUntil', t: 'Válido até', d: '09h do dia seguinte. No mapa: VÁLIDO: 09h DD/MM às 09h DD/MM, hora local.' },
      { s: '#levels', t: 'Faixa', d: 'Escolha a faixa de chuva. O maior acumulado fica por cima.' },
      { s: '#drawBtn', t: 'Desenhar área', d: 'Clique ponto a ponto no mapa e dê duplo clique para fechar.' },
      { s: '#pincelBtn', t: 'Pincel', d: 'Ou segure o botão do mouse e contorne a área à mão livre; ao soltar, a área fecha. Esc desliga.' },
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
      { s: '#activeList .editar-alerta:not([hidden])', t: 'Editar alerta', d: 'Corrige um alerta seu ainda vigente (municípios, tipo, horário, duração). A versão corrigida substitui a original.' },
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
      // topo (vale para todas as abas)
      { s: '#cpcCycle', t: 'Ciclo', d: '00Z (≈3h) ou 06Z (≈9h). Vale para Reservatórios, Tendência e Acumulados.' },
      { s: '#fonteDados', t: 'Fonte dos dados', d: 'Dado bruto GFS (chuva em mm, NOAA) ou Imagens do CPC. A escolha fica guardada neste navegador.' },
      { s: '#faixasMapa', t: 'Faixas', d: 'Escala de cores dos mapas feitos com o GFS. Com as imagens do CPC é sempre a de 15 faixas.' },
      { s: '#coresMapa', t: 'Cores', d: 'Paleta de todos os mapas da ferramenta (inclusive Barragens): Azul (atual), Viridis ou Amarelo → índigo. A escolha fica guardada neste navegador.' },
      { s: '#opcoesMapa', t: 'Suave, Isolinhas e Valores', d: 'Só com o GFS. Suave: chuva desenhada fina, sem os quadradinhos (mesmos valores). Isolinhas: escolha a cada 50 mm (50, 100, 150…), nas faixas da legenda (estilo anterior) ou as duas juntas (as de 50 mm mais grossas). Valores: o número em cima das linhas. Vale para todos os mapas, inclusive Barragens.' },
      { s: '#cpcLoad', t: 'Buscar dados', d: 'Busca o ciclo escolhido, gera todos os mapas e preenche as datas.' },
      { s: '#cpcStatus', t: 'Situação', d: 'Qual rodada foi carregada e quando foi baixada. Vermelho = não carregou.' },
      { s: '.tabs', t: 'Abas', d: 'Reservatórios, Tendência (Week 1 e 2), Acumulados e Barragens e municípios (72/96 h).' },
      // aba Reservatórios
      { s: '#resStart', t: 'Período', d: 'Já vem preenchido pela rodada. Mude só se precisar e clique em Gerar mapa.' },
      { s: '#resShowCities', t: 'Cidades', d: 'Mostra ou esconde as cidades de referência no mapa.' },
      { s: '#resShowReserv', t: 'Reservatórios no mapa', d: 'Mostra os pontos e as siglas dos reservatórios.' },
      { s: '#resGenerate', t: 'Gerar mapa', d: 'Só depois de mudar a data ou as opções.' },
      { s: '#resCanvas', t: 'Mapa', d: 'Chuva prevista na semana, no layout padrão. A Prévia do mapa mostra em tamanho grande.' },
      { s: '#resTableBody', t: 'Tabela dos reservatórios', d: 'Faixa de chuva em cada reservatório (e o valor em mm, com o GFS). Sai também no CSV.' },
      // aba Tendência
      { s: '#wkGenerate', t: 'Gerar Week 1 + Week 2', d: 'Só se mudar as imagens ou as datas.' },
      { s: '#wk1Canvas', t: 'Week 1', d: 'Chuva prevista nos próximos 7 dias.' },
      { s: '#wk2Canvas', t: 'Week 2', d: 'Chuva prevista do 8º ao 14º dia.' },
      { s: '#mesoRainSummary', t: 'Resumo por mesorregião', d: 'Faixa de chuva de cada mesorregião nas duas semanas, para o texto da Tendência.' },
      // aba Acumulados
      { s: '#accGenerate', t: 'Gerar acumulados', d: 'Só se mudar as imagens ou as datas.' },
      { s: '#a24Canvas', t: 'Acumulados', d: '24 h, 3 dias e 5 dias a partir da rodada. Cada um tem o seu PNG.' },
      // aba Barragens e municípios
      { s: '#brCiclo', t: 'Rodada', d: 'Abre sozinha com a rodada do topo. Troque e clique em Buscar se precisar.' },
      { s: '#brProduto', t: 'Produto', d: 'Barragens (níveis marcados abaixo), Brumadinho - MG ou outro município.' },
      { s: '#brHorizonte', t: 'Horizonte', d: '96 h (4 dias) ou 72 h (3 dias), sempre a partir da rodada.' },
      { s: '#brEscala', t: 'Escala', d: 'A dos boletins de barragens (0–5 … > 250) ou a de 15 faixas.' },
      { s: '#brFonte', t: 'Lista de barragens', d: 'ANM/SIGBM: atualizada sozinha 2x por dia com o nível de emergência oficial. Lista da equipe: o BARRAGENS.txt (reserva).' },
      { s: '#brAnmInfo', t: 'Situação da lista', d: 'Quantas barragens de MG em cada nível e quando a ANM foi conferida. Aviso laranja = conferir.' },
      { s: '.niv', t: 'Níveis de emergência', d: 'Padrão: N2 e N3. Para emitir um nível separado, deixe só ele marcado.' },
      { s: '#brRaio', t: 'Região da barragem', d: 'Onde o gatilho procura a chuva: no ponto da barragem ou no maior valor num raio de 10 ou 20 km.' },
      { s: '#brBarrAvisos', t: 'Avisos da lista', d: 'Barragem sem coordenada, sem nível ou com município que não bate. Confira antes de emitir.' },
      { s: '#brReprs', t: 'Visualização', d: 'Todas no layout padrão: Minas Gerais (estado inteiro), Zoom na região (municípios e barragens), Média por município e Dia a dia.' },
      { s: '#brMapa', t: 'Mapa', d: 'Muda na hora com as opções. É o que vai no PNG e na Figura 1 do PDF.' },
      { s: '#brCritSelo', t: 'Critério de emissão', d: 'Padrão: 100 mm em um dia ou 100 mm em 72 h. Pode mudar os valores ou desligar um deles; “Voltar ao padrão” desfaz. Ao recarregar a página, volta ao padrão.' },
      { s: '#brGat', t: 'Resultado do critério', d: 'DISPARA = pode emitir. 40–50 mm/h o GFS não avalia: fica com o meteorologista.' },
      { s: 'label:has(#brForcar)', t: 'Emitir sem gatilho', d: 'Só por decisão do meteorologista, com justificativa (vai no rodapé do PDF). Sem isso, o PDF fica bloqueado.' },
      { s: '#brCondicao', t: 'Condição do tempo', d: 'Abre o texto (ex.: Previsão de tempo instável). Preencha antes do PDF.' },
      { s: '#brTexto', t: 'Parágrafo principal', d: 'Montado com as faixas de cada município. Pode editar à vontade.' },
      { s: '#brDias', t: 'Previsão diária', d: 'Escreva a condição de cada dia; a faixa de chuva já vem calculada.' },
      { s: 'label:has(#brAtencao)', t: 'Estado de Atenção', d: 'Decisão do meteorologista. Marcado, o parágrafo vai no fim do PDF (editável).' },
      { s: 'label:has(#brFig2)', t: 'Figura 2', d: 'Acrescenta o mapa Dia a dia no PDF.' },
      { s: '#brTabMun', t: 'Chuva nos municípios', d: 'Média de cada dia, total, mínimo–máximo e a faixa usada no texto.' },
      { s: '#brTabBarr', t: 'Barragens', d: 'Chuva no ponto, maior dia e maior 72 h na região, e o gatilho de cada uma. Linha vermelha = dispara.' },
      SALVAR
    ],
    'curto-prazo': [
      { s: '#cpStatus', t: 'Dados', d: 'GFS e WRF 7 km da rodada 00Z, baixados sozinhos a cada 2 horas.' },
      { s: '[data-modo]', t: 'Visão', d: 'Por dia (09h às 09h de cada dia) ou Acumulado (24, 48 e 72 h).' },
      { s: '#cpPeriodo', t: 'Dia ou período', d: 'Escolha o dia (ou o acumulado) do mapa e das tabelas.' },
      { s: '[data-vista]', t: 'Modelo', d: 'GFS, WRF ou os dois lado a lado (Comparar).' },
      { s: '#cpMapas', t: 'Mapa', d: 'No layout padrão. A Prévia do mapa mostra em tamanho grande.' },
      { s: '#cpMesoBody', t: 'Mesorregiões', d: 'Faixa predominante, maior faixa e máximo em cada mesorregião.' },
      SALVAR
    ],
    'umidade-minima': [
      { s: '#urStatus', t: 'Dados', d: 'UR do WRF 7 km às 15h de 3 dias (rodada 00Z), baixada sozinha a cada 2 horas.' },
      { s: '#urIso', t: 'Isolinhas', d: 'Quantas linhas aparecem no mapa. A escolha fica guardada neste navegador.' },
      { s: '#urMapa', t: 'Mapa', d: 'Média da UR das 15h dos 3 dias. A Prévia do mapa mostra em tamanho grande.' },
      { s: '#urMesoBody', t: 'Mesorregiões', d: 'Menor UR de cada dia e da média, com o estado do Manual (Observação, Atenção, Alerta, Emergência).' },
      { s: '#abaRelBtn', t: 'Relatório (PDF)', d: 'Aviso Meteorológico no modelo da equipe: texto automático (editável), mapa e OBS.' },
      SALVAR
    ],
    'mapas-climaticos': [
      { s: '#mcDrop', t: 'Arquivos do mês', d: 'Os 4 TXT da planilha (PREC, TEMP_MAX, TEMP_MIN, TEMP_MED). São lidos só neste computador.' },
      { s: '#mcConferente', t: 'Conferido por', d: 'Obrigatório: cada decisão e o registro levam este nome.' },
      { s: '#mcEstMapa', t: 'Estações', d: 'Laranja = pendente. Clique numa estação para achá-la na tabela.' },
      { s: '#mcEstBody', t: 'Conferência', d: 'Para cada pendente: Manter (conferida) ou Retirar, com o motivo.' },
      { s: '#abaMapasBtn', t: 'Mapas', d: 'Os 6 mapas (inclui a Climatologia) no layout padrão. Só salvam depois da conferência.' },
      { s: '#mcArqTab', t: 'Arquivo', d: 'Troca entre Precipitação, Máxima, Mínima e Média. O número entre parênteses é de pendentes.' },
      { s: '#mcFiltro', t: 'Filtro', d: 'Pendentes, com alerta, retiradas ou todas as estações do arquivo.' },
      { s: '#mcRetirarFortes', t: 'Retirar as fortes', d: 'Retira de uma vez as pendentes com alerta forte (pede um segundo clique para confirmar). As de atenção você decide uma a uma.' },
      { s: '#mcExemplo', t: 'Exemplo', d: 'Carrega setembro/2026 para treinar ou conferir a ferramenta.' },
      // aba 2 · Mapas
      { s: '#mcProd', t: 'Produto', d: 'Os 6 mapas do mês. Um ponto depois da sigla = ainda não dá para salvar (falta conferência).' },
      { s: '#mcMetodo', t: 'Método', d: 'IDW = mapa oficial (igual ao QGIS). Krigagem e Método recomendado ficam em avaliação, cada um com título, arquivo e botões próprios.' },
      { s: '#mcRecAviso', t: 'Método recomendado', d: 'Qual método foi usado neste produto e, nas temperaturas, o efeito da altitude no mês. Em vermelho: o PNG fica bloqueado.' },
      { s: '#mcEscalaBox', t: 'Escala', d: 'Automática ou ajustada à mão. Os três métodos usam a mesma escala para comparar.' },
      { s: '#mcIso', t: 'Isolinhas e opções', d: 'Isolinhas nos limites das classes, valores nas linhas, estações usadas e cidades de referência.' },
      { s: '#mcValid', t: 'Qualidade', d: 'Erro da validação cruzada de cada método (tira uma estação por vez). Quanto menor, melhor.' },
      { s: '#mcMapa', t: 'Mapa', d: 'Layout de impressão, igual ao PNG. A Prévia do mapa mostra em tamanho grande.' },
      { s: '#mcMesoBody', t: 'Mesorregiões', d: 'Média, mínimo e máximo do mapa em cada mesorregião. Sai no CSV.' },
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
