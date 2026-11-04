import {verifyIyzicoResponse,signedHeaders} from "../supabase/functions/_shared/iyzico.ts";
Deno.test("sandbox signatures use only sandbox secret",async()=>{
 const oldSandbox=Deno.env.get("IYZICO_SANDBOX_SECRET_KEY");
 const oldLive=Deno.env.get("IYZICO_SECRET_KEY");
 try{
  Deno.env.set("IYZICO_SANDBOX_SECRET_KEY","sandbox-example-test-secret");
  Deno.env.set("IYZICO_SECRET_KEY","different-live-test-secret");
  const data:Record<string,unknown>={conversationId:"abc-123",token:"sandbox-token"};
  const encoder=new TextEncoder();
  const key=await crypto.subtle.importKey("raw",encoder.encode("sandbox-example-test-secret"),
   {name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const bytes=new Uint8Array(await crypto.subtle.sign("HMAC",key,encoder.encode("abc-123:sandbox-token")));
  data.signature=Array.from(bytes,x=>x.toString(16).padStart(2,"0")).join("");
  if(!await verifyIyzicoResponse("initialize",data,"sandbox"))
   throw Error("sandbox_valid_signature_rejected");
  if(await verifyIyzicoResponse("initialize",data,"production"))
   throw Error("sandbox_signature_accepted_as_live");
 }finally{
  if(oldSandbox===undefined)Deno.env.delete("IYZICO_SANDBOX_SECRET_KEY");
  else Deno.env.set("IYZICO_SANDBOX_SECRET_KEY",oldSandbox);
  if(oldLive===undefined)Deno.env.delete("IYZICO_SECRET_KEY");
  else Deno.env.set("IYZICO_SECRET_KEY",oldLive);
 }
});
Deno.test("sandbox and live signing never rely on caller-provided url",async()=>{
 let blocked=false;
 try{await signedHeaders("https://api.iyzipay.com/payment/auth","{}","sandbox-example","sandbox-example","n")}catch{blocked=true}
 if(!blocked)throw Error("full-url-accepted");
});
