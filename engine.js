(function(root){
// Motore condiviso: estratto automaticamente da index.html, stessa logica del backtest
function rsi(c,n){const r=Array(c.length).fill(50);let g=0,l=0;
 for(let i=1;i<c.length;i++){const d=c[i]-c[i-1];const u=Math.max(d,0),w=Math.max(-d,0);
  if(i<=n){g+=u/n;l+=w/n}else{g=(g*(n-1)+u)/n;l=(l*(n-1)+w)/n}
  if(i>=n)r[i]=l==0?100:100-100/(1+g/l)}return r}
function sma(c,n){const r=Array(c.length).fill(NaN);let s=0;
 for(let i=0;i<c.length;i++){s+=c[i];if(i>=n)s-=c[i-n];if(i>=n-1)r[i]=s/n}return r}
function positions(d,st,a,b,longOnly){
 if(EXT[st])return EXT[st](d,a,b,longOnly);
 const c=d.map(x=>x.c),n=c.length,pos=Array(n).fill(0);
 if(st=='sma'){const f=sma(c,a),s=sma(c,b);for(let i=0;i<n;i++)if(!isNaN(s[i]))pos[i]=f[i]>s[i]?1:-1}
 else if(st=='rsi'){const r=rsi(c,14);let p=0;for(let i=0;i<n;i++){
  if(r[i]<a)p=1;else if(r[i]>b)p=-1;else if(longOnly&&r[i]>50&&p==1)p=0;pos[i]=p}}
 else{let p=0;for(let i=a;i<n;i++){let hi=-1e18,lo=1e18;
  for(let k=i-a;k<i;k++){hi=Math.max(hi,d[k].h);lo=Math.min(lo,d[k].l)}
  if(c[i]>hi)p=1;else if(c[i]<lo)p=-1;pos[i]=p}}
 if(longOnly)for(let i=0;i<n;i++)if(pos[i]<0)pos[i]=0;
 return pos;
}
function barReturns(d,pos,fee,lev){
 const r=Array(d.length).fill(0);
 for(let i=1;i<d.length;i++){
  const p=pos[i-1],pp=i>1?pos[i-2]:0;
  r[i]=lev*(p*(d[i].c/d[i-1].c-1)-fee*Math.abs(p-pp));
 }
 return r;
}
function atrA(d,n){const r=Array(d.length).fill(NaN);let s=0;
 for(let i=1;i<d.length;i++){const tr=Math.max(d[i].h-d[i].l,Math.abs(d[i].h-d[i-1].c),Math.abs(d[i].l-d[i-1].c));
  if(i<=n){s+=tr;if(i==n)r[i]=s/n}else r[i]=(r[i-1]*(n-1)+tr)/n}return r}
function sim(d,pos,fee,lev,ks,kt){
 const n=d.length;
 if(!(ks>0&&kt>0)){const r=barReturns(d,pos,fee,lev);return{r,ep:pos,st:{cur:pos[n-1],entry:d[n-1].c,sl:null,tp:null}}}
 const atr=atrA(d,14),r=Array(n).fill(0),ep=Array(n).fill(0);
 let cur=0,prev=0,blocked=false,entry=0,sl=0,tp=0;
 for(let i=1;i<=n;i++){
  const s=isNaN(atr[i-1])?0:pos[i-1];let cost=0;
  if(s!==prev){prev=s;blocked=false;
   if(cur!==0){cost+=fee;cur=0}
   if(s!==0){cur=s;entry=d[i-1].c;sl=entry-s*ks*atr[i-1];tp=entry+s*kt*atr[i-1];cost+=fee}}
  ep[i-1]=cur;
  if(i==n)break;
  let px=d[i].c;
  if(cur!==0){
   const hs=cur>0?d[i].l<=sl:d[i].h>=sl,ht=cur>0?d[i].h>=tp:d[i].l<=tp;
   if(hs){px=sl;cur=0;blocked=true;cost+=fee}else if(ht){px=tp;cur=0;blocked=true;cost+=fee}
   r[i]=lev*(ep[i-1]*(px/d[i-1].c-1)-cost);
  }else r[i]=-lev*cost;
 }
 return{r,ep,st:{cur,entry,sl,tp,blocked}};
}
function stats(r,t,from,to){
 let eq=1,pk=1,mdd=0,w=0,gw=0,gl=0,tr=0;const s=[];
 for(let i=from;i<to;i++){eq*=1+r[i];pk=Math.max(pk,eq);mdd=Math.max(mdd,1-eq/pk);s.push(r[i]);
  if(r[i]>0){gw+=r[i];}else if(r[i]<0){gl-=r[i]}}
 const m=s.reduce((x,y)=>x+y,0)/s.length,sd=Math.sqrt(s.reduce((x,y)=>x+(y-m)**2,0)/s.length)||1e-9;
 const dts=[];for(let i=from+1;i<to;i++)dts.push(t[i]-t[i-1]);dts.sort((a,b)=>a-b);
 const py=365*864e5/(dts[dts.length>>1]||864e5);
 return{ret:eq-1,mdd,sharpe:m/sd*Math.sqrt(py),pf:gl?gw/gl:NaN};
}
function trades(r,pos,from,to){
 const T=[];let cur=null;
 for(let i=Math.max(from,1);i<to;i++){
  const p=pos[i-1],pp=i>1?pos[i-2]:0;
  if(p==0){if(cur!==null){T.push(cur*(1+r[i]));cur=null}continue}
  if(cur!==null&&p!=pp){T.push(cur);cur=null}
  cur=(cur===null?1:cur)*(1+r[i]);
 }
 if(cur!==null)T.push(cur);
 return T.map(x=>x-1);
}
function tstat(T){
 const n=T.length;if(n<2)return{n,wr:NaN,lo:NaN,hi:NaN,avg:NaN,t:NaN};
 const p=T.filter(x=>x>0).length/n,z=1.96,den=1+z*z/n,ctr=(p+z*z/(2*n))/den,hw=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/den;
 const m=T.reduce((a,b)=>a+b,0)/n,sd=Math.sqrt(T.reduce((a,b)=>a+(b-m)**2,0)/(n-1))||1e-9;
 return{n,wr:p,lo:ctr-hw,hi:ctr+hw,avg:m,t:m/(sd/Math.sqrt(n))};
}
const regime=(d,p,n=200)=>{const c=d.map(x=>x.c),m=sma(c,n);return p.map((v,i)=>isNaN(m[i])?0:((v>0&&c[i]>m[i])||(v<0&&c[i]<m[i]))?v:0)};
const fixLo=(p,lo)=>lo?p.map(v=>v<0?0:v):p;
function ema(c,n){const k=2/(n+1),r=[c[0]];for(let i=1;i<c.length;i++)r.push(c[i]*k+r[i-1]*(1-k));return r}
// famiglie aggiuntive: ogni funzione restituisce la posizione decisa alla chiusura di ogni barra (1, -1, 0)
// Confluenza per il day trading: 4 voti direzionali da famiglie diverse (trend, momentum, struttura di mercato, flusso/volumi)
// + 1 filtro di volatilità. Parametri standard e fissi: niente ottimizzazione dei periodi, così c'è meno rischio di overfitting.
function confCore(d){
 const n=d.length,c=d.map(x=>x.c),h=d.map(x=>x.h),l=d.map(x=>x.l),v=d.map(x=>x.v||0),e=ema(c,50),r=rsi(c,14),at=atrA(d,14),a5=atrA(d,50);
 const vw=Array(n).fill(c[0]),ob=Array(n).fill(0);let pv=0,vv=0,day=-1;
 for(let i=0;i<n;i++){const dy=Math.floor(d[i].t/864e5);if(dy!==day){day=dy;pv=0;vv=0}
  pv+=(h[i]+l[i]+c[i])/3*v[i];vv+=v[i];vw[i]=vv?pv/vv:c[i];
  ob[i]=(i?ob[i-1]:0)+(i?(c[i]>c[i-1]?v[i]:c[i]<c[i-1]?-v[i]:0):0)}
 const V=Array(n).fill(null);
 for(let i=40;i<n;i++){
  if(isNaN(at[i])||isNaN(a5[i]))continue;
  const hh=Math.max(...h.slice(i-9,i+1)),ph=Math.max(...h.slice(i-19,i-9)),ll=Math.min(...l.slice(i-9,i+1)),pl=Math.min(...l.slice(i-19,i-9));
  V[i]={votes:[
   c[i]>e[i]&&e[i]>e[i-5]?1:c[i]<e[i]&&e[i]<e[i-5]?-1:0,            // trend: prezzo sopra/sotto EMA50 con pendenza concorde
   r[i]>55&&r[i]<75?1:r[i]<45&&r[i]>25?-1:0,                         // momentum: RSI(14) in zona rialzista/ribassista ma non estremo
   hh>ph&&ll>pl?1:hh<ph&&ll<pl?-1:0,                                 // struttura: massimi e minimi crescenti/decrescenti
   c[i]>vw[i]&&ob[i]>ob[i-10]?1:c[i]<vw[i]&&ob[i]<ob[i-10]?-1:0],    // flusso: sopra/sotto VWAP di giornata con volumi (OBV) concordi
   gate:at[i]/a5[i]>=0.9,hr:Math.floor((d[i].t%864e5)/36e5)};         // volatilità: non si opera in mercato "spento"
 }
 return V;
}
function confVotes(d){const x=confCore(d)[d.length-1];return x?{votes:x.votes,gate:x.gate,hr:x.hr}:{votes:[0,0,0,0],gate:false,hr:0}}
const EXT={
 // filtro di regime: si opera solo nella direzione del trend lento (SMA 200)
 smaR:(d,a,b,lo)=>regime(d,positions(d,'sma',a,b,lo)),
 brkR:(d,a,b,lo)=>regime(d,positions(d,'brk',a,b,lo)),
 macdR:(d,a,b,lo)=>regime(d,positions(d,'macd',a,b,lo)),
 momR:(d,a,b,lo)=>regime(d,positions(d,'mom',a,b,lo)),
 // stagionalità oraria "walk-forward": per ogni fascia della giornata usa solo i rendimenti passati (mai quelli futuri)
 tod:(d,a,b,lo)=>{const n=d.length,tf=n>1?d[1].t-d[0].t:36e5,S=Math.max(1,Math.round(864e5/tf)),sum=Array(S).fill(0),sq=Array(S).fill(0),cnt=Array(S).fill(0),p=Array(n).fill(0),z=a/10;
  for(let i=1;i<n;i++){const r=d[i].c/d[i-1].c-1,s=Math.floor((d[i].t%864e5)/tf)%S;sum[s]+=r;sq[s]+=r*r;cnt[s]++;
   const ns=(s+1)%S,m=cnt[ns];
   if(m>=b){const mean=sum[ns]/m,sd=Math.sqrt(Math.max(sq[ns]/m-mean*mean,1e-18)),t=mean/(sd/Math.sqrt(m));p[i]=t>z?1:t<-z?-1:0}}
  return fixLo(p,lo)},
 // a = voti concordi richiesti su 4 (3 o 4); b = 1 → solo intraday (7-21 UTC, piatto fuori sessione)
 conf:(d,a,b,lo)=>{const V=confCore(d),n=d.length,p=Array(n).fill(0);let cur=0;
  for(let i=0;i<n;i++){const x=V[i];if(!x){p[i]=0;continue}
   const sc=x.votes[0]+x.votes[1]+x.votes[2]+x.votes[3],ins=!b||(x.hr>=7&&x.hr<21);
   if(b&&!ins)cur=0;
   else if(cur===0){if(x.gate&&ins){if(sc>=a)cur=1;else if(sc<=-a)cur=-1}}
   else if(cur===1&&sc<=a-2)cur=0;else if(cur===-1&&sc>=-(a-2))cur=0;   // esce quando la convergenza si rompe
   p[i]=cur}
  return fixLo(p,lo)},
 rsi2:(d,a,b,lo)=>{const c=d.map(x=>x.c),r=rsi(c,2),p=Array(c.length).fill(0);let cur=0;
  for(let i=3;i<c.length;i++){if(r[i]<a)cur=1;else if(r[i]>100-a)cur=-1;else if((cur==1&&r[i]>50)||(cur==-1&&r[i]<50))cur=0;p[i]=cur}
  return fixLo(p,lo)},
 macd:(d,a,b,lo)=>{const c=d.map(x=>x.c),f=ema(c,a),s=ema(c,b),m=f.map((v,i)=>v-s[i]),g=ema(m,9);
  return fixLo(c.map((_,i)=>i<b?0:m[i]>g[i]?1:-1),lo)},
 mom:(d,a,b,lo)=>{const c=d.map(x=>x.c),p=Array(c.length).fill(0);
  for(let i=a;i<c.length;i++)p[i]=c[i]>c[i-a]*(1+b/1000)?1:c[i]<c[i-a]*(1-b/1000)?-1:p[i-1];
  return fixLo(p,lo)},
 bb:(d,a,b,lo)=>{const c=d.map(x=>x.c),m=sma(c,a),k=b/10,p=Array(c.length).fill(0);let cur=0;
  for(let i=a;i<c.length;i++){let v=0;for(let j=i-a+1;j<=i;j++)v+=(c[j]-m[i])**2;const sd=Math.sqrt(v/a);
   if(c[i]<m[i]-k*sd)cur=1;else if(c[i]>m[i]+k*sd)cur=-1;else if((cur==1&&c[i]>=m[i])||(cur==-1&&c[i]<=m[i]))cur=0;p[i]=cur}
  return fixLo(p,lo)},
 rsitrend:(d,a,b,lo)=>{const c=d.map(x=>x.c),r=rsi(c,14),m=sma(c,b),p=Array(c.length).fill(0);let cur=0;
  for(let i=b;i<c.length;i++){
   if(c[i]>m[i]&&r[i]<a)cur=1;else if(c[i]<m[i]&&r[i]>100-a)cur=-1;
   else if((cur==1&&(r[i]>55||c[i]<m[i]))||(cur==-1&&(r[i]<45||c[i]>m[i])))cur=0;
   p[i]=cur}
  return fixLo(p,lo)}
};
const GRID=()=>{const g=[];
 [5,8,10,15,20,30].forEach(a=>[30,50,80,100,150,200].forEach(b=>{if(a<b)g.push(['sma',a,b])}));
 [20,25,30,35].forEach(a=>[65,70,75,80].forEach(b=>g.push(['rsi',a,b])));
 [10,20,30,50,80,100,150].forEach(a=>g.push(['brk',a,0]));
 [[8,21],[12,26],[5,35],[10,40]].forEach(([a,b])=>g.push(['macd',a,b]));
 [14,20,30].forEach(a=>[15,20,25].forEach(b=>g.push(['bb',a,b])));
 [10,20,40,80].forEach(a=>[0,10].forEach(b=>g.push(['mom',a,b])));
 [30,35,40].forEach(a=>[100,200].forEach(b=>g.push(['rsitrend',a,b])));
 [[10,30],[20,50],[20,80],[8,80]].forEach(([a,b])=>g.push(['smaR',a,b]));
 [20,50,100].forEach(a=>g.push(['brkR',a,0]));
 g.push(['macdR',12,26],['momR',20,10],['momR',40,10]);
 [20,25,30].forEach(a=>[60,120].forEach(b=>g.push(['tod',a,b])));
 [3,4].forEach(a=>[0,1].forEach(b=>g.push(['conf',a,b])));
 return g};


// griglia per lo scalping (1m/5m): finestre più corte, SL/TP stretti
const SCALP_GRID=()=>{const g=[];
 [3,5,8,13,21].forEach(a=>[21,34,55,89].forEach(b=>{if(a<b)g.push(['sma',a,b])}));
 [15,20,25,30].forEach(a=>[70,75,80,85].forEach(b=>g.push(['rsi',a,b])));
 [5,10,20,30,50].forEach(a=>g.push(['brk',a,0]));
 [[3,10],[5,13],[8,21],[12,26]].forEach(([a,b])=>g.push(['macd',a,b]));
 [10,14,20].forEach(a=>[20,25,30].forEach(b=>g.push(['bb',a,b])));
 [5,10,20,40].forEach(a=>[0,5].forEach(b=>g.push(['mom',a,b])));
 [30,35,40].forEach(a=>[50,100].forEach(b=>g.push(['rsitrend',a,b])));
 [3,5,10,15].forEach(a=>g.push(['rsi2',a,0]));
 return g};
const API={rsi,sma,positions,barReturns,atrA,sim,stats,trades,tstat,GRID,SCALP_GRID,confVotes};
if(typeof module!=='undefined'&&module.exports)module.exports=API;else root.Engine=API;
})(typeof window!=="undefined"?window:globalThis);
