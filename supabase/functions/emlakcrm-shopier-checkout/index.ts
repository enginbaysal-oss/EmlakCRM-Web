import "jsr:@supabase/functions-js/edge-runtime.d.ts";
/** Shopier checkout readiness. No client can toggle payment or activate access. */
const cors={"access-control-allow-origin":"https://enginbaysal-oss.github.io","access-control-allow-headers":"authorization,apikey,content-type","access-control-allow-methods":"GET,OPTIONS","content-type":"application/json; charset=utf-8","cache-control":"no-store","vary":"Origin"};
const reply=(status:number,value:unknown)=>new Response(JSON.stringify(value),{status,headers:cors});
const env=(k:string)=>Deno.env.get(k)||"";
async function backend(path:string){
 const host=env("SUPABASE_URL"),key=env("SUPABASE_SERVICE_ROLE_KEY");if(!host||!key)throw Error("server_unavailable");
 const r=await fetch(host+"/rest/v1/"+path,{headers:{"apikey":key,"authorization":"Bearer "+key},cache:"no-store",signal:AbortSignal.timeout(7500)});
 if(!r.ok)throw Error("backend_http_"+r.status);
 return r.json();
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="GET")return reply(405,{error:"method_not_allowed"});
 try{
  const authorization=req.headers.get("authorization")||"";
  if(!authorization.startsWith("Bearer "))return reply(401,{error:"login_required"});
  const host=env("SUPABASE_URL"),pub=env("SUPABASE_ANON_KEY");
  if(!host||!pub)return reply(503,{error:"server_unavailable"});
  const auth=await fetch(host+"/auth/v1/user",{headers:{"apikey":pub,"authorization":authorization},signal:AbortSignal.timeout(7000),cache:"no-store"});
  if(!auth.ok)return reply(401,{error:"invalid_session"});
  const user=await auth.json();
  if(typeof user?.id!=="string"||typeof user?.email!=="string")return reply(401,{error:"invalid_session"});
  const id=encodeURIComponent(user.id);
  const [office,subscriptions,products,flags]=await Promise.all([
   backend("emlakcrm_office_discount_requests?user_id=eq."+id+"&select=status,code&order=requested_at.desc&limit=1"),
   backend("emlakcrm_subscriptions?user_id=eq."+id+"&select=status,starts_at,expires_at&order=created_at.desc&limit=50"),
   backend("emlakcrm_shopier_product_config?status=eq.ready&select=tier,product_id,product_url,expected_amount_kurus"),
   backend("emlakcrm_shopier_activation_control?id=eq.true&select=enabled&limit=1")
  ]);
  const now=Date.now();
  const active=Array.isArray(subscriptions)&&subscriptions.some((s:any)=>s.status==="active"&&Date.parse(s.starts_at)<=now&&Date.parse(s.expires_at)>now);
  const officeStatus=Array.isArray(office)&&office.length?office[0].status:"none";
  const tier=officeStatus==="approved"?"ilyada3":"standard";
  const product=Array.isArray(products)?products.find((x:any)=>x.tier===tier):null;
  const amount=tier==="ilyada3"?50000:75000;
  const enabled=flags?.[0]?.enabled===true&&product?.expected_amount_kurus===amount&&
    typeof product?.product_url==="string"&&/^https:\/\/www\.shopier\.com\/enginbaysal\/\d{5,20}$/.test(product.product_url);
  const canBuy=!active&&officeStatus!=="pending"&&enabled;
  return reply(200,{
   provider:"shopier",price_kurus:amount,currency:"TRY",duration_months:12,
   office_status:officeStatus,already_active:active,
   payment_enabled:canBuy,activation_enabled:flags?.[0]?.enabled===true,
   payment_page_url:canBuy?product.product_url:null,
   required_buyer_email:user.email,
   reason:active?"subscription_already_active":officeStatus==="pending"?"office_approval_pending":enabled?null:"shopier_activation_not_tested"
  });
 }catch(e){console.error("Shopier checkout readiness",e instanceof Error?e.message:"unknown");
 return reply(503,{error:"payment_readiness_unavailable",payment_enabled:false})}
});
