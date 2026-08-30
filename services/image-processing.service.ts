import { TelegramService } from "./telegram.service.ts";
import { ImageUploadService } from "./image-upload.service.ts";

export const ImageProcessingService = {
  async processImage(fileId: string): Promise<string> {
    try {
      const fileUrl = await TelegramService.getFileUrl(fileId);
      if (!fileUrl) throw new Error("Failed to get file URL");

      const response = await fetch(fileUrl);
      if (!response.ok) throw new Error("Failed to download image");
      
      const fileContent = await response.arrayBuffer();
      const imageUrl = await ImageUploadService.uploadImage(fileContent);

      return imageUrl || "Error uploading image to hosting service";
    } catch (error) {
      console.error("Image processing error:", error);
      return "Error processing image";
    }
  }
};