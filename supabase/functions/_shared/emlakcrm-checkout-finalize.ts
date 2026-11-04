import {CF_RESULT,callIyzico,verifyIyzicoResponse,amountKurus} from "./iyzico.ts";
import {db,validUuid} from "./emlakcrm-payments.ts";
export type Order={id:string;user_id:string;provider_token:string|null;status:string;amount_kurus:number;currency:string;subscription_id:string|null;provider_payment_id:string|null};
export async function orderByToken(token:string):Promise<Order|null>{
 if(!/^[a-z0-9_-]{6,150}$/i.test(token))return null;
 const rows=await db("GET","emlakcrm_checkout_sessions?provider_token=eq."+encodeURIComponent(token)+"&select=id,user_id,provider_token,status,amount_kurus,currency,subscription_id,provider_payment_id&limit=1");
 return Array.isArray(rows)&&rows.length?rows[0] as Order:null;
}
export async function orderByUser(id:string,userId:string):Promise<Order|null>{
 if(!validUuid(id)||!validUuid(userId))return null;
 const rows=await db("GET","emlakcrm_checkout_sessions?id=eq."+id+"&user_id=eq."+userId+"&select=id,user_id,provider_token,status,amount_kurus,currency,subscription_id,provider_payment_id&limit=1");
 return Array.isArray(rows)&&rows.length?rows[0] as Order:null;
}
export async function reconcile(order:Order){
 if(order.status==="paid")return {status:"paid",subscription_id:order.subscription_id};
 if(!["pending","review"].includes(order.status)||!order.provider_token)
  return {status:order.status,subscription_id:null};
 const result=await callIyzico(CF_RESULT,{locale:"tr",conversationId:order.id,token:order.provider_token});
 if(!await verifyIyzicoResponse("retrieve",result))throw Error("invalid_provider_signature");
 if(result.token!==order.provider_token ||result.conversationId!==order.id ||
    result.basketId!==order.id ||result.currency!=="TRY" ||
    amountKurus(result.price)!==75000||amountKurus(result.paidPrice)!==75000||
    order.amount_kurus!==75000||order.currency!=="TRY")
   throw Error("provider_order_amount_mismatch");
 if(result.paymentStatus!=="SUCCESS"){
   if(result.paymentStatus==="FAILURE"){
    await db("PATCH","emlakcrm_checkout_sessions?id=eq."+order.id+"&status=in.(pending,review)",
      {status:"failed",updated_at:new Date().toISOString()},"return=minimal");
    return {status:"failed",subscription_id:null};
   }
   return {status:"pending",subscription_id:null};
 }
 if(result.fraudStatus!==1)return {status:"review",subscription_id:null};
 const paymentId=String(result.paymentId||"");
 if(!/^[a-zA-Z0-9_-]{1,120}$/.test(paymentId))throw Error("invalid_payment_reference");
 // Atomically locks the order and prevents duplicate receipts and duplicate licences.
 // Only this server-side verified path calls the service-role-only RPC.
 const id=await db("POST","rpc/emlakcrm_activate_verified_checkout",{
  p_checkout_id:order.id,p_token:order.provider_token,p_payment_id:paymentId,
  p_amount_kurus:75000,p_currency:"TRY"
 });
 if(!validUuid(id))throw Error("activation_unconfirmed");
 return {status:"paid",subscription_id:id};
}
