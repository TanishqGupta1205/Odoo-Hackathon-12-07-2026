const express = require("express");
const dashboardController = require("../controllers/dashboard.controller");
const { verifyToken } = require("../middlewares/auth.middleware");

const router = express.Router();

// 🚀 Safe evaluation mounting for your CSV export feature
if (typeof dashboardController.exportAnalyticsCSV === "function") {
    router.get("/export/csv", verifyToken, dashboardController.exportAnalyticsCSV);
}

// 🚀 Safe evaluation mounting for the main dashboard viewport
if (typeof dashboardController.getDashboard === "function") {
    router.get("/", verifyToken, dashboardController.getDashboard);
}

module.exports = router;