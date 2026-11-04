/** iyzico production requests. No secrets or payment card data in browser/CI. */
const API_HOST="https://api.iyzipay.com";
export const CF_START="/payment/iyzipos/checkoutform/initialize/auth/ecom";
export const CF_RESULT="/payment/iyzipos/checkoutform/auth/ecom/detail";
const encoder=new TextEncoder();
export async function signedHeaders(path:string,payload:string,apiKey:string,secretKey:string,randomKey:string){
 if(!path.startsWith("/")||/[?#]/.test(path))throw Error("invalid_path");
 if(!apiKey||!secretKey||!randomKey)throw Error("missing_credentials");
 const hmacKey=await crypto.subtle.importKey("raw",encoder.encode(secretKey),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const signature=new Uint8Array(await crypto.subtle.sign("HMAC",hmacKey,encoder.encode(randomKey+path+payload)));
 const hex=[...signature].map(n=>n.toString(16).padStart(2,"0")).join("");
 const authorization=btoa("apiKey:"+apiKey+"&randomKey:"+randomKey+"&signature:"+hex);
 return {"content-type":"application/json","x-iyzi-rnd":randomKey,"authorization":"IYZWSv2 "+authorization};
}
export async function callIyzico(path:typeof CF_START|typeof CF_RESULT,body:Record<string,unknown>){
 if(path!==CF_START&&path!==CF_RESULT)throw Error("path_not_allowed");
 if(Deno.env.get("IYZICO_ENVIRONMENT")!=="production")throw Error("production_not_configured");
 const apiKey=Deno.env.get("IYZICO_API_KEY"),secretKey=Deno.env.get("IYZICO_SECRET_KEY");
 if(!apiKey||!secretKey)throw Error("missing_credentials");
 const payload=JSON.stringify(body);
 const randomKey=Date.now().toString()+"-"+crypto.randomUUID().replaceAll("-","");
 const headers=await signedHeaders(path,payload,apiKey,secretKey,randomKey);
 const res=await fetch(API_HOST+path,{method:"POST",headers,body:payload,signal:AbortSignal.timeout(12000)});
 const responseText=await res.text();
 if(responseText.length>100000)throw Error("provider_response_too_large");
 let data:Record<string,unknown>;
 try{data=JSON.parse(responseText)}catch{throw Error("provider_invalid_json")}
 if(!res.ok||data.status!=="success")throw Error("provider_error");
 return data;
}

/** Verify the signature on iyzico Checkout Form initialize/retrieve responses.
 * Official colon-joined parameter order; trailing decimal zeros are trimmed.
 * HMAC verification uses WebCrypto's native constant-time verifier.
 */
export function normalizeIyzicoAmount(v:unknown):string{
 if(typeof v!=="number"&&typeof v!=="string")throw Error("invalid_price");
 const s=String(v).trim();
 if(!/^\d+(?:\.\d+)?$/.test(s))throw Error("invalid_price");
 return s.includes(".")?s.replace(/0+$/,"").replace(/\.$/,""):s;
}
export function amountKurus(v:unknown):number{
 const s=normalizeIyzicoAmount(v),parts=s.split(".");
 const cents=Number(parts[0])*100+Number((parts[1]||"").padEnd(2,"0"));
 if(!Number.isSafeInteger(cents)||!parts[1]||parts[1].length<=2)return cents;
 throw Error("fractional_kurus");
}
function signatureFields(kind:"initialize"|"retrieve",body:Record<string,unknown>){
 const fields=kind==="initialize"
 ?["conversationId","token"]
 :["paymentStatus","paymentId","currency","basketId","conversationId","paidPrice","price","token"];
 return fields.map(field=>{
  const value=body[field];
  if(value===undefined||value===null||value==="")throw Error("missing_signature_field_"+field);
  return field==="price"||field==="paidPrice"?normalizeIyzicoAmount(value):String(value);
 });
}
export async function verifyIyzicoResponse(kind:"initialize"|"retrieve",body:Record<string,unknown>):Promise<boolean>{
 const secret=Deno.env.get("IYZICO_SECRET_KEY");
 const hex=body.signature;
 if(!secret||typeof hex!=="string"||!/^[0-9a-f]{64}$/i.test(hex))return false;
 try{
  const message=signatureFields(kind,body).join(":");
  const key=await crypto.subtle.importKey("raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
  const bytes=Uint8Array.from(hex.match(/.{2}/g)!,part=>parseInt(part,16));
  return crypto.subtle.verify("HMAC",key,bytes,encoder.encode(message));
 }catch{return false}
}
