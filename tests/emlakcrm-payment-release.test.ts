import {paymentReleaseEnabled} from "../supabase/functions/_shared/emlakcrm-payments.ts";

Deno.test("the production payment release is intentionally opt-in",()=>{
 const valid:Record<string,string>={
  EMLAKCRM_PAYMENT_LIVE_ENABLED:"true",
  IYZICO_ENVIRONMENT:"production",
  IYZICO_API_KEY:"unit-test-key",
  IYZICO_SECRET_KEY:"unit-test-secret"
 };
 const reader=(m:Record<string,string>)=>(key:string)=>m[key];
 if(!paymentReleaseEnabled(reader(valid)))throw Error("valid_explicit_configuration_rejected");
 const changes=[
  {...valid,EMLAKCRM_PAYMENT_LIVE_ENABLED:"false"},
  {...valid,EMLAKCRM_PAYMENT_LIVE_ENABLED:"TRUE"},
  {...valid,IYZICO_ENVIRONMENT:"sandbox"},
  {...valid,IYZICO_API_KEY:""},
  {...valid,IYZICO_SECRET_KEY:" "},
 ];
 for(const input of changes){
  if(paymentReleaseEnabled(reader(input)))throw Error("unsafe_release_accepted");
 }
 if(paymentReleaseEnabled(reader({})))throw Error("missing_secrets_should_be_closed");
});
