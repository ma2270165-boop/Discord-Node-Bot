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

function sendHtml(res: ServerResponse, status: number, title: string, body: string): void {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${title} — Last Stand</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#1a1b1e;color:#e0e0e0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
         display:flex;align-items:center;justify-content:center;min-height:100vh;padding:2rem}
    .card{background:#2f3136;border-radius:12px;padding:2.5rem 3rem;max-width:480px;
          text-align:center;border:1px solid #00ffff44;box-shadow:0 0 40px #00ffff18}
    h1{font-size:1.6rem;color:#00ffff;margin-bottom:1rem}
    p{line-height:1.6;color:#b0b3b8;font-size:1rem}
    .badge{display:inline-block;margin-top:1.5rem;padding:.5rem 1.5rem;
           background:#00ffff18;border:1px solid #00ffff55;border-radius:6px;
           color:#00ffff;font-size:.85rem;letter-spacing:.05em}
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${body}</p>
    <div class="badge">LAST STAND</div>
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
    sendHtml(res, 400, "Verification Failed", "No authorization code received. Please try again.");
    return;
  }
  if (!guildId) {
    sendHtml(res, 400, "Verification Failed", "Invalid link. Ask an admin to re-run <code>?setupverification</code>.");
    return;
  }
  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
    sendHtml(res, 500, "Configuration Error", "Verification is not fully configured. Contact an admin.");
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
      sendHtml(res, 400, "Verification Failed", "Couldn't complete verification. Try clicking Verify again.");
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
      sendHtml(res, 400, "Verification Failed", "Couldn't fetch your Discord profile. Try again.");
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
    sendHtml(res, 200, "You're In.", `Verified, <strong>${user.username}</strong>. Head back to the server — you're good to go.`);
  } catch (err) {
    console.error("[OAUTH] Unexpected error:", err);
    sendHtml(res, 500, "Something Went Wrong", "Internal error. Try again or contact an admin.");
  }
}
