// Cesto di asset: la stessa strategia testata su molti asset insieme. Più trade al giorno senza inseguire la velocità,
// e una prova statistica più forte, perché l'edge deve valere su tanti mercati e non su uno solo.
const fs=require('fs'),path=require('path');
const E=require('./engine'),{klines}=require('./binance');
const CF=path.join(__dirname,'config.json'),cfg=JSON.parse(fs.readFileSync(CF,'utf8'));
const B=Object.assign({symbols:['BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT','DOGEUSDT','ADAUSDT','TRXUSDT','AVAXUSDT','LINKUSDT','DOTUSDT','LTCUSDT','BCHUSDT','ATOMUSDT','UNIUSDT','NEARUSDT','AAVEUSDT','ETCUSDT','XLMUSDT','FILUSDT'],
 tfs:['15m','30m','1h'],pages:{'15m':40,'30m':20,'1h':6},risk:0.25,maxEntries:30},cfg.basketCfg||{});
const fee=cfg.feePct/100,SLT=[[1,1.5],[1,2],[1.5,2],[1.5,3],[2,3],[2,4],[3,4.5]],TFMS={'15m':9e5,'30m':18e5,'1h':36e5,'4h':144e5};
const NM={sma:'Incrocio SMA',rsi:'RSI',brk:'Breakout',macd:'MACD',bb:'Bollinger',mom:'Momentum',rsitrend:'RSI nel trend',smaR:'SMA con filtro trend',brkR:'Breakout con filtro trend',macdR:'MACD con filtro trend',momR:'Momentum con filtro trend',tod:'Stagionalità oraria',conf:'Confluenza'};
const WHY={train:'non significativa nel periodo di scelta',test:'non significativa nel test',trades:'pochi trade nel test',breadth:'funziona solo su pochi asset'};
(async()=>{
 const entries=[],report=[],sets=[];
 for(const tf of B.tfs){
  const S=[];
  for(const sym of B.symbols){try{
   const D=await klines(sym,tf,1000,B.pages[tf]||6);if(D.length<3000)continue;
   S.push({sym,D,sp:Math.floor(D.length*.7),days:D.length*TFMS[tf]/864e5});
  }catch(e){console.log(sym,tf,'errore',e.message)}}
  if(S.length<8){console.log(tf,'asset insufficienti:',S.length);continue}
  console.log(tf,'asset caricati:',S.length);
  let best=null;
  for(const [st,a,b] of E.GRID()){
   if(st=='tod'&&TFMS[tf]<36e5)continue;   // la stagionalità serve molto storico: solo da 1h in su
   const P=S.map(s=>E.positions(s.D,st,a,b,false));
   for(const [ks,kt] of SLT){
    const T0=[],T1=[],per=[];let p0=0,p1=0,freq=0;
    S.forEach((s,i)=>{
     const sm=E.sim(s.D,P[i],fee,1,ks,kt),n=s.D.length,t=s.D.map(x=>x.t);
     const a0=E.trades(sm.r,sm.ep,1,s.sp),a1=E.trades(sm.r,sm.ep,s.sp,n);
     const r0=E.stats(sm.r,t,1,s.sp).ret,r1=E.stats(sm.r,t,s.sp,n).ret;
     a0.forEach(v=>T0.push(v));a1.forEach(v=>T1.push(v));
     if(r0>0)p0++;if(r1>0)p1++;
     per.push({sym:s.sym,ok:r0>0&&r1>0,wr:E.tstat(a1).wr,n:a1.length,t:E.tstat(a1).t,freq:(a0.length+a1.length)/s.days});
    });
    const q0=E.tstat(T0),q1=E.tstat(T1),N=S.length;
    const f={train:q0.t>2,test:q1.t>2.5&&q1.avg>0,trades:q1.n>=150,breadth:p0/N>=.6&&p1/N>=.6};
    const bad=Object.keys(f).filter(k=>!f[k]),c={tf,st,a,b,ks,kt,q0,q1,bad,breadth:[p0/N,p1/N],per,score:q1.t};
    if(!best||bad.length<best.bad.length||(bad.length==best.bad.length&&c.score>best.score))best=c;
   }
  }
  if(!best)continue;
  const inc=best.per.filter(x=>x.ok),perDay=+inc.reduce((s,x)=>s+x.freq,0).toFixed(2);
  report.push({tf,label:(best.st=='conf'?`Confluenza ${best.a} su 4${best.b?', intraday':''} SL${best.ks}/TP${best.kt} ATR`:`${NM[best.st]} ${best.a}${best.b?'/'+best.b:''} SL${best.ks}/TP${best.kt} ATR`),t:+best.q1.t.toFixed(2),trades:best.q1.n,breadth:best.breadth.map(v=>Math.round(v*100)),ok:!best.bad.length,why:best.bad.map(k=>WHY[k]),perDay:best.bad.length?null:perDay});
  console.log(tf,best.bad.length?'nessun cesto passa ('+best.bad.join(', ')+')':'CESTO OK '+perDay+' trade/giorno su '+inc.length+' asset');
  if(!best.bad.length){
   sets.push({tf,label:report[report.length-1].label,perDay});
   for(const x of inc){if(entries.length>=B.maxEntries)break;
    entries.push({sym:x.sym,tf,st:best.st,a:best.a,b:best.b,ks:best.ks,kt:best.kt,lo:false,active:true,grp:'basket',risk:B.risk,adopted:new Date().toISOString(),
     bt:{wrTest:+(x.wr||0).toFixed(3),t:+(x.t||0).toFixed(2),n:x.n,sharpeTest:0}})}
  }
 }
 if(!report.length){console.log('nessun dato: configurazione invariata');return}
 cfg.watch=cfg.watch.filter(w=>!w.grp).concat(entries);
 cfg.basket={updated:Date.now(),entries:entries.length,perDay:+sets.reduce((s,x)=>s+x.perDay,0).toFixed(2),label:sets.map(x=>x.label+' su '+x.tf).join(' + '),risk:B.risk,report};
 fs.writeFileSync(CF,JSON.stringify(cfg,null,1));
 console.log(entries.length?`Cesto attivo: ${entries.length} asset, circa ${cfg.basket.perDay} trade/giorno`:'Nessun cesto supera i controlli.');
})();
