const express = require("express");

const maintenanceController = require(
  "../controllers/maintenance.controller"
);

const authMiddleware = require(
  "../middlewares/auth.middleware"
);

const router = express.Router();

router.get(
  "/summary",
  authMiddleware,
  maintenanceController.getMaintenanceSummary
);

router.get(
  "/active",
  authMiddleware,
  maintenanceController.getActiveMaintenance
);

router.get(
  "/",
  authMiddleware,
  maintenanceController.getAllMaintenance
);

router.get(
  "/:id",
  authMiddleware,
  maintenanceController.getMaintenanceById
);

router.post(
  "/",
  authMiddleware,
  maintenanceController.createMaintenance
);

router.patch(
  "/:id",
  authMiddleware,
  maintenanceController.updateMaintenance
);

router.patch(
  "/:id/close",
  authMiddleware,
  maintenanceController.closeMaintenance
);

router.delete(
  "/:id",
  authMiddleware,
  maintenanceController.deleteMaintenance
);

module.exports = router;