import { db } from "../client.ts";
import { USE_DB } from "../../config/config.ts";

export const UserRepository = {
  async isUserExists(userId: number): Promise<boolean> {
    if (!USE_DB) return false;
    const user = await db.collection("users").findOne({ user_id: userId });
    return !!user;
  },

  async getAllUsers(): Promise<any[]> {
    if (!USE_DB) return [];
    return await db.collection("users").find().toArray();
  },

  async createUser(userId: number): Promise<void> {
    if (!USE_DB) return;
    await db.collection("users").insertOne({ 
      user_id: userId,
      created_at: new Date()
    });
  }
};