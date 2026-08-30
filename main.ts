/**
 * Image Uploader Bot — Telegram webhook server
 * ---------------------------------------------------------------
 * Deploy target : Koyeb (free tier)
 * - Listens on 0.0.0.0:<PORT>  (Koyeb sets PORT=8000 — the Koyeb convention)
 * - TCP health check : passes automatically because the server binds the port
 * - GET /health      : 200 OK (available for HTTP health checks too)
 * - GET /welcome.jpg : the /start welcome image, served by the bot itself
 *                      (no external image host needed)
 * - POST /           : Telegram webhook updates
 *
 * Uses Deno's built-in HTTP server (no external imports), so the app
 * has zero runtime dependencies outside the code in this repo.
 */

import { BotController } from "./controllers/bot.controller.ts";

const PORT = Number.parseInt(Deno.env.get("PORT") ?? "8000", 10) || 8000;

// Load the welcome image once at boot (needs --allow-read).
let WELCOME_IMAGE: Uint8Array | null = null;
try {
  WELCOME_IMAGE = await Deno.readFile("./assets/welcome.jpg");
  console.log(`✅ Welcome image loaded (${WELCOME_IMAGE.byteLength} bytes)`);
} catch (error) {
  console.error("⚠️ Could not load assets/welcome.jpg:", error);
}

function handleHealthCheck(req: Request): Response {
  console.log(`ℹ️ Health check: ${req.method} ${req.url}`);
  return new Response("OK", { status: 200 });
}

function handleWelcomeImage(): Response {
  if (!WELCOME_IMAGE) {
    return new Response("Not Found", { status: 404 });
  }
  return new Response(WELCOME_IMAGE, {
    headers: {
      "content-type": "image/jpeg",
      "cache-control": "public, max-age=86400",
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

async function handler(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);

    if (url.pathname === "/health") {
      return handleHealthCheck(req);
    }

    if (url.pathname === "/welcome.jpg") {
      return handleWelcomeImage();
    }

    if (req.method === "POST") {
      let update: unknown;
      try {
        update = await req.json();
      } catch {
        return new Response("Bad Request", { status: 400 });
      }
      // Pass the app's public base URL so the bot can build the
      // self-hosted welcome image URL (https://<app>.koyeb.app/welcome.jpg).
      return await BotController.handleUpdate(update, getBaseUrl(req));
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
