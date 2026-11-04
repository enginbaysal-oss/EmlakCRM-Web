import {openCheckoutAction,type OpenCheckout} from "../supabase/functions/_shared/emlakcrm-checkout-state.ts";
const now=Date.parse("2026-11-04T18:00:00Z");
const order=(minutes:number,fields:Partial<OpenCheckout>):OpenCheckout=>({
 status:"created",created_at:new Date(now-minutes*60000).toISOString(),...fields
});
function expected(input:OpenCheckout,state:string){
 const actual=openCheckoutAction(input,now);
 if(actual!==state)throw Error("state_mismatch_expected_"+state+"_got_"+actual);
}
Deno.test("abandoned unpaid checkout without token recovers after 15 min",()=>{
 expected(order(16,{}),"release_unissued");
 expected(order(14,{}),"in_progress");
 expected(order(100,{provider_token:"issued-token"}),"in_progress");
 expected(order(100,{checkout_url:"https://cpp.iyzipay.com"}),"in_progress");
});
Deno.test("valid pending checkout can resume only while unexpired",()=>{
 const provider={status:"pending",provider_token:"tok",checkout_url:"https://cpp.iyzipay.com/?token=tok"};
 expected(order(10,provider),"resume");
 expected(order(26,provider),"review");
 expected(order(3,{...provider,checkout_url:"https://example.org/phish"}),"review");
 expected(order(3,{...provider,checkout_url:"http://cpp.iyzipay.com/"}),"review");
 expected(order(3,{...provider,provider_token:null}),"review");
 expected(order(3,{...provider,checkout_url:null}),"review");
 expected(order(3,{...provider,created_at:"not-a-date"}),"review");
});
