import { IMGBB_UPLOAD_URL, IMGBB_API_KEY } from "../config/config.ts";

interface ImgBBResponse {
  url?: string;
  data?: {
    url?: string;
    display_url?: string;
  };
  error?: any;
}

export const ImageUploadService = {
  /**
   * Uploads an image and returns a direct link.
   *
   * Providers are tried in order until one succeeds:
   *   1. Official imgBB API   (only when IMGBB_API_KEY is set)
   *   2. Legacy imgBB proxy   (the endpoint used by the original bot)
   *   3. catbox.moe           (keyless fallback, direct link)
   */
  async uploadImage(fileContent: ArrayBuffer): Promise<string | null> {
    const fileName = `${crypto.randomUUID()}.jpg`;
    const file = new Blob([fileContent], { type: "image/jpeg" });
    const failures: string[] = [];

    // 1) Official imgBB API — used only when IMGBB_API_KEY is configured
    if (IMGBB_API_KEY) {
      try {
        const formData = new FormData();
        formData.append("image", file, fileName);

        const response = await fetch(
          `https://api.imgbb.com/1/upload?key=${encodeURIComponent(IMGBB_API_KEY)}`,
          { method: "POST", body: formData },
        );
        const data: ImgBBResponse = await response.json();
        const url = data?.data?.url;
        if (url) return url;
        failures.push(`imgbb(api): HTTP ${response.status}`);
      } catch (error) {
        failures.push(`imgbb(api): ${(error as Error).message}`);
      }
    }

    // 2) Legacy proxy used by the original bot
    try {
      const formData = new FormData();
      formData.append("file", file, fileName);

      const response = await fetch(IMGBB_UPLOAD_URL, {
        method: "POST",
        body: formData,
      });
      const data: ImgBBResponse = await response.json();
      if (data.url) return data.url;
      failures.push(`imgbb(proxy): HTTP ${response.status}`);
    } catch (error) {
      failures.push(`imgbb(proxy): ${(error as Error).message}`);
    }

    // 3) Keyless fallback host — direct link, no account needed
    try {
      const formData = new FormData();
      formData.append("reqtype", "fileupload");
      formData.append("fileToUpload", file, fileName);

      const response = await fetch("https://catbox.moe/user/api.php", {
        method: "POST",
        body: formData,
      });
      const text = (await response.text()).trim();
      if (response.ok && text.startsWith("http")) return text;
      failures.push(`catbox: HTTP ${response.status}`);
    } catch (error) {
      failures.push(`catbox: ${(error as Error).message}`);
    }

    console.error("❌ All upload providers failed:", failures.join(" | "));
    return null;
  }
};
