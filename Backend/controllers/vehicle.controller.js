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

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
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

function isPrismaUniqueError(error) {
  return error && error.code === "P2002";
}

function isPrismaNotFoundError(error) {
  return error && error.code === "P2025";
}

function formatVehicle(vehicle) {
  if (!vehicle) return null;

  return {
    ...vehicle,
    acquisitionCost: decimalToNumber(
      vehicle.acquisitionCost
    ),
    maintenanceLogs: Array.isArray(
      vehicle.maintenanceLogs
    )
      ? vehicle.maintenanceLogs.map((maintenance) => ({
          ...maintenance,
          cost: decimalToNumber(maintenance.cost),
        }))
      : undefined,
    fuelLogs: Array.isArray(vehicle.fuelLogs)
      ? vehicle.fuelLogs.map((fuelLog) => ({
          ...fuelLog,
          cost: decimalToNumber(fuelLog.cost),
        }))
      : undefined,
    expenses: Array.isArray(vehicle.expenses)
      ? vehicle.expenses.map((expense) => ({
          ...expense,
          amount: decimalToNumber(expense.amount),
        }))
      : undefined,
  };
}

async function getAllVehicles(req, res, next) {
  try {
    const {
      search,
      status,
      type,
      region,
      minCapacity,
      maxCapacity,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const page = parsePositiveInteger(
      req.query.page,
      1
    );

    const requestedLimit = parsePositiveInteger(
      req.query.limit,
      10
    );

    const limit = Math.min(requestedLimit, 100);
    const skip = (page - 1) * limit;

    const normalizedStatus = normalizeStatus(status);

    if (
      normalizedStatus &&
      !VEHICLE_STATUSES.includes(normalizedStatus)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid vehicle status. Use AVAILABLE, ON_TRIP, IN_SHOP or RETIRED.",
      });
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
          return res.status(400).json({
            success: false,
            message:
              "Minimum capacity must be a valid non-negative number.",
          });
        }

        where.maximumLoadCapacity.gte =
          parsedMinCapacity;
      }

      if (maxCapacity !== undefined) {
        const parsedMaxCapacity =
          parseNonNegativeNumber(maxCapacity);

        if (parsedMaxCapacity === null) {
          return res.status(400).json({
            success: false,
            message:
              "Maximum capacity must be a valid non-negative number.",
          });
        }

        where.maximumLoadCapacity.lte =
          parsedMaxCapacity;
      }

      if (
        minCapacity !== undefined &&
        maxCapacity !== undefined &&
        Number(minCapacity) > Number(maxCapacity)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Minimum capacity cannot be greater than maximum capacity.",
        });
      }
    }

    const [vehicles, totalVehicles] =
      await prisma.$transaction([
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
      ]);

    const totalPages = Math.ceil(
      totalVehicles / limit
    );

    return res.status(200).json({
      success: true,
      message: "Vehicles fetched successfully",
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
      },
      vehicles: vehicles.map(formatVehicle),
    });
  } catch (error) {
    next(error);
  }
}

async function getAvailableVehicles(
  req,
  res,
  next
) {
  try {
    const {
      cargoWeight,
      type,
      region,
      search,
    } = req.query;

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
        return res.status(400).json({
          success: false,
          message:
            "Cargo weight must be greater than zero.",
        });
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
        orderBy: {
          vehicleName: "asc",
        },
      });

    return res.status(200).json({
      success: true,
      count: vehicles.length,
      vehicles: vehicles.map(formatVehicle),
    });
  } catch (error) {
    next(error);
  }
}

async function getVehicleById(req, res, next) {
  try {
    const { id } = req.params;

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
            select: {
              id: true,
              source: true,
              destination: true,
              cargoWeight: true,
              plannedDistance: true,
              actualDistance: true,
              revenue: true,
              status: true,
              dispatchedAt: true,
              completedAt: true,
              createdAt: true,
              driver: {
                select: {
                  id: true,
                  name: true,
                  licenseNumber: true,
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
      return res.status(404).json({
        success: false,
        message: "Vehicle not found",
      });
    }

    const formattedVehicle =
      formatVehicle(vehicle);

    formattedVehicle.trips =
      formattedVehicle.trips.map((trip) => ({
        ...trip,
        revenue: decimalToNumber(trip.revenue),
      }));

    return res.status(200).json({
      success: true,
      vehicle: formattedVehicle,
    });
  } catch (error) {
    next(error);
  }
}

async function createVehicle(req, res, next) {
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
    } = req.body;

    if (
      !registrationNumber ||
      !vehicleName ||
      !type ||
      maximumLoadCapacity === undefined ||
      acquisitionCost === undefined
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Registration number, vehicle name, type, maximum load capacity and acquisition cost are required.",
      });
    }

    if (
      !String(registrationNumber).trim() ||
      !String(vehicleName).trim() ||
      !String(type).trim()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Required fields cannot be empty.",
      });
    }

    const parsedCapacity =
      parsePositiveNumber(maximumLoadCapacity);

    if (parsedCapacity === null) {
      return res.status(400).json({
        success: false,
        message:
          "Maximum load capacity must be greater than zero.",
      });
    }

    const parsedAcquisitionCost =
      parseNonNegativeNumber(acquisitionCost);

    if (parsedAcquisitionCost === null) {
      return res.status(400).json({
        success: false,
        message:
          "Acquisition cost must be a valid non-negative number.",
      });
    }

    const parsedOdometer =
      odometer === undefined
        ? 0
        : parseNonNegativeNumber(odometer);

    if (parsedOdometer === null) {
      return res.status(400).json({
        success: false,
        message:
          "Odometer must be a valid non-negative number.",
      });
    }

    const normalizedStatus =
      normalizeStatus(status) || "AVAILABLE";

    if (
      !["AVAILABLE", "RETIRED"].includes(
        normalizedStatus
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "New vehicle status can only be AVAILABLE or RETIRED.",
      });
    }

    const normalizedRegistration =
      normalizeRegistrationNumber(
        registrationNumber
      );

    const existingVehicle =
      await prisma.vehicle.findUnique({
        where: {
          registrationNumber:
            normalizedRegistration,
        },
        select: {
          id: true,
        },
      });

    if (existingVehicle) {
      return res.status(409).json({
        success: false,
        message:
          "Vehicle registration number already exists.",
      });
    }

    const vehicle =
      await prisma.vehicle.create({
        data: {
          registrationNumber:
            normalizedRegistration,
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

    return res.status(201).json({
      success: true,
      message: "Vehicle created successfully",
      vehicle: formatVehicle(vehicle),
    });
  } catch (error) {
    if (isPrismaUniqueError(error)) {
      return res.status(409).json({
        success: false,
        message:
          "Vehicle registration number already exists.",
      });
    }

    next(error);
  }
}

async function updateVehicle(req, res, next) {
  try {
    const { id } = req.params;

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
    } = req.body;

    const existingVehicle =
      await prisma.vehicle.findUnique({
        where: {
          id,
        },
      });

    if (!existingVehicle) {
      return res.status(404).json({
        success: false,
        message: "Vehicle not found",
      });
    }

    const updateData = {};

    if (registrationNumber !== undefined) {
      if (!String(registrationNumber).trim()) {
        return res.status(400).json({
          success: false,
          message:
            "Registration number cannot be empty.",
        });
      }

      updateData.registrationNumber =
        normalizeRegistrationNumber(
          registrationNumber
        );
    }

    if (vehicleName !== undefined) {
      if (!String(vehicleName).trim()) {
        return res.status(400).json({
          success: false,
          message:
            "Vehicle name cannot be empty.",
        });
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
        return res.status(400).json({
          success: false,
          message:
            "Vehicle type cannot be empty.",
        });
      }

      updateData.type = String(type).trim();
    }

    if (maximumLoadCapacity !== undefined) {
      const parsedCapacity =
        parsePositiveNumber(
          maximumLoadCapacity
        );

      if (parsedCapacity === null) {
        return res.status(400).json({
          success: false,
          message:
            "Maximum load capacity must be greater than zero.",
        });
      }

      updateData.maximumLoadCapacity =
        parsedCapacity;
    }

    if (odometer !== undefined) {
      const parsedOdometer =
        parseNonNegativeNumber(odometer);

      if (parsedOdometer === null) {
        return res.status(400).json({
          success: false,
          message:
            "Odometer must be a valid non-negative number.",
        });
      }

      if (
        parsedOdometer <
        Number(existingVehicle.odometer)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Odometer cannot be less than the current odometer.",
        });
      }

      updateData.odometer = parsedOdometer;
    }

    if (acquisitionCost !== undefined) {
      const parsedCost =
        parseNonNegativeNumber(
          acquisitionCost
        );

      if (parsedCost === null) {
        return res.status(400).json({
          success: false,
          message:
            "Acquisition cost must be a valid non-negative number.",
        });
      }

      updateData.acquisitionCost =
        parsedCost.toFixed(2);
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
        return res.status(400).json({
          success: false,
          message:
            "Invalid vehicle status.",
        });
      }

      if (
        normalizedStatus === "ON_TRIP" &&
        existingVehicle.status !== "ON_TRIP"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "ON_TRIP status cannot be assigned manually. Dispatch a trip instead.",
        });
      }

      if (
        normalizedStatus === "IN_SHOP" &&
        existingVehicle.status !== "IN_SHOP"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "IN_SHOP status cannot be assigned manually. Create a maintenance record instead.",
        });
      }

      if (
        existingVehicle.status === "ON_TRIP" &&
        normalizedStatus !== "ON_TRIP"
      ) {
        const activeTrip =
          await prisma.trip.findFirst({
            where: {
              vehicleId: id,
              status: "DISPATCHED",
            },
            select: {
              id: true,
            },
          });

        if (activeTrip) {
          return res.status(409).json({
            success: false,
            message:
              "Vehicle is assigned to an active trip. Complete or cancel the trip first.",
          });
        }
      }

      if (
        existingVehicle.status === "IN_SHOP" &&
        normalizedStatus === "AVAILABLE"
      ) {
        const activeMaintenance =
          await prisma.maintenance.findFirst({
            where: {
              vehicleId: id,
              status: "ACTIVE",
            },
            select: {
              id: true,
            },
          });

        if (activeMaintenance) {
          return res.status(409).json({
            success: false,
            message:
              "Vehicle has active maintenance. Close the maintenance record first.",
          });
        }
      }

      updateData.status = normalizedStatus;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "Provide at least one field to update.",
      });
    }

    const updatedVehicle =
      await prisma.vehicle.update({
        where: {
          id,
        },
        data: updateData,
      });

    return res.status(200).json({
      success: true,
      message: "Vehicle updated successfully",
      vehicle: formatVehicle(updatedVehicle),
    });
  } catch (error) {
    if (isPrismaUniqueError(error)) {
      return res.status(409).json({
        success: false,
        message:
          "Vehicle registration number already exists.",
      });
    }

    if (isPrismaNotFoundError(error)) {
      return res.status(404).json({
        success: false,
        message: "Vehicle not found",
      });
    }

    next(error);
  }
}

async function retireVehicle(req, res, next) {
  try {
    const { id } = req.params;

    const vehicle =
      await prisma.vehicle.findUnique({
        where: {
          id,
        },
      });

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: "Vehicle not found",
      });
    }

    if (vehicle.status === "RETIRED") {
      return res.status(409).json({
        success: false,
        message: "Vehicle is already retired.",
      });
    }

    if (vehicle.status === "ON_TRIP") {
      return res.status(409).json({
        success: false,
        message:
          "Vehicle is currently on a trip. Complete or cancel the trip first.",
      });
    }

    const retiredVehicle =
      await prisma.vehicle.update({
        where: {
          id,
        },
        data: {
          status: "RETIRED",
        },
      });

    return res.status(200).json({
      success: true,
      message: "Vehicle retired successfully",
      vehicle: formatVehicle(retiredVehicle),
    });
  } catch (error) {
    next(error);
  }
}

async function restoreVehicle(req, res, next) {
  try {
    const { id } = req.params;

    const vehicle =
      await prisma.vehicle.findUnique({
        where: {
          id,
        },
      });

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: "Vehicle not found",
      });
    }

    if (vehicle.status !== "RETIRED") {
      return res.status(409).json({
        success: false,
        message:
          "Only retired vehicles can be restored.",
      });
    }

    const activeMaintenance =
      await prisma.maintenance.findFirst({
        where: {
          vehicleId: id,
          status: "ACTIVE",
        },
        select: {
          id: true,
        },
      });

    if (activeMaintenance) {
      return res.status(409).json({
        success: false,
        message:
          "Vehicle has active maintenance and cannot be restored to available.",
      });
    }

    const restoredVehicle =
      await prisma.vehicle.update({
        where: {
          id,
        },
        data: {
          status: "AVAILABLE",
        },
      });

    return res.status(200).json({
      success: true,
      message: "Vehicle restored successfully",
      vehicle: formatVehicle(restoredVehicle),
    });
  } catch (error) {
    next(error);
  }
}

async function deleteVehicle(req, res, next) {
  try {
    const { id } = req.params;

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
      return res.status(404).json({
        success: false,
        message: "Vehicle not found",
      });
    }

    if (vehicle.status === "ON_TRIP") {
      return res.status(409).json({
        success: false,
        message:
          "Vehicle is currently on a trip and cannot be deleted.",
      });
    }

    const hasHistory =
      vehicle._count.trips > 0 ||
      vehicle._count.maintenanceLogs > 0 ||
      vehicle._count.fuelLogs > 0 ||
      vehicle._count.expenses > 0;

    if (hasHistory) {
      return res.status(409).json({
        success: false,
        message:
          "Vehicle has operational history and cannot be deleted. Retire the vehicle instead.",
      });
    }

    await prisma.vehicle.delete({
      where: {
        id,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Vehicle deleted successfully",
    });
  } catch (error) {
    if (isPrismaNotFoundError(error)) {
      return res.status(404).json({
        success: false,
        message: "Vehicle not found",
      });
    }

    next(error);
  }
}

async function getVehicleSummary(
  req,
  res,
  next
) {
  try {
    const [
      totalVehicles,
      statusGroups,
      typeGroups,
      vehicleAggregate,
    ] = await Promise.all([
      prisma.vehicle.count(),

      prisma.vehicle.groupBy({
        by: ["status"],
        _count: {
          _all: true,
        },
      }),

      prisma.vehicle.groupBy({
        by: ["type"],
        _count: {
          _all: true,
        },
      }),

      prisma.vehicle.aggregate({
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

    return res.status(200).json({
      success: true,
      message:
        "Vehicle summary fetched successfully",
      summary: {
        totalVehicles,
        totalAcquisitionCost:
          decimalToNumber(
            vehicleAggregate._sum
              .acquisitionCost
          ),
        totalLoadCapacity:
          Number(
            vehicleAggregate._sum
              .maximumLoadCapacity || 0
          ),
        averageAcquisitionCost:
          decimalToNumber(
            vehicleAggregate._avg
              .acquisitionCost
          ),
        averageLoadCapacity:
          Number(
            vehicleAggregate._avg
              .maximumLoadCapacity || 0
          ),
        averageOdometer:
          Number(
            vehicleAggregate._avg.odometer || 0
          ),
      },
      statusDistribution: statusGroups.map(
        (item) => ({
          status: item.status,
          count: item._count._all,
        })
      ),
      typeDistribution: typeGroups.map(
        (item) => ({
          type: item.type,
          count: item._count._all,
        })
      ),
    });
  } catch (error) {
    next(error);
  }
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