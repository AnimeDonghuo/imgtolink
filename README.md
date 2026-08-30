# 🖼️ Image Uploader Bot — Koyeb Edition

A Telegram bot that converts images into **direct shareable links** (imgBB / fallback hosts), packaged and fixed to run on the **Koyeb free tier** — including a passing **TCP health check**.

> Fork of [Private-Bots-Official/Image-Uploader-Bot](https://github.com/Private-Bots-Official/Image-Uploader-Bot), converted for Koyeb deployment.

[![Deploy to Koyeb](https://www.koyeb.com/static/images/deploy/button.svg)](https://app.koyeb.com/deploy?type=git&builder=dockerfile&repository=github.com/AnimeDonghuo/imgtolink&branch=main&name=imgtolink&ports=8000;http;/&env%5BPORT%5D=8000)

---

## What is this bot?

- Sends any image to your Telegram bot (as **photo** or **file**)
- The bot uploads it to an image host and replies with a **direct link**
- Direct links work in browsers, markdown, forums, etc.

### Commands

| Command | Description |
| --- | --- |
| `/start` | Welcome message |
| `/users` | Total registered users (requires MongoDB) |
| *send an image* | Upload it and get a direct link |

---

## ✅ What was changed for Koyeb

| Change | Why |
| --- | --- |
| Server now uses Deno's built-in `Deno.serve` | Zero external runtime imports, faster cold start on Koyeb |
| Listens on `0.0.0.0:<PORT>` (Koyeb sets `PORT=8000`) | Koyeb's **TCP health check** connects to the exposed port — it passes because the server is actually listening |
| `GET /health` returns `200 OK` | Optional HTTP health check endpoint |
| `GET /welcome.jpg` serves 20 bundled welcome images | The original welcome image host (`i.imghippo.com`) is dead — the bot now serves its own images, and a **random one is shown on every `/start`** (with a rotating caption) |
| Added `Dockerfile` | Koyeb builds the bot from the official `denoland/deno` image |
| Added `koyeb.yaml` | Declarative Koyeb config: free-tier `nano` instance, port 8000, TCP health check |
| Upload fallbacks | If the original imgBB proxy endpoint is down, uploads fall back to the official imgBB API (optional key) and then a keyless host — the bot keeps working |
| Removed secret logging | `BOT_TOKEN` / `MONGO_URI` are no longer printed to logs |
| `/start` resilience | If the welcome image can't be sent, a text welcome is sent instead of an error |

The bot behavior is otherwise **identical** to the original.

---

## ⚙️ Configuration variables

| Variable | Description | Required |
| --- | --- | --- |
| `BOT_TOKEN` | Telegram bot token from [@BotFather](https://t.me/BotFather) | ✅ Yes |
| `CHANNEL_USERNAME` | Make the bot admin in a channel and put `@ChannelUsername` here | ✅ Yes |
| `MONGO_URI` | MongoDB connection string (enables `/users`) | ❌ No |
| `IMGBB_API_KEY` | Official imgBB API key — used as the first upload provider when set | ❌ No |
| `WELCOME_IMAGE_URL` | Custom https:// URL for the `/start` welcome image (by default the bot rotates 20 bundled images automatically) | ❌ No |
| `PORT` | Port the webhook server listens on (Koyeb sets this to `8000`) | ❌ No |

---

## 🚀 Deploy on Koyeb (free tier)

### Option A — One-click deploy button

1. Click the **Deploy to Koyeb** button at the top of this README.
2. Koyeb creates the app with port `8000` and the Dockerfile builder pre-configured.
3. In the app's **Settings → Environment variables**, add:
   - `BOT_TOKEN` = your bot token
   - `CHANNEL_USERNAME` = `@YourChannel`
   - (`MONGO_URI`, `IMGBB_API_KEY` — optional)
4. Redeploy, then set the webhook (below).

### Option B — Deploy from the Koyeb dashboard

1. Sign up at [app.koyeb.com](https://app.koyeb.com) (free tier included).
2. **Create App → GitHub** → select this repository, branch `main`.
3. Builder: **Dockerfile** (the repo's `Dockerfile` is used automatically; the `koyeb.yaml` at the repo root configures the service: free `nano` instance, port `8000`, route `/`).
4. In **Service → Settings → Environment variables**, add `BOT_TOKEN` and `CHANNEL_USERNAME` (and optionally `MONGO_URI` / `IMGBB_API_KEY`).
5. Deploy. When the deployment goes **Healthy**, the health check passed.

### Health check (TCP)

- Koyeb's default health check for web services is **TCP on the exposed port**.
- This bot binds `0.0.0.0:8000`, so the TCP health check connects successfully and the deployment turns **Healthy**.
- Prefer an HTTP check? Set the check path to `/health` — it returns `200 OK`.
- If a deployment fails the health check, it usually means the env vars are missing (the bot refuses to boot without `BOT_TOKEN` / `CHANNEL_USERNAME` — check the service logs).

### Set the Telegram webhook

After deployment, open this URL in your browser (replace `BOT_TOKEN` and `YOUR_APP.koyeb.app`):

```
https://api.telegram.org/botBOT_TOKEN/setWebhook?url=https://YOUR_APP.koyeb.app/
```

You should see `{"ok":true,"result":true,...}`. Your bot is now live. 🎉

> Your Koyeb app URL looks like `https://<app-name>-<organization>.koyeb.app`.
> You can also use the Koyeb CLI:
> `koyeb app init` with `--ports 8000:http --routes /:8000 --env PORT=8000`.

---

## 🐳 Run locally

Requires [Deno](https://deno.land) (1.x).

```bash
cp .env-example .env   # fill in BOT_TOKEN and CHANNEL_USERNAME
export $(grep -v '^#' .env | xargs)   # or use your shell's env loader
deno run --allow-net --allow-env --allow-read main.ts
```

Then simulate Telegram's webhook:

```bash
curl http://localhost:8000/health          # -> OK
curl http://localhost:8000/welcome.jpg -o welcome.jpg   # -> the bundled image
curl -X POST http://localhost:8000/ -H 'Content-Type: application/json' \
     -d '{"update_id":1,"message":{"message_id":1,"chat":{"id":1,"type":"private"},"from":{"id":1},"text":"/start"}}'
```

---

## 🛠️ Troubleshooting

| Problem | Fix |
| --- | --- |
| Deployment stuck / unhealthy | Check the **Service logs**: the bot exits at boot when `BOT_TOKEN` or `CHANNEL_USERNAME` is missing. Add them and redeploy. |
| Health check failing | The bot must listen on the port Koyeb checks. This repo uses port `8000` (`PORT=8000` is set in `koyeb.yaml`). |
| "404 Not Found" on the app URL | Wait for the deployment to turn **Healthy**, then hit `https://<app>.koyeb.app/health`. |
| Bot doesn't reply | Re-run `setWebhook` with the exact app URL (must start with `https://`). |
| Free tier sleeping | Koyeb free services sleep after inactivity. Incoming webhook requests wake the service automatically (cold start takes a few seconds). |

---

## 📝 Notes

- MongoDB is optional and used only for `/users` and user tracking. Without it the bot works fully for image uploads.
- Image upload order: **official imgBB API** (if `IMGBB_API_KEY` set) → **original proxy** → **keyless fallback host**.
- Original project: [Private-Bots-Official/Image-Uploader-Bot](https://github.com/Private-Bots-Official/Image-Uploader-Bot) · License: MIT (© 2024 Prime Hritu).
