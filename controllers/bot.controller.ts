import { UserRepository } from "../database/repositories/user.repository.ts";
import { TelegramService } from "../services/telegram.service.ts";
import { ImageUploadService } from "../services/image-upload.service.ts";
import { SubscriptionService } from "../services/subscription.service.ts";
import {
  USE_DB,
  WELCOME_IMAGE_URL,
  WELCOME_IMAGE_COUNT,
  DEVELOPER_ID,
  CLEAN_USERNAME,
} from "../config/config.ts";

// ---------------------------------------------------------------
// Runtime state & helpers
// ---------------------------------------------------------------

const BOT_START_TIME = Date.now();
let imagesConverted = 0; // session counter (in-memory, resets on restart)

// Rotating welcome captions — a random one is picked with each /start.
const WELCOME_TEXTS = [
  `<b>🖍️ Welcome to Img To Link Bot!</b>\n\n<i>Send me an image (as photo or file) to get a shareable link</i>`,
  `<b>🖼️ Hey! Welcome to Img To Link.</b>\n\n<i>Drop any image and I'll turn it into a direct link instantly</i>`,
  `<b>⚡ Img To Link Bot is here!</b>\n\n<i>Send a photo or file and get a shareable direct link</i>`,
  `<b>🚀 Welcome aboard!</b>\n\n<i>Send me an image to get a direct, shareable link</i>`,
];

const SOURCE_URL = "https://github.com/Private-Bots-Official/Image-Uploader-Bot";

// Canonical command names with aliases (e.g. /status -> stats).
const COMMANDS: Record<string, string[]> = {
  start: ["start"],
  help: ["help"],
  about: ["about"],
  stats: ["stats", "status"],
  users: ["users"],
};

function randomInt(max: number): number {
  return Math.floor(Math.random() * max);
}

/**
 * Resolve a message text to a canonical command name, or null.
 * Handles /cmd@BotUsername and /cmd payloads.
 */
function getCommand(text?: string): string | null {
  if (!text || !text.startsWith("/")) return null;
  const raw = text.split(" ")[0].split("@")[0].slice(1).toLowerCase();
  for (const [name, aliases] of Object.entries(COMMANDS)) {
    if (aliases.includes(raw)) return name;
  }
  return null;
}

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

/** Best-effort sendMessage that can never throw or hang the webhook. */
async function safeSend(
  chatId: number,
  text: string,
  options?: Record<string, unknown>,
): Promise<void> {
  try {
    await withTimeout(TelegramService.sendMessage(chatId, text, options as any), 15000);
  } catch (error) {
    console.error("⚠️ sendMessage failed:", error);
  }
}

function formatUptime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function mainKeyboard(): Record<string, unknown> {
  return {
    inline_keyboard: [
      [{ text: "Developer 🎾", url: `tg://user?id=${DEVELOPER_ID}` }],
      [{ text: "Join Channel 📢", url: `https://t.me/${CLEAN_USERNAME}` }],
      [{ text: "Source Code ↗️", url: SOURCE_URL }],
    ],
  };
}

// ---------------------------------------------------------------
// Bot controller
// ---------------------------------------------------------------

export const BotController = {
  async handleUpdate(update: any, baseUrl: string | null = null): Promise<Response> {
    if (!update.message) return new Response("OK");

    const { chat, from, text, photo, document } = update.message;
    const chatId = chat.id;
    const userId = from.id;
    const cmd = getCommand(text);

    try {
      console.log(
        `📥 Update #${update.update_id} | user ${userId} | chat ${chatId} | ` +
          (cmd ? `cmd /${cmd}` : text ? `text "${text.slice(0, 40)}"` : photo ? "photo" : document ? "document" : "other"),
      );

      // ------------------------- /start -------------------------
      if (cmd === "start") {
        // DB tracking must never block /start (a hanging insert used to
        // stall the whole webhook and deliver nothing).
        if (USE_DB) {
          try {
            await withTimeout(UserRepository.createUser(userId), 8000);
          } catch (error) {
            console.error("⚠️ createUser failed:", error);
          }
        }

        const caption = WELCOME_TEXTS[randomInt(WELCOME_TEXTS.length)];
        const keyboard = mainKeyboard();

        // Random branded banner from the 20 bundled images
        // (or a fixed URL when WELCOME_IMAGE_URL is set).
        const welcomeImageUrl = WELCOME_IMAGE_URL
          ? WELCOME_IMAGE_URL
          : baseUrl
          ? `${baseUrl}/welcome/welcome-${String(randomInt(WELCOME_IMAGE_COUNT) + 1).padStart(2, "0")}.jpg`
          : null;

        let photoSent = false;
        if (welcomeImageUrl) {
          try {
            const res = await withTimeout(
              TelegramService.sendPhoto(chatId, welcomeImageUrl, caption, keyboard),
              15000,
            );
            if (res.ok) {
              photoSent = true;
            } else {
              console.warn(
                `⚠️ Welcome photo failed (HTTP ${res.status}), sending text instead`,
              );
            }
          } catch (error) {
            console.error("⚠️ Welcome photo error:", error);
          }
        }

        // Guaranteed fallback: the user always gets a reply.
        if (!photoSent) {
          await safeSend(chatId, caption, { reply_markup: keyboard });
        }
        return new Response("OK");
      }

      // ------------------------- /help -------------------------
      if (cmd === "help") {
        await safeSend(
          chatId,
          `<b>🤖 Help — Img To Link Bot</b>\n\n` +
            `Send me any <b>image</b> (photo or file) and I'll reply with a <b>direct shareable link</b>.\n\n` +
            `<b>Commands:</b>\n` +
            `/start - Welcome message\n` +
            `/help - Show this help\n` +
            `/about - About the bot\n` +
            `/stats - Bot statistics & status\n` +
            `/users - Total users (MongoDB)\n\n` +
            `<b>How to use:</b>\n` +
            `1️⃣ Send a photo or image file\n` +
            `2️⃣ Join the channel if asked\n` +
            `3️⃣ Get your direct link 🔗`,
          { disable_web_page_preview: true },
        );
        return new Response("OK");
      }

      // ------------------------- /about -------------------------
      if (cmd === "about") {
        await safeSend(
          chatId,
          `<b>🖼️ Img To Link Bot</b>\n<i>Turn any image into a direct shareable link.</i>\n\n` +
            `<b>⚙️ Features</b>\n` +
            `• Photos & image files\n` +
            `• Direct links via imgBB & fallback hosts\n` +
            `• Copy & share buttons\n\n` +
            `<b>👨‍💻 Developer:</b> <a href="tg://user?id=${DEVELOPER_ID}">Contact</a>\n` +
            `<b>📢 Channel:</b> @${CLEAN_USERNAME}\n` +
            `<b>🔗 Source:</b> <a href="${SOURCE_URL}">GitHub</a>`,
          { reply_markup: mainKeyboard(), disable_web_page_preview: true },
        );
        return new Response("OK");
      }

      // --------------------- /stats /status ---------------------
      if (cmd === "stats") {
        let usersCount: number | null = null;
        if (USE_DB) {
          try {
            usersCount = (await withTimeout(UserRepository.getAllUsers(), 8000)).length;
          } catch (error) {
            console.error("⚠️ stats DB error:", error);
          }
        }
        const dbLine = USE_DB
          ? usersCount !== null
            ? `🗄️ Database: connected (${usersCount} users)`
            : "🗄️ Database: connected (users unavailable)"
          : "🗄️ Database: not configured";

        await safeSend(
          chatId,
          `<b>📊 Bot Statistics</b>\n\n` +
            `👥 Total users: ${usersCount ?? "—"}\n` +
            `🖼️ Images converted (session): ${imagesConverted}\n` +
            `⏱️ Uptime: ${formatUptime(Date.now() - BOT_START_TIME)}\n` +
            `${dbLine}`,
        );
        return new Response("OK");
      }

      // ------------------------- /users -------------------------
      if (cmd === "users") {
        let count: number | null = null;
        if (USE_DB) {
          try {
            count = (await withTimeout(UserRepository.getAllUsers(), 8000)).length;
          } catch (error) {
            console.error("⚠️ users DB error:", error);
          }
        }
        await safeSend(
          chatId,
          count !== null
            ? `Total users: ${count}`
            : USE_DB
            ? "📊 Database connected, but user count is unavailable"
            : "📊 Database not configured",
        );
        return new Response("OK");
      }

      // ------------------- unknown command ----------------------
      if (typeof text === "string" && text.startsWith("/")) {
        await safeSend(
          chatId,
          "❓ Unknown command. Use /help to see what I can do.",
        );
        return new Response("OK");
      }

      // --------------------- image upload -----------------------
      if (photo || document?.mime_type?.startsWith("image/")) {
        let hasAccess = false;
        try {
          hasAccess = await withTimeout(
            SubscriptionService.checkSubscription(chatId),
            8000,
          );
        } catch (error) {
          console.error("⚠️ Subscription check failed:", error);
        }
        if (!hasAccess) {
          await safeSend(
            chatId,
            `<b>🔒 Premium Feature</b>\n\n` +
              `Join our channel to unlock this feature!\n\n` +
              `<a href="https://t.me/${CLEAN_USERNAME}">👉 Click here to join</a>`,
            { disable_web_page_preview: true },
          );
          return new Response("OK");
        }

        let fileId: string;
        if (photo) {
          fileId = photo.pop().file_id;
        } else {
          fileId = document.file_id;
        }

        let imageUrl: string | null = null;
        try {
          console.log(`⬇️ Downloading file ${fileId} ...`);
          const fileUrl = await withTimeout(
            TelegramService.getFileUrl(fileId),
            8000,
          );
          const buffer = await withTimeout(
            (async () => {
              const res = await fetch(fileUrl);
              if (!res.ok) throw new Error(`download HTTP ${res.status}`);
              return res.arrayBuffer();
            })(),
            15000,
          );
          imageUrl = await withTimeout(
            ImageUploadService.uploadImage(buffer),
            20000,
          );
        } catch (error) {
          console.error("⚠️ Image pipeline error:", error);
        }

        if (imageUrl) imagesConverted++;

        await safeSend(
          chatId,
          imageUrl || "❌ Failed to upload image",
          {
            reply_markup: imageUrl
              ? {
                  inline_keyboard: [
                    [{
                      text: "Copy Link 🔗",
                      copy_text: { text: `${imageUrl}` },
                    }],
                    [{
                      text: "Share Link 🔗",
                      url: `tg://msg_url?url=${encodeURIComponent(imageUrl)}`,
                    }],
                    [{
                      text: "Source Code ↗️",
                      url: SOURCE_URL,
                    }],
                  ],
                }
              : undefined,
          },
        );
        return new Response("OK");
      }

      // ------------------ unsupported document -------------------
      if (document) {
        await safeSend(
          chatId,
          "❌ Unsupported file type. Please send an image file (JPEG, PNG, etc.)",
        );
        return new Response("OK");
      }

      // ----------------------- generic text ----------------------
      await safeSend(
        chatId,
        "📸 Send me an image (as photo or file) to get started!\n\n" +
          "✨ Features:\n" +
          "- Convert images to direct links\n" +
          "- Shareable links\n" +
          "- Premium channel access",
      );
    } catch (error) {
      console.error("Handler error:", error);
      await safeSend(chatId, "⚠️ Oops! Something went wrong. Please try again.");
    }

    return new Response("OK");
  }
};
