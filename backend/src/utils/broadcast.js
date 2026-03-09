import { driverSockets } from "../websocket/socketServer.js";

export function broadcast(message) {

  const data = JSON.stringify(message);

  for (const ws of driverSockets.values()) {
    ws.send(data);
  }

}