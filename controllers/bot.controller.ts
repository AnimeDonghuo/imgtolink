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

// Rotating welcome captions — a random one is picked with each /start.
const WELCOME_TEXTS = [
  `<b>🖍️ Welcome to Image Link Bot!</b>\n\n<i>Send me an image (as photo or file) to get a shareable link</i>`,
  `<b>🖼️ Hey! Welcome to Image Link Bot.</b>\n\n<i>Drop any image and I'll turn it into a direct link instantly</i>`,
  `<b>⚡ Image Link Bot is here!</b>\n\n<i>Send a photo or file and get a shareable direct link</i>`,
  `<b>🚀 Welcome aboard!</b>\n\n<i>Send me an image to get a direct, shareable link</i>`,
];

function randomInt(max: number): number {
  return Math.floor(Math.random() * max);
}

export const BotController = {
  async handleUpdate(update: any, baseUrl: string | null = null): Promise<Response> {
    if (!update.message) return new Response("OK");

    const { chat, from, text, photo, document } = update.message;
    const chatId = chat.id;
    const userId = from.id;

    try {
      if (text === "/start") {
        if (USE_DB) await UserRepository.createUser(userId);

        const welcomeText = WELCOME_TEXTS[randomInt(WELCOME_TEXTS.length)];

        const replyMarkup = {
          inline_keyboard: [
            [{
              text: "Developer 🎾",
              url: `tg://user?id=${DEVELOPER_ID}`,
            }],
            [{
              text: "Join Channel 📢",
              url: `https://t.me/${CLEAN_USERNAME}`,
            }],
            [{
              text: "Source Code ↗️",
              url: `https://github.com/Private-Bots-Official/Image-Uploader-Bot`,
            }],
          ],
        };

        // Pick a random one of the 20 bundled welcome images and point
        // Telegram at our own webhook URL — no external image host needed.
        const welcomeImageUrl = WELCOME_IMAGE_URL
          ? WELCOME_IMAGE_URL
          : baseUrl
          ? `${baseUrl}/welcome/welcome-${String(randomInt(WELCOME_IMAGE_COUNT) + 1).padStart(2, "0")}.jpg`
          : null;

        if (welcomeImageUrl) {
          // Send the welcome photo, but fall back to a plain text message
          // if the image can't be sent, so /start never breaks.
          try {
            const res = await TelegramService.sendPhoto(
              chatId,
              welcomeImageUrl,
              welcomeText,
              replyMarkup,
            );
            if (!res.ok) {
              console.warn("⚠️ Welcome photo failed, sending text instead");
              await TelegramService.sendMessage(chatId, welcomeText, {
                reply_markup: replyMarkup,
              });
            }
          } catch (error) {
            console.error("⚠️ Welcome message error:", error);
            await TelegramService.sendMessage(chatId, welcomeText, {
              reply_markup: replyMarkup,
            });
          }
        } else {
          await TelegramService.sendMessage(chatId, welcomeText, {
            reply_markup: replyMarkup,
          });
        }
        return new Response("OK");
      }

      if (text === "/users") {
        const responseText = USE_DB
          ? `Total users: ${(await UserRepository.getAllUsers()).length}`
          : "📊 Database not configured";
        await TelegramService.sendMessage(chatId, responseText);
        return new Response("OK");
      }

      // Handle both photos and document-based images
      if (photo || (document?.mime_type?.startsWith('image/'))) {
        const hasAccess = await SubscriptionService.checkSubscription(chatId);
        if (!hasAccess) {
          await TelegramService.sendMessage(
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

        const imageUrl = await ImageUploadService.uploadImage(
          await (await fetch(await TelegramService.getFileUrl(fileId))).arrayBuffer(),
        );

        await TelegramService.sendMessage(
          chatId,
          imageUrl || "❌ Failed to upload image",
          {
            reply_markup: imageUrl ? {
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
                  url: `https://github.com/Private-Bots-Official/Image-Uploader-Bot`,
                }],
              ],
            } : undefined,
          },
        );
        return new Response("OK");
      }

      if (document) {
        await TelegramService.sendMessage(
          chatId,
          "❌ Unsupported file type. Please send an image file (JPEG, PNG, etc.)",
        );
        return new Response("OK");
      }

      await TelegramService.sendMessage(
        chatId,
        "📸 Send me an image (as photo or file) to get started!\n\n" +
        "✨ Features:\n" +
        "- Convert images to direct links\n" +
        "- Shareable links\n" +
        "- Premium channel access",
      );
    } catch (error) {
      console.error("Handler error:", error);
      await TelegramService.sendMessage(
        chatId,
        "⚠️ Oops! Something went wrong. Please try again.",
      );
    }

    return new Response("OK");
  }
};
