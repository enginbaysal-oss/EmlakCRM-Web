import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {CF_START,callIyzico,verifyIyzicoResponse} from "../_shared/iyzico.ts";
import {cors,reply,db,loggedInUser,jsonBody,validUuid} from "../_shared/emlakcrm-payments.ts";
const safeText=(v:unknown,max:number)=>typeof v==="string"&&v.trim().length>0&&v.trim().length<=max?v.trim():"";
const checkoutCallback="https://tffvwxskvjuxoekwgdef.supabase.co/functions/v1/emlakcrm-checkout-callback";
function buyerDetails(data:Record<string,unknown>,verifiedEmail:string){
 const name=safeText(data.name,100),surname=safeText(data.surname,100),
 identityNumber=safeText(data.identityNumber,25),gsmNumber=safeText(data.gsmNumber,20),
 address=safeText(data.address,350),city=safeText(data.city,80),
 zipCode=safeText(data.zipCode,15);
 if(!name||!surname||!identityNumber||!address||!city||
  !/^\+?[0-9]{10,15}$/.test(gsmNumber)||!zipCode)
  throw Error("missing_billing_details");
 return {name,surname,identityNumber,gsmNumber,address,city,zipCode,email:verifiedEmail};
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST")return reply(405,{error:"method_not_allowed"});
 // Explicit two-person release gate. Having production credentials is not sufficient.
 if(Deno.env.get("EMLAKCRM_PAYMENT_LIVE_ENABLED")!=="true")
  return reply(503,{error:"checkout_not_released",payment_enabled:false});
 try{
  const user=await loggedInUser(req);
  const body=await jsonBody(req),buyer=buyerDetails(body,user.email);
  const admins=await db("GET","emlakcrm_super_admins?user_id=eq."+user.id+"&select=user_id&limit=1");
  if(Array.isArray(admins)&&admins.length)return reply(409,{error:"lifetime_admin_does_not_need_subscription"});
  const open=await db("GET","emlakcrm_checkout_sessions?user_id=eq."+user.id+"&status=in.(created,pending)&select=id,status,checkout_url,created_at&order=created_at.desc&limit=1");
  if(Array.isArray(open)&&open.length){
   const existing=open[0];
   if(existing.status==="pending"&&typeof existing.checkout_url==="string")
     return reply(200,{order_id:existing.id,payment_page_url:existing.checkout_url,existing:true});
   return reply(409,{error:"checkout_in_progress"});
  }
  const id=crypto.randomUUID();
  await db("POST","emlakcrm_checkout_sessions",{id,user_id:user.id,
    status:"created",amount_kurus:75000,currency:"TRY"},"return=minimal");
  try{
   const body={
    locale:"tr",conversationId:id,basketId:id,price:"750.00",paidPrice:"750.00",
    currency:"TRY",paymentGroup:"PRODUCT",paymentChannel:"WEB",enabledInstallments:[1],
    callbackUrl:checkoutCallback,
    buyer:{id:user.id,name:buyer.name,surname:buyer.surname,identityNumber:buyer.identityNumber,
      email:buyer.email,gsmNumber:buyer.gsmNumber,registrationAddress:buyer.address,
      city:buyer.city,country:"Turkey",zipCode:buyer.zipCode},
    billingAddress:{address:buyer.address,contactName:buyer.name+" "+buyer.surname,
      city:buyer.city,country:"Turkey",zipCode:buyer.zipCode},
    basketItems:[{id:"EMLAKCRM-12AY",price:"750.00",name:"EmlakCRM 12 Aylik Tek Seferlik Erisim",
      category1:"Yazilim",itemType:"VIRTUAL"}]
   };
   const response=await callIyzico(CF_START,body);
   const token=typeof response.token==="string"?response.token:"";
   const url=typeof response.paymentPageUrl==="string"?response.paymentPageUrl:"";
   if(!token||token.length>150||response.conversationId!==id||
      !verifyCheckoutUrl(url)||!await verifyIyzicoResponse("initialize",response))
     throw Error("invalid_provider_checkout");
   const updated=await db("PATCH","emlakcrm_checkout_sessions?id=eq."+id+"&status=eq.created",{
     provider_token:token,checkout_url:url,status:"pending",updated_at:new Date().toISOString()
   },"return=representation");
   if(!Array.isArray(updated)||updated.length!==1)throw Error("checkout_persist_failed");
   return reply(200,{order_id:id,payment_page_url:url,amount_kurus:75000,currency:"TRY"});
  }catch{
   await db("PATCH","emlakcrm_checkout_sessions?id=eq."+id+"&status=eq.created",{status:"failed",updated_at:new Date().toISOString()},"return=minimal").catch(()=>{});
   return reply(502,{error:"checkout_initialization_failed",payment_collected:false});
  }
 }catch(e){
  if(e instanceof Error&&e.message==="invalid_user_session")return reply(401,{error:"login_required"});
  if(e instanceof Error&&e.message==="missing_billing_details")return reply(422,{error:"billing_details_required"});
  if(e instanceof Error&&e.message==="invalid_json")return reply(400,{error:"invalid_request"});
  return reply(503,{error:"checkout_unavailable"});
 }
});
function verifyCheckoutUrl(input:string){
 try{
  const url=new URL(input);
  // Hosted payment page must belong to the actual provider and use TLS.
  return url.protocol==="https:"&&(url.hostname==="iyzipay.com"||url.hostname.endsWith(".iyzipay.com")||
   url.hostname==="iyzico.com"||url.hostname.endsWith(".iyzico.com"))&&
   !url.username&&!url.password;
 }catch{return false}
}
