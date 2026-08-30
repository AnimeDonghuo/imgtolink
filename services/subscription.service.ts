import { SUBSCRIPTION_CHECK_BOT_TOKEN, CHANNEL_USERNAME } from "../config/config.ts";

export const SubscriptionService = {
  async checkSubscription(chatId: number): Promise<boolean> {
    try {
      const url = `https://api.telegram.org/bot${SUBSCRIPTION_CHECK_BOT_TOKEN}/getChatMember?chat_id=${CHANNEL_USERNAME}&user_id=${chatId}`;
      const response = await fetch(url);
      const data = await response.json();
      
      if (!data.ok) return false;
      
      return ["member", "administrator", "creator"].includes(data.result.status);
    } catch (error) {
      console.error("Subscription check failed:", error);
      return false;
    }
  }
};