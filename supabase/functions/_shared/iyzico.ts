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
