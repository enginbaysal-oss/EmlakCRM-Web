/* EmlakCRM: authenticated, account-scoped, append-only cloud snapshots.
 * Never reads or uploads unscoped legacy data. No automatic cloud-to-local writes. */
(()=>{
"use strict";
const PROJECT="https://tffvwxskvjuxoekwgdef.supabase.co";
const KEY="sb_publishable_ADLnhwviFBqWtBkq94Adag_ULlAuzUe";
const TYPES={clients:{prefix:"emlakcrm_demo_v1__owner_",array:"clients"},portfolios:{prefix:"emlakcrm_portfoy_rapor_v1__owner_",array:"portfolios"},external_portfolios:{prefix:"emlakcrm_external_portfolios_v1__owner_",array:null}};
const attempts=new Map(),lastRaw=new Map(),timers=new Map();let busy=false;
const notify=message=>{const el=document.getElementById("crmCloudBackupStatus");if(el)el.textContent=message};
const parse=value=>{try{return JSON.parse(value)}catch{return null}};
const accountId=()=>window.emlakcrmAccountDataScope?.currentUserId?.()||null;
const currentSession=()=>parse(sessionStorage.getItem("emlakcrm_auth_session_v1")||localStorage.getItem("emlakcrm_auth_remember_v1"));
async function verified(){
 const uid=accountId(),saved=currentSession(),activeKey="emlakcrm_active_account_v1";
 if(!uid||!saved?.access_token)return null;
 const before=localStorage.getItem(activeKey);
 if(before&&before!==uid)return null; // fail closed on another active account
 const headers={apikey:KEY,Authorization:"Bearer "+saved.access_token};
 const r=await fetch(PROJECT+"/auth/v1/user",{headers,cache:"no-store"});
 if(!r.ok)return null;
 const user=await r.json();
 if(!user?.id||user.id!==uid||user.id!==accountId())return null;
 const now=localStorage.getItem(activeKey);
 if(now&&now!==uid)return null;
 if(!now)localStorage.setItem(activeKey,uid); // verified same-account session; missing marker only
 if(localStorage.getItem(activeKey)!==uid)return null;
 return {uid,headers};
}
async function hash(text){
 const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));
 return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
function ownKey(kind){const uid=accountId();return uid?TYPES[kind].prefix+uid:null}
async function upload(kind,force=false){
 const k=ownKey(kind);
 if(!k)return {kind,status:"auth"};
 const raw=localStorage.getItem(k);
 if(!raw)return {kind,status:"empty"};
 if(!force&&lastRaw.get(k)===raw)return {kind,status:"unchanged"};
 const obj=parse(raw),items=TYPES[kind].array?obj?.[TYPES[kind].array]:obj;
 if(!Array.isArray(items))return {kind,status:"invalid"};
 if(!items.length)return {kind,status:"empty"};
 if(items.length>(kind==="external_portfolios"?1000:20000))return {kind,status:"limit",count:items.length};
 const payload=JSON.stringify(items);
 if(new TextEncoder().encode(payload).byteLength>20*1024*1024)
  return {kind,status:"size",count:items.length};
 if(busy){schedule(kind,2800);return {kind,status:"scheduled"}}
 busy=true;
 try{
  const auth=await verified();
  if(!auth||k!==ownKey(kind))return {kind,status:"auth"};
  // A deliberate button press creates a new restore point even when data is unchanged.
  // Background backups still deduplicate identical content.
  const fingerprint=force
   ? await hash(payload+"\\nmanual-snapshot:"+crypto.randomUUID())
   : await hash(payload);
  const r=await fetch(PROJECT+"/rest/v1/emlakcrm_user_backups?on_conflict=user_id,kind,fingerprint",{
   method:"POST",
   headers:{...auth.headers,"Content-Type":"application/json",Prefer:"resolution=ignore-duplicates,return=minimal"},
   body:JSON.stringify({user_id:auth.uid,kind,payload:items,item_count:items.length,fingerprint}),
   cache:"no-store"
  });
  if(!r.ok){
   let extra="";try{const detail=await r.json();extra=String(detail?.message||detail?.hint||"").slice(0,130)}catch(_){}
   throw Error("Sunucu yedeği kabul etmedi ("+r.status+"). "+extra);
  }
  // Server-side verification distinguishes an existing identical snapshot from a new one.
  const qs=new URLSearchParams({select:"item_count,created_at",user_id:"eq."+auth.uid,
   kind:"eq."+kind,fingerprint:"eq."+fingerprint,order:"created_at.desc",limit:"1"});
  const check=await fetch(PROJECT+"/rest/v1/emlakcrm_user_backups?"+qs,{
   headers:auth.headers,cache:"no-store"
  });
  if(!check.ok)throw Error("Yedek gönderildi ancak sunucuda doğrulanamadı ("+check.status+").");
  const rows=await check.json();
  if(!Array.isArray(rows)||rows.length!==1||rows[0].item_count!==items.length)
   throw Error("Sunucu yedeği henüz doğrulanamadı. Mevcut kayıtlar korundu.");
  lastRaw.set(k,raw);attempts.set(kind,0);
  return {kind,status:"verified",count:items.length,createdAt:rows[0].created_at};
 }catch(e){
  const n=attempts.get(kind)||0;attempts.set(kind,n+1);
  if(!force&&n<3)setTimeout(()=>schedule(kind,2000),30000);
  return {kind,status:"error",message:String(e.message||e)};
 }finally{
  busy=false;
  if(k===ownKey(kind)&&raw!==localStorage.getItem(k))schedule(kind,1000);
 }
}
function schedule(kind,ms=2200){
 if(!TYPES[kind])return;
 clearTimeout(timers.get(kind));
 timers.set(kind,setTimeout(()=>{void upload(kind)},ms));
}
function checkKey(key){
 const uid=accountId();if(!uid)return;
 for(const [kind,type] of Object.entries(TYPES))if(key===type.prefix+uid)schedule(kind);
}
const original=Storage.prototype.setItem;
Storage.prototype.setItem=function(key,value){
 const result=original.call(this,key,value);
 if(this===localStorage)checkKey(String(key));
 return result;
};
window.addEventListener("storage",event=>{if(event.storageArea===localStorage&&event.key)checkKey(event.key)});
function resultLabel(result){
 const label=result.kind==="clients"?"Müşteri":result.kind==="external_portfolios"?"Çekilen Portföy":"Portföy";
 switch(result.status){
  case "verified":return "✓ "+label+": "+result.count+" kayıt bulutta doğrulandı (yedek tarihi: "+new Date(result.createdAt).toLocaleString("tr-TR")+"). Aynı içerik yeniden yedek oluşturmaz.";
  case "empty":return label+": Bu cihazda yedeklenecek kayıt bulunamadı.";
  case "unchanged":return label+": Son kayıtlarla aynı; tekrar yedeklemeye gerek yok.";
  case "auth":return label+": Hesap doğrulanamadı. Uygulamada kendi hesabınızla yeniden giriş yapın.";
  case "invalid":return label+": Yerel kayıt okunamadı. Mevcut dosya yedeğini koruyun.";
  case "size":return label+": Kayıtlar 20 MB sınırını aşıyor; dosya yedeğinizi koruyun.";
  case "limit":return label+": Liste kayıt sınırını aşıyor.";
  case "scheduled":return label+": Başka yedekleme tamamlanınca yeniden denenecek.";
  default:return "⚠️ "+label+": "+(result.message||"Bulut yedekleme tamamlanamadı.");
 }
}
let manualRunning=false;
async function manualRun(){
 if(manualRunning)return;
 manualRunning=true;
 const btn=document.getElementById("crmCloudBackupNow"),label=btn?.textContent;
 if(btn){btn.disabled=true;btn.textContent="☁️ Yedekleniyor…"}
 notify("☁️ Müşteri, portföy ve çekilen ilan yedekleri kontrol ediliyor…");
 try{
  const results=[await upload("clients",true),await upload("portfolios",true),await upload("external_portfolios",true)];
  notify(results.map(resultLabel).join("  |  "));
  return results;
 }catch(err){
  notify("⚠️ Yedekleme başlatılamadı: "+String(err?.message||err));
 }finally{
  manualRunning=false;
  if(btn){btn.disabled=false;btn.textContent=label||"☁️ Şimdi Buluta Yedekle"}
 }
}
window.EmlakCRMCloudBackup={run:manualRun};
document.addEventListener("click",event=>{
 const btn=event.target?.closest?.("#crmCloudBackupNow");
 if(btn){event.preventDefault();void manualRun()}
});
window.setTimeout(()=>{schedule("clients",1000);schedule("portfolios",3000);schedule("external_portfolios",5000)},5000);
window.setInterval(()=>{schedule("clients",1000);schedule("portfolios",3500);schedule("external_portfolios",6000)},120000);
// Once a member returns to their ORIGINAL browser, bring any unsynced local changes
// into their own append-only cloud history without asking them to press a button.
// Do not send empty arrays or another user's scoped data; existing upload() gates apply.
function syncOnReturn(){
 schedule("clients",350);
 schedule("portfolios",900);
 schedule("external_portfolios",1500);
}
window.addEventListener("focus",syncOnReturn);
window.addEventListener("online",syncOnReturn);
window.addEventListener("pageshow",syncOnReturn);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)syncOnReturn()});
})();