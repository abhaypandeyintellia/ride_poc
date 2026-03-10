import express from "express";
import { cancelRideById, createRide } from "../controllers/rideController.js";

const router = express.Router();

router.post("/", createRide);
router.post("/:rideId/cancel", cancelRideById);

export default router;
