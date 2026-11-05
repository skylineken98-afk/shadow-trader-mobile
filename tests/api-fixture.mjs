export function createFixture(){
const now=new Date().toISOString(),user='00000000-0000-0000-0000-000000000001',conversation='00000000-0000-0000-0000-000000000002';let positions=[];const calls=[];
const fetchFixture=async(input,options={})=>{const url=new URL(String(input),'https://kst.example');calls.push({path:url.pathname,method:options.method||'GET',body:options.body});let data={};
 if(url.hostname==='example.supabase.co')data={access_token:'test-only',refresh_token:'test-only',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:user}};
 else if(url.pathname==='/api/signals')data={signals:[]};
 else if(url.pathname==='/api/options')data={signals:[],history:[]};
 else if(url.pathname==='/api/brain')data={active_model:{version:'baseline',state:'BASELINE',sample_count:0}};
 else if(url.pathname==='/api/news')data={items:[]};
 else if(url.pathname==='/api/proxy')data={proxy:null};
 else if(url.pathname==='/api/progress')data={accounts:[],learning:{}};
 else if(url.pathname==='/api/activity')data={events:[]};
 else if(url.pathname==='/api/stocks')data={plans:[],alerts:[],health:null,note:'fixture'};
 else if(url.pathname==='/api/earnings')data={events:[{symbol:'AAPL',report_date:now.slice(0,10),timing:'AFTER_CLOSE',source:'Test fixture',fetched_at:now,details:{}}],note:'fixture'};
 else if(url.pathname==='/api/company-news')data={company:[{title:'Test ticker headline',url:'https://example.com/news',source:'Fixture',published_at:now,category:'Company'}],macro:[],note:'fixture'};
 else if(url.pathname==='/api/chat/config')data={supabase_url:'https://example.supabase.co',publishable_key:'sb_publishable_test'};
 else if(url.pathname==='/api/chat/conversations')data=options.method==='POST'?{id:conversation}:[{id:conversation,title:'Test conversation'}];
 else if(url.pathname.startsWith('/api/chat/conversations/'))data={turns:[]};
 else if(url.pathname==='/api/chat/memory')data=[];
 else if(url.pathname==='/api/chat/suggestions')data=[];
 else if(url.pathname==='/api/chat/positions'){if(options.method==='POST'){const b=JSON.parse(options.body);positions.push({...b,id:conversation,state:'MONITORING',created_at:now});data={saved:true};}else data=positions;}
 else if(url.pathname==='/api/chat/private-alerts')data=[];
 else if(url.pathname==='/api/chat/account')data={user_id:user,pro:true,admin:true,enforced:false,checkout_available:false};
 else if(url.pathname==='/api/chat/admin/system')data={heartbeats:[],jobs:[],incidents:[],research:[],execution:[]};
 else if(url.pathname==='/api/chat/stream')return new Response('data: {"type":"delta","text":"Observed "}\n\ndata: {"type":"delta","text":"reaction pending."}\n\ndata: {"type":"done","result":{"text":"Observed reaction pending.","sources":[]}}\n\n',{headers:{'Content-Type':'text/event-stream'}});
 else throw Error('Unexpected fixture request '+url.pathname);
 return Response.json(data);
};
return {fetch:fetchFixture,calls};
}
