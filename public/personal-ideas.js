'use strict';
function clearPersonalIdeas(){document.querySelector('#myIdeasList').replaceChildren();document.querySelector('#myIdeasStatus').textContent='Sign in to view your private suggestions.';}
async function requireIdeaAccount(){if(!chatConfig)await initChat();if(!chatSession){show('chat');throw Error('Sign in first so Request 3 can save results to your private account.');}await freshChatToken();}
async function refreshMyIdeas(){
 const epoch=chatEpoch;clearPersonalIdeas();
 try{await requireIdeaAccount();const rows=await chatAPI('suggestions');if(epoch!==chatEpoch)return;const root=document.querySelector('#myIdeasList');
  for(const r of rows){const card=el('article',undefined,'panel');card.append(el('h2',r.category+' · Budget '+money(r.budget)),el('small','Saved '+formatTime(r.created_at)));
   if(!r.contracts.length)card.append(el('p',r.request_status==='PENDING'?'Scan pending. This request was saved even if you closed the page.':r.request_status==='ERROR'?'Scanner reported an error; request again after configuration is fixed.':'No eligible contracts were returned for this request.'));
   for(const c of r.contracts){const line=el('div',undefined,'entry');line.append(el('b',c.contract),el('small','Original ask '+money(c.entry_ask)+' · Quote '+formatTime(c.quote_at)+' · '+c.feed));const mark=(r.tracking||[]).find(t=>t.id===c.signal_id);if(mark){line.append(el('small',mark.state+' · Last bid '+(mark.last_bid==null?'unavailable':money(mark.last_bid))+' · '+formatTime(mark.last_quote_at)));if(mark.estimated_pl!=null)line.append(el('strong','One-contract research P/L '+money(mark.estimated_pl)+' · '+(Number(mark.estimated_return)*100).toFixed(1)+'%'));}else line.append(el('small','No linked research mark available. Original suggestion retained.'));card.append(line);}root.append(card);}
  document.querySelector('#myIdeasStatus').textContent=rows.length+' private request(s), latest 50. Marks may be stale; a saved suggestion is not a verified fill.';
 }catch(e){if(epoch===chatEpoch)document.querySelector('#myIdeasStatus').textContent=e.message;}
}
document.querySelector('#refreshMyIdeas').addEventListener('click',refreshMyIdeas);document.querySelector('nav [data-go="myideas"]').addEventListener('click',refreshMyIdeas);
