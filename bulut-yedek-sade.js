import {KINDS,buildRestorePoints,validateBackupRow,mergeAll} from "./bulut-yedek-core.js?v=20261111fix2";
const API="https://tffvwxskvjuxoekwgdef.supabase.co";
const KEY="sb_publishable_ADLnhwviFBqWtBkq94Adag_ULlAuzUe";
const $=id=>document.getElementById(id);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY_PREFIX={
 clients:"emlakcrm_demo_v1__owner_",
 portfolios:"emlakcrm_portfoy_rapor_v1__owner_",
 external_portfolios:"emlakcrm_external_portfolios_v1__owner_"
};
const parse=s=>{try{return JSON.parse(s)}catch{return null}};
let account=null,points=[],busy=false;
function status(msg,type="notice"){
 const e=$("status");e.className=type;e.textContent=msg;
}
function issue(msg){
 const e=$("result");e.className="bad";e.textContent=msg;
}
async function identify(){
 const saved=parse(sessionStorage.getItem("emlakcrm_auth_session_v1")||
                   localStorage.getItem("emlakcrm_auth_remember_v1"));
 if(!saved?.access_token)throw Error("Önce EmlakCRM'de hesabınıza giriş yapın.");
 const headers={apikey:KEY,Authorization:"Bearer "+saved.access_token};
 const r=await fetch(API+"/auth/v1/user",{method:"GET",headers,cache:"no-store",credentials:"omit"});
 if(!r.ok)throw Error("Oturum doğrulanamadı. EmlakCRM'ye yeniden giriş yapın.");
 const user=await r.json(),uid=String(user?.id||"").toLowerCase();
 if(!UUID.test(uid))throw Error("Hesap doğrulanamadı.");
 const active=localStorage.getItem("emlakcrm_active_account_v1");
 if(active&&active!==uid)throw Error("Bu cihazda başka bir EmlakCRM hesabı açık. İşlem güvenlik nedeniyle durduruldu.");
 if(!active){
  if(localStorage.getItem("emlakcrm_active_account_v1")!==null)
   throw Error("Bu sırada aktif hesap değişti.");
  localStorage.setItem("emlakcrm_active_account_v1",uid);
 }
 if(localStorage.getItem("emlakcrm_active_account_v1")!==uid)throw Error("Hesap doğrulanamadı.");
 return {uid,headers};
}
async function ownBackups(path,verified){
 const auth=await identify();
 if(auth.uid!==verified.uid)throw Error("Aktif hesap değişti; işlem durduruldu.");
 const url=API+"/rest/v1/emlakcrm_user_backups?"+path;
 const r=await fetch(url,{method:"GET",headers:auth.headers,cache:"no-store",credentials:"omit"});
 if(!r.ok)throw Error("Bulut yedeklerine erişilemedi ("+r.status+").");
 return r.json();
}
function updateSelection(){
 const selected=points.find(p=>String(p.minute)===$("date").value);
 $("restore").disabled=!selected||busy;
 if(!selected){$("detail").textContent="";return;}
 $("detail").textContent=
 "Bu tarihe kadar alınan son yedekler: "+selected.counts[0]+" müşteri · "+
 selected.counts[1]+" portföy · "+selected.counts[2]+" çekilen portföy.";
}
async function load(){
 const btn=$("reload");btn.disabled=true;
 status("Hesabınıza ait yedek tarihleri yükleniyor…");
 try{
  account=await identify();
  const params=new URLSearchParams({
   select:"id,kind,item_count,created_at,source",
   user_id:"eq."+account.uid,
   order:"created_at.desc",
   limit:"500"
  });
  const records=await ownBackups(params.toString(),account);
  points=buildRestorePoints(records);
  const select=$("date");select.replaceChildren();
  for(const point of points){
   const option=document.createElement("option");
   option.value=String(point.minute);
   option.textContent=new Date(point.date).toLocaleString("tr-TR",{dateStyle:"medium",timeStyle:"short"});
   select.append(option);
  }
  $("history").hidden=false;
  select.disabled=!points.length;
  $("restore").disabled=!points.length;
  if(!points.length){
   status("Bu hesap için bulut yedeği bulunamadı. Önce ana EmlakCRM'de 'Buluta Yedekle' düğmesine basın.","warn");
  }else{
   status("Bulut sunucusundan "+records.length+" yedek sürümü kontrol edildi. Son yedek: "+new Date(points[0].date).toLocaleString("tr-TR")+".","good");
  }
  updateSelection();
 }catch(e){
  account=null;points=[];
  $("history").hidden=true;
  status(String(e.message||e),"bad");
 }finally{btn.disabled=false;}
}
function readCurrent(uid){
 const raw={};const data={};
 for(const kind of KINDS){
  const key=KEY_PREFIX[kind]+uid;
  raw[kind]=localStorage.getItem(key);
  data[kind]=raw[kind]===null?null:parse(raw[kind]);
  if(raw[kind]!==null&&data[kind]===null)
   throw Error("Bu cihazdaki "+kind+" kayıtları okunamıyor; üzerine yazılmayacak.");
 }
 return {raw,data};
}
function saveSafetyDownload(uid,raw){
 const content=JSON.stringify({
  format:"EmlakCRM-Bulut-Geri-Yukleme-Oncesi",
  version:1,user_id:uid,exported_at:new Date().toISOString(),raw
 });
 const url=URL.createObjectURL(new Blob([content],{type:"application/json;charset=utf-8"}));
 try{
  const a=document.createElement("a");
  a.href=url;a.download="EmlakCRM_GeriYukleme_Oncesi_"+new Date().toLocaleDateString("sv-SE")+".json";
  document.body.appendChild(a);a.click();a.remove();
 }finally{setTimeout(()=>URL.revokeObjectURL(url),30000);}
}
async function restoreAll(){
 if(busy)return;
 const point=points.find(p=>String(p.minute)===$("date").value);
 if(!point||!account){issue("Önce tarih ve saat seçin.");return;}
 busy=true;$("restore").disabled=true;$("reload").disabled=true;
 $("result").textContent="";status("Seçilen yedekler doğrulanıyor; mevcut kayıtlar korunacak…");
 try{
  const auth=await identify();
  if(auth.uid!==account.uid)throw Error("Hesap değişti.");
  const backups={};
  // Fetch and check ALL THREE categories before any local writes.
  for(const kind of KINDS){
   const version=point.snapshots[kind];
   if(!version)continue; // Bu kategoride yedek yok; mevcut verileri olduğu gibi koru.
   const qs=new URLSearchParams({
    select:"id,kind,item_count,payload",
    user_id:"eq."+auth.uid,
    id:"eq."+version.id,
    limit:"1"
   });
   const rows=await ownBackups(qs.toString(),auth);
   if(!Array.isArray(rows)||rows.length!==1)
    throw Error("Seçilen yedek hesabınızda bulunamadı: "+kind);
   backups[kind]=validateBackupRow(rows[0],version);
  }
  const local=readCurrent(auth.uid),combined=mergeAll(local.data,backups);
  if(!combined.added){
   status("Seçilen tarihteki tüm kayıtlar bu cihazda zaten var. Hiçbir değişiklik yapılmadı.","good");
   return;
  }
  // Initiating a local safety file download is deliberately kept in the same click event.
  saveSafetyDownload(auth.uid,local.raw);
  const summary=combined.stats.clients.added+" müşteri, "+
   combined.stats.portfolios.added+" portföy, "+
   combined.stats.external_portfolios.added+" çekilen portföy";
  if(!confirm("Önce cihazın güvenlik yedeği İndirilenler'e gönderildi. Dosyayı kontrol edin.\n\n"+
   summary+" hesabınıza eklenecek. Mevcut kayıtlar silinmeyecek veya üzerine yazılmayacak. Devam edilsin mi?")){
   status("Geri yükleme iptal edildi. Mevcut kayıtlar değiştirilmedi.","notice");
   return;
  }
  const second=await identify();
  if(second.uid!==auth.uid)throw Error("Hesap değişti; hiçbir kayıt eklenmedi.");
  const next={};const keyNames={};
  const availableKinds=KINDS.filter(kind=>point.snapshots[kind]);
  for(const kind of availableKinds){
   keyNames[kind]=KEY_PREFIX[kind]+auth.uid;
   if(localStorage.getItem(keyNames[kind])!==local.raw[kind])
    throw Error("İşlem sırasında cihaz kayıtları değişti. Yeniden deneyin.");
   next[kind]=JSON.stringify(combined.updated[kind]);
  }
  const written=[];
  try{
   for(const kind of availableKinds){
    localStorage.setItem(keyNames[kind],next[kind]);
    written.push(kind);
    if(localStorage.getItem(keyNames[kind])!==next[kind])throw Error("Kaydedilen veri doğrulanamadı.");
   }
  }catch(err){
   for(const kind of written.reverse()){
    try{
     if(local.raw[kind]===null)localStorage.removeItem(keyNames[kind]);
     else localStorage.setItem(keyNames[kind],local.raw[kind]);
    }catch(_){}
   }
   throw Error("Kayıt yazma tamamlanamadı. Önceki cihaz yedeğiniz İndirilenler'de. "+String(err.message||err));
  }
  status("✓ Tamamlandı: "+summary+" eklendi; mevcut kayıtlar korundu.","good");
  $("result").className="good";
  $("result").textContent="Ana EmlakCRM'ye dönüp müşteri ve portföy sayılarını kontrol edin.";
 }catch(e){issue("Geri yükleme tamamlanamadı: "+String(e.message||e));}
 finally{busy=false;$("reload").disabled=false;updateSelection();}
}
$("date").addEventListener("change",updateSelection);
$("reload").addEventListener("click",()=>{if(!busy)void load()});
$("restore").addEventListener("click",()=>{void restoreAll()});
void load();
