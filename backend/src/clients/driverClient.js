import WebSocket from "ws";

const driverId = process.argv[2]; // driver id from CLI

const ws = new WebSocket("ws://localhost:3000");

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
    setTimeout(() => {

      ws.send(JSON.stringify({
        type: "ACCEPT_RIDE",
        rideId: msg.rideId,
        driverId: driverId
      }));

    }, Math.random() * 3000);

  }

});

ws.on("error", (err) => {
  console.error("Driver websocket error:", err.message);
});
