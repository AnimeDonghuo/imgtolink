# Image Uploader Bot — container image for Koyeb (free tier)
# ---------------------------------------------------------------
# Based on Koyeb's official Deno example:
#   https://github.com/koyeb/example-deno
#
# Pinned to the Deno 1.x line that matches this codebase
# (std@0.195 / x/mongo@0.32). You can bump this to a newer
# release by editing the tag below.
FROM denoland/deno:1.46.3

WORKDIR /app

# Copy the whole project and pre-fetch remote dependencies.
# `deno cache` fails the build early if a dependency can't be resolved.
COPY . /app
RUN deno cache main.ts

# Koyeb injects PORT (see koyeb.yaml). Default to 8000 — the Koyeb convention.
ARG PORT=8000
ENV PORT=${PORT}
EXPOSE ${PORT}

# --allow-env : read BOT_TOKEN / CHANNEL_USERNAME / MONGO_URI / IMGBB_API_KEY / PORT
# --allow-net : call the Telegram API, download images, upload to image hosts
CMD ["run", "--allow-net", "--allow-env", "--allow-read", "main.ts"]
