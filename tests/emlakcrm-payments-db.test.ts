import { readDbResponse } from "../supabase/functions/_shared/emlakcrm-payments.ts";

Deno.test("PostgREST 201 with minimal representation is a successful empty response", async () => {
  const response = new Response(null, { status: 201 });
  const actual = await readDbResponse(response);
  if (actual !== null) throw new Error("expected_empty_created_result");
});

Deno.test("PostgREST 204 no content is a successful empty response", async () => {
  const actual = await readDbResponse(new Response(null, {status: 204}));
  if (actual !== null) throw new Error("expected_no_content_result");
});

Deno.test("PostgREST 201 representation parses returned rows", async () => {
  const rows = [{ id: "sample-order" }];
  const result = await readDbResponse(new Response(JSON.stringify(rows), {
    status: 201, headers: { "content-type": "application/json" }
  }));
  if (!Array.isArray(result) || result[0]?.id !== "sample-order") {
    throw new Error("postgrest_insert_representation_failed");
  }
});

Deno.test("PostgREST errors do not get mistaken for valid responses", async () => {
  let failed = false;
  try {
    await readDbResponse(new Response(JSON.stringify({ error: "permission denied" }), {
      status: 403, headers: {"content-type":"application/json"}
    }));
  } catch { failed = true; }
  if (!failed) throw new Error("error_result_accepted");
});
