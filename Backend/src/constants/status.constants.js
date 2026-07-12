const VEHICLE_STATUS = Object.freeze({
  AVAILABLE: "Available",
  ON_TRIP: "On Trip",
  IN_SHOP: "In Shop",
  RETIRED: "Retired",
});

const DRIVER_STATUS = Object.freeze({
  AVAILABLE: "Available",
  ON_TRIP: "On Trip",
  OFF_DUTY: "Off Duty",
  SUSPENDED: "Suspended",
});

const TRIP_STATUS = Object.freeze({
  DRAFT: "Draft",
  DISPATCHED: "Dispatched",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
});

module.exports = { VEHICLE_STATUS, DRIVER_STATUS, TRIP_STATUS };
