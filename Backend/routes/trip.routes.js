// routes/trip.routes.js

const express = require("express");
const router = express.Router();

const tripController = require("../controllers/trip.controller");
const { verifyToken } = require("../middlewares/auth.middleware");

// Apply the token verification globally to all trip routes
router.use(verifyToken);

// ==========================================
// 🚀 BASE CRUD ENDPOINTS
// ==========================================

if (typeof tripController.getAllTrips === "function") {
    router.get("/", tripController.getAllTrips);
}
if (typeof tripController.createTrip === "function") {
    router.post("/", tripController.createTrip);
}

// ==========================================
// 🚀 DASHBOARD & SPECIAL ENDPOINTS
// ==========================================

// Safely mount summary if it exists under either name variation
if (typeof tripController.getTripSummary === "function") {
    router.get("/summary", tripController.getTripSummary);
} else if (typeof tripController.getSummary === "function") {
    router.get("/summary", tripController.getSummary);
}

// ==========================================
// 🚀 ID-SPECIFIC ENDPOINTS
// ==========================================

if (typeof tripController.getTripById === "function") {
    router.get("/:id", tripController.getTripById);
}
if (typeof tripController.updateTrip === "function") {
    router.patch("/:id", tripController.updateTrip);
}
if (typeof tripController.deleteTrip === "function") {
    router.delete("/:id", tripController.deleteTrip);
}

// ==========================================
// 🚀 LIFECYCLE / TRANSITION ENDPOINTS
// ==========================================

if (typeof tripController.dispatchTrip === "function") {
    router.patch("/:id/dispatch", tripController.dispatchTrip);
} else if (typeof tripController.startTrip === "function") {
    router.patch("/:id/dispatch", tripController.startTrip);
}

if (typeof tripController.completeTrip === "function") {
    router.patch("/:id/complete", tripController.completeTrip);
}

if (typeof tripController.cancelTrip === "function") {
    router.patch("/:id/cancel", tripController.cancelTrip);
}

module.exports = router;