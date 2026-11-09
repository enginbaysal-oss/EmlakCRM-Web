/* EmlakCRM Drone: latest video replay and WhatsApp file sharing.
 * Each video stays on this device in per-account IndexedDB; never uploaded publicly.
 * No image/flight recording logic changes here.
 */
(function(){
"use strict";
const $=id=>document.getElementById(id);
const watch=$("lastVideoWatch"),send=$("lastVideoWhatsapp"),overlay=$("lastVideoModal");
const player=$("lastVideoPlayer"),info=$("lastVideoInfo");
if(!watch||!send||!overlay||!player)return;
let latest=null,previewUrl=null,loadVersion=0,seenOwner=null;
function ownerId(){
 const id=window.emlakcrmAccountDataScope?.currentUserId?.();
 return typeof id==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)?id.toLowerCase():null;
}
function usable(){
 const uid=ownerId();
 return uid&&latest?.owner===uid&&latest.blob instanceof Blob&&latest.blob.size>0?latest:null;
}
function buttons(){
 const ready=!!usable();
 watch.disabled=!ready;send.disabled=!ready;
 $("lastVideoSave").disabled=!ready;
 $("lastVideoSendAgain").disabled=!ready;
}
function notice(message){const element=$("status");if(element)element.textContent=message;}
function stopPreview(){
 player.pause();player.removeAttribute("src");player.load();
 if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null;}
 overlay.hidden=true;document.body.classList.remove("video-preview-open");
}
function openDB(uid){
 return new Promise((resolve,reject)=>{
  if(!window.indexedDB){reject(new Error("indexeddb_unavailable"));return;}
  const req=indexedDB.open("emlakcrm_drone_last_video__owner_"+uid,1);
  req.onupgradeneeded=()=>{
   const db=req.result;
   if(!db.objectStoreNames.contains("videos"))db.createObjectStore("videos",{keyPath:"id"});
  };
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error||new Error("database_open_failed"));
  req.onblocked=()=>reject(new Error("database_blocked"));
 });
}
async function dbAction(uid,method,item){
 const db=await openDB(uid);
 return new Promise((resolve,reject)=>{
  let settled=false;
  function finish(error,value){
   if(settled)return;settled=true;
   try{db.close()}catch(_){}
   if(error)reject(error);else resolve(value);
  }
  try{
   const tx=db.transaction("videos",method==="get"?"readonly":"readwrite");
   const store=tx.objectStore("videos");
   const request=method==="get"?store.get("latest"):store.put(item);
   tx.oncomplete=()=>finish(null,request.result);
   tx.onerror=()=>finish(tx.error||new Error("video_storage_error"));
   tx.onabort=()=>finish(tx.error||new Error("video_storage_aborted"));
  }catch(error){finish(error)}
 });
}
async function restoreLast(){
 const version=++loadVersion,uid=ownerId();
 seenOwner=uid;
 if(!uid){latest=null;stopPreview();buttons();return;}
 try{
  const saved=await dbAction(uid,"get");
  if(version!==loadVersion||ownerId()!==uid)return;
  if(saved&&saved.owner===uid&&saved.blob instanceof Blob&&saved.blob.size>0){
   latest=saved;
  }else latest=null;
 }catch(_){
  if(version!==loadVersion||ownerId()!==uid)return;
  latest=null; // Never fall back to another account's video.
 }
 if(version===loadVersion)buttons();
}
function checkOwner(){
 const uid=ownerId();
 if(uid!==seenOwner){
  latest=null;stopPreview();buttons();
  void restoreLast();
 }else buttons();
}
function extFrom(blob){
 return /^video\/mp4/i.test(blob.type)?".mp4":".webm";
}
function nameFor(blob){
 return "EmlakCRM-Drone-Cekim-"+new Date().toISOString().replace(/[:.]/g,"-")+extFrom(blob);
}
function download(){
 const video=usable();
 if(!video){notice("Bu hesapta son video bulunamadı.");return false;}
 const url=URL.createObjectURL(video.blob);
 const a=document.createElement("a");
 a.href=url;a.download=video.filename;
 document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),60000);
 return true;
}
function openPreview(){
 const video=usable();
 if(!video){notice("Son video bulunamadı. Önce yeni bir çekim kaydedin.");return;}
 stopPreview();
 previewUrl=URL.createObjectURL(video.blob);
 player.src=previewUrl;
 info.textContent=video.filename+" • "+new Date(video.createdAt).toLocaleString("tr-TR")+
  (video.persisted===false?" • Yalnızca bu açık sekmede saklanıyor":" • Bu cihazda saklanıyor");
 overlay.hidden=false;
 document.body.classList.add("video-preview-open");
 player.load();
}
async function shareViaWhatsApp(){
 const video=usable();
 if(!video){notice("Paylaşmak için önce bir video kaydı oluşturun.");return;}
 const file=new File([video.blob],video.filename,{type:(video.blob.type||"video/webm").split(";")[0]});
 if(typeof navigator.share==="function"&&typeof navigator.canShare==="function"&&navigator.canShare({files:[file]})){
  try{
   await navigator.share({files:[file],title:"EmlakCRM Drone Çekim"});
   notice("Paylaşım ekranı açıldı. WhatsApp'ı seçerek gönderimi tamamlayabilirsiniz.");
   return;
  }catch(error){
   if(error?.name==="AbortError"){notice("Video paylaşımı iptal edildi.");return;}
   // Native share rejected the file; use manual WhatsApp attachment.
  }
 }
 if(download()){
  const isMobile=/Android|iPad|iPhone|iPod/i.test(navigator.userAgent);
  const url=isMobile?"https://wa.me/":"https://web.whatsapp.com/";
  window.open(url,"_blank","noopener,noreferrer");
  notice("Video indirildi. WhatsApp'ta ilgili sohbeti açıp ATAÇ simgesinden video dosyasını seçin. Dosya otomatik gönderilmez."+
   (extFrom(video.blob)===".webm"?" WebM kabul edilmiyorsa videoyu MP4'e dönüştürün.":""));
 }
}
async function remember(blob,filename){
 const uid=ownerId();
 if(!(blob instanceof Blob)||!blob.size)return;
 if(!uid){notice("Video indirildi, ancak hesap doğrulanmadığı için son kayıt özelliğine eklenmedi.");return;}
 const version=++loadVersion;
 const record={id:"latest",owner:uid,blob,filename:filename||nameFor(blob),createdAt:Date.now(),persisted:true};
 seenOwner=uid;latest=record;buttons();
 try{
  await dbAction(uid,"put",record);
  if(version===loadVersion&&ownerId()===uid){
   notice("Video indirildi ve bu hesabın son çekimi olarak cihaza kaydedildi. İzleyebilir veya WhatsApp'ta paylaşabilirsiniz.");
  }
 }catch(_){
  record.persisted=false;
  if(version===loadVersion&&ownerId()===uid){
   notice("Video indirildi. Son video bu sekmede izlenebilir; cihazda kalıcı saklama için yeterli alan/izin yok.");
  }
 }
}
watch.addEventListener("click",openPreview);
send.addEventListener("click",()=>void shareViaWhatsApp());
$("lastVideoSave").addEventListener("click",download);
$("lastVideoSendAgain").addEventListener("click",()=>void shareViaWhatsApp());
$("lastVideoClose").addEventListener("click",stopPreview);
overlay.addEventListener("click",e=>{if(e.target===overlay)stopPreview();});
document.addEventListener("keydown",e=>{
 if(e.key==="Escape"&&!overlay.hidden){stopPreview();}
});
window.addEventListener("focus",checkOwner);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)checkOwner()});
window.addEventListener("storage",e=>{
 if(e.key==="emlakcrm_active_account_v1"||e.key==="emlakcrm_auth_remember_v1")checkOwner();
});
window.addEventListener("beforeunload",()=>{
 if(previewUrl)URL.revokeObjectURL(previewUrl);
});
window.emlakcrmDroneVideo={remember};
void restoreLast();
})();