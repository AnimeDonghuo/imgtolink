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
 * Uses Deno's built-in HTTP server (no external imports), so the app
 * has zero runtime dependencies outside the code in this repo.
 */

import { BotController } from "./controllers/bot.controller.ts";

const PORT = Number.parseInt(Deno.env.get("PORT") ?? "8000", 10) || 8000;

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
      // Pass the app's public base URL so the bot can build the
      // self-hosted welcome image URLs (https://<app>.koyeb.app/welcome/...).
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
