export async function sendTelegramMessage({
  token,
  chatId,
  text,
}: {
  token: string
  chatId: string
  text: string
}) {
  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    }
  )
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Telegram rejected the message: ${detail.slice(0, 160)}`)
  }
}
