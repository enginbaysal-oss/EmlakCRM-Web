import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// EmlakCRM admin overview - read-only, no subscription/payment mutations.
// Authentication and role authorization happen independently for every request.
const origin = "https://enginbaysal-oss.github.io";
const cors = {
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Cache-Control": "no-store",
  "Vary": "Origin",
};
function respond(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
  });
}
function utcNow() { return new Date(); }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "GET") return respond(405, { error: "method_not_allowed" });
  const authorization = req.headers.get("Authorization") ?? "";
  if (!/^Bearer [^\s]+$/.test(authorization)) return respond(401, { error: "unauthorized" });
  const base = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !anonKey || !secret) return respond(503, { error: "configuration_unavailable" });

  // Validate a live Supabase Auth user, not unverified JWT claims or client input.
  let userId: string;
  try {
    const authResponse = await fetch(base + "/auth/v1/user", {
      headers: { apikey: anonKey, Authorization: authorization },
    });
    if (!authResponse.ok) return respond(401, { error: "invalid_session" });
    const user = await authResponse.json();
    if (!user?.id || typeof user.id !== "string") return respond(401, { error: "invalid_session" });
    userId = user.id;
  } catch { return respond(503, { error: "auth_unavailable" }); }

  // Lookup of role happens server-side and is restricted to the verified user ID.
  const adminUrl = new URL(base + "/rest/v1/emlakcrm_super_admins");
  adminUrl.searchParams.set("select", "user_id");
  adminUrl.searchParams.set("user_id", "eq." + userId);
  adminUrl.searchParams.set("limit", "1");
  try {
    const adminResponse = await fetch(adminUrl, {
      headers: { apikey: secret, Authorization: "Bearer " + secret },
    });
    if (!adminResponse.ok) return respond(503, { error: "authorization_unavailable" });
    const admins = await adminResponse.json();
    if (!Array.isArray(admins) || admins.length !== 1 || admins[0].user_id !== userId)
      return respond(403, { error: "admin_only" });

    const now = utcNow();
    const plus30 = new Date(now.getTime() + 30 * 86400000);
    const subscriptionBase = base + "/rest/v1/emlakcrm_subscriptions";
    const eventsBase = base + "/rest/v1/emlakcrm_payment_events";
    const activeFilter = "status=eq.active&starts_at=lte." + encodeURIComponent(now.toISOString()) +
      "&expires_at=gt." + encodeURIComponent(now.toISOString());
    const expiringFilter = activeFilter + "&expires_at=lte." + encodeURIComponent(plus30.toISOString());
    const headers = {
      apikey: secret,
      Authorization: "Bearer " + secret,
      Prefer: "count=exact",
      Accept: "application/json",
      "Cache-Control": "no-store",
    };
    const countRows = async (url: string): Promise<number> => {
      const response = await fetch(url + (url.includes("?") ? "&" : "?") + "select=id&limit=0", { headers });
      if (!response.ok) throw new Error("count_failed");
      const contentRange = response.headers.get("content-range");
      const total = contentRange?.split("/")[1];
      if (!total || !/^\d+$/.test(total)) throw new Error("count_missing");
      return Number(total);
    };
    const [total, active, expiring30, paymentEvents] = await Promise.all([
      countRows(subscriptionBase),
      countRows(subscriptionBase + "?" + activeFilter),
      countRows(subscriptionBase + "?" + expiringFilter),
      countRows(eventsBase),
    ]);
    return respond(200, {
      product: "emlakcrm",
      as_of: now.toISOString(),
      subscriptions_total: total,
      subscriptions_active: active,
      subscriptions_expiring_30_days: expiring30,
      payment_events_total: paymentEvents,
      payment_enabled: false,
      activation_enabled: false,
    });
  } catch {
    return respond(503, { error: "admin_data_unavailable" });
  }
});
