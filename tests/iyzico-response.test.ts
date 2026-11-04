import {verifyIyzicoResponse,amountKurus,normalizeIyzicoAmount} from "../supabase/functions/_shared/iyzico.ts";
Deno.test("checkout retrieval signature accepts correct iyzico values",async()=>{
 const old=Deno.env.get("IYZICO_SECRET_KEY");
 try{
 Deno.env.set("IYZICO_SECRET_KEY","unit-test-secret");
 const body:Record<string,unknown>={paymentStatus:"SUCCESS",paymentId:"12345",currency:"TRY",basketId:"order-1",
   conversationId:"order-1",paidPrice:750.00,price:"750.00",token:"abc-token",
   signature:"b5e825900b4abb0d661041d832f301be6083da7d25c97c4f1ff750a04abc82f5"};
 if(!await verifyIyzicoResponse("retrieve",body))throw Error("valid_signature_rejected");
 if(await verifyIyzicoResponse("retrieve",{...body,paidPrice:"7.50"}))throw Error("tampered_amount_accepted");
 if(await verifyIyzicoResponse("retrieve",{...body,paymentStatus:"FAILURE"}))throw Error("tampered_status_accepted");
 if(await verifyIyzicoResponse("retrieve",{...body,signature:"0".repeat(64)}))throw Error("fake_signature_accepted");
 }finally{if(old===undefined)Deno.env.delete("IYZICO_SECRET_KEY");else Deno.env.set("IYZICO_SECRET_KEY",old)}
});
Deno.test("exact kuruş calculations reject excess fraction and altered amounts",()=>{
 if(amountKurus("750.00")!==75000||amountKurus(750)!==75000)throw Error("incorrect_amount");
 if(normalizeIyzicoAmount("750.000")!=="750")throw Error("incorrect_normalization");
 for(const amount of ["750.001","7.50001","not-a-number"]){
  let refused=false;try{amountKurus(amount)}catch{refused=true}
  if(!refused)throw Error("invalid_amount_accepted");
 }
});
