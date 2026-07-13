import {
  clearSessionCookie,
  createSessionCookie,
  hasValidSession,
  isAuthEnabled,
  verifyPanelPassword,
} from "~/lib/auth.server"

export async function handleAuthRequest(request: Request, pathname: string) {
  if (pathname === "/api/auth/session" && request.method === "GET") {
    return Response.json({ authenticated: hasValidSession(request), enabled: isAuthEnabled() })
  }
  if (pathname === "/api/auth/login" && request.method === "POST") {
    if (!isAuthEnabled()) return Response.json({ error: "Panel authentication is not configured." }, { status: 503 })
    const body = await request.json() as { password?: string }
    if (!body.password || !verifyPanelPassword(body.password)) {
      return Response.json({ error: "密码不正确。" }, { status: 401 })
    }
    return Response.json({ ok: true }, { headers: { "set-cookie": createSessionCookie() } })
  }
  if (pathname === "/api/auth/logout" && request.method === "POST") {
    return Response.json({ ok: true }, { headers: { "set-cookie": clearSessionCookie() } })
  }
  return Response.json({ error: "Not found." }, { status: 404 })
}
