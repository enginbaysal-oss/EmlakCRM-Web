/* EmlakCRM: zorunlu hesap bazlı yerel veri izolasyonu; eski ortak kayıtları silmez. */
(function(){
 "use strict";
 const baseGet=Storage.prototype.getItem,baseSet=Storage.prototype.setItem,baseRemove=Storage.prototype.removeItem;
 const authKey="emlakcrm_auth_session_v1",rememberKey="emlakcrm_auth_remember_v1",activeKey="emlakcrm_active_account_v1";
 const excluded=new Set([rememberKey,activeKey]);
 function jwtSubject(){
  try{
   const session=JSON.parse(baseGet.call(sessionStorage,authKey)||"null");
   const token=String(session?.access_token||"");
   const payload=token.split(".")[1];if(!payload)return null;
   const decoded=JSON.parse(atob(payload.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(payload.length/4)*4,"=")));
   if(typeof decoded.sub!=="string"||!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(decoded.sub))return null;
   return decoded.sub.toLowerCase();
  }catch(_){return null}
 }
 function sessionSubject(){
  const jwt=jwtSubject();
  if(jwt)return jwt;
  // Fallback is populated only after /auth/v1/user verified this session.
  try{
   const saved=JSON.parse(baseGet.call(sessionStorage,authKey)||"null");
   const id=String(saved?.verified_user_id||"").toLowerCase();
   return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)?id:null;
  }catch(_){return null}
 }
 function currentUserId(){
  const id=sessionSubject();if(!id)return null;
  const active=baseGet.call(localStorage,activeKey);
  if(active&&active!==id)return null;
  return id;
 }
 // Restore a remembered session BEFORE any CRM, portfolio or draft storage is read.
 if(!baseGet.call(sessionStorage,authKey)){
  const remembered=baseGet.call(localStorage,rememberKey);
  if(remembered){
   baseSet.call(sessionStorage,authKey,remembered);
   if(!currentUserId())baseRemove.call(sessionStorage,authKey);
  }
 }
 function scoped(key){
  const name=String(key);
  if(!name.startsWith("emlakcrm_")||excluded.has(name))return name;
  const id=currentUserId();if(!id)return null; // fail closed, not shared anonymous storage
  const suffix="__owner_"+id;
  if(name.includes("__owner_"))return name.endsWith(suffix)?name:null;
  return name+suffix;
 }
 Storage.prototype.getItem=function(key){
  if(this!==localStorage)return baseGet.call(this,key);
  const dest=scoped(key);return dest===null?null:baseGet.call(this,dest);
 };
 Storage.prototype.setItem=function(key,value){
  if(this!==localStorage)return baseSet.call(this,key,value);
  const dest=scoped(key);if(dest===null)throw Error("Hesap kimliği doğrulanmadı; özel kayıt saklanamaz.");
  return baseSet.call(this,dest,value);
 };
 Storage.prototype.removeItem=function(key){
  if(this!==localStorage)return baseRemove.call(this,key);
  const dest=scoped(key);if(dest!==null)return baseRemove.call(this,dest);
 };
 window.emlakcrmAccountDataScope={currentUserId,sessionSubject,tokenSubject:jwtSubject,activeAccountKey:activeKey,legacyRecordsPreserved:true};
})();