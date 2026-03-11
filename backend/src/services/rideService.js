import { v4 as uuid } from "uuid";
import { driverSockets, publishEvent } from "../websocket/socketServer.js";
import redis from "../config/redis.js";

const ASSIGNMENT_TTL_MS = 10000;
const assignmentTimers = new Map();
const DISPATCH_STREAM = "rides:dispatch";
const DRIVER_BATCH_FIRST = 5;
const DRIVER_BATCH_NEXT = 10;
const DRIVER_MAX_TOTAL = 30;
const CANDIDATE_TTL_SEC = 180;

function rideKey(rideId) {
  return `ride:${rideId}`;
}

function candidateKey(rideId) {
  return `ride:${rideId}:candidates`;
}

async function enqueueDispatch(action, fields) {
  const args = ["XADD", DISPATCH_STREAM, "*", "type", action];
  for (const [key, value] of Object.entries(fields)) {
    args.push(key, String(value));
  }
  await redis.sendCommand(args);
}

export async function seedRideCandidates(rideId, lat, lon, radiusKm) {
  const key = candidateKey(rideId);
  await redis.sendCommand([
    "GEOSEARCHSTORE",
    key,
    "drivers:locations",
    "FROMLONLAT", String(lon), String(lat),
    "BYRADIUS", String(radiusKm), "km",
    "STOREDIST",
    "ASC",
    "COUNT", String(DRIVER_MAX_TOTAL)
  ]);
  await redis.expire(key, CANDIDATE_TTL_SEC);
  await redis.hSet(rideKey(rideId), { candidatesSeeded: "1" });
}

function scheduleAssignmentTimeout(rideId, driverId) {
  clearAssignmentTimeout(rideId);
  const timeoutId = setTimeout(() => {
    handleAssignmentTimeout(rideId, driverId);
  }, ASSIGNMENT_TTL_MS);
  assignmentTimers.set(rideId, timeoutId);
}

export function clearAssignmentTimeout(rideId) {
  const timeoutId = assignmentTimers.get(rideId);
  if (timeoutId) {
    clearTimeout(timeoutId);
    assignmentTimers.delete(rideId);
  }
}

async function handleAssignmentTimeout(rideId, driverId) {
  const ride = await redis.hGetAll(rideKey(rideId));
  if (ride.state !== "DRIVER_ASSIGNED" || ride.assignedDriver !== driverId) {
    return;
  }

  publishEvent({
    action: "DRIVER_UNREACHABLE",
    rideId,
    driverId
  });

  await redis.hSet(rideKey(rideId), {
    state: "SEARCHING",
    assignedDriver: ""
  });

  await queueDispatchNext(rideId);
}

export async function dispatchRide(lat, lon, radii = "2") {
  const rideId = uuid();
  const radiusKm = Number(radii);
  if (!Number.isFinite(radiusKm)) {
    throw new Error("Invalid radius");
  }

  await redis.hSet(rideKey(rideId), {
    state: "SEARCHING",
    pickupLat: String(lat),
    pickupLon: String(lon),
    radiusKm: String(radiusKm),
    cursor: "0",
    assignedDriver: "",
    candidatesSeeded: "0"
  });

  await enqueueDispatch("RIDE_DISPATCH_REQUEST", {
    rideId,
    lat,
    lon,
    radiusKm
  });

  return {
    rideId,
    driversNotified: 0,
    assignedDriver: null
  };
}

export async function dispatchNextDriver(rideId) {
  const ride = await redis.hGetAll(rideKey(rideId));
  if (ride.state === "CLOSED" || ride.state === "ACCEPTED") {
    return null;
  }
  let cursor = Number(ride.cursor || "0");
  const pickup = {
    lat: Number(ride.pickupLat),
    lon: Number(ride.pickupLon)
  };

  if (!Number.isFinite(cursor)) {
    cursor = 0;
  }

  if (ride.candidatesSeeded !== "1") {
    await seedRideCandidates(rideId, pickup.lat, pickup.lon, Number(ride.radiusKm || "2"));
  }

  while (true) {
    const remaining = DRIVER_MAX_TOTAL - cursor;
    const requested = cursor === 0 ? DRIVER_BATCH_FIRST : DRIVER_BATCH_NEXT;
    const batchSize = Math.max(0, Math.min(requested, remaining));

    if (batchSize === 0) {
      break;
    }

    const batch = await redis.sendCommand([
      "ZRANGE",
      candidateKey(rideId),
      String(cursor),
      String(cursor + batchSize - 1)
    ]);

    if (!batch || batch.length === 0) {
      break;
    }

    for (const driverId of batch) {
      cursor += 1;

      const ws = driverSockets.get(driverId);
      if (!ws || ws.readyState !== 1) {
        continue;
      }

      await redis.hSet(rideKey(rideId), {
        state: "DRIVER_ASSIGNED",
        assignedDriver: driverId,
        cursor: String(cursor)
      });

      const message = JSON.stringify({
        type: "RIDE_REQUEST",
        rideId,
        pickup,
        assignmentExpiresInMs: ASSIGNMENT_TTL_MS
      });

      ws.send(message);
      scheduleAssignmentTimeout(rideId, driverId);

      publishEvent({
        action: "DRIVER_ASSIGNED",
        rideId,
        driverId
      });

      publishEvent({
        action: "RIDE_REQUEST_DISPATCHED",
        rideId,
        pickup,
        driversNotified: 1,
        drivers: [driverId]
      });

      return driverId;
    }

    await redis.hSet(rideKey(rideId), {
      cursor: String(cursor)
    });
  }

  await redis.hSet(rideKey(rideId), {
    state: "SEARCHING",
    assignedDriver: "",
    cursor: String(cursor)
  });

  publishEvent({
    action: "RIDE_NO_DRIVER_AVAILABLE",
    rideId
  });

  return null;
}

export async function queueDispatchNext(rideId) {
  await enqueueDispatch("RIDE_DISPATCH_NEXT", { rideId });
}

export async function cancelRide(rideId, reason = "RIDER_CANCELLED") {
  const ride = await redis.hGetAll(rideKey(rideId));
  await redis.hSet(rideKey(rideId), {
    state: "CLOSED",
    assignedDriver: ""
  });

  clearAssignmentTimeout(rideId);

  const assignedDriver = ride.assignedDriver;
  if (assignedDriver) {
    const ws = driverSockets.get(assignedDriver);
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({
        type: "RIDE_CANCELLED",
        rideId,
        reason
      }));
    }
  }

  publishEvent({
    action: "RIDE_CANCELLED",
    rideId,
    reason
  });

  return { rideId, cancelled: true };
}
