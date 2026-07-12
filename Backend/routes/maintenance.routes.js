const express = require("express");

const maintenanceController = require(
    "../controllers/maintenance.controller"
);

// 🛠️ FIX: Destructure the exact function from your middleware file
const { verifyToken } = require(
    "../middlewares/auth.middleware"
);

const router = express.Router();

router.get(
    "/summary",
    verifyToken,
    maintenanceController.getMaintenanceSummary
);

router.get(
    "/active",
    verifyToken,
    maintenanceController.getActiveMaintenance
);

router.get(
    "/",
    verifyToken,
    maintenanceController.getAllMaintenance
);

router.get(
    "/:id",
    verifyToken,
    maintenanceController.getMaintenanceById
);

router.post(
    "/",
    verifyToken,
    maintenanceController.createMaintenance
);

router.patch(
    "/:id",
    verifyToken,
    maintenanceController.updateMaintenance
);

router.patch(
    "/:id/close",
    verifyToken,
    maintenanceController.closeMaintenance
);

router.delete(
    "/:id",
    verifyToken,
    maintenanceController.deleteMaintenance
);

module.exports = router;