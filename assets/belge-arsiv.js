(()=>{"use strict";
const $=id=>document.getElementById(id);
const DB="emlakcrm_pdf_archive_v1__owner_"+(window.emlakcrmAccountDataScope?.currentUserId()||"anonymous");
function store(mode,item){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB,1);req.onupgradeneeded=()=>req.result.createObjectStore("docs",{keyPath:"id"});req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction("docs",mode==="all"?"readonly":"readwrite"),s=tx.objectStore("docs"),q=mode==="all"?s.getAll():mode==="del"?s.delete(item):s.put(item);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);tx.oncomplete=()=>db.close()}})}
function b64(bytes){let result="";for(let i=0;i<bytes.length;i+=8192)result+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(result)}
async function save(doc){const bytes=new Uint8Array(await doc.file.arrayBuffer());if(window.EmlakCRMAndroid?.savePdf)window.EmlakCRMAndroid.savePdf(b64(bytes),doc.name);else{const url=URL.createObjectURL(doc.file),a=document.createElement("a");a.href=url;a.download=doc.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000)}}
async function share(doc){const bytes=new Uint8Array(await doc.file.arrayBuffer());if(window.EmlakCRMAndroid?.sharePdf){window.EmlakCRMAndroid.sharePdf(b64(bytes),doc.name);return}const f=new File([bytes],doc.name,{type:"application/pdf"});if(navigator.canShare?.({files:[f]}))await navigator.share({files:[f]});else alert("Önce Kaydet ile PDF'yi indirip WhatsApp'ta belge olarak gönderin.")}
async function archive(){const panel=$("pdfArchiveItems");panel.textContent="";const docs=(await store("all")).sort((a,b)=>b.time.localeCompare(a.time));if(!docs.length){panel.textContent="Henüz kayıtlı PDF yok.";return}for(const doc of docs){const line=document.createElement("p");line.textContent=doc.name+" · "+new Date(doc.time).toLocaleString("tr-TR")+" ";for(const [label,fn] of [["Kaydet",()=>save(doc)],["WhatsApp",()=>share(doc)],["Sil",async()=>{if(confirm("Arşiv belgesi silinsin mi?")){await store("del",doc.id);await archive()}}]]){const b=document.createElement("button");b.textContent=label;b.onclick=()=>Promise.resolve(fn()).catch(e=>alert(e.message));line.appendChild(b)}panel.appendChild(line)}}
function image(src){return new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error("Belge görseli açılamadı"));im.src=src})}
// The archived PDF is generated here (not by the HTML print stylesheet).
// A4 output: 1240px raster is drawn onto a 595.28pt PDF page.
const PDF_NAVY="#153f78";
const PDF_WIDTH=1240,PDF_HEIGHT=1754,PDF_A4_PT=595.28;
const PDF_POINT_SIZES=[12.5,12,11.5,11]; // Never reduce below 11pt.
function wrappedText(ctx,text,width){
 const lines=[];
 for(const paragraph of String(text).replace(/\r/g,"").split("\n")){
  if(!paragraph.trim()){lines.push("");continue;}
  let line="";
  for(const word of paragraph.trim().split(/\s+/)){
   if(line && ctx.measureText(line+" "+word).width<=width){line+=" "+word;continue;}
   if(line){lines.push(line);line="";}
   if(ctx.measureText(word).width<=width){line=word;continue;}
   let segment="";
   for(const char of word){
    if(segment && ctx.measureText(segment+char).width>width){lines.push(segment);segment=char;}
    else segment+=char;
   }
   line=segment;
  }
  lines.push(line);
 }
 return lines;
}
function fieldLayout(ctx,text,width,height){
 const usableWidth=width-6,usableHeight=height-4;
 if(!Number.isFinite(usableWidth)||!Number.isFinite(usableHeight)||usableWidth<=0||usableHeight<=0)return null;
 for(const points of PDF_POINT_SIZES){
  const pixels=points*PDF_WIDTH/PDF_A4_PT;
  ctx.font="700 "+pixels+"px Arial";
  const lines=wrappedText(ctx,text,usableWidth),lineHeight=pixels*1.13;
  if(lines.length*lineHeight<=usableHeight+.5 && lines.every(line=>ctx.measureText(line).width<=usableWidth+.5)){
   return {pixels,lineHeight,lines,points};
  }
 }
 return null;
}
async function navySignature(src,width,height){
 const img=await image(src);
 const mask=document.createElement("canvas");
 mask.width=Math.max(1,Math.round(width));mask.height=Math.max(1,Math.round(height));
 const ink=mask.getContext("2d");
 ink.drawImage(img,0,0,mask.width,mask.height);
 ink.globalCompositeOperation="source-in";
 ink.fillStyle=PDF_NAVY;
 ink.fillRect(0,0,mask.width,mask.height);
 ink.globalCompositeOperation="source-over";
 return mask;
}
async function makePdf(){
 if(!window.PDFLib)throw Error("PDF motoru yüklenemedi");
 const t=templates[selected];
 if(!t)throw Error("Önce bir belge şablonu seçiniz.");
 const pdf=await PDFLib.PDFDocument.create();
 for(let pi=0;pi<t.pages.length;pi++){
  const canvas=document.createElement("canvas");
  canvas.width=PDF_WIDTH;canvas.height=PDF_HEIGHT;
  const ctx=canvas.getContext("2d");
  if(!ctx)throw Error("PDF çizim alanı oluşturulamadı.");
  ctx.drawImage(await image(t.pages[pi]),0,0,PDF_WIDTH,PDF_HEIGHT);
  for(const f of t.fields.filter(x=>Number(x.page)===pi&&values[x.id])){
   const pos=f.type==="signature"?signaturePositions[f.id]:null;
   const x=PDF_WIDTH*Number(pos?.xPct??f.xPct)/100,y=PDF_HEIGHT*Number(pos?.yPct??f.yPct)/100;
   const w=PDF_WIDTH*Number(f.wPct)/100,h=PDF_HEIGHT*Number(f.hPct)/100;
   if(![x,y,w,h].every(Number.isFinite)||w<=0||h<=0)throw Error("Şablonda geçersiz alan ölçüsü bulundu.");
   if(f.type==="signature"&&String(values[f.id]).startsWith("data:image/")){
    // Recolor saved older signatures as well, without editing their stored originals.
    ctx.drawImage(await navySignature(values[f.id],w,h),x,y,w,h);
   }else{
    const content=String(values[f.id]),layout=fieldLayout(ctx,content,w,h);
    if(!layout){
     const label=String(f.label||"Belge alanı").slice(0,90);
     throw Error("“"+label+"” yazısı 11 puntoyla bile bu alana sığmıyor. Yazıyı kısaltın veya alanı büyütün; okunmaz hâle getirmek için küçültülmedi. PDF oluşturulmadı.");
    }
    ctx.save();
    ctx.font="700 "+layout.pixels+"px Arial";
    ctx.fillStyle=PDF_NAVY;ctx.textBaseline="top";
    layout.lines.forEach((line,i)=>ctx.fillText(line,x+3,y+2+i*layout.lineHeight));
    ctx.restore();
   }
  }
  const png=await pdf.embedPng(canvas.toDataURL("image/png"));
  const page=pdf.addPage([PDF_A4_PT,841.89]);
  page.drawImage(png,{x:0,y:0,width:PDF_A4_PT,height:841.89});
 }
 return new Blob([await pdf.save()],{type:"application/pdf"});
}
let latest=null;
$("print").textContent="PDF Oluştur";
$("print").onclick=async()=>{const b=$("print");b.disabled=true;b.textContent="PDF hazırlanıyor…";try{const file=await makePdf(),name=String(templates[selected].name||"Belge").replace(/[\\/:*?"<>|]/g," ").slice(0,80)+".pdf";latest={id:String(Date.now())+"-"+Math.random(),name,time:new Date().toISOString(),file};await store("put",latest);$("pdfActions").hidden=false;$("status").textContent="PDF arşive kaydedildi.";await archive();$("pdfActions").scrollIntoView({block:"center"})}catch(e){alert("PDF oluşturulamadı: "+e.message)}finally{b.disabled=false;b.textContent="PDF Oluştur"}};
$("pdfSave").onclick=()=>latest&&save(latest).catch(e=>alert(e.message));
$("pdfShare").onclick=()=>latest&&share(latest).catch(e=>alert(e.message));
$("archiveOpen").onclick=async()=>{$("pdfArchive").hidden=!$("pdfArchive").hidden;if(!$("pdfArchive").hidden)await archive()};
})();