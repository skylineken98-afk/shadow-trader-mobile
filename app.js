"use strict";
const k={watch:"st_watch_v1",paper:"st_paper_v1",notes:"st_notes_v1"};
function load(type){try{const x=JSON.parse(localStorage.getItem(k[type])||"[]");return Array.isArray(x)?x:[]}catch{return []}}
function save(type,x){localStorage.setItem(k[type],JSON.stringify(x))}
function el(tag,content,klass){let n=document.createElement(tag);if(content!==undefined)n.textContent=String(content);if(klass)n.className=klass;return n}
function money(x){return (Number(x)||0).toLocaleString("en-US",{style:"currency",currency:"USD"})}
function show(name){if(document.querySelector('#appShell').hidden)return;document.querySelectorAll('.page').forEach(e=>e.classList.toggle('active',e.id===name));document.querySelectorAll('nav button').forEach(e=>e.classList.toggle('selected',e.dataset.go===name));window.scrollTo({top:0,behavior:'instant'})}
window.show=show;document.querySelectorAll('nav button').forEach(b=>b.addEventListener('click',()=>show(b.dataset.go)));
function renderWatch(){let root=document.querySelector('#watchItems');root.replaceChildren();let a=load('watch');if(!a.length){root.append(el('div','No symbols saved. Add one above.','empty'));return}a.forEach((v,i)=>{let d=el('div',undefined,'row');d.append(el('b',v));let b=el('button','Remove');b.addEventListener('click',()=>{a.splice(i,1);save('watch',a);renderWatch()});d.append(b);root.append(d)})}
document.querySelector('#watchForm').addEventListener('submit',e=>{e.preventDefault();let n=document.querySelector('#watchInput');let v=n.value.toUpperCase().trim().replace(/[^A-Z0-9.\-]/g,'').slice(0,20);if(v){let a=load('watch');if(!a.includes(v))a.push(v);save('watch',a);renderWatch()}n.value='' });
function renderPaper(){let a=load('paper'),root=document.querySelector('#paperItems');root.replaceChildren();let p=a.reduce((s,t)=>s+t.pl,0);document.querySelector('#tradeCount').textContent=a.length;let indicator=document.querySelector('#paperPL');indicator.textContent=money(p);indicator.className=p>=0?'good':'bad';if(!a.length){root.append(el('div','No simulated trades recorded.','empty'));return}a.slice().reverse().forEach(t=>{let d=el('div',undefined,'entry');d.append(el('b',t.symbol+' · '+t.asset+' · '+t.side));d.append(el('small',`Entry ${t.entry} → Exit ${t.exit} | Qty ${t.qty} × ${t.multi} | ${t.date}`));d.append(el('strong','Simulated P/L: '+money(t.pl),t.pl>=0?'good':'bad'));root.append(d)})}
document.querySelector('#paperForm').addEventListener('submit',e=>{e.preventDefault();let symbol=document.querySelector('#symbol').value.trim().toUpperCase(),asset=document.querySelector('#asset').value,side=document.querySelector('#side').value;let entry=Number(document.querySelector('#entry').value),exit=Number(document.querySelector('#exit').value),qty=Number(document.querySelector('#qty').value),multi=Number(document.querySelector('#multi').value);if(!symbol||![entry,exit,qty,multi].every(x=>Number.isFinite(x)&&x>0))return;let pl=(exit-entry)*qty*multi*(side==='Long'?1:-1),a=load('paper');a.push({symbol,asset,side,entry,exit,qty,multi,pl,date:new Date().toISOString()});save('paper',a);renderPaper();e.target.reset();document.querySelector('#multi').value=100});
document.querySelector('#asset').addEventListener('change',e=>document.querySelector('#multi').value=e.target.value==='Options'?'100':'1');
document.querySelector('#exportPaper').addEventListener('click',()=>{let text=JSON.stringify({disclaimer:'Simulated trades; not verified fills',trades:load('paper')},null,2),blob=new Blob([text],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='shadow-trader-paper-journal.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});
function renderNotes(){let root=document.querySelector('#notesList'),a=load('notes');root.replaceChildren();if(!a.length){root.append(el('div','No research notes saved.','empty'));return}a.slice().reverse().forEach(x=>{let d=el('div',undefined,'entry');d.append(el('b',x.topic));d.append(el('p',x.note));d.append(el('small',x.date));root.append(d)})}
document.querySelector('#noteForm').addEventListener('submit',e=>{e.preventDefault();let topic=document.querySelector('#noteTopic').value.trim(),note=document.querySelector('#noteText').value.trim();if(!topic||!note)return;let a=load('notes');a.push({topic,note,date:new Date().toISOString()});save('notes',a);renderNotes();e.target.reset()});
document.querySelector('#wipe').addEventListener('click',()=>{if(confirm('Permanently clear locally saved paper trades, watchlist and research notes on this device?')){Object.values(k).forEach(x=>localStorage.removeItem(x));renderPaper();renderWatch();renderNotes()}});
let busy=false, imported=false;
function formatTime(value){const t=Date.parse(value);return Number.isFinite(t)?new Date(t).toLocaleString():'Unknown';}
function renderSignals(rows,mode){
 const root=document.querySelector('#signalList');root.replaceChildren();
 if(!rows.length){root.append(el('p','Connected, but no saved results in the last 24 hours.','empty'));return;}
 rows.forEach(s=>{const d=el('article',undefined,'entry');const t=Date.parse(s.created_at??s.timestamp);const age=Date.now()-t;
 const freshness=!Number.isFinite(t)?'Unknown saved time':age<0?'Future timestamp — verify clock':age>90*60000?'STALE saved result':'Recent saved result';
 d.append(el('b',String(s.contract??s.symbol??s.ticker??'Unknown')));
 d.append(el('strong',String(s.status??'IMPORTED')+' · '+String(s.side??s.direction??'Unclassified')));
 d.append(el('small',freshness+' · Saved: '+formatTime(s.created_at??s.timestamp)));
 if(String(s.status).toUpperCase()==='SETUP') for(const [key,label] of [['entry','Entry'],['stop','Stop'],['target','Target']]) if(s[key]!=null&&Number.isFinite(Number(s[key])))d.append(el('small',label+': '+money(s[key])));
 d.append(el('small','Source: '+String(s.source??mode)+' · Quote time not verified'));
 root.append(d);
 });
}
async function refreshSignals(){
 if(busy||document.hidden)return;busy=true;const button=document.querySelector('#refreshSignals');button.disabled=true;
 try{const r=await fetch('/api/signals',{cache:'no-store',signal:AbortSignal.timeout(15000)});const type=r.headers.get('content-type')||'';
 if(!type.includes('application/json'))throw Error('Signal API is missing. Deploy the included Worker, not just the public folder.');
 const data=await r.json();if(!r.ok)throw Error(data.error||'Signal service unavailable');if(!Array.isArray(data.signals))throw Error('Unexpected response from signal service');
 imported=false;renderSignals(data.signals,'Railway scanner');
 document.querySelector('#backendStatus').textContent='Connected';document.querySelector('#feedStatus').textContent='Connected';document.querySelector('#signalStatus').textContent='Saved research';
 document.querySelector('#connectionBanner').textContent='Saved scanner results connected. These are research checks, not verified live quotes.';
 document.querySelector('#syncStatus').textContent='Last fetched: '+new Date().toLocaleTimeString()+'. Latest saved: '+(data.signals[0]?formatTime(data.signals[0].created_at):'none')+'.';
 }catch(e){document.querySelector('#backendStatus').textContent='Unavailable';document.querySelector('#feedStatus').textContent='Unavailable';document.querySelector('#signalStatus').textContent=imported?'Imported / offline':'Offline';document.querySelector('#connectionBanner').textContent='Signal feed unavailable. Previously displayed results may be stale.';document.querySelector('#syncStatus').textContent=e.message+' Previously displayed results are not refreshed.';}
 finally{busy=false;button.disabled=false;}
}
document.querySelector('#refreshSignals').addEventListener('click',refreshSignals);
document.querySelector('#signalFile').addEventListener('change',async e=>{if(!e.target.files[0])return;try{const v=JSON.parse(await e.target.files[0].text());const rows=Array.isArray(v)?v:v.signals??v.results;if(!Array.isArray(rows))throw Error();imported=true;renderSignals(rows.filter(x=>x&&typeof x==='object').slice(0,100),'Imported / unverified');document.querySelector('#signalStatus').textContent='Imported / unverified';document.querySelector('#syncStatus').textContent='Manual import. Next automatic refresh will replace these results.';}catch{document.querySelector('#syncStatus').textContent='Could not parse signal JSON.';}});
renderWatch();renderPaper();renderNotes();refreshSignals();setInterval(refreshSignals,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshSignals()});
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
let optionBusy=false,brainBusy=false;
async function api(path){const r=await fetch(path,{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!(r.headers.get('content-type')||'').includes('application/json'))throw Error('Deploy the included Cloudflare Worker to enable the API.');const d=await r.json();if(!r.ok)throw Error(d.error||'Service unavailable');return d;}
function signalCard(s,rank){
 const card=el('article',undefined,'signalCard');
 const valid=x=>x!==null&&x!==undefined&&Number.isFinite(Number(x));
 const entry=valid(s.entry_ask)?Number(s.entry_ask):null;
 const marked=valid(s.last_bid)&&s.last_quote_at;
 const price=marked?Number(s.last_bid):entry;
 const qt=marked?s.last_quote_at:s.quote_at,age=Date.now()-Date.parse(qt);
 const fresh=Number.isFinite(age)&&age>=0&&age<=300000;
 const ret=marked&&entry>0?(price-entry)/entry:null;
 const heading=el('div',undefined,'signalHeading');
 heading.append(el('b',(rank?'#'+rank+' · ':'')+s.underlying+' $'+s.strike+' '+s.option_type),el('span',s.expiration,'signalExpiry'));card.append(heading);
 card.append(el('small',s.contract,'signalContract'));
 const line=el('div',undefined,'signalPriceLine');
 line.append(el('strong',money(price),'signalPrice'+(ret===null?'':ret>=0?' good':' bad')));
 line.append(el('span',ret===null?'Recorded ask':(ret>=0?'▲ +':'▼ ')+(ret*100).toFixed(1)+'% vs entry',ret===null?'signalChange':ret>=0?'signalChange good':'signalChange bad'));card.append(line);
 card.append(el('small',(marked?'Observed bid':'Entry ask')+' · '+(fresh?'Recent':'STALE / unknown age')+' · '+formatTime(qt),'signalQuote'));
 const tags=el('div',undefined,'signalTags');tags.append(el('span',s.feed==='indicative'?'INDICATIVE · verify broker':String(s.feed||'Unknown feed'),'signalBadge'),el('span',String(s.context_label||'STRUCTURAL_ONLY').replaceAll('_',' '),'signalBadge'));card.append(tags);
 const grid=el('div',undefined,'signalMetrics');
 const metric=(label,value)=>{const box=el('div');box.append(el('small',label),el('b',value));grid.append(box);};
 metric(marked?'Observed bid':'Entry bid',money(marked?s.last_bid:s.entry_bid));metric('Recorded ask',money(entry));
 metric('1 contract + fees',entry===null?'Unavailable':money(entry*100+Number(s.fee_estimate||0)));metric('Rank score',valid(s.score)?Number(s.score).toFixed(1)+'/100':'Unavailable');
 const activity=s.risk_snapshot?.ranking_evidence?.activity;
 metric('Contract volume',valid(activity?.contract_volume)?Number(activity.contract_volume).toLocaleString():'Unavailable');metric('Open interest',valid(activity?.open_interest)?Number(activity.open_interest).toLocaleString():'Unavailable');card.append(grid);
 const probability=el('div',undefined,'signalProbability');probability.append(el('small','Win probability'),el('b','Not calibrated'));card.append(probability);
 const levels=el('div',undefined,'signalLevels');
 for(const [label,multiple,cls] of [['T1 +30%',1.3,'good'],['T2 +50%',1.5,'good'],['T3 +100%',2,'good'],['Stop −30%',.7,'bad']]){const box=el('div');box.append(el('small',label),el('b',entry===null?'—':money(entry*multiple),cls));levels.append(box);}card.append(levels);
 card.append(el('small','Premium review levels from recorded ask; not forecasts or automatic orders. Stop fills can differ.','signalFootnote'));
 const details=el('details',undefined,'signalDetails');details.append(el('summary','Research details & risk'));
 details.append(el('p','Score ranks research quality; it is not a win probability. No calibrated probability is available. Targets and stop refer to option premium per share, not the underlying price.'));
 if(s.feed==='indicative')details.append(el('p','Indicative quotes are modified and are not executable OPRA prices. Confirm current bid/ask with your broker.'));
 if(s.quality_label==='WATCHLIST')details.append(el('p','WATCHLIST: relaxed spread or delta quality; not a confirmed entry.'));
 if(valid(s.estimated_pl))details.append(el('p','Estimated P/L '+money(s.estimated_pl)+' including configured fees; no verified fill.'));
 if(activity)details.append(el('p','Volume as of '+formatTime(activity.volume_as_of)+' · OI date '+(activity.open_interest_date||'Unknown')+'. Activity does not establish institutional buying.'));
 details.append(el('p','Target +50% observed: '+(s.target_seen?'Yes':'No')+' · Stop −30% observed: '+(s.stop_seen?'Yes':'No')+' · Model '+(s.model_version||'Unknown')));card.append(details);return card;
}
async function refreshOptions(){
 if(optionBusy||document.hidden)return;optionBusy=true;
 const category=document.querySelector('#optionCategory').value,budget=document.querySelector('#optionBudget').value;
 const root=document.querySelector('#optionsList'),status=document.querySelector('#optionsStatus');
 try{const data=await api('/api/options?category='+encodeURIComponent(category)+'&budget='+budget);
 if(category!==document.querySelector('#optionCategory').value||budget!==document.querySelector('#optionBudget').value)return;
 root.replaceChildren();if(!data.signals.length)root.append(el('p','No fresh, open qualifying records for this category and budget. The scanner does not invent contracts when quotes are missing.','empty'));
 for(const [i,s] of data.signals.entries())root.append(signalCard(s,i+1));
 const history=document.querySelector('#optionHistory');history.replaceChildren();
 for(const s of data.history??[]){const item=el('article',undefined,'entry');item.append(el('b',s.contract+' · '+s.state));item.append(el('small','Entry recorded '+formatTime(s.created_at)+' · Last bid '+formatTime(s.last_quote_at)));if(s.estimated_pl!==null)item.append(el('strong','Estimated '+money(s.estimated_pl)+' · Observed peak '+(s.max_return*100).toFixed(1)+'% · Giveback '+((s.max_return-s.estimated_return)*100).toFixed(1)+' percentage points',s.estimated_pl>=0?'good':'bad'));else item.append(el('small','No valid later bid recorded.'));history.append(item);}
 status.textContent='Fetched '+new Date().toLocaleTimeString()+'. Research estimates only; not broker fills. History is limited to 20 latest contract records for this selection.';
 }catch(e){status.textContent=e.message+' Previous cards, if any, are not refreshed.';}finally{optionBusy=false;}
}
async function refreshBrain(){if(brainBusy||document.hidden)return;brainBusy=true;try{const data=await api('/api/brain');const a=data.active_model,last=data.latest_evaluation,h=data.health;
 document.querySelector('#brainStatus').textContent='Active ranking: '+a.version+' · '+a.state+' · '+a.sample_count+' outcome samples at promotion. '+(last?'Latest evaluation: '+last.state+' ('+last.sample_count+' samples). ':'Waiting for enough eligible completed outcomes. ')+(h?'Worker '+h.status+' at '+formatTime(h.updated_at)+': '+h.message:'Options worker has not reported status.');
 document.querySelector('#brainHomeStatus').textContent=a.state==='PROMOTED'?'Adaptive weights active':'Collecting outcomes';
 }catch(e){document.querySelector('#brainStatus').textContent=e.message;document.querySelector('#brainHomeStatus').textContent='Unavailable';}finally{brainBusy=false;}}
document.querySelector('#refreshOptions').addEventListener('click',refreshOptions);document.querySelector('#refreshBrain').addEventListener('click',refreshBrain);
for(const id of ['optionCategory','optionBudget'])document.querySelector('#'+id).addEventListener('change',()=>{document.querySelector('#optionsList').replaceChildren();refreshOptions();});
refreshOptions();refreshBrain();setInterval(()=>{refreshOptions();refreshBrain()},60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden){refreshOptions();refreshBrain()}});
let newsBusy=false,newsItems=[];
function renderNews(){const root=document.querySelector('#newsItems'),sector=document.querySelector('#newsSector').value;root.replaceChildren();const rows=newsItems.filter(n=>sector==='All'||n.sectors.includes(sector));if(!rows.length)root.append(el('p','No recent articles for this filter. Check news worker status.','empty'));for(const n of rows){const d=el('article',undefined,'entry');const a=el('a',n.title);try{const u=new URL(n.url);if(u.protocol!=='https:'||!(u.hostname==='cnbc.com'||u.hostname.endsWith('.cnbc.com')))continue;a.href=u.href;}catch{continue;}a.target='_blank';a.rel='noopener noreferrer';d.append(a,el('small',n.source+' · '+formatTime(n.published_at)),el('small',n.sectors.join(' · ')));root.append(d);}}
async function refreshNews(){if(newsBusy||document.hidden)return;newsBusy=true;try{const d=await api('/api/news');newsItems=d.items;renderNews();const h=d.health;document.querySelector('#newsStatus').textContent=(h?'Feed '+h.status+' · Last checked '+formatTime(h.updated_at)+' · '+h.message:'News worker has not checked the feeds yet.')+' Browser refreshes each minute; backend polls every five minutes.';}catch(e){document.querySelector('#newsStatus').textContent=e.message+' Previously displayed news may be stale.';}finally{newsBusy=false;}}
let requestTimer=null,requestCount=0;
function renderRequested(rows){const root=document.querySelector('#requestResults');root.replaceChildren();for(const [i,s] of rows.entries())root.append(signalCard(s,i+1));}
async function checkRequest(id){try{const d=await api('/api/request?id='+encodeURIComponent(id));document.querySelector('#requestStatus').textContent=d.message||d.status;if(d.status==='DONE'){renderRequested(d.results);clearInterval(requestTimer);document.querySelector('#requestTop3').disabled=false;refreshOptions();document.querySelector('#requestStatus').textContent='Results ready. Your request is saved in My ideas.';}else if(d.status==='ERROR'){clearInterval(requestTimer);document.querySelector('#requestTop3').disabled=false;}else if(++requestCount>=36){clearInterval(requestTimer);document.querySelector('#requestTop3').disabled=false;document.querySelector('#requestStatus').textContent='Still queued after three minutes. Check Railway; the regular feed continues refreshing.';}}catch(e){clearInterval(requestTimer);document.querySelector('#requestTop3').disabled=false;document.querySelector('#requestStatus').textContent=e.message;}}
document.querySelector('#requestTop3').addEventListener('click',async()=>{const b=document.querySelector('#requestTop3');b.disabled=true;clearInterval(requestTimer);document.querySelector('#requestResults').replaceChildren();try{await requireIdeaAccount();const d=await chatAPI('suggestions','POST',{category:document.querySelector('#optionCategory').value,budget:Number(document.querySelector('#optionBudget').value)});document.querySelector('#requestStatus').textContent=d.message;requestCount=0;requestTimer=setInterval(()=>checkRequest(d.id),5000);}catch(e){b.disabled=false;document.querySelector('#requestStatus').textContent=e.message;}});
document.querySelector('#refreshNews').addEventListener('click',refreshNews);document.querySelector('#newsSector').addEventListener('change',renderNews);refreshNews();setInterval(refreshNews,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshNews()});
let proxyBusy=false;
async function refreshProxy(){if(proxyBusy||document.hidden)return;proxyBusy=true;try{const d=await api('/api/proxy'),r=d.proxy,root=document.querySelector('#proxyDetails');root.replaceChildren();if(!r){document.querySelector('#proxyStatus').textContent='No matched SPY/SPX reference yet.';return;}const p=r.payload;document.querySelector('#proxyStatus').textContent=p.status+' · Checked '+formatTime(r.updated_at);if(p.estimated_spx!==null&&p.estimated_spx!==undefined){root.append(el('strong','Indicative SPX: '+Number(p.estimated_spx).toFixed(2)),el('p','SPY '+money(p.spy_price)+' · Move '+p.spy_move_pct.toFixed(2)+'% · Estimated SPX points '+p.estimated_point_change.toFixed(2)));}root.append(el('small','SPY time: '+formatTime(p.spy_at)+' · Reference: '+formatTime(p.anchor_at)+' · Feed: '+(p.spy_feed??'unavailable')),el('p',p.note));}catch(e){document.querySelector('#proxyDetails').replaceChildren();document.querySelector('#proxyStatus').textContent=e.message;}finally{proxyBusy=false;}}
refreshProxy();setInterval(refreshProxy,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshProxy()});
let progressBusy=false;
const agentNames={conservative:'Conservative',balanced:'Balanced',aggressive:'Aggressive',challenge:'Challenge',daily_10pct_research:'Daily 10% Research'};
async function refreshProgress(){if(progressBusy||document.hidden)return;progressBusy=true;try{
 const d=await api('/api/progress'),root=document.querySelector('#agentProgress');root.replaceChildren();
 for(const a of d.accounts){const card=el('article',undefined,'panel');const total=Number(a.equity)-Number(a.starting_balance);card.append(el('h2',agentNames[a.agent]??a.agent));const stats=el('div',undefined,'stats');for(const [label,value] of [['Starting balance',money(a.starting_balance)],['Paper account value',money(a.equity)],['Total P/L',money(total)],['Return',(total/Number(a.starting_balance)*100).toFixed(2)+'%'],['Cash',money(a.cash)],['Realized P/L',money(a.realized_pl)],['Open P/L',money(a.unrealized_pl)],['Closed trades',String(a.closed_trades)]]){const cell=el('div');cell.append(el('span',label),el('b',value));stats.append(cell);}card.append(stats);
 if(Number(a.closed_trades)>0)card.append(el('p','Winning closed trades: '+a.wins+'/'+a.closed_trades+' · '+(Number(a.wins)/Number(a.closed_trades)*100).toFixed(1)+'%'));
 if(!a.open_positions.length)card.append(el('p','No open research position.'));
 for(const p of a.open_positions){const age=Date.now()-Date.parse(p.quote_at);const row=el('div',undefined,'entry');row.append(el('b',p.contract+' · 1 contract'),el('small','Ask entry '+money(p.entry_ask)+' · Last bid '+money(p.last_bid)+' · Open P/L '+money(p.unrealized_pl)),el('small',(age>300000||age<0||!Number.isFinite(age)?'STALE MARK · ':'')+formatTime(p.quote_at)),el('small',p.regime+' · '+p.model_version));card.append(row);}
 const last=a.last_decision;card.append(el('p',last?last.action+': '+last.reason:'Waiting for the research worker to evaluate fresh quotes.'));if(last)card.append(el('small','Decision: '+formatTime(last.created_at)));root.append(card);
 }
 document.querySelector('#progressStatus').textContent='Paper accounts fetched '+new Date().toLocaleTimeString()+'. Backend ledger persists when the site is closed.';
 try{const b=await api('/api/brain');document.querySelector('#progressLearning').textContent='Active ranking '+b.active_model.version+' · '+b.active_model.state+' · '+b.active_model.sample_count+' validated outcome samples at promotion. '+(b.latest_evaluation?'Latest evaluation '+b.latest_evaluation.state+' across '+b.latest_evaluation.sample_count+' outcomes.':'Collecting eligible outcomes before the first evaluation.');}catch(e){document.querySelector('#progressLearning').textContent=e.message;}
 }catch(e){document.querySelector('#progressStatus').textContent=e.message+' Previous displayed values, if any, are not refreshed.';}finally{progressBusy=false;}}
document.querySelector('#refreshProgress').addEventListener('click',refreshProgress);refreshProgress();setInterval(refreshProgress,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshProgress()});
let activityBusy=false;
async function refreshActivity(){if(activityBusy||document.hidden)return;activityBusy=true;try{const d=await api('/api/activity'),root=document.querySelector('#tradeActivity');root.replaceChildren();if(!d.events.length)root.append(el('p','No paper entries or exits recorded yet.'));for(const e of d.events){const row=el('article',undefined,'entry');row.append(el('b','PAPER '+e.action+' · '+(agentNames[e.agent]??e.agent)),el('strong',e.contract+' · '+e.quantity+' contract'),el('small','Premium '+money(e.price)+' · Posted '+formatTime(e.created_at)+' · Quote '+formatTime(e.quote_at)),el('small',e.reason));if(e.realized_pl!==null)row.append(el('strong','Realized paper P/L '+money(e.realized_pl),e.realized_pl>=0?'good':'bad'));root.append(row);}document.querySelector('#activityStatus').textContent='Latest 100 paper events · checked '+new Date().toLocaleTimeString();}catch(e){document.querySelector('#activityStatus').textContent=e.message+' Previous events may be outdated.';}finally{activityBusy=false;}}
function pushBytes(s){const data=atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4));return Uint8Array.from(data,c=>c.charCodeAt(0));}
async function savePush(body){const r=await fetch('/api/notifications',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});const d=await r.json();if(!r.ok)throw Error(d.error||'Notification preference failed');return d;}
document.querySelector('#enableTradeAlerts').addEventListener('click',async()=>{
 const status=document.querySelector('#notificationStatus');
 // Call permission directly from the visitor's tap; do not request on page load.
 if(!('Notification' in window)||!('serviceWorker' in navigator)||!('PushManager' in window)){status.textContent='This browser does not expose Web Push. On iPhone, open the installed Home Screen app.';return;}
 const events=[['notifyEntry','ENTRY'],['notifyAdd','ADD'],['notifyExit','EXIT'],['notifyStocks','STOCK_EXIT'],['notifyPersonal','PERSONAL_EXIT'],['notifySystem','SYSTEM_ALERT']].filter(([id])=>document.querySelector('#'+id).checked).map(([,type])=>type);if(!events.length){status.textContent='Choose at least one event type.';return;}
 try{const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('Notification permission was not granted. You can change it in browser/system settings.');const config=await api('/api/notifications');if(!config.available)throw Error('Push server keys still need configuration.');const registration=await navigator.serviceWorker.ready;let sub=await registration.pushManager.getSubscription();let token=localStorage.getItem('kst_push_token');if(sub&&!token){await sub.unsubscribe();sub=null;}if(!token){token=crypto.randomUUID();localStorage.setItem('kst_push_token',token);}if(!sub)sub=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:pushBytes(config.public_key)});await savePush({token,subscription:sub.toJSON(),events});if(events.includes('PERSONAL_EXIT')||events.includes('SYSTEM_ALERT')){await requireIdeaAccount();await chatAPI('push-link','POST',{token});}localStorage.setItem('kst_push_events',JSON.stringify(events));status.textContent='Preferences saved for '+events.join(', ')+'. Delivery requires the configured push worker and device connectivity; alerts can be delayed.';}catch(e){status.textContent=e.message;}
});
document.querySelector('#disableTradeAlerts').addEventListener('click',async()=>{const status=document.querySelector('#notificationStatus');try{const registration=await navigator.serviceWorker.ready,sub=await registration.pushManager.getSubscription();if(sub)await sub.unsubscribe();const token=localStorage.getItem('kst_push_token');if(token)await savePush({action:'unsubscribe',token});localStorage.removeItem('kst_push_token');localStorage.removeItem('kst_push_events');status.textContent='Trade push notifications disabled for this browser.';}catch(e){status.textContent='Browser subscription stopped if present; server preference could not be confirmed: '+e.message;}});
try{const saved=JSON.parse(localStorage.getItem('kst_push_events')||'null');if(Array.isArray(saved))for(const [id,event] of [['notifyEntry','ENTRY'],['notifyAdd','ADD'],['notifyExit','EXIT'],['notifyStocks','STOCK_EXIT'],['notifyPersonal','PERSONAL_EXIT'],['notifySystem','SYSTEM_ALERT']])document.querySelector('#'+id).checked=saved.includes(event);}catch{}
if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('message',e=>{if(['progress','stocks','positions','account'].includes(e.data?.show))show(e.data.show)});
if(['#progress','#stocks','#positions','#account','#earnings'].includes(location.hash))show(location.hash.slice(1));
refreshActivity();setInterval(refreshActivity,15000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshActivity()});
