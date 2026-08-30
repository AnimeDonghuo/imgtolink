export const BOT_TOKEN = Deno.env.get("BOT_TOKEN");
export const IMGBB_UPLOAD_URL = "https://api-integretion-unblocked.vercel.app/imgbb";
export const SUBSCRIPTION_CHECK_BOT_TOKEN = BOT_TOKEN;
export const CHANNEL_USERNAME = Deno.env.get("CHANNEL_USERNAME"); // example -> @Private_Bots
export const DEVELOPER_ID = 7855536617;

// Welcome image. The bot serves 20 bundled images from its own webhook URL
// (https://<app>.koyeb.app/welcome/welcome-NN.jpg) and rotates a random one
// on every /start — no external host needed.
// Set WELCOME_IMAGE_URL to a fixed https:// URL to disable rotation.
export const WELCOME_IMAGE_URL = Deno.env.get("WELCOME_IMAGE_URL") ?? null;
export const WELCOME_IMAGE_COUNT = 20;

// Validate required variables
const requiredVars = ["BOT_TOKEN", "CHANNEL_USERNAME"];
requiredVars.forEach((varName) => {
  if (!Deno.env.get(varName)) {
    throw new Error(`Missing required environment variable: ${varName}`);
  }
});

if (!CHANNEL_USERNAME.startsWith("@")) {
  throw new Error('Invalid CHANNEL_USERNAME: it must start with "@"');
}

export const MONGO_URI = (() => {
  const uri = Deno.env.get("MONGO_URI");
  if (!uri) return null;

  if (!uri.includes("authMechanism=")) {
    const separator = uri.includes("?") ? "&" : "?";
    return `${uri}${separator}authMechanism=SCRAM-SHA-1`;
  }

  return uri;
})();

export const USE_DB = Boolean(MONGO_URI);
export const CLEAN_USERNAME = CHANNEL_USERNAME.replace(/@/g, "");

// Optional: official imgBB API key (https://api.imgbb.com).
// When set, uploads are tried on the official API first,
// then the legacy proxy, then the keyless fallback host.
export const IMGBB_API_KEY = Deno.env.get("IMGBB_API_KEY") ?? null;
