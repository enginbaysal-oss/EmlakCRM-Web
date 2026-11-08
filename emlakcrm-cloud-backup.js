/* EmlakCRM: authenticated, account-scoped, append-only cloud snapshots.
 * Never reads or uploads unscoped legacy data. No automatic cloud-to-local writes. */
(()=>{
"use strict";
const PROJECT="https://tffvwxskvjuxoekwgdef.supabase.co";
const KEY="sb_publishable_ADLnhwviFBqWtBkq94Adag_ULlAuzUe";
const TYPES={clients:{prefix:"emlakcrm_demo_v1__owner_",array:"clients"},portfolios:{prefix:"emlakcrm_portfoy_rapor_v1__owner_",array:"portfolios"}};
const attempts=new Map(),lastRaw=new Map(),timers=new Map();let busy=false;
const notify=message=>{const el=document.getElementById("crmCloudBackupStatus");if(el)el.textContent=message};
const parse=value=>{try{return JSON.parse(value)}catch{return null}};
const accountId=()=>window.emlakcrmAccountDataScope?.currentUserId?.()||null;
const currentSession=()=>parse(sessionStorage.getItem("emlakcrm_auth_session_v1")||localStorage.getItem("emlakcrm_auth_remember_v1"));
async function verified(){
 const uid=accountId(),saved=currentSession();
 if(!uid||!saved?.access_token||localStorage.getItem("emlakcrm_active_account_v1")!==uid)return null;
 const headers={apikey:KEY,Authorization:"Bearer "+saved.access_token};
 const r=await fetch(PROJECT+"/auth/v1/user",{headers,cache:"no-store"});
 if(!r.ok)return null;
 const user=await r.json();
 if(!user?.id||user.id!==uid||user.id!==accountId())return null;
 return {uid,headers};
}
async function hash(text){
 const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));
 return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
function ownKey(kind){const uid=accountId();return uid?TYPES[kind].prefix+uid:null}
async function upload(kind,force=false){
 if(busy){schedule(kind,2800);return}
 const k=ownKey(kind);if(!k)return;
 const raw=localStorage.getItem(k);
 if(!raw||(!force&&lastRaw.get(k)===raw))return;
 const obj=parse(raw),items=obj?.[TYPES[kind].array];
 if(!Array.isArray(items)||!items.length)return;
 if(items.length>20000){notify("Bulut yedeği durdu: kayıt sınırı aşıldı.");return}
 const payload=JSON.stringify(items);
 if(new TextEncoder().encode(payload).byteLength>20*1024*1024){
  notify("Bulut yedeği 20 MB sınırını aştı. Cihaz yedeğinizi indirin; görsel boyutlarını azaltın.");return
 }
 busy=true;
 try{
  const auth=await verified();
  if(!auth||k!==ownKey(kind)){notify("Bulut yedekleme için hesabınızda tekrar giriş yapın.");return}
  const fingerprint=await hash(payload);
  const r=await fetch(PROJECT+"/rest/v1/emlakcrm_user_backups?on_conflict=user_id,kind,fingerprint",{
   method:"POST",
   headers:{...auth.headers,"Content-Type":"application/json",Prefer:"resolution=ignore-duplicates,return=minimal"},
   body:JSON.stringify({user_id:auth.uid,kind,payload:items,item_count:items.length,fingerprint}),
   cache:"no-store"
  });
  if(!r.ok)throw Error("Sunucu yedeği kabul etmedi ("+r.status+").");
  lastRaw.set(k,raw);attempts.set(kind,0);
  notify("☁️ Güvenli bulut yedeği güncellendi: "+new Date().toLocaleString("tr-TR")+".");
 }catch(e){
  notify("⚠️ Bulut yedeği kaydedilemedi: "+String(e.message||e)+". Cihaz yedeğinizi koruyun.");
  const n=attempts.get(kind)||0;attempts.set(kind,n+1);
  if(n<3)setTimeout(()=>schedule(kind,2000),30000);
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
window.EmlakCRMCloudBackup={run:async()=>{notify("☁️ Bulut yedeği hazırlanıyor…");await upload("clients",true);await upload("portfolios",true)}};
const manual=document.getElementById("crmCloudBackupNow");if(manual)manual.addEventListener("click",()=>{void window.EmlakCRMCloudBackup.run()});
window.setTimeout(()=>{schedule("clients",1000);schedule("portfolios",3000)},5000);
window.setInterval(()=>{schedule("clients",1000);schedule("portfolios",3500)},120000);
})();