import mongoose from "mongoose";
import { env } from "./env";

export async function connectDatabase(): Promise<void> {
  mongoose.connection.on("connected", () => {
    console.log("[MongoDB] Connection established");
  });

  mongoose.connection.on("error", (err: Error) => {
    console.error("[MongoDB] Connection error:", err.message);
  });

  mongoose.connection.on("disconnected", () => {
    console.warn("[MongoDB] Connection lost");
  });

  await mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
  });
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.connection.close();
  console.log("[MongoDB] Connection closed gracefully");
}
