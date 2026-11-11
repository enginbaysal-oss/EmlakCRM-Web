import {withAllowedOrigin} from "../_shared/emlakcrm-domain-origin.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const cors={"access-control-allow-origin":"https://enginbaysal-oss.github.io","access-control-allow-methods":"GET, POST, OPTIONS","access-control-allow-headers":"authorization,apikey,content-type","cache-control":"no-store","content-type":"application/json; charset=utf-8","vary":"Origin"};
const reply=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers:cors});
function env(){return {base:Deno.env.get("SUPABASE_URL")||"",service:Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"",key:Deno.env.get("SUPABASE_ANON_KEY")||"",pat:Deno.env.get("SHOPIER_PAT")||""}}
async function db(path:string,method="GET",body?:unknown){
 const {base,service}=env();if(!base||!service)throw Error("db_env_missing");
 const res=await fetch(base+"/rest/v1/"+path,{method,headers:{"apikey":service,"authorization":"Bearer "+service,"content-type":"application/json",...(method==="POST"?{"prefer":"return=minimal"}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(5000),cache:"no-store"});
 if(!res.ok)throw Error("db_"+res.status);if(res.status===204)return null;
 const text=await res.text();return text?JSON.parse(text):null;
}
async function authenticatedAdmin(req:Request){
 const auth=req.headers.get("authorization")||"";
 if(!/^Bearer [A-Za-z0-9._~-]+$/.test(auth))return false;
 const {base,key}=env();if(!base||!key)return false;
 const res=await fetch(base+"/auth/v1/user",{headers:{"apikey":key,"authorization":auth},signal:AbortSignal.timeout(5000)});
 if(!res.ok)return false;
 const user=await res.json();const id=user?.id;
 if(typeof id!=="string"||!/^[0-9a-f-]{36}$/i.test(id))return false;
 const items=await db("emlakcrm_super_admins?user_id=eq."+id+"&select=user_id&limit=1");
 return Array.isArray(items)&&items.length>0;
}
async function shopier(path:string,method="GET",body?:unknown){
 const pat=env().pat;if(!pat)throw Error("shopier_pat_missing");
 const res=await fetch("https://api.shopier.com/v1/"+path,{method,
  headers:{"authorization":"Bearer "+pat,"accept":"application/json","content-type":"application/json"},
  ...(body===undefined?{}:{body:JSON.stringify(body)}),
  signal:AbortSignal.timeout(8000),cache:"no-store"});
 if(!res.ok)throw Error("shopier_api_"+res.status);
 return res.json();
}
function extractList(data:unknown):unknown[]{
 if(Array.isArray(data))return data;
 if(data&&typeof data==="object"){const d=data as Record<string,unknown>;for(const k of ["data","webhooks","items","result"])if(Array.isArray(d[k]))return d[k] as unknown[]}
 throw Error("shopier_list_format_unknown");
}
const domainMigrationHandler=async (req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(!["GET","POST"].includes(req.method))return reply(405,{error:"method_not_allowed"});
 try{
  if(!await authenticatedAdmin(req))return reply(403,{error:"admin_only"});
  const existing=await db("emlakcrm_shopier_webhook_config?event=eq.order.created&select=webhook_id,endpoint_url&limit=1");
  if(req.method==="GET")return reply(200,{pat_ready:Boolean(env().pat),webhook_ready:existing.length===1,automatic_activation:false});
  if(existing.length)return reply(200,{webhook_ready:true,automatic_activation:false});
  if(!env().pat)return reply(503,{error:"shopier_pat_missing"});
  const url=env().base+"/functions/v1/emlakcrm-shopier-webhook";
  const list=extractList(await shopier("webhooks?limit=50&page=1"));
  if(list.some(item=>item&&typeof item==="object"&&(item as Record<string,unknown>).url===url)){
   return reply(409,{error:"webhook_already_registered_without_token",hint:"Shopier'de aynı URL için eski webhook var; imza anahtarı geri alınamaz."});
  }
  const result=await shopier("webhooks","POST",{event:"order.created",url}) as Record<string,unknown>;
  const created=(result?.data&&typeof result.data==="object"?result.data:result) as Record<string,unknown>;
  if(typeof created?.id!=="string"||typeof created?.token!=="string"||created.token.length<12||created.url!==url||created.event!=="order.created"){
   throw Error("webhook_create_response_unknown");
  }
  try{
   await db("emlakcrm_shopier_webhook_config","POST",{event:"order.created",webhook_id:created.id,token:created.token,endpoint_url:url});
  }catch(error){
   // No token can be recovered from GET /webhooks; delete our *just-created* registration on storage failure.
   try{await shopier("webhooks/"+encodeURIComponent(created.id),"DELETE")}catch{console.error("Shopier setup cleanup required for unpersisted webhook")}
   throw error;
  }
  return reply(200,{webhook_ready:true,automatic_activation:false,message:"Shopier bildirim bağlantısı hazır. Üyelik otomatik açılması henüz aktif değil."});
 }catch(e){
  const code=e instanceof Error?e.message:"unknown_error";
  console.error("Shopier setup failed:",code);
  return reply(503,{error:"shopier_setup_failed",reason:code.startsWith("shopier_api_")?code:code==="shopier_pat_missing"?code:"server_or_provider_error"});
 }
};
Deno.serve(async (req:Request) => withAllowedOrigin(req, await domainMigrationHandler(req)));
