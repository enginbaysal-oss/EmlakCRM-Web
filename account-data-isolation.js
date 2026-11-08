/* EmlakCRM acil gizlilik yaması: eski cihaz-ortak kayıtlara dokunmadan kullanıcıya göre ayrı veri alanı. */
(function(){
 "use strict";
 const baseGet=Storage.prototype.getItem,baseSet=Storage.prototype.setItem,baseRemove=Storage.prototype.removeItem;
 const authKey="emlakcrm_auth_session_v1",rememberKey="emlakcrm_auth_remember_v1";
 const excluded=new Set([rememberKey]);
 function accountId(){
  try{
   const session=JSON.parse(baseGet.call(sessionStorage,authKey)||"null");
   const token=String(session?.access_token||"");
   const payload=token.split(".")[1];
   if(!payload)return null;
   const encoded=payload.replace(/-/g,"+").replace(/_/g,"/");
   const jwt=JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length/4)*4,"=")));
   if(typeof jwt.sub==="string"&&/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(jwt.sub))return jwt.sub.toLowerCase();
  }catch(_){}
  return null;
 }
 function scoped(key){
  const name=String(key);
  if(!name.startsWith("emlakcrm_")||excluded.has(name)||name.includes("__owner_"))return name;
  const id=accountId();
  // Never read unscoped legacy records automatically. Keep them intact for verified migration.
  return name+"__owner_"+(id||"anonymous");
 }
 Storage.prototype.getItem=function(key){
  return baseGet.call(this,this===localStorage?scoped(key):key);
 };
 Storage.prototype.setItem=function(key,value){
  return baseSet.call(this,this===localStorage?scoped(key):key,value);
 };
 Storage.prototype.removeItem=function(key){
  return baseRemove.call(this,this===localStorage?scoped(key):key);
 };
 window.emlakcrmAccountDataScope={currentUserId:accountId,legacyRecordsPreserved:true};
})();
