import { createClient } from "redis";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const redisUrl = process.env.REDIS_URL?.trim();

if (!redisUrl) {
  throw new Error("Missing REDIS_URL in backend/.env");
}

const redis = createClient({
  url: redisUrl,
});

redis.on("connect", () => console.log("Connected to Redis"));

redis.on("reconnecting", () => console.log("Reconnecting to Redis..."));

redis.on("error", (err) => console.error("Redis error", err));

await redis.connect();

export default redis;
