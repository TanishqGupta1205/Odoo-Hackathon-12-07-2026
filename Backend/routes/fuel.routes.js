// routes/fuel.routes.js

const express = require("express");

const fuelController = require(
  "../controllers/fuel.controller"
);

const authMiddleware = require(
  "../middlewares/auth.middleware"
);

const router = express.Router();

router.get(
  "/summary",
  authMiddleware,
  fuelController.getFuelSummary
);

router.get(
  "/",
  authMiddleware,
  fuelController.getAllFuelLogs
);

router.get(
  "/:id",
  authMiddleware,
  fuelController.getFuelLogById
);

router.post(
  "/",
  authMiddleware,
  fuelController.createFuelLog
);

router.patch(
  "/:id",
  authMiddleware,
  fuelController.updateFuelLog
);

router.delete(
  "/:id",
  authMiddleware,
  fuelController.deleteFuelLog
);

module.exports = router;