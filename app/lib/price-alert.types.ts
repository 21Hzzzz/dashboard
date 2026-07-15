export type AlertDirection = "above" | "below"
export type AlertTriggerType = "target" | "interval" | "basket"
export type NotificationChannel = "telegram" | "phone"
export type SpotMarket = "binance" | "okx"

export type BasketMember = {
  market: SpotMarket
  symbol: string
}

export type AlertRule = {
  id: number
  market: SpotMarket
  symbol: string
  triggerType: AlertTriggerType
  direction: AlertDirection
  targetPrice: string
  interval: string | null
  intervalResetRange: string
  intervalSuppressions: string[]
  basketMembers: BasketMember[]
  deviationPercent: string | null
  basketBreaches: string[]
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
  token: string | null
  updatedAt: string | null
  encryptionReady: boolean
}

export type FwAlertSettingsStatus = {
  configured: boolean
  url: string | null
  updatedAt: string | null
  encryptionReady: boolean
}

export type SpotSymbol = {
  symbol: string
  baseAsset: string
  quoteAsset: string
}

export type MarketSnapshot = {
  rules: AlertRule[]
  monitoredAt: string
  monitorError: string | null
}

export type AccessLogEvent = "panel_access" | "login_success" | "login_failure" | "ip_blocked" | "logout"

export type PanelAccessLog = {
  id: number
  ip: string
  event: AccessLogEvent
  status: "success" | "failure" | "blocked"
  path: string
  createdAt: string
}
