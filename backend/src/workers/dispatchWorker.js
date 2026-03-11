import redis from "../config/redis.js";
import { dispatchNextDriver, seedRideCandidates } from "../services/rideService.js";

const DISPATCH_STREAM = "rides:dispatch";
const DISPATCH_GROUP = "dispatchers";
const DISPATCH_CONSUMER = process.env.DISPATCH_CONSUMER || `consumer-${process.pid}`;

async function ensureGroup() {
  try {
    await redis.sendCommand([
      "XGROUP",
      "CREATE",
      DISPATCH_STREAM,
      DISPATCH_GROUP,
      "$",
      "MKSTREAM"
    ]);
  } catch (error) {
    if (!String(error?.message || "").includes("BUSYGROUP")) {
      throw error;
    }
  }
}

function parseFields(list) {
  const fields = {};
  for (let i = 0; i < list.length; i += 2) {
    fields[list[i]] = list[i + 1];
  }
  return fields;
}

export async function startDispatchWorker() {
  await ensureGroup();

  while (true) {
    const response = await redis.sendCommand([
      "XREADGROUP",
      "GROUP",
      DISPATCH_GROUP,
      DISPATCH_CONSUMER,
      "COUNT",
      "10",
      "BLOCK",
      "5000",
      "STREAMS",
      DISPATCH_STREAM,
      ">"
    ]);

    if (!response) {
      continue;
    }

    const streamEntries = response[0]?.[1] || [];
    for (const entry of streamEntries) {
      const [id, rawFields] = entry;
      const fields = parseFields(rawFields);

      try {
        if (fields.type === "RIDE_DISPATCH_REQUEST") {
          const lat = Number(fields.lat);
          const lon = Number(fields.lon);
          const radiusKm = Number(fields.radiusKm);

          await seedRideCandidates(fields.rideId, lat, lon, radiusKm);
          await dispatchNextDriver(fields.rideId);
        }

        if (fields.type === "RIDE_DISPATCH_NEXT") {
          await dispatchNextDriver(fields.rideId);
        }

        await redis.sendCommand([
          "XACK",
          DISPATCH_STREAM,
          DISPATCH_GROUP,
          id
        ]);
      } catch (error) {
        console.error("Dispatch worker error", error);
      }
    }
  }
}
