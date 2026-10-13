/* Código da Previsão diária v1.11 (v1.10 + aba "Previsão por cidade").
   Extraído de "Previsão diária — Minas Gerais v1.1.html" para a versão Apps Script
   (carregado de fora para o Apps Script não interferir no código). */

"use strict";
/* ================= constantes do modelo QGIS (layout_mapas_icones_v3.6) ================= */
const PAGE = {w:297, h:222.75};
const MAP = {x:6.86137, y:19.8108, w:287.879, h:171.968,
  xmin:-51.37697910145185887, xmax:-35.90814406617541721, ymin:-23.17966841410345324, ymax:-13.93919886637183225};
const K = MAP.w / (MAP.xmax - MAP.xmin);
const PT = 25.4/72; // mm por ponto tipográfico
const NAVY = "#092b6a";
const FONT = "Arial, 'Liberation Sans', Helvetica, sans-serif";
const CAT = Object.fromEntries(ICONS.map(c => [c.value, c]));
const NONE = "sem informação";
const DEFAULT_TEXTS = {
  region: "Minas Gerais",
  footer: "Iniciativa realizada com recursos do Acordo de Reparação\ndo Rio Doce, firmado em decorrência do rompimento da\nBarragem de Fundão, da Samarco S.A. O rompimento, ocorrido\nem 5 de novembro de 2015, tirou a vida de 19 pessoas.",
  credits: "Previsão de Tempo - SIMGE/IGAM, {ano}\nLimites municipais e mesorregiões - IBGE\nBase cartográfica: IBGE\nProjeção: Latitude/Longitude - Datum SIRGAS 2000"
};
// textos iniciais do boletim (exemplo enviado pela equipe; tudo editável)
const BUL_DEFAULT = () => ({
  title: "PREVISÕES E AVISOS METEOROLÓGICOS",
  dateAuto: true, dateText: "",
  valAuto: true, valText: "",
  paras: [
    "A aproximação de uma frente fria pelo Sudeste, associada ao forte aquecimento e ao aumento da disponibilidade de umidade, deixa o tempo instável em parte de Minas Gerais. A partir da tarde, há previsão de pancadas de chuva e trovoadas isoladas no Triângulo Mineiro, Alto Paranaíba, região Central e Leste do estado. Há condições para tempestades severas, Nível 1, no Triângulo Mineiro e na metade sul e sudeste de Minas, com possibilidade de chuva forte, rajadas de vento e granizo. No Norte, Noroeste e Nordeste mineiro, o ar quente e seco mantém o predomínio de Sol, temperaturas elevadas e baixos índices de umidade. As máximas variam entre 26 °C no extremo Sul e 40 °C no Norte de Minas.",
    "Em Belo Horizonte, o dia começa com Sol e temperaturas elevadas. A partir da tarde, há condições para tempestades, com possibilidade de episódios localmente fortes. A temperatura máxima pode atingir 34 °C."
  ],
  obsAuto: true, obsText: ""
});
const LOGO_SLOTS = [
  {key:"igam", name:"IGAM", x:11.85, w:40.2},
  {key:"simge", name:"SIMGE", x:54.6, w:53.4},
  {key:"appa", name:"APPA", x:110.9, w:47.6},
  {key:"riodoce", name:"Reparação Rio Doce", x:161.4, w:37.6}
];
const LOGO_Y = 202.9, LOGO_H = 15.5, LOGO_X0 = 10.5, LOGO_X1 = 196.4;
// Todos os logotipos na mesma altura (ajustável por logotipo); espaçamento igual e separadores entre eles.
function logoLayout(){
  const GAP = 6.5, avail = LOGO_X1 - LOGO_X0;
  let H = 12.5;
  const items = LOGO_SLOTS.map(s => { const L = logoOf(s.key);
    const k = L ? logoScale(s.key) : 1; return {s, L, k, ratio: L ? L.w/L.h : 2.6}; });
  const need = H => items.reduce((a, it) => a + H*it.k*it.ratio, 0) + GAP*(items.length-1);
  if (need(H) > avail) H *= (avail - GAP*(items.length-1)) / (need(H) - GAP*(items.length-1));
  items.forEach(it => { it.h = Math.min(LOGO_H, H*it.k); it.w = it.h*it.ratio; });
  const total = items.reduce((a, it) => a + it.w, 0);
  const gap = Math.min(22, (avail - total)/(items.length-1));
  let x = LOGO_X0 + (avail - total - gap*(items.length-1))/2;
  const out = [];
  items.forEach((it, i) => { it.x = x; out.push(it); x += it.w; if (i < items.length-1){ out.push({sep: x + gap/2 - 0.14}); x += gap; } });
  return out;
}
// Municípios base cadastrados (lista fornecida pela equipe)
const START_MUN = ["Almenara","Barbacena","Belo Horizonte","Buritis","Campos Altos","Carneirinho","Curvelo","Diamantina","Divinópolis","Extrema","Governador Valadares","Ipatinga","Itamonte","Januária","Juiz de Fora","Manhuaçu","Montes Claros","Paracatu","Patos de Minas","Pirapora","Poços de Caldas","Teófilo Otoni","Uberaba","Uberlândia","Viçosa"];
const BASE_VERSION = 2;
// deslocamento inicial (mm) para quem fica cortado pela borda do mapa
const DEFAULT_OFFSET = {"Extrema":[0,-5.5]};
const MESO_LABELS = [
  ["NOROESTE DE MINAS",-46.43,-17.33],["NORTE DE MINAS",-43.97,-16.10],["JEQUITINHONHA",-41.33,-16.51],
  ["VALE DO MUCURI",-41.17,-17.68],["TRIÂNGULO MINEIRO/ALTO PARANAÍBA",-48.28,-19.23],["CENTRAL MINEIRA",-44.95,-18.76],
  ["METROPOLITANA DE BELO HORIZONTE",-43.75,-19.65],["VALE DO RIO DOCE",-42.05,-18.99],["OESTE DE MINAS",-45.24,-20.60],
  ["SUL/SUDOESTE DE MINAS",-45.87,-21.73],["CAMPO DAS VERTENTES",-44.29,-21.21],["ZONA DA MATA",-42.82,-21.01]];
// siglas dos estados no ponto interno de cada um dentro da área do mapa; DF no centro do polígono
const STATE_LABELS = [["MT",-51.18,-14.494],["GO",-49.744,-16.279],["DF",-47.797,-15.7755],["BA",-40.865,-14.794],["MS",-51.198,-19.86],
  ["SP",-48.785,-21.709],["RJ",-42.536,-22.359],["ES",-40.361,-19.342]];
// PR fica de fora: a pequena parte dele dentro do mapa fica sob a escala gráfica
const NORTH_ARROW = `<g transform="translate(-1.438 30.744)"><path d="m32-9.453l28.938 73.826-29-29-29 29z" fill="#000" stroke="#fff" stroke-width="3"/><path d="m32-9.453l29 73.45-29-29-29 29z" fill="none" stroke="#fff" stroke-linecap="square"/><text fill="#000" font-family="${FONT}" font-size="26" x="22.71" y="-10.854">N</text></g><g fill="none" stroke="#fff" stroke-width=".25" transform="translate(0 -3.829)"><path d="m4 92.82l6.74-3.891M4.603 90.7l10.397-6M3 95.17l4-2.309M5.442 88.45l13.856-8M12 72.26l18.686-10.812M14.593 65.45l16.09-9.291M15.343 63.24l15.343-8.858M16.877 60.58l13.809-7.972M17.511 58.45l13.174-7.606M18.412 56.15l12.274-7.087M19 54.04l11.427-6.597M20 51.757l10.822-6.311M20.826 49.45l9.86-5.693M21.48 47.3l9.206-5.315M23 44.647l7.686-4.437M23.744 42.45l6.928-4M24.549 40.21l6.137-3.543M25 38.18l5.686-3.283M26.663 35.446l4.02-2.323M27.617 33.12l3.069-1.772M28 31.13l2.686-1.551M29.15 28.694l1.534-.886M13 69.909l17.686-10.211M9.206 79.19l21.48-12.402M8.36 81.45l22.326-12.89M7.671 83.62l19.946-11.516M6.137 86.27l17.02-9.827M10 76.956l20.686-11.943M11.279 74.45l19.407-11.205M14 67.56l16.686-9.634"/><path d="m30.562 69.573v-43.566"/></g>`;

/* ================= regras de entrada (equivalentes a domain.py) ================= */
function parseTemp(v){
  if (v == null) return null;
  let t = String(v).trim();
  if (t === "" || ["NULL","NONE"].includes(t.toUpperCase())) return null;
  t = t.replace(/\s*[°º]\s*[Cc]?\s*$/, "").trim().replace(",", ".");
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(t)) throw new Error("Digite um número, por exemplo 30 ou 18,5; deixe vazio se não consta.");
  const n = Number(t);
  if (!isFinite(n) || n.toFixed(1).length > 8) throw new Error("Temperatura fora da faixa aceita.");
  if (Math.abs(n*10 - Math.round(n*10)) > 1e-5) throw new Error("Use no máximo uma casa decimal; o valor não foi arredondado.");
  return n;
}
const fmtTemp = n => n == null ? "" : String(n).replace(".", ",");
// quais temperaturas entram no mapa: "both" (máxima e mínima), "max" ou "min"
const useMax = () => (S.opts.temps || "both") !== "min";
const useMin = () => (S.opts.temps || "both") !== "max";
// temperaturas que aparecem no mapa (ignora a coluna desativada e valores inválidos)
function shownTemps(r){
  let mx = null, mn = null;
  if (useMax()) try { mx = parseTemp(r.tmax); } catch(e){}
  if (useMin()) try { mn = parseTemp(r.tmin); } catch(e){}
  return [mx, mn];
}
function checkRow(r){
  const e = {};
  let mx = null, mn = null;
  if (useMax()) try { mx = parseTemp(r.tmax); } catch(x){ e.tmax = x.message; }
  if (useMin()) try { mn = parseTemp(r.tmin); } catch(x){ e.tmin = x.message; }
  if (mx != null && mn != null && mn > mx) e.tmin = "A mínima não pode ser maior que a máxima.";
  if (!CAT[r.tempo]) e.tempo = "Selecione uma condição da lista.";
  return {mx, mn, e, ok: !Object.keys(e).length};
}

/* ================= estado e armazenamento ================= */
const LS = {draft:"prevmg:draft:v1", logos:"prevmg:logos:v1", hist:"prevmg:hist:v1"};
const store = {
  get(k, d){ try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch(e){ return d; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch(e){ return false; } }
};
const MUN = new Map(GEO.mun.map(m => [m[0], {lat:m[1], lon:m[2]}]));
const norm = s => s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
const MUN_NORM = new Map(GEO.mun.map(m => [norm(m[0]), m[0]]));
let uid = 0;
function makeRow(name){
  const m = MUN.get(name);
  const off = DEFAULT_OFFSET[name] || [0, 0];
  return {id:"r"+(++uid), name, lat:m.lat, lon:m.lon, dx:off[0], dy:off[1], tempo:NONE, tmax:"", tmin:""};
}
function todayISO(){ const d = new Date(); d.setMinutes(d.getMinutes()-d.getTimezoneOffset()); return d.toISOString().slice(0,10); }
function defaultState(){
  return {date: todayISO(), val:{time:"10:00", date:addDays(todayISO(),1), auto:true}, rows: START_MUN.map(makeRow), texts: {...DEFAULT_TEXTS},
    opts:{mun:true, meso:true, mesoNames:false, states:true, names:true, autoSpread:true, temps:"both", iconScale:1, nameSize:3.5, mgFill:true, baseFill:true}, bgActive:null, baseVersion:BASE_VERSION, namesDefaultV:2, noticeDismissed:true, savedSig:null};
}
function addDays(iso, n){ if (!iso) return ""; const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate()+n);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
// "Válido até às 10h do dia 02/10/2026" — texto fixo; só hora e data mudam
function validityText(v = S.val){
  if (!v || !v.date || !v.time) return "";
  const [h, m] = v.time.split(":");
  return `Válido até às ${+h}h${m && m !== "00" ? m : ""} do dia ${fmtDateBR(v.date)}`;
}
function parseValidity(t){
  const m = /(\d{1,2})\s*(?:h|:)\s*(\d{2})?[^\d]*(\d{2})\/(\d{2})\/(\d{4})/.exec(t || "");
  return m ? {time:`${m[1].padStart(2,"0")}:${m[2]||"00"}`, date:`${m[5]}-${m[4]}-${m[3]}`, auto:false} : null;
}
let S = store.get(LS.draft, null);
if (!S || !Array.isArray(S.rows)) S = defaultState();
S.rows.forEach(r => { r.id = "r"+(++uid); });
S.texts = {...DEFAULT_TEXTS, ...(S.texts||{})};
S.bul = {...BUL_DEFAULT(), ...(S.bul||{})};
S.opts = {...defaultState().opts, ...(S.opts||{})};
if (!S.val) S.val = parseValidity(S.validity) || {time:"10:00", date:addDays(S.date,1), auto:true};
delete S.validity;
// troca a lista antiga pelos municípios base, mantendo o que já estava preenchido nos que continuam
if (S.namesDefaultV !== 2){ S.opts.names = true; S.namesDefaultV = 2;
  S.rows.forEach(r => { if (DEFAULT_OFFSET[r.name] && !r.dx && !r.dy){ [r.dx, r.dy] = DEFAULT_OFFSET[r.name]; } }); }   // nomes passam a vir marcados
if (S.baseVersion !== BASE_VERSION){
  const old = new Map(S.rows.map(r => [r.name, r]));
  S.rows = START_MUN.map(n => old.has(n) ? old.get(n) : makeRow(n));
  S.baseVersion = BASE_VERSION; S.noticeDismissed = true;
}
let LOGOS = {};                                    // logotipos sempre os incluídos no layout
try { localStorage.removeItem(LS.logos); localStorage.removeItem(LS.hist); localStorage.removeItem("prevmg:logosOpened"); } catch(e){}
const logoOf = k => (LOGOS[k] && LOGOS[k].src) ? LOGOS[k] : (DEFAULT_LOGOS[k] || null);
const logoScale = k => (LOGOS[k] && LOGOS[k].scale) || (LOGOS["_scale_"+k]) || 1;

const sortRows = () => S.rows.sort((a,b) => a.name.localeCompare(b.name, "pt-BR", {sensitivity:"base"}));
const sig = () => JSON.stringify([S.date, validityText(), S.rows.map(r => [r.name, r.tempo, r.tmax, r.tmin])]);
let saveTimer = null;
const flush = () => { clearTimeout(saveTimer); saveTimer = null; store.set(LS.draft, {...S, rows: S.rows.map(({id, ...r}) => r)}); };
function persist(){ clearTimeout(saveTimer); saveTimer = setTimeout(flush, 250); updateStatus(); }
addEventListener("pagehide", () => { if (saveTimer) flush(); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && saveTimer) flush(); });

/* ================= utilidades ================= */
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const f2 = n => (Math.round(n*100)/100).toString();
const proj = (lon, lat) => [MAP.x + (lon - MAP.xmin)*K, MAP.y + (MAP.ymax - lat)*K];
const fmtDateBR = iso => iso ? iso.split("-").reverse().join("/") : "";
const measureCtx = document.createElement("canvas").getContext("2d");
function textW(text, sizeMM, weight){ measureCtx.font = `${weight||400} 100px ${FONT}`; return measureCtx.measureText(text).width * sizeMM / 100; }
function fitSize(lines, sizeMM, maxW, weight){
  const w = Math.max(...lines.map(l => textW(l, sizeMM, weight)));
  return w > maxW ? sizeMM * maxW / w : sizeMM;
}
// QGIS centraliza a linha pela altura ascendente+descendente (Arial: .905/.212)
const ASC = .905, DESC = .212, LH = 1.117;
function textBlock({lines, x, yTop, h, size, weight, fill, anchor, extra}){
  const total = lines.length * size * LH - (LH - (ASC+DESC)) * size;
  let y = yTop + (h - total)/2 + ASC*size;
  return lines.map((l,i) => `<text x="${f2(x)}" y="${f2(y + i*size*LH)}" font-family="${FONT}" font-size="${f2(size)}" font-weight="${weight||400}" fill="${fill}" text-anchor="${anchor||"start"}"${extra||""}>${esc(l)}</text>`).join("");
}
function dms(v, pos, neg){
  const h = v < 0 ? neg : pos; v = Math.abs(v);
  let d = Math.floor(v), m = Math.floor((v-d)*60+1e-9), s = Math.round(((v-d)*60-m)*60);
  if (s === 60){ s = 0; m++; } if (m === 60){ m = 0; d++; }
  return `${d}°${String(m).padStart(2,"0")}'${String(s).padStart(2,"0")}"${h}`;
}
function usedCats(){
  const used = new Set();
  for (const r of S.rows){
    const [x, y] = iconXY(r);
    if (x >= MAP.x && x <= MAP.x+MAP.w && y >= MAP.y && y <= MAP.y+MAP.h) used.add(r.tempo);
  }
  return ICONS.filter(c => used.has(c.value));
}
// todos os ícones com a mesma área visual, independentemente da proporção do desenho
const ICON_AREA = 215; // mm² no tamanho 100%
// Correção visual por ícone: desenhos altos (termômetros) pareciam maiores e
// desenhos espalhados (chuva a qualquer momento) pareciam menores com a mesma área.
const ICON_FIX = {"calor intenso":0.8, "frio intenso":0.82, "chuva a qualquer momento":1.2, "ventos fortes":0.9,
  "sem informação":0.9, "geada":0.95, "névoa seca":1.05, "nevoeiro":0.95, "tornado":0.97};
function iconDims(c, scale){
  const k = ICON_FIX[c.value] || 1;
  const A = ICON_AREA*scale*scale; let w = Math.sqrt(A/c.ar)*k, h = w*c.ar; const m = 19.5*scale;
  if (w > m){ w = m; h = w*c.ar; } if (h > m){ h = m; w = h/c.ar; }
  return [w, h];
}
const iconXY = r => { const [x,y] = proj(r.lon, r.lat); return [x + (r.dx||0), y + (r.dy||0)]; };
const isPinned = r => { const d0 = DEFAULT_OFFSET[r.name] || [0,0]; return (r.dx||0) !== d0[0] || (r.dy||0) !== d0[1]; };

/* ---------- afastamento automático ----------
   Cada município é um grupo (ícone + temperaturas + nome). Quando partes de grupos diferentes se
   sobrepõem — sobretudo ícone/temperatura sobre o nome de outro município — os grupos são
   empurrados um pouco, pelo eixo de menor sobreposição, até se separarem. Ícones posicionados à mão
   ficam fixos e os outros se afastam deles. O deslocamento máximo é limitado para manter cada ícone
   perto do seu município. */
let AUTO = new Map(), NAME_UP = new Set();
const AUTO_MAX = 4;           // mm — deslocamento pequeno
// polígono de Minas Gerais (mm da página) para manter os ícones dentro do estado
const MG_RINGS = (() => { const rings = []; let cur = null, x = 0, y = 0;
  for (const m of GEO.mg.matchAll(/([Mlz])([^Mlz]*)/g)){
    const v = m[2].trim() ? m[2].trim().split(/\s+/).map(Number) : [];
    if (m[1] === "M"){ x = v[0]+MAP.x; y = v[1]+MAP.y; cur = [[x, y]]; rings.push(cur); }
    else if (m[1] === "l"){ for (let i = 0; i+1 < v.length; i += 2){ x += v[i]; y += v[i+1]; cur.push([x, y]); } }
  }
  return rings; })();
function inMG(px, py){
  let inside = false;
  for (const r of MG_RINGS) for (let i = 0, j = r.length-1; i < r.length; j = i++){
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > py) !== (yj > py) && px < (xj-xi)*(py-yi)/(yj-yi) + xi) inside = !inside;
  }
  return inside;
}
function groupRects(r){
  const c = CAT[r.tempo] || CAT[NONE];
  const [w, h] = iconDims(c, S.opts.iconScale || 1);
  const tsz = 10*PT, ns = S.opts.nameSize || 3.5;
  const [mx, mn] = shownTemps(r);
  const solid = [[-w/2*0.94, -h/2*0.94, w/2*0.94, h/2*0.94]];
  if (mx != null || mn != null){
    const tw = Math.max(mx != null ? textW(fmtTemp(mx)+"°C", tsz, 700) : 0, mn != null ? textW(fmtTemp(mn)+"°C", tsz, 700) : 0);
    const both = mx != null && mn != null, lh = (ASC+DESC)*tsz;
    solid.push(both ? [w/2+1.0, 0.4 - lh - 0.2, w/2+1.3+tw+0.4, 0.4 + lh + 0.2] : [w/2+1.0, -lh/2 - 0.2, w/2+1.3+tw+0.4, lh/2 + 0.2]);
  }
  const nw = (textW(r.name, ns, 700)+ns*0.3)/2, nh = (ASC+DESC)*ns;
  const below = [-nw, h/2+0.3, nw, h/2+0.3+nh], above = [-nw, -h/2-0.3-nh, nw, -h/2-0.3];
  return {solid, name: S.opts.names ? [below] : [], below, above, h};
}
let AUTO_KEY = "";
function computeAuto(){
  const key = JSON.stringify([S.opts.temps, S.opts.autoSpread, S.opts.names, S.opts.iconScale, S.opts.nameSize, S.rows.map(r => [r.id, r.name, r.tempo, r.tmax, r.tmin, r.dx, r.dy])]);
  if (key === AUTO_KEY) return;            // nada mudou desde o último cálculo
  AUTO_KEY = key; AUTO = new Map(); NAME_UP = new Set();
  // cada retângulo: [x1, y1, x2, y2, tipo] relativo ao ponto do ícone; tipo 0 = ícone/temperatura, 1 = nome
  const G = S.rows.map(r => { const [x, y] = iconXY(r); const g = groupRects(r);
    const rects = [...g.solid.map(q => [...q, 0]), ...g.name.map(q => [...q, 1])];
    return {r, x, y, ox:0, oy:0, okx:0, oky:0, mob: isPinned(r) ? 0 : 1, rects, below:g.below, above:g.above}; });
  if (!S.opts.autoSpread){ G.forEach(g => AUTO.set(g.r.id, [0,0])); return; }
  const bbox = g => { let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
    for (const q of g.rects){ if (q[0] < x1) x1 = q[0]; if (q[1] < y1) y1 = q[1]; if (q[2] > x2) x2 = q[2]; if (q[3] > y2) y2 = q[3]; }
    g.bb = [x1, y1, x2, y2]; };
  G.forEach(bbox);
  const GAP = 0.5, LEGX = 229.0, BOT = MAP.y+MAP.h-0.5, TOP = MAP.y+0.5, LEFT = MAP.x+0.5;
  const W = [[0.8, 1], [1, 0.6]];          // peso por tipo: sólido×nome é o mais importante
  const overlapArea = (g, q) => { const ax1 = g.x+g.ox+q[0], ay1 = g.y+g.oy+q[1], ax2 = g.x+g.ox+q[2], ay2 = g.y+g.oy+q[3]; let s = 0;
    for (const o of G){ if (o === g) continue; for (const p of o.rects){
      const ox = Math.min(ax2, o.x+o.ox+p[2]) - Math.max(ax1, o.x+o.ox+p[0]), oy = Math.min(ay2, o.y+o.oy+p[3]) - Math.max(ay1, o.y+o.oy+p[1]);
      if (ox > 0 && oy > 0) s += ox*oy; } }
    if (ay2 > BOT) s += (ay2-BOT)*(ax2-ax1);
    return s; };
  const n = G.length;
  for (let pass = 0; pass < 2; pass++){
    for (let it = 0; it < 200; it++){
      let moved = false;
      for (let i = 0; i < n; i++){ const a = G[i];
        for (let j = i+1; j < n; j++){ const b = G[j]; if (!a.mob && !b.mob) continue;
          const ax = a.x+a.ox, ay = a.y+a.oy, bx = b.x+b.ox, by = b.y+b.oy;
          if (ax+a.bb[2]+GAP < bx+b.bb[0] || bx+b.bb[2]+GAP < ax+a.bb[0] || ay+a.bb[3]+GAP < by+b.bb[1] || by+b.bb[3]+GAP < ay+a.bb[1]) continue;
          const sa = a.mob/(a.mob+b.mob), sb = b.mob/(a.mob+b.mob);
          for (const qa of a.rects) for (const qb of b.rects){
            const k = W[qa[4]][qb[4]];
            const ax = a.x+a.ox, ay = a.y+a.oy, bx = b.x+b.ox, by = b.y+b.oy;
            const A0 = ax+qa[0], A1 = ay+qa[1], A2 = ax+qa[2], A3 = ay+qa[3];
            const B0 = bx+qb[0], B1 = by+qb[1], B2 = bx+qb[2], B3 = by+qb[3];
            const ox = Math.min(A2, B2) - Math.max(A0, B0) + GAP, oy = Math.min(A3, B3) - Math.max(A1, B1) + GAP;
            if (ox <= 0 || oy <= 0) continue;
            const f = 0.5*k;
            if (ox < oy){ const d = ((A0+A2) < (B0+B2) ? -1 : 1) * ox * f; a.ox += d*sa; b.ox -= d*sb; }
            else { const d = ((A1+A3) < (B1+B3) ? -1 : 1) * oy * f; a.oy += d*sa; b.oy -= d*sb; }
            moved = true;
          }
        }
      }
      // limites: dentro da moldura, fora da legenda e deslocamento máximo
      for (const g of G){ if (!g.mob) continue;
        const x1 = g.x+g.ox+g.bb[0], y1 = g.y+g.oy+g.bb[1], x2 = g.x+g.ox+g.bb[2], y2 = g.y+g.oy+g.bb[3];
        if (x1 < LEFT) g.ox += LEFT-x1; if (y1 < TOP) g.oy += TOP-y1; if (y2 > BOT) g.oy -= y2-BOT;
        if (x2 > LEGX) g.ox -= Math.min(x2-LEGX, 3);
        const d = Math.hypot(g.ox, g.oy); if (d > AUTO_MAX){ g.ox *= AUTO_MAX/d; g.oy *= AUTO_MAX/d; }
        // nunca leva o ícone para fora de Minas Gerais
        if (inMG(g.x+g.ox, g.y+g.oy)){ g.okx = g.ox; g.oky = g.oy; } else { g.ox = g.okx; g.oy = g.oky; }
      }
      if (!moved) break;
    }
    // se o nome ainda ficar coberto, tenta colocá-lo acima do ícone
    if (pass > 0 || !S.opts.names) break;
    let flipped = false;
    for (const g of G){ const ni = g.rects.findIndex(q => q[4] === 1); if (ni < 0) continue;
      const cur = overlapArea(g, g.below); if (cur < 0.5) continue;
      if (overlapArea(g, g.above) < cur*0.5){ g.rects[ni] = [...g.above, 1]; bbox(g); NAME_UP.add(g.r.id); flipped = true; } }
    if (!flipped) break;
  }
  G.forEach(g => AUTO.set(g.r.id, [g.ox, g.oy]));
}
const finalXY = r => { const [x, y] = iconXY(r), a = AUTO.get(r.id) || [0,0]; return [x + a[0], y + a[1]]; };

/* ================= desenho do layout (SVG em milímetros) ================= */
function renderSVG({forExport=false} = {}){
  const o = [];
  const navy = NAVY;
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${PAGE.w}mm" height="${PAGE.h}mm" viewBox="0 0 ${PAGE.w} ${PAGE.h}">`);
  o.push(`<defs><clipPath id="mapclip"><rect x="0" y="0" width="${MAP.w}" height="${MAP.h}"/></clipPath></defs>`);
  o.push(`<rect width="${PAGE.w}" height="${PAGE.h}" fill="#f7fcff"/>`);

  /* ---- cabeçalho ---- */
  [[4.10221,2.0511,291.257,14.9731,4.10221],[4.30732,2.25622,290.847,14.5628,3.8971],[4.51243,2.46133,290.436,14.1526,3.69199],[4.30732,2.66644,290.436,13.7424,3.48688]]
    .forEach(([x,y,w,h,r]) => o.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="rgb(49,142,206)" fill-opacity=".02"/>`));
  o.push(`<rect x="4.92265" y="2.87155" width="289.616" height="13.1271" rx="3.28177" fill="#fff" stroke="rgb(135,196,239)" stroke-width="0.287155"/>`);
  o.push(`<svg x="250.619" y="2.87155" width="44.7141" height="13.1271" viewBox="0 0 218 64" preserveAspectRatio="none"><path d="M42 0H218V46Q218 64 202 64H0Z" fill="#006cbf"/><path d="M42 0H83L40 64H0Z" fill="#a9e0f4"/><path d="M83 0H121L78 64H40Z" fill="#078fd2"/></svg>`);
  o.push(`<rect x="199.778" y="5.53798" width="0.348688" height="7.58909" fill="${navy}"/>`);
  o.push(`<svg x="277.515" y="4.10221" width="12.7169" height="10.0504" viewBox="0 0 70 55"><g fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M41 10V3M55 14L60 9M59 28H67M54 40L60 45M27 10L23 5"/><path d="M30 19A14 14 0 0 1 50 36"/><path d="M12 35C12 22 29 18 35 31C47 29 54 43 46 50H12C1 50 0 38 12 35Z"/></g></svg>`);
  const title = "Previsão de Tempo - " + (S.date ? fmtDateBR(S.date) : "data pendente");
  let ts = fitSize([title], 24.4195*PT, 182.343, 700);
  o.push(textBlock({lines:[title], x:11.6913+182.343/2, yTop:4.10221, h:11.2811, size:ts, weight:700, fill:navy, anchor:"middle"}));
  const region = S.texts.region || "";
  o.push(textBlock({lines:[region], x:204.905, yTop:5.33287, h:9.22997, size:fitSize([region],16.8611*PT,46,400), fill:navy}));

  /* ---- mapa ---- */
  o.push(`<g transform="translate(${MAP.x} ${MAP.y})"><g clip-path="url(#mapclip)">`);
  o.push(`<rect width="${MAP.w}" height="${MAP.h}" fill="#ffffff"/>`);
  const bg = activeBg();
  if (bg){
    const b = bg.bounds;
    o.push(`<image href="${bg.src}" xlink:href="${bg.src}" x="${f2((b.w-MAP.xmin)*K)}" y="${f2((MAP.ymax-b.n)*K)}" width="${f2((b.e-b.w)*K)}" height="${f2((b.n-b.s)*K)}" preserveAspectRatio="none" opacity="${bg.opacity ?? 1}"/>`);
  }
  o.push(`<path d="${GEO.states}" fill="none" stroke="#000" stroke-width="0.22" stroke-linejoin="round"/>`);
  if (!bg || S.opts.mgFill) o.push(`<path d="${GEO.mg}" fill="#ecf4f5" stroke="none"/>`);
  if (S.opts.mun) o.push(`<path d="${GEO.munLines}" fill="none" stroke="#c9d6dc" stroke-width="0.09" stroke-linejoin="round"/>`);
  if (S.opts.meso) o.push(`<path d="${GEO.mesoLines}" fill="none" stroke="#000" stroke-width="0.5" stroke-linejoin="round"/>`);
  o.push(`<path d="${GEO.mg}" fill="none" stroke="#000" stroke-width="0.6" stroke-linejoin="round"/>`);
  if (S.opts.states){
    for (const [n, lon, lat] of STATE_LABELS){
      const [x,y] = proj(lon, lat);
      const fz = n === "DF" ? 2.7 : 3.2;   // texto centralizado no ponto, na horizontal e na vertical
      o.push(`<text x="${f2(x-MAP.x)}" y="${f2(y-MAP.y + (ASC-DESC)/2*fz)}" font-family="${FONT}" font-size="${fz}" font-weight="700" fill="#2f3640" text-anchor="middle" stroke="#fff" stroke-width=".5" stroke-linejoin="round" paint-order="stroke">${esc(n)}</text>`);
    }
  }
  if (S.opts.mesoNames){
    for (const [n, lon, lat] of MESO_LABELS){
      const [x,y] = proj(lon, lat);
      const parts = n.length > 18 && n.includes("/") ? n.split("/").map((p,i,a)=> i<a.length-1 ? p+"/" : p) : n.length > 22 ? [n.slice(0,n.lastIndexOf(" ",n.length/2+4)), n.slice(n.lastIndexOf(" ",n.length/2+4)+1)] : [n];
      parts.forEach((p,i) => o.push(`<text x="${f2(x-MAP.x)}" y="${f2(y-MAP.y + (i-(parts.length-1)/2)*2.4 + 0.75)}" font-family="${FONT}" font-size="2.1" letter-spacing=".3" fill="#7f97b5" text-anchor="middle" stroke="#fff" stroke-width=".7" paint-order="stroke" stroke-linejoin="round">${esc(p)}</text>`));
    }
  }
  // ícones, nomes e temperaturas em camadas separadas: as temperaturas ficam sempre por cima
  const tsz = 10*PT, ns = S.opts.nameSize || 3.5;
  const L_ICON = [], L_NAME = [], L_TEMP = [];
  computeAuto();
  for (const r of S.rows){
    const c = CAT[r.tempo] || CAT[NONE];
    const [px, py] = finalXY(r);
    const x = px - MAP.x, y = py - MAP.y;
    const [w, h] = iconDims(c, S.opts.iconScale || 1);
    const [mx, mn] = shownTemps(r);
    L_ICON.push(`<g class="mk" data-id="${r.id}">` + (forExport ? "" : `<rect class="hit" x="${f2(x-w/2-1)}" y="${f2(y-h/2-1)}" width="${f2(w+2)}" height="${f2(h+2)}" rx="2" fill="transparent"/>`)
      + `<image href="${c.src}" xlink:href="${c.src}" x="${f2(x-w/2)}" y="${f2(y-h/2)}" width="${f2(w)}" height="${f2(h)}" preserveAspectRatio="xMidYMid meet"/></g>`);
    const nyTop = NAME_UP.has(r.id) ? y-h/2-0.3-(ASC+DESC)*ns : y+h/2+0.3;
    if (S.opts.names) L_NAME.push(`<g class="mk" data-id="${r.id}"><text x="${f2(x)}" y="${f2(nyTop+ASC*ns)}" font-family="${FONT}" font-size="${f2(ns)}" font-weight="700" fill="${navy}" text-anchor="middle" stroke="#fff" stroke-width="${f2(ns*0.3)}" stroke-linejoin="round" paint-order="stroke">${esc(r.name)}</text></g>`);
    const lab = (v, col, base) => `<text x="${f2(x+w/2+1.3)}" y="${f2(base)}" font-family="${FONT}" font-size="${f2(tsz)}" font-weight="700" fill="${col}" stroke="#fff" stroke-width="1.2" stroke-linejoin="round" paint-order="stroke">${esc(fmtTemp(v))}°C</text>`;
    // com as duas: máxima em cima e mínima embaixo; com uma só: centralizada ao lado do ícone
    const one = y + (ASC-DESC)/2*tsz, both = mx != null && mn != null;
    if (mx != null || mn != null) L_TEMP.push(`<g class="mk" data-id="${r.id}">` + (mx != null ? lab(mx, "#cc2029", both ? y + 0.4 - DESC*tsz : one) : "") + (mn != null ? lab(mn, "#1764bf", both ? y + 0.4 + ASC*tsz : one) : "") + `</g>`);
  }
  o.push(...L_ICON, ...L_NAME, ...L_TEMP);
  o.push(`</g>`);
  o.push(`<rect width="${MAP.w}" height="${MAP.h}" fill="none" stroke="rgb(86,123,154)" stroke-width="0.307666"/>`);
  o.push(`</g>`);
  // anotações da grade (1,5°, GMS, fora da moldura: esquerda e base)
  const gs = 8.43053*PT, gc = "rgb(39,71,129)";
  for (let lat = Math.ceil(MAP.ymin/1.5)*1.5; lat <= MAP.ymax; lat += 1.5){
    const [,y] = proj(MAP.xmin, lat);
    o.push(`<text transform="translate(${f2(MAP.x-2.46133)} ${f2(y)}) rotate(-90)" font-family="${FONT}" font-size="${f2(gs)}" fill="${gc}" text-anchor="middle">${dms(lat,"N","S")}</text>`);
  }
  for (let lon = Math.ceil(MAP.xmin/1.5)*1.5; lon <= MAP.xmax; lon += 1.5){
    const [x] = proj(lon, MAP.ymin);
    const lbl = dms(lon,"E","W"); if (x + textW(lbl, gs)/2 > PAGE.w - 0.5) continue;
    o.push(`<text x="${f2(x)}" y="${f2(MAP.y+MAP.h+2.46133+ASC*gs)}" font-family="${FONT}" font-size="${f2(gs)}" fill="${gc}" text-anchor="middle">${lbl}</text>`);
  }
  // seta norte
  o.push(`<svg x="19.3411" y="167.133" width="7.7942" height="9.08866" viewBox="0 0 61.06 96.62">${NORTH_ARROW}</svg>`);
  // escala gráfica (caixa simples, 2 × 50 km)
  { const seg = 8.35894, ss = 9*PT, bx = 11.6913+1+textW("0",ss)/2, by = 184.8, ly = by - 1.6 - DESC*ss;
    o.push(`<rect x="${f2(bx)}" y="${by}" width="${seg}" height="3" fill="#000" stroke="#000" stroke-width=".3"/>`);
    o.push(`<rect x="${f2(bx+seg)}" y="${by}" width="${seg}" height="3" fill="#fff" stroke="#000" stroke-width=".3"/>`);
    [["0",0],["50",seg],["100",2*seg]].forEach(([t,dx]) => o.push(`<text x="${f2(bx+dx)}" y="${f2(ly)}" font-family="${FONT}" font-size="${f2(ss)}" fill="#000" text-anchor="middle">${t}</text>`));
    o.push(`<text x="${f2(bx+2*seg+textW("100",ss)/2+1)}" y="${f2(ly)}" font-family="${FONT}" font-size="${f2(ss)}" fill="#000">km</text>`); }

  /* ---- legenda ---- */
  o.push(textBlock({lines:["Legenda"], x:230.723+55.5338/2, yTop:22.7706, h:6.78946, size:16*PT, weight:700, fill:navy, anchor:"middle"}));
  o.push(`<rect x="231.954" y="34.1727" width="55.9197" height="0.266644" fill="rgb(138,187,228)"/>`);
  { const cats = usedCats();
    // área da legenda: entre a linha abaixo do título e a linha da validade, centrada sob "Legenda"
    const top = 36.6, bottom = 157.8, cx = 230.723 + 55.5338/2, maxW = 61.5;
    const KEYF = 0.62, KEYGAP = 1.6;                 // linhas da chave de temperatura são mais baixas
    const KEYS = [];   // a legenda mostra só as condições do tempo (sem a chave de máxima/mínima)
    const units = Math.max(1, cats.length + KEYS.length*KEYF);
    const rh = Math.min(13.2, (bottom - top - (KEYS.length ? KEYGAP : 0))/units);
    const sym = Math.min(12, rh - 1.1), gap = 2.2;
    let fs = Math.min(10*PT, Math.max(2.3, rh*0.36));
    const labels = [...cats.map(c => c.label), ...KEYS.map(k => k[1])];
    fs = fitSize(labels, fs, maxW - sym - gap, 400);
    const blockW = sym + gap + Math.max(...labels.map(l => textW(l, fs)));
    const x0 = cx - blockW/2, tx0 = x0 + sym + gap;
    const LS = sym/16;                               // mesma proporção entre ícones usada no mapa
    let y = top;
    for (const c of cats){
      let [iw, ih] = iconDims(c, 1).map(v => v*LS);
      if (iw > sym){ ih *= sym/iw; iw = sym; } if (ih > sym){ iw *= sym/ih; ih = sym; }
      const cy = y + rh/2;
      o.push(`<image href="${c.src}" xlink:href="${c.src}" x="${f2(x0 + (sym-iw)/2)}" y="${f2(cy-ih/2)}" width="${f2(iw)}" height="${f2(ih)}"/>`);
      o.push(`<text x="${f2(tx0)}" y="${f2(cy + (ASC-DESC)/2*fs)}" font-family="${FONT}" font-size="${f2(fs)}" fill="#000">${esc(c.label)}</text>`);
      y += rh;
    }
    if (KEYS.length) y += KEYGAP;
    KEYS.forEach(([col, t]) => {
      const h = rh*KEYF, cy = y + h/2, by = cy + (ASC-DESC)/2*fs;
      o.push(`<text x="${f2(x0 + sym/2)}" y="${f2(cy + (ASC-DESC)/2*fs*1.15)}" font-family="${FONT}" font-size="${f2(fs*1.15)}" font-weight="700" fill="${col}" text-anchor="middle">°C</text>`);
      o.push(`<text x="${f2(tx0)}" y="${f2(by)}" font-family="${FONT}" font-size="${f2(fs)}" fill="#000">${t}</text>`);
      y += h;
    });
  }
  o.push(`<rect x="232.338" y="159.499" width="51.2776" height="0.256388" fill="rgb(138,187,228)"/>`);
  const vt = validityText(), val = vt || "Validade não informada";
  o.push(textBlock({lines:[val], x:223.857+67.7588/2, yTop:160.906, h:8.28892, size:fitSize([val],10*PT,67.7,400), fill: vt ? navy : "#8a97a8", anchor:"middle"}));
  o.push(`<rect x="232.338" y="170.345" width="51.2776" height="0.256388" fill="rgb(138,187,228)"/>`);
  const year = (S.date || todayISO()).slice(0,4);
  const cred = (S.texts.credits || "").replace(/\{ano\}/g, year).split("\n");
  o.push(textBlock({lines:cred, x:228.723+59.3284/2, yTop:172.909, h:13.3322, size:fitSize(cred,6.68628*PT,62,400), fill:navy, anchor:"middle"}));

  /* ---- rodapé ---- */
  [[4.30732,200.393,289.001,20.511,3.28177],[4.51243,200.598,288.59,20.1008,3.07666],[4.71754,200.803,288.18,19.6906,2.87155]]
    .forEach(([x,y,w,h,r]) => o.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="rgb(57,152,207)" fill-opacity=".02"/>`));
  o.push(`<rect x="4.92265" y="201.008" width="287.77" height="19.2804" rx="2.46133" fill="rgb(249,252,255)" stroke="rgb(135,196,239)" stroke-width="0.307666"/>`);
  for (const it of logoLayout()){
    if (it.sep != null){ o.push(`<rect x="${f2(it.sep)}" y="205.931" width="0.276899" height="10.0504" fill="rgb(32,153,234)"/>`); continue; }
    const {s, L, x, w, h} = it, cy = LOGO_Y + LOGO_H/2;
    if (L) o.push(`<image href="${L.src}" xlink:href="${L.src}" x="${f2(x)}" y="${f2(cy-h/2)}" width="${f2(w)}" height="${f2(h)}"/>`);
    else if (!forExport){
      o.push(`<rect x="${f2(x)}" y="${f2(cy-h/2)}" width="${f2(w)}" height="${f2(h)}" rx="1.2" fill="none" stroke="#b7cde2" stroke-width=".25" stroke-dasharray="1 .8"/>`);
      o.push(`<text x="${f2(x+w/2)}" y="${f2(cy+1)}" font-family="${FONT}" font-size="2.6" fill="#8fa8c2" text-anchor="middle">${esc(s.name)}</text>`);
    }
  }
  const foot = (S.texts.footer || "").split("\n");
  o.push(textBlock({lines:foot, x:200.624, yTop:203.265, h:15.1782, size:fitSize(foot, 9*PT, 91.5, 400), fill:navy}));
  o.push(`</svg>`);
  return o.join("");
}

/* ================= pré-visualização + arrastar ícones ================= */
const paper = $("#paper");
let drag = null, focusId = null, raf = 0;
function drawPreview(){
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    paper.innerHTML = renderSVG();
    if (focusId){
      const g = paper.querySelector(`.mk[data-id="${focusId}"] .hit`);
      if (g){ g.setAttribute("stroke", "#078fd2"); g.setAttribute("stroke-width", ".45"); g.setAttribute("stroke-dasharray", "1.2 .7"); }
    }
  });
}
function svgPoint(evt){
  const svg = paper.querySelector("svg"); const p = svg.createSVGPoint();
  p.x = evt.clientX; p.y = evt.clientY; return p.matrixTransform(svg.getScreenCTM().inverse());
}
paper.addEventListener("pointerdown", e => {
  const g = e.target.closest(".mk"); if (!g) return;
  const r = S.rows.find(r => r.id === g.dataset.id); if (!r) return;
  e.preventDefault();
  const p = svgPoint(e);
  const parts = [...paper.querySelectorAll(`.mk[data-id="${r.id}"]`)];
  const au = AUTO.get(r.id) || [0,0];
  const [cx0, cy0] = finalXY(r);
  drag = {r, g, parts, sx:p.x, sy:p.y, cx0, cy0, dx0:(r.dx||0)+au[0], dy0:(r.dy||0)+au[1], moved:false, last:[0,0]};
  parts.forEach(el => el.classList.add("drag")); paper.setPointerCapture(e.pointerId);
});
paper.addEventListener("pointermove", e => {
  if (!drag) return;
  const p = svgPoint(e); const ddx = p.x - drag.sx, ddy = p.y - drag.sy;
  if (!inMG(drag.cx0 + ddx, drag.cy0 + ddy)) return;   // fora de Minas Gerais: fica na última posição válida
  if (Math.hypot(ddx, ddy) > .4) drag.moved = true;
  drag.parts.forEach(el => el.setAttribute("transform", `translate(${ddx} ${ddy})`));
  drag.last = [ddx, ddy];
});
const endDrag = e => {
  if (!drag) return;
  const {r, moved} = drag;
  if (moved && drag.last){ r.dx = +(drag.dx0 + drag.last[0]).toFixed(2); r.dy = +(drag.dy0 + drag.last[1]).toFixed(2); persist(); renderRows(); }
  drag = null; focusRow(r.id, !moved); drawPreview();
};
paper.addEventListener("pointerup", endDrag);
paper.addEventListener("pointercancel", endDrag);

/* ================= seletor de condição com miniaturas ================= */
const pop = $("#pop"), popList = $("#popList"), popFilter = $("#popFilter");
let popCtx = null, popItems = [], popIdx = 0;
function condButton(value, onPick, label){
  const b = document.createElement("button");
  b.type = "button"; b.className = "cond-btn"; b.setAttribute("aria-haspopup", "listbox");
  const set = v => { const c = CAT[v] || CAT[NONE]; b.dataset.value = c.value;
    b.innerHTML = `<img alt="" src="${c.src}"><span>${esc(c.label)}</span><svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m6 9 6 6 6-6"/></svg>`;
    b.classList.toggle("unset", c.value === NONE);
    b.setAttribute("aria-label", (label ? label+": " : "") + c.label); };
  set(value); b.setValue = set;
  b.addEventListener("click", () => openPop(b, v => { set(v); onPick(v); }));
  b.addEventListener("keydown", e => { if (e.key === "ArrowDown" || e.key === "ArrowUp"){ e.preventDefault(); openPop(b, v => { set(v); onPick(v); }); } });
  return b;
}
function openPop(btn, pick){
  popCtx = {btn, pick}; popFilter.value = ""; fillPop();
  pop.hidden = false;
  const r = btn.getBoundingClientRect(), ph = Math.min(440, innerHeight*.7);
  let top = r.bottom + 4; if (top + ph > innerHeight - 8) top = Math.max(8, r.top - ph - 4);
  pop.style.top = top + "px"; pop.style.left = Math.max(8, Math.min(r.left, innerWidth - 348)) + "px";
  popFilter.focus();
}
function fillPop(){
  const q = norm(popFilter.value), cur = popCtx.btn.dataset.value;
  popItems = ICONS.filter(c => !q || norm(c.label).includes(q));
  popIdx = Math.max(0, popItems.findIndex(c => c.value === cur));
  popList.innerHTML = popItems.map((c,i) => `<li role="option" data-i="${i}" class="${c.value===cur?"cur":""}" aria-selected="${i===popIdx}"><img alt="" src="${c.src}">${esc(c.label)}</li>`).join("") || `<li aria-disabled="true">Nenhuma condição encontrada</li>`;
  scrollPop();
}
function scrollPop(){ [...popList.children].forEach((li,i) => li.setAttribute("aria-selected", i===popIdx)); popList.children[popIdx]?.scrollIntoView({block:"nearest"}); }
function closePop(focusBtn){ if (pop.hidden) return; pop.hidden = true; if (focusBtn) popCtx?.btn.focus(); popCtx = null; }
function choose(i){ const c = popItems[i]; if (!c) return; const ctx = popCtx; closePop(true); ctx.pick(c.value); }
popFilter.addEventListener("input", fillPop);
popFilter.addEventListener("keydown", e => {
  if (e.key === "ArrowDown"){ e.preventDefault(); popIdx = Math.min(popItems.length-1, popIdx+1); scrollPop(); }
  else if (e.key === "ArrowUp"){ e.preventDefault(); popIdx = Math.max(0, popIdx-1); scrollPop(); }
  else if (e.key === "Enter"){ e.preventDefault(); choose(popIdx); }
  else if (e.key === "Escape" || e.key === "Tab"){ e.preventDefault(); closePop(true); }
});
popList.addEventListener("click", e => { const li = e.target.closest("li[data-i]"); if (li) choose(+li.dataset.i); });
document.addEventListener("pointerdown", e => { if (!pop.hidden && !pop.contains(e.target) && !popCtx?.btn.contains(e.target)) closePop(false); });
addEventListener("resize", () => closePop(false));
document.addEventListener("scroll", e => { if (!pop.contains(e.target)) closePop(false); }, true);

/* ================= planilha ================= */
const rowsEl = $("#rows");
const ICON_X = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>`;
const ICON_POS = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>`;
function renderRows(){
  sortRows();
  rowsEl.innerHTML = "";
  for (const r of S.rows){
    const el = document.createElement("div"); el.className = "trow"; el.setAttribute("role","row"); el.dataset.id = r.id;
    const d0 = DEFAULT_OFFSET[r.name] || [0,0], moved = (r.dx||0) !== d0[0] || (r.dy||0) !== d0[1];
    el.innerHTML = `<span class="ck"><input type="checkbox" aria-label="Marcar ${esc(r.name)}"></span>
      <div class="name" role="cell">${esc(r.name)}${moved ? `<small>posição ajustada</small>` : ""}</div>
      <div class="cond" role="cell"></div>
      <div class="wmx" role="cell"><input class="field t mx" inputmode="decimal" aria-label="Máxima em °C, ${esc(r.name)}" value="${esc(r.tmax)}"></div>
      <div class="wmn" role="cell"><input class="field t mn" inputmode="decimal" aria-label="Mínima em °C, ${esc(r.name)}" value="${esc(r.tmin)}"></div>
      <div class="rowacts" role="cell"><button class="icobtn pos" type="button" title="Restaurar posição do ícone" aria-label="Restaurar posição do ícone de ${esc(r.name)}" ${moved?"":"hidden"}>${ICON_POS}</button><button class="icobtn del" type="button" title="Remover município" aria-label="Remover ${esc(r.name)}">${ICON_X}</button></div>
      <div class="err" aria-live="polite"></div>`;
    el.querySelector(".cond").append(condButton(r.tempo, v => { r.tempo = v; changed(r); }, r.name));
    const [imx, imn] = el.querySelectorAll("input.t");
    imx.addEventListener("input", () => { r.tmax = imx.value; changed(r); });
    imn.addEventListener("input", () => { r.tmin = imn.value; changed(r); });
    el.addEventListener("focusin", () => { if (focusId !== r.id){ focusId = r.id; drawPreview(); } });
    el.querySelector(".pos").addEventListener("click", () => { [r.dx, r.dy] = DEFAULT_OFFSET[r.name] || [0, 0]; persist(); renderRows(); drawPreview(); });
    el.querySelector(".del").addEventListener("click", () => {
      S.rows = S.rows.filter(x => x !== r); persist(); renderRows(); drawPreview(); updateNotice();
      showMsg("info", `${esc(r.name)} removido. <button class="btn small ghost" id="undoDel" type="button">Desfazer</button>`);
      $("#undoDel")?.addEventListener("click", () => { S.rows.push(r); persist(); renderRows(); drawPreview(); updateNotice(); hideMsg(); });
    });
    rowsEl.append(el);
    showRowErrors(r, el, false);
  }
  syncCkAll();
}
function showRowErrors(r, el, strictExport){
  el = el || rowsEl.querySelector(`.trow[data-id="${r.id}"]`); if (!el) return true;
  const {e, mx, mn} = checkRow(r);
  if (strictExport && r.tempo !== NONE){
    if (useMax() && mx == null && !e.tmax) e.tmax = "Informe a máxima para exportar.";
    if (useMin() && mn == null && !e.tmin) e.tmin = "Informe a mínima para exportar.";
  }
  const [imx, imn] = el.querySelectorAll("input.t");
  imx.setAttribute("aria-invalid", !!e.tmax); imn.setAttribute("aria-invalid", !!e.tmin);
  el.querySelector(".err").textContent = [e.tempo, e.tmax && "Máxima: "+e.tmax, e.tmin && "Mínima: "+e.tmin].filter(Boolean).join(" ");
  return !Object.keys(e).length;
}
function changed(r){ if (r) showRowErrors(r); persist(); drawPreview(); }
function focusRow(id, flash){
  focusId = id;
  const el = rowsEl.querySelector(`.trow[data-id="${id}"]`); if (!el) return;
  if (flash){ el.scrollIntoView({block:"center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"});
    el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
    el.querySelector(".cond-btn")?.focus({preventScroll:true}); }
}
const checkedRows = () => [...rowsEl.querySelectorAll(".trow")].filter(el => el.querySelector(".ck input").checked).map(el => S.rows.find(r => r.id === el.dataset.id));
function syncCkAll(){ const all = rowsEl.querySelectorAll(".ck input"), on = [...all].filter(c => c.checked).length; const ck = $("#ckAll"); ck.checked = all.length && on === all.length; ck.indeterminate = on > 0 && on < all.length; }
rowsEl.addEventListener("change", e => { if (e.target.matches(".ck input")) syncCkAll(); });
$("#ckAll").addEventListener("change", e => { rowsEl.querySelectorAll(".ck input").forEach(c => c.checked = e.target.checked); });

let bulkValue = "céu claro";
$("#bulkCond").append(condButton(bulkValue, v => bulkValue = v, "Condição para aplicar em lote"));
$("#btnApply").addEventListener("click", () => {
  const sel = checkedRows();
  if (!sel.length){ showMsg("info", "Marque os municípios na primeira coluna (ou use “marcar todos” no cabeçalho)."); return; }
  sel.forEach(r => r.tempo = bulkValue);
  persist(); renderRows(); drawPreview(); hideMsg();
});
$("#btnClear").addEventListener("click", () => {
  const snap = JSON.stringify({rows:S.rows, val:S.val});
  S.rows.forEach(r => { r.tempo = NONE; r.tmax = ""; r.tmin = ""; }); S.val = {time:"10:00", date:addDays(S.date,1), auto:true}; fillVal();
  persist(); renderRows(); drawPreview();
  showMsg("info", `Preenchimento limpo. <button class="btn small ghost" id="undoClr" type="button">Desfazer</button>`);
  $("#undoClr")?.addEventListener("click", () => { const o = JSON.parse(snap); S.rows = o.rows; S.val = o.val; fillVal(); persist(); renderRows(); drawPreview(); hideMsg(); });
});
$("#munList").innerHTML = GEO.mun.map(m => `<option value="${esc(m[0])}">`).join("");
function addMun(){
  const inp = $("#addName"); const name = MUN_NORM.get(norm(inp.value));
  if (!name){ showMsg("err", "Município não encontrado em Minas Gerais. Escolha um nome da lista."); inp.focus(); return; }
  if (S.rows.some(r => r.name === name)){ showMsg("info", `${esc(name)} já está na lista.`); focusRow(S.rows.find(r=>r.name===name).id, true); return; }
  const r = makeRow(name); S.rows.push(r); inp.value = "";
  persist(); renderRows(); drawPreview(); hideMsg(); updateNotice(); focusRow(r.id, true);
}
$("#btnAdd").addEventListener("click", addMun);
$("#btnBase").addEventListener("click", () => {
  const snap = S.rows.slice(), old = new Map(S.rows.map(r => [r.name, r]));
  S.rows = START_MUN.map(n => old.get(n) || makeRow(n));
  persist(); renderRows(); drawPreview();
  showMsg("info", `Lista base restaurada (${START_MUN.length} municípios). <button class="btn small ghost" id="undoBase" type="button">Desfazer</button>`);
  $("#undoBase")?.addEventListener("click", () => { S.rows = snap; persist(); renderRows(); drawPreview(); hideMsg(); });
});
$("#addName").addEventListener("keydown", e => { if (e.key === "Enter"){ e.preventDefault(); addMun(); } });

/* ================= escolha das temperaturas ================= */
function applyTempsUI(){
  const t = S.opts.temps || "both";
  document.querySelectorAll("[data-temps]").forEach(b => { const on = b.dataset.temps === t; b.setAttribute("aria-checked", on); b.tabIndex = on ? 0 : -1; });
  const sh = $(".sheet"); sh.classList.toggle("no-max", t === "min"); sh.classList.toggle("no-min", t === "max");
}
function setTemps(t){
  S.opts.temps = t; applyTempsUI();
  S.rows.forEach(r => showRowErrors(r)); persist(); drawPreview();
}
document.querySelectorAll("[data-temps]").forEach(b => {
  b.addEventListener("click", () => setTemps(b.dataset.temps));
  b.addEventListener("keydown", e => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return; e.preventDefault();
    const order = ["both","max","min"], i = order.indexOf(S.opts.temps || "both");
    const n = order[(i + (e.key === "ArrowRight" ? 1 : 2)) % 3]; setTemps(n); document.querySelector(`[data-temps="${n}"]`).focus();
  });
});

/* ================= data, validade, textos, opções ================= */
const dateEl = $("#date"), vTimeEl = $("#valTime"), vDateEl = $("#valDate");
function fillVal(){ vTimeEl.value = S.val.time || ""; vDateEl.value = S.val.date || ""; }
dateEl.value = S.date; fillVal();
dateEl.addEventListener("input", () => {
  S.date = dateEl.value; dateEl.setAttribute("aria-invalid", !S.date);
  if (S.val.auto && S.date){ S.val.date = addDays(S.date, 1); fillVal(); } // validade acompanha a data até ser alterada à mão
  persist(); drawPreview();
});
vTimeEl.addEventListener("input", () => { S.val.time = vTimeEl.value; persist(); drawPreview(); });
vDateEl.addEventListener("input", () => { S.val.date = vDateEl.value; S.val.auto = vDateEl.value === addDays(S.date, 1); persist(); drawPreview(); });
const tx = {region:$("#txRegion"), footer:$("#txFooter"), credits:$("#txCredits")};
function fillTexts(){ for (const k in tx) tx[k].value = S.texts[k]; }
for (const k in tx) tx[k].addEventListener("input", () => { S.texts[k] = tx[k].value; persist(); drawPreview(); });
$("#btnTxReset").addEventListener("click", () => { S.texts = {...DEFAULT_TEXTS}; fillTexts(); persist(); drawPreview(); });
const op = {mun:$("#opMun"), meso:$("#opMeso"), mesoNames:$("#opMesoNames"), states:$("#opStates"), names:$("#opNames"), autoSpread:$("#opAuto")};
op.mgFill = $("#opMgFill");
const rng = {iconScale:[$("#opIconScale"), $("#outIconScale"), v => Math.round(v*100)+"%"], nameSize:[$("#opNameSize"), $("#outNameSize"), v => (v/PT).toFixed(0)+" pt"]};
function fillOpts(){ for (const k in op) op[k].checked = !!S.opts[k]; for (const k in rng){ rng[k][0].value = S.opts[k]; rng[k][1].textContent = rng[k][2](S.opts[k]); }
  $("#szOut").textContent = Math.round((S.opts.iconScale||1)*100) + "%"; }
function stepIcons(d){ S.opts.iconScale = Math.round(Math.min(1.6, Math.max(0.6, (S.opts.iconScale||1) + d))*100)/100; fillOpts(); persist(); drawPreview(); }
$("#szMinus").addEventListener("click", () => stepIcons(-0.05));
$("#szPlus").addEventListener("click", () => stepIcons(0.05));
for (const k in op) op[k].addEventListener("change", () => { S.opts[k] = op[k].checked; persist(); drawPreview(); });
for (const k in rng) rng[k][0].addEventListener("input", () => { S.opts[k] = +rng[k][0].value; fillOpts(); persist(); drawPreview(); });
$("#btnPosReset").addEventListener("click", () => { S.rows.forEach(r => { [r.dx, r.dy] = DEFAULT_OFFSET[r.name] || [0, 0]; }); persist(); renderRows(); drawPreview(); });

function updateNotice(){}

/* ================= logotipos ================= */
/* ================= mapa de fundo (guardado no IndexedDB do navegador) ================= */
let BG = [];
const idb = (() => {
  let p = null;
  const open = () => p ||= new Promise((res, rej) => { try { const r = indexedDB.open("prevmg", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("bg", {keyPath:"id"}); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch(e){ rej(e); } });
  const tx = (mode, fn) => open().then(db => new Promise((res, rej) => { const t = db.transaction("bg", mode); const st = t.objectStore("bg"); const out = fn(st);
    t.oncomplete = () => res(out && out.result); t.onerror = () => rej(t.error); }));
  return { all: () => tx("readonly", st => st.getAll()), put: v => tx("readwrite", st => st.put(v)), del: id => tx("readwrite", st => st.delete(id)) };
})();
const activeBg = () => BG.find(b => b.id === S.bgActive) || null;
const fullExtent = () => ({w:+MAP.xmin.toFixed(5), e:+MAP.xmax.toFixed(5), s:+MAP.ymin.toFixed(5), n:+MAP.ymax.toFixed(5)});
function parseWorld(text, w, h){
  const v = text.trim().split(/\s+/).map(Number);
  if (v.length < 6 || v.some(x => !isFinite(x))) return null;
  const [A, D, B, E, C, F] = v;
  if (Math.abs(D) > 1e-12 || Math.abs(B) > 1e-12) return {rot:true};
  const west = C - A/2, north = F - E/2;
  return {w:west, e:west + A*w, n:north, s:north + E*h};
}
function renderBg(){
  const list = $("#bgList");
  $("#bgCount").textContent = S.bgActive && activeBg() ? "ativo" : "";
  const row = (id, name, thumb) => `<label class="b"><input type="radio" name="bgsel" value="${id}" ${(S.bgActive||"") === id ? "checked" : ""}>${thumb ? `<img alt="" src="${thumb}">` : ""}<span>${esc(name)}</span>${id ? `<button class="icobtn" type="button" data-bgdel="${id}" aria-label="Excluir ${esc(name)}" title="Excluir">${ICON_X}</button>` : ""}</label>`;
  list.innerHTML = row("", "Nenhum (somente limites do IBGE)") + BG.map(b => row(b.id, b.name, b.src)).join("");
  const b = activeBg(); $("#bgCfg").hidden = !b;
  if (b){ $("#bgW").value = b.bounds.w; $("#bgE").value = b.bounds.e; $("#bgS").value = b.bounds.s; $("#bgN").value = b.bounds.n; $("#bgOp").value = b.opacity ?? 1; $("#outBgOp").textContent = Math.round((b.opacity ?? 1)*100) + "%"; }
}
$("#bgList").addEventListener("change", e => {
  if (e.target.name !== "bgsel") return;
  const had = !!activeBg(); S.bgActive = e.target.value || null;
  if (S.bgActive && !had){ S.opts.mgFill = false; }   // ao ligar um fundo, deixa-o visível dentro de MG
  if (!S.bgActive){ S.opts.mgFill = true; }
  fillOpts(); persist(); renderBg(); drawPreview();
});
$("#bgList").addEventListener("click", e => {
  const d = e.target.closest("[data-bgdel]"); if (!d) return; e.preventDefault();
  const id = d.dataset.bgdel; BG = BG.filter(b => b.id !== id); idb.del(id).catch(() => {});
  if (S.bgActive === id){ S.bgActive = null; S.opts.mgFill = true; fillOpts(); persist(); }
  renderBg(); drawPreview();
});
let bgSaveT = null;
function bgChanged(){ drawPreview(); clearTimeout(bgSaveT); const b = activeBg(); bgSaveT = setTimeout(() => b && idb.put(b).catch(() => {}), 400); }
["bgW","bgE","bgS","bgN"].forEach(id => $("#"+id).addEventListener("input", () => {
  const b = activeBg(); if (!b) return;
  const nb = {w:+$("#bgW").value, e:+$("#bgE").value, s:+$("#bgS").value, n:+$("#bgN").value};
  if ([nb.w,nb.e,nb.s,nb.n].every(isFinite) && nb.e > nb.w && nb.n > nb.s){ b.bounds = nb; bgChanged(); }
}));
$("#bgFit").addEventListener("click", () => { const b = activeBg(); if (!b) return; b.bounds = fullExtent(); renderBg(); bgChanged(); });
$("#bgOp").addEventListener("input", () => { const b = activeBg(); if (!b) return; b.opacity = +$("#bgOp").value; $("#outBgOp").textContent = Math.round(b.opacity*100) + "%"; bgChanged(); });
const readImg = file => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = fr.result; }; fr.onerror = rej; fr.readAsDataURL(file); });
$("#bgIn").addEventListener("change", async e => {
  const files = [...e.target.files]; e.target.value = "";
  const imgs = files.filter(f => /^image\//.test(f.type) || /\.(png|jpe?g|webp)$/i.test(f.name));
  const worlds = files.filter(f => /\.(pgw|jgw|wld|pngw|jpgw|wpw)$/i.test(f.name));
  if (files.some(f => /\.tiff?$/i.test(f.name))){ showMsg("err", "GeoTIFF não é lido no navegador. No QGIS, exporte o mapa como PNG ou JPG (com arquivo de georreferência) e envie de novo."); return; }
  if (!imgs.length){ showMsg("err", "Envie uma imagem PNG, JPG ou WebP (o arquivo de georreferência vai junto, na mesma seleção)."); return; }
  for (const f of imgs){
    try {
      const img = await readImg(f);
      const W0 = img.naturalWidth, H0 = img.naturalHeight, sc = Math.min(1, 4000/Math.max(W0, H0));
      const c = document.createElement("canvas"); c.width = Math.round(W0*sc); c.height = Math.round(H0*sc);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const src = /png|webp/i.test(f.type) ? c.toDataURL("image/png") : c.toDataURL("image/jpeg", 0.9);
      const base = f.name.replace(/\.[^.]+$/, "");
      const wf = worlds.find(w => w.name.replace(/\.[^.]+$/, "") === base) || (imgs.length === 1 ? worlds[0] : null);
      let bounds = fullExtent(), note = "Encaixado na extensão do mapa; ajuste os limites se necessário.";
      if (wf){ const r = parseWorld(await wf.text(), W0, H0);
        if (r && !r.rot){ bounds = r; note = "Posição lida do arquivo de georreferência."; }
        else note = r && r.rot ? "O arquivo de georreferência tem rotação, que não é suportada; a imagem foi encaixada na extensão do mapa." : "Não foi possível ler o arquivo de georreferência; a imagem foi encaixada na extensão do mapa."; }
      if (wf && (Math.abs(bounds.w) > 180 || Math.abs(bounds.n) > 90)) { bounds = fullExtent(); note = "As coordenadas do arquivo de georreferência não estão em graus (talvez UTM). Exporte em latitude/longitude; por ora a imagem foi encaixada na extensão do mapa."; }
      const b = {id: "bg" + Date.now().toString(36) + Math.random().toString(36).slice(2,6), name: f.name, src, bounds, opacity: 1};
      BG.push(b); const had = !!activeBg(); S.bgActive = b.id; if (!had) S.opts.mgFill = false;
      try { await idb.put(b); } catch(err){ note += " Atenção: o navegador não guardou a imagem; ela some ao recarregar a página."; }
      fillOpts(); persist(); renderBg(); drawPreview(); $("#secBg").open = true;
      showMsg("ok", `Mapa de fundo “${esc(f.name)}” aplicado. ${note}`);
    } catch(err){ showMsg("err", `Não foi possível abrir “${esc(f.name)}”.`); }
  }
});

/* ================= histórico / salvar ================= */
function packRows(){ return S.rows.map(({id, ...r}) => r); }
function validateAll(strict){
  let ok = true, bad = [];
  for (const r of S.rows){ if (!showRowErrors(r, null, strict)){ ok = false; bad.push(r.name); } }
  return {ok, bad};
}
$("#btnSave").addEventListener("click", () => {
  if (!S.date){ dateEl.setAttribute("aria-invalid", "true"); dateEl.focus(); showMsg("err", "Escolha a data da previsão antes de salvar."); return; }
  const {ok, bad} = validateAll(false);
  if (!ok){ showMsg("err", `Corrija os valores destacados: ${bad.map(esc).join(", ")}.`); focusRow(S.rows.find(r => r.name === bad[0]).id, true); return; }
  S.savedSig = sig(); persist(); flush();
  showMsg("ok", `Previsão de ${fmtDateBR(S.date)} salva neste navegador.`);
});
function applyData(o){
  if (o.date) S.date = o.date;
  S.val = o.val || parseValidity(o.validity) || {time:"10:00", date:addDays(S.date,1), auto:true};
  if (Array.isArray(o.rows)){
    S.rows = o.rows.filter(r => r && MUN.has(r.name)).map(r => ({...makeRow(r.name), ...r, id:"r"+(++uid), tempo: CAT[r.tempo] ? r.tempo : NONE, tmax: r.tmax==null ? "" : String(r.tmax), tmin: r.tmin==null ? "" : String(r.tmin)}));
  }
  if (o.texts) S.texts = {...DEFAULT_TEXTS, ...o.texts};
  if (o.opts) S.opts = {...S.opts, ...o.opts}; applyTempsUI();
  dateEl.value = S.date; fillVal(); fillTexts(); fillOpts();
  renderRows(); drawPreview(); updateNotice();
}

/* ================= mensagens e status ================= */
const msg = $("#msg");
function showMsg(kind, html){ msg.className = "msg " + kind; msg.innerHTML = html; msg.hidden = false; }
function hideMsg(){ msg.hidden = true; }
function updateStatus(){
  const st = $("#status"), t = $("#statusText");
  const saved = S.savedSig && S.savedSig === sig();
  st.className = "status " + (saved ? "saved" : "dirty");
  t.textContent = saved ? `Previsão de ${fmtDateBR(S.date)} salva neste navegador.` : "Alterações guardadas automaticamente neste navegador.";
}
function ask(title, html, buttons){
  return new Promise(res => {
    const d = $("#dlg"); $("#dlgT").textContent = title; $("#dlgB").innerHTML = html;
    const r = $("#dlgR"); r.innerHTML = "";
    buttons.forEach(([label, val, cls]) => { const b = document.createElement("button"); b.type = "button"; b.className = "btn " + (cls||""); b.textContent = label; b.onclick = () => { d.close(); res(val); }; r.append(b); });
    d.onclose = () => res(null); d.showModal();
  });
}

/* ================= exportação ================= */
const dlPromise = (window.claude && typeof window.claude.use === "function") ? window.claude.use("downloads").catch(() => null) : Promise.resolve(undefined);
async function saveFile(filename, blob){
  const dl = await dlPromise;
  if (dl === undefined){ // página aberta fora do claude.ai: download direto
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; document.body.append(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); return true;
  }
  if (!dl){ showMsg("err", "Esta visualização não permite baixar arquivos. Abra o artefato pelo link em uma aba própria do navegador."); return false; }
  try { await dl.save({filename, data: blob}); return true; }
  catch(e){
    if (e && e.code === "declined") return false;
    if (e && e.code === "rate_limited"){ showMsg("info", "Já existe um pedido de download aberto. Confirme ou feche-o e tente de novo."); return false; }
    showMsg("err", "Não foi possível salvar o arquivo (" + esc(e && e.message || "erro") + ")."); return false;
  }
}
async function preflight(){
  if (!S.date){ dateEl.setAttribute("aria-invalid","true"); dateEl.focus(); showMsg("err", "Escolha a data da previsão antes de exportar."); return false; }
  const {ok, bad} = validateAll(true);
  if (!ok){ const need = useMax() && useMin() ? "máxima e mínima válidas" : useMax() ? "máxima válida" : "mínima válida";
    showMsg("err", `Para exportar, cada município precisa de ${need} (exceto “Sem informação”). Revise: ${bad.map(esc).join(", ")}.`); focusRow(S.rows.find(r => r.name === bad[0]).id, true); return false; }
  hideMsg();
  const issues = [];
  const miss = LOGO_SLOTS.filter(s => !logoOf(s.key)).map(s => s.name);
  if (miss.length) issues.push(`Logotipos ausentes: ${miss.join(", ")}.`);
  if (!validityText()) issues.push("Validade não informada (preencha a hora e a data).");
  const none = S.rows.filter(r => r.tempo === NONE).length;
  if (none) issues.push(`${none} município${none>1?"s":""} com “Sem informação”.`);
  if (!issues.length) return true;
  const go = await ask("Conferir antes de exportar", `<ul style="margin:0;padding-left:18px">${issues.map(i => `<li>${esc(i)}</li>`).join("")}</ul>`, [["Voltar e completar", false, "ghost"], ["Exportar assim mesmo", true, "primary"]]);
  return !!go;
}
function svgToCanvas(dpi){
  return new Promise((res, rej) => {
    const svg = renderSVG({forExport:true});
    const W = Math.round(PAGE.w/25.4*dpi), H = Math.round(PAGE.h/25.4*dpi);
    const img = new Image();
    img.onload = () => { const c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d");
      g.fillStyle = "#f7fcff"; g.fillRect(0,0,W,H); g.drawImage(img, 0, 0, W, H); res(c); };
    img.onerror = () => rej(new Error("render"));
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.replace(`width="${PAGE.w}mm" height="${PAGE.h}mm"`, `width="${W}" height="${H}"`));
  });
}
// grava 300 dpi no PNG (bloco pHYs) para o arquivo abrir no tamanho físico correto
function crc32(buf){ let c, crc = 0xFFFFFFFF; for (let n = 0; n < buf.length; n++){ c = (crc ^ buf[n]) & 0xFF; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xFFFFFFFF) >>> 0; }
async function withDpi(blob, dpi){
  const src = new Uint8Array(await blob.arrayBuffer());
  const ppm = Math.round(dpi/0.0254);
  const chunk = new Uint8Array(21); const dv = new DataView(chunk.buffer);
  dv.setUint32(0, 9); chunk.set([0x70,0x48,0x59,0x73], 4); dv.setUint32(8, ppm); dv.setUint32(12, ppm); chunk[16] = 1;
  dv.setUint32(17, crc32(chunk.subarray(4, 17)));
  const at = 33; // após a assinatura (8) e o IHDR (25)
  const out = new Uint8Array(src.length + 21); out.set(src.subarray(0, at)); out.set(chunk, at); out.set(src.subarray(at), at + 21);
  return new Blob([out], {type:"image/png"});
}
async function busy(btn, fn){ btn.classList.add("busy"); try { await fn(); } finally { btn.classList.remove("busy"); } }
$("#btnPng").addEventListener("click", e => busy(e.currentTarget, async () => {
  if (!await preflight()) return;
  try {
    const c = await svgToCanvas(300);
    const blob = await withDpi(await new Promise(r => c.toBlob(r, "image/png")), 300);
    if (await saveFile(`previsao_${S.date}.png`, blob)) showMsg("ok", `PNG de ${fmtDateBR(S.date)} gerado (3508 × 2631 px, 300 dpi).`);
  } catch(err){ showMsg("err", "O navegador não conseguiu gerar a imagem. Tente novamente ou use o SVG."); }
}));
$("#btnSvg").addEventListener("click", e => busy(e.currentTarget, async () => {
  if (!await preflight()) return;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n` + renderSVG({forExport:true});
  if (await saveFile(`previsao_${S.date}.svg`, new Blob([svg], {type:"image/svg+xml"}))) showMsg("ok", "SVG gerado (vetorial, abre no Inkscape ou Illustrator).");
}));
// jsPDF vem embutido na página (funciona também na cópia salva no computador, sem internet)
function loadJsPdf(){ return window.jspdf && window.jspdf.jsPDF ? Promise.resolve(window.jspdf.jsPDF) : Promise.reject(new Error("jspdf")); }
$("#btnPdf").addEventListener("click", e => busy(e.currentTarget, async () => {
  if (!await preflight()) return;
  try {
    const [JsPDF, c] = await Promise.all([loadJsPdf(), svgToCanvas(300)]);
    const pdf = new JsPDF({orientation:"landscape", unit:"mm", format:[PAGE.w, PAGE.h], compress:true});
    pdf.addImage(c.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, PAGE.w, PAGE.h, undefined, "FAST");
    pdf.setProperties({title:`Previsão de Tempo - ${fmtDateBR(S.date)}`});
    if (await saveFile(`previsao_${S.date}.pdf`, pdf.output("blob"))) showMsg("ok", "PDF gerado no tamanho do layout (297 × 222,75 mm).");
  } catch(err){ showMsg("err", "Não foi possível gerar o PDF agora. Tente de novo ou exporte o PNG."); }
}));


/* ================= boletim em PDF (A4 retrato) ================= */
const A4 = {w:210, h:297, ml:25, mr:25, mt:12, mb:14};
const MESES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
const longDate = iso => { if (!iso) return ""; const [y,m,d] = iso.split("-"); return `${d} de ${MESES[+m-1]} de ${y}`; };
function bulDate(){ return S.bul.dateAuto ? longDate(S.date) : S.bul.dateText; }
function bulVal(){
  if (!S.bul.valAuto) return S.bul.valText;
  const v = S.val; if (!v || !v.time || !v.date) return "";
  const [, m, d] = v.date.split("-");
  return `válida até às ${v.time}hrs LT do dia ${d}/${m}.`;
}
function joinPt(list){ return list.length < 2 ? (list[0] || "") : list.slice(0,-1).join(", ") + " e " + list[list.length-1]; }
function bulObs(){
  if (!S.bul.obsAuto) return S.bul.obsText;
  const names = S.rows.map(r => r.name).sort((a,b) => a.localeCompare(b, "pt-BR", {sensitivity:"base"}));
  return `Localização aproximada, para termos de referência, das cidades: ${joinPt(names)}.`;
}
// caracteres fora do conjunto das fontes-padrão do PDF (Times) são trocados por equivalentes
const pdfSafe = t => String(t || "").replace(/[\u2009\u202F\u00A0]/g, " ").replace(/[\u2010\u2011\u2012]/g, "-").replace(/\u2212/g, "-").replace(/\r/g, "");

// medidas de texto com as mesmas métricas que o PDF usa (Times do jsPDF)
let _mdoc = null;
function measurer(){
  if (!_mdoc && window.jspdf) _mdoc = new window.jspdf.jsPDF({unit:"mm", format:"a4"});
  return (txt, pt, bold) => {
    if (_mdoc){ _mdoc.setFont("times", bold ? "bold" : "normal"); _mdoc.setFontSize(pt); return _mdoc.getTextWidth(txt); }
    measureCtx.font = `${bold ? 700 : 400} 100px "Times New Roman", Times, serif`; return measureCtx.measureText(txt).width * pt*PT / 100;
  };
}
// quebra em linhas e justifica; tokens = [{t, b}] (b = negrito)
function wrapTokens(tokens, width, pt, indent, M){
  const sp = M(" ", pt, false), lines = []; let cur = [], w = 0, first = true;
  const avail = () => width - (first ? indent : 0);
  for (const tk of tokens){
    const tw = M(tk.t, pt, tk.b);
    if (cur.length && w + sp + tw > avail()){ lines.push({words:cur, indent: first ? indent : 0, last:false}); cur = []; w = 0; first = false; }
    w += (cur.length ? sp : 0) + tw; cur.push({...tk, w:tw});
  }
  if (cur.length) lines.push({words:cur, indent: first ? indent : 0, last:true});
  return {lines, sp};
}
function layoutBulletin(){
  const M = measurer();
  const W = A4.w - A4.ml - A4.mr, pages = [[]];
  let y = A4.mt, pg = pages[0];
  const newPage = () => { pg = []; pages.push(pg); y = A4.mt + 4; };
  const room = h => { if (y + h > A4.h - A4.mb){ newPage(); } };
  const textC = (t, pt, bold, lead) => { t = pdfSafe(t); if (!t) return; room(lead); y += lead;
    pg.push({k:"t", t, x: A4.w/2 - M(t, pt, bold)/2, y: y - lead*0.22, pt, b:bold}); };
  const para = (text, pt, lead, indent, prefix) => {
    const words = pdfSafe(text).split(/\s+/).filter(Boolean).map(t => ({t, b:false}));
    if (prefix) words.unshift({t:prefix, b:true});
    if (!words.length) return;
    const {lines, sp} = wrapTokens(words, W, pt, indent, M);
    for (const ln of lines){
      room(lead); y += lead;
      const x0 = A4.ml + ln.indent, sum = ln.words.reduce((a, w) => a + w.w, 0);
      const gap = (!ln.last && ln.words.length > 1) ? (W - ln.indent - sum)/(ln.words.length - 1) : sp;
      let x = x0;
      for (const w of ln.words){ pg.push({k:"t", t:w.t, x, y: y - lead*0.25, pt, b:w.b}); x += w.w + gap; }
    }
  };
  // cabeçalho com logotipos
  const L1 = DEFAULT_LOGOS.igam, L2 = DEFAULT_LOGOS.simge;
  const h1 = 15, w1 = h1*L1.w/L1.h, h2 = 12.5, w2 = h2*L2.w/L2.h;
  pg.push({k:"img", src:L1.src, x:A4.ml - 2, y:A4.mt + 2, w:w1, h:h1});
  pg.push({k:"img", src:L2.src, x:A4.w - A4.mr - w2 + 2, y:A4.mt + 2 + (h1-h2)/2, w:w2, h:h2});
  y = A4.mt + h1 + 9;
  textC(S.bul.title, 13, true, 6.2);
  y += 1.6; textC(bulDate(), 13, true, 6.2);
  y += 1.2; textC(bulVal(), 11, true, 5.6);
  y += 5;
  const paras = S.bul.paras.map(t => t.trim()).filter(Boolean);
  paras.forEach((t, i) => { para(t, 11, 5.3, 12.5); if (i < paras.length-1) y += 3.6; });
  // mapa do dia (layout completo)
  const mw = W + 8, mh = mw * PAGE.h / PAGE.w;
  y += 6; if (y + mh > A4.h - A4.mb) newPage();
  pg.push({k:"map", x:(A4.w - mw)/2, y, w:mw, h:mh}); y += mh + 2.5;
  // observação
  para(bulObs(), 8.5, 3.9, 0, "OBS:");
  return pages;
}
const SERIF = "'Times New Roman', Times, 'Liberation Serif', serif";
function renderBulletinSVG(page){
  const o = [`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${A4.w} ${A4.h}"><rect width="${A4.w}" height="${A4.h}" fill="#fff"/>`];
  for (const it of page){
    if (it.k === "img") o.push(`<image href="${it.src}" xlink:href="${it.src}" x="${f2(it.x)}" y="${f2(it.y)}" width="${f2(it.w)}" height="${f2(it.h)}"/>`);
    else if (it.k === "map"){
      const m = renderSVG({forExport:true}).replace(/mapclip/g, "mapclipB")
        .replace(`width="${PAGE.w}mm" height="${PAGE.h}mm"`, `x="${f2(it.x)}" y="${f2(it.y)}" width="${f2(it.w)}" height="${f2(it.h)}"`);
      o.push(m);
    } else o.push(`<text x="${f2(it.x)}" y="${f2(it.y)}" font-family="${SERIF}" font-size="${f2(it.pt*PT)}" font-weight="${it.b?700:400}" fill="#000">${esc(it.t)}</text>`);
  }
  o.push(`</svg>`); return o.join("");
}
let bulT = 0;
function drawBulletin(){
  if ($("#viewBul").hidden) return;
  clearTimeout(bulT);
  bulT = setTimeout(() => {
    const pages = layoutBulletin();
    $("#bPages").innerHTML = pages.map((p, i) => `<div class="a4" aria-label="Página ${i+1}">${renderBulletinSVG(p)}</div>${pages.length > 1 ? `<div class="pgnum">Página ${i+1} de ${pages.length}</div>` : ""}`).join("");
    $("#bPagesInfo").textContent = `210 × 297 mm · ${pages.length} página${pages.length > 1 ? "s" : ""}.` + (pages.length > 1 ? " O texto passou de uma página; encurte os parágrafos se quiser tudo em uma folha." : "");
  }, 120);
}
// ---- editor ----
const bEl = {title:$("#bTitle"), date:$("#bDate"), dateAuto:$("#bDateAuto"), val:$("#bVal"), valAuto:$("#bValAuto"), obs:$("#bObs"), obsAuto:$("#bObsAuto")};
let lastTA = null;
function fillBulletin(){
  bEl.title.value = S.bul.title;
  bEl.dateAuto.checked = S.bul.dateAuto; bEl.date.value = bulDate();
  bEl.valAuto.checked = S.bul.valAuto; bEl.val.value = bulVal();
  bEl.obsAuto.checked = S.bul.obsAuto; bEl.obs.value = bulObs();
  renderParas();
}
function renderParas(){
  const box = $("#bParas"); box.innerHTML = "";
  S.bul.paras.forEach((t, i) => {
    const d = document.createElement("div"); d.className = "para";
    d.innerHTML = `<div class="ph"><span>Parágrafo ${i+1}</span>
      <button class="icobtn" type="button" data-up title="Mover para cima" aria-label="Mover parágrafo ${i+1} para cima" ${i===0?"disabled":""}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m6 15 6-6 6 6"/></svg></button>
      <button class="icobtn" type="button" data-down title="Mover para baixo" aria-label="Mover parágrafo ${i+1} para baixo" ${i===S.bul.paras.length-1?"disabled":""}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg></button>
      <button class="icobtn" type="button" data-del title="Excluir parágrafo" aria-label="Excluir parágrafo ${i+1}">${ICON_X}</button></div>
      <textarea class="field" aria-label="Texto do parágrafo ${i+1}"></textarea>`;
    const ta = d.querySelector("textarea"); ta.value = t;
    const grow = () => { ta.style.height = "auto"; ta.style.height = Math.max(130, ta.scrollHeight + 2) + "px"; };
    requestAnimationFrame(grow);
    ta.addEventListener("input", () => { S.bul.paras[i] = ta.value; grow(); persist(); drawBulletin(); });
    ta.addEventListener("focus", () => lastTA = ta);
    d.querySelector("[data-up]").onclick = () => { [S.bul.paras[i-1], S.bul.paras[i]] = [S.bul.paras[i], S.bul.paras[i-1]]; persist(); renderParas(); drawBulletin(); };
    d.querySelector("[data-down]").onclick = () => { [S.bul.paras[i+1], S.bul.paras[i]] = [S.bul.paras[i], S.bul.paras[i+1]]; persist(); renderParas(); drawBulletin(); };
    d.querySelector("[data-del]").onclick = () => { const old = S.bul.paras.slice(); S.bul.paras.splice(i, 1); persist(); renderParas(); drawBulletin();
      showBMsg("info", `Parágrafo excluído. <button class="btn small ghost" id="undoPara" type="button">Desfazer</button>`);
      $("#undoPara")?.addEventListener("click", () => { S.bul.paras = old; persist(); renderParas(); drawBulletin(); $("#bmsg").hidden = true; }); };
    box.append(d);
  });
}
bEl.title.addEventListener("input", () => { S.bul.title = bEl.title.value; persist(); drawBulletin(); });
bEl.date.addEventListener("input", () => { S.bul.dateText = bEl.date.value; S.bul.dateAuto = false; bEl.dateAuto.checked = false; persist(); drawBulletin(); });
bEl.val.addEventListener("input", () => { S.bul.valText = bEl.val.value; S.bul.valAuto = false; bEl.valAuto.checked = false; persist(); drawBulletin(); });
bEl.obs.addEventListener("input", () => { S.bul.obsText = bEl.obs.value; S.bul.obsAuto = false; bEl.obsAuto.checked = false; persist(); drawBulletin(); });
for (const k of ["date","val","obs"]){
  const ck = bEl[k+"Auto"];
  ck.addEventListener("change", () => { S.bul[k+"Auto"] = ck.checked; if (!ck.checked) S.bul[k+"Text"] = bEl[k].value; fillBulletin(); persist(); drawBulletin(); });
}
lastTA = null;
document.querySelectorAll("[data-ins]").forEach(b => b.addEventListener("mousedown", e => e.preventDefault()));
document.querySelectorAll("[data-ins]").forEach(b => b.addEventListener("click", () => {
  const ta = lastTA && document.body.contains(lastTA) ? lastTA : $("#bParas textarea"); if (!ta) return;
  const ins = b.dataset.ins, st = ta.selectionStart ?? ta.value.length, en = ta.selectionEnd ?? st;
  ta.value = ta.value.slice(0, st) + ins + ta.value.slice(en); ta.focus(); ta.selectionStart = ta.selectionEnd = st + ins.length;
  ta.dispatchEvent(new Event("input"));
}));
$("#bAddPara").addEventListener("click", () => { S.bul.paras.push(""); persist(); renderParas(); drawBulletin(); const all = $("#bParas").querySelectorAll("textarea"); all[all.length-1]?.focus(); });
$("#bReset").addEventListener("click", () => {
  const old = JSON.stringify(S.bul); S.bul = BUL_DEFAULT(); fillBulletin(); persist(); drawBulletin();
  showBMsg("info", `Textos de exemplo restaurados. <button class="btn small ghost" id="undoBul" type="button">Desfazer</button>`);
  $("#undoBul")?.addEventListener("click", () => { S.bul = JSON.parse(old); fillBulletin(); persist(); drawBulletin(); $("#bmsg").hidden = true; });
});
function showBMsg(kind, html){ const m = $("#bmsg"); m.className = "msg " + kind; m.innerHTML = html; m.hidden = false; }
// ---- abas ----
function setView(v){
  if (!["map","bul","cid"].includes(v)) v = "map";
  $("#viewMap").hidden = v !== "map"; $("#viewBul").hidden = v !== "bul"; $("#viewCid").hidden = v !== "cid";
  $("#tabMap").setAttribute("aria-selected", v === "map"); $("#tabBul").setAttribute("aria-selected", v === "bul"); $("#tabCid").setAttribute("aria-selected", v === "cid");
  document.querySelectorAll(".actions [data-view]").forEach(b => b.hidden = b.dataset.view !== v);
  closePop(false);
  const selo = document.getElementById("ponteSelo"); if (selo) selo.style.display = v === "cid" ? "none" : "";   // nesta aba o PDF não vai para o Drive
  if (v === "bul"){ fillBulletin(); drawBulletin(); } else if (v === "cid"){ fillCid(); renderCid(); drawCid(); } else drawPreview();
  try { sessionStorage.setItem("prevmg:view", v); } catch(e){}
}
const VIEWS = [["map","#tabMap"],["bul","#tabBul"],["cid","#tabCid"]];
VIEWS.forEach(([v, id]) => $(id).addEventListener("click", () => setView(v)));
$(".tabs").addEventListener("keydown", e => {
  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
  const cur = VIEWS.findIndex(([, id]) => $(id).getAttribute("aria-selected") === "true");
  const [v, id] = VIEWS[(cur + (e.key === "ArrowRight" ? 1 : VIEWS.length - 1)) % VIEWS.length];
  setView(v); $(id).focus();
});
// ---- geração do PDF ----
$("#btnBulPdf").addEventListener("click", e => busy(e.currentTarget, async () => {
  if (!S.bul.paras.some(t => t.trim())){ showBMsg("err", "Escreva pelo menos um parágrafo de previsão."); return; }
  if (!await preflight()){ if (!msg.hidden) setView("map"); return; }
  try {
    const JsPDF = await loadJsPdf();
    const pages = layoutBulletin();
    const mapCanvas = await svgToCanvas(300);
    const mapJpg = mapCanvas.toDataURL("image/jpeg", 0.92);
    const pdf = new JsPDF({orientation:"portrait", unit:"mm", format:"a4", compress:true});
    pages.forEach((pg, i) => {
      if (i) pdf.addPage("a4", "portrait");
      for (const it of pg){
        if (it.k === "img") pdf.addImage(it.src, "PNG", it.x, it.y, it.w, it.h, undefined, "FAST");
        else if (it.k === "map") pdf.addImage(mapJpg, "JPEG", it.x, it.y, it.w, it.h, undefined, "FAST");
        else { pdf.setFont("times", it.b ? "bold" : "normal"); pdf.setFontSize(it.pt); pdf.text(it.t, it.x, it.y); }
      }
    });
    pdf.setProperties({title:`${S.bul.title} - ${bulDate()}`, author:"SIMGE/IGAM", creator:"Previsão diária MG 1.10"});
    if (await saveFile(`boletim_previsao_${S.date}.pdf`, pdf.output("blob"))) showBMsg("ok", `Boletim de ${fmtDateBR(S.date)} gerado em PDF (A4, ${pages.length} página${pages.length>1?"s":""}).`);
  } catch(err){ showBMsg("err", "Não foi possível gerar o PDF do boletim. Tente novamente."); }
}));
// o boletim acompanha mudanças feitas no mapa
const _drawPreview = drawPreview;
drawPreview = function(){ _drawPreview(); if (!$("#viewBul").hidden){ fillBulletinAuto(); drawBulletin(); } };
function fillBulletinAuto(){ if (S.bul.dateAuto) bEl.date.value = bulDate(); if (S.bul.valAuto) bEl.val.value = bulVal(); if (S.bul.obsAuto) bEl.obs.value = bulObs(); }

/* ================= previsão por cidade (PDF A4 retrato, baixado no PC) ================= */
const CID_EXAMPLE = ["Belo Horizonte", "Paracatu", "Uberlândia", "Curvelo", "Manhuaçu"];
const CID_TOP = "APPA / IGAM • BOLETIM METEOROLÓGICO";
const CID_RAINY = /chuv|tempest|granizo|tornado|aviso/;
const cidExtraFor = v => CID_RAINY.test(v) ? "chuva" : (v === NONE ? "nada" : "umidade");
const cidDescFor = v => v === NONE ? "" : CAT[v].label;   // "Sem informação" não vira texto no PDF
const DIAS_SEMANA = ["Domingo","Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado"];
const cidLongDate = iso => { if (!iso) return ""; const d = new Date(iso + "T12:00:00"); return `${DIAS_SEMANA[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`; };
// linha do mapa do dia com o mesmo nome (para puxar ícone e temperaturas)
const mapRow = name => S.rows.find(r => r.name === name);
function cidRow(name, o = {}){
  const m = mapRow(name);
  const tempo = o.tempo || (m && m.tempo) || NONE;
  return {id:"c"+(++uid), name, tempo, desc: o.desc ?? cidDescFor(tempo), descAuto: o.desc == null,
    tmax: o.tmax ?? (m ? m.tmax : ""), tmin: o.tmin ?? (m ? m.tmin : ""), extra: o.extra || cidExtraFor(tempo), a: o.a ?? "", b: o.b ?? ""};
}
function cidDefault(){ return {dateAuto:true, dateText:"", temps:"max", top:CID_TOP, obs:"", rows: CID_EXAMPLE.filter(n => MUN.has(n)).map(n => cidRow(n))}; }
S.cid = S.cid && Array.isArray(S.cid.rows) ? {...cidDefault(), ...S.cid} : cidDefault();
S.cid.rows = S.cid.rows.filter(r => r && MUN.has(r.name)).map(r => ({...r, id:"c"+(++uid), tempo: CAT[r.tempo] ? r.tempo : NONE}));
const C$ = q => document.querySelector(q);
const cidDate = () => S.cid.dateAuto ? cidLongDate(S.date) : S.cid.dateText;
const cidNum = v => String(v ?? "").trim().replace(".", ",");
function cidExtraText(r){
  const a = cidNum(r.a), b = cidNum(r.b);
  if (r.extra === "chuva"){ if (a && b) return `${a} a ${b} mm`; if (a || b) return `Até ${b || a} mm`; }
  else if (r.extra === "umidade"){ if (a && b) return `Umidade entre ${a}% e ${b}%`; if (a || b) return `Umidade de ${b || a}%`; }
  return "";
}
function cidTemps(r){
  const t = v => cidNum(v) ? `${cidNum(v)} °C` : "";
  if (S.cid.temps === "max") return [t(r.tmax)];
  if (S.cid.temps === "min") return [t(r.tmin)];
  return [t(r.tmax), t(r.tmin) ? `mín. ${t(r.tmin)}` : ""];
}
function showCMsg(kind, html){ const m = C$("#cmsg"); m.className = "msg " + kind; m.innerHTML = html; m.hidden = false; clearTimeout(showCMsg.t); if (kind !== "err") showCMsg.t = setTimeout(() => m.hidden = true, 8000); }

/* ---- lista editável ---- */
const CI_UP = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg>`;
const CI_DN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`;
const cListEl = C$("#cList");
function renderCid(flashId){
  cListEl.innerHTML = "";
  if (!S.cid.rows.length){ cListEl.innerHTML = `<div class="cempty">Nenhum município. Pesquise abaixo ou use “Puxar do Mapa do dia”.</div>`; return; }
  S.cid.rows.forEach((r, i) => cListEl.appendChild(cidItem(r, i)));
  if (flashId){ const el = cListEl.querySelector(`[data-id="${flashId}"]`); if (el){ el.classList.add("flash"); el.scrollIntoView({block:"nearest", behavior:"smooth"}); } }
}
function cidItem(r, i){
  const el = document.createElement("div"); el.className = "citem"; el.dataset.id = r.id;
  const n = S.cid.rows.length, t = S.cid.temps;
  el.innerHTML = `
    <div class="corder">
      <button class="icobtn sm" data-a="up" type="button" aria-label="Subir ${esc(r.name)}" title="Subir" ${i===0?"disabled":""}>${CI_UP}</button>
      <span class="n">${i+1}</span>
      <button class="icobtn sm" data-a="dn" type="button" aria-label="Descer ${esc(r.name)}" title="Descer" ${i===n-1?"disabled":""}>${CI_DN}</button>
    </div>
    <div class="cbody">
      <div class="cl1">
        <div class="cname" title="${esc(r.name)}">${esc(r.name)}</div>
        <span class="condslot"></span>
        <div class="ctemps">
          <label class="mx" ${t==="min"?"hidden":""}>Máx.<input class="field mx" data-f="tmax" inputmode="decimal" value="${esc(r.tmax)}" aria-label="Máxima em °C, ${esc(r.name)}"></label>
          <label class="mn" ${t==="max"?"hidden":""}>Mín.<input class="field mn" data-f="tmin" inputmode="decimal" value="${esc(r.tmin)}" aria-label="Mínima em °C, ${esc(r.name)}"></label>
        </div>
        <button class="icobtn" data-a="rm" type="button" title="Remover município" aria-label="Remover ${esc(r.name)}">${ICON_X}</button>
      </div>
      <div class="cl2">
        <label class="csub">Descrição
          <span class="cdesc"><input class="field ${r.descAuto?"":"edited"}" data-f="desc" value="${esc(r.desc)}" aria-label="Descrição, ${esc(r.name)}">
          <button class="icobtn" data-a="dreset" type="button" title="Voltar à descrição do ícone" aria-label="Voltar à descrição do ícone" ${r.descAuto?"hidden":""}>${ICON_POS}</button></span>
        </label>
        <div class="csub"><span>Informação extra</span>
          <div class="cextra">
            <select class="field" data-f="extra" aria-label="Tipo de informação extra, ${esc(r.name)}">
              <option value="chuva" ${r.extra==="chuva"?"selected":""}>Chuva (mm)</option>
              <option value="umidade" ${r.extra==="umidade"?"selected":""}>Umidade relativa (%)</option>
              <option value="nada" ${r.extra==="nada"?"selected":""}>Nenhuma</option>
            </select>
            <span class="vals" ${r.extra==="nada"?"hidden":""}>
              <input class="field" data-f="a" inputmode="decimal" value="${esc(r.a)}" placeholder="de" aria-label="Valor inicial, ${esc(r.name)}"><span class="x"> a </span><input class="field" data-f="b" inputmode="decimal" value="${esc(r.b)}" placeholder="até" aria-label="Valor final, ${esc(r.name)}"> <span class="u">${r.extra==="chuva"?"mm":"%"}</span>
            </span>
          </div>
          <div class="cprev">${esc(cidExtraText(r))}</div>
        </div>
      </div>
    </div>`;
  const cb = condButton(r.tempo, v => {
    r.tempo = v;
    if (r.descAuto) r.desc = cidDescFor(v);
    if (!cidNum(r.a) && !cidNum(r.b)) r.extra = cidExtraFor(v);
    const fresh = cidItem(r, S.cid.rows.indexOf(r)); el.replaceWith(fresh); fresh.querySelector(".cond-btn").focus();
    persist(); drawCid();
  }, "Ícone de " + r.name);
  el.querySelector(".condslot").replaceWith(cb);
  const upd = () => { el.querySelector(".cprev").textContent = cidExtraText(r); persist(); drawCid(); };
  el.addEventListener("input", e => {
    const f = e.target.dataset.f; if (!f || f === "extra") return;
    r[f] = e.target.value;
    if (f === "desc"){ r.descAuto = false; e.target.classList.add("edited"); el.querySelector('[data-a="dreset"]').hidden = false; }
    upd();
  });
  el.addEventListener("change", e => {
    if (e.target.dataset.f !== "extra") return;
    r.extra = e.target.value; el.querySelector(".vals").hidden = r.extra === "nada"; el.querySelector(".u").textContent = r.extra === "chuva" ? "mm" : "%"; upd();
  });
  el.addEventListener("click", e => {
    const b = e.target.closest("[data-a]"); if (!b) return;
    const k = S.cid.rows.indexOf(r), a = b.dataset.a, R = S.cid.rows;
    if (a === "rm"){ R.splice(k, 1); renderCid(); persist(); drawCid(); return; }
    if (a === "up" && k > 0){ [R[k-1], R[k]] = [R[k], R[k-1]]; renderCid(); cListEl.querySelector(`[data-id="${r.id}"] [data-a="up"]`)?.focus(); persist(); drawCid(); }
    if (a === "dn" && k < R.length-1){ [R[k+1], R[k]] = [R[k], R[k+1]]; renderCid(); cListEl.querySelector(`[data-id="${r.id}"] [data-a="dn"]`)?.focus(); persist(); drawCid(); }
    if (a === "dreset"){ r.desc = cidDescFor(r.tempo); r.descAuto = true; const inp = el.querySelector('[data-f="desc"]'); inp.value = r.desc; inp.classList.remove("edited"); b.hidden = true; persist(); drawCid(); }
  });
  return el;
}
function cidAdd(){
  const inp = C$("#cAddName"); const name = MUN_NORM.get(norm(inp.value));
  if (!name){ showCMsg("err", inp.value.trim() ? `“${esc(inp.value.trim())}” não está na lista de municípios de MG.` : "Digite o nome de um município."); return; }
  const dup = S.cid.rows.find(r => r.name === name);
  if (dup){ showCMsg("info", `${esc(name)} já está na lista.`); renderCid(dup.id); return; }
  const r = cidRow(name); S.cid.rows.push(r); inp.value = ""; C$("#cmsg").hidden = true;
  renderCid(r.id); persist(); drawCid();
  if (mapRow(name)) showCMsg("ok", `${esc(name)} adicionado com o ícone e as temperaturas do Mapa do dia.`);
}
C$("#cBtnAdd").addEventListener("click", cidAdd);
C$("#cAddName").addEventListener("keydown", e => { if (e.key === "Enter"){ e.preventDefault(); cidAdd(); } });
C$("#cBtnSort").addEventListener("click", () => { S.cid.rows.sort((a,b) => a.name.localeCompare(b.name, "pt-BR", {sensitivity:"base"})); renderCid(); persist(); drawCid(); });
C$("#cBtnClear").addEventListener("click", () => {
  if (!S.cid.rows.length) return;
  const old = S.cid.rows; S.cid.rows = []; renderCid(); persist(); drawCid();
  showCMsg("info", `Lista esvaziada. <button class="btn small ghost" id="cUndo" type="button">Desfazer</button>`);
  C$("#cUndo")?.addEventListener("click", () => { S.cid.rows = old; renderCid(); persist(); drawCid(); C$("#cmsg").hidden = true; });
});
C$("#cBtnImport").addEventListener("click", () => {
  let upd = 0;
  if (!S.cid.rows.length){   // lista vazia: traz todos os municípios preenchidos no mapa
    S.rows.filter(m => m.tempo !== NONE).forEach(m => { S.cid.rows.push(cidRow(m.name)); upd++; });
  } else S.cid.rows.forEach(r => { const m = mapRow(r.name); if (!m) return;
    r.tempo = m.tempo; r.tmax = m.tmax; r.tmin = m.tmin; if (r.descAuto) r.desc = cidDescFor(r.tempo); upd++; });
  renderCid(); persist(); drawCid();
  showCMsg(upd ? "ok" : "info", upd ? `${upd} município${upd>1?"s":""} com o ícone e as temperaturas do Mapa do dia. Descrições editadas à mão foram mantidas.` : "Nenhum município desta lista está no Mapa do dia.");
});
/* data, temperatura e textos */
const cEl = {date:C$("#cDate"), dateText:C$("#cDateText"), dateAuto:C$("#cDateAuto"), top:C$("#cTop"), obs:C$("#cObs")};
function fillCid(){
  cEl.date.value = S.date || "";
  cEl.dateAuto.checked = S.cid.dateAuto; cEl.dateText.readOnly = S.cid.dateAuto; cEl.dateText.value = cidDate();
  cEl.top.value = S.cid.top; cEl.obs.value = S.cid.obs;
  document.querySelectorAll("[data-ctemps]").forEach(b => { const on = b.dataset.ctemps === S.cid.temps; b.setAttribute("aria-checked", on); b.tabIndex = on ? 0 : -1; });
}
// a data é a mesma do Mapa do dia: mudar aqui muda lá também
cEl.date.addEventListener("input", () => { dateEl.value = cEl.date.value; dateEl.dispatchEvent(new Event("input")); fillCid(); drawCid(); });
cEl.dateAuto.addEventListener("change", () => { S.cid.dateAuto = cEl.dateAuto.checked; if (!S.cid.dateAuto) S.cid.dateText = cidLongDate(S.date); fillCid(); persist(); drawCid(); });
cEl.dateText.addEventListener("input", () => { S.cid.dateText = cEl.dateText.value; persist(); drawCid(); });
cEl.top.addEventListener("input", () => { S.cid.top = cEl.top.value; persist(); drawCid(); });
cEl.obs.addEventListener("input", () => { S.cid.obs = cEl.obs.value; persist(); drawCid(); });
document.querySelectorAll("[data-ctemps]").forEach(b => b.addEventListener("click", () => { S.cid.temps = b.dataset.ctemps; fillCid(); renderCid(); persist(); drawCid(); }));
C$("#cTempsSeg").addEventListener("keydown", e => {
  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return; e.preventDefault(); e.stopPropagation();
  const o = ["max","min","both"]; S.cid.temps = o[(o.indexOf(S.cid.temps) + (e.key === "ArrowRight" ? 1 : 2)) % 3];
  fillCid(); renderCid(); persist(); drawCid(); C$(`[data-ctemps="${S.cid.temps}"]`).focus();
});

/* ---- layout A4 (mesmas medidas na prévia e no PDF) ---- */
const CPG = {w:210, h:297, m:18, head:34, row:25, foot:16};
const CCOL = {ink:"#1d1d1f", sub:"#2f2f33", muted:"#6e6e73", line:"#e3e3e6", min:"#1764bf"};
let _cdoc = null;
function cTextW(t, pt, bold){
  if (!_cdoc && window.jspdf) _cdoc = new window.jspdf.jsPDF({unit:"mm", format:"a4"});
  if (!_cdoc) return String(t).length * pt * PT * .55;
  _cdoc.setFont("helvetica", bold ? "bold" : "normal"); _cdoc.setFontSize(pt); return _cdoc.getTextWidth(String(t));
}
const cFit = (t, pt, maxW, bold) => { let s = pt; while (s > 6 && cTextW(t, s, bold) > maxW) s -= .25; return s; };   // diminui a letra se o texto não couber na linha
function cidPages(){
  const obs = pdfSafe(S.cid.obs).trim(), obsH = obs ? 6 + obs.split("\n").length * 4.4 : 0;
  const per = Math.max(1, Math.floor((CPG.h - CPG.head - CPG.foot) / CPG.row));
  const pages = [];
  for (let i = 0; i < S.cid.rows.length; i += per) pages.push(S.cid.rows.slice(i, i+per));
  if (!pages.length) pages.push([]);
  if (obsH && CPG.head + pages[pages.length-1].length * CPG.row + obsH > CPG.h - CPG.foot) pages.push([]);
  return {pages, obs, obsH};
}
function cIconBox(c, cx, cy){ const s = 13; let w = s, h = s * (c.ar || 1); if (h > s){ h = s; w = s / (c.ar || 1); } return {x:cx - w/2, y:cy - h/2, w, h}; }
function cidItems(rows, pi, total, obs){
  const it = [], L = CPG.m, R = CPG.w - CPG.m, X = L + 22;
  const top = pdfSafe(S.cid.top).toUpperCase();
  it.push({k:"t", x:L, y:20, pt:cFit(top, 7.5, R-L, true), t:top, c:CCOL.muted, b:true});
  const dt = pdfSafe(cidDate());
  it.push({k:"t", x:L, y:28.2, pt:cFit(dt, 15, R-L, true), t:dt, c:CCOL.ink, b:true});
  it.push({k:"l", y:CPG.head});
  rows.forEach((r, i) => {
    const y0 = CPG.head + i*CPG.row, c = CAT[r.tempo] || CAT[NONE];
    const [t1, t2] = cidTemps(r);
    const tw = Math.max(t1 ? cTextW(t1, 12, true) : 0, t2 ? cTextW(t2, 9.5) : 0);
    const maxW = R - X - (tw ? tw + 5 : 0);
    it.push({k:"i", c, ...cIconBox(c, L + 8, y0 + CPG.row/2)});
    it.push({k:"t", x:X, y:y0+8.6, pt:cFit(r.name, 12, maxW, true), t:r.name, c:CCOL.ink, b:true});
    const d = pdfSafe(r.desc).trim(); if (d) it.push({k:"t", x:X, y:y0+14.4, pt:cFit(d, 10, R - X), t:d, c:CCOL.sub});
    const ex = cidExtraText(r); if (ex) it.push({k:"t", x:X, y:y0+19.6, pt:9, t:ex, c:CCOL.muted});
    if (t1) it.push({k:"t", x:R, y:y0+8.6, pt:12, t:t1, c:S.cid.temps === "min" ? CCOL.min : CCOL.ink, b:true, r:1});
    if (t2) it.push({k:"t", x:R, y:y0+14.4, pt:9.5, t:t2, c:CCOL.min, r:1});
    if (i < rows.length-1 || pi < total-1 || obs) it.push({k:"l", y:y0+CPG.row});
  });
  if (pi === total-1 && obs){ let y = CPG.head + rows.length*CPG.row + 7; obs.split("\n").forEach(l => { it.push({k:"t", x:L, y, pt:cFit(l, 8.5, R-L), t:l, c:CCOL.muted}); y += 4.4; }); }
  it.push({k:"t", x:R, y:CPG.h-9, pt:8, t:`Página ${pi+1} de ${total}`, c:CCOL.muted, r:1});
  return it;
}
function cidSVG(items){
  const p = [`<svg viewBox="0 0 ${CPG.w} ${CPG.h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Página da previsão por cidade"><rect width="${CPG.w}" height="${CPG.h}" fill="#fff"/>`];
  for (const o of items){
    if (o.k === "l") p.push(`<line x1="${CPG.m}" x2="${CPG.w-CPG.m}" y1="${o.y}" y2="${o.y}" stroke="${CCOL.line}" stroke-width=".3"/>`);
    else if (o.k === "i") p.push(`<image href="${o.c.src}" x="${f2(o.x)}" y="${f2(o.y)}" width="${f2(o.w)}" height="${f2(o.h)}" preserveAspectRatio="xMidYMid meet"/>`);
    else p.push(`<text x="${f2(o.x)}" y="${f2(o.y)}" font-family="Helvetica, Arial, 'Liberation Sans', sans-serif" font-size="${(o.pt*PT).toFixed(3)}" font-weight="${o.b?700:400}" fill="${o.c}"${o.r?' text-anchor="end"':""}>${esc(o.t)}</text>`);
  }
  p.push("</svg>"); return p.join("");
}
let cidQ = 0;
function drawCid(){
  if (C$("#viewCid").hidden) return;
  cancelAnimationFrame(cidQ);
  cidQ = requestAnimationFrame(() => {
    const {pages, obs} = cidPages();
    C$("#cPages").innerHTML = pages.map((rows, i) => `<div class="a4">${cidSVG(cidItems(rows, i, pages.length, obs))}</div>` + (pages.length > 1 ? `<div class="pgnum">Página ${i+1} de ${pages.length}</div>` : "")).join("");
    const n = S.cid.rows.length;
    C$("#cPagesInfo").textContent = `210 × 297 mm · ${n} município${n===1?"":"s"} · ${pages.length} página${pages.length>1?"s":""}`;
  });
}
/* ---- PDF: baixado direto no PC (data-local="1" faz a ponte do Drive deixar passar) ---- */
const cPng = new Map();
function cidPng(c){
  if (!cPng.has(c.value)) cPng.set(c.value, new Promise((res, rej) => { const im = new Image();
    im.onload = () => { const cv = document.createElement("canvas"); cv.width = im.naturalWidth; cv.height = im.naturalHeight; cv.getContext("2d").drawImage(im, 0, 0); res(cv.toDataURL("image/png")); };
    im.onerror = () => rej(new Error("ícone")); im.src = c.src; }));
  return cPng.get(c.value);
}
const cHex = h => [1,3,5].map(i => parseInt(h.slice(i, i+2), 16));
function baixarLocal(filename, blob){
  if (typeof window.ponteBaixarNoPc === "function") return window.ponteBaixarNoPc(filename, blob);
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.setAttribute("data-local", "1");
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}
C$("#btnCidPdf").addEventListener("click", e => busy(e.currentTarget, async () => {
  if (!S.date){ cEl.date.setAttribute("aria-invalid", "true"); cEl.date.focus(); showCMsg("err", "Escolha a data da previsão."); return; }
  cEl.date.removeAttribute("aria-invalid");
  if (!S.cid.rows.length){ showCMsg("err", "Adicione pelo menos um município antes de gerar o PDF."); return; }
  const semT = S.cid.rows.filter(r => cidTemps(r).every(t => !t)).map(r => r.name);
  const semI = S.cid.rows.filter(r => r.tempo === NONE).map(r => r.name);
  const issues = [];
  if (semT.length) issues.push(`Sem temperatura: ${semT.join(", ")}.`);
  if (semI.length) issues.push(`Com ícone “Sem informação”: ${semI.join(", ")}.`);
  if (issues.length && !await ask("Conferir antes de gerar", `<ul style="margin:0;padding-left:18px">${issues.map(i => `<li>${esc(i)}</li>`).join("")}</ul>`, [["Voltar e completar", false, "ghost"], ["Gerar assim mesmo", true, "primary"]])) return;
  try {
    const JsPDF = await loadJsPdf();
    const pdf = new JsPDF({orientation:"portrait", unit:"mm", format:"a4", compress:true});
    const {pages, obs} = cidPages();
    for (let pi = 0; pi < pages.length; pi++){
      if (pi) pdf.addPage("a4", "portrait");
      for (const o of cidItems(pages[pi], pi, pages.length, obs)){
        if (o.k === "l"){ pdf.setDrawColor(...cHex(CCOL.line)); pdf.setLineWidth(.3); pdf.line(CPG.m, o.y, CPG.w - CPG.m, o.y); }
        else if (o.k === "i") pdf.addImage(await cidPng(o.c), "PNG", o.x, o.y, o.w, o.h, undefined, "FAST");
        else { pdf.setFont("helvetica", o.b ? "bold" : "normal"); pdf.setFontSize(o.pt); pdf.setTextColor(...cHex(o.c)); pdf.text(o.t, o.x, o.y, o.r ? {align:"right"} : undefined); }
      }
    }
    pdf.setProperties({title:`Previsão por cidade - ${cidDate()}`, author:"SIMGE/IGAM", creator:"Previsão diária MG 1.11"});
    baixarLocal(`previsao_cidades_${S.date}.pdf`, pdf.output("blob"));
    showCMsg("ok", `PDF de ${fmtDateBR(S.date)} baixado no seu computador (${pages.length} página${pages.length>1?"s":""}).`);
  } catch(err){ showCMsg("err", "Não foi possível gerar o PDF. Tente novamente."); }
}));

/* ================= início ================= */
fillTexts(); fillOpts(); applyTempsUI(); renderRows(); updateNotice(); updateStatus(); renderBg(); drawPreview();
try { const v = sessionStorage.getItem("prevmg:view"); if (v === "bul" || v === "cid") setView(v); } catch(e){}
idb.all().then(list => { BG = (list || []).sort((a,b) => a.id.localeCompare(b.id)); renderBg(); drawPreview(); }).catch(() => {});
