(()=>{"use strict";
const $=id=>document.getElementById(id);
const DB="emlakcrm_pdf_archive_v1__owner_"+(window.emlakcrmAccountDataScope?.currentUserId()||"anonymous");
function store(mode,item){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB,1);req.onupgradeneeded=()=>req.result.createObjectStore("docs",{keyPath:"id"});req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction("docs",mode==="all"?"readonly":"readwrite"),s=tx.objectStore("docs"),q=mode==="all"?s.getAll():mode==="del"?s.delete(item):s.put(item);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);tx.oncomplete=()=>db.close()}})}
function b64(bytes){let result="";for(let i=0;i<bytes.length;i+=8192)result+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(result)}
async function save(doc){const bytes=new Uint8Array(await doc.file.arrayBuffer());if(window.EmlakCRMAndroid?.savePdf)window.EmlakCRMAndroid.savePdf(b64(bytes),doc.name);else{const url=URL.createObjectURL(doc.file),a=document.createElement("a");a.href=url;a.download=doc.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000)}}
async function share(doc){const bytes=new Uint8Array(await doc.file.arrayBuffer());if(window.EmlakCRMAndroid?.sharePdf){window.EmlakCRMAndroid.sharePdf(b64(bytes),doc.name);return}const f=new File([bytes],doc.name,{type:"application/pdf"});if(navigator.canShare?.({files:[f]}))await navigator.share({files:[f]});else alert("Önce Kaydet ile PDF'yi indirip WhatsApp'ta belge olarak gönderin.")}
let archivePreviewUrl=null;
function closeArchivePreview(){
 const target=$("archivePreview");
 if(target){target.replaceChildren();target.hidden=true;}
 if(archivePreviewUrl){URL.revokeObjectURL(archivePreviewUrl);archivePreviewUrl=null;}
}
function previewArchivedDocument(doc){
 const panel=$("archivePreview");
 closeArchivePreview();
 if(!(doc.file instanceof Blob)){alert("Arşiv belgesi bu cihazda okunamadı.");return;}
 archivePreviewUrl=URL.createObjectURL(doc.file);
 const heading=document.createElement("div");
 heading.className="archiveHeader";
 const title=document.createElement("strong");title.textContent=doc.name||"PDF Belgesi";
 const open=document.createElement("a");
 open.textContent="Yeni sekmede aç";open.href=archivePreviewUrl;open.target="_blank";open.rel="noopener noreferrer";
 const close=document.createElement("button");close.type="button";close.textContent="Önizlemeyi Kapat";
 close.className="archiveClose";close.onclick=closeArchivePreview;
 heading.append(title,open,close);
 const iframe=document.createElement("iframe");
 iframe.title=(doc.name||"PDF")+" — arşiv önizleme";
 iframe.src=archivePreviewUrl;
 panel.append(heading,iframe);panel.hidden=false;
 panel.scrollIntoView({behavior:"smooth",block:"start"});
}
async function archive(){
 const panel=$("pdfArchiveItems"),status=$("archiveStatus"),count=$("archiveCount");
 panel.replaceChildren();status.textContent="Kayıtlı belgeler yükleniyor…";
 try{
  const docs=(await store("all")).sort((a,b)=>String(b.time||"").localeCompare(String(a.time||"")));
  count.textContent=docs.length+" belge";
  if(!docs.length){
   status.textContent="Bu hesap için bu cihazda henüz kayıtlı PDF bulunamadı.";
   return;
  }
  status.textContent=docs.length+" kayıt bulundu. Açmak istediğin belgeyi aşağıdan seç.";
  for(const doc of docs){
   const row=document.createElement("article");row.className="archiveRow";
   const meta=document.createElement("div");meta.className="archiveMeta";
   const title=document.createElement("div");title.className="archiveName";
   title.textContent=doc.name||"İsimsiz PDF";
   const date=document.createElement("small");date.className="archiveDate";
   const parsed=new Date(doc.time);
   date.textContent=Number.isNaN(parsed.getTime())?"Tarih kaydı yok":parsed.toLocaleString("tr-TR",{dateStyle:"short",timeStyle:"short"});
   if(typeof doc.file?.size==="number")date.textContent+=" · "+Math.max(1,Math.round(doc.file.size/1024))+" KB";
   meta.append(title,date);
   const actions=document.createElement("div");actions.className="archiveActions";
   const choices=[
    ["Görüntüle",()=>previewArchivedDocument(doc),false],
    ["İndir",()=>save(doc),false],
    ["WhatsApp",()=>share(doc),false],
    ["Sil",async()=>{
     if(!confirm((doc.name||"Bu belge")+" arşivden kalıcı olarak silinsin mi?"))return;
     if(latest?.id===doc.id){latest=null;$("pdfActions").hidden=true;}
     closeArchivePreview();
     await store("del",doc.id);
     await archive();
    },true]
   ];
   for(const [label,task,danger] of choices){
    const button=document.createElement("button");button.type="button";button.textContent=label;
    if(danger)button.className="archiveDelete";
    button.onclick=async()=>{
     button.disabled=true;
     try{await task()}catch(error){status.textContent="Belge işlemi yapılamadı: "+String(error?.message||error)}
     finally{button.disabled=false;}
    };
    actions.append(button);
   }
   row.append(meta,actions);panel.append(row);
  }
 }catch(error){
  status.textContent="Arşiv listelenemedi: "+String(error?.message||error);
 }
}
function image(src){return new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error("Belge görseli açılamadı"));im.src=src})}
// The archived PDF is generated here (not by the HTML print stylesheet).
// A4 output: 1240px raster is drawn onto a 595.28pt PDF page.
const PDF_NAVY="#1653A3";
const PDF_RENDER_VERSION="Lacivert PDF v4";
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
const pdfVersionBadge=document.createElement("span");
pdfVersionBadge.id="pdfRendererVersion";
pdfVersionBadge.className="badge";
pdfVersionBadge.style.cssText="display:inline-flex;align-items:center;gap:5px;color:#1653A3;background:#edf4ff;border:1px solid #93b8e6;font-weight:750";
pdfVersionBadge.textContent="● "+PDF_RENDER_VERSION+" · en az 11 punto";
$("print").after(pdfVersionBadge);
$("print").onclick=async()=>{const b=$("print");b.disabled=true;b.textContent="PDF hazırlanıyor…";try{const file=await makePdf(),name=String(templates[selected].name||"Belge").replace(/[\\/:*?"<>|]/g," ").slice(0,80)+".pdf";latest={id:String(Date.now())+"-"+Math.random(),name,time:new Date().toISOString(),file};await store("put",latest);$("pdfActions").hidden=false;$("status").textContent="✓ Yeni PDF kaydedildi · Doldurulan yazılar lacivert (#1653A3) · En az 11 punto · "+PDF_RENDER_VERSION+". Önceden basılmış şablon metinleri kendi renginde kalır.";await archive();$("pdfActions").scrollIntoView({block:"center"})}catch(e){alert("PDF oluşturulamadı: "+e.message)}finally{b.disabled=false;b.textContent="PDF Oluştur"}};
$("pdfSave").onclick=()=>latest&&save(latest).catch(e=>alert(e.message));
$("pdfShare").onclick=()=>latest&&share(latest).catch(e=>alert(e.message));
$("archiveOpen").onclick=async()=>{
 const panel=$("pdfArchive"),button=$("archiveOpen");
 panel.hidden=false;button.setAttribute("aria-expanded","true");
 button.textContent="📂 Belge Arşivi Açık";
 closeArchivePreview();await archive();
 panel.scrollIntoView({behavior:"smooth",block:"start"});
};
$("archiveClose").onclick=()=>{
 const panel=$("pdfArchive"),button=$("archiveOpen");
 panel.hidden=true;button.setAttribute("aria-expanded","false");
 button.textContent="📂 Belge Arşivini Aç";
 closeArchivePreview();
};
})();