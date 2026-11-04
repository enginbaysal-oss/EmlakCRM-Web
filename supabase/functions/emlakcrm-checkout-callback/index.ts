import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {orderByToken,reconcile} from "../_shared/emlakcrm-checkout-finalize.ts";
const resultPage="https://enginbaysal-oss.github.io/EmlakCRM-Web/odeme-sonucu.html";
const redirect=(id:string)=>new Response(null,{status:303,headers:{
 "location":resultPage+"?order="+encodeURIComponent(id),
 "cache-control":"no-store","referrer-policy":"no-referrer"
}});
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return new Response("Method Not Allowed",{status:405});
 try{
  const size=Number(req.headers.get("content-length")||"0");
  if(size>3000)return new Response("Request Too Large",{status:413});
  const raw=await req.text();if(raw.length>3000)return new Response("Request Too Large",{status:413});
  const contentType=req.headers.get("content-type")||"";
  let token:string|null=null;
  if(contentType.includes("application/json")){
   const parsed=JSON.parse(raw);
   if(parsed&&typeof parsed.token==="string")token=parsed.token;
  }else if(contentType.includes("application/x-www-form-urlencoded")){
   token=new URLSearchParams(raw).get("token");
  }else{
   // Ignore unknown untrusted formats. iyzico Checkout Form posts url-encoded token.
   return new Response("Unsupported Media Type",{status:415});
  }
  if(!token||!(/^[a-z0-9_-]{6,150}$/i.test(token)))return new Response("Invalid Request",{status:400});
  const order=await orderByToken(token);
  if(!order)return new Response("Not Found",{status:404});
  try{await reconcile(order)}catch(e){
   // A provider outage or unverified result must never grant access.
   console.error("Checkout callback could not finalize:",e instanceof Error?e.message:"error");
  }
  return redirect(order.id);
 }catch{return new Response("Callback Unavailable",{status:503});}
});
