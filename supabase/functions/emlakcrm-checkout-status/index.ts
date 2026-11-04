import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {cors,reply,loggedInUser,validUuid,db} from "../_shared/emlakcrm-payments.ts";
import {subscriptionIsActive} from "../_shared/emlakcrm-subscription-state.ts";
import {orderByUser,reconcile} from "../_shared/emlakcrm-checkout-finalize.ts";
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="GET")return reply(405,{error:"method_not_allowed"});
 try{
  const user=await loggedInUser(req);
  const id=new URL(req.url).searchParams.get("order");
  if(!validUuid(id))return reply(400,{error:"invalid_order"});
  const order=await orderByUser(id,user.id);
  if(!order)return reply(404,{error:"order_not_found"});
  let result:{status:string,subscription_id:string|null}={status:order.status,subscription_id:order.subscription_id};
  if(["pending","review"].includes(order.status)){
   try{result=await reconcile(order)}
   catch{return reply(202,{status:"pending",message:"verification_pending",payment_confirmed:false});}
  }
  const status=result.status;
  let subscriptionActive=false;
  // A paid order alone is not permission to use the service: refund, revocation,
  // start dates and expiry must be checked against the current subscription row.
  if(status==="paid"){
   if(!validUuid(result.subscription_id))
    return reply(503,{error:"paid_order_without_subscription"});
   const rows=await db("GET","emlakcrm_subscriptions?id=eq."+result.subscription_id+
    "&user_id=eq."+user.id+"&select=status,starts_at,expires_at&limit=1");
   if(!Array.isArray(rows)||rows.length!==1)
    return reply(503,{error:"subscription_status_unavailable"});
   subscriptionActive=subscriptionIsActive(rows[0]);
  }
  return reply(200,{status,amount_kurus:75000,currency:"TRY",
   payment_confirmed:status==="paid",subscription_active:subscriptionActive});
 }catch(e){
  if(e instanceof Error&&e.message==="invalid_user_session")return reply(401,{error:"login_required"});
  return reply(503,{error:"status_temporarily_unavailable"});
 }
});
