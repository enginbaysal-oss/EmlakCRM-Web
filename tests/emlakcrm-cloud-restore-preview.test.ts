import {BACKUP_KINDS,readCloudBackupOverview} from "../emlakcrm-cloud-restore-preview.js";
const USER="00aa00bb-11cc-22dd-33ee-44ff55667788";
const TOKEN="valid-token-for-tests-not-a-real-secret";
const url="https://tffvwxskvjuxoekwgdef.supabase.co";
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json"}});
function mockFetch(requests:Array<{url:string,options:any}>,user=USER){
 return async (url:RequestInfo|URL,options?:RequestInit)=>{
  const textUrl=String(url);
  requests.push({url:textUrl,options:options||{}});
  if(textUrl.endsWith("/auth/v1/user"))return json({id:user});
  const kind=new URL(textUrl).searchParams.get("kind")?.replace("eq.","");
  if(kind==="clients")return json([{kind,item_count:2,created_at:"2026-11-11T09:00:00Z"}]);
  if(kind==="portfolios")return json([{kind,item_count:14,created_at:"2026-11-11T09:02:00Z"}]);
  return json([]);
 };
}
const expect=(condition:boolean,message:string)=>{if(!condition)throw Error(message)};
Deno.test("only account-scoped backup metadata is requested, never payload or writes",async()=>{
 const calls:Array<{url:string,options:any}>=[];
 const result=await readCloudBackupOverview({session:{access_token:TOKEN},expectedAccountId:USER,fetcher:mockFetch(calls)});
 expect(result.userVerified&&result.backups.length===3,"three overview kinds");
 expect(result.backups[0].itemCount===2&&result.backups[1].itemCount===14,"counts");
 expect(result.backups[2].available===false,"optional missing backup");
 expect(calls.length===4,"auth + three list requests");
 for(const {url:urlValue,options} of calls){
  expect(options.method==="GET","read only");
  expect(options.headers.Authorization==="Bearer "+TOKEN,"verified session");
  if(urlValue.includes("emlakcrm_user_backups")){
   const params=new URL(urlValue).searchParams;
   expect(params.get("user_id")==="eq."+USER,"user filtered");
   expect(params.get("select")==="kind,item_count,created_at","payload must never be read");
   expect(params.get("limit")==="1","latest only");
  }
 }
});
Deno.test("rejects missing session and mismatched active account before network",async()=>{
 const fetcher=async (_input:RequestInfo|URL,_init?:RequestInit):Promise<Response>=>{throw Error("should not call network")};
 for(const props of [
  {session:null,expectedAccountId:USER},
  {session:{access_token:TOKEN},expectedAccountId:"invalid"},
  {session:{access_token:TOKEN},expectedAccountId:USER,activeAccountId:"another-user"}
 ]){
  let failed=false;
  try{await readCloudBackupOverview({...props,fetcher} as Parameters<typeof readCloudBackupOverview>[0])}catch{failed=true}
  expect(failed,"fail-closed");
 }
});
Deno.test("rejects server session mismatch, never accesses backup metadata",async()=>{
 const calls:Array<{url:string,options:any}>=[];
 let failed=false;
 try{await readCloudBackupOverview({
  session:{access_token:TOKEN},expectedAccountId:USER,
  fetcher:mockFetch(calls,"ffffffff-ffff-ffff-ffff-ffffffffffff")
 })}catch{failed=true}
 expect(failed&&calls.length===1,"verify before any snapshots");
});
Deno.test("snapshot categories are a strict allowlist",()=>{
 expect(BACKUP_KINDS.map(x=>x.kind).join(",")==="clients,portfolios,external_portfolios","kind allowlist");
});
