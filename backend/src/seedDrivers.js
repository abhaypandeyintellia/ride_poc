import redis from "./config/redis.js";

await redis.geoAdd("drivers:locations", [
  { longitude: 77.5946, latitude: 12.9716, member: "driver1" },
  { longitude: 77.5950, latitude: 12.9717, member: "driver2" },
  { longitude: 77.5925, latitude: 12.9724, member: "driver3" },
  { longitude: 77.5978, latitude: 12.9702, member: "driver4" },
  { longitude: 77.6400, latitude: 12.9900, member: "driver5" },
  { longitude: 77.5200, latitude: 12.9300, member: "driver6" }
]);

console.log("drivers added");

process.exit();
