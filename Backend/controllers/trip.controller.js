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

function decimalToNumber(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return Number(value);
}

function formatTrip(trip) {
  if (!trip) return null;

  return {
    ...trip,

    revenue: decimalToNumber(trip.revenue),

    vehicle: trip.vehicle
      ? {
          ...trip.vehicle,
          acquisitionCost:
            trip.vehicle.acquisitionCost !== undefined
              ? decimalToNumber(
                  trip.vehicle.acquisitionCost
                )
              : undefined,
        }
      : undefined,

    fuelLogs: Array.isArray(trip.fuelLogs)
      ? trip.fuelLogs.map((fuelLog) => ({
          ...fuelLog,
          cost: decimalToNumber(fuelLog.cost),
        }))
      : undefined,

    expenses: Array.isArray(trip.expenses)
      ? trip.expenses.map((expense) => ({
          ...expense,
          amount: decimalToNumber(expense.amount),
        }))
      : undefined,
  };
}

function isPrismaNotFoundError(error) {
  return error && error.code === "P2025";
}

async function validateAssignment(
  database,
  vehicleId,
  driverId,
  cargoWeight
) {
  const [vehicle, driver] = await Promise.all([
    database.vehicle.findUnique({
      where: {
        id: vehicleId,
      },
    }),

    database.driver.findUnique({
      where: {
        id: driverId,
      },
    }),
  ]);

  if (!vehicle) {
    throw createHttpError(404, "Vehicle not found");
  }

  if (!driver) {
    throw createHttpError(404, "Driver not found");
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

async function getAllTrips(req, res, next) {
  try {
    const {
      status,
      vehicleId,
      driverId,
      search,
      from,
      to,
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
      !TRIP_STATUSES.includes(normalizedStatus)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid trip status. Use DRAFT, DISPATCHED, COMPLETED or CANCELLED.",
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
        message:
          "From date cannot be greater than to date.",
      });
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

    return res.status(200).json({
      success: true,
      message: "Trips fetched successfully",

      pagination: {
        currentPage: page,
        limit,
        totalTrips,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },

      trips: trips.map(formatTrip),
    });
  } catch (error) {
    next(error);
  }
}

async function getTripById(req, res, next) {
  try {
    const { id } = req.params;

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
      return res.status(404).json({
        success: false,
        message: "Trip not found",
      });
    }

    return res.status(200).json({
      success: true,
      trip: formatTrip(trip),
    });
  } catch (error) {
    next(error);
  }
}

async function createTrip(req, res, next) {
  try {
    const {
      source,
      destination,
      vehicleId,
      driverId,
      cargoWeight,
      plannedDistance,
      revenue,
    } = req.body;

    if (
      !source ||
      !destination ||
      !vehicleId ||
      !driverId ||
      cargoWeight === undefined ||
      plannedDistance === undefined
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Source, destination, vehicle ID, driver ID, cargo weight and planned distance are required.",
      });
    }

    if (
      !String(source).trim() ||
      !String(destination).trim()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Source and destination cannot be empty.",
      });
    }

    const parsedCargoWeight =
      parsePositiveNumber(cargoWeight);

    const parsedPlannedDistance =
      parsePositiveNumber(plannedDistance);

    if (parsedCargoWeight === null) {
      return res.status(400).json({
        success: false,
        message:
          "Cargo weight must be greater than zero.",
      });
    }

    if (parsedPlannedDistance === null) {
      return res.status(400).json({
        success: false,
        message:
          "Planned distance must be greater than zero.",
      });
    }

    let parsedRevenue = null;

    if (revenue !== undefined && revenue !== null) {
      parsedRevenue =
        parseNonNegativeNumber(revenue);

      if (parsedRevenue === null) {
        return res.status(400).json({
          success: false,
          message:
            "Revenue must be a valid non-negative number.",
        });
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
        destination: String(destination).trim(),
        vehicleId,
        driverId,
        cargoWeight: parsedCargoWeight,
        plannedDistance:
          parsedPlannedDistance,
        revenue:
          parsedRevenue === null
            ? null
            : parsedRevenue.toFixed(2),
        initialOdometer: Number(
          vehicle.odometer
        ),
        status: "DRAFT",
      },

      include: {
        vehicle: true,
        driver: true,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Trip created successfully",
      trip: formatTrip(trip),
    });
  } catch (error) {
    next(error);
  }
}

async function updateTrip(req, res, next) {
  try {
    const { id } = req.params;

    const existingTrip =
      await prisma.trip.findUnique({
        where: {
          id,
        },
      });

    if (!existingTrip) {
      return res.status(404).json({
        success: false,
        message: "Trip not found",
      });
    }

    if (existingTrip.status !== "DRAFT") {
      return res.status(409).json({
        success: false,
        message:
          "Only draft trips can be updated.",
      });
    }

    const {
      source,
      destination,
      vehicleId,
      driverId,
      cargoWeight,
      plannedDistance,
      revenue,
    } = req.body;

    const finalVehicleId =
      vehicleId || existingTrip.vehicleId;

    const finalDriverId =
      driverId || existingTrip.driverId;

    let finalCargoWeight =
      existingTrip.cargoWeight;

    let finalPlannedDistance =
      existingTrip.plannedDistance;

    if (cargoWeight !== undefined) {
      finalCargoWeight =
        parsePositiveNumber(cargoWeight);

      if (finalCargoWeight === null) {
        return res.status(400).json({
          success: false,
          message:
            "Cargo weight must be greater than zero.",
        });
      }
    }

    if (plannedDistance !== undefined) {
      finalPlannedDistance =
        parsePositiveNumber(plannedDistance);

      if (finalPlannedDistance === null) {
        return res.status(400).json({
          success: false,
          message:
            "Planned distance must be greater than zero.",
        });
      }
    }

    const { vehicle } = await validateAssignment(
      prisma,
      finalVehicleId,
      finalDriverId,
      finalCargoWeight
    );

    const updateData = {};

    if (source !== undefined) {
      if (!String(source).trim()) {
        return res.status(400).json({
          success: false,
          message: "Source cannot be empty.",
        });
      }

      updateData.source = String(source).trim();
    }

    if (destination !== undefined) {
      if (!String(destination).trim()) {
        return res.status(400).json({
          success: false,
          message:
            "Destination cannot be empty.",
        });
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
          return res.status(400).json({
            success: false,
            message:
              "Revenue must be a valid non-negative number.",
          });
        }

        updateData.revenue =
          parsedRevenue.toFixed(2);
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "Provide at least one field to update.",
      });
    }

    const updatedTrip =
      await prisma.trip.update({
        where: {
          id,
        },

        data: updateData,

        include: {
          vehicle: true,
          driver: true,
        },
      });

    return res.status(200).json({
      success: true,
      message: "Trip updated successfully",
      trip: formatTrip(updatedTrip),
    });
  } catch (error) {
    if (isPrismaNotFoundError(error)) {
      return res.status(404).json({
        success: false,
        message: "Trip not found",
      });
    }

    next(error);
  }
}

async function dispatchTrip(req, res, next) {
  try {
    const dispatchedTrip =
      await prisma.$transaction(
        async (transaction) => {
          const trip =
            await transaction.trip.findUnique({
              where: {
                id: req.params.id,
              },

              include: {
                vehicle: true,
                driver: true,
              },
            });

          if (!trip) {
            throw createHttpError(
              404,
              "Trip not found"
            );
          }

          if (trip.status !== "DRAFT") {
            throw createHttpError(
              409,
              "Only draft trips can be dispatched."
            );
          }

          if (
            Number(trip.cargoWeight) >
            Number(
              trip.vehicle.maximumLoadCapacity
            )
          ) {
            throw createHttpError(
              400,
              `Cargo weight cannot exceed vehicle capacity of ${trip.vehicle.maximumLoadCapacity} kg.`
            );
          }

          if (
            trip.vehicle.status !== "AVAILABLE"
          ) {
            throw createHttpError(
              409,
              `Vehicle is not available. Current status: ${trip.vehicle.status}`
            );
          }

          if (
            trip.driver.status !== "AVAILABLE"
          ) {
            throw createHttpError(
              409,
              `Driver is not available. Current status: ${trip.driver.status}`
            );
          }

          const dispatchTime = new Date();

          if (
            trip.driver.licenseExpiryDate <=
            dispatchTime
          ) {
            throw createHttpError(
              409,
              "Driver license has expired."
            );
          }

          const tripUpdate =
            await transaction.trip.updateMany({
              where: {
                id: trip.id,
                status: "DRAFT",
              },

              data: {
                status: "DISPATCHED",
                dispatchedAt: dispatchTime,
                initialOdometer:
                  trip.initialOdometer ??
                  Number(trip.vehicle.odometer),
              },
            });

          if (tripUpdate.count !== 1) {
            throw createHttpError(
              409,
              "Trip status changed. Please try again."
            );
          }

          const vehicleUpdate =
            await transaction.vehicle.updateMany({
              where: {
                id: trip.vehicleId,
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
                id: trip.driverId,
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
              "Driver is no longer available or the license has expired."
            );
          }

          return transaction.trip.findUnique({
            where: {
              id: trip.id,
            },

            include: {
              vehicle: true,
              driver: true,
            },
          });
        },
        {
          isolationLevel: "Serializable",
        }
      );

    return res.status(200).json({
      success: true,
      message: "Trip dispatched successfully",
      trip: formatTrip(dispatchedTrip),
    });
  } catch (error) {
    next(error);
  }
}

async function completeTrip(req, res, next) {
  try {
    const {
      finalOdometer,
      revenue,
      fuelConsumed,
      liters,
      fuelCost,
      cost,
      fuelDate,
    } = req.body;

    const parsedFinalOdometer =
      parseNonNegativeNumber(finalOdometer);

    if (parsedFinalOdometer === null) {
      return res.status(400).json({
        success: false,
        message:
          "Final odometer is required and must be a valid non-negative number.",
      });
    }

    let parsedRevenue;

    if (revenue !== undefined) {
      if (revenue === null || revenue === "") {
        parsedRevenue = null;
      } else {
        parsedRevenue =
          parseNonNegativeNumber(revenue);

        if (parsedRevenue === null) {
          return res.status(400).json({
            success: false,
            message:
              "Revenue must be a valid non-negative number.",
          });
        }
      }
    }

    const fuelLiters =
      fuelConsumed !== undefined
        ? fuelConsumed
        : liters;

    const requestedFuelCost =
      fuelCost !== undefined ? fuelCost : cost;

    const hasFuelLiters =
      fuelLiters !== undefined &&
      fuelLiters !== null &&
      fuelLiters !== "";

    const hasFuelCost =
      requestedFuelCost !== undefined &&
      requestedFuelCost !== null &&
      requestedFuelCost !== "";

    if (hasFuelLiters !== hasFuelCost) {
      return res.status(400).json({
        success: false,
        message:
          "Fuel consumed and fuel cost must both be provided.",
      });
    }

    let parsedFuelLiters;
    let parsedFuelCost;

    if (hasFuelLiters && hasFuelCost) {
      parsedFuelLiters =
        parsePositiveNumber(fuelLiters);

      parsedFuelCost =
        parsePositiveNumber(requestedFuelCost);

      if (parsedFuelLiters === null) {
        return res.status(400).json({
          success: false,
          message:
            "Fuel consumed must be greater than zero.",
        });
      }

      if (parsedFuelCost === null) {
        return res.status(400).json({
          success: false,
          message:
            "Fuel cost must be greater than zero.",
        });
      }
    }

    let parsedFuelDate = new Date();

    if (fuelDate !== undefined) {
      parsedFuelDate = parseDate(fuelDate);

      if (!parsedFuelDate) {
        return res.status(400).json({
          success: false,
          message: "Invalid fuel date.",
        });
      }
    }

    const completedTrip =
      await prisma.$transaction(
        async (transaction) => {
          const trip =
            await transaction.trip.findUnique({
              where: {
                id: req.params.id,
              },

              include: {
                vehicle: true,
                driver: true,
              },
            });

          if (!trip) {
            throw createHttpError(
              404,
              "Trip not found"
            );
          }

          if (trip.status !== "DISPATCHED") {
            throw createHttpError(
              409,
              "Only dispatched trips can be completed."
            );
          }

          const initialOdometer = Number(
            trip.initialOdometer ??
              trip.vehicle.odometer
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

          const tripUpdate =
            await transaction.trip.updateMany({
              where: {
                id: trip.id,
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

          const vehicleUpdate =
            await transaction.vehicle.updateMany({
              where: {
                id: trip.vehicleId,
                status: "ON_TRIP",
              },

              data: {
                status: "AVAILABLE",
                odometer: parsedFinalOdometer,
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
                id: trip.driverId,
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

          if (
            parsedFuelLiters !== undefined &&
            parsedFuelCost !== undefined
          ) {
            await transaction.fuelLog.create({
              data: {
                vehicleId: trip.vehicleId,
                tripId: trip.id,
                liters: parsedFuelLiters,
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
              id: trip.id,
            },

            include: {
              vehicle: true,
              driver: true,
              fuelLogs: true,
              expenses: true,
            },
          });
        },
        {
          isolationLevel: "Serializable",
        }
      );

    return res.status(200).json({
      success: true,
      message: "Trip completed successfully",
      trip: formatTrip(completedTrip),
    });
  } catch (error) {
    next(error);
  }
}

async function cancelTrip(req, res, next) {
  try {
    const cancelledTrip =
      await prisma.$transaction(
        async (transaction) => {
          const trip =
            await transaction.trip.findUnique({
              where: {
                id: req.params.id,
              },

              include: {
                vehicle: true,
                driver: true,
              },
            });

          if (!trip) {
            throw createHttpError(
              404,
              "Trip not found"
            );
          }

          if (trip.status === "COMPLETED") {
            throw createHttpError(
              409,
              "Completed trip cannot be cancelled."
            );
          }

          if (trip.status === "CANCELLED") {
            throw createHttpError(
              409,
              "Trip is already cancelled."
            );
          }

          const previousStatus = trip.status;

          const tripUpdate =
            await transaction.trip.updateMany({
              where: {
                id: trip.id,
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

          if (previousStatus === "DISPATCHED") {
            const vehicleUpdate =
              await transaction.vehicle.updateMany({
                where: {
                  id: trip.vehicleId,
                  status: "ON_TRIP",
                },

                data: {
                  status: "AVAILABLE",
                },
              });

            if (vehicleUpdate.count !== 1) {
              throw createHttpError(
                409,
                "Vehicle status is invalid for cancelling this trip."
              );
            }

            const driverUpdate =
              await transaction.driver.updateMany({
                where: {
                  id: trip.driverId,
                  status: "ON_TRIP",
                },

                data: {
                  status: "AVAILABLE",
                },
              });

            if (driverUpdate.count !== 1) {
              throw createHttpError(
                409,
                "Driver status is invalid for cancelling this trip."
              );
            }
          }

          return transaction.trip.findUnique({
            where: {
              id: trip.id,
            },

            include: {
              vehicle: true,
              driver: true,
            },
          });
        },
        {
          isolationLevel: "Serializable",
        }
      );

    return res.status(200).json({
      success: true,
      message: "Trip cancelled successfully",
      trip: formatTrip(cancelledTrip),
    });
  } catch (error) {
    next(error);
  }
}

async function deleteTrip(req, res, next) {
  try {
    const { id } = req.params;

    const trip = await prisma.trip.findUnique({
      where: {
        id,
      },

      select: {
        id: true,
        source: true,
        destination: true,
        status: true,
      },
    });

    if (!trip) {
      return res.status(404).json({
        success: false,
        message: "Trip not found",
      });
    }

    if (trip.status !== "DRAFT") {
      return res.status(409).json({
        success: false,
        message:
          "Only draft trips can be deleted.",
      });
    }

    await prisma.trip.delete({
      where: {
        id,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Trip deleted successfully",
      deletedTrip: trip,
    });
  } catch (error) {
    if (isPrismaNotFoundError(error)) {
      return res.status(404).json({
        success: false,
        message: "Trip not found",
      });
    }

    next(error);
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