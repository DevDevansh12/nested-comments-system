import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const env = {
  NODE_ENV: (process.env.NODE_ENV ?? "development") as
    | "development"
    | "production"
    | "test",
  PORT: parseInt(process.env.PORT ?? "5000", 10),
  MONGODB_URI: requireEnv("MONGODB_URI"),
  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((o) => o.trim()),
  COOKIE_SECRET: requireEnv("COOKIE_SECRET"),
  JWT_SECRET: requireEnv("JWT_SECRET"),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? "7d",
  isDev(): boolean {
    return this.NODE_ENV === "development";
  },
  isProd(): boolean {
    return this.NODE_ENV === "production";
  },
} as const;
