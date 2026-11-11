/**
 * EmlakCRM custom-domain migration — read-only cloud backup overview.
 * This module NEVER restores, deletes, overwrites, downloads payloads,
 * or stores any browser data. It only reads aggregate snapshot metadata
 * for a freshly verified, matching user account.
 *
 * Not connected to production UI until the domain rollout is approved.
 */
export const BACKUP_KINDS=Object.freeze([
 {kind:"clients",label:"Müşteriler"},
 {kind:"portfolios",label:"Portföyler"},
 {kind:"external_portfolios",label:"Çekilen portföyler"}
]);
const API="https://tffvwxskvjuxoekwgdef.supabase.co";
const KEY="sb_publishable_ADLnhwviFBqWtBkq94Adag_ULlAuzUe";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validToken=v=>typeof v==="string"&&v.length>16&&v.length<8192&&/^[a-zA-Z0-9._~-]+$/.test(v);
const fail=message=>{throw new Error(message)};
export async function readCloudBackupOverview({
 session, expectedAccountId, activeAccountId=null,
 fetcher=fetch, baseUrl=API, publishableKey=KEY
}={}){
 const uid=String(expectedAccountId||"").toLowerCase();
 if(!UUID.test(uid)||!validToken(session?.access_token))fail("sign_in_required");
 if(activeAccountId!==null&&activeAccountId!==uid)fail("different_account_active");
 if(typeof fetcher!=="function")fail("unavailable_fetch");
 const headers={apikey:publishableKey,Authorization:"Bearer "+session.access_token};
 const response=await fetcher(baseUrl+"/auth/v1/user",{method:"GET",headers,cache:"no-store"});
 if(!response.ok)fail("account_verification_failed");
 const user=await response.json();
 if(String(user?.id||"").toLowerCase()!==uid)fail("different_account_verified");
 const overview=[];
 for(const {kind,label} of BACKUP_KINDS){
  const qs=new URLSearchParams({
   select:"kind,item_count,created_at",
   user_id:"eq."+uid,
   kind:"eq."+kind,
   order:"created_at.desc",
   limit:"1"
  });
  const result=await fetcher(baseUrl+"/rest/v1/emlakcrm_user_backups?"+qs.toString(),{
   method:"GET",headers,cache:"no-store"
  });
  if(!result.ok)fail("backup_list_unavailable");
  const rows=await result.json();
  if(!Array.isArray(rows)||rows.length>1)fail("unexpected_backup_data");
  const snapshot=rows[0]||null;
  if(snapshot&&snapshot.kind!==kind)fail("unexpected_backup_kind");
  overview.push({
   kind,label,
   available:!!snapshot,
   itemCount:snapshot&&Number.isSafeInteger(snapshot.item_count)&&snapshot.item_count>=0?snapshot.item_count:null,
   latest:typeof snapshot?.created_at==="string"?snapshot.created_at:null
  });
 }
 return {userVerified:true,backups:overview};
}
