import {classifyVerifiedResult,type Order} from "../supabase/functions/_shared/emlakcrm-checkout-finalize.ts";

const secret = "unit-test-checkout-secret";
const order:Order={
 id:"e6b8cba6-753e-4e63-91b5-3d29b16f9bc0",
 user_id:"c77821ce-8935-49df-a3f8-f4e7c4743155",
 provider_token:"example-iyzico-token",status:"pending",amount_kurus:75000,
 currency:"TRY",subscription_id:null,provider_payment_id:null
};
async function response(overrides:Record<string,unknown>={}){
 const body:Record<string,unknown>={
  paymentStatus:"SUCCESS",paymentId:"123456",currency:"TRY",
  basketId:order.id,conversationId:order.id,
  paidPrice:750,price:750,token:order.provider_token,
  fraudStatus:1,...overrides
 };
 const signedNames=["paymentStatus","paymentId","currency","basketId","conversationId","paidPrice","price","token"];
 const message=signedNames.map(name=>String(body[name])).join(":");
 const encoder=new TextEncoder();
 const key=await crypto.subtle.importKey("raw",encoder.encode(secret),
  {name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const signature=new Uint8Array(await crypto.subtle.sign("HMAC",key,encoder.encode(message)));
 body.signature=Array.from(signature,b=>b.toString(16).padStart(2,"0")).join("");
 return body;
}
Deno.test("signed, exact 750 TRY payment may be classified approved",async()=>{
 const previous=Deno.env.get("IYZICO_SECRET_KEY");
 try{
  Deno.env.set("IYZICO_SECRET_KEY",secret);
  if(await classifyVerifiedResult(order,await response())!=="approved")throw Error("valid_payment_not_approved");
  if(await classifyVerifiedResult(order,await response({fraudStatus:0}))!=="review")throw Error("fraud_review_not_held");
  if(await classifyVerifiedResult(order,await response({fraudStatus:-1}))!=="review")throw Error("fraud_rejected_not_held");
  if(await classifyVerifiedResult(order,await response({paymentStatus:"FAILURE"}))!=="failed")throw Error("failed_payment_not_rejected");
  if(await classifyVerifiedResult(order,await response({paymentStatus:"PENDING"}))!=="pending")throw Error("pending_payment_not_held");
 }finally{if(previous===undefined)Deno.env.delete("IYZICO_SECRET_KEY");else Deno.env.set("IYZICO_SECRET_KEY",previous)}
});
Deno.test("invalid token, conversation, price, or signature must fail closed",async()=>{
 const previous=Deno.env.get("IYZICO_SECRET_KEY");
 try{
  Deno.env.set("IYZICO_SECRET_KEY",secret);
  const cases=[
   await response({basketId:"another-order"}),
   await response({conversationId:"another-order"}),
   await response({token:"another-token"}),
   await response({paidPrice:749}),
   await response({price:751}),
   await response({currency:"USD"}),
   await response({paymentId:"bad payment id"}),
   {...await response(),signature:"0".repeat(64)}
  ];
  for(const candidate of cases){
   let denied=false;
   try{await classifyVerifiedResult(order,candidate)}catch{denied=true}
   if(!denied)throw Error("tampered_provider_result_accepted");
  }
 }finally{if(previous===undefined)Deno.env.delete("IYZICO_SECRET_KEY");else Deno.env.set("IYZICO_SECRET_KEY",previous)}
});
