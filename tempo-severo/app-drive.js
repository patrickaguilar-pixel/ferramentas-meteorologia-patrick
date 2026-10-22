/* Código da ferramenta para a versão Apps Script (carregado de fora para o Apps Script não interferir).
   Gerado a partir de tempo-severo/index.html. Depende de window.BASE_DADOS, definido na página.
   2026.10.05.2: mapa final no layout da Previsão diária (assets/layout-mapa.js).
   2026.10.06.1: edição das áreas (clique na área: vértices, mover, trocar nível, Concluir/Cancelar),
   Ctrl+Z / Desfazer (ponto do desenho, alteração da edição ou última ação) e a área guarda o desenho
   original (o recorte em MG é feito só para mostrar e calcular).
   2026.10.06.2: contorno das mesorregiões não captura mais o clique (ele fica por cima das áreas e
   impedia clicar nelas para editar). */

const LEVELS=[
 {id:'Nivel0',label:'Tempestades não severas',rank:0,fill:'#82EA6E',opacity:0.5,stroke:'#4FB83C'},
 {id:'Nivel1',label:'Nível 1',rank:1,fill:'#FFFF00',opacity:0.6,stroke:'#b8b800'},
 {id:'Nivel2',label:'Nível 2',rank:2,fill:'#FFA500',opacity:0.7,stroke:'#e39000'},
 {id:'Nivel3',label:'Nível 3',rank:3,fill:'#EE0000',opacity:0.8,stroke:'#c60000'},
 {id:'Nivel4',label:'Nível 4',rank:4,fill:'#FF00FF',opacity:0.9,stroke:'#b400b4'}
];
let selected=LEVELS[0];
const map=L.map('map',{zoomControl:true,attributionControl:false,minZoom:5,maxZoom:12});
// Limite de MG obtido diretamente da camada de estados já carregada.
// Isso elimina uma união geométrica pesada na abertura sem simplificar o contorno.
const MG_MASK=((window.BRASIL_ESTADOS&&BRASIL_ESTADOS.features)||[]).find(f=>f.properties.UF==='MG') || turf.union(turf.featureCollection(MESO.features));
let microData=null;
let microLoadPromise=null;
let microBBoxes=null;
function ensureMicroLoaded(){
  if(microData) return Promise.resolve(microData);
  if(microLoadPromise) return microLoadPromise;
  microLoadPromise=new Promise((resolve,reject)=>{
    const sc=document.createElement('script');
    sc.src=window.BASE_DADOS+'tempo-severo/data/microrregioes.js';
    sc.onload=()=>{
      microData=window.MICRORREGIOES;
      if(!microData){reject(new Error('Camada de microrregiões não foi carregada.'));return;}
      microBBoxes=microData.features.map(f=>turf.bbox(f));
      resolve(microData);
    };
    sc.onerror=()=>reject(new Error('Falha ao carregar data/microrregioes.js'));
    document.head.appendChild(sc);
  });
  return microLoadPromise;
}
const drawnItems=new L.FeatureGroup().addTo(map);
const mesoDisplay=L.geoJSON(MESO,{interactive:false,style:{color:'#4b5563',weight:1.15,fillOpacity:0}}).addTo(map);   // só desenho: não captura o clique (fica por cima das áreas)
map.fitBounds(mesoDisplay.getBounds(),{padding:[25,25]});
// v1.15: marcação das cidades igual à da Previsão (ponto branco pequeno e nome logo abaixo, em azul-marinho)
(function(){const s=document.createElement('style');s.textContent='.leaflet-tooltip.lm-cidade{background:transparent;border:0;box-shadow:none;padding:0;color:#092b6a;font:700 12px Arial,"Liberation Sans",Helvetica,sans-serif;text-shadow:1px 1px 0 #fff,-1px -1px 0 #fff,1px -1px 0 #fff,-1px 1px 0 #fff,0 1px 0 #fff,0 -1px 0 #fff}.leaflet-tooltip.lm-cidade:before{display:none}';document.head.appendChild(s);})();
map.createPane('lmCidades').style.zIndex=450;   // cidades sempre por cima das áreas desenhadas
L.geoJSON(CIDADES,{pointToLayer:(f,ll)=>L.circleMarker(ll,{pane:'lmCidades',interactive:false,radius:1.9,color:'#1f2328',weight:0.9,fillColor:'#fff',fillOpacity:1}),onEachFeature:(f,l)=>{const n=f.properties.NM_LOCAL_1||f.properties.NM_MUNICIP;l.bindTooltip(n,{permanent:true,direction:'bottom',offset:[0,1],className:'lm-cidade'});}}).addTo(map);
const microPriorityLayer={clearLayers(){},addData(){}}; // microrregiões ficam somente para cálculo textual
function styleFor(lv){return {color:lv.stroke,weight:2,fillColor:lv.fill,fillOpacity:lv.opacity};}
function levelById(id){return LEVELS.find(x=>x.id===id)||LEVELS[0];}
// v1.15: bordas suaves — curva que PASSA pelos pontos clicados (spline cardinal fechada, tensão baixa):
// arredonda de leve, sem cortar a área nem estufar o desenho. O desenho original continua guardado para edição.
function suavizarAnel(r,n){
  const P=r.slice(0,-1),N=P.length;if(N<3)return r;
  const seg=n||10,c=0.18,out=[];
  for(let i=0;i<N;i++){
    const p0=P[(i-1+N)%N],p1=P[i],p2=P[(i+1)%N],p3=P[(i+2)%N];
    const m1=[c*(p2[0]-p0[0]),c*(p2[1]-p0[1])],m2=[c*(p3[0]-p1[0]),c*(p3[1]-p1[1])];
    for(let s=0;s<seg;s++){const t=s/seg,t2=t*t,t3=t2*t,h00=2*t3-3*t2+1,h10=t3-2*t2+t,h01=-2*t3+3*t2,h11=t3-t2;
      out.push([h00*p1[0]+h10*m1[0]+h01*p2[0]+h11*m2[0],h00*p1[1]+h10*m1[1]+h01*p2[1]+h11*m2[1]]);}
  }
  out.push(out[0].slice());return out;
}
function suavizarFeature(f){
  try{const g=f&&f.geometry;if(!g)return f;
    const anel=r=>r.length>=4?suavizarAnel(r,10):r;
    if(g.type==='Polygon')return {...f,geometry:{type:'Polygon',coordinates:g.coordinates.map(anel)}};
    if(g.type==='MultiPolygon')return {...f,geometry:{type:'MultiPolygon',coordinates:g.coordinates.map(p=>p.map(anel))}};
  }catch(e){}
  return f;
}
// recortes já calculados ficam guardados: refazer o recorte das divisas de Minas a cada atualização pesava
const memoRecorte=new Map();
function memo(chave,fn){if(memoRecorte.has(chave))return memoRecorte.get(chave);const v=fn();if(memoRecorte.size>300)memoRecorte.clear();memoRecorte.set(chave,v);return v;}
function clipFeatureToMG(f){
  const k=JSON.stringify(f.geometry);
  const r=memo('c'+k,()=>clipGeomTS(f));
  if(!r)return null;
  return {...r,properties:{...(f.properties||{})}};
}
function clipGeomTS(f){
  try{
    const sf=suavizarFeature(f);
    // corta antes o contorno de Minas na caixa do desenho: a interseção fica muito mais leve
    let mask=MG_MASK;
    try{const b=turf.bbox(sf),m=0.05;const bc=turf.bboxClip(MG_MASK,[b[0]-m,b[1]-m,b[2]+m,b[3]+m]);
      const g=bc&&bc.geometry;if(g&&g.coordinates&&g.coordinates.length)mask=bc;}catch(e){}
    const clipped=turf.intersect(turf.featureCollection([sf,mask]));
    if(!clipped)return null;
    clipped.properties={...(f.properties||{})};
    return clipped;
  }catch(err){console.warn('Falha ao recortar geometria:',err);return f;}
}
function clippedDrawnFeatures(){return drawnFeatures().map(clipFeatureToMG).filter(Boolean);}
function refreshZOrder(){
  // Menos severo embaixo, mais severo por cima. Como o preenchimento é opaco,
  // as cores não se misturam nas sobreposições.
  LEVELS.slice().sort((a,b)=>a.rank-b.rank).forEach(lv=>{
    drawnItems.eachLayer(l=>{if(l._severity===lv.id&&l.bringToFront)l.bringToFront();});
  });
  if(mesoDisplay.bringToFront)mesoDisplay.bringToFront();
  if(window.recorteAreas)recorteAreas.agendar();
}
function addClippedFeatureToMap(feature,levelId){
  const clipped=clipFeatureToMG(feature);if(!clipped)return [];
  const lv=levelById(levelId);const added=[];
  const orig=JSON.parse(JSON.stringify(feature));orig.properties={...(orig.properties||{}),level:lv.id};
  L.geoJSON(clipped,{style:styleFor(lv),onEachFeature:(f,l)=>{l._severity=lv.id;l._orig=orig;drawnItems.addLayer(l);attachPopup(l);added.push(l);}});
  refreshZOrder();return added;
}
function renderLevels(){const el=document.getElementById('levels');el.innerHTML='';LEVELS.forEach(lv=>{const b=document.createElement('button');b.className='level'+(lv.id===selected.id?' active':'');b.innerHTML=`<span class="swatch" style="background:${lv.fill}"></span>${lv.label}`;b.onclick=()=>{selected=lv;document.getElementById('currentLabel').textContent=lv.label;renderLevels();};el.appendChild(b)});document.getElementById('legend').innerHTML=LEVELS.map(l=>{const h=l.fill.slice(1),n=parseInt(h,16),c=`rgba(${n>>16&255},${n>>8&255},${n&255},${l.opacity??1})`;return `<div><span class="swatch" style="background:linear-gradient(${c},${c}),#ecf4f5"></span>${l.label}</div>`}).join('');}
renderLevels();
/* ===================== Editor de áreas (2026.10.06.1) =====================
   Comum ao Tempo Severo e à Chuva/Tendência (o mesmo código nos dois app-drive.js).
   - Clique numa área pronta: entra em edição (arrastar vértices; arrastar o ponto do meio
     de um lado cria vértice; clicar num vértice o remove), trocar nível, "Mover" a área.
     "Concluir" (Enter) recorta e recalcula UMA vez; "Cancelar" (Esc) volta como estava.
   - Ctrl+Z: desenhando = tira o último ponto; editando = desfaz a última alteração da
     edição; fora disso = desfaz a última ação (área criada, editada, excluída ou limpeza).
   - A área guarda o desenho ORIGINAL (sem o recorte de MG); o recorte é só para mostrar e calcular.
   Depende de Leaflet 1.9 e Leaflet.draw 1.0.4 (já carregados pelas páginas). */
function criarEditorAreas(o){
  const map=o.map,MAXH=40;
  const historico=[];
  let ed=null;                       // sessão de edição em andamento
  const copiar=v=>Array.isArray(v)?v.map(copiar):L.latLng(v.lat,v.lng);
  const transladar=(v,dLat,dLng)=>Array.isArray(v)?v.map(x=>transladar(x,dLat,dLng)):L.latLng(v.lat+dLat,v.lng+dLng);

  /* ---------- barras flutuantes no mapa ---------- */
  const css=document.createElement('style');
  css.textContent=`.ea-barra{position:absolute;top:10px;left:50%;transform:translateX(-50%);z-index:1000;display:none;
    align-items:center;gap:6px;flex-wrap:wrap;justify-content:center;max-width:calc(100% - 120px);
    background:#fff;border:1px solid #9fb6d6;border-radius:8px;padding:6px 8px;box-shadow:0 2px 10px rgba(0,0,0,.18);
    font:13px/1.2 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0f2a4a}
  .ea-barra b{margin-right:2px}.ea-barra button,.ea-barra select{font:inherit;padding:4px 8px;border:1px solid #9fb6d6;
    border-radius:6px;background:#f4f8fd;color:#0f2a4a;cursor:pointer}
  .ea-barra button:hover{background:#e3edf9}.ea-barra button.ea-ok{background:#1f6fd1;border-color:#1f6fd1;color:#fff}
  .ea-barra button.ea-perigo{color:#b42318;border-color:#e4a5a0;background:#fff5f4}
  .ea-barra button.ea-ativo{background:#0f2a4a;color:#fff;border-color:#0f2a4a}
  .ea-desfazer{position:absolute;right:10px;bottom:28px;z-index:1000;font:13px system-ui,Arial,sans-serif;padding:5px 9px;
    border:1px solid #9fb6d6;border-radius:6px;background:#fff;color:#0f2a4a;cursor:pointer;box-shadow:0 1px 5px rgba(0,0,0,.15)}
  .ea-desfazer:disabled{opacity:.45;cursor:default}
  .ea-movendo,.ea-movendo .leaflet-interactive{cursor:move!important}`;
  document.head.appendChild(css);
  const cont=map.getContainer();
  const nova=html=>{const d=document.createElement('div');d.className='ea-barra';d.innerHTML=html;cont.appendChild(d);
    L.DomEvent.disableClickPropagation(d);L.DomEvent.disableScrollPropagation(d);return d;};
  const barraDesenho=nova('<b>Desenhando</b><button data-a="ponto" title="Ctrl+Z">↶ Desfazer ponto</button>'+
    '<button data-a="cancelar" class="ea-perigo" title="Esc">Cancelar desenho</button>'+
    '<span style="opacity:.75">Feche clicando no 1º ponto</span>');
  const barraEdicao=nova('<b>Editando área</b><select data-a="nivel" title="Nível / classificação"></select>'+
    '<button data-a="mover" title="Arrastar a área inteira">✥ Mover</button>'+
    '<button data-a="desfazer" title="Ctrl+Z">↶ Desfazer</button>'+
    '<button data-a="concluir" class="ea-ok" title="Enter">Concluir</button>'+
    '<button data-a="cancelar" title="Esc">Cancelar</button>'+
    '<button data-a="excluir" class="ea-perigo">Excluir área</button>');
  const btnDesfazer=document.createElement('button');
  btnDesfazer.title='Desfazer a última ação (Ctrl+Z)';btnDesfazer.type='button';btnDesfazer.disabled=true;
  // botão no cabeçalho do mapa (como na Previsão); sem cabeçalho, fica flutuando no canto do mapa
  const cabMapa=document.getElementById('hMap')&&document.getElementById('hMap').closest('header');
  if(cabMapa){btnDesfazer.className='btn small ea-desfazer-cab';btnDesfazer.innerHTML='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>Desfazer';cabMapa.appendChild(btnDesfazer);}
  else{btnDesfazer.className='ea-desfazer';btnDesfazer.textContent='↶ Desfazer';cont.appendChild(btnDesfazer);L.DomEvent.disableClickPropagation(btnDesfazer);}
  const q=(b,a)=>b.querySelector(`[data-a="${a}"]`);
  const sel=q(barraEdicao,'nivel');
  sel.innerHTML=o.niveis().map(n=>`<option value="${n.id}">${n.label}</option>`).join('');

  /* ---------- histórico geral (áreas criadas, editadas, excluídas) ---------- */
  function retrato(){
    const a=[];
    o.grupo.eachLayer(l=>{const f=JSON.parse(JSON.stringify(o.original(l)));f.properties={...(f.properties||{}),level:o.nivelDe(l)};a.push(f);});
    return a;
  }
  function empilhar(r){historico.push(r||retrato());if(historico.length>MAXH)historico.shift();btnDesfazer.disabled=false;}
  function desfazerGeral(){
    if(!historico.length){o.status('Nada para desfazer.');return;}
    const r=historico.pop();btnDesfazer.disabled=!historico.length;
    o.grupo.clearLayers();r.forEach(f=>o.adicionar(f,f.properties.level));
    o.aposMudanca();o.status('Última ação desfeita.');
  }
  function zerarHistorico(){historico.length=0;btnDesfazer.disabled=true;}

  /* ---------- edição de uma área ---------- */
  /* O Leaflet.draw guarda a referência dos vértices; depois de setLatLngs é preciso atualizá-la. */
  function ativarVertices(poly){
    try{poly.editing.disable();}catch(e){}
    poly.fire('revert-edited',{layer:poly});   // faz o Leaflet.draw reler os vértices atuais
    poly.editing.enable();
  }
  function estiloEdicao(nivel){return {...o.estilo(nivel),fillOpacity:.45,dashArray:'6 4',weight:2.5};}
  function iniciar(layer){
    if(ed||o.desenhoAtivo())return;
    const antes=retrato();
    const f=o.original(layer),g=f&&f.geometry;
    if(!g||(g.type!=='Polygon'&&g.type!=='MultiPolygon')){o.status('Esta área não pode ser editada.');return;}
    const latlngs=L.GeoJSON.coordsToLatLngs(g.coordinates,g.type==='Polygon'?1:2);
    const nivel=o.nivelDe(layer);
    const poly=L.polygon(latlngs,estiloEdicao(nivel)).addTo(map);
    o.grupo.removeLayer(layer);
    ed={layer,poly,nivel,nivelInicial:nivel,antes,pilha:[copiar(poly.getLatLngs())],modo:'vertices',arrasto:null};
    poly.on('edit',()=>{if(ed)ed.pilha.push(copiar(poly.getLatLngs()));});
    poly.on('mousedown',inicioArrasto);
    ativarVertices(poly);
    sel.value=nivel;mostrarModo();
    barraEdicao.style.display='flex';
    o.status('Editando: arraste os vértices, arraste o ponto do meio de um lado para criar vértice, clique num vértice para removê-lo. Concluir = Enter, Cancelar = Esc.');
  }
  function mostrarModo(){
    const b=q(barraEdicao,'mover');
    b.classList.toggle('ea-ativo',ed&&ed.modo==='mover');
    b.textContent=ed&&ed.modo==='mover'?'✎ Editar vértices':'✥ Mover';
    cont.classList.toggle('ea-movendo',!!ed&&ed.modo==='mover');
  }
  function alternarMover(){
    if(!ed)return;
    if(ed.modo==='vertices'){ed.modo='mover';ed.poly.editing.disable();o.status('Mover: clique e arraste a área. Clique em "Editar vértices" para voltar aos vértices.');}
    else{ed.modo='vertices';ativarVertices(ed.poly);o.status('Editando os vértices.');}
    mostrarModo();
  }
  function inicioArrasto(e){
    if(!ed||ed.modo!=='mover')return;
    L.DomEvent.stop(e);
    map.dragging.disable();
    ed.arrasto={ini:e.latlng,base:copiar(ed.poly.getLatLngs())};
    map.on('mousemove',arrastando);map.once('mouseup',fimArrasto);
    document.addEventListener('mouseup',fimArrasto,{once:true});
  }
  function arrastando(e){
    if(!ed||!ed.arrasto)return;
    const a=ed.arrasto;ed.poly.setLatLngs(transladar(a.base,e.latlng.lat-a.ini.lat,e.latlng.lng-a.ini.lng));
  }
  function fimArrasto(){
    map.off('mousemove',arrastando);map.dragging.enable();
    if(!ed||!ed.arrasto)return;
    ed.arrasto=null;ed.pilha.push(copiar(ed.poly.getLatLngs()));
  }
  function desfazerEdicao(){
    if(!ed)return;
    if(ed.pilha.length<2){o.status('Nada para desfazer nesta edição.');return;}
    ed.pilha.pop();
    const vertices=ed.modo==='vertices';
    if(vertices)ed.poly.editing.disable();
    ed.poly.setLatLngs(copiar(ed.pilha[ed.pilha.length-1]));
    if(vertices)ativarVertices(ed.poly);
    o.status('Alteração desfeita.');
  }
  function encerrar(){
    if(!ed)return;
    try{ed.poly.editing.disable();}catch(e){}
    map.off('mousemove',arrastando);map.dragging.enable();
    map.removeLayer(ed.poly);
    ed=null;barraEdicao.style.display='none';mostrarModo();
  }
  function cancelar(){
    if(!ed)return;
    const layer=ed.layer;encerrar();
    o.grupo.addLayer(layer);o.reordenar();
    o.status('Edição cancelada. A área ficou como estava.');
  }
  function concluir(){
    if(!ed)return;
    if(ed.pilha.length<2&&ed.nivel===ed.nivelInicial){cancelar();o.status('Nenhuma alteração.');return;}
    const f=ed.poly.toGeoJSON();f.properties={level:ed.nivel};
    try{
      if(window.turf&&turf.kinks&&turf.kinks(f).features.length){
        alert('A área ficou com lados se cruzando. Ajuste os vértices (ou use Desfazer) antes de concluir.');return;
      }
    }catch(e){}
    const antes=ed.antes;encerrar();
    empilhar(antes);
    const novas=o.adicionar(f,f.properties.level);
    o.aposMudanca();
    o.status(novas&&novas.length===0?'A área editada ficou fora de Minas Gerais e foi removida (use Desfazer para voltar).':'Área atualizada.');
  }
  function excluir(){
    if(!ed)return;
    const antes=ed.antes;encerrar();empilhar(antes);
    o.aposMudanca();o.status('Área excluída (use Desfazer para voltar).');
  }
  sel.onchange=()=>{if(!ed)return;ed.nivel=sel.value;ed.poly.setStyle(estiloEdicao(ed.nivel));};
  q(barraEdicao,'mover').onclick=alternarMover;
  q(barraEdicao,'desfazer').onclick=desfazerEdicao;
  q(barraEdicao,'concluir').onclick=concluir;
  q(barraEdicao,'cancelar').onclick=cancelar;
  q(barraEdicao,'excluir').onclick=()=>{if(confirm('Excluir esta área?'))excluir();};
  btnDesfazer.onclick=()=>{if(ed)desfazerEdicao();else desfazerGeral();};

  /* ---------- desenho novo ---------- */
  map.on(L.Draw.Event.DRAWSTART,()=>{if(ed)cancelar();barraDesenho.style.display='flex';});
  map.on(L.Draw.Event.DRAWSTOP,()=>{barraDesenho.style.display='none';});
  function desfazerPonto(){
    const dc=o.controleDesenho();
    if(dc&&dc.enabled()&&dc._markers&&dc._markers.length){dc.deleteLastVertex();o.status('Último ponto removido.');}
    else o.status('Nenhum ponto para desfazer.');
  }
  q(barraDesenho,'ponto').onclick=desfazerPonto;
  q(barraDesenho,'cancelar').onclick=()=>{const dc=o.controleDesenho();if(dc)dc.disable();o.status('Desenho cancelado.');};

  /* ---------- teclado ---------- */
  document.addEventListener('keydown',e=>{
    const t=e.target,campo=t&&(t.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&(e.key==='z'||e.key==='Z')){
      if(campo&&!ed)return;                         // Ctrl+Z normal dentro dos campos de texto
      e.preventDefault();
      if(o.desenhoAtivo())desfazerPonto(); else if(ed)desfazerEdicao(); else desfazerGeral();
      return;
    }
    if(!ed||campo)return;
    if(e.key==='Escape'){e.preventDefault();cancelar();}
    else if(e.key==='Enter'){e.preventDefault();concluir();}
  });

  return {
    /* chamar para cada camada criada: clique entra em edição */
    ligar(layer){
      layer.on('click',e=>{if(ed||o.desenhoAtivo())return;L.DomEvent.stop(e);iniciar(layer);});
      if(layer.bindTooltip&&!layer.getTooltip())layer.bindTooltip('Clique para editar',{sticky:true,opacity:.85});
    },
    /* percorre as áreas, incluindo a que está em edição (com a forma de antes da edição):
       assim "Salvar", PNG, KML e cálculos não perdem a área no meio de uma edição */
    cadaCamada(fn){o.grupo.eachLayer(fn);if(ed)fn(ed.layer);},
    empilhar,zerarHistorico,cancelar,
    emEdicao:()=>!!ed
  };
}

const editorAreas=criarEditorAreas({
  map,grupo:drawnItems,
  niveis:()=>LEVELS,
  nivelDe:l=>l._severity,
  original:l=>l._orig||Object.assign(l.toGeoJSON(),{properties:{level:l._severity}}),
  estilo:id=>styleFor(levelById(id)),
  adicionar:(f,id)=>addClippedFeatureToMap(f,id),
  aposMudanca:()=>{refreshZOrder();recalc();},
  reordenar:refreshZOrder,
  status:setStatus,
  controleDesenho:()=>drawControl,
  desenhoAtivo:()=>!!(drawControl&&drawControl.enabled&&drawControl.enabled())
});
let drawControl=new L.Draw.Polygon(map,{allowIntersection:false,showArea:false,shapeOptions:styleFor(selected)});
document.getElementById('drawBtn').onclick=()=>{drawControl=new L.Draw.Polygon(map,{allowIntersection:false,showArea:false,shapeOptions:styleFor(selected)});drawControl.enable();setStatus('Desenhando '+selected.label+'...');};
map.on(L.Draw.Event.CREATED,e=>{
  const f=e.layer.toGeoJSON();f.properties={level:selected.id};
  editorAreas.empilhar();
  const added=addClippedFeatureToMap(f,selected.id);
  recalc();
  setStatus(added.length?'Área de '+selected.label+' criada. Clique nela para editar; Ctrl+Z desfaz.':'O desenho ficou fora de Minas Gerais e não foi adicionado.');
});
map.on(L.Draw.Event.EDITED,()=>{reclipAllLayers();recalc();});
/* ===== Recorte de sobreposições (2026.10.22) =====
   Comum ao Tempo Severo e à Chuva/Tendência (o mesmo código nos dois app-drive.js).
   Com transparência, áreas sobrepostas misturam as cores. Com o recorte autorizado, a área de nível maior
   (mais severa) recorta a de nível menor; entre áreas do mesmo nível, a mais antiga fica e a nova é recortada.
   O desenho original de cada área é mantido (editar, mover ou apagar a de cima devolve o formato da de baixo). */
function criarRecorte(o){
  let decisao='sim';   // sempre recorta (a mensagem de autorização foi retirada a pedido)
  let timer=0,banner=null,ctrl=null,temSobre=false;
  const memoD=new Map();
  const bboxOk=(a,b)=>!(a[2]<b[0]||a[0]>b[2]||a[3]<b[1]||a[1]>b[3]);
  function itens(){const a=[];let i=0;o.grupo.eachLayer(l=>{const f=o.orig(l);if(!f)return;const g=o.clip(f);if(!g)return;a.push({l,i:i++,r:o.rank(l),g,bb:turf.bbox(g),k:JSON.stringify(g.geometry).length+':'+JSON.stringify(f.geometry)});});return a;}
  function calcular(){
    const xs=itens(),res=new Map();let sobre=false;
    for(const x of xs){
      const acima=xs.filter(y=>y!==x&&(y.r>x.r||(y.r===x.r&&y.i<x.i))&&bboxOk(x.bb,y.bb));
      if(!acima.length){res.set(x.l,x.g);continue;}
      const ck=x.k+'|'+acima.map(y=>y.k).join('|');
      let v=memoD.get(ck);
      if(v===undefined){
        let g=x.g,cortou=false;
        for(const y of acima){if(!g)break;try{const d=turf.difference(turf.featureCollection([g,y.g]));if(!d){g=null;cortou=true;break;}if(Math.abs(turf.area(d)-turf.area(g))>1e5)cortou=true;g=d;}catch(e){}}
        v={g,cortou};if(memoD.size>400)memoD.clear();memoD.set(ck,v);
      }
      if(v.cortou)sobre=true;
      res.set(x.l,v.g);
    }
    return {res,sobre,xs};
  }
  function setGeom(l,g){
    if(!l.setLatLngs)return;
    if(!g){l.setLatLngs([]);return;}
    const G=g.geometry;l.setLatLngs(L.GeoJSON.coordsToLatLngs(G.coordinates,G.type==='Polygon'?1:2));
  }
  function aplicar(){
    const {res,sobre,xs}=calcular();temSobre=sobre;
    for(const x of xs)setGeom(x.l,decisao==='sim'?res.get(x.l):x.g);
    if(o.aoMudar)o.aoMudar();
  }
  function decidir(v){decisao=v;try{localStorage.setItem(o.chave,v);}catch(e){}aplicar();}
  function mostrarBanner(on){
    const box=o.map.getContainer();
    if(!on){if(banner){banner.remove();banner=null;}return;}
    if(banner)return;
    banner=document.createElement('div');banner.className='rc-banner';
    banner.innerHTML='<b>Há áreas sobrepostas.</b> Com a transparência, as cores se misturam. Autoriza a área de <b>nível maior</b> recortar a de nível menor (a mais severa fica por cima, inteira)?<div class="rc-bts"><button type="button" class="rc-sim">Recortar</button><button type="button" class="rc-nao">Manter sobreposição</button></div>';
    L.DomEvent.disableClickPropagation(banner);L.DomEvent.disableScrollPropagation(banner);
    banner.querySelector('.rc-sim').onclick=()=>decidir('sim');banner.querySelector('.rc-nao').onclick=()=>decidir('nao');
    box.appendChild(banner);
  }
  function mostrarCtrl(on){
    const box=o.map.getContainer();
    if(!on){if(ctrl){ctrl.remove();ctrl=null;}return;}
    if(!ctrl){ctrl=document.createElement('label');ctrl.className='rc-ctrl';ctrl.title='Área de nível maior recorta a de nível menor onde se sobrepõem';
      ctrl.innerHTML='<input type="checkbox"> Recortar sobreposições';L.DomEvent.disableClickPropagation(ctrl);
      ctrl.querySelector('input').onchange=e=>decidir(e.target.checked?'sim':'nao');box.appendChild(ctrl);}
    ctrl.querySelector('input').checked=decisao==='sim';
  }
  if(!document.getElementById('rc-css')){const st=document.createElement('style');st.id='rc-css';st.textContent=
    '.rc-banner{position:absolute;z-index:1000;left:50%;top:12px;transform:translateX(-50%);max-width:min(520px,90%);background:#fff;color:#16243a;border:1px solid #f0a020;border-left:5px solid #f0a020;border-radius:8px;padding:10px 12px;font-size:13px;line-height:1.4;box-shadow:0 4px 16px rgba(9,43,106,.22)}'+
    '.rc-bts{display:flex;gap:8px;margin-top:8px}.rc-bts button{border:0;border-radius:6px;padding:6px 12px;font-weight:600;cursor:pointer;font-size:13px}'+
    '.rc-sim{background:#0b63c5;color:#fff}.rc-nao{background:#e9eef5;color:#16243a}'+
    '.rc-ctrl{position:absolute;z-index:900;left:12px;bottom:14px;background:#fff;color:#111;border-radius:8px;padding:6px 9px;font-size:12px;box-shadow:0 1px 7px rgba(9,43,106,.2);display:flex;align-items:center;gap:6px;cursor:pointer}';
    document.head.appendChild(st);}
  return {
    agendar(){clearTimeout(timer);timer=setTimeout(aplicar,60);},
    decisao:()=>decisao,
    // áreas como saem no mapa final/arquivos: recortadas se autorizado, senão como desenhadas (já recortadas em Minas)
    finais(){const {res,xs}=calcular();return xs.map(x=>{const g=decisao==='sim'?res.get(x.l):x.g;if(!g)return null;const f={type:'Feature',geometry:g.geometry,properties:{...(o.orig(x.l).properties||{})}};return f;}).filter(Boolean);}
  };
}
window.recorteAreas=criarRecorte({map,grupo:drawnItems,chave:'simge-ts-recorte',orig:l=>l._orig,clip:f=>clipFeatureToMG(f),rank:l=>levelById(l._severity).rank});
recorteAreas.agendar();
function reclipAllLayers(){
  const fs=drawnFeatures();drawnItems.clearLayers();
  fs.forEach(f=>addClippedFeatureToMap(f,f.properties.level));
  refreshZOrder();
}

function attachPopup(layer){editorAreas.ligar(layer);}   // clique na área = edição (editor de áreas)
function drawnFeatures(){const arr=[];editorAreas.cadaCamada(l=>{const f=l._orig?JSON.parse(JSON.stringify(l._orig)):l.toGeoJSON();f.properties={level:l._severity};arr.push(f)});return arr;}
// quais microrregiões cada área toca fica guardado: só a área nova/alterada é recalculada
const memoToque=new Map();
function toca(item,i,mf){
  if(!item.key)item.key=JSON.stringify(item.pf.geometry);
  let m=memoToque.get(item.key);if(!m){if(memoToque.size>300)memoToque.clear();m=new Map();memoToque.set(item.key,m);}
  if(m.has(i))return m.get(i);
  let v=false;try{v=tocaRapido(mf,i,item);}catch(e){try{v=turf.booleanIntersects(mf,item.pf);}catch(e2){}}
  m.set(i,v);return v;
}
// teste rápido: primeiro vértices de um dentro do outro (resolve quase todos os casos); só no resto compara
// os contornos, com versões simplificadas (~200 m) para não pesar
const microSimples=[];
function vertices(g,max){const out=[];const add=c=>out.push(c);const t=g.type;
  if(t==='Polygon')g.coordinates.forEach(r=>r.forEach(add));else if(t==='MultiPolygon')g.coordinates.forEach(p=>p.forEach(r=>r.forEach(add)));
  if(out.length<=max)return out;const st=out.length/max,r=[];for(let k=0;k<max;k++)r.push(out[Math.floor(k*st)]);return r;}
function tocaRapido(mf,i,item){
  if(!item.vs)item.vs=vertices(item.pf.geometry,40);
  for(const c of item.vs)if(turf.booleanPointInPolygon(c,mf))return true;
  if(!microSimples[i])microSimples[i]=turf.simplify(mf,{tolerance:0.002,highQuality:false});
  const ms=microSimples[i];
  for(const c of vertices(ms.geometry,40))if(turf.booleanPointInPolygon(c,item.pf))return true;
  if(!item.simp)item.simp=turf.simplify(item.pf,{tolerance:0.002,highQuality:false});
  return turf.booleanIntersects(ms,item.simp);
}
async function computeAssignments(){
 const data=await ensureMicroLoaded();
 const draw=clippedDrawnFeatures();
 const assignments={};
 if(!draw.length) return assignments;
 const drawWithBBox=draw.map(pf=>({pf,bbox:turf.bbox(pf),lv:levelById(pf.properties.level)}));
 const boxesOverlap=(a,b)=>!(a[2]<b[0]||a[0]>b[2]||a[3]<b[1]||a[1]>b[3]);
 for(let i=0;i<data.features.length;i++){
   const mf=data.features[i];
   const mb=microBBoxes[i];
   let best=null;
   for(const item of drawWithBBox){
     if(!boxesOverlap(mb,item.bbox)) continue;
     if(toca(item,i,mf)){ if(!best||item.lv.rank>best.rank) best=item.lv; }
   }
   if(best) assignments[mf.properties.nm_micro]=best.id;
 }
 return assignments;
}
function groupedFromAssignments(assignments){
 const grouped={}; LEVELS.forEach(l=>grouped[l.id]=[]);
 Object.entries(assignments).forEach(([n,id])=>grouped[id].push(n));
 for(const k of Object.keys(grouped)) grouped[k].sort((a,b)=>a.localeCompare(b,'pt-BR'));
 return grouped;
}
async function recalc(){
 if(!drawnFeatures().length){
   const grouped={}; LEVELS.forEach(l=>grouped[l.id]=[]);
   renderLists(grouped);
   window._groups=grouped; window._assignments={};
   return;
 }
 setStatus('Calculando microrregiões...');
 try{
   const assignments=await computeAssignments();
   const grouped=groupedFromAssignments(assignments);
   renderLists(grouped);
   window._groups=grouped;
   window._assignments=assignments;
   setStatus('Microrregiões atualizadas.');
 }catch(err){
   console.error(err);
   setStatus('Erro ao carregar/calcular microrregiões.');
 }
}
function pretty(n){return String(n).toLocaleLowerCase('pt-BR').replace(/(^|[\s/-])\p{L}/gu,m=>m.toLocaleUpperCase('pt-BR'));}
function renderLists(g){const el=document.getElementById('microLists');const cards=[];LEVELS.slice().reverse().forEach(l=>{if(g[l.id]?.length)cards.push(`<div class="list-card"><b><span class="swatch" style="background:${l.fill}"></span>${l.label} (${g[l.id].length})</b><p>${g[l.id].map(pretty).join(', ')}</p></div>`)});el.innerHTML=cards.join('')||'<div class="small">Nenhuma área desenhada.</div>';}
function setStatus(s){document.getElementById('status').textContent=s;}
renderLists(Object.fromEntries(LEVELS.map(l=>[l.id,[]])));
if('requestIdleCallback' in window){requestIdleCallback(()=>ensureMicroLoaded().catch(()=>{}),{timeout:5000});}
else{setTimeout(()=>ensureMicroLoaded().catch(()=>{}),2500);}
document.getElementById('saveBtn').onclick=()=>{localStorage.setItem('simge-tempo-severo-v012',JSON.stringify(drawnFeatures()));setStatus('Previsão salva neste navegador.');};
(function load(){try{const a=JSON.parse(localStorage.getItem('simge-tempo-severo-v012')||'[]');a.forEach(f=>addClippedFeatureToMap(f,f.properties.level));if(a.length){recalc();setStatus('Previsão salva anteriormente foi carregada.');}}catch(e){}})();
document.getElementById('clearBtn').onclick=()=>{if(confirm('Apagar todos os polígonos desta previsão?')){editorAreas.cancelar();editorAreas.empilhar();drawnItems.clearLayers();localStorage.removeItem('simge-tempo-severo-v012');recalc();setStatus('Previsão limpa (Ctrl+Z desfaz).');}};
document.getElementById('copyBtn').onclick=async()=>{const g=window._groups||{};const lines=[];LEVELS.slice().reverse().forEach(l=>{if(g[l.id]?.length)lines.push(`${l.label}: ${g[l.id].map(pretty).join(', ')}.`)});await navigator.clipboard.writeText(lines.join('\n'));setStatus('Listas de microrregiões copiadas.');};
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));}
function ringCoords(coords){return coords.map(c=>`${c[0]},${c[1]},0`).join(' ')}
function polygonKml(coords){const rings=[];rings.push(`<outerBoundaryIs><LinearRing><coordinates>${ringCoords(coords[0])}</coordinates></LinearRing></outerBoundaryIs>`);for(let i=1;i<coords.length;i++)rings.push(`<innerBoundaryIs><LinearRing><coordinates>${ringCoords(coords[i])}</coordinates></LinearRing></innerBoundaryIs>`);return `<Polygon>${rings.join('')}</Polygon>`;}

function isoToday(){const d=new Date(); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`;}
(function initDates(){const fd=document.getElementById('forecastDate');const vu=document.getElementById('validUntil');fd.value=isoToday();const d=new Date();d.setDate(d.getDate()+1);d.setHours(10,0,0,0);const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0'),h=String(d.getHours()).padStart(2,'0');vu.value=`${y}-${m}-${day}T${h}:00`;})();
function brDate(v){if(!v)return '';const [y,m,d]=v.split('-');return `${d}/${m}/${y}`;}
function brDateTime(v){if(!v)return '';const dt=new Date(v);return dt.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).replace(',','');}
/* ===== mapa final no layout da Previsão diária (assets/layout-mapa.js) ===== */
function opcoesMapa(){
  const fd=document.getElementById('forecastDate').value,ano=(fd||isoToday()).slice(0,4);
  const fs=recorteAreas.finais().sort((a,b)=>levelById(a.properties.level).rank-levelById(b.properties.level).rank);
  const usados=LEVELS.filter(l=>fs.some(f=>f.properties.level===l.id)).sort((a,b)=>b.rank-a.rank);
  const [vd,vt]=(document.getElementById('validUntil').value||'').split('T');
  return {
    titulo:'Tempo Severo - '+(fd?brDate(fd):'data pendente'),
    validade:vd?{date:vd,time:(vt||'10:00').slice(0,5)}:null,
    credito:'Tempo Severo - SIMGE/IGAM, '+ano,
    areas:fs.map(f=>{const lv=levelById(f.properties.level);return {geometry:f.geometry,fill:lv.fill,stroke:lv.stroke,opacity:lv.opacity}}),
    legenda:usados.map(l=>({fill:l.fill,label:l.label,opacity:l.opacity})).concat([{fill:'#ffffff',label:'Sem Tempestades'}]),
    cidades:CIDADES.features.map(f=>({nome:f.properties.NM_LOCAL_1||f.properties.NM_MUNICIP||'',lon:f.geometry.coordinates[0],lat:f.geometry.coordinates[1]}))
  };
}
// Carrega o layout se a página ainda não trouxe (ex.: Apps Script antigo com o GitHub já atualizado).
function garantirLayoutMapa(){
  if(window.LayoutMapa)return Promise.resolve();
  const carregar=src=>new Promise((ok,erro)=>{const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=()=>erro(new Error('Falha ao carregar '+src));document.head.appendChild(s);});
  const base=window.BASE_DADOS||'';
  return (typeof GEO==='undefined'?carregar(base+'previsao/data/geo.js'):Promise.resolve())
    .then(()=>carregar(base+'assets/layout-mapa.js'))
    .then(()=>{if(!window.LayoutMapa)throw new Error('layout do mapa indisponível');});
}
async function generatePNG(){
  setStatus('Gerando o mapa…');
  try{
    await garantirLayoutMapa();
    const blob=await LayoutMapa.png(opcoesMapa());
    const fd=document.getElementById('forecastDate').value;
    const a=document.createElement('a');
    a.download=`tempo_severo_${(fd||isoToday()).replaceAll('-','')}.png`;
    a.href=URL.createObjectURL(blob);
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),60000);
    setStatus('PNG gerado (3508 × 2480 px, 300 dpi, 297 × 210 mm).');
  }catch(e){console.error(e);setStatus('O navegador não conseguiu gerar o mapa. Tente novamente.');}
}
document.getElementById('pngBtn').onclick=generatePNG;
{const pb=document.getElementById('previewBtn');if(pb)pb.onclick=()=>garantirLayoutMapa().then(()=>LayoutMapa.previa(opcoesMapa())).catch(()=>setStatus('Não foi possível carregar o layout do mapa. Recarregue a página.'));}

function hexToKmlColor(hex,alpha='ff'){
  const h=hex.replace('#','');
  const r=h.slice(0,2),g=h.slice(2,4),b=h.slice(4,6);
  return `${alpha}${b}${g}${r}`.toLowerCase();
}
function unionFeatures(features){
  if(!features.length)return null;
  if(features.length===1)return features[0];
  try{return turf.union(turf.featureCollection(features));}catch(e){
    let acc=features[0];
    for(let i=1;i<features.length;i++){
      try{acc=turf.union(turf.featureCollection([acc,features[i]]));}catch(_){}
    }
    return acc;
  }
}
function visibleFeaturesForKml(){
  const source=clippedDrawnFeatures();
  const out=[];
  let higherMask=null;
  const ordered=LEVELS.slice().sort((a,b)=>b.rank-a.rank);
  for(const lv of ordered){
    const same=source.filter(f=>f.properties.level===lv.id);
    if(!same.length)continue;
    for(const f of same){
      let visible=f;
      if(higherMask){
        try{visible=turf.difference(turf.featureCollection([f,higherMask]));}catch(e){console.warn('Falha ao remover sobreposição no KML:',e);}
      }
      if(visible){visible.properties={...(f.properties||{}),level:lv.id};out.push(visible);}
    }
    const thisMask=unionFeatures(same);
    if(thisMask){higherMask=higherMask?unionFeatures([higherMask,thisMask]):thisMask;}
  }
  return out.sort((a,b)=>levelById(a.properties.level).rank-levelById(b.properties.level).rank);
}

// Estilos escritos no mesmo padrão do KML operacional usado hoje.
// KML usa AABBGGRR (alpha, blue, green, red), não #RRGGBB.
const KML_STYLE_BY_LEVEL={
  Nivel0:{id:'style1',poly:'ff6dea82'}, // verde - RGB #82EA6D
  Nivel1:{id:'style2',poly:'ff00ffff'}, // amarelo
  Nivel2:{id:'style3',poly:'ff00a5ff'}, // laranja
  Nivel3:{id:'style4',poly:'ff0000e6'}, // vermelho
  Nivel4:{id:'style5',poly:'ffff00ff'}  // magenta
};
function kmlStylesDocument(){
  return Object.entries(KML_STYLE_BY_LEVEL).map(([level,st])=>`<Style id="${st.id}"><LineStyle><color>40000000</color><width>3</width></LineStyle><PolyStyle><color>${st.poly}</color><fill>1</fill><outline>1</outline></PolyStyle></Style>`).join('');
}
function polygonKmlCompat(coords){
  const makeRing=(ring)=>`<LinearRing><tessellate>1</tessellate><coordinates>${ring.map(c=>`${c[0]},${c[1]},0.000`).join(' ')}</coordinates></LinearRing>`;
  let x=`<outerBoundaryIs>${makeRing(coords[0])}</outerBoundaryIs>`;
  for(let i=1;i<coords.length;i++) x+=`<innerBoundaryIs>${makeRing(coords[i])}</innerBoundaryIs>`;
  return `<Polygon>${x}</Polygon>`;
}

document.getElementById('kmlBtn').onclick=()=>{
  const fs=visibleFeaturesForKml();
  let placemarks=[];
  let seq=1;
  for(const f of fs){
    const lv=levelById(f.properties.level);
    const st=KML_STYLE_BY_LEVEL[lv.id];
    let geom='';
    if(f.geometry.type==='Polygon')geom=polygonKmlCompat(f.geometry.coordinates);
    else if(f.geometry.type==='MultiPolygon')geom='<MultiGeometry>'+f.geometry.coordinates.map(polygonKmlCompat).join('')+'</MultiGeometry>';
    placemarks.push(`<Placemark><name>${seq++}</name><description><![CDATA[<p>cor: ${lv.id}<br/>nivel: ${lv.label}</p>]]></description><ExtendedData><Data name="cor"><displayName>cor</displayName><value><![CDATA[${lv.id}]]></value></Data><Data name="nivel"><displayName>nivel</displayName><value><![CDATA[${lv.label}]]></value></Data></ExtendedData><styleUrl>#${st.id}</styleUrl>${geom}</Placemark>`);
  }
  const k=`<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://earth.google.com/kml/2.2"><Document><name>Tempo Severo</name>${kmlStylesDocument()}${placemarks.join('')}</Document></kml>`;
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([k],{type:'application/vnd.google-earth.kml+xml'}));
  a.download='tempo_severo_poligonos.kml';
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  setStatus('KML gerado no mesmo padrão de estilos do arquivo operacional de referência.');
};
document.getElementById('modelBtn').onclick=()=>document.getElementById('modelModal').classList.add('open');document.getElementById('closeModel').onclick=()=>document.getElementById('modelModal').classList.remove('open');

/* v1.15: mapa base no editor (mesmo seletor "Fundo" do mapa final) e painel "Mapa final" na tela,
   no layout da Previsão diária (297 × 210 mm), atualizado sozinho. */
garantirLayoutMapa().then(()=>{
  if(LayoutMapa.fundoNoEditor)LayoutMapa.fundoNoEditor(map,{mg:MG_MASK,aoMudar:null});
  if(LayoutMapa.editorExtras)LayoutMapa.editorExtras(map,{suavizarAnel,corDesenho:()=>selected.stroke||selected.fill,mg:MG_MASK,estados:window.BRASIL_ESTADOS});
  if(LayoutMapa.painelAoVivo)LayoutMapa.painelAoVivo(document.querySelector('section.panel.preview'),opcoesMapa,'Mapa final — Tempo Severo',
    ()=>JSON.stringify([drawnFeatures(),document.getElementById('forecastDate').value,document.getElementById('validUntil').value,recorteAreas.decisao()]));
}).catch(()=>{});
