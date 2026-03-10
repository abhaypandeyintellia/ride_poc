import { v4 as uuid } from "uuid";
import { findNearbyDrivers } from "./driverService.js";
import { driverSockets, publishEvent } from "../websocket/socketServer.js";
import redis from "../config/redis.js";

const ASSIGNMENT_TTL_MS = 10000;
const assignmentTimers = new Map();

function rideKey(rideId) {
  return `ride:${rideId}`;
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

  await dispatchNextDriver(rideId);
}

export async function dispatchRide(lat, lon, radii = "5") {
  const rideId = uuid();
  const drivers = await findNearbyDrivers(lat, lon, radii);

  await redis.hSet(rideKey(rideId), {
    state: "SEARCHING",
    pickupLat: String(lat),
    pickupLon: String(lon),
    drivers: JSON.stringify(drivers),
    cursor: "0",
    assignedDriver: ""
  });

  const assignedDriver = await dispatchNextDriver(rideId);

  return {
    rideId,
    driversNotified: assignedDriver ? 1 : 0,
    assignedDriver
  };
}

export async function dispatchNextDriver(rideId) {
  const ride = await redis.hGetAll(rideKey(rideId));
  if (ride.state === "CLOSED" || ride.state === "ACCEPTED") {
    return null;
  }
  const drivers = JSON.parse(ride.drivers || "[]");
  let cursor = Number(ride.cursor || "0");
  const pickup = {
    lat: Number(ride.pickupLat),
    lon: Number(ride.pickupLon)
  };

  while (cursor < drivers.length) {
    const driverId = drivers[cursor];
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
