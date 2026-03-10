import WebSocket from "ws";

const driverId = process.argv[2]; // driver id from CLI

const ws = new WebSocket("ws://localhost:3000");
const pendingAccepts = new Map();

ws.on("open", () => {

  console.log("Driver connected:", driverId);

  ws.send(JSON.stringify({
    type: "REGISTER_DRIVER",
    driverId: driverId
  }));

});

ws.on("message", (data) => {

  const msg = JSON.parse(data);

  console.log("Driver", driverId, "received:", msg);

  if (msg.type === "RIDE_REQUEST") {

    // simulate driver accepting ride after delay
    const timeoutId = setTimeout(() => {

      ws.send(JSON.stringify({
        type: "ACCEPT_RIDE",
        rideId: msg.rideId,
        driverId: driverId
      }));

      pendingAccepts.delete(msg.rideId);
    }, Math.random() * 3000);

    pendingAccepts.set(msg.rideId, timeoutId);

  }

  if (msg.type === "RIDE_CLAIMED") {
    const timeoutId = pendingAccepts.get(msg.rideId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      pendingAccepts.delete(msg.rideId);
    }
  }

  if (msg.type === "RIDE_NOT_ASSIGNED") {
    const timeoutId = pendingAccepts.get(msg.rideId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      pendingAccepts.delete(msg.rideId);
    }
  }

  if (msg.type === "RIDE_ALREADY_TAKEN") {
    const timeoutId = pendingAccepts.get(msg.rideId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      pendingAccepts.delete(msg.rideId);
    }
  }

  if (msg.type === "RIDE_CANCELLED") {
    const timeoutId = pendingAccepts.get(msg.rideId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      pendingAccepts.delete(msg.rideId);
    }
  }

});

ws.on("error", (err) => {
  console.error("Driver websocket error:", err.message);
});
