// Modello linguistico locale (FinBERT, ~100 MB) eseguito dentro GitHub Actions: nessuna API key, nessun costo.
// Valuta il sentiment dei titoli e misura il rischio per il segnale tecnico. Non genera segnali.
const fs=require('fs'),path=require('path');
const FILE=path.join(__dirname,'data','sentiment.json');
let pipe=null;
async function load(){
 if(pipe)return pipe;
 const {pipeline,env}=await import('@huggingface/transformers');
 env.cacheDir=path.join(__dirname,'.model-cache');
 try{pipe=await pipeline('text-classification','Xenova/finbert',{dtype:'q8'})}
 catch(e){pipe=await pipeline('text-classification','Xenova/finbert')}
 return pipe;
}
async function scoreText(t){
 const o=await (await load())(t,{top_k:null}),a=Array.isArray(o[0])?o[0]:o;
 const g=l=>(a.find(x=>String(x.label).toLowerCase()==l)||{score:0}).score;
 return +(g('positive')-g('negative')).toFixed(3);   // da -1 (molto negativo) a +1 (molto positivo)
}
async function analyse(items){
 if(!items.length)return null;
 let cache={};try{cache=JSON.parse(fs.readFileSync(FILE,'utf8'))}catch(e){}
 const heads=[...new Set(items.flatMap(i=>i.heads))];
 // il modello viene caricato solo se ci sono titoli nuovi
 for(const h of heads)if(cache[h]===undefined)cache[h]=await scoreText(h);
 const keys=Object.keys(cache);if(keys.length>400)keys.slice(0,keys.length-400).forEach(k=>delete cache[k]);
 fs.writeFileSync(FILE,JSON.stringify(cache));
 const assets={},parts=[];
 for(const it of items){
  if(!it.heads.length)continue;
  const tot=+it.heads.reduce((s,h)=>s+cache[h],0).toFixed(2),dirn=it.dir=='LONG'?1:it.dir=='SHORT'?-1:0,against=-tot*dirn;
  const risk=against>=1?'high':against>=.5?'medium':'low';
  assets[it.sym]={score:tot,risk,note:`sentiment ${tot>0?'+':''}${tot} su ${it.heads.length} titoli`};
  parts.push(`${it.sym.replace('USDT','')}: ${tot>=.5?'positivo':tot<=-.5?'negativo':'neutro'} (${tot>0?'+':''}${tot})`);
 }
 return{briefing:parts.length?'Sentiment delle ultime 6 ore (modello FinBERT) – '+parts.join('; ')+'.':null,assets};
}
module.exports={analyse,_setPipe:p=>{pipe=p}};
