// Run: node tests/admin-overview-smoke.mjs (Node 20+).
// For additional tests, provide ADMIN_ACCESS_TOKEN or NORMAL_ACCESS_TOKEN as environment variables.
// Never commit access tokens.
import assert from "node:assert/strict";
const url = "https://tffvwxskvjuxoekwgdef.supabase.co/functions/v1/emlakcrm-admin-overview";
const key = "sb_publishable_ADLnhwviFBqWtBkq94Adag_ULlAuzUe";
async function request(token) {
  return fetch(url, { headers: { apikey: key, ...(token ? { Authorization: "Bearer " + token } : {}) } });
}
async function expectStatus(label, token, accepted) {
  const response = await request(token);
  assert(accepted.includes(response.status), label + ": got HTTP " + response.status);
  console.log("PASS", label, response.status);
  return response;
}
try {
  await expectStatus("Anonymous rejected", null, [401,403]);
  await expectStatus("Invalid token rejected", "not-a-real-jwt", [401,403]);
  if (process.env.NORMAL_ACCESS_TOKEN) {
    await expectStatus("Nonadmin rejected", process.env.NORMAL_ACCESS_TOKEN, [403]);
  } else console.log("SKIP nonadmin: provide NORMAL_ACCESS_TOKEN");
  if (process.env.ADMIN_ACCESS_TOKEN) {
    const response = await expectStatus("Admin accepted", process.env.ADMIN_ACCESS_TOKEN, [200]);
    const data = await response.json();
    for (const field of ["subscriptions_total","subscriptions_active","subscriptions_expiring_30_days","payment_events_total"]) {
      assert(Number.isInteger(data[field]) && data[field] >= 0, "Invalid " + field);
    }
    assert.equal(data.activation_enabled, false);
    console.log("PASS overview schema, payment activation disabled");
  } else console.log("SKIP admin: provide ADMIN_ACCESS_TOKEN");
} catch (err) {
  console.error("FAIL", String(err));
  process.exitCode = 1;
}
