import {
  clearSessionCookie,
  createSessionCookie,
  hasValidSession,
  isAuthEnabled,
  verifyPanelPassword,
} from "~/lib/auth.server"
import { clearFailedLogins, isIpBlocked, recordFailedLogin } from "~/lib/db.server"
import { blockedIpResponse, getClientIp } from "~/lib/ip-access.server"

export async function handleAuthRequest(request: Request, pathname: string) {
  const ip = getClientIp(request)
  if (isIpBlocked(ip)) return blockedIpResponse(request)

  if (pathname === "/api/auth/session" && request.method === "GET") {
    return Response.json({ authenticated: hasValidSession(request), enabled: isAuthEnabled() })
  }
  if (pathname === "/api/auth/login" && request.method === "POST") {
    if (!isAuthEnabled()) return Response.json({ error: "Panel authentication is not configured." }, { status: 503 })
    const body = await request.json() as { password?: string }
    if (!body.password || !verifyPanelPassword(body.password)) {
      if (recordFailedLogin(ip)) return blockedIpResponse(request)
      return Response.json({ error: "密码不正确。" }, { status: 401 })
    }
    clearFailedLogins(ip)
    return Response.json({ ok: true }, { headers: { "set-cookie": createSessionCookie() } })
  }
  if (pathname === "/api/auth/logout" && request.method === "POST") {
    return Response.json({ ok: true }, { headers: { "set-cookie": clearSessionCookie() } })
  }
  return Response.json({ error: "Not found." }, { status: 404 })
}
