// RE/MAX public office/listing HTML relay for EmlakCRM.
// Only authenticated requests; strictly limited to official RE/MAX public paths.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "no-store",
};
function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
  });
}
function allowed(input: URL): boolean {
  if (input.protocol !== "https:" ||
      !["remax.com.tr", "www.remax.com.tr"].includes(input.hostname) ||
      input.username || input.password ||
      [...input.searchParams.keys()].some((key) => key !== "page")) return false;
  const rawPage = input.searchParams.get("page");
  if (rawPage !== null && (!/^[1-9][0-9]?$/.test(rawPage) || Number(rawPage) > 20)) return false;
  return new RegExp("^/tr/ofis/detay/[a-z0-9-]+/?$", "i").test(input.pathname)
    || new RegExp("^/tr/portfoy/P[0-9]+/?$", "i").test(input.pathname);
}
Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "GET") return jsonError("Yöntem desteklenmiyor", 405);
  const url = new URL(request.url).searchParams.get("url");
  if (!url) return jsonError("RE/MAX adresi gerekli", 400);
  let target: URL;
  try {
    target = new URL(url);
    if (!allowed(target)) return jsonError("Sadece resmi RE/MAX ofis ve portföy sayfaları okunabilir", 400);
  } catch {
    return jsonError("Geçersiz RE/MAX adresi", 400);
  }
  try {
    let response: Response | null = null;
    for (let redirect = 0; redirect < 4; redirect++) {
      response = await fetch(target, {
        method: "GET",
        redirect: "manual",
        headers: { "Accept": "text/html,application/xhtml+xml", "User-Agent": "Mozilla/5.0 (compatible; EmlakCRM/1.0)" },
        signal: AbortSignal.timeout(14000),
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) return jsonError("RE/MAX yönlendirme adresi eksik", 502);
        target = new URL(location, target);
        if (!allowed(target)) return jsonError("RE/MAX yönlendirmesi reddedildi", 502);
        continue;
      }
      break;
    }
    if (!response || [301, 302, 303, 307, 308].includes(response.status))
      return jsonError("RE/MAX çok fazla yönlendirme yaptı", 502);
    if (!response.ok) return jsonError("RE/MAX erişimi başarısız: HTTP " + response.status, 502);
    const length = Number(response.headers.get("content-length") || 0);
    if (length > 3_500_000) return jsonError("RE/MAX sayfası boyut sınırını aştı", 502);
    const html = await response.text();
    if (html.length > 3_500_000) return jsonError("RE/MAX sayfası çok büyük", 502);
    if (!html || !(html.includes("<html") || html.includes("self.__next_f") || html.includes("__NEXT_DATA__")))
      return jsonError("RE/MAX beklenen HTML verisini sunmadı", 502);
    return new Response(html, {
      status: 200,
      headers: { ...cors, "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (error) {
    return jsonError("RE/MAX sunucusuna erişilemedi: " + (error instanceof Error ? error.name : "Bilinmeyen hata"), 502);
  }
});
