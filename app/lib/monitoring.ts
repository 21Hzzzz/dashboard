import type { AlertDirection } from "~/lib/price-alert.types"

export function isPositivePrice(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0
}

export function didCrossTarget({
  direction,
  previousPrice,
  currentPrice,
  targetPrice,
}: {
  direction: AlertDirection
  previousPrice: string | null
  currentPrice: string
  targetPrice: string
}) {
  if (previousPrice === null) return false

  const previous = Number(previousPrice)
  const current = Number(currentPrice)
  const target = Number(targetPrice)
  if (![previous, current, target].every(Number.isFinite)) return false

  return direction === "above"
    ? previous < target && current >= target
    : previous > target && current <= target
}

export function isWithinCooldown(lastTriggeredAt: string | null, cooldownMs: number, now = Date.now()) {
  if (!lastTriggeredAt) return false
  const timestamp = Date.parse(lastTriggeredAt)
  return Number.isFinite(timestamp) && now - timestamp < cooldownMs
}
