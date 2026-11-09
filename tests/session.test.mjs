import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Window} from 'happy-dom';
const html=fs.readFileSync('public/index.html','utf8').replace(/<script[^>]*src=[^>]*><\/script>/g,'');
const source=fs.readFileSync('public/chat.js','utf8');
const session={access_token:'fixture-access',refresh_token:'fixture-refresh',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'fixture-user'}};
async function setup({saved=session,offline=false,expired=false}={}){
 const w=new Window({url:'https://kst.example',settings:{enableJavaScriptEvaluation:true}});
 w.document.write(html);w.document.close();
 if(saved){w.localStorage.setItem('kst_chat_session',JSON.stringify({...saved,expires_at:expired?1:saved.expires_at}));w.localStorage.setItem('kst_risk_ack','v1');}
 let refreshes=0;
 w.fetch=async input=>{const url=String(input);if(offline)throw Error('Network unavailable');if(url.includes('/config'))return Response.json({supabase_url:'https://fixture.supabase.co',publishable_key:'sb_publishable_fixture'});if(url.includes('grant_type=refresh_token')){refreshes++;await new Promise(r=>setImmediate(r));return Response.json(session);}if(url.endsWith('/user'))return Response.json(session.user);return Response.json([])};
 w.eval('function clearPersonalIdeas(){};function clearChartAttachments(){};function show(){};'+source+';window.testRefresh=()=>{chatSession.expires_at=1;return Promise.all([freshChatToken(),freshChatToken(),freshChatToken()])};');
 for(let i=0;i<15;i++)await new Promise(r=>setImmediate(r));
 return {w,refreshes:()=>refreshes};
}
test('restores a persistent session in a new tab and clears it on logout',async()=>{const {w}=await setup();assert.equal(w.sessionStorage.getItem('kst_chat_session'),null);assert.equal(w.document.querySelector('#appShell').hidden,false);w.document.querySelector('#chatLogout').click();await new Promise(r=>setImmediate(r));assert.equal(w.localStorage.getItem('kst_chat_session'),null);assert.equal(w.localStorage.getItem('kst_risk_ack'),null);assert.equal(w.document.querySelector('#appShell').hidden,true);await w.happyDOM.close()});
test('temporary startup failure keeps credentials and leaves the gate locked',async()=>{const {w}=await setup({offline:true});assert.ok(w.localStorage.getItem('kst_chat_session'));assert.equal(w.document.querySelector('#appShell').hidden,true);assert.equal(w.document.querySelector('#chatAuthPanel').hidden,false);await w.happyDOM.close()});
test('parallel callers share one refresh request',async()=>{const {w,refreshes}=await setup({expired:true});assert.equal(refreshes(),1);await w.testRefresh();assert.equal(refreshes(),2);await w.happyDOM.close()});
