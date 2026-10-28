/*
 * Ponte para o Drive — v4 (2026.10.28): janela padrão "Salvar material".
 * Usada por Previsão diária, Tempo Severo, Chuva e Tendência, Alertas e Reservatórios.
 *
 * Toda vez que uma ferramenta gera um arquivo (PNG, PDF, SVG, KML, CSV, TXT), abre-se a mesma janela,
 * com duas opções: "Salvar no Drive" e "Salvar no PC". A janela diz o que já foi salvo e onde,
 * e avisa onde o arquivo AINDA NÃO foi salvo. Nada é salvo sem o meteorologista escolher.
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
    '#smJanela .cab .x{position:relative;z-index:1;border:0;background:#fff;color:#092b6a;width:32px;height:32px;border-radius:8px;font-size:20px;line-height:1;cursor:pointer;margin-right:96px}',
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

  /* ---------------- janela ---------------- */
  var fundo, janela, lista, resumo, itens = [];
  function montar() {
    if (fundo) return;
    fundo = document.createElement('div');
    fundo.id = 'smFundo';
    fundo.innerHTML = '<div id="smJanela" role="dialog" aria-modal="true" aria-labelledby="smTitulo">' +
      '<div class="cab"><h2 id="smTitulo">Salvar material</h2>' +
      '<button type="button" class="x" aria-label="Fechar">&times;</button>' +
      '<svg class="rs" viewBox="0 0 218 64" preserveAspectRatio="none" aria-hidden="true"><path d="M42 0H218V64H0Z" fill="#006cbf"/><path d="M42 0H83L40 64H0Z" fill="#a9e0f4"/><path d="M83 0H121L78 64H40Z" fill="#078fd2"/></svg></div>' +
      '<div class="itens"></div>' +
      '<div class="rod"><div class="resumo" aria-live="polite"></div><button type="button" class="bt fechar">Fechar</button></div></div>';
    document.body.appendChild(fundo);
    janela = fundo.querySelector('#smJanela');
    lista = fundo.querySelector('.itens');
    resumo = fundo.querySelector('.resumo');
    fundo.querySelector('.x').onclick = fechar;
    fundo.querySelector('.fechar').onclick = fechar;
    fundo.addEventListener('click', function (e) { if (e.target === fundo) fechar(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && fundo.classList.contains('on')) fechar(); });
  }
  function fechar() {
    fundo.classList.remove('on');
    itens = [];
    lista.innerHTML = '';
  }
  function tipoDe(nome) { var m = /\.([a-z0-9]+)$/i.exec(nome || ''); return m ? m[1].toUpperCase() : 'ARQ'; }

  function linhaDrive(it) {
    var d = it.drive;
    if (d.estado === 'ok') {
      var u = urlOk(d.url);
      return '<li class="ok"><span class="ic">✓</span><span><b>Drive:</b> salvo' + (u ? ' — <a href="' + esc(u) + '" target="_blank" rel="noopener">abrir ' + esc(d.nome || it.nome) + '</a>' : '') + (d.texto ? ' ' + d.texto : '') + '</span></li>';
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
  function desenhar() {
    lista.innerHTML = '';
    itens.forEach(function (it) {
      var el = document.createElement('div');
      el.className = 'it';
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
    resumo.innerHTML = itens.map(textoResumo).join('<br>');
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

  function abrir(o) {
    if (!o || !o.blob) return;
    montar();
    var it = { nome: o.nome || 'arquivo', blob: o.blob, nota: o.nota || '', pc: false, salvarDrive: o.salvarDrive || null, drive: { estado: 'pend' } };
    if (o.driveFeito) it.drive = { estado: 'ok', url: o.driveFeito.url, nome: o.driveFeito.nome || it.nome, texto: o.driveFeito.texto };
    itens = itens.filter(function (x) { return x.nome !== it.nome; });
    itens.push(it);
    if (o.drivePromessa) { it.drive = { estado: 'and' }; acompanhar(it, o.drivePromessa); }
    desenhar();
    fundo.classList.add('on');
    var b = janela.querySelector('.it:last-child [data-a=' + (it.drive.estado === 'ok' ? 'pc' : 'drive') + ']');
    if (b && !b.disabled) b.focus();
    return it;
  }

  /* ---------------- nomes padronizados dos botões ("Salvar …" abre esta janela) ---------------- */
  var ROTULOS = {
    'previsao': { btnPng: 'Salvar mapa (PNG)', btnPdf: 'Salvar PDF', btnSvg: 'Salvar SVG', btnBulPdf: 'Salvar boletim (PDF)', btnCidPdf: 'Salvar PDF' },
    'tempo-severo': { pngBtn: 'Salvar mapa (PNG)', kmlBtn: 'Salvar KML' },
    'chuva': { pngBtn: 'Salvar mapa (PNG)' },
    'alertas': { baixarRel: 'Salvar PDF (prévia)', downloadKml: 'Salvar KML', downloadTxt: 'Salvar alertas do dia (.txt)' },
    'reservatorios': { resPng: 'Salvar PNG', resCsv: 'Salvar CSV', wk1Png: 'Salvar PNG Week 1', wk2Png: 'Salvar PNG Week 2', a24Png: 'Salvar PNG 24h', a72Png: 'Salvar PNG 3 dias', a120Png: 'Salvar PNG 5 dias' }
  };
  function rotular() {
    var r = ROTULOS[FERRAMENTA()] || {};
    Object.keys(r).forEach(function (id) {
      var b = document.getElementById(id); if (!b) return;
      [].slice.call(b.childNodes).forEach(function (n) { if (n.nodeType === 3) n.remove(); });
      b.appendChild(document.createTextNode((b.querySelector('svg') ? ' ' : '') + r[id]));
      b.title = 'Abre a janela Salvar material: escolha salvar no Drive ou no PC';
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', rotular); else rotular();

  window.SalvarMaterial = { abrir: abrir, baixarNoPc: baixarNoPc, rotular: rotular };

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
