const express = require("express");

const vehicleController = require(
  "../controllers/vehicle.controller"
);

const authMiddleware = require(
  "../middlewares/auth.middleware"
);

const router = express.Router();

router.get(
  "/summary",
  authMiddleware,
  vehicleController.getVehicleSummary
);

router.get(
  "/available",
  authMiddleware,
  vehicleController.getAvailableVehicles
);

router.get(
  "/",
  authMiddleware,
  vehicleController.getAllVehicles
);

router.post(
  "/",
  authMiddleware,
  vehicleController.createVehicle
);

router.patch(
  "/:id/retire",
  authMiddleware,
  vehicleController.retireVehicle
);

router.patch(
  "/:id/restore",
  authMiddleware,
  vehicleController.restoreVehicle
);

router.get(
  "/:id",
  authMiddleware,
  vehicleController.getVehicleById
);

router.patch(
  "/:id",
  authMiddleware,
  vehicleController.updateVehicle
);

router.delete(
  "/:id",
  authMiddleware,
  vehicleController.deleteVehicle
);

module.exports = router;