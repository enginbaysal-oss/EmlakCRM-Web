/* EmlakCRM cross-domain account migration: authenticated, additive, one time per category.
 * The legacy github.io origin remains authoritative for local records until a backup exists.
 * This module NEVER reads another origin's storage, NEVER changes Supabase data.
 */
import {KINDS,validateBackupRow,mergeAll} from "./bulut-yedek-core.js";

export const MIGRATION_ORIGIN="https://emlkcrm.com.tr";
export const API="https://tffvwxskvjuxoekwgdef.supabase.co";
export const PUBLIC_KEY="sb_publishable_ADLnhwviFBqWtBkq94Adag_ULlAuzUe";
const prefixes={clients:"emlakcrm_demo_v1__owner_",portfolios:"emlakcrm_portfoy_rapor_v1__owner_",external_portfolios:"emlakcrm_external_portfolios_v1__owner_"};
const parse=s=>{try{return JSON.parse(s)}catch{return null}};
const uuid=v=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const obj=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const isActive=()=>typeof location!=="undefined"&&location.origin===MIGRATION_ORIGIN&&(location.pathname==="/"||location.pathname==="/index.html"||location.pathname.startsWith("/app/"));
let running=false;

function label(message,severity="notice"){
 const show=()=>{
  if(!document.body)return;
  let box=document.getElementById("emlakcrm-auto-migration-status");
  if(!box){
   box=document.createElement("aside");
   box.id="emlakcrm-auto-migration-status";
   box.style.cssText="padding:11px 16px;margin:8px auto;max-width:1100px;border:1px solid #c8dae5;border-radius:10px;font:600 13px/1.5 system-ui;color:#1e5368;background:#eef7fc";
   document.body.prepend(box);
  }
  box.style.background=severity==="warning"?"#fff3e2":severity==="error"?"#fff0ef":"#eef7fc";
  box.textContent=message;
 };
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",show,{once:true});else show();
}
export async function accountAuth(deps={fetch:globalThis.fetch,sessionStorage:globalThis.sessionStorage,localStorage:globalThis.localStorage,scope:globalThis.emlakcrmAccountDataScope}){
 const s=deps.sessionStorage,l=deps.localStorage,scope=deps.scope;
 const saved=parse(s.getItem("emlakcrm_auth_session_v1")||l.getItem("emlakcrm_auth_remember_v1"));
 const current=scope?.currentUserId?.();
 if(!saved?.access_token||!uuid(current))return null;
 const headers={apikey:PUBLIC_KEY,Authorization:"Bearer "+saved.access_token};
 const response=await deps.fetch(API+"/auth/v1/user",{method:"GET",headers,cache:"no-store",credentials:"omit"});
 if(!response.ok)throw Error("Oturum doğrulanamadı, yeni adreste tekrar giriş yapın.");
 const user=await response.json(),uid=String(user?.id||"").toLowerCase();
 if(uid!==current||!uuid(uid))throw Error("Oturum ve kullanıcı hesapları uyuşmuyor.");
 const active=l.getItem("emlakcrm_active_account_v1");
 if(active&&active!==uid)throw Error("Bu cihazda farklı bir hesabın kaydı var; aktarım durduruldu.");
 if(!active)l.setItem("emlakcrm_active_account_v1",uid);
 if(l.getItem("emlakcrm_active_account_v1")!==uid)throw Error("Hesap değişti.");
 return {uid,headers};
}
async function getLatest(kind,auth,deps){
 const q=new URLSearchParams({select:"id,kind,item_count,payload,created_at",user_id:"eq."+auth.uid,kind:"eq."+kind,order:"created_at.desc",limit:"1"});
 const response=await deps.fetch(API+"/rest/v1/emlakcrm_user_backups?"+q,{method:"GET",headers:auth.headers,cache:"no-store",credentials:"omit"});
 if(!response.ok)throw Error("Bulut yedeği okunamadı ("+response.status+").");
 const rows=await response.json();
 if(!Array.isArray(rows)||rows.length>1)throw Error("Yedek listesi hatalı.");
 if(!rows.length)return null;
 const row=rows[0];
 if(row.kind!==kind)throw Error("Yanlış veri türü döndü.");
 validateBackupRow(row,row);
 return row;
}
function ownLocal(uid,storage){
 const raw={},data={};
 for(const kind of KINDS){
  raw[kind]=storage.getItem(prefixes[kind]+uid);
  data[kind]=raw[kind]===null?null:parse(raw[kind]);
  if(raw[kind]!==null&&data[kind]===null)throw Error("Bu cihazın "+kind+" verisi okunamadı, üzerine yazılmayacak.");
  // Older manually restored customer objects may lack the empty agenda arrays.
  // Repair only their in-memory shape, never destroy the original raw record.
  if(kind==="clients"&&obj(data[kind])&&Array.isArray(data[kind].clients)){
   data[kind]={...data[kind],
    tasks:Array.isArray(data[kind].tasks)?data[kind].tasks:[],
    offices:Array.isArray(data[kind].offices)?data[kind].offices:[],
    members:Array.isArray(data[kind].members)?data[kind].members:[]};
  }
 }
 return {raw,data};
}
export async function syncOnce(deps={fetch:globalThis.fetch,sessionStorage:globalThis.sessionStorage,localStorage:globalThis.localStorage,scope:globalThis.emlakcrmAccountDataScope}){
 const auth=await accountAuth(deps);
 if(!auth)return {status:"not_signed_in",added:0,missing:KINDS.slice()};
 const markerKey="emlakcrm_auto_migration_v1__owner_"+auth.uid;
 const oldMarker=deps.localStorage.getItem(markerKey);
 const marker=parse(oldMarker);
 if(oldMarker!==null&&!obj(marker))throw Error("Eski aktarım işareti okunamadı; kayıtlar değiştirilmeyecek.");
 const completed={...(marker||{})};
 const backup={},missing=[],newKinds=[],versions={};
 for(const kind of KINDS){
  // A category is complete only through the exact snapshot ID last imported.
  // More recent snapshots from the original domain may contain new records.
  const row=await getLatest(kind,auth,deps);
  if(!row){backup[kind]=[];missing.push(kind);continue}
  if(completed[kind]===row.id){backup[kind]=[];continue}
  backup[kind]=row.payload;
  versions[kind]=row.id;
  newKinds.push(kind);
 }
 if(!newKinds.length)return {status:missing.length?"waiting_cloud":"already_migrated",added:0,missing};
 // Server identity is authoritative again immediately before local writes.
 const verified=await accountAuth(deps);
 if(!verified||verified.uid!==auth.uid)throw Error("İşlem sırasında hesap değişti.");
 const local=ownLocal(auth.uid,deps.localStorage);
 const joined=mergeAll(local.data,backup);
 const keys=Object.fromEntries(KINDS.map(kind=>[kind,prefixes[kind]+auth.uid]));
 for(const kind of KINDS)if(deps.localStorage.getItem(keys[kind])!==local.raw[kind])
  throw Error("Bu sırada cihaz kayıtları değişti; veriler korunuyor.");
 const writes=newKinds.map(kind=>[kind,JSON.stringify(joined.updated[kind])]);
 const written=[];
 try{
  for(const [kind,value] of writes){
   deps.localStorage.setItem(keys[kind],value);
   written.push(kind);
   if(deps.localStorage.getItem(keys[kind])!==value)throw Error("Cihaz kaydı doğrulanamadı.");
  }
  for(const kind of newKinds)completed[kind]=versions[kind];
  deps.localStorage.setItem(markerKey,JSON.stringify(completed));
 }catch(e){
  for(const kind of written.reverse()){
   try{
    if(local.raw[kind]===null)deps.localStorage.removeItem(keys[kind]);
    else deps.localStorage.setItem(keys[kind],local.raw[kind]);
   }catch(_){}
  }
  try{if(oldMarker===null)deps.localStorage.removeItem(markerKey);else deps.localStorage.setItem(markerKey,oldMarker)}catch(_){}
  throw Error("Aktarım güvenli şekilde tamamlanamadı; eski kayıtlar korunmaya çalışıldı. "+String(e?.message||e));
 }
 return {status:missing.length?"partial":"migrated",added:joined.added,missing,restoredKinds:newKinds};
}
export async function run(){
 if(!isActive()||running)return;
 running=true;
 try{
  const result=await syncOnce();
  if(result.status==="not_signed_in")return;
  if(result.status==="waiting_cloud")
   label("☁️ Eski hesaptaki verileriniz korunuyor. Bu hesapta henüz bulut yedeği yok; eski EmlakCRM açıldığında otomatik eşitlenecek.","warning");
  if(result.status==="partial")
   label("☁️ "+result.restoredKinds.length+" yedek grubu aktarıldı. Eksik gruplar eski uygulama açıldığında otomatik tamamlanacak.","warning");
  if((result.status==="migrated"||result.status==="partial")&&result.added>0){
   // CRM reads localStorage during initial render. Re-read after migration exactly once.
   location.reload();
  }
 }catch(err){
  label("⚠️ Hesap verileri otomatik alınamadı: "+String(err?.message||err)+". Eski EmlakCRM kayıtları korunur.","error");
 }finally{running=false}
}
if(isActive())void run();
