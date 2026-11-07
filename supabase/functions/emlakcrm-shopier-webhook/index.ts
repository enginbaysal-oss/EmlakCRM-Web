import "jsr:@supabase/functions-js/edge-runtime.d.ts";
/** Shopier signed order.created receiver, staging. Never activates subscriptions yet. */
const BASE=()=>Deno.env.get("SUPABASE_URL")||"";
const KEY=()=>Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const respond=(status,body)=>new Response(body,{status,headers:{"content-type":"text/plain; charset=utf-8","cache-control":"no-store"}});
async function query(path,method="GET",body){
 const url=BASE();const key=KEY();
 if(!url||!key)throw Error("server_not_configured");
 const r=await fetch(url+"/rest/v1/"+path,{method,headers:{"apikey":key,"authorization":"Bearer "+key,"content-type":"application/json",...(method!=="GET"?{"prefer":"resolution=merge-duplicates,return=minimal"}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),cache:"no-store",signal:AbortSignal.timeout(1800)});
 if(!r.ok)throw Error("db_"+r.status);
 if(r.status===204)return null;
 const t=await r.text();return t?JSON.parse(t):null;
}
function sigBytes(value){
 const s=(value||"").trim();
 if(/^[0-9a-f]{64}$/i.test(s))return Uint8Array.from(s.match(/.{2}/g).map(part=>parseInt(part,16)));
 if(/^[a-z0-9+/]{43}=?$/i.test(s)){try{return Uint8Array.from(atob(s),x=>x.charCodeAt(0))}catch{return null}}
 return null;
}
async function authentic(raw,signature,token){
 const sig=sigBytes(signature);if(!sig||sig.length!==32||!token)return false;
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(token),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
 return crypto.subtle.verify("HMAC",key,sig,new TextEncoder().encode(raw));
}
function decimalCents(value){
 const s=String(value??"").trim();if(!/^\d+(?:\.\d{1,2})?$/.test(s))return null;
 const [whole,part=""]=s.split(".");const n=Number(whole)*100+Number(part.padEnd(2,"0"));
 return Number.isSafeInteger(n)?n:null;
}
function orderIdFrom(p){
 if(!p||typeof p!=="object"||Array.isArray(p))return null;
 const candidate=p.id??p.orderId??p.order_id??p.data?.id??p.data?.orderId??p.order?.id??p.data?.order?.id;
 return typeof candidate==="string"||typeof candidate==="number"?String(candidate):null;
}
Deno.serve(async req=>{
 if(req.method!=="POST")return respond(405,"Method Not Allowed");
 try{
  if(Number(req.headers.get("content-length")||0)>500000)return respond(413,"Request Too Large");
  const raw=await req.text();if(raw.length>500000)return respond(413,"Request Too Large");
  const configs=await query("emlakcrm_shopier_webhook_config?event=eq.order.created&select=token,webhook_id&limit=1");
  if(!configs?.length)return respond(503,"Not configured");
  const cfg=configs[0];
  const event=req.headers.get("Shopier-Event");
  const subscriptionId=req.headers.get("Shopier-Webhook-Id");
  if(subscriptionId&&subscriptionId!==cfg.webhook_id)return respond(401,"Invalid webhook");
  const signature=req.headers.get("Shopier-Signature")||req.headers.get("X-Shopier-Signature")||"";
  if(!await authentic(raw,signature,cfg.token))return respond(401,"Invalid signature");
  if(event&&event!=="order.created")return respond(200,"ignored");
  const evt=JSON.parse(raw);
  const id=orderIdFrom(evt);
  if(!id||!/^[A-Za-z0-9_-]{1,120}$/.test(id))return respond(400,"Invalid order");
  const pat=Deno.env.get("SHOPIER_PAT");
  if(!pat)return respond(503,"Provider unavailable");
  const remote=await fetch("https://api.shopier.com/v1/orders/"+encodeURIComponent(id),{
    headers:{"authorization":"Bearer "+pat,"accept":"application/json"},
    cache:"no-store",signal:AbortSignal.timeout(2500)
  });
  if(!remote.ok)return respond(503,"Provider unavailable");
  const rawOrder=await remote.text();if(rawOrder.length>250000)return respond(503,"Invalid provider response");
  const wrapper=JSON.parse(rawOrder);const order=wrapper?.data?.id?wrapper.data:(wrapper?.order?.id?wrapper.order:wrapper);
  if(String(order?.id)!==id)return respond(503,"Order mismatch");
  const products=order.lineItems;
  const hasProduct=Array.isArray(products)&&products.length===1&&
    String(products[0]?.productId)==="52694231"&&Number(products[0]?.quantity)===1;
  const total=decimalCents(order?.totals?.total);
  const currency=order?.currency;
  const paid=order?.paymentStatus==="paid";
  const billing=String(order?.billingInfo?.email||"").trim().toLowerCase();
  const shipping=String(order?.shippingInfo?.email||"").trim().toLowerCase();
  const buyerEmail=billing||shipping;
  const emailOkay=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail)&&(!billing||!shipping||billing===shipping);
  const valid=paid&&hasProduct&&currency==="TRY"&&total===75000&&emailOkay;
  const reason=!paid?"unpaid":!hasProduct?"wrong_product":currency!=="TRY"?"wrong_currency":total!==75000?"wrong_amount":!emailOkay?"email_mismatch":"";
  await query("emlakcrm_shopier_orders?on_conflict=order_id","POST",{
    order_id:id,product_id:hasProduct?"52694231":null,
    buyer_email:emailOkay?buyerEmail:null,
    payment_status:paid?"paid":"not_paid",amount_kurus:total,
    currency:currency==="TRY"?"TRY":null,
    processing_status:valid?"verified_review":"needs_review",
    review_reason:reason||null,last_checked_at:new Date().toISOString()
  });
  // Deliberate staged rollout: provider verification does NOT grant access yet.
  return respond(200,"received");
 }catch(e){console.error("Shopier webhook staging:",e instanceof Error?e.message:"error");return respond(503,"Unavailable")}
});
