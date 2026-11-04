import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {cors,reply,paymentReleaseEnabled} from "../_shared/emlakcrm-payments.ts";
// Public, non-sensitive feature status. No keys, tokens, or customer data returned.
// Uses the same release function as checkout-start so UI never diverges.
Deno.serve(req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="GET")return reply(405,{error:"method_not_allowed"});
 const enabled=paymentReleaseEnabled();
 return reply(200,{
  product:"emlakcrm",annual_price_kurus:75000,currency:"TRY",duration_months:12,
  automatic_renewal:false,payment_enabled:enabled,activation_enabled:enabled
 });
});
