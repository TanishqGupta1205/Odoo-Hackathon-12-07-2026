const { prisma } = require("../config/db");

const VEHICLE_STATUSES = [
  "AVAILABLE",
  "ON_TRIP",
  "IN_SHOP",
  "RETIRED",
];

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function toNumber(value) {
  if (value === null || value === undefined) {
    return 0;
  }

  return Number(value);
}

function roundNumber(value, decimalPlaces = 2) {
  const multiplier = 10 ** decimalPlaces;

  return (
    Math.round(
      (Number(value) + Number.EPSILON) * multiplier
    ) / multiplier
  );
}

function normalizeStatus(value) {
  if (!value) return null;

  return String(value)
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

function parseDate(value, endOfDay = false) {
  if (!value) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const suffix = endOfDay
      ? "T23:59:59.999Z"
      : "T00:00:00.000Z";

    const date = new Date(`${value}${suffix}`);

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return date;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function validateDateRange(from, to) {
  const fromDate = parseDate(from);
  const toDate = parseDate(to, true);

  if (from && !fromDate) {
    throw createHttpError(400, "Invalid from date.");
  }

  if (to && !toDate) {
    throw createHttpError(400, "Invalid to date.");
  }

  if (fromDate && toDate && fromDate > toDate) {
    throw createHttpError(
      400,
      "From date cannot be greater than to date."
    );
  }

  return {
    fromDate,
    toDate,
  };
}

function createDateFilter(fromDate, toDate) {
  const dateFilter = {};

  if (fromDate) {
    dateFilter.gte = fromDate;
  }

  if (toDate) {
    dateFilter.lte = toDate;
  }

  return dateFilter;
}

function buildVehicleWhere(filters = {}) {
  const {
    vehicleId,
    vehicleType,
    vehicleStatus,
    region,
  } = filters;

  const where = {};

  if (vehicleId) {
    where.id = vehicleId;
  }

  if (vehicleType && String(vehicleType).trim()) {
    where.type = {
      equals: String(vehicleType).trim(),
      mode: "insensitive",
    };
  }

  if (region && String(region).trim()) {
    where.region = {
      equals: String(region).trim(),
      mode: "insensitive",
    };
  }

  if (vehicleStatus) {
    const normalizedStatus =
      normalizeStatus(vehicleStatus);

    if (
      !VEHICLE_STATUSES.includes(normalizedStatus)
    ) {
      throw createHttpError(
        400,
        "Invalid vehicle status. Use AVAILABLE, ON_TRIP, IN_SHOP or RETIRED."
      );
    }

    where.status = normalizedStatus;
  }

  return where;
}

function createVehicleRelationFilter(vehicleWhere) {
  if (Object.keys(vehicleWhere).length === 0) {
    return {};
  }

  return {
    vehicle: {
      is: vehicleWhere,
    },
  };
}

function calculateTripTotals(trips) {
  let totalDistance = 0;
  let totalRevenue = 0;

  trips.forEach((trip) => {
    totalDistance += toNumber(
      trip.actualDistance ??
        trip.plannedDistance
    );

    totalRevenue += toNumber(trip.revenue);
  });

  return {
    totalDistance,
    totalRevenue,
  };
}

function calculateAnalytics({
  totalDistance,
  totalRevenue,
  totalFuelLiters,
  totalFuelCost,
  totalMaintenanceCost,
  totalOtherExpenses,
  totalAcquisitionCost,
  activeVehicles,
  vehiclesOnTrip,
}) {
  const totalOperationalCost =
    totalFuelCost +
    totalMaintenanceCost +
    totalOtherExpenses;

  const fuelEfficiency =
    totalFuelLiters > 0
      ? totalDistance / totalFuelLiters
      : 0;

  const fleetUtilization =
    activeVehicles > 0
      ? (vehiclesOnTrip / activeVehicles) * 100
      : 0;

  const vehicleROI =
    totalAcquisitionCost > 0
      ? ((totalRevenue -
          (totalFuelCost +
            totalMaintenanceCost)) /
          totalAcquisitionCost) *
        100
      : 0;

  const netProfit =
    totalRevenue - totalOperationalCost;

  return {
    totalDistance: roundNumber(totalDistance),
    totalRevenue: roundNumber(totalRevenue),
    totalFuelLiters: roundNumber(
      totalFuelLiters
    ),
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
    fuelEfficiency: roundNumber(
      fuelEfficiency
    ),
    fuelEfficiencyUnit: "km/liter",
    fleetUtilization: roundNumber(
      fleetUtilization
    ),
    fleetUtilizationUnit: "%",
    vehicleROI: roundNumber(vehicleROI),
    vehicleROIUnit: "%",
    netProfit: roundNumber(netProfit),
  };
}

async function getDashboardAnalytics(
  filters = {}
) {
  const {
    from,
    to,
  } = filters;

  const {
    fromDate,
    toDate,
  } = validateDateRange(from, to);

  const dateFilter = createDateFilter(
    fromDate,
    toDate
  );

  const hasDateFilter =
    Object.keys(dateFilter).length > 0;

  const vehicleWhere =
    buildVehicleWhere(filters);

  const vehicleRelationFilter =
    createVehicleRelationFilter(vehicleWhere);

  const tripWhere = {
    ...vehicleRelationFilter,
    ...(hasDateFilter
      ? {
          createdAt: dateFilter,
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

  const activeVehicleWhere = {
    ...vehicleWhere,
  };

  if (!vehicleWhere.status) {
    activeVehicleWhere.status = {
      not: "RETIRED",
    };
  }

  const [
    totalVehicles,
    activeVehiclesRaw,
    availableVehicles,
    vehiclesOnTrip,
    vehiclesInMaintenance,
    retiredVehicles,

    activeTrips,
    pendingTrips,
    completedTripsCount,
    cancelledTrips,

    totalDrivers,
    availableDrivers,
    driversOnDuty,
    offDutyDrivers,
    suspendedDrivers,

    fuelAggregate,
    maintenanceAggregate,
    expenseAggregate,
    acquisitionAggregate,

    completedTrips,
    recentTrips,
  ] = await Promise.all([
    prisma.vehicle.count({
      where: vehicleWhere,
    }),

    prisma.vehicle.count({
      where: activeVehicleWhere,
    }),

    prisma.vehicle.count({
      where: {
        ...vehicleWhere,
        status: "AVAILABLE",
      },
    }),

    prisma.vehicle.count({
      where: {
        ...vehicleWhere,
        status: "ON_TRIP",
      },
    }),

    prisma.vehicle.count({
      where: {
        ...vehicleWhere,
        status: "IN_SHOP",
      },
    }),

    prisma.vehicle.count({
      where: {
        ...vehicleWhere,
        status: "RETIRED",
      },
    }),

    prisma.trip.count({
      where: {
        ...tripWhere,
        status: "DISPATCHED",
      },
    }),

    prisma.trip.count({
      where: {
        ...tripWhere,
        status: "DRAFT",
      },
    }),

    prisma.trip.count({
      where: {
        ...tripWhere,
        status: "COMPLETED",
      },
    }),

    prisma.trip.count({
      where: {
        ...tripWhere,
        status: "CANCELLED",
      },
    }),

    prisma.driver.count(),

    prisma.driver.count({
      where: {
        status: "AVAILABLE",
      },
    }),

    prisma.driver.count({
      where: {
        status: "ON_TRIP",
      },
    }),

    prisma.driver.count({
      where: {
        status: "OFF_DUTY",
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
      _avg: {
        liters: true,
        cost: true,
      },
    }),

    prisma.maintenance.aggregate({
      where: maintenanceWhere,
      _sum: {
        cost: true,
      },
      _avg: {
        cost: true,
      },
    }),

    prisma.expense.aggregate({
      where: expenseWhere,
      _sum: {
        amount: true,
      },
      _avg: {
        amount: true,
      },
    }),

    prisma.vehicle.aggregate({
      where: vehicleWhere,
      _sum: {
        acquisitionCost: true,
      },
    }),

    prisma.trip.findMany({
      where: completedTripWhere,
      select: {
        plannedDistance: true,
        actualDistance: true,
        revenue: true,
      },
    }),

    prisma.trip.findMany({
      where: tripWhere,
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
  ]);

  const activeVehicles =
    vehicleWhere.status === "RETIRED"
      ? 0
      : activeVehiclesRaw;

  const {
    totalDistance,
    totalRevenue,
  } = calculateTripTotals(completedTrips);

  const totalFuelLiters = toNumber(
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
    acquisitionAggregate._sum.acquisitionCost
  );

  const analytics = calculateAnalytics({
    totalDistance,
    totalRevenue,
    totalFuelLiters,
    totalFuelCost,
    totalMaintenanceCost,
    totalOtherExpenses,
    totalAcquisitionCost,
    activeVehicles,
    vehiclesOnTrip,
  });

  return {
    filters: {
      vehicleId: filters.vehicleId || null,
      vehicleType:
        filters.vehicleType || null,
      vehicleStatus:
        vehicleWhere.status || null,
      region: filters.region || null,
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
      availableDrivers,
      driversOnDuty,
      offDutyDrivers,
      suspendedDrivers,
      fleetUtilization:
        analytics.fleetUtilization,
    },

    analytics: {
      ...analytics,
      averageFuelLiters: roundNumber(
        fuelAggregate._avg.liters || 0
      ),
      averageFuelCost: roundNumber(
        toNumber(fuelAggregate._avg.cost)
      ),
      averageMaintenanceCost: roundNumber(
        toNumber(
          maintenanceAggregate._avg.cost
        )
      ),
      averageOtherExpense: roundNumber(
        toNumber(expenseAggregate._avg.amount)
      ),
    },

    recentTrips: recentTrips.map((trip) => ({
      ...trip,
      revenue: toNumber(trip.revenue),
    })),
  };
}

async function getVehicleAnalytics(
  vehicleId,
  filters = {}
) {
  if (!vehicleId) {
    throw createHttpError(
      400,
      "Vehicle ID is required."
    );
  }

  const {
    fromDate,
    toDate,
  } = validateDateRange(
    filters.from,
    filters.to
  );

  const dateFilter = createDateFilter(
    fromDate,
    toDate
  );

  const hasDateFilter =
    Object.keys(dateFilter).length > 0;

  const vehicle =
    await prisma.vehicle.findUnique({
      where: {
        id: vehicleId,
      },
      select: {
        id: true,
        registrationNumber: true,
        vehicleName: true,
        model: true,
        type: true,
        maximumLoadCapacity: true,
        odometer: true,
        acquisitionCost: true,
        region: true,
        status: true,
      },
    });

  if (!vehicle) {
    throw createHttpError(
      404,
      "Vehicle not found."
    );
  }

  const [
    tripGroups,
    completedTrips,
    fuelAggregate,
    maintenanceAggregate,
    expenseAggregate,
  ] = await Promise.all([
    prisma.trip.groupBy({
      by: ["status"],
      where: {
        vehicleId,
        ...(hasDateFilter
          ? {
              createdAt: dateFilter,
            }
          : {}),
      },
      _count: {
        _all: true,
      },
    }),

    prisma.trip.findMany({
      where: {
        vehicleId,
        status: "COMPLETED",
        ...(hasDateFilter
          ? {
              completedAt: dateFilter,
            }
          : {}),
      },
      select: {
        plannedDistance: true,
        actualDistance: true,
        revenue: true,
      },
    }),

    prisma.fuelLog.aggregate({
      where: {
        vehicleId,
        ...(hasDateFilter
          ? {
              date: dateFilter,
            }
          : {}),
      },
      _count: {
        _all: true,
      },
      _sum: {
        liters: true,
        cost: true,
      },
    }),

    prisma.maintenance.aggregate({
      where: {
        vehicleId,
        ...(hasDateFilter
          ? {
              startDate: dateFilter,
            }
          : {}),
      },
      _count: {
        _all: true,
      },
      _sum: {
        cost: true,
      },
    }),

    prisma.expense.aggregate({
      where: {
        vehicleId,
        ...(hasDateFilter
          ? {
              date: dateFilter,
            }
          : {}),
      },
      _count: {
        _all: true,
      },
      _sum: {
        amount: true,
      },
    }),
  ]);

  const {
    totalDistance,
    totalRevenue,
  } = calculateTripTotals(completedTrips);

  const totalFuelLiters = toNumber(
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
    vehicle.acquisitionCost
  );

  const analytics = calculateAnalytics({
    totalDistance,
    totalRevenue,
    totalFuelLiters,
    totalFuelCost,
    totalMaintenanceCost,
    totalOtherExpenses,
    totalAcquisitionCost,
    activeVehicles:
      vehicle.status === "RETIRED" ? 0 : 1,
    vehiclesOnTrip:
      vehicle.status === "ON_TRIP" ? 1 : 0,
  });

  return {
    vehicle: {
      ...vehicle,
      acquisitionCost: toNumber(
        vehicle.acquisitionCost
      ),
    },

    filters: {
      from: filters.from || null,
      to: filters.to || null,
    },

    counts: {
      fuelLogs: fuelAggregate._count._all,
      maintenanceRecords:
        maintenanceAggregate._count._all,
      expenses: expenseAggregate._count._all,
    },

    tripStatusDistribution:
      tripGroups.map((item) => ({
        status: item.status,
        count: item._count._all,
      })),

    analytics,
  };
}

function getMonthKey(dateValue) {
  const date = new Date(dateValue);

  return `${date.getUTCFullYear()}-${String(
    date.getUTCMonth() + 1
  ).padStart(2, "0")}`;
}

function getMonthLabel(dateValue) {
  return new Date(dateValue).toLocaleString(
    "en-US",
    {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }
  );
}

function createMonthlyBuckets(
  startDate,
  endDate
) {
  const buckets = [];

  const cursor = new Date(
    Date.UTC(
      startDate.getUTCFullYear(),
      startDate.getUTCMonth(),
      1
    )
  );

  const end = new Date(
    Date.UTC(
      endDate.getUTCFullYear(),
      endDate.getUTCMonth(),
      1
    )
  );

  while (cursor <= end) {
    buckets.push({
      key: getMonthKey(cursor),
      month: getMonthLabel(cursor),
      fuelLiters: 0,
      fuelCost: 0,
      maintenanceCost: 0,
      otherExpenses: 0,
      revenue: 0,
    });

    cursor.setUTCMonth(
      cursor.getUTCMonth() + 1
    );
  }

  return buckets;
}

async function getMonthlyFinancialAnalytics(
  filters = {}
) {
  const requestedDates = validateDateRange(
    filters.from,
    filters.to
  );

  const endDate =
    requestedDates.toDate || new Date();

  let startDate =
    requestedDates.fromDate ||
    new Date(
      Date.UTC(
        endDate.getUTCFullYear(),
        endDate.getUTCMonth() - 5,
        1
      )
    );

  const maximumStartDate = new Date(
    Date.UTC(
      endDate.getUTCFullYear(),
      endDate.getUTCMonth() - 11,
      1
    )
  );

  if (startDate < maximumStartDate) {
    startDate = maximumStartDate;
  }

  const dateFilter = {
    gte: startDate,
    lte: endDate,
  };

  const vehicleWhere =
    buildVehicleWhere(filters);

  const vehicleRelationFilter =
    createVehicleRelationFilter(vehicleWhere);

  const [
    fuelLogs,
    maintenanceLogs,
    expenses,
    completedTrips,
  ] = await Promise.all([
    prisma.fuelLog.findMany({
      where: {
        ...vehicleRelationFilter,
        date: dateFilter,
      },
      select: {
        date: true,
        liters: true,
        cost: true,
      },
    }),

    prisma.maintenance.findMany({
      where: {
        ...vehicleRelationFilter,
        startDate: dateFilter,
      },
      select: {
        startDate: true,
        cost: true,
      },
    }),

    prisma.expense.findMany({
      where: {
        ...vehicleRelationFilter,
        date: dateFilter,
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
        completedAt: dateFilter,
      },
      select: {
        completedAt: true,
        revenue: true,
      },
    }),
  ]);

  const buckets = createMonthlyBuckets(
    startDate,
    endDate
  );

  const monthMap = new Map(
    buckets.map((bucket) => [
      bucket.key,
      bucket,
    ])
  );

  fuelLogs.forEach((fuelLog) => {
    const bucket = monthMap.get(
      getMonthKey(fuelLog.date)
    );

    if (!bucket) return;

    bucket.fuelLiters += toNumber(
      fuelLog.liters
    );

    bucket.fuelCost += toNumber(fuelLog.cost);
  });

  maintenanceLogs.forEach((maintenance) => {
    const bucket = monthMap.get(
      getMonthKey(maintenance.startDate)
    );

    if (!bucket) return;

    bucket.maintenanceCost += toNumber(
      maintenance.cost
    );
  });

  expenses.forEach((expense) => {
    const bucket = monthMap.get(
      getMonthKey(expense.date)
    );

    if (!bucket) return;

    bucket.otherExpenses += toNumber(
      expense.amount
    );
  });

  completedTrips.forEach((trip) => {
    if (!trip.completedAt) return;

    const bucket = monthMap.get(
      getMonthKey(trip.completedAt)
    );

    if (!bucket) return;

    bucket.revenue += toNumber(trip.revenue);
  });

  return buckets.map((bucket) => {
    const totalOperationalCost =
      bucket.fuelCost +
      bucket.maintenanceCost +
      bucket.otherExpenses;

    return {
      month: bucket.month,
      fuelLiters: roundNumber(
        bucket.fuelLiters
      ),
      fuelCost: roundNumber(bucket.fuelCost),
      maintenanceCost: roundNumber(
        bucket.maintenanceCost
      ),
      otherExpenses: roundNumber(
        bucket.otherExpenses
      ),
      totalOperationalCost: roundNumber(
        totalOperationalCost
      ),
      revenue: roundNumber(bucket.revenue),
      netProfit: roundNumber(
        bucket.revenue -
          totalOperationalCost
      ),
    };
  });
}

async function getVehicleCostBreakdown(
  filters = {}
) {
  const {
    fromDate,
    toDate,
  } = validateDateRange(
    filters.from,
    filters.to
  );

  const dateFilter = createDateFilter(
    fromDate,
    toDate
  );

  const hasDateFilter =
    Object.keys(dateFilter).length > 0;

  const vehicleWhere =
    buildVehicleWhere(filters);

  const limit = Math.min(
    Math.max(
      Number.parseInt(filters.limit, 10) || 10,
      1
    ),
    100
  );

  const vehicles =
    await prisma.vehicle.findMany({
      where: vehicleWhere,
      select: {
        id: true,
        registrationNumber: true,
        vehicleName: true,
        type: true,
        status: true,
        acquisitionCost: true,
      },
    });

  const vehicleIds = vehicles.map(
    (vehicle) => vehicle.id
  );

  if (vehicleIds.length === 0) {
    return [];
  }

  const [
    fuelGroups,
    maintenanceGroups,
    expenseGroups,
    completedTrips,
  ] = await Promise.all([
    prisma.fuelLog.groupBy({
      by: ["vehicleId"],
      where: {
        vehicleId: {
          in: vehicleIds,
        },
        ...(hasDateFilter
          ? {
              date: dateFilter,
            }
          : {}),
      },
      _sum: {
        liters: true,
        cost: true,
      },
    }),

    prisma.maintenance.groupBy({
      by: ["vehicleId"],
      where: {
        vehicleId: {
          in: vehicleIds,
        },
        ...(hasDateFilter
          ? {
              startDate: dateFilter,
            }
          : {}),
      },
      _sum: {
        cost: true,
      },
    }),

    prisma.expense.groupBy({
      by: ["vehicleId"],
      where: {
        vehicleId: {
          in: vehicleIds,
        },
        ...(hasDateFilter
          ? {
              date: dateFilter,
            }
          : {}),
      },
      _sum: {
        amount: true,
      },
    }),

    prisma.trip.findMany({
      where: {
        vehicleId: {
          in: vehicleIds,
        },
        status: "COMPLETED",
        ...(hasDateFilter
          ? {
              completedAt: dateFilter,
            }
          : {}),
      },
      select: {
        vehicleId: true,
        plannedDistance: true,
        actualDistance: true,
        revenue: true,
      },
    }),
  ]);

  const fuelMap = new Map(
    fuelGroups.map((item) => [
      item.vehicleId,
      {
        liters: toNumber(item._sum.liters),
        cost: toNumber(item._sum.cost),
      },
    ])
  );

  const maintenanceMap = new Map(
    maintenanceGroups.map((item) => [
      item.vehicleId,
      toNumber(item._sum.cost),
    ])
  );

  const expenseMap = new Map(
    expenseGroups.map((item) => [
      item.vehicleId,
      toNumber(item._sum.amount),
    ])
  );

  const tripMap = new Map();

  completedTrips.forEach((trip) => {
    const current =
      tripMap.get(trip.vehicleId) || {
        distance: 0,
        revenue: 0,
      };

    current.distance += toNumber(
      trip.actualDistance ??
        trip.plannedDistance
    );

    current.revenue += toNumber(trip.revenue);

    tripMap.set(trip.vehicleId, current);
  });

  return vehicles
    .map((vehicle) => {
      const fuel = fuelMap.get(vehicle.id) || {
        liters: 0,
        cost: 0,
      };

      const maintenanceCost =
        maintenanceMap.get(vehicle.id) || 0;

      const otherExpenses =
        expenseMap.get(vehicle.id) || 0;

      const tripTotals =
        tripMap.get(vehicle.id) || {
          distance: 0,
          revenue: 0,
        };

      const operationalCost =
        fuel.cost +
        maintenanceCost +
        otherExpenses;

      const fuelEfficiency =
        fuel.liters > 0
          ? tripTotals.distance / fuel.liters
          : 0;

      const acquisitionCost = toNumber(
        vehicle.acquisitionCost
      );

      const roi =
        acquisitionCost > 0
          ? ((tripTotals.revenue -
              (fuel.cost +
                maintenanceCost)) /
              acquisitionCost) *
            100
          : 0;

      return {
        vehicle: {
          ...vehicle,
          acquisitionCost,
        },
        totalDistance: roundNumber(
          tripTotals.distance
        ),
        totalRevenue: roundNumber(
          tripTotals.revenue
        ),
        totalFuelLiters: roundNumber(
          fuel.liters
        ),
        fuelCost: roundNumber(fuel.cost),
        maintenanceCost: roundNumber(
          maintenanceCost
        ),
        otherExpenses: roundNumber(
          otherExpenses
        ),
        operationalCost: roundNumber(
          operationalCost
        ),
        fuelEfficiency: roundNumber(
          fuelEfficiency
        ),
        vehicleROI: roundNumber(roi),
        netProfit: roundNumber(
          tripTotals.revenue -
            operationalCost
        ),
      };
    })
    .sort(
      (first, second) =>
        second.operationalCost -
        first.operationalCost
    )
    .slice(0, limit);
}

module.exports = {
  getDashboardAnalytics,
  getVehicleAnalytics,
  getMonthlyFinancialAnalytics,
  getVehicleCostBreakdown,
};