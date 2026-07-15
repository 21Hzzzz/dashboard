import * as React from "react"
import { Check, CircleAlert, ExternalLink, LoaderCircle, LogOut, WalletCards } from "lucide-react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select"
import {
  calculateSweepAmounts,
  formatNativeAmount,
  isEvmAddress,
  toRpcQuantity,
  type SweepAmounts,
} from "~/lib/wallet-sweep"

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
  on?: (event: "accountsChanged" | "chainChanged", handler: (value: unknown) => void) => void
  removeListener?: (event: "accountsChanged" | "chainChanged", handler: (value: unknown) => void) => void
}

type EvmNetwork = {
  chainId: number
  name: string
  symbol: string
}

type SweepPlan = SweepAmounts & {
  balanceWei: bigint
  gasPriceWei: bigint
  gasLimit: bigint
  network: EvmNetwork
}

const NETWORKS: EvmNetwork[] = [
  { chainId: 1, name: "Ethereum", symbol: "ETH" },
  { chainId: 56, name: "BNB Smart Chain", symbol: "BNB" },
  { chainId: 137, name: "Polygon", symbol: "POL" },
  { chainId: 10, name: "Optimism", symbol: "ETH" },
  { chainId: 42161, name: "Arbitrum One", symbol: "ETH" },
  { chainId: 8453, name: "Base", symbol: "ETH" },
]

function getProvider() {
  return typeof window === "undefined"
    ? undefined
    : (window as Window & { ethereum?: Eip1193Provider }).ethereum
}

function asRpcQuantity(value: unknown, label: string) {
  if (typeof value !== "string" || !/^0x[\da-f]+$/i.test(value)) {
    throw new Error(`${label} 返回了无效数据，请稍后重试。`)
  }
  return BigInt(value)
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

function toChainId(value: unknown) {
  if (typeof value !== "string" || !/^0x[\da-f]+$/i.test(value)) return null
  return Number.parseInt(value, 16)
}

function providerError(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message
  }
  return fallback
}

async function createSweepPlan(
  provider: Eip1193Provider,
  account: string,
  destination: string,
  network: EvmNetwork,
) {
  const [balanceValue, gasPriceValue] = await Promise.all([
    provider.request({ method: "eth_getBalance", params: [account, "latest"] }),
    provider.request({ method: "eth_gasPrice" }),
  ])
  const balanceWei = asRpcQuantity(balanceValue, "余额")
  const gasPriceWei = asRpcQuantity(gasPriceValue, "Gas 价格")

  let gasLimit = asRpcQuantity(
    await provider.request({
      method: "eth_estimateGas",
      params: [{ from: account, to: destination, value: "0x1", gasPrice: toRpcQuantity(gasPriceWei) }],
    }),
    "Gas 估算",
  )
  let amounts = calculateSweepAmounts(balanceWei, gasPriceWei, gasLimit)

  // Re-estimate with the actual sweep amount. This matters when the recipient is a contract.
  for (let attempt = 0; attempt < 2 && amounts.canSweep; attempt += 1) {
    const estimatedGasLimit = asRpcQuantity(
      await provider.request({
        method: "eth_estimateGas",
        params: [{
          from: account,
          to: destination,
          value: toRpcQuantity(amounts.transferableWei),
          gasPrice: toRpcQuantity(gasPriceWei),
        }],
      }),
      "Gas 估算",
    )
    if (estimatedGasLimit === gasLimit) break
    gasLimit = estimatedGasLimit
    amounts = calculateSweepAmounts(balanceWei, gasPriceWei, gasLimit)
  }

  return { ...amounts, balanceWei, gasPriceWei, gasLimit, network } satisfies SweepPlan
}

export function WalletClient() {
  const [account, setAccount] = React.useState<string | null>(null)
  const [connectedChainId, setConnectedChainId] = React.useState<number | null>(null)
  const [selectedChainId, setSelectedChainId] = React.useState("1")
  const [destination, setDestination] = React.useState("")
  const [plan, setPlan] = React.useState<SweepPlan | null>(null)
  const [connecting, setConnecting] = React.useState(false)
  const [calculating, setCalculating] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [transactionHash, setTransactionHash] = React.useState<string | null>(null)

  const selectedNetwork = NETWORKS.find((network) => network.chainId === Number(selectedChainId)) ?? NETWORKS[0]
  const connectedNetwork = NETWORKS.find((network) => network.chainId === connectedChainId)
  const onSelectedNetwork = connectedChainId === selectedNetwork.chainId

  React.useEffect(() => {
    const provider = getProvider()
    if (!provider?.on) return

    const handleAccountsChanged = (value: unknown) => {
      const accounts = Array.isArray(value) ? value.filter((account): account is string => typeof account === "string") : []
      setAccount(accounts[0] ?? null)
      setPlan(null)
    }
    const handleChainChanged = (value: unknown) => {
      const chainId = toChainId(value)
      setConnectedChainId(chainId)
      if (chainId && NETWORKS.some((network) => network.chainId === chainId)) setSelectedChainId(String(chainId))
      setPlan(null)
    }
    provider.on("accountsChanged", handleAccountsChanged)
    provider.on("chainChanged", handleChainChanged)

    return () => {
      provider.removeListener?.("accountsChanged", handleAccountsChanged)
      provider.removeListener?.("chainChanged", handleChainChanged)
    }
  }, [])

  async function connectWallet() {
    const provider = getProvider()
    if (!provider) {
      toast.error("未检测到浏览器钱包，请安装或启用 MetaMask、Rabby 等 EVM 钱包。")
      return
    }

    setConnecting(true)
    try {
      const accounts = await provider.request({ method: "eth_requestAccounts" })
      if (!Array.isArray(accounts) || typeof accounts[0] !== "string") throw new Error("钱包没有返回可用账户。")
      const chainId = toChainId(await provider.request({ method: "eth_chainId" }))
      setAccount(accounts[0])
      setConnectedChainId(chainId)
      if (chainId && NETWORKS.some((network) => network.chainId === chainId)) setSelectedChainId(String(chainId))
      toast.success("钱包已连接")
    } catch (error) {
      toast.error(providerError(error, "连接钱包失败。"))
    } finally {
      setConnecting(false)
    }
  }

  function disconnectWallet() {
    setAccount(null)
    setConnectedChainId(null)
    setPlan(null)
    setTransactionHash(null)
    toast.success("已断开当前面板的钱包连接")
  }

  async function switchNetwork(value: string | null) {
    if (!value) return
    setSelectedChainId(value)
    setPlan(null)
    if (!account) return

    const provider = getProvider()
    const network = NETWORKS.find((item) => item.chainId === Number(value))
    if (!provider || !network || connectedChainId === network.chainId) return

    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: toRpcQuantity(BigInt(network.chainId)) }] })
      setConnectedChainId(network.chainId)
      toast.success(`已切换至 ${network.name}`)
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined
      toast.error(code === 4902 ? `请先在钱包中添加 ${network.name} 网络。` : providerError(error, "切换网络失败。"))
    }
  }

  async function calculatePlan() {
    const provider = getProvider()
    if (!provider || !account) {
      toast.error("请先连接钱包。")
      return null
    }
    if (!onSelectedNetwork) {
      toast.error(`请先将钱包切换至 ${selectedNetwork.name}。`)
      return null
    }
    if (!isEvmAddress(destination)) {
      toast.error("请输入有效的 EVM 收款地址。")
      return null
    }

    setCalculating(true)
    try {
      const nextPlan = await createSweepPlan(provider, account, destination.trim(), selectedNetwork)
      if (!nextPlan.canSweep) throw new Error("当前余额不足以支付这笔原生代币转账的 Gas 费用。")
      setPlan(nextPlan)
      setTransactionHash(null)
      return nextPlan
    } catch (error) {
      setPlan(null)
      toast.error(providerError(error, "无法计算 Sweep 金额。"))
      return null
    } finally {
      setCalculating(false)
    }
  }

  async function openConfirmation() {
    const nextPlan = await calculatePlan()
    if (nextPlan) setConfirmOpen(true)
  }

  async function submitSweep() {
    const provider = getProvider()
    if (!provider || !account) return
    setSubmitting(true)
    try {
      // Do not use a stale preview: the final transaction is calculated at confirmation time.
      const finalPlan = await createSweepPlan(provider, account, destination.trim(), selectedNetwork)
      if (!finalPlan.canSweep) throw new Error("当前余额不足以支付这笔原生代币转账的 Gas 费用。")
      setPlan(finalPlan)
      const hash = await provider.request({
        method: "eth_sendTransaction",
        params: [{
          from: account,
          to: destination.trim(),
          value: toRpcQuantity(finalPlan.transferableWei),
          gas: toRpcQuantity(finalPlan.gasLimit),
          gasPrice: toRpcQuantity(finalPlan.gasPriceWei),
        }],
      })
      if (typeof hash !== "string") throw new Error("钱包未返回交易哈希。")
      setTransactionHash(hash)
      setConfirmOpen(false)
      toast.success("Sweep 交易已提交，等待链上确认。")
    } catch (error) {
      toast.error(providerError(error, "Sweep 交易未能提交。"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="flex flex-1 flex-col gap-5 p-4 md:p-6">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <p className="text-xs text-muted-foreground">WALLET</p>
          <h1 className="mt-1 text-xl font-medium">钱包</h1>
          <p className="mt-1 text-sm text-muted-foreground">连接浏览器钱包后，可在指定网络将全部可转原生代币汇集至一个地址。</p>
        </div>
        {account ? (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="h-8 gap-2 px-2.5 font-mono"><span className="size-1.5 bg-emerald-500" />{shortAddress(account)}</Badge>
            <Button variant="outline" onClick={disconnectWallet}><LogOut />断开连接</Button>
          </div>
        ) : (
          <Button onClick={connectWallet} disabled={connecting}>{connecting ? <LoaderCircle className="animate-spin" /> : <WalletCards />}连接钱包</Button>
        )}
      </section>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>原生代币 Sweeper</CardTitle>
          <CardDescription>仅转移当前所选网络的原生代币，不会读取、上传或保存你的私钥。</CardDescription>
          <CardAction><Badge variant={account ? "outline" : "destructive"} className={account ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : ""}>{account ? "已连接" : "未连接"}</Badge></CardAction>
        </CardHeader>
        <CardContent className="grid gap-5 pt-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="grid content-start gap-4">
            <div className="grid gap-2">
              <Label htmlFor="wallet-network">网络</Label>
              <Select value={selectedChainId} onValueChange={switchNetwork} disabled={!account}>
                <SelectTrigger id="wallet-network" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent align="start" alignItemWithTrigger={false}>{NETWORKS.map((network) => <SelectItem key={network.chainId} value={String(network.chainId)}>{network.name} · {network.symbol}</SelectItem>)}</SelectContent>
              </Select>
              {!account ? <p className="text-xs text-muted-foreground">连接钱包后即可选择并切换网络。</p> : !onSelectedNetwork ? <p className="text-xs text-amber-700 dark:text-amber-400">钱包当前在 {connectedNetwork?.name ?? "未支持网络"}，请先切换到 {selectedNetwork.name}。</p> : <p className="text-xs text-muted-foreground">当前钱包网络：{selectedNetwork.name}</p>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sweep-destination">收款地址</Label>
              <Input id="sweep-destination" value={destination} onChange={(event) => { setDestination(event.target.value); setPlan(null) }} placeholder="0x…" spellCheck={false} autoComplete="off" />
              <p className="text-xs text-muted-foreground">仅支持 EVM 地址。交易发送后无法撤销，请逐字确认地址。</p>
            </div>
            <div className="border border-amber-500/35 bg-amber-500/5 p-3 text-xs leading-5 text-amber-950 dark:text-amber-100"><div className="flex items-center gap-2 font-medium"><CircleAlert className="size-4" />不预留 Gas</div><p className="mt-1">将按即时余额、Gas Price 与实际估算 Gas 计算可转金额，扣除手续费后把剩余原生代币全部发送。确认时会重新计算一次。</p></div>
            <Button className="w-full sm:w-fit" onClick={openConfirmation} disabled={!account || !onSelectedNetwork || calculating}>{calculating ? <LoaderCircle className="animate-spin" /> : <Check />}计算并确认 Sweep</Button>
          </div>

          <div className="border bg-muted/20 p-4">
            <p className="text-sm font-medium">本次计算</p>
            {plan ? (
              <dl className="mt-4 grid gap-3 text-xs">
                <div className="flex items-center justify-between gap-3 border-b pb-2"><dt className="text-muted-foreground">当前余额</dt><dd className="font-mono">{formatNativeAmount(plan.balanceWei)} {plan.network.symbol}</dd></div>
                <div className="flex items-center justify-between gap-3 border-b pb-2"><dt className="text-muted-foreground">Gas Price</dt><dd className="font-mono">{formatNativeAmount(plan.gasPriceWei, 9)} {plan.network.symbol}</dd></div>
                <div className="flex items-center justify-between gap-3 border-b pb-2"><dt className="text-muted-foreground">估算 Gas</dt><dd className="font-mono">{plan.gasLimit.toString()}</dd></div>
                <div className="flex items-center justify-between gap-3 border-b pb-2"><dt className="text-muted-foreground">预计手续费</dt><dd className="font-mono">{formatNativeAmount(plan.gasFeeWei)} {plan.network.symbol}</dd></div>
                <div className="flex items-center justify-between gap-3 pt-1 text-sm font-medium"><dt>预计转出</dt><dd className="font-mono">{formatNativeAmount(plan.transferableWei)} {plan.network.symbol}</dd></div>
              </dl>
            ) : <div className="flex min-h-52 flex-col items-center justify-center gap-2 text-center text-muted-foreground"><WalletCards className="size-6" /><p>连接钱包并输入收款地址后，计算可转金额。</p></div>}
            {transactionHash && <div className="mt-4 border border-emerald-500/35 bg-emerald-500/5 p-3 text-xs text-emerald-800 dark:text-emerald-300"><div className="flex items-center gap-2 font-medium"><Check className="size-4" />交易已提交</div><p className="mt-1 break-all font-mono">{transactionHash}</p></div>}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认发起 Sweep？</AlertDialogTitle>
            <AlertDialogDescription>将把 {plan ? `${formatNativeAmount(plan.transferableWei)} ${plan.network.symbol}` : "当前全部可转原生代币"} 发送至 {shortAddress(destination.trim() || "0x0000000000000000000000000000000000000000")}。确认后会立即重新读取余额、Gas Price 和估算 Gas，并在钱包中请求签名。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={submitSweep} disabled={submitting}>{submitting ? <LoaderCircle className="animate-spin" /> : <ExternalLink />}{submitting ? "正在请求钱包确认" : "确认并发起交易"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}
