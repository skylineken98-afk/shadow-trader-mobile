import test from 'node:test';
import assert from 'node:assert/strict';
import realWorker from '../worker.mjs';
// All legacy research tests use a member-authenticated fixture. The production
// Worker still validates a real Supabase bearer session via Railway.
const worker={async fetch(request,env){
 const path=new URL(request.url).pathname;
 if(!path.startsWith('/api/')||path.startsWith('/api/chat/')||path==='/api/other')return realWorker.fetch(request,env);
 const headers=new Headers(request.headers);headers.set('Authorization','Bearer test-member');
 const authorized=new Request(request,{headers});
 const previous=globalThis.fetch;
 globalThis.fetch=async(url,opts)=>{
   const u=new URL(String(url));
   if(u.hostname.endsWith('.up.railway.app')&&u.pathname==='/api/chat/account')
      return Response.json({user_id:'00000000-0000-0000-0000-000000000001',pro:true,enforced:true});
   return previous(url,opts);
 };
 try{return await realWorker.fetch(authorized,{...env,CHAT_BACKEND_URL:'https://fixture.up.railway.app',CHAT_PROXY_TOKEN:'test-proxy'});}
 finally{globalThis.fetch=previous;}
}};

const env={PUBLIC_SIGNALS_ENABLED:'true',SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'sb_secret_test'};
const request=()=>new Request('https://mobile.example/api/signals');
test('disabled and missing credentials fail closed',async()=>{
 assert.equal((await worker.fetch(request(),{})).status,503);
 assert.equal((await worker.fetch(request(),{PUBLIC_SIGNALS_ENABLED:'true'})).status,503);
});
test('only GET and fixed API route',async()=>{
 assert.equal((await worker.fetch(new Request(request(),{method:'POST'}),env)).status,405);
 assert.equal((await worker.fetch(new Request('https://mobile.example/api/other'),env)).status,404);
});
test('query constraints, dedupe, projection and both key types',async()=>{
 const original=globalThis.fetch;
 try{for(const key of ['sb_secret_test','legacy.jwt.key']){
 globalThis.fetch=async(url,options)=>{
  assert.equal(url.searchParams.get('limit'),'1000');assert.match(url.searchParams.get('created_at'),/^gte\./);
  assert.equal(options.headers.apikey,key);
  assert.equal(options.headers.Authorization,key.startsWith('sb_secret_')?undefined:'Bearer '+key);
  return Response.json([{symbol:'TSLA',status:'WAIT',details:{private:'omit'},created_at:'2026-11-04T17:32:54Z'},{symbol:'TSLA',status:'SETUP'},{symbol:'BTC-USD',status:'WAIT'}]);
 };
 const response=await worker.fetch(request(),{...env,SUPABASE_SERVICE_ROLE_KEY:key});const body=await response.json();
 assert.equal(body.signals.length,2);assert.equal(body.signals[0].status,'WAIT');assert.equal('details' in body.signals[0],false);assert.equal(response.headers.get('cache-control'),'no-store');
 }}finally{globalThis.fetch=original;}
});
test('upstream errors never leak responses or credentials',async()=>{
 const original=globalThis.fetch;
 try{globalThis.fetch=async()=>new Response('private error '+env.SUPABASE_SERVICE_ROLE_KEY,{status:401});
 const r=await worker.fetch(request(),env);assert.equal(r.status,502);assert.equal((await r.text()).includes('sb_secret_test'),false);
 globalThis.fetch=async()=>{throw Error('private');};assert.equal((await worker.fetch(request(),env)).status,502);
 }finally{globalThis.fetch=original;}
});
test('static assets route through binding',async()=>{
 const r=await worker.fetch(new Request('https://mobile.example/'),{ASSETS:{fetch:()=>new Response('home')}});assert.equal(await r.text(),'home');
});
test('options validates filters and returns only public contract fields',async()=>{
 assert.equal((await worker.fetch(new Request('https://mobile.example/api/options?budget=999'),env)).status,400);
 const original=globalThis.fetch;
 try{globalThis.fetch=async url=>{assert.match(url.pathname,/kst_option_signals$/);assert.equal(url.searchParams.get('category'),'eq.Swings');assert.equal(url.searchParams.get('budget'),'eq.100');return Response.json([{contract:'X',state:'OPEN',expiration:'2099-01-01',quote_at:new Date().toISOString(),score:80,features:[1,2,3],private:'omit',entry_ask:1}]);};
 const r=await worker.fetch(new Request('https://mobile.example/api/options?category=Swings&budget=100'),env);const d=await r.json();assert.equal(d.signals[0].contract,'X');assert.equal('features' in d.signals[0],false);assert.equal('private' in d.signals[0],false);
 }finally{globalThis.fetch=original;}
});
test('brain queries never request private fills or outcome returns',async()=>{
 const original=globalThis.fetch;
 try{globalThis.fetch=async url=>{assert.ok(['kst_option_models','kst_options_health'].some(t=>url.pathname.endsWith(t)));assert.ok(!url.search.includes('report'));return Response.json([]);};const r=await worker.fetch(new Request('https://mobile.example/api/brain'),env);const d=await r.json();assert.equal(d.active_model.state,'BASELINE');}finally{globalThis.fetch=original;}
});
test('request rejects cross-origin, invalid parameters and throttles',async()=>{
 const req=(origin,body)=>new Request('https://mobile.example/api/request',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await worker.fetch(req('https://evil.example',{}),env)).status,403);
 const e={...env,REQUEST_LIMITER:{limit:async()=>({success:true})}};
 assert.equal((await worker.fetch(req('https://mobile.example',{category:'0DTE',budget:999}),e)).status,400);
 assert.equal((await worker.fetch(req('https://mobile.example',{category:'0DTE',budget:100}),{...e,REQUEST_LIMITER:{limit:async()=>({success:false})}})).status,429);
});
test('request enqueues fixed public fields; no arbitrary table or symbols',async()=>{
 const old=globalThis.fetch;
 try{globalThis.fetch=async(u,o)=>{assert.match(u.pathname,/kst_signal_requests$/);const b=JSON.parse(o.body);assert.equal(b.status,'PENDING');assert.equal(b.budget,100);assert.equal('account' in b,false);assert.equal('symbol' in b,false);return new Response(null,{status:201});};
 const req=new Request('https://mobile.example/api/request',{method:'POST',headers:{Origin:'https://mobile.example','Content-Type':'application/json'},body:JSON.stringify({category:'0DTE',budget:100,account:'omit',symbol:'omit'})});
 const r=await worker.fetch(req,{...env,REQUEST_LIMITER:{limit:async()=>({success:true})}});assert.equal(r.status,202);
 }finally{globalThis.fetch=old;}
});
test('news endpoint queries only public feed data and health',async()=>{
 const old=globalThis.fetch;
 try{globalThis.fetch=async u=>{assert.ok(u.pathname.endsWith('kst_news')||u.pathname.endsWith('kst_options_health'));return Response.json([])};const r=await worker.fetch(new Request('https://mobile.example/api/news'),env);assert.deepEqual((await r.json()).items,[]);}finally{globalThis.fetch=old;}
});
test('AI progress exposes only the separate research portfolio RPC',async()=>{
 const old=globalThis.fetch;
 try{globalThis.fetch=async(u,o)=>{assert.match(u.pathname,/rpc\/kst_ai_progress$/);assert.equal(o.method,'POST');assert.deepEqual(JSON.parse(o.body),{});return Response.json({mode:'PAPER_RESEARCH_ONLY',accounts:[{agent:'balanced',starting_balance:300,equity:300,cash:300,realized_pl:0}]});};const r=await worker.fetch(new Request('https://mobile.example/api/progress'),env);const d=await r.json();assert.equal(d.accounts[0].starting_balance,300);assert.equal(d.mode,'PAPER_RESEARCH_ONLY');}finally{globalThis.fetch=old;}
});
test('activity endpoint never requests push subscription or personal fill data',async()=>{
 const old=globalThis.fetch;
 try{globalThis.fetch=async u=>{assert.ok(u.pathname.endsWith('kst_trade_activity'));assert.ok(!u.search.includes('token'));return Response.json([])};const r=await worker.fetch(new Request('https://mobile.example/api/activity'),env);assert.deepEqual((await r.json()).events,[]);}finally{globalThis.fetch=old;}
});
test('notification configuration exposes public key only',async()=>{
 const r=await worker.fetch(new Request('https://mobile.example/api/notifications'),{...env,VAPID_PUBLIC_KEY:'public-test',VAPID_PRIVATE_KEY:'never-return'});const d=await r.json();assert.equal(d.public_key,'public-test');assert.equal(JSON.stringify(d).includes('never-return'),false);
});
test('subscription rejects cross-origin and arbitrary push endpoints',async()=>{
 const e={...env,VAPID_PUBLIC_KEY:'test',REQUEST_LIMITER:{limit:async()=>({success:true})}};
 const req=(origin,body)=>new Request('https://mobile.example/api/notifications',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await worker.fetch(req('https://evil.example',{}),e)).status,403);
 assert.equal((await worker.fetch(req('https://mobile.example',{token:'x'.repeat(36),subscription:{endpoint:'https://localhost/test',keys:{p256dh:'x'.repeat(87),auth:'x'.repeat(22)}},events:['ENTRY']}),e)).status,400);
});
test('chat proxy requires deployment, authentication and a pinned Railway backend',async()=>{
 const req=new Request('https://mobile.example/api/chat/conversations');
 assert.equal((await worker.fetch(req,env)).status,503);
 const e={CHAT_BACKEND_URL:'https://chat.up.railway.app',CHAT_PROXY_TOKEN:'private-proxy-test'};
 assert.equal((await worker.fetch(req,e)).status,401);
 assert.equal((await worker.fetch(new Request('https://mobile.example/api/chat/config'),{...e,CHAT_BACKEND_URL:'https://evil.example'})).status,503);
 assert.equal((await worker.fetch(new Request('https://mobile.example/api/chat/arbitrary'),e)).status,404);
});
test('chat proxy keeps API key on Railway and does not require public research mode',async()=>{
 const old=globalThis.fetch;
 try{globalThis.fetch=async(u,o)=>{assert.equal(u.hostname,'chat.up.railway.app');assert.equal(o.headers['X-KST-Proxy'],'private-test');assert.equal('OPENAI_API_KEY' in o.headers,false);assert.equal(o.redirect,'manual');return Response.json({publishable_key:'sb_publishable_test',supabase_url:'https://example.supabase.co'})};const r=await worker.fetch(new Request('https://mobile.example/api/chat/config'),{CHAT_BACKEND_URL:'https://chat.up.railway.app',CHAT_PROXY_TOKEN:'private-test'});assert.equal(r.status,200);assert.equal((await r.json()).publishable_key,'sb_publishable_test');}finally{globalThis.fetch=old;}
});
test('chart proxy supports bounded image messages but rejects oversized streams',async()=>{
 const old=globalThis.fetch;
 const e={CHAT_BACKEND_URL:'https://chat.up.railway.app',CHAT_PROXY_TOKEN:'private-test',CHAT_LIMITER:{limit:async()=>({success:true})}};
 const req=(path,size)=>new Request('https://mobile.example/api/chat/'+path,{method:'POST',headers:{Origin:'https://mobile.example',Authorization:'Bearer private-session'},body:'x'.repeat(size)});
 let calls=0;
 try{globalThis.fetch=async(u,o)=>{calls++;return Response.json({ok:true})};
 assert.equal((await worker.fetch(req('message',50000),e)).status,200);
 assert.equal((await worker.fetch(req('message',3*1024*1024+1),e)).status,413);
 assert.equal((await worker.fetch(req('memory',50000),e)).status,413);
 assert.equal(calls,1);
 assert.equal((await worker.fetch(new Request('https://mobile.example/api/chat/suggestions'),e)).status,401);
 }finally{globalThis.fetch=old;}
});
test('stock API reads public research only and fails closed when disabled',async()=>{
 const old=globalThis.fetch;const req=()=>new Request('https://mobile.example/api/stocks');
 assert.equal((await worker.fetch(req(),{})).status,503);
 try{globalThis.fetch=async u=>{assert.ok(['kst_stock_plans','kst_stock_alerts','kst_options_health'].includes(u.pathname.split('/').pop()));assert.ok(!u.search.includes('user_id'));return Response.json([])};
 const r=await worker.fetch(req(),env);const d=await r.json();assert.deepEqual(d.plans,[]);assert.deepEqual(d.alerts,[]);assert.match(d.note,/No orders/);
 }finally{globalThis.fetch=old;}
});
test('stream proxy forwards SSE incrementally without JSON buffering',async()=>{
 const old=globalThis.fetch;const e={CHAT_BACKEND_URL:'https://chat.up.railway.app',CHAT_PROXY_TOKEN:'test',CHAT_LIMITER:{limit:async()=>({success:true})}};
 try{globalThis.fetch=async()=>new Response('data: {"type":"delta","text":"Hello"}\n\ndata: {"type":"done","result":{}}\n\n',{headers:{'Content-Type':'text/event-stream'}});
 const r=await worker.fetch(new Request('https://mobile.example/api/chat/stream',{method:'POST',headers:{Origin:'https://mobile.example',Authorization:'Bearer session'},body:'{}'}),e);
 assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/event-stream/);assert.match(await r.text(),/Hello/);
 }finally{globalThis.fetch=old;}
});
test('earnings API projects calendar fields without leaking provider credentials',async()=>{
 const old=globalThis.fetch;
 try{globalThis.fetch=async u=>{assert.ok(['kst_earnings','kst_options_health'].includes(u.pathname.split('/').pop()));return Response.json([])};
 const r=await worker.fetch(new Request('https://mobile.example/api/earnings?symbol=AAPL'),{...env,FINNHUB_API_KEY:'never-return'});const d=await r.json();assert.deepEqual(d.events,[]);assert.equal(JSON.stringify(d).includes('never-return'),false);
 }finally{globalThis.fetch=old;}
});
test('ticker news validates symbols and distinguishes company from macro',async()=>{
 assert.equal((await worker.fetch(new Request('https://mobile.example/api/company-news?symbol=NVDA,SPY'),env)).status,400);
 const old=globalThis.fetch;
 try{globalThis.fetch=async u=>{assert.ok(['kst_company_news','kst_news'].includes(u.pathname.split('/').pop()));return Response.json([])};
 const r=await worker.fetch(new Request('https://mobile.example/api/company-news?symbol=NVDA'),env);const d=await r.json();assert.deepEqual(d.company,[]);assert.deepEqual(d.macro,[]);
 }finally{globalThis.fetch=old;}
});
test('private/admin/billing routes require verified sessions at the proxy',async()=>{
 const e={CHAT_BACKEND_URL:'https://chat.up.railway.app',CHAT_PROXY_TOKEN:'test'};
 for(const route of ['account','positions','private-alerts','admin/system'])assert.equal((await worker.fetch(new Request('https://mobile.example/api/chat/'+route),e)).status,401);
 assert.equal((await worker.fetch(new Request('https://mobile.example/api/chat/admin/arbitrary'),e)).status,404);
});

test('chat proxy does not follow redirects with its secret',async()=>{
 const old=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=async(u,o)=>{calls++;if(o.redirect==='error')throw new TypeError('Unsupported redirect mode');assert.equal(o.redirect,'manual');return new Response(null,{status:302,headers:{Location:'https://untrusted.example'}})};
  const response=await worker.fetch(new Request('https://mobile.example/api/chat/config'),{CHAT_BACKEND_URL:'https://chat.up.railway.app',CHAT_PROXY_TOKEN:'private-test'});
  assert.equal(response.status,502);assert.equal((await response.json()).code,'CHAT_UPSTREAM_REDIRECT');assert.equal(calls,1);
 }finally{globalThis.fetch=old;}
});

test('public research requires signed-in KST member',async()=>{
 const r=await realWorker.fetch(new Request('https://mobile.example/api/signals'),
  {...env,CHAT_BACKEND_URL:'https://fixture.up.railway.app',CHAT_PROXY_TOKEN:'test'});
 assert.equal(r.status,401);
});
test('active login without paid entitlement is rejected by real Worker',async()=>{
 const old=globalThis.fetch;
 try{
  globalThis.fetch=async u=>{const x=new URL(String(u));if(x.pathname==='/api/chat/account')return Response.json({user_id:'u-test',enforced:true,pro:false});throw Error('unexpected');};
  const r=await realWorker.fetch(new Request('https://mobile.example/api/signals',
   {headers:{Authorization:'Bearer member-unpaid'}}),{...env,CHAT_BACKEND_URL:'https://fixture.up.railway.app',CHAT_PROXY_TOKEN:'test'});
  assert.equal(r.status,403);
 }finally{globalThis.fetch=old;}
});
