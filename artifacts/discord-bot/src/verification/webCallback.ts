import type { IncomingMessage, ServerResponse } from "http";
import { getPool } from "../persistence.js";

const CLIENT_ID = process.env.DISCORD_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET ?? "";
const REDIRECT_URI = process.env.OAUTH_REDIRECT_URI ?? "";

function basicAuth(): string {
  return Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
}

interface DiscordRole { id: string; name: string; }

async function getGuildRoles(guildId: string, botToken: string): Promise<DiscordRole[]> {
  try {
    const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
      headers: { Authorization: `Bot ${botToken}` },
    });
    if (!res.ok) return [];
    return (await res.json()) as DiscordRole[];
  } catch { return []; }
}

function sendHtml(res: ServerResponse, status: number, title: string, body: string, isSuccess = false): void {
  const accentColor = isSuccess ? "#00ffff" : status >= 500 ? "#ff4444" : "#ffaa00";
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${title} — Last Stand</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    body{
      background:#0d0e10;
      color:#e0e0e0;
      font-family:'Inter',system-ui,sans-serif;
      display:flex;align-items:center;justify-content:center;
      min-height:100vh;padding:1.5rem;
    }
    .wrap{max-width:420px;width:100%;text-align:center}
    .clan{font-size:.75rem;font-weight:700;letter-spacing:.2em;color:${accentColor};
          margin-bottom:2rem;opacity:.7;text-transform:uppercase}
    .card{
      background:#16181c;
      border-radius:16px;
      padding:2.5rem 2rem;
      border:1px solid ${accentColor}33;
      box-shadow:0 0 60px ${accentColor}0d;
    }
    .icon{font-size:2.5rem;margin-bottom:1.2rem;display:block}
    h1{font-size:1.4rem;font-weight:700;color:#fff;margin-bottom:.75rem;line-height:1.3}
    p{line-height:1.65;color:#8a8f9a;font-size:.95rem}
    p strong{color:#c9cdd6}
    .divider{height:1px;background:${accentColor}22;margin:1.5rem 0}
    .hint{font-size:.8rem;color:#555;margin-top:1.5rem}
    a{color:${accentColor};text-decoration:none}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="clan">Last Stand</div>
    <div class="card">
      <span class="icon">${isSuccess ? "✅" : status >= 500 ? "⚠️" : "❌"}</span>
      <h1>${title}</h1>
      <div class="divider"></div>
      <p>${body}</p>
    </div>
    <div class="hint">Need help? Contact <strong>EoN</strong></div>
  </div>
</body>
</html>`;
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

export async function handleOAuthCallback(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? "/", `https://${req.headers.host}`);
  const code = url.searchParams.get("code");
  const guildId = url.searchParams.get("state");

  if (!code) {
    sendHtml(res, 400, "Verification Failed", "Something didn't go right. Head back to the server and try again.");
    return;
  }
  if (!guildId) {
    sendHtml(res, 400, "Invalid Link", "This verification link isn't valid. Ask an admin to re-post the verification panel.");
    return;
  }
  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
    sendHtml(res, 500, "Something Went Wrong", "Verification isn't set up correctly on our end. Contact <strong>EoN</strong>.");
    return;
  }

  try {
    // 1. Exchange code for tokens
    const tokenRes = await fetch("https://discord.com/api/v10/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth()}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });

    if (!tokenRes.ok) {
      console.error("[OAUTH] Token exchange failed:", tokenRes.status, await tokenRes.text());
      sendHtml(res, 400, "Verification Failed", "Couldn't complete the verification. Try clicking Verify again, or contact <strong>EoN</strong> if it keeps happening.");
      return;
    }

    const tokens = (await tokenRes.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    // 2. Get user identity
    const userRes = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!userRes.ok) {
      sendHtml(res, 400, "Verification Failed", "Couldn't reach your Discord profile. Try again, or contact <strong>EoN</strong>.");
      return;
    }
    const user = (await userRes.json()) as { id: string; username: string };

    // 3. Store token backup (per user + guild)
    const expiry = new Date(Date.now() + tokens.expires_in * 1000);
    if (process.env.DATABASE_URL) {
      await getPool().query(
        `INSERT INTO auth_backups (user_id, access_token, refresh_token, token_expiry, guild_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, guild_id) DO UPDATE
         SET access_token  = EXCLUDED.access_token,
             refresh_token = EXCLUDED.refresh_token,
             token_expiry  = EXCLUDED.token_expiry`,
        [user.id, tokens.access_token, tokens.refresh_token, expiry.toISOString(), guildId],
      );
    }

    const botToken = process.env.DISCORD_BOT_TOKEN ?? process.env.DISCORD_TOKEN ?? "";

    // 4. Look up roles by name so it works on any server
    const roles = await getGuildRoles(guildId, botToken);
    const memberRole = roles.find(
      (r) => r.name.toLowerCase() === "clan members" || r.name.toLowerCase() === "member",
    );
    const unverifiedRole = roles.find((r) => r.name.toLowerCase() === "unverified");

    // 5. Add user to guild
    const addBody: Record<string, unknown> = { access_token: tokens.access_token };
    if (memberRole) addBody.roles = [memberRole.id];

    const addRes = await fetch(
      `https://discord.com/api/v10/guilds/${guildId}/members/${user.id}`,
      {
        method: "PUT",
        headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(addBody),
      },
    );

    if (addRes.ok || addRes.status === 201 || addRes.status === 204) {
      if (memberRole) {
        await fetch(
          `https://discord.com/api/v10/guilds/${guildId}/members/${user.id}/roles/${memberRole.id}`,
          { method: "PUT", headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" }, body: "{}" },
        ).catch(() => {});
      }
      if (unverifiedRole) {
        await fetch(
          `https://discord.com/api/v10/guilds/${guildId}/members/${user.id}/roles/${unverifiedRole.id}`,
          { method: "DELETE", headers: { Authorization: `Bot ${botToken}` } },
        ).catch(() => {});
      }
    }

    console.log(`[OAUTH] Verified ${user.username} (${user.id}) for guild ${guildId}`);
    sendHtml(res, 200, "You're verified.", "Head back to the server — you're good to go.", true);
  } catch (err) {
    console.error("[OAUTH] Unexpected error:", err);
    sendHtml(res, 500, "Something Went Wrong", "Something on our end went wrong. Contact <strong>EoN</strong> and let them know.");
  }
}
