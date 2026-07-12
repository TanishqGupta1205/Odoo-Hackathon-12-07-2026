// controllers/fuel.controller.js

const { prisma } = require("../config/db");



const ALLOWED_SORT_FIELDS = [
  "liters",
  "cost",
  "date",
  "odometerReading",
  "createdAt",
];


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
  if (!value) {
    return null;
  }

  
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

function isPrismaNotFoundError(error) {
  return error && error.code === "P2025";
}

/*
|--------------------------------------------------------------------------
| Validate Vehicle And Trip
|--------------------------------------------------------------------------
*/

async function validateVehicleAndTrip({
  vehicleId,
  tripId,
}) {
  const vehicle = await prisma.vehicle.findUnique({
    where: {
      id: vehicleId,
    },

    select: {
      id: true,
      registrationNumber: true,
      vehicleName: true,
      odometer: true,
      status: true,
    },
  });

  if (!vehicle) {
    return {
      valid: false,
      statusCode: 404,
      message: "Vehicle not found",
    };
  }

  if (!tripId) {
    return {
      valid: true,
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
    return {
      valid: false,
      statusCode: 404,
      message: "Trip not found",
    };
  }

  if (trip.vehicleId !== vehicleId) {
    return {
      valid: false,
      statusCode: 400,
      message:
        "Selected trip does not belong to the selected vehicle.",
    };
  }

  return {
    valid: true,
    vehicle,
    trip,
  };
}

/*
|--------------------------------------------------------------------------
| GET ALL FUEL LOGS
|--------------------------------------------------------------------------
|
| GET /api/fuel
|
| Query examples:
|
| ?vehicleId=vehicle-id
| ?tripId=trip-id
| ?from=2026-01-01
| ?to=2026-12-31
| ?minLiters=10
| ?maxLiters=100
| ?minCost=500
| ?maxCost=10000
| ?search=MH12
| ?page=1
| ?limit=10
| ?sortBy=date
| ?sortOrder=desc
|
*/

async function getAllFuelLogs(req, res, next) {
  try {
    const {
      vehicleId,
      tripId,
      from,
      to,
      minLiters,
      maxLiters,
      minCost,
      maxCost,
      search,
      sortBy = "date",
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

    /*
     * Search using vehicle registration number,
     * vehicle name, source or destination.
     */
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

    /*
     * Date filter
     */
    const fromDate = parseDate(from);
    const toDate = parseDate(to, true);

    if (from && !fromDate) {
      return res.status(400).json({
        success: false,
        message: "Invalid from date",
      });
    }

    if (to && !toDate) {
      return res.status(400).json({
        success: false,
        message: "Invalid to date",
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
      where.date = {};

      if (fromDate) {
        where.date.gte = fromDate;
      }

      if (toDate) {
        where.date.lte = toDate;
      }
    }

    /*
     * Liters filter
     */
    if (
      minLiters !== undefined ||
      maxLiters !== undefined
    ) {
      where.liters = {};

      if (minLiters !== undefined) {
        const parsedMinLiters =
          parseNonNegativeNumber(minLiters);

        if (parsedMinLiters === null) {
          return res.status(400).json({
            success: false,
            message:
              "Minimum liters must be a valid non-negative number.",
          });
        }

        where.liters.gte = parsedMinLiters;
      }

      if (maxLiters !== undefined) {
        const parsedMaxLiters =
          parseNonNegativeNumber(maxLiters);

        if (parsedMaxLiters === null) {
          return res.status(400).json({
            success: false,
            message:
              "Maximum liters must be a valid non-negative number.",
          });
        }

        where.liters.lte = parsedMaxLiters;
      }

      if (
        minLiters !== undefined &&
        maxLiters !== undefined &&
        Number(minLiters) > Number(maxLiters)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Minimum liters cannot be greater than maximum liters.",
        });
      }
    }

    /*
     * Cost filter
     */
    if (
      minCost !== undefined ||
      maxCost !== undefined
    ) {
      where.cost = {};

      if (minCost !== undefined) {
        const parsedMinCost =
          parseNonNegativeNumber(minCost);

        if (parsedMinCost === null) {
          return res.status(400).json({
            success: false,
            message:
              "Minimum cost must be a valid non-negative number.",
          });
        }

        where.cost.gte = parsedMinCost.toFixed(2);
      }

      if (maxCost !== undefined) {
        const parsedMaxCost =
          parseNonNegativeNumber(maxCost);

        if (parsedMaxCost === null) {
          return res.status(400).json({
            success: false,
            message:
              "Maximum cost must be a valid non-negative number.",
          });
        }

        where.cost.lte = parsedMaxCost.toFixed(2);
      }

      if (
        minCost !== undefined &&
        maxCost !== undefined &&
        Number(minCost) > Number(maxCost)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Minimum cost cannot be greater than maximum cost.",
        });
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
      }),
    ]);

    const formattedFuelLogs = fuelLogs.map(
      (fuelLog) => ({
        ...fuelLog,
        cost: decimalToNumber(fuelLog.cost),
      })
    );

    const totalPages = Math.ceil(
      totalFuelLogs / limit
    );

    return res.status(200).json({
      success: true,
      message: "Fuel logs fetched successfully",

      pagination: {
        currentPage: page,
        limit,
        totalFuelLogs,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
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
      },

      filters: {
        vehicleId: vehicleId || null,
        tripId: tripId || null,
        from: from || null,
        to: to || null,
        search: search || null,
      },

      fuelLogs: formattedFuelLogs,
    });
  } catch (error) {
    next(error);
  }
}

/*
|--------------------------------------------------------------------------
| GET FUEL LOG BY ID
|--------------------------------------------------------------------------
|
| GET /api/fuel/:id
|
*/

async function getFuelLogById(req, res, next) {
  try {
    const { id } = req.params;

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
      return res.status(404).json({
        success: false,
        message: "Fuel log not found",
      });
    }

    let tripDistance = 0;
    let fuelEfficiency = 0;

    if (fuelLog.trip) {
      tripDistance = Number(
        fuelLog.trip.actualDistance ??
          fuelLog.trip.plannedDistance ??
          0
      );

      if (fuelLog.liters > 0) {
        fuelEfficiency =
          tripDistance / fuelLog.liters;
      }
    }

    return res.status(200).json({
      success: true,

      fuelLog: {
        ...fuelLog,
        cost: decimalToNumber(fuelLog.cost),
        tripDistance: roundNumber(tripDistance),
        fuelEfficiency: roundNumber(
          fuelEfficiency
        ),
      },
    });
  } catch (error) {
    next(error);
  }
}

/*
|--------------------------------------------------------------------------
| CREATE FUEL LOG
|--------------------------------------------------------------------------
|
| POST /api/fuel
|
| Body:
|
| {
|   "vehicleId": "vehicle-uuid",
|   "tripId": "trip-uuid",
|   "liters": 35,
|   "cost": 3500,
|   "date": "2026-07-12",
|   "odometerReading": 15600
| }
|
*/

async function createFuelLog(req, res, next) {
  try {
    const {
      vehicleId,
      tripId,
      liters,
      cost,
      date,
      odometerReading,
    } = req.body;

    if (
      !vehicleId ||
      liters === undefined ||
      cost === undefined
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Vehicle ID, liters and cost are required.",
      });
    }

    const parsedLiters =
      parsePositiveNumber(liters);

    if (parsedLiters === null) {
      return res.status(400).json({
        success: false,
        message:
          "Liters must be a number greater than zero.",
      });
    }

    const parsedCost = parsePositiveNumber(cost);

    if (parsedCost === null) {
      return res.status(400).json({
        success: false,
        message:
          "Cost must be a number greater than zero.",
      });
    }

    let parsedOdometer;

    if (odometerReading !== undefined) {
      parsedOdometer =
        parseNonNegativeNumber(odometerReading);

      if (parsedOdometer === null) {
        return res.status(400).json({
          success: false,
          message:
            "Odometer reading must be a valid non-negative number.",
        });
      }
    }

    let parsedDate = new Date();

    if (date !== undefined) {
      parsedDate = parseDate(date);

      if (!parsedDate) {
        return res.status(400).json({
          success: false,
          message: "Invalid fuel log date.",
        });
      }
    }

    const validation =
      await validateVehicleAndTrip({
        vehicleId,
        tripId: tripId || null,
      });

    if (!validation.valid) {
      return res
        .status(validation.statusCode)
        .json({
          success: false,
          message: validation.message,
        });
    }

    
    if (
      parsedOdometer !== undefined &&
      parsedOdometer <
        Number(validation.vehicle.odometer)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Odometer reading cannot be less than the current vehicle odometer.",
      });
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

    return res.status(201).json({
      success: true,
      message: "Fuel log created successfully",

      fuelLog: {
        ...fuelLog,
        cost: decimalToNumber(fuelLog.cost),
      },
    });
  } catch (error) {
    next(error);
  }
}

/*
|--------------------------------------------------------------------------
| UPDATE FUEL LOG
|--------------------------------------------------------------------------
|
| PATCH /api/fuel/:id
|
*/

async function updateFuelLog(req, res, next) {
  try {
    const { id } = req.params;

    const {
      vehicleId,
      tripId,
      liters,
      cost,
      date,
      odometerReading,
    } = req.body;

    const existingFuelLog =
      await prisma.fuelLog.findUnique({
        where: {
          id,
        },
      });

    if (!existingFuelLog) {
      return res.status(404).json({
        success: false,
        message: "Fuel log not found",
      });
    }

    const updateData = {};

    const finalVehicleId =
      vehicleId !== undefined
        ? vehicleId
        : existingFuelLog.vehicleId;

    const finalTripId =
      tripId !== undefined
        ? tripId || null
        : existingFuelLog.tripId;

   
    let validation;

    if (
      vehicleId !== undefined ||
      tripId !== undefined ||
      odometerReading !== undefined
    ) {
      validation =
        await validateVehicleAndTrip({
          vehicleId: finalVehicleId,
          tripId: finalTripId,
        });

      if (!validation.valid) {
        return res
          .status(validation.statusCode)
          .json({
            success: false,
            message: validation.message,
          });
      }
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
        return res.status(400).json({
          success: false,
          message:
            "Liters must be a number greater than zero.",
        });
      }

      updateData.liters = parsedLiters;
    }

    if (cost !== undefined) {
      const parsedCost =
        parsePositiveNumber(cost);

      if (parsedCost === null) {
        return res.status(400).json({
          success: false,
          message:
            "Cost must be a number greater than zero.",
        });
      }

      updateData.cost = parsedCost.toFixed(2);
    }

    if (date !== undefined) {
      const parsedDate = parseDate(date);

      if (!parsedDate) {
        return res.status(400).json({
          success: false,
          message: "Invalid fuel log date.",
        });
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
          return res.status(400).json({
            success: false,
            message:
              "Odometer reading must be a valid non-negative number.",
          });
        }

        if (
          parsedOdometer <
          Number(validation.vehicle.odometer)
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Odometer reading cannot be less than the current vehicle odometer.",
          });
        }

        updateData.odometerReading =
          parsedOdometer;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "Provide at least one field to update.",
      });
    }

    const updatedFuelLog =
      await prisma.$transaction(
        async (transaction) => {
          const fuelLog =
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

          return fuelLog;
        }
      );

    return res.status(200).json({
      success: true,
      message: "Fuel log updated successfully",

      fuelLog: {
        ...updatedFuelLog,
        cost: decimalToNumber(
          updatedFuelLog.cost
        ),
      },
    });
  } catch (error) {
    if (isPrismaNotFoundError(error)) {
      return res.status(404).json({
        success: false,
        message: "Fuel log not found",
      });
    }

    next(error);
  }
}

/*
|--------------------------------------------------------------------------
| DELETE FUEL LOG
|--------------------------------------------------------------------------
|
| DELETE /api/fuel/:id
|
*/

async function deleteFuelLog(req, res, next) {
  try {
    const { id } = req.params;

    const existingFuelLog =
      await prisma.fuelLog.findUnique({
        where: {
          id,
        },

        select: {
          id: true,
          liters: true,
          cost: true,
          date: true,
          vehicleId: true,
          tripId: true,
        },
      });

    if (!existingFuelLog) {
      return res.status(404).json({
        success: false,
        message: "Fuel log not found",
      });
    }

    await prisma.fuelLog.delete({
      where: {
        id,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Fuel log deleted successfully",

      deletedFuelLog: {
        ...existingFuelLog,
        cost: decimalToNumber(
          existingFuelLog.cost
        ),
      },
    });
  } catch (error) {
    if (isPrismaNotFoundError(error)) {
      return res.status(404).json({
        success: false,
        message: "Fuel log not found",
      });
    }

    next(error);
  }
}

/*
|--------------------------------------------------------------------------
| FUEL SUMMARY
|--------------------------------------------------------------------------
|
| GET /api/fuel/summary
|
| Optional queries:
|
| ?vehicleId=vehicle-id
| ?tripId=trip-id
| ?from=2026-01-01
| ?to=2026-12-31
|
*/

async function getFuelSummary(req, res, next) {
  try {
    const {
      vehicleId,
      tripId,
      from,
      to,
    } = req.query;

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
      return res.status(400).json({
        success: false,
        message: "Invalid from date",
      });
    }

    if (to && !toDate) {
      return res.status(400).json({
        success: false,
        message: "Invalid to date",
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
      fuelAggregate,
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

    const totalLiters = Number(
      fuelAggregate._sum.liters || 0
    );

    const totalFuelCost = decimalToNumber(
      fuelAggregate._sum.cost
    );

    let totalDistance = 0;

    completedTrips.forEach((trip) => {
      totalDistance += Number(
        trip.actualDistance ??
          trip.plannedDistance ??
          0
      );
    });

    const fuelEfficiency =
      totalLiters > 0
        ? totalDistance / totalLiters
        : 0;

    /*
     * Vehicle details groupBy मधून येत नाहीत,
     * म्हणून वेगळे fetch करतो.
     */
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

    const vehicleFuelDistribution =
      vehicleGroups.map((item) => ({
        vehicle:
          vehicleMap.get(item.vehicleId) || {
            id: item.vehicleId,
          },

        totalLogs: item._count._all,

        totalLiters: roundNumber(
          item._sum.liters || 0
        ),

        totalCost: roundNumber(
          decimalToNumber(item._sum.cost)
        ),
      }));

    return res.status(200).json({
      success: true,
      message:
        "Fuel summary fetched successfully",

      filters: {
        vehicleId: vehicleId || null,
        tripId: tripId || null,
        from: from || null,
        to: to || null,
      },

      summary: {
        totalFuelLogs:
          fuelAggregate._count._all,

        totalDistance:
          roundNumber(totalDistance),

        totalLiters:
          roundNumber(totalLiters),

        totalFuelCost:
          roundNumber(totalFuelCost),

        averageLiters: roundNumber(
          fuelAggregate._avg.liters || 0
        ),

        averageFuelCost: roundNumber(
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

        minimumFuelCost: roundNumber(
          decimalToNumber(
            fuelAggregate._min.cost
          )
        ),

        maximumFuelCost: roundNumber(
          decimalToNumber(
            fuelAggregate._max.cost
          )
        ),

        fuelEfficiency: roundNumber(
          fuelEfficiency
        ),

        fuelEfficiencyUnit: "km/liter",
      },

      vehicleFuelDistribution,
    });
  } catch (error) {
    next(error);
  }
}



module.exports = {
  getAllFuelLogs,
  getFuelLogById,
  createFuelLog,
  updateFuelLog,
  deleteFuelLog,
  getFuelSummary,
};