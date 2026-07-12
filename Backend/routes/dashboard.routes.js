const express = require("express");

const dashboardController = require("../controllers/dashboard.controller");

// 🛠️ FIX: Destructure the exact function from your middleware file
const { verifyToken } = require("../middlewares/auth.middleware");

const router = express.Router();

router.get(
    "/",
    verifyToken,
    dashboardController.getDashboard
);

module.exports = router;