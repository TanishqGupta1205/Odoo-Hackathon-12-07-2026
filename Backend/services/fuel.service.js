const { prisma } = require("../config/db");

const ALLOWED_SORT_FIELDS = [
  "liters",
  "cost",
  "date",
  "odometerReading",
  "createdAt",
];

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function parsePositiveInteger(value, defaultValue) {
  const parsedValue = Number.parseInt(value, 10);

  if (
    !Number.isInteger(parsedValue) ||
    parsedValue <= 0
  ) {
    return defaultValue;
  }

  return parsedValue;
}

function parsePositiveNumber(value) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    return null;
  }

  return number;
}

function parseNonNegativeNumber(value) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    return null;
  }

  return number;
}

function parseDate(value, endOfDay = false) {
  if (!value) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
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

function decimalToNumber(value) {
  if (value === null || value === undefined) {
    return 0;
  }

  return Number(value);
}

function roundNumber(value, decimalPlaces = 2) {
  const multiplier = 10 ** decimalPlaces;

  return (
    Math.round(
      (Number(value) + Number.EPSILON) *
        multiplier
    ) / multiplier
  );
}

function formatFuelLog(fuelLog) {
  if (!fuelLog) return null;

  return {
    ...fuelLog,
    cost: decimalToNumber(fuelLog.cost),
  };
}

function handlePrismaError(error) {
  if (error?.statusCode) {
    throw error;
  }

  if (error?.code === "P2025") {
    throw createHttpError(
      404,
      "Fuel log not found."
    );
  }

  if (error?.code === "P2003") {
    throw createHttpError(
      400,
      "Invalid vehicle or trip reference."
    );
  }

  throw error;
}

async function validateVehicleAndTrip(
  vehicleId,
  tripId = null
) {
  if (!vehicleId) {
    throw createHttpError(
      400,
      "Vehicle ID is required."
    );
  }

  const vehicle = await prisma.vehicle.findUnique({
    where: {
      id: vehicleId,
    },
    select: {
      id: true,
      registrationNumber: true,
      vehicleName: true,
      type: true,
      odometer: true,
      status: true,
    },
  });

  if (!vehicle) {
    throw createHttpError(
      404,
      "Vehicle not found."
    );
  }

  if (!tripId) {
    return {
      vehicle,
      trip: null,
    };
  }

  const trip = await prisma.trip.findUnique({
    where: {
      id: tripId,
    },
    select: {
      id: true,
      vehicleId: true,
      source: true,
      destination: true,
      status: true,
      plannedDistance: true,
      actualDistance: true,
      initialOdometer: true,
      finalOdometer: true,
    },
  });

  if (!trip) {
    throw createHttpError(
      404,
      "Trip not found."
    );
  }

  if (trip.vehicleId !== vehicleId) {
    throw createHttpError(
      400,
      "Selected trip does not belong to the selected vehicle."
    );
  }

  return {
    vehicle,
    trip,
  };
}

async function getAllFuelLogs(filters = {}) {
  const {
    vehicleId,
    tripId,
    search,
    from,
    to,
    minLiters,
    maxLiters,
    minCost,
    maxCost,
    sortBy = "date",
    sortOrder = "desc",
  } = filters;

  const page = parsePositiveInteger(
    filters.page,
    1
  );

  const requestedLimit = parsePositiveInteger(
    filters.limit,
    10
  );

  const limit = Math.min(requestedLimit, 100);
  const skip = (page - 1) * limit;

  const safeSortBy = ALLOWED_SORT_FIELDS.includes(
    sortBy
  )
    ? sortBy
    : "date";

  const safeSortOrder =
    String(sortOrder).toLowerCase() === "asc"
      ? "asc"
      : "desc";

  const where = {};

  if (vehicleId) {
    where.vehicleId = vehicleId;
  }

  if (tripId) {
    where.tripId = tripId;
  }

  if (search && String(search).trim()) {
    const searchValue = String(search).trim();

    where.OR = [
      {
        vehicle: {
          is: {
            registrationNumber: {
              contains: searchValue,
              mode: "insensitive",
            },
          },
        },
      },
      {
        vehicle: {
          is: {
            vehicleName: {
              contains: searchValue,
              mode: "insensitive",
            },
          },
        },
      },
      {
        trip: {
          is: {
            source: {
              contains: searchValue,
              mode: "insensitive",
            },
          },
        },
      },
      {
        trip: {
          is: {
            destination: {
              contains: searchValue,
              mode: "insensitive",
            },
          },
        },
      },
    ];
  }

  const fromDate = parseDate(from);
  const toDate = parseDate(to, true);

  if (from && !fromDate) {
    throw createHttpError(
      400,
      "Invalid from date."
    );
  }

  if (to && !toDate) {
    throw createHttpError(
      400,
      "Invalid to date."
    );
  }

  if (
    fromDate &&
    toDate &&
    fromDate > toDate
  ) {
    throw createHttpError(
      400,
      "From date cannot be greater than to date."
    );
  }

  if (fromDate || toDate) {
    where.date = {};

    if (fromDate) {
      where.date.gte = fromDate;
    }

    if (toDate) {
      where.date.lte = toDate;
    }
  }

  if (
    minLiters !== undefined ||
    maxLiters !== undefined
  ) {
    where.liters = {};

    if (minLiters !== undefined) {
      const parsedMinLiters =
        parseNonNegativeNumber(minLiters);

      if (parsedMinLiters === null) {
        throw createHttpError(
          400,
          "Minimum liters must be a valid non-negative number."
        );
      }

      where.liters.gte = parsedMinLiters;
    }

    if (maxLiters !== undefined) {
      const parsedMaxLiters =
        parseNonNegativeNumber(maxLiters);

      if (parsedMaxLiters === null) {
        throw createHttpError(
          400,
          "Maximum liters must be a valid non-negative number."
        );
      }

      where.liters.lte = parsedMaxLiters;
    }

    if (
      minLiters !== undefined &&
      maxLiters !== undefined &&
      Number(minLiters) > Number(maxLiters)
    ) {
      throw createHttpError(
        400,
        "Minimum liters cannot be greater than maximum liters."
      );
    }
  }

  if (
    minCost !== undefined ||
    maxCost !== undefined
  ) {
    where.cost = {};

    if (minCost !== undefined) {
      const parsedMinCost =
        parseNonNegativeNumber(minCost);

      if (parsedMinCost === null) {
        throw createHttpError(
          400,
          "Minimum cost must be a valid non-negative number."
        );
      }

      where.cost.gte =
        parsedMinCost.toFixed(2);
    }

    if (maxCost !== undefined) {
      const parsedMaxCost =
        parseNonNegativeNumber(maxCost);

      if (parsedMaxCost === null) {
        throw createHttpError(
          400,
          "Maximum cost must be a valid non-negative number."
        );
      }

      where.cost.lte =
        parsedMaxCost.toFixed(2);
    }

    if (
      minCost !== undefined &&
      maxCost !== undefined &&
      Number(minCost) > Number(maxCost)
    ) {
      throw createHttpError(
        400,
        "Minimum cost cannot be greater than maximum cost."
      );
    }
  }

  const [
    fuelLogs,
    totalFuelLogs,
    fuelAggregate,
  ] = await prisma.$transaction([
    prisma.fuelLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: {
        [safeSortBy]: safeSortOrder,
      },
      include: {
        vehicle: {
          select: {
            id: true,
            registrationNumber: true,
            vehicleName: true,
            model: true,
            type: true,
            odometer: true,
            status: true,
          },
        },
        trip: {
          select: {
            id: true,
            source: true,
            destination: true,
            status: true,
            plannedDistance: true,
            actualDistance: true,
          },
        },
      },
    }),

    prisma.fuelLog.count({
      where,
    }),

    prisma.fuelLog.aggregate({
      where,
      _sum: {
        liters: true,
        cost: true,
      },
      _avg: {
        liters: true,
        cost: true,
      },
      _min: {
        liters: true,
        cost: true,
      },
      _max: {
        liters: true,
        cost: true,
      },
    }),
  ]);

  const totalPages = Math.ceil(
    totalFuelLogs / limit
  );

  return {
    pagination: {
      currentPage: page,
      limit,
      totalFuelLogs,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },

    filters: {
      vehicleId: vehicleId || null,
      tripId: tripId || null,
      search: search || null,
      from: from || null,
      to: to || null,
      minLiters: minLiters || null,
      maxLiters: maxLiters || null,
      minCost: minCost || null,
      maxCost: maxCost || null,
    },

    summary: {
      totalLiters: roundNumber(
        fuelAggregate._sum.liters || 0
      ),
      totalCost: roundNumber(
        decimalToNumber(
          fuelAggregate._sum.cost
        )
      ),
      averageLiters: roundNumber(
        fuelAggregate._avg.liters || 0
      ),
      averageCost: roundNumber(
        decimalToNumber(
          fuelAggregate._avg.cost
        )
      ),
      minimumLiters: roundNumber(
        fuelAggregate._min.liters || 0
      ),
      maximumLiters: roundNumber(
        fuelAggregate._max.liters || 0
      ),
      minimumCost: roundNumber(
        decimalToNumber(
          fuelAggregate._min.cost
        )
      ),
      maximumCost: roundNumber(
        decimalToNumber(
          fuelAggregate._max.cost
        )
      ),
    },

    fuelLogs: fuelLogs.map(formatFuelLog),
  };
}

async function getFuelLogById(id) {
  if (!id) {
    throw createHttpError(
      400,
      "Fuel log ID is required."
    );
  }

  const fuelLog =
    await prisma.fuelLog.findUnique({
      where: {
        id,
      },
      include: {
        vehicle: {
          select: {
            id: true,
            registrationNumber: true,
            vehicleName: true,
            model: true,
            type: true,
            odometer: true,
            status: true,
          },
        },
        trip: {
          select: {
            id: true,
            source: true,
            destination: true,
            status: true,
            plannedDistance: true,
            actualDistance: true,
            initialOdometer: true,
            finalOdometer: true,
            dispatchedAt: true,
            completedAt: true,
          },
        },
      },
    });

  if (!fuelLog) {
    throw createHttpError(
      404,
      "Fuel log not found."
    );
  }

  const tripDistance = fuelLog.trip
    ? Number(
        fuelLog.trip.actualDistance ??
          fuelLog.trip.plannedDistance ??
          0
      )
    : 0;

  const fuelEfficiency =
    fuelLog.liters > 0
      ? tripDistance / fuelLog.liters
      : 0;

  return {
    ...formatFuelLog(fuelLog),
    tripDistance: roundNumber(tripDistance),
    fuelEfficiency: roundNumber(
      fuelEfficiency
    ),
    fuelEfficiencyUnit: "km/liter",
  };
}

async function createFuelLog(data) {
  try {
    const {
      vehicleId,
      tripId,
      liters,
      cost,
      date,
      odometerReading,
    } = data;

    if (
      !vehicleId ||
      liters === undefined ||
      cost === undefined
    ) {
      throw createHttpError(
        400,
        "Vehicle ID, liters and cost are required."
      );
    }

    const parsedLiters =
      parsePositiveNumber(liters);

    if (parsedLiters === null) {
      throw createHttpError(
        400,
        "Liters must be greater than zero."
      );
    }

    const parsedCost =
      parsePositiveNumber(cost);

    if (parsedCost === null) {
      throw createHttpError(
        400,
        "Fuel cost must be greater than zero."
      );
    }

    let parsedDate = new Date();

    if (date !== undefined) {
      parsedDate = parseDate(date);

      if (!parsedDate) {
        throw createHttpError(
          400,
          "Invalid fuel log date."
        );
      }
    }

    let parsedOdometer;

    if (odometerReading !== undefined) {
      parsedOdometer =
        parseNonNegativeNumber(
          odometerReading
        );

      if (parsedOdometer === null) {
        throw createHttpError(
          400,
          "Odometer reading must be a valid non-negative number."
        );
      }
    }

    const { vehicle } =
      await validateVehicleAndTrip(
        vehicleId,
        tripId || null
      );

    if (
      parsedOdometer !== undefined &&
      parsedOdometer <
        Number(vehicle.odometer)
    ) {
      throw createHttpError(
        400,
        "Odometer reading cannot be less than the current vehicle odometer."
      );
    }

    const fuelLog =
      await prisma.$transaction(
        async (transaction) => {
          const createdFuelLog =
            await transaction.fuelLog.create({
              data: {
                vehicleId,
                tripId: tripId || null,
                liters: parsedLiters,
                cost: parsedCost.toFixed(2),
                date: parsedDate,
                odometerReading:
                  parsedOdometer !== undefined
                    ? parsedOdometer
                    : null,
              },
              include: {
                vehicle: {
                  select: {
                    id: true,
                    registrationNumber: true,
                    vehicleName: true,
                    odometer: true,
                    status: true,
                  },
                },
                trip: {
                  select: {
                    id: true,
                    source: true,
                    destination: true,
                    status: true,
                    plannedDistance: true,
                    actualDistance: true,
                  },
                },
              },
            });

          if (parsedOdometer !== undefined) {
            await transaction.vehicle.update({
              where: {
                id: vehicleId,
              },
              data: {
                odometer: parsedOdometer,
              },
            });
          }

          return createdFuelLog;
        }
      );

    return formatFuelLog(fuelLog);
  } catch (error) {
    handlePrismaError(error);
  }
}

async function updateFuelLog(id, data) {
  try {
    if (!id) {
      throw createHttpError(
        400,
        "Fuel log ID is required."
      );
    }

    const existingFuelLog =
      await prisma.fuelLog.findUnique({
        where: {
          id,
        },
      });

    if (!existingFuelLog) {
      throw createHttpError(
        404,
        "Fuel log not found."
      );
    }

    const {
      vehicleId,
      tripId,
      liters,
      cost,
      date,
      odometerReading,
    } = data;

    const finalVehicleId =
      vehicleId !== undefined
        ? vehicleId
        : existingFuelLog.vehicleId;

    const finalTripId =
      tripId !== undefined
        ? tripId || null
        : existingFuelLog.tripId;

    const updateData = {};

    let validation;

    if (
      vehicleId !== undefined ||
      tripId !== undefined ||
      odometerReading !== undefined
    ) {
      validation =
        await validateVehicleAndTrip(
          finalVehicleId,
          finalTripId
        );
    }

    if (
      vehicleId !== undefined ||
      tripId !== undefined
    ) {
      updateData.vehicleId = finalVehicleId;
      updateData.tripId = finalTripId;
    }

    if (liters !== undefined) {
      const parsedLiters =
        parsePositiveNumber(liters);

      if (parsedLiters === null) {
        throw createHttpError(
          400,
          "Liters must be greater than zero."
        );
      }

      updateData.liters = parsedLiters;
    }

    if (cost !== undefined) {
      const parsedCost =
        parsePositiveNumber(cost);

      if (parsedCost === null) {
        throw createHttpError(
          400,
          "Fuel cost must be greater than zero."
        );
      }

      updateData.cost =
        parsedCost.toFixed(2);
    }

    if (date !== undefined) {
      const parsedDate = parseDate(date);

      if (!parsedDate) {
        throw createHttpError(
          400,
          "Invalid fuel log date."
        );
      }

      updateData.date = parsedDate;
    }

    let parsedOdometer;

    if (odometerReading !== undefined) {
      if (
        odometerReading === null ||
        odometerReading === ""
      ) {
        updateData.odometerReading = null;
      } else {
        parsedOdometer =
          parseNonNegativeNumber(
            odometerReading
          );

        if (parsedOdometer === null) {
          throw createHttpError(
            400,
            "Odometer reading must be a valid non-negative number."
          );
        }

        if (
          parsedOdometer <
          Number(validation.vehicle.odometer)
        ) {
          throw createHttpError(
            400,
            "Odometer reading cannot be less than the current vehicle odometer."
          );
        }

        updateData.odometerReading =
          parsedOdometer;
      }
    }

    if (
      Object.keys(updateData).length === 0
    ) {
      throw createHttpError(
        400,
        "Provide at least one field to update."
      );
    }

    const fuelLog =
      await prisma.$transaction(
        async (transaction) => {
          const updatedFuelLog =
            await transaction.fuelLog.update({
              where: {
                id,
              },
              data: updateData,
              include: {
                vehicle: {
                  select: {
                    id: true,
                    registrationNumber: true,
                    vehicleName: true,
                    odometer: true,
                    status: true,
                  },
                },
                trip: {
                  select: {
                    id: true,
                    source: true,
                    destination: true,
                    status: true,
                    plannedDistance: true,
                    actualDistance: true,
                  },
                },
              },
            });

          if (parsedOdometer !== undefined) {
            await transaction.vehicle.update({
              where: {
                id: finalVehicleId,
              },
              data: {
                odometer: parsedOdometer,
              },
            });
          }

          return updatedFuelLog;
        }
      );

    return formatFuelLog(fuelLog);
  } catch (error) {
    handlePrismaError(error);
  }
}

async function deleteFuelLog(id) {
  try {
    if (!id) {
      throw createHttpError(
        400,
        "Fuel log ID is required."
      );
    }

    const fuelLog =
      await prisma.fuelLog.findUnique({
        where: {
          id,
        },
        select: {
          id: true,
          vehicleId: true,
          tripId: true,
          liters: true,
          cost: true,
          date: true,
          odometerReading: true,
        },
      });

    if (!fuelLog) {
      throw createHttpError(
        404,
        "Fuel log not found."
      );
    }

    await prisma.fuelLog.delete({
      where: {
        id,
      },
    });

    return formatFuelLog(fuelLog);
  } catch (error) {
    handlePrismaError(error);
  }
}

async function getFuelSummary(filters = {}) {
  const {
    vehicleId,
    tripId,
    from,
    to,
  } = filters;

  const fuelWhere = {};

  if (vehicleId) {
    fuelWhere.vehicleId = vehicleId;
  }

  if (tripId) {
    fuelWhere.tripId = tripId;
  }

  const fromDate = parseDate(from);
  const toDate = parseDate(to, true);

  if (from && !fromDate) {
    throw createHttpError(
      400,
      "Invalid from date."
    );
  }

  if (to && !toDate) {
    throw createHttpError(
      400,
      "Invalid to date."
    );
  }

  if (
    fromDate &&
    toDate &&
    fromDate > toDate
  ) {
    throw createHttpError(
      400,
      "From date cannot be greater than to date."
    );
  }

  if (fromDate || toDate) {
    fuelWhere.date = {};

    if (fromDate) {
      fuelWhere.date.gte = fromDate;
    }

    if (toDate) {
      fuelWhere.date.lte = toDate;
    }
  }

  const tripWhere = {
    status: "COMPLETED",
  };

  if (vehicleId) {
    tripWhere.vehicleId = vehicleId;
  }

  if (tripId) {
    tripWhere.id = tripId;
  }

  if (fromDate || toDate) {
    tripWhere.completedAt = {};

    if (fromDate) {
      tripWhere.completedAt.gte = fromDate;
    }

    if (toDate) {
      tripWhere.completedAt.lte = toDate;
    }
  }

  const [
    aggregate,
    completedTrips,
    vehicleGroups,
  ] = await Promise.all([
    prisma.fuelLog.aggregate({
      where: fuelWhere,
      _count: {
        _all: true,
      },
      _sum: {
        liters: true,
        cost: true,
      },
      _avg: {
        liters: true,
        cost: true,
      },
      _min: {
        liters: true,
        cost: true,
      },
      _max: {
        liters: true,
        cost: true,
      },
    }),

    prisma.trip.findMany({
      where: tripWhere,
      select: {
        id: true,
        plannedDistance: true,
        actualDistance: true,
      },
    }),

    prisma.fuelLog.groupBy({
      by: ["vehicleId"],
      where: fuelWhere,
      _count: {
        _all: true,
      },
      _sum: {
        liters: true,
        cost: true,
      },
      orderBy: {
        _sum: {
          cost: "desc",
        },
      },
    }),
  ]);

  let totalDistance = 0;

  completedTrips.forEach((trip) => {
    totalDistance += Number(
      trip.actualDistance ??
        trip.plannedDistance ??
        0
    );
  });

  const totalLiters = Number(
    aggregate._sum.liters || 0
  );

  const totalCost = decimalToNumber(
    aggregate._sum.cost
  );

  const fuelEfficiency =
    totalLiters > 0
      ? totalDistance / totalLiters
      : 0;

  const vehicleIds = vehicleGroups.map(
    (item) => item.vehicleId
  );

  const vehicles =
    vehicleIds.length > 0
      ? await prisma.vehicle.findMany({
          where: {
            id: {
              in: vehicleIds,
            },
          },
          select: {
            id: true,
            registrationNumber: true,
            vehicleName: true,
            type: true,
            status: true,
          },
        })
      : [];

  const vehicleMap = new Map(
    vehicles.map((vehicle) => [
      vehicle.id,
      vehicle,
    ])
  );

  return {
    filters: {
      vehicleId: vehicleId || null,
      tripId: tripId || null,
      from: from || null,
      to: to || null,
    },

    summary: {
      totalFuelLogs: aggregate._count._all,
      totalDistance: roundNumber(
        totalDistance
      ),
      totalLiters: roundNumber(totalLiters),
      totalCost: roundNumber(totalCost),
      averageLiters: roundNumber(
        aggregate._avg.liters || 0
      ),
      averageCost: roundNumber(
        decimalToNumber(
          aggregate._avg.cost
        )
      ),
      minimumLiters: roundNumber(
        aggregate._min.liters || 0
      ),
      maximumLiters: roundNumber(
        aggregate._max.liters || 0
      ),
      minimumCost: roundNumber(
        decimalToNumber(
          aggregate._min.cost
        )
      ),
      maximumCost: roundNumber(
        decimalToNumber(
          aggregate._max.cost
        )
      ),
      fuelEfficiency: roundNumber(
        fuelEfficiency
      ),
      fuelEfficiencyUnit: "km/liter",
    },

    vehicleFuelDistribution:
      vehicleGroups.map((item) => ({
        vehicle:
          vehicleMap.get(item.vehicleId) || {
            id: item.vehicleId,
          },
        totalFuelLogs: item._count._all,
        totalLiters: roundNumber(
          item._sum.liters || 0
        ),
        totalCost: roundNumber(
          decimalToNumber(item._sum.cost)
        ),
      })),
  };
}

module.exports = {
  getAllFuelLogs,
  getFuelLogById,
  createFuelLog,
  updateFuelLog,
  deleteFuelLog,
  getFuelSummary,
};