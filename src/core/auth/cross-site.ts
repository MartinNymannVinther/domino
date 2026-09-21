/**
 * The check a server action makes for free and a route handler has to
 * make itself: that the page asking is a page we served. Same test as
 * Next's own — the origin the browser stamps against the host the
 * request was addressed to. No origin header at all is not a browser
 * making a cross-site request, and the session cookie, SameSite=Lax,
 * is the guard there.
 */
export function crossSite(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}
