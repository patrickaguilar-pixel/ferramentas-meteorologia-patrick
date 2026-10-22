/* Código da Previsão diária v1.15 (folha 297 × 210 mm, rodapé com quebra automática, mapas base, ícones sempre dentro de Minas).
   Extraído de "Previsão diária — Minas Gerais v1.1.html" para a versão Apps Script
   (carregado de fora para o Apps Script não interferir no código). */

"use strict";
/* ================= constantes do modelo QGIS (layout_mapas_icones_v3.6) ================= */
/* Folha A4 deitada: 297 × 210 mm (antes 297 × 222,75). O quadro do mapa mantém a largura e a escala;
   a altura passa de 171,97 para 168 mm, recortando só faixas sem Minas no norte e no sul. */
const PAGE = {w:297, h:210};
const GEO_YMAX = -13.93919886637183225;                 // topo da extensão em que o geo.js foi gerado
const MAP = {x:6.86137, y:19.8108, w:287.879, h:168,
  xmin:-51.37697910145185887, xmax:-35.90814406617541721};
const K = MAP.w / (MAP.xmax - MAP.xmin);
const GEO_DY = 3.4;                                       // mm: o mapa sobe 3,4 mm em relação ao geo.js
MAP.ymax = GEO_YMAX - GEO_DY / K; MAP.ymin = MAP.ymax - MAP.h / K;
// desloca as geometrias do geo.js (caminhos com "M" absoluto e "l" relativo) para a nova extensão, uma única vez
if (typeof GEO !== "undefined" && GEO.__dy == null){
  for (const k of ["land", "states", "mg", "munLines", "mesoLines"]) if (typeof GEO[k] === "string")
    GEO[k] = GEO[k].replace(/M(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (m, x, y) => `M${x} ${Math.round((+y - GEO_DY)*100)/100}`);
  GEO.__dy = GEO_DY;
}
const PT = 25.4/72; // mm por ponto tipográfico
const COL = 258.49, LIN_W = 51.28;   // eixo e largura das linhas da coluna da legenda (tudo alinhado no mesmo centro)
const NAVY = "#092b6a";
const FONT = "Arial, 'Liberation Sans', Helvetica, sans-serif";
const CAT = Object.fromEntries(ICONS.map(c => [c.value, c]));
const NONE = "sem informação";
const DEFAULT_TEXTS = {
  region: "Minas Gerais",
  footer: "Iniciativa realizada com recursos do Acordo de Reparação do Rio Doce, firmado em decorrência do rompimento da Barragem de Fundão, da Samarco S.A. O rompimento, ocorrido em 5 de novembro de 2015, tirou a vida de 19 pessoas.",
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
const LOGO_Y = 196.35, LOGO_H = 10, LOGO_X0 = 10.5, LOGO_X1 = 196.4;   // rodapé de 13,1 mm (folha de 210 mm)
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
const BASE_VERSION = 4;
// deslocamento inicial (mm) para quem fica cortado pela borda do mapa
const DEFAULT_OFFSET = {};   // o posicionamento automático cuida das bordas (Extrema etc.)
const MESO_LABELS = [
  ["NOROESTE DE MINAS",-46.43,-17.33],["NORTE DE MINAS",-43.97,-16.10],["JEQUITINHONHA",-41.33,-16.51],
  ["VALE DO MUCURI",-41.17,-17.68],["TRIÂNGULO MINEIRO/ALTO PARANAÍBA",-48.28,-19.23],["CENTRAL MINEIRA",-44.95,-18.76],
  ["METROPOLITANA DE BELO HORIZONTE",-43.75,-19.65],["VALE DO RIO DOCE",-42.05,-18.99],["OESTE DE MINAS",-45.24,-20.60],
  ["SUL/SUDOESTE DE MINAS",-45.87,-21.73],["CAMPO DAS VERTENTES",-44.29,-21.21],["ZONA DA MATA",-42.82,-21.01]];
// siglas dos estados no ponto interno de cada um dentro da área do mapa; DF no centro do polígono
const STATE_LABELS = [["MT",-51.18,-14.494],["GO",-49.744,-16.279],["DF",-47.797,-15.7755],["BA",-40.865,-14.794],["MS",-51.0,-20.45],
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
// município ainda sem condição do tempo e sem temperatura: no mapa ficam só o ponto e o nome
const vazio = r => r.tempo === NONE && shownTemps(r).every(v => v == null);
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
    opts:{mun:true, meso:true, mesoNames:false, states:true, names:true, ptSede:true, autoSpread:true, temps:"both", iconScale:0.5, nameSize:3.5, mgFill:true, baseFill:true, baseHidro:true, baseRod:true, baseUrb:true, bgClipMG:true}, bgActive:null, baseVersion:BASE_VERSION, namesDefaultV:2, noticeDismissed:true, savedSig:null};
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
  S.rows.forEach(r => { if (r.name === "Extrema" && r.dx === 0 && r.dy === -5.5) r.dy = 0; });
  // acrescenta os municípios base que faltarem (ex.: Paracatu, Uberaba, Campos Altos, Manhuaçu, Ipatinga,
  // Barbacena), sem apagar o que já está na lista nem o que já foi preenchido
  const tem = new Set(S.rows.map(r => r.name));
  for (const n of START_MUN) if (!tem.has(n) && MUN.has(n)) S.rows.push(makeRow(n));
  S.rows.sort((a, b) => a.name.localeCompare(b.name, "pt-BR", {sensitivity:"base"}));
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
function persist(){ clearTimeout(saveTimer); saveTimer = setTimeout(flush, 250); updateStatus(); if (typeof histTouch === "function") histTouch(); }
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
// Quebra o texto em linhas na largura maxW e escolhe a maior letra (até sMax) em que tudo cabe na altura maxH.
// Uma quebra de linha simples vira espaço; uma linha em branco separa parágrafos.
function wrapFit(text, maxW, maxH, sMax, sMin, weight){
  const paras = String(text).replace(/\r/g, "").split(/\n\s*\n/).map(p => p.replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean);
  const wrap = s => { const out = [];
    for (const p of paras){ let line = "";
      for (const w of p.split(" ")){ const t = line ? line + " " + w : w;
        if (!line || textW(t, s, weight) <= maxW) line = t; else { out.push(line); line = w; } }
      if (line) out.push(line); }
    return out; };
  const alt = (n, s) => n*s*LH - (LH - (ASC+DESC))*s;
  let s = sMax, lines = wrap(s);
  while (s > sMin && (alt(lines.length, s) > maxH || lines.some(l => textW(l, s, weight) > maxW))){ s = Math.max(sMin, s - 0.02); lines = wrap(s); }
  // última linha muito curta (palavra sozinha): tenta uma letra até 8% menor para caber numa linha a menos
  if (lines.length > 1 && textW(lines[lines.length-1], s, weight) < maxW*0.35){
    for (let s2 = s - 0.02; s2 >= Math.max(sMin, s*0.92); s2 -= 0.02){ const l2 = wrap(s2); if (l2.length < lines.length){ s = s2; lines = l2; break; } } }
  return {lines, size: Math.min(s, ...lines.map(l => { const w = textW(l, s, weight); return w > maxW ? s*maxW/w : s; }))};
}
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
    if (!vazio(r) && x >= MAP.x && x <= MAP.x+MAP.w && y >= MAP.y && y <= MAP.y+MAP.h) used.add(r.tempo);
  }
  return ICONS.filter(c => used.has(c.value));
}
// todos os ícones com a mesma área visual, independentemente da proporção do desenho
const ICON_AREA = 215; // mm² no tamanho 100%
// Correção visual por ícone, medida pela "tinta" de cada desenho (quanto da caixa é desenho de fato):
// desenhos vazados (sol com raios, nuvens pequenas, névoa) ganham um pouco e os maciços (nublado, ?) perdem;
// os altos (termômetros) perdem um pouco e os largos e baixos ganham,
// para todos parecerem do mesmo tamanho no mapa.
const ICON_FIX = {"névoa seca": 1.35, "ventos fortes": 1.23, "chuva a qualquer momento": 1.2, "céu claro": 1.08, "chuvas isoladas pela manhã": 1.07, "tempestades à tarde": 1.05, "tempestades pela manhã": 1.05, "chuvas isoladas à tarde": 1.03, "predomínio de sol": 1.03, "nublado com tempestades": 1.07, "calor intenso": 0.91, "tempestades": 0.98, "nublado com chuva": 0.98, "tornado": 0.96, "granizo": 0.97, "frio intenso": 0.91, "chuvisco": 1.01, "nublado com chuva forte": 0.96, "geada": 0.94, "aviso de tempo severo": 0.96, "tempestade severa": 0.96, "tempestade com chuva forte": 0.95, "nevoeiro": 1.01, "nublado": 0.96, "sem informação": 0.85};
function iconDims(c, scale){
  const k = ICON_FIX[c.value] || 1;
  const A = ICON_AREA*scale*scale; let w = Math.sqrt(A/c.ar)*k, h = w*c.ar; const m = 19.5*scale;
  if (w > m){ w = m; h = w*c.ar; } if (h > m){ h = m; w = h/c.ar; }
  return [w, h];
}
// Ponto da sede: lat/lon exata do município (fixo). Com ele ligado, o ícone fica logo acima do ponto
// e o nome logo abaixo; ícone e temperaturas podem ser arrastados ou afastados, o ponto e o nome não.
/* Tamanho efetivo dos ícones no mapa: o escolhido pela pessoa ou, se o mapa não comportar os ícones
   sem sobreposição e perto das sedes, um pouco menor (ajuste automático, igual para todos). */
let EFF_K = null;
const iconK = () => EFF_K ?? (S.opts.iconScale || 1);
// ícone que não coube em lugar nenhum no tamanho geral (ex.: Extrema, na ponta do estado) fica só ele menor
let ROW_K = new Map();
const iconKr = r => ROW_K.get(r.id) ?? iconK();
// temperaturas acompanham o tamanho dos ícones (quando o mapa todo reduz, elas reduzem um pouco também)
const tempSz = r => 10*PT*Math.min(1, Math.max(0.74, 0.5 + 0.5*iconKr(r)));
const PT_R = 0.65;                                              // raio do ponto (mm): metade do tamanho anterior
const sedeXY = r => proj(r.lon, r.lat);
const iconXY = r => { const [x,y] = proj(r.lon, r.lat);
  let oy = 0; if (S.opts.ptSede){ const [, h] = iconDims(CAT[r.tempo] || CAT[NONE], iconKr(r)); oy = -(h/2 + PT_R + 0.6); }
  return [x + (r.dx||0), y + oy + (r.dy||0)]; };
function nomeSedeRect(r){                                       // retângulo do nome sob o ponto (absoluto, mm)
  const ns = S.opts.nameSize || 3.5, [sx, sy] = sedeXY(r), nw = (textW(r.name, ns, 700) + ns*0.3)/2;
  return [sx - nw, sy + PT_R + 0.35, sx + nw, sy + PT_R + 0.35 + (ASC+DESC)*ns];
}
const isPinned = r => { const d0 = DEFAULT_OFFSET[r.name] || [0,0]; return (r.dx||0) !== d0[0] || (r.dy||0) !== d0[1]; };

/* ---------- afastamento automático ----------
   Cada município é um grupo (ícone + temperaturas + nome). Quando partes de grupos diferentes se
   sobrepõem — sobretudo ícone/temperatura sobre o nome de outro município — os grupos são
   empurrados um pouco, pelo eixo de menor sobreposição, até se separarem. Ícones posicionados à mão
   ficam fixos e os outros se afastam deles. O deslocamento máximo é limitado para manter cada ícone
   perto do seu município. */
let AUTO = new Map(), NAME_UP = new Set(), NAME_POS = new Map(), TEMP_LEFT = new Set(), STACKED = new Set(), TEMP_BELOW = new Set();
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
  const [w, h] = iconDims(c, iconKr(r));
  const tsz = tempSz(r), ns = S.opts.nameSize || 3.5;
  const [mx, mn] = shownTemps(r);
  const solid = [[-w/2*0.98, -h/2*0.98, w/2*0.98, h/2*0.98]];
  let sob = null;   // temperaturas embaixo do ícone (usado só onde o espaço é apertado)
  if (mx != null || mn != null){
    const tw = Math.max(mx != null ? textW(fmtTemp(mx)+"°C", tsz, 700) : 0, mn != null ? textW(fmtTemp(mn)+"°C", tsz, 700) : 0);
    const both = mx != null && mn != null, lh = (ASC+DESC)*tsz;
    sob = [-tw/2 - 0.3, h/2*0.98 + 0.15, tw/2 + 0.3, h/2*0.98 + 0.15 + (both ? 2 : 1)*lh*0.92 + 0.3];
    if (TEMP_BELOW.has(r.id)) solid.push(sob);
    else solid.push(both ? [w/2+1.0, 0.4 - lh - 0.2, w/2+1.3+tw+0.4, 0.4 + lh + 0.2] : [w/2+1.0, -lh/2 - 0.2, w/2+1.3+tw+0.4, lh/2 + 0.2]);
  }
  const nw = (textW(r.name, ns, 700)+ns*0.3)/2, nh = (ASC+DESC)*ns;
  const below = [-nw, h/2+0.3, nw, h/2+0.3+nh], above = [-nw, -h/2-0.3-nh, nw, -h/2-0.3];
  return {solid, sob, name: S.opts.names ? [below] : [], below, above, h};
}
/* Máscara de Minas Gerais (4 px por mm, com 0,4 mm de folga da divisa) para testar retângulos inteiros. */
let MG_MASK = null;
const MASK_R = 4;
function mgMask(){
  if (MG_MASK !== null) return MG_MASK;
  try {
    const W = Math.ceil(MAP.w*MASK_R), H = Math.ceil(MAP.h*MASK_R), c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d", {willReadFrequently:true}), path = new Path2D(GEO.mg);
    g.scale(MASK_R, MASK_R); g.fillStyle = "#000"; g.fill(path, "evenodd");
    g.globalCompositeOperation = "destination-out"; g.lineWidth = 0.8; g.lineJoin = "round"; g.stroke(path);
    const d = g.getImageData(0, 0, W, H).data, m = new Uint8Array(W*H), sat = new Uint32Array((W+1)*(H+1));
    for (let i = 0; i < m.length; i++) m[i] = d[i*4+3] > 127 ? 1 : 0;
    // tabela de somas acumuladas das células FORA de Minas: conta o que cai fora de qualquer retângulo de uma vez
    for (let y = 0; y < H; y++){ let row = 0; for (let x = 0; x < W; x++){ row += 1 - m[y*W+x]; sat[(y+1)*(W+1)+x+1] = sat[y*(W+1)+x+1] + row; } }
    MG_MASK = {W, H, m, sat};
  } catch(e){ MG_MASK = false; }
  return MG_MASK;
}
function ptIn(px, py){
  const M = mgMask(); if (!M) return inMG(px, py);
  const x = Math.floor((px - MAP.x)*MASK_R), y = Math.floor((py - MAP.y)*MASK_R);
  return x >= 0 && y >= 0 && x < M.W && y < M.H && M.m[y*M.W + x] === 1;
}
// área (mm²) do retângulo que fica fora de Minas (0 = inteiro dentro)
function rectOut(x1, y1, x2, y2){
  const M = mgMask();
  if (M){
    const c = v => Math.max(0, Math.min(M.W, v)), r = v => Math.max(0, Math.min(M.H, v));
    const X1 = Math.floor((x1 - MAP.x)*MASK_R), Y1 = Math.floor((y1 - MAP.y)*MASK_R), X2 = Math.ceil((x2 - MAP.x)*MASK_R), Y2 = Math.ceil((y2 - MAP.y)*MASK_R);
    const total = Math.max(0, X2 - X1)*Math.max(0, Y2 - Y1);
    const a = c(X1), b = r(Y1), e = c(X2), f = r(Y2), W1 = M.W + 1;
    const inFrame = (e - a)*(f - b), outIn = inFrame > 0 ? M.sat[f*W1+e] - M.sat[b*W1+e] - M.sat[f*W1+a] + M.sat[b*W1+a] : 0;
    return (outIn + (total - inFrame)) / (MASK_R*MASK_R);
  }
  let out = 0; const nx = Math.max(1, Math.ceil((x2-x1)/0.5)), ny = Math.max(1, Math.ceil((y2-y1)/0.5));
  for (let i = 0; i <= nx; i++){ const x = x1 + (x2-x1)*i/nx; if (!ptIn(x, y1)) out++; if (!ptIn(x, y2)) out++; }
  for (let j = 1; j < ny; j++){ const y = y1 + (y2-y1)*j/ny; if (!ptIn(x1, y)) out++; if (!ptIn(x2, y)) out++; }
  if (!ptIn((x1+x2)/2, (y1+y2)/2)) out++;
  return out;
}
// ícone (com as temperaturas) inteiro dentro de Minas, com o centro do ícone em (cx, cy)
function blockInMG(r, cx, cy){ return groupRects(r).solid.every(q => rectOut(cx+q[0], cy+q[1], cx+q[2], cy+q[3]) === 0); }

/* Posicionamento com ponto na sede.
   Para cada município são testadas posições do ícone em volta do ponto (16 direções, encostado no ponto
   e um pouco mais longe) e posições do nome (abaixo, acima, à direita, à esquerda e nas diagonais).
   Regras: ícone, temperaturas e nome inteiros dentro de Minas; nada se sobrepõe a nada (ícones, nomes,
   temperaturas e pontos de outros municípios). Preferência: ícone logo acima do ponto e nome logo abaixo;
   quanto mais longe disso, maior o custo. Ícones arrastados à mão ficam onde foram deixados. */
// afastamento máximo aceitável (linha de ~1,5 cm); além disso o tamanho não cabe
const GEN_CACHE = new Map();
const EX_PERTO = 5, CAP_MAX = 14; let EX_MAX = EX_PERTO;
// Linha de indicação: sai do ponto apontando para o CENTRO do ícone e para na borda do desenho (não "raspa"
// de lado nem termina no vazio). Retorna [x1, y1, x2, y2] ou null quando o ícone já está colado no ponto.
function linhaIcone(sx, sy, x, y, w, h){
  const vx = sx - x, vy = sy - y, hw = w/2*0.8, hh = h/2*0.8;
  const s = Math.min(Math.abs(vx) > 1e-9 ? hw/Math.abs(vx) : Infinity, Math.abs(vy) > 1e-9 ? hh/Math.abs(vy) : Infinity);
  if (!(s < 1)) return null;
  const ex = x + vx*s, ey = y + vy*s, L = Math.hypot(ex - sx, ey - sy);
  if (L < PT_R + 2.6) return null;          // ícone praticamente colado: sem tracinho (evita "toquinhos")
  const ux = (ex - sx)/L, uy = (ey - sy)/L;
  return [sx + ux*(PT_R + 0.25), sy + uy*(PT_R + 0.25), ex - ux*0.35, ey - uy*0.35];
}
function layoutSede(){
  const ns = S.opts.nameSize || 3.5, nh = (ASC+DESC)*ns, SQ = PT_R + 0.35, M = 0.4;
  const auto = !!S.opts.autoSpread;
  let seed = 20261020; const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };   // sorteio fixo: mesmo resultado sempre
  // encosta/sobrepõe considerando uma folga de conforto M entre os desenhos
  // segmento (linha do ponto até o ícone) cruza o retângulo (aumentado de m)?
  const segHit = (L, r, m) => { let t0 = 0, t1 = 1; const dx = L[2] - L[0], dy = L[3] - L[1];
    const P = [-dx, dx, -dy, dy], Q = [L[0] - (r[0] - m), (r[2] + m) - L[0], L[1] - (r[1] - m), (r[3] + m) - L[1]];
    for (let i = 0; i < 4; i++){ if (Math.abs(P[i]) < 1e-12){ if (Q[i] < 0) return false; } else { const t = Q[i]/P[i]; if (P[i] < 0){ if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; } } }
    return true; };
  const segX = (a, b) => { const d = (p, q, r) => (q[0]-p[0])*(r[1]-p[1]) - (q[1]-p[1])*(r[0]-p[0]);
    const A1 = [a[0], a[1]], A2 = [a[2], a[3]], B1 = [b[0], b[1]], B2 = [b[2], b[3]];
    return d(A1, A2, B1)*d(A1, A2, B2) < 0 && d(B1, B2, A1)*d(B1, B2, A2) < 0; };
  const hitM = (q, p) => Math.min(q[2], p[2]) - Math.max(q[0], p[0]) + M > 0 && Math.min(q[3], p[3]) - Math.max(q[1], p[1]) + M > 0;
  const n = S.rows.length;
  // partes fixas de cada município: ponto e nome (centralizado logo abaixo do ponto)
  const FIXED = S.rows.map(r => { const [sx, sy] = sedeXY(r), o = [[sx-SQ, sy-SQ, sx+SQ, sy+SQ]];
    if (S.opts.names){ const w = textW(r.name, ns, 700) + ns*0.3, d = PT_R + 0.35; o.push([sx - w/2, sy + d, sx + w/2, sy + d + nh]); }
    return o; });
  const ALLFIX = FIXED.flatMap((o, ri) => o.map(q => ({q, ri})));
  const PTS = S.rows.map(r => sedeXY(r));
  // posições candidatas do ícone (com as temperaturas) de um município, no tamanho atual dele
  function gen(r, ri, capGen){
    const [sx, sy] = sedeXY(r), pt = FIXED[ri][0], nameQ = FIXED[ri][1] || null;
    const cap = capGen || CAP_MAX;
    // só o que está por perto pode colidir (bem mais rápido do que testar o mapa inteiro a cada posição)
    const RAIO = Math.max(15, cap + 12) + 40, perto = q => Math.max(q[0] - sx, 0, sx - q[2]) < RAIO && Math.max(q[1] - sy, 0, sy - q[3]) < RAIO;
    const NF = ALLFIX.filter(f => perto(f.q)), NP = PTS.map((p, j) => [p, j]).filter(([p, j]) => j !== ri && Math.abs(p[0] - sx) < 2*RAIO && Math.abs(p[1] - sy) < 2*RAIO);
    void 0;                                        // gera até o afastamento máximo; quem decide o quanto usar é a busca
    const g = groupRects(r), [nx0, ny0] = iconXY(r);
    const blkR = g.solid, blkL = g.solid.map((q, k) => k ? [-q[2], q[1], -q[0], q[3]] : q), blkB = g.sob ? [g.solid[0], g.sob] : null;   // temperaturas à direita ou à esquerda
    const I = g.solid[0];
    const ic = [];
    const add = (x, y, c, left, fix) => { const R = (left === 'b' ? blkB : left ? blkL : blkR).map(s => [x+s[0], y+s[1], x+s[2], y+s[3]]);
      if (!fix){
        if (R.some(s => !(s[2] <= pt[0] || s[0] >= pt[2] || s[3] <= pt[1] || s[1] >= pt[3]))) return;      // cobre o próprio ponto
        if (nameQ && R.some(s => hitM(s, nameQ))) return;                                                  // cobre o próprio nome
      }
      ic.push({x, y, c: c + (left === 'b' ? 2.2 : left ? 0.9 : 0), left: left === true, below: left === 'b', R, fix}); };
    if (isPinned(r) || !auto){ add(nx0, ny0, 0, false, true); if (auto && blkR.length > 1) add(nx0, ny0, 0.9, true, true); }
    else for (const left of (blkR.length > 1 ? [false, true, 'b'] : [false])){
      const up = sy - SQ - 0.25 - I[3], dn = sy + SQ + 0.25 - I[1];
      for (const [yy, base] of [[up, 0], [dn, 2.2]]) for (const dx of [0, -1.5, 1.5, -3, 3, -5, 5, -7, 7, -9, 9])
        for (const ey of [0, 1, 2.2, 4, 6.5]) add(sx + dx, yy + (yy < sy ? -ey : ey), base + 0.3*Math.abs(dx) + (dx||ey ? 0.3 : 0), left);
      // ao lado do ponto, um pouco elevado para não encostar no próprio nome (bom perto da divisa, onde
      // não cabe acima): à direita com as temperaturas à direita, à esquerda com as temperaturas à esquerda
      { const topo = nameQ ? nameQ[1] - M - 0.05 : sy + I[3];
        const yl = Math.min(sy, topo - I[3]);
        const xs = left ? sx - SQ - 0.25 - I[2] : sx + SQ + 0.25 - I[0], dir = left ? -1 : 1;
        for (const ox of [0, 0.8, 1.8, 3, 4.5]) for (const oy of [-2, -1, 0, 1, 2.2, 3.5, 5]) add(xs + dir*ox, yl - oy, 0.8 + 0.6*ox + 0.5*oy, left); }
      // empilhado: ponto, nome e, logo abaixo do nome, o ícone centralizado (quando a faixa do estado é estreita)
      if (nameQ){ const yb = nameQ[3] + M + 0.05 - I[1];
        for (const dx of [0, -1.5, 1.5, -3, 3, -5, 5, -7, 7]) for (const oy of [0, 1]){ const n0 = ic.length; add(sx + dx, yb + oy, 1.6 + 0.4*Math.abs(dx) + 0.5*oy, left); if (ic.length > n0) ic[ic.length-1].stack = true; } }
      for (let k = 0; k < 36; k++){
        const th = -Math.PI/2 + k*Math.PI/18, dx = Math.cos(th), dy = Math.sin(th);
        const tx = dx > 1e-9 ? (SQ - I[0])/dx : dx < -1e-9 ? (-SQ - I[2])/dx : Infinity;
        const ty = dy > 1e-9 ? (SQ - I[1])/dy : dy < -1e-9 ? (-SQ - I[3])/dy : Infinity;
        const t0 = Math.max(0, Math.min(tx, ty)) + 0.25, ang = Math.min(k, 36-k)*24/36;
        for (const ex of [0, 0.7, 1.5, 2.5, 4, 5.5, 7.5, 10, 13, 16.5, 20, 24, 28, 33, 38, 44, 50]){ if (ex > cap + 3) break; add(sx + dx*(t0+ex), sy + dy*(t0+ex), 1.2 + 0.3*ang, left); }
      }
      // varredura fina ao redor do ponto: acha os vãos entre nomes e divisas que as posições acima não pegam
      { const G = Math.max(15, cap + 12), st = Math.max(1.2, G/16);
        for (let gx = -G; gx <= G; gx += st) for (let gy = -G + 2; gy <= G - 2; gy += st) add(sx + gx, sy + gy, 1.4, left); }
    }
    if (!ic.length) add(nx0, ny0, 0, false, true);
    const def = [sx, sy - SQ - 0.25 - I[3]];
    const out = [];
    for (const q of ic){
      q.out = q.R.reduce((t, s) => t + rectOut(...s), 0);
      if (q.out && !q.fix) continue;                                                      // ícone fora de Minas: descartado
      // não pode encostar em ponto ou nome de outro município (partes fixas)
      if (!q.fix && NF.some(f => f.ri !== ri && q.R.some(s => hitM(s, f.q)))) continue;
      // linha até o ícone (mesma regra do desenho): não pode cruzar nome/ponto de ninguém nem as próprias temperaturas
      { const I0 = q.R[0]; q.L = q.stack ? null : linhaIcone(sx, sy, q.x, q.y, (I0[2] - I0[0])/0.98, (I0[3] - I0[1])/0.98); }
      // com folga (o contorno branco dos textos é largo): nada de linha encostando em nome, ponto ou temperatura
      if (q.L && !q.fix && (NF.some(f => (f.ri !== ri || f.q !== pt) && segHit(q.L, f.q, 0.6)) || q.R.slice(1).some(s => segHit(q.L, s, 0.9)))) continue;
      const J = q.R[0], gx = Math.max(J[0] - sx, 0, sx - J[2]), gy = Math.max(J[1] - sy, 0, sy - J[3]);
      q.ex = Math.max(0, Math.hypot(gx, gy) - PT_R - 0.35);
      if (q.stack) q.ex = 0;                                                  // empilhado sob o nome: fica junto, sem linha
      q.cost = q.fix ? 0 : q.c + 1.8*q.ex + (q.ex > 3 ? 2.5*(q.ex - 3) : 0) + (q.stack ? 0 : 0.12*Math.hypot(q.x - def[0], q.y - def[1]));
      let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9; for (const s of q.R){ x1 = Math.min(x1, s[0]); y1 = Math.min(y1, s[1]); x2 = Math.max(x2, s[2]); y2 = Math.max(y2, s[3]); }
      if (q.L){ x1 = Math.min(x1, q.L[0]); y1 = Math.min(y1, q.L[1]); x2 = Math.max(x2, q.L[0]); y2 = Math.max(y2, q.L[1]); }
      q.bb = [x1, y1, x2, y2];
      // o ícone tem de ficar claramente mais perto do próprio ponto do que de qualquer outro município
      if (!q.fix && q.ex <= EX_PERTO){ const cx = (x1 + x2)/2, cy = (y1 + y2)/2, d0 = Math.hypot(cx - sx, cy - sy);   // afastado com linha: a linha já mostra de quem é
        if (NP.some(([p]) => Math.hypot(cx - p[0], cy - p[1]) < d0 + 2)) continue; }
      // clareza: quanto mais o ícone fica perto do ponto de OUTRO município (comparado ao próprio), mais caro —
      // empurra os afastados para o lado livre, longe dos vizinhos (espalha de forma mais homogênea)
      if (!q.fix){ const ix = (x1 + x2)/2, iy = (y1 + y2)/2, dO = Math.hypot(q.x - sx, q.y - sy); let dm = Infinity;
        for (const [P] of NP){ const d = Math.min(Math.hypot(q.x - P[0], q.y - P[1]), Math.hypot(ix - P[0], iy - P[1])); if (d < dm) dm = d; }
        q.cost += 1.6*Math.max(0, dO - dm + 4); }
      out.push(q);
    }
    out.sort((u, v) => u.cost - v.cost);
    // ícone nunca vai longe do ponto (nada de linhas compridas atravessando o mapa): só se aceita afastar
    // o mínimo que a própria geografia exige; se faltar espaço, o mapa todo diminui por igual
    const minEx = out.reduce((m, q) => Math.min(m, q.fix ? 0 : q.ex), Infinity);
    const lim = Math.max(cap, minEx + 1);
    void lim; return out;
  }
  const clash = (A, B) => { if (A.bb[0] > B.bb[2] + M || B.bb[0] > A.bb[2] + M || A.bb[1] > B.bb[3] + M || B.bb[1] > A.bb[3] + M) return false;
    for (const q of A.R) for (const p of B.R) if (hitM(q, p)) return true;
    if (A.L && B.R.some(p => segHit(A.L, p, 0.3))) return true;
    if (B.L && A.R.some(p => segHit(B.L, p, 0.3))) return true;
    if (A.L && B.L && segX(A.L, B.L)) return true;
    return false; };
  // tamanhos que um ícone pode assumir sozinho quando não cabe em lugar nenhum (relativos ao tamanho geral)
  // todos os ícones sempre do MESMO tamanho: nenhum diminui sozinho (quem não cabe perto do ponto vai um pouco
  // mais longe, com linha, ou fica logo abaixo do nome; se nem assim couber, o mapa todo reduz por igual)
  const STEPS = [1];
  // Todos os ícones no tamanho escolhido. Cada município começa podendo ficar só bem perto do próprio ponto;
  // se não houver arranjo sem encostar, só os municípios do aperto ganham um degrau a mais de afastamento
  // (com linha), e assim por diante — no fim, cada um volta para a posição livre mais próxima que houver.
  const items = S.rows.map((r, ri) => ({r, ri, step: 0, geo: 0, all: [], cands: [], sel: null, cap: EX_PERTO, minEx: 0}));
  // posições candidatas guardadas: dependem só do próprio município (ícone, temperaturas) e do que é fixo no
  // mapa, então ao trocar um ícone só ele é recalculado (deixa a edição leve)
  const baseGen = JSON.stringify([S.rows.map(r => r.id + "|" + r.name), S.opts.ptSede]);
  const chaveGen = it => baseGen + JSON.stringify([iconK(), it.r.id, it.r.tempo, shownTemps(it.r), S.opts.temps, S.opts.names, S.opts.nameSize, auto, isPinned(it.r), it.r.dx, it.r.dy]);
  for (const it of items){ ROW_K.delete(it.r.id); if (!vazio(it.r)){ const ck = chaveGen(it); it.all = GEN_CACHE.get(ck); if (!it.all){ it.all = gen(it.r, it.ri); if (GEN_CACHE.size > 600) GEN_CACHE.clear(); GEN_CACHE.set(ck, it.all); } it.minEx = it.all.reduce((m, q) => Math.min(m, q.fix ? 0 : q.ex), Infinity); if (!isFinite(it.minEx)) it.minEx = 0; } }
  const filtra = it => { const lim = Math.max(it.cap, it.minEx + 1); it.cands = it.all.filter(q => q.fix || q.ex <= lim); };
  const nb = items.map(it => items.filter(o => o !== it && Math.abs(FIXED[o.ri][0][0] - FIXED[it.ri][0][0]) < 95 && Math.abs(FIXED[o.ri][0][1] - FIXED[it.ri][0][1]) < 95));
  const free = (it, q) => nb[it.ri].every(o => !o.sel || !clash(q, o.sel));
  const ovPen = (A, B) => clash(A, B) ? 3000 : 0;
  const local = (it, q) => { let s = q.cost; for (const o of nb[it.ri]) if (o.sel) s += ovPen(q, o.sel); return s; };
  const freeEx = (it, q, ex) => nb[it.ri].every(o => o === ex || !o.sel || !clash(q, o.sel));
  const problemas = () => { const p = new Set(); for (const it of items){ if (vazio(it.r)) continue; if (!it.sel){ p.add(it); continue; }
    for (const o of nb[it.ri]) if (o.sel && clash(it.sel, o.sel)){ p.add(it); p.add(o); } } return p; };
  const resolve = () => {
    // 1) colocação inicial: quem tem menos opções primeiro
    items.forEach(it => { it.sel = null; });
    for (const it of items.slice().sort((u, v) => u.cands.length - v.cands.length)){ let best = null, bc = Infinity;
      for (const q of it.cands){ if (q.cost >= bc) break; const c = local(it, q); if (c < bc){ bc = c; best = q; } }
      it.sel = best || it.cands[0] || null; }
    // 2) recozimento simulado
    const live = items.filter(it => it.cands.length > 1);
    const IT = 9000, T0 = 1500, T1 = 0.5;
    for (let s = 0; s < IT && live.length; s++){
      const T = T0 * Math.pow(T1/T0, s/IT), it = live[Math.floor(rnd()*live.length)];
      const q = it.cands[Math.floor(Math.pow(rnd(), 1.5) * it.cands.length)]; if (q === it.sel) continue;
      const d = local(it, q) - local(it, it.sel);
      if (d <= 0 || rnd() < Math.exp(-d/T)) it.sel = q;
    }
    // 3) pares que ainda encostam procuram juntos duas posições livres
    for (let guard = 0; guard < 80; guard++){
      let A = null, B = null;
      for (const it of items){ if (!it.sel) continue; const o = nb[it.ri].find(o => o.sel && clash(it.sel, o.sel)); if (o){ A = it; B = o; break; } }
      if (!A) break;
      const qa = A.cands.filter(c => freeEx(A, c, B)).slice(0, 150), qb = B.cands.filter(c => freeEx(B, c, A)).slice(0, 150);
      let best = null, bc = Infinity;
      for (const x of qa){ if (x.cost >= bc) break; for (const y of qb){ const c = x.cost + y.cost; if (c >= bc) break; if (!clash(x, y)){ bc = c; best = [x, y]; } } }
      if (!best) break; A.sel = best[0]; B.sel = best[1];
    }
    // 4) se ainda sobrou: busca com retrocesso (menos opções livres primeiro, cortando dos vizinhos o que encostaria)
    if (auto && problemas().size){
      const act = items.filter(it => it.cands.length), ant = new Map(items.map(it => [it, it.sel]));
      const dom = new Map(act.map(it => [it, it.cands.slice(0, 260)]));
      act.forEach(it => { it.sel = null; });
      const viz = new Map(act.map(it => [it, act.filter(o => o !== it && nb[it.ri].includes(o))]));
      const t0 = performance.now(); let nos = 0;
      const acabou = () => nos > 20000 || performance.now() - t0 > 160;
      const busca = rest => {
        if (!rest.length) return true;
        if (++nos > 20000 || acabou()) return false;
        let bi = 0; for (let i = 1; i < rest.length; i++) if (dom.get(rest[i]).length < dom.get(rest[bi]).length) bi = i;
        const it = rest[bi], resto = rest.filter((_, i) => i !== bi), vz = viz.get(it).filter(o => !o.sel);
        for (const q of dom.get(it).slice(0, 30)){
          const sv = []; let morto = false;
          for (const o of vz){ const d0 = dom.get(o), d1 = d0.filter(c => !clash(q, c)); sv.push([o, d0]); dom.set(o, d1); if (!d1.length){ morto = true; break; } }
          if (!morto){ it.sel = q; if (busca(resto)) return true; it.sel = null; }
          for (const [o, d0] of sv) dom.set(o, d0);
          if (acabou()) return false;
        }
        return false;
      };
      if (!busca(act)) items.forEach(it => { it.sel = ant.get(it); });
    }
  };
  const NIV = [EX_PERTO, 8, 11, CAP_MAX];
  items.forEach(filtra); resolve();
  for (let v = 0; v < 10 && auto; v++){
    const p = problemas(); if (!p.size) break;
    let mudou = false;
    for (const it of p){ const nx = NIV.find(x => x > it.cap + 1e-6); if (nx != null){ it.cap = nx; filtra(it); mudou = true; } }
    if (!mudou) break;
    resolve();
  }
  // último recurso: quem ainda encosta pega a posição livre mais próxima entre todas as possíveis
  const reparaPares = () => {
  for (let guard = 0; guard < 40 && auto; guard++){   // pares que encostam: procura juntos em TODAS as posições possíveis
    let A = null, B = null;
    for (const it of items){ if (!it.sel) continue; const o = nb[it.ri].find(o => o.sel && clash(it.sel, o.sel)); if (o){ A = it; B = o; break; } }
    if (!A) break;
    const qa = A.all.filter(c => freeEx(A, c, B)).slice(0, 500), qb = B.all.filter(c => freeEx(B, c, A)).slice(0, 500);
    let best = null, bc = Infinity;
    for (const x of qa){ if (x.cost >= bc) break; for (const y of qb){ const c = x.cost + y.cost; if (c >= bc) break; if (!clash(x, y)){ bc = c; best = [x, y]; } } }
    if (!best){
      // nem em dupla: tira do caminho o vizinho mais "folgado" de A e tenta de novo
      const C = nb[A.ri].filter(o => o !== B && o.sel && o.all.length > 1 && A.all.some(c => clash(c, o.sel))).sort((u, v) => v.all.length - u.all.length)[0];
      if (!C) break; const keep = C.sel; C.sel = null;
      const qa2 = A.all.filter(c => freeEx(A, c, B)).slice(0, 500);
      let b2 = null, c2 = Infinity;
      for (const x of qa2){ if (x.cost >= c2) break; for (const y of qb){ const c = x.cost + y.cost; if (c >= c2) break; if (!clash(x, y)){ c2 = c; b2 = [x, y]; } } }
      if (b2){ A.sel = b2[0]; B.sel = b2[1]; C.sel = C.all.find(c => free(C, c)) || keep; } else { C.sel = keep; break; }
      continue;
    }
    A.sel = best[0]; B.sel = best[1];
  }
  };
  reparaPares();
  // se ainda assim não couber, só os do aperto podem ir ainda mais longe
  for (let rd = 0; rd < 6 && auto; rd++){ const p = [...problemas()]; if (!p.length) break;
    p.sort((u, v) => u.all.length - v.all.length);
    for (const it of p){ if (it.sel && free(it, it.sel)) continue; const prev = it.sel; it.sel = null;
      it.sel = it.all.find(c => free(it, c)) || prev; } }
  // acabamento: cada um vai para a posição livre mais próxima que existir (desfaz afastamentos desnecessários)
  if (!problemas().size) for (let rd = 0; rd < 4; rd++){ let ch = false;
    for (const it of items.filter(it => it.sel).sort((u, v) => v.sel.cost - u.sel.cost)){
      const b = it.all.find(c => c.cost < it.sel.cost - 1e-9 && free(it, c)); if (b){ it.sel = b; ch = true; } }
    if (!ch) break; }
  // melhora em grupo: o município pior colocado e os vizinhos dele (até 5) são reposicionados juntos, buscando o
  // arranjo de menor custo total sem encostar (um pode abrir espaço para o outro ficar perto do próprio ponto)
  if (auto && !problemas().size){
    const t0 = performance.now(), tentados = new Set();
    for (let rodada = 0; rodada < 40 && performance.now() - t0 < 220; rodada++){
      const pior = items.filter(it => it.sel && !it.sel.fix && !tentados.has(it)).sort((u, v) => v.sel.cost - u.sel.cost)[0];
      if (!pior || pior.sel.cost < 3) break;
      tentados.add(pior);
      const cx = FIXED[pior.ri][0][0], cy = FIXED[pior.ri][0][1];
      // quem está ocupando as posições melhores do pior colocado entra no grupo primeiro; depois os mais próximos
      const melhores = pior.all.filter(c => c.cost < pior.sel.cost).slice(0, 60), bloq = new Map();
      for (const c of melhores) for (const o of nb[pior.ri]) if (o.sel && !o.sel.fix && o.all.length > 1 && clash(c, o.sel)) bloq.set(o, (bloq.get(o) || 0) + 1);
      const perto = nb[pior.ri].filter(o => o.sel && !o.sel.fix && o.all.length > 1 && !bloq.has(o))
        .sort((u, v) => Math.hypot(FIXED[u.ri][0][0] - cx, FIXED[u.ri][0][1] - cy) - Math.hypot(FIXED[v.ri][0][0] - cx, FIXED[v.ri][0][1] - cy));
      const U = [pior, ...[...bloq.keys()].sort((u, v) => bloq.get(v) - bloq.get(u)), ...perto].slice(0, 5);
      const ant = U.map(it => it.sel), custoAnt = ant.reduce((t, q) => t + q.cost, 0);
      U.forEach(it => { it.sel = null; });
      const op = U.map(it => it.all.filter(c => free(it, c)).slice(0, 70));
      if (op.some(o => !o.length)){ U.forEach((it, i) => { it.sel = ant[i]; }); continue; }
      const ord = U.map((it, i) => i).sort((a, b) => op[a].length - op[b].length);
      const minR = []; for (let k = ord.length - 1, acc = 0; k >= 0; k--){ acc += op[ord[k]][0].cost; minR[k] = acc; }
      let melhor = null, mc = custoAnt - 0.3, nos = 0; const esc = [];
      const bb = (k, soma) => {
        if (++nos > 60000) return;
        if (k === ord.length){ mc = soma; melhor = esc.slice(); return; }
        if (soma + minR[k] >= mc) return;
        const i = ord[k];
        for (const q of op[i]){
          if (soma + q.cost + (k + 1 < ord.length ? minR[k + 1] : 0) >= mc) break;
          let ok = true; for (let t = 0; t < k; t++) if (clash(q, esc[t])){ ok = false; break; }
          if (!ok) continue;
          esc[k] = q; bb(k + 1, soma + q.cost);
        }
      };
      bb(0, 0);
      if (melhor) ord.forEach((i, k) => { U[i].sel = melhor[k]; }); else U.forEach((it, i) => { it.sel = ant[i]; });
    }
  }
  for (const it of items) it.cands = it.all;
  // resultado
  let pen = 0, maxEx = 0, out = 0, excSum = 0, menores = 0, longe = 0; const far = [];
  const prob = new Set();
  for (const it of items){ const q = it.sel; if (!q){ if (!vazio(it.r)){ pen += 100; prob.add(it.r.id); } continue; }   // sem lugar livre nenhum: este tamanho não serve
    out += q.out || 0; maxEx = Math.max(maxEx, q.ex || 0); if (it.step > (it.geo || 0)) menores += STEPS[it.step] < 0.76 ? 2 : 1;
    // afastamento além do que a própria geografia já exige (pontas do estado, nomes fixos vizinhos)
    const minEx = it.cands.length ? Math.min(...it.cands.map(c => c.ex || 0)) : 0, lim = Math.max(3, minEx + 1.5);
    longe += Math.max(0, (q.ex || 0) - EX_MAX);
    if ((q.ex || 0) > lim){ far.push(it.r.name + ':' + q.ex.toFixed(1)); excSum += q.ex - lim; }
    for (const o of nb[it.ri]) if (o.ri > it.ri && o.sel){ if (clash(q, o.sel)){ prob.add(it.r.id); prob.add(o.r.id); } for (const a1 of q.R) for (const b1 of o.sel.R) if (Math.min(a1[2], b1[2]) - Math.max(a1[0], b1[0]) > 0.02 && Math.min(a1[3], b1[3]) - Math.max(a1[1], b1[1]) > 0.02) pen++; }
    for (const f of ALLFIX) if (f.ri !== it.ri) for (const a1 of q.R) if (Math.min(a1[2], f.q[2]) - Math.max(a1[0], f.q[0]) > 0.02 && Math.min(a1[3], f.q[3]) - Math.max(a1[1], f.q[1]) > 0.02) pen++;
    if (it.step === 0) ROW_K.delete(it.r.id);
    const [x0, y0] = iconXY(it.r);
    AUTO.set(it.r.id, [q.x - x0, q.y - y0]);
    if (FIXED[it.ri][1]) NAME_POS.set(it.r.id, FIXED[it.ri][1]);
    if (q.left) TEMP_LEFT.add(it.r.id);
    if (q.below) TEMP_BELOW.add(it.r.id);
    if (q.stack) STACKED.add(it.r.id);
  }
  return {prob: [...prob], ok: pen === 0 && out === 0 && longe === 0 && excSum <= 6 && menores <= 3, valid: pen === 0 && out === 0 && !prob.size, excSum: excSum + 2*menores + 25*longe, longe, pen, out, maxEx, far};
}
let AUTO_KEY = "", AUTO_INFO = null, LAST_K = null, AJUSTE = null; const MEMO_K = new Map();
const dadosAuto = () => JSON.stringify([S.opts.ptSede, S.opts.temps, S.opts.autoSpread, S.opts.names, S.opts.nameSize, S.rows.map(r => [r.id, r.name, r.tempo, String(r.tmax ?? "").length, String(r.tmin ?? "").length, r.dx, r.dy])]);
const chaveAuto = () => JSON.stringify([S.opts.ptSede, S.opts.temps, S.opts.autoSpread, S.opts.names, S.opts.iconScale, S.opts.nameSize, S.rows.map(r => [r.id, r.name, r.tempo, String(r.tmax ?? "").length, String(r.tmin ?? "").length, r.dx, r.dy])]);
function computeAuto(){
  const key = chaveAuto();
  if (key === AUTO_KEY) return;            // nada mudou desde o último cálculo
  AUTO_KEY = key; AUTO = new Map(); NAME_UP = new Set(); NAME_POS = new Map(); TEMP_LEFT = new Set(); TEMP_BELOW = new Set(); EFF_K = null; AUTO_INFO = null; ROW_K = new Map(); STACKED = new Set();
  if (S.opts.ptSede){
    // O tamanho é sempre o escolhido pela pessoa (nada de redução automática). Primeiro tenta com os ícones
    // bem perto das sedes; se não couber sem sobrepor, aceita afastar um pouco mais (com linha curta).
    const run = (k, ex) => { const ck = dadosAuto() + "|" + k; if (MEMO_K.has(ck)) return MEMO_K.get(ck); EX_MAX = ex; EFF_K = k; AUTO = new Map(); NAME_POS = new Map(); TEMP_LEFT = new Set(); TEMP_BELOW = new Set(); ROW_K = new Map(); STACKED = new Set(); const res = layoutSede(); EX_MAX = EX_PERTO; const o = {k, res, A:AUTO, N:NAME_POS, T:TEMP_LEFT, TB:TEMP_BELOW, RK:ROW_K, ST:STACKED}; if (MEMO_K.size > 40) MEMO_K.clear(); MEMO_K.set(ck, o); return o; };
    // Tamanho sempre o escolhido (nunca diminui). Se não couber, só os municípios apertados ganham permissão
    // de se afastar, um degrau por vez (linha fina até o ponto) — o mínimo necessário para não sobrepor
    // nem sair de Minas; quem tem espaço continua colado no próprio ponto.
    // Limite real: se nem afastando com linha couber sem sobrepor/sair de Minas, fica no maior tamanho que cabe
    // (procura rápida por bissecção, de 5 em 5%) e avisa uma vez.
    let s0 = S.opts.iconScale || 1, r1 = run(s0, EX_PERTO);
    if (S.opts.autoSpread && !r1.res.valid){
      const st = v => Math.round(v*20)/20;
      let lo = 0.2, hi = s0, best = null;
      const prev = LAST_K && LAST_K.dados === dadosAuto() && LAST_K.ok ? LAST_K.k : null;
      if (prev != null && prev < s0){ lo = prev; best = run(prev, EX_PERTO); }
      while (hi - lo > 0.05 + 1e-6){ const mid = st((lo + hi)/2); if (mid <= lo + 1e-6 || mid >= hi - 1e-6) break; const x = run(mid, EX_PERTO); if (x.res.valid){ lo = mid; best = x; } else hi = mid; }
      if (!best || !best.res.valid){ let k = st(lo); best = run(k, EX_PERTO); while (!best.res.valid && k > 0.2 + 1e-6){ k = st(k - 0.05); best = run(k, EX_PERTO); } }
      if (best.k < s0 - 1e-6){
        AJUSTE = {de: Math.round(s0*100), para: Math.round(best.k*100)};
        S.opts.iconScale = best.k; s0 = best.k; r1 = best;
        setTimeout(() => { fillOpts(); persist(); }, 0);
      }
    }
    EFF_K = r1.k === s0 ? null : r1.k; AUTO = r1.A; NAME_POS = r1.N; TEMP_LEFT = r1.T; TEMP_BELOW = r1.TB || new Set(); ROW_K = r1.RK; STACKED = r1.ST;
    AUTO_INFO = r1; LAST_K = {s0, k: r1.k, ok: r1.res.valid, dados: dadosAuto()}; AUTO_KEY = chaveAuto();
    return; }
  // cada retângulo: [x1, y1, x2, y2, tipo] relativo ao ponto do ícone; tipo 0 = ícone/temperatura, 1 = nome
  const PT = !!S.opts.ptSede;
  const G = S.rows.map(r => { const [x, y] = iconXY(r); const g = groupRects(r);
    const rects = [...g.solid.map(q => [...q, 0]), ...(PT ? [] : g.name.map(q => [...q, 1]))];
    return {r, x, y, ox:0, oy:0, okx:0, oky:0, mob: isPinned(r) ? 0 : 1, rects, below:g.below, above:g.above}; });
  if (PT) for (const r of S.rows){                              // ponto + nome de cada sede: fixos
    const [sx, sy] = sedeXY(r), rects = [[-PT_R-0.3, -PT_R-0.3, PT_R+0.3, PT_R+0.3, 0]];
    if (S.opts.names){ const q = nomeSedeRect(r); rects.push([q[0]-sx, q[1]-sy, q[2]-sx, q[3]-sy, 1]); }
    G.push({r:null, x:sx, y:sy, ox:0, oy:0, okx:0, oky:0, mob:0, rects});
  }
  if (!S.opts.autoSpread){ G.forEach(g => g.r && AUTO.set(g.r.id, [0,0])); return; }
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
    for (const g of G){ if (!g.r || !g.mob) continue;   // pontos/nomes fixos da sede não trocam de lado
      const ni = g.rects.findIndex(q => q[4] === 1); if (ni < 0) continue;
      const cur = overlapArea(g, g.below); if (cur < 0.5) continue;
      if (overlapArea(g, g.above) < cur*0.5){ g.rects[ni] = [...g.above, 1]; bbox(g); NAME_UP.add(g.r.id); flipped = true; } }
    if (!flipped) break;
  }
  G.forEach(g => g.r && AUTO.set(g.r.id, [g.ox, g.oy]));
}
const finalXY = r => { const [x, y] = iconXY(r), a = AUTO.get(r.id) || [0,0]; return [x + a[0], y + a[1]]; };

/* ================= base cartográfica da equipe (previsao/data/base-mg.js) =================
   Vetores já projetados no quadro do mapa: nítidos a 300 dpi, leves e sem imagens externas.
   Tudo é recortado pelo contorno de Minas Gerais. */
const BASE = (typeof window !== "undefined" && window.BASE_CARTO) || null;
// Se o OpenStreetMap estiver escolhido mas não tiver carregado, a base vetorial aparece no lugar dele.
const useBase = k => !!S.opts[k] || (typeof liveById === "function" && !!liveById(S.bgActive) && !liveById(S.bgActive).src);
// A base de rios, rodovias e áreas urbanas foi retirada da ferramenta (1.14): o fundo vem dos mapas base.
const baseOn = () => false;
function baseCartoSVG(){
  if (!baseOn()) return "";
  const o = [`<g clip-path="url(#mapclipMG)">`];
  if (useBase("baseUrb") && BASE.urbano) o.push(`<path d="${BASE.urbano}" fill="#e4ddd3" fill-rule="nonzero" stroke="none"/>`);
  if (useBase("baseRod") && BASE.rodovias){
    for (const [w, sw] of [["1", .16], ["2", .24], ["3", .34]])
      if (BASE.rodovias[w]) o.push(`<path d="${BASE.rodovias[w]}" fill="none" stroke="#c2b6a4" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }
  if (useBase("baseHidro")){
    for (const [w, sw] of [["1", .22], ["2", .34], ["3", .5]])
      if (BASE.rios && BASE.rios[w]) o.push(`<path d="${BASE.rios[w]}" fill="none" stroke="#7fb2dc" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`);
    if (BASE.represas) o.push(`<path d="${BASE.represas}" fill="#b4d4ec" stroke="#7fb2dc" stroke-width=".12" stroke-linejoin="round"/>`);
  }
  o.push(`</g>`);
  return o.join("");
}

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
  o.push(`<clipPath id="mapclipMG"><path d="${GEO.mg}"/></clipPath>`);
  const bg = activeBg();
  if (bg && bg.src){
    const b = bg.bounds || fullExtent(), clip = S.opts.bgClipMG !== false;   // por padrão o fundo aparece só dentro de Minas, como nos layouts do QGIS
    o.push(`${clip ? `<g clip-path="url(#mapclipMG)">` : ""}<image href="${bg.src}" xlink:href="${bg.src}" x="${f2((b.w-MAP.xmin)*K)}" y="${f2((MAP.ymax-b.n)*K)}" width="${f2((b.e-b.w)*K)}" height="${f2((b.n-b.s)*K)}" preserveAspectRatio="none" opacity="${bg.opacity ?? 1}"/>${clip ? "</g>" : ""}`);
  }
  o.push(`<path d="${GEO.states}" fill="none" stroke="#000" stroke-width="0.22" stroke-linejoin="round"/>`);
  if (!bg || !bg.src || S.opts.mgFill) o.push(`<path d="${GEO.mg}" fill="#ecf4f5" stroke="none"/>`);
  o.push(baseCartoSVG());
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
  const L_ICON = [], L_NAME = [], L_TEMP = [], L_PT = [], L_LINE = [];
  computeAuto();
  for (const r of S.rows){
    const c = CAT[r.tempo] || CAT[NONE];
    const [px, py] = finalXY(r);
    const x = px - MAP.x, y = py - MAP.y;
    const [w, h] = iconDims(c, iconKr(r));
    const tsz = tempSz(r);
    const [mx, mn] = shownTemps(r);
    const vz = vazio(r);
    if (!vz) L_ICON.push(`<g class="mk" data-id="${r.id}">` + (forExport ? "" : `<rect class="hit" x="${f2(x-w/2-1)}" y="${f2(y-h/2-1)}" width="${f2(w+2)}" height="${f2(h+2)}" rx="2" fill="transparent"/>`)
      + `<image href="${c.src}" xlink:href="${c.src}" x="${f2(x-w/2)}" y="${f2(y-h/2)}" width="${f2(w)}" height="${f2(h)}" preserveAspectRatio="xMidYMid meet"/></g>`);
    if (S.opts.ptSede){
      const [sx, sy] = sedeXY(r), qx = sx - MAP.x, qy = sy - MAP.y;
      // linha fina do ponto até o ícone quando ele precisou ficar mais afastado
      const Ln = !vz && !STACKED.has(r.id) ? linhaIcone(qx, qy, x, y, w, h) : null;
      if (Ln) L_LINE.push(`<line x1="${f2(Ln[0])}" y1="${f2(Ln[1])}" x2="${f2(Ln[2])}" y2="${f2(Ln[3])}" stroke="#ffffff" stroke-width="0.9" stroke-linecap="round" opacity=".85"/><line x1="${f2(Ln[0])}" y1="${f2(Ln[1])}" x2="${f2(Ln[2])}" y2="${f2(Ln[3])}" stroke="#2b3440" stroke-width="0.35" stroke-linecap="round"/>`);
      L_PT.push(`<circle cx="${f2(qx)}" cy="${f2(qy)}" r="${PT_R}" fill="#ffffff" stroke="#1f2328" stroke-width="0.25"/>`);
      const nr = NAME_POS.get(r.id), ncx = nr ? (nr[0]+nr[2])/2 - MAP.x : qx, nty = nr ? nr[1] - MAP.y : qy + PT_R + 0.35;
      if (S.opts.names) L_NAME.push(`<text x="${f2(ncx)}" y="${f2(nty + ASC*ns)}" font-family="${FONT}" font-size="${f2(ns)}" font-weight="700" fill="${navy}" text-anchor="middle" stroke="#fff" stroke-width="${f2(ns*0.3)}" stroke-linejoin="round" paint-order="stroke">${esc(r.name)}</text>`);
    }
    const nyTop = vz ? y - (ASC+DESC)*ns/2 : NAME_UP.has(r.id) ? y-h/2-0.3-(ASC+DESC)*ns : y+h/2+0.3;
    if (S.opts.names && !S.opts.ptSede) L_NAME.push(`<g class="mk" data-id="${r.id}"><text x="${f2(x)}" y="${f2(nyTop+ASC*ns)}" font-family="${FONT}" font-size="${f2(ns)}" font-weight="700" fill="${navy}" text-anchor="middle" stroke="#fff" stroke-width="${f2(ns*0.3)}" stroke-linejoin="round" paint-order="stroke">${esc(r.name)}</text></g>`);
    const tl = TEMP_LEFT.has(r.id), tb = TEMP_BELOW.has(r.id);
    const lab = (v, col, base) => `<text x="${f2(tb ? x : tl ? x-w/2-1.3 : x+w/2+1.3)}" y="${f2(base)}"${tb ? ' text-anchor="middle"' : tl ? ' text-anchor="end"' : ''} font-family="${FONT}" font-size="${f2(tsz)}" font-weight="700" fill="${col}" stroke="#fff" stroke-width="1.2" stroke-linejoin="round" paint-order="stroke">${esc(fmtTemp(v))}°C</text>`;
    // com as duas: máxima em cima e mínima embaixo; com uma só: centralizada ao lado do ícone
    const one = y + (ASC-DESC)/2*tsz, both = mx != null && mn != null;
    const lhT = (ASC+DESC)*tsz*0.92, yb = y + h/2*0.98 + 0.15 + 0.15 + ASC*tsz;   // temperaturas embaixo: máxima e, abaixo, mínima
    const yMx = tb ? yb : (both ? y + 0.4 - DESC*tsz : one), yMn = tb ? (mx != null ? yb + lhT : yb) : (both ? y + 0.4 + ASC*tsz : one);
    if (!vz && (mx != null || mn != null)) L_TEMP.push(`<g class="mk" data-id="${r.id}">` + (mx != null ? lab(mx, "#cc2029", yMx) : "") + (mn != null ? lab(mn, "#1764bf", yMn) : "") + `</g>`);
  }
  o.push(...L_LINE, ...L_ICON, ...L_PT, ...L_NAME, ...L_TEMP);   // ícone, ponto da sede, nome e, por cima, as temperaturas
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
  o.push(`<svg x="19.3411" y="166.3" width="7.7942" height="9.08866" viewBox="0 0 61.06 96.62">${NORTH_ARROW}</svg>`);
  // escala gráfica (caixa simples, 2 × 50 km)
  { const seg = 8.35894, ss = 9*PT, bx = 11.6913+1+textW("0",ss)/2, by = 184.0, ly = by - 1.6 - DESC*ss;
    o.push(`<rect x="${f2(bx)}" y="${by}" width="${seg}" height="3" fill="#000" stroke="#000" stroke-width=".3"/>`);
    o.push(`<rect x="${f2(bx+seg)}" y="${by}" width="${seg}" height="3" fill="#fff" stroke="#000" stroke-width=".3"/>`);
    [["0",0],["50",seg],["100",2*seg]].forEach(([t,dx]) => o.push(`<text x="${f2(bx+dx)}" y="${f2(ly)}" font-family="${FONT}" font-size="${f2(ss)}" fill="#000" text-anchor="middle">${t}</text>`));
    o.push(`<text x="${f2(bx+2*seg+textW("100",ss)/2+1)}" y="${f2(ly)}" font-family="${FONT}" font-size="${f2(ss)}" fill="#000">km</text>`); }

  /* ---- legenda ---- */
  o.push(textBlock({lines:["Legenda"], x:COL, yTop:22.7706, h:6.78946, size:16*PT, weight:700, fill:navy, anchor:"middle"}));
  o.push(`<rect x="${f2(COL-LIN_W/2)}" y="34.1727" width="${LIN_W}" height="0.266644" fill="rgb(138,187,228)"/>`);
  { const cats = usedCats();
    // área da legenda: entre a linha abaixo do título e a linha da validade, centrada sob "Legenda"
    const top = 36.6, bottom = 157.8, cx = COL, maxW = 61.5;
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
  o.push(`<rect x="${f2(COL-LIN_W/2)}" y="159.499" width="${LIN_W}" height="0.256388" fill="rgb(138,187,228)"/>`);
  const vt = validityText(), val = vt || "Validade não informada";
  o.push(textBlock({lines:[val], x:COL, yTop:160.906, h:8.28892, size:fitSize([val],10*PT,67.7,400), fill: vt ? navy : "#8a97a8", anchor:"middle"}));
  o.push(`<rect x="${f2(COL-LIN_W/2)}" y="170.345" width="${LIN_W}" height="0.256388" fill="rgb(138,187,228)"/>`);
  const year = (S.date || todayISO()).slice(0,4);
  let cred = (S.texts.credits || "").replace(/\{ano\}/g, year).split("\n")
    .map(l => baseOn() && /^\s*Base cartográfica\s*:/i.test(l) ? `Base cartográfica: ${BASE.credito}` : l);
  { const ab = activeBg();
    if (ab && ab.src && ab.credito){
      const i = cred.findIndex(l => /^\s*(Basemap|Mapa base|Fundo)\s*:/i.test(l));
      if (i >= 0) cred[i] = `Mapa base: ${ab.credito}`;
      else { const j = cred.findIndex(l => /^\s*Base cartográfica\s*:/i.test(l)); cred.splice(j >= 0 ? j + 1 : cred.length, 0, `Mapa base: ${ab.credito}`); }
    } }
  o.push(textBlock({lines:cred, x:COL, yTop:172.909, h:13.3322, size:fitSize(cred,6.68628*PT,62,400), fill:navy, anchor:"middle"}));

  /* ---- rodapé ---- */
  [[4.30732,194.2,289.001,14.3,3.28177],[4.51243,194.4,288.59,13.9,3.07666],[4.71754,194.6,288.18,13.5,2.87155]]
    .forEach(([x,y,w,h,r]) => o.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="rgb(57,152,207)" fill-opacity=".02"/>`));
  o.push(`<rect x="4.92265" y="194.8" width="287.77" height="13.1" rx="2.46133" fill="rgb(249,252,255)" stroke="rgb(135,196,239)" stroke-width="0.307666"/>`);
  for (const it of logoLayout()){
    if (it.sep != null){ o.push(`<rect x="${f2(it.sep)}" y="197.4" width="0.276899" height="7.9" fill="rgb(32,153,234)"/>`); continue; }
    const {s, L, x, w, h} = it, cy = LOGO_Y + LOGO_H/2;
    if (L) o.push(`<image href="${L.src}" xlink:href="${L.src}" x="${f2(x)}" y="${f2(cy-h/2)}" width="${f2(w)}" height="${f2(h)}"/>`);
    else if (!forExport){
      o.push(`<rect x="${f2(x)}" y="${f2(cy-h/2)}" width="${f2(w)}" height="${f2(h)}" rx="1.2" fill="none" stroke="#b7cde2" stroke-width=".25" stroke-dasharray="1 .8"/>`);
      o.push(`<text x="${f2(x+w/2)}" y="${f2(cy+1)}" font-family="${FONT}" font-size="2.6" fill="#8fa8c2" text-anchor="middle">${esc(s.name)}</text>`);
    }
  }
  // texto do rodapé: quebra de linha automática na largura do quadro, com a maior letra que couber na altura
  // (editar o texto não encolhe mais tudo numa linha só)
  const ft = wrapFit(S.texts.footer || "", 90.5, 11.5, 8.5*PT, 5.5*PT);
  o.push(textBlock({lines:ft.lines, x:200.624, yTop:195.6, h:11.5, size:ft.size, fill:navy}));
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
    const so = $("#szOut");
    if (so){ const u = Math.round((S.opts.iconScale||1)*100), e = Math.round(iconK()*100);
      so.textContent = `${u}%`; void e; so.title = "";
      if (AJUSTE){ const a = AJUSTE; AJUSTE = null; avisoTamanho(`Limite: ${a.para}% é o maior tamanho em que todos os ícones cabem sem se sobrepor e dentro de Minas.`); }
    }
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
  if (!blockInMG(drag.r, drag.cx0 + ddx, drag.cy0 + ddy)) return;   // fora de Minas Gerais: fica na última posição válida
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
const op = {mun:$("#opMun"), meso:$("#opMeso"), mesoNames:$("#opMesoNames"), states:$("#opStates"), names:$("#opNames"), autoSpread:$("#opAuto"), ptSede:$("#opPtSede")};
op.mgFill = $("#opMgFill"); op.bgClipMG = $("#opBgClip");

const rng = {iconScale:[$("#opIconScale"), $("#outIconScale"), v => Math.round(v*100)+"%"], nameSize:[$("#opNameSize"), $("#outNameSize"), v => (v/PT).toFixed(0)+" pt"]};
{ const st = document.createElement("style"); st.textContent = "#szAviso{position:absolute;z-index:50;background:#1f2328;color:#fff;font-size:12px;line-height:1.35;padding:6px 9px;border-radius:6px;max-width:250px;box-shadow:0 4px 14px rgba(0,0,0,.25);pointer-events:none;transition:opacity .3s}"; document.head.appendChild(st); }
let avisoT = 0;
function avisoTamanho(txt){
  const so = $("#szOut"); if (!so || !txt) return;
  let b = document.getElementById("szAviso"); if (!b){ b = document.createElement("div"); b.id = "szAviso"; document.body.appendChild(b); }
  const r = so.getBoundingClientRect(); b.textContent = txt; b.style.opacity = "1";
  b.style.left = Math.max(8, r.left + window.scrollX - 70) + "px"; b.style.top = (r.bottom + window.scrollY + 6) + "px";
  clearTimeout(avisoT); avisoT = setTimeout(() => { b.style.opacity = "0"; }, 3500);
}
function fillOpts(){ S.opts.iconScale = Math.min(1, Math.max(0.2, +S.opts.iconScale || 0.5)); for (const k in op) op[k].checked = !!S.opts[k]; for (const k in rng){ rng[k][0].value = S.opts[k]; rng[k][1].textContent = rng[k][2](S.opts[k]); }
  $("#szOut").textContent = Math.round((S.opts.iconScale||1)*100) + "%"; }
function stepIcons(d){ S.opts.iconScale = Math.round(Math.min(1, Math.max(0.2, (S.opts.iconScale||1) + d))*100)/100; fillOpts(); persist(); drawPreview(); }
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
const activeBg = () => { const b = BG.find(b => b.id === S.bgActive) || null; return b && (b.src || b.live) ? b : null; };
/* Fundo da equipe: imagem publicada no GitHub em previsao/data/fundo.js (window.MAPA_FUNDO).
   Vale para todos; não fica no IndexedDB. Só a opacidade escolhida fica salva no navegador. */
const MF = (typeof window !== "undefined" && window.MAPA_FUNDO && window.MAPA_FUNDO.src && window.MAPA_FUNDO.bounds) ? window.MAPA_FUNDO : null;
const TEAM_BG = MF ? {id:"equipe", team:true, name:`Fundo da equipe — ${MF.nome || "mapa base"}`, src:MF.src, bounds:{...MF.bounds}, opacity:(S.opts.teamOp ?? MF.opacidade ?? 1), credito:MF.credito || ""} : null;
/* Mapas base carregados ao vivo a cada sessão (imagens do servidor de cada projeto).
   Ordem: OSM padrão (principal) -> OSM França (reserva 1) -> OSM Alemanha (reserva 2), todos no estilo do OSM padrão.
   Se o principal não responder, a ferramenta passa sozinha para a reserva seguinte e avisa.
   A imagem é montada no navegador e reprojetada de Web Mercator para latitude/longitude.
   Não é guardada no IndexedDB nem vira fundo.js: os servidores não permitem uso offline.
   O navegador usa o próprio cache HTTP, como em qualquer mapa na web. */
const OSM_Z = 8, OSM_W = 3400;
const sub = (x, y) => "abc"[(x + y) % 3];
// OpenFreeMap: gratuito, sem chave e sem limite (openfreemap.org). Vetorial: o navegador desenha o mapa
// com a biblioteca MapLibre (previsao/lib/maplibre-gl.js), e todas as camadas de texto são retiradas.
const OFM_STYLE = "https://tiles.openfreemap.org/styles/liberty";
// Créditos no mesmo formato para todos os mapas: "Mapa base: © <dados> — estilo <mapa>" (cabe numa linha,
// com o mesmo tamanho de letra em qualquer mapa).
const LIVE = [
  {id:"osm", nome:"OpenStreetMap — padrão", curto:"OpenStreetMap padrão", amarelo:true,
   url:(z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
   credito:"© OpenStreetMap — estilo padrão"},
  {id:"osmfr", nome:"OpenStreetMap França (reserva 1)", curto:"OpenStreetMap França",
   url:(z, x, y) => `https://${sub(x, y)}.tile.openstreetmap.fr/osmfr/${z}/${x}/${y}.png`,
   credito:"© OpenStreetMap — estilo OSM França"},
  {id:"osmde", nome:"OpenStreetMap Alemanha (reserva 2)", curto:"OpenStreetMap Alemanha",
   url:(z, x, y) => `https://tile.openstreetmap.de/${z}/${x}/${y}.png`,
   credito:"© OpenStreetMap — estilo OSM Alemanha"},
  {id:"ofm", nome:"OpenFreeMap — sem nomes", curto:"OpenFreeMap (sem nomes)", reserva:false, vector:true, style:OFM_STYLE,
   credito:"© OpenStreetMap © OpenMapTiles — estilo OpenFreeMap"}
];
LIVE.forEach(L => Object.assign(L, {live:true, name:L.nome + " — da internet", src:null, bounds:null, promise:null, failed:false,
  opacity:(S.opts["op_" + L.id] ?? (L.id === "osm" ? S.opts.osmOp : undefined) ?? 1)}));
const OSM_BG = LIVE[0];
if (S.bgActive === "otm") S.bgActive = "osmde";             // 1.14 inicial usava o OpenTopoMap como reserva 2
if (S.livePref === "otm") S.livePref = "osmde";
const liveById = id => LIVE.find(L => L.id === id) || null;
function liveLoad(L){
  if (L.src) return Promise.resolve(true);
  if (L.promise) return L.promise;
  if (L.vector){ L.promise = vectorLoad(L).catch(err => { L.promise = null; L.failed = true; throw err; }); return L.promise; }
  L.promise = (async () => {
    const n = 2 ** OSM_Z, T = 256;
    const lx = lon => (lon + 180) / 360 * n * T;
    const my = lat => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n * T; };
    const ex = fullExtent();
    const x0 = Math.floor(lx(ex.w) / T), x1 = Math.floor(lx(ex.e) / T), y0 = Math.floor(my(ex.n) / T), y1 = Math.floor(my(ex.s) / T);
    const st = document.createElement("canvas"); st.width = (x1 - x0 + 1) * T; st.height = (y1 - y0 + 1) * T;
    const g = st.getContext("2d");
    const jobs = []; for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) jobs.push([x, y]);
    let i = 0, falhas = 0, bloqueado = false;
    // O servidor do OSM devolve uma imagem amarela e preta "Access blocked" quando recusa o pedido.
    // Ela é detectada pelas listras amarelas saturadas (que não existem no estilo padrão) e nada é desenhado.
    const tc = document.createElement("canvas"); tc.width = tc.height = 64; const tg = tc.getContext("2d", {willReadFrequently:true});
    const ehBloqueio = bm => { tg.clearRect(0, 0, 64, 64); tg.drawImage(bm, 0, 0, 64, 64); const d = tg.getImageData(0, 0, 64, 64).data; let am = 0;
      for (let k = 0; k < d.length; k += 4) if (d[k] > 220 && d[k+1] > 190 && d[k+2] < 70) am++; return am > 64*64*0.02; };
    // servidor que não responde: cada imagem espera no máximo 10 s e o mapa inteiro, 30 s
    const t0 = Date.now(); let estourou = false;
    const work = async () => { while (i < jobs.length && !bloqueado && !estourou){ const [x, y] = jobs[i++];
      if (Date.now() - t0 > 30000){ estourou = true; break; }
      const ac = typeof AbortController === "function" ? new AbortController() : null, tm = ac && setTimeout(() => ac.abort(), 10000);
      try { const r = await fetch(L.url(OSM_Z, x, y), {mode:"cors", credentials:"omit", signal: ac ? ac.signal : undefined}); clearTimeout(tm);
        if (r.status === 403 || r.status === 429){ bloqueado = true; break; }
        if (!r.ok) throw new Error(r.status);
        const bm = await createImageBitmap(await r.blob());
        if (L.amarelo && ehBloqueio(bm)){ bloqueado = true; break; }
        g.drawImage(bm, (x - x0) * T, (y - y0) * T); }
      catch(e){ clearTimeout(tm); falhas++; if (falhas > jobs.length * 0.2) break; } } };
    await Promise.all(Array.from({length:4}, work));          // poucas requisições ao mesmo tempo, como um mapa comum
    if (bloqueado) throw new Error("bloqueado");
    if (estourou) throw new Error("tempo");
    if (falhas > jobs.length * 0.2) throw new Error("tiles");
    const W = OSM_W, H = Math.round(OSM_W * (ex.n - ex.s) / (ex.e - ex.w));
    const out = document.createElement("canvas"); out.width = W; out.height = H;
    const o = out.getContext("2d"); o.imageSmoothingQuality = "high";
    const sx = lx(ex.w) - x0 * T, sw = lx(ex.e) - lx(ex.w);
    for (let r = 0; r < H; r++){                               // linha a linha: Mercator -> lat/lon
      const lat = ex.n - (r + 0.5) / H * (ex.n - ex.s);
      o.drawImage(st, sx, my(lat) - y0 * T - 0.5, sw, 1, 0, r, W, 1);
    }
    L.src = out.toDataURL("image/jpeg", 0.92); L.bounds = ex;
    return true;
  })().catch(err => { L.promise = null; L.failed = true; throw err; });
  return L.promise;
}
const osmLoad = () => liveLoad(OSM_BG);
// Arquivo aberto do computador (file://) não envia o endereço da página (Referer), e os servidores recusam.
const osmSemEndereco = () => location.protocol === "file:" && !window.__OSM_TESTE;
const osmNoClaude = () => !!(window.claude && typeof window.claude.use === "function") && !window.__OSM_TESTE;
// Carrega o mapa escolhido; se não responder, passa para a reserva seguinte (só na sessão, sem mudar a preferência).
function liveActivate(id, anterior, tentados){
  const L = liveById(id); if (!L) return;
  tentados = tentados || new Set(); tentados.add(L.id);
  L.failed = false;
  if (osmSemEndereco()){ L.failed = true;
    showMsg("info", "Os mapas base da internet só carregam com a ferramenta aberta por um endereço da web (o painel). Aberto direto do computador, o mapa fica só com os limites do IBGE."); return; }
  if (osmNoClaude()){ L.failed = true;
    showMsg("info", "Nesta pré-visualização do Claude a página não pode buscar mapas na internet; o mapa fica só com os limites do IBGE. No painel, o mapa base carrega."); return; }
  liveLoad(L).then(() => {
      if (S.bgActive !== L.id) return;
      renderBg(); drawPreview();
      if (anterior){
        showMsg("err", `<b>O mapa de fundo “${esc(anterior)}” não carregou.</b> Para o mapa não ficar sem fundo, ele foi trocado sozinho para o <b>${esc(L.curto)}</b> (os créditos já citam o novo fundo). Se preferir outro, troque em <b>Mapa de fundo</b>, abaixo da tabela de municípios. <button class="btn small ghost" type="button" data-abrirbg>Abrir Mapa de fundo</button>`);
        histRebase(); }
    })
    .catch(() => {
      if (S.bgActive !== L.id) return;
      const prox = LIVE.find(o => o.reserva !== false && !tentados.has(o.id));   // o CARTO não entra como reserva automática
      if (prox){ S.bgActive = prox.id; renderBg(); drawPreview(); liveActivate(prox.id, anterior || L.curto, tentados); return; }
      showMsg("err", `<b>O mapa de fundo não carregou.</b> Nenhum dos mapas da internet respondeu agora (OpenStreetMap padrão, França e Alemanha) — pode ser a internet ou a rede bloqueando esses endereços. Por enquanto o mapa fica só com os limites do IBGE.<br><b>O que fazer:</b> abra <b>Mapa de fundo</b>, abaixo da tabela de municípios, e troque o mapa (ou escolha “Nenhum”); depois de alguns minutos, tente de novo. <button class="btn small ghost" type="button" data-abrirbg>Abrir Mapa de fundo</button> <button class="btn small ghost" type="button" data-tentarbg>Tentar de novo</button>`);
    });
}
// MapLibre é carregada só quando o OpenFreeMap é escolhido (da mesma pasta do jsPDF, no GitHub)
let mlPromise = null;
function loadMapLibre(){
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  if (mlPromise) return mlPromise;
  const s = document.querySelector('script[src*="jspdf.umd.min.js"]');
  if (!s) return Promise.reject(new Error("sem-lib"));
  const src = s.src.replace(/jspdf\.umd\.min\.js.*$/, "maplibre-gl.js") + (s.src.includes("?") ? s.src.slice(s.src.indexOf("?")) : "");
  mlPromise = new Promise((res, rej) => { const sc = document.createElement("script"); sc.src = src;
    sc.onload = () => window.maplibregl ? res(window.maplibregl) : rej(new Error("lib"));
    sc.onerror = () => { mlPromise = null; rej(new Error("lib")); }; document.head.appendChild(sc); });
  return mlPromise;
}
// Desenha o estilo vetorial (sem textos) fora da tela, em Web Mercator, e reprojeta para latitude/longitude
async function vectorLoad(L){
  const ml = await loadMapLibre();
  const ac = typeof AbortController === "function" ? new AbortController() : null, tm = ac && setTimeout(() => ac.abort(), 15000);
  const resp = await fetch(L.style, {mode:"cors", credentials:"omit", signal: ac ? ac.signal : undefined}); clearTimeout(tm);
  if (!resp.ok) throw new Error(resp.status);
  const style = await resp.json();
  style.layers = (style.layers || []).filter(l => l.type !== "symbol");      // nenhum nome, número de estrada ou ícone
  const ex = fullExtent(), W = OSM_W;
  const world = W * 360 / (ex.e - ex.w);                                      // largura do mundo em px nesta escala
  const my = lat => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * world; };
  const Hm = Math.round(my(ex.s) - my(ex.n));
  const div = document.createElement("div");
  div.style.cssText = `position:fixed;left:-${W + 50}px;top:0;width:${W}px;height:${Hm}px;pointer-events:none`;
  document.body.appendChild(div);
  let map = null;
  try {
    let erros = 0;
    map = new ml.Map({container: div, style, interactive: false, attributionControl: false, preserveDrawingBuffer: true,
      pixelRatio: 1, fadeDuration: 0, bounds: [[ex.w, ex.s], [ex.e, ex.n]], fitBoundsOptions: {padding: 0}});
    await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error("tempo")), 45000);
      map.on("error", () => { if (++erros > 40){ clearTimeout(t); rej(new Error("tiles")); } });
      map.once("idle", () => { clearTimeout(t); res(); });
    });
    if (erros > 20) throw new Error("tiles");
    const cv = map.getCanvas();
    const H = Math.round(W * (ex.n - ex.s) / (ex.e - ex.w));
    const out = document.createElement("canvas"); out.width = W; out.height = H;
    const o = out.getContext("2d"); o.imageSmoothingQuality = "high";
    const sy = cv.height / Hm, y0 = my(ex.n);
    for (let r = 0; r < H; r++){                                              // linha a linha: Mercator -> lat/lon
      const lat = ex.n - (r + 0.5) / H * (ex.n - ex.s);
      o.drawImage(cv, 0, (my(lat) - y0) * sy - 0.5, cv.width, 1, 0, r, W, 1);
    }
    L.src = out.toDataURL("image/jpeg", 0.92); L.bounds = ex;
    return true;
  } finally { try { map && map.remove(); } catch(e){} div.remove(); }
}
const osmActivate = () => liveActivate(S.bgActive && liveById(S.bgActive) ? S.bgActive : "osm");
BG = [...LIVE];
// OSM padrão ao vivo: fundo padrão quando a ferramenta é aberta pela plataforma (endereço https).
// Aberta direto do computador ou na pré-visualização do Claude, o servidor do OSM recusa: fica a base de rios e rodovias.
const OSM_OK = !osmSemEndereco() && !osmNoClaude();
if (S.osmSeen !== 3){
  if (OSM_OK){ S.bgActive = "osm"; S.opts.mgFill = false; S.opts.baseHidro = S.opts.baseRod = S.opts.baseUrb = false; S.opts.osmOp = S.opts.osmOp ?? 1; }
  else if (S.bgActive === "osm"){ S.bgActive = null; S.opts.mgFill = true; S.opts.baseHidro = S.opts.baseRod = S.opts.baseUrb = true; }
  S.osmSeen = 3;
}
if (TEAM_BG){
  BG = [TEAM_BG, ...LIVE];
  if (S.teamSeen !== (MF.versao || "1")){        // primeira vez que este fundo aparece neste navegador: já vem ligado
    S.teamSeen = MF.versao || "1"; S.bgActive = "equipe"; S.opts.mgFill = false;
    S.opts.baseHidro = S.opts.baseRod = S.opts.baseUrb = false;   // rios e rodovias já estão no mapa base
  }
}
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
  list.querySelectorAll('[data-bgdel="equipe"]').forEach(x => x.remove());   // fundos embutidos não são excluídos aqui
  for (const L of LIVE){ list.querySelectorAll(`[data-bgdel="${L.id}"]`).forEach(x => x.remove());
    list.querySelectorAll(`input[value="${L.id}"]`).forEach(x => { const im = x.parentNode.querySelector("img"); if (im && !L.src) im.remove(); }); }
  const b = activeBg(); $("#bgCfg").hidden = !b;
  if ($("#bgTeam")) $("#bgTeam").hidden = !b || !!b.team || !!b.live;   // o OSM não pode virar fundo.js (política do servidor)
  $("#bgCfg").querySelector(".bounds").hidden = !!(b && b.live); $("#bgFit").parentNode.hidden = !!(b && b.live);
  if (b){ if (b.bounds){ $("#bgW").value = b.bounds.w; $("#bgE").value = b.bounds.e; $("#bgS").value = b.bounds.s; $("#bgN").value = b.bounds.n; }
    $("#bgOp").value = b.opacity ?? 1; $("#outBgOp").textContent = Math.round((b.opacity ?? 1)*100) + "%"; }
}
$("#bgList").addEventListener("change", e => {
  if (e.target.name !== "bgsel") return;
  const had = !!activeBg(); S.bgActive = e.target.value || null;
  if (liveById(S.bgActive)){ S.livePref = S.bgActive; liveActivate(S.bgActive); }
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
function bgChanged(){ drawPreview(); clearTimeout(bgSaveT); const b = activeBg();
  if (b && b.team){ S.opts.teamOp = b.opacity; persist(); return; }
  if (b && b.live){ S.opts["op_" + b.id] = b.opacity; persist(); return; }
  bgSaveT = setTimeout(() => b && idb.put(b).catch(() => {}), 400); }
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

$("#bgTeam")?.addEventListener("click", async () => {
  const b = activeBg(); if (!b || b.team) return;
  const ok = await ask("Gerar fundo da equipe", `<p style="margin:0 0 10px">Gera o arquivo <b>fundo.js</b> com esta imagem e a posição atual. Suba-o no GitHub em <b>previsao/data/</b> (substituindo o existente) e aumente o VERSAO no Codigo.gs: o fundo passa a valer para toda a equipe.</p>
    <label style="display:grid;gap:4px;font-weight:600;font-size:14px">Nome do fundo<input class="field" id="tfNome" value="${esc(b.name.replace(/\.[^.]+$/, ""))}"></label>
    <label style="display:grid;gap:4px;font-weight:600;font-size:14px;margin-top:8px">Crédito no mapa (fonte e licença)<input class="field" id="tfCred" placeholder="Ex.: Relevo: Topodata/INPE (CC BY 4.0)"></label>`,
    [["Cancelar", false, "ghost"], ["Gerar fundo.js", true, "primary"]]);
  if (!ok) return;
  const nome = ($("#tfNome")?.value || "").trim() || "mapa base", cred = ($("#tfCred")?.value || "").trim();
  const img = new Image(); img.src = b.src; await img.decode();
  const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext("2d"); g.fillStyle = "#ffffff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0);
  const src = c.toDataURL("image/jpeg", 0.85);
  const r5 = v => +(+v).toFixed(5);
  const dados = {versao:new Date().toISOString().slice(0,10) + "-" + Date.now().toString(36), nome, credito:cred,
    bounds:{w:r5(b.bounds.w), e:r5(b.bounds.e), s:r5(b.bounds.s), n:r5(b.bounds.n)}, opacidade:b.opacity ?? 1, src};
  const js = `/* Fundo da equipe da Previsão diária — ${nome}\n   ${cred || "sem crédito informado"}\n   Gerado na própria ferramenta em ${fmtDateBR(dados.versao.slice(0,10))}. */\nwindow.MAPA_FUNDO = ${JSON.stringify(dados)};\n`;
  const blob = new Blob([js], {type:"text/javascript"});
  const mb = (blob.size/1048576).toFixed(1).replace(".", ",");
  let salvo = await saveFile("fundo.js", blob);
  if (!salvo && !(window.google && window.google.script)) salvo = await saveFile("fundo.js.txt", blob);   // a pré-visualização do Claude não baixa .js
  if (salvo) showMsg("ok", `fundo.js gerado (${mb} MB). Suba em previsao/data/ no GitHub${salvo && !(window.google && window.google.script) ? " (se o nome vier como fundo.js.txt, renomeie para fundo.js)" : ""}.`);
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
  if (none) issues.push(`${none} município${none>1?"s":""} sem condição do tempo (no mapa ${none>1?"ficam":"fica"} só o ponto e o nome).`);
  if (!issues.length) return true;
  const go = await ask("Conferir antes de exportar", `<ul style="margin:0;padding-left:18px">${issues.map(i => `<li>${esc(i)}</li>`).join("")}</ul>`, [["Voltar e completar", false, "ghost"], ["Exportar assim mesmo", true, "primary"]]);
  return !!go;
}
async function svgToCanvas(dpi){
  { const L = liveById(S.bgActive); if (L && !L.src && !L.failed){ try { await liveLoad(L); } catch(e){} } }
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
    if (await saveFile(`previsao_${S.date}.png`, blob)) showMsg("ok", `PNG de ${fmtDateBR(S.date)} gerado (${Math.round(PAGE.w/25.4*300)} × ${Math.round(PAGE.h/25.4*300)} px, 300 dpi).`);
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
    if (await saveFile(`previsao_${S.date}.pdf`, pdf.output("blob"))) showMsg("ok", "PDF gerado no tamanho do layout (297 × 210 mm).");
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
    pdf.setProperties({title:`Previsão por cidade - ${cidDate()}`, author:"SIMGE/IGAM", creator:"Previsão diária MG 1.15"});
    baixarLocal(`previsao_cidades_${S.date}.pdf`, pdf.output("blob"));
    showCMsg("ok", `PDF de ${fmtDateBR(S.date)} baixado no seu computador (${pages.length} página${pages.length>1?"s":""}).`);
  } catch(err){ showCMsg("err", "Não foi possível gerar o PDF. Tente novamente."); }
}));

/* ================= início ================= */
fillTexts(); fillOpts(); applyTempsUI(); renderRows(); updateNotice(); updateStatus(); renderBg(); drawPreview();
try { const v = sessionStorage.getItem("prevmg:view"); if (v === "bul" || v === "cid") setView(v); } catch(e){}
// No painel: começa pelo mapa preferido (o OSM padrão, se ninguém escolheu outro). Fora dele: base de rios e rodovias, sem aviso.
if (S.livePref === "carto") S.livePref = "osm";      // o CARTO (precisava de chave) foi trocado pelo OpenFreeMap
if (S.bgActive === "carto") S.bgActive = "osm";
if (liveById(S.bgActive) && OSM_OK){ S.bgActive = liveById(S.livePref) ? S.livePref : "osm"; liveActivate(S.bgActive); }
idb.all().then(list => { BG = [...(TEAM_BG ? [TEAM_BG] : []), ...LIVE, ...(list || []).sort((a,b) => a.id.localeCompare(b.id))]; renderBg(); drawPreview(); }).catch(() => {});

/* ================= Redefinir e Desfazer =================
   Desfazer volta qualquer alteração (municípios, condições, temperaturas, posições arrastadas, opções, textos,
   mapa de fundo, boletim e previsão por cidade), uma de cada vez, até 100 passos. Ctrl+Z também funciona
   fora das caixas de texto (dentro delas, o Ctrl+Z desfaz a digitação, como sempre). */
const HIST = {stack: [], last: null, timer: null, restoring: false};
const histSnap = () => JSON.stringify({rows:S.rows, opts:S.opts, date:S.date, val:S.val, texts:S.texts, bgActive:S.bgActive, bul:S.bul, cid:S.cid});
function histUI(){ const b = $("#btnUndo"); if (b) b.disabled = !HIST.stack.length && HIST.last === histSnap(); }
function histCommit(){ clearTimeout(HIST.timer); HIST.timer = null; const cur = histSnap();
  if (HIST.last !== null && cur !== HIST.last){ HIST.stack.push(HIST.last); if (HIST.stack.length > 100) HIST.stack.shift(); }
  HIST.last = cur; histUI(); }
function histTouch(){ if (HIST.restoring) return; clearTimeout(HIST.timer); HIST.timer = setTimeout(histCommit, 400); const b = $("#btnUndo"); if (b) b.disabled = false; }
function histRebase(){ HIST.last = histSnap(); histUI(); }     // trocas automáticas (ex.: mapa de reserva) não viram passo
function histUndo(){
  histCommit();
  if (!HIST.stack.length) return;
  const prev = JSON.parse(HIST.stack.pop());
  HIST.restoring = true;
  const bgAntes = S.bgActive;
  Object.assign(S, prev);
  dateEl.value = S.date || ""; fillVal(); fillTexts(); fillOpts(); applyTempsUI(); renderRows(); renderBg();
  if (S.bgActive !== bgAntes && liveById(S.bgActive) && OSM_OK) liveActivate(S.bgActive);
  try { fillBulletin(); } catch(e){}
  if (!$("#viewBul").hidden) drawBulletin();
  if (!$("#viewCid").hidden){ try { fillCid(); renderCid(); drawCid(); } catch(e){} }
  drawPreview(); persist();
  HIST.last = histSnap(); HIST.restoring = false; histUI();
  showMsg("info", "Ação desfeita.");
}
$("#btnUndo")?.addEventListener("click", histUndo);
document.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "z"){
    const t = e.target, ed = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !/^(checkbox|radio|button|range)$/i.test(t.type || ""));
    if (ed) return;
    e.preventDefault(); histUndo();
  }
});
$("#btnRedef")?.addEventListener("click", () => {
  const tem = S.rows.some(r => r.tempo !== NONE || r.tmax !== "" || r.tmin !== "");
  if (!tem){ showMsg("info", "Não há condição de tempo nem temperatura preenchida para remover."); return; }
  histCommit();
  S.rows.forEach(r => { r.tempo = NONE; r.tmax = ""; r.tmin = ""; });
  renderRows(); drawPreview(); persist(); histCommit();
  showMsg("info", `Preenchimento removido de todos os municípios (condição do tempo e temperaturas). <button class="btn small ghost" type="button" data-desfazer>Desfazer</button>`);
});
document.addEventListener("click", e => {
  const t = e.target.closest("[data-desfazer],[data-abrirbg],[data-tentarbg]"); if (!t) return;
  if (t.hasAttribute("data-desfazer")){ histUndo(); return; }
  if (t.hasAttribute("data-abrirbg")){ const d = $("#secBg"); if (d){ d.open = true; d.scrollIntoView({behavior:"smooth", block:"start"}); } return; }
  if (t.hasAttribute("data-tentarbg")){ hideMsg(); LIVE.forEach(L => { L.failed = false; L.promise = null; });
    S.bgActive = liveById(S.livePref) ? S.livePref : "osm"; renderBg(); drawPreview(); liveActivate(S.bgActive); }
});
HIST.last = histSnap(); histUI();
