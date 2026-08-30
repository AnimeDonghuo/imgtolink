/**
 * Image Uploader Bot — Telegram webhook server
 * ---------------------------------------------------------------
 * Deploy target : Koyeb (free tier)
 * - Listens on 0.0.0.0:<PORT>  (Koyeb sets PORT=8000 — the Koyeb convention)
 * - TCP health check : passes automatically because the server binds the port
 * - GET /health      : 200 OK (available for HTTP health checks too)
 * - GET /welcome.jpg : a random one of the 20 bundled /start welcome images
 * - GET /welcome/<file>.jpg : a specific welcome image by filename
 * - POST /           : Telegram webhook updates
 *
 * Reliability:
 * - Webhook updates are acknowledged with 200 instantly and processed in the
 *   background, so slow Telegram/DB calls can never make Telegram time out.
 * - At boot the bot logs the current webhook status (getWebhookInfo) and, when
 *   it knows its public URL (KOYEB_PUBLIC_DOMAIN or APP_URL), automatically
 *   (re)sets the webhook to itself.
 *
 * Uses Deno's built-in HTTP server (no external imports), so the app
 * has zero runtime dependencies outside the code in this repo.
 */

import { BotController } from "./controllers/bot.controller.ts";
import { PUBLIC_BASE_URL } from "./config/config.ts";

const PORT = Number.parseInt(Deno.env.get("PORT") ?? "8000", 10) || 8000;

/** Reject a promise if it doesn't settle within ms — prevents hangs. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

// Load all bundled welcome images once at boot (needs --allow-read).
const WELCOME_IMAGES: { name: string; data: Uint8Array }[] = [];
try {
  for await (const entry of Deno.readDir("./assets/welcome")) {
    if (entry.isFile && entry.name.endsWith(".jpg")) {
      const data = await Deno.readFile(`./assets/welcome/${entry.name}`);
      WELCOME_IMAGES.push({ name: entry.name, data });
    }
  }
  WELCOME_IMAGES.sort((a, b) => a.name.localeCompare(b.name));
  let total = 0;
  for (const img of WELCOME_IMAGES) total += img.data.byteLength;
  console.log(`✅ Loaded ${WELCOME_IMAGES.length} welcome images (${(total / 1024).toFixed(0)} KB)`);
} catch (error) {
  console.error("⚠️ Could not load assets/welcome/:", error);
}

function randomWelcomeImage(): Uint8Array | null {
  if (WELCOME_IMAGES.length === 0) return null;
  const pick = WELCOME_IMAGES[Math.floor(Math.random() * WELCOME_IMAGES.length)];
  return pick.data;
}

function handleHealthCheck(req: Request): Response {
  console.log(`ℹ️ Health check: ${req.method} ${req.url}`);
  return new Response("OK", { status: 200 });
}

function handleWelcomeImage(name: string | null): Response {
  if (name) {
    // Only allow plain filenames like welcome-07.jpg
    if (!/^[a-zA-Z0-9._-]+\.jpg$/.test(name)) {
      return new Response("Not Found", { status: 404 });
    }
    const img = WELCOME_IMAGES.find((i) => i.name === name);
    if (!img) return new Response("Not Found", { status: 404 });
    return new Response(img.data, {
      headers: {
        "content-type": "image/jpeg",
        "cache-control": "public, max-age=86400",
      },
    });
  }

  const random = randomWelcomeImage();
  if (!random) return new Response("Not Found", { status: 404 });
  return new Response(random, {
    headers: {
      "content-type": "image/jpeg",
      "cache-control": "no-cache",
    },
  });
}

/**
 * Build the public base URL of this app from the request headers.
 * Telegram posts webhook updates to https://<app>.koyeb.app/, and Koyeb
 * forwards the original host, so this reliably resolves to our own URL.
 */
function getBaseUrl(req: Request): string | null {
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  return host ? `${proto}://${host}` : null;
}

/**
 * Log the currently registered webhook and, when the bot knows its own
 * public URL, (re)set the webhook to itself. Runs detached at boot — a
 * failure here must never block the server from starting.
 */
async function bootstrapWebhook(): Promise<void> {
  const token = Deno.env.get("BOT_TOKEN");
  if (!token) return;

  try {
    const infoRes = await withTimeout(
      fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`),
      10000,
    );
    const info = (await infoRes.json()) as any;
    console.log(
      "📡 Webhook info:",
      JSON.stringify({
        url: info?.result?.url ?? null,
        pending_updates: info?.result?.pending_update_count ?? null,
        last_error: info?.result?.last_error_message ?? null,
      }),
    );

    const target = PUBLIC_BASE_URL ? `${PUBLIC_BASE_URL}/` : null;
    if (target && info?.result?.url !== target) {
      const res = await withTimeout(
        fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url: target, drop_pending_updates: true }),
        }),
        10000,
      );
      const data = (await res.json()) as any;
      console.log(`🔗 setWebhook ${target}:`, JSON.stringify(data));
    } else if (target) {
      console.log(`🔗 Webhook already set to ${target}`);
    }
  } catch (error) {
    console.error("⚠️ Webhook bootstrap skipped:", (error as Error).message);
  }
}

async function handler(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);

    if (url.pathname === "/health") {
      return handleHealthCheck(req);
    }

    if (url.pathname === "/welcome.jpg") {
      return handleWelcomeImage(null);
    }

    // /welcome/<filename>.jpg
    if (url.pathname.startsWith("/welcome/")) {
      return handleWelcomeImage(url.pathname.slice("/welcome/".length));
    }

    if (req.method === "POST") {
      let update: unknown;
      try {
        update = await req.json();
      } catch {
        return new Response("Bad Request", { status: 400 });
      }
      const baseUrl = getBaseUrl(req);

      // Acknowledge instantly, then process in the background. If we kept
      // the webhook waiting on Telegram/DB calls, Telegram could time out,
      // retry, and the user would see no reply (the original bug).
      (async () => {
        try {
          await BotController.handleUpdate(update, baseUrl);
        } catch (error) {
          console.error("⚠️ Background update error:", error);
        }
      })();

      return new Response("OK");
    }

    return new Response("Umm... what?", { status: 200 });
  } catch (err) {
    console.error("⚠️ Handler error:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
}

console.log(`🚀 Starting Image Uploader Bot on 0.0.0.0:${PORT} ...`);

// Bind to 0.0.0.0 so Koyeb's TCP health check and edge router can reach us.
Deno.serve({ port: PORT, hostname: "0.0.0.0" }, handler);

// Non-blocking: log webhook status and auto-set the webhook when possible.
bootstrapWebhook();
