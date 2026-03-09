import express from "express";
import rideRoutes from "./routes/rideRoutes.js";
import { initWebSocket } from "./websocket/socketServer.js";
import http from "http";
import "dotenv/config";


const app = express();
app.use(express.json());

app.use("/ride", rideRoutes);

const server = http.createServer(app);

initWebSocket(server);

server.listen(3000, () => {
  console.log("Server running on port 3000");
});
