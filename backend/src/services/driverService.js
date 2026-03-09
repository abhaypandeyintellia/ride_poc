import redis from "../config/redis.js";

export async function findNearbyDrivers(lat, lon, radii) {
  const latitude = Number(lat);
  const longitude = Number(lon);
  const radiusKm = Number(radii);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(radiusKm)) {
    throw new Error("Invalid coordinates or radius");
  }

  const drivers = await redis.sendCommand([
    "GEOSEARCH",
    "drivers:locations",
    "FROMLONLAT", String(longitude), String(latitude),
    "BYRADIUS", String(radiusKm), "km"
  ]);

  return drivers;
}
