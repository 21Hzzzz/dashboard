export function validateFwAlertUrl(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error("请输入有效的 FwAlert 电话链接。")
  }

  if (url.protocol !== "https:" || !/(^|\.)fwalert\.com$/i.test(url.hostname)) {
    throw new Error("FwAlert 链接必须是 https://fwalert.com 提供的电话推送地址。")
  }
  return url.toString()
}

export async function triggerFwAlert(url: string) {
  const response = await fetch(url, { method: "GET", headers: { accept: "application/json" } })
  if (!response.ok) throw new Error(`FwAlert 电话推送失败（HTTP ${response.status}）。`)
}
