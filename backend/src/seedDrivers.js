import redis from "./config/redis.js";

await redis.geoAdd("drivers:locations", [
  { longitude: 77.5946, latitude: 12.9716, member: "driver1" },
  { longitude: 77.5950, latitude: 12.9717, member: "driver2" }
]);

console.log("drivers added");

process.exit();