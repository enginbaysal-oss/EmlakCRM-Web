/** Fail-closed decision for abandoned or repeated Checkout Form sessions. */
export type OpenCheckout = {
  status:string;
  created_at:string;
  provider_token?:string|null;
  checkout_url?:string|null;
};
export type OpenCheckoutAction="resume"|"release_unissued"|"review"|"in_progress";
export function openCheckoutAction(order:OpenCheckout,now=Date.now()):OpenCheckoutAction{
 const createdAt=Date.parse(order.created_at);
 if(!Number.isFinite(createdAt)||createdAt>now+60000)return "review";
 const age=now-createdAt;
 // No token, no checkout page: if the server crashed before recording it,
 // customer could never have completed the hosted payment.
 if(order.status==="created"){
  return age>15*60000 && !order.provider_token && !order.checkout_url
    ? "release_unissued":"in_progress";
 }
 if(order.status==="pending"){
  if(!order.provider_token||!order.checkout_url||age>25*60000)return "review";
  try{
   const url=new URL(order.checkout_url);
   if(url.protocol!=="https:"||!["iyzipay.com","iyzico.com"].some(
      host=>url.hostname===host||url.hostname.endsWith("."+host)))
       return "review";
   return "resume";
  }catch{return "review"}
 }
 return "review";
}
