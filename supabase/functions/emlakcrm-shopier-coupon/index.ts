import "jsr:@supabase/functions-js/edge-runtime.d.ts";
/** Single-use Shopier codes, created ONLY after super-admin office approval.
 *  No subscription activation: that requires independently verified paid order + account match.
 */
const B="https://enginbaysal-oss.github.io";
const officeId="11630db3-dfa9-479f-9673-2cf6ef467ddd";
const hdr={"access-control-allow-origin":B,"access-control-allow-headers":"authorization,apikey,content-type","access-control-allow-methods":"GET,POST,OPTIONS","content-type":"application/json; charset=utf-8","cache-control":"no-store","vary":"Origin"};
const reply=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers:hdr});
type Coupon={user_id:string;code:string;status:string;expires_at:string;shopier_discount_id:string|null};
const uuid=(v:unknown):v is string=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8a-f][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const conf=()=>({base:Deno.env.get("SUPABASE_URL")||"",key:Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"",anon:Deno.env.get("SUPABASE_ANON_KEY")||"",pat:Deno.env.get("SHOPIER_PAT")||""});
async function data(method:string,path:string,body?:unknown,prefer?:string):Promise<any>{
 const {base,key}=conf();if(!base||!key)throw Error("backend_unavailable");
 const res=await fetch(base+"/rest/v1/"+path,{method,headers:{"apikey":key,"authorization":"Bearer "+key,"content-type":"application/json",...(prefer?{"prefer":prefer}:{})},
 ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(7000),cache:"no-store"});
 if(!res.ok)throw Error("database_error_"+res.status);
 if(res.status===204)return null;
 const txt=await res.text();return txt?JSON.parse(txt):null;
}
async function user(req:Request):Promise<{id:string,email:string}|null>{
 const auth=req.headers.get("authorization")||"";
 if(!/^Bearer [A-Za-z0-9._~-]+$/.test(auth))return null;
 const {base,anon}=conf();if(!base||!anon)return null;
 const r=await fetch(base+"/auth/v1/user",{headers:{"apikey":anon,"authorization":auth},signal:AbortSignal.timeout(7000),cache:"no-store"});
 if(!r.ok)return null;
 const j=await r.json();return uuid(j?.id)&&typeof j.email==="string"?{id:j.id,email:j.email}:null;
}
async function administrator(id:string){
 const r=await data("GET","emlakcrm_super_admins?user_id=eq."+id+"&select=user_id&limit=1");
 return Array.isArray(r)&&r.length===1;
}
async function officeApproved(id:string){
 const r=await data("GET","emlakcrm_office_discount_requests?user_id=eq."+id+"&office_id=eq."+officeId+"&status=eq.approved&select=user_id&limit=1");
 return Array.isArray(r)&&r.length===1;
}
async function couponFor(id:string):Promise<Coupon|null>{
 const r=await data("GET","emlakcrm_shopier_coupons?user_id=eq."+id+"&select=user_id,code,status,expires_at,shopier_discount_id&limit=1");
 return Array.isArray(r)&&r.length?r[0]:null;
}
async function shopier(method:string,path:string,body?:unknown):Promise<any>{
 const pat=conf().pat;if(!pat)throw Error("provider_not_configured");
 const res=await fetch("https://api.shopier.com/v1/"+path,{method,headers:{"authorization":"Bearer "+pat,"accept":"application/json","content-type":"application/json"},
 ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(14000),cache:"no-store"});
 if(!res.ok)throw Error("shopier_http_"+res.status);
 if(res.status===204)return null;
 const raw=await res.text();if(raw.length>300000)throw Error("shopier_response_too_large");
 try{return JSON.parse(raw)}catch{throw Error("shopier_invalid_response")}
}
function extractCoupon(j:any):any{
 if(j&&typeof j==="object"&&!Array.isArray(j)){
  if(typeof j.code==="string")return j;
  if(j.data&&typeof j.data==="object"&&!Array.isArray(j.data)&&typeof j.data.code==="string")return j.data;
 }
 return null;
}
function listCoupons(j:any):any[]{
 if(Array.isArray(j))return j;
 if(j&&typeof j==="object"){
  for(const name of ["data","items","discountCodes","discounts","result"])if(Array.isArray(j[name]))return j[name];
 }
 throw Error("shopier_coupon_list_unknown");
}
function formatCode(){
 const bytes=crypto.getRandomValues(new Uint8Array(6));
 return "E3"+Array.from(bytes,v=>v.toString(16).padStart(2,"0")).join("").toUpperCase();
}
async function checkProviderExisting(code:string){
 // Can recover a coupon if Shopier accepted create but our DB update was interrupted.
 for(let page=1;page<=5;page++){
  const pageItems=listCoupons(await shopier("GET","discounts/codes?limit=100&page="+page));
  const match=pageItems.find(x=>x&&x.code===code);
  if(match)return match;
  if(pageItems.length<100)return null;
 }
 throw Error("provider_coupon_lookup_incomplete");
}
function safeRecord(row:Coupon){return {status:row.status,code:row.status==="issued"?row.code:null,
 expires_at:row.expires_at,shopier_url:"https://www.shopier.com/enginbaysal/52694231",
 auto_activation_ready:false};}
async function issue(id:string){
 if(!await officeApproved(id))return reply(403,{error:"office_not_approved"});
 let c=await couponFor(id);
 if(c&&c.status==="issued")return reply(200,safeRecord(c));
 if(c&&new Date(c.expires_at).getTime()<Date.now())return reply(409,{error:"coupon_expired_contact_admin"});
 if(!c){
  const code=formatCode();
  const expiry=new Date(Date.now()+14*24*3600*1000).toISOString();
  await data("POST","emlakcrm_shopier_coupons?on_conflict=user_id",{
    user_id:id,code,expires_at:expiry,status:"preparing"
  },"resolution=ignore-duplicates,return=minimal");
  c=await couponFor(id);
  if(!c)return reply(503,{error:"coupon_reservation_failed"});
 }
 if(c.status==="issued")return reply(200,safeRecord(c));
 let discount=await checkProviderExisting(c.code);
 if(!discount){
  const expires=new Date(c.expires_at).toISOString().slice(0,10)+"+0300";
  const result=await shopier("POST","discounts/codes",{
   code:c.code,type:"amount",amountOff:"250.00",amountMinimum:"750.00",
   currency:"TRY",numAvailable:1,expiresAt:expires
  });
  discount=extractCoupon(result);
 }
 if(!discount||typeof discount.id!=="string"||discount.code!==c.code||
  discount.type!=="amount"||Number(discount.amountOff)!==250||
  Number(discount.amountMinimum)!==750||discount.currency!=="TRY"){
  throw Error("provider_coupon_verification_failed");
 }
 await data("PATCH","emlakcrm_shopier_coupons?user_id=eq."+id,{
  status:"issued",shopier_discount_id:discount.id,issued_at:new Date().toISOString(),
  updated_at:new Date().toISOString()
 },"return=minimal");
 const saved=await couponFor(id);
 if(!saved||saved.status!=="issued")throw Error("coupon_not_persisted");
 return reply(200,safeRecord(saved));
}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:hdr});
 if(!["GET","POST"].includes(req.method))return reply(405,{error:"method_not_allowed"});
 try{
  const actor=await user(req);if(!actor)return reply(401,{error:"sign_in_required"});
  if(req.method==="GET"){
   // Read only own coupon; no code leak to other accounts.
   const approved=await officeApproved(actor.id);
   if(!approved)return reply(200,{status:"not_approved",code:null});
   const coupon=await couponFor(actor.id);
   return reply(200,coupon?safeRecord(coupon):{status:"not_issued",code:null});
  }
  if(!await administrator(actor.id))return reply(403,{error:"super_admin_only"});
  if(Number(req.headers.get("content-length")||0)>1000)return reply(413,{error:"body_too_large"});
  const raw=await req.text();if(raw.length>1000)return reply(413,{error:"body_too_large"});
  let body:any;try{body=JSON.parse(raw)}catch{return reply(400,{error:"invalid_json"})}
  if(!uuid(body?.user_id))return reply(400,{error:"invalid_user_id"});
  if(await administrator(body.user_id))return reply(403,{error:"super_admin_not_eligible"});
  return await issue(body.user_id);
 }catch(e){
  const msg=e instanceof Error?e.message:"unknown_error";
  console.error("Shopier coupon:",msg);
  return reply(503,{error:"coupon_issue_failed",reason:msg.startsWith("shopier_http_")?msg:"temporarily_unavailable"});
 }
});
