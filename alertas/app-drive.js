/* Alertas e passagem de plantão — código da página (v3.9, 22/10/2026).
   v3.9: botão Desfazer no cabeçalho do mapa (e Ctrl+Z) para a seleção de municípios; sugestões de
   municípios enquanto digita em "Localizar município" (sem diferenciar acentos/maiúsculas).
   v3.8: o mapa do relatório passa a ser desenhado no layout da Previsão diária (assets/layout-mapa.js):
   297 × 210 mm, cabeçalho, legenda, rodapé com logos, as 25 cidades de referência e os mesmos mapas base;
   na tela, mapa base por baixo dos municípios, estados vizinhos, as 25 cidades e "Centralizar Minas".
   v3.7.1: camadas RealEarth baixadas antes em segundo plano, com até 3 tentativas e aviso por camada.
   v3.7: intervalo/revezamento no turno (início, fim e observações) e horários de publicação das duas
   previsões diárias (cada linha: Manhã/Tarde + horário). Vão para o relatório em PDF, o rascunho e a
   planilha (colunas novas no fim da aba Plantoes, criadas pelo Codigo.gs 2026.10.20.1).
   v3.6: "Ferramentas utilizadas" com caixas de seleção (obrigatório nos dois turnos; "Outros" pede descrição);
   Mapa de Previsões continua separado; "Outras imagens" aceita várias ("+ Imagens" ou Ctrl+V de print), reduzidas no navegador para o PDF não passar do limite;
   intercorrências estruturadas ("+ Intercorrência", obrigatório nos dois turnos), gravadas uma por linha na
   planilha de intercorrências com o ID do plantão (Intercorrencias.gs); evidência = link ou imagem.
   v3.5: municípios com alerta ainda VIGENTE de plantões anteriores continuam pintados no mapa
   (cor mais clara e contorno tracejado), entram na dica do mouse e no aviso de duplicação, e aparecem
   numa lista própria. Não entram no relatório, no TXT nem em "Alertas gerados", e não podem ser
   excluídos daqui. Usa a função alertasVigentesAnteriores (AlertasVigentes.gs); sem ela, nada muda.
   v3.4: ao salvar a passagem, o PDF do relatório sempre baixa no PC e vai para o Drive, e a página
   pergunta "Enviar e-mail para Flávia, Laís e Paula?". Sim = envia (Email.gs); Não = só PC e Drive.
   Sem o Email.gs no Apps Script, a página mostra o lembrete antigo de e-mail.
   v3.3: cor do município = alerta VIGENTE tem prioridade sobre o vencido (novo alerta volta a azul);
   alerta excluído fica na planilha como "Excluído" e sai de mapa, lista, PDF e TXT;
   TXT do turno montado a partir da planilha (alertas de toda a equipe, sem os excluídos).
   v3.3.1: Mapa de Previsões (PNG) obrigatório só para encerrar o plantão DIURNO; no noturno é opcional.
   v3.2.1: seletor de turno numa linha própria acima de Data/Início/Fim (a grade não desalinha).
   v3.2: plantão único da equipe com turno (Diurno/Noturno) e subpastas AAAAMMDD/Turno no Drive;
   relatório com os alertas de todos; aviso de duplicação (só alertas vigentes); Mapa de Previsões
   obrigatório para encerrar (não é mais salvo à parte no Drive); botão "Trocar conta".
   Usa as funções do arquivo Turnos.gs quando ele existe no Apps Script; sem ele, funciona como a v3.0.
   Fica no GitHub Pages, fora do Apps Script, como o app-drive.js das outras ferramentas:
   o Apps Script altera código JavaScript longo escrito dentro do HTML e quebrava a página.
   Depende de: window.BASE_DADOS, window.VERSAO_APP, window.alertasDados e window.alertasJsPdf
   (definidos no Alertas.html), municipios.js e mesorregioes.js. */
window.alertasDados.then(iniciarAlertas,function(e){
  document.getElementById('topinfo').innerHTML='<b>Não foi possível carregar os municípios.</b> Verifique se alertas/data/municipios.js está publicado no GitHub Pages e recarregue (Ctrl+F5).';
  window.diagFaixa(e.message);
});
function iniciarAlertas(){
const $=id=>document.getElementById(id);
const GEO=window.MUNICIPIOS_MG;
if(!GEO){
  $('topinfo').innerHTML='<b>Não foi possível carregar os municípios.</b> Verifique se alertas/data/municipios.js está publicado no GitHub Pages.';
  throw new Error('municipios.js não carregou');
}
const MESO=window.MESORREGIOES_MG||null;   // opcional: sem ele, o mapa funciona sem os limites de mesorregião
$('topinfo').innerHTML='<b>Minas Gerais</b> • '+GEO.features.length+' municípios';

// v3.8: enquadramento um pouco maior que Minas, para mostrar os estados vizinhos e as siglas (como na Previsão)
const BOUNDS={minx:-51.55,miny:-23.4,maxx:-39.05,maxy:-13.9};
const state={mode:'click',selected:new Set(),active:[],dailyRows:[],plantaoId:'',meuEmail:'',pastaUrl:'',drawing:false,drawPts:[],view:{x:0,y:0,w:1000,h:760}};
const featureByName=new Map(GEO.features.map(f=>[f.properties.nome,f]));
const pathByName=new Map();
const svg=$('mapSvg'),layer=$('munLayer'),mesoLayer=$('mesoLayer'),labels=$('labelLayer'),
      irLayer=$('irLayer'),visLayer=$('visLayer'),glmLayer=$('glmLayer'),
      tooltip=$('tooltip'),drawLine=$('drawLine');
const PAD=28,W=1000,H=760;
const CHAVE_RASCUNHO='simge-plantao-rascunho-v2';
const temServidor=!!(window.google&&google.script&&google.script.run);

/* ---------------- salvar no PC (além do Drive) ---------------- */
const CHAVE_PC='ferramentas-meteorologia:baixar-no-pc';
function querPc(){try{const v=localStorage.getItem(CHAVE_PC+':alertas');return v===null?true:v==='1';}catch(e){return true;}}   // padrão nos Alertas: ligado (cópia local do KML, como antes)
$('baixarPc').checked=querPc();
$('baixarPc').onchange=()=>{try{localStorage.setItem(CHAVE_PC+':alertas',$('baixarPc').checked?'1':'0');}catch(e){}};
function baixarLocal(nome,blob){
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=nome;a.setAttribute('data-local','1');document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),4000);
}
let avisoT=0;
function aviso(html,erro,acoes){
  const el=$('aviso');el.className=erro?'erro':'';
  el.innerHTML='<button type="button" class="x" aria-label="Fechar aviso">&times;</button>'+html;
  el.querySelector('.x').onclick=()=>el.style.display='none';
  (acoes||[]).forEach(([rotulo,fn])=>{const b=document.createElement('button');b.type='button';b.className='pc';b.textContent=rotulo;b.onclick=fn;el.appendChild(document.createElement('br'));el.appendChild(b);});
  el.style.display='block';clearTimeout(avisoT);if(!erro)avisoT=setTimeout(()=>el.style.display='none',20000);
}

/* ---------------- mapa ---------------- */
function xy(lon,lat){
  const sx=(W-2*PAD)/(BOUNDS.maxx-BOUNDS.minx),sy=(H-2*PAD)/(BOUNDS.maxy-BOUNDS.miny),s=Math.min(sx,sy);
  const mapW=(BOUNDS.maxx-BOUNDS.minx)*s,mapH=(BOUNDS.maxy-BOUNDS.miny)*s,ox=(W-mapW)/2,oy=(H-mapH)/2;
  return [ox+(lon-BOUNDS.minx)*s,oy+(BOUNDS.maxy-lat)*s];
}
function ringsOf(f){
  const g=f.geometry;
  if(g.type==='Polygon')return [g.coordinates[0]];
  if(g.type==='MultiPolygon')return g.coordinates.map(p=>p[0]);
  return [];
}
function ringPath(ring){
  let d='';ring.forEach((p,i)=>{const q=xy(p[0],p[1]);d+=(i?'L':'M')+q[0].toFixed(2)+','+q[1].toFixed(2);});return d+'Z';
}
function pathFor(f){return ringsOf(f).map(ringPath).join('');}
function mesoPathFor(f){
  const g=f.geometry,polys=g.type==='Polygon'?[g.coordinates]:(g.type==='MultiPolygon'?g.coordinates:[]);
  return polys.map(poly=>poly.map(ringPath).join('')).join('');
}
function renderMeso(){
  if(!MESO)return;
  const frag=document.createDocumentFragment();
  MESO.features.forEach(f=>{
    const p=document.createElementNS('http://www.w3.org/2000/svg','path');
    p.setAttribute('d',mesoPathFor(f));p.setAttribute('class','mesoregiao');p.dataset.meso=f.properties.nome||'';
    frag.appendChild(p);
  });
  mesoLayer.appendChild(frag);
}

let dragged=false;
function render(){
  const fg=document.createDocumentFragment(),fl=document.createDocumentFragment(),fd=document.createDocumentFragment();
  GEO.features.forEach((f,idx)=>{
    const d=pathFor(f);
    const p=document.createElementNS('http://www.w3.org/2000/svg','path');
    p.setAttribute('d',d);p.setAttribute('class','municipio');p.dataset.name=f.properties.nome;
    p.addEventListener('click',()=>{if(state.mode==='click'&&!dragged)toggleCity(f.properties.nome);});
    p.addEventListener('mousemove',ev=>showTip(ev,f.properties.nome));
    p.addEventListener('mouseleave',()=>tooltip.style.display='none');
    fg.appendChild(p);pathByName.set(f.properties.nome,p);
    const clip=document.createElementNS('http://www.w3.org/2000/svg','clipPath');
    clip.setAttribute('id','clipMun'+idx);
    const cp=document.createElementNS('http://www.w3.org/2000/svg','path');cp.setAttribute('d',d);clip.appendChild(cp);fd.appendChild(clip);
    const t=document.createElementNS('http://www.w3.org/2000/svg','text');
    const q=xy(f.properties.label_lon,f.properties.label_lat);
    t.setAttribute('x',q[0]);t.setAttribute('y',q[1]);t.setAttribute('class','label');
    t.setAttribute('clip-path',`url(#clipMun${idx})`);t.textContent=f.properties.nome;fl.appendChild(t);
  });
  $('clipDefs').appendChild(fd);layer.appendChild(fg);labels.appendChild(fl);
  montarCamadasNovas();
}
/* v3.8: mapa base por baixo dos municípios (mesmo seletor "Fundo" do mapa do relatório) e as 25 cidades
   de referência com a marcação da Previsão (ponto branco pequeno e nome logo abaixo, tamanho fixo na tela). */
const NS_SVG='http://www.w3.org/2000/svg';
let fundoG=null,cidadesG=null,estadosG=null;
const UF_TELA=[['MT',-51.18,-14.494],['GO',-49.744,-16.279],['DF',-47.797,-15.7755],['BA',-40.865,-14.794],['MS',-51.0,-20.45],['SP',-48.785,-21.709],['RJ',-42.536,-22.359],['ES',-40.361,-19.342]];
function montarCamadasNovas(){
  if(fundoG)return;
  fundoG=document.createElementNS(NS_SVG,'g');fundoG.id='fundoTela';fundoG.setAttribute('pointer-events','none');
  svg.insertBefore(fundoG,$('wxBaseLayer'));
  cidadesG=document.createElementNS(NS_SVG,'g');cidadesG.id='cidadesRef';cidadesG.setAttribute('pointer-events','none');
  svg.insertBefore(cidadesG,$('drawLine'));
  estadosG=document.createElementNS(NS_SVG,'g');estadosG.id='estadosTela';estadosG.setAttribute('pointer-events','none');
  svg.insertBefore(estadosG,$('munLayer'));
  const fundoRet=svg.querySelector('rect');if(fundoRet)fundoRet.setAttribute('fill','#ffffff');   // fora de Minas: branco, como na Previsão
  preencherMG();
  // estados vizinhos (mesmo arquivo do Tempo Severo) — só desenho
  const desenharEstados=()=>{const E=window.BRASIL_ESTADOS;if(!E||estadosG.childNodes.length)return;
    E.features.filter(f=>(f.properties||{}).UF!=='MG').forEach(f=>{const pth=document.createElementNS(NS_SVG,'path');pth.setAttribute('d',mesoPathFor(f));
      pth.setAttribute('fill','none');pth.setAttribute('stroke','#000');pth.setAttribute('stroke-width','0.8');pth.setAttribute('vector-effect','non-scaling-stroke');estadosG.appendChild(pth);});};
  if(window.BRASIL_ESTADOS)desenharEstados();
  else if(window.carregarScript)window.carregarScript((window.BASE_DADOS||'../')+'tempo-severo/data/brasil_estados.js').then(desenharEstados).catch(()=>{});
  const css=document.createElement('style');
  css.textContent='#cidadesRef text.uf{fill:#2f3640}#cidadesRef circle{fill:#fff;stroke:#1f2328}#cidadesRef text{fill:#092b6a;font-family:Arial,"Liberation Sans",Helvetica,sans-serif;font-weight:700;text-anchor:middle;stroke:#fff;stroke-linejoin:round;paint-order:stroke}'+
    '#mapSvg.labels-visible #cidadesRef text{display:none}';
  document.head.appendChild(css);
}
function ajustarCidadesRef(){
  if(!cidadesG)return;
  const k=state.view.w/Math.max(1,svg.clientWidth||1000);   // unidades do mapa por pixel da tela
  if(!cidadesG.childNodes.length){
    UF_TELA.forEach(([s,lon,lat])=>{const q=xy(lon,lat),g=document.createElementNS(NS_SVG,'g');g.dataset.x=q[0];g.dataset.y=q[1];g.dataset.uf='1';
      const t=document.createElementNS(NS_SVG,'text');t.setAttribute('class','uf');t.textContent=s;g.appendChild(t);cidadesG.appendChild(g);});
    CIDADES_REF.forEach(n=>{const f=featureByName.get(n);if(!f)return;
      const q=xy(f.properties.label_lon,f.properties.label_lat),g=document.createElementNS(NS_SVG,'g');
      g.dataset.x=q[0];g.dataset.y=q[1];
      g.appendChild(document.createElementNS(NS_SVG,'circle'));const t=document.createElementNS(NS_SVG,'text');t.textContent=n;g.appendChild(t);
      cidadesG.appendChild(g);});
  }
  [].forEach.call(cidadesG.childNodes,g=>{const x=+g.dataset.x,y=+g.dataset.y,c=g.firstChild,t=g.lastChild;
    if(g.dataset.uf){t.setAttribute('x',x);t.setAttribute('y',y+5*k);t.setAttribute('font-size',13*k);t.setAttribute('stroke-width',3*k);return;}
    c.setAttribute('cx',x);c.setAttribute('cy',y);c.setAttribute('r',1.9*k);c.setAttribute('stroke-width',0.8*k);
    t.setAttribute('x',x);t.setAttribute('y',y+(1.9+1.5)*k+11*k*0.9);t.setAttribute('font-size',12*k);t.setAttribute('stroke-width',3*k);});
}
let fundoPedido=0;
let mgD='';
function contornoMG(){ if(!mgD)mgD=(MESO?MESO.features.map(mesoPathFor):GEO.features.map(pathFor)).join(''); return mgD; }
function preencherMG(){   // Minas sem mapa base: o mesmo tom claro da Previsão
  const pth=document.createElementNS(NS_SVG,'path');pth.setAttribute('d',contornoMG());pth.setAttribute('fill','#ecf4f5');pth.setAttribute('fill-rule','nonzero');fundoG.appendChild(pth);
}
function aplicarFundoTela(id){
  const n=++fundoPedido;
  if(!fundoG||!window.LayoutMapa)return;
  while(fundoG.firstChild)fundoG.removeChild(fundoG.firstChild);
  if(!id){preencherMG();return;}
  window.LayoutMapa.carregarFundo(id).then(r=>{
    if(n!==fundoPedido)return;
    if(!r.fundo){preencherMG();return;}
    const b=window.LayoutMapa.extensao(),p1=xy(b.w,b.n),p2=xy(b.e,b.s);
    // recorte no contorno de Minas (mesorregiões; sem elas, os municípios)
    let clip=$('clipMG');
    if(!clip){clip=document.createElementNS(NS_SVG,'clipPath');clip.id='clipMG';
      const cp=document.createElementNS(NS_SVG,'path');cp.setAttribute('d',contornoMG());clip.appendChild(cp);$('clipDefs').appendChild(clip);}
    const im=document.createElementNS(NS_SVG,'image');
    im.setAttribute('href',r.fundo.src);im.setAttributeNS('http://www.w3.org/1999/xlink','href',r.fundo.src);
    im.setAttribute('x',p1[0]);im.setAttribute('y',p1[1]);im.setAttribute('width',p2[0]-p1[0]);im.setAttribute('height',p2[1]-p1[1]);
    im.setAttribute('preserveAspectRatio','none');im.setAttribute('clip-path','url(#clipMG)');
    fundoG.appendChild(im);
  }).catch(()=>{});
}

/* ---------------- camadas meteorológicas (RealEarth / SSEC) ----------------
   v3.7.1: cada camada é baixada antes em segundo plano (new Image) e só vai para o mapa
   se chegar inteira. Assim a falha é identificada por camada, com nome, e não gera a faixa
   vermelha "[object SVGAnimatedString]". Até 3 tentativas por camada; se todas falharem,
   a camada some do mapa, o botão fica marcado e aparece um aviso discreto. */
const WX={
  irBase:'https://realearth.ssec.wisc.edu/cgi-bin/mapserv?map=G19-ABI-FD-BAND13-GRAD.map&version=1.3',
  visBase:'https://realearth.ssec.wisc.edu/cgi-bin/mapserv?map=G19-ABI-FD-BAND01.map&version=1.3',
  glmBase:'https://realearth.ssec.wisc.edu/cgi-bin/mapserv?map=glmgroupdensity.map&version=1.3',
  irOn:false,visOn:false,glmOn:false,satOpacity:.78,glmOpacity:.68
};
const WX_NOMES={ir:'Infravermelho (canal 13)',vis:'Visível (canal 1)',glm:'Densidade de raios (GLM)'};
const WX_EL={ir:irLayer,vis:visLayer,glm:glmLayer};
const WX_BTN={ir:'toggleIR',vis:'toggleVIS',glm:'toggleGLM'};
const WX_TENTATIVAS=3,WX_TEMPO=45000,WX_ESPERA=8000;
const wxGer={ir:0,vis:0,glm:0},wxFalhas=new Set();
(function estiloWx(){
  const st=document.createElement('style');
  st.textContent='.wx-off{position:relative;text-decoration:line-through;opacity:.75}'+
    '.wx-off::after{content:"!";position:absolute;top:-6px;right:-6px;width:16px;height:16px;border-radius:50%;'+
    'background:#b45309;color:#fff;font-size:11px;line-height:16px;text-align:center;font-weight:700}'+
    '.wx-load{opacity:.6;cursor:progress}';
  document.head.appendChild(st);
})();
function imageBox(){const tl=xy(BOUNDS.minx,BOUNDS.maxy),br=xy(BOUNDS.maxx,BOUNDS.miny);return {x:tl[0],y:tl[1],w:br[0]-tl[0],h:br[1]-tl[1]};}
function setImagePlacement(el){const b=imageBox();el.setAttribute('x',b.x);el.setAttribute('y',b.y);el.setAttribute('width',b.w);el.setAttribute('height',b.h);}
function buildWmsUrl(base){
  const bbox=`${BOUNDS.miny},${BOUNDS.minx},${BOUNDS.maxy},${BOUNDS.maxx}`; // WMS 1.3 EPSG:4326: lat,lon
  return base+'&service=WMS&request=GetMap&version=1.3.0&layers=latest&styles=default'+
    '&format=image/png&transparent=true&crs=EPSG:4326&width=1600&height=1200&bbox='+encodeURIComponent(bbox)+'&_t='+Date.now();
}
function marcarBotaoWx(k,estado,dica){
  const b=$(WX_BTN[k]);if(!b)return;
  b.classList.toggle('wx-off',estado==='falha');b.classList.toggle('wx-load',estado==='carregando');
  b.title=dica||'';
}
function avisarWx(){
  if(!wxFalhas.size)return;
  const nomes=[...wxFalhas].map(k=>WX_NOMES[k]);
  aviso('<b>'+(nomes.length>1?'Camadas indisponíveis':'Camada indisponível')+' no momento:</b> '+esc(textList(nomes))+'.<br>'+
    'O servidor RealEarth (SSEC/Universidade de Wisconsin) não respondeu. O mapa de alertas funciona normalmente; '+
    'nova tentativa na próxima atualização automática (10 min) ou no botão abaixo.',false,[['Tentar de novo agora',refreshWeatherLayers]]);
}
function carregarCamada(k,base,tent){
  tent=tent||1;
  const g=++wxGer[k],el=WX_EL[k],u=buildWmsUrl(base),img=new Image();
  let fim=false,tm=0;
  marcarBotaoWx(k,'carregando','Carregando '+WX_NOMES[k]+(tent>1?' (tentativa '+tent+' de '+WX_TENTATIVAS+')':'')+'…');
  const acabar=ok=>{
    if(fim)return;fim=true;clearTimeout(tm);img.onload=img.onerror=null;
    if(g!==wxGer[k]||!WX[k+'On'])return;   // camada desligada ou pedido substituído por um mais novo
    if(ok){
      el.setAttributeNS('http://www.w3.org/1999/xlink','href',u);el.setAttribute('href',u);el.style.display='';
      wxFalhas.delete(k);marcarBotaoWx(k,'ok','');return;
    }
    if(tent<WX_TENTATIVAS){setTimeout(()=>{if(g===wxGer[k]&&WX[k+'On'])carregarCamada(k,base,tent+1);},WX_ESPERA);return;}
    el.style.display='none';   // não deixa uma imagem antiga parecer atual
    wxFalhas.add(k);
    marcarBotaoWx(k,'falha',WX_NOMES[k]+' indisponível: o RealEarth não respondeu ('+WX_TENTATIVAS+' tentativas). Use “Atualizar” para tentar de novo.');
    avisarWx();
  };
  tm=setTimeout(()=>{img.src='';acabar(false);},WX_TEMPO);
  img.onload=()=>acabar(img.naturalWidth>0);
  img.onerror=()=>acabar(false);
  img.src=u;
}
function setLayer(k,base){
  if(WX[k+'On'])carregarCamada(k,base);
  else{wxGer[k]++;WX_EL[k].style.display='none';wxFalhas.delete(k);marcarBotaoWx(k,'ok','');}
}
function refreshWeatherLayers(){
  [irLayer,visLayer,glmLayer].forEach(setImagePlacement);
  setLayer('ir',WX.irBase);setLayer('vis',WX.visBase);setLayer('glm',WX.glmBase);
  irLayer.style.opacity=WX.satOpacity;visLayer.style.opacity=WX.satOpacity;glmLayer.style.opacity=WX.glmOpacity;
  $('toggleIR').classList.toggle('active',WX.irOn);$('toggleVIS').classList.toggle('active',WX.visOn);$('toggleGLM').classList.toggle('active',WX.glmOn);
}
$('toggleIR').onclick=()=>{WX.irOn=!WX.irOn;if(WX.irOn)WX.visOn=false;refreshWeatherLayers();};
$('toggleVIS').onclick=()=>{WX.visOn=!WX.visOn;if(WX.visOn)WX.irOn=false;refreshWeatherLayers();};
$('toggleGLM').onclick=()=>{WX.glmOn=!WX.glmOn;refreshWeatherLayers();};
$('refreshWx').onclick=refreshWeatherLayers;
setInterval(()=>{if(WX.irOn||WX.visOn||WX.glmOn)refreshWeatherLayers();},10*60*1000);   // atualiza a cada 10 min

render();renderMeso();[irLayer,visLayer,glmLayer].forEach(setImagePlacement);

/* ---------------- zoom e arraste ---------------- */
function applyView(){
  const v=state.view;svg.setAttribute('viewBox',`${v.x} ${v.y} ${v.w} ${v.h}`);
  svg.classList.toggle('labels-visible',1000/v.w>=8.5);
  try{ajustarCidadesRef();}catch(e){}   // antes do layout carregar, as cidades ainda não existem
}
function zoomAt(factor,cx=state.view.x+state.view.w/2,cy=state.view.y+state.view.h/2){
  const v=state.view,nw=Math.max(55,Math.min(1000,v.w*factor)),nh=nw*0.76;
  const rx=(cx-v.x)/v.w,ry=(cy-v.y)/v.h;
  v.x=cx-rx*nw;v.y=cy-ry*nh;v.w=nw;v.h=nh;clampView();applyView();
}
function clampView(){
  const v=state.view;
  if(v.w>=1000){v.x=0;v.y=0;v.w=1000;v.h=760;return;}
  v.x=Math.max(0,Math.min(1000-v.w,v.x));v.y=Math.max(0,Math.min(760-v.h,v.y));
}
function screenToSvg(evt){
  const pt=svg.createSVGPoint();pt.x=evt.clientX;pt.y=evt.clientY;
  const q=pt.matrixTransform(svg.getScreenCTM().inverse());return [q.x,q.y];
}
$('zoomIn').onclick=()=>zoomAt(.72);
$('zoomOut').onclick=()=>zoomAt(1.38);
$('zoomReset').onclick=$('showAll').onclick=()=>{state.view={x:0,y:0,w:1000,h:760};applyView();};
svg.addEventListener('wheel',e=>{e.preventDefault();const p=screenToSvg(e);zoomAt(e.deltaY<0?.78:1.28,p[0],p[1]);},{passive:false});

function setMode(m){
  state.mode=m;
  ['toolClick','toolDraw'].forEach(id=>$(id).classList.remove('active'));
  $(m==='draw'?'toolDraw':'toolClick').classList.add('active');
}
$('toolClick').onclick=()=>setMode('click');
$('toolDraw').onclick=()=>setMode('draw');

let pointerDown=null;
svg.addEventListener('mousedown',e=>{
  if(state.mode==='draw'){
    state.drawing=true;state.drawPts=[screenToSvg(e)];drawLine.style.display='block';
    drawLine.setAttribute('points',state.drawPts.map(x=>x.join(',')).join(' '));return;
  }
  pointerDown={clientX:e.clientX,clientY:e.clientY,view:{...state.view}};
  dragged=false;svg.classList.add('panning');
});
svg.addEventListener('mousemove',e=>{
  if(state.drawing){
    const p=screenToSvg(e),last=state.drawPts.at(-1);
    if(Math.hypot(p[0]-last[0],p[1]-last[1])>2){
      state.drawPts.push(p);
      const closed=state.drawPts.length>2?[...state.drawPts,state.drawPts[0]]:state.drawPts;
      drawLine.setAttribute('points',closed.map(x=>x.join(',')).join(' '));
    }
    return;
  }
  if(pointerDown){
    const dx=e.clientX-pointerDown.clientX,dy=e.clientY-pointerDown.clientY;
    if(Math.hypot(dx,dy)>5)dragged=true;
    if(dragged){
      const r=svg.getBoundingClientRect();
      state.view.x=pointerDown.view.x-dx*pointerDown.view.w/r.width;
      state.view.y=pointerDown.view.y-dy*pointerDown.view.h/r.height;
      clampView();applyView();
    }
  }
});
window.addEventListener('mouseup',()=>{
  if(pointerDown){pointerDown=null;svg.classList.remove('panning');setTimeout(()=>{dragged=false;},0);}
  if(state.drawing){
    state.drawing=false;
    if(state.drawPts.length>=3){
      const a=state.drawPts[0],b=state.drawPts.at(-1);
      if(a[0]!==b[0]||a[1]!==b[1])state.drawPts.push(a);
      drawLine.setAttribute('points',state.drawPts.map(x=>x.join(',')).join(' '));
      guardarSel();GEO.features.forEach(f=>{if(featureIntersectsDraw(f,state.drawPts))state.selected.add(f.properties.nome);});
      updateSelection();
    }else drawLine.style.display='none';
    dragged=true;setMode('click');setTimeout(()=>{dragged=false;},50);
  }
});

function pointInPoly(p,poly){
  let c=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];
  if(((a[1]>p[1])!=(b[1]>p[1]))&&(p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]))c=!c;}return c;
}
function ccw(a,b,c){return(c[1]-a[1])*(b[0]-a[0])>(b[1]-a[1])*(c[0]-a[0]);}
function segInt(a,b,c,d){return ccw(a,c,d)!=ccw(b,c,d)&&ccw(a,b,c)!=ccw(a,b,d);}
function featureIntersectsDraw(f,draw){
  for(const ringLL of ringsOf(f)){
    const ring=ringLL.map(p=>xy(p[0],p[1]));
    for(const p of draw)if(pointInPoly(p,ring))return true;
    for(let i=0;i<ring.length;i+=Math.max(1,Math.floor(ring.length/30)))if(pointInPoly(ring[i],draw))return true;
    for(let i=0;i<draw.length-1;i++)for(let j=0;j<ring.length-1;j++)if(segInt(draw[i],draw[i+1],ring[j],ring[j+1]))return true;
  } return false;
}

/* ---------------- seleção e cores (vigente / perto de vencer / vencido) ---------------- */
function durationMinutes(dur){const[h,m]=dur.split(':').map(Number);return h*60+m;}
function expiryTimestamp(start,dur){
  const n=new Date(),[h,m]=start.split(':').map(Number);
  const s=new Date(n.getFullYear(),n.getMonth(),n.getDate(),h,m,0,0);
  if(s.getTime()<n.getTime()-12*60*60*1000)s.setDate(s.getDate()+1);
  return s.getTime()+durationMinutes(dur)*60*1000;
}
function classeDoAlerta(a,nowTs){
  if(!a.expiresAt)return 'alerted';
  const r=a.expiresAt-nowTs;
  return r<=0?'expired':(r<=30*60*1000?'expiring':'alerted');
}
/* Vários alertas no mesmo município: vale o de maior prioridade. Um alerta VIGENTE (novo)
   sempre ganha de um alerta já vencido do mesmo dia; quando ele vencer, o município volta ao vermelho. */
const RANK={alerted:3,expiring:2,expired:1};
/* Alerta que define a situação atual do município (para a dica do mouse). */
function alertaDoMunicipio(name){
  const nowTs=Date.now();let melhor=null,rm=0;
  state.active.concat(herdadosVigentes(nowTs)).forEach(a=>{
    if(!a.cities.includes(name))return;
    const r=RANK[classeDoAlerta(a,nowTs)];
    if(!melhor||r>rm||(r===rm&&(a.expiresAt||0)>(melhor.expiresAt||0))){melhor=a;rm=r;}
  });
  return melhor;
}
function pintarMapa(){
  const nowTs=Date.now(),cls=new Map(),herd=new Set();
  state.active.forEach(a=>{const c=classeDoAlerta(a,nowTs);a.cities.forEach(n=>{if(!cls.has(n)||RANK[c]>RANK[cls.get(n)])cls.set(n,c);});});
  // v3.5: alertas vigentes de plantões anteriores — só pintam se o plantão atual não tiver coisa mais importante no município
  herdadosVigentes(nowTs).forEach(a=>{const c=classeDoAlerta(a,nowTs);a.cities.forEach(n=>{if(!cls.has(n)||RANK[c]>RANK[cls.get(n)]){cls.set(n,c);herd.add(n);}});});
  pathByName.forEach((p,n)=>{
    p.classList.remove('selected','alerted','expiring','expired','herdado');
    if(state.selected.has(n))p.classList.add('selected');
    else if(cls.has(n)){p.classList.add(cls.get(n));if(herd.has(n))p.classList.add('herdado');}
  });
}
function atualizarCards(){
  const nowTs=Date.now();
  state.active.forEach(a=>{
    if(!a.cardEl)return;
    const c=classeDoAlerta(a,nowTs);
    a.cardEl.classList.toggle('expiring',c==='expiring');a.cardEl.classList.toggle('expired',c==='expired');
    const s=a.cardEl.querySelector('.alert-status');
    if(s)s.textContent=c==='expired'?'Prazo vencido':(c==='expiring'?'Perto de vencer':'Vigente');
  });
}
setInterval(()=>{pintarMapa();atualizarCards();},30000);

function toggleCity(name){guardarSel();state.selected.has(name)?state.selected.delete(name):state.selected.add(name);updateSelection();}
function updateSelection(){
  pintarMapa();
  const arr=[...state.selected].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  $('selCount').textContent=arr.length;
  $('selectedNames').textContent=arr.length?arr.join(', ')+'.':'Nenhum município selecionado.';
  $('create').disabled=!arr.length;
}
$('clear').onclick=()=>{if(state.selected.size)guardarSel();state.selected.clear();drawLine.style.display='none';updateSelection();};
$('novo').onclick=()=>{if(state.selected.size)guardarSel();state.selected.clear();drawLine.style.display='none';setMode('click');updateSelection();mostrarAba('mapa');};
/* Desfazer: volta a seleção de municípios anterior (clique, desenho, busca, limpar) — botão no cabeçalho do mapa e Ctrl+Z */
const HIST_SEL=[];
function guardarSel(){HIST_SEL.push([...state.selected]);if(HIST_SEL.length>60)HIST_SEL.shift();atualizarDesfazer();}
function desfazerSel(){if(!HIST_SEL.length)return;state.selected=new Set(HIST_SEL.pop());drawLine.style.display='none';updateSelection();atualizarDesfazer();}
const btnDesfazerSel=document.createElement('button');
btnDesfazerSel.type='button';btnDesfazerSel.className='btn';btnDesfazerSel.id='desfazerSel';btnDesfazerSel.disabled=true;
btnDesfazerSel.title='Desfazer a última alteração na seleção de municípios (Ctrl+Z)';
btnDesfazerSel.innerHTML='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>Desfazer';
btnDesfazerSel.onclick=desfazerSel;
function atualizarDesfazer(){btnDesfazerSel.disabled=!HIST_SEL.length;}
{const cab=$('hMapa')&&$('hMapa').closest('header');if(cab){cab.appendChild(btnDesfazerSel);btnDesfazerSel.style.marginLeft='auto';}}
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&(e.key==='z'||e.key==='Z')){const t=e.target;if(t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable))return;if($('modalback').style.display==='flex')return;e.preventDefault();desfazerSel();}});

function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function showTip(ev,name){
  const a=alertaDoMunicipio(name);
  const n=a?state.active.filter(x=>x.cities.includes(name)).length:0;
  const f=featureByName.get(name),meso=f&&f.properties.meso?'<br>'+esc(f.properties.meso):'';
  tooltip.style.display='block';tooltip.style.left=(ev.clientX+12)+'px';tooltip.style.top=(ev.clientY+12)+'px';
  tooltip.innerHTML=a?`<b>${esc(name)}</b>${meso}<br>${esc(a.type)}<br>${esc(a.start)}–${esc(a.end)}<br>Responsável: ${esc(a.owner)}${a.herdado?'<br><i>Plantão anterior (só visual)</i>':''}${n>1?`<br><i>${n} alertas neste plantão</i>`:''}`:`<b>${esc(name)}</b>${meso}`;
}
function now(){const d=new Date();return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');}
function hojeLocal(){const d=new Date(),p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());}
function dataBR(s){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s||'');return m?m[3]+'/'+m[2]+'/'+m[1]:(s||'');}
function dateBr(){const d=new Date();return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+String(d.getFullYear()).slice(-2);}
function endTime(start,dur){const[h,m]=start.split(':').map(Number),[dh,dm]=dur.split(':').map(Number),z=(h*60+m+dh*60+dm)%1440;return String(Math.floor(z/60)).padStart(2,'0')+':'+String(z%60).padStart(2,'0');}
function relogio(){$('clock').textContent=new Date().toLocaleDateString('pt-BR')+' '+now();}
relogio();setInterval(relogio,1000);

/* ---------------- janela do alerta ---------------- */
function textList(arr){if(arr.length===1)return arr[0];if(arr.length===2)return arr[0]+' e '+arr[1];return arr.slice(0,-1).join(', ')+' e '+arr.at(-1);}
function fenomenos(){return [...document.querySelectorAll('.phen:checked')].map(x=>x.value);}
function applyAlertPreset(){
  const type=$('type').value,boxes=[...document.querySelectorAll('.phen')];
  const vals=type==='Tempestade Severa'?['granizo','vendaval','chuva forte']:(type==='Tempestade'?['rajadas de vento','chuva moderada a forte']:[]);
  boxes.forEach(b=>b.checked=vals.includes(b.value));
  buildMessage();
}
function buildMessage(){
  const type=$('type').value,t=$('time').value,dur=$('duration').value,ph=fenomenos();
  const cities=[...state.selected].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  $('message').value=`Alerta de ${type}${ph.length?' com '+textList(ph):''} às ${t}h com duração de ${dur}h. Cidades: ${textList(cities)}. FONTE: SIMGE/IGAM`;
}
function emitStatus(texto,tipo){$('emitStatus').className='st'+(tipo?' '+tipo:'');$('emitStatus').textContent=texto;}
function openModal(){
  if(!state.selected.size)return;
  $('time').value=now();
  $('owner').value=$('pResp').value.trim();
  $('chips').innerHTML=[...state.selected].sort((a,b)=>a.localeCompare(b,'pt-BR')).map(x=>`<span class="chip">${esc(x)}</span>`).join('');
  emitStatus('Plantão '+rotuloTurno(state.turno)+' (altere na aba Plantão). Ao emitir, o KML é salvo no Drive e o alerta entra na planilha.');
  $('kmlStatus').textContent='Sem preenchimento e com contorno vermelho fino, como o QGIS.';
  applyAlertPreset();$('modalback').style.display='flex';
}
$('create').onclick=openModal;
$('cancel').onclick=()=>$('modalback').style.display='none';
$('type').addEventListener('change',applyAlertPreset);
['duration','time'].forEach(id=>$(id).addEventListener('change',buildMessage));
document.querySelectorAll('.phen').forEach(x=>x.addEventListener('change',buildMessage));
$('copy').onclick=async()=>{
  try{await navigator.clipboard.writeText($('message').value);$('copy').textContent='Copiado!';}
  catch(e){$('message').select();$('copy').textContent='Selecionado, use Ctrl+C';}
  setTimeout(()=>$('copy').textContent='Copiar mensagem',1500);
};

/* ---------------- KML (contorno vermelho fino, sem preenchimento) ---------------- */
function escXml(s){return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');}
function coordString(ring){return ring.map(p=>`${p[0].toFixed(8)},${p[1].toFixed(8)}`).join(' ');}
function featureKml(f){
  const polys=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
  return polys.map(poly=>`<Polygon><outerBoundaryIs><LinearRing><coordinates>${coordString(poly[0])}</coordinates></LinearRing></outerBoundaryIs></Polygon>`).join('');
}
function kmlStamp(){const d=new Date(),p=n=>String(n).padStart(2,'0');return p(d.getHours())+'_'+p(d.getMinutes())+'_'+p(d.getSeconds());}
function montarKml(cities,folder){
  const placemarks=cities.map(name=>{
    const f=featureByName.get(name);
    return `<Placemark><name>${escXml(name)}</name><Style><LineStyle><color>ff0000ff</color><width>1</width></LineStyle><PolyStyle><fill>0</fill><outline>1</outline></PolyStyle></Style><MultiGeometry>${featureKml(f)}</MultiGeometry></Placemark>`;
  }).join('');
  const PI='<'+String.fromCharCode(63);   // escrito assim de propósito: o Apps Script lê menor-que + interrogação como código de modelo
  return `${PI}xml version="1.0" encoding="utf-8" ${String.fromCharCode(63)}><kml xmlns="http://www.opengis.net/kml/2.2"><Document><Folder><name>${folder}</name>${placemarks}</Folder></Document></kml>`;
}
function baixarKml(cities,folder){
  folder=folder||kmlStamp();
  const blob=new Blob([montarKml(cities,folder)],{type:'application/vnd.google-earth.kml+xml'});
  baixarLocal(folder+'.kml',blob);
  return blob.size;
}
$('downloadKml').onclick=()=>{
  const cities=[...state.selected].sort((a,b)=>a.localeCompare(b,'pt-BR'));if(!cities.length)return;
  const size=baixarKml(cities);
  $('kmlStatus').textContent=`KML baixado no PC • ${Math.max(1,Math.round(size/1024))} KB • contorno vermelho sem preenchimento`;
};

/* ---------------- registro diário (.txt) ---------------- */
function ddmmaa(iso){const[y,m,d]=String(iso||'').split('-');return d&&m&&y?d+m+y.slice(-2):'';}
/* "dd/MM/yyyy HH:mm" -> "dd/mm/aa" (mesmo formato de data do .txt antigo) */
function dataTxt(reg){const m=/^(\d{2})\/(\d{2})\/(\d{4})/.exec(String(reg||''));return m?m[1]+'/'+m[2]+'/'+m[3].slice(-2):'';}
$('downloadTxt').onclick=()=>{
  if(temFuncao('alertasDoTurno')){
    const t={...state.turno},btn=$('downloadTxt');
    btn.disabled=true;
    google.script.run
      .withSuccessHandler(r=>{
        btn.disabled=false;
        const rows=((r&&r.linhas)||[]).map(x=>[dataTxt(x.registradoEm),hhmm(x.horario)||x.horario,hhmm(x.duracao)||x.duracao,x.municipio].join('\t'));
        if(!rows.length){alert('Não há alertas válidos registrados no plantão '+rotuloTurno(t)+'.\n\nPara outro turno, escolha-o no campo "Plantão" (aba Plantão e relatório).');return;}
        baixarLocal('alertas_'+ddmmaa(t.data)+'_'+t.turno.toLowerCase()+'.txt',new Blob([rows.join('\r\n')+'\r\n'],{type:'text/plain;charset=utf-8'}));
      })
      .withFailureHandler(e=>{btn.disabled=false;alert('Não foi possível montar o .txt pela planilha: '+(e&&e.message||e));})
      .alertasDoTurno(t.data,t.turno);
    return;
  }
  if(!state.dailyRows.length){alert('Ainda não há alertas emitidos neste plantão.');return;}
  const today=dateBr();
  const rows=state.dailyRows.filter(r=>r.date===today).map(r=>[r.date,r.time,r.duration,r.city].join('\t'));
  if(!rows.length){alert('Não há alertas registrados para hoje.');return;}
  baixarLocal('alertas_'+today.replaceAll('/','')+'.txt',new Blob([rows.join('\r\n')+'\r\n'],{type:'text/plain;charset=utf-8'}));
};

/* ---------------- emitir alerta: salva KML no Drive + linhas na planilha ---------------- */
$('emit').onclick=()=>{
  const cities=[...state.selected].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  const start=$('time').value.trim(),dur=$('duration').value;
  if(!cities.length)return;
  if(!/^([01]?\d|2[0-3]):[0-5]\d$/.test(start)){
    emitStatus('Horário inválido. Use o formato HH:MM, por exemplo 15:40.','erro');$('time').focus();return;
  }
  const folder=kmlStamp();
  const a={id:'',kmlUrl:'',type:$('type').value,owner:$('owner').value.trim()||$('pResp').value.trim()||'Sem identificação',
    start,end:endTime(start,dur),duration:dur,cities,phen:fenomenos(),message:$('message').value,folder};
  const payload={
    data:$('pData').value||hojeLocal(),horario:a.start,duracao:a.duration,fim:a.end,tipo:a.type,
    fenomenos:a.phen,responsavel:a.owner,mensagem:a.message,
    municipios:cities.map(n=>{const p=featureByName.get(n).properties;return{nome:n,meso:p.meso||'',lat:p.label_lat,lon:p.label_lon};}),
    kml:montarKml(cities,folder),
    turno:state.turno.turno,dataTurno:state.turno.data
  };
  $('emit').disabled=true;emitStatus('Salvando o KML no Drive e o alerta na planilha…');
  google.script.run
    .withSuccessHandler(r=>{
      $('emit').disabled=false;
      a.id=(r&&r.id)||('local_'+Date.now());a.kmlUrl=(r&&r.kmlUrl)||'';
      a.meu=true;a.emitidoEm=Date.now();if(r&&r.plantaoId)state.plantaoId=r.plantaoId;
      a.expiresAt=expiryTimestamp(a.start,a.duration);
      a.linha=`${a.start}–${a.end} ${a.type}${a.phen.length?' ('+a.phen.join(', ')+')':''}: ${a.cities.join(', ')}`;
      if(r&&r.turno)aplicarTurnoDoServidor(r.turno);
      if(r&&r.avisoPasta)aviso(esc(r.avisoPasta),true);
      if(r&&r.plantaoId)carregarContexto();
      state.active.unshift(a);
      const date=dateBr();
      cities.forEach(city=>state.dailyRows.push({alertId:a.id,date,time:a.start,duration:a.duration,city}));
      $('pAlertas').value=($('pAlertas').value.trim()?$('pAlertas').value.trim()+'\n':'')+a.linha;
      if(querPc())baixarKml(cities,folder);   // cópia local, como no att_alerta (opção "Baixar também no PC")
      state.selected.clear();drawLine.style.display='none';HIST_SEL.length=0;atualizarDesfazer();
      desenharAlertas();updateSelection();salvarRascunho();
      $('modalback').style.display='none';
      sincronizarAlertas();
    })
    .withFailureHandler(err=>{
      $('emit').disabled=false;
      emitStatus('Não foi possível emitir: '+(err&&err.message?err.message:err)+' O alerta não foi registrado na planilha.','erro');
      const b=document.createElement('button');b.type='button';b.className='btn small';b.textContent='Baixar o KML no PC mesmo assim';
      b.onclick=()=>{baixarKml(cities,folder);b.textContent='KML baixado';b.disabled=true;};
      $('emitStatus').appendChild(document.createElement('br'));$('emitStatus').appendChild(b);
    })
    [temFuncao('registrarAlertaTurno')?'registrarAlertaTurno':'registrarAlerta'](payload);
};

/* ---------------- cards dos alertas ---------------- */
function desenharAlertas(){
  const box=$('activeList');box.innerHTML='';
  if(!state.active.length)box.innerHTML='<p class="hint" style="margin:0">Nenhum alerta neste plantão.</p>';
  state.active.forEach(a=>{
    const card=document.createElement('div');card.className='alert-card';
    const meu=podeExcluir(a);
    card.innerHTML=`<b>${esc(a.type)}</b><div>${esc(a.start)}–${esc(a.end)} • ${esc(a.owner)}${meu?'':' (outro plantonista)'}</div><div class="alert-status">Vigente</div>`+
      `<div>${a.cities.length} município(s): ${esc(a.cities.join(', '))}</div>`+
      (/^https:\/\//.test(a.kmlUrl||'')?`<div><a href="${esc(a.kmlUrl)}" target="_blank" rel="noopener">Abrir KML no Drive</a></div>`:'')+
      `<div class="r"><button type="button" class="btn small download-kml">Baixar KML no PC</button>`+(meu?`<button type="button" class="btn small ghost delete-alert" style="color:var(--err)">Excluir alerta</button>`:'')+`</div>`;
    card.querySelector('.download-kml').onclick=()=>baixarKml(a.cities,a.folder);
    if(meu)card.querySelector('.delete-alert').onclick=()=>{if(confirmarExclusao(a))deleteAlert(a);};
    a.cardEl=card;box.appendChild(card);
  });
  $('activeCount').textContent=state.active.length;
  desenharHerdados();
  preencherAlertasGerados();
  atualizarCards();
  agendarRelatorio(true);
}
function confirmarExclusao(a){
  return confirm(`Excluir o alerta emitido às ${a.start}?\n\n`+
    `Ele continua registrado na planilha (aba Alertas) marcado como "Excluído", com o seu e-mail e o horário, `+
    `mas deixa de valer: sai do mapa, da lista, do .txt, do campo "Alertas gerados" e do relatório em PDF. `+
    `O KML vai para a lixeira do Drive (recuperável por 30 dias).`);
}
/* Tira o alerta só desta tela (mapa, lista, .txt, "Alertas gerados" e rascunho). */
function removerAlertaDaTela(a){
  const idx=state.active.indexOf(a);if(idx===-1)return;
  state.active.splice(idx,1);
  if(a.id)state.dailyRows=state.dailyRows.filter(r=>r.alertId!==a.id);
  if(a.linha)$('pAlertas').value=$('pAlertas').value.split('\n').filter(l=>l.trim()!==a.linha).join('\n');
  desenharAlertas();updateSelection();salvarRascunho();
}
/* Exclui na planilha e no Drive (excluirAlerta no Apps Script) e, se der certo, na tela. */
function deleteAlert(a){
  if(!a.id||/^local_/.test(a.id)){removerAlertaDaTela(a);return;}   // nunca chegou à planilha
  const btn=a.cardEl&&a.cardEl.querySelector('.delete-alert');
  if(btn){btn.disabled=true;btn.textContent='Excluindo…';}
  google.script.run
    .withSuccessHandler(r=>{
      removerAlertaDaTela(a);sincronizarAlertas();
      if(r&&!r.kmlNaLixeira)alert('Alerta marcado como excluído, mas o KML não pôde ir para a lixeira. Se precisar, apague-o na pasta do turno no Drive.');
    })
    .withFailureHandler(err=>{
      if(btn){btn.disabled=false;btn.textContent='Excluir alerta';}
      const msg=err&&err.message?err.message:err;
      if(confirm('Não foi possível excluir na planilha: '+msg+'\n\nQuer remover o alerta só desta tela?'))removerAlertaDaTela(a);
    })
    .excluirAlerta(a.id);
}
$('undoLastAlert').onclick=()=>{
  if(!state.active.length){alert('Não há alertas emitidos para desfazer.');return;}
  const last=state.active.find(podeExcluir);
  if(!last){alert('Não há alertas seus para desfazer. Alertas de outros plantonistas só podem ser excluídos por quem emitiu.');return;}
  if(confirmarExclusao(last))deleteAlert(last);
};

$('findCity').onclick=()=>{
  const q=semAcento($('searchCity').value.trim());if(!q)return;fecharSug();
  const f=GEO.features.find(x=>semAcento(x.properties.nome)===q)||GEO.features.find(x=>semAcento(x.properties.nome).startsWith(q))||GEO.features.find(x=>semAcento(x.properties.nome).includes(q));
  if(!f){$('searchCity').setCustomValidity('Município não encontrado.');$('searchCity').reportValidity();setTimeout(()=>$('searchCity').setCustomValidity(''),1500);return;}
  guardarSel();state.selected.add(f.properties.nome);updateSelection();
  const c=xy(f.properties.label_lon,f.properties.label_lat);state.view={x:Math.max(0,c[0]-120),y:Math.max(0,c[1]-91),w:240,h:182.4};clampView();applyView();
};
/* sugestões de municípios enquanto digita (sem diferenciar acentos/maiúsculas; ↑ ↓ para escolher, Enter vai) */
function semAcento(t){return String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');}
const NOMES_MUN=GEO.features.map(f=>f.properties.nome).sort((a,b)=>a.localeCompare(b,'pt-BR'));
let sugBox=null,sugIdx=-1,sugItens=[];
function fecharSug(){if(sugBox)sugBox.style.display='none';sugIdx=-1;sugItens=[];}
function escolherSug(nome){$('searchCity').value=nome;fecharSug();$('findCity').click();}
function mostrarSug(){
  const inp=$('searchCity'),q=semAcento(inp.value.trim());
  if(!q){fecharSug();return;}
  const ini=[],meio=[];
  for(const n of NOMES_MUN){const k=semAcento(n);if(k.startsWith(q))ini.push(n);else if(k.includes(q))meio.push(n);if(ini.length>=8)break;}
  sugItens=ini.concat(meio).slice(0,8);
  if(!sugBox){sugBox=document.createElement('div');sugBox.className='sug-mun';sugBox.setAttribute('role','listbox');
    const wrap=inp.closest('.search')||inp.parentNode;wrap.style.position='relative';wrap.appendChild(sugBox);}
  if(!sugItens.length){sugBox.innerHTML='<div class="sug-vazio">Nenhum município encontrado</div>';sugBox.style.display='block';sugIdx=-1;return;}
  const marca=n=>{const k=semAcento(n),i=k.indexOf(q);return i<0?esc(n):esc(n.slice(0,i))+'<b>'+esc(n.slice(i,i+q.length))+'</b>'+esc(n.slice(i+q.length));};
  sugBox.innerHTML=sugItens.map((n,i)=>`<div class="sug-it${i===sugIdx?' on':''}" role="option" data-i="${i}">${marca(n)}</div>`).join('');
  sugBox.querySelectorAll('.sug-it').forEach(el=>el.onmousedown=e=>{e.preventDefault();escolherSug(sugItens[+el.dataset.i]);});
  sugBox.style.display='block';
}
$('searchCity').addEventListener('input',()=>{sugIdx=-1;mostrarSug();});
$('searchCity').addEventListener('blur',()=>setTimeout(fecharSug,120));
$('searchCity').addEventListener('keydown',e=>{
  const aberto=sugBox&&sugBox.style.display==='block'&&sugItens.length;
  if(e.key==='ArrowDown'&&aberto){e.preventDefault();sugIdx=(sugIdx+1)%sugItens.length;mostrarSug();}
  else if(e.key==='ArrowUp'&&aberto){e.preventDefault();sugIdx=(sugIdx-1+sugItens.length)%sugItens.length;mostrarSug();}
  else if(e.key==='Escape'){fecharSug();}
  else if(e.key==='Enter'){e.preventDefault();if(aberto&&sugIdx>=0)escolherSug(sugItens[sugIdx]);else if(aberto&&sugItens.length===1)escolherSug(sugItens[0]);else $('findCity').click();}
});
{const st=document.createElement('style');st.textContent='.sug-mun{display:none;position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:2000;background:var(--card,#16243a);border:1px solid var(--line,#2b3d57);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.35);max-height:280px;overflow:auto;padding:4px}'+
  '.sug-it{padding:7px 10px;border-radius:6px;cursor:pointer;font-size:14px}.sug-it b{color:#4fb3ff}.sug-it:hover,.sug-it.on{background:rgba(79,179,255,.16)}.sug-vazio{padding:7px 10px;font-size:13px;opacity:.7}';document.head.appendChild(st);}

/* ---------------- transparências ---------------- */
function aplicarLimites(){const v=Number($('boundaryOpacity').value)/100;pathByName.forEach(p=>p.style.strokeOpacity=v);}
$('boundaryOpacity').addEventListener('input',()=>{$('boundaryOpacityVal').textContent=$('boundaryOpacity').value+'%';aplicarLimites();});
$('satOpacity').addEventListener('input',()=>{
  WX.satOpacity=Number($('satOpacity').value)/100;$('satOpacityVal').textContent=$('satOpacity').value+'%';
  irLayer.style.opacity=WX.satOpacity;visLayer.style.opacity=WX.satOpacity;
});
$('glmOpacity').addEventListener('input',()=>{
  WX.glmOpacity=Number($('glmOpacity').value)/100;$('glmOpacityVal').textContent=$('glmOpacity').value+'%';
  glmLayer.style.opacity=WX.glmOpacity;
});

/* ---------------- abas ---------------- */
function mostrarAba(qual){
  const mapa=qual==='mapa';
  $('abaMapa').setAttribute('aria-selected',mapa);$('abaPlantao').setAttribute('aria-selected',!mapa);
  $('viewMapa').hidden=!mapa;$('viewPlantao').hidden=mapa;
  document.querySelectorAll('.actions [data-view]').forEach(b=>b.hidden=b.dataset.view!==qual);
  tooltip.style.display='none';
  if(!mapa)agendarRelatorio(true);
  try{sessionStorage.setItem('alertas:aba',qual);}catch(e){}
}
$('abaMapa').onclick=()=>mostrarAba('mapa');
$('abaPlantao').onclick=()=>mostrarAba('plantao');
document.querySelector('.tabs').addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){const to=$('viewPlantao').hidden?'plantao':'mapa';mostrarAba(to);$(to==='mapa'?'abaMapa':'abaPlantao').focus();}});

/* ---------------- Mapa de Previsões (imagem do formulário) ---------------- */
let mapaPrevisoesB64='',mapaPrev={url:'',w:0,h:0};
function limparMapaPrevisoes(){mapaPrevisoesB64='';mapaPrev={url:'',w:0,h:0};$('pMapaPrev').value='';$('pMapaPrevInfo').textContent=TXT_MAPA_PREV;agendarRelatorio();}
$('pMapaPrev').onchange=()=>{
  const f=$('pMapaPrev').files[0];mapaPrevisoesB64='';mapaPrev={url:'',w:0,h:0};
  if(!f){limparMapaPrevisoes();return;}
  if(f.type!=='image/png'&&!/\.png$/i.test(f.name)){limparMapaPrevisoes();$('pMapaPrevInfo').textContent='Envie uma imagem PNG.';return;}
  if(f.size>8*1024*1024){limparMapaPrevisoes();$('pMapaPrevInfo').textContent='Imagem grande demais (máximo de 8 MB).';return;}
  const r=new FileReader();
  r.onload=()=>{
    const url=String(r.result);mapaPrevisoesB64=url.split(',')[1]||'';
    const img=new Image();
    img.onload=()=>{mapaPrev={url,w:img.naturalWidth,h:img.naturalHeight};$('pMapaPrevInfo').textContent='Imagem pronta: '+f.name+' ('+Math.round(f.size/1024)+' KB).';agendarRelatorio();};
    img.onerror=()=>{limparMapaPrevisoes();$('pMapaPrevInfo').textContent='Não foi possível ler a imagem.';};
    img.src=url;
  };
  r.onerror=()=>{limparMapaPrevisoes();$('pMapaPrevInfo').textContent='Não foi possível ler a imagem.';};
  r.readAsDataURL(f);
};

/* ---------------- v3.6: Outras imagens (várias; botão "+ Imagens" ou Ctrl+V de um print) ----------------
   Separadas do Mapa de Previsões. Cada imagem é redesenhada no navegador (lado maior até 2000 px, JPEG)
   e a soma fica limitada, para o PDF caber no Drive e no e-mail (24 MB) sem falhar. */
const IMG_LADO_MAX=2000,IMG_QUALIDADE=0.88,IMG_TOTAL_MAX=12*1024*1024,IMG_ARQ_MAX=25*1024*1024;
const TXT_OUTRAS='Opcional. Use “+ Imagens” ou cole um print com Ctrl+V nesta aba. Saem no relatório em PDF, depois do Mapa de Previsões.';
let imagensOutras=[];   // [{nome,url,w,h,bytes}]
const imgBytes=()=>imagensOutras.reduce((a,i)=>a+i.bytes,0);
function reduzirImagem(file){
  return new Promise((ok,no)=>{
    const u=URL.createObjectURL(file),img=new Image();
    img.onload=()=>{
      try{
        const k=Math.min(1,IMG_LADO_MAX/Math.max(img.naturalWidth,img.naturalHeight));
        const w=Math.max(1,Math.round(img.naturalWidth*k)),h=Math.max(1,Math.round(img.naturalHeight*k));
        const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');
        g.fillStyle='#ffffff';g.fillRect(0,0,w,h);g.drawImage(img,0,0,w,h);
        const url=c.toDataURL('image/jpeg',IMG_QUALIDADE);URL.revokeObjectURL(u);
        ok({url,w,h,bytes:Math.round((url.length-url.indexOf(',')-1)*0.75)});
      }catch(e){URL.revokeObjectURL(u);no(e);}
    };
    img.onerror=()=>{URL.revokeObjectURL(u);no(new Error('não foi possível ler a imagem'));};
    img.src=u;
  });
}
function listarOutras(msg){
  const box=$('pOutrasLista');box.innerHTML='';
  imagensOutras.forEach((im,i)=>{
    const d=document.createElement('div');d.className='it';
    d.innerHTML=`<img alt="" src="${im.url}"><span title="${esc(im.nome)}">${i+1}. ${esc(im.nome)}</span><small>${Math.round(im.bytes/1024)} KB</small>`;
    const b=document.createElement('button');b.type='button';b.className='btn small';b.textContent='Remover';
    b.onclick=()=>{imagensOutras.splice(i,1);listarOutras();agendarRelatorio();};
    d.appendChild(b);box.appendChild(d);
  });
  $('pOutrasInfo').textContent=msg||(imagensOutras.length
    ?imagensOutras.length+(imagensOutras.length>1?' imagens':' imagem')+' no relatório · '+(imgBytes()/1048576).toFixed(1)+' MB de '+Math.round(IMG_TOTAL_MAX/1048576)+' MB permitidos.'
    :TXT_OUTRAS);
}
function limparOutrasImagens(){imagensOutras=[];$('pOutras').value='';listarOutras();agendarRelatorio();}
async function adicionarOutras(fs){
  const avisos=[];
  for(const f of fs){
    if(!/^image\/(png|jpeg)$/.test(f.type)&&!/\.(png|jpe?g)$/i.test(f.name)){avisos.push((f.name||'imagem')+': envie PNG ou JPG.');continue;}
    if(f.size>IMG_ARQ_MAX){avisos.push(f.name+': arquivo grande demais (máximo de 25 MB).');continue;}
    $('pOutrasInfo').textContent='Preparando '+(f.name||'imagem')+'…';
    try{
      const r=await reduzirImagem(f);
      if(imgBytes()+r.bytes>IMG_TOTAL_MAX){avisos.push((f.name||'imagem')+': não coube — o relatório chegou ao limite de imagens. Remova alguma para incluir esta.');continue;}
      imagensOutras.push({nome:f.name||'imagem',...r});
    }catch(e){avisos.push((f.name||'imagem')+': não foi possível ler a imagem.');}
  }
  listarOutras(avisos.join(' '));
  agendarRelatorio();
}
$('pOutras').onchange=()=>{const fs=[...$('pOutras').files];$('pOutras').value='';adicionarOutras(fs);};
/* Ctrl+V: com a aba do plantão aberta, um print colado vira "Outra imagem" (texto colado em campos continua normal) */
document.addEventListener('paste',e=>{
  if($('viewPlantao').hidden)return;
  const itens=[...((e.clipboardData&&e.clipboardData.items)||[])].filter(it=>it.kind==='file'&&/^image\//.test(it.type));
  if(!itens.length)return;
  e.preventDefault();
  const p=n=>String(n).padStart(2,'0'),d=new Date();
  const fs=itens.map((it,i)=>{const f=it.getAsFile();
    const nome='print_'+p(d.getHours())+p(d.getMinutes())+p(d.getSeconds())+(itens.length>1?'_'+(i+1):'')+'.png';
    try{return new File([f],nome,{type:f.type||'image/png'});}catch(x){f.name2=nome;return f;}});
  adicionarOutras(fs.filter(Boolean));
  try{$('pOutrasLista').scrollIntoView({block:'nearest'});}catch(x){}
});
listarOutras();

/* ---------------- plantão ---------------- */
const CAMPOS_PLANTAO={responsavel:'pResp',data:'pData',inicio:'pInicio',fim:'pFim',intercorrencias:'pInter',alertas:'pAlertas',ferramentas:'pFerr',passagem:'pPassagem',
  intervaloInicio:'pIntIni',intervaloFim:'pIntFim',intervaloObs:'pIntObs',   // v3.7
  pub1Periodo:'pPub1Per',pub1Hora:'pPub1Hora',pub2Periodo:'pPub2Per',pub2Hora:'pPub2Hora'};
/* v3.7: publicações da previsão diária [{periodo,hora}] e textos para o relatório */
function publicacoesForm(c){
  c=c||{};
  return [[c.pub1Periodo,c.pub1Hora],[c.pub2Periodo,c.pub2Hora]]
    .map(([periodo,hora])=>({periodo:periodo||'',hora:hora||''})).filter(p=>p.periodo&&p.hora);
}
function textoPublicacoes(c){
  const ps=publicacoesForm(c);
  return ['Manhã','Tarde'].map(per=>{const h=ps.filter(p=>p.periodo===per).map(p=>p.hora);return h.length?per+': '+h.join(', '):'';})
    .filter(Boolean).join('\n');
}
function textoIntervalo(c){
  c=c||{};
  const h=c.intervaloInicio||c.intervaloFim?'Das '+(c.intervaloInicio||'?')+' às '+(c.intervaloFim||'?'):'';
  return [h,(c.intervaloObs||'').trim()?'Obs.: '+c.intervaloObs.trim():''].filter(Boolean).join('\n');
}
function padraoPublicacoes(){
  if($('pPub1Per')&&!$('pPub1Per').value)$('pPub1Per').value='Manhã';
  if($('pPub2Per')&&!$('pPub2Per').value)$('pPub2Per').value='Tarde';
}

function salvarRascunho(){
  try{
    const active=state.active.map(a=>{const c={...a};delete c.cardEl;return c;});
    const r={campos:{},active,dailyRows:state.dailyRows,plantaoId:state.plantaoId,turno:state.turno,salvoEm:new Date().toISOString()};
    Object.entries(CAMPOS_PLANTAO).forEach(([k,id])=>r.campos[k]=$(id)?$(id).value:'');
    localStorage.setItem(CHAVE_RASCUNHO,JSON.stringify(r));
    $('rascunhoInfo').textContent='Rascunho guardado neste navegador às '+now()+'.';
  }catch(e){}
}
function carregarRascunho(){
  try{
    const r=JSON.parse(localStorage.getItem(CHAVE_RASCUNHO)||'null');if(!r)return false;
    Object.entries(CAMPOS_PLANTAO).forEach(([k,id])=>{if($(id)&&r.campos&&r.campos[k]!=null)$(id).value=r.campos[k];});
    padraoPublicacoes();
    if(Array.isArray(r.active))state.active=r.active.filter(a=>a&&Array.isArray(a.cities));
    if(Array.isArray(r.dailyRows))state.dailyRows=r.dailyRows;
    if(r.plantaoId)state.plantaoId=r.plantaoId;
    if(r.plantaoId&&r.turno&&r.turno.turno&&r.turno.data)state.turno=r.turno;   // turno do rascunho só vale com plantão em andamento
    $('rascunhoInfo').textContent='Rascunho recuperado deste navegador.';
    return true;
  }catch(e){return false;}
}
function apagarRascunho(){try{localStorage.removeItem(CHAVE_RASCUNHO);}catch(e){}$('rascunhoInfo').textContent='';}
Object.values(CAMPOS_PLANTAO).forEach(id=>{const el=$(id);if(!el)return;['input','change'].forEach(ev=>el.addEventListener(ev,()=>{clearTimeout(window._tRasc);window._tRasc=setTimeout(salvarRascunho,600);agendarRelatorio();}));});
$('pResp').addEventListener('change',()=>{$('quem').textContent=$('pResp').value.trim()||$('quem').dataset.email||'';});

function mostrarAnterior(u){
  const box=$('anterior');box.innerHTML='';
  if(!u){box.innerHTML='<p class="meta2">Nenhuma passagem de plantão salva ainda.</p>';return;}
  let meta=(u.responsavel||'Responsável não informado')+', '+dataBR(u.data);
  if(u.inicio||u.fim)meta+=', das '+(u.inicio||'?')+' às '+(u.fim||'?');
  box.innerHTML=`<p class="meta2">${esc(meta)}</p><div class="passagem"><strong>Áreas suscetíveis e pendências</strong>${esc(u.passagem||'Nada registrado.')}</div>`;
  const det=document.createElement('details');
  det.innerHTML='<summary>Ver o resto do plantão anterior</summary>'+
    [['Intervalo / revezamento',textoIntervalo(u)],
     ['Publicação da previsão diária',[u.pubManha?'Manhã: '+u.pubManha:'',u.pubTarde?'Tarde: '+u.pubTarde:''].filter(Boolean).join(' · ')],
     ['Intercorrências',u.intercorrencias],['Alertas gerados',u.alertas],['Ferramentas utilizadas',u.ferramentas]]
      .filter(x=>x[1]).map(x=>`<b>${x[0]}</b><p>${esc(x[1])}</p>`).join('');
  if(det.querySelector('b'))box.appendChild(det);
}
function mostrarIdPlantao(p){
  const el=$('idPlantao');
  if(p&&p.id){el.innerHTML='ID do plantão em andamento: <b>'+esc(p.id)+'</b>'+(p.iniciadoEm?'<br>Iniciado em '+esc(p.iniciadoEm):'');}
  else{el.textContent='Novo plantão. O ID é criado no primeiro alerta ou na passagem salva, e liga tudo na planilha.';}
  agendarRelatorio();
}
function status(texto,tipo){const el=$('statusPlantao');el.className='st'+(tipo?' '+tipo:'');el.textContent=texto;}

/* ===================== RELATÓRIO DO PLANTÃO EM PDF (A4) =====================
 * Mesmo conteúdo do relatório anterior (Google Docs), agora montado no navegador
 * como o boletim da Previsão diária: prévia ao vivo à direita e PDF gerado com jsPDF.
 * Conteúdo: título, ID, data de geração, tabela "Dados do Plantão" (campos, contagens
 * e link da pasta), mapa com os municípios alertados e, se enviado, o Mapa de Previsões.
 * Todo o texto sai em preto.
 */
const A4={w:210,h:297,m:14.8};          // 42 pt de margem, como antes
const PT=25.4/72;                         // 1 pt em mm
const REL_COL0=150*PT;                    // 1ª coluna da tabela: 150 pt, como antes
const REL_TEXTO='#000000';
const REL_BORDA='#c9d3dc', REL_DESTAQUE='#eef3f7';

// caracteres que as fontes-padrão do PDF não têm viram equivalentes (como na Previsão)
const WINANSI_EXTRA='€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
function pdfSafe(t){
  return String(t==null?'':t).replace(/[   ]/g,' ').replace(/[‐‑‒−]/g,'-').replace(/\r/g,'')
    .replace(/[^\n\x20-\xFF]/g,c=>WINANSI_EXTRA.indexOf(c)>=0?c:'?');
}
let _relDoc=null;const _relCtx=document.createElement('canvas').getContext('2d');
function medidor(){
  if(!_relDoc&&window.jspdf)_relDoc=new window.jspdf.jsPDF({unit:'mm',format:'a4'});
  return (txt,pt,bold)=>{
    if(_relDoc){_relDoc.setFont('helvetica',bold?'bold':'normal');_relDoc.setFontSize(pt);return _relDoc.getTextWidth(txt);}
    _relCtx.font=`${bold?700:400} 100px Helvetica, Arial, sans-serif`;return _relCtx.measureText(txt).width*pt*PT/100;
  };
}
/* quebra o texto em linhas que cabem na largura (respeita as quebras de linha do usuário) */
function quebrar(texto,larg,pt,bold,M){
  const out=[];
  pdfSafe(texto).split('\n').forEach(par=>{
    const palavras=par.split(/ +/).filter(Boolean);
    if(!palavras.length){out.push('');return;}
    let cur='';
    palavras.forEach(p=>{
      while(M(p,pt,bold)>larg&&p.length>1){                // palavra maior que a linha: corta
        let n=p.length;while(n>1&&M(p.slice(0,n),pt,bold)>larg)n--;
        if(cur){out.push(cur);cur='';}
        out.push(p.slice(0,n));p=p.slice(n);
      }
      const t=cur?cur+' '+p:p;
      if(cur&&M(t,pt,bold)>larg){out.push(cur);cur=p;}else cur=t;
    });
    out.push(cur);
  });
  while(out.length>1&&out[out.length-1]==='')out.pop();
  return out.length?out:[''];
}
function dataHoraBR(d){const p=n=>String(n).padStart(2,'0');return p(d.getDate())+'/'+p(d.getMonth()+1)+'/'+d.getFullYear()+' '+p(d.getHours())+':'+p(d.getMinutes());}
function carimbo(d){const p=n=>String(n).padStart(2,'0');return d.getFullYear()+p(d.getMonth()+1)+p(d.getDate())+'-'+p(d.getHours())+p(d.getMinutes())+p(d.getSeconds());}

/* dados do relatório a partir do formulário e dos alertas na tela */
function dadosRelatorio(){
  const c={};Object.entries(CAMPOS_PLANTAO).forEach(([k,id])=>c[k]=$(id)?$(id).value:'');
  const ids=new Set(state.active.map(a=>a.id).filter(Boolean));
  return {id:state.plantaoId||'',geradoEm:new Date(),campos:c,nAlertas:ids.size,turno:{...state.turno},
    nArquivos:1,pastaUrl:state.pastaUrl||'',mapa:'',prev:mapaPrev.url?{...mapaPrev}:null,outras:imagensOutras.map(i=>({...i}))};
}
function linhasDaTabela(d){
  const c=d.campos;
  return [
    ['ID do plantão',d.id||'(criado ao salvar)'],
    ['Responsável',c.responsavel],['Data do plantão',dataBR(c.data)],['Turno',d.turno&&d.turno.turno||''],['Início',c.inicio],['Fim',c.fim],
    ['Intervalo / revezamento',textoIntervalo(c)],['Publicação da previsão diária',textoPublicacoes(c)],
    ['Intercorrências',c.intercorrencias],['Ferramentas utilizadas',c.ferramentas],['Alertas gerados',c.alertas],
    ['Passagem de plantão (áreas suscetíveis e pendências)',c.passagem],
    ['Nº de alertas',String(d.nAlertas)],['Nº de arquivos',String(d.nArquivos)],
    ['Link de acesso',d.pastaUrl,true]
  ].map(([k,v,link])=>[k,String(v==null?'':v).trim()||'—',!!link&&/^https:\/\//.test(v||'')]);
}
/* monta as páginas: lista de itens {k:'t'|'rect'|'img'|'line'} em milímetros */
function layoutRelatorio(d){
  const M=medidor(),Wt=A4.w-2*A4.m,pages=[[]];
  let pg=pages[0],y=A4.m;
  const nova=()=>{pg=[];pages.push(pg);y=A4.m;};
  const fundo=A4.h-A4.m;
  const texto=(t,pt,b,antes)=>{
    const lh=pt*PT*1.32;y+=antes||0;
    quebrar(t,Wt,pt,b,M).forEach(l=>{if(y+lh>fundo)nova();y+=lh;pg.push({k:'t',t:l,x:A4.m,y:y-lh*0.24,pt,b});});
  };
  const secao=t=>{texto(t,13,true,5);y+=1.2;};
  texto('Relatório do Monitoramento Meteorológico',16,true);
  texto('ID do plantão: '+(d.id||'(criado ao salvar)'),10,true,2);
  texto('Gerado em '+dataHoraBR(d.geradoEm),9,false,0.6);
  secao('Dados do Plantão');
  // tabela chave/valor
  const pt=9,lh=pt*PT*1.25,px=4*PT,py=2*PT,c0=REL_COL0,c1=Wt-c0;
  linhasDaTabela(d).forEach(([k,v,link])=>{
    const l0=quebrar(k,c0-2*px,pt,true,M),l1=quebrar(v,c1-2*px,pt,false,M),n=Math.max(l0.length,l1.length);
    let i=0;
    while(i<n){
      const cabem=Math.floor((fundo-y-2*py)/lh);
      if(cabem<1){nova();continue;}
      const q=Math.min(cabem,n-i),h=q*lh+2*py;
      pg.push({k:'rect',x:A4.m,y,w:c0,h,fill:REL_DESTAQUE});
      pg.push({k:'rect',x:A4.m+c0,y,w:c1,h,fill:null});
      for(let j=0;j<q;j++){
        const by=y+py+(j+1)*lh-lh*0.26;
        if(l0[i+j])pg.push({k:'t',t:l0[i+j],x:A4.m+px,y:by,pt,b:true});
        if(l1[i+j]){
          const it={k:'t',t:l1[i+j],x:A4.m+c0+px,y:by,pt,b:false};
          if(link){it.link=v;it.u=true;}
          pg.push(it);
        }
      }
      y+=h;i+=q;
    }
  });
  // mapa dos alertas
  // v3.8: mapa no layout da Previsão diária (297 × 210 mm); se o layout não carregar, vale a foto antiga da tela (1000 × 760)
  const mh=Wt*(d.mapaProp||760/1000);
  if(d.mapa){y+=3;if(y+mh>fundo)nova();pg.push({k:'img',src:d.mapa,fmt:d.mapaFmt||'PNG',x:A4.m,y,w:Wt,h:mh});y+=mh;}
  else texto(d.mapaPendente?'Gerando a imagem do mapa…':'Mapa não disponível (não foi possível capturar a imagem do mapa).',10,false,3);
  // Mapa de Previsões
  if(d.prev&&d.prev.url&&d.prev.w&&d.prev.h){
    secao('Mapa de Previsões');
    const maxH=A4.h-2*A4.m-60*PT,k=Math.min(Wt/d.prev.w,maxH/d.prev.h),w=d.prev.w*k,h=d.prev.h*k;
    if(y+h>fundo)nova();
    pg.push({k:'img',src:d.prev.url,fmt:'PNG',x:A4.m+(Wt-w)/2,y,w,h});y+=h;
  }
  // v3.6: outras imagens (prints etc.), cada uma em JPEG reduzido
  const outras=(d.outras||[]).filter(p=>p&&p.url&&p.w&&p.h);
  if(outras.length){
    secao('Outras imagens');
    outras.forEach((p,i)=>{
      const maxH=A4.h-2*A4.m-60*PT,k=Math.min(Wt/p.w,maxH/p.h),w=p.w*k,h=p.h*k;
      if(i)y+=3;
      if(y+h>fundo)nova();
      pg.push({k:'img',src:p.url,fmt:'JPEG',x:A4.m+(Wt-w)/2,y,w,h});y+=h;
    });
  }
  return pages;
}
const f2=n=>(Math.round(n*100)/100).toString();
function paginaSvg(page){
  const o=[`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${A4.w} ${A4.h}"><rect width="${A4.w}" height="${A4.h}" fill="#fff"/>`];
  page.forEach(it=>{
    if(it.k==='rect')o.push(`<rect x="${f2(it.x)}" y="${f2(it.y)}" width="${f2(it.w)}" height="${f2(it.h)}" fill="${it.fill||'none'}" stroke="${REL_BORDA}" stroke-width="0.18"/>`);
    else if(it.k==='img')o.push(`<image href="${it.src}" xlink:href="${it.src}" x="${f2(it.x)}" y="${f2(it.y)}" width="${f2(it.w)}" height="${f2(it.h)}" preserveAspectRatio="none"/>`);
    else{
      o.push(`<text x="${f2(it.x)}" y="${f2(it.y)}" font-family="Helvetica, Arial, sans-serif" font-size="${f2(it.pt*PT)}" font-weight="${it.b?700:400}" fill="${REL_TEXTO}"${it.u?' text-decoration="underline"':''}>${esc(it.t)}</text>`);
    }
  });
  o.push('</svg>');return o.join('');
}
function hexRgb(h){const n=parseInt(h.slice(1),16);return [n>>16&255,n>>8&255,n&255];}
function gerarPdf(d){
  if(!(window.jspdf&&window.jspdf.jsPDF))throw new Error('A biblioteca de PDF (jspdf) ainda não carregou. Aguarde alguns segundos ou recarregue a página.');
  const pages=layoutRelatorio(d);
  const pdf=new window.jspdf.jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
  pages.forEach((pg,i)=>{
    if(i)pdf.addPage('a4','portrait');
    pg.forEach(it=>{
      if(it.k==='rect'){
        pdf.setDrawColor(...hexRgb(REL_BORDA));pdf.setLineWidth(0.18);
        if(it.fill){pdf.setFillColor(...hexRgb(it.fill));pdf.rect(it.x,it.y,it.w,it.h,'FD');}else pdf.rect(it.x,it.y,it.w,it.h,'S');
      }else if(it.k==='img')pdf.addImage(it.src,it.fmt||'PNG',it.x,it.y,it.w,it.h,undefined,'FAST');
      else{
        pdf.setFont('helvetica',it.b?'bold':'normal');pdf.setFontSize(it.pt);pdf.setTextColor(0,0,0);
        pdf.text(it.t,it.x,it.y);
        if(it.u){const w=pdf.getTextWidth(it.t);pdf.setDrawColor(0,0,0);pdf.setLineWidth(0.15);pdf.line(it.x,it.y+0.5,it.x+w,it.y+0.5);}
        if(it.link){const w=pdf.getTextWidth(it.t);pdf.link(it.x,it.y-it.pt*PT,w,it.pt*PT*1.3,{url:it.link});}
      }
    });
  });
  pdf.setProperties({title:'Relatório do Monitoramento Meteorológico'+(d.id?' - '+d.id:''),author:'SIMGE/IGAM',creator:'Alertas SIMGE '+(window.VERSAO_APP||'')});
  return {blob:pdf.output('blob'),paginas:pages.length};
}

/* ---- imagem do mapa: Minas inteira, sem seleção nem nomes, municípios alertados em amarelo ---- */
const PROPS_SVG=['fill','fill-opacity','stroke','stroke-width','stroke-opacity','stroke-dasharray',
  'stroke-linejoin','stroke-linecap','opacity','display','visibility','font-family','font-size',
  'font-weight','text-anchor','dominant-baseline','paint-order'];
function fotografarMapa(nomes){
  const L=2000,A=1520;                                   // viewBox 0 0 1000 760, em dobro
  const copia=svg.cloneNode(true);
  copia.removeAttribute('id');copia.setAttribute('viewBox','0 0 1000 760');
  copia.classList.remove('labels-visible','panning');
  [].forEach.call(copia.querySelectorAll('#wxBaseLayer, .drawline'),el=>el.remove());
  [].forEach.call(copia.querySelectorAll('[data-name]'),p=>{
    p.classList.remove('selected','alerted','expiring','expired');
    if(nomes.has(p.getAttribute('data-name')))p.classList.add('alerted');
  });
  const caixa=document.createElement('div');
  caixa.style.cssText='position:fixed;left:-20000px;top:0;width:1000px;height:760px;pointer-events:none';
  caixa.appendChild(copia);document.body.appendChild(caixa);
  let xml;
  try{
    [copia].concat([].slice.call(copia.querySelectorAll('*'))).forEach(el=>{
      const cs=getComputedStyle(el);let txt='';
      PROPS_SVG.forEach(k=>{const v=cs.getPropertyValue(k);if(v)txt+=k+':'+v+';';});
      el.setAttribute('style',txt);
    });
    copia.setAttribute('style','');copia.setAttribute('xmlns','http://www.w3.org/2000/svg');
    copia.setAttribute('width',L);copia.setAttribute('height',A);
    xml=new XMLSerializer().serializeToString(copia);
  }finally{caixa.remove();}
  return new Promise(ok=>{
    const img=new Image(),url=URL.createObjectURL(new Blob([xml],{type:'image/svg+xml'}));
    const fim=v=>{URL.revokeObjectURL(url);ok(v);};
    img.onload=()=>{
      try{const c=document.createElement('canvas');c.width=L;c.height=A;const g=c.getContext('2d');
        g.fillStyle='#ffffff';g.fillRect(0,0,L,A);g.drawImage(img,0,0,L,A);fim(c.toDataURL('image/png'));}
      catch(e){fim('');}
    };
    img.onerror=()=>fim('');
    img.src=url;
  });
}
function municipiosAlertados(){const s=new Set();state.active.forEach(a=>(a.cities||[]).forEach(n=>s.add(n)));return s;}
/* ---- v3.8: mapa dos alertas no MESMO layout da Previsão diária (assets/layout-mapa.js) ----
   Cabeçalho, legenda, rodapé com logos, 297 × 210 mm, pontos e nomes das 25 cidades de referência e
   os mesmos mapas base (seletor "Fundo" ao lado de "Baixar PDF no PC"). */
const CIDADES_REF=['Almenara','Barbacena','Belo Horizonte','Buritis','Campos Altos','Carneirinho','Curvelo','Diamantina','Divinópolis',
  'Extrema','Governador Valadares','Ipatinga','Itamonte','Januária','Juiz de Fora','Manhuaçu','Montes Claros','Paracatu','Patos de Minas',
  'Pirapora','Poços de Caldas','Teófilo Otoni','Uberaba','Uberlândia','Viçosa'];
let layoutPromessa=null;
function garantirLayout(){
  if(window.LayoutMapa)return Promise.resolve();
  if(layoutPromessa)return layoutPromessa;
  const base=window.BASE_DADOS||'../',v=window.VERSAO_APP?'?v='+encodeURIComponent(window.VERSAO_APP):'';
  const carregar=window.carregarScript||(src=>new Promise((ok,erro)=>{const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=()=>erro(new Error('Falhou ao carregar '+src));document.head.appendChild(s);}));
  const temGeo=!!document.querySelector('script[src*="previsao/data/geo.js"]');
  layoutPromessa=(temGeo?Promise.resolve():carregar(base+'previsao/data/geo.js'+v))
    .then(()=>carregar(base+'assets/layout-mapa.js'+v))
    .then(()=>{if(!window.LayoutMapa)throw new Error('layout do mapa indisponível');})
    .catch(e=>{layoutPromessa=null;throw e;});
  return layoutPromessa;
}
function opcoesMapaAlertas(nomes){
  const c=dadosRelatorio().campos,data=c.data||'',turno=(state.turno&&state.turno.turno)||'';
  const dataTxt=data?dataBR(data):'data pendente';
  return {
    titulo:'Alertas - '+dataTxt+(turno?' ('+turno+')':''),
    textoValidade:'Alertas emitidos no plantão'+(turno?' '+turno.toLowerCase():'')+(data?' de '+dataTxt:''),
    credito:'Alertas - SIMGE/IGAM, '+((data||new Date().toISOString()).slice(0,4)),
    areas:[...nomes].map(n=>featureByName.get(n)).filter(Boolean).map(f=>({geometry:f.geometry,fill:'#f1c34d',opacity:0.75,stroke:'#9b6800',strokeWidth:0.12})),
    legenda:[{fill:'#f5d47f',label:'Município com alerta no plantão'},{fill:'#ffffff',label:'Sem alerta'}],
    cidadesNomes:CIDADES_REF
  };
}
async function mapaLayout(nomes){
  await garantirLayout();
  const c=await window.LayoutMapa.canvas(opcoesMapaAlertas(nomes),200);   // 2339 × 1654 px, JPEG para o PDF não pesar
  return c.toDataURL('image/jpeg',0.9);
}
let mapaCache={chave:null,url:'',fmt:'PNG',prop:760/1000};
async function mapaDoRelatorio(nomes,forcar){
  const c=dadosRelatorio().campos,fundo=window.LayoutMapa?window.LayoutMapa.fundoEscolhido():'';
  const chave=[...nomes].sort().join('|')+'#'+(c.data||'')+'#'+((state.turno&&state.turno.turno)||'')+'#'+fundo;
  if(mapaCache.chave===chave&&(mapaCache.url||!forcar))return mapaCache.url;
  let url='',fmt='JPEG',prop=210/297;
  try{url=await Promise.race([mapaLayout(nomes),new Promise(ok=>setTimeout(()=>ok(''),60000))]);}catch(e){url='';}
  if(!url){   // sem o layout: a foto da tela, como antes
    fmt='PNG';prop=760/1000;
    try{url=await Promise.race([fotografarMapa(nomes),new Promise(ok=>setTimeout(()=>ok(''),20000))]);}catch(e){url='';}
  }
  mapaCache={chave,url,fmt,prop};           // guarda também a falha, para a prévia não tentar sem parar
  return url;
}
// carrega o layout logo e põe o seletor "Fundo" ao lado de "Baixar PDF no PC"
garantirLayout().then(()=>{
  if(window.LayoutMapa.montarSeletor)window.LayoutMapa.montarSeletor($('hMapa'));
  // botão "Centralizar Minas" bem à vista, no cabeçalho do mapa (faz o mesmo que o "MG" do canto)
  if(!$('centralizarMG')){const b=document.createElement('button');b.type='button';b.className='btn';b.id='centralizarMG';
    b.innerHTML='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3"/></svg>Centralizar Minas';
    b.onclick=()=>$('zoomReset').click();const lab=$('layoutFundo')&&$('layoutFundo').closest('label');
    const cab=$('hMapa').closest('header');if(lab)cab.insertBefore(b,lab);else cab.appendChild(b);b.style.marginLeft=lab?'auto':'';if(lab)lab.style.marginLeft='0';
    cab.insertBefore(btnDesfazerSel,b);btnDesfazerSel.style.marginLeft='auto';b.style.marginLeft='0';}
  $('zoomReset').title='Centralizar Minas Gerais';
  // o seletor vale para a tela e para o mapa do relatório: fica visível nas duas abas
  document.addEventListener('layoutfundo',e=>aplicarFundoTela(e.detail||''));
  aplicarFundoTela(window.LayoutMapa.fundoEscolhido());ajustarCidadesRef();
  document.addEventListener('layoutfundo',()=>{mapaCache.chave=null;agendarRelatorio(true);});
  mapaCache.chave=null;agendarRelatorio(true);
}).catch(()=>{});

function chaveMapaAtual(nomes){
  const c=dadosRelatorio().campos,fundo=window.LayoutMapa?window.LayoutMapa.fundoEscolhido():'';
  return [...nomes].sort().join('|')+'#'+(c.data||'')+'#'+((state.turno&&state.turno.turno)||'')+'#'+fundo;
}
/* ---- prévia ao vivo ---- */
let relT=0;
function agendarRelatorio(comMapa){
  if($('viewPlantao').hidden)return;
  clearTimeout(relT);
  relT=setTimeout(()=>desenharRelatorio(comMapa),comMapa?250:150);
}
async function desenharRelatorio(){
  const d=dadosRelatorio();
  const nomes=municipiosAlertados(),chave=[...nomes].sort().join('|');
  if(mapaCache.chave&&mapaCache.chave.split('#')[0]===chave&&mapaCache.chave===chaveMapaAtual(nomes)){d.mapa=mapaCache.url;d.mapaFmt=mapaCache.fmt;d.mapaProp=mapaCache.prop;}
  else{d.mapaPendente=true;mapaDoRelatorio(nomes).then(()=>agendarRelatorio());}
  const pages=layoutRelatorio(d);
  $('relPages').innerHTML=pages.map((p,i)=>`<div class="a4" aria-label="Página ${i+1}">${paginaSvg(p)}</div>${pages.length>1?`<div class="pgnum">Página ${i+1} de ${pages.length}</div>`:''}`).join('');
  $('relInfo').textContent=`210 × 297 mm · ${pages.length} página${pages.length>1?'s':''}. Prévia do PDF que é salvo no Drive ao salvar a passagem.`;
}
function relMsg(tipo,html){const m=$('relMsg');m.className='msg '+tipo;m.innerHTML=html;m.hidden=false;}

/* ---- "Baixar PDF no PC": prévia atual, sem salvar a passagem ---- */
$('baixarRel').onclick=async()=>{
  const btn=$('baixarRel');btn.classList.add('busy');
  try{
    const d=dadosRelatorio();d.mapa=await mapaDoRelatorio(municipiosAlertados(),true);d.mapaFmt=mapaCache.fmt;d.mapaProp=mapaCache.prop;
    await Promise.race([window.alertasJsPdf,new Promise(ok=>setTimeout(ok,15000))]).catch(()=>{});
    const r=gerarPdf(d);
    baixarLocal(carimbo(d.geradoEm)+'_relatorio_plantao_'+(d.id||'previa')+'.pdf',r.blob);
    relMsg('ok','PDF baixado no PC ('+r.paginas+' página'+(r.paginas>1?'s':'')+'). Ele <b>não</b> foi salvo no Drive nem encerra o plantão.');
  }catch(e){relMsg('err','Não foi possível gerar o PDF: '+esc(e&&e.message||e));}
  finally{btn.classList.remove('busy');}
};

/* ---- relatório final: depois de salvar a passagem, gera o PDF, manda para o Drive e (opcional) baixa no PC ---- */
let ultimoRelatorio=null;
async function relatorioFinal(snap,nomesLocais){
  aviso('Gerando o relatório do plantão <b>'+esc(snap.id)+'</b> em PDF…');
  const nomes=new Set(nomesLocais||[]);
  if(temServidor){
    await new Promise(ok=>google.script.run.withSuccessHandler(l=>{(l||[]).forEach(n=>nomes.add(n));ok();}).withFailureHandler(()=>ok()).municipiosDoPlantao(snap.id));
  }
  if(temServidor&&temFuncao('prepararPastaTurno')&&snap.turno){
    await new Promise(ok=>google.script.run.withSuccessHandler(p=>{if(p&&/^https:\/\//.test(p.url))snap.pastaUrl=p.url;ok();})
      .withFailureHandler(()=>ok()).prepararPastaTurno(snap.turno.data,snap.turno.turno));
  }
  snap.mapa=await mapaDoRelatorio(nomes,true);snap.mapaFmt=mapaCache.fmt;snap.mapaProp=mapaCache.prop;
  await Promise.race([window.alertasJsPdf,new Promise(ok=>setTimeout(ok,15000))]).catch(()=>{});
  let r;
  try{r=gerarPdf(snap);}catch(e){aviso('A passagem foi salva, mas o PDF não pôde ser gerado: '+esc(e&&e.message||e),true);lembrarEmailPlantao(snap.id);return;}
  const nome=nomeRelatorio(snap);
  ultimoRelatorio={nome,blob:r.blob};
  const pc=()=>baixarLocal(nome,r.blob);
  pc();   // v3.4: o relatório final sempre baixa no PC (com ou sem e-mail)
  const b64=await new Promise((ok,no)=>{const fr=new FileReader();fr.onload=()=>ok(String(fr.result).split(',')[1]||'');fr.onerror=no;fr.readAsDataURL(r.blob);});
  const t=snap.turno||turnoPeloRelogio();
  // 1) Drive: salva sempre (em segundo plano, enquanto a pergunta do e-mail está na tela)
  const drive=new Promise(ok=>google.script.run
    .withSuccessHandler(s=>ok({ok:true,s}))
    .withFailureHandler(e=>ok({ok:false,e}))
    [temFuncao('salvarRelatorioPlantaoTurno')?'salvarRelatorioPlantaoTurno':'salvarRelatorioPlantao']
      (snap.id,nome,b64,'',t.data||'',t.turno||''));   // o PNG já vai dentro do PDF
  // 2) E-mail: só se a pessoa responder "Sim" (o "Não" serve para os testes)
  let envio=null;
  if(temFuncao('enviarRelatorioPorEmail')){
    if(await perguntarEnvioEmail(t)){
      aviso('Enviando o relatório por e-mail para <b>'+esc(NOMES_EMAIL_PLANTAO)+'</b>…');
      envio=await enviarEmailRelatorio(snap.id,nome,b64,t);
    }
  }else lembrarEmailPlantao(snap.id);   // servidor ainda sem o Email.gs: mantém o lembrete antigo
  const d=await drive;
  const partes=[];let erro=false;const acoes=[['Baixar de novo',pc]];
  if(d.ok){
    const url=/^https:\/\//.test(d.s&&d.s.url)?d.s.url:'#';
    partes.push('Relatório salvo no Drive: <a href="'+esc(url)+'" target="_blank" rel="noopener">'+esc(d.s&&d.s.nome||nome)+'</a>'+(snap.mapa?'':' (sem a imagem do mapa)'));
  }else{erro=true;partes.push('O relatório <b>não</b> foi para o Drive ('+esc(d.e&&d.e.message?d.e.message:d.e)+').');}
  partes.push('PDF baixado no PC — confira a pasta Downloads.');
  if(envio&&envio.ok)partes.push('E-mail enviado para <b>'+esc(NOMES_EMAIL_PLANTAO)+'</b>'+(envio.x&&envio.x.cc?' (cópia para você)':'')+'.');
  else if(envio){
    erro=true;
    partes.push('<b>O e-mail NÃO foi enviado</b> ('+esc(envio.e&&envio.e.message?envio.e.message:envio.e)+'). Tente de novo ou envie o PDF manualmente.');
    let enviando=false;
    acoes.push(['Tentar enviar o e-mail de novo',async()=>{
      if(enviando)return;enviando=true;
      const x=await enviarEmailRelatorio(snap.id,nome,b64,t);enviando=false;
      aviso(x.ok?'E-mail enviado para <b>'+esc(NOMES_EMAIL_PLANTAO)+'</b>.':'<b>O e-mail NÃO foi enviado</b> ('+esc(x.e&&x.e.message?x.e.message:x.e)+'). Envie o PDF manualmente.',!x.ok,[['Baixar de novo',pc]]);
    }]);
  }else if(temFuncao('enviarRelatorioPorEmail'))partes.push('E-mail não enviado (você escolheu "Não").');
  aviso(partes.join('<br>'),erro,acoes);
}

/* ---- v3.4: envio do relatório por e-mail (função enviarRelatorioPorEmail do Email.gs) ---- */
const NOMES_EMAIL_PLANTAO='Flávia, Laís e Paula';   // só o texto da pergunta; os endereços ficam no Email.gs
function enviarEmailRelatorio(id,nome,b64,t){
  return new Promise(ok=>google.script.run
    .withSuccessHandler(x=>ok({ok:true,x}))
    .withFailureHandler(e=>ok({ok:false,e}))
    .enviarRelatorioPorEmail(id,nome,b64,t.data||'',t.turno||''));
}
/* Pergunta Sim/Não. Fechar com Esc ou no X conta como "Não". O botão em foco é o "Não", para evitar envio sem querer. */
function perguntarEnvioEmail(t){
  return new Promise(resolver=>{
    let dlg=document.getElementById('perguntaEmail');
    if(!dlg){
      dlg=document.createElement('dialog');
      dlg.id='perguntaEmail';
      dlg.setAttribute('aria-labelledby','perguntaEmailTitulo');
      dlg.innerHTML='<h3 id="perguntaEmailTitulo">Enviar e-mail para '+esc(NOMES_EMAIL_PLANTAO)+'?</h3>'+
        '<p>Relatório do plantão <b data-rotulo></b>.<br>Se for só um teste da ferramenta, escolha <b>Não</b>: o PDF fica apenas no PC (e no Drive).</p>'+
        '<div class="r"><button type="button" class="btn" data-nao>Não</button> <button type="button" class="btn primary" data-sim>Sim, enviar</button></div>';
      document.body.appendChild(dlg);
    }
    dlg.querySelector('[data-rotulo]').textContent=(t&&t.data?t.data:'')+(t&&t.turno?' – '+t.turno:'');
    let resposta=false;
    dlg.querySelector('[data-sim]').onclick=()=>{resposta=true;dlg.close();};
    dlg.querySelector('[data-nao]').onclick=()=>{resposta=false;dlg.close();};
    dlg.onclose=()=>resolver(resposta);
    if(typeof dlg.showModal==='function'){if(!dlg.open)dlg.showModal();dlg.querySelector('[data-nao]').focus();}
    else resolver(confirm('Enviar e-mail para '+NOMES_EMAIL_PLANTAO+'?\n\nOK = Sim, enviar   ·   Cancelar = Não'));
  });
}

/* Lembrete exibido depois que a passagem de plantão é salva. */
const DESTINATARIOS_EMAIL_PLANTAO='Laís, Paula e Flavia';
function lembrarEmailPlantao(id){
  let dlg=document.getElementById('lembreteEmail');
  if(!dlg){
    dlg=document.createElement('dialog');
    dlg.id='lembreteEmail';
    dlg.setAttribute('aria-labelledby','lembreteEmailTitulo');
    dlg.innerHTML='<h3 id="lembreteEmailTitulo">Lembrete: e-mail do plantão</h3>'+
      '<p>Não esqueça de enviar o e-mail referente ao plantão <b data-id></b> para <b>'+esc(DESTINATARIOS_EMAIL_PLANTAO)+'</b>.</p>'+
      '<div class="r"><button type="button" class="btn primary" data-ok>Ok, vou enviar</button></div>';
    dlg.querySelector('[data-ok]').onclick=()=>dlg.close();
    document.body.appendChild(dlg);
  }
  const b=dlg.querySelector('[data-id]');b.textContent=id||'';b.hidden=!id;
  if(typeof dlg.showModal==='function'){if(!dlg.open)dlg.showModal();}
  else alert('Não esqueça de enviar o e-mail referente ao plantão para '+DESTINATARIOS_EMAIL_PLANTAO+'.');
}

function salvarPassagemAgora(){
  const d={};Object.entries(CAMPOS_PLANTAO).forEach(([k,id])=>d[k]=$(id)?$(id).value:'');
  d.publicacoes=publicacoesForm(d);   // v3.7
  d.turno=state.turno.turno;d.dataTurno=state.turno.data;
  if(!d.responsavel.trim()){status('Preencha o campo "Responsável".','erro');$('pResp').focus();return;}
  if(!d.data){status('Preencha a data do plantão.','erro');$('pData').focus();return;}
  d.alertaIds=state.active.map(a=>a.id).filter(id=>id&&!/^local_/.test(id));
  d.kmls=state.active.map(a=>a.kmlUrl).filter(Boolean);
  d.ferramentasLista=ferramentasMarcadas();
  d.intercorrenciasLista=interItens.map(it=>({tipo:it.tipo,descricao:it.descricao,acao:it.acao,evidencia:it.evidencia}));
  const snap=dadosRelatorio();     // retrato do formulário antes de limpar
  const nomesLocais=[...municipiosAlertados()];
  $('salvarPlantao').disabled=true;status('Salvando a passagem de plantão…');
  google.script.run
    .withSuccessHandler(r=>{
      $('salvarPlantao').disabled=false;
      snap.id=(r&&r.id)||snap.id;snap.geradoEm=new Date();
      if(r&&r.alertas!=null)snap.nAlertas=r.alertas;
      if(r&&r.arquivos!=null)snap.nArquivos=r.arquivos+1;   // + relatório (o Mapa de Previsões vai dentro do PDF)
      Object.values(CAMPOS_PLANTAO).forEach(id=>{if($(id))$(id).value='';});padraoPublicacoes();
      turnoServidor=null;state.turno=turnoPeloRelogio();mostrarTurno();preencherHorariosTurno();
      state.active=[];state.dailyRows=[];state.plantaoId='';state.selected.clear();desenharAlertas();updateSelection();apagarRascunho();
      limparExtrasPlantao();
      status('Passagem do plantão '+(snap.id||'')+' salva. O próximo plantonista verá este registro ao abrir.','ok');
      carregarContexto();
      limparMapaPrevisoes();
      sincronizarAlertas();   // v3.5: os alertas ainda vigentes do plantão encerrado voltam ao mapa como "plantão anterior"
      if(r&&r.avisoIntercorrencias)avisoIntercorrencias(r,d);   // v3.6: só se a planilha de intercorrências falhou
      relatorioFinal(snap,nomesLocais);   // v3.4: a pergunta do e-mail (ou o lembrete antigo) vem de dentro do relatorioFinal
    })
    .withFailureHandler(err=>{
      $('salvarPlantao').disabled=false;
      status('Não foi possível salvar: '+(err&&err.message?err.message:err)+' Seus dados continuam aqui. Se precisar, use “Baixar PDF no PC”.','erro');
    })
    [temFuncao('salvarPlantaoComIntercorrencias')?'salvarPlantaoComIntercorrencias':'salvarPlantao'](d);
}
$('salvarPlantao').onclick=()=>{
  if(!$('pResp').value.trim()){status('Preencha o campo "Responsável".','erro');$('pResp').focus();return;}
  if(!conferirObrigatorios())return;   // v3.6: ferramentas e intercorrências (os dois turnos)
  if($('pIntIni')&&(!$('pIntIni').value)!==(!$('pIntFim').value)){   // v3.7: intervalo pela metade
    status('Preencha o início e o fim do intervalo (ou deixe os dois em branco).','erro');
    ($('pIntIni').value?$('pIntFim'):$('pIntIni')).focus();return;
  }
  if($('pPub1Per')&&$('pPub1Hora').value&&$('pPub2Hora').value&&$('pPub1Per').value===$('pPub2Per').value&&
    !confirm('As duas publicações estão marcadas como "'+$('pPub1Per').value+'". Salvar assim mesmo?'))return;
  if(!mapaPrev.url&&state.turno.turno==='Diurno'){   // no plantão noturno o PNG é opcional
    status('Anexe o Mapa de Previsões (PNG) antes de encerrar o plantão diurno.','erro');
    aviso('Para encerrar o plantão <b>diurno</b>, anexe a imagem do <b>Mapa de Previsões (PNG)</b> no formulário.',true);
    $('pMapaPrev').focus();return;
  }
  $('salvarPlantao').disabled=true;
  enviarEvidencias().then(okEv=>{if(!okEv){$('salvarPlantao').disabled=false;return;}   // v3.6
  status('Conferindo os alertas da equipe…');
  sincronizarAlertas(()=>{
    $('salvarPlantao').disabled=false;
    const outros=[...new Set(state.active.filter(a=>!podeExcluir(a)).map(a=>a.owner||a.email).filter(Boolean))];
    if(outros.length&&!confirm(textList(outros)+(outros.length>1?' também emitiram':' também emitiu')+
      ' alertas neste plantão ('+rotuloTurno(state.turno)+').\n\nEncerrar o plantão para todos?')){status('Encerramento cancelado.');return;}
    salvarPassagemAgora();
  });
  });
};

function carregarContexto(){
  // fora do Apps Script (página de teste no GitHub): sem conta, sem Drive e sem planilha — o resto funciona
  if(!temServidor){$('quem').textContent='Modo de teste (sem Drive)';return;}
  google.script.run
    .withSuccessHandler(ctx=>{
      $('quem').dataset.email=ctx.email||'';
      $('quem').textContent=$('pResp').value.trim()||ctx.email||'';$('quem2').textContent=ctx.email||'—';
      if(ctx.pastaAlertasUrl)state.pastaUrl=ctx.pastaAlertasUrl;
      mostrarAnterior(ctx.ultimo);
      mostrarIdPlantao(ctx.plantaoAtual);
    })
    .withFailureHandler(err=>{
      $('quem').textContent='';
      $('anterior').innerHTML='<p class="meta2">Não foi possível carregar o plantão anterior: '+esc(err&&err.message?err.message:err)+'</p>';
    })
    .obterContexto();
}

/* ---------------- vários plantonistas no mesmo plantão ---------------- */
function podeExcluir(a){
  if(a.meu)return true;
  return !!(a.email&&state.meuEmail&&a.email===state.meuEmail);
}
function hhmm(s){const m=/(\d{1,2}):(\d{2})/.exec(String(s||''));return m?m[1].padStart(2,'0')+':'+m[2]:'';}
/* Fim do alerta a partir do "Registrado em" (dd/mm/aaaa HH:mm) da planilha. */
function expiraEm(registradoEm,start,dur){
  const m=/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})/.exec(String(registradoEm||''));
  if(!m||!start)return start?expiryTimestamp(start,dur):0;
  const reg=new Date(+m[3],m[2]-1,+m[1],+m[4],+m[5]).getTime();
  const[h,mi]=start.split(':').map(Number),d=new Date(+m[3],m[2]-1,+m[1],h,mi,0,0);
  let ini=d.getTime();
  if(ini-reg>12*3600000)ini-=86400000; else if(reg-ini>12*3600000)ini+=86400000;   // alerta perto da meia-noite
  return ini+durationMinutes(dur||'02:00')*60000;
}
let sincronizando=false,syncCbs=[];
function fimSync(){const l=syncCbs;syncCbs=[];l.forEach(f=>{try{f();}catch(e){console.error(e);}});}
/* Busca na planilha os alertas de toda a equipe no plantão em andamento.
   cb (opcional) roda quando a busca termina, com ou sem sucesso (no máximo em 15 s). */
function sincronizarAlertas(cb){
  if(typeof cb==='function'){
    let feito=false;const uma=()=>{if(!feito){feito=true;cb();}};
    syncCbs.push(uma);setTimeout(uma,15000);
  }
  if(!temServidor){fimSync();return;}
  if(sincronizando)return;
  sincronizando=true;
  google.script.run
    .withSuccessHandler(r=>{
      sincronizando=false;if(!r){fimSync();return;}
      if(r.turno)aplicarTurnoDoServidor(r.turno);
      if(r.email)state.meuEmail=String(r.email).toLowerCase();
      const antes=state.plantaoId,agora=r.plantaoId||'';
      const locais=new Map(state.active.map(a=>[a.id,a]));
      const lista=(r.alertas||[]).map(sv=>{
        const l=locais.get(sv.id)||{};
        const start=hhmm(sv.start)||l.start||'',duration=hhmm(sv.duration)||l.duration||'02:00';
        return Object.assign({},l,{
          id:sv.id,kmlUrl:sv.kmlUrl||l.kmlUrl||'',type:sv.type||l.type||'',
          owner:sv.owner||l.owner||sv.email||'',email:String(sv.email||'').toLowerCase(),
          start,duration,end:hhmm(sv.end)||l.end||(start?endTime(start,duration):''),
          cities:(sv.cities&&sv.cities.length)?sv.cities:(l.cities||[]),
          phen:l.phen||String(sv.phen||'').split(',').map(x=>x.trim()).filter(Boolean),
          expiresAt:l.expiresAt||expiraEm(sv.registradoEm,start,duration),
          folder:l.folder||'',meu:!!l.meu
        });
      });
      const ids=new Set(lista.map(a=>a.id));
      // Fica na tela o que não está na planilha só se nunca chegou lá ou se acabou de ser emitido.
      const sobras=state.active.filter(a=>!ids.has(a.id));
      const manter=sobras.filter(a=>/^local_/.test(a.id||'')||(a.emitidoEm&&Date.now()-a.emitidoEm<120000));
      const encerradoPorOutro=!!antes&&antes!==agora;
      sobras.filter(a=>manter.indexOf(a)<0&&a.linha).forEach(a=>{
        $('pAlertas').value=$('pAlertas').value.split('\n').filter(x=>x.trim()!==a.linha).join('\n');
      });
      state.active=lista.concat(manter).sort((x,y)=>(y.expiresAt||0)-(x.expiresAt||0));
      state.plantaoId=agora;
      if(antes!==agora)mostrarIdPlantao(agora?{id:agora,iniciadoEm:r.iniciadoEm}:null);
      if(encerradoPorOutro){
        status('O plantão '+antes+' foi encerrado por outro plantonista. Os alertas dele já estão no relatório; '+
          (agora?'os novos alertas entram no plantão '+agora+'.':'o próximo alerta abre um plantão novo.'),'ok');
        carregarContexto();
      }
      desenharAlertas();pintarMapa();salvarRascunho();
      carregarHerdados(fimSync);   // v3.5: atualiza os vigentes de plantões anteriores antes de liberar quem esperava
    })
    .withFailureHandler(()=>{sincronizando=false;carregarHerdados(fimSync);})   // sem conexão: mantém o que está na tela
    [temFuncao('alertasDoPlantaoAtualTurno')?'alertasDoPlantaoAtualTurno':'alertasDoPlantaoAtual']();
}
setInterval(sincronizarAlertas,60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)sincronizarAlertas();});


/* ===================== v3.2: turno, duplicação, trocar conta ===================== */
function temFuncao(n){try{return temServidor&&typeof google.script.run[n]==='function';}catch(e){return false;}}

/* ---- horário de Brasília (Minas Gerais), independente do relógio do computador ---- */
const FUSO_MG='America/Sao_Paulo';
function partesMG(d){
  const o={};
  new Intl.DateTimeFormat('en-CA',{timeZone:FUSO_MG,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})
    .formatToParts(d||new Date()).forEach(p=>o[p.type]=p.value);
  return o;
}
function isoMG(d){const o=partesMG(d);return o.year+'-'+o.month+'-'+o.day;}
function hhmmMG(d){const o=partesMG(d);return o.hour+o.minute;}

/* ---- turno do plantão ---- */
const TURNOS={Diurno:{inicio:'07:00',fim:'19:00'},Noturno:{inicio:'19:00',fim:'07:00'}};
/* 7h–19h = Diurno do dia; 19h–24h = Noturno do dia; 0h–7h = Noturno do dia anterior (data de início). */
function turnoPeloRelogio(){
  const agora=new Date(),h=Number(partesMG(agora).hour);
  if(h>=7&&h<19)return {turno:'Diurno',data:isoMG(agora)};
  return {turno:'Noturno',data:isoMG(h<7?new Date(agora.getTime()-12*3600000):agora)};
}
function rotuloTurno(t){return t&&t.turno?dataBR(t.data)+' – '+t.turno:'(turno não escolhido)';}
function nomeRelatorio(snap){
  const t=snap.turno||turnoPeloRelogio();
  return 'relatorio_'+String(t.data||isoMG()).replace(/-/g,'')+'_'+String(t.turno||'turno').toLowerCase()+'_'+hhmmMG(snap.geradoEm||new Date())+'.pdf';
}
state.turno=turnoPeloRelogio();
let turnoServidor=null;   // turno gravado no plantão (por quem emitiu o primeiro alerta)

/* seletor "Plantão": linha própria ACIMA da grade Data/Início/Fim, para não desalinhar a grade.
   Criado aqui para não precisar mexer no Alertas.html; copia o visual do campo "Início". */
(function criarSeletorTurno(){
  if($('pTurno')||!$('pInicio'))return;
  const celula=$('pInicio').parentElement,grade=celula.parentElement;
  const labRef=celula.querySelector('label')||grade.querySelector('label');
  const linha=document.createElement('div');
  linha.id='linhaTurno';
  linha.style.cssText='display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;margin:0 0 12px';
  const lab=document.createElement('label');
  lab.htmlFor='pTurno';lab.textContent='Plantão';
  if(labRef)lab.className=labRef.className;
  lab.style.margin='0';
  const sel=document.createElement('select');
  sel.id='pTurno';sel.className=$('pInicio').className;
  sel.innerHTML='<option value="Diurno">Diurno (7h às 19h)</option><option value="Noturno">Noturno (19h às 7h)</option>';
  try{   // mesmo visual do campo de hora
    const cs=getComputedStyle($('pInicio'));
    ['border','borderRadius','padding','fontFamily','fontSize','fontWeight','color','backgroundColor','lineHeight']
      .forEach(k=>{if(cs[k])sel.style[k]=cs[k];});
  }catch(e){}
  sel.style.width='auto';sel.style.minWidth='190px';sel.style.margin='0';sel.style.cursor='pointer';
  const info=document.createElement('span');
  info.id='pTurnoInfo';info.style.cssText='font-size:12px;opacity:.75';
  linha.append(lab,sel,info);
  grade.parentElement.insertBefore(linha,grade);
})();
function mostrarTurno(){
  if(!$('pTurno'))return;
  $('pTurno').value=state.turno.turno;
  if(state.turno.data)$('pData').value=state.turno.data;
  const info=$('pTurnoInfo');
  if(info){
    const pasta=String(state.turno.data).replace(/-/g,'')+'/'+state.turno.turno;
    const quem=turnoServidor&&turnoServidor.por&&state.plantaoId?String(turnoServidor.por).split('@')[0]:'';
    info.textContent='Pasta no Drive: '+pasta+(quem?' · definido no 1º alerta ('+quem+')':'');
    info.title=quem?'Turno definido no primeiro alerta do plantão por '+turnoServidor.por+'.':'';
  }
}
function preencherHorariosTurno(){
  const h=TURNOS[state.turno.turno];if(!h)return;
  $('pInicio').value=h.inicio;$('pFim').value=h.fim;
}
/* o turno gravado no servidor vale para todos do plantão */
function aplicarTurnoDoServidor(t){
  if(!t||!t.turno||!t.data)return;
  turnoServidor=t;
  const mudou=t.turno!==state.turno.turno||t.data!==state.turno.data;
  state.turno={turno:t.turno,data:t.data};
  if(mudou){preencherHorariosTurno();salvarRascunho();agendarRelatorio();}
  mostrarTurno();
}
function alterarTurno(novo){
  const antes={...state.turno};
  if(state.plantaoId&&turnoServidor&&temFuncao('definirTurnoPlantao')){
    if(!confirm('O plantão '+state.plantaoId+' já está como '+rotuloTurno(antes)+'.\n\n'+
      'Mudar para '+rotuloTurno(novo)+' vale para toda a equipe neste plantão. Os próximos arquivos irão para a nova pasta '+
      '(os já salvos continuam onde estão).\n\nConfirmar a mudança?')){mostrarTurno();return;}
    google.script.run.withSuccessHandler(t=>{aplicarTurnoDoServidor(t);status('Turno do plantão alterado para '+rotuloTurno(t)+'.','ok');})
      .withFailureHandler(e=>{state.turno=antes;mostrarTurno();preencherHorariosTurno();status('Não foi possível alterar o turno: '+(e&&e.message||e),'erro');})
      .definirTurnoPlantao(state.plantaoId,novo.data,novo.turno);
  }
  state.turno=novo;preencherHorariosTurno();mostrarTurno();salvarRascunho();agendarRelatorio();
}
if($('pTurno')){
  $('pTurno').addEventListener('change',()=>alterarTurno({turno:$('pTurno').value,data:$('pData').value||state.turno.data}));
  $('pData').addEventListener('change',()=>{if($('pData').value&&$('pData').value!==state.turno.data)alterarTurno({turno:state.turno.turno,data:$('pData').value});});
}

/* ---- "Alertas gerados": lista automática com os alertas de toda a equipe ---- */
function linhaAlerta(a){
  const ph=(a.phen&&a.phen.length)?' ('+a.phen.join(', ')+')':'';
  return (a.start||'')+'–'+(a.end||'')+' '+(a.type||'')+ph+': '+(a.cities||[]).join(', ')+(a.owner?' — '+a.owner:'');
}
function preencherAlertasGerados(){
  const el=$('pAlertas');if(!el)return;
  const lista=state.active.slice().sort((x,y)=>(x.expiresAt||0)-(y.expiresAt||0));
  el.value=lista.map(linhaAlerta).join('\n');
  el.readOnly=true;
  el.title='Preenchido automaticamente com os alertas de todos os plantonistas deste plantão.';
}

/* ---- aviso de duplicação: só para alertas ainda vigentes ---- */
function alertasVigentesEm(cities){
  const t=Date.now(),alvo=new Set(cities),out=[];
  state.active.concat(herdadosVigentes(t)).forEach(a=>{
    if(a.expiresAt&&a.expiresAt<=t)return;            // vencido: pode emitir de novo
    const em=(a.cities||[]).filter(n=>alvo.has(n));
    if(em.length)out.push({a,em});
  });
  return out;
}
/* ---- v3.5: alertas vigentes de plantões anteriores (só visual + aviso de duplicação) ---- */
state.herdados=[];
(function estiloHerdado(){
  const st=document.createElement('style');
  st.textContent='path.herdado{fill-opacity:.5;stroke-dasharray:3 2;stroke-width:1.2px}'+
    '#herdadosBox{margin-top:12px}#herdadosBox h4{margin:0 0 6px;font-size:.95em}'+
    '#herdadosBox .alert-card{border-style:dashed;opacity:.85}';
  document.head.appendChild(st);
})();
/* Só os que ainda estão no prazo e que não são do plantão em andamento. */
function herdadosVigentes(t){
  t=t||Date.now();
  const doPlantao=new Set(state.active.map(a=>a.id));
  return (state.herdados||[]).filter(a=>a.expiresAt&&a.expiresAt>t&&!doPlantao.has(a.id)&&!(state.plantaoId&&a.plantaoId===state.plantaoId));
}
function carregarHerdados(cb){
  let feito=false;const fim=()=>{if(!feito){feito=true;if(typeof cb==='function')cb();}};
  if(!temFuncao('alertasVigentesAnteriores')){fim();return;}
  setTimeout(fim,15000);
  google.script.run
    .withSuccessHandler(r=>{
      state.herdados=((r&&r.alertas)||[]).map(sv=>{
        const start=hhmm(sv.start),duration=hhmm(sv.duration)||'02:00';
        return {id:sv.id,plantaoId:sv.plantaoId||'',herdado:true,type:sv.type||'',
          owner:sv.owner||sv.email||'',email:String(sv.email||'').toLowerCase(),
          start,duration,end:hhmm(sv.end)||(start?endTime(start,duration):''),
          cities:Array.isArray(sv.cities)?sv.cities:[],
          phen:String(sv.phen||'').split(',').map(x=>x.trim()).filter(Boolean),
          kmlUrl:sv.kmlUrl||'',expiresAt:expiraEm(sv.registradoEm,start,duration)};
      });
      desenharHerdados();pintarMapa();fim();
    })
    .withFailureHandler(()=>fim())   // sem conexão: mantém a última lista
    .alertasVigentesAnteriores();
}
/* Lista "Alertas vigentes de plantões anteriores", logo abaixo da lista do plantão. Sem botão de excluir. */
function desenharHerdados(){
  const lista=$('activeList');if(!lista)return;
  let box=document.getElementById('herdadosBox');
  if(!box){box=document.createElement('div');box.id='herdadosBox';lista.insertAdjacentElement('afterend',box);}
  const h=herdadosVigentes().sort((x,y)=>(x.expiresAt||0)-(y.expiresAt||0));
  if(!h.length){box.innerHTML='';box.hidden=true;return;}
  box.hidden=false;
  box.innerHTML='<h4>Alertas vigentes de plantões anteriores ('+h.length+')</h4>'+
    '<p class="hint" style="margin:0 0 6px">Só para controle no mapa: não entram no relatório nem no TXT deste plantão.</p>';
  const nowTs=Date.now();
  h.forEach(a=>{
    const c=classeDoAlerta(a,nowTs);
    const card=document.createElement('div');card.className='alert-card'+(c==='expiring'?' expiring':'');
    card.innerHTML=`<b>${esc(a.type)}</b><div>${esc(a.start)}–${esc(a.end)} • ${esc(a.owner)}</div>`+
      `<div class="alert-status">${c==='expiring'?'Perto de vencer':'Vigente'} · plantão anterior</div>`+
      `<div>${a.cities.length} município(s): ${esc(a.cities.join(', '))}</div>`+
      (/^https:\/\//.test(a.kmlUrl||'')?`<div><a href="${esc(a.kmlUrl)}" target="_blank" rel="noopener">Abrir KML no Drive</a></div>`:'');
    box.appendChild(card);
  });
}
setInterval(desenharHerdados,30000);   // tira da lista quem venceu (o mapa já é repintado a cada 30 s)

const emitirAgora=$('emit').onclick;
$('emit').onclick=()=>{
  const cities=[...state.selected];if(!cities.length)return;
  if(!/^([01]?\d|2[0-3]):[0-5]\d$/.test($('time').value.trim())){emitirAgora();return;}   // a própria emissão mostra o erro
  $('emit').disabled=true;emitStatus('Conferindo os alertas vigentes da equipe…');
  sincronizarAlertas(()=>{
    $('emit').disabled=false;
    const dup=alertasVigentesEm(cities);
    if(dup.length){
      const linhas=dup.slice(0,12).map(({a,em})=>'• '+em.join(', ')+': '+(a.type||'alerta')+' até '+(a.end||'?')+(a.owner?' ('+a.owner+')':'')+(a.herdado?' — plantão anterior':''));
      if(dup.length>12)linhas.push('• … e mais '+(dup.length-12)+' alerta(s)');
      if(!confirm('Já há alerta VIGENTE para:\n\n'+linhas.join('\n')+'\n\nEmitir mesmo assim?')){
        emitStatus('Emissão cancelada. Tire do alerta os municípios que já estão cobertos, se for o caso.');return;
      }
    }
    emitirAgora();
  });
};

/* ---- Mapa de Previsões: obrigatório para encerrar ---- */
const TXT_MAPA_PREV='Obrigatório para encerrar o plantão diurno (no noturno é opcional). Sai no relatório em PDF, embaixo do mapa de alertas (não é salvo à parte no Drive).';
(function ajustarRotuloMapaPrev(){
  const inp=$('pMapaPrev');if(!inp)return;
  const lab=document.querySelector('label[for="pMapaPrev"]')||inp.closest('label')||(inp.parentElement&&inp.parentElement.querySelector('label'));
  if(lab){
    const w=document.createTreeWalker(lab,NodeFilter.SHOW_TEXT);let n;
    while((n=w.nextNode()))if(/opcional/i.test(n.nodeValue))n.nodeValue=n.nodeValue.replace(/,?\s*opcional/i,', obrigatório no diurno');
  }
  if(!mapaPrev.url&&$('pMapaPrevInfo'))$('pMapaPrevInfo').textContent=TXT_MAPA_PREV;
})();

/* ---- botão "Trocar conta" ---- */
function temAlertaNaoEmitido(){
  return state.selected.size>0||state.drawing||$('modalback').style.display==='flex';
}
(function criarTrocarConta(){
  if(!temFuncao('urlDoApp')||!$('quem'))return;
  google.script.run.withSuccessHandler(url=>{
    if(!/^https:\/\//.test(url||''))return;
    const a=document.createElement('a');
    a.id='trocarConta';a.className='btn small';a.target='_top';a.rel='noopener';
    a.href='https://accounts.google.com/AccountChooser?continue='+encodeURIComponent(url);
    a.textContent='Trocar conta';a.style.marginLeft='8px';
    a.title='Sair desta conta e entrar com outra. Alertas já emitidos não se perdem.';
    a.onclick=e=>{
      if(temAlertaNaoEmitido()&&!confirm('Há um alerta não emitido (municípios selecionados ou janela de emissão aberta).\n\n'+
        'Ele será perdido ao trocar de conta. Os alertas já emitidos continuam salvos.\n\nDeseja sair mesmo assim?'))e.preventDefault();
    };
    $('quem').insertAdjacentElement('afterend',a);
  }).withFailureHandler(()=>{}).urlDoApp();
})();

/* ===================== v3.6: Ferramentas utilizadas e Intercorrências =====================
   Os textos continuam nos campos (ocultos) pFerr e pInter, então rascunho, prévia, PDF e a aba
   Plantoes seguem iguais. As escolhas ficam num rascunho próprio deste navegador. */
const CHAVE_EXTRAS='simge-plantao-extras-v1';
const TIPOS_INTER=['SIMGE fora do ar','SIMGE instável','Falta de energia','Falta de interação com o pessoal do grupo Alerta CEDEC','Sem intercorrências','Outros'];
const SEM_INTER='Sem intercorrências';
let interItens=[];   // [{tipo,descricao,acao,link,arquivo(File, só nesta tela),evidencia}]
function ferramentasMarcadas(){return [...document.querySelectorAll('.ferr:checked')].map(x=>x.value);}
function textoFerramentas(){
  return ferramentasMarcadas().map(v=>v==='Outros'?'Outros'+($('ferrOutros').value.trim()?': '+$('ferrOutros').value.trim():''):v).join(', ');
}
function textoIntercorrencias(){
  return interItens.filter(it=>it.tipo).map(it=>{
    if(it.tipo===SEM_INTER)return SEM_INTER;
    let t='• '+it.tipo+(it.descricao.trim()?' — '+it.descricao.trim():'');
    if(it.acao.trim())t+=' (ação tomada: '+it.acao.trim()+')';
    if(it.link.trim())t+=' [evidência: '+it.link.trim()+']';
    else if(it.arquivo)t+=' [evidência: imagem '+it.arquivo.name+']';
    return t;
  }).join('\n');
}
function sincronizarExtras(){
  $('pFerr').value=textoFerramentas();
  $('pInter').value=textoIntercorrencias();
  $('ferrOutrosLbl').hidden=!$('ferrOutrosChk').checked;
  try{localStorage.setItem(CHAVE_EXTRAS,JSON.stringify({ferr:ferramentasMarcadas(),ferrOutros:$('ferrOutros').value,
    inter:interItens.map(it=>({tipo:it.tipo,descricao:it.descricao,acao:it.acao,link:it.link}))}));}catch(e){}
  clearTimeout(window._tRasc);window._tRasc=setTimeout(salvarRascunho,600);agendarRelatorio();
}
function novaIntercorrencia(dados){
  const o={tipo:'',descricao:'',acao:'',link:'',arquivo:null,evidencia:''};
  if(dados)['tipo','descricao','acao','link'].forEach(k=>{if(typeof dados[k]==='string')o[k]=dados[k];});
  if(o.tipo&&TIPOS_INTER.indexOf(o.tipo)<0)o.tipo='';
  return o;
}
function desenharIntercorrencias(){
  const box=$('interLista');box.innerHTML='';
  interItens.forEach((it,i)=>{
    const d=document.createElement('div');d.className='inter-item';
    const sem=it.tipo===SEM_INTER;
    d.innerHTML=`<div class="topo"><select class="field" aria-label="Tipo da intercorrência ${i+1}"><option value="">Tipo da intercorrência…</option>${
      TIPOS_INTER.map(t=>`<option${t===it.tipo?' selected':''}>${esc(t)}</option>`).join('')}</select>
      <button type="button" class="btn small" data-rm>Remover</button></div>
      <div data-det${sem||!it.tipo?' hidden':''} style="display:grid;gap:8px">
        <label>Descrição${it.tipo==='Outros'?' (obrigatória)':''}<textarea class="field" data-k="descricao"></textarea></label>
        <label>Ação tomada<input class="field" data-k="acao"></label>
        <div class="evid"><label>Evidência — link (opcional)<input class="field" data-k="link" placeholder="https://…"></label>
          <label class="btn small" style="display:inline-flex;font-weight:600">${it.arquivo?'Trocar imagem':'Anexar imagem'}<input class="sr" type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg"></label></div>
        <div class="rascunho">${it.arquivo?'Imagem: '+esc(it.arquivo.name)+' (vai para a pasta de intercorrências ao salvar). <a href="#" data-rmarq>Tirar</a>':'Evidência opcional: um link ou uma imagem.'}</div>
      </div>`;
    const sel=d.querySelector('select');
    sel.onchange=()=>{
      if(sel.value===SEM_INTER&&interItens.some((o,j)=>j!==i&&o.tipo&&o.tipo!==SEM_INTER)){
        alert('“Sem intercorrências” não pode ser usado junto com outras intercorrências. Remova as outras antes.');sel.value=it.tipo;return;}
      it.tipo=sel.value;desenharIntercorrencias();sincronizarExtras();
    };
    d.querySelectorAll('[data-k]').forEach(el=>{el.value=it[el.dataset.k]||'';el.addEventListener('input',()=>{it[el.dataset.k]=el.value;sincronizarExtras();});});
    d.querySelector('input[type=file]').onchange=e=>{const f=e.target.files[0];if(f){it.arquivo=f;it.evidencia='';}desenharIntercorrencias();sincronizarExtras();};
    const rmArq=d.querySelector('[data-rmarq]');if(rmArq)rmArq.onclick=e=>{e.preventDefault();it.arquivo=null;it.evidencia='';desenharIntercorrencias();sincronizarExtras();};
    d.querySelector('[data-rm]').onclick=()=>{interItens.splice(i,1);if(!interItens.length)interItens.push(novaIntercorrencia());desenharIntercorrencias();sincronizarExtras();};
    box.appendChild(d);
  });
}
$('interAdd').onclick=()=>{
  if(interItens.some(o=>o.tipo===SEM_INTER)){alert('Você marcou “Sem intercorrências”. Troque o tipo dela se houve alguma intercorrência.');return;}
  interItens.push(novaIntercorrencia());desenharIntercorrencias();sincronizarExtras();
  const s=$('interLista').querySelectorAll('select');if(s.length)s[s.length-1].focus();
};
document.querySelectorAll('.ferr').forEach(c=>c.addEventListener('change',sincronizarExtras));
$('ferrOutros').addEventListener('input',sincronizarExtras);
function carregarExtras(){
  try{
    const r=JSON.parse(localStorage.getItem(CHAVE_EXTRAS)||'null');if(!r)return;
    document.querySelectorAll('.ferr').forEach(c=>c.checked=(r.ferr||[]).includes(c.value));
    $('ferrOutros').value=r.ferrOutros||'';
    interItens=(r.inter||[]).map(x=>novaIntercorrencia(x));
  }catch(e){}
}
function limparExtrasPlantao(){
  limparOutrasImagens();
  try{localStorage.removeItem(CHAVE_EXTRAS);}catch(e){}
  document.querySelectorAll('.ferr').forEach(c=>c.checked=false);$('ferrOutros').value='';
  interItens=[novaIntercorrencia()];desenharIntercorrencias();
  $('ferrOutrosLbl').hidden=true;$('pFerr').value='';$('pInter').value='';
  $('grpFerr').classList.remove('erro');$('grpInter').classList.remove('erro');
}
function conferirObrigatorios(){
  const falha=(grp,msg,foco)=>{$(grp).classList.add('erro');status(msg,'erro');aviso(msg,true);
    try{$(grp).scrollIntoView({block:'center',behavior:'smooth'});}catch(e){}if(foco)foco.focus();return false;};
  $('grpFerr').classList.remove('erro');$('grpInter').classList.remove('erro');
  const fs=ferramentasMarcadas();
  if(!fs.length)return falha('grpFerr','Marque as ferramentas utilizadas no plantão (obrigatório).',document.querySelector('.ferr'));
  if(fs.includes('Outros')&&!$('ferrOutros').value.trim())return falha('grpFerr','Descreva as “Outras” ferramentas utilizadas.',$('ferrOutros'));
  const itens=[...$('interLista').querySelectorAll('.inter-item')];
  if(!interItens.some(it=>it.tipo))return falha('grpInter','Registre as intercorrências do plantão (obrigatório). Se não houve, escolha “Sem intercorrências”.',itens[0]&&itens[0].querySelector('select'));
  let i=interItens.findIndex(it=>!it.tipo);
  if(i>=0)return falha('grpInter','Escolha o tipo de todas as intercorrências (ou remova as vazias).',itens[i]&&itens[i].querySelector('select'));
  i=interItens.findIndex(it=>it.tipo==='Outros'&&!it.descricao.trim());
  if(i>=0)return falha('grpInter','Descreva a intercorrência do tipo “Outros”.',itens[i]&&itens[i].querySelector('textarea'));
  i=interItens.findIndex(it=>it.tipo!==SEM_INTER&&it.link.trim()&&!/^https?:\/\//i.test(it.link.trim()));
  if(i>=0)return falha('grpInter','O link de evidência precisa começar com http:// ou https://.',itens[i]&&itens[i].querySelector('[data-k=link]'));
  sincronizarExtras();
  return true;
}
/* envia as imagens de evidência (uma por vez, reduzidas) antes de salvar a passagem */
async function enviarEvidencias(){
  interItens.forEach(it=>{if(it.tipo===SEM_INTER)it.evidencia='';else if(!it.arquivo)it.evidencia=it.link.trim();});
  const pend=interItens.filter(it=>it.tipo&&it.tipo!==SEM_INTER&&it.arquivo&&!it.evidencia);
  if(!pend.length)return true;
  if(!temFuncao('salvarEvidenciaIntercorrencia')){status('O Apps Script ainda não tem o arquivo Intercorrencias.gs; não dá para enviar a imagem de evidência.','erro');return false;}
  for(let i=0;i<pend.length;i++){
    const it=pend[i];status('Enviando evidência '+(i+1)+' de '+pend.length+'…');
    try{
      const r=await reduzirImagem(it.arquivo);
      const nome=String(state.turno.data||'').replace(/-/g,'')+'_'+String(state.turno.turno||'').toLowerCase()+'_'+it.arquivo.name.replace(/\.[^.]+$/,'')+'.jpg';
      const s=await new Promise((ok,no)=>google.script.run.withSuccessHandler(ok).withFailureHandler(no)
        .salvarEvidenciaIntercorrencia(nome,'image/jpeg',r.url.split(',')[1]));
      const url=s&&s.url||'';
      it.evidencia=it.link.trim()?it.link.trim()+' ; '+url:url;
    }catch(e){status('Não foi possível enviar a imagem de evidência “'+it.arquivo.name+'”: '+(e&&e.message||e)+' A passagem ainda não foi salva; tente de novo.','erro');return false;}
  }
  return true;
}
/* plantão salvo, mas a planilha de intercorrências falhou: oferece tentar de novo */
function avisoIntercorrencias(r,d){
  const tentar=()=>google.script.run
    .withSuccessHandler(x=>aviso('Intercorrências gravadas na planilha ('+((x&&x.linhas)||0)+' linha(s)).'))
    .withFailureHandler(e=>aviso('As intercorrências <b>não</b> foram gravadas ('+esc(e&&e.message||e)+').',true,[['Tentar de novo',tentar]]))
    .registrarIntercorrencias(r.id,d);
  aviso('A passagem foi salva, mas as intercorrências <b>não</b> foram gravadas na planilha ('+esc(r.avisoIntercorrencias)+').',true,[['Tentar de novo',tentar]]);
}

/* ---------------- início ---------------- */
const temRascunho=carregarRascunho();
if(temRascunho)carregarExtras();else{try{localStorage.removeItem(CHAVE_EXTRAS);}catch(e){}}
if(!interItens.length)interItens=[novaIntercorrencia()];
desenharIntercorrencias();$('ferrOutrosLbl').hidden=!$('ferrOutrosChk').checked;
if(temRascunho){$('pFerr').value=textoFerramentas();$('pInter').value=textoIntercorrencias();}
if(!temRascunho||!$('pInicio').value)preencherHorariosTurno();

mostrarTurno();
aplicarLimites();desenharAlertas();updateSelection();applyView();carregarContexto();sincronizarAlertas();
try{if(sessionStorage.getItem('alertas:aba')==='plantao')mostrarAba('plantao');}catch(e){}
window.alertasJsPdf.then(()=>{_relDoc=null;agendarRelatorio();},()=>{});   // refaz a prévia com as medidas do PDF
}
