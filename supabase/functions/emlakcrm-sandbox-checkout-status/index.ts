import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {cors,reply,db,loggedInUser,validUuid} from "../_shared/emlakcrm-payments.ts";
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="GET")return reply(405,{error:"method_not_allowed"});
 try{
  const user=await loggedInUser(req);
  const orderId=new URL(req.url).searchParams.get("order");
  if(!validUuid(orderId))return reply(400,{error:"invalid_order_id"});
  const found=await db("GET","emlakcrm_sandbox_checkout_sessions?user_id=eq."+user.id+
   "&id=eq."+orderId+"&select=id,status,amount_kurus,currency&limit=1");
  if(!Array.isArray(found)||found.length!==1)
   return reply(404,{error:"sandbox_order_not_found"});
  const state=found[0].status;
  return reply(200,{
   environment:"sandbox",order_id:orderId,status:state,
   amount_kurus:75000,currency:"TRY",
   sandbox_payment_verified:state==="approved",
   actual_money_collected:false,production_subscription_granted:false
  });
 }catch(e){
  if(e instanceof Error&&e.message==="invalid_user_session")
   return reply(401,{error:"login_required"});
  return reply(503,{error:"sandbox_status_unavailable"});
 }
});
