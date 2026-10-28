const {chromium}=require('playwright');const fs=require('fs');
const OUT=process.argv[2], B='http://localhost:8780/';
const ring=a=>[...a,a[0]];const poly=(c,level)=>({type:'Feature',properties:{level},geometry:{type:'Polygon',coordinates:[ring(c)]}});
const R={};
async function page(b){const ctx=await b.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1.5,acceptDownloads:true});
 await ctx.addInitScript(()=>{try{localStorage.setItem('layoutMapa:fundo2','osm');localStorage.setItem('smDicaUsos','9')}catch(e){}});const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));return p;}
async function shot(p,name,sels){const boxes=[];for(const s of sels){const loc=p.locator(s).first();let bb=null;try{bb=await loc.boundingBox({timeout:2000});}catch(e){}
 if(!bb){console.log('  sem caixa',name,s);boxes.push(null);continue;} if(bb.y+bb.height<0||bb.y>900)console.log('  fora da tela',name,s,Math.round(bb.y));
 boxes.push({x:bb.x/1440,y:bb.y/900,w:bb.width/1440,h:bb.height/900});}
 await p.screenshot({path:OUT+'/'+name+'.png'});R[name]=boxes;console.log(name,'ok');}
(async()=>{const b=await chromium.launch();
{const p=await page(b);await p.goto(B);await p.waitForTimeout(800);
 await shot(p,'painel',['a.card[href="previsao/"]','a.card[href="tempo-severo/plataforma.html"]','a.card[href="chuva/plataforma.html"]','a.card[href="alertas/plataforma.html"]','a.card[href="reservatorios/"]','a.card[href="previsao/"] .tag']);}
{const p=await page(b);await p.goto(B+'previsao/');await p.waitForTimeout(4000);
 const RW={"Almenara":["parcialmente nublado",35,22],"Barbacena":["tempestades à tarde",27,16],"Belo Horizonte":["tempestades à tarde",31,19],"Buritis":["chuvas isoladas à tarde",34,21],"Campos Altos":["tempestades à tarde",28,17],"Carneirinho":["nublado com chuva",30,21],"Curvelo":["chuvas isoladas à tarde",33,20],"Diamantina":["tempestades à tarde",27,16],"Divinópolis":["tempestades à tarde",31,18],"Extrema":["nublado com chuva",26,15],"Governador Valadares":["parcialmente nublado",35,22],"Ipatinga":["chuvas isoladas à tarde",34,21],"Itamonte":["nublado com chuva",24,13],"Januária":["predomínio de sol",36,22],"Juiz de Fora":["tempestades à tarde",28,17],"Manhuaçu":["chuvas isoladas à tarde",29,17],"Montes Claros":["parcialmente nublado",35,21],"Paracatu":["chuvas isoladas à tarde",33,20],"Patos de Minas":["tempestades à tarde",30,18],"Pirapora":["parcialmente nublado",36,22],"Poços de Caldas":["nublado com chuva forte",25,15],"Teófilo Otoni":["parcialmente nublado",33,20],"Uberaba":["tempestade com chuva forte",31,20],"Uberlândia":["tempestades à tarde",31,20],"Viçosa":["chuvas isoladas à tarde",29,17]};
 await p.evaluate(R=>applyData({date:'2026-10-28',rows:Object.entries(R).map(([name,[tempo,tmax,tmin]])=>({name,tempo,tmax:String(tmax),tmin:String(tmin)}))}),RW);
 await p.evaluate(()=>{const r=document.querySelector('input[name=bgsel][value="osm"]');if(r){r.click();r.dispatchEvent(new Event('change',{bubbles:true}));}window.scrollTo(0,0);});await p.waitForTimeout(15000);
 await p.waitForTimeout(3000);
 await shot(p,'prev_mapa',['#date','#valTime','#rows .trow:nth-child(3) .cond','#rows .trow:nth-child(3) .wmx','#lblTemps','#paper','#smBotao','#btnSave']);
 await p.evaluate(()=>{document.querySelector('#bulkCond').scrollIntoView({block:'center'});});await p.waitForTimeout(500);
 await p.evaluate(()=>{const c=document.querySelectorAll('#rows .trow input[type=checkbox]');[0,1,4].forEach(i=>{c[i].checked=true;c[i].dispatchEvent(new Event('change',{bubbles:true}));});});await p.waitForTimeout(300);
 await shot(p,'prev_lote',['#rows .trow:nth-child(1) .ck','#bulkCond','#btnApply','#btnAdd','#btnBase']);
 await p.evaluate(()=>window.scrollTo(0,0));
 await p.click('#tabBul');await p.waitForTimeout(2500);
 await shot(p,'prev_boletim',['#bTitle','#bDate','#bVal','#bParas','button[data-ins="Nível 1"]','#bPages','#smBotao']);
 await p.click('#tabCid');await p.waitForTimeout(800);await p.click('#cBtnImport');await p.waitForTimeout(1500);
 await shot(p,'prev_cidade',['#cDate','#cBtnImport','#cTempsSeg','#cList > *:first-child','#cPages','#smBotao']);
 console.log('errs',p.errs);}
{const p=await page(b);await p.goto(B+'tempo-severo/plataforma.html');await p.waitForTimeout(9000);
 const fs_=[poly([[-50.9,-18.7],[-46.8,-18.1],[-44.6,-19.4],[-44.1,-21.4],[-45.9,-22.6],[-48.4,-20.9],[-50.9,-20.2]],'Nivel0'),poly([[-49.6,-19.0],[-47.2,-18.8],[-45.7,-20.1],[-46.2,-21.7],[-48.0,-20.7]],'Nivel1'),poly([[-48.6,-19.4],[-47.3,-19.4],[-46.9,-20.3],[-47.8,-20.6]],'Nivel2')];
 await p.evaluate(fs_=>{fs_.forEach(f=>addClippedFeatureToMap(f,f.properties.level));recalc();},fs_);await p.waitForTimeout(8000);
 await shot(p,'ts',['#forecastDate','#validUntil','#levels','#drawBtn','#map','#microLists','#copyBtn','#previewBtn','#smBotao','#saveBtn','#modelBtn','#saveBtn']);
 console.log('errs',p.errs);}
{const p=await page(b);await p.goto(B+'chuva/plataforma.html');await p.waitForTimeout(9000);
 const fs_=[poly([[-47.6,-14.2],[-39.8,-14.4],[-39.9,-18.2],[-44.4,-18.7],[-47.4,-17.8]],'nao_significativa'),poly([[-51.3,-18.4],[-44.4,-18.7],[-41.3,-19.0],[-40.9,-21.6],[-46.6,-23.0],[-51.2,-20.4]],'baixo'),poly([[-49.8,-19.1],[-45.4,-19.2],[-43.9,-20.4],[-45.5,-21.9],[-48.2,-20.7]],'medio'),poly([[-47.9,-19.5],[-46.1,-19.6],[-45.6,-20.6],[-47.0,-20.9]],'alto')];
 await p.evaluate(fs_=>{fs_.forEach(f=>addFeature(f,f.properties.level));},fs_);await p.waitForTimeout(8000);
 await shot(p,'chuva',['#tabChuva','#forecastDate','#validUntil','#levels','#drawBtn','#map','#previewBtn','#smBotao','#saveBtn']);
 const lb=await p.locator('#labelEditor').boundingBox();await p.evaluate(()=>document.querySelector('#labelEditor').scrollIntoView({block:'center'}));await p.waitForTimeout(400);
 await shot(p,'chuva_legenda',['#labelEditor']);await p.evaluate(()=>window.scrollTo(0,0));
 await p.evaluate(()=>switchProduct('tendencia'));await p.waitForTimeout(800);
 const t=[poly([[-51.3,-18.0],[-43.0,-17.8],[-40.8,-19.2],[-41.0,-21.8],[-46.6,-23.0],[-51.2,-20.4]],'baixo'),poly([[-48.5,-19.0],[-44.0,-19.2],[-43.5,-21.2],[-46.5,-21.9]],'medio')];
 await p.evaluate(fs_=>{fs_.forEach(f=>addFeature(f,f.properties.level));},t);await p.waitForTimeout(4000);
 await shot(p,'tend',['#tabTend','#forecastDate','#trendDate1','#trendDate2','#validUntil','#levels','#smBotao','#saveBtn']);
 console.log('errs',p.errs);}
{const p=await page(b);await p.goto(B+'alertas/plataforma.html');await p.waitForTimeout(6000);
 for(const n of ['Uberaba','Conceição das Alagoas','Veríssimo','Uberlândia','Sacramento','Delta']) await p.evaluate(n=>{const el=document.querySelector(`path.municipio[data-name="${n}"]`);if(el)el.dispatchEvent(new MouseEvent('click',{bubbles:true}));},n);
 await p.evaluate(()=>{const d=[...document.querySelectorAll('details')].find(x=>/Camadas/.test(x.textContent));if(d)d.open=true;});await p.waitForTimeout(600);
 await shot(p,'al_mapa',['#toolClick','#toolDraw','#searchCity','path.municipio[data-name="Uberaba"]','#selCount','#create','#activeList','#smBotao','#toggleIR','#hMapa ~ * >> nth=0']);
 await p.click('#create');await p.waitForTimeout(800);
 await p.fill('#owner','Nome do meteorologista').catch(()=>{});
 await shot(p,'al_modal',['#type','#duration','#time','#owner','#chips','#message','#copy','#emit']);
 await p.click('#cancel');await p.waitForTimeout(300);
 await p.click('#abaPlantao');await p.waitForTimeout(2500);
 await shot(p,'al_plantao1',['#pResp','#pData','#pInicio','#grpIntervalo','#relPages','#salvarPlantao','#smBotao','#smNavegador']);
 await p.evaluate(()=>document.querySelector('#grpPublicacao').scrollIntoView({block:'start'}));await p.waitForTimeout(500);
 await shot(p,'al_plantao2',['#grpPublicacao','#grpInter','#grpFerr','#salvarPlantao']);
 await p.evaluate(()=>document.querySelector('#pPassagem').scrollIntoView({block:'start'}));await p.waitForTimeout(500);
 await shot(p,'al_plantao3',['#pPassagem','#pMapaPrev','#pOutras','#salvarPlantao']);
 console.log('errs',p.errs);}
{const p=await page(b);await p.goto(B+'reservatorios/');await p.waitForTimeout(800);
 await p.click('#cpcLoad');await p.waitForFunction(()=>!document.getElementById('cpcLoad').disabled,null,{timeout:120000});await p.waitForTimeout(500);
 await shot(p,'res_busca',['#cpcCycle','#cpcLoad','#cpcStatus','.tab[data-tab=reserv]']);
 await p.evaluate(()=>document.querySelector('#reserv').scrollIntoView({block:'start'}));await p.waitForTimeout(400);
 await shot(p,'res_reserv',['#resStart','#resShowCities','#resGenerate','#smBotao','#resCanvas']);
 await p.click('.tab[data-tab=weekly]');await p.evaluate(()=>document.querySelector('#weekly').scrollIntoView({block:'start'}));await p.waitForTimeout(500);
 await shot(p,'res_weekly',['#wk1Start','#wk2Start','#wkGenerate','#smBotao','#wk1Canvas','#wk2Canvas']);
 await p.evaluate(()=>document.querySelector('#mesoRainSummary').scrollIntoView({block:'start'}));await p.waitForTimeout(400);
 await shot(p,'res_meso',['#mesoRainSummary','#mesoW1Body']);
 await p.click('.tab[data-tab=accum]');await p.evaluate(()=>document.querySelector('#accum').scrollIntoView({block:'start'}));await p.waitForTimeout(500);
 await shot(p,'res_accum',['#a24Start','#accGenerate','#smBotao','#a24Canvas']);
 console.log('errs',p.errs);}
{const b2=b;const ctx=await b2.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1.5,acceptDownloads:true});
 await ctx.addInitScript(()=>{try{localStorage.setItem('layoutMapa:fundo2','osm');localStorage.setItem('smDicaUsos','9')}catch(e){}
  const mk=(ok,no)=>new Proxy({},{get(t,k){if(k==='withSuccessHandler')return f=>mk(f,no);if(k==='withFailureHandler')return f=>mk(ok,f);
   return(...a)=>setTimeout(()=>{if(k==='salvarArquivo')ok&&ok({url:'https://drive.google.com/file/d/exemplo',nome:a[1]});else ok&&ok(null);},400);}});
  window.google={script:{run:mk(null,null)}};});
 const p=await ctx.newPage();await p.goto(B+'previsao/');await p.waitForTimeout(4000);
 const RW={"Belo Horizonte":["tempestades à tarde",31,19],"Uberlândia":["tempestades à tarde",31,20],"Montes Claros":["parcialmente nublado",35,21],"Juiz de Fora":["tempestades à tarde",28,17],"Governador Valadares":["parcialmente nublado",35,22],"Januária":["predomínio de sol",36,22],"Poços de Caldas":["nublado com chuva forte",25,15],"Diamantina":["tempestades à tarde",27,16],"Uberaba":["tempestade com chuva forte",31,20],"Teófilo Otoni":["parcialmente nublado",33,20],"Patos de Minas":["tempestades à tarde",30,18],"Paracatu":["chuvas isoladas à tarde",33,20]};
 await p.evaluate(R=>applyData({date:'2026-10-28',rows:Object.entries(R).map(([name,[tempo,tmax,tmin]])=>({name,tempo,tmax:String(tmax),tmin:String(tmin)}))}),RW);
 await p.evaluate(()=>{const r=document.querySelector('input[name=bgsel][value="osm"]');if(r){r.click();r.dispatchEvent(new Event('change',{bubbles:true}));}window.scrollTo(0,0);});await p.waitForTimeout(15000);
 await p.click('#smBotao');await p.waitForTimeout(800);
 await p.click('#smJanela .salvar >> nth=0');
 await p.waitForSelector('#smJanela .res.ok',{timeout:180000});await p.waitForTimeout(800);
 await p.evaluate(()=>{document.querySelector('#smJanela').scrollTop=0;});
 await shot(p,'salvar_painel',['#smBotao','#smJanela .prev','#smJanela .salvar >> nth=0','#smJanela .res','#smJanela .fechar']);
 await p.click('#smJanela .fechar');await p.waitForTimeout(500);
 await p.click('#tuBotao');await p.waitForTimeout(1500);
 await p.evaluate(()=>{const a=document.getElementById('tuAviso');if(a)a.remove();});
 await p.hover('#tuCamada .tuN >> nth=2');await p.waitForTimeout(600);
 await shot(p,'tutorial',['#tuBotao','#tuCamada .tuN >> nth=2','#tuCamada .tuBalao']);
 await ctx.close();}
fs.writeFileSync(OUT+'/boxes.json',JSON.stringify(R,null,1));await b.close();})();
