export const WEI_PER_NATIVE = 10n ** 18n

export type SweepAmounts = {
  gasFeeWei: bigint
  transferableWei: bigint
  canSweep: boolean
}

export function calculateSweepAmounts(
  balanceWei: bigint,
  gasPriceWei: bigint,
  gasLimit: bigint,
): SweepAmounts {
  const gasFeeWei = gasPriceWei * gasLimit
  const transferableWei = balanceWei > gasFeeWei ? balanceWei - gasFeeWei : 0n

  return { gasFeeWei, transferableWei, canSweep: transferableWei > 0n }
}

export function isEvmAddress(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim())
}

export function toRpcQuantity(value: bigint) {
  return `0x${value.toString(16)}`
}

export function formatNativeAmount(value: bigint, maximumFractionDigits = 6) {
  const whole = value / WEI_PER_NATIVE
  const fraction = (value % WEI_PER_NATIVE)
    .toString()
    .padStart(18, "0")
    .slice(0, maximumFractionDigits)
    .replace(/0+$/, "")

  return fraction ? `${whole}.${fraction}` : whole.toString()
}
