/* EmlakCRM desktop widget: opt-in, per-account read-only dashboard snapshot sync.
   Only the two on-screen summaries are sent; never the full CRM or backups. */
(function(){
 "use strict";
 const btn=document.getElementById("widgetSyncToggle");
 const phoneBox=document.getElementById("widgetShowPhone");
 const status=document.getElementById("widgetSyncStatus");
 const link=document.getElementById("widgetOpenLink");
 const refreshButton=document.getElementById("widgetSyncRefresh");
 if(!btn||!phoneBox||!status||!link||!refreshButton)return;
 const optKey="emlakcrm_widget_sync_optin_v1",phoneKey="emlakcrm_widget_show_phone_v1";
 const endpoint="https://tffvwxskvjuxoekwgdef.supabase.co/rest/v1/emlakcrm_desktop_widget_snapshots";
 const publicKey="sb_publishable_ADLnhwviFBqWtBkq94Adag_ULlAuzUe";
 let lastWritten="",busy=false,lastAttempt=0,disabled=false,stickyNotice="";
 function note(message){stickyNotice=message;status.textContent=message;}
 const owner=()=>window.emlakcrmAccountDataScope?.currentUserId()||"";
 const enabled=()=>{try{return !!owner()&&localStorage.getItem(optKey)==="yes"}catch{return false}};
 const phoneEnabled=()=>{try{return localStorage.getItem(phoneKey)==="yes"}catch{return false}};
 const txt=v=>String(v??"").slice(0,250);
 function snapshot(){
  // Reflect EmlakCRM's own dashboard filter; do not alter local CRM records.
  const dt=new Date();
  const today=[dt.getFullYear(),String(dt.getMonth()+1).padStart(2,"0"),String(dt.getDate()).padStart(2,"0")].join("-");
  const customers=Array.isArray(data?.clients)?data.clients:[];
  const tasks=Array.isArray(data?.tasks)?data.tasks:[];
  const rows=Array.isArray(presentedRecords)?presentedRecords:[];
  const active=tasks.filter(t=>!t.done&&typeof t.date==="string"&&t.date.slice(0,10)<=today)
   .sort((a,b)=>tDate(a).localeCompare(tDate(b)));
  const late=active.filter(t=>t.date.slice(0,10)<today).length;
  const pPhone=phoneEnabled();
  const agenda=active.slice(0,8).map(t=>{
   const client=customers.find(c=>String(c.id)===String(t.clientId));
   return {id:txt(t.id),title:txt(t.title||"Görüşme"),date:txt(t.date),
    clientName:txt(client?.name),phone:pPhone?txt(client?.phone):"",late:t.date.slice(0,10)<today};
  });
  const stages=["Teklif hazırlanıyor","Teklif verildi","Pazarlık sürüyor","Kabul edildi","Reddedildi"];
  const all=rows.filter(r=>stages.includes(r.offerStatus));
  const open=all.filter(r=>["Teklif hazırlanıyor","Teklif verildi","Pazarlık sürüyor"].includes(r.offerStatus));
  const offers=open.slice().reverse().slice(0,10).map(r=>{
   const client=customers.find(c=>String(c.id)===String(r.clientId));
   return {id:txt(r.id),title:txt(r.title||"Portföy"),clientName:txt(client?.name),
    status:txt(r.offerStatus),amount:Number.isFinite(Number(r.offerAmount))?Number(r.offerAmount):0,
    lastContact:txt(r.lastContactDate),feedback:txt(r.feedback)};
  });
  return {version:1,agendaSummary:{late,today:active.length-late,total:active.length},
   offersSummary:{active:open.length,accepted:all.filter(r=>r.offerStatus==="Kabul edildi").length,
    rejected:all.filter(r=>r.offerStatus==="Reddedildi").length},agenda,offers,
   sourceDate:today,generatedAt:new Date().toISOString(),phonesVisible:pPhone};
 }
 function tDate(t){return String(t.date||"");}
 function paint(){
  const ok=enabled();
  btn.textContent=ok?"Senkronizasyonu Kapat":"Senkronizasyonu Aç";
  btn.setAttribute("aria-pressed",String(ok));
  phoneBox.checked=phoneEnabled();
  phoneBox.disabled=!ok;
  refreshButton.disabled=!ok||busy;
  link.href="./desktop-widget.html";
  if(!owner()){
   btn.disabled=false;
   btn.textContent="Önce Giriş Yap";
   if(!busy)status.textContent=stickyNotice||"Bu Chrome penceresinde EmlakCRM oturumu doğrulanamadı. Önce hesabınıza giriş yapın.";
   return;
  }
  btn.disabled=false;
  if(!busy)status.textContent=stickyNotice||(ok?(lastWritten?"✓ Senkron açık, veriler bulutta güncel.":"Senkron açık, ilk aktarım bekleniyor."):"Kapalı • Masaüstü için veri paylaşılmıyor.");
 }
 async function session(){
  const userId=owner();
  if(!userId)throw Error("EmlakCRM oturumu açık değil.");
  const value=await crmAuthenticatedSession();
  const id=String(value?.user?.id||"").toLowerCase();
  if(id!==userId)throw Error("Hesap uyuşmazlığı. Güvenli eşitleme durduruldu.");
  if(!value?.token)throw Error("Oturum doğrulanamadı.");
  return {uid:id,token:value.token};
 }
 function digest(value){
  const copy={...value};
  delete copy.generatedAt;
  return JSON.stringify(copy);
 }
 async function push(force=false){
  if(!enabled()||busy||disabled)return;
  if(crmDataSaveBlocked){
   note("⚠ CRM verileri güvenlik nedeniyle kayıt korumasında. Ana sayfadaki veri güvenliği uyarısını çözmeden widget senkronizasyonu yapılmaz.");
   return;
  }
  let content;
  try{content=snapshot();}catch(err){note("⚠ Widget için kayıtlar okunamadı: "+String(err.message||err));return;}
  const hash=digest(content);
  if(!force&&hash===lastWritten)return;
  if(!force&&Date.now()-lastAttempt<4000)return;
  busy=true;lastAttempt=Date.now();
  status.textContent="Masaüstü özeti güvenle güncelleniyor…";
  try{
   const {uid,token}=await session();
   if(!enabled()||owner()!==uid)return;
   const response=await fetch(endpoint+"?on_conflict=user_id",{
    method:"POST",cache:"no-store",
    headers:{apikey:publicKey,Authorization:"Bearer "+token,
     "Content-Type":"application/json",Prefer:"resolution=merge-duplicates,return=minimal"},
    body:JSON.stringify({user_id:uid,snapshot:content,updated_at:new Date().toISOString()})
   });
   if(!response.ok){
    const issue=await response.json().catch(()=>({}));
    throw Error("Bulut aktarımı yapılamadı (HTTP "+response.status+")"+(issue?.code?" · "+String(issue.code).slice(0,30):""));
   }
   lastWritten=hash;
   note("✓ Masaüstü özeti güncellendi · "+new Date().toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"})+". Lively'de 15 saniye içinde görünebilir.");
  }catch(e){note("⚠ Senkronizasyon hatası: "+String(e.message||e).slice(0,160)+". Bu cihazdaki kayıtlar değişmedi.");}
  finally{busy=false;}
 }
 async function wipe(){
  const {uid,token}=await session();
  const response=await fetch(endpoint+"?user_id=eq."+encodeURIComponent(uid),{
   method:"DELETE",cache:"no-store",
   headers:{apikey:publicKey,Authorization:"Bearer "+token,Prefer:"return=minimal"}
  });
  if(!response.ok)throw Error("Buluttaki özet silinemedi ("+response.status+").");
  lastWritten="";
 }
 btn.addEventListener("click",async()=>{
  if(busy)return;
  btn.disabled=true;busy=true;
  try{
   if(!owner()){
    note("Önce bu Chrome penceresinde EmlakCRM hesabına giriş yapmalısın. Giriş ekranı açılıyor.");
    location.hash="account";return;
   }
   const goingOn=!enabled();
   if(goingOn){
    // Explicit user consent before sending any names or appointments.
    await session();
    const empty=(!data?.tasks?.length)&&(!presentedRecords?.length);
    const message="Masaüstü Widget için bu tarayıcıdaki ajanda ve teklif özetini hesabınıza güvenle eşitleyelim mi?\n\nWidget'ta müşteri adları görünebilir. Telefonlar varsayılan olarak gizlidir.\n\n"+(empty?"Uyarı: Bu tarayıcıda henüz ajanda/teklif kaydı görünmüyor. Boş özet aktarılacak.":"");
    if(!confirm(message))return;
    localStorage.setItem(optKey,"yes");
    stickyNotice="";
    disabled=false;
   }else{
    // Stop new uploads first, then delete old snapshot to honor opt-out.
    localStorage.removeItem(optKey);
    disabled=true;
    try{await wipe();note("✓ Masaüstü senkronizasyonu durduruldu ve bulut özeti silindi.");}
    catch(err){note("⚠ Eşitleme durdu ancak eski özet henüz silinemedi: "+err.message+". Oturum açıkken yeniden deneyin.");}
   }
  }catch(err){note("⚠ Senkronizasyon açılamadı: "+String(err.message||err)+". Oturum ve bağlantıyı kontrol edin.");}
  finally{busy=false;paint();if(enabled())void push(true);}
 });
 phoneBox.addEventListener("change",()=>{
  if(!enabled()){phoneBox.checked=false;return;}
  try{
   if(phoneBox.checked&&!confirm("Müşterilerin telefon numaraları masaüstünde görünebilir. Buna izin veriyor musunuz?")){phoneBox.checked=false;return;}
   if(phoneBox.checked)localStorage.setItem(phoneKey,"yes");
   else localStorage.removeItem(phoneKey);
   lastWritten="";void push(true);
  }catch(err){note("Telefon görünürlüğü değiştirilemedi: "+String(err.message||err));}
 });
 refreshButton.addEventListener("click",()=>{stickyNotice="";void push(true);});
 window.addEventListener("emlakcrm:widget-source-changed",()=>{if(enabled())void push(true);});
 window.addEventListener("emlakcrm:session-ready",()=>{stickyNotice="";paint();if(enabled())void push(true);});
 window.addEventListener("focus",()=>{paint();if(enabled())void push();});
 document.addEventListener("visibilitychange",()=>{if(!document.hidden&&enabled())void push();});
 paint();
 setTimeout(()=>{if(enabled())void push(true);},2000);
 setInterval(()=>{if(enabled())void push();},15000);
})();
