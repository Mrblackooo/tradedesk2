// Fonte dati unica: Binance per le crypto (USDT), Yahoo Finance per forex, oro e petrolio. Nessuna API key.
// Yahoo è una fonte non ufficiale: può rispondere con errori o limiti; in quel caso l'asset viene saltato e il resto continua.
const bn=require('./binance');
const YH='https://query1.finance.yahoo.com/v8/finance/chart/';
const TFMS={'5m':3e5,'15m':9e5,'30m':18e5,'1h':36e5,'4h':144e5,'1d':864e5};
const RANGE={'5m':'60d','15m':'60d','30m':'60d','1h':'730d','1d':'10y'};   // limiti di storico intraday di Yahoo
const COMM=['GC=F','CL=F','SI=F'];
const isCrypto=s=>/USDT$/.test(s);
// costo per lato in %: forex e materie prime costano molto meno delle crypto (modificabili in config.json: feeFxPct, feeCommPct)
const feeFor=(cfg,sym)=>isCrypto(sym)?cfg.feePct:COMM.includes(sym)?(cfg.feeCommPct||0.03):(cfg.feeFxPct||0.012);
const memo=new Map();
async function yahoo(sym,tf){
 const base=tf=='4h'?'1h':tf;if(!RANGE[base])throw new Error('timeframe '+tf+' non supportato per '+sym);
 const k=sym+base;let rows=memo.get(k);
 if(!rows){
  let r;
  for(let i=0;i<3;i++){   // Yahoo a volte risponde 429: qualche tentativo con pausa crescente
   r=await fetch(`${YH}${encodeURIComponent(sym)}?interval=${base}&range=${RANGE[base]}&includePrePost=false`,{headers:{'User-Agent':'Mozilla/5.0 (compatible; trading-desk)','Accept':'application/json'}});
   if(r.ok)break;await new Promise(z=>setTimeout(z,1500*(i+1)));
  }
  if(!r.ok)throw new Error('Yahoo '+r.status+' per '+sym);
  const j=await r.json(),res=j.chart&&j.chart.result&&j.chart.result[0];
  if(!res||!res.timestamp)throw new Error('Yahoo: nessun dato per '+sym);
  const q=res.indicators.quote[0],ms=TFMS[base];rows=[];
  res.timestamp.forEach((t,i)=>{
   if([q.open[i],q.high[i],q.low[i],q.close[i]].some(v=>v==null))return;
   rows.push({t:t*1000,o:q.open[i],h:q.high[i],l:q.low[i],c:q.close[i],v:(q.volume&&q.volume[i])||0,ct:t*1000+ms-1});
  });
  memo.set(k,rows);
 }
 if(tf!=='4h')return rows;
 const out=[];let cur=null;   // 4h: Yahoo non lo offre, si aggrega da candele 1h
 for(const c of rows){const b=Math.floor(c.t/144e5)*144e5;
  if(!cur||cur.t!==b){if(cur)out.push(cur);cur={t:b,o:c.o,h:c.h,l:c.l,c:c.c,v:c.v,ct:b+144e5-1}}
  else{cur.h=Math.max(cur.h,c.h);cur.l=Math.min(cur.l,c.l);cur.c=c.c;cur.v+=c.v}}
 if(cur)out.push(cur);
 return out;
}
const klines=(sym,tf,limit,pages)=>isCrypto(sym)?bn.klines(sym,tf,limit,pages):yahoo(sym,tf);
module.exports={klines,feeFor,isCrypto};
