import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// No secret values, payment tokens or user data are returned by this endpoint.
const headers={"content-type":"application/json; charset=utf-8","cache-control":"no-store",
 "access-control-allow-origin":"https://enginbaysal-oss.github.io",
 "access-control-allow-methods":"GET, OPTIONS","access-control-allow-headers":"authorization,apikey,content-type"};
Deno.serve((request:Request)=>{
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(request.method!=="GET")return new Response(JSON.stringify({error:"method_not_allowed"}),{status:405,headers});
 const apiKeyConfigured=Boolean(Deno.env.get("IYZICO_API_KEY")?.trim());
 const secretConfigured=Boolean(Deno.env.get("IYZICO_SECRET_KEY")?.trim());
 const liveConfirmed=Deno.env.get("IYZICO_ENVIRONMENT")==="production";
 return new Response(JSON.stringify({
  product:"emlakcrm",annual_price_kurus:75000,currency:"TRY",duration_months:12,
  iyzico_credentials_ready:apiKeyConfigured&&secretConfigured,
  production_selected:liveConfirmed,
  provider_verified_checkout_implemented:false,
  payment_enabled:false,activation_enabled:false,
  next_step:!apiKeyConfigured||!secretConfigured?"configure_server_secrets":!liveConfirmed?"set_production_environment":"implement_and_test_checkout_with_provider_verification"
 }),{status:200,headers});
});