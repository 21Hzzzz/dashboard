import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { Database } from "bun:sqlite"

import type {
  AlertDirection,
  AlertRule,
  FwAlertSettingsStatus,
  NotificationChannel,
  TelegramSettingsStatus,
} from "~/lib/price-alert.types"
import {
  decryptSecret,
  isEncryptionReady,
  maskSecret,
} from "~/lib/crypto.server"

const databasePath = process.env.PRICE_ALERT_DB_PATH ?? "./data/price-alert.sqlite"
mkdirSync(dirname(databasePath), { recursive: true })

const db = new Database(databasePath, { create: true })
db.run("PRAGMA journal_mode = WAL")
db.run(`
  CREATE TABLE IF NOT EXISTS telegram_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    encrypted_token TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`)
db.run(`
  CREATE TABLE IF NOT EXISTS alert_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('above', 'below')),
    target_price TEXT NOT NULL,
    channels TEXT NOT NULL DEFAULT '["telegram"]',
    enabled INTEGER NOT NULL DEFAULT 1,
    last_price TEXT,
    last_triggered_at TEXT,
    last_phone_triggered_at TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`)
db.run(`
  CREATE TABLE IF NOT EXISTS fwalert_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    encrypted_url TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`)

const ruleColumns = db.query<{ name: string }, []>("PRAGMA table_info(alert_rules)").all()
if (!ruleColumns.some((column) => column.name === "channels")) {
  db.run("ALTER TABLE alert_rules ADD COLUMN channels TEXT NOT NULL DEFAULT '[\"telegram\"]'")
}
if (!ruleColumns.some((column) => column.name === "last_phone_triggered_at")) {
  db.run("ALTER TABLE alert_rules ADD COLUMN last_phone_triggered_at TEXT")
}

type RuleRow = {
  id: number
  symbol: string
  direction: AlertDirection
  target_price: string
  channels: string
  enabled: number
  last_price: string | null
  last_triggered_at: string | null
  last_phone_triggered_at: string | null
  last_error: string | null
  created_at: string
  updated_at: string
}

function toRule(row: RuleRow): AlertRule {
  let channels: NotificationChannel[] = ["telegram"]
  try {
    const parsed = JSON.parse(row.channels) as unknown
    if (Array.isArray(parsed)) {
      const valid = parsed.filter(
        (channel): channel is NotificationChannel => channel === "telegram" || channel === "phone"
      )
      if (valid.length > 0) channels = valid
    }
  } catch {
    // Legacy rows retain Telegram as their default notification channel.
  }
  return {
    id: row.id,
    symbol: row.symbol,
    direction: row.direction,
    targetPrice: row.target_price,
    channels,
    enabled: Boolean(row.enabled),
    lastPrice: row.last_price,
    lastTriggeredAt: row.last_triggered_at,
    lastPhoneTriggeredAt: row.last_phone_triggered_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function listRules(): AlertRule[] {
  return db
    .query<RuleRow, []>("SELECT * FROM alert_rules ORDER BY created_at DESC")
    .all()
    .map(toRule)
}

export function getRule(id: number) {
  const row = db
    .query<RuleRow, [number]>("SELECT * FROM alert_rules WHERE id = ?")
    .get(id)
  return row ? toRule(row) : null
}

export function createRule(input: {
  symbol: string
  direction: AlertDirection
  targetPrice: string
  channels: NotificationChannel[]
}) {
  const now = new Date().toISOString()
  const result = db
    .query(
      `INSERT INTO alert_rules (symbol, direction, target_price, channels, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(input.symbol, input.direction, input.targetPrice, JSON.stringify(input.channels), now, now)
  return getRule(Number(result.lastInsertRowid))!
}

export function updateRule(
  id: number,
  input: Partial<{
    symbol: string
    direction: AlertDirection
    targetPrice: string
    channels: NotificationChannel[]
    enabled: boolean
  }>
) {
  const existing = getRule(id)
  if (!existing) return null

  const symbol = input.symbol ?? existing.symbol
  const direction = input.direction ?? existing.direction
  const targetPrice = input.targetPrice ?? existing.targetPrice
  const channels = input.channels ?? existing.channels
  const enabled = input.enabled ?? existing.enabled
  db.query(
    `UPDATE alert_rules
     SET symbol = ?, direction = ?, target_price = ?, channels = ?, enabled = ?, updated_at = ?
     WHERE id = ?`
  ).run(symbol, direction, targetPrice, JSON.stringify(channels), Number(enabled), new Date().toISOString(), id)
  return getRule(id)
}

export function deleteRule(id: number) {
  return db.query("DELETE FROM alert_rules WHERE id = ?").run(id).changes > 0
}

export function updateRuleMarketState(
  id: number,
  input: { lastPrice: string; lastTriggeredAt?: string | null; lastPhoneTriggeredAt?: string | null; lastError?: string | null }
) {
  db.query(
    `UPDATE alert_rules
     SET last_price = ?, last_triggered_at = COALESCE(?, last_triggered_at),
         last_phone_triggered_at = COALESCE(?, last_phone_triggered_at),
         last_error = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    input.lastPrice,
    input.lastTriggeredAt ?? null,
    input.lastPhoneTriggeredAt ?? null,
    input.lastError ?? null,
    new Date().toISOString(),
    id
  )
}

export function getTelegramSettingsStatus(): TelegramSettingsStatus {
  const row = db
    .query<{ encrypted_token: string; chat_id: string; updated_at: string }, []>(
      "SELECT encrypted_token, chat_id, updated_at FROM telegram_settings WHERE id = 1"
    )
    .get()

  return {
    configured: Boolean(row),
    chatId: row?.chat_id ?? null,
    tokenHint: row ? "已保存" : null,
    updatedAt: row?.updated_at ?? null,
    encryptionReady: isEncryptionReady(),
  }
}

export async function getTelegramSettingsStatusWithHint(): Promise<TelegramSettingsStatus> {
  const row = db
    .query<{ encrypted_token: string; chat_id: string; updated_at: string }, []>(
      "SELECT encrypted_token, chat_id, updated_at FROM telegram_settings WHERE id = 1"
    )
    .get()
  if (!row) return getTelegramSettingsStatus()

  try {
    return {
      configured: true,
      chatId: row.chat_id,
      tokenHint: maskSecret(await decryptSecret(row.encrypted_token)),
      updatedAt: row.updated_at,
      encryptionReady: isEncryptionReady(),
    }
  } catch {
    return {
      configured: true,
      chatId: row.chat_id,
      tokenHint: "已保存（无法解密）",
      updatedAt: row.updated_at,
      encryptionReady: isEncryptionReady(),
    }
  }
}

export function saveTelegramSettings(encryptedToken: string, chatId: string) {
  const now = new Date().toISOString()
  db.query(
    `INSERT INTO telegram_settings (id, encrypted_token, chat_id, updated_at)
     VALUES (1, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET encrypted_token = excluded.encrypted_token,
       chat_id = excluded.chat_id, updated_at = excluded.updated_at`
  ).run(encryptedToken, chatId, now)
}

export function getEncryptedTelegramSettings() {
  return db
    .query<{ encrypted_token: string; chat_id: string }, []>(
      "SELECT encrypted_token, chat_id FROM telegram_settings WHERE id = 1"
    )
    .get()
}

export function getFwAlertSettingsStatus(): FwAlertSettingsStatus {
  const row = db
    .query<{ encrypted_url: string; updated_at: string }, []>(
      "SELECT encrypted_url, updated_at FROM fwalert_settings WHERE id = 1"
    )
    .get()
  return {
    configured: Boolean(row),
    urlHint: row ? "已保存" : null,
    updatedAt: row?.updated_at ?? null,
    encryptionReady: isEncryptionReady(),
  }
}

export async function getFwAlertSettingsStatusWithHint(): Promise<FwAlertSettingsStatus> {
  const row = db
    .query<{ encrypted_url: string; updated_at: string }, []>(
      "SELECT encrypted_url, updated_at FROM fwalert_settings WHERE id = 1"
    )
    .get()
  if (!row) return getFwAlertSettingsStatus()

  try {
    return {
      configured: true,
      urlHint: maskSecret(await decryptSecret(row.encrypted_url)),
      updatedAt: row.updated_at,
      encryptionReady: isEncryptionReady(),
    }
  } catch {
    return {
      configured: true,
      urlHint: "已保存（无法解密）",
      updatedAt: row.updated_at,
      encryptionReady: isEncryptionReady(),
    }
  }
}

export function saveFwAlertSettings(encryptedUrl: string) {
  const now = new Date().toISOString()
  db.query(
    `INSERT INTO fwalert_settings (id, encrypted_url, updated_at)
     VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET encrypted_url = excluded.encrypted_url,
       updated_at = excluded.updated_at`
  ).run(encryptedUrl, now)
}

export function getEncryptedFwAlertSettings() {
  return db
    .query<{ encrypted_url: string }, []>(
      "SELECT encrypted_url FROM fwalert_settings WHERE id = 1"
    )
    .get()
}
