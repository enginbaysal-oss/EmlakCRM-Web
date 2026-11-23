/**
 * Migration safety checks for Supabase email confirm/reset callbacks.
 * Do not make external network requests and do not touch production settings.
 */
const legacy="https://enginbaysal-oss.github.io/EmlakCRM-Web/index.html";
const custom="https://emlkcrm.com.tr";
function assert(condition:boolean,details:string){if(!condition)throw Error(details)}
function returnUrl(location:{origin:string,href:string}):string{
 return location.origin===custom
  ?new URL("./index.html",location.href).href
  :legacy;
}
Deno.test("old GitHub Pages callback remains unchanged",()=>{
 for(const href of ["https://enginbaysal-oss.github.io/EmlakCRM-Web/index.html","https://enginbaysal-oss.github.io/EmlakCRM-Web/index.html#account"]){
  assert(returnUrl({origin:"https://enginbaysal-oss.github.io",href})===legacy,"legacy compatibility");
 }
});
Deno.test("custom domain callback follows deployed app folder, not a stale path",()=>{
 for(const [href,expected] of [
  ["https://emlkcrm.com.tr/app/index.html#account","https://emlkcrm.com.tr/app/index.html"],
  ["https://emlkcrm.com.tr/app/","https://emlkcrm.com.tr/app/index.html"],
  ["https://emlkcrm.com.tr/index.html?version=2026","https://emlkcrm.com.tr/index.html"]
 ]){
  assert(returnUrl({origin:custom,href})===expected,"custom callback from "+href);
 }
});
Deno.test("unknown and lookalike origins never become email callbacks",()=>{
 for(const origin of ["http://emlkcrm.com.tr","https://emlkcrm.com.tr.attacker.tld","https://www.emlkcrm.com.tr","https://attacker.example"]){
  assert(returnUrl({origin,href:origin+"/index.html"})===legacy,"reject unapproved origin "+origin);
 }
});
Deno.test("both CRM login and password-reset files use identical guarded callback rule",async()=>{
 for(const [file,constant] of [["index.html","CRM_AUTH_RETURN_URL"],["sifre-yenile.html","RETURN_URL"]]){
  const html=await Deno.readTextFile(file);
  const expression='const '+constant+'=location.origin==="https://emlkcrm.com.tr"\n ?new URL("./index.html",location.href).href\n :"https://enginbaysal-oss.github.io/EmlakCRM-Web/index.html";';
  assert(html.includes(expression),"guarded callback in "+file);
  assert(!html.includes('const '+constant+'="https://enginbaysal-oss.github.io/EmlakCRM-Web/index.html";'),"no fixed-only URL "+file);
 }
});
