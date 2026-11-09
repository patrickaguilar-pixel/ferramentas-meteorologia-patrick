/*
 * Cabeçalho padrão das ferramentas (v1, 09/11/2026, Patrick/Claude).
 * Carregado pelo assets/ponte-drive.js (Tempo Severo, Chuva, Alertas, Previsão, Reservatórios) e direto
 * pelas páginas novas (Curto Prazo, Umidade Mínima). Não muda o HTML das páginas do Apps Script:
 * só arruma o que já existe, com CSS (e, no Reservatórios, leva o botão OPÇÕES para a 1ª linha).
 *
 * Ordem, igual em todas:  [Título + subtítulo] [abas] ............ [ações da ferramenta] | [Planner] [Sugestões]  [OPÇÕES]
 * - tudo numa linha só (os botões não quebram mais em duas linhas);
 * - Planner e Sugestões ficam juntos, no fim, separados das ações da ferramenta por um traço;
 * - em telas menores, Planner e Sugestões (< 1600 px) e depois as ações (< 1280 px) mostram só o ícone
 *   (o nome aparece ao passar o mouse);
 * - subtítulo sempre numa linha; o título não espreme.
 * Nas páginas com cabeçalho de duas linhas (Reservatórios, Curto Prazo, Umidade Mínima): título, selo,
 * Planner, Sugestões e OPÇÕES na 1ª linha; as abas (quando há) na 2ª.
 */
(function () {
  if (window.__cabecalhoPadrao) return;
  window.__cabecalhoPadrao = true;

  var css = [
    /* ---- barra do topo (Tempo Severo, Chuva, Alertas, Previsão) ---- */
    'body > .bar{flex-wrap:nowrap!important;gap:14px!important}',
    'body > .bar h1{flex:none;white-space:nowrap}',
    'body > .bar h1 small{white-space:nowrap}',
    'body > .bar .tabs{flex:none;margin-left:6px}',
    'body > .bar .spacer{flex:1 1 0;min-width:0}',
    'body > .bar .who{flex:0 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12.5px}',
    'body > .bar .actions{flex:none;flex-wrap:nowrap!important;align-items:center;gap:8px}',
    'body > .bar .actions > .btn,body > .bar .actions > .pln-btn,body > .bar .actions > .sug-btn{min-height:36px;padding:7px 12px;font-size:14px}',
    /* Planner e Sugestões: grupo no fim, depois de um traço */
    'body > .bar .actions > #plannerBtn{order:90;margin-left:8px;position:relative}',
    'body > .bar .actions > #plannerBtn::before{content:"";position:absolute;left:-9px;top:6px;bottom:6px;width:1px;background:#d6dee6;pointer-events:none}',
    'body > .bar .actions > #sugestoesBtn{order:91}',
    /* telas até 1599 px: Planner e Sugestões só com o ícone */
    '@media (max-width:1599px){body > .bar .actions > #plannerBtn,body > .bar .actions > #sugestoesBtn{font-size:0!important;gap:0!important;padding:0!important;width:38px;min-width:38px;justify-content:center}',
    '  body > .bar .actions > #plannerBtn svg,body > .bar .actions > #sugestoesBtn svg{width:18px;height:18px}}',
    /* telas até 1279 px: as ações da ferramenta também só com o ícone */
    '@media (max-width:1279px){body > .bar .actions > .btn{font-size:0!important;gap:0!important;padding:0!important;width:38px;min-width:38px;justify-content:center}',
    '  body > .bar .actions > .btn svg{width:18px;height:18px}',
    '  body > .bar h1 small{display:none}}',

    /* ---- cabeçalho de duas linhas (Reservatórios, Curto Prazo, Umidade Mínima) ---- */
    'body > header .top{flex-wrap:nowrap!important;align-items:center!important;gap:12px!important}',
    'body > header .top > div:first-child{flex:1 1 auto;min-width:0}',
    'body > header .top h1{font-size:21px!important;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    'body > header .top .muted{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    'body > header .top .badge{flex:none;white-space:nowrap}',
    'body > header .top > #plannerBtn{flex:none;margin-left:6px;position:relative}',
    'body > header .top > #plannerBtn::before{content:"";position:absolute;left:-10px;top:6px;bottom:6px;width:1px;background:#d6dee6;pointer-events:none}',
    'body > header .top > #sugestoesBtn{flex:none}',
    '@media (max-width:1279px){body > header .top > #plannerBtn,body > header .top > #sugestoesBtn{font-size:0!important;gap:0!important;padding:0!important;width:38px;min-width:38px;justify-content:center}',
    '  body > header .top > #plannerBtn svg,body > header .top > #sugestoesBtn svg{width:18px;height:18px}}',
    /* OPÇÕES DE SALVAMENTO dentro da 1ª linha (antes ficava no meio das duas linhas e cobria os botões) */
    'body > header .top > #smBotao.topo{position:static!important;transform:none!important;flex:none;margin-left:6px}',
    'body > header .top > #smBotao.topo:hover{transform:scale(1.03)!important}',
    'body.smTopo header .top{padding-right:0!important}'
  ].join('\n');
  var st = document.createElement('style'); st.id = 'cabecalhoPadraoCss'; st.textContent = css;
  document.head.appendChild(st);

  // nome do botão no "passar o mouse", para quando só o ícone aparece
  function rotular() {
    var sel = 'body > .bar .actions > button, body > header .top > #plannerBtn, body > header .top > #sugestoesBtn';
    Array.prototype.forEach.call(document.querySelectorAll(sel), function (b) {
      var t = (b.textContent || '').replace(/\s+/g, ' ').trim();
      if (t && !b.getAttribute('aria-label')) b.setAttribute('aria-label', t);
      if (t && !b.title) b.title = t;
    });
  }
  // Reservatórios: o botão OPÇÕES (assets/ponte-drive.js) vai para o fim da 1ª linha
  function arrumarOpcoes() {
    var top = document.querySelector('body > header .top'), b = document.getElementById('smBotao');
    if (!top || !b || !b.classList.contains('topo')) return;
    if (top.lastElementChild !== b) top.appendChild(b);   // fim da 1ª linha, depois do Planner/Sugestões
    var d = document.getElementById('smDica');            // balão da dica: volta a apontar para o botão
    if (d && d.classList.contains('topo')) {
      var r = b.getBoundingClientRect();
      d.style.top = (r.bottom + window.scrollY + 12) + 'px';
      d.style.right = Math.max(8, document.documentElement.clientWidth - r.right) + 'px';
    }
  }
  function tudo() { rotular(); arrumarOpcoes(); }
  function iniciar() {
    tudo();
    [300, 1200, 3000, 6000].forEach(function (t) { setTimeout(tudo, t); });   // Planner, Sugestões e OPÇÕES entram depois
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
