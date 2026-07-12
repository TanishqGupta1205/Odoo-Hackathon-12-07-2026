// routes/driver.routes.js

const express = require("express");

const driverController = require(
  "../controllers/driver.controller"
);

const authMiddleware = require(
  "../middlewares/auth.middleware"
);

const router = express.Router();



router.get(
  "/available",
  authMiddleware,
  driverController.getAvailableDrivers
);

router.get(
  "/",
  authMiddleware,
  driverController.getAllDrivers
);

router.get(
  "/:id",
  authMiddleware,
  driverController.getDriverById
);

router.post(
  "/",
  authMiddleware,
  driverController.createDriver
);

router.patch(
  "/:id",
  authMiddleware,
  driverController.updateDriver
);

router.patch(
  "/:id/suspend",
  authMiddleware,
  driverController.suspendDriver
);

router.patch(
  "/:id/restore",
  authMiddleware,
  driverController.restoreDriver
);

router.delete(
  "/:id",
  authMiddleware,
  driverController.deleteDriver
);

module.exports = router;