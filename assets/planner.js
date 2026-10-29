/*
 * Planner semanal — botão "Planner da semana" na barra de cada ferramenta (v1.0, 28/10/2026).
 *
 * Fica no GitHub Pages, mas aqui está SÓ o código do desenho: os produtos, feriados e anotações
 * vêm da planilha do planner pelo Apps Script (Planner.gs → plannerDados). Fora do Apps Script
 * o botão aparece, mas o quadro avisa que só funciona dentro do app.
 *
 * Onde o botão entra: primeiro item de ".bar .actions" (Alertas, Tempo Severo, Chuva, Previsão);
 * se não houver, no fim de "header .top" (Reservatórios); senão, botão flutuante no canto inferior esquerdo.
 * Quem está em PLANNER.EDITORES (Planner.gs) vê o botão "Editar" dentro do quadro.
 */
(function () {
  if (window.__plannerCarregado) return;
  window.__plannerCarregado = true;

  var temServidor = !!(window.google && google.script && google.script.run);
  var DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  var DIAS_C = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  var CORES = ['c0', 'c1', 'c2', 'c0', 'c1', 'c2', 'c0'];
  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  /* ---------------- estilo ---------------- */
  var css = [
    '.pln-btn{display:inline-flex;align-items:center;gap:7px;border:1px solid #0f5c8c;background:#fff;color:#0f5c8c;border-radius:8px;padding:7px 13px;font-weight:600;font-size:14px;line-height:1.2;font-family:inherit;cursor:pointer;min-height:36px;white-space:nowrap}',
    '.pln-btn:hover{background:#eef6fc}.pln-btn svg{width:16px;height:16px;flex:none}',
    '.pln-btn.flut{position:fixed;left:16px;bottom:16px;z-index:99990;box-shadow:0 4px 14px rgba(15,40,70,.2)}',
    '.pln-back{position:fixed;inset:0;z-index:100000;background:rgba(10,20,35,.5);display:flex;align-items:center;justify-content:center;padding:16px}',
    '.pln-back[hidden]{display:none!important}',
    '.pln-modal{background:#fff;color:#1f2937;border-radius:10px;width:min(1240px,100%);max-height:94vh;overflow:auto;padding:14px;font:13px/1.35 Arial,Helvetica,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.3)}',
    '.pln-modal *{box-sizing:border-box}',
    '.pln-acoes{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-bottom:10px;align-items:center}',
    '.pln-acoes .msg{flex:1;min-width:200px;color:#5d6a7c;font-size:12.5px}',
    '.pln-b{display:inline-flex;align-items:center;gap:6px;border:1px solid #d9e0e7;background:#fff;color:#1f2937;border-radius:7px;padding:6px 12px;font:600 13px Arial,sans-serif;cursor:pointer;min-height:32px}',
    '.pln-b:hover{border-color:#0f5c8c}.pln-b.pri{background:#0f5c8c;border-color:#0f5c8c;color:#fff}.pln-b.pri:hover{background:#0b4a72}',
    '.pln-b.perigo{color:#b3261e;border-color:#efc4c0}.pln-b[disabled]{opacity:.5;cursor:not-allowed}',
    '.pln-modal :focus-visible{outline:2px solid #0f5c8c;outline-offset:2px}',
    '.pln-quadro{border:3px solid #3b3f45;border-radius:6px;padding:16px;display:grid;gap:12px}',
    '.pln-top{display:flex;align-items:center;gap:10px 18px;flex-wrap:wrap}',
    '.pln-top h2{margin:0;font:400 clamp(20px,3vw,32px)/1 Arial,sans-serif;letter-spacing:.04em;color:#7a7f87;text-transform:uppercase;flex:1;min-width:0}',
    '.pln-sem{display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
    '.pln-sem .r{background:#6b6f75;color:#fff;border-radius:6px;padding:5px 12px;font-weight:700}',
    '.pln-sem .v{background:#6b6f75;color:#fff;border-radius:6px;padding:5px 12px}',
    '.pln-sem button{border:1px solid #d9e0e7;background:#fff;border-radius:6px;width:30px;height:30px;cursor:pointer;font-size:15px;color:#1f2937}',
    '.pln-leg{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12px;color:#5d6a7c;align-items:center}',
    '.pln-leg i{display:inline-block;width:12px;height:12px;border-radius:3px;vertical-align:-2px;margin-right:5px}',
    '.pln-scroll{overflow-x:auto}',
    '.pln-grade{display:grid;grid-template-columns:62px repeat(7,minmax(120px,1fr));min-width:920px;gap:0 6px}',
    '.pln-dcab{display:grid;gap:3px;justify-items:center;padding-bottom:8px}',
    '.pln-pill{color:#fff;font-size:14px;font-weight:700;border-radius:5px;padding:4px 0;width:100%;text-align:center}',
    '.pln-pill.c0{background:#e9852b}.pln-pill.c1{background:#123f7a}.pln-pill.c2{background:#1596d4}',
    '.pln-dcab small{font-size:12px;color:#5d6a7c}',
    '.pln-marca{font-size:11px;font-weight:700;border-radius:99px;padding:1px 8px}.pln-marca.hoje{background:#0f5c8c;color:#fff}.pln-marca.fer{background:#fdecea;color:#9a3412}',
    '.pln-trot{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-size:11px;color:#5d6a7c;text-align:center;border:1px solid #d9e0e7;border-right:0;padding:6px 2px}',
    '.pln-trot b{font-size:12px;color:#1f2937;writing-mode:vertical-rl;transform:rotate(180deg);letter-spacing:.06em;text-transform:uppercase}',
    '.pln-trot.d{border-radius:8px 0 0 0;border-bottom:0}.pln-trot.n{background:#f3f5fa;border-radius:0 0 0 8px;border-top:1px dashed #d9e0e7}',
    '.pln-cel{border:1px solid #d9e0e7;padding:8px 7px;display:grid;align-content:start;gap:6px;min-width:0;font-size:12.5px;line-height:1.3}',
    '.pln-cel.d{border-radius:8px 8px 0 0;border-bottom:0}.pln-cel.n{border-radius:0 0 8px 8px;border-top:1px dashed #9aa4b1;background:#f3f5fa}',
    '.pln-cel.hoje{border-color:#0f5c8c;background:#f1f8fd}.pln-cel.agora{box-shadow:inset 0 0 0 2px #0f5c8c}',
    '.pln-agora{justify-self:start;font-size:10.5px;font-weight:700;background:#0f5c8c;color:#fff;border-radius:99px;padding:1px 7px}',
    '.pln-ent{font-size:11px;color:#5d6a7c}',
    '.pln-p{display:grid;gap:1px;padding-left:7px;border-left:3px solid #9aa4b1}',
    '.pln-p.extra{border-left-color:#e9852b;background:#fff3e6;border-radius:0 4px 4px 0;padding:3px 4px 3px 7px}',
    '.pln-p.especial{border-left-color:#6d3fb5;background:#f2ecfb;border-radius:0 4px 4px 0;padding:3px 4px 3px 7px}',
    '.pln-p .s{color:#5d6a7c;font-size:11.5px}.pln-p .e{font-size:11px;color:#5d6a7c}.pln-p .e.cedec{color:#9a3412;font-weight:700}',
    '.pln-p ul{margin:2px 0 0;padding-left:14px;font-size:11.5px}',
    '.pln-mini{display:inline-block;font-size:10px;font-weight:700;border-radius:3px;padding:0 4px;margin-left:3px;vertical-align:1px;text-transform:uppercase;letter-spacing:.03em}',
    '.pln-mini.chuvoso{background:#e3f1fb;color:#0d6aa8}.pln-mini.seco{background:#fdf1d8;color:#8a5a00}',
    '.pln-mini.extra{background:#fff3e6;color:#b85d0c;border:1px solid #e9852b}.pln-mini.especial{background:#f2ecfb;color:#5a2f9c;border:1px solid #b79be3}',
    '.pln-anot{border:1px solid #d9e0e7;border-radius:8px;padding:10px 12px 12px;display:grid;gap:8px}',
    '.pln-anot .t{justify-self:start;background:#6b6f75;color:#fff;border-radius:6px;padding:3px 12px;font:italic 700 14px Georgia,serif}',
    '.pln-ag{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0 18px}',
    '.pln-ag section{border-top:1px solid #d9e0e7;padding:7px 0;font-size:12.5px;line-height:1.4;min-width:0}',
    '.pln-ag h3{margin:0 0 3px;font-size:12.5px;text-transform:uppercase;letter-spacing:.05em;color:#0f5c8c}',
    '.pln-ag ul{margin:0;padding-left:16px}',
    '.pln-nota{font-size:12px;color:#5d6a7c;margin:0}',
    '.pln-aviso{padding:20px;text-align:center;color:#5d6a7c;font-size:14px}.pln-aviso.erro{color:#b3261e}',
    /* edição */
    '.pln-ed{display:grid;gap:12px}',
    '.pln-tabs{display:flex;gap:4px;background:#eef2f5;border-radius:9px;padding:3px;width:max-content;max-width:100%;flex-wrap:wrap}',
    '.pln-tabs button{border:0;background:transparent;border-radius:7px;padding:6px 14px;font:600 13px Arial,sans-serif;cursor:pointer;color:#3d4a5c}',
    '.pln-tabs button[aria-selected="true"]{background:#fff;color:#1f2937;box-shadow:0 1px 2px rgba(0,0,0,.12)}',
    '.pln-tw{overflow-x:auto;border:1px solid #d9e0e7;border-radius:8px}',
    '.pln-tab{border-collapse:collapse;width:100%;min-width:760px;font-size:12.5px}',
    '.pln-tab th,.pln-tab td{padding:6px 8px;border-bottom:1px solid #edf1f5;text-align:left;vertical-align:top}',
    '.pln-tab th{background:#eef2f5;font-weight:700}.pln-tab tr.off td{color:#9aa4b1}',
    '.pln-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px 14px;border:1px solid #d9e0e7;border-radius:8px;padding:12px}',
    '.pln-form label,.pln-form .grp{display:grid;gap:4px;font-weight:600;font-size:12.5px;min-width:0}',
    '.pln-form .larga{grid-column:1/-1}',
    '.pln-form small{font-weight:400;color:#5d6a7c}',
    '.pln-in{border:1px solid #d9e0e7;border-radius:6px;padding:6px 8px;font:13px Arial,sans-serif;color:#1f2937;background:#fff;min-height:32px;width:100%;min-width:0}',
    'textarea.pln-in{min-height:64px;resize:vertical}',
    '.pln-dias{display:flex;flex-wrap:wrap;gap:4px 10px;font-weight:400}',
    '.pln-dias label,.pln-chk{display:inline-flex;gap:5px;align-items:center;font-weight:400}',
    '.pln-fim{display:flex;gap:8px;flex-wrap:wrap;align-items:center;grid-column:1/-1}',
    '.pln-fim .sp{flex:1}',
    '.pln-lin{display:grid;grid-template-columns:150px minmax(0,1fr) auto;gap:6px;align-items:center}',
    '.pln-bloco{display:grid;gap:6px;border:1px solid #d9e0e7;border-radius:8px;padding:10px}',
    '.pln-erro{color:#b3261e;font-weight:600}',
    '@media (max-width:760px){.pln-scroll{overflow:visible}.pln-grade{display:block;min-width:0}.pln-trot{display:none}',
    '.pln-dia{margin-bottom:12px}.pln-cel.d::before,.pln-cel.n::before{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#5d6a7c}',
    '.pln-cel.d::before{content:"Diurno · 7h às 19h"}.pln-cel.n::before{content:"Noturno · 19h às 7h"}.pln-lin{grid-template-columns:1fr}}'
  ].join('\n');
  var st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  /* ---------------- utilidades ---------------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function ddmm(d) { return pad(d.getDate()) + '/' + pad(d.getMonth() + 1); }
  function br(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; }
  function maisDias(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function agoraMG() {
    var o = {};
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date()).forEach(function (p) { o[p.type] = p.value; });
    return { d: new Date(+o.year, +o.month - 1, +o.day), h: +o.hour };
  }
  function turnoAtual() {
    var a = agoraMG();
    if (a.h >= 7 && a.h < 19) return { data: iso(a.d), t: 'Diurno' };
    return { data: iso(a.h < 7 ? maisDias(a.d, -1) : a.d), t: 'Noturno' };
  }
  function inicioSemana(d) { return maisDias(d, -d.getDay()); }

  /* ---------------- estado ---------------- */
  var S = { dados: null, erro: '', carregando: false, semana: inicioSemana(agoraMG().d), modo: 'quadro', aba: 'produtos', editando: null, msg: '', ocupado: false, excluir: false, fer: null, anot: null };

  /* ---------------- botão e janela ---------------- */
  var icone = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>';
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pln-btn';
  btn.id = 'plannerBtn';
  btn.innerHTML = icone + 'Planner da semana';
  function colocarBotao() {
    var acoes = document.querySelector('.bar .actions');
    if (acoes) { acoes.insertBefore(btn, acoes.firstChild); return; }
    var topo = document.querySelector('header .top');
    if (topo) { topo.appendChild(btn); return; }
    btn.classList.add('flut');
    document.body.appendChild(btn);
  }

  var back = document.createElement('div');
  back.className = 'pln-back';
  back.hidden = true;
  back.innerHTML = '<div class="pln-modal" role="dialog" aria-modal="true" aria-label="Planner da semana"></div>';
  var modal = back.firstChild;

  function abrir() {
    back.hidden = false;
    S.modo = 'quadro'; S.editando = null; S.msg = '';
    carregar();
    desenhar();
    var f = modal.querySelector('[data-fechar]'); if (f) f.focus();
  }
  function fechar() { back.hidden = true; btn.focus(); }
  btn.addEventListener('click', abrir);
  back.addEventListener('click', function (e) { if (e.target === back) fechar(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !back.hidden) fechar(); });

  function servidor(fn, args, ok) {
    S.ocupado = true; S.msg = 'Salvando…'; desenhar();
    var r = google.script.run
      .withSuccessHandler(function (d) { S.ocupado = false; S.dados = d; S.msg = ''; ok && ok(); desenhar(); })
      .withFailureHandler(function (e) { S.ocupado = false; S.msg = 'erro:' + (e && e.message ? e.message : e); desenhar(); });
    r[fn].apply(r, args);
  }
  function carregar() {
    if (!temServidor) { S.erro = 'O planner só funciona dentro do app (Apps Script), onde a planilha é lida com a sua conta.'; return; }
    if (S.carregando) return;
    S.carregando = true; S.erro = '';
    google.script.run
      .withSuccessHandler(function (d) { S.carregando = false; S.dados = d; desenhar(); })
      .withFailureHandler(function (e) { S.carregando = false; S.erro = 'Não foi possível ler a planilha do planner: ' + (e && e.message ? e.message : e); desenhar(); })
      .plannerDados();
  }

  /* ---------------- regras do quadro ---------------- */
  function feriado(d) {
    var f = (S.dados && S.dados.feriados || []).filter(function (x) { return x.data === iso(d); })[0];
    return f ? (f.nome || 'Feriado') : '';
  }
  function restrito(d) { return d.getDay() === 0 || d.getDay() === 6 || !!feriado(d); }
  function aparece(p, turno, d) {
    if (!p.ativo || p.turno !== turno) return false;
    var dow = d.getDay(), hoje = iso(d);
    if (p.tipo === 'especial') {
      if (!p.dataInicio || !p.dataFim || hoje < p.dataInicio || hoje > p.dataFim) return false;
      if (p.dias.length && p.dias.indexOf(dow) < 0) return false;
    } else if (p.dias.indexOf(dow) < 0) return false;
    if (p.soDiaUtil && restrito(turno === 'Noturno' ? maisDias(d, 1) : d)) return false;
    return true;
  }
  function prodHtml(p, turno, d) {
    var entrega = turno === 'Noturno' ? maisDias(d, 1) : d;
    var cedec = p.soCedec && restrito(entrega);
    var tags = (p.tipo !== 'fixo' ? '<span class="pln-mini ' + p.tipo + '">' + p.tipo + '</span>' : '') +
      (p.periodo ? '<span class="pln-mini ' + p.periodo + '">' + p.periodo + '</span>' : '');
    var sub = [p.detalhe, p.observacao].filter(Boolean).join(' · ');
    return '<div class="pln-p ' + p.tipo + '"><b>' + esc(p.produto) + tags + '</b>' +
      (sub ? '<span class="s">' + esc(sub) + '</span>' : '') +
      (p.itens.length ? '<ul>' + p.itens.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul>' : '') +
      (cedec ? '<span class="e cedec">Envio: só CEDEC</span>' : (p.destino ? '<span class="e">' + esc(p.destino) + '</span>' : '')) + '</div>';
  }
  function quadroHtml() {
    var D = S.dados, prods = D.produtos || [], ta = turnoAtual(), hoje = iso(agoraMG().d);
    var dias = [0, 1, 2, 3, 4, 5, 6].map(function (i) { return maisDias(S.semana, i); });
    var fim = dias[6];
    var mes = S.semana.getMonth() === fim.getMonth() ? MESES[fim.getMonth()] : MESES[S.semana.getMonth()] + '/' + MESES[fim.getMonth()];
    var cab = '<div></div>', lD = '<div class="pln-trot d"><b>Diurno</b>7h–19h</div>', lN = '<div class="pln-trot n"><b>Noturno</b>19h–7h</div>', mob = '';
    var mobil = window.matchMedia('(max-width:760px)').matches;
    dias.forEach(function (d, i) {
      var eh = iso(d) === hoje, fer = feriado(d), ent = maisDias(d, 1);
      var ch = '<div class="pln-dcab"><span class="pln-pill ' + CORES[i] + '">' + DIAS[i] + '</span><small>' + ddmm(d) + '</small>' +
        (eh ? '<span class="pln-marca hoje">hoje</span>' : '') + (fer ? '<span class="pln-marca fer">' + esc(fer) + '</span>' : '') + '</div>';
      var aD = ta.data === iso(d) && ta.t === 'Diurno', aN = ta.data === iso(d) && ta.t === 'Noturno';
      var cd = '<div class="pln-cel d' + (eh ? ' hoje' : '') + (aD ? ' agora' : '') + '">' + (aD ? '<span class="pln-agora">turno atual</span>' : '') +
        prods.filter(function (p) { return aparece(p, 'Diurno', d); }).map(function (p) { return prodHtml(p, 'Diurno', d); }).join('') + '</div>';
      var cn = '<div class="pln-cel n' + (eh ? ' hoje' : '') + (aN ? ' agora' : '') + '">' + (aN ? '<span class="pln-agora">turno atual</span>' : '') +
        '<span class="pln-ent">Entrega ' + DIAS[ent.getDay()].toLowerCase() + ' ' + ddmm(ent) + ', 10h</span>' +
        prods.filter(function (p) { return aparece(p, 'Noturno', d); }).map(function (p) { return prodHtml(p, 'Noturno', d); }).join('') + '</div>';
      cab += ch; lD += cd; lN += cn; mob += '<div class="pln-dia">' + ch + cd + cn + '</div>';
    });
    var anot = (D.anotacoes || []).map(function (b) {
      return '<section><h3>' + esc(b.bloco) + '</h3><ul>' + b.itens.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul></section>';
    }).join('');
    return '<section class="pln-quadro" aria-label="Planejamento semanal">' +
      '<div class="pln-top"><h2>Planejamento semanal</h2><div class="pln-sem">' +
      '<button type="button" data-sem="-1" aria-label="Semana anterior">‹</button><span class="r">Semana</span><span class="v">' + ddmm(S.semana) + ' a ' + ddmm(fim) + ' · ' + mes + '</span>' +
      '<button type="button" data-sem="1" aria-label="Próxima semana">›</button><button type="button" data-sem="0" aria-label="Voltar para esta semana" title="Esta semana">●</button></div></div>' +
      '<div class="pln-leg"><span><i style="background:#9aa4b1"></i>fixo</span><span><i style="background:#e9852b"></i>extra do dia</span><span><i style="background:#6d3fb5"></i>especial (com data)</span>' +
      '<span><span class="pln-mini chuvoso" style="margin:0">chuvoso</span> out–mar</span><span><span class="pln-mini seco" style="margin:0">seco</span> abr–set</span>' +
      '<span style="color:#9a3412;font-weight:700">Envio: só CEDEC</span>= fim de semana ou feriado na data de entrega</div>' +
      '<div class="pln-scroll">' + (mobil ? '<div class="pln-grade">' + mob + '</div>' : '<div class="pln-grade">' + cab + lD + lN + '</div>') + '</div>' +
      (anot ? '<div class="pln-anot"><span class="t">Anotações:</span><div class="pln-ag">' + anot + '</div></div>' : '') +
      '<p class="pln-nota">O noturno fica na coluna do dia em que começa; a linha “Entrega” mostra para qual manhã é o boletim.</p></section>';
  }

  /* ---------------- edição ---------------- */
  function quando(p) {
    var d = p.dias.length === 7 ? 'todos os dias' : p.dias.map(function (i) { return DIAS_C[i]; }).join(', ');
    if (p.tipo === 'especial') return br(p.dataInicio) + ' a ' + br(p.dataFim) + (p.dias.length && p.dias.length < 7 ? ' (' + d + ')' : '');
    return d;
  }
  function listaProdutos() {
    var prods = S.dados.produtos || [];
    return '<div class="pln-acoes" style="justify-content:flex-start"><button class="pln-b pri" type="button" data-novo>+ Novo produto</button>' +
      '<span class="msg">Para esconder um produto sem apagar, edite e desmarque “Ativo”. A ordem define a posição dentro do dia.</span></div>' +
      '<div class="pln-tw"><table class="pln-tab"><tr><th>Ordem</th><th>Produto</th><th>Tipo</th><th>Turno</th><th>Quando</th><th>Destino</th><th>Ativo</th><th>Última edição</th><th></th></tr>' +
      prods.map(function (p) {
        return '<tr' + (p.ativo ? '' : ' class="off"') + '><td>' + (p.ordem || '') + '</td><td><b>' + esc(p.produto) + '</b>' + (p.detalhe ? '<br>' + esc(p.detalhe) : '') + '</td><td>' + p.tipo + (p.periodo ? ' · ' + p.periodo : '') +
          '</td><td>' + p.turno + '</td><td>' + esc(quando(p)) + '</td><td>' + esc(p.destino) + (p.soCedec ? '<br><small>fds/feriado: só CEDEC</small>' : '') +
          '</td><td>' + (p.ativo ? 'sim' : 'não') + '</td><td><small>' + esc(p.atualizadoEm) + '<br>' + esc(p.atualizadoPor) + '</small></td><td><button class="pln-b" type="button" data-editar="' + esc(p.id) + '">Editar</button></td></tr>';
      }).join('') + '</table></div>';
  }
  function formProduto() {
    var p = S.editando, novo = !p.id;
    var dias = [0, 1, 2, 3, 4, 5, 6].map(function (i) {
      return '<label><input type="checkbox" data-dia="' + i + '"' + (p.dias.indexOf(i) >= 0 ? ' checked' : '') + '> ' + DIAS_C[i] + '</label>';
    }).join('') + '<button class="pln-b" type="button" data-todos style="min-height:26px;padding:2px 8px">todos</button>';
    var esp = p.tipo === 'especial';
    return '<form class="pln-form" id="plnForm" novalidate>' +
      '<label class="larga">Produto<input class="pln-in" data-k="produto" value="' + esc(p.produto) + '" placeholder="Ex.: Previsão ENEM" required></label>' +
      '<label>Tipo<select class="pln-in" data-k="tipo">' + ['fixo', 'extra', 'especial'].map(function (t) { return '<option' + (p.tipo === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select>' +
      '<small>Especial = só entre as datas de início e fim.</small></label>' +
      '<label>Turno<select class="pln-in" data-k="turno">' + ['Diurno', 'Noturno'].map(function (t) { return '<option' + (p.turno === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select>' +
      '<small>O noturno fica no dia em que começa.</small></label>' +
      '<label>Período (etiqueta)<select class="pln-in" data-k="periodo"><option value="">—</option>' + ['chuvoso', 'seco'].map(function (t) { return '<option' + (p.periodo === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select></label>' +
      '<div class="grp larga">Dias da semana' + (esp ? ' <small>(opcional no especial: vazio = todos os dias do intervalo)</small>' : '') + '<div class="pln-dias">' + dias + '</div></div>' +
      (esp ? '<label>Data de início<input class="pln-in" type="date" data-k="dataInicio" value="' + esc(p.dataInicio) + '"></label>' +
        '<label>Data de fim<input class="pln-in" type="date" data-k="dataFim" value="' + esc(p.dataFim) + '"></label>' : '') +
      '<label>Detalhe<input class="pln-in" data-k="detalhe" value="' + esc(p.detalhe) + '" placeholder="Ex.: manhã · GFS atualizado"></label>' +
      '<label>Observação<input class="pln-in" data-k="observacao" value="' + esc(p.observacao) + '" placeholder="Ex.: até o fim de outubro"></label>' +
      '<label class="larga">Destino do envio<input class="pln-in" data-k="destino" value="' + esc(p.destino) + '" placeholder="Ex.: CEDEC + site SIMGE"></label>' +
      '<label class="larga">Sublista (um item por linha, opcional)<textarea class="pln-in" data-k="itens">' + esc(p.itens.join('\n')) + '</textarea></label>' +
      '<label>Ordem<input class="pln-in" type="number" data-k="ordem" value="' + esc(p.ordem || '') + '"></label>' +
      '<div class="grp">Regras<label class="pln-chk"><input type="checkbox" data-b="soCedec"' + (p.soCedec ? ' checked' : '') + '> Envio só ao CEDEC em fim de semana/feriado</label>' +
      '<label class="pln-chk"><input type="checkbox" data-b="soDiaUtil"' + (p.soDiaUtil ? ' checked' : '') + '> Só em dia útil (some em feriado)</label>' +
      '<label class="pln-chk"><input type="checkbox" data-b="ativo"' + (p.ativo ? ' checked' : '') + '> Ativo (aparece no quadro)</label></div>' +
      '<div class="pln-fim">' + (novo ? '' : (S.excluir ? '<button class="pln-b perigo" type="button" data-excluir-ok>Confirmar exclusão</button>' : '<button class="pln-b perigo" type="button" data-excluir>Excluir</button>')) +
      '<span class="sp"></span><button class="pln-b" type="button" data-cancelar>Cancelar</button><button class="pln-b pri" type="submit"' + (S.ocupado ? ' disabled' : '') + '>Salvar produto</button></div></form>';
  }
  function editFeriados() {
    if (!S.fer) S.fer = (S.dados.feriados || []).map(function (f) { return { data: f.data, nome: f.nome }; });
    return '<div class="pln-ed"><p class="pln-nota">Na data de entrega que cair em feriado, o quadro mostra “Envio: só CEDEC” nos produtos marcados com essa regra, e esconde os de “só dia útil”.</p>' +
      S.fer.map(function (f, i) {
        return '<div class="pln-lin"><input class="pln-in" type="date" data-fd="' + i + '" value="' + esc(f.data) + '" aria-label="Data do feriado"><input class="pln-in" data-fn="' + i + '" value="' + esc(f.nome) + '" placeholder="Nome do feriado" aria-label="Nome do feriado"><button class="pln-b" type="button" data-frm="' + i + '">Remover</button></div>';
      }).join('') +
      '<div class="pln-acoes" style="justify-content:flex-start"><button class="pln-b" type="button" data-fadd>+ Feriado</button><span class="sp" style="flex:1"></span><button class="pln-b pri" type="button" data-fsalvar' + (S.ocupado ? ' disabled' : '') + '>Salvar feriados</button></div></div>';
  }
  function editAnotacoes() {
    if (!S.anot) S.anot = (S.dados.anotacoes || []).map(function (b) { return { bloco: b.bloco, itens: b.itens.join('\n') }; });
    return '<div class="pln-ed"><p class="pln-nota">Blocos da faixa “Anotações”, embaixo do quadro. Um item por linha.</p>' +
      S.anot.map(function (b, i) {
        return '<div class="pln-bloco"><div class="pln-lin" style="grid-template-columns:minmax(0,1fr) auto"><input class="pln-in" data-ab="' + i + '" value="' + esc(b.bloco) + '" placeholder="Título do bloco" aria-label="Título do bloco"><button class="pln-b" type="button" data-arm="' + i + '">Remover</button></div>' +
          '<textarea class="pln-in" data-ai="' + i + '" aria-label="Itens do bloco">' + esc(b.itens) + '</textarea></div>';
      }).join('') +
      '<div class="pln-acoes" style="justify-content:flex-start"><button class="pln-b" type="button" data-aadd>+ Bloco</button><span class="sp" style="flex:1"></span><button class="pln-b pri" type="button" data-asalvar' + (S.ocupado ? ' disabled' : '') + '>Salvar anotações</button></div></div>';
  }
  function edicaoHtml() {
    var abas = [['produtos', 'Produtos'], ['feriados', 'Feriados'], ['anotacoes', 'Anotações']];
    var corpo = S.aba === 'produtos' ? (S.editando ? formProduto() : listaProdutos()) : S.aba === 'feriados' ? editFeriados() : editAnotacoes();
    return '<div class="pln-ed"><div class="pln-tabs" role="tablist">' + abas.map(function (a) {
      return '<button type="button" role="tab" data-aba="' + a[0] + '" aria-selected="' + (S.aba === a[0]) + '">' + a[1] + '</button>';
    }).join('') + '</div>' + corpo + '</div>';
  }

  /* ---------------- desenho geral ---------------- */
  function desenhar() {
    if (back.hidden) return;
    var D = S.dados;
    var msg = S.msg.indexOf('erro:') === 0 ? '<span class="pln-erro">' + esc(S.msg.slice(5)) + '</span>' : esc(S.msg);
    var podeEditar = D && D.podeEditar;
    var topo = '<div class="pln-acoes"><span class="msg">' + (msg || (D && S.modo === 'editar' ? 'Editando a planilha do planner como ' + esc(D.email) + '.' : '')) + '</span>' +
      (podeEditar ? (S.modo === 'quadro' ? '<button class="pln-b" type="button" data-modo="editar">Editar</button>' : '<button class="pln-b" type="button" data-modo="quadro">Ver quadro</button>') : '') +
      (D && D.planilhaUrl && podeEditar ? '<a class="pln-b" href="' + esc(D.planilhaUrl) + '" target="_blank" rel="noopener">Abrir planilha</a>' : '') +
      '<button class="pln-b" type="button" data-fechar>Fechar</button></div>';
    var corpo;
    if (S.erro) corpo = '<div class="pln-aviso erro">' + esc(S.erro) + '</div>';
    else if (!D) corpo = '<div class="pln-aviso">Carregando o planner…</div>';
    else corpo = S.modo === 'editar' && podeEditar ? edicaoHtml() : quadroHtml();
    modal.innerHTML = topo + corpo;
    ligar();
  }

  function lerForm() {
    var p = S.editando, f = modal.querySelector('#plnForm');
    if (!f) return;
    f.querySelectorAll('[data-k]').forEach(function (el) {
      var k = el.getAttribute('data-k');
      p[k] = k === 'itens' ? el.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean) : el.value;
    });
    f.querySelectorAll('[data-b]').forEach(function (el) { p[el.getAttribute('data-b')] = el.checked; });
    p.dias = [];
    f.querySelectorAll('[data-dia]').forEach(function (el) { if (el.checked) p.dias.push(+el.getAttribute('data-dia')); });
  }
  function on(sel, ev, fn) { modal.querySelectorAll(sel).forEach(function (el) { el.addEventListener(ev, function (e) { fn(el, e); }); }); }

  function ligar() {
    on('[data-fechar]', 'click', fechar);
    on('[data-sem]', 'click', function (el) {
      var v = +el.getAttribute('data-sem');
      S.semana = v === 0 ? inicioSemana(agoraMG().d) : maisDias(S.semana, 7 * v);
      desenhar();
    });
    on('[data-modo]', 'click', function (el) { S.modo = el.getAttribute('data-modo'); S.editando = null; S.msg = ''; S.fer = null; S.anot = null; desenhar(); });
    on('[data-aba]', 'click', function (el) { S.aba = el.getAttribute('data-aba'); S.editando = null; S.msg = ''; S.fer = null; S.anot = null; desenhar(); });
    on('[data-novo]', 'click', function () {
      S.excluir = false;
      S.editando = { id: '', produto: '', tipo: 'especial', turno: 'Diurno', periodo: '', dias: [], dataInicio: '', dataFim: '', detalhe: '', observacao: '', destino: '', itens: [], ordem: '', soCedec: false, soDiaUtil: false, ativo: true };
      desenhar();
    });
    on('[data-editar]', 'click', function (el) {
      var id = el.getAttribute('data-editar');
      var p = (S.dados.produtos || []).filter(function (x) { return x.id === id; })[0];
      if (!p) return;
      S.excluir = false;
      S.editando = JSON.parse(JSON.stringify(p));
      desenhar();
    });
    on('#plnForm [data-k="tipo"]', 'change', function () { lerForm(); desenhar(); });
    on('[data-todos]', 'click', function () {
      var cs = modal.querySelectorAll('[data-dia]'), todos = [].every.call(cs, function (c) { return c.checked; });
      cs.forEach(function (c) { c.checked = !todos; });
    });
    on('[data-cancelar]', 'click', function () { S.editando = null; S.msg = ''; desenhar(); });
    on('[data-excluir]', 'click', function () { S.excluir = true; lerForm(); desenhar(); });
    on('[data-excluir-ok]', 'click', function () {
      var id = S.editando.id;
      servidor('plannerExcluirProduto', [id], function () { S.editando = null; S.msg = 'Produto excluído.'; });
    });
    on('#plnForm', 'submit', function (el, e) {
      e.preventDefault();
      lerForm();
      var p = S.editando;
      if (!p.produto.trim()) { S.msg = 'erro:Preencha o nome do produto.'; desenhar(); return; }
      if (p.tipo === 'especial' && (!p.dataInicio || !p.dataFim)) { S.msg = 'erro:Produto especial precisa de data de início e de fim.'; desenhar(); return; }
      if (p.tipo !== 'especial' && !p.dias.length) { S.msg = 'erro:Marque pelo menos um dia da semana.'; desenhar(); return; }
      servidor('plannerSalvarProduto', [p], function () { S.editando = null; S.msg = 'Produto salvo na planilha.'; });
    });
    /* feriados */
    on('[data-fd]', 'input', function (el) { S.fer[+el.getAttribute('data-fd')].data = el.value; });
    on('[data-fn]', 'input', function (el) { S.fer[+el.getAttribute('data-fn')].nome = el.value; });
    on('[data-frm]', 'click', function (el) { S.fer.splice(+el.getAttribute('data-frm'), 1); desenhar(); });
    on('[data-fadd]', 'click', function () { S.fer.push({ data: '', nome: '' }); desenhar(); });
    on('[data-fsalvar]', 'click', function () {
      if (S.fer.some(function (f) { return f.nome.trim() && !f.data; })) { S.msg = 'erro:Preencha a data de todos os feriados (ou remova a linha).'; desenhar(); return; }
      servidor('plannerSalvarFeriados', [S.fer.filter(function (f) { return f.data; })], function () { S.fer = null; S.msg = 'Feriados salvos.'; });
    });
    /* anotações */
    on('[data-ab]', 'input', function (el) { S.anot[+el.getAttribute('data-ab')].bloco = el.value; });
    on('[data-ai]', 'input', function (el) { S.anot[+el.getAttribute('data-ai')].itens = el.value; });
    on('[data-arm]', 'click', function (el) { S.anot.splice(+el.getAttribute('data-arm'), 1); desenhar(); });
    on('[data-aadd]', 'click', function () { S.anot.push({ bloco: '', itens: '' }); desenhar(); });
    on('[data-asalvar]', 'click', function () { servidor('plannerSalvarAnotacoes', [S.anot], function () { S.anot = null; S.msg = 'Anotações salvas.'; }); });
  }

  var mq = window.matchMedia('(max-width:760px)');
  if (mq.addEventListener) mq.addEventListener('change', function () { if (S.modo === 'quadro') desenhar(); });

  function iniciar() { colocarBotao(); document.body.appendChild(back); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
