import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {CF_RESULT,callIyzicoSandbox} from "../_shared/iyzico.ts";
import {db} from "../_shared/emlakcrm-payments.ts";
import {classifyVerifiedResult,type Order} from "../_shared/emlakcrm-checkout-finalize.ts";
const page=(title:string,message:string)=>new Response(
 '<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
 '<title>EmlakCRM Sandbox Test Sonucu</title><body style="font:17px system-ui;max-width:650px;margin:50px auto;padding:20px">'+
 '<h1>'+title+'</h1><p>'+message+'</p>'+
 '<p>Bu işlem yalnızca iyzico Sandbox ortamındadır. Gerçek karttan para çekilmez ve gerçek EmlakCRM aboneliği açılmaz.</p>'+
 '<a href="https://enginbaysal-oss.github.io/EmlakCRM-Web/">EmlakCRM ana sayfa</a></body></html>',{
 status:200,headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store",
 "referrer-policy":"no-referrer","x-content-type-options":"nosniff"}
});
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return new Response("Method Not Allowed",{status:405});
 try{
  const raw=await req.text();if(raw.length>3000)return new Response("Too Large",{status:413});
  const ct=req.headers.get("content-type")||"";
  let token:string|null=null;
  if(ct.includes("application/x-www-form-urlencoded"))token=new URLSearchParams(raw).get("token");
  else if(ct.includes("application/json")){
   const data=JSON.parse(raw);if(typeof data.token==="string")token=data.token;
  }else return new Response("Unsupported Media Type",{status:415});
  if(!token||!/^[a-z0-9_-]{6,150}$/i.test(token))return new Response("Bad Request",{status:400});
  const found=await db("GET","emlakcrm_sandbox_checkout_sessions?provider_token=eq."+
    encodeURIComponent(token)+"&select=id,user_id,status,provider_token,provider_payment_id,amount_kurus,currency&limit=1");
  if(!Array.isArray(found)||found.length!==1)
   return page("Test kaydı bulunamadı","Bu sonuç için kayıt bulunamadı.");
  const order=found[0];
  if(order.status==="approved")
   return page("Sandbox ödeme testi başarılı","Bu test daha önce doğrulanmış.");
  if(!["pending","review"].includes(order.status))
   return page("Sandbox ödeme sonucu","Test işlemi beklemede değil.");
  const provider=await callIyzicoSandbox(CF_RESULT,{locale:"tr",conversationId:order.id,token});
  const state=await classifyVerifiedResult({...order,subscription_id:null} as Order,provider,"sandbox");
  if(state==="pending")return page("Sandbox ödeme beklemede","Test sonucunu henüz doğrulayamadık.");
  const status=state==="approved"?"approved":state==="failed"?"failed":"review";
  const value:Record<string,unknown>={status,updated_at:new Date().toISOString()};
  if(state==="approved")value.provider_payment_id=String(provider.paymentId);
  await db("PATCH","emlakcrm_sandbox_checkout_sessions?id=eq."+order.id+
    "&status=in.(pending,review)",value,"return=minimal");
  if(state==="approved")
   return page("Sandbox ödeme testi başarılı","750 TL sanal ödeme iyzico tarafından doğrulandı.");
  if(state==="failed")
   return page("Sandbox ödeme başarısız","Test ödeme onaylanmadı. Gerçek ödeme alınmadı.");
  return page("Sandbox ödeme incelemede","Test ödeme iyzico incelemesinde; onay verilmedi.");
 }catch(e){
  console.error("Sandbox callback verification failed:",
    e instanceof Error?e.message:"unknown_error");
  return page("Sandbox sonucu kesinleşmedi","Test ödemesinin doğrulaması tamamlanamadı. Tekrar ödeme başlatmayın.");
 }
});
