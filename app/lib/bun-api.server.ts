import { getSpotSymbols } from "~/lib/binance.server"
import { isEncryptionReady } from "~/lib/crypto.server"
import {
  createRule,
  deleteRule,
  getFwAlertSettingsStatusWithHint,
  getTelegramSettingsStatusWithHint,
  listRules,
  updateRule,
} from "~/lib/db.server"
import { isPositivePrice } from "~/lib/monitoring"
import { getMonitorSnapshot } from "~/lib/monitor.service.server"
import type { AlertDirection } from "~/lib/price-alert.types"
import type { NotificationChannel } from "~/lib/price-alert.types"
import { triggerFwAlert } from "~/lib/fwalert.server"
import { getFwAlertUrl, saveFwAlertConfiguration } from "~/lib/fwalert-settings.server"
import {
  getTelegramCredentials,
  saveTelegramConfiguration,
} from "~/lib/telegram-settings.server"
import { sendTelegramMessage } from "~/lib/telegram.server"

function error(message: string, status = 400) {
  return Response.json({ error: message }, { status })
}

function isDirection(value: unknown): value is AlertDirection {
  return value === "above" || value === "below"
}

function isChannels(value: unknown): value is NotificationChannel[] {
  return Array.isArray(value)
    && value.length > 0
    && value.every((channel) => channel === "telegram" || channel === "phone")
}

async function validateSpotSymbol(symbol: string) {
  const pairs = await getSpotSymbols()
  return pairs.some((pair) => pair.symbol === symbol)
}

export async function handleApiRequest(request: Request, pathname: string) {
  try {
    if (pathname === "/api/dashboard" && request.method === "GET") {
      const [symbols, telegram, fwalert] = await Promise.all([
        getSpotSymbols(),
        getTelegramSettingsStatusWithHint(),
        getFwAlertSettingsStatusWithHint(),
      ])
      return Response.json({ symbols, rules: listRules(), telegram, fwalert })
    }
    if (pathname === "/api/market/snapshot" && request.method === "GET") {
      return Response.json(getMonitorSnapshot())
    }
    if (pathname === "/api/telegram-settings" && request.method === "GET") {
      return Response.json({ telegram: await getTelegramSettingsStatusWithHint() })
    }
    if (pathname === "/api/telegram-settings" && request.method === "POST") {
      const body = (await request.json()) as { token?: string; chatId?: string }
      const token = body.token?.trim()
      const chatId = body.chatId?.trim()
      if (!token || !chatId) return error("Bot Token 和 Chat ID 均为必填项。")
      if (!isEncryptionReady()) return error("缺少 PRICE_ALERT_ENCRYPTION_KEY，无法安全保存 Token。", 503)
      return Response.json({ telegram: await saveTelegramConfiguration(token, chatId) })
    }
    if (pathname === "/api/telegram-settings/test" && request.method === "POST") {
      const settings = await getTelegramCredentials()
      await sendTelegramMessage({
        ...settings,
        text: "Price Alert 已连接。此消息用于验证 Telegram 推送配置。",
      })
      return Response.json({ ok: true })
    }
    if (pathname === "/api/fwalert-settings" && request.method === "GET") {
      return Response.json({ fwalert: await getFwAlertSettingsStatusWithHint() })
    }
    if (pathname === "/api/fwalert-settings" && request.method === "POST") {
      const body = (await request.json()) as { url?: string }
      const url = body.url?.trim()
      if (!url) return error("FwAlert 电话链接为必填项。")
      return Response.json({ fwalert: await saveFwAlertConfiguration(url) })
    }
    if (pathname === "/api/fwalert-settings/test" && request.method === "POST") {
      await triggerFwAlert(await getFwAlertUrl())
      return Response.json({ ok: true })
    }
    if (pathname === "/api/alert-rules" && request.method === "GET") {
      return Response.json({ rules: listRules() })
    }
    if (pathname === "/api/alert-rules" && request.method === "POST") {
      const body = (await request.json()) as { symbol?: string; direction?: AlertDirection; targetPrice?: string; channels?: NotificationChannel[] }
      const symbol = body.symbol?.trim().toUpperCase()
      const targetPrice = body.targetPrice?.trim()
      if (!symbol || !isDirection(body.direction) || !targetPrice || !isPositivePrice(targetPrice) || !isChannels(body.channels)) {
        return error("请填写有效的交易对、方向、正数目标价，并至少选择一个通知渠道。")
      }
      if (!await validateSpotSymbol(symbol)) return error("交易对不是可交易的 Binance 现货标的。")
      return Response.json({ rule: createRule({ symbol, direction: body.direction, targetPrice, channels: body.channels }) })
    }

    const match = pathname.match(/^\/api\/alert-rules\/(\d+)$/)
    if (match) {
      const id = Number(match[1])
      if (request.method === "DELETE") {
        return deleteRule(id) ? Response.json({ ok: true }) : error("规则不存在。", 404)
      }
      if (request.method === "PATCH") {
        const body = (await request.json()) as { symbol?: string; direction?: AlertDirection; targetPrice?: string; enabled?: boolean; channels?: NotificationChannel[] }
        if (body.direction !== undefined && !isDirection(body.direction)) return error("无效的告警方向。")
        if (body.targetPrice !== undefined && !isPositivePrice(body.targetPrice)) return error("目标价必须是正数。")
        if (body.channels !== undefined && !isChannels(body.channels)) return error("请至少选择一个通知渠道。")
        if (body.symbol) {
          body.symbol = body.symbol.trim().toUpperCase()
          if (!await validateSpotSymbol(body.symbol)) return error("交易对不是可交易的 Binance 现货标的。")
        }
        const rule = updateRule(id, body)
        return rule ? Response.json({ rule }) : error("规则不存在。", 404)
      }
    }
    return error("Not found.", 404)
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : "服务请求失败。", 500)
  }
}
