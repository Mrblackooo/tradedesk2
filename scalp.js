// Scansione scalping (1m e 5m): stessa logica del resto del desk, ma con soglie molto più severe e un controllo sui costi.
const fs=require('fs'),path=require('path');
const E=require('./engine'),{klines}=require('./binance');
let cfg={};try{cfg=JSON.parse(fs.readFileSync(path.join(__dirname,'config.json'),'utf8'))}catch(e){}
const S=Object.assign({symbols:['BTCUSDT','ETHUSDT','SOLUSDT','XRPUSDT'],tfs:['5m','15m','30m'],feePct:0.05,maxActive:3,pages:60},cfg.scalp||{});
const fee=S.feePct/100,SLT=[[0.8,1.2],[1,1.5],[1,2],[1.5,2],[1.5,3]];
function ev(D,st,a,b,ks,kt,sp,p0,atrPct){
 const n=D.length,t=D.map(x=>x.t),sm=E.sim(D,p0,fee,1,ks,kt),r=sm.r,pos=sm.ep;
 const A=E.stats(r,t,1,sp),B=E.stats(r,t,sp,n),T0=E.tstat(E.trades(r,pos,1,sp)),T1=E.tstat(E.trades(r,pos,sp,n));
 const q=Math.floor(n/3),F=[E.stats(r,t,1,q),E.stats(r,t,q,2*q),E.stats(r,t,2*q,n)].map(z=>z.ret);
 const costR=2*fee/(ks*atrPct);   // costo di andata e ritorno in multipli del rischio (1R = distanza dello stop)
 const f={costi:costR<=0.25,test:B.ret>0&&B.sharpe>0&&T1.avg>0,train:A.sharpe>0&&T0.avg>0,trade:T0.n>=100&&T1.n>=50,stab:F.filter(v=>v>0).length>=2,signif:T1.t>2.5};
 const bad=Object.keys(f).filter(k=>!f[k]);
 return{st,a,b,ks,kt,A,B,T0,T1,costR,bad,ok:!bad.length,score:Math.min(A.sharpe,B.sharpe)};
}
(async()=>{
 const report=[],cands=[];let fetched=0;
 for(const sym of S.symbols)for(const tf of S.tfs){
  try{
   const D=await klines(sym,tf,1000,S.pages);if(D.length<3000){console.log(sym,tf,'storico insufficiente');continue}
   fetched++;const sp=Math.floor(D.length*.7),atr=E.atrA(D,14),v=[];
   for(let i=0;i<D.length;i++)if(!isNaN(atr[i]))v.push(atr[i]/D[i].c);
   v.sort((x,y)=>x-y);const atrPct=v[v.length>>1]||1e-9,res=[];
   for(const [st,a,b] of E.SCALP_GRID()){const p0=E.positions(D,st,a,b,false);
    for(const [ks,kt] of SLT){const x=ev(D,st,a,b,ks,kt,sp,p0,atrPct);if(x.T0.n>=20)res.push(x)}}
   res.sort((x,y)=>x.bad.length-y.bad.length||y.score-x.score);
   const best=res[0];if(!best)continue;
   const row=x=>({st:x.st,a:x.a,b:x.b,ks:x.ks,kt:x.kt,wr:+(x.T1.wr||0).toFixed(3),n:x.T1.n,t:+(x.T1.t||0).toFixed(2),costR:+x.costR.toFixed(3)});
   report.push({sym,tf,candles:D.length,atrPct:+(atrPct*100).toFixed(3),best:row(best),ok:best.ok,why:best.bad});
   if(best.ok)cands.push({sym,tf,st:best.st,a:best.a,b:best.b,ks:best.ks,kt:best.kt,lo:false,score:best.score,bt:row(best)});
   console.log(sym,tf,best.ok?'PASSA':'non passa ('+best.bad.join(', ')+')','costi/rischio',best.costR.toFixed(2));
  }catch(e){console.log(sym,tf,'errore',e.message)}
 }
 if(!fetched){console.log('nessun dato scaricato: file invariato');return}
 cands.sort((x,y)=>y.score-x.score);
 const seen=new Set(),strategies=[];
 for(const c of cands){if(seen.has(c.sym)||strategies.length>=S.maxActive)continue;seen.add(c.sym);delete c.score;strategies.push(c)}
 fs.mkdirSync(path.join(__dirname,'data'),{recursive:true});
 fs.writeFileSync(path.join(__dirname,'data','scalp.json'),JSON.stringify({updated:Date.now(),feePct:S.feePct,strategies,report},null,1));
 console.log(strategies.length?'Strategie scalping: '+strategies.map(s=>s.sym+' '+s.tf+' '+s.st).join(' | '):'Nessuna strategia scalping supera i controlli.');
})();
