/**
 * Only these two first-party browser origins may read EmlakCRM payment
 * and subscription API responses during the staged domain migration.
 * This helper never permits a wildcard and never reads authentication secrets.
 *
 * Keep the existing legacy-origin response headers for server-to-server
 * callbacks or unknown Origin headers. Browser CORS will block unknown origins.
 */
const legacyOrigin="https://enginbaysal-oss.github.io";
const newOrigin="https://emlkcrm.com.tr";

export function withAllowedOrigin(request:Request,response:Response):Response{
 const requestedOrigin=request.headers.get("Origin");
 if(requestedOrigin!==legacyOrigin && requestedOrigin!==newOrigin)return response;
 const headers=new Headers(response.headers);
 headers.set("Access-Control-Allow-Origin",requestedOrigin);
 const vary=headers.get("Vary");
 if(!vary?.split(",").some(v=>v.trim().toLowerCase()==="origin")){
  headers.set("Vary",vary?vary+", Origin":"Origin");
 }
 return new Response(response.body,{
  status:response.status,
  statusText:response.statusText,
  headers
 });
}
