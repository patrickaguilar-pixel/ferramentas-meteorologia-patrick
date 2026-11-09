/*
 * Curto Prazo v0.2 (06/11/2026): vista "Por dia" (Dia 1, Dia 2, Dia 3 separados) além do "Acumulado" (24/48/72 h).
 * Curto Prazo v0.1 (06/11/2026) — chuva prevista 24 h / 48 h / 72 h, GFS e WRF (CPTEC), SIMGE/IGAM
 *
 * Ferramenta nova e separada: lê curto-prazo/dados/<gfs|wrf>.json (gerados pelo GitHub Actions,
 * scripts/baixar_curto_prazo.py) e usa a MESMA rotina para os dois modelos:
 *   - janela 09h às 09h, hora local (12Z–12Z) da rodada 00Z;
 *   - grade de exibição comum de 0,05° (interpolação bilinear na grade de cada modelo);
 *   - mesma escala (12 faixas) e mesmo layout de mapa (assets/layout-mapa.js);
 *   - mesorregiões: faixa predominante e maior faixa local na grade comum + máximo em mm;
 *   - 25 cidades: interpolação bilinear na grade original de cada modelo.
 * Não depende de nada de Reservatórios/Tendência.
 */
(function () {
  'use strict';
  /* ---------------- escala (mesma das 12 faixas; trocar aqui muda tudo) ---------------- */
  const ESCALA = {
    nome: '12 faixas',
    lim: [10, 20, 30, 40, 50, 60, 70, 80, 100, 150, 200],
    labels: ['0 - 10', '10 - 20', '20 - 30', '30 - 40', '40 - 50', '50 - 60', '60 - 70', '70 - 80', '80 - 100', '100 - 150', '150 - 200', '> 200'],
    cores: ['#f7fbff', '#e1eff7', '#c3dff0', '#9ecce5', '#74b5d7', '#4c9bc8', '#2b7eb6', '#16629a', '#0a4b7c', '#063a62', '#042a45', '#021b2e']
  };
  if (ESCALA.labels.length !== ESCALA.cores.length || ESCALA.lim.length !== ESCALA.labels.length - 1) throw new Error('escala inconsistente');
  const MODELOS = { gfs: { nome: 'GFS', fonte: 'GFS/NCEP/NOAA', res: '0,25° (~27 km)' }, wrf: { nome: 'WRF', fonte: 'WRF 7 km/CPTEC/INPE', res: '7 km' } };
  const PRODS = ['24h', '48h', '72h'];          // acumulados (vêm prontos no JSON)
  const DIAS = ['d1', 'd2', 'd3'];               // v0.2: cada dia separado (09h às 09h), calculado aqui: d2 = 48h − 24h, d3 = 72h − 48h
  const prods = () => S.modo === 'dia' ? DIAS : PRODS;
  const DIR = (window.BASE_DADOS || '../') + 'curto-prazo/dados/';
  const GRADE_EXIB = { A: 0.05, E: -0.05, C: -52.0, F: -13.5 };   // mesma grade de 0,05° usada no GFS de Reservatórios
  const S = { dados: {}, status: null, modo: 'dia', prod: 'd1', vista: 'gfs', exib: {}, ops: {} };
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v, c = 1) => (v == null || !isFinite(v)) ? '—' : v.toFixed(c).replace('.', ',');

  /* ---------------- leitura e conferência dos JSON ---------------- */
  function validar(j, m) {
    const erro = t => { throw new Error(MODELOS[m].nome + ': ' + t); };
    if (!j || typeof j !== 'object') erro('arquivo vazio');
    const g = j.grade;
    if (!g || ![g.lat0, g.lon0, g.dlat, g.dlon, g.nlat, g.nlon].every(v => typeof v === 'number' && isFinite(v))) erro('grade inválida');
    if (!(g.dlat > 0 && g.dlat < 1 && g.dlon > 0 && g.dlon < 1 && g.nlat > 2 && g.nlon > 2 && g.nlat < 2000 && g.nlon < 2000)) erro('grade fora do esperado');
    if (g.lon0 > -45 || g.lon0 + g.dlon * (g.nlon - 1) < -42 || g.lat0 < -17 || g.lat0 - g.dlat * (g.nlat - 1) > -20) erro('recorte não cobre Minas Gerais');
    if (!j.produtos) erro('sem produtos');
    for (const p of PRODS) {
      const pr = j.produtos[p];
      if (!pr || !Array.isArray(pr.mm) || pr.mm.length !== g.nlat) erro(p + ': matriz com número de linhas errado');
      for (const l of pr.mm) {
        if (!Array.isArray(l) || l.length !== g.nlon) erro(p + ': matriz com número de colunas errado');
        for (const v of l) if (typeof v !== 'number' || !isFinite(v) || v < 0 || v > 1500) erro(p + ': valor fora do limite');
      }
    }
    return derivarDias(j);
  }
  // os acumulados têm a mesma base (09h do dia da rodada), então cada dia é a diferença entre dois acumulados
  function derivarDias(j) {
    const P = j.produtos, sub = (a, b) => a.map((l, i) => l.map((v, k) => Math.max(0, Math.round((v - b[i][k]) * 10) / 10)));
    const dia = (mm, de, ate) => ({ inicio_local: de.inicio_local, fim_local: ate.fim_local, mm, max_mm: Math.max(...mm.map(l => Math.max(...l))) });
    P.d1 = dia(P['24h'].mm, P['24h'], P['24h']);
    P.d2 = dia(sub(P['48h'].mm, P['24h'].mm), P['24h'], P['48h']);
    P.d2.inicio_local = P['24h'].fim_local;
    P.d3 = dia(sub(P['72h'].mm, P['48h'].mm), P['48h'], P['72h']);
    P.d3.inicio_local = P['48h'].fim_local;
    return j;
  }
  function rotulo(p, curto) {   // "Dia 2 · 07/11" ou "48 h"
    if (!DIAS.includes(p)) return p.replace('h', ' h');
    const j = S.dados.gfs || S.dados.wrf, n = p.slice(1);
    return j ? `Dia ${n}${curto ? '' : ' · '}${curto ? '' : ddmm(j.produtos[p].inicio_local)}` : `Dia ${n}`;
  }
  async function baixarJson(nome) {
    const r = await fetch(DIR + nome, { cache: 'no-cache' });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(nome + ': HTTP ' + r.status);
    return r.json();
  }
  async function carregar() {
    const b = $('cpLoad'); b.disabled = true; setStatus('Carregando os dados do GFS e do WRF…');
    S.dados = {}; S.exib = {};
    const msgs = [];
    try { S.status = await baixarJson('status.json'); } catch (e) { S.status = null; }
    for (const m of Object.keys(MODELOS)) {
      try {
        const j = await baixarJson(m + '.json');
        if (!j) { msgs.push(`<li><strong>${MODELOS[m].nome}:</strong> ainda não há dados ${detalheStatus(m)}</li>`); continue; }
        S.dados[m] = validar(j, m);
        S.exib[m] = {};
      } catch (e) { msgs.push(`<li class="warn">${esc(e.message)}</li>`); }
    }
    b.disabled = false;
    const ok = Object.keys(S.dados);
    if (!ok.length) { setStatus('<strong>Nenhum modelo disponível.</strong><ul class="cpList">' + msgs.join('') + '</ul>'); desenhar(); return; }
    const linhas = ok.map(m => {
      const j = S.dados[m];
      return `<li><strong>${MODELOS[m].nome}</strong> (${MODELOS[m].res}): rodada ${dataBR(j.data_ciclo)} ${j.ciclo}Z · baixado em ${dataHoraBR(j.baixado_em)} · máx. em MG e arredores: ` +
        PRODS.map(p => `${p} ${num(j.produtos[p].max_mm)} mm`).join(' · ') + '</li>';
    });
    if (ok.length === 2 && S.dados.gfs.data_ciclo !== S.dados.wrf.data_ciclo)
      linhas.push(`<li class="warn">Atenção: os dois modelos estão em rodadas de dias diferentes (GFS ${dataBR(S.dados.gfs.data_ciclo)}, WRF ${dataBR(S.dados.wrf.data_ciclo)}). A comparação vale só como referência.</li>`);
    setStatus('<strong>Dados carregados.</strong> Janela de 09h às 09h, hora local (rodada 00Z).<ul class="cpList">' + linhas.concat(msgs).join('') + '</ul>');
    if (!S.dados[S.vista] && S.vista !== 'cmp') S.vista = ok[0];
    desenhar();
  }
  function detalheStatus(m) {
    const s = S.status && S.status[m];
    if (!s) return '(o processo automático ainda não rodou).';
    if (s.resultado === 'aguardando publicação') return `(aguardando a rodada de ${dataBR(s.rodada)} ser publicada).`;
    if (s.resultado === 'erro') return `— última tentativa com erro: ${esc(s.detalhe || '')}`;
    return '';
  }
  function setStatus(h) { $('cpStatus').innerHTML = h; }
  function dataBR(iso) { const p = String(iso || '').slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : '—'; }
  function dataHoraBR(iso) { const d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }

  /* ---------------- rotina comum aos dois modelos ---------------- */
  function valor(j, prod, lon, lat) {   // bilinear na grade do modelo (linhas do norte para o sul)
    const g = j.grade, m = j.produtos[prod].mm;
    let fx = (lon - g.lon0) / g.dlon, fy = (g.lat0 - lat) / g.dlat;
    fx = Math.max(0, Math.min(g.nlon - 1.000001, fx)); fy = Math.max(0, Math.min(g.nlat - 1.000001, fy));
    const x = Math.floor(fx), y = Math.floor(fy), tx = fx - x, ty = fy - y;
    return (m[y][x] * (1 - tx) + m[y][x + 1] * tx) * (1 - ty) + (m[y + 1][x] * (1 - tx) + m[y + 1][x + 1] * tx) * ty;
  }
  function classe(v) { let c = 0; while (c < ESCALA.lim.length && v >= ESCALA.lim[c]) c++; return c; }
  function exibicao(m, prod) {   // grade comum de 0,05°: valor e classe por célula
    if (S.exib[m][prod]) return S.exib[m][prod];
    const W = GRADE_EXIB, gw = Math.round((-38.9 - W.C) / W.A) + 1, gh = Math.round((W.F - (-24.0)) / -W.E) + 1;
    const val = new Float32Array(gw * gh), cls = new Uint8Array(gw * gh), j = S.dados[m];
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const v = valor(j, prod, W.C + W.A * x, W.F + W.E * y); val[y * gw + x] = v; cls[y * gw + x] = classe(v);
    }
    return (S.exib[m][prod] = { val, cls, gw, gh });
  }
  function areas(m, prod) {   // trechos seguidos da mesma faixa viram retângulos (mesmo método de Reservatórios)
    const E = exibicao(m, prod), W = GRADE_EXIB;
    const x0 = Math.floor((-51.4 - W.C) / W.A), x1 = Math.ceil((-39.5 - W.C) / W.A);
    const y0 = Math.floor((-13.9 - W.F) / W.E), y1 = Math.ceil((-23.2 - W.F) / W.E);
    const polys = ESCALA.labels.map(() => []);
    const cl = (x, y) => (x < 0 || x >= E.gw || y < 0 || y >= E.gh) ? 0 : E.cls[y * E.gw + x];
    for (let y = y0; y <= y1; y++) {
      const top = W.F + W.E * (y - 0.5), bot = W.F + W.E * (y + 0.5);
      let x = x0;
      while (x <= x1) {
        const c = cl(x, y); let xe = x;
        while (xe + 1 <= x1 && cl(xe + 1, y) === c) xe++;
        const l = W.C + W.A * (x - 0.5), r = W.C + W.A * (xe + 0.5);
        polys[c].push([[[l, top], [r, top], [r, bot], [l, bot], [l, top]]]);
        x = xe + 1;
      }
    }
    return polys.map((pp, i) => pp.length ? { geometry: { type: 'MultiPolygon', coordinates: pp }, fill: ESCALA.cores[i], strokeWidth: 0.15 } : null).filter(Boolean);
  }
  function dentro(lon, lat, geom) {
    const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
    let ins = false;
    for (const poly of polys) for (const ring of poly) {   // par-ímpar: buracos funcionam sozinhos
      for (let i = 0, k = ring.length - 1; i < ring.length; k = i++) {
        const [xi, yi] = ring[i], [xk, yk] = ring[k];
        if ((yi > lat) !== (yk > lat) && lon < (xk - xi) * (lat - yi) / (yk - yi) + xi) ins = !ins;
      }
    }
    return ins;
  }
  let MASCARAS = null;   // células da grade comum dentro de cada mesorregião (calculado uma vez)
  function mascaras() {
    if (MASCARAS) return MASCARAS;
    const W = GRADE_EXIB, gw = Math.round((-38.9 - W.C) / W.A) + 1;
    MASCARAS = (window.MESO_CP ? window.MESO_CP.features : []).map(f => {
      const pts = []; (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).forEach(p => p[0].forEach(c => pts.push(c)));
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
      const ix0 = Math.floor((Math.min(...xs) - W.C) / W.A), ix1 = Math.ceil((Math.max(...xs) - W.C) / W.A);
      const iy0 = Math.floor((Math.max(...ys) - W.F) / W.E), iy1 = Math.ceil((Math.min(...ys) - W.F) / W.E);
      const cel = [];
      for (let y = iy0; y <= iy1; y++) for (let x = ix0; x <= ix1; x++) if (dentro(W.C + W.A * x, W.F + W.E * y, f.geometry)) cel.push(y * gw + x);
      return { nome: f.properties.name, cel };
    });
    return MASCARAS;
  }
  function estatMeso(m, prod) {
    const E = exibicao(m, prod);
    return mascaras().map(({ nome, cel }) => {
      const cont = new Array(ESCALA.labels.length).fill(0); let mx = 0, cmax = 0;
      for (const i of cel) { const c = E.cls[i]; cont[c]++; if (c > cmax) cmax = c; if (E.val[i] > mx) mx = E.val[i]; }
      let moda = 0; for (let i = 1; i < cont.length; i++) if (cont[i] > cont[moda]) moda = i;
      return { nome, moda, cmax, mx, n: cel.length };
    });
  }
  function cidades() {
    const fs = (window.CIDADES && window.CIDADES.features) || [];
    return fs.map(f => ({ nome: f.properties.NM_LOCAL_1 || f.properties.NM_MUNICIP || '', lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }))
      .filter(c => c.nome && isFinite(c.lon) && isFinite(c.lat)).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  /* ---------------- mapas ---------------- */
  function hh(iso) { return String(iso).slice(11, 13) + 'h'; }
  function ddmm(iso) { const p = String(iso).slice(0, 10).split('-'); return p[2] + '/' + p[1]; }
  function validade(pr) { return `VÁLIDO: ${hh(pr.inicio_local)} ${ddmm(pr.inicio_local)} às ${hh(pr.fim_local)} ${ddmm(pr.fim_local)}, hora local`; }
  function opMapa(m, prod) {
    const j = S.dados[m], pr = j.produtos[prod], ano = String(j.data_ciclo).slice(0, 4);
    const horas = prod.replace('h', '');
    return {
      titulo: DIAS.includes(prod) ? `Previsão de Chuva - ${MODELOS[m].nome} - ${dataBR(String(pr.inicio_local).slice(0, 10))}`
        : `Previsão de Chuva ${horas} h - ${MODELOS[m].nome} - ${dataBR(String(pr.inicio_local).slice(0, 10))}`,
      textoValidade: validade(pr),
      credito: `Fonte de dados: ${MODELOS[m].fonte} (rodada ${ddmm(j.rodada_utc)} 00Z) - SIMGE/IGAM, ${ano}`,
      fundo: '',
      areas: areas(m, prod),
      legenda: ESCALA.labels.map((l, i) => ({ fill: ESCALA.cores[i], label: l + ' mm' })),
      cidades: $('cpCidades').checked ? cidades().map(c => ({ nome: c.nome, lon: c.lon, lat: c.lat })) : []
    };
  }
  function previa(el, m, prod) {
    if (!S.dados[m]) { el.innerHTML = `<div class="vazio">${MODELOS[m].nome}: sem dados ${detalheStatus(m)}</div>`; return; }
    if (!window.LayoutMapa) { el.innerHTML = '<div class="vazio">Não foi possível carregar o layout do mapa. Recarregue a página.</div>'; return; }
    const op = opMapa(m, prod); S.ops[m] = op;
    const img = new Image(); img.alt = op.titulo;
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(LayoutMapa.svg(op));
    el.innerHTML = ''; el.appendChild(img);
  }
  function desenhar() {
    document.querySelectorAll('[data-modo]').forEach(b => b.classList.toggle('on', b.dataset.modo === S.modo));
    $('cpPeriodo').innerHTML = prods().map(p => `<button data-prod="${p}" class="${p === S.prod ? 'on' : ''}">${esc(rotulo(p))}</button>`).join('');
    $('cpPeriodoRot').textContent = S.modo === 'dia' ? 'Dia (09h às 09h)' : 'Acumulado desde 09h';
    $('cpTabModo').textContent = S.modo === 'dia' ? 'cada dia separado (09h às 09h, hora local)' : 'acumulado desde as 09h do primeiro dia';
    $('cpTabModo2').textContent = $('cpTabModo').textContent;
    document.querySelectorAll('[data-vista]').forEach(b => b.classList.toggle('on', b.dataset.vista === S.vista));
    const dois = S.vista === 'cmp';
    $('cpMapas').className = dois ? 'mapas dual' : 'mapas';
    $('cpMapaB').style.display = dois ? '' : 'none';
    const tem = Object.keys(S.dados).length > 0;
    if (!tem) { $('cpMapaA').innerHTML = '<div class="vazio">Clique em <strong>Carregar dados</strong>.</div>'; }
    else if (dois) { previa($('cpMapaA'), 'gfs', S.prod); previa($('cpMapaB'), 'wrf', S.prod); }
    else previa($('cpMapaA'), S.vista, S.prod);
    $('cpPngA').disabled = !(tem && S.dados[dois ? 'gfs' : S.vista]); $('cpPngB').disabled = !(tem && dois && S.dados.wrf);
    $('cpPngA').textContent = dois ? 'Baixar PNG do GFS' : 'Baixar PNG'; $('cpPngB').hidden = !dois;
    $('previewBtn').disabled = $('cpPngA').disabled;
    tabelas();
  }

  /* ---------------- tabelas ---------------- */
  function tabelas() {
    const ms = Object.keys(MODELOS), tem = m => !!S.dados[m];
    const PS = prods();
    const cab = '<tr><th rowspan="2">Mesorregião</th>' + PS.map(p => `<th colspan="2" class="c">${esc(rotulo(p))}</th>`).join('') + '</tr><tr>' +
      PS.map(() => ms.map(m => `<th class="c">${MODELOS[m].nome}</th>`).join('')).join('') + '</tr>';
    $('cpMesoHead').innerHTML = cab;
    const est = {}; for (const m of ms) if (tem(m)) { est[m] = {}; for (const p of PS) est[m][p] = estatMeso(m, p); }
    const nomes = mascaras().map(x => x.nome);
    $('cpMesoBody').innerHTML = !Object.keys(est).length ? '<tr><td colspan="7" class="small">Sem dados.</td></tr>' :
      nomes.map((n, i) => '<tr><td>' + esc(n) + '</td>' + PS.map(p => ms.map(m => {
        if (!est[m]) return '<td class="c small">—</td>';
        const e = est[m][p][i];
        return `<td class="c"><span class="sw" style="background:${ESCALA.cores[e.moda]}"></span>${ESCALA.labels[e.moda]}<div class="small">até ${ESCALA.labels[e.cmax]} · máx ${num(e.mx, 0)} mm</div></td>`;
      }).join('')).join('') + '</tr>').join('');
    $('cpCidHead').innerHTML = '<tr><th rowspan="2">Cidade</th>' + PS.map(p => `<th colspan="2" class="c">${esc(rotulo(p))} (mm)</th>`).join('') + '</tr><tr>' +
      PS.map(() => ms.map(m => `<th class="c">${MODELOS[m].nome}</th>`).join('')).join('') + '</tr>';
    const cs = cidades();
    $('cpCidBody').innerHTML = !Object.keys(est).length ? '<tr><td colspan="7" class="small">Sem dados.</td></tr>' :
      cs.map(c => '<tr><td>' + esc(c.nome) + '</td>' + PS.map(p => ms.map(m => {
        if (!tem(m)) return '<td class="c small">—</td>';
        const v = valor(S.dados[m], p, c.lon, c.lat);
        return `<td class="c"><span class="sw" style="background:${ESCALA.cores[classe(v)]}"></span>${num(v)}</td>`;
      }).join('')).join('') + '</tr>').join('');
    $('cpCsvMeso').disabled = $('cpCsvCid').disabled = !Object.keys(est).length;
  }

  /* ---------------- arquivos (só no computador, como no painel de testes) ---------------- */
  function baixar(nome, blob) {
    // com a ponte (assets/ponte-drive.js), este clique é interceptado e o arquivo vai para o PC e o Drive (OPÇÕES DE SALVAMENTO)
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  function rodadaTag() { const d = (S.dados.gfs || S.dados.wrf || {}).data_ciclo || ''; return d.replace(/-/g, ''); }
  async function png(m) {
    const b = m === 'wrf' ? $('cpPngB') : $('cpPngA'); const txt = b.textContent; b.disabled = true; b.textContent = 'Gerando PNG…';
    try { baixar(`CurtoPrazo_${MODELOS[m].nome}_${DIAS.includes(S.prod) ? 'dia' + S.prod.slice(1) + '_' + ddmm(S.dados[m].produtos[S.prod].inicio_local).replace('/', '-') : S.prod}_${rodadaTag()}_00Z.png`, await LayoutMapa.png(opMapa(m, S.prod))); }
    catch (e) { alertaStatus('Não foi possível gerar o PNG: ' + e.message); }
    finally { b.disabled = false; b.textContent = txt; }
  }
  function alertaStatus(t) { setStatus($('cpStatus').innerHTML + `<div class="warn">${esc(t)}</div>`); }
  function csv(linhas) { return new Blob(['﻿' + linhas.map(l => l.map(v => /[;"\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }); }
  function csvMeso() {
    const ms = Object.keys(MODELOS).filter(m => S.dados[m]);
    const PS = prods();
    const cab = ['Mesorregião']; PS.forEach(p => ms.forEach(m => cab.push(`${MODELOS[m].nome} ${rotulo(p)} predominante`, `${MODELOS[m].nome} ${rotulo(p)} maior local`, `${MODELOS[m].nome} ${rotulo(p)} máximo mm`)));
    const est = {}; ms.forEach(m => { est[m] = {}; PS.forEach(p => est[m][p] = estatMeso(m, p)); });
    const ls = [cab].concat(mascaras().map((x, i) => { const l = [x.nome]; PS.forEach(p => ms.forEach(m => { const e = est[m][p][i]; l.push(ESCALA.labels[e.moda], ESCALA.labels[e.cmax], num(e.mx)); })); return l; }));
    baixar(`CurtoPrazo_mesorregioes_${S.modo === 'dia' ? 'por_dia' : 'acumulado'}_${rodadaTag()}_00Z.csv`, csv(ls));
  }
  function csvCid() {
    const ms = Object.keys(MODELOS).filter(m => S.dados[m]);
    const PS = prods();
    const cab = ['Cidade', 'Longitude', 'Latitude']; PS.forEach(p => ms.forEach(m => cab.push(`${MODELOS[m].nome} ${rotulo(p)} (mm)`)));
    const ls = [cab].concat(cidades().map(c => { const l = [c.nome, num(c.lon, 5), num(c.lat, 5)]; PS.forEach(p => ms.forEach(m => l.push(num(valor(S.dados[m], p, c.lon, c.lat))))); return l; }));
    baixar(`CurtoPrazo_cidades_${S.modo === 'dia' ? 'por_dia' : 'acumulado'}_${rodadaTag()}_00Z.csv`, csv(ls));
  }

  /* ---------------- início ---------------- */
  function iniciar() {
    $('cpPeriodo').addEventListener('click', e => { const b = e.target.closest('[data-prod]'); if (b) { S.prod = b.dataset.prod; desenhar(); } });
    document.querySelectorAll('[data-modo]').forEach(b => b.addEventListener('click', () => {
      if (S.modo === b.dataset.modo) return;
      const i = prods().indexOf(S.prod); S.modo = b.dataset.modo; S.prod = prods()[Math.max(0, i)]; desenhar();
    }));
    document.querySelectorAll('[data-vista]').forEach(b => b.addEventListener('click', () => { S.vista = b.dataset.vista; desenhar(); }));
    $('cpLoad').addEventListener('click', carregar);
    $('cpCidades').addEventListener('change', desenhar);
    $('cpPngA').addEventListener('click', () => png(S.vista === 'cmp' ? 'gfs' : S.vista));
    $('cpPngB').addEventListener('click', () => png('wrf'));
    $('previewBtn').addEventListener('click', () => {   // no Comparar, os dois mapas na mesma janela
      const ms = S.vista === 'cmp' ? ['gfs', 'wrf'] : [S.vista], ok = ms.filter(m => S.dados[m]);
      if (!ok.length) return;
      LayoutMapa.previa(opMapa(ok[0], S.prod)).then(() => {
        const f = document.querySelector('#layoutMapaPrevia [data-folha]');
        ok.slice(1).forEach(m => { const d = document.createElement('div'); d.style.marginTop = '12px'; d.innerHTML = LayoutMapa.svg(opMapa(m, S.prod)); const sv = d.querySelector('svg'); sv.setAttribute('width', '100%'); sv.removeAttribute('height'); f.appendChild(d); });
      }).catch(() => { });
    });
    $('cpCsvMeso').addEventListener('click', csvMeso);
    $('cpCsvCid').addEventListener('click', csvCid);
    $('cpEscala').textContent = ESCALA.nome + ': ' + ESCALA.labels.join(' · ') + ' mm';
    desenhar();
    carregar();
  }
  window.CurtoPrazo = { ESCALA, valor, classe, estatMeso: (m, p) => estatMeso(m, p), _S: S };   // para conferência no console
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
