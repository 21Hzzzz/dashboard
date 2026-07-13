import { expect, test } from "bun:test"

import {
  createSessionCookie,
  hasValidSession,
  hashPanelPassword,
  verifyPanelPassword,
} from "../app/lib/auth.server"
import { handleAuthRequest } from "../app/lib/auth-api.server"

test("verifies a salted panel password", () => {
  process.env.PANEL_PASSWORD_HASH = hashPanelPassword("correct horse battery staple")
  expect(verifyPanelPassword("correct horse battery staple")).toBe(true)
  expect(verifyPanelPassword("wrong password")).toBe(false)
})

test("creates and validates a signed session cookie", () => {
  process.env.PANEL_SESSION_SECRET = "test-session-secret"
  process.env.PANEL_PASSWORD_HASH = hashPanelPassword("password")
  const cookie = createSessionCookie().split(";")[0]
  expect(hasValidSession(new Request("https://example.test", { headers: { cookie } }))).toBe(true)
  expect(hasValidSession(new Request("https://example.test"))).toBe(false)
})

test("login and logout APIs set secure session cookies", async () => {
  process.env.PANEL_SESSION_SECRET = "test-session-secret"
  process.env.PANEL_PASSWORD_HASH = hashPanelPassword("password")
  const login = await handleAuthRequest(new Request("https://example.test/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ password: "password" }),
  }), "/api/auth/login")
  expect(login.status).toBe(200)
  expect(login.headers.get("set-cookie")).toContain("HttpOnly")

  const logout = await handleAuthRequest(new Request("https://example.test/api/auth/logout", { method: "POST" }), "/api/auth/logout")
  expect(logout.headers.get("set-cookie")).toContain("Max-Age=0")
})
