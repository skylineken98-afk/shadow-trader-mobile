'use strict';
const chartState={images:[],preparing:false,epoch:0};
const chartInput=document.querySelector('#chatCharts'),chartPreview=document.querySelector('#chartPreview'),chartNote=document.querySelector('#chartUploadStatus');
function clearChartAttachments(){chartState.epoch++;chartState.images=[];chartState.preparing=false;chartInput.value='';chartPreview.replaceChildren();chartNote.textContent='Up to two charts. Images are sent for this answer; only attachment details and your written analysis are saved.';}
async function prepareChart(file){
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>12*1024*1024)throw Error('Choose a PNG, JPEG or WebP under 12 MiB. Export HEIC photos as JPEG first.');
 const url=URL.createObjectURL(file),image=new Image();
 try{
  await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('This image could not be opened.'));image.src=url;});
  if(!image.naturalWidth||!image.naturalHeight||Math.min(image.naturalWidth,image.naturalHeight)<32||image.naturalWidth*image.naturalHeight>24000000)throw Error('Use a readable chart under 24 megapixels.');
  const scale=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
  let data=canvas.toDataURL('image/jpeg',.9);
  if(data.length>1398104)data=canvas.toDataURL('image/jpeg',.7);
  if(data.length>1398104)throw Error('Chart is still too large. Crop to the chart area and try again.');
  return {data_url:data};
 }finally{URL.revokeObjectURL(url);}
}
chartInput.addEventListener('change',async()=>{
 const epoch=++chartState.epoch,files=[...chartInput.files];chartState.images=[];chartPreview.replaceChildren();
 if(files.length>2){chartInput.value='';chartNote.textContent='Choose at most two charts.';return;}
 chartState.preparing=true;chartNote.textContent='Preparing charts…';
 try{
  const images=[];for(const file of files)images.push(await prepareChart(file));if(epoch!==chartState.epoch)return;
  chartState.images=images;
  images.forEach((item,i)=>{const img=document.createElement('img');img.src=item.data_url;img.alt='Chart '+(i+1)+' selected for this message';chartPreview.append(img);});
  chartNote.textContent=images.length+' chart(s) ready. Remove private account details before sending. Images are not kept in KST history.';
 }catch(e){if(epoch===chartState.epoch){chartState.images=[];chartInput.value='';chartNote.textContent=e.message;}}
 finally{if(epoch===chartState.epoch)chartState.preparing=false;}
});
document.querySelector('#clearCharts').addEventListener('click',clearChartAttachments);
for(const button of document.querySelectorAll('[data-chart-prompt]'))button.addEventListener('click',()=>{document.querySelector('#chatInput').value=button.dataset.chartPrompt;document.querySelector('#chatInput').focus();});
