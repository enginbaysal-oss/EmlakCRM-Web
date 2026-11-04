import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {cors,reply,paymentReleaseEnabled} from "../_shared/emlakcrm-payments.ts";
Deno.serve((request:Request)=>{
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(request.method!=="GET")return reply(405,{error:"method_not_allowed"});
 const key=Deno.env.get("IYZICO_SANDBOX_API_KEY")||"";
 const secret=Deno.env.get("IYZICO_SANDBOX_SECRET_KEY")||"";
 return reply(200,{
  product:"emlakcrm",
  environment:"sandbox",
  provider_api_host:"sandbox-api.iyzipay.com",
  sandbox_credentials_ready:key.startsWith("sandbox-")&&secret.startsWith("sandbox-"),
  simulated_price_kurus:75000,currency:"TRY",
  test_ledger_separate:true,real_subscription_activation:false,
  live_payment_enabled:paymentReleaseEnabled()
 });
});
