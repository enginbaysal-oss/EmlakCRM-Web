import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {CF_RESULT,callIyzicoSandbox} from "../_shared/iyzico.ts";
import {db} from "../_shared/emlakcrm-payments.ts";
import {classifyVerifiedResult,type Order} from "../_shared/emlakcrm-checkout-finalize.ts";
const report="https://enginbaysal-oss.github.io/EmlakCRM-Web/sandbox-odeme-sonuc.html";
const redirect=(id:string)=>new Response(null,{status:303,headers:{
 "location":report+"?order="+encodeURIComponent(id),
 "cache-control":"no-store","referrer-policy":"no-referrer"
}});
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return new Response("Method Not Allowed",{status:405});
 let orderId:string|null=null;
 try{
  const raw=await req.text();
  if(raw.length>3000)return new Response("Too Large",{status:413});
  const contentType=req.headers.get("content-type")||"";
  let token:string|null=null;
  if(contentType.includes("application/x-www-form-urlencoded"))
   token=new URLSearchParams(raw).get("token");
  else if(contentType.includes("application/json")){
   const parsed=JSON.parse(raw);
   if(typeof parsed.token==="string")token=parsed.token;
  }else return new Response("Unsupported Media Type",{status:415});
  if(!token||!/^[a-z0-9_-]{6,150}$/i.test(token))
   return new Response("Bad Request",{status:400});
  const found=await db("GET","emlakcrm_sandbox_checkout_sessions?provider_token=eq."+
    encodeURIComponent(token)+"&select=id,user_id,status,provider_token,provider_payment_id,amount_kurus,currency&limit=1");
  if(!Array.isArray(found)||found.length!==1)
   return new Response("Unknown Sandbox Order",{status:404});
  const order=found[0] as Order;
  orderId=order.id;
  if(order.status==="approved"||order.status==="failed")
   return redirect(order.id);
  if(!["pending","review"].includes(order.status))
   return redirect(order.id);
  const verified=await callIyzicoSandbox(CF_RESULT,{locale:"tr",conversationId:order.id,token});
  const state=await classifyVerifiedResult({...order,subscription_id:null},verified,"sandbox");
  if(state==="pending")return redirect(order.id);
  const newStatus=state==="approved"?"approved":state==="failed"?"failed":"review";
  const update:Record<string,unknown>={status:newStatus,updated_at:new Date().toISOString()};
  if(state==="approved")update.provider_payment_id=String(verified.paymentId);
  await db("PATCH","emlakcrm_sandbox_checkout_sessions?id=eq."+order.id+
    "&status=in.(pending,review)",update,"return=minimal");
  return redirect(order.id);
 }catch(e){
  console.error("Sandbox provider status verification failed:",
    e instanceof Error?e.message:"unknown");
  return orderId?redirect(orderId):new Response("Sandbox verification unavailable",{status:503});
 }
});
