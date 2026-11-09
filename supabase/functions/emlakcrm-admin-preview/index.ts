import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// Supabase Edge Functions do not serve text/html pages as renderable documents.
// Redirect legacy preview URLs to the GitHub Pages isolated login test page.
Deno.serve((request: Request) => {
 if (request.method !== "GET") return new Response("Method Not Allowed",{status:405,headers:{Allow:"GET"}});
 return new Response(null,{status:302,headers:{
   "Location":"https://enginbaysal-oss.github.io/EmlakCRM-Web/admin-abonelik-test.html",
   "Cache-Control":"no-store",
   "Referrer-Policy":"no-referrer"
 }});
});
