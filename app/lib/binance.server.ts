import type { SpotSymbol } from "~/lib/price-alert.types"

const BINANCE_API = "https://api.binance.com"

type ExchangeInfoResponse = {
  symbols: Array<{
    symbol: string
    status: string
    isSpotTradingAllowed: boolean
    baseAsset: string
    quoteAsset: string
  }>
}

export async function getSpotSymbols(): Promise<SpotSymbol[]> {
  const response = await fetch(`${BINANCE_API}/api/v3/exchangeInfo`, {
    headers: { accept: "application/json" },
  })
  if (!response.ok) throw new Error("Unable to load Binance spot pairs.")

  const data = (await response.json()) as ExchangeInfoResponse
  return data.symbols
    .filter((item) => item.status === "TRADING" && item.isSpotTradingAllowed)
    .map(({ symbol, baseAsset, quoteAsset }) => ({ symbol, baseAsset, quoteAsset }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol))
}

export async function getLatestPrices(symbols: string[]) {
  if (symbols.length === 0) return new Map<string, string>()

  const response = await fetch(
    `${BINANCE_API}/api/v3/ticker/price?symbols=${encodeURIComponent(JSON.stringify(symbols))}`,
    { headers: { accept: "application/json" } }
  )
  if (!response.ok) throw new Error("Unable to load Binance prices.")

  const rows = (await response.json()) as Array<{ symbol: string; price: string }>
  return new Map(rows.map((row) => [row.symbol, row.price]))
}
