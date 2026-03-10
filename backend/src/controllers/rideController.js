import { cancelRide, dispatchRide } from "../services/rideService.js";

export async function createRide(req, res) {
  try {
    const { lat, lon } = req.body;
    const latitude = Number(lat);
    const longitude = Number(lon);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return res.status(400).json({ error: "lat and lon must be valid numbers" });
    }

    const result = await dispatchRide(latitude, longitude);

    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to create ride" });
  }

}

export async function cancelRideById(req, res) {
  try {
    const { rideId } = req.params;
    if (!rideId) {
      return res.status(400).json({ error: "rideId is required" });
    }

    const result = await cancelRide(rideId);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to cancel ride" });
  }
}
