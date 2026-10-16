// Notizie da RSS pubblici (niente scraping HTML) + calendario macro. Le news sono un filtro, non un segnale.
const FEEDS=['https://www.coindesk.com/arc/outboundfeeds/rss/','https://cointelegraph.com/rss'];
const KEY={BTC:['bitcoin','btc'],ETH:['ethereum','ether','eth'],XRP:['xrp','ripple'],SOL:['solana','sol']};
const POS=['surge','rally','approval','approved','adopt','record','bullish','inflow','gains','soar','upgrade'];
const NEG=['crash','hack','ban','lawsuit','plunge','bearish','outflow','fraud','exploit','sell-off','selloff','probe','dump','liquidat'];
async function headlines(){
 const out=[];
 for(const u of FEEDS){try{
  const r=await fetch(u,{headers:{'User-Agent':'trading-desk'}});if(!r.ok)continue;const x=await r.text();
  for(const m of x.matchAll(/<item>([\s\S]*?)<\/item>/g)){
   const t=(m[1].match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)||[])[1];
   const d=(m[1].match(/<pubDate>([^<]+)</)||[])[1];
   if(t)out.push({t:t.trim(),ts:Date.parse(d)||0});
  }}catch(e){}}
 return out;
}
function score(sym,H,hours=6){
 const base=sym.replace(/USDT$/,''),kw=KEY[base]||[base.toLowerCase()],lim=Date.now()-hours*36e5;let s=0;const heads=[];
 for(const h of H){
  if(h.ts&&h.ts<lim)continue;const l=h.t.toLowerCase();
  if(!kw.some(k=>new RegExp('\\b'+k+'\\b').test(l)))continue;
  let v=0;POS.forEach(w=>{if(l.includes(w))v++});NEG.forEach(w=>{if(l.includes(w))v--});
  s+=Math.sign(v);heads.push(h.t);
 }
 return{score:s,heads:heads.slice(0,5)};
}
// evento USD ad alto impatto entro 45 minuti (calendario non ufficiale: se non risponde, nessun blocco)
async function blackout(now=Date.now()){
 try{
  const r=await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json');if(!r.ok)return null;
  const ev=await r.json();
  return ev.filter(e=>e.impact==='High'&&e.country==='USD').map(e=>({title:e.title,t:Date.parse(e.date)})).find(e=>Math.abs(e.t-now)<45*6e4)||null;
 }catch(e){return null}
}
module.exports={headlines,score,blackout};
