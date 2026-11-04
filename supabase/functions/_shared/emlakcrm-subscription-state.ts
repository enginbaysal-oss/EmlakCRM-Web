/** A paid order is not the same as a currently valid entitlement. */
export type SubscriptionState={
 status:unknown;
 starts_at:unknown;
 expires_at:unknown;
};
export function subscriptionIsActive(row:SubscriptionState,nowMs=Date.now()):boolean{
 if(row.status!=="active"||typeof row.starts_at!=="string"||typeof row.expires_at!=="string")
  return false;
 const start=Date.parse(row.starts_at),end=Date.parse(row.expires_at);
 return Number.isFinite(nowMs)&&Number.isFinite(start)&&Number.isFinite(end)&&
   start<=nowMs&&end>nowMs&&end>start;
}
