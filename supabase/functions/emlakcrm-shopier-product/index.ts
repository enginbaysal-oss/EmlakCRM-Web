import "jsr:@supabase/functions-js/edge-runtime.d.ts";
/** Shopier 500 TRY hidden digital product creation. Superadmin only.
 * Never opens subscriptions or changes the existing 750 TRY product.
 */
const cors={"access-control-allow-origin":"https://enginbaysal-oss.github.io","access-control-allow-headers":"authorization,apikey,content-type","access-control-allow-methods":"GET,POST,OPTIONS","cache-control":"no-store","content-type":"application/json; charset=utf-8","vary":"Origin"};
const respond=(status:number,payload:unknown)=>new Response(JSON.stringify(payload),{status,headers:cors});
const base=()=>Deno.env.get("SUPABASE_URL")||"";
const service=()=>Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const publicKey=()=>Deno.env.get("SUPABASE_ANON_KEY")||"";
const photo=()=>base()+"/storage/v1/object/public/emlakcrm-shopier-images/ilyada3/emlakcrm-500.png";
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8a-f][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
async function db(method:string,path:string,body?:unknown,prefer?:string):Promise<any>{
 const host=base(),key=service();if(!host||!key)throw Error("server_config_missing");
 const r=await fetch(host+"/rest/v1/"+path,{
  method,headers:{"apikey":key,"authorization":"Bearer "+key,"content-type":"application/json",...(prefer?{"prefer":prefer}:{})},
  ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(7500),cache:"no-store"});
 if(!r.ok)throw Error("db_http_"+r.status);
 if(r.status===204)return null;
 const text=await r.text();return text?JSON.parse(text):null;
}
async function admin(req:Request){
 const auth=req.headers.get("authorization")||"";
 if(!/^Bearer [A-Za-z0-9._~-]+$/.test(auth)||!base()||!publicKey())return false;
 const r=await fetch(base()+"/auth/v1/user",{headers:{"apikey":publicKey(),"authorization":auth},signal:AbortSignal.timeout(6000),cache:"no-store"});
 if(!r.ok)return false;
 const user=await r.json();if(!UUID.test(String(user?.id||"")))return false;
 const rows=await db("GET","emlakcrm_super_admins?user_id=eq."+user.id+"&select=user_id&limit=1");
 return Array.isArray(rows)&&rows.length===1;
}
async function config(){
 const rows=await db("GET","emlakcrm_shopier_product_config?tier=eq.ilyada3&select=product_id,product_url,status,create_attempted_at&limit=1");
 return Array.isArray(rows)&&rows.length?rows[0]:null;
}
async function imageReady(){
 if(!base())return false;
 try{const r=await fetch(photo(),{method:"HEAD",signal:AbortSignal.timeout(6000),cache:"no-store"});
 return r.ok&&(r.headers.get("content-type")||"").toLowerCase().includes("image/png");
 }catch{return false}
}
const TITLE="EmlakCRM – İlyada 3 Özel 12 Aylık Abonelik";
const DESCRIPTION="EmlakCRM gayrimenkul danışmanlarına yönelik web tabanlı yazılım platformudur. RE/MAX İlyada 3 danışmanlarına özel 12 aylık dijital kullanım hakkı. CRM, Portföy Yönetimi, Ajanda, Emlak Asistanı, Tapumatik, PDF İmzala ve Drone Çekim dahil. Fiziksel gönderim ve otomatik yenileme yoktur. Ödeme doğrulanmasının ardından EmlakCRM hesabı kontrol edilerek aktivasyon yapılır.";
function money(value:unknown){
 const s=String(value??"").trim();if(!/^\d+(?:\.\d{1,2})?$/.test(s))return NaN;
 return Math.round(Number(s)*100);
}
function verifyProduct(p:any){
 return p&&String(p.title)===TITLE&&p.type==="digital"&&p.customListing===true&&
 p.priceData?.currency==="TRY"&&money(p.priceData.price)===50000;
}
async function shopier(path:string,method="GET",data?:unknown):Promise<any>{
 const key=Deno.env.get("SHOPIER_PAT");if(!key)throw Error("provider_key_missing");
 const r=await fetch("https://api.shopier.com/v1/"+path,{
  method,headers:{"authorization":"Bearer "+key,"accept":"application/json","content-type":"application/json"},
  ...(data===undefined?{}:{body:JSON.stringify(data)}),signal:AbortSignal.timeout(12000),cache:"no-store"});
 if(!r.ok){
  const raw=await r.text();let error:any={};try{error=JSON.parse(raw)}catch{}
  console.error("Shopier product request rejected",JSON.stringify({operation:method==="POST"?"create":"retrieve",http_status:r.status,keys:error&&typeof error==="object"?Object.keys(error).slice(0,10):[]}));
  throw Error("shopier_product_http_"+r.status);
 }
 const raw=await r.text();if(raw.length>200000)throw Error("shopier_response_too_large");
 try{return JSON.parse(raw)}catch{throw Error("shopier_response_invalid")}
}
function unwrap(j:any){
 if(j&&typeof j==="object"&&!Array.isArray(j)){
  if(j.data&&typeof j.data==="object"&&!Array.isArray(j.data)&&j.data.id)return j.data;
  if(j.product&&typeof j.product==="object"&&j.product.id)return j.product;
 }
 return j;
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(!["GET","POST"].includes(req.method))return respond(405,{error:"method_not_allowed"});
 try{
  if(!await admin(req))return respond(403,{error:"superadmin_required"});
  const current=await config();
  if(req.method==="GET"){
   return respond(200,{status:current?.status||"not_created",
    ready:current?.status==="ready",product_url:current?.status==="ready"?current.product_url:null,
    image_ready:await imageReady(),create_attempted:!!current?.create_attempted_at,subscriptions_activated:false});
  }
  if(current?.status==="ready")return respond(200,{status:"ready",product_url:current.product_url,subscriptions_activated:false});
  if(current?.create_attempted_at)return respond(409,{error:"attempt_already_recorded",detail:"Shopier'de olası ürün kontrol edilmeden tekrar oluşturulamaz."});
  if(!await imageReady())return respond(409,{error:"image_not_uploaded"});
  const lease=crypto.randomUUID();
  const claimed=await db("POST","rpc/emlakcrm_shopier_claim_product_creation",{p_lease:lease});
  if(claimed!==true)return respond(409,{error:"create_already_in_progress"});
  // Commit an irreversible attempt marker just before the external POST. Unknown
  // network outcomes can NEVER cause an accidental duplicate on a later click.
  const t=new Date().toISOString();
  const patch=await db("PATCH","emlakcrm_shopier_product_config?tier=eq.ilyada3&creation_lease_id=eq."+lease,
   {create_attempted_at:t,updated_at:t},"return=representation");
  if(!Array.isArray(patch)||patch.length!==1)throw Error("claim_not_confirmed");
  const body={title:TITLE,description:DESCRIPTION,type:"digital",
   media:[{type:"image",url:photo(),placement:1}],
   priceData:{currency:"TRY",price:"500.00"},stockQuantity:999,
   shippingPayer:"sellerPays",customListing:true,options:[]};
  const created=unwrap(await shopier("products","POST",body));
  if(!created?.id)throw Error("provider_product_id_missing");
  const id=String(created.id);
  if(!/^\d{5,20}$/.test(id)||id==="52694231")throw Error("provider_product_id_invalid");
  // Provider must acknowledge exact price, digital type and custom listing.
  if(!verifyProduct(created))throw Error("provider_product_attributes_not_verified");
  const fetched=unwrap(await shopier("products/"+encodeURIComponent(id)));
  if(!verifyProduct(fetched)||String(fetched.id)!==id)throw Error("provider_retrieval_mismatch");
  const productUrl="https://www.shopier.com/enginbaysal/"+id;
  await db("PATCH","emlakcrm_shopier_product_config?tier=eq.ilyada3&creation_lease_id=eq."+lease,
   {product_id:id,product_url:productUrl,status:"ready",updated_at:new Date().toISOString()},"return=minimal");
  const confirmed=await config();
  if(confirmed?.status!=="ready"||confirmed.product_id!==id)throw Error("product_registration_unconfirmed");
  return respond(200,{status:"ready",product_url:productUrl,subscriptions_activated:false});
 }catch(e){
  const reason=e instanceof Error?e.message:"unknown_error";
  console.error("Shopier office product:",reason);
  return respond(503,{error:"product_setup_failed",
   reason:/^(?:shopier_product_http_\d+|provider_key_missing|provider_product_id_missing|provider_product_attributes_not_verified|provider_retrieval_mismatch|provider_product_id_invalid)$/.test(reason)?reason:"server_or_provider_error"});
 }
});
