// Shared helper for posting to a Discord channel via an incoming webhook
// (Server Settings -> Integrations -> Webhooks in Discord). Optional across
// the app: does nothing if DISCORD_WEBHOOK_URL isn't configured, so callers
// never need to guard for that themselves.
export async function postToDiscord(body) {
  const url = process.env.DISCORD_WEBHOOK_URL;
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
