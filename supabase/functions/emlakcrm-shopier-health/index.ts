import "jsr:@supabase/functions-js/edge-runtime.d.ts";
/** Read-only, superadmin-only Shopier integration readiness; never returns tokens or order PII. */
const cors={"access-control-allow-origin":"https://enginbaysal-oss.github.io","access-control-allow-headers":"authorization,apikey,content-type","access-control-allow-methods":"GET,OPTIONS","content-type":"application/json; charset=utf-8","cache-control":"no-store","vary":"Origin"};
const reply=(code:number,d:unknown)=>new Response(JSON.stringify(d),{status:code,headers:cors});
const env=(k:string)=>Deno.env.get(k)||"";
async function data(path:string){
 const host=env("SUPABASE_URL"),key=env("SUPABASE_SERVICE_ROLE_KEY");if(!host||!key)throw Error("server_unavailable");
 const r=await fetch(host+"/rest/v1/"+path,{headers:{"apikey":key,authorization:"Bearer "+key},cache:"no-store",signal:AbortSignal.timeout(6000)});
 if(!r.ok)throw Error("database_http_"+r.status);return r.json();
}
async function admin(req:Request){
 const token=req.headers.get("authorization")||"";if(!/^Bearer [a-zA-Z0-9._~-]+$/.test(token))return false;
 const key=env("SUPABASE_ANON_KEY"),host=env("SUPABASE_URL");if(!key||!host)return false;
 const u=await fetch(host+"/auth/v1/user",{headers:{"apikey":key,authorization:token},cache:"no-store",signal:AbortSignal.timeout(5000)});
 if(!u.ok)return false;const user=await u.json();
 if(!/^[a-f0-9-]{36}$/i.test(String(user?.id||"")))return false;
 const rows=await data("emlakcrm_super_admins?user_id=eq."+user.id+"&select=user_id&limit=1");
 return Array.isArray(rows)&&rows.length===1;
}
async function probe(path:string){
 const pat=env("SHOPIER_PAT");if(!pat)return {ok:false,http_status:0,error:"key_not_configured"};
 try{
  const response=await fetch("https://api.shopier.com/v1/"+path,{
   method:"GET",headers:{"authorization":"Bearer "+pat,"accept":"application/json"},
   cache:"no-store",signal:AbortSignal.timeout(10000)});
  if(!response.ok)return {ok:false,http_status:response.status};
  const data=await response.json();
  // Do not log/return any buyer details, personal info or tokens.
  const format=Array.isArray(data)?"array":data&&typeof data==="object"?"object":typeof data;
  return {ok:true,http_status:response.status,format,
   empty:Array.isArray(data)?data.length===0:null};
 }catch(e){return {ok:false,http_status:0,error:e instanceof Error&&e.name==="TimeoutError"?"timeout":"connection_error"}}
}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="GET")return reply(405,{error:"method_not_allowed"});
 try{
  if(!await admin(req))return reply(403,{error:"super_admin_only"});
  const [webhook,products,activation,orderAPI,ownerAPI]=await Promise.all([
   data("emlakcrm_shopier_webhook_config?event=eq.order.created&select=webhook_id,endpoint_url&limit=1"),
   data("emlakcrm_shopier_product_config?status=eq.ready&select=tier,expected_amount_kurus,product_id"),
   data("emlakcrm_shopier_activation_control?id=eq.true&select=enabled&limit=1"),
   probe("orders?limit=1&page=1"),probe("shop/owner")
  ]);
  const names=Array.isArray(products)?products:[];
  return reply(200,{
   webhook_registered:Array.isArray(webhook)&&webhook.length===1,
   product_750_ready:names.some(x=>x.tier==="standard"&&x.expected_amount_kurus===75000&&x.product_id==="52694231"),
   product_500_ready:names.some(x=>x.tier==="ilyada3"&&x.expected_amount_kurus===50000&&x.product_id==="52698093"),
   activation_enabled:activation?.[0]?.enabled===true,
   shopier_order_api:orderAPI,shopier_owner_api:ownerAPI,
   test_mode:"read_only_no_payment_no_subscription_activation"
  });
 }catch(e){console.error("Shopier health:",e instanceof Error?e.message:"unknown");return reply(503,{error:"health_check_unavailable"})}
});
