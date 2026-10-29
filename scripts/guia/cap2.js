const {chromium}=require('playwright');const fs=require('fs');
const OUT=process.argv[2],B='http://localhost:8780/';
const ring=a=>[...a,a[0]];const poly=(c,level)=>({type:'Feature',properties:{level},geometry:{type:'Polygon',coordinates:[ring(c)]}});
(async()=>{const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1.5});
await ctx.addInitScript(()=>{try{localStorage.setItem('layoutMapa:fundo2','osm');localStorage.setItem('smDicaUsos','9');window.__SEM_FAIXA_TESTE=true}catch(e){}});const p=await ctx.newPage();
await p.goto(B+'chuva/plataforma.html');await p.waitForTimeout(9000);
const R=JSON.parse(fs.readFileSync(OUT+'/boxes.json'));
const box=async s=>{const bb=await p.locator(s).first().boundingBox();return bb?{x:bb.x/1440,y:bb.y/900,w:bb.width/1440,h:bb.height/900}:null};
// desenhando
await p.click('#levels .level:nth-child(3)');await p.click('#drawBtn');await p.waitForTimeout(400);
const mb=await p.locator('#map').boundingBox();const pts=[[0.38,0.55],[0.52,0.5],[0.6,0.62],[0.5,0.72]];
for(const [fx,fy] of pts){await p.mouse.click(mb.x+mb.width*fx,mb.y+mb.height*fy);await p.waitForTimeout(250);}
await p.mouse.move(mb.x+mb.width*0.4,mb.y+mb.height*0.7);await p.waitForTimeout(400);
const first={x:(mb.x+mb.width*0.38)/1440-0.008,y:(mb.y+mb.height*0.55)/900-0.012,w:0.016,h:0.024};
const bar=await box('.leaflet-control-container ~ * , .lm-barra, .ed-barra');
await p.screenshot({path:OUT+'/desenho.png'});
R['desenho']=[await box('#levels .level:nth-child(3)'),await box('#drawBtn'),first,await box('text=Desfazer ponto')];
// concluir com duplo clique
await p.mouse.dblclick(mb.x+mb.width*0.42,mb.y+mb.height*0.7);await p.waitForTimeout(2500);
// editar: clicar na área
await p.mouse.click(mb.x+mb.width*0.5,mb.y+mb.height*0.6);await p.waitForTimeout(1200);
await p.screenshot({path:OUT+'/edicao.png'});
const txt=await p.evaluate(()=>[...document.querySelectorAll('button')].filter(b=>b.offsetParent&&/Concluir|Cancelar|Mover|Excluir|Desfazer/.test(b.textContent)).map(b=>b.textContent.trim()));
console.log(txt);
R['edicao']=[await box('.leaflet-marker-icon.leaflet-editing-icon >> nth=0'),await box('select:visible:not(#layoutFundo)'),await box('button:visible:has-text("Mover")'),await box('button:visible:has-text("Concluir")'),await box('button:visible:text-is("Cancelar")'),await box('button:visible:has-text("Excluir")')];
console.log(JSON.stringify(R.desenho),JSON.stringify(R.edicao));
fs.writeFileSync(OUT+'/boxes.json',JSON.stringify(R,null,1));await b.close();})();
