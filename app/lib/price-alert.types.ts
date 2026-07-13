export type AlertDirection = "above" | "below"
export type NotificationChannel = "telegram" | "phone"

export type AlertRule = {
  id: number
  symbol: string
  direction: AlertDirection
  targetPrice: string
  channels: NotificationChannel[]
  enabled: boolean
  lastPrice: string | null
  lastTriggeredAt: string | null
  lastPhoneTriggeredAt: string | null
  lastError: string | null
  createdAt: string
  updatedAt: string
}

export type TelegramSettingsStatus = {
  configured: boolean
  chatId: string | null
  tokenHint: string | null
  updatedAt: string | null
  encryptionReady: boolean
}

export type FwAlertSettingsStatus = {
  configured: boolean
  urlHint: string | null
  updatedAt: string | null
  encryptionReady: boolean
}

export type BinanceSymbol = {
  symbol: string
  baseAsset: string
  quoteAsset: string
}

export type MarketSnapshot = {
  rules: AlertRule[]
  monitoredAt: string
  monitorError: string | null
}
