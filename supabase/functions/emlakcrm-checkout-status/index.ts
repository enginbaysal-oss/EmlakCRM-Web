import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {cors,reply,loggedInUser,validUuid} from "../_shared/emlakcrm-payments.ts";
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
  return reply(200,{status,amount_kurus:75000,currency:"TRY",
   payment_confirmed:status==="paid",subscription_active:status==="paid"&&Boolean(result.subscription_id)});
 }catch(e){
  if(e instanceof Error&&e.message==="invalid_user_session")return reply(401,{error:"login_required"});
  return reply(503,{error:"status_temporarily_unavailable"});
 }
});
