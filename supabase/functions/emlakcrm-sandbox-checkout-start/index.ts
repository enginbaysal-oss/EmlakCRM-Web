import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {CF_START,callIyzicoSandbox,verifyIyzicoResponse} from "../_shared/iyzico.ts";
import {cors,reply,loggedInUser,db,jsonBody} from "../_shared/emlakcrm-payments.ts";
const callbackUrl="https://tffvwxskvjuxoekwgdef.supabase.co/functions/v1/emlakcrm-sandbox-checkout-callback";
function textField(x:unknown,n:number){
 return typeof x==="string"&&x.trim().length>0&&x.trim().length<=n?x.trim():"";
}
function providerUrl(url:string){
 try{const u=new URL(url);return u.protocol==="https:"&&
  ["sandbox-cpp.iyzipay.com","sandbox-api.iyzipay.com","sandbox-ode.iyzico.com"].includes(u.hostname);}
 catch{return false;}
}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST")return reply(405,{error:"method_not_allowed"});
 try{
  const user=await loggedInUser(req);
  const payload=await jsonBody(req);
  const [name,surname,identityNumber,gsmNumber,address,city,zipCode]=
    ["name","surname","identityNumber","gsmNumber","address","city","zipCode"]
    .map(k=>textField(payload[k],k==="address"?350:100));
  if(!name||!surname||!identityNumber||!gsmNumber||!address||!city||!zipCode)
   return reply(422,{error:"missing_test_buyer_details"});
  const admins=await db("GET","emlakcrm_super_admins?user_id=eq."+user.id+"&select=user_id&limit=1");
  if(Array.isArray(admins)&&admins.length)return reply(403,{error:"normal_test_account_required"});
  const existing=await db("GET","emlakcrm_sandbox_checkout_sessions?user_id=eq."+user.id+
   "&status=in.(created,pending,review)&select=id,status,checkout_url&limit=1");
  if(Array.isArray(existing)&&existing.length)
   return reply(409,{error:"previous_sandbox_checkout_pending",order_id:existing[0].id});
  const id=crypto.randomUUID();
  await db("POST","emlakcrm_sandbox_checkout_sessions",{id,user_id:user.id,
   amount_kurus:75000,currency:"TRY",status:"created"},"return=minimal");
  try{
   const body={
    locale:"tr",conversationId:id,basketId:id,price:"750.00",paidPrice:"750.00",
    currency:"TRY",paymentGroup:"PRODUCT",paymentChannel:"WEB",enabledInstallments:[1],
    callbackUrl,
    buyer:{id:user.id,name,surname,identityNumber,gsmNumber,email:user.email,
     registrationAddress:address,city,country:"Turkey",zipCode,
     ip:"85.34.78.112"},
    billingAddress:{contactName:name+" "+surname,address,city,country:"Turkey",zipCode},
    basketItems:[{id:"SANDBOX-EMLAKCRM",name:"EmlakCRM Test Aboneligi",
     category1:"Yazilim",itemType:"VIRTUAL",price:"750.00"}]
   };
   const response=await callIyzicoSandbox(CF_START,body);
   const token=typeof response.token==="string"?response.token:"";
   const url=typeof response.paymentPageUrl==="string"?response.paymentPageUrl:"";
   if(!/^[a-z0-9_-]{6,150}$/i.test(token)||!providerUrl(url)||
      response.conversationId!==id||
      !await verifyIyzicoResponse("initialize",response,"sandbox"))
     throw Error("invalid_sandbox_response");
   const updated=await db("PATCH","emlakcrm_sandbox_checkout_sessions?id=eq."+id+"&status=eq.created",
    {status:"pending",provider_token:token,checkout_url:url},"return=representation");
   if(!Array.isArray(updated)||updated.length!==1)throw Error("sandbox_order_not_saved");
   return reply(200,{environment:"sandbox",order_id:id,payment_page_url:url,
    simulated_price_kurus:75000,real_payment:false});
  }catch{
   await db("PATCH","emlakcrm_sandbox_checkout_sessions?id=eq."+id+"&status=eq.created",
     {status:"failed"},"return=minimal").catch(()=>{});
   return reply(502,{error:"sandbox_initialize_failed",real_payment:false});
  }
 }catch(e){
  if(e instanceof Error&&e.message==="invalid_user_session")
   return reply(401,{error:"login_required"});
  return reply(503,{error:"sandbox_checkout_unavailable"});
 }
});
