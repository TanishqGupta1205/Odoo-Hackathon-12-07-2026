// routes/fuel.routes.js

const express = require("express");

const fuelController = require(
    "../controllers/fuel.controller"
);

// 🛠️ FIX: Destructure the exact function from your middleware file
const { verifyToken } = require(
    "../middlewares/auth.middleware"
);

const router = express.Router();

router.get(
    "/summary",
    verifyToken,
    fuelController.getFuelSummary
);

router.get(
    "/",
    verifyToken,
    fuelController.getAllFuelLogs
);

router.get(
    "/:id",
    verifyToken,
    fuelController.getFuelLogById
);

router.post(
    "/",
    verifyToken,
    fuelController.createFuelLog
);

router.patch(
    "/:id",
    verifyToken,
    fuelController.updateFuelLog
);

router.delete(
    "/:id",
    verifyToken,
    fuelController.deleteFuelLog
);

module.exports = router;