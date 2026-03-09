import { WebSocketServer } from "ws";
import redis from "../config/redis.js";

export const driverSockets = new Map();
const observerSockets = new Set();

export function publishEvent(event) {
  const payload = JSON.stringify({ type: "EVENT", event });

  for (const ws of observerSockets) {
    if (ws.readyState === 1) {
      ws.send(payload);
    }
  }
}

export function initWebSocket(server) {

  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws) => {

    ws.on("message", async (data) => {
      let msg;
      try {
        msg = JSON.parse(data);
      } catch {
        return;
      }

      if (msg.type === "REGISTER_DRIVER") {
        driverSockets.set(msg.driverId, ws);
        ws.driverId = msg.driverId;
        publishEvent({
          action: "DRIVER_CONNECTED",
          driverId: msg.driverId
        });
      }

      if (msg.type === "REGISTER_OBSERVER") {
        observerSockets.add(ws);
        ws.send(JSON.stringify({
          type: "OBSERVER_REGISTERED"
        }));
      }

      if (msg.type === "ACCEPT_RIDE") {

        const { rideId, driverId } = msg;
        publishEvent({
          action: "DRIVER_ACCEPT_ATTEMPT",
          rideId,
          driverId
        });

        const lock = await redis.set(
          `ride:${rideId}:lock`,
          driverId,
          { NX: true, EX: 10 }
        );

        if (lock) {
          const claimedMessage = {
            type: "RIDE_CLAIMED",
            rideId,
            driverId
          };

          const data = JSON.stringify(claimedMessage);
          for (const driverSocket of driverSockets.values()) {
            if (driverSocket.readyState === 1) {
              driverSocket.send(data);
            }
          }

          publishEvent({
            action: "RIDE_ACCEPTED",
            rideId,
            driverId
          });

        } else {

          ws.send(JSON.stringify({
            type: "RIDE_ALREADY_TAKEN"
          }));
          publishEvent({
            action: "RIDE_ALREADY_TAKEN",
            rideId,
            driverId
          });

        }
      }

    });

    ws.on("close", () => {
      observerSockets.delete(ws);

      for (const [driverId, socket] of driverSockets.entries()) {
        if (socket === ws) {
          driverSockets.delete(driverId);
          publishEvent({
            action: "DRIVER_DISCONNECTED",
            driverId
          });
        }
      }

    });

  });

}
