// Scansiona l'universo di asset e timeframe, tiene le strategie che superano i controlli e scarta il resto.
// Con --if-empty parte solo se non c'è nulla di attivo (e al massimo una volta al giorno).
const fs=require('fs'),path=require('path');
const E=require('./engine'),{klines}=require('./binance');
const CF=path.join(__dirname,'config.json'),cfg=JSON.parse(fs.readFileSync(CF,'utf8'));
const fee=cfg.feePct/100,SLT=[[1,1.5],[1,2],[1.5,2],[1.5,3],[2,3],[2,4],[3,4.5]];
function ev(D,st,a,b,ks,kt,lo,sp,p0){
 const n=D.length,t=D.map(x=>x.t);p0=p0||E.positions(D,st,a,b,lo);
 const sm=E.sim(D,p0,fee,1,ks,kt),r=sm.r,pos=sm.ep;
 const A=E.stats(r,t,1,sp),B=E.stats(r,t,sp,n),T0=E.tstat(E.trades(r,pos,1,sp)),T1=E.tstat(E.trades(r,pos,sp,n));
 const q=Math.floor(n/3),F=[E.stats(r,t,1,q),E.stats(r,t,q,2*q),E.stats(r,t,2*q,n)].map(z=>z.ret);   // 3 periodi consecutivi: almeno 2 devono chiudere in positivo
 // criteri severi: tante combinazioni testate aumentano il rischio di trovare una fortuna del passato
 return{st,a,b,ks,kt,A,B,T0,T1,F,ok:T0.n>=30&&T1.n>=20&&B.ret>0&&B.sharpe>0&&A.sharpe>0&&T0.avg>0&&T1.avg>0&&T1.t>2&&F.filter(v=>v>0).length>=2};
}
function search(D,lo,sp,tf){
 const res=[];
 for(const [st,a,b] of E.GRID()){if((st=='tod'||st=='conf')&&tf!='1h')continue;const p0=E.positions(D,st,a,b,lo);
  for(const [ks,kt] of SLT){const x=ev(D,st,a,b,ks,kt,lo,sp,p0);if(x.T0.n>=20)res.push(x)}}
 return res.filter(x=>x.ok).sort((x,y)=>Math.min(y.A.sharpe,y.B.sharpe)-Math.min(x.A.sharpe,x.B.sharpe));
}
const LOGF=path.join(__dirname,'data','log.json');
let LOG=[];try{LOG=JSON.parse(fs.readFileSync(LOGF,'utf8'))}catch(e){}
const MP=cfg.minPaper||10,keyOf=w=>`${w.sym}-${w.tf}-${w.st}-${w.a}-${w.b}-${w.ks}-${w.kt}`;
// soglia di tolleranza: una strategia già in uso non viene scartata per un'oscillazione marginale del backtest
const grp={};LOG.forEach(t=>{if(t.key&&t.status!=='open'&&t.pct!=null)(grp[t.key]=grp[t.key]||[]).push(t.r)});
const bad=new Set(Object.keys(grp).filter(k=>grp[k].length>=MP&&grp[k].reduce((a,b)=>a+b,0)<=0));   // strategie già provate e perdenti: non vengono riproposte
const soft=x=>x.B.ret>0&&x.T0.avg>0&&x.T1.avg>0&&x.T1.t>1;
(async()=>{
 if(process.argv.includes('--if-empty')&&(cfg.watch.some(w=>w.active)||(cfg.scannedAt&&Date.now()-Date.parse(cfg.scannedAt)<864e5))){console.log('scansione non necessaria');return}
 const old=Object.fromEntries(cfg.watch.filter(w=>!w.grp).map(w=>[w.sym+w.tf,w])),found=[];let fetched=0;
 for(const sym of cfg.universe.symbols)for(const tf of cfg.universe.tfs){
  try{
   const D=await klines(sym,tf,1000,6),sp=Math.floor(D.length*.7),o=old[sym+tf];fetched++;
   const cur=o&&o.st?ev(D,o.st,o.a,o.b,o.ks,o.kt,false,sp):null;
   let best=null,kept=false,locked=false;
   if(cur){
    const k=keyOf(o),cl=LOG.filter(t=>t.key==k&&t.status!=='open'&&t.pct!=null),n=cl.length,avgR=n?cl.reduce((q,t)=>q+t.r,0)/n:0;
    const open=LOG.some(t=>t.key==k&&t.status=='open'),proven=n>=MP&&avgR>0,failed=bad.has(k);
    // si cambia solo se: il paper trading è negativo, oppure il backtest non regge più nemmeno con tolleranza e non c'è un trade aperto o una prova positiva
    if(!failed&&(cur.ok||soft(cur)||open||proven)){best=cur;kept=true;locked=open||proven}
    else if(failed)console.log(sym,tf,'strategia scartata: paper trading negativo su',n,'trade');
   }
   if(!best)best=search(D,false,sp,tf).find(x=>!bad.has(keyOf({sym,tf,st:x.st,a:x.a,b:x.b,ks:x.ks,kt:x.kt})));
   if(best)found.push({best,sym,tf,kept,locked,adopted:kept?o.adopted:null,score:Math.min(best.A.sharpe,best.B.sharpe)+(kept?1:0)});
  }catch(e){console.log(sym,tf,'errore',e.message)}
 }
 if(!fetched){console.log('nessun dato scaricato: configurazione invariata');return}
 found.sort((x,y)=>(+y.locked-+x.locked)||(y.score-x.score));   // prima le strategie bloccate (trade aperto o provate), poi per punteggio
 const seen=new Set(),watch=[];
 for(const f of found){
  if(seen.has(f.sym)||watch.length>=cfg.maxActive)continue;seen.add(f.sym);
  const b=f.best;
  watch.push({sym:f.sym,tf:f.tf,st:b.st,a:b.a,b:b.b,ks:b.ks,kt:b.kt,lo:false,active:true,adopted:f.adopted||new Date().toISOString(),
   bt:{wrTest:+b.T1.wr.toFixed(3),t:+b.T1.t.toFixed(2),n:b.T1.n,sharpeTest:+b.B.sharpe.toFixed(2)},tested:new Date().toISOString()});
  console.log(f.sym,f.tf,b.st,b.a,b.b,'SL',b.ks,'TP',b.kt,f.kept?(f.locked?'(mantenuta: trade aperto o provata)':'(confermata)'):'(nuova)');
 }
 cfg.watch=watch.concat(cfg.watch.filter(w=>w.grp));cfg.scannedAt=new Date().toISOString();
 fs.writeFileSync(CF,JSON.stringify(cfg,null,1));
 if(!watch.length)console.log('Nessuna strategia robusta trovata: nessun segnale.');
})();
