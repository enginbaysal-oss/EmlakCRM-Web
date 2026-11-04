// Node.js 20+ read-only smoke test for the EmlakCRM admin API.
// Optional ADMIN_ACCESS_TOKEN and NORMAL_ACCESS_TOKEN are temporary CI secrets.
// Never commit bearer tokens, production credentials, or raw test responses.
import assert from "node:assert/strict";
const url = "https://tffvwxskvjuxoekwgdef.supabase.co/functions/v1/emlakcrm-admin-overview";
const publicKey = "sb_publishable_ADLnhwviFBqWtBkq94Adag_ULlAuzUe";
const origin = "https://enginbaysal-oss.github.io";
async function request(method = "GET", token) {
  return fetch(url, { method, headers: {
    apikey: publicKey,
    Origin: origin,
    ...(method === "OPTIONS" ? { "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "authorization,apikey" } : {}),
    ...(token ? { Authorization: "Bearer " + token } : {}),
  } });
}
async function assertStatus(label, response, acceptable) {
  assert(acceptable.includes(response.status),
    label + ": expected " + acceptable.join("/") + ", got HTTP " + response.status);
  console.log("PASS", label, response.status);
}
try {
  const preflight = await request("OPTIONS");
  await assertStatus("Browser preflight", preflight, [200, 204]);
  assert.equal(preflight.headers.get("access-control-allow-origin"), origin,
    "CORS must allow EmlakCRM origin");
  console.log("PASS CORS origin");
  const unauth = await request();
  await assertStatus("Anonymous denied", unauth, [401, 403]);
  const invalid = await request("GET", "not-a-real-jwt");
  await assertStatus("Invalid JWT denied", invalid, [401, 403]);
  const writeAttempt = await request("POST");
  await assertStatus("Unauthenticated POST cannot modify data", writeAttempt, [401, 403, 405]);
  if (process.env.NORMAL_ACCESS_TOKEN) {
    const nonAdmin = await request("GET", process.env.NORMAL_ACCESS_TOKEN);
    await assertStatus("Signed-in non-admin denied", nonAdmin, [403]);
  } else console.log("SKIP nonadmin API test (no NORMAL_ACCESS_TOKEN)");
  if (process.env.ADMIN_ACCESS_TOKEN) {
    const admin = await request("GET", process.env.ADMIN_ACCESS_TOKEN);
    await assertStatus("Admin overview", admin, [200]);
    const data = await admin.json();
    for (const k of ["subscriptions_total","subscriptions_active",
      "subscriptions_expiring_30_days","payment_events_total"]) {
      assert(Number.isInteger(data[k]) && data[k] >= 0, "Invalid count field: " + k);
    }
    assert.equal(data.activation_enabled, false,
      "Payment activation must remain disabled pending provider approval");
    console.log("PASS overview schema and payment-activation safety");
  } else console.log("SKIP admin API test (no ADMIN_ACCESS_TOKEN)");
} catch (error) {
  console.error("FAIL", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
