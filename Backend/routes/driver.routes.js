// routes/driver.routes.js

const express = require("express");

const driverController = require(
    "../controllers/driver.controller"
);

// 🛠️ FIX: Destructure the exact function from your middleware file
const { verifyToken } = require(
    "../middlewares/auth.middleware"
);

const router = express.Router();

router.get(
    "/available",
    verifyToken,
    driverController.getAvailableDrivers
);

router.get(
    "/",
    verifyToken,
    driverController.getAllDrivers
);

router.get(
    "/:id",
    verifyToken,
    driverController.getDriverById
);

router.post(
    "/",
    verifyToken,
    driverController.createDriver
);

router.patch(
    "/:id",
    verifyToken,
    driverController.updateDriver
);

router.patch(
    "/:id/suspend",
    verifyToken,
    driverController.suspendDriver
);

router.patch(
    "/:id/restore",
    verifyToken,
    driverController.restoreDriver
);

router.delete(
    "/:id",
    verifyToken,
    driverController.deleteDriver
);

module.exports = router;