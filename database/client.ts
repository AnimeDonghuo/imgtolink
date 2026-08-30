import { MongoClient } from "https://deno.land/x/mongo@v0.32.0/mod.ts";
import { MONGO_URI } from "../config/config.ts";

let db: any = null;

if (MONGO_URI) {
  const client = new MongoClient();
  try {
    await client.connect(MONGO_URI);
    console.log("✅ MongoDB connected");
    db = client.database("imageToLinkBot");
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error);
    throw error; 
  }
}

export { db };
