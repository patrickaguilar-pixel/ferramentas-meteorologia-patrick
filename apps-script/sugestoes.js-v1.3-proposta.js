/*
 * Sugestões — botão "Sugestões" na barra de cada ferramenta (v1.3, 09/11/2026).
 * v1.2: sem o campo de nome; quem enviou fica registrado só pelo e-mail Google (o Apps Script grava).
 * Carregado pelo assets/planner.js (as páginas não precisam mudar).
 * A ferramenta é a da página em que a janela foi aberta (v1.3: ou "Sugestão de nova ferramenta"). Só existe DENTRO das ferramentas (Apps Script, com login);
 * a página inicial pública (index.html do GitHub) não tem o botão.
 * Envia pelo Apps Script (Sugestoes.gs → enviarSugestao): vira um cartão no planner do Portal
 * ("Sugestão – <ferramenta>"); se isso falhar, vai por e-mail.
 */
/* v1.3 (09/11/2026, Patrick/Claude, sobre a v1.2 da equipe):
   - "Ferramenta" vira lista com só duas opções: a ferramenta da página (padrão) e "Sugestão de nova ferramenta";
     nela o "Tipo" some e o campo de texto vira "Descrição da nova ferramenta";
   - "Nova ferramenta" sai da lista de Tipo; Curto Prazo e Umidade Mínima passam a ser reconhecidas pelo título da página;
   - anexos: "Anexar arquivo" e "Anexar foto" (e Ctrl+V de imagem na caixa de texto), até 5 arquivos, 8 MB cada e 15 MB no total;
     cada anexo sobe antes, um por chamada, pelo sugestaoAnexo() do arquivo NOVO SugestoesAnexos.gs (pasta no Drive);
     os links entram no fim do texto e a sugestão segue pelo enviarSugestao() de sempre (o Sugestoes.gs não muda);
   - campos sempre claros, mesmo com o Windows/navegador em modo escuro (color-scheme: light). */
(function () {
  if (window.__sugestoesCarregado) return;
  window.__sugestoesCarregado = true;
  var temServidor = !!(window.google && google.script && google.script.run);

  var TIPOS = ['Melhoria', 'Problema / erro', 'Outro'];
  var NOVA = 'Sugestão de nova ferramenta';
  var MAX_ARQ = 5, MAX_MB = 8, MAX_TOTAL_MB = 15;
  function ferramentaAtual() {
    var t = (document.title || '').toLowerCase();
    if (t.indexOf('alerta') >= 0) return 'Alertas';
    if (t.indexOf('tempo severo') >= 0) return 'Tempo Severo';
    if (t.indexOf('chuva') >= 0) return 'Chuva';
    if (t.indexOf('previs') >= 0) return 'Previsão diária';
    if (t.indexOf('reservat') >= 0) return 'Reservatórios';
    if (t.indexOf('curto prazo') >= 0) return 'Curto Prazo';
    if (t.indexOf('umidade') >= 0) return 'Umidade Mínima';
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
    '.sug-modal{color-scheme:light;background:#fff;color:#1f2937;border-radius:10px;width:min(560px,100%);max-height:94vh;overflow:auto;padding:18px 20px;font:14px/1.4 Arial,Helvetica,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.3)}',
    '.sug-modal *{box-sizing:border-box}.sug-modal h2{margin:0 0 4px;font-size:19px}.sug-modal p.d{margin:0 0 14px;color:#5d6a7c;font-size:13px}',
    '.sug-modal label{display:block;font-weight:600;font-size:13px;margin:10px 0 4px}',
    '.sug-modal select,.sug-modal input,.sug-modal textarea{width:100%;padding:8px 10px;border:1px solid #c9d3dd;border-radius:7px;font:inherit;background:#fff;color:#1f2937}',
    '.sug-modal select option{background:#fff;color:#1f2937}',
    '.sug-modal select#sugFerSel{font-weight:700;color:#0f5c8c;background:#f3f6f9}',
    '.sug-anx{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px}',
    '.sug-anx .sug-b{display:inline-flex;align-items:center;gap:6px;padding:6px 11px;font-size:13px}.sug-anx svg{width:15px;height:15px}',
    '.sug-anx .dica{font-size:12px;color:#5d6a7c}',
    '.sug-lista{display:flex;flex-direction:column;gap:6px;margin-top:8px}',
    '.sug-item{display:flex;align-items:center;gap:9px;padding:5px 8px;border:1px solid #d9e0e7;border-radius:7px;background:#f8fafc;font-size:13px}',
    '.sug-item img{width:44px;height:34px;object-fit:cover;border-radius:4px;border:1px solid #d9e0e7;flex:none}',
    '.sug-item .ic{width:44px;height:34px;display:grid;place-items:center;border-radius:4px;background:#e6eef5;color:#0f5c8c;font-size:10px;font-weight:700;flex:none}',
    '.sug-item .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sug-item .tm{color:#5d6a7c;font-size:12px;flex:none}',
    '.sug-item button{border:0;background:transparent;color:#7a8b96;font-size:17px;line-height:1;width:24px;height:24px;border-radius:50%;cursor:pointer;flex:none}',
    '.sug-item button:hover{background:#d9534f;color:#fff}',
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
    '<h2 id="sugTit"><span id="sugTitTxt">Sugestões de melhoria</span><span id="sugTitSep"> — </span><span id="sugTitFer"></span></h2>' +
    '<p class="d" id="sugDesc">Conte o que pode melhorar ou o que não está funcionando. A mensagem vai direto para a equipe que cuida das ferramentas.</p>' +
    '<div class="sug-g"><div><label for="sugFerSel">Ferramenta</label><select id="sugFerSel">' +
    '<option>' + esc(FERRAMENTA_PAGINA) + '</option><option value="' + esc(NOVA) + '">' + esc(NOVA) + '</option></select></div>' +
    '<div id="sugTipoBox"><label for="sugTipo">Tipo</label><select id="sugTipo">' +
    TIPOS.map(function (f) { return '<option>' + esc(f) + '</option>'; }).join('') + '</select></div></div>' +
    '<label for="sugTexto" id="sugTextoRot">Sugestão *</label><textarea id="sugTexto" maxlength="4000"></textarea>' +
    '<div class="sug-cont" id="sugCont">0 / 4000</div>' +
    '<div class="sug-anx"><button type="button" class="sug-b" id="sugArqBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.4 11.1l-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/></svg>Anexar arquivo</button>' +
    '<button type="button" class="sug-b" id="sugFotoBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>Anexar foto</button>' +
    '<span class="dica">ou cole uma imagem (Ctrl+V) na caixa de texto · até ' + MAX_ARQ + ' arquivos, ' + MAX_MB + ' MB cada</span>' +
    '<input type="file" id="sugArq" multiple hidden><input type="file" id="sugFoto" accept="image/*" multiple hidden></div>' +
    '<div class="sug-lista" id="sugLista"></div>' +
    '<div class="sug-acoes"><span class="sug-st" id="sugSt" role="status" aria-live="polite">A sugestão fica registrada com o seu e-mail Google.</span>' +
    '<button type="button" class="sug-b" id="sugFechar">Fechar</button><button type="button" class="sug-b pri" id="sugEnviar">Enviar</button></div>' +
    '</div>';
  function $(id) { return back.querySelector('#' + id); }
  function status(t, c) { var s = $('sugSt'); s.className = 'sug-st' + (c ? ' ' + c : ''); s.textContent = t; }

  var ocupado = false;
  /* ---- ferramenta / nova ferramenta ---- */
  var PH_SUG = 'Ex.: no mapa de alertas, seria útil…';
  var PH_NOVA = 'Descreva a ferramenta: o que ela faria, quais dados usaria, o que sairia dela (mapa, tabela, PDF…) e em que rotina ajudaria.';
  function ehNova() { return $('sugFerSel').value === NOVA; }
  function atualizarModo() {
    var nova = ehNova();
    $('sugTipoBox').hidden = nova;
    $('sugTipoBox').parentNode.style.gridTemplateColumns = nova ? '1fr' : '';
    $('sugTitTxt').textContent = nova ? 'Sugestão de nova ferramenta' : 'Sugestões de melhoria';
    $('sugTitSep').hidden = nova; $('sugTitFer').hidden = nova;
    $('sugTitFer').textContent = $('sugFerSel').value;
    $('sugDesc').textContent = nova
      ? 'Conte a ideia da ferramenta nova. Se tiver um exemplo (print, planilha, PDF, mapa de outro lugar), anexe abaixo.'
      : 'Conte o que pode melhorar ou o que não está funcionando. A mensagem vai direto para a equipe que cuida das ferramentas.';
    $('sugTextoRot').textContent = nova ? 'Descrição da nova ferramenta *' : 'Sugestão *';
    $('sugTexto').placeholder = nova ? PH_NOVA : PH_SUG;
  }
  $('sugFerSel').addEventListener('change', atualizarModo);

  /* ---- anexos (arquivo, foto e Ctrl+V de imagem) ---- */
  var anexos = [];   // {nome, tipo, tamanho, base64, url}
  function mb(n) { return n < 1048576 ? Math.max(1, Math.round(n / 1024)) + ' KB' : (n / 1048576).toFixed(1).replace('.', ',') + ' MB'; }
  function totalBytes() { return anexos.reduce(function (t, a) { return t + a.tamanho; }, 0); }
  function lerArquivo(f) {
    return new Promise(function (ok, falha) {
      var r = new FileReader();
      r.onload = function () { ok(String(r.result).split(',')[1] || ''); };
      r.onerror = function () { falha(r.error); };
      r.readAsDataURL(f);
    });
  }
  function adicionar(lista) {
    var avisos = [];
    var fila = Array.prototype.slice.call(lista || []);
    return fila.reduce(function (p, f) {
      return p.then(function () {
        if (anexos.length >= MAX_ARQ) { avisos.push('no máximo ' + MAX_ARQ + ' arquivos'); return; }
        if (f.size > MAX_MB * 1048576) { avisos.push(f.name + ' passa de ' + MAX_MB + ' MB'); return; }
        if (totalBytes() + f.size > MAX_TOTAL_MB * 1048576) { avisos.push('o total passa de ' + MAX_TOTAL_MB + ' MB'); return; }
        return lerArquivo(f).then(function (b64) {
          var nome = f.name || ('imagem_colada_' + (anexos.length + 1) + '.png');
          anexos.push({ nome: nome, tipo: f.type || 'application/octet-stream', tamanho: f.size, base64: b64,
            url: /^image\//.test(f.type) ? URL.createObjectURL(f) : '' });
        });
      });
    }, Promise.resolve()).then(function () {
      desenharAnexos();
      if (avisos.length) status('Não anexado: ' + avisos.filter(function (x, i, a) { return a.indexOf(x) === i; }).join('; ') + '.', 'erro');
      else if (fila.length) status(anexos.length + (anexos.length > 1 ? ' anexos' : ' anexo') + ' (' + mb(totalBytes()) + ').');
    });
  }
  function desenharAnexos() {
    $('sugLista').innerHTML = anexos.map(function (a, i) {
      var ext = (a.nome.split('.').pop() || 'arq').slice(0, 4).toUpperCase();
      return '<div class="sug-item">' + (a.url ? '<img src="' + a.url + '" alt="">' : '<span class="ic">' + esc(ext) + '</span>') +
        '<span class="nm" title="' + esc(a.nome) + '">' + esc(a.nome) + '</span><span class="tm">' + mb(a.tamanho) + '</span>' +
        '<button type="button" data-i="' + i + '" title="Remover ' + esc(a.nome) + '" aria-label="Remover ' + esc(a.nome) + '">×</button></div>';
    }).join('');
  }
  function limparAnexos() { anexos.forEach(function (a) { if (a.url) URL.revokeObjectURL(a.url); }); anexos = []; desenharAnexos(); }
  $('sugLista').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-i]'); if (!b) return;
    var a = anexos.splice(+b.getAttribute('data-i'), 1)[0]; if (a && a.url) URL.revokeObjectURL(a.url);
    desenharAnexos();
  });
  $('sugArqBtn').addEventListener('click', function () { $('sugArq').click(); });
  $('sugFotoBtn').addEventListener('click', function () { $('sugFoto').click(); });
  ['sugArq', 'sugFoto'].forEach(function (id) {
    $(id).addEventListener('change', function () { var l = this.files; adicionar(l).then(function () { $(id).value = ''; }); });
  });
  $('sugTexto').addEventListener('paste', function (e) {
    var it = (e.clipboardData && e.clipboardData.items) || [], fs = [];
    for (var i = 0; i < it.length; i++) if (it[i].kind === 'file') { var f = it[i].getAsFile(); if (f) fs.push(f); }
    if (fs.length) { e.preventDefault(); adicionar(fs); }
  });

  var ocupado = false;
  function abrir() {
    back.hidden = false;
    if (!ocupado && !$('sugTexto').value) { $('sugFerSel').value = FERRAMENTA_PAGINA; atualizarModo(); }
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
    var texto = $('sugTexto').value.trim(), nova = ehNova();
    if (texto.length < 5) { status(nova ? 'Descreva a nova ferramenta antes de enviar.' : 'Escreva a sugestão antes de enviar.', 'erro'); $('sugTexto').focus(); return; }
    if (!temServidor) { status('O envio só funciona dentro do app (Apps Script).', 'erro'); return; }
    var fer = nova ? 'Geral' : $('sugFerSel').value;   // nova ferramenta: Ferramenta "Geral" + Tipo "Nova ferramenta" (listas do Sugestoes.gs)
    var pagina = document.title + (window.VERSAO_APP ? ' · v' + window.VERSAO_APP : '') + (fer !== FERRAMENTA_PAGINA ? ' (enviada da página ' + FERRAMENTA_PAGINA + ')' : '');
    var tipo = nova ? 'Nova ferramenta' : $('sugTipo').value;
    ocupado = true; $('sugEnviar').disabled = true; $('sugFechar').disabled = true;
    function liberar() { ocupado = false; $('sugEnviar').disabled = false; $('sugFechar').disabled = false; }
    function chamar(fn, arg) {   // google.script.run em forma de Promise
      return new Promise(function (ok, falha) { google.script.run.withSuccessHandler(ok).withFailureHandler(falha)[fn](arg); });
    }
    function msgErro(e) { var m = e && e.message ? e.message : String(e); return m; }
    // 1) anexos, um por chamada (cada um vira arquivo no Drive; o link vai no texto da sugestão)
    var lista = anexos.slice(), links = [];
    var subir = lista.reduce(function (p, a, i) {
      return p.then(function () {
        status('Enviando anexo ' + (i + 1) + ' de ' + lista.length + ' (' + a.nome + ')…');
        return chamar('sugestaoAnexo', { nome: a.nome, tipo: a.tipo, base64: a.base64, ferramenta: fer }).then(function (r) {
          if (!r || !/^https:\/\//.test(r.url || '')) throw new Error('o Drive não devolveu o link de ' + a.nome);
          links.push('- ' + (r.nome || a.nome) + ': ' + r.url);
        });
      });
    }, Promise.resolve());
    subir.then(function () {
      var final = texto + (links.length ? '\n\nAnexos (' + links.length + '):\n' + links.join('\n') : '');
      if (final.length > 4000) throw { semEspaco: final.length - 4000 };
      status('Enviando…');
      return chamar('enviarSugestao', { texto: final, ferramenta: fer, tipo: tipo, pagina: pagina });
    }).then(function (r) {
      liberar();
      var n = links.length;
      $('sugTexto').value = ''; $('sugCont').textContent = '0 / 4000'; limparAnexos();
      var ax = n ? ' com ' + n + (n > 1 ? ' anexos' : ' anexo') : '';
      if (r && r.via === 'email') status('Sugestão' + ax + ' enviada por e-mail (a planilha não respondeu agora). Obrigado!', 'aviso');
      else status('Sugestão' + ax + ' registrada no planner (' + (nova ? 'Nova ferramenta' : fer) + '). Obrigado!', 'ok');
    }).catch(function (e) {
      liberar();
      if (e && e.semEspaco) { status('Com os links dos anexos o texto passa de 4000 caracteres. Encurte o texto em ' + e.semEspaco + ' caracteres e envie de novo.', 'erro'); return; }
      var m = msgErro(e);
      if (/sugestaoAnexo/i.test(m) || (lista.length && !links.length && /not a function|is not defined|não .*função/i.test(m)))
        m = 'o envio de anexos ainda não foi instalado no Apps Script (arquivo SugestoesAnexos.gs). Remova os anexos para enviar só o texto.';
      else if (/enviarSugestao|not a function|is not defined/i.test(m)) m = 'o envio ainda não foi instalado no Apps Script (Sugestoes.gs).';
      status('Não foi possível enviar: ' + m + ' O texto e os anexos continuam aqui.', 'erro');
    });
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
