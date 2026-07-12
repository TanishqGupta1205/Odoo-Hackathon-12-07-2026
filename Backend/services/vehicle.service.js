const { prisma } = require("../config/db");

const VEHICLE_STATUSES = [
  "AVAILABLE",
  "ON_TRIP",
  "IN_SHOP",
  "RETIRED",
];

const ALLOWED_SORT_FIELDS = [
  "registrationNumber",
  "vehicleName",
  "model",
  "type",
  "maximumLoadCapacity",
  "odometer",
  "acquisitionCost",
  "region",
  "status",
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

function normalizeRegistrationNumber(value) {
  if (!value) return null;

  return String(value)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
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

function formatVehicle(vehicle) {
  if (!vehicle) return null;

  const formattedVehicle = {
    ...vehicle,
    acquisitionCost: decimalToNumber(
      vehicle.acquisitionCost
    ),
  };

  if (Array.isArray(vehicle.trips)) {
    formattedVehicle.trips = vehicle.trips.map(
      (trip) => ({
        ...trip,
        revenue:
          trip.revenue === null ||
          trip.revenue === undefined
            ? null
            : decimalToNumber(trip.revenue),
      })
    );
  }

  if (Array.isArray(vehicle.maintenanceLogs)) {
    formattedVehicle.maintenanceLogs =
      vehicle.maintenanceLogs.map(
        (maintenance) => ({
          ...maintenance,
          cost: decimalToNumber(
            maintenance.cost
          ),
        })
      );
  }

  if (Array.isArray(vehicle.fuelLogs)) {
    formattedVehicle.fuelLogs =
      vehicle.fuelLogs.map((fuelLog) => ({
        ...fuelLog,
        cost: decimalToNumber(fuelLog.cost),
      }));
  }

  if (Array.isArray(vehicle.expenses)) {
    formattedVehicle.expenses =
      vehicle.expenses.map((expense) => ({
        ...expense,
        amount: decimalToNumber(
          expense.amount
        ),
      }));
  }

  return formattedVehicle;
}

function handlePrismaError(error) {
  if (error?.statusCode) {
    throw error;
  }

  if (error?.code === "P2002") {
    throw createHttpError(
      409,
      "Vehicle registration number already exists."
    );
  }

  if (error?.code === "P2025") {
    throw createHttpError(
      404,
      "Vehicle not found."
    );
  }

  if (
    error?.code === "P2003" ||
    error?.code === "P2014"
  ) {
    throw createHttpError(
      409,
      "Vehicle is connected to existing operational records."
    );
  }

  if (error?.code === "P2034") {
    throw createHttpError(
      409,
      "Database transaction conflict. Please try again."
    );
  }

  throw error;
}

async function getAllVehicles(filters = {}) {
  const {
    search,
    status,
    type,
    region,
    minCapacity,
    maxCapacity,
    minOdometer,
    maxOdometer,
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

  const normalizedStatus =
    normalizeStatus(status);

  if (
    normalizedStatus &&
    !VEHICLE_STATUSES.includes(normalizedStatus)
  ) {
    throw createHttpError(
      400,
      "Invalid vehicle status. Use AVAILABLE, ON_TRIP, IN_SHOP or RETIRED."
    );
  }

  const safeSortBy =
    ALLOWED_SORT_FIELDS.includes(sortBy)
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

  if (type && String(type).trim()) {
    where.type = {
      equals: String(type).trim(),
      mode: "insensitive",
    };
  }

  if (region && String(region).trim()) {
    where.region = {
      equals: String(region).trim(),
      mode: "insensitive",
    };
  }

  if (search && String(search).trim()) {
    const searchValue = String(search).trim();

    where.OR = [
      {
        registrationNumber: {
          contains: searchValue,
          mode: "insensitive",
        },
      },
      {
        vehicleName: {
          contains: searchValue,
          mode: "insensitive",
        },
      },
      {
        model: {
          contains: searchValue,
          mode: "insensitive",
        },
      },
      {
        type: {
          contains: searchValue,
          mode: "insensitive",
        },
      },
      {
        region: {
          contains: searchValue,
          mode: "insensitive",
        },
      },
    ];
  }

  if (
    minCapacity !== undefined ||
    maxCapacity !== undefined
  ) {
    where.maximumLoadCapacity = {};

    if (minCapacity !== undefined) {
      const parsedMinCapacity =
        parseNonNegativeNumber(minCapacity);

      if (parsedMinCapacity === null) {
        throw createHttpError(
          400,
          "Minimum capacity must be a valid non-negative number."
        );
      }

      where.maximumLoadCapacity.gte =
        parsedMinCapacity;
    }

    if (maxCapacity !== undefined) {
      const parsedMaxCapacity =
        parseNonNegativeNumber(maxCapacity);

      if (parsedMaxCapacity === null) {
        throw createHttpError(
          400,
          "Maximum capacity must be a valid non-negative number."
        );
      }

      where.maximumLoadCapacity.lte =
        parsedMaxCapacity;
    }

    if (
      minCapacity !== undefined &&
      maxCapacity !== undefined &&
      Number(minCapacity) > Number(maxCapacity)
    ) {
      throw createHttpError(
        400,
        "Minimum capacity cannot be greater than maximum capacity."
      );
    }
  }

  if (
    minOdometer !== undefined ||
    maxOdometer !== undefined
  ) {
    where.odometer = {};

    if (minOdometer !== undefined) {
      const parsedMinOdometer =
        parseNonNegativeNumber(minOdometer);

      if (parsedMinOdometer === null) {
        throw createHttpError(
          400,
          "Minimum odometer must be a valid non-negative number."
        );
      }

      where.odometer.gte =
        parsedMinOdometer;
    }

    if (maxOdometer !== undefined) {
      const parsedMaxOdometer =
        parseNonNegativeNumber(maxOdometer);

      if (parsedMaxOdometer === null) {
        throw createHttpError(
          400,
          "Maximum odometer must be a valid non-negative number."
        );
      }

      where.odometer.lte =
        parsedMaxOdometer;
    }

    if (
      minOdometer !== undefined &&
      maxOdometer !== undefined &&
      Number(minOdometer) > Number(maxOdometer)
    ) {
      throw createHttpError(
        400,
        "Minimum odometer cannot be greater than maximum odometer."
      );
    }
  }

  const [
    vehicles,
    totalVehicles,
    aggregate,
  ] = await prisma.$transaction([
    prisma.vehicle.findMany({
      where,
      skip,
      take: limit,
      orderBy: {
        [safeSortBy]: safeSortOrder,
      },
      include: {
        _count: {
          select: {
            trips: true,
            maintenanceLogs: true,
            fuelLogs: true,
            expenses: true,
          },
        },
      },
    }),

    prisma.vehicle.count({
      where,
    }),

    prisma.vehicle.aggregate({
      where,
      _sum: {
        acquisitionCost: true,
        maximumLoadCapacity: true,
      },
      _avg: {
        acquisitionCost: true,
        maximumLoadCapacity: true,
        odometer: true,
      },
    }),
  ]);

  const totalPages = Math.ceil(
    totalVehicles / limit
  );

  return {
    pagination: {
      currentPage: page,
      limit,
      totalVehicles,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },

    filters: {
      search: search || null,
      status: normalizedStatus,
      type: type || null,
      region: region || null,
      minCapacity: minCapacity || null,
      maxCapacity: maxCapacity || null,
      minOdometer: minOdometer || null,
      maxOdometer: maxOdometer || null,
    },

    summary: {
      totalAcquisitionCost: roundNumber(
        decimalToNumber(
          aggregate._sum.acquisitionCost
        )
      ),
      totalLoadCapacity: roundNumber(
        aggregate._sum.maximumLoadCapacity || 0
      ),
      averageAcquisitionCost: roundNumber(
        decimalToNumber(
          aggregate._avg.acquisitionCost
        )
      ),
      averageLoadCapacity: roundNumber(
        aggregate._avg.maximumLoadCapacity || 0
      ),
      averageOdometer: roundNumber(
        aggregate._avg.odometer || 0
      ),
    },

    vehicles: vehicles.map(formatVehicle),
  };
}

async function getAvailableVehicles(
  filters = {}
) {
  const {
    cargoWeight,
    type,
    region,
    search,
  } = filters;

  const where = {
    status: "AVAILABLE",
  };

  if (
    cargoWeight !== undefined &&
    cargoWeight !== ""
  ) {
    const parsedCargoWeight =
      parsePositiveNumber(cargoWeight);

    if (parsedCargoWeight === null) {
      throw createHttpError(
        400,
        "Cargo weight must be greater than zero."
      );
    }

    where.maximumLoadCapacity = {
      gte: parsedCargoWeight,
    };
  }

  if (type && String(type).trim()) {
    where.type = {
      equals: String(type).trim(),
      mode: "insensitive",
    };
  }

  if (region && String(region).trim()) {
    where.region = {
      equals: String(region).trim(),
      mode: "insensitive",
    };
  }

  if (search && String(search).trim()) {
    const searchValue = String(search).trim();

    where.OR = [
      {
        registrationNumber: {
          contains: searchValue,
          mode: "insensitive",
        },
      },
      {
        vehicleName: {
          contains: searchValue,
          mode: "insensitive",
        },
      },
      {
        model: {
          contains: searchValue,
          mode: "insensitive",
        },
      },
    ];
  }

  const vehicles =
    await prisma.vehicle.findMany({
      where,
      orderBy: [
        {
          maximumLoadCapacity: "asc",
        },
        {
          vehicleName: "asc",
        },
      ],
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
        createdAt: true,
        updatedAt: true,
      },
    });

  return vehicles.map(formatVehicle);
}

async function getVehicleById(id) {
  if (!id) {
    throw createHttpError(
      400,
      "Vehicle ID is required."
    );
  }

  const vehicle =
    await prisma.vehicle.findUnique({
      where: {
        id,
      },
      include: {
        trips: {
          take: 10,
          orderBy: {
            createdAt: "desc",
          },
          include: {
            driver: {
              select: {
                id: true,
                name: true,
                licenseNumber: true,
                licenseCategory: true,
                licenseExpiryDate: true,
                status: true,
              },
            },
          },
        },

        maintenanceLogs: {
          take: 10,
          orderBy: {
            startDate: "desc",
          },
        },

        fuelLogs: {
          take: 10,
          orderBy: {
            date: "desc",
          },
        },

        expenses: {
          take: 10,
          orderBy: {
            date: "desc",
          },
        },

        _count: {
          select: {
            trips: true,
            maintenanceLogs: true,
            fuelLogs: true,
            expenses: true,
          },
        },
      },
    });

  if (!vehicle) {
    throw createHttpError(
      404,
      "Vehicle not found."
    );
  }

  return formatVehicle(vehicle);
}

async function createVehicle(data) {
  try {
    const {
      registrationNumber,
      vehicleName,
      model,
      type,
      maximumLoadCapacity,
      odometer,
      acquisitionCost,
      region,
      status,
    } = data;

    if (
      !registrationNumber ||
      !vehicleName ||
      !type ||
      maximumLoadCapacity === undefined ||
      acquisitionCost === undefined
    ) {
      throw createHttpError(
        400,
        "Registration number, vehicle name, type, maximum load capacity and acquisition cost are required."
      );
    }

    if (
      !String(registrationNumber).trim() ||
      !String(vehicleName).trim() ||
      !String(type).trim()
    ) {
      throw createHttpError(
        400,
        "Required vehicle fields cannot be empty."
      );
    }

    const parsedCapacity =
      parsePositiveNumber(
        maximumLoadCapacity
      );

    if (parsedCapacity === null) {
      throw createHttpError(
        400,
        "Maximum load capacity must be greater than zero."
      );
    }

    const parsedAcquisitionCost =
      parseNonNegativeNumber(
        acquisitionCost
      );

    if (parsedAcquisitionCost === null) {
      throw createHttpError(
        400,
        "Acquisition cost must be a valid non-negative number."
      );
    }

    const parsedOdometer =
      odometer === undefined
        ? 0
        : parseNonNegativeNumber(odometer);

    if (parsedOdometer === null) {
      throw createHttpError(
        400,
        "Odometer must be a valid non-negative number."
      );
    }

    const normalizedStatus =
      normalizeStatus(status) || "AVAILABLE";

    if (
      !["AVAILABLE", "RETIRED"].includes(
        normalizedStatus
      )
    ) {
      throw createHttpError(
        400,
        "New vehicle status can only be AVAILABLE or RETIRED."
      );
    }

    const normalizedRegistrationNumber =
      normalizeRegistrationNumber(
        registrationNumber
      );

    const existingVehicle =
      await prisma.vehicle.findUnique({
        where: {
          registrationNumber:
            normalizedRegistrationNumber,
        },
        select: {
          id: true,
        },
      });

    if (existingVehicle) {
      throw createHttpError(
        409,
        "Vehicle registration number already exists."
      );
    }

    const vehicle =
      await prisma.vehicle.create({
        data: {
          registrationNumber:
            normalizedRegistrationNumber,
          vehicleName:
            String(vehicleName).trim(),
          model: model
            ? String(model).trim()
            : null,
          type: String(type).trim(),
          maximumLoadCapacity:
            parsedCapacity,
          odometer: parsedOdometer,
          acquisitionCost:
            parsedAcquisitionCost.toFixed(2),
          region: region
            ? String(region).trim()
            : null,
          status: normalizedStatus,
        },
      });

    return formatVehicle(vehicle);
  } catch (error) {
    handlePrismaError(error);
  }
}

async function updateVehicle(id, data) {
  try {
    if (!id) {
      throw createHttpError(
        400,
        "Vehicle ID is required."
      );
    }

    const existingVehicle =
      await prisma.vehicle.findUnique({
        where: {
          id,
        },
      });

    if (!existingVehicle) {
      throw createHttpError(
        404,
        "Vehicle not found."
      );
    }

    const {
      registrationNumber,
      vehicleName,
      model,
      type,
      maximumLoadCapacity,
      odometer,
      acquisitionCost,
      region,
      status,
    } = data;

    const updateData = {};

    if (registrationNumber !== undefined) {
      if (!String(registrationNumber).trim()) {
        throw createHttpError(
          400,
          "Registration number cannot be empty."
        );
      }

      updateData.registrationNumber =
        normalizeRegistrationNumber(
          registrationNumber
        );
    }

    if (vehicleName !== undefined) {
      if (!String(vehicleName).trim()) {
        throw createHttpError(
          400,
          "Vehicle name cannot be empty."
        );
      }

      updateData.vehicleName =
        String(vehicleName).trim();
    }

    if (model !== undefined) {
      updateData.model = model
        ? String(model).trim()
        : null;
    }

    if (type !== undefined) {
      if (!String(type).trim()) {
        throw createHttpError(
          400,
          "Vehicle type cannot be empty."
        );
      }

      updateData.type =
        String(type).trim();
    }

    if (
      maximumLoadCapacity !== undefined
    ) {
      const parsedCapacity =
        parsePositiveNumber(
          maximumLoadCapacity
        );

      if (parsedCapacity === null) {
        throw createHttpError(
          400,
          "Maximum load capacity must be greater than zero."
        );
      }

      const incompatibleTrip =
        await prisma.trip.findFirst({
          where: {
            vehicleId: id,
            status: {
              in: ["DRAFT", "DISPATCHED"],
            },
            cargoWeight: {
              gt: parsedCapacity,
            },
          },
          select: {
            id: true,
            cargoWeight: true,
            status: true,
          },
        });

      if (incompatibleTrip) {
        throw createHttpError(
          409,
          `Vehicle capacity cannot be reduced because trip ${incompatibleTrip.id} has cargo weight ${incompatibleTrip.cargoWeight} kg.`
        );
      }

      updateData.maximumLoadCapacity =
        parsedCapacity;
    }

    if (odometer !== undefined) {
      const parsedOdometer =
        parseNonNegativeNumber(odometer);

      if (parsedOdometer === null) {
        throw createHttpError(
          400,
          "Odometer must be a valid non-negative number."
        );
      }

      if (
        parsedOdometer <
        Number(existingVehicle.odometer)
      ) {
        throw createHttpError(
          400,
          "Odometer cannot be less than the current odometer."
        );
      }

      if (
        existingVehicle.status === "ON_TRIP"
      ) {
        throw createHttpError(
          409,
          "Odometer cannot be changed manually while the vehicle is on a trip."
        );
      }

      updateData.odometer =
        parsedOdometer;
    }

    if (acquisitionCost !== undefined) {
      const parsedAcquisitionCost =
        parseNonNegativeNumber(
          acquisitionCost
        );

      if (
        parsedAcquisitionCost === null
      ) {
        throw createHttpError(
          400,
          "Acquisition cost must be a valid non-negative number."
        );
      }

      updateData.acquisitionCost =
        parsedAcquisitionCost.toFixed(2);
    }

    if (region !== undefined) {
      updateData.region = region
        ? String(region).trim()
        : null;
    }

    if (status !== undefined) {
      const normalizedStatus =
        normalizeStatus(status);

      if (
        !VEHICLE_STATUSES.includes(
          normalizedStatus
        )
      ) {
        throw createHttpError(
          400,
          "Invalid vehicle status."
        );
      }

      if (
        normalizedStatus !==
        existingVehicle.status
      ) {
        if (
          normalizedStatus === "ON_TRIP"
        ) {
          throw createHttpError(
            400,
            "ON_TRIP status cannot be assigned manually. Dispatch a trip instead."
          );
        }

        if (
          normalizedStatus === "IN_SHOP"
        ) {
          throw createHttpError(
            400,
            "IN_SHOP status cannot be assigned manually. Create a maintenance record instead."
          );
        }

        if (
          normalizedStatus === "RETIRED"
        ) {
          throw createHttpError(
            400,
            "Use the retire vehicle endpoint to retire a vehicle."
          );
        }

        if (
          existingVehicle.status ===
            "RETIRED" &&
          normalizedStatus === "AVAILABLE"
        ) {
          throw createHttpError(
            400,
            "Use the restore vehicle endpoint to restore a retired vehicle."
          );
        }

        if (
          existingVehicle.status ===
            "ON_TRIP" &&
          normalizedStatus === "AVAILABLE"
        ) {
          throw createHttpError(
            409,
            "Complete or cancel the active trip to make the vehicle available."
          );
        }

        if (
          existingVehicle.status ===
            "IN_SHOP" &&
          normalizedStatus === "AVAILABLE"
        ) {
          throw createHttpError(
            409,
            "Close the active maintenance record to make the vehicle available."
          );
        }
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

    const vehicle =
      await prisma.vehicle.update({
        where: {
          id,
        },
        data: updateData,
      });

    return formatVehicle(vehicle);
  } catch (error) {
    handlePrismaError(error);
  }
}

async function retireVehicle(id) {
  try {
    if (!id) {
      throw createHttpError(
        400,
        "Vehicle ID is required."
      );
    }

    const vehicle =
      await prisma.$transaction(
        async (transaction) => {
          const existingVehicle =
            await transaction.vehicle.findUnique({
              where: {
                id,
              },
            });

          if (!existingVehicle) {
            throw createHttpError(
              404,
              "Vehicle not found."
            );
          }

          if (
            existingVehicle.status ===
            "RETIRED"
          ) {
            throw createHttpError(
              409,
              "Vehicle is already retired."
            );
          }

          const activeTrip =
            await transaction.trip.findFirst({
              where: {
                vehicleId: id,
                status: "DISPATCHED",
              },
              select: {
                id: true,
              },
            });

          if (
            existingVehicle.status ===
              "ON_TRIP" ||
            activeTrip
          ) {
            throw createHttpError(
              409,
              "Vehicle has an active trip. Complete or cancel the trip first."
            );
          }

          const updateResult =
            await transaction.vehicle.updateMany({
              where: {
                id,
                status: {
                  not: "RETIRED",
                },
              },
              data: {
                status: "RETIRED",
              },
            });

          if (updateResult.count !== 1) {
            throw createHttpError(
              409,
              "Vehicle status changed. Please try again."
            );
          }

          return transaction.vehicle.findUnique({
            where: {
              id,
            },
          });
        },
        {
          isolationLevel: "Serializable",
        }
      );

    return formatVehicle(vehicle);
  } catch (error) {
    handlePrismaError(error);
  }
}

async function restoreVehicle(id) {
  try {
    if (!id) {
      throw createHttpError(
        400,
        "Vehicle ID is required."
      );
    }

    const vehicle =
      await prisma.$transaction(
        async (transaction) => {
          const existingVehicle =
            await transaction.vehicle.findUnique({
              where: {
                id,
              },
            });

          if (!existingVehicle) {
            throw createHttpError(
              404,
              "Vehicle not found."
            );
          }

          if (
            existingVehicle.status !==
            "RETIRED"
          ) {
            throw createHttpError(
              409,
              "Only retired vehicles can be restored."
            );
          }

          const [
            activeMaintenance,
            activeTrip,
          ] = await Promise.all([
            transaction.maintenance.findFirst({
              where: {
                vehicleId: id,
                status: "ACTIVE",
              },
              select: {
                id: true,
              },
            }),

            transaction.trip.findFirst({
              where: {
                vehicleId: id,
                status: "DISPATCHED",
              },
              select: {
                id: true,
              },
            }),
          ]);

          if (activeMaintenance) {
            throw createHttpError(
              409,
              "Vehicle has active maintenance. Close the maintenance record before restoring it."
            );
          }

          if (activeTrip) {
            throw createHttpError(
              409,
              "Vehicle has an active trip and cannot be restored."
            );
          }

          const updateResult =
            await transaction.vehicle.updateMany({
              where: {
                id,
                status: "RETIRED",
              },
              data: {
                status: "AVAILABLE",
              },
            });

          if (updateResult.count !== 1) {
            throw createHttpError(
              409,
              "Vehicle status changed. Please try again."
            );
          }

          return transaction.vehicle.findUnique({
            where: {
              id,
            },
          });
        },
        {
          isolationLevel: "Serializable",
        }
      );

    return formatVehicle(vehicle);
  } catch (error) {
    handlePrismaError(error);
  }
}

async function deleteVehicle(id) {
  try {
    if (!id) {
      throw createHttpError(
        400,
        "Vehicle ID is required."
      );
    }

    const vehicle =
      await prisma.vehicle.findUnique({
        where: {
          id,
        },
        include: {
          _count: {
            select: {
              trips: true,
              maintenanceLogs: true,
              fuelLogs: true,
              expenses: true,
            },
          },
        },
      });

    if (!vehicle) {
      throw createHttpError(
        404,
        "Vehicle not found."
      );
    }

    if (vehicle.status === "ON_TRIP") {
      throw createHttpError(
        409,
        "Vehicle is currently on a trip and cannot be deleted."
      );
    }

    if (vehicle.status === "IN_SHOP") {
      throw createHttpError(
        409,
        "Vehicle is currently in maintenance and cannot be deleted."
      );
    }

    const hasOperationalHistory =
      vehicle._count.trips > 0 ||
      vehicle._count.maintenanceLogs > 0 ||
      vehicle._count.fuelLogs > 0 ||
      vehicle._count.expenses > 0;

    if (hasOperationalHistory) {
      throw createHttpError(
        409,
        "Vehicle has operational history and cannot be deleted. Retire the vehicle instead."
      );
    }

    await prisma.vehicle.delete({
      where: {
        id,
      },
    });

    return {
      id: vehicle.id,
      registrationNumber:
        vehicle.registrationNumber,
      vehicleName: vehicle.vehicleName,
      status: vehicle.status,
    };
  } catch (error) {
    handlePrismaError(error);
  }
}

async function getVehicleSummary(filters = {}) {
  const {
    type,
    region,
  } = filters;

  const where = {};

  if (type && String(type).trim()) {
    where.type = {
      equals: String(type).trim(),
      mode: "insensitive",
    };
  }

  if (region && String(region).trim()) {
    where.region = {
      equals: String(region).trim(),
      mode: "insensitive",
    };
  }

  const [
    totalVehicles,
    statusGroups,
    typeGroups,
    aggregate,
  ] = await Promise.all([
    prisma.vehicle.count({
      where,
    }),

    prisma.vehicle.groupBy({
      by: ["status"],
      where,
      _count: {
        _all: true,
      },
      _sum: {
        acquisitionCost: true,
        maximumLoadCapacity: true,
      },
    }),

    prisma.vehicle.groupBy({
      by: ["type"],
      where,
      _count: {
        _all: true,
      },
      _sum: {
        acquisitionCost: true,
        maximumLoadCapacity: true,
      },
      orderBy: {
        _count: {
          type: "desc",
        },
      },
    }),

    prisma.vehicle.aggregate({
      where,
      _sum: {
        acquisitionCost: true,
        maximumLoadCapacity: true,
      },
      _avg: {
        acquisitionCost: true,
        maximumLoadCapacity: true,
        odometer: true,
      },
      _min: {
        odometer: true,
      },
      _max: {
        odometer: true,
      },
    }),
  ]);

  const statusCounts = {
    AVAILABLE: 0,
    ON_TRIP: 0,
    IN_SHOP: 0,
    RETIRED: 0,
  };

  statusGroups.forEach((item) => {
    statusCounts[item.status] =
      item._count._all;
  });

  const activeVehicles =
    totalVehicles - statusCounts.RETIRED;

  const fleetUtilization =
    activeVehicles > 0
      ? (statusCounts.ON_TRIP /
          activeVehicles) *
        100
      : 0;

  return {
    filters: {
      type: type || null,
      region: region || null,
    },

    summary: {
      totalVehicles,
      activeVehicles,
      availableVehicles:
        statusCounts.AVAILABLE,
      vehiclesOnTrip:
        statusCounts.ON_TRIP,
      vehiclesInMaintenance:
        statusCounts.IN_SHOP,
      retiredVehicles:
        statusCounts.RETIRED,
      fleetUtilization: roundNumber(
        fleetUtilization
      ),
      totalAcquisitionCost: roundNumber(
        decimalToNumber(
          aggregate._sum.acquisitionCost
        )
      ),
      totalLoadCapacity: roundNumber(
        aggregate._sum.maximumLoadCapacity || 0
      ),
      averageAcquisitionCost: roundNumber(
        decimalToNumber(
          aggregate._avg.acquisitionCost
        )
      ),
      averageLoadCapacity: roundNumber(
        aggregate._avg.maximumLoadCapacity || 0
      ),
      averageOdometer: roundNumber(
        aggregate._avg.odometer || 0
      ),
      minimumOdometer: roundNumber(
        aggregate._min.odometer || 0
      ),
      maximumOdometer: roundNumber(
        aggregate._max.odometer || 0
      ),
    },

    statusDistribution:
      statusGroups.map((item) => ({
        status: item.status,
        count: item._count._all,
        totalAcquisitionCost: roundNumber(
          decimalToNumber(
            item._sum.acquisitionCost
          )
        ),
        totalLoadCapacity: roundNumber(
          item._sum.maximumLoadCapacity || 0
        ),
      })),

    typeDistribution: typeGroups.map(
      (item) => ({
        type: item.type,
        count: item._count._all,
        totalAcquisitionCost: roundNumber(
          decimalToNumber(
            item._sum.acquisitionCost
          )
        ),
        totalLoadCapacity: roundNumber(
          item._sum.maximumLoadCapacity || 0
        ),
      })
    ),
  };
}

module.exports = {
  getAllVehicles,
  getAvailableVehicles,
  getVehicleById,
  createVehicle,
  updateVehicle,
  retireVehicle,
  restoreVehicle,
  deleteVehicle,
  getVehicleSummary,
};