import "jsr:@supabase/functions-js/edge-runtime.d.ts";
/**
 * EmlakCRM: send archived, signed pre-checkout contract copies after
 * independently verified Shopier payment activation.
 *
 * FAIL-CLOSED gates:
 * - caller must present exact server service-role JWT, never an end-user token
 * - both LEGAL_MAIL_AUTOSEND_ENABLED=true and DB control.enabled=true
 * - configured Resend API key and verified LEGAL_MAIL_FROM sender
 * - one-to-one verified order->consent association (enforced by DB)
 * - store exactly one email event per order; Resend Idempotency-Key on retries
 *
 * Never changes payments, subscription activations or contract wording.
 */
const env=(name:string)=>Deno.env.get(name)||"";
const respond=(code:number,data:Record<string,unknown>)=>
 new Response(JSON.stringify(data),{status:code,headers:{
  "content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const authOk=(req:Request)=>{
 const token=req.headers.get("authorization")||"";
 const service=env("SUPABASE_SERVICE_ROLE_KEY");
 return Boolean(service)&&token==="Bearer "+service;
};
async function rpc<T>(name:string,data:Record<string,unknown>):Promise<T>{
 const url=env("SUPABASE_URL"),key=env("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!key)throw Error("server_unavailable");
 const response=await fetch(url+"/rest/v1/rpc/"+name,{
  method:"POST",headers:{apikey:key,authorization:"Bearer "+key,"content-type":"application/json"},
  body:JSON.stringify(data),cache:"no-store",signal:AbortSignal.timeout(11000)
 });
 if(!response.ok)throw Error("database_"+name+"_http_"+response.status);
 return response.json() as Promise<T>;
}
type Job={
 order_id:string;claim_token:string;recipient_email:string;
 amount_kurus:number;legal_version:string;accepted_at:string;
 documents:Record<string,string>;
};
const filenames=[
 ["on-bilgilendirme-formu.html","Ön Bilgilendirme Formu"],
 ["mesafeli-satis-sozlesmesi.html","Mesafeli Satış / Hizmet Sözleşmesi"],
 ["teslimat-iade.html","Teslimat ve İade Koşulları"]
] as const;
function utf8base64(source:string){
 const data=new TextEncoder().encode(source);
 let ascii="";
 for(let i=0;i<data.length;i+=4096)ascii+=String.fromCharCode(...data.subarray(i,i+4096));
 return btoa(ascii);
}
async function deliver(job:Job):Promise<string>{
 if(!/^[A-Za-z0-9_-]{1,120}$/.test(job.order_id)||
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(job.recipient_email)||
  !Number.isInteger(job.amount_kurus)||!job.documents)
  throw Error("invalid_stored_job");
 const attachments=[];
 for(const [filename] of filenames){
  const html=job.documents[filename];
  if(typeof html!=="string"||html.length<100||html.length>150000||!/<html/i.test(html))
   throw Error("missing_legal_document");
  attachments.push({filename,content:utf8base64(html),content_type:"text/html"});
 }
 const sender=env("LEGAL_MAIL_FROM"),key=env("RESEND_API_KEY");
 if(!sender||!key)throw Error("provider_not_configured");
 const yearPrice=(job.amount_kurus/100).toLocaleString("tr-TR");
 const subject="EmlakCRM - 12 Aylık Abonelik Sözleşme ve Ön Bilgilendirme Belgeleri";
 const safeId=job.order_id;
 const body="EmlakCRM 12 aylık aboneliğiniz için satın alma öncesinde kabul ettiğiniz belgelerin "+
  "kopyalarını bu e-postanın ekinde bulabilirsiniz.\n"+
  "Shopier sipariş referansı: "+safeId+"\n"+
  "Yıllık tek ödeme tutarı: "+yearPrice+" TL (KDV dahil)\n"+
  "Otomatik yenileme: Yok\n"+
  "Bu e-posta bir ödeme makbuzu değildir. Abonelik durumunuz için "+
  "https://enginbaysal-oss.github.io/EmlakCRM-Web/ adresini ziyaret edin.\n"+
  "Destek: enginbysl45@gmail.com";
 const payload:Record<string,unknown>={
  from:sender,to:[job.recipient_email],subject,text:body,attachments
 };
 const replyTo=env("LEGAL_MAIL_REPLY_TO");
 if(replyTo)payload.reply_to=replyTo;
 const response=await fetch("https://api.resend.com/emails",{
  method:"POST",
  headers:{"authorization":"Bearer "+key,"content-type":"application/json",
    "Idempotency-Key":"emlakcrm-contract-"+safeId},
  body:JSON.stringify(payload),cache:"no-store",signal:AbortSignal.timeout(16000)
 });
 if(!response.ok)throw Error("email_provider_http_"+response.status);
 const j=await response.json().catch(()=>null);
 if(typeof j?.id!=="string"||!j.id.trim())throw Error("provider_ack_missing");
 return j.id;
}
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST"&&req.method!=="GET")return respond(405,{error:"method_not_allowed"});
 if(!authOk(req))return respond(401,{error:"service_role_required"});
 const active=env("LEGAL_MAIL_AUTOSEND_ENABLED")==="true";
 const configured=Boolean(env("RESEND_API_KEY")&&env("LEGAL_MAIL_FROM"));
 if(req.method==="GET")return respond(200,{active,configured,
  message:active&&configured?"worker_configured":"worker_disabled_or_unconfigured"});
 // Neither a frontend toggle nor a subscriber JWT can enable outgoing email.
 if(!active||!configured)return respond(503,{error:"legal_mail_not_enabled"});
 try{
  const prepared=await rpc<number>("emlakcrm_prepare_legal_delivery_jobs",{p_limit:10});
  let completed=0,failed=0;
  for(let i=0;i<5;i++){
   const job=await rpc<Job|null>("emlakcrm_claim_legal_delivery_job",{});
   if(!job)break;
   try{
    const id=await deliver(job);
    const updated=await rpc<boolean>("emlakcrm_finish_legal_delivery_job",{
     p_order_id:job.order_id,p_claim_token:job.claim_token,p_success:true,
     p_provider_message_id:id
    });
    if(!updated)throw Error("claim_finished_elsewhere");
    completed++;
   }catch(e){
    failed++;
    const reason=e instanceof Error?e.message:"unknown_error";
    // A transient failure after provider acceptance can be retried safely
    // using Resend's stable Idempotency-Key; never switch recipient/message.
    try{await rpc<boolean>("emlakcrm_finish_legal_delivery_job",{
     p_order_id:job.order_id,p_claim_token:job.claim_token,
     p_success:false,p_error:reason
    })}catch(_){ /* claim lease expires for review */ }
   }
  }
  return respond(200,{prepared,completed,failed});
 }catch(_){return respond(503,{error:"delivery_worker_unavailable"})}
});