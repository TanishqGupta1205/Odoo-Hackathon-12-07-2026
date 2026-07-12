// controllers/dashboard.controller.js

const { prisma } = require("../config/db");

const VEHICLE_STATUSES = [
  "AVAILABLE",
  "ON_TRIP",
  "IN_SHOP",
  "RETIRED",
];

function convertToEnum(value) {
  if (!value) return null;

  return value
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

function toNumber(value) {
  if (value === null || value === undefined) {
    return 0;
  }

  return Number(value);
}

function roundNumber(value, decimalPlaces = 2) {
  const multiplier = 10 ** decimalPlaces;

  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}

function parseDate(value, endOfDay = false) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }

  return date;
}

function createDateFilter(fromDate, toDate) {
  const filter = {};

  if (fromDate) {
    filter.gte = fromDate;
  }

  if (toDate) {
    filter.lte = toDate;
  }

  return filter;
}

function getMonthKey(dateValue) {
  const date = new Date(dateValue);

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}`;
}

function getMonthLabel(dateValue) {
  return new Date(dateValue).toLocaleString("en-US", {
    month: "short",
    year: "numeric",
  });
}

function createMonthBuckets(startDate, endDate) {
  const buckets = [];

  const start = new Date(
    startDate.getFullYear(),
    startDate.getMonth(),
    1
  );

  const end = new Date(
    endDate.getFullYear(),
    endDate.getMonth(),
    1
  );

  const cursor = new Date(start);

  while (cursor <= end) {
    buckets.push({
      key: getMonthKey(cursor),
      month: getMonthLabel(cursor),
      fuelCost: 0,
      maintenanceCost: 0,
      otherExpenses: 0,
      revenue: 0,
      totalOperationalCost: 0,
    });

    cursor.setMonth(cursor.getMonth() + 1);

    // Dashboard chart खूप मोठा होऊ नये म्हणून maximum 12 months
    if (buckets.length >= 12) {
      break;
    }
  }

  return buckets;
}

/**
 * GET /api/dashboard
 *
 * Query parameters:
 * vehicleType=Truck
 * vehicleStatus=AVAILABLE
 * region=Pune
 * from=2026-01-01
 * to=2026-12-31
 */
async function getDashboard(req, res, next) {
  try {
    const {
      vehicleType,
      vehicleStatus,
      status,
      region,
      from,
      to,
    } = req.query;

    const requestedStatus = convertToEnum(
      vehicleStatus || status
    );

    if (
      requestedStatus &&
      !VEHICLE_STATUSES.includes(requestedStatus)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid vehicle status. Use AVAILABLE, ON_TRIP, IN_SHOP or RETIRED.",
      });
    }

    const fromDate = parseDate(from);
    const toDate = parseDate(to, true);

    if (from && !fromDate) {
      return res.status(400).json({
        success: false,
        message: "Invalid from date.",
      });
    }

    if (to && !toDate) {
      return res.status(400).json({
        success: false,
        message: "Invalid to date.",
      });
    }

    if (fromDate && toDate && fromDate > toDate) {
      return res.status(400).json({
        success: false,
        message: "From date cannot be greater than to date.",
      });
    }

    /*
     * Vehicle filters
     */
    const baseVehicleWhere = {};

    if (vehicleType) {
      baseVehicleWhere.type = {
        equals: vehicleType.trim(),
        mode: "insensitive",
      };
    }

    if (region) {
      baseVehicleWhere.region = {
        equals: region.trim(),
        mode: "insensitive",
      };
    }

    const filteredVehicleWhere = {
      ...baseVehicleWhere,
    };

    if (requestedStatus) {
      filteredVehicleWhere.status = requestedStatus;
    }

    const hasVehicleFilters =
      Object.keys(filteredVehicleWhere).length > 0;

    const vehicleRelationFilter = hasVehicleFilters
      ? {
          vehicle: {
            is: filteredVehicleWhere,
          },
        }
      : {};

    /*
     * Date filters
     */
    const dateFilter = createDateFilter(
      fromDate,
      toDate
    );

    const hasDateFilter =
      Object.keys(dateFilter).length > 0;

    const tripBaseWhere = {
      ...vehicleRelationFilter,
      ...(hasDateFilter
        ? {
            createdAt: dateFilter,
          }
        : {}),
    };

    const fuelWhere = {
      ...vehicleRelationFilter,
      ...(hasDateFilter
        ? {
            date: dateFilter,
          }
        : {}),
    };

    const maintenanceWhere = {
      ...vehicleRelationFilter,
      ...(hasDateFilter
        ? {
            startDate: dateFilter,
          }
        : {}),
    };

    const expenseWhere = {
      ...vehicleRelationFilter,
      ...(hasDateFilter
        ? {
            date: dateFilter,
          }
        : {}),
    };

    const completedTripWhere = {
      ...vehicleRelationFilter,
      status: "COMPLETED",
      ...(hasDateFilter
        ? {
            completedAt: dateFilter,
          }
        : {}),
    };

    /*
     * KPI counts
     */
    const activeVehicleWhere = {
      ...baseVehicleWhere,
      ...(requestedStatus
        ? {
            status: requestedStatus,
          }
        : {
            status: {
              not: "RETIRED",
            },
          }),
    };

    const availableVehicleWhere = {
      ...baseVehicleWhere,
      status: "AVAILABLE",
    };

    const inShopVehicleWhere = {
      ...baseVehicleWhere,
      status: "IN_SHOP",
    };

    const onTripVehicleWhere = {
      ...baseVehicleWhere,
      status: "ON_TRIP",
    };

    const [
      totalVehicles,
      activeVehiclesRaw,
      availableVehiclesRaw,
      vehiclesInMaintenanceRaw,
      vehiclesOnTripRaw,
      retiredVehiclesRaw,

      activeTrips,
      pendingTrips,
      completedTripsCount,
      cancelledTrips,

      totalDrivers,
      driversOnDuty,
      availableDrivers,
      suspendedDrivers,

      fuelAggregate,
      maintenanceAggregate,
      expenseAggregate,
      acquisitionCostAggregate,

      completedTrips,
      recentTrips,

      vehicleStatusGroups,
      driverStatusGroups,
      tripStatusGroups,
    ] = await Promise.all([
      prisma.vehicle.count({
        where: filteredVehicleWhere,
      }),

      prisma.vehicle.count({
        where: activeVehicleWhere,
      }),

      prisma.vehicle.count({
        where: availableVehicleWhere,
      }),

      prisma.vehicle.count({
        where: inShopVehicleWhere,
      }),

      prisma.vehicle.count({
        where: onTripVehicleWhere,
      }),

      prisma.vehicle.count({
        where: {
          ...baseVehicleWhere,
          status: "RETIRED",
        },
      }),

      prisma.trip.count({
        where: {
          ...tripBaseWhere,
          status: "DISPATCHED",
        },
      }),

      prisma.trip.count({
        where: {
          ...tripBaseWhere,
          status: "DRAFT",
        },
      }),

      prisma.trip.count({
        where: {
          ...tripBaseWhere,
          status: "COMPLETED",
        },
      }),

      prisma.trip.count({
        where: {
          ...tripBaseWhere,
          status: "CANCELLED",
        },
      }),

      prisma.driver.count(),

      prisma.driver.count({
        where: {
          status: "ON_TRIP",
        },
      }),

      prisma.driver.count({
        where: {
          status: "AVAILABLE",
        },
      }),

      prisma.driver.count({
        where: {
          status: "SUSPENDED",
        },
      }),

      prisma.fuelLog.aggregate({
        where: fuelWhere,
        _sum: {
          liters: true,
          cost: true,
        },
      }),

      prisma.maintenance.aggregate({
        where: maintenanceWhere,
        _sum: {
          cost: true,
        },
      }),

      prisma.expense.aggregate({
        where: expenseWhere,
        _sum: {
          amount: true,
        },
      }),

      prisma.vehicle.aggregate({
        where: filteredVehicleWhere,
        _sum: {
          acquisitionCost: true,
        },
      }),

      prisma.trip.findMany({
        where: completedTripWhere,
        select: {
          actualDistance: true,
          plannedDistance: true,
          revenue: true,
          completedAt: true,
        },
      }),

      prisma.trip.findMany({
        where: tripBaseWhere,
        take: 5,
        orderBy: {
          createdAt: "desc",
        },
        include: {
          vehicle: {
            select: {
              id: true,
              registrationNumber: true,
              vehicleName: true,
              type: true,
              status: true,
            },
          },
          driver: {
            select: {
              id: true,
              name: true,
              licenseNumber: true,
              status: true,
            },
          },
        },
      }),

      prisma.vehicle.groupBy({
        by: ["status"],
        where: {
          ...baseVehicleWhere,
          ...(requestedStatus
            ? {
                status: requestedStatus,
              }
            : {}),
        },
        _count: {
          _all: true,
        },
      }),

      prisma.driver.groupBy({
        by: ["status"],
        _count: {
          _all: true,
        },
      }),

      prisma.trip.groupBy({
        by: ["status"],
        where: tripBaseWhere,
        _count: {
          _all: true,
        },
      }),
    ]);

    /*
     * Status filter apply झाल्यावर conflicting KPI 0 दाखवतो
     */
    const activeVehicles =
      requestedStatus === "RETIRED"
        ? 0
        : activeVehiclesRaw;

    const availableVehicles =
      requestedStatus &&
      requestedStatus !== "AVAILABLE"
        ? 0
        : availableVehiclesRaw;

    const vehiclesInMaintenance =
      requestedStatus &&
      requestedStatus !== "IN_SHOP"
        ? 0
        : vehiclesInMaintenanceRaw;

    const vehiclesOnTrip =
      requestedStatus &&
      requestedStatus !== "ON_TRIP"
        ? 0
        : vehiclesOnTripRaw;

    const retiredVehicles =
      requestedStatus &&
      requestedStatus !== "RETIRED"
        ? 0
        : retiredVehiclesRaw;

    /*
     * Financial calculations
     */
    const totalFuelConsumed = toNumber(
      fuelAggregate._sum.liters
    );

    const totalFuelCost = toNumber(
      fuelAggregate._sum.cost
    );

    const totalMaintenanceCost = toNumber(
      maintenanceAggregate._sum.cost
    );

    const totalOtherExpenses = toNumber(
      expenseAggregate._sum.amount
    );

    const totalAcquisitionCost = toNumber(
      acquisitionCostAggregate._sum.acquisitionCost
    );

    let totalDistance = 0;
    let totalRevenue = 0;

    completedTrips.forEach((trip) => {
      totalDistance += toNumber(
        trip.actualDistance ?? trip.plannedDistance
      );

      totalRevenue += toNumber(trip.revenue);
    });

    const totalOperationalCost =
      totalFuelCost +
      totalMaintenanceCost +
      totalOtherExpenses;

    const fuelEfficiency =
      totalFuelConsumed > 0
        ? totalDistance / totalFuelConsumed
        : 0;

    /*
     * PDF formula:
     * Revenue - (Maintenance + Fuel)
     * --------------------------------
     * Acquisition Cost
     */
    const vehicleROI =
      totalAcquisitionCost > 0
        ? ((totalRevenue -
            (totalMaintenanceCost + totalFuelCost)) /
            totalAcquisitionCost) *
          100
        : 0;

    const fleetUtilization =
      activeVehicles > 0
        ? (vehiclesOnTrip / activeVehicles) * 100
        : 0;

    /*
     * Monthly chart data
     *
     * Query dates नसतील तर last 6 months.
     */
    const chartEndDate = toDate || new Date();

    const chartStartDate =
      fromDate ||
      new Date(
        chartEndDate.getFullYear(),
        chartEndDate.getMonth() - 5,
        1
      );

    const chartDateFilter = {
      gte: chartStartDate,
      lte: chartEndDate,
    };

    const [
      monthlyFuelLogs,
      monthlyMaintenanceLogs,
      monthlyExpenses,
      monthlyCompletedTrips,
    ] = await Promise.all([
      prisma.fuelLog.findMany({
        where: {
          ...vehicleRelationFilter,
          date: chartDateFilter,
        },
        select: {
          date: true,
          cost: true,
        },
      }),

      prisma.maintenance.findMany({
        where: {
          ...vehicleRelationFilter,
          startDate: chartDateFilter,
        },
        select: {
          startDate: true,
          cost: true,
        },
      }),

      prisma.expense.findMany({
        where: {
          ...vehicleRelationFilter,
          date: chartDateFilter,
        },
        select: {
          date: true,
          amount: true,
        },
      }),

      prisma.trip.findMany({
        where: {
          ...vehicleRelationFilter,
          status: "COMPLETED",
          completedAt: chartDateFilter,
        },
        select: {
          completedAt: true,
          revenue: true,
        },
      }),
    ]);

    const monthlyData = createMonthBuckets(
      chartStartDate,
      chartEndDate
    );

    const monthlyMap = new Map(
      monthlyData.map((item) => [item.key, item])
    );

    monthlyFuelLogs.forEach((log) => {
      const key = getMonthKey(log.date);
      const bucket = monthlyMap.get(key);

      if (bucket) {
        bucket.fuelCost += toNumber(log.cost);
      }
    });

    monthlyMaintenanceLogs.forEach((log) => {
      const key = getMonthKey(log.startDate);
      const bucket = monthlyMap.get(key);

      if (bucket) {
        bucket.maintenanceCost += toNumber(log.cost);
      }
    });

    monthlyExpenses.forEach((expense) => {
      const key = getMonthKey(expense.date);
      const bucket = monthlyMap.get(key);

      if (bucket) {
        bucket.otherExpenses += toNumber(
          expense.amount
        );
      }
    });

    monthlyCompletedTrips.forEach((trip) => {
      if (!trip.completedAt) return;

      const key = getMonthKey(trip.completedAt);
      const bucket = monthlyMap.get(key);

      if (bucket) {
        bucket.revenue += toNumber(trip.revenue);
      }
    });

    const formattedMonthlyData = monthlyData.map(
      (item) => {
        const fuelCost = roundNumber(item.fuelCost);
        const maintenanceCost = roundNumber(
          item.maintenanceCost
        );
        const otherExpenses = roundNumber(
          item.otherExpenses
        );
        const revenue = roundNumber(item.revenue);

        return {
          month: item.month,
          fuelCost,
          maintenanceCost,
          otherExpenses,
          revenue,
          totalOperationalCost: roundNumber(
            fuelCost +
              maintenanceCost +
              otherExpenses
          ),
        };
      }
    );

    const formattedRecentTrips = recentTrips.map(
      (trip) => ({
        id: trip.id,
        source: trip.source,
        destination: trip.destination,
        cargoWeight: trip.cargoWeight,
        plannedDistance: trip.plannedDistance,
        actualDistance: trip.actualDistance,
        revenue: toNumber(trip.revenue),
        status: trip.status,
        dispatchedAt: trip.dispatchedAt,
        completedAt: trip.completedAt,
        createdAt: trip.createdAt,
        vehicle: trip.vehicle,
        driver: trip.driver,
      })
    );

    return res.status(200).json({
      success: true,
      message: "Dashboard data fetched successfully",

      filters: {
        vehicleType: vehicleType || null,
        vehicleStatus: requestedStatus,
        region: region || null,
        from: from || null,
        to: to || null,
      },

      kpis: {
        totalVehicles,
        activeVehicles,
        availableVehicles,
        vehiclesOnTrip,
        vehiclesInMaintenance,
        retiredVehicles,

        activeTrips,
        pendingTrips,
        completedTrips: completedTripsCount,
        cancelledTrips,

        totalDrivers,
        driversOnDuty,
        availableDrivers,
        suspendedDrivers,

        fleetUtilization: roundNumber(
          fleetUtilization
        ),
      },

      analytics: {
        totalDistance: roundNumber(totalDistance),
        totalFuelConsumed: roundNumber(
          totalFuelConsumed
        ),
        fuelEfficiency: roundNumber(
          fuelEfficiency
        ),

        totalRevenue: roundNumber(totalRevenue),
        totalFuelCost: roundNumber(totalFuelCost),
        totalMaintenanceCost: roundNumber(
          totalMaintenanceCost
        ),
        totalOtherExpenses: roundNumber(
          totalOtherExpenses
        ),
        totalOperationalCost: roundNumber(
          totalOperationalCost
        ),
        totalAcquisitionCost: roundNumber(
          totalAcquisitionCost
        ),
        vehicleROI: roundNumber(vehicleROI),
      },

      charts: {
        vehicleStatusDistribution:
          vehicleStatusGroups.map((item) => ({
            status: item.status,
            count: item._count._all,
          })),

        driverStatusDistribution:
          driverStatusGroups.map((item) => ({
            status: item.status,
            count: item._count._all,
          })),

        tripStatusDistribution:
          tripStatusGroups.map((item) => ({
            status: item.status,
            count: item._count._all,
          })),

        monthlyFinancialData:
          formattedMonthlyData,
      },

      recentTrips: formattedRecentTrips,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getDashboard,
};