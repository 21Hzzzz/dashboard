import { expect, test } from "bun:test"

import {
  assertPanelAuthenticationConfiguration,
  createSessionCookie,
  hasValidSession,
  hashPanelPassword,
  isAuthEnabled,
  verifyPanelPassword,
} from "../app/lib/auth.server"
import { handleAuthRequest } from "../app/lib/auth-api.server"
import { listPanelAccessLogs } from "../app/lib/db.server"

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

test("verifies a salted panel password", () => {
  process.env.PANEL_PASSWORD_HASH = hashPanelPassword("correct horse battery staple")
  expect(verifyPanelPassword("correct horse battery staple")).toBe(true)
  expect(verifyPanelPassword("wrong password")).toBe(false)
})

test("requires panel authentication secrets in production", () => {
  const original = {
    nodeEnv: process.env.NODE_ENV,
    passwordHash: process.env.PANEL_PASSWORD_HASH,
    sessionSecret: process.env.PANEL_SESSION_SECRET,
    authDisabled: process.env.PANEL_AUTH_DISABLED,
  }

  process.env.NODE_ENV = "production"
  delete process.env.PANEL_PASSWORD_HASH
  delete process.env.PANEL_SESSION_SECRET
  process.env.PANEL_AUTH_DISABLED = "true"

  expect(() => assertPanelAuthenticationConfiguration()).toThrow("PANEL_PASSWORD_HASH")
  expect(isAuthEnabled()).toBe(true)

  restoreEnv("NODE_ENV", original.nodeEnv)
  restoreEnv("PANEL_PASSWORD_HASH", original.passwordHash)
  restoreEnv("PANEL_SESSION_SECRET", original.sessionSecret)
  restoreEnv("PANEL_AUTH_DISABLED", original.authDisabled)
})

test("allows authentication to be explicitly disabled outside production", () => {
  const original = {
    nodeEnv: process.env.NODE_ENV,
    passwordHash: process.env.PANEL_PASSWORD_HASH,
    sessionSecret: process.env.PANEL_SESSION_SECRET,
    authDisabled: process.env.PANEL_AUTH_DISABLED,
  }

  process.env.NODE_ENV = "test"
  process.env.PANEL_AUTH_DISABLED = "true"
  delete process.env.PANEL_PASSWORD_HASH
  delete process.env.PANEL_SESSION_SECRET

  expect(() => assertPanelAuthenticationConfiguration()).not.toThrow()
  expect(isAuthEnabled()).toBe(false)

  restoreEnv("NODE_ENV", original.nodeEnv)
  restoreEnv("PANEL_PASSWORD_HASH", original.passwordHash)
  restoreEnv("PANEL_SESSION_SECRET", original.sessionSecret)
  restoreEnv("PANEL_AUTH_DISABLED", original.authDisabled)
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
  const headers = { "x-forwarded-for": `2001:db8:1::${(Date.now() + 1).toString(16).slice(-4)}` }
  const login = await handleAuthRequest(new Request("https://example.test/api/auth/login", {
    method: "POST",
    headers,
    body: JSON.stringify({ password: "password" }),
  }), "/api/auth/login")
  expect(login.status).toBe(200)
  expect(login.headers.get("set-cookie")).toContain("HttpOnly")
  expect(listPanelAccessLogs().some((log) => log.ip === headers["x-forwarded-for"] && log.event === "login_success")).toBe(true)

  const logout = await handleAuthRequest(new Request("https://example.test/api/auth/logout", { method: "POST", headers }), "/api/auth/logout")
  expect(logout.headers.get("set-cookie")).toContain("Max-Age=0")
})

test("blocks an IP for 24 hours after ten failed password attempts", async () => {
  process.env.PANEL_SESSION_SECRET = "test-session-secret"
  process.env.PANEL_PASSWORD_HASH = hashPanelPassword("password")
  const headers = { "content-type": "application/json", "x-forwarded-for": `2001:db8:2::${Date.now().toString(16).slice(-4)}` }

  for (let attempt = 1; attempt < 10; attempt++) {
    const response = await handleAuthRequest(new Request("https://example.test/api/auth/login", {
      method: "POST",
      headers,
      body: JSON.stringify({ password: "wrong password" }),
    }), "/api/auth/login")
    expect(response.status).toBe(401)
  }

  const tenthAttempt = await handleAuthRequest(new Request("https://example.test/api/auth/login", {
    method: "POST",
    headers,
    body: JSON.stringify({ password: "wrong password" }),
  }), "/api/auth/login")
  expect(tenthAttempt.status).toBe(403)

  const blockedSessionCheck = await handleAuthRequest(new Request("https://example.test/api/auth/session", {
    headers,
  }), "/api/auth/session")
  expect(blockedSessionCheck.status).toBe(403)
})
