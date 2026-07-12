const express = require("express");

const vehicleController = require(
    "../controllers/vehicle.controller"
);

// Destructure the specific function from your middleware file
const { verifyToken } = require(
    "../middlewares/auth.middleware"
);

const router = express.Router();

router.get(
    "/summary",
    verifyToken,
    vehicleController.getVehicleSummary
);

router.get(
    "/available",
    verifyToken,
    vehicleController.getAvailableVehicles
);

router.get(
    "/",
    verifyToken,
    vehicleController.getAllVehicles
);

router.post(
    "/",
    verifyToken,
    vehicleController.createVehicle
);

router.patch(
    "/:id/retire",
    verifyToken,
    vehicleController.retireVehicle
);

router.patch(
    "/:id/restore",
    verifyToken,
    vehicleController.restoreVehicle
);

router.get(
    "/:id",
    verifyToken,
    vehicleController.getVehicleById
);

router.patch(
    "/:id",
    verifyToken,
    vehicleController.updateVehicle
);

router.delete(
    "/:id",
    verifyToken,
    vehicleController.deleteVehicle
);

module.exports = router;