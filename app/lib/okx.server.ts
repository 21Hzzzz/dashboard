import type { SpotSymbol } from "~/lib/price-alert.types"

const OKX_API = "https://www.okx.com"

type OkxResponse<T> = {
  code: string
  msg: string
  data: T[]
}

type OkxInstrument = {
  instId: string
  baseCcy: string
  quoteCcy: string
  state: string
}

type OkxTicker = {
  instId: string
  last: string
}

export async function getSpotSymbols(): Promise<SpotSymbol[]> {
  const response = await fetch(`${OKX_API}/api/v5/public/instruments?instType=SPOT`, {
    headers: { accept: "application/json" },
  })
  if (!response.ok) throw new Error("Unable to load OKX spot pairs.")

  const payload = (await response.json()) as OkxResponse<OkxInstrument>
  if (payload.code !== "0") throw new Error(payload.msg || "Unable to load OKX spot pairs.")
  return payload.data
    .filter((item) => item.state === "live")
    .map(({ instId, baseCcy, quoteCcy }) => ({ symbol: instId, baseAsset: baseCcy, quoteAsset: quoteCcy }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol))
}

export async function getLatestPrices(symbols: string[]) {
  if (symbols.length === 0) return new Map<string, string>()

  const response = await fetch(`${OKX_API}/api/v5/market/tickers?instType=SPOT`, {
    headers: { accept: "application/json" },
  })
  if (!response.ok) throw new Error("Unable to load OKX prices.")

  const payload = (await response.json()) as OkxResponse<OkxTicker>
  if (payload.code !== "0") throw new Error(payload.msg || "Unable to load OKX prices.")
  const requested = new Set(symbols)
  return new Map(payload.data.filter((row) => requested.has(row.instId)).map((row) => [row.instId, row.last]))
}
