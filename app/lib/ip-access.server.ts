import { isIP } from "node:net"

export function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  const realIp = request.headers.get("x-real-ip")?.trim()
  const candidate = forwarded || realIp
  if (!candidate || isIP(candidate) === 0) return "unknown"
  return candidate.startsWith("::ffff:") ? candidate.slice(7) : candidate
}

export function blockedIpResponse(request: Request) {
  const message = "此 IP 因 24 小时内多次密码错误已被封禁，请稍后再试。"
  if (new URL(request.url).pathname.startsWith("/api/")) {
    return Response.json({ error: message }, { status: 403 })
  }
  return new Response(message, {
    status: 403,
    headers: { "content-type": "text/plain; charset=utf-8" },
  })
}
