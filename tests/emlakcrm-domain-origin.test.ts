import {withAllowedOrigin} from "../supabase/functions/_shared/emlakcrm-domain-origin.ts";

const OLD="https://enginbaysal-oss.github.io";
const NEW="https://emlkcrm.com.tr";
function expect(actual:unknown,expected:unknown,message:string){
 if(actual!==expected)throw new Error(message+": "+String(actual)+" (expected "+String(expected)+")");
}
function makeResponse(status:number=204){
 return new Response(status===204?null:"ready",{
  status,
  headers:{"access-control-allow-origin":OLD,"access-control-allow-methods":"GET,POST,OPTIONS","vary":"Origin","cache-control":"no-store"}
 });
}
Deno.test("legacy production origin is preserved",()=>{
 const result=withAllowedOrigin(new Request("https://example.test/",{headers:{"Origin":OLD}}),makeResponse());
 expect(result.headers.get("access-control-allow-origin"),OLD,"legacy-origin");
 expect(result.status,204,"preflight status");
});
Deno.test("verified emlkcrm.com.tr origin is accepted",()=>{
 const result=withAllowedOrigin(new Request("https://example.test/",{headers:{"Origin":NEW}}),makeResponse());
 expect(result.headers.get("access-control-allow-origin"),NEW,"new-origin");
 expect(result.headers.get("access-control-allow-methods"),"GET,POST,OPTIONS","methods preserved");
 expect(result.headers.get("vary"),"Origin","vary preserved");
});
Deno.test("unknown and lookalike origins are not reflected",()=>{
 for(const origin of ["https://evildomain.test","https://www.emlkcrm.com.tr.evil.test","http://emlkcrm.com.tr","https://emlkcrm.com.tr.evil","null"]){
  const result=withAllowedOrigin(new Request("https://example.test/",{headers:{"Origin":origin}}),makeResponse());
  expect(result.headers.get("access-control-allow-origin"),OLD,"blocked origin "+origin);
 }
});
Deno.test("requests without Origin preserve legacy behavior",()=>{
 const result=withAllowedOrigin(new Request("https://example.test/"),makeResponse());
 expect(result.headers.get("access-control-allow-origin"),OLD,"server-to-server fallback");
});
Deno.test("response body and status remain unchanged",async()=>{
 const result=withAllowedOrigin(new Request("https://example.test/",{headers:{"Origin":NEW}}),makeResponse(401));
 expect(result.status,401,"auth status not modified");
 expect(await result.text(),"ready","body not modified");
 expect(result.headers.get("cache-control"),"no-store","cache control not modified");
});
