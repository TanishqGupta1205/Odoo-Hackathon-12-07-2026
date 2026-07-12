const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth.routes");
const vehicleRoutes = require("./routes/vehicle.routes");
const driverRoutes = require("./routes/driver.routes");
const tripRoutes = require("./routes/trip.routes");
const maintenanceRoutes = require("./routes/maintenance.routes");
const fuelRoutes = require("./routes/fuel.routes");
const expenseRoutes = require("./routes/expense.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const reportRoutes = require("./routes/report.routes");

const errorMiddleware = require("./middlewares/error.middleware");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "TransitOps API is running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/vehicles", vehicleRoutes);
app.use("/api/drivers", driverRoutes);
app.use("/api/trips", tripRoutes);
app.use("/api/maintenance", maintenanceRoutes);
app.use("/api/fuel-logs", fuelRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/reports", reportRoutes);

app.use(errorMiddleware);

module.exports = app;
