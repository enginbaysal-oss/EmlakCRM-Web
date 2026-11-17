// RE/MAX office/listing HTML bridge for authenticated EmlakCRM users.
// Only public RE/MAX pages are reachable; never forward credentials to RE/MAX.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Max-Age": "600",
};
const json = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);

  let target: URL;
  try {
    const raw = new URL(request.url).searchParams.get("url") || "";
    if (raw.length > 500) return json({ error: "invalid_url" }, 400);
    target = new URL(raw);
    const allowedHost = ["remax.com.tr", "www.remax.com.tr"].includes(target.hostname.toLowerCase());
    const office = /^\/tr\/ofis\/detay\/[a-z0-9-]{2,80}\/?$/i.test(target.pathname);
    const listing = /^\/tr\/portfoy\/P\d{5,15}\/?$/i.test(target.pathname);
    const keys = [...target.searchParams.keys()];
    const page = target.searchParams.get("page");
    const allowedQuery = (keys.length === 0 || (office && keys.length === 1 && keys[0] === "page" &&
      /^\d{1,2}$/.test(page || "") && Number(page) >= 1 && Number(page) <= 20));
    if (target.protocol !== "https:" || !allowedHost || !(office || listing) || !allowedQuery ||
        target.username || target.password || target.port || target.hash) {
      return json({ error: "invalid_source" }, 400);
    }
  } catch {
    return json({ error: "invalid_url" }, 400);
  }

  try {
    const response = await fetch(target.href, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9",
        "Accept-Language": "tr-TR,tr;q=0.9",
        "User-Agent": "EmlakCRM/1.0 (portfolio sync)",
      },
    });
    const final = new URL(response.url);
    if (!["remax.com.tr", "www.remax.com.tr"].includes(final.hostname.toLowerCase()) ||
        final.protocol !== "https:") {
      return json({ error: "upstream_redirect_rejected" }, 502);
    }
    if (!response.ok) return json({ error: "remax_http_" + response.status }, 502);
    const size = Number(response.headers.get("content-length") || 0);
    if (size > 6_000_000) return json({ error: "upstream_too_large" }, 502);
    if (!/text\/html/i.test(response.headers.get("content-type") || "")) {
      return json({ error: "unexpected_content_type" }, 502);
    }
    const html = await response.text();
    if (html.length > 6_000_000) return json({ error: "upstream_too_large" }, 502);
    return new Response(html, {
      status: 200,
      headers: { ...cors, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, max-age=30" },
    });
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return json({ error: timeout ? "remax_timeout" : "remax_fetch_failed" }, 502);
  }
});
