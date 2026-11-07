import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {CF_START,callIyzico,verifyIyzicoResponse} from "../_shared/iyzico.ts";
import {cors,reply,db,loggedInUser,jsonBody,paymentReleaseEnabled} from "../_shared/emlakcrm-payments.ts";
import {openCheckoutAction} from "../_shared/emlakcrm-checkout-state.ts";
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
function clientIp(req:Request):string{
 // This value is forwarded by Supabase's gateway; never use it for authorization.
 const raw=req.headers.get("x-forwarded-for")||req.headers.get("x-real-ip")||"";
 const first=raw.split(",")[0].trim();
 if(first.length>45||!first||!/^[a-f0-9:.]+$/i.test(first))throw Error("buyer_ip_unavailable");
 return first;
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST")return reply(405,{error:"method_not_allowed"});
 // Explicit two-person release gate. Having production credentials is not sufficient.
 if(!paymentReleaseEnabled())
  return reply(503,{error:"checkout_not_released",payment_enabled:false});
 try{
  const user=await loggedInUser(req);
  const body=await jsonBody(req),buyer=buyerDetails(body,user.email);
  const admins=await db("GET","emlakcrm_super_admins?user_id=eq."+user.id+"&select=user_id&limit=1");
  if(Array.isArray(admins)&&admins.length)return reply(409,{error:"lifetime_admin_does_not_need_subscription"});
  // Prevent an accidental second charge while the customer already has access.
  const subscriptions=await db("GET","emlakcrm_subscriptions?user_id=eq."+user.id+
    "&status=eq.active&expires_at=gt."+encodeURIComponent(new Date().toISOString())+
    "&select=id&limit=1");
  if(Array.isArray(subscriptions)&&subscriptions.length)
    return reply(409,{error:"subscription_already_active"});
  // Price is decided exclusively by the server from a super-admin-approved request.
  const discounts=await db("GET","emlakcrm_office_discount_requests?user_id=eq."+user.id+
    "&select=status&limit=1");
  const discountStatus=Array.isArray(discounts)&&discounts.length?discounts[0].status:"none";
  if(discountStatus==="pending")return reply(409,{error:"discount_approval_pending"});
  const amountKurus=discountStatus==="approved"?50000:75000;
  const price=(amountKurus/100).toFixed(2);
  const open=await db("GET","emlakcrm_checkout_sessions?user_id=eq."+user.id+
    "&status=in.(created,pending,review)&select=id,status,checkout_url,provider_token,created_at,amount_kurus"+
    "&order=created_at.desc&limit=1");
  if(Array.isArray(open)&&open.length){
   const existing=open[0],action=openCheckoutAction(existing);
   // Never resume a payment page created at a different price.
   if(existing.amount_kurus!==amountKurus)
     return reply(409,{error:"checkout_requires_review",order_id:existing.id});
   if(action==="resume")
     return reply(200,{order_id:existing.id,payment_page_url:existing.checkout_url,existing:true});
   if(action==="release_unissued"){
    const released=await db("PATCH","emlakcrm_checkout_sessions?id=eq."+existing.id+
      "&status=eq.created&provider_token=is.null&checkout_url=is.null",
      {status:"failed",updated_at:new Date().toISOString()},"return=representation");
    if(!Array.isArray(released)||released.length!==1)
      return reply(409,{error:"checkout_state_changed"});
   }else if(action==="review")
     return reply(409,{error:"checkout_requires_review",order_id:existing.id,
       message:"Check the previous payment status before another attempt"});
   else
     return reply(409,{error:"checkout_in_progress",order_id:existing.id});
  }
  const id=crypto.randomUUID();
  await db("POST","emlakcrm_checkout_sessions",{id,user_id:user.id,
    status:"created",amount_kurus:amountKurus,currency:"TRY"},"return=minimal");
  try{
   const body={
    locale:"tr",conversationId:id,basketId:id,price,paidPrice:price,
    currency:"TRY",paymentGroup:"PRODUCT",paymentChannel:"WEB",enabledInstallments:[1],
    callbackUrl:checkoutCallback,
    buyer:{id:user.id,name:buyer.name,surname:buyer.surname,identityNumber:buyer.identityNumber,
      email:buyer.email,gsmNumber:buyer.gsmNumber,registrationAddress:buyer.address,
      city:buyer.city,country:"Turkey",zipCode:buyer.zipCode,ip:clientIp(req)},
    billingAddress:{address:buyer.address,contactName:buyer.name+" "+buyer.surname,
      city:buyer.city,country:"Turkey",zipCode:buyer.zipCode},
    basketItems:[{id:"EMLAKCRM-12AY",price,name:"EmlakCRM 12 Aylik Tek Seferlik Erisim",
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
   return reply(200,{order_id:id,payment_page_url:url,amount_kurus:amountKurus,currency:"TRY"});
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
