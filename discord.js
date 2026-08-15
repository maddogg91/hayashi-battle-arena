// Shared helper for posting to a Discord channel via an incoming webhook
// (Server Settings -> Integrations -> Webhooks in Discord). Optional across
// the app: does nothing if no webhook URL is configured, so callers never
// need to guard for that themselves.
//
// Pass `webhookUrl` to target a specific channel's webhook (e.g. a
// dedicated one for match replays); omitted or unset, it falls back to
// the general DISCORD_WEBHOOK_URL so single-webhook setups keep working
// unchanged.
export async function postToDiscord(body, { webhookUrl } = {}) {
  const url = webhookUrl || process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error("Discord webhook failed:", res.status, await res.text());
    }
  } catch (err) {
    console.error("Discord webhook error:", err.message);
  }
}
