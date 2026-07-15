import { expect, test } from "bun:test"

import { getLatestPrices, getSpotSymbols } from "../app/lib/okx.server"

test("loads live OKX spot pairs and maps their display data", async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => Response.json({
    code: "0",
    msg: "",
    data: [
      { instId: "ETH-USDT", baseCcy: "ETH", quoteCcy: "USDT", state: "live" },
      { instId: "BTC-USDT", baseCcy: "BTC", quoteCcy: "USDT", state: "live" },
      { instId: "OLD-USDT", baseCcy: "OLD", quoteCcy: "USDT", state: "suspend" },
    ],
  })) as unknown as typeof fetch

  try {
    await expect(getSpotSymbols()).resolves.toEqual([
      { symbol: "BTC-USDT", baseAsset: "BTC", quoteAsset: "USDT" },
      { symbol: "ETH-USDT", baseAsset: "ETH", quoteAsset: "USDT" },
    ])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("keeps only requested OKX ticker prices", async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => Response.json({
    code: "0",
    msg: "",
    data: [
      { instId: "BTC-USDT", last: "100000" },
      { instId: "ETH-USDT", last: "3000" },
    ],
  })) as unknown as typeof fetch

  try {
    await expect(getLatestPrices(["BTC-USDT"])).resolves.toEqual(new Map([["BTC-USDT", "100000"]]))
  } finally {
    globalThis.fetch = originalFetch
  }
})
