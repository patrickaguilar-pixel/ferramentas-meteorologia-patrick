/*
 * Umidade Mínima v0.1.1 (06/11/2026): seletor da quantidade de isolinhas (Nenhuma, Poucas, Padrão, a cada 10 %, a cada 5 %).
 * v0.2 (09/11/2026): aba "Relatório (PDF)" (umidade-minima/relatorio.js); estatMeso() com percentis; evento ur:mapa.
 * v0.1.5 (06/11/2026): rótulos das isolinhas um pouco mais suaves (opacidade 0,7).
 * v0.1.4 (06/11/2026): rótulos das isolinhas maiores (2,6 → 3,6 mm) e fora das divisas das mesorregiões.
 * v0.1.3 (06/11/2026): rótulos das isolinhas na direção da linha, com a linha interrompida embaixo do texto.
 * v0.1.2 (06/11/2026): opção de isolinhas renomeada para "Padrão (20, 25, 30, 40 … 90 %)".
 * Umidade Mínima v0.1 (06/11/2026) — UR mínima prevista (WRF 7 km, CPTEC/INPE), SIMGE/IGAM
 *
 * Ferramenta nova e separada. Reproduz o notebook da equipe (UR_media_18Z_WRF_MG_Colab):
 *   - UR a 2 m do WRF 7 km, rodada 00Z, às 18 UTC (15h, hora local) de D, D+1 e D+2;
 *   - "UR mínima" do período = média dos três campos das 18 UTC (vem pronta no JSON);
 *   - suavização leve (gaussiana, sigma = 1 ponto da grade do WRF) só no desenho do mapa, como no notebook;
 *   - mesma escala de 14 cores e as mesmas isolinhas (20, 25, 30, 40 … 90 %) do notebook;
 *   - layout padrão da plataforma (assets/layout-mapa.js).
 * Lê umidade-minima/dados/wrf.json, gerado pelo GitHub Actions (scripts/baixar_umidade_minima.py).
 * A tabela das mesorregiões usa o dado SEM suavização (valores do modelo, interpolados na grade de desenho de 0,025°),
 * classificado pelos estados do Manual de Atividades (Observação, Atenção, Alerta, Emergência).
 */
(function () {
  'use strict';
  /* ---------------- escala do notebook (trocar aqui muda tudo) ---------------- */
  const ESCALA = {
    lim: [10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90],
    cores: ['#a36b47', '#b9824c', '#cfa24f', '#d9b74f', '#e1c75c', '#e7d77a', '#ece4a3', '#dfe4c5', '#c7d8c8', '#a9cbbf', '#8ebfd0', '#76afd1', '#6696c8', '#557db8']
  };
  ESCALA.labels = ESCALA.cores.map((c, i) => `${i ? ESCALA.lim[i - 1] : 0} - ${i < ESCALA.lim.length ? ESCALA.lim[i] : 100}`);
  if (ESCALA.lim.length !== ESCALA.cores.length - 1) throw new Error('escala inconsistente');
  // quantidade de isolinhas (seletor "Isolinhas" na página; a escolha fica lembrada neste navegador)
  const ISO_OPCOES = {
    nenhuma: { nome: 'Nenhuma', niveis: [] },
    poucas: { nome: 'Poucas (20, 40, 60, 80 %)', niveis: [20, 40, 60, 80] },
    padrao: { nome: 'Padrão (20, 25, 30, 40 … 90 %)', niveis: [20, 25, 30, 40, 50, 60, 70, 80, 90] },
    d10: { nome: 'A cada 10 % (10 … 90 %)', niveis: [10, 20, 30, 40, 50, 60, 70, 80, 90] },
    d5: { nome: 'A cada 5 % (10 … 95 %)', niveis: [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95] }
  };
  const ISO_ORDEM = ['nenhuma', 'poucas', 'padrao', 'd10', 'd5'];
  const isoNiveis = () => (ISO_OPCOES[S.isoOp] || ISO_OPCOES.padrao).niveis;
  const SIGMA = 1.0;                                           // suavização do notebook (gaussian_filter, sigma=1)
  // estados do Manual de Atividades (critério "Baixa Umidade", referência OMS), pelo valor arredondado
  const ESTADOS = [
    { nome: 'Emergência', ate: 11, cor: '#7b1fa2', txt: '#fff', faixa: 'abaixo de 12 %' },
    { nome: 'Alerta', ate: 20, cor: '#d32f2f', txt: '#fff', faixa: '12 a 20 %' },
    { nome: 'Atenção', ate: 30, cor: '#f57c00', txt: '#fff', faixa: '21 a 30 %' },
    { nome: 'Observação', ate: 40, cor: '#fbc02d', txt: '#1f2328', faixa: '31 a 40 %' }
  ];
  const DIR = (window.BASE_DADOS || '../') + 'umidade-minima/dados/';
  const GRADE_EXIB = { A: 0.025, E: -0.025, C: -52.0, F: -13.5 };   // grade de desenho mais fina que a do Curto Prazo: bordas das faixas mais lisas, como no contourf do notebook
  const S = { j: null, status: null, exib: null, iso: {}, isoOp: lerIsoOp() };
  function lerIsoOp() { try { const v = localStorage.getItem('urIsolinhas'); return v && v in ISO_OPCOES ? v : 'padrao'; } catch (e) { return 'padrao'; } }
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v, c = 0) => (v == null || !isFinite(v)) ? '—' : v.toFixed(c).replace('.', ',');

  /* ---------------- leitura e conferência do JSON ---------------- */
  function matrizOk(m, g, nome) {
    if (!Array.isArray(m) || m.length !== g.nlat) throw new Error(nome + ': matriz com número de linhas errado');
    for (const l of m) {
      if (!Array.isArray(l) || l.length !== g.nlon) throw new Error(nome + ': matriz com número de colunas errado');
      for (const v of l) if (typeof v !== 'number' || !isFinite(v) || v < 0 || v > 100) throw new Error(nome + ': valor fora de 0 a 100 %');
    }
  }
  function validar(j) {
    if (!j || typeof j !== 'object') throw new Error('arquivo vazio');
    const g = j.grade;
    if (!g || ![g.lat0, g.lon0, g.dlat, g.dlon, g.nlat, g.nlon].every(v => typeof v === 'number' && isFinite(v))) throw new Error('grade inválida');
    if (!(g.dlat > 0 && g.dlat < 1 && g.dlon > 0 && g.dlon < 1 && g.nlat > 2 && g.nlon > 2 && g.nlat < 2000 && g.nlon < 2000)) throw new Error('grade fora do esperado');
    if (g.lon0 > -45 || g.lon0 + g.dlon * (g.nlon - 1) < -42 || g.lat0 < -17 || g.lat0 - g.dlat * (g.nlat - 1) > -20) throw new Error('recorte não cobre Minas Gerais');
    if (!Array.isArray(j.dias) || j.dias.length !== 3) throw new Error('esperava os 3 dias (18 UTC)');
    j.dias.forEach((d, i) => matrizOk(d.ur, g, 'dia ' + (i + 1)));
    if (!j.media) throw new Error('sem a média');
    matrizOk(j.media.ur, g, 'média');
    return j;
  }
  async function baixarJson(nome) {
    const r = await fetch(DIR + nome, { cache: 'no-cache' });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(nome + ': HTTP ' + r.status);
    return r.json();
  }
  async function carregar() {
    const b = $('urLoad'); b.disabled = true; setStatus('Carregando a UR do WRF…');
    S.j = null; S.exib = null; S.iso = {};
    try { S.status = await baixarJson('status.json'); } catch (e) { S.status = null; }
    try {
      const j = await baixarJson('wrf.json');
      if (!j) setStatus('<strong>Ainda não há dados</strong> ' + detalheStatus());
      else {
        S.j = validar(j);
        const ext = extremoMG();
        setStatus(`<strong>Dados carregados.</strong> WRF 7 km (CPTEC/INPE), rodada ${dataBR(j.data_ciclo)} 00Z · baixado em ${dataHoraBR(j.baixado_em)}.` +
          `<ul class="urList"><li>UR às 15h (hora local) de ${S.j.dias.map(d => ddmm(d.valido_local)).join(', ')}; o mapa mostra a <strong>média dos três dias</strong>.</li>` +
          `<li>Menor valor da média dentro de Minas: <strong>${num(ext.v, 1)} %</strong> (${esc(ext.meso)}).</li>` +
          (rodadaAtrasada() ? `<li class="warn">Atenção: a rodada é de ${dataBR(j.data_ciclo)}, anterior a hoje. ${detalheStatus()}</li>` : '') + '</ul>');
      }
    } catch (e) { setStatus(`<span class="warn">${esc(e.message)}</span>`); }
    b.disabled = false;
    desenhar();
  }
  function rodadaAtrasada() {
    const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    return S.j && S.j.data_ciclo < hoje;
  }
  function detalheStatus() {
    const s = S.status && S.status.wrf;
    if (!s) return '(o processo automático ainda não rodou).';
    if (s.resultado === 'aguardando publicação') return `(aguardando a rodada de ${dataBR(s.rodada)} ser publicada no CPTEC).`;
    if (s.resultado === 'erro') return `— última tentativa com erro: ${esc(s.detalhe || '')}`;
    return '';
  }
  function setStatus(h) { $('urStatus').innerHTML = h; }
  function dataBR(iso) { const p = String(iso || '').slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : '—'; }
  function ddmm(iso) { const p = String(iso).slice(0, 10).split('-'); return p[2] + '/' + p[1]; }
  function dataHoraBR(iso) { const d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }

  /* ---------------- grade, suavização e interpolação ---------------- */
  function suavizar(m) {   // gaussiana separável, sigma em pontos da grade, truncada em 4 sigma, borda refletida (como o scipy)
    const r = Math.ceil(4 * SIGMA), k = [];
    for (let i = -r; i <= r; i++) k.push(Math.exp(-i * i / (2 * SIGMA * SIGMA)));
    const s = k.reduce((a, b) => a + b, 0); for (let i = 0; i < k.length; i++) k[i] /= s;
    const ny = m.length, nx = m[0].length;
    const refl = (i, n) => { while (i < 0 || i >= n) i = i < 0 ? -i - 1 : 2 * n - i - 1; return i; };
    const t = m.map(l => l.map((_, x) => { let v = 0; for (let i = -r; i <= r; i++) v += k[i + r] * l[refl(x + i, nx)]; return v; }));
    return t.map((l, y) => l.map((_, x) => { let v = 0; for (let i = -r; i <= r; i++) v += k[i + r] * t[refl(y + i, ny)][x]; return v; }));
  }
  function valor(m, lon, lat) {   // bilinear na grade do modelo (linhas do norte para o sul)
    const g = S.j.grade;
    let fx = (lon - g.lon0) / g.dlon, fy = (g.lat0 - lat) / g.dlat;
    fx = Math.max(0, Math.min(g.nlon - 1.000001, fx)); fy = Math.max(0, Math.min(g.nlat - 1.000001, fy));
    const x = Math.floor(fx), y = Math.floor(fy), tx = fx - x, ty = fy - y;
    return (m[y][x] * (1 - tx) + m[y][x + 1] * tx) * (1 - ty) + (m[y + 1][x] * (1 - tx) + m[y + 1][x + 1] * tx) * ty;
  }
  function classe(v) { let c = 0; while (c < ESCALA.lim.length && v >= ESCALA.lim[c]) c++; return c; }
  const W = GRADE_EXIB, GW = Math.round((-38.9 - W.C) / W.A) + 1, GH = Math.round((W.F + 24.0) / -W.E) + 1;
  function grade(m) {   // valores numa grade de desenho de 0,025°
    const val = new Float32Array(GW * GH);
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) val[y * GW + x] = valor(m, W.C + W.A * x, W.F + W.E * y);
    return val;
  }
  function exibicao() {
    if (S.exib) return S.exib;
    const suave = grade(suavizar(S.j.media.ur)), bruto = grade(S.j.media.ur);
    const cls = new Uint8Array(GW * GH); for (let i = 0; i < cls.length; i++) cls[i] = classe(suave[i]);
    const dias = S.j.dias.map(d => grade(d.ur));
    return (S.exib = { suave, bruto, cls, dias });
  }
  function areas() {   // trechos seguidos da mesma faixa viram retângulos (mesmo método do Curto Prazo)
    const E = exibicao();
    const x0 = Math.floor((-51.4 - W.C) / W.A), x1 = Math.ceil((-39.5 - W.C) / W.A);
    const y0 = Math.floor((-13.9 - W.F) / W.E), y1 = Math.ceil((-23.2 - W.F) / W.E);
    const polys = ESCALA.cores.map(() => []);
    const cl = (x, y) => (x < 0 || x >= GW || y < 0 || y >= GH) ? 0 : E.cls[y * GW + x];
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

  /* ---------------- isolinhas (marching squares na grade suavizada) ---------------- */
  const ROT_ISO = { tam: 3.6, folga: 0.7, cor: '#3a3a3a', opacidade: 0.7 };   // rótulo das isolinhas: letra (mm), folga de cada lado do texto (mm), cor, opacidade
  const MM_GRAU = 18.61;                                      // escala do mapa A4 (mm por grau), a mesma do layout-mapa.js
  // anda dist (graus) pela linha a partir do ponto k, para trás (-1) ou para frente (+1);
  // devolve o ponto do corte e o índice do ponto de baixo do trecho onde ele cai (null se a linha acaba antes)
  function andar(ln, k, dir, dist) {
    let acc = 0;
    for (let m = k; dir < 0 ? m > 0 : m < ln.length - 1; m += dir) {
      const a = ln[m], b = ln[m + dir], seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (acc + seg >= dist) {
        const t = seg ? (dist - acc) / seg : 0;
        return { i: dir < 0 ? m - 1 : m, p: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])] };
      }
      acc += seg;
    }
    return null;
  }
  function isolinhas() {
    const niveis = isoNiveis(), chave = niveis.join(',');
    if (S.iso[chave]) return S.iso[chave];
    const E = exibicao(), v = (x, y) => E.suave[y * GW + x];
    const x0 = Math.floor((-51.4 - W.C) / W.A), x1 = Math.ceil((-39.5 - W.C) / W.A);
    const y0 = Math.floor((-13.9 - W.F) / W.E), y1 = Math.ceil((-23.2 - W.F) / W.E);
    const ll = (x, y) => [W.C + W.A * x, W.F + W.E * y];
    const linhas = [], rotulos = [], usados = [];
    for (const nv of niveis) {
      const segs = [];
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const a = v(x, y), b = v(x + 1, y), c = v(x + 1, y + 1), d = v(x, y + 1);
        const idx = (a >= nv) | ((b >= nv) << 1) | ((c >= nv) << 2) | ((d >= nv) << 3);
        if (idx === 0 || idx === 15) continue;
        const ed = { // pontos de cruzamento em cada aresta (chave = aresta, para emendar os segmentos)
          t: () => ({ k: `h${x},${y}`, p: ll(x + (nv - a) / (b - a), y) }),
          r: () => ({ k: `v${x + 1},${y}`, p: ll(x + 1, y + (nv - b) / (c - b)) }),
          b: () => ({ k: `h${x},${y + 1}`, p: ll(x + (nv - d) / (c - d), y + 1) }),
          l: () => ({ k: `v${x},${y}`, p: ll(x, y + (nv - a) / (d - a)) })
        };
        const T = {
          1: [['l', 't']], 2: [['t', 'r']], 3: [['l', 'r']], 4: [['r', 'b']], 5: [['l', 't'], ['r', 'b']], 6: [['t', 'b']], 7: [['l', 'b']],
          8: [['b', 'l']], 9: [['b', 't']], 10: [['t', 'r'], ['b', 'l']], 11: [['b', 'r']], 12: [['r', 'l']], 13: [['r', 't']], 14: [['t', 'l']]
        }[idx];
        T.forEach(([p, q]) => segs.push([ed[p](), ed[q]()]));
      }
      // emenda os segmentos em linhas contínuas
      const porPonta = new Map(); segs.forEach((s, i) => s.forEach(e => { if (!porPonta.has(e.k)) porPonta.set(e.k, []); porPonta.get(e.k).push(i); }));
      const usado = new Uint8Array(segs.length);
      for (let i = 0; i < segs.length; i++) {
        if (usado[i]) continue;
        usado[i] = 1;
        const pts = [segs[i][0], segs[i][1]];
        const crescer = (fim) => {
          for (;;) {
            const e = fim ? pts[pts.length - 1] : pts[0];
            const j = (porPonta.get(e.k) || []).find(k => !usado[k]);
            if (j == null) return;
            usado[j] = 1;
            const prox = segs[j][0].k === e.k ? segs[j][1] : segs[j][0];
            if (fim) pts.push(prox); else pts.unshift(prox);
          }
        };
        crescer(true); crescer(false);
        const ln = pts.map(e => e.p);
        // rótulo no meio das linhas compridas, dentro de MG e longe de outros rótulos;
        // o texto segue a direção da linha e a linha é interrompida embaixo dele (como o clabel do notebook)
        const cortes = [];
        if (ln.length >= 60) {
          const meio = Math.floor(ln.length / 2), cand = [meio];
          for (let k = 40; meio - k >= 20 || meio + k < ln.length - 20; k += 40) { if (meio - k >= 20) cand.push(meio - k); if (meio + k < ln.length - 20) cand.push(meio + k); }
          const aceitos = [];
          for (const k of cand) {
            if (aceitos.some(j => Math.abs(j - k) < 200)) continue;            // no máximo um rótulo a cada ~200 pontos da mesma linha
            const [lo, la] = ln[k];
            if (![[0, 0], [0.18, 0], [-0.18, 0], [0, 0.12], [0, -0.12]].every(([a, b]) => dentroMG(lo + a, la + b)) || usados.some(([a, b]) => Math.hypot(a - lo, b - la) < 0.8)
                || pertoDivisa(lo, la, 0.15) || cidades().some(c => Math.abs(c.lon - lo) < 0.55 && la > c.lat - 0.32 && la < c.lat + 0.2)) continue;   // não cobre o nome das cidades
            const meiaVao = (String(nv).length * 0.556 * ROT_ISO.tam / 2 + ROT_ISO.folga) / MM_GRAU;   // meia largura do texto + folga, em graus
            const ini = andar(ln, k, -1, meiaVao), fim = andar(ln, k, 1, meiaVao);
            if (!ini || !fim) continue;                                       // perto da ponta da linha: não cabe
            const p = ln[Math.max(0, k - 4)], q = ln[Math.min(ln.length - 1, k + 4)];
            let ang = Math.atan2(-(q[1] - p[1]), q[0] - p[0]) * 180 / Math.PI;   // no SVG o y cresce para baixo
            if (ang > 90) ang -= 180; else if (ang < -90) ang += 180;          // texto nunca de cabeça para baixo
            usados.push([lo, la]); aceitos.push(k); cortes.push({ ini, fim });
            rotulos.push({ lon: lo, lat: la, texto: String(nv), angulo: +ang.toFixed(1), tamanho: ROT_ISO.tam, cor: ROT_ISO.cor, opacidade: ROT_ISO.opacidade, halo: false });
          }
        }
        // corta a linha nos vãos dos rótulos
        cortes.sort((a, b) => a.ini.i - b.ini.i);
        let de = { i: 0, p: ln[0] };
        for (const c of cortes) {
          if (c.ini.i < de.i) continue;
          linhas.push([de.p, ...ln.slice(de.i + 1, c.ini.i + 1), c.ini.p]);
          de = c.fim;
        }
        linhas.push([de.p, ...ln.slice(de.i + 1)]);
      }
    }
    return (S.iso[chave] = { linhas, rotulos });
  }

  /* ---------------- mesorregiões ---------------- */
  function dentro(lon, lat, geom) {
    const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
    let ins = false;
    for (const poly of polys) for (const ring of poly) {
      for (let i = 0, k = ring.length - 1; i < ring.length; k = i++) {
        const [xi, yi] = ring[i], [xk, yk] = ring[k];
        if ((yi > lat) !== (yk > lat) && lon < (xk - xi) * (lat - yi) / (yk - yi) + xi) ins = !ins;
      }
    }
    return ins;
  }
  const MESOS = () => (window.MESO_UR ? window.MESO_UR.features : []);
  // true se o ponto está a menos de d graus de alguma divisa de mesorregião (o rótulo ficaria escondido pela linha preta)
  function pertoDivisa(lon, lat, d) {
    for (const f of MESOS()) for (const poly of (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates)) for (const ring of poly) {
      for (let i = 1; i < ring.length; i++) {
        const [x1, y1] = ring[i - 1], [x2, y2] = ring[i], dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy;
        const t = L ? Math.max(0, Math.min(1, ((lon - x1) * dx + (lat - y1) * dy) / L)) : 0;
        if (Math.hypot(lon - x1 - t * dx, lat - y1 - t * dy) < d) return true;
      }
    }
    return false;
  }
  function dentroMG(lon, lat) { return MESOS().some(f => dentro(lon, lat, f.geometry)); }
  let MASCARAS = null;
  function mascaras() {
    if (MASCARAS) return MASCARAS;
    MASCARAS = MESOS().map(f => {
      const pts = []; (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).forEach(p => p[0].forEach(c => pts.push(c)));
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
      const ix0 = Math.floor((Math.min(...xs) - W.C) / W.A), ix1 = Math.ceil((Math.max(...xs) - W.C) / W.A);
      const iy0 = Math.floor((Math.max(...ys) - W.F) / W.E), iy1 = Math.ceil((Math.min(...ys) - W.F) / W.E);
      const cel = [];
      for (let y = iy0; y <= iy1; y++) for (let x = ix0; x <= ix1; x++) if (dentro(W.C + W.A * x, W.F + W.E * y, f.geometry)) cel.push(y * GW + x);
      return { nome: f.properties.name, cel };
    });
    return MASCARAS;
  }
  function estado(v) { const r = Math.round(v); return ESTADOS.find(e => r <= e.ate) || null; }
  function estatMeso() {
    const E = exibicao();
    return mascaras().map(({ nome, cel }) => {
      const minDe = arr => { let m = Infinity; for (const i of cel) if (arr[i] < m) m = arr[i]; return m; };
      let soma = 0; for (const i of cel) soma += E.bruto[i];
      const minMedia = minDe(E.bruto);
      const ord = Array.from(cel, i => E.bruto[i]).sort((a, b) => a - b), pc = q => ord[Math.min(ord.length - 1, Math.floor(q * ord.length))];
      return { nome, dias: E.dias.map(minDe), minMedia, media: soma / cel.length, estado: estado(minMedia),
        p10: pc(0.10), p25: pc(0.25), p50: pc(0.50), p75: pc(0.75), p90: pc(0.90), max: ord[ord.length - 1] };   // percentis: usados no texto do relatório
    });
  }
  function extremoMG() {
    const e = estatMeso().reduce((a, b) => b.minMedia < a.minMedia ? b : a);
    return { v: e.minMedia, meso: e.nome };
  }
  function cidades() {
    const fs = (window.CIDADES && window.CIDADES.features) || [];
    return fs.map(f => ({ nome: f.properties.NM_LOCAL_1 || f.properties.NM_MUNICIP || '', lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }))
      .filter(c => c.nome && isFinite(c.lon) && isFinite(c.lat));
  }

  /* ---------------- mapa ---------------- */
  function opMapa() {
    const j = S.j, d0 = j.dias[0].valido_local, d2 = j.dias[2].valido_local, ano = String(j.data_ciclo).slice(0, 4);
    const op = {
      titulo: `Previsão Umidade Relativa do Ar Mínima - ${dataBR(d0)} a ${dataBR(d2)}`,
      textoValidade: `VÁLIDO: 15h de ${ddmm(d0)} a ${ddmm(d2)}, hora local`,
      credito: `Fonte de dados: WRF 7 km/CPTEC/INPE (rodada ${ddmm(j.rodada_utc)} 00Z) - SIMGE/IGAM, ${ano}`,
      fundo: '',
      areas: areas(),
      legenda: ESCALA.labels.map((l, i) => ({ fill: ESCALA.cores[i], label: l + ' %' })),
      cidades: $('urCidades').checked ? cidades() : []
    };
    if (isoNiveis().length) {
      const I = isolinhas();
      op.isolinhas = [{ linhas: I.linhas, stroke: '#ffffff', width: 0.22, opacity: 0.8 }];
      op.rotulosIso = I.rotulos;
    }
    return op;
  }
  function desenhar() {
    const el = $('urMapa');
    if (!S.j) { el.innerHTML = '<div class="vazio">Sem dados para desenhar o mapa.</div>'; $('urPng').disabled = true; $('previewBtn').disabled = true; tabela(); return; }
    if (!window.LayoutMapa) { el.innerHTML = '<div class="vazio">Não foi possível carregar o layout do mapa. Recarregue a página.</div>'; return; }
    const op = opMapa(), img = new Image(); img.alt = op.titulo;
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(LayoutMapa.svg(op));
    el.innerHTML = ''; el.appendChild(img);
    $('urPng').disabled = false; $('previewBtn').disabled = false;
    tabela();
    try { document.dispatchEvent(new CustomEvent('ur:mapa')); } catch (e) { }   // aba Relatório refaz a prévia
  }

  /* ---------------- tabela ---------------- */
  function selo(e) { return e ? `<span class="selo" style="background:${e.cor};color:${e.txt}">${e.nome}</span>` : '<span class="small">acima de 40 %</span>'; }
  function tabela() {
    const dias = S.j ? S.j.dias.map(d => ddmm(d.valido_local)) : ['Dia 1', 'Dia 2', 'Dia 3'];
    $('urMesoHead').innerHTML = '<tr><th rowspan="2">Mesorregião</th><th colspan="3" class="c">Menor UR às 15h (%)</th><th colspan="2" class="c">Média dos 3 dias (%)</th><th rowspan="2" class="c">Estado (Manual)</th></tr><tr>' +
      dias.map(d => `<th class="c">${d}</th>`).join('') + '<th class="c">Menor valor</th><th class="c">Média na meso</th></tr>';
    if (!S.j) { $('urMesoBody').innerHTML = '<tr><td colspan="7" class="small">Sem dados.</td></tr>'; $('urCsv').disabled = true; return; }
    const est = estatMeso();
    const cel = v => `<td class="c"><span class="sw" style="background:${ESCALA.cores[classe(v)]}"></span>${num(v)}</td>`;
    $('urMesoBody').innerHTML = est.map(e => `<tr><td>${esc(e.nome)}</td>${e.dias.map(cel).join('')}${cel(e.minMedia)}<td class="c">${num(e.media)}</td><td class="c">${selo(e.estado)}</td></tr>`).join('');
    $('urCsv').disabled = false;
  }

  /* ---------------- arquivos (só no computador, como no painel de testes) ---------------- */
  function baixar(nome, blob) {
    // com a ponte (assets/ponte-drive.js), este clique é interceptado e o arquivo vai para o PC e o Drive (OPÇÕES DE SALVAMENTO)
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  const periodoTag = () => `${ddmm(S.j.dias[0].valido_local).replace('/', '-')}_a_${ddmm(S.j.dias[2].valido_local).replace('/', '-')}_${S.j.data_ciclo.replace(/-/g, '')}_00Z`;
  async function png() {
    const b = $('urPng'), txt = b.textContent; b.disabled = true; b.textContent = 'Gerando PNG…';
    try { baixar(`UmidadeMinima_WRF_${periodoTag()}.png`, await LayoutMapa.png(opMapa())); }
    catch (e) { setStatus($('urStatus').innerHTML + `<div class="warn">Não foi possível gerar o PNG: ${esc(e.message)}</div>`); }
    finally { b.disabled = false; b.textContent = txt; }
  }
  function csv() {
    const dias = S.j.dias.map(d => ddmm(d.valido_local));
    const ls = [['Mesorregião'].concat(dias.map(d => `Menor UR 15h ${d} (%)`), ['Média 3 dias: menor valor (%)', 'Média 3 dias: média na meso (%)', 'Estado (Manual)'])]
      .concat(estatMeso().map(e => [e.nome].concat(e.dias.map(v => num(v, 1)), [num(e.minMedia, 1), num(e.media, 1), e.estado ? e.estado.nome : 'acima de 40 %'])));
    const txt = '﻿' + ls.map(l => l.map(v => /[;"\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v).join(';')).join('\r\n');
    baixar(`UmidadeMinima_mesorregioes_${periodoTag()}.csv`, new Blob([txt], { type: 'text/csv;charset=utf-8' }));
  }

  /* ---------------- início ---------------- */
  function iniciar() {
    $('urLoad').addEventListener('click', carregar);
    $('urCidades').addEventListener('change', desenhar);
    $('urIso').innerHTML = ISO_ORDEM.map(k => `<option value="${k}"${k === S.isoOp ? ' selected' : ''}>${ISO_OPCOES[k].nome}</option>`).join('');
    $('urIso').addEventListener('change', e => { S.isoOp = e.target.value; try { localStorage.setItem('urIsolinhas', S.isoOp); } catch (er) { } desenhar(); });
    $('urPng').addEventListener('click', png);
    $('previewBtn').addEventListener('click', () => { if (S.j && window.LayoutMapa) LayoutMapa.previa(opMapa()); });
    $('urCsv').addEventListener('click', csv);
    $('urEstados').innerHTML = ESTADOS.slice().reverse().map(e => `${selo(e)} ${e.faixa}`).join(' &nbsp; ');
    desenhar();
    carregar();
  }
  window.UmidadeMinima = { ESCALA, ESTADOS, suavizar, opMapa: () => S.j ? opMapa() : null, dados: () => S.j, dataBR, ddmm, baixar, periodoTag: () => periodoTag(), valor: (lon, lat) => S.j && valor(S.j.media.ur, lon, lat), estatMeso: () => estatMeso(), isolinhas: () => isolinhas(), _S: S };   // para conferência no console
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
