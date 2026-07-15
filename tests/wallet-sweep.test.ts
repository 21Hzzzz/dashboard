import { describe, expect, test } from "bun:test"

import { calculateSweepAmounts, formatNativeAmount, isEvmAddress, toRpcQuantity, WEI_PER_NATIVE } from "../app/lib/wallet-sweep"

describe("native sweep calculation", () => {
  test("transfers the entire balance after the exact gas fee without a reserve", () => {
    const balance = 2n * WEI_PER_NATIVE
    const gasPrice = 30n * 10n ** 9n
    const gasLimit = 21_000n
    const result = calculateSweepAmounts(balance, gasPrice, gasLimit)

    expect(result.gasFeeWei).toBe(630_000_000_000_000n)
    expect(result.transferableWei + result.gasFeeWei).toBe(balance)
    expect(result.canSweep).toBe(true)
  })

  test("does not submit a sweep when the balance cannot cover gas", () => {
    const result = calculateSweepAmounts(10n, 2n, 5n)
    expect(result.canSweep).toBe(false)
    expect(result.transferableWei).toBe(0n)
  })
})

test("EVM address and RPC quantity helpers", () => {
  expect(isEvmAddress("0x1234567890aBcDeF1234567890ABCdef12345678")).toBe(true)
  expect(isEvmAddress("0x1234")).toBe(false)
  expect(toRpcQuantity(26n)).toBe("0x1a")
  expect(formatNativeAmount(1_234_500_000_000_000_000n)).toBe("1.2345")
})
