/* Código da ferramenta para a versão Apps Script (carregado de fora para o Apps Script não interferir).
   Gerado a partir de chuva/index.html. Depende de window.BASE_DADOS, definido na página.
   2026.10.05.2: mapa final no layout da Previsão diária (assets/layout-mapa.js); validade da Tendência
   = 2º dia + 1; datas padrão no horário local.
   2026.10.06.1: título da Tendência com os dois dias da tendência (ex.: "07 e 08/10/2026");
   datas padrão pelo horário de Brasília (Minas Gerais), não pelo relógio do computador.
   2026.10.06.2: edição das áreas (clique na área: vértices, mover, trocar nível, Concluir/Cancelar),
   Ctrl+Z / Desfazer e a área guarda o desenho original (recorte em MG só para mostrar). */

const LEVELS=[
{id:'nao_significativa',rank:0,fill:'#A7E3F0',stroke:'#7CC3D3',label:'Chuva Não Significativa',opacity:0.5},
{id:'baixo',rank:1,fill:'#28E3F0',stroke:'#20B7C0',label:'20–40 mm',opacity:0.6},
{id:'medio',rank:2,fill:'#21ADF3',stroke:'#178BC4',label:'40–60 mm',opacity:0.7},
{id:'alto',rank:3,fill:'#0E6DFA',stroke:'#0B57C8',label:'60–80 mm',opacity:0.8},
{id:'muitoalto',rank:4,fill:'#191EB4',stroke:'#111579',label:'Acima de 80 mm',opacity:0.9}];   // opacidade de cada nível (igual às camadas do QGIS)
// amostra da legenda da tela com a mesma transparência do mapa
const corLeg=l=>{const h=l.fill.replace('#','');const n=parseInt(h.length===3?h.split('').map(c=>c+c).join(''):h,16);return `rgba(${n>>16&255},${n>>8&255},${n&255},${l.opacity??1})`;};
let selected=LEVELS[0], product='chuva';
const MG_MASK=((window.BRASIL_ESTADOS&&BRASIL_ESTADOS.features)||[]).find(f=>f.properties.UF==='MG')||turf.union(turf.featureCollection(MESO.features));
const map=L.map('map',{zoomControl:true,attributionControl:false,minZoom:5,maxZoom:12});
const drawnItems=new L.FeatureGroup().addTo(map);
// estados como na Previsão: linha preta fina, fora de Minas em branco; Minas sem preenchimento (o fundo vem por baixo)
const estadosEditor=L.geoJSON(BRASIL_ESTADOS,{interactive:false,style:f=>({color:'#000',weight:f.properties.UF==='MG'?1.2:0.8,fillColor:'#fff',fillOpacity:f.properties.UF==='MG'?0:1})}).addTo(map);
const mesoDisplay=L.geoJSON(MESO,{style:{color:'#454545',weight:1.15,fillOpacity:0}}).addTo(map); map.fitBounds(mesoDisplay.getBounds(),{padding:[25,25]});
// v1.15: marcação das cidades igual à da Previsão (ponto branco pequeno e nome logo abaixo, em azul-marinho)
(function(){const s=document.createElement('style');s.textContent='.leaflet-tooltip.lm-cidade{background:transparent;border:0;box-shadow:none;padding:0;color:#092b6a;font:700 12px Arial,"Liberation Sans",Helvetica,sans-serif;text-shadow:1px 1px 0 #fff,-1px -1px 0 #fff,1px -1px 0 #fff,-1px 1px 0 #fff,0 1px 0 #fff,0 -1px 0 #fff}.leaflet-tooltip.lm-cidade:before{display:none}';document.head.appendChild(s);})();
map.createPane('lmCidades').style.zIndex=450;   // cidades sempre por cima das áreas desenhadas
L.geoJSON(CIDADES,{pointToLayer:(f,ll)=>L.circleMarker(ll,{pane:'lmCidades',interactive:false,radius:1.9,color:'#1f2328',weight:0.9,fillColor:'#fff',fillOpacity:1}),onEachFeature:(f,l)=>{const n=f.properties.NM_LOCAL_1||f.properties.NM_MUNICIP||f.properties.nome||'';l.bindTooltip(n,{permanent:true,direction:'bottom',offset:[0,1],className:'lm-cidade'});}}).addTo(map);
function levelById(id){return LEVELS.find(x=>x.id===id)||LEVELS[0]} function styleFor(l){return {color:l.stroke,weight:1.5,fillColor:l.fill,fillOpacity:l.opacity??1}}
function renderLevels(){const el=document.getElementById('levels');el.innerHTML='';LEVELS.forEach(l=>{const b=document.createElement('button');b.className='level'+(l.id===selected.id?' active':'');b.innerHTML=`<span class="swatch" style="background:${l.fill}"></span>${l.label}`;b.onclick=()=>{selected=l;document.getElementById('currentLabel').textContent=l.label;renderLevels()};el.appendChild(b)});renderLegend();}
function renderLegend(){document.getElementById('legend').innerHTML=LEVELS.slice().reverse().map(l=>`<div><span class="swatch" style="background:linear-gradient(${corLeg(l)},${corLeg(l)}),#ecf4f5"></span>${l.label}</div>`).join('')+'<div><span class="swatch lm-sem" style="background:#ecf4f5"></span>Sem Previsão de Chuvas</div>';try{atualizarAmostraSem();}catch(e){}}
function renderLabelEditor(){const el=document.getElementById('labelEditor');el.innerHTML='';LEVELS.forEach(l=>{const r=document.createElement('div');r.className='labelrow';r.innerHTML=`<span class="swatch" style="background:${l.fill}"></span><input value="${l.label}" data-id="${l.id}">`;r.querySelector('input').oninput=e=>{l.label=e.target.value; if(selected.id===l.id)document.getElementById('currentLabel').textContent=l.label;renderLevels()};el.appendChild(r)})}
renderLabelEditor();renderLevels();
function setStatus(s){document.getElementById('status').textContent=s}
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
function clipFeature(f){const r=memo('c'+JSON.stringify(f.geometry),()=>{try{const sf=suavizarFeature(f);let mask=MG_MASK;try{const b=turf.bbox(sf),m=0.05;const bc=turf.bboxClip(MG_MASK,[b[0]-m,b[1]-m,b[2]+m,b[3]+m]);if(bc&&bc.geometry&&bc.geometry.coordinates&&bc.geometry.coordinates.length)mask=bc;}catch(e){}return turf.intersect(turf.featureCollection([sf,mask]))}catch(e){return null}});return r?{...r,properties:{...(r.properties||{})}}:null;}
function addFeature(f,id){const cl=clipFeature(f);if(!cl)return [];const lv=levelById(id),added=[];const orig=JSON.parse(JSON.stringify(f));orig.properties={...(orig.properties||{}),level:id};L.geoJSON(cl,{style:styleFor(lv),onEachFeature:(ff,l)=>{l._level=id;l._orig=orig;drawnItems.addLayer(l);editorAreas.ligar(l);added.push(l);}});refreshZ();return added}
window.delLayer=id=>{drawnItems.eachLayer(l=>{if(L.Util.stamp(l)===id)drawnItems.removeLayer(l)});refreshZ()}
function refreshZ(){LEVELS.forEach(lv=>drawnItems.eachLayer(l=>{if(l._level===lv.id&&l.bringToFront)l.bringToFront()}));if(window.recorteAreas)recorteAreas.agendar();}
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
  nivelDe:l=>l._level,
  original:l=>l._orig||Object.assign(l.toGeoJSON(),{properties:{level:l._level}}),
  estilo:id=>styleFor(levelById(id)),
  adicionar:(f,id)=>addFeature(f,id),
  aposMudanca:refreshZ,
  reordenar:refreshZ,
  status:setStatus,
  controleDesenho:()=>drawControl,
  desenhoAtivo:()=>!!(drawControl&&drawControl.enabled&&drawControl.enabled())
});
let drawControl;document.getElementById('drawBtn').onclick=()=>{drawControl=new L.Draw.Polygon(map,{allowIntersection:false,showArea:false,shapeOptions:styleFor(selected)});drawControl.enable();setStatus('Desenhando '+selected.label+'...')};
map.on(L.Draw.Event.CREATED,e=>{const f=e.layer.toGeoJSON();editorAreas.empilhar();const n=addFeature(f,selected.id);setStatus(n.length?'Área criada. Clique nela para editar; Ctrl+Z desfaz.':'O desenho ficou fora de Minas Gerais e não foi adicionado.')});
function features(){const a=[];editorAreas.cadaCamada(l=>{const f=l._orig?JSON.parse(JSON.stringify(l._orig)):l.toGeoJSON();f.properties={level:l._level};a.push(f)});return a}
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
window.recorteAreas=criarRecorte({map,grupo:drawnItems,chave:'simge-chuva-recorte',orig:l=>l._orig,clip:f=>clipFeature(f),rank:l=>levelById(l._level).rank});
recorteAreas.agendar();
document.getElementById('clearBtn').onclick=()=>{if(confirm('Apagar todas as áreas deste produto?')){editorAreas.cancelar();editorAreas.empilhar();drawnItems.clearLayers();localStorage.removeItem('simge-chuva-tend-v02-'+product);setStatus('Áreas apagadas (Ctrl+Z desfaz).')}};
document.getElementById('saveBtn').onclick=()=>{localStorage.setItem('simge-chuva-tend-v02-'+product,JSON.stringify(features()));setStatus('Produto salvo neste navegador.')};
function loadProduct(){if(typeof editorAreas!=='undefined'){editorAreas.cancelar();editorAreas.zerarHistorico();}drawnItems.clearLayers();try{const arr=JSON.parse(localStorage.getItem('simge-chuva-tend-v02-'+product)||'[]');arr.forEach(f=>addFeature(f,f.properties.level));}catch(e){}}
function switchProduct(p){product=p;document.getElementById('tabChuva').classList.toggle('active',p==='chuva');document.getElementById('tabTend').classList.toggle('active',p==='tendencia');document.getElementById('trendDates').style.display=p==='tendencia'?'block':'none';loadProduct();ajustarValidade();setStatus(p==='chuva'?'Modo Previsão de Chuva.':'Modo Tendência 48h.')}
document.getElementById('tabChuva').onclick=()=>switchProduct('chuva');document.getElementById('tabTend').onclick=()=>switchProduct('tendencia');
function iso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};// "Hoje" no horário de Brasília (America/Sao_Paulo), qualquer que seja o fuso do computador.
function hojeMG(){const o={};new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).forEach(p=>o[p.type]=p.value);return o.year+'-'+o.month+'-'+o.day}
function somaDias(v,n){const d=new Date(v+'T12:00:00');d.setDate(d.getDate()+n);return iso(d)}
function initDates(){const h=hojeMG();forecastDate.value=h;trendDate1.value=somaDias(h,1);trendDate2.value=somaDias(h,2);validUntil.value=`${somaDias(h,1)}T10:00`}initDates();loadProduct();
function brDate(v){if(!v)return '';const [y,m,d]=v.split('-');return `${d}/${m}/${y}`}
function union(fs){if(!fs.length)return null;if(fs.length===1)return fs[0];try{return turf.union(turf.featureCollection(fs))}catch(e){return fs[0]}}
function visibleFeatures(){if(window.recorteAreas&&recorteAreas.decisao()==='nao')return recorteAreas.finais().sort((a,b)=>levelById(a.properties.level).rank-levelById(b.properties.level).rank);const src=features().map(f=>{const c=clipFeature(f);if(c)c.properties=f.properties;return c}).filter(Boolean),out=[];let high=null;for(const lv of LEVELS.slice().sort((a,b)=>b.rank-a.rank)){const same=src.filter(f=>f.properties.level===lv.id);for(const f of same){let v=f;if(high){try{v=turf.difference(turf.featureCollection([f,high]))}catch(e){}}if(v){v.properties={level:lv.id};out.push(v)}}const m=union(same);if(m)high=high?union([high,m]):m}return out.sort((a,b)=>levelById(a.properties.level).rank-levelById(b.properties.level).rank)}
/* ===== mapa final no layout da Previsão diária (assets/layout-mapa.js) ===== */
function addDaysIso(v,n){if(!v)return '';const d=new Date(v+'T12:00:00');d.setDate(d.getDate()+n);return iso(d)}
function horaValidade(){return ((validUntil.value||'').split('T')[1]||'').slice(0,5)||'10:00'}
// Previsão de Chuva: válido até o dia seguinte à previsão.
// Tendência: válido até o dia seguinte ao 2º dia da tendência (ex.: 05 -> 06 e 07 -> válido até 08).
// A hora escolhida é mantida (10h se estiver vazia).
function ajustarValidade(){
  let dia='';
  if(product==='tendencia')dia=addDaysIso(trendDate2.value||addDaysIso(trendDate1.value,1)||addDaysIso(forecastDate.value,2),1);
  else dia=addDaysIso(forecastDate.value,1);
  if(dia)validUntil.value=dia+'T'+horaValidade();
}
['forecastDate','trendDate1','trendDate2'].forEach(id=>document.getElementById(id).addEventListener('change',ajustarValidade));
ajustarValidade();
// Título da Tendência: os dois dias da tendência.
// 07 e 08/10/2026 | 31/10 e 01/11/2026 | 31/12/2026 e 01/01/2027
function datasTendencia(d1,d2){
  if(!d1||!d2)return 'data pendente';
  const [y1,m1,a1]=d1.split('-'),[y2,m2,a2]=d2.split('-');
  if(y1!==y2)return `${a1}/${m1}/${y1} e ${a2}/${m2}/${y2}`;
  if(m1!==m2)return `${a1}/${m1} e ${a2}/${m2}/${y2}`;
  return `${a1} e ${a2}/${m2}/${y2}`;
}
function opcoesMapa(){
  const fd=forecastDate.value,ano=(fd||iso(new Date())).slice(0,4);
  const nome=product==='chuva'?'Previsão de Chuva':'Tendência de Chuva';
  const fs=visibleFeatures();
  const usados=LEVELS.filter(l=>fs.some(f=>f.properties.level===l.id)).sort((a,b)=>b.rank-a.rank);
  const [vd,vt]=(validUntil.value||'').split('T');
  return {
    titulo:nome+' - '+(product==='tendencia'?datasTendencia(trendDate1.value,trendDate2.value):(fd?brDate(fd):'data pendente')),
    validade:vd?{date:vd,time:(vt||'10:00').slice(0,5)}:null,
    credito:nome+' - SIMGE/IGAM, '+ano,
    areas:fs.map(f=>{const lv=levelById(f.properties.level);return {geometry:f.geometry,fill:lv.fill,stroke:lv.stroke,opacity:lv.opacity}}),
    legenda:usados.map(l=>({fill:l.fill,label:l.label,opacity:l.opacity})).concat([{fill:'#ffffff',label:'Sem Previsão de Chuvas'}]),
    cidades:CIDADES.features.map(f=>({nome:f.properties.NM_LOCAL_1||f.properties.NM_MUNICIP||f.properties.nome||'',lon:f.geometry.coordinates[0],lat:f.geometry.coordinates[1]}))
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
    const fd=forecastDate.value;
    const a=document.createElement('a');
    a.download=(product==='chuva'?'chuva_':'tendencia_')+(fd||'mapa').replaceAll('-','')+'.png';
    a.href=URL.createObjectURL(blob);
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),60000);
    setStatus('PNG gerado (3508 × 2480 px, 300 dpi, 297 × 210 mm).');
  }catch(e){console.error(e);setStatus('O navegador não conseguiu gerar o mapa. Tente novamente.')}
}
pngBtn.onclick=generatePNG;
{const pb=document.getElementById('previewBtn');if(pb)pb.onclick=()=>garantirLayoutMapa().then(()=>LayoutMapa.previa(opcoesMapa())).catch(()=>setStatus('Não foi possível carregar o layout do mapa. Recarregue a página.'))}

/* v1.15: mapa base no editor (mesmo seletor "Fundo" do mapa final) e painel "Mapa final" na tela,
   no layout da Previsão diária (297 × 210 mm), atualizado sozinho. */
garantirLayoutMapa().then(()=>{
  if(LayoutMapa.fundoNoEditor)LayoutMapa.fundoNoEditor(map,{mg:MG_MASK,aoMudar:()=>atualizarAmostraSem()});
  if(LayoutMapa.editorExtras)LayoutMapa.editorExtras(map,{suavizarAnel,corDesenho:()=>selected.stroke||selected.fill,mg:MG_MASK,estados:BRASIL_ESTADOS,desenharEstados:false});
  if(LayoutMapa.painelAoVivo)LayoutMapa.painelAoVivo(document.querySelector('section.panel.preview'),opcoesMapa,'Mapa final — Chuva e Tendência',
    ()=>JSON.stringify([features(),product,forecastDate.value,validUntil.value,(window.trendDate1||{}).value,(window.trendDate2||{}).value,LEVELS.map(l=>l.label),window.recorteAreas&&recorteAreas.decisao()]));
}).catch(()=>{});
// legenda da tela: "Sem Previsão de Chuvas" mostra como Minas aparece (recorte do mapa base ou o tom claro de Minas)
let amostraPedido=0;
function atualizarAmostraSem(){
  const n=++amostraPedido,id=window.LayoutMapa?LayoutMapa.fundoEscolhido():'';
  const pintar=bg=>document.querySelectorAll('#legend .lm-sem').forEach(s=>{s.style.background=bg;s.style.backgroundSize='cover';});
  if(!id||!window.LayoutMapa||!LayoutMapa.amostraFundo){pintar('#ecf4f5');return;}
  LayoutMapa.amostraFundo(id).then(cor=>{if(n===amostraPedido)pintar(cor||'#ecf4f5');}).catch(()=>{});   // só a cor base do mapa base
}
