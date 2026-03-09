import { v4 as uuid } from "uuid";
import { findNearbyDrivers } from "./driverService.js";
import { driverSockets, publishEvent } from "../websocket/socketServer.js";

export async function dispatchRide(lat, lon, radii = "5") {

  const rideId = uuid();

  const drivers = await findNearbyDrivers(lat, lon, radii);

  const message = JSON.stringify({
    type: "RIDE_REQUEST",
    rideId,
    pickup: { lat, lon }
  });

  drivers.forEach((driverId) => {

    const ws = driverSockets.get(driverId);

    if (ws) ws.send(message);

  });

  publishEvent({
    action: "RIDE_REQUEST_DISPATCHED",
    rideId,
    pickup: { lat, lon },
    driversNotified: drivers.length,
    drivers
  });

  return {
    rideId,
    driversNotified: drivers.length
  };

}
