const express = require("express");

const tripController = require(
  "../controllers/trip.controller"
);

const authMiddleware = require(
  "../middlewares/auth.middleware"
);

const router = express.Router();

router.get(
  "/",
  authMiddleware,
  tripController.getAllTrips
);

router.post(
  "/",
  authMiddleware,
  tripController.createTrip
);

router.patch(
  "/:id/dispatch",
  authMiddleware,
  tripController.dispatchTrip
);

router.patch(
  "/:id/complete",
  authMiddleware,
  tripController.completeTrip
);

router.patch(
  "/:id/cancel",
  authMiddleware,
  tripController.cancelTrip
);

router.get(
  "/:id",
  authMiddleware,
  tripController.getTripById
);

router.patch(
  "/:id",
  authMiddleware,
  tripController.updateTrip
);

router.delete(
  "/:id",
  authMiddleware,
  tripController.deleteTrip
);

module.exports = router;