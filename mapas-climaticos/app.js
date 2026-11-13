/*
 * Mapas Climáticos v0.3 (13/11/2026, Patrick/Claude) — SIMGE/IGAM
 * v0.2: Climatologia de Precipitação; krigagem como método SEPARADO (em avaliação); isolinhas sutis opcionais.
 * v0.3: terceiro método SEPARADO, "Método recomendado (em avaliação)": um método por produto (N.RECOMENDADO) — IDW local
 *       (chuva e anomalia de chuva), krigagem (climatologia), regressão com altitude e latitude + krigagem dos resíduos
 *       (temperaturas; altitude do MDE Copernicus GLO-90 em mapas-climaticos/mde/, conferida por SHA-256). O IDW do QGIS continua
 *       o padrão e o mapa oficial; nada dele mudou.
 *
 * Tela da ferramenta. Os números saem todos de mapas-climaticos/nucleo.js (testado contra a referência em Python).
 * Etapa 1: carregar os TXT do mês, conferir e decidir as estações com alerta (com motivo e responsável).
 * Etapa 2: os 5 mapas no layout padrão (assets/layout-mapa.js), tabela por mesorregião e registro da conferência.
 * Os arquivos só saem quando não há estação pendente e o campo "Conferido por" está preenchido.
 * Segurança: o conteúdo dos arquivos nunca entra na página como HTML (tudo passa por esc()); nada é enviado
 * para fora; o registro guarda o SHA-256 de cada arquivo de entrada.
 */
(function () {
  'use strict';
  var N = window.MapasClimaticosNucleo;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var fmt = function (v, c) { return isFinite(v) ? Number(v).toFixed(c == null ? 1 : c).replace('.', ',') : '—'; };
  var MESOS = window.MESO_MC;
  var TIPOS_ORDEM = ['PREC', 'TMAX', 'TMIN', 'TMED'];
  var NOME_TIPO = { PREC: 'Precipitação (PREC)', TMAX: 'Temp. máxima (TEMP_MAX)', TMIN: 'Temp. mínima (TEMP_MIN)', TMED: 'Temp. média (TEMP_MED)' };
  var CURTO_TIPO = { PREC: 'Precipitação', TMAX: 'Máxima', TMIN: 'Mínima', TMED: 'Média' };
  var MOTIVOS = ['Falha de registro (zero ou dado faltando)', 'Valor incompatível com as vizinhas', 'Incompatível com o cenário do mês (satélite/previsão)', 'Muitos dias com falha', 'Coordenada ou cadastro errado', 'Estação duplicada', 'Retirada sugerida pela conferência automática', 'Outro (descreva)'];
  var COR_ST = { pendente: '#f59e0b', usada: '#2563eb', mantida: '#16a34a', retirada: '#dc2626', invalida: '#9aa3af' };
  var ROT_ST = { pendente: 'Pendente', usada: 'Usada', mantida: 'Mantida (conferida)', retirada: 'Retirada', invalida: 'Inválida' };
  var PLURAL = { pendente: ['pendente', 'pendentes'], usada: ['usada', 'usadas'], mantida: ['mantida após conferência', 'mantidas após conferência'], retirada: ['retirada', 'retiradas'], invalida: ['inválida', 'inválidas'] };
  var S = { arqs: {}, meta: {}, geral: [], periodoArq: null, decisoes: {}, filtro: 'pendentes', tipoTab: 'PREC', prod: 'prec', metodo: 'idw', escOpc: {}, cache: {}, cacheK: {}, cacheR: {}, iso: {}, gen: 0, sel: null, masc: null, erros: [] };

  /* ---------------- guardar decisões neste navegador (para não perder ao recarregar) ---------------- */
  function chaveSessao() { return 'mcConf:' + TIPOS_ORDEM.map(function (t) { return S.meta[t] ? S.meta[t].sha256.slice(0, 16) : '-'; }).join('|'); }
  function guardar() { try { localStorage.setItem(chaveSessao(), JSON.stringify(S.decisoes)); localStorage.setItem('mcConferente', $('mcConferente').value.trim()); } catch (e) { } }
  function recuperar() { try { var d = JSON.parse(localStorage.getItem(chaveSessao()) || 'null'); if (d && typeof d === 'object') S.decisoes = d; } catch (e) { } }

  /* ---------------- arquivos ---------------- */
  function hashHex(buf) {
    try {
      if (window.crypto && crypto.subtle) return crypto.subtle.digest('SHA-256', buf).then(function (h) { return Array.from(new Uint8Array(h)).map(function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }).catch(function () { return 'indisponível'; });
    } catch (e) { }
    return Promise.resolve('indisponível');
  }
  function lerArquivos(lista) {
    var fs = Array.prototype.slice.call(lista || []);
    if (!fs.length) return;
    if (fs.length > 8) { status('erro', 'Escolha no máximo 8 arquivos de uma vez.'); return; }
    S.erros = [];
    Promise.all(fs.map(function (f) {
      if (f.size > 3 * 1048576) return Promise.resolve({ nome: f.name, erro: 'Arquivo maior que 3 MB: não parece um TXT de estações.' });
      return f.arrayBuffer().then(function (buf) {
        var A;
        try { A = N.lerTxt(f.name, new Uint8Array(buf)); } catch (e) { return { nome: f.name, erro: e.usuario ? e.message : 'Não foi possível ler o arquivo (' + e.message + ').' }; }
        return hashHex(buf).then(function (h) { return { nome: f.name, A: A, sha256: h, bytes: buf.byteLength }; });
      });
    })).then(function (rs) {
      var trocados = [];
      rs.forEach(function (r) {
        if (r.erro) { S.erros.push(r.nome + ': ' + r.erro); return; }
        if (S.arqs[r.A.tipo]) trocados.push(NOME_TIPO[r.A.tipo]);
        S.arqs[r.A.tipo] = r.A; S.meta[r.A.tipo] = { nome: r.nome, sha256: r.sha256, bytes: r.bytes };
      });
      if (trocados.length) S.erros.push('Substituído: ' + trocados.join(', ') + '.');
      novaConferencia();
    });
  }
  function carregarExemplo() {
    var nomes = ['PREC_SET_2026.txt', 'TEMP_MAX_SET_2026.txt', 'TEMP_MIN_SET_2026.txt', 'TEMP_MED_SET_2026.txt'];
    status('', 'Carregando o exemplo…');
    Promise.all(nomes.map(function (n) {
      return fetch((window.BASE_DADOS || '../') + 'mapas-climaticos/exemplo/' + n, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(n + ': HTTP ' + r.status); return r.blob(); })
        .then(function (b) { return new File([b], n, { type: 'text/plain' }); });
    })).then(lerArquivos).catch(function (e) { status('erro', 'Não foi possível carregar o exemplo: ' + esc(e.message)); });
  }
  function remover(t) { delete S.arqs[t]; delete S.meta[t]; novaConferencia(); }

  function novaConferencia() {
    S.decisoes = {}; limparCache(); S.sel = null;
    recuperar();
    // período vindo dos arquivos preenche os campos (se ainda não foi escolhido à mão)
    var per = null; TIPOS_ORDEM.forEach(function (t) { if (!per && S.arqs[t] && S.arqs[t].periodo) per = S.arqs[t].periodo; });
    if (per) { $('mcMes').value = String(per.mes); $('mcAno').value = String(per.ano); }
    conferir();
  }
  function periodoEscolhido() { var m = +$('mcMes').value, a = +$('mcAno').value; return m && a ? { mes: m, ano: a } : null; }
  function conferir() {
    limparCache();
    if (!Object.keys(S.arqs).length) { S.geral = []; S.periodoArq = null; tudo(); return; }
    var r = N.conferir(S.arqs, MESOS, periodoEscolhido());
    S.geral = r.geral; S.periodoArq = r.periodoArquivos;
    // decisões guardadas que não batem mais com a linha (arquivo mudou): descarta
    Object.keys(S.decisoes).forEach(function (k) { var p = k.split(':'); var A = S.arqs[p[0]]; if (!A || !A.estacoes.some(function (e) { return N.chave(e) === k; })) delete S.decisoes[k]; });
    if (!S.arqs[S.tipoTab]) S.tipoTab = TIPOS_ORDEM.filter(function (t) { return S.arqs[t]; })[0] || 'PREC';
    tudo();
  }

  /* ---------------- situação geral ---------------- */
  function situacao(e) {   // decisão incompleta (retirar sem motivo; "Outro" sem observação) conta como pendente
    var d = S.decisoes[N.chave(e)];
    if (d && !decisaoCompleta(d) && e.gravidade !== 'invalida') return 'pendente';
    return N.situacaoEstacao(e, d);
  }
  function contagem(t) {
    var c = { usada: 0, mantida: 0, retirada: 0, invalida: 0, pendente: 0, total: 0, fortesPend: 0 };
    (S.arqs[t] ? S.arqs[t].estacoes : []).forEach(function (e) { var s = situacao(e); c[s]++; c.total++; if (s === 'pendente' && e.gravidade === 'forte') c.fortesPend++; });
    return c;
  }
  function bloqueiosGerais() {
    var b = [];
    S.geral.forEach(function (g) { if (g.g === 'invalida') b.push(g.txt); });
    if (!periodoEscolhido()) b.push('Escolha o mês e o ano (não vieram no nome dos arquivos).');
    if (!$('mcConferente').value.trim()) b.push('Preencha "Conferido por".');
    return b;
  }
  function prontoProduto(p) {   // { ok, motivo }
    var P = N.PRODUTOS[p], A = S.arqs[P.arq];
    if (!A) return { ok: false, motivo: 'Falta o arquivo ' + N.TIPOS[P.arq].arquivo + '.' };
    var b = bloqueiosGerais(); if (b.length) return { ok: false, motivo: b.join(' ') };
    var c = contagem(P.arq);
    if (c.pendente) return { ok: false, motivo: c.pendente + ' estação(ões) pendente(s) em ' + CURTO_TIPO[P.arq] + ': decida na etapa 1.' };
    return { ok: true };
  }
  function status(cls, html) { var el = $('mcStatus'); el.className = 'stbox' + (cls ? ' ' + cls : ''); el.innerHTML = html; }

  /* ---------------- desenho da etapa 1 ---------------- */
  function tudo() { slots(); resumoStatus(); abasArquivo(); resumoArquivo(); mapaEstacoes(); tabela(); atualizarBotoes(); if (!$('abaMapas').hidden) mapas(); }
  function slots() {
    $('mcSlots').innerHTML = TIPOS_ORDEM.map(function (t) {
      var A = S.arqs[t], m = S.meta[t];
      if (!A) return '<div class="slot falta"><b>' + esc(NOME_TIPO[t]) + '</b><span></span><span class="small">não carregado</span></div>';
      return '<div class="slot ok"><b>' + esc(NOME_TIPO[t]) + '</b><button class="x" type="button" data-rm="' + t + '" title="Tirar este arquivo" aria-label="Tirar ' + esc(NOME_TIPO[t]) + '">×</button>' +
        '<span class="small">' + esc(m.nome) + ' · ' + A.estacoes.length + ' estações · ' + esc(A.codificacao) + ' · SHA-256 ' + esc(m.sha256.slice(0, 12)) + '…</span></div>';
    }).join('');
  }
  function resumoStatus() {
    var n = Object.keys(S.arqs).length;
    if (!n && !S.erros.length) { status('', 'Carregue os arquivos do mês.'); return; }
    var itens = [], cls = 'ok';
    S.erros.forEach(function (x) { itens.push('<li class="warn">' + esc(x) + '</li>'); cls = /Substituído/.test(x) && cls === 'ok' ? 'ok' : 'erro'; });
    S.geral.forEach(function (g) { itens.push('<li class="warn">' + esc(g.txt) + '</li>'); if (g.g === 'invalida') cls = 'erro'; });
    TIPOS_ORDEM.forEach(function (t) { var A = S.arqs[t]; if (A) A.avisos.forEach(function (a) { itens.push('<li>' + esc(CURTO_TIPO[t]) + ': ' + esc(a) + '</li>'); }); });
    var per = periodoEscolhido(), pend = TIPOS_ORDEM.reduce(function (s, t) { return s + contagem(t).pendente; }, 0);
    var falta = TIPOS_ORDEM.filter(function (t) { return !S.arqs[t]; }).map(function (t) { return N.TIPOS[t].arquivo; });
    var cab = '<strong>' + n + ' de 4 arquivos</strong>' + (per ? ' · ' + N.MESES_BR[per.mes - 1] + '/' + per.ano : '') + (falta.length ? ' · falta: ' + esc(falta.join(', ')) : '') + '.';
    if (pend) { cab += ' <strong>' + pend + ' estação(ões) pendente(s)</strong> para decidir.'; if (cls === 'ok') cls = 'aviso'; }
    else if (n && cls === 'ok') cab += ' Conferência concluída.';
    if (!$('mcConferente').value.trim() && n) { itens.push('<li class="warn">Preencha "Conferido por" para decidir as estações e salvar.</li>'); if (cls === 'ok') cls = 'aviso'; }
    status(cls, cab + (itens.length ? '<ul>' + itens.join('') + '</ul>' : ''));
  }
  function abasArquivo() {
    var tipos = TIPOS_ORDEM.filter(function (t) { return S.arqs[t]; });
    $('mcArqTab').innerHTML = tipos.map(function (t) { var c = contagem(t); return '<button type="button" data-t="' + t + '"' + (t === S.tipoTab ? ' class="on"' : '') + '>' + esc(CURTO_TIPO[t]) + (c.pendente ? ' (' + c.pendente + ')' : '') + '</button>'; }).join('');
    $('mcArqTab').hidden = !tipos.length;
  }
  function resumoArquivo() {
    var A = S.arqs[S.tipoTab];
    if (!A) { $('mcResumo').innerHTML = ''; return; }
    var c = contagem(S.tipoTab);
    $('mcResumo').innerHTML = ['pendente', 'usada', 'mantida', 'retirada', 'invalida'].filter(function (s) { return c[s]; })
      .map(function (s) { return '<span class="chip st-' + s + '">' + c[s] + ' ' + PLURAL[s][c[s] > 1 ? 1 : 0] + '</span>'; }).join('') +
      '<span class="small" style="align-self:center">de ' + c.total + ' estações no arquivo</span>';
  }

  // mapa simples das estações (SVG, sem dependências): estados, mesorregiões, entorno de 150 km e pontos por situação
  var VIEW = { x0: -58.5, x1: -36.0, y0: -8.5, y1: -25.5 };
  function proj(lon, lat) { var k = 1000 / (VIEW.x1 - VIEW.x0); return [(lon - VIEW.x0) * k, (VIEW.y0 - lat) * k / Math.cos(19 * Math.PI / 180)]; }
  function caminho(geom) {
    var out = [];
    (geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates).forEach(function (poly) {
      poly.forEach(function (ring) {
        var s = ''; for (var i = 0; i < ring.length; i += (ring.length > 400 ? 3 : 1)) { var p = proj(ring[i][0], ring[i][1]); s += (s ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }
        out.push(s + 'Z');
      });
    });
    return out.join('');
  }
  var BASE_SVG = null;
  function baseSvg() {
    if (BASE_SVG) return BASE_SVG;
    var est = (window.BRASIL_ESTADOS && window.BRASIL_ESTADOS.features) || [], h = proj(VIEW.x1, VIEW.y1)[1];
    var mg = MESOS.features.map(function (f) { return caminho(f.geometry); }).join('');
    var buf = '';   // entorno de 150 km de MG (aproximado: círculo em cada vértice amostrado do contorno)
    var k = 1000 / (VIEW.x1 - VIEW.x0), r = 150 / 111.32 * k;
    MESOS.features.forEach(function (f) { (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).forEach(function (p) { for (var i = 0; i < p[0].length; i += 5) { var q = proj(p[0][i][0], p[0][i][1]); buf += '<circle cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="' + r.toFixed(1) + '"/>'; } }); });
    BASE_SVG = { h: h, txt: '<rect width="1000" height="' + h.toFixed(0) + '" fill="#eaf2f8"/>' +
      '<g fill="#dde8f1" stroke="none">' + buf + '</g>' +
      '<g fill="#fbfdff" stroke="#9fb3c8" stroke-width="1">' + est.map(function (f) { return '<path d="' + caminho(f.geometry) + '"/>'; }).join('') + '</g>' +
      '<path d="' + mg + '" fill="#ffffff" stroke="#3d5a8a" stroke-width="1.1"/>' };
    return BASE_SVG;
  }
  function mapaEstacoes() {
    var A = S.arqs[S.tipoTab], el = $('mcEstMapa');
    if (!A) { el.innerHTML = '<div class="vazio">Carregue os arquivos para ver as estações.</div>'; return; }
    var B = baseSvg(), pts = A.estacoes.filter(function (e) { return isFinite(e.lat) && isFinite(e.lon) && e.lon > VIEW.x0 && e.lon < VIEW.x1 && e.lat < VIEW.y0 && e.lat > VIEW.y1; });
    var ordem = { usada: 0, mantida: 1, invalida: 2, retirada: 3, pendente: 4 };
    pts.sort(function (a, b) { return ordem[situacao(a)] - ordem[situacao(b)]; });
    el.innerHTML = '<svg id="mcEstSvg" viewBox="0 0 1000 ' + B.h.toFixed(0) + '" role="img" aria-label="Mapa das estações">' + B.txt +
      pts.map(function (e) {
        var p = proj(e.lon, e.lat), s = situacao(e), sel = S.sel === N.chave(e);
        return '<circle data-k="' + esc(N.chave(e)) + '" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="' + (s === 'pendente' || sel ? 8 : 5.5) + '" fill="' + COR_ST[s] + '" stroke="' + (sel ? '#092b6a' : '#fff') + '" stroke-width="' + (sel ? 3 : 1.5) + '"><title>' + esc(e.codigo + ' · ' + e.estacao + ' (' + e.uf + ') — ' + ROT_ST[s]) + '</title></circle>';
      }).join('') + '</svg>';
  }

  function valorTxt(e) {
    var d = e.dados;
    if (e.tipo === 'PREC') return fmt(d.acum, 1) + ' mm' + (isFinite(d.anomPct) ? '<br><span class="small">' + fmt(d.anomPct, 0) + ' %</span>' : '');
    if (e.tipo === 'TMED') return fmt(d.anom, 1) + ' °C<br><span class="small">Tméd ' + fmt(d.tmed, 1) + '</span>';
    return fmt(d.abs, 1) + ' °C';
  }
  function linhaVisivel(e) {
    var s = situacao(e);
    if (S.filtro === 'pendentes') return s === 'pendente';
    if (S.filtro === 'alertas') return !!e.gravidade && e.gravidade !== 'info';
    if (S.filtro === 'retiradas') return s === 'retirada' || s === 'invalida';
    return true;
  }
  function tabela() {
    var A = S.arqs[S.tipoTab], body = $('mcEstBody');
    [].forEach.call(document.querySelectorAll('#mcFiltro button'), function (b) { b.classList.toggle('on', b.dataset.f === S.filtro); });
    $('mcColValor').textContent = S.tipoTab === 'PREC' ? 'Acumulado' : S.tipoTab === 'TMED' ? 'Anomalia' : 'Absoluta';
    var c = contagem(S.tipoTab);
    $('mcRetirarFortes').disabled = !c.fortesPend; $('mcRetirarFortes').textContent = 'Retirar as ' + (c.fortesPend || '') + ' pendentes com alerta forte';
    if (!A) { body.innerHTML = '<tr><td colspan="7" class="small">Sem arquivo.</td></tr>'; return; }
    var G = { invalida: 0, pendente: 1, retirada: 2, mantida: 3, usada: 4 }, GR = { invalida: 0, forte: 1, atencao: 2, info: 3 };
    var ls = A.estacoes.filter(linhaVisivel).sort(function (a, b) {
      return (G[situacao(a)] - G[situacao(b)]) || ((GR[a.gravidade] == null ? 9 : GR[a.gravidade]) - (GR[b.gravidade] == null ? 9 : GR[b.gravidade])) || ((a.distMG || 0) - (b.distMG || 0));
    });
    if (!ls.length) { body.innerHTML = '<tr><td colspan="7" class="small">' + (S.filtro === 'pendentes' ? 'Nenhuma estação pendente neste arquivo.' : 'Nenhuma estação neste filtro.') + '</td></tr>'; return; }
    body.innerHTML = ls.map(function (e) {
      var k = N.chave(e), s = situacao(e), d = S.decisoes[k] || {};
      var alertas = e.problemas.length ? '<ul class="alertas">' + e.problemas.map(function (p) { return '<li class="g-' + p.g + '">' + esc(p.txt) + '</li>'; }).join('') + '</ul>' : '<span class="small">—</span>';
      var dec;
      if (s === 'invalida') dec = '<span class="small">Sai automaticamente (linha ' + e.linha + ' do arquivo).</span>';
      else {
        var acao = d.acao || '';
        dec = '<div class="dec" data-k="' + esc(k) + '"><select class="field" data-campo="acao" aria-label="Decisão">' +
          (s === 'pendente' || !acao ? '<option value=""' + (acao ? '' : ' selected') + '>' + (s === 'pendente' ? '— decidir —' : 'Usar (sem alerta)') + '</option>' : '') +
          '<option value="manter"' + (acao === 'manter' ? ' selected' : '') + '>Manter (conferida)</option><option value="retirar"' + (acao === 'retirar' ? ' selected' : '') + '>Retirar</option></select>' +
          (acao === 'retirar' ? '<select class="field" data-campo="motivo" aria-label="Motivo"><option value="">— motivo —</option>' + MOTIVOS.map(function (m) { return '<option' + (d.motivo === m ? ' selected' : '') + '>' + esc(m) + '</option>'; }).join('') + '</select>' : '') +
          (acao ? '<input class="field" data-campo="obs" maxlength="200" placeholder="Observação' + (d.motivo === MOTIVOS[MOTIVOS.length - 1] ? ' (obrigatória)' : ' (opcional)') + '" value="' + esc(d.obs || '') + '">' : '') +
          (d.por ? '<span class="small">' + esc(d.por) + ' · ' + esc(String(d.em || '').replace('T', ' ').slice(0, 16)) + '</span>' : '') + '</div>';
      }
      var viz = isFinite(e.estimativaViz) ? fmt(e.estimativaViz, 1) : '<span class="small">sem vizinhas</span>';
      return '<tr data-k="' + esc(k) + '" class="' + (s === 'pendente' ? 'pend' : '') + (S.sel === k ? ' sel' : '') + '">' +
        '<td><span class="chip st-' + s + '">' + ROT_ST[s] + '</span></td>' +
        '<td><b>' + esc(e.codigo) + '</b> ' + esc(e.estacao) + '<br><span class="small">' + esc(e.municipio || '') + (e.municipio ? ' · ' : '') + esc(e.uf) + (e.dentroMG ? ' · ' + esc(e.mesoMapa) : '') + '</span></td>' +
        '<td class="num">' + (e.dentroMG ? 'em MG' : isFinite(e.distMG) ? Math.round(e.distMG) + ' km' : '—') + '</td>' +
        '<td class="num">' + valorTxt(e) + '</td><td class="num">' + viz + '</td><td>' + alertas + '</td><td>' + dec + '</td></tr>';
    }).join('');
  }
  function decidir(k, campo, valor) {
    var por = $('mcConferente').value.trim();
    if (!por) { $('mcConferente').focus(); status('aviso', '<strong>Preencha "Conferido por"</strong> antes de decidir: cada decisão fica registrada com o nome de quem decidiu.'); tabela(); return; }
    var d = S.decisoes[k] || {};
    if (campo === 'acao') {
      if (!valor) delete S.decisoes[k];
      else { d = { acao: valor, motivo: valor === 'retirar' ? d.motivo || '' : '', obs: d.obs || '', por: por, em: agora() }; S.decisoes[k] = d; }
    } else { d[campo] = String(valor).slice(0, 200); d.por = por; d.em = agora(); S.decisoes[k] = d; }
    limparCache();
    guardar(); slots(); resumoStatus(); abasArquivo(); resumoArquivo(); mapaEstacoes(); if (campo === 'acao' || campo === 'motivo') tabela(); atualizarBotoes();
  }
  function agora() { var d = new Date(), p = function (n) { return ('0' + n).slice(-2); }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()); }
  // decisão "retirar" sem motivo (ou "Outro" sem observação) ainda conta como pendente
  function decisaoCompleta(d) { return d && (d.acao === 'manter' || (d.acao === 'retirar' && d.motivo && (d.motivo !== MOTIVOS[MOTIVOS.length - 1] || (d.obs || '').trim()))); }
  var retirarConfirma = 0;
  function retirarFortes() {
    var b = $('mcRetirarFortes'), por = $('mcConferente').value.trim();
    if (!por) { $('mcConferente').focus(); status('aviso', '<strong>Preencha "Conferido por"</strong> antes de decidir.'); return; }
    if (Date.now() - retirarConfirma > 4000) { retirarConfirma = Date.now(); b.textContent = 'Clique de novo para confirmar'; setTimeout(function () { tabela(); }, 4000); return; }
    retirarConfirma = 0;
    S.arqs[S.tipoTab].estacoes.forEach(function (e) { if (situacao(e) === 'pendente' && e.gravidade === 'forte') S.decisoes[N.chave(e)] = { acao: 'retirar', motivo: MOTIVOS[6], obs: e.problemas.filter(function (p) { return p.g === 'forte'; }).map(function (p) { return p.txt; }).join(' ').slice(0, 200), por: por, em: agora() }; });
    limparCache(); guardar(); tudo();
  }

  /* ---------------- etapa 2: mapas ---------------- */
  // Dois métodos SEPARADOS: "idw" (padrão, igual ao QGIS) e "krig" (krigagem, EM AVALIAÇÃO). Cada um tem a própria grade,
  // o próprio cache, título, crédito, nome de arquivo e botões de salvar. A escala é a mesma (vem do IDW) para comparar.
  function limparCache() { S.cache = {}; S.cacheK = {}; S.cacheR = {}; S.iso = {}; S.gen = (S.gen || 0) + 1; }
  function decisoesValidas() {   // só decisões completas valem para o cálculo
    var d = {}; Object.keys(S.decisoes).forEach(function (k) { if (decisaoCompleta(S.decisoes[k])) d[k] = S.decisoes[k]; }); return d;
  }
  function mascara() { return S.masc || (S.masc = N.mascara(MESOS)); }
  function calcular(p) {   // IDW (rápido, síncrono)
    if (S.cache[p]) return S.cache[p];
    var P = N.PRODUTOS[p], A = S.arqs[P.arq];
    if (!A) return null;
    var pts = N.pontosDoProduto(A, P.campo, decisoesValidas());
    if (!pts.length) return null;
    var g = N.idwGrade(pts, mascara(), 2), vals = [];
    for (var i = 0; i < g.length; i++) if (isFinite(g[i])) vals.push(g[i]);
    var vc = N.validacaoCruzada(pts, 2, function (x) { return x.dentroMG; });
    return (S.cache[p] = { pts: pts, grade: g, vals: vals, vc: vc });
  }
  // krigagem: ~4 s por mapa; calculada em pedaços para a tela não travar. Se as decisões mudarem no meio, recomeça.
  function calcularKrig(p) { return S.cacheK[p] && S.cacheK[p].pronto ? S.cacheK[p] : null; }
  function iniciarKrig(p) {
    if (S.cacheK[p]) return;
    var C = calcular(p); if (!C) return;
    var P = N.PRODUTOS[p], G = N.GRADE, gen = S.gen, masc = mascara();
    var K = S.cacheK[p] = { pronto: false, progresso: 0 };
    var vario = N.ajustarVariograma(C.pts), ctx = N.prepararKrigagem(C.pts, vario), j = 0, PASSO = 30;
    (function pedaco() {
      if (gen !== S.gen || S.cacheK[p] !== K) return;   // cancelado (decisão mudou)
      N.krigagemLinhas(ctx, masc, G, j, j + PASSO, P.piso); j += PASSO;
      K.progresso = Math.min(1, j / G.ny);
      if (S.prod === p && S.metodo === 'krig' && !$('abaMapas').hidden) { var el = $('mcMapa').querySelector('.vazio b'); if (el) el.textContent = Math.round(K.progresso * 100) + ' %'; }
      if (j < G.ny) { setTimeout(pedaco, 0); return; }
      setTimeout(function () {
        if (gen !== S.gen || S.cacheK[p] !== K) return;
        K.grade = ctx.grade; K.vario = vario; K.pts = C.pts; K.sistemas = ctx.sistemas;
        K.vc = N.validacaoCruzadaKrig(C.pts, function (x) { return x.dentroMG; }, P.piso);
        K.pronto = true;
        if (!$('abaMapas').hidden && S.prod === p) mapas(); else atualizarBotoes();
      }, 0);
    })();
  }
  /* ---- método recomendado (em avaliação): um método por produto, calculado em pedaços como a krigagem ---- */
  var SUFIXO_REC = { local: { titulo: ' (IDW local)', arquivo: '_IDWLOCAL', credito: 'IDW local, 12 estações mais próximas' },
    krig: { titulo: ' (Krigagem)', arquivo: '_KRIGAGEM', credito: 'krigagem ordinária' },
    rk: { titulo: ' (Regressão-krigagem)', arquivo: '_REGKRIG', credito: 'regressão com a altitude + krigagem dos resíduos' } };
  function carregarMde() {
    if (S.mde) return Promise.resolve(S.mde);
    if (S.mdeP) return S.mdeP;
    if (!window.Mde) return Promise.reject(new Error('o módulo do relevo (mde.js) não carregou'));
    S.mdeP = Mde.carregar((window.BASE_DADOS || '../') + 'mapas-climaticos/mde/').then(function (m) { S.mde = m; return m; }, function (e) { S.mdeP = null; throw e; });
    return S.mdeP;
  }
  function calcularRec(p) { return S.cacheR[p] && S.cacheR[p].pronto ? S.cacheR[p] : null; }
  function recBloqueado(X) { return !X || !X.pronto || (X.rk && !X.rk.gradienteOk); }
  function iniciarRec(p) {
    if (S.cacheR[p]) return;
    var C = calcular(p); if (!C) return;
    var P = N.PRODUTOS[p], Rp = N.RECOMENDADO[p], G = N.GRADE, gen = S.gen, masc = mascara(), mg = function (x) { return x.dentroMG; };
    var X = S.cacheR[p] = { pronto: false, progresso: 0, metodo: Rp.metodo, nome: Rp.nome };
    var vivo = function () { return gen === S.gen && S.cacheR[p] === X; };
    var redesenhar = function () { if (!$('abaMapas').hidden && S.prod === p) mapas(); else atualizarBotoes(); };
    function preparar() {
      var pts = C.pts.map(function (q) { return { codigo: q.codigo, lon: q.lon, lat: q.lat, v: q.v, dentroMG: q.dentroMG }; });
      if (Rp.metodo === 'local') { var L = N.prepararLocal(pts); return { pts: pts, passo: function (a, b) { N.idwLocalLinhas(L, masc, G, a, b); }, grade: function () { return L.grade; }, vc: function () { return N.validacaoCruzadaLocal(pts, mg); } }; }
      if (Rp.metodo === 'krig') { var v = N.ajustarVariograma(pts), K = N.prepararKrigagem(pts, v); return { pts: pts, vario: v, passo: function (a, b) { N.krigagemLinhas(K, masc, G, a, b, P.piso); }, grade: function () { return K.grade; }, vc: function () { return N.validacaoCruzadaKrig(pts, mg, P.piso); } }; }
      var opc = { anomalia: !!Rp.anomalia };
      pts.forEach(function (q) { q.alt = Mde.altitudeEstacao(S.mde, q.lon, q.lat); });
      var rk = N.prepararRK(pts, opc);
      return { pts: pts, rk: rk, vario: rk.vario, passo: function (a, b) { N.rkLinhas(rk, masc, S.mde.mg.z, G, a, b); }, grade: function () { return rk.grade; }, vc: function () { return N.validacaoCruzadaRK(pts, mg, opc); } };
    }
    function comecar() {
      if (!vivo()) return;
      var T;
      try { T = preparar(); } catch (e) { X.erro = e.usuario ? e.message : 'Não foi possível calcular o método recomendado (' + e.message + ').'; redesenhar(); return; }
      X.rk = T.rk || null; X.vario = T.vario || null; X.pts = T.pts;
      var j = 0, PASSO = 30;
      (function pedaco() {
        if (!vivo()) return;
        try { T.passo(j, j + PASSO); } catch (e) { X.erro = 'Não foi possível calcular o método recomendado (' + e.message + ').'; redesenhar(); return; }
        j += PASSO; X.progresso = Math.min(1, j / G.ny);
        if (S.prod === p && S.metodo === 'rec' && !$('abaMapas').hidden) { var el = $('mcMapa').querySelector('.vazio b'); if (el) el.textContent = Math.round(X.progresso * 100) + ' %'; }
        if (j < G.ny) { setTimeout(pedaco, 0); return; }
        setTimeout(function () {
          if (!vivo()) return;
          X.grade = T.grade();
          try { X.vc = T.vc(); } catch (e) { X.vc = null; }
          X.pronto = true; redesenhar();
        }, 0);
      })();
    }
    if (Rp.metodo === 'rk' && !S.mde) carregarMde().then(comecar, function (e) { if (!vivo()) return; X.erro = 'O relevo (altitude) não carregou: ' + e.message + '. Este método precisa dele; use o IDW ou a krigagem e recarregue a página mais tarde.'; redesenhar(); });
    else comecar();
  }
  function gradeDe(p, metodo) {
    if (metodo === 'krig') { var K = calcularKrig(p); return K && K.grade; }
    if (metodo === 'rec') { var X = calcularRec(p); return X && X.grade; }
    var C = calcular(p); return C && C.grade;
  }
  function escala(p) {
    var C = calcular(p), o = S.escOpc[p] || {};
    return N.escalaDe(p, C.vals, o.auto === false ? { passo: o.passo, primeiro: o.primeiro, classes: o.classes } : {});
  }
  function areas(grade, es) {   // trechos seguidos da mesma classe viram retângulos (mesmo método da Umidade Mínima e do Curto Prazo)
    var G = N.GRADE, masc = mascara(), polys = es.cores.map(function () { return []; }), h = G.d / 2;
    for (var j = 0; j < G.ny; j++) {
      var lat = N.latDe(G, j), i = 0;
      while (i < G.nx) {
        var c0 = j * G.nx + i;
        if (masc[c0] < 0 || !isFinite(grade[c0])) { i++; continue; }
        var cl = N.classe(grade[c0], es.lim), ie = i;
        while (ie + 1 < G.nx) { var c1 = j * G.nx + ie + 1; if (masc[c1] < 0 || !isFinite(grade[c1]) || N.classe(grade[c1], es.lim) !== cl) break; ie++; }
        var l = N.lonDe(G, i) - h, r = N.lonDe(G, ie) + h;
        polys[cl].push([[[l, lat + h], [r, lat + h], [r, lat - h], [l, lat - h], [l, lat + h]]]);
        i = ie + 1;
      }
    }
    return polys.map(function (pp, k) { return pp.length ? { geometry: { type: 'MultiPolygon', coordinates: pp }, fill: es.cores[k], stroke: es.cores[k], strokeWidth: 0.15 } : null; }).filter(Boolean);
  }

  /* ---- isolinhas sutis (opcionais): nos limites das classes da escala, por marching squares na grade do método ---- */
  var ISO = { cor: '#2b2b2b', largura: 0.13, opacidade: 0.45, rotTam: 2.4, rotCor: '#262626', rotOpac: 0.85, folga: 0.5, mmGrau: 18.61,
    passoRot: 1.6, compMin: 1.2, distRot: 0.75, simplif: 0.012 };   // em graus: rótulo a cada ~1,6°; linha mínima 1,2°; rótulos a 0,75° um do outro
  function dentroMGcel(lon, lat) { var G = N.GRADE, i = Math.round((lon - G.lon0) / G.d), j = Math.round((G.lat0 - lat) / G.d); return i >= 0 && j >= 0 && i < G.nx && j < G.ny && mascara()[j * G.nx + i] >= 0; }
  function pertoDivisa(lon, lat, d) {
    var fs = MESOS.features;
    for (var f = 0; f < fs.length; f++) {
      var g = fs[f].geometry, polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
      for (var p = 0; p < polys.length; p++) for (var r = 0; r < polys[p].length; r++) {
        var ring = polys[p][r];
        for (var i = 1; i < ring.length; i++) {
          var x1 = ring[i - 1][0], y1 = ring[i - 1][1], dx = ring[i][0] - x1, dy = ring[i][1] - y1, L = dx * dx + dy * dy;
          var t = L ? Math.max(0, Math.min(1, ((lon - x1) * dx + (lat - y1) * dy) / L)) : 0;
          if (Math.hypot(lon - x1 - t * dx, lat - y1 - t * dy) < d) return true;
        }
      }
    }
    return false;
  }
  // média móvel (janela de 2r+1 células, 2 passadas ≈ gaussiana) só dentro de Minas: usada APENAS para as isolinhas do método
  // com relevo (regressão-krigagem), que na grade de 1 km viram dezenas de laços pequenos. O mapa colorido não é suavizado.
  function suavizarParaIso(grade, r) {
    var G = N.GRADE, nx = G.nx, ny = G.ny, masc = mascara(), a = Float64Array.from(grade), t = new Float64Array(nx * ny);
    for (var pass = 0; pass < 2; pass++) {
      for (var j = 0; j < ny; j++) for (var i = 0; i < nx; i++) {   // horizontal
        var s0 = 0, n0 = 0; for (var k = -r; k <= r; k++) { var ii = i + k; if (ii < 0 || ii >= nx) continue; var v = a[j * nx + ii]; if (isFinite(v)) { s0 += v; n0++; } }
        t[j * nx + i] = n0 ? s0 / n0 : NaN;
      }
      for (j = 0; j < ny; j++) for (i = 0; i < nx; i++) {   // vertical
        var c = j * nx + i; if (masc[c] < 0 || !isFinite(grade[c])) { a[c] = NaN; continue; }
        var s1 = 0, n1 = 0; for (k = -r; k <= r; k++) { var jj = j + k; if (jj < 0 || jj >= ny) continue; var w = t[jj * nx + i]; if (isFinite(w)) { s1 += w; n1++; } }
        a[c] = n1 ? s1 / n1 : NaN;
      }
    }
    return a;
  }
  // est (opcional): estilo dos rótulos {rotTam, rotCor, rotOpac}; sem ele, o estilo de sempre (ISO)
  function isolinhas(grade, lim, comRotulos, comCidades, chave, minComp, est) {
    chave = chave + '|' + (comRotulos ? 1 : 0) + (comCidades ? 1 : 0);
    minComp = minComp || 0;
    var RT = est && est.rotTam || ISO.rotTam, RC = est && est.rotCor || ISO.rotCor, RO = est && est.rotOpac || ISO.rotOpac;
    if (S.iso[chave]) return S.iso[chave];
    var G = N.GRADE, nx = G.nx, ny = G.ny, ll = function (x, y) { return [G.lon0 + G.d * x, G.lat0 - G.d * y]; };
    var linhas = [], rotulos = [], usados = [], cids = comCidades ? cidades() : [];
    lim.forEach(function (nv) {
      var segs = [], q;
      for (var y = 0; y < ny - 1; y++) for (var x = 0; x < nx - 1; x++) {
        var a = grade[y * nx + x], b = grade[y * nx + x + 1], c = grade[(y + 1) * nx + x + 1], d = grade[(y + 1) * nx + x];
        if (!(isFinite(a) && isFinite(b) && isFinite(c) && isFinite(d))) continue;
        var idx = (a > nv) | ((b > nv) << 1) | ((c > nv) << 2) | ((d > nv) << 3);   // "> limite" = acima da classe (valor <= limite fica na classe)
        if (idx === 0 || idx === 15) continue;
        var E = {
          t: function () { return { k: 'h' + x + ',' + y, p: ll(x + (nv - a) / (b - a), y) }; },
          r: function () { return { k: 'v' + (x + 1) + ',' + y, p: ll(x + 1, y + (nv - b) / (c - b)) }; },
          b: function () { return { k: 'h' + x + ',' + (y + 1), p: ll(x + (nv - d) / (c - d), y + 1) }; },
          l: function () { return { k: 'v' + x + ',' + y, p: ll(x, y + (nv - a) / (d - a)) }; }
        };
        var T = { 1: [['l', 't']], 2: [['t', 'r']], 3: [['l', 'r']], 4: [['r', 'b']], 5: [['l', 't'], ['r', 'b']], 6: [['t', 'b']], 7: [['l', 'b']],
          8: [['b', 'l']], 9: [['b', 't']], 10: [['t', 'r'], ['b', 'l']], 11: [['b', 'r']], 12: [['r', 'l']], 13: [['r', 't']], 14: [['t', 'l']] }[idx];
        T.forEach(function (pq) { segs.push([E[pq[0]](), E[pq[1]]()]); });
      }
      var porPonta = new Map();
      segs.forEach(function (s, i) { s.forEach(function (e) { var l = porPonta.get(e.k); if (!l) porPonta.set(e.k, l = []); l.push(i); }); });
      var usado = new Uint8Array(segs.length);
      for (var i = 0; i < segs.length; i++) {
        if (usado[i]) continue;
        usado[i] = 1;
        var pts = [segs[i][0], segs[i][1]];
        [true, false].forEach(function (fim) {
          for (;;) {
            var e = fim ? pts[pts.length - 1] : pts[0], viz = porPonta.get(e.k) || [], j = -1;
            for (var q = 0; q < viz.length; q++) if (!usado[viz[q]]) { j = viz[q]; break; }
            if (j < 0) return;
            usado[j] = 1;
            var prox = segs[j][0].k === e.k ? segs[j][1] : segs[j][0];
            if (fim) pts.push(prox); else pts.unshift(prox);
          }
        });
        // simplifica (pontos a pelo menos ISO.simplif graus) para o desenho não ficar pesado
        var ln = [pts[0].p];
        for (q = 1; q < pts.length - 1; q++) { var u = ln[ln.length - 1], w = pts[q].p; if (Math.hypot(w[0] - u[0], w[1] - u[1]) >= ISO.simplif) ln.push(w); }
        if (pts.length > 1) ln.push(pts[pts.length - 1].p);
        var acum = [0]; for (q = 1; q < ln.length; q++) acum.push(acum[q - 1] + Math.hypot(ln[q][0] - ln[q - 1][0], ln[q][1] - ln[q - 1][1]));
        var comp = acum[acum.length - 1], cortes = [];
        if (minComp && comp < minComp) continue;   // laço pequeno (só no método com relevo)
        if (comRotulos && comp >= ISO.compMin) {
          var txt = N.fmt(nv), meia = (txt.length * 0.556 * RT / 2 + ISO.folga) / ISO.mmGrau;
          for (var s0 = comp / 2 % ISO.passoRot || comp / 2; s0 < comp - meia; s0 += ISO.passoRot) {
            if (s0 < meia) continue;
            var k = 0; while (k < acum.length - 1 && acum[k + 1] < s0) k++;
            var t0 = (s0 - acum[k]) / ((acum[k + 1] - acum[k]) || 1), lo = ln[k][0] + t0 * (ln[k + 1][0] - ln[k][0]), la = ln[k][1] + t0 * (ln[k + 1][1] - ln[k][1]);
            if (![[0, 0], [0.12, 0], [-0.12, 0], [0, 0.08], [0, -0.08]].every(function (o) { return dentroMGcel(lo + o[0], la + o[1]); })) continue;
            if (usados.some(function (u) { return Math.hypot(u[0] - lo, u[1] - la) < ISO.distRot; })) continue;
            if (pertoDivisa(lo, la, 0.1)) continue;
            if (cids.some(function (c) { return Math.abs(c.lon - lo) < 0.55 && la > c.lat - 0.32 && la < c.lat + 0.2; })) continue;
            var ka = Math.max(0, k - 2), kb = Math.min(ln.length - 1, k + 3), ang = Math.atan2(-(ln[kb][1] - ln[ka][1]), ln[kb][0] - ln[ka][0]) * 180 / Math.PI;
            if (ang > 90) ang -= 180; else if (ang < -90) ang += 180;
            usados.push([lo, la]); cortes.push([s0 - meia, s0 + meia]);
            rotulos.push({ lon: lo, lat: la, texto: txt, angulo: +ang.toFixed(1), tamanho: RT, cor: RC, opacidade: RO, halo: false });
          }
        }
        // corta a linha embaixo dos rótulos
        var trecho = [], ci = 0;
        for (q = 0; q < ln.length; q++) {
          var dist = acum[q];
          while (ci < cortes.length && dist > cortes[ci][1]) ci++;
          if (ci < cortes.length && dist >= cortes[ci][0] && dist <= cortes[ci][1]) { if (trecho.length > 1) linhas.push(trecho); trecho = []; continue; }
          trecho.push(ln[q]);
        }
        if (trecho.length > 1) linhas.push(trecho);
      }
    });
    return (S.iso[chave] = { linhas: linhas, rotulos: rotulos });
  }
  /* ---- isolinhas em intervalos fixos (13/11/2026): a cada 50 ou 100, só nos mapas em mm ou % ---- */
  var ISO_INT = { linha: '#ffffff', largura: 0.22, opacLinha: 0.8, rotCor: '#3a3a3a', rotOpac: 0.7, rotTam: 3.6 };   // igual à Umidade Mínima
  function isoTipo() { var v = $('mcIsoTipo') ? $('mcIsoTipo').value : 'faixas'; return v === '50' || v === '100' ? v : 'faixas'; }
  function aceitaIntervalo(p) { var u = N.PRODUTOS[p].unidade; return u === 'mm' || u === '%'; }
  function isoPasso(p) { var t = isoTipo(); return t !== 'faixas' && aceitaIntervalo(p) ? +t : 0; }
  function niveisIntervalo(grade, passo, chave) {   // múltiplos do passo entre o menor e o maior valor do mapa
    var k = 'niv|' + chave + '|' + passo; if (S.iso[k]) return S.iso[k];
    var mn = Infinity, mx = -Infinity; for (var i = 0; i < grade.length; i++) { var v = grade[i]; if (isFinite(v)) { if (v < mn) mn = v; if (v > mx) mx = v; } }
    var l = []; if (isFinite(mn)) for (var n = Math.ceil(mn / passo) * passo; n <= mx && l.length < 60; n += passo) l.push(n);
    return (S.iso[k] = l);
  }
  function cidades() {
    var fs = (window.CIDADES && window.CIDADES.features) || [];
    return fs.map(function (f) { return { nome: f.properties.NM_LOCAL_1 || f.properties.NM_MUNICIP || '', lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }; }).filter(function (c) { return c.nome; });
  }
  function opMapa(p, metodo) {
    metodo = metodo || S.metodo;
    var P = N.PRODUTOS[p], per = periodoEscolhido(), C = calcular(p), es = escala(p), grade = gradeDe(p, metodo), krig = metodo === 'krig';
    var rec = metodo === 'rec' ? SUFIXO_REC[N.RECOMENDADO[p].metodo] : null;
    var dias = N.diasNoMes(per.mes, per.ano), mm = ('0' + per.mes).slice(-2);
    var op = {
      titulo: P.titulo + ' - ' + N.MESES_BR[per.mes - 1] + (P.semAno ? '' : ' de ' + per.ano) + (krig ? ' (Krigagem)' : rec ? rec.titulo : ''),
      textoValidade: P.semAno ? 'NORMAL CLIMATOLÓGICA 1991-2020 (INMET)' : 'PERÍODO: 01/' + mm + '/' + per.ano + ' a ' + dias + '/' + mm + '/' + per.ano,
      credito: P.credito + (krig ? ' · Interpolação: krigagem ordinária (em avaliação)' : rec ? ' · Interpolação: ' + rec.credito + ' (em avaliação)' : '') + ' - SIMGE/IGAM, ' + new Date().getFullYear(),
      fundo: '',
      areas: areas(grade, es),
      legenda: es.rotulos.map(function (l, i) { return { fill: es.cores[i], label: l + ' ' + P.unidade }; }),
      cidades: $('mcCidades').checked ? cidades() : []
    };
    if ($('mcIso').checked) {
      // tipo: nas faixas (como sempre) ou a cada 50/100 (mm ou %), no estilo da Umidade Mínima (linha branca, rótulo cinza)
      var passoIso = isoPasso(p), niveisIso = passoIso ? niveisIntervalo(grade, passoIso, metodo + '|' + p) : es.lim, estIso = passoIso ? ISO_INT : null;
      var comRelevo = metodo === 'rec' && N.RECOMENDADO[p].metodo === 'rk', chIso = metodo + '|' + p + '|' + niveisIso.join(',') + (passoIso ? '|i' : '');
      var I = comRelevo ? (S.iso[chIso + '|' + ($('mcIsoRot').checked ? 1 : 0) + ($('mcCidades').checked ? 1 : 0)] || isolinhas(suavizarParaIso(grade, 3), niveisIso, $('mcIsoRot').checked, $('mcCidades').checked, chIso, 0.3, estIso))
        : isolinhas(grade, niveisIso, $('mcIsoRot').checked, $('mcCidades').checked, chIso, 0, estIso);
      op.isolinhas = [passoIso ? { linhas: I.linhas, stroke: ISO_INT.linha, width: ISO_INT.largura, opacity: ISO_INT.opacLinha } : { linhas: I.linhas, stroke: ISO.cor, width: ISO.largura, opacity: ISO.opacidade }];
      op.rotulosIso = I.rotulos;
    }
    if ($('mcMostrarEst').checked) op.pontos = C.pts.filter(function (x) { return x.lon > -52 && x.lon < -39 && x.lat > -23.5 && x.lat < -14; }).map(function (x) { return { lon: x.lon, lat: x.lat, rotulo: '', cor: '#111' }; });
    return op;
  }
  function nomeArquivo(p, ext, metodo) {
    var per = periodoEscolhido(), P = N.PRODUTOS[p];
    var m = metodo || S.metodo, suf = m === 'krig' ? '_KRIGAGEM' : m === 'rec' ? SUFIXO_REC[N.RECOMENDADO[p].metodo].arquivo : '';
    return P.sigla + '_' + N.SIGLAS[per.mes - 1] + (P.semAno ? '' : '_' + per.ano) + suf + '.' + ext;
  }
  function linhaValid(nome, v, un) { return v ? '<tr><td>' + nome + '</td><td class="num">' + v.n + '</td><td class="num">' + fmt(v.mae, 2) + '</td><td class="num">' + fmt(v.rmse, 2) + '</td><td class="num">' + fmt(v.vies, 2) + '</td></tr>' : '<tr><td>' + nome + '</td><td colspan="4" class="small">' + un + '</td></tr>'; }
  function mapas() {
    $('mcProd').innerHTML = N.ORDEM.map(function (p) { var ok = prontoProduto(p).ok, P = N.PRODUTOS[p]; return '<button type="button" data-p="' + p + '"' + (p === S.prod ? ' class="on"' : '') + ' title="' + esc(P.titulo) + '">' + esc(P.sigla) + (ok ? '' : ' ·') + '</button>'; }).join('');
    [].forEach.call(document.querySelectorAll('#mcMetodo button'), function (b) { b.classList.toggle('on', b.dataset.m === S.metodo); });
    var krig = S.metodo === 'krig', recM = S.metodo === 'rec';
    $('mcVistaIdw').hidden = krig || recM; $('mcVistaKrig').hidden = !krig; $('mcKrigAviso').hidden = !krig; $('mcVistaRec').hidden = !recM; $('mcRecAviso').hidden = !recM;
    $('mcIsoRot').disabled = !$('mcIso').checked;
    $('mcIsoTipo').disabled = !$('mcIso').checked;
    $('mcIsoTipoHint').textContent = $('mcIso').checked && isoTipo() !== 'faixas' && !aceitaIntervalo(S.prod) ? 'Nas temperaturas as isolinhas ficam nas faixas (50/100 vale para chuva em mm e anomalia em %).' : '';
    var p = S.prod, P = N.PRODUTOS[p], el = $('mcMapa'), pr = prontoProduto(p), C = S.arqs[P.arq] ? calcular(p) : null;
    $('mcMapaTit').textContent = P.titulo + (krig ? ' — Krigagem (em avaliação)' : recM ? ' — ' + N.RECOMENDADO[p].nome + ' (em avaliação)' : '');
    $('mcRecMetodo').textContent = N.RECOMENDADO[p].nome;
    if (!C) {
      el.innerHTML = '<div class="vazio">' + esc(S.arqs[P.arq] ? 'Nenhuma estação aprovada para este produto.' : 'Falta o arquivo ' + N.TIPOS[P.arq].arquivo + ' (etapa 1).') + '</div>';
      $('mcProdStatus').className = 'stbox aviso'; $('mcProdStatus').textContent = pr.motivo || 'Sem dados.'; $('mcMesoBody').innerHTML = ''; $('mcValid').innerHTML = '—'; $('mcVario').textContent = ''; $('mcRecInfo').textContent = '';
      $('previewBtn').disabled = true; escalaCampos(p, null); atualizarBotoes(); return;
    }
    var es = escala(p);
    escalaCampos(p, es);
    if (krig) iniciarKrig(p);
    if (recM) iniciarRec(p);
    var K = calcularKrig(p), X = S.cacheR[p];
    $('mcProdStatus').className = 'stbox ' + (pr.ok ? 'ok' : 'aviso');
    $('mcProdStatus').innerHTML = (pr.ok ? '<strong>Pronto para salvar.</strong> ' + C.pts.length + ' estações (' + C.pts.filter(function (x) { return x.dentroMG; }).length + ' em MG). Arquivo: ' + esc(nomeArquivo(p, 'png')) + '.'
      : '<strong>Prévia — ainda não dá para salvar.</strong> ' + esc(pr.motivo) + ' As pendentes estão fora deste mapa até a decisão.');
    // qualidade: IDW e krigagem lado a lado (mesmas estações, mesma validação deixando uma de fora)
    $('mcValid').innerHTML = '<table class="mtab" style="font-size:13px"><thead><tr><th>Método</th><th class="num">Estações MG</th><th class="num">Erro médio</th><th class="num">RMSE</th><th class="num">Viés</th></tr></thead><tbody>' +
      linhaValid('IDW (padrão)', C.vc, 'sem estações em MG') + linhaValid('Krigagem', K && K.vc, K ? 'sem estações em MG' : (S.cacheK[p] ? 'calculando…' : 'abra o método Krigagem para calcular')) +
      linhaValid('Recomendado: ' + esc(N.RECOMENDADO[p].nome), X && X.pronto && X.vc, X && X.erro ? 'não calculado: ' + esc(X.erro) : X && X.pronto ? 'sem estações em MG' : (X ? 'calculando…' : 'abra o Método recomendado para calcular')) + '</tbody></table>' +
      '<p class="small" style="margin-top:6px">Unidade: ' + esc(P.unidade) + '. Quanto menor o erro, melhor; compare os métodos sempre com as mesmas estações.</p>';
    $('mcRecInfo').innerHTML = recInfo(p, X);
    $('mcVario').innerHTML = K ? 'Variograma do mês: pepita ' + fmt(K.vario.pepita, 2) + ' · patamar ' + fmt(K.vario.patamar, 2) + ' · alcance <b>' + K.vario.alcance + ' km</b>' +
      (K.vario.noLimite ? '<br><span class="g-atencao">O alcance bateu no limite de 1200 km: neste mês os dados não definem bem a distância de influência entre as estações. Use a krigagem só para comparar.</span>' : '') +
      (!K.vario.ajustado ? '<br><span class="g-forte">Poucos pares de estações: o variograma não pôde ser ajustado (valores padrão).</span>' : '') : '';
    if (!periodoEscolhido()) { el.innerHTML = '<div class="vazio">Escolha o mês e o ano na etapa 1.</div>'; atualizarBotoes(); return; }
    if (!window.LayoutMapa) { el.innerHTML = '<div class="vazio">Não foi possível carregar o layout do mapa. Recarregue a página.</div>'; return; }
    if (krig && !K) {
      el.innerHTML = '<div class="vazio">Calculando a krigagem (cerca de 5 segundos)… <b>' + Math.round(((S.cacheK[p] || {}).progresso || 0) * 100) + ' %</b></div>';
      $('previewBtn').disabled = true; $('mcMesoBody').innerHTML = ''; atualizarBotoes(); return;
    }
    if (recM && !(X && X.pronto)) {
      el.innerHTML = X && X.erro ? '<div class="vazio">' + esc(X.erro) + '</div>' : '<div class="vazio">Calculando o método recomendado (' + esc(N.RECOMENDADO[p].nome) + ')… <b>' + Math.round(((X || {}).progresso || 0) * 100) + ' %</b></div>';
      $('previewBtn').disabled = true; $('mcMesoBody').innerHTML = ''; atualizarBotoes(); return;
    }
    var op = opMapa(p), img = new Image(); img.alt = op.titulo;
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(LayoutMapa.svg(op));
    el.innerHTML = ''; el.appendChild(img);
    $('previewBtn').disabled = false;
    var est = N.estatMeso(gradeDe(p, S.metodo), mascara(), MESOS), cont = MESOS.features.map(function (f) { return C.pts.filter(function (x) { return N.dentroGeom(x.lon, x.lat, f.geometry); }).length; });
    $('mcMesoLede').textContent = P.titulo + ' (' + P.unidade + ')' + (krig ? ', krigagem' : recM ? ', ' + N.RECOMENDADO[p].nome.toLowerCase() : '') + ': média, mínimo e máximo do mapa dentro de cada mesorregião.';
    $('mcMesoBody').innerHTML = est.map(function (m, i) { return '<tr><td>' + esc(m.nome) + '</td><td class="num">' + fmt(m.media) + '</td><td class="num">' + fmt(m.min) + '</td><td class="num">' + fmt(m.max) + '</td><td class="num">' + cont[i] + '</td></tr>'; }).join('');
    atualizarBotoes();
  }
  // painel do método recomendado: o que foi usado e os avisos (gradiente fora da faixa bloqueia o PNG)
  function recInfo(p, X) {
    var Rp = N.RECOMENDADO[p], u = N.PRODUTOS[p].unidade, h = '';
    if (!X) return '';
    if (X.erro) return '<span class="g-forte">' + esc(X.erro) + '</span>';
    if (X.rk) {
      var r = X.rk, rg = r.reg;
      h += 'Regressão do mês: <b>' + fmt(rg.bAlt, 2) + ' ' + esc(u) + ' por km de altitude</b> · ' + fmt(rg.bLat, 3) + ' ' + esc(u) + ' por grau de latitude · R² ' + fmt(rg.r2, 2) +
        ' · ' + r.usadas + ' estações com altitude' + (r.semAltitude ? ' (<b>' + r.semAltitude + ' sem altitude, fora da regressão</b>)' : '') + '.';
      h += '<br>Altitude das estações: ' + fmt(r.altMinEst, 0) + ' a ' + fmt(r.altMaxEst, 0) + ' m (MDE Copernicus GLO-90, média da célula' + (S.mde && S.mde.conferido ? ', SHA-256 conferido' : '') + ').';
      if (X.pronto && r.celulasLimitadas) h += ' ' + r.celulasLimitadas + ' células de Minas fora dessa faixa usam o limite (sem extrapolar).';
      if (!r.gradienteOk) h += '<br><span class="g-forte">O coeficiente da altitude (' + fmt(rg.bAlt, 2) + ' ' + esc(u) + '/km) ficou fora da faixa aceita (' + fmt(r.gradienteFaixa[0], 0) + ' a ' + fmt(r.gradienteFaixa[1], 0) + '). Confira as estações: o PNG deste método fica bloqueado neste mês.</span>';
      else if (rg.r2 < 0.1) h += '<br><span class="g-atencao">A altitude e a latitude explicam pouco neste mês (R² ' + fmt(rg.r2, 2) + '): o mapa fica parecido com a krigagem.</span>';
    }
    if (X.vario) h += (h ? '<br>' : '') + 'Variograma' + (X.rk ? ' dos resíduos' : '') + ': pepita ' + fmt(X.vario.pepita, 2) + ' · patamar ' + fmt(X.vario.patamar, 2) + ' · alcance <b>' + X.vario.alcance + ' km</b>' +
      (X.vario.noLimite ? ' <span class="g-atencao">(no limite de 1200 km: distância de influência mal definida neste mês)</span>' : '');
    if (Rp.metodo === 'local') h += 'Cada ponto usa as 12 estações mais próximas (distância em km, potência 2): o valor nunca sai da faixa das estações vizinhas.';
    if (X.pronto && X.vc && calcular(p).vc && X.vc.rmse > 1.05 * calcular(p).vc.rmse) h += '<br><span class="g-atencao">Neste mês o erro da validação ficou mais de 5 % maior que o do IDW padrão: compare antes de usar.</span>';
    return h;
  }
  function escalaCampos(p, es) {
    var fixa = N.PRODUTOS[p].escala.tipo === 'fixa', o = S.escOpc[p] || {};
    $('mcEscAuto').disabled = fixa || !es; $('mcEscAuto').checked = fixa || o.auto !== false;
    ['mcEscPrim', 'mcEscPasso', 'mcEscN'].forEach(function (id) { $(id).disabled = fixa || !es || o.auto !== false; });
    if (!es) { $('mcEscHint').textContent = ''; return; }
    if (fixa) { $('mcEscPrim').value = ''; $('mcEscPasso').value = ''; $('mcEscN').value = es.cores.length; $('mcEscHint').textContent = 'Escala fixa da equipe (' + (es.fonte || '') + '): ' + es.rotulos[0] + ' … ' + es.rotulos[es.rotulos.length - 1] + '.'; return; }
    if (o.auto !== false) { $('mcEscPrim').value = es.primeiro; $('mcEscPasso').value = es.passo; $('mcEscN').value = es.classes; }
    $('mcEscHint').textContent = 'Valores em Minas (IDW): de ' + fmt(es.min) + ' a ' + fmt(es.max) + ' ' + N.PRODUTOS[p].unidade + '. ' + (o.auto !== false ? 'Automática: passo redondo do percentil 2 ao 98.' : 'Ajustada à mão (fica registrada).') + ' A krigagem e o método recomendado usam a mesma escala.';
  }
  function lerEscalaCampos() {
    var p = S.prod; if (N.PRODUTOS[p].escala.tipo === 'fixa') return;
    var auto = $('mcEscAuto').checked, prim = parseFloat(String($('mcEscPrim').value).replace(',', '.')), passo = parseFloat(String($('mcEscPasso').value).replace(',', '.')), n = parseInt($('mcEscN').value, 10);
    if (!auto && !(passo > 0 && isFinite(prim) && n >= 3 && n <= 20)) { $('mcEscHint').textContent = 'Confira os campos: passo maior que zero e de 3 a 20 classes.'; return; }
    S.escOpc[p] = auto ? { auto: true } : { auto: false, primeiro: prim, passo: passo, classes: n };
    mapas();
  }

  /* ---------------- arquivos de saída ---------------- */
  function baixar(nome, blob) {   // com a ponte, este clique vai para o PC e o Drive (OPÇÕES DE SALVAMENTO)
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  function png(p, metodo) {
    var pr = prontoProduto(p);
    if (!pr.ok || !calcular(p) || (metodo === 'krig' && !calcularKrig(p)) || (metodo === 'rec' && recBloqueado(calcularRec(p)))) { status('aviso', esc(pr.motivo || 'O mapa deste método ainda não está pronto.')); return; }
    var b = $((metodo === 'krig' ? 'mcPngK_' : metodo === 'rec' ? 'mcPngR_' : 'mcPng_') + p), txt = b.textContent; b.disabled = true; b.textContent = 'Gerando PNG…';
    LayoutMapa.png(opMapa(p, metodo)).then(function (blob) { baixar(nomeArquivo(p, 'png', metodo), blob); })
      .catch(function (e) { $('mcProdStatus').innerHTML += '<div class="warn">Não foi possível gerar o PNG: ' + esc(e.message) + '</div>'; })
      .then(function () { b.textContent = txt; atualizarBotoes(); });
  }
  function csvMeso() {
    var p = S.prod, P = N.PRODUTOS[p], g = gradeDe(p, S.metodo); if (!g || !prontoProduto(p).ok) return;
    var est = N.estatMeso(g, mascara(), MESOS), per = periodoEscolhido();
    var L = [['Produto', P.titulo + ' (' + P.unidade + ')'], ['Método', S.metodo === 'krig' ? 'Krigagem ordinária (em avaliação)' : S.metodo === 'rec' ? N.RECOMENDADO[p].nome + ' (método recomendado, em avaliação)' : 'IDW (padrão QGIS)'], ['Período', N.MESES_BR[per.mes - 1] + '/' + per.ano], ['Conferido por', N.seguro($('mcConferente').value.trim())], [], ['Mesorregião', 'Média', 'Mínimo', 'Máximo']]
      .concat(est.map(function (m) { return [m.nome, fmt(m.media, 2), fmt(m.min, 2), fmt(m.max, 2)]; }));
    if (S.metodo === 'rec' && recBloqueado(calcularRec(p))) return;
    baixar('Mesorregioes_' + nomeArquivo(p, 'csv'), new Blob(['﻿' + L.map(function (l) { return l.join(';'); }).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  }
  function registro() {
    if (!Object.keys(S.arqs).length) return;
    var per = periodoEscolhido();
    var prods = N.ORDEM.filter(function (p) { return S.arqs[N.PRODUTOS[p].arq]; }).map(function (p) {
      var C = calcular(p), K = calcularKrig(p), X = calcularRec(p);
      return { id: p, n: C ? C.pts.length : 0, escala: C ? escala(p) : null, validacao: C && C.vc, krig: K ? { vario: K.vario, validacao: K.vc } : null,
        rec: X ? { nome: X.nome, validacao: X.vc, reg: X.rk && X.rk.reg, usadas: X.rk && X.rk.usadas, gradienteOk: X.rk ? X.rk.gradienteOk : null } : null };
    });
    var txt = N.registroCSV({ periodo: per, conferente: $('mcConferente').value.trim(), geradoEm: agora(), versaoFerramenta: '0.3',
      arquivos: TIPOS_ORDEM.filter(function (t) { return S.arqs[t]; }).map(function (t) { return { tipo: t, nome: S.meta[t].nome, sha256: S.meta[t].sha256, codificacao: S.arqs[t].codificacao, linhas: S.arqs[t].estacoes.length }; }),
      arqs: S.arqs, decisoes: S.decisoes, produtos: prods, criterios: N.CRITERIOS });
    baixar('Registro_conferencia_MapasClimaticos_' + (per ? N.SIGLAS[per.mes - 1] + '_' + per.ano : 'sem_periodo') + '.csv', new Blob([txt], { type: 'text/csv;charset=utf-8' }));
  }
  function atualizarBotoes() {
    N.ORDEM.forEach(function (p) {
      var ok = prontoProduto(p).ok, b = $('mcPng_' + p), k = $('mcPngK_' + p), r = $('mcPngR_' + p);
      if (b && b.textContent.indexOf('Gerando') < 0) b.disabled = !ok;
      if (k && k.textContent.indexOf('Gerando') < 0) k.disabled = !ok || !calcularKrig(p);
      if (r && r.textContent.indexOf('Gerando') < 0) r.disabled = !ok || recBloqueado(calcularRec(p));
    });
    $('mcMesoCsv').disabled = !prontoProduto(S.prod).ok || !gradeDe(S.prod, S.metodo) || (S.metodo === 'rec' && recBloqueado(calcularRec(S.prod)));
    var temPend = TIPOS_ORDEM.some(function (t) { return contagem(t).pendente; });
    $('mcRegistro').disabled = !Object.keys(S.arqs).length || !!bloqueiosGerais().length || temPend;
  }

  /* ---------------- abas e eventos ---------------- */
  function aba(qual) {
    var m = qual === 'mapas';
    $('abaConf').hidden = m; $('abaMapas').hidden = !m;
    $('abaConfBtn').setAttribute('aria-selected', String(!m)); $('abaMapasBtn').setAttribute('aria-selected', String(m));
    if (m) mapas(); else { $('previewBtn').disabled = true; }
  }
  function iniciar() {
    if (!N || !MESOS) { document.body.insertAdjacentHTML('afterbegin', '<div class="stbox erro" style="margin:10px">Não foi possível carregar os arquivos da ferramenta. Recarregue a página (Ctrl + Shift + R).</div>'); return; }
    var anoAtual = new Date().getFullYear();
    $('mcMes').innerHTML = '<option value="">Mês</option>' + N.MESES_BR.map(function (m, i) { return '<option value="' + (i + 1) + '">' + m + '</option>'; }).join('');
    var anos = []; for (var a = anoAtual; a >= 2000; a--) anos.push(a);
    $('mcAno').innerHTML = '<option value="">Ano</option>' + anos.map(function (a) { return '<option>' + a + '</option>'; }).join('');
    try { $('mcConferente').value = localStorage.getItem('mcConferente') || ''; } catch (e) { }
    var inp = $('mcArquivos'), drop = $('mcDrop');
    inp.addEventListener('change', function () { lerArquivos(inp.files); inp.value = ''; });
    drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } });
    ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('on'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('on'); }); });
    drop.addEventListener('drop', function (e) { lerArquivos(e.dataTransfer && e.dataTransfer.files); });
    $('mcSlots').addEventListener('click', function (e) { var b = e.target.closest('[data-rm]'); if (b) remover(b.getAttribute('data-rm')); });
    $('mcExemplo').addEventListener('click', carregarExemplo);
    ['mcMes', 'mcAno'].forEach(function (id) { $(id).addEventListener('change', conferir); });
    $('mcConferente').addEventListener('input', function () { guardar(); resumoStatus(); atualizarBotoes(); if (!$('abaMapas').hidden) mapas(); });
    $('mcArqTab').addEventListener('click', function (e) { var b = e.target.closest('[data-t]'); if (b) { S.tipoTab = b.dataset.t; S.sel = null; abasArquivo(); resumoArquivo(); mapaEstacoes(); tabela(); } });
    $('mcFiltro').addEventListener('click', function (e) { var b = e.target.closest('[data-f]'); if (b) { S.filtro = b.dataset.f; tabela(); } });
    $('mcRetirarFortes').addEventListener('click', retirarFortes);
    $('mcEstBody').addEventListener('change', function (e) { var f = e.target.closest('[data-campo]'), d = e.target.closest('.dec'); if (f && d) decidir(d.dataset.k, f.dataset.campo, f.value); });
    $('mcEstMapa').addEventListener('click', function (e) {
      var c = e.target.closest('circle[data-k]'); if (!c) return;
      S.sel = c.getAttribute('data-k'); S.filtro = 'todas'; mapaEstacoes(); tabela();
      var tr = document.querySelector('#mcEstBody tr[data-k="' + (window.CSS && CSS.escape ? CSS.escape(S.sel) : S.sel) + '"]'); if (tr) tr.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    $('abaConfBtn').addEventListener('click', function () { aba('conf'); });
    $('abaMapasBtn').addEventListener('click', function () { aba('mapas'); });
    $('mcProd').addEventListener('click', function (e) { var b = e.target.closest('[data-p]'); if (b) { S.prod = b.dataset.p; mapas(); } });
    $('mcEscAuto').addEventListener('change', lerEscalaCampos);
    ['mcEscPrim', 'mcEscPasso', 'mcEscN'].forEach(function (id) { $(id).addEventListener('change', lerEscalaCampos); });
    ['mcMostrarEst', 'mcCidades'].forEach(function (id) { $(id).addEventListener('change', mapas); });
    N.ORDEM.forEach(function (p) { $('mcPng_' + p).addEventListener('click', function () { png(p, 'idw'); }); $('mcPngK_' + p).addEventListener('click', function () { png(p, 'krig'); }); $('mcPngR_' + p).addEventListener('click', function () { png(p, 'rec'); }); });
    $('mcMetodo').addEventListener('click', function (e) { var b = e.target.closest('[data-m]'); if (b && b.dataset.m !== S.metodo) { S.metodo = b.dataset.m; mapas(); } });
    ['mcIso', 'mcIsoRot'].forEach(function (id) { $(id).addEventListener('change', function () { try { localStorage.setItem(id, $(id).checked ? '1' : '0'); } catch (er) { } mapas(); }); });
    try { $('mcIso').checked = localStorage.getItem('mcIso') === '1'; $('mcIsoRot').checked = localStorage.getItem('mcIsoRot') === '1'; var tv = localStorage.getItem('mcIsoTipo'); if (tv === '50' || tv === '100') $('mcIsoTipo').value = tv; } catch (er) { }
    $('mcIsoTipo').addEventListener('change', function () { try { localStorage.setItem('mcIsoTipo', $('mcIsoTipo').value); } catch (er) { } mapas(); });
    $('mcMesoCsv').addEventListener('click', csvMeso);
    $('mcRegistro').addEventListener('click', registro);
    $('previewBtn').addEventListener('click', function () { if (!$('abaMapas').hidden && calcular(S.prod) && periodoEscolhido() && window.LayoutMapa && gradeDe(S.prod, S.metodo)) LayoutMapa.previa(opMapa(S.prod)); });
    tudo();
  }
  window.MapasClimaticos = { _S: S, calcular: calcular, escala: escala, opMapa: function (p, m) { return opMapa(p || S.prod, m); }, prontoProduto: prontoProduto, calcularRec: calcularRec, nomeArquivo: nomeArquivo };   // para conferência no console
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
