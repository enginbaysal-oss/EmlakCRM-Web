import {subscriptionIsActive} from "../supabase/functions/_shared/emlakcrm-subscription-state.ts";
const now=Date.parse("2026-11-04T20:00:00Z");
const good={status:"active",starts_at:"2026-11-04T19:59:00Z",expires_at:"2027-11-04T19:59:00Z"};
Deno.test("verified and currently active 12-month subscription permits access",()=>{
 if(!subscriptionIsActive(good,now))throw Error("active_access_denied");
});
Deno.test("settled payment does not mean a still active subscription",()=>{
 const rejected=[
  {...good,status:"revoked"},
  {...good,status:"expired"},
  {...good,status:"pending"},
  {...good,expires_at:"2026-11-04T19:00:00Z"},
  {...good,expires_at:"2026-11-04T20:00:00Z"},
  {...good,starts_at:"2026-11-04T21:00:00Z"},
  {...good,expires_at:"not-a-date"},
  {...good,starts_at:"not-a-date"},
  {...good,starts_at:null},
  {...good,expires_at:null},
 ];
 for(const row of rejected)if(subscriptionIsActive(row,now))
  throw Error("invalid_subscription_claimed_active");
});
