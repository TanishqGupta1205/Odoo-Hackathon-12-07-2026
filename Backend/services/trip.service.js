const { prisma } = require("../config/db");

const TRIP_STATUSES = [
  "DRAFT",
  "DISPATCHED",
  "COMPLETED",
  "CANCELLED",
];

const ALLOWED_SORT_FIELDS = [
  "source",
  "destination",
  "cargoWeight",
  "plannedDistance",
  "actualDistance",
  "revenue",
  "status",
  "dispatchedAt",
  "completedAt",
  "createdAt",
  "updatedAt",
];

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeStatus(value) {
  if (!value) return null;

  return String(value)
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
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
    return null;
  }

  return Number(value);
}

function formatTrip(trip) {
  if (!trip) return null;

  const formattedTrip = {
    ...trip,
    revenue: decimalToNumber(trip.revenue),
  };

  if (
    trip.vehicle &&
    trip.vehicle.acquisitionCost !== undefined
  ) {
    formattedTrip.vehicle = {
      ...trip.vehicle,
      acquisitionCost: decimalToNumber(
        trip.vehicle.acquisitionCost
      ),
    };
  }

  if (Array.isArray(trip.fuelLogs)) {
    formattedTrip.fuelLogs = trip.fuelLogs.map(
      (fuelLog) => ({
        ...fuelLog,
        cost: decimalToNumber(fuelLog.cost),
      })
    );
  }

  if (Array.isArray(trip.expenses)) {
    formattedTrip.expenses = trip.expenses.map(
      (expense) => ({
        ...expense,
        amount: decimalToNumber(expense.amount),
      })
    );
  }

  return formattedTrip;
}

function handlePrismaError(error) {
  if (error?.statusCode) {
    throw error;
  }

  if (error?.code === "P2025") {
    throw createHttpError(404, "Trip not found.");
  }

  if (error?.code === "P2003") {
    throw createHttpError(
      400,
      "Invalid vehicle or driver reference."
    );
  }

  throw error;
}

async function validateAssignment(
  database,
  vehicleId,
  driverId,
  cargoWeight
) {
  if (!vehicleId) {
    throw createHttpError(
      400,
      "Vehicle ID is required."
    );
  }

  if (!driverId) {
    throw createHttpError(
      400,
      "Driver ID is required."
    );
  }

  const [vehicle, driver] = await Promise.all([
    database.vehicle.findUnique({
      where: {
        id: vehicleId,
      },
      select: {
        id: true,
        registrationNumber: true,
        vehicleName: true,
        maximumLoadCapacity: true,
        odometer: true,
        status: true,
      },
    }),

    database.driver.findUnique({
      where: {
        id: driverId,
      },
      select: {
        id: true,
        name: true,
        licenseNumber: true,
        licenseCategory: true,
        licenseExpiryDate: true,
        safetyScore: true,
        status: true,
      },
    }),
  ]);

  if (!vehicle) {
    throw createHttpError(
      404,
      "Vehicle not found."
    );
  }

  if (!driver) {
    throw createHttpError(
      404,
      "Driver not found."
    );
  }

  if (vehicle.status !== "AVAILABLE") {
    throw createHttpError(
      409,
      `Vehicle is not available. Current status: ${vehicle.status}`
    );
  }

  if (driver.status !== "AVAILABLE") {
    throw createHttpError(
      409,
      `Driver is not available. Current status: ${driver.status}`
    );
  }

  if (driver.licenseExpiryDate <= new Date()) {
    throw createHttpError(
      409,
      "Driver license has expired."
    );
  }

  if (
    Number(cargoWeight) >
    Number(vehicle.maximumLoadCapacity)
  ) {
    throw createHttpError(
      400,
      `Cargo weight cannot exceed vehicle capacity of ${vehicle.maximumLoadCapacity} kg.`
    );
  }

  return {
    vehicle,
    driver,
  };
}

async function getAllTrips(filters = {}) {
  const {
    status,
    vehicleId,
    driverId,
    search,
    from,
    to,
    sortBy = "createdAt",
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

  const normalizedStatus = normalizeStatus(status);

  if (
    normalizedStatus &&
    !TRIP_STATUSES.includes(normalizedStatus)
  ) {
    throw createHttpError(
      400,
      "Invalid trip status. Use DRAFT, DISPATCHED, COMPLETED or CANCELLED."
    );
  }

  const safeSortBy = ALLOWED_SORT_FIELDS.includes(
    sortBy
  )
    ? sortBy
    : "createdAt";

  const safeSortOrder =
    String(sortOrder).toLowerCase() === "asc"
      ? "asc"
      : "desc";

  const where = {};

  if (normalizedStatus) {
    where.status = normalizedStatus;
  }

  if (vehicleId) {
    where.vehicleId = vehicleId;
  }

  if (driverId) {
    where.driverId = driverId;
  }

  if (search && String(search).trim()) {
    const searchValue = String(search).trim();

    where.OR = [
      {
        source: {
          contains: searchValue,
          mode: "insensitive",
        },
      },
      {
        destination: {
          contains: searchValue,
          mode: "insensitive",
        },
      },
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
        driver: {
          is: {
            name: {
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
    where.createdAt = {};

    if (fromDate) {
      where.createdAt.gte = fromDate;
    }

    if (toDate) {
      where.createdAt.lte = toDate;
    }
  }

  const [trips, totalTrips] =
    await prisma.$transaction([
      prisma.trip.findMany({
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
              maximumLoadCapacity: true,
              odometer: true,
              status: true,
            },
          },
          driver: {
            select: {
              id: true,
              name: true,
              licenseNumber: true,
              licenseCategory: true,
              licenseExpiryDate: true,
              safetyScore: true,
              status: true,
            },
          },
        },
      }),

      prisma.trip.count({
        where,
      }),
    ]);

  const totalPages = Math.ceil(
    totalTrips / limit
  );

  return {
    pagination: {
      currentPage: page,
      limit,
      totalTrips,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },

    filters: {
      status: normalizedStatus,
      vehicleId: vehicleId || null,
      driverId: driverId || null,
      search: search || null,
      from: from || null,
      to: to || null,
    },

    trips: trips.map(formatTrip),
  };
}

async function getTripById(id) {
  if (!id) {
    throw createHttpError(
      400,
      "Trip ID is required."
    );
  }

  const trip = await prisma.trip.findUnique({
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
          maximumLoadCapacity: true,
          odometer: true,
          acquisitionCost: true,
          region: true,
          status: true,
        },
      },
      driver: {
        select: {
          id: true,
          name: true,
          licenseNumber: true,
          licenseCategory: true,
          licenseExpiryDate: true,
          contactNumber: true,
          safetyScore: true,
          status: true,
        },
      },
      fuelLogs: {
        orderBy: {
          date: "desc",
        },
      },
      expenses: {
        orderBy: {
          date: "desc",
        },
      },
    },
  });

  if (!trip) {
    throw createHttpError(
      404,
      "Trip not found."
    );
  }

  return formatTrip(trip);
}

async function createTrip(data) {
  try {
    const {
      source,
      destination,
      vehicleId,
      driverId,
      cargoWeight,
      plannedDistance,
      revenue,
    } = data;

    if (
      !source ||
      !destination ||
      !vehicleId ||
      !driverId ||
      cargoWeight === undefined ||
      plannedDistance === undefined
    ) {
      throw createHttpError(
        400,
        "Source, destination, vehicle ID, driver ID, cargo weight and planned distance are required."
      );
    }

    if (
      !String(source).trim() ||
      !String(destination).trim()
    ) {
      throw createHttpError(
        400,
        "Source and destination cannot be empty."
      );
    }

    const parsedCargoWeight =
      parsePositiveNumber(cargoWeight);

    const parsedPlannedDistance =
      parsePositiveNumber(plannedDistance);

    if (parsedCargoWeight === null) {
      throw createHttpError(
        400,
        "Cargo weight must be greater than zero."
      );
    }

    if (parsedPlannedDistance === null) {
      throw createHttpError(
        400,
        "Planned distance must be greater than zero."
      );
    }

    let parsedRevenue = null;

    if (
      revenue !== undefined &&
      revenue !== null &&
      revenue !== ""
    ) {
      parsedRevenue =
        parseNonNegativeNumber(revenue);

      if (parsedRevenue === null) {
        throw createHttpError(
          400,
          "Revenue must be a valid non-negative number."
        );
      }
    }

    const { vehicle } = await validateAssignment(
      prisma,
      vehicleId,
      driverId,
      parsedCargoWeight
    );

    const trip = await prisma.trip.create({
      data: {
        source: String(source).trim(),
        destination:
          String(destination).trim(),
        vehicleId,
        driverId,
        cargoWeight: parsedCargoWeight,
        plannedDistance:
          parsedPlannedDistance,
        initialOdometer:
          Number(vehicle.odometer),
        revenue:
          parsedRevenue === null
            ? null
            : parsedRevenue.toFixed(2),
        status: "DRAFT",
      },
      include: {
        vehicle: true,
        driver: true,
      },
    });

    return formatTrip(trip);
  } catch (error) {
    handlePrismaError(error);
  }
}

async function updateTrip(id, data) {
  try {
    if (!id) {
      throw createHttpError(
        400,
        "Trip ID is required."
      );
    }

    const existingTrip =
      await prisma.trip.findUnique({
        where: {
          id,
        },
      });

    if (!existingTrip) {
      throw createHttpError(
        404,
        "Trip not found."
      );
    }

    if (existingTrip.status !== "DRAFT") {
      throw createHttpError(
        409,
        "Only draft trips can be updated."
      );
    }

    const {
      source,
      destination,
      vehicleId,
      driverId,
      cargoWeight,
      plannedDistance,
      revenue,
    } = data;

    const finalVehicleId =
      vehicleId !== undefined
        ? vehicleId
        : existingTrip.vehicleId;

    const finalDriverId =
      driverId !== undefined
        ? driverId
        : existingTrip.driverId;

    let finalCargoWeight =
      Number(existingTrip.cargoWeight);

    if (cargoWeight !== undefined) {
      finalCargoWeight =
        parsePositiveNumber(cargoWeight);

      if (finalCargoWeight === null) {
        throw createHttpError(
          400,
          "Cargo weight must be greater than zero."
        );
      }
    }

    let finalPlannedDistance =
      Number(existingTrip.plannedDistance);

    if (plannedDistance !== undefined) {
      finalPlannedDistance =
        parsePositiveNumber(plannedDistance);

      if (finalPlannedDistance === null) {
        throw createHttpError(
          400,
          "Planned distance must be greater than zero."
        );
      }
    }

    const requiresAssignmentValidation =
      vehicleId !== undefined ||
      driverId !== undefined ||
      cargoWeight !== undefined;

    let vehicle;

    if (requiresAssignmentValidation) {
      const assignment =
        await validateAssignment(
          prisma,
          finalVehicleId,
          finalDriverId,
          finalCargoWeight
        );

      vehicle = assignment.vehicle;
    }

    const updateData = {};

    if (source !== undefined) {
      if (!String(source).trim()) {
        throw createHttpError(
          400,
          "Source cannot be empty."
        );
      }

      updateData.source =
        String(source).trim();
    }

    if (destination !== undefined) {
      if (!String(destination).trim()) {
        throw createHttpError(
          400,
          "Destination cannot be empty."
        );
      }

      updateData.destination =
        String(destination).trim();
    }

    if (vehicleId !== undefined) {
      updateData.vehicleId = finalVehicleId;
      updateData.initialOdometer = Number(
        vehicle.odometer
      );
    }

    if (driverId !== undefined) {
      updateData.driverId = finalDriverId;
    }

    if (cargoWeight !== undefined) {
      updateData.cargoWeight =
        finalCargoWeight;
    }

    if (plannedDistance !== undefined) {
      updateData.plannedDistance =
        finalPlannedDistance;
    }

    if (revenue !== undefined) {
      if (revenue === null || revenue === "") {
        updateData.revenue = null;
      } else {
        const parsedRevenue =
          parseNonNegativeNumber(revenue);

        if (parsedRevenue === null) {
          throw createHttpError(
            400,
            "Revenue must be a valid non-negative number."
          );
        }

        updateData.revenue =
          parsedRevenue.toFixed(2);
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

    const trip = await prisma.trip.update({
      where: {
        id,
      },
      data: updateData,
      include: {
        vehicle: true,
        driver: true,
      },
    });

    return formatTrip(trip);
  } catch (error) {
    handlePrismaError(error);
  }
}

async function dispatchTrip(id) {
  try {
    if (!id) {
      throw createHttpError(
        400,
        "Trip ID is required."
      );
    }

    const trip = await prisma.$transaction(
      async (transaction) => {
        const existingTrip =
          await transaction.trip.findUnique({
            where: {
              id,
            },
            include: {
              vehicle: true,
              driver: true,
            },
          });

        if (!existingTrip) {
          throw createHttpError(
            404,
            "Trip not found."
          );
        }

        if (
          existingTrip.status !== "DRAFT"
        ) {
          throw createHttpError(
            409,
            "Only draft trips can be dispatched."
          );
        }

        if (
          existingTrip.vehicle.status !==
          "AVAILABLE"
        ) {
          throw createHttpError(
            409,
            `Vehicle is not available. Current status: ${existingTrip.vehicle.status}`
          );
        }

        if (
          existingTrip.driver.status !==
          "AVAILABLE"
        ) {
          throw createHttpError(
            409,
            `Driver is not available. Current status: ${existingTrip.driver.status}`
          );
        }

        const dispatchTime = new Date();

        if (
          existingTrip.driver
            .licenseExpiryDate <= dispatchTime
        ) {
          throw createHttpError(
            409,
            "Driver license has expired."
          );
        }

        if (
          Number(existingTrip.cargoWeight) >
          Number(
            existingTrip.vehicle
              .maximumLoadCapacity
          )
        ) {
          throw createHttpError(
            400,
            `Cargo weight cannot exceed vehicle capacity of ${existingTrip.vehicle.maximumLoadCapacity} kg.`
          );
        }

        const activeAssignment =
          await transaction.trip.findFirst({
            where: {
              id: {
                not: existingTrip.id,
              },
              status: "DISPATCHED",
              OR: [
                {
                  vehicleId:
                    existingTrip.vehicleId,
                },
                {
                  driverId:
                    existingTrip.driverId,
                },
              ],
            },
            select: {
              id: true,
              vehicleId: true,
              driverId: true,
            },
          });

        if (activeAssignment) {
          throw createHttpError(
            409,
            "Vehicle or driver is already assigned to another active trip."
          );
        }

        const vehicleUpdate =
          await transaction.vehicle.updateMany({
            where: {
              id: existingTrip.vehicleId,
              status: "AVAILABLE",
            },
            data: {
              status: "ON_TRIP",
            },
          });

        if (vehicleUpdate.count !== 1) {
          throw createHttpError(
            409,
            "Vehicle is no longer available."
          );
        }

        const driverUpdate =
          await transaction.driver.updateMany({
            where: {
              id: existingTrip.driverId,
              status: "AVAILABLE",
              licenseExpiryDate: {
                gt: dispatchTime,
              },
            },
            data: {
              status: "ON_TRIP",
            },
          });

        if (driverUpdate.count !== 1) {
          throw createHttpError(
            409,
            "Driver is no longer available or license has expired."
          );
        }

        const tripUpdate =
          await transaction.trip.updateMany({
            where: {
              id: existingTrip.id,
              status: "DRAFT",
            },
            data: {
              status: "DISPATCHED",
              dispatchedAt: dispatchTime,
              initialOdometer:
                existingTrip.initialOdometer ??
                Number(
                  existingTrip.vehicle.odometer
                ),
            },
          });

        if (tripUpdate.count !== 1) {
          throw createHttpError(
            409,
            "Trip status changed. Please try again."
          );
        }

        return transaction.trip.findUnique({
          where: {
            id: existingTrip.id,
          },
          include: {
            vehicle: true,
            driver: true,
          },
        });
      }
    );

    return formatTrip(trip);
  } catch (error) {
    handlePrismaError(error);
  }
}

async function completeTrip(id, data) {
  try {
    if (!id) {
      throw createHttpError(
        400,
        "Trip ID is required."
      );
    }

    const {
      finalOdometer,
      revenue,
      fuelConsumed,
      liters,
      fuelCost,
      cost,
      fuelDate,
    } = data;

    const parsedFinalOdometer =
      parseNonNegativeNumber(
        finalOdometer
      );

    if (parsedFinalOdometer === null) {
      throw createHttpError(
        400,
        "Final odometer is required and must be a valid non-negative number."
      );
    }

    let parsedRevenue;

    if (revenue !== undefined) {
      if (revenue === null || revenue === "") {
        parsedRevenue = null;
      } else {
        parsedRevenue =
          parseNonNegativeNumber(revenue);

        if (parsedRevenue === null) {
          throw createHttpError(
            400,
            "Revenue must be a valid non-negative number."
          );
        }
      }
    }

    const requestedLiters =
      fuelConsumed !== undefined
        ? fuelConsumed
        : liters;

    const requestedCost =
      fuelCost !== undefined
        ? fuelCost
        : cost;

    const hasLiters =
      requestedLiters !== undefined &&
      requestedLiters !== null &&
      requestedLiters !== "";

    const hasCost =
      requestedCost !== undefined &&
      requestedCost !== null &&
      requestedCost !== "";

    if (hasLiters !== hasCost) {
      throw createHttpError(
        400,
        "Fuel consumed and fuel cost must both be provided."
      );
    }

    let parsedLiters;
    let parsedFuelCost;

    if (hasLiters && hasCost) {
      parsedLiters =
        parsePositiveNumber(
          requestedLiters
        );

      parsedFuelCost =
        parsePositiveNumber(
          requestedCost
        );

      if (parsedLiters === null) {
        throw createHttpError(
          400,
          "Fuel consumed must be greater than zero."
        );
      }

      if (parsedFuelCost === null) {
        throw createHttpError(
          400,
          "Fuel cost must be greater than zero."
        );
      }
    }

    let parsedFuelDate = new Date();

    if (fuelDate !== undefined) {
      parsedFuelDate =
        parseDate(fuelDate);

      if (!parsedFuelDate) {
        throw createHttpError(
          400,
          "Invalid fuel date."
        );
      }
    }

    const trip = await prisma.$transaction(
      async (transaction) => {
        const existingTrip =
          await transaction.trip.findUnique({
            where: {
              id,
            },
            include: {
              vehicle: true,
              driver: true,
            },
          });

        if (!existingTrip) {
          throw createHttpError(
            404,
            "Trip not found."
          );
        }

        if (
          existingTrip.status !==
          "DISPATCHED"
        ) {
          throw createHttpError(
            409,
            "Only dispatched trips can be completed."
          );
        }

        const initialOdometer = Number(
          existingTrip.initialOdometer ??
            existingTrip.vehicle.odometer
        );

        if (
          parsedFinalOdometer <
          initialOdometer
        ) {
          throw createHttpError(
            400,
            "Final odometer cannot be less than initial odometer."
          );
        }

        const actualDistance =
          parsedFinalOdometer -
          initialOdometer;

        const tripData = {
          status: "COMPLETED",
          finalOdometer:
            parsedFinalOdometer,
          actualDistance,
          completedAt: new Date(),
        };

        if (revenue !== undefined) {
          tripData.revenue =
            parsedRevenue === null
              ? null
              : parsedRevenue.toFixed(2);
        }

        const vehicleUpdate =
          await transaction.vehicle.updateMany({
            where: {
              id: existingTrip.vehicleId,
              status: "ON_TRIP",
            },
            data: {
              status: "AVAILABLE",
              odometer:
                parsedFinalOdometer,
            },
          });

        if (vehicleUpdate.count !== 1) {
          throw createHttpError(
            409,
            "Vehicle status is invalid for completing this trip."
          );
        }

        const driverUpdate =
          await transaction.driver.updateMany({
            where: {
              id: existingTrip.driverId,
              status: "ON_TRIP",
            },
            data: {
              status: "AVAILABLE",
            },
          });

        if (driverUpdate.count !== 1) {
          throw createHttpError(
            409,
            "Driver status is invalid for completing this trip."
          );
        }

        const tripUpdate =
          await transaction.trip.updateMany({
            where: {
              id: existingTrip.id,
              status: "DISPATCHED",
            },
            data: tripData,
          });

        if (tripUpdate.count !== 1) {
          throw createHttpError(
            409,
            "Trip status changed. Please try again."
          );
        }

        if (
          parsedLiters !== undefined &&
          parsedFuelCost !== undefined
        ) {
          await transaction.fuelLog.create({
            data: {
              vehicleId:
                existingTrip.vehicleId,
              tripId:
                existingTrip.id,
              liters: parsedLiters,
              cost:
                parsedFuelCost.toFixed(2),
              date: parsedFuelDate,
              odometerReading:
                parsedFinalOdometer,
            },
          });
        }

        return transaction.trip.findUnique({
          where: {
            id: existingTrip.id,
          },
          include: {
            vehicle: true,
            driver: true,
            fuelLogs: {
              orderBy: {
                date: "desc",
              },
            },
            expenses: {
              orderBy: {
                date: "desc",
              },
            },
          },
        });
      }
    );

    return formatTrip(trip);
  } catch (error) {
    handlePrismaError(error);
  }
}

async function cancelTrip(id) {
  try {
    if (!id) {
      throw createHttpError(
        400,
        "Trip ID is required."
      );
    }

    const trip = await prisma.$transaction(
      async (transaction) => {
        const existingTrip =
          await transaction.trip.findUnique({
            where: {
              id,
            },
            include: {
              vehicle: true,
              driver: true,
            },
          });

        if (!existingTrip) {
          throw createHttpError(
            404,
            "Trip not found."
          );
        }

        if (
          existingTrip.status ===
          "COMPLETED"
        ) {
          throw createHttpError(
            409,
            "Completed trip cannot be cancelled."
          );
        }

        if (
          existingTrip.status ===
          "CANCELLED"
        ) {
          throw createHttpError(
            409,
            "Trip is already cancelled."
          );
        }

        const previousStatus =
          existingTrip.status;

        if (
          previousStatus ===
          "DISPATCHED"
        ) {
          const vehicleUpdate =
            await transaction.vehicle.updateMany({
              where: {
                id:
                  existingTrip.vehicleId,
                status: "ON_TRIP",
              },
              data: {
                status: "AVAILABLE",
              },
            });

          if (
            vehicleUpdate.count !== 1
          ) {
            throw createHttpError(
              409,
              "Vehicle status is invalid for cancelling this trip."
            );
          }

          const driverUpdate =
            await transaction.driver.updateMany({
              where: {
                id:
                  existingTrip.driverId,
                status: "ON_TRIP",
              },
              data: {
                status: "AVAILABLE",
              },
            });

          if (
            driverUpdate.count !== 1
          ) {
            throw createHttpError(
              409,
              "Driver status is invalid for cancelling this trip."
            );
          }
        }

        const tripUpdate =
          await transaction.trip.updateMany({
            where: {
              id: existingTrip.id,
              status: previousStatus,
            },
            data: {
              status: "CANCELLED",
            },
          });

        if (tripUpdate.count !== 1) {
          throw createHttpError(
            409,
            "Trip status changed. Please try again."
          );
        }

        return transaction.trip.findUnique({
          where: {
            id: existingTrip.id,
          },
          include: {
            vehicle: true,
            driver: true,
          },
        });
      }
    );

    return formatTrip(trip);
  } catch (error) {
    handlePrismaError(error);
  }
}

async function deleteTrip(id) {
  try {
    if (!id) {
      throw createHttpError(
        400,
        "Trip ID is required."
      );
    }

    const trip = await prisma.trip.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        source: true,
        destination: true,
        status: true,
        vehicleId: true,
        driverId: true,
      },
    });

    if (!trip) {
      throw createHttpError(
        404,
        "Trip not found."
      );
    }

    if (trip.status !== "DRAFT") {
      throw createHttpError(
        409,
        "Only draft trips can be deleted."
      );
    }

    await prisma.trip.delete({
      where: {
        id,
      },
    });

    return trip;
  } catch (error) {
    handlePrismaError(error);
  }
}

module.exports = {
  getAllTrips,
  getTripById,
  createTrip,
  updateTrip,
  dispatchTrip,
  completeTrip,
  cancelTrip,
  deleteTrip,
};