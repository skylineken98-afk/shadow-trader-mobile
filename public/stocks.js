'use strict';
let stocksBusy=false;
async function refreshStocks(){
 if(stocksBusy||document.hidden)return;stocksBusy=true;
 try{
  const d=await api('/api/stocks'),root=document.querySelector('#stockPlans');root.replaceChildren();
  if(!d.plans.length)root.append(el('p','No qualifying stock plans yet. The worker needs configured stock data access and sufficient momentum/volume.'));
  for(const p of d.plans){const card=el('article',undefined,'entry');const age=Date.now()-Date.parse(p.quote_at);card.append(el('b',p.symbol+' · '+p.state+' · Rule score '+p.score),el('strong','Research ask '+money(p.entry_ask)+' · Last bid '+money(p.last_bid)),el('small','Stop '+money(p.stop)+' · Target '+money(p.target)+' · Risk/share '+money(p.risk_per_share)),el('small',(Number.isFinite(age)&&age>=0&&age<=60000?'Recent quote':'STALE / unknown quote age')+' · '+formatTime(p.quote_at)+' · '+p.feed),el('p',p.reason),el('small','Trailing rule: after +1R observed gain, review exit after 1R giveback from observed peak. Deadline '+formatTime(p.due_at)));if(p.exit_reason)card.append(el('strong','Research exit: '+p.exit_reason));root.append(card);}
  const alerts=document.querySelector('#stockAlerts');alerts.replaceChildren();if(!d.alerts.length)alerts.append(el('p','No stock exit alerts recorded yet.'));
  for(const a of d.alerts){const row=el('article',undefined,'entry');row.append(el('b',a.symbol+' · '+a.reason),el('p','Observed bid '+money(a.price)+' · '+formatTime(a.quote_at)),el('small','Public research alert. Review your own entry and risk; no sale executed.'));alerts.append(row);}
  document.querySelector('#stockStatus').textContent=(d.health?d.health.status+' · '+formatTime(d.health.updated_at)+' · '+d.health.message:'Stock worker has not reported yet.')+' '+d.note;
 }catch(e){document.querySelector('#stockStatus').textContent=e.message+' Previously displayed data may be stale.';}finally{stocksBusy=false;}
}
document.querySelector('#refreshStocks').addEventListener('click',refreshStocks);refreshStocks();setInterval(refreshStocks,30000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshStocks()});
