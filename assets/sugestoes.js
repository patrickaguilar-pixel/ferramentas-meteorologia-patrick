/*
 * Sugestões — botão "Sugestões" na barra de cada ferramenta (v1.2, 06/11/2026).
 * v1.2: sem o campo de nome; quem enviou fica registrado só pelo e-mail Google (o Apps Script grava).
 * Carregado pelo assets/planner.js (as páginas não precisam mudar).
 * A ferramenta é a da página em que a janela foi aberta (não dá para trocar), para cada sugestão
 * ficar ligada à ferramenta certa. Só existe DENTRO das ferramentas (Apps Script, com login);
 * a página inicial pública (index.html do GitHub) não tem o botão.
 * Envia pelo Apps Script (Sugestoes.gs → enviarSugestao): vira um cartão no planner do Portal
 * ("Sugestão – <ferramenta>"); se isso falhar, vai por e-mail.
 */
(function () {
  if (window.__sugestoesCarregado) return;
  window.__sugestoesCarregado = true;
  var temServidor = !!(window.google && google.script && google.script.run);

  var TIPOS = ['Melhoria', 'Problema / erro', 'Nova ferramenta', 'Outro'];
  function ferramentaAtual() {
    var t = (document.title || '').toLowerCase();
    if (t.indexOf('alerta') >= 0) return 'Alertas';
    if (t.indexOf('tempo severo') >= 0) return 'Tempo Severo';
    if (t.indexOf('chuva') >= 0) return 'Chuva';
    if (t.indexOf('previs') >= 0) return 'Previsão diária';
    if (t.indexOf('reservat') >= 0) return 'Reservatórios';
    return 'Geral';
  }
  var FERRAMENTA_PAGINA = ferramentaAtual();
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  var css = [
    '.sug-btn{display:inline-flex;align-items:center;gap:7px;border:1px solid #0f5c8c;background:#fff;color:#0f5c8c;border-radius:8px;padding:7px 13px;font-weight:600;font-size:14px;line-height:1.2;font-family:inherit;cursor:pointer;min-height:36px;white-space:nowrap}',
    '.sug-btn:hover{background:#eef6fc}.sug-btn svg{width:16px;height:16px;flex:none}',
    '.sug-btn.flut{position:fixed;left:16px;bottom:60px;z-index:99990;box-shadow:0 4px 14px rgba(15,40,70,.2)}',
    '.sug-back{position:fixed;inset:0;z-index:100001;background:rgba(10,20,35,.5);display:flex;align-items:center;justify-content:center;padding:16px}',
    '.sug-back[hidden]{display:none!important}',
    '.sug-modal{background:#fff;color:#1f2937;border-radius:10px;width:min(560px,100%);max-height:94vh;overflow:auto;padding:18px 20px;font:14px/1.4 Arial,Helvetica,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.3)}',
    '.sug-modal *{box-sizing:border-box}.sug-modal h2{margin:0 0 4px;font-size:19px}.sug-modal p.d{margin:0 0 14px;color:#5d6a7c;font-size:13px}',
    '.sug-modal label{display:block;font-weight:600;font-size:13px;margin:10px 0 4px}',
    '.sug-modal select,.sug-modal input,.sug-modal textarea{width:100%;padding:8px 10px;border:1px solid #c9d3dd;border-radius:7px;font:inherit}',
    '.sug-modal textarea{min-height:140px;resize:vertical}',
    '.sug-fer{padding:8px 10px;border:1px solid #c9d3dd;border-radius:7px;background:#f3f6f9;font-weight:700;color:#0f5c8c}',
    '.sug-g{display:grid;grid-template-columns:1fr 1fr;gap:0 12px}',
    '.sug-cont{font-size:12px;color:#5d6a7c;text-align:right;margin-top:3px}',
    '.sug-acoes{display:flex;gap:8px;justify-content:flex-end;align-items:center;margin-top:14px;flex-wrap:wrap}',
    '.sug-st{flex:1;min-width:180px;font-size:13px;color:#5d6a7c}.sug-st.ok{color:#1e7a46;font-weight:600}.sug-st.aviso{color:#9a5b00;font-weight:600}.sug-st.erro{color:#b3261e;font-weight:600}',
    '.sug-b{border:1px solid #d9e0e7;background:#fff;color:#1f2937;border-radius:7px;padding:8px 14px;font:600 14px Arial,sans-serif;cursor:pointer}',
    '.sug-b.pri{background:#0f5c8c;border-color:#0f5c8c;color:#fff}.sug-b[disabled]{opacity:.5;cursor:not-allowed}',
    '.sug-modal :focus-visible{outline:2px solid #0f5c8c;outline-offset:2px}'
  ].join('\n');
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var icone = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z"/></svg>';
  var btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'sug-btn'; btn.id = 'sugestoesBtn';
  btn.title = 'Enviar uma sugestão de melhoria ou relatar um problema';
  btn.innerHTML = icone + 'Sugestões';

  var back = document.createElement('div');
  back.className = 'sug-back'; back.hidden = true;
  back.innerHTML =
    '<div class="sug-modal" role="dialog" aria-modal="true" aria-labelledby="sugTit">' +
    '<h2 id="sugTit">Sugestões de melhoria — <span id="sugTitFer"></span></h2>' +
    '<p class="d">Conte o que pode melhorar ou o que não está funcionando. A mensagem vai direto para a equipe que cuida das ferramentas.</p>' +
    '<div class="sug-g"><div><label>Ferramenta</label><div class="sug-fer" id="sugFer"></div></div>' +
    '<div><label for="sugTipo">Tipo</label><select id="sugTipo">' +
    TIPOS.map(function (f) { return '<option>' + esc(f) + '</option>'; }).join('') + '</select></div></div>' +
    '<label for="sugTexto">Sugestão *</label><textarea id="sugTexto" maxlength="4000" placeholder="Ex.: no mapa de alertas, seria útil…"></textarea>' +
    '<div class="sug-cont" id="sugCont">0 / 4000</div>' +
    '<div class="sug-acoes"><span class="sug-st" id="sugSt" role="status" aria-live="polite">A sugestão fica registrada com o seu e-mail Google.</span>' +
    '<button type="button" class="sug-b" id="sugFechar">Fechar</button><button type="button" class="sug-b pri" id="sugEnviar">Enviar</button></div>' +
    '</div>';
  function $(id) { return back.querySelector('#' + id); }
  function status(t, c) { var s = $('sugSt'); s.className = 'sug-st' + (c ? ' ' + c : ''); s.textContent = t; }

  var ocupado = false;
  function abrir() {
    back.hidden = false;
    $('sugFer').textContent = FERRAMENTA_PAGINA; $('sugTitFer').textContent = FERRAMENTA_PAGINA;
    if (!ocupado) status('A sugestão fica registrada com o seu e-mail Google.');
    $('sugTexto').focus();
  }
  function fechar() { if (ocupado) return; back.hidden = true; btn.focus(); }
  btn.addEventListener('click', abrir);
  back.addEventListener('click', function (e) { if (e.target === back) fechar(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !back.hidden) fechar(); });
  $('sugFechar').addEventListener('click', fechar);
  $('sugTexto').addEventListener('input', function () { $('sugCont').textContent = $('sugTexto').value.length + ' / 4000'; });

  $('sugEnviar').addEventListener('click', function () {
    var texto = $('sugTexto').value.trim();
    if (texto.length < 5) { status('Escreva a sugestão antes de enviar.', 'erro'); $('sugTexto').focus(); return; }
    if (!temServidor) { status('O envio só funciona dentro do app (Apps Script).', 'erro'); return; }
    var d = { texto: texto, ferramenta: FERRAMENTA_PAGINA, tipo: $('sugTipo').value,
      pagina: document.title + (window.VERSAO_APP ? ' · v' + window.VERSAO_APP : '') };
    ocupado = true; $('sugEnviar').disabled = true; $('sugFechar').disabled = true; status('Enviando…');
    google.script.run
      .withSuccessHandler(function (r) {
        ocupado = false; $('sugEnviar').disabled = false; $('sugFechar').disabled = false;
        $('sugTexto').value = ''; $('sugCont').textContent = '0 / 4000';
        if (r && r.via === 'email') status('Sugestão enviada por e-mail (a planilha não respondeu agora). Obrigado!', 'aviso');
        else status('Sugestão registrada no planner (' + FERRAMENTA_PAGINA + '). Obrigado!', 'ok');
      })
      .withFailureHandler(function (e) {
        ocupado = false; $('sugEnviar').disabled = false; $('sugFechar').disabled = false;
        var m = e && e.message ? e.message : String(e);
        if (/enviarSugestao|not a function|is not defined/i.test(m)) m = 'o envio ainda não foi instalado no Apps Script (Sugestoes.gs).';
        status('Não foi possível enviar: ' + m + ' O texto continua aqui.', 'erro');
      })
      .enviarSugestao(d);
  });

  function colocarBotao() {
    var pln = document.getElementById('plannerBtn');
    if (pln && pln.parentNode && !pln.classList.contains('flut')) { pln.parentNode.insertBefore(btn, pln.nextSibling); return; }
    var acoes = document.querySelector('.bar .actions');
    if (acoes) { acoes.insertBefore(btn, acoes.firstChild); return; }
    var topo = document.querySelector('header .top');
    if (topo) { topo.appendChild(btn); return; }
    btn.classList.add('flut'); document.body.appendChild(btn);
  }
  function iniciar() {
    if (!temServidor) return;   // fora do Apps Script (página pública/GitHub) o botão não aparece
    colocarBotao(); document.body.appendChild(back);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else setTimeout(iniciar, 0);
})();
