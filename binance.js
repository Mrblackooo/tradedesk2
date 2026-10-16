const BN='https://data-api.binance.vision/api/v3/klines';
async function klines(sym,tf,limit=500,pages=1){
 let end=Date.now(),all=[];
 for(let p=0;p<pages;p++){
  const r=await fetch(`${BN}?symbol=${sym}&interval=${tf}&limit=${Math.min(limit,1000)}&endTime=${end}`);
  if(!r.ok)throw new Error('Binance '+r.status+' per '+sym);
  const a=await r.json();if(!a.length)break;all=a.concat(all);end=+a[0][0]-1;
 }
 return all.map(k=>({t:+k[0],o:+k[1],h:+k[2],l:+k[3],c:+k[4],v:+k[5],ct:+k[6]}));
}
module.exports={klines};
