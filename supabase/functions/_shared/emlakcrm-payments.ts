/** Server-only Supabase REST helpers. Browser is never given the service-role key. */
const origin="https://enginbaysal-oss.github.io";
export const cors={
 "access-control-allow-origin":origin,
 "access-control-allow-methods":"POST, GET, OPTIONS",
 "access-control-allow-headers":"authorization,apikey,content-type",
 "vary":"Origin",
 "cache-control":"no-store"
};
export function reply(status:number,data:Record<string,unknown>){
 return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8",...cors}});
}
export function endpoint(){
 const url=Deno.env.get("SUPABASE_URL");
 const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 const publicKey=Deno.env.get("SUPABASE_ANON_KEY")||"sb_publishable_ADLnhwviFBqWtBkq94Adag_ULlAuzUe";
 if(!url||!serviceKey)throw Error("server_configuration_missing");
 return {url,key:serviceKey,publicKey};
}
export function adminHeaders(){
 const {key}=endpoint();
 return {"apikey":key,"authorization":"Bearer "+key,"content-type":"application/json"};
}
export async function db(method:string,path:string,data?:unknown,prefer?:string){
 const {url}=endpoint();
 const response=await fetch(url+"/rest/v1/"+path,{
  method,headers:{...adminHeaders(),...(prefer?{"prefer":prefer}:{})},
  ...(data===undefined?{}:{body:JSON.stringify(data)}),
  signal:AbortSignal.timeout(12000),cache:"no-store"
 });
 if(!response.ok)throw Error("database_operation_failed_"+response.status);
 if(response.status===204)return null;
 return response.json();
}
export async function loggedInUser(req:Request):Promise<{id:string,email:string}>{
 const bearer=req.headers.get("authorization")||"";
 if(!/^Bearer [A-Za-z0-9._~-]+$/.test(bearer))throw Error("invalid_user_session");
 const {url,publicKey}=endpoint();
 const response=await fetch(url+"/auth/v1/user",{
  headers:{"apikey":publicKey,"authorization":bearer},
  signal:AbortSignal.timeout(10000),cache:"no-store"
 });
 if(!response.ok)throw Error("invalid_user_session");
 const user=await response.json();
 if(typeof user.id!=="string"||typeof user.email!=="string")throw Error("invalid_user_session");
 return {id:user.id,email:user.email};
}
export const validUuid=(v:unknown):v is string=>typeof v==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8a-f][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
export async function jsonBody(req:Request){
 if(Number(req.headers.get("content-length")||"0")>12000)throw Error("request_too_large");
 const raw=await req.text();if(raw.length>12000)throw Error("request_too_large");
 let result:unknown;try{result=JSON.parse(raw)}catch{throw Error("invalid_json")}
 if(!result||typeof result!=="object"||Array.isArray(result))throw Error("invalid_json");
 return result as Record<string,unknown>;
}
