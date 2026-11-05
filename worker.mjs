// Server-only Supabase access. Never copy credentials into public/.
const fields=['id','created_at','symbol','status','side','entry','stop','target','source'];
function json(body,status=200){return Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
async function boundedChatBody(request,limit){
 if(!request.body)return '';
 const reader=request.body.getReader(),parts=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw new RangeError('Chat payload too large');}parts.push(value);}}
 finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}return new TextDecoder().decode(bytes);
}
export default {
 async fetch(request,env){
  const path=new URL(request.url).pathname;
  if(!path.startsWith('/api/'))return env.ASSETS.fetch(request);
  if(path.startsWith('/api/chat/')){
   const allowed=(path==='/api/chat/config'&&request.method==='GET')||
    (path==='/api/chat/conversations'&&['GET','POST'].includes(request.method))||
    (path==='/api/chat/suggestions'&&['GET','POST'].includes(request.method))||
    (/^\/api\/chat\/conversations\/[a-f0-9-]{36}$/.test(path)&&['GET','DELETE'].includes(request.method))||
    (path==='/api/chat/memory'&&['GET','POST'].includes(request.method))||
    (/^\/api\/chat\/memory\/[a-f0-9-]{36}$/.test(path)&&['POST','DELETE'].includes(request.method))||
    (path==='/api/chat/message'&&request.method==='POST')||
    (path==='/api/chat/stream'&&request.method==='POST')||
    (['/api/chat/account','/api/chat/private-alerts','/api/chat/admin/system'].includes(path)&&request.method==='GET')||
    (['/api/chat/checkout','/api/chat/billing-portal','/api/chat/admin/pass','/api/chat/push-link','/api/chat/history-search','/api/chat/ticker-search','/api/chat/market-refresh'].includes(path)&&request.method==='POST')||
    (path==='/api/chat/positions'&&['GET','POST'].includes(request.method))||
    (/^\/api\/chat\/positions\/[a-f0-9-]{36}$/.test(path)&&request.method==='DELETE');
   if(!allowed)return json({error:'Chat route not found'},404);
   if(!env.CHAT_BACKEND_URL||!env.CHAT_PROXY_TOKEN)return json({error:'KST Chat is not deployed yet. Configure its Railway service and Cloudflare proxy settings.'},503);
   const proxyToken=String(env.CHAT_PROXY_TOKEN).trim();
   if(!proxyToken||/[^\x21-\x7e]/.test(proxyToken))return json({error:'CHAT_PROXY_TOKEN contains invalid characters. Copy only the one-line value from Railway.',code:'PROXY_TOKEN_FORMAT'},503);
   let base;try{base=new URL(String(env.CHAT_BACKEND_URL).trim())}catch{return json({error:'Invalid chat backend URL'},503)}
   if(base.protocol!=='https:'||!base.hostname.endsWith('.up.railway.app')||base.username||base.password)return json({error:'Use the Railway chat service HTTPS public domain'},503);
   if(request.method!=='GET'){
    if(request.headers.get('Origin')!==new URL(request.url).origin)return json({error:'Same-origin request required'},403);
    if(!env.CHAT_LIMITER)return json({error:'Deploy the included CHAT_LIMITER binding'},503);
    if(!(await env.CHAT_LIMITER.limit({key:request.headers.get('CF-Connecting-IP')||'unknown'})).success)return json({error:'Please wait before sending another chat request'},429);
   }
   if(path!=='/api/chat/config'&&!request.headers.get('Authorization')?.startsWith('Bearer '))return json({error:'Sign in to KST Chat'},401);
   let body;try{body=['POST','DELETE'].includes(request.method)?await boundedChatBody(request,['/api/chat/message','/api/chat/stream'].includes(path)?3*1024*1024:32768):undefined;}catch{return json({error:'Chat payload too large or unreadable'},413);}
   try{const response=await fetch(new URL(path,base),{method:request.method,headers:{'Content-Type':'application/json','Authorization':request.headers.get('Authorization')||'','X-KST-Proxy':proxyToken},body:body||undefined,redirect:'error',signal:AbortSignal.timeout(70000)});
    if(path==='/api/chat/stream'&&response.ok&&(response.headers.get('content-type')||'').includes('text/event-stream'))return new Response(response.body,{status:200,headers:{'Content-Type':'text/event-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    if(!(response.headers.get('content-type')||'').includes('application/json'))return json({error:'Chat backend returned an unexpected response'},502);
    return new Response(await response.text(),{status:response.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
   }catch(error){const timedOut=['TimeoutError','AbortError'].includes(error?.name);return json({error:timedOut?'Railway chat request timed out. Check history before retrying.':'Cloudflare could not send the chat request. Check the proxy token format and backend connection.',code:timedOut?'CHAT_UPSTREAM_TIMEOUT':'CHAT_UPSTREAM_FETCH_FAILED'},502);}
  }
  if(!['/api/earnings','/api/company-news','/api/stocks','/api/signals','/api/options','/api/brain','/api/news','/api/request','/api/proxy','/api/progress','/api/activity','/api/notifications'].includes(path))return json({error:'Not found'},404);
  if(request.method!=='GET'&&!(['/api/request','/api/notifications'].includes(path)&&request.method==='POST'))return json({error:'Method not allowed'},405);
  if(request.method==='GET'&&env.PUBLIC_LIMITER&&!(await env.PUBLIC_LIMITER.limit({key:request.headers.get('CF-Connecting-IP')||'unknown'})).success)return json({error:'Please wait before refreshing the public feed'},429);
  // Explicit opt-in: endpoint exposes only the research fields listed above publicly.
  if(env.PUBLIC_SIGNALS_ENABLED!=='true')return json({error:'Signal endpoint not enabled. Set PUBLIC_SIGNALS_ENABLED=true in Cloudflare to publish the research feed.'},503);
  const key=env.SUPABASE_SERVICE_ROLE_KEY;
  if(!key||!env.SUPABASE_URL)return json({error:'Configure SUPABASE_URL and the server-only SUPABASE_SERVICE_ROLE_KEY secret in Cloudflare.'},503);
  try{
   const base=new URL(env.SUPABASE_URL);
   if(base.protocol!=='https:'||!base.hostname.endsWith('.supabase.co')||base.username||base.password)throw Error('Invalid server configuration');
   const headers={apikey:key,Accept:'application/json'};
   if(!key.startsWith('sb_secret_'))headers.Authorization='Bearer '+key;
   async function read(table,params){
    const u=new URL('/rest/v1/'+table,base);for(const [k,v] of Object.entries(params))u.searchParams.set(k,v);
    const res=await fetch(u,{headers,signal:AbortSignal.timeout(10000)});
    if(!res.ok)throw Error('Options database query failed. Run the included SQL migration and verify credentials.');
    const rows=await res.json();if(!Array.isArray(rows))throw Error('Invalid database response');return rows;
   }
   if(path==='/api/earnings'){
    const query=new URL(request.url).searchParams,symbol=(query.get('symbol')||'').toUpperCase();
    if(symbol&&!/^[A-Z][A-Z.\-]{0,9}$/.test(symbol))return json({error:'Invalid ticker'},400);
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const params={select:'id,symbol,report_date,timing,eps_estimate,revenue_estimate,source,fetched_at,details',active:'eq.true',report_date:'gte.'+today,order:'report_date.asc,symbol.asc',limit:'500'};if(symbol)params.symbol='eq.'+symbol;
    return json({events:await read('kst_earnings',params),health:(await read('kst_options_health',{select:'updated_at,status,message',id:'eq.earnings',limit:'1'}))[0]??null,note:'Provider-reported schedules can change. Confirm with company investor relations. Premium-implied moves are estimates; IV crush can cause losses despite a correct directional view.'});
   }
   if(path==='/api/company-news'){
    const symbol=(new URL(request.url).searchParams.get('symbol')||'').toUpperCase();
    if(!/^[A-Z][A-Z.\-]{0,9}$/.test(symbol))return json({error:'Enter a ticker'},400);
    const company=await read('kst_company_news',{select:'symbol,title,url,source,published_at,fetched_at,category',symbol:'eq.'+symbol,published_at:'gte.'+new Date(Date.now()-7*86400000).toISOString(),order:'published_at.desc',limit:'80'});
    const macro=await read('kst_news',{select:'title,url,source,published_at,fetched_at,sectors',published_at:'gte.'+new Date(Date.now()-72*3600000).toISOString(),order:'importance.desc',limit:'12'});
    return json({company,macro,note:'Company stories are provider-tagged. Related market headlines are broad macro/sector context, not verified direct effects on this ticker.'});
   }
   if(path==='/api/stocks'){
    const plans=await read('kst_stock_plans',{select:'id,symbol,created_at,quote_at,feed,state,entry_ask,last_bid,peak_bid,stop,target,risk_per_share,due_at,score,reason,exit_reason,closed_at',or:'(state.eq.OPEN,closed_at.gte.'+new Date(Date.now()-86400000).toISOString()+')',order:'state.desc,score.desc',limit:'100'});
    const alerts=await read('kst_stock_alerts',{select:'id,plan_id,symbol,created_at,quote_at,price,reason,research_only',order:'created_at.desc',limit:'40'});
    const health=await read('kst_options_health',{select:'updated_at,status,message',id:'eq.stocks',limit:'1'});
    return json({plans,alerts,health:health[0]??null,note:'Long momentum research for configured symbols, not a probability or your holdings. Entry is an ask reference. Exits use observed fresh bids; polling can miss moves. IEX covers one venue. No orders submitted.'});
   }
   if(path==='/api/activity'){
    return json({events:await read('kst_trade_activity',{select:'id,created_at,agent,position_id,action,contract,quote_at,quantity,price,realized_pl,reason,simulation_only',order:'created_at.desc',limit:'100'})});
   }
   if(path==='/api/notifications'){
    if(request.method==='GET')return json({public_key:env.VAPID_PUBLIC_KEY||null,available:!!env.VAPID_PUBLIC_KEY});
    if(request.headers.get('Origin')!==new URL(request.url).origin)return json({error:'Same-origin request required'},403);
    if(!env.REQUEST_LIMITER)return json({error:'Notification rate limiter is not configured'},503);
    if(!(await env.REQUEST_LIMITER.limit({key:'push:'+(request.headers.get('CF-Connecting-IP')||'unknown')})).success)return json({error:'Please wait before updating notifications again.'},429);
    const raw=await request.text();if(raw.length>4096)return json({error:'Subscription too large'},413);
    let b;try{b=JSON.parse(raw)}catch{return json({error:'Invalid subscription'},400)}
    if(typeof b.token!=='string'||!/^[-A-Za-z0-9_]{32,128}$/.test(b.token))return json({error:'Valid private management token required'},400);
    async function hash(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('');}
    const tokenHash=await hash(b.token);
    let rpc,payload;
    if(b.action==='unsubscribe'){rpc='kst_unset_push';payload={p_token_hash:tokenHash};}
    else{
     if(!env.VAPID_PUBLIC_KEY)return json({error:'Push keys are not configured'},503);
     let u;try{u=new URL(b.subscription?.endpoint)}catch{return json({error:'Invalid push endpoint'},400)}
     const h=u.hostname;
     if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443')||!(h==='fcm.googleapis.com'||h.endsWith('.push.apple.com')||h==='updates.push.services.mozilla.com'||h.endsWith('.push.services.mozilla.com')||h.endsWith('.notify.windows.com')))return json({error:'Unsupported push provider'},400);
     const keys=b.subscription?.keys;
     if(!keys||!/^[-A-Za-z0-9_]{80,100}$/.test(keys.p256dh||'')||!/^[-A-Za-z0-9_]{20,30}$/.test(keys.auth||''))return json({error:'Invalid subscription keys'},400);
     if(!Array.isArray(b.events)||!b.events.length||b.events.some(x=>!['ENTRY','ADD','EXIT','STOCK_EXIT','PERSONAL_EXIT','SYSTEM_ALERT'].includes(x)))return json({error:'Select paper events or stock research exits'},400);
     rpc='kst_set_push';payload={p_id:await hash(u.href),p_endpoint:u.href,p_keys:{p256dh:keys.p256dh,auth:keys.auth},p_token_hash:tokenHash,p_events:[...new Set(b.events)]};
    }
    const res=await fetch(new URL('/rest/v1/rpc/'+rpc,base),{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(10000)});
    if(!res.ok)return json({error:'Could not save notification preference. Apply the updated SQL migration.'},502);
    const result=await res.json();return result.ok?json({ok:true}):json({error:'Subscription ownership could not be verified. Revoke the old browser subscription and subscribe again.'},403);
   }
   if(path==='/api/progress'){
    const u=new URL('/rest/v1/rpc/kst_ai_progress',base);
    const r=await fetch(u,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(10000)});
    if(!r.ok)return json({error:'Paper AI ledger unavailable. Apply the updated SQL migration.'},502);
    const data=await r.json();return json(data);
   }
   if(path==='/api/proxy'){
    const rows=await read('kst_market_proxy',{select:'updated_at,payload',id:'eq.SPX',limit:'1'});
    const row=rows[0]??null;if(row&&Date.now()-Date.parse(row.updated_at)>300000){row.payload={...row.payload,estimated_spx:null,status:'STALE_WORKER'};}
    return json({proxy:row});
   }
   if(path==='/api/news'){
    const items=await read('kst_news',{select:'title,url,source,published_at,fetched_at,sectors,importance',published_at:'gte.'+new Date(Date.now()-72*3600000).toISOString(),order:'importance.desc,published_at.desc',limit:'40'});
    const health=await read('kst_options_health',{select:'updated_at,status,message',id:'eq.news',limit:'1'});
    return json({items,health:health[0]??null,note:'Headlines link to the publisher. Importance and sector labels are keyword heuristics.'});
   }
   if(path==='/api/request'){
    if(request.method==='GET'){
     const id=new URL(request.url).searchParams.get('id')||'';
     if(!/^(0DTE|Swings|LEAPS)-(30|50|100|200|500|1000|3000)-[0-9]{8,12}$/.test(id))return json({error:'Invalid request ID'},400);
     const rows=await read('kst_signal_requests',{select:'id,created_at,category,budget,status,completed_at,results,message',id:'eq.'+id,limit:'1'});
     return rows[0]?json(rows[0]):json({error:'Request not found'},404);
    }
    const origin=request.headers.get('Origin');
    if(origin!==new URL(request.url).origin)return json({error:'Same-origin requests required'},403);
    if(!env.REQUEST_LIMITER)return json({error:'Deploy the included REQUEST_LIMITER binding'},503);
    const allowed=await env.REQUEST_LIMITER.limit({key:request.headers.get('CF-Connecting-IP')||'unknown'});
    if(!allowed.success)return json({error:'Please wait before requesting another scan.'},429);
    const raw=await request.text();if(raw.length>256)return json({error:'Request too large'},413);
    let body;try{body=JSON.parse(raw)}catch{return json({error:'Invalid request'},400)}
    if(!['0DTE','Swings','LEAPS'].includes(body.category)||![30,50,100,200,500,1000,3000].includes(body.budget))return json({error:'Invalid category or budget'},400);
    const id=body.category+'-'+body.budget+'-'+Math.floor(Date.now()/60000);
    const row={id,category:body.category,budget:body.budget,created_at:new Date().toISOString(),status:'PENDING'};
    const u=new URL('/rest/v1/kst_signal_requests',base);
    const res=await fetch(u,{method:'POST',headers:{...headers,'Content-Type':'application/json',Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify(row),signal:AbortSignal.timeout(10000)});
    if(!res.ok)return json({error:'Could not queue request. Run the updated SQL migration.'},502);
    return json({id,status:'QUEUED',message:'A fresh scan is queued. Results may take several minutes; closed markets or missing data may return fewer than three.'},202);
   }
   if(path==='/api/brain'){
    const models=await read('kst_option_models',{select:'version,created_at,state,sample_count',order:'created_at.desc',limit:'1'});
    const active=await read('kst_option_models',{select:'version,created_at,state,sample_count',state:'eq.PROMOTED',order:'created_at.desc',limit:'1'});
    const health=await read('kst_options_health',{select:'updated_at,status,message',id:'eq.options',limit:'1'});
    return json({latest_evaluation:models[0]??null,active_model:active[0]??{version:'baseline-v1',state:'BASELINE',sample_count:0},health:health[0]??null,note:'Bounded ranking calibration. Actual fills remain private. No neural model training or guaranteed improvement.'});
   }
   if(path==='/api/options'){
    const search=new URL(request.url).searchParams;
    const category=search.get('category')||'0DTE',budget=Number(search.get('budget')||100);
    if(!['0DTE','Swings','LEAPS'].includes(category)||![30,50,100,200,500,1000,3000].includes(budget))return json({error:'Invalid category or budget'},400);
    const publicFields=['risk_snapshot','id','created_at','contract','underlying','expiration','option_type','strike','category','budget','fee_estimate','entry_ask','entry_bid','quote_at','feed','score','quality_label','context_label','context_at','model_version','due_at','state','last_bid','last_quote_at','estimated_pl','estimated_return','max_return','min_return','target_seen','stop_seen'];
    const rows=await read('kst_option_signals',{select:publicFields.join(','),category:'eq.'+category,budget:'eq.'+budget,or:'(state.eq.OPEN,created_at.gte.'+new Date(Date.now()-86400000).toISOString()+')',order:'created_at.desc',limit:'1000'});
    const seen=new Set(),signals=[];
    for(const row of rows){if(!row||typeof row.contract!=='string'||seen.has(row.contract))continue;seen.add(row.contract);signals.push(Object.fromEntries(publicFields.map(f=>[f,row[f]??null])));}
    const history=signals.slice(0,20);
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const ranked=signals.filter(s=>{const age=Date.now()-Date.parse(s.last_quote_at??s.quote_at);return s.quality_label!=='WATCHLIST'&&s.state==='OPEN'&&s.expiration>=today&&age>=0&&age<=300000;}).sort((a,b)=>b.score-a.score);
    return json({signals:ranked.slice(0,3),history,fetched_at:new Date().toISOString(),note:'Research quality ranking, not a directional entry recommendation. Estimated long-one-contract P/L; no verified fills.'});
   }
   const url=new URL('/rest/v1/ultimate_signals',base);
   url.searchParams.set('select',fields.join(','));url.searchParams.set('order','created_at.desc');url.searchParams.set('limit','1000');
   url.searchParams.set('created_at','gte.'+new Date(Date.now()-86400000).toISOString());

   const r=await fetch(url,{headers,signal:AbortSignal.timeout(10000)});
   if(!r.ok)return json({error:r.status===401||r.status===403?'Supabase authorization failed. Check the Cloudflare server credentials.':'Supabase query failed. Verify ultimate_signals and its expected columns.'},502);
   const rows=await r.json();if(!Array.isArray(rows))throw Error('Invalid response');
   const seen=new Set(),signals=[];
   for(const row of rows){if(!row||typeof row.symbol!=='string'||seen.has(row.symbol))continue;seen.add(row.symbol);
    signals.push(Object.fromEntries(fields.map(f=>[f,row[f]??null])));if(signals.length===100)break;
   }
   return json({signals,fetched_at:new Date().toISOString(),window_hours:24,source:'saved_research',note:'Latest per symbol within the most recent 1000 rows. Saved timestamps are not market quote timestamps.'});
  }catch{return json({error:'Database connection failed. Verify credentials and run the included kst_options/schema.sql migration for options and Brain.'},502);}
 }
};
