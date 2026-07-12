const { prisma } = require("../config/db");

const MAINTENANCE_STATUSES = [
  "ACTIVE",
  "CLOSED",
];

const ALLOWED_SORT_FIELDS = [
  "type",
  "cost",
  "startDate",
  "endDate",
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

function parsePositiveInteger(
  value,
  defaultValue
) {
  const parsedValue = Number.parseInt(
    value,
    10
  );

  if (
    !Number.isInteger(parsedValue) ||
    parsedValue <= 0
  ) {
    return defaultValue;
  }

  return parsedValue;
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

  if (
    !Number.isFinite(number) ||
    number < 0
  ) {
    return null;
  }

  return number;
}

function parseDate(
  value,
  endOfDay = false
) {
  if (!value) return null;

  if (
    /^\d{4}-\d{2}-\d{2}$/.test(
      String(value)
    )
  ) {
    const suffix = endOfDay
      ? "T23:59:59.999Z"
      : "T00:00:00.000Z";

    const date = new Date(
      `${value}${suffix}`
    );

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
  if (
    value === null ||
    value === undefined
  ) {
    return 0;
  }

  return Number(value);
}

function roundNumber(
  value,
  decimalPlaces = 2
) {
  const multiplier =
    10 ** decimalPlaces;

  return (
    Math.round(
      (Number(value) +
        Number.EPSILON) *
        multiplier
    ) / multiplier
  );
}

function formatMaintenance(
  maintenance
) {
  if (!maintenance) return null;

  return {
    ...maintenance,
    cost: decimalToNumber(
      maintenance.cost
    ),
    vehicle:
      maintenance.vehicle
        ? {
            ...maintenance.vehicle,
            acquisitionCost:
              maintenance.vehicle
                .acquisitionCost !==
              undefined
                ? decimalToNumber(
                    maintenance.vehicle
                      .acquisitionCost
                  )
                : undefined,
          }
        : undefined,
  };
}

function handlePrismaError(error) {
  if (error?.statusCode) {
    throw error;
  }

  if (error?.code === "P2025") {
    throw createHttpError(
      404,
      "Maintenance record not found."
    );
  }

  if (error?.code === "P2003") {
    throw createHttpError(
      400,
      "Invalid vehicle reference."
    );
  }

  throw error;
}

async function getAllMaintenance(
  filters = {}
) {
  const {
    vehicleId,
    status,
    type,
    search,
    from,
    to,
    minCost,
    maxCost,
    sortBy = "startDate",
    sortOrder = "desc",
  } = filters;

  const page = parsePositiveInteger(
    filters.page,
    1
  );

  const requestedLimit =
    parsePositiveInteger(
      filters.limit,
      10
    );

  const limit = Math.min(
    requestedLimit,
    100
  );

  const skip =
    (page - 1) * limit;

  const normalizedStatus =
    normalizeStatus(status);

  if (
    normalizedStatus &&
    !MAINTENANCE_STATUSES.includes(
      normalizedStatus
    )
  ) {
    throw createHttpError(
      400,
      "Invalid maintenance status. Use ACTIVE or CLOSED."
    );
  }

  const safeSortBy =
    ALLOWED_SORT_FIELDS.includes(sortBy)
      ? sortBy
      : "startDate";

  const safeSortOrder =
    String(sortOrder).toLowerCase() ===
    "asc"
      ? "asc"
      : "desc";

  const where = {};

  if (vehicleId) {
    where.vehicleId = vehicleId;
  }

  if (normalizedStatus) {
    where.status = normalizedStatus;
  }

  if (
    type &&
    String(type).trim()
  ) {
    where.type = {
      equals: String(type).trim(),
      mode: "insensitive",
    };
  }

  if (
    search &&
    String(search).trim()
  ) {
    const searchValue =
      String(search).trim();

    where.OR = [
      {
        type: {
          contains: searchValue,
          mode: "insensitive",
        },
      },
      {
        description: {
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
        vehicle: {
          is: {
            model: {
              contains: searchValue,
              mode: "insensitive",
            },
          },
        },
      },
    ];
  }

  const fromDate =
    parseDate(from);

  const toDate =
    parseDate(to, true);

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
    where.startDate = {};

    if (fromDate) {
      where.startDate.gte =
        fromDate;
    }

    if (toDate) {
      where.startDate.lte =
        toDate;
    }
  }

  if (
    minCost !== undefined ||
    maxCost !== undefined
  ) {
    where.cost = {};

    if (minCost !== undefined) {
      const parsedMinCost =
        parseNonNegativeNumber(
          minCost
        );

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
        parseNonNegativeNumber(
          maxCost
        );

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
      Number(minCost) >
        Number(maxCost)
    ) {
      throw createHttpError(
        400,
        "Minimum cost cannot be greater than maximum cost."
      );
    }
  }

  const [
    maintenanceLogs,
    totalMaintenance,
    costAggregate,
  ] = await prisma.$transaction([
    prisma.maintenance.findMany({
      where,
      skip,
      take: limit,
      orderBy: {
        [safeSortBy]:
          safeSortOrder,
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
            region: true,
            status: true,
          },
        },
      },
    }),

    prisma.maintenance.count({
      where,
    }),

    prisma.maintenance.aggregate({
      where,
      _sum: {
        cost: true,
      },
      _avg: {
        cost: true,
      },
      _min: {
        cost: true,
      },
      _max: {
        cost: true,
      },
    }),
  ]);

  const totalPages = Math.ceil(
    totalMaintenance / limit
  );

  return {
    pagination: {
      currentPage: page,
      limit,
      totalMaintenance,
      totalPages,
      hasNextPage:
        page < totalPages,
      hasPreviousPage:
        page > 1,
    },

    filters: {
      vehicleId:
        vehicleId || null,
      status:
        normalizedStatus,
      type:
        type || null,
      search:
        search || null,
      from:
        from || null,
      to:
        to || null,
      minCost:
        minCost || null,
      maxCost:
        maxCost || null,
    },

    summary: {
      totalCost: roundNumber(
        decimalToNumber(
          costAggregate._sum.cost
        )
      ),
      averageCost: roundNumber(
        decimalToNumber(
          costAggregate._avg.cost
        )
      ),
      minimumCost: roundNumber(
        decimalToNumber(
          costAggregate._min.cost
        )
      ),
      maximumCost: roundNumber(
        decimalToNumber(
          costAggregate._max.cost
        )
      ),
    },

    maintenanceLogs:
      maintenanceLogs.map(
        formatMaintenance
      ),
  };
}

async function getActiveMaintenance(
  filters = {}
) {
  const {
    vehicleId,
    type,
    search,
  } = filters;

  const where = {
    status: "ACTIVE",
  };

  if (vehicleId) {
    where.vehicleId = vehicleId;
  }

  if (
    type &&
    String(type).trim()
  ) {
    where.type = {
      equals: String(type).trim(),
      mode: "insensitive",
    };
  }

  if (
    search &&
    String(search).trim()
  ) {
    const searchValue =
      String(search).trim();

    where.OR = [
      {
        type: {
          contains: searchValue,
          mode: "insensitive",
        },
      },
      {
        description: {
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
    ];
  }

  const maintenanceLogs =
    await prisma.maintenance.findMany({
      where,
      orderBy: {
        startDate: "desc",
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
            region: true,
            status: true,
          },
        },
      },
    });

  return maintenanceLogs.map(
    formatMaintenance
  );
}

async function getMaintenanceById(id) {
  if (!id) {
    throw createHttpError(
      400,
      "Maintenance ID is required."
    );
  }

  const maintenance =
    await prisma.maintenance.findUnique({
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
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

  if (!maintenance) {
    throw createHttpError(
      404,
      "Maintenance record not found."
    );
  }

  return formatMaintenance(
    maintenance
  );
}

async function createMaintenance(data) {
  try {
    const {
      vehicleId,
      type,
      description,
      cost,
      startDate,
    } = data;

    if (
      !vehicleId ||
      !type ||
      !String(type).trim()
    ) {
      throw createHttpError(
        400,
        "Vehicle ID and maintenance type are required."
      );
    }

    const parsedCost =
      cost === undefined
        ? 0
        : parseNonNegativeNumber(
            cost
          );

    if (parsedCost === null) {
      throw createHttpError(
        400,
        "Maintenance cost must be a valid non-negative number."
      );
    }

    let parsedStartDate =
      new Date();

    if (startDate !== undefined) {
      parsedStartDate =
        parseDate(startDate);

      if (!parsedStartDate) {
        throw createHttpError(
          400,
          "Invalid maintenance start date."
        );
      }
    }

    const maintenance =
      await prisma.$transaction(
        async (transaction) => {
          const vehicle =
            await transaction.vehicle.findUnique({
              where: {
                id: vehicleId,
              },
              select: {
                id: true,
                registrationNumber: true,
                vehicleName: true,
                status: true,
              },
            });

          if (!vehicle) {
            throw createHttpError(
              404,
              "Vehicle not found."
            );
          }

          if (
            vehicle.status ===
            "RETIRED"
          ) {
            throw createHttpError(
              409,
              "Retired vehicle cannot be added to active maintenance."
            );
          }

          if (
            vehicle.status ===
            "ON_TRIP"
          ) {
            throw createHttpError(
              409,
              "Vehicle is currently on a trip. Complete or cancel the trip first."
            );
          }

          const activeMaintenance =
            await transaction.maintenance.findFirst({
              where: {
                vehicleId,
                status: "ACTIVE",
              },
              select: {
                id: true,
              },
            });

          if (activeMaintenance) {
            throw createHttpError(
              409,
              "Vehicle already has an active maintenance record."
            );
          }

          if (
            vehicle.status !==
            "AVAILABLE"
          ) {
            throw createHttpError(
              409,
              `Vehicle is not available for maintenance. Current status: ${vehicle.status}`
            );
          }

          const vehicleUpdate =
            await transaction.vehicle.updateMany({
              where: {
                id: vehicleId,
                status: "AVAILABLE",
              },
              data: {
                status: "IN_SHOP",
              },
            });

          if (
            vehicleUpdate.count !== 1
          ) {
            throw createHttpError(
              409,
              "Vehicle status changed. Please try again."
            );
          }

          return transaction.maintenance.create({
            data: {
              vehicleId,
              type: String(type).trim(),
              description:
                description
                  ? String(
                      description
                    ).trim()
                  : null,
              cost:
                parsedCost.toFixed(2),
              startDate:
                parsedStartDate,
              status: "ACTIVE",
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
            },
          });
        },
        {
          isolationLevel:
            "Serializable",
        }
      );

    return formatMaintenance(
      maintenance
    );
  } catch (error) {
    handlePrismaError(error);
  }
}

async function updateMaintenance(
  id,
  data
) {
  try {
    if (!id) {
      throw createHttpError(
        400,
        "Maintenance ID is required."
      );
    }

    const existingMaintenance =
      await prisma.maintenance.findUnique({
        where: {
          id,
        },
      });

    if (!existingMaintenance) {
      throw createHttpError(
        404,
        "Maintenance record not found."
      );
    }

    const {
      type,
      description,
      cost,
      startDate,
    } = data;

    const updateData = {};

    if (type !== undefined) {
      if (!String(type).trim()) {
        throw createHttpError(
          400,
          "Maintenance type cannot be empty."
        );
      }

      updateData.type =
        String(type).trim();
    }

    if (
      description !== undefined
    ) {
      updateData.description =
        description
          ? String(
              description
            ).trim()
          : null;
    }

    if (cost !== undefined) {
      const parsedCost =
        parseNonNegativeNumber(cost);

      if (parsedCost === null) {
        throw createHttpError(
          400,
          "Maintenance cost must be a valid non-negative number."
        );
      }

      updateData.cost =
        parsedCost.toFixed(2);
    }

    if (startDate !== undefined) {
      const parsedStartDate =
        parseDate(startDate);

      if (!parsedStartDate) {
        throw createHttpError(
          400,
          "Invalid maintenance start date."
        );
      }

      if (
        existingMaintenance.endDate &&
        parsedStartDate >
          existingMaintenance.endDate
      ) {
        throw createHttpError(
          400,
          "Start date cannot be after end date."
        );
      }

      updateData.startDate =
        parsedStartDate;
    }

    if (
      Object.keys(updateData)
        .length === 0
    ) {
      throw createHttpError(
        400,
        "Provide at least one field to update."
      );
    }

    const maintenance =
      await prisma.maintenance.update({
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
              model: true,
              type: true,
              odometer: true,
              status: true,
            },
          },
        },
      });

    return formatMaintenance(
      maintenance
    );
  } catch (error) {
    handlePrismaError(error);
  }
}

async function closeMaintenance(
  id,
  data = {}
) {
  try {
    if (!id) {
      throw createHttpError(
        400,
        "Maintenance ID is required."
      );
    }

    const {
      endDate,
      cost,
    } = data;

    let parsedEndDate =
      new Date();

    if (endDate !== undefined) {
      parsedEndDate =
        parseDate(endDate, true);

      if (!parsedEndDate) {
        throw createHttpError(
          400,
          "Invalid maintenance end date."
        );
      }
    }

    let parsedCost;

    if (cost !== undefined) {
      parsedCost =
        parseNonNegativeNumber(cost);

      if (parsedCost === null) {
        throw createHttpError(
          400,
          "Maintenance cost must be a valid non-negative number."
        );
      }
    }

    const maintenance =
      await prisma.$transaction(
        async (transaction) => {
          const existingMaintenance =
            await transaction.maintenance.findUnique({
              where: {
                id,
              },
              include: {
                vehicle: {
                  select: {
                    id: true,
                    registrationNumber: true,
                    vehicleName: true,
                    status: true,
                  },
                },
              },
            });

          if (
            !existingMaintenance
          ) {
            throw createHttpError(
              404,
              "Maintenance record not found."
            );
          }

          if (
            existingMaintenance.status ===
            "CLOSED"
          ) {
            throw createHttpError(
              409,
              "Maintenance record is already closed."
            );
          }

          if (
            parsedEndDate <
            existingMaintenance.startDate
          ) {
            throw createHttpError(
              400,
              "End date cannot be before start date."
            );
          }

          const maintenanceData = {
            status: "CLOSED",
            endDate: parsedEndDate,
          };

          if (
            parsedCost !== undefined
          ) {
            maintenanceData.cost =
              parsedCost.toFixed(2);
          }

          const maintenanceUpdate =
            await transaction.maintenance.updateMany({
              where: {
                id,
                status: "ACTIVE",
              },
              data: maintenanceData,
            });

          if (
            maintenanceUpdate.count !==
            1
          ) {
            throw createHttpError(
              409,
              "Maintenance status changed. Please try again."
            );
          }

          if (
            existingMaintenance
              .vehicle.status ===
            "IN_SHOP"
          ) {
            const vehicleUpdate =
              await transaction.vehicle.updateMany({
                where: {
                  id:
                    existingMaintenance.vehicleId,
                  status: "IN_SHOP",
                },
                data: {
                  status: "AVAILABLE",
                },
              });

            if (
              vehicleUpdate.count !==
              1
            ) {
              throw createHttpError(
                409,
                "Vehicle status changed. Please try again."
              );
            }
          } else if (
            existingMaintenance
              .vehicle.status !==
              "RETIRED" &&
            existingMaintenance
              .vehicle.status !==
              "AVAILABLE"
          ) {
            throw createHttpError(
              409,
              `Maintenance cannot be closed because vehicle status is ${existingMaintenance.vehicle.status}.`
            );
          }

          return transaction.maintenance.findUnique({
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
            },
          });
        },
        {
          isolationLevel:
            "Serializable",
        }
      );

    return formatMaintenance(
      maintenance
    );
  } catch (error) {
    handlePrismaError(error);
  }
}

async function deleteMaintenance(id) {
  try {
    if (!id) {
      throw createHttpError(
        400,
        "Maintenance ID is required."
      );
    }

    const maintenance =
      await prisma.maintenance.findUnique({
        where: {
          id,
        },
        select: {
          id: true,
          vehicleId: true,
          type: true,
          description: true,
          cost: true,
          startDate: true,
          endDate: true,
          status: true,
        },
      });

    if (!maintenance) {
      throw createHttpError(
        404,
        "Maintenance record not found."
      );
    }

    if (
      maintenance.status ===
      "ACTIVE"
    ) {
      throw createHttpError(
        409,
        "Active maintenance record cannot be deleted. Close it first."
      );
    }

    await prisma.maintenance.delete({
      where: {
        id,
      },
    });

    return formatMaintenance(
      maintenance
    );
  } catch (error) {
    handlePrismaError(error);
  }
}

async function getMaintenanceSummary(
  filters = {}
) {
  const {
    vehicleId,
    status,
    type,
    from,
    to,
  } = filters;

  const where = {};

  if (vehicleId) {
    where.vehicleId = vehicleId;
  }

  const normalizedStatus =
    normalizeStatus(status);

  if (
    normalizedStatus &&
    !MAINTENANCE_STATUSES.includes(
      normalizedStatus
    )
  ) {
    throw createHttpError(
      400,
      "Invalid maintenance status. Use ACTIVE or CLOSED."
    );
  }

  if (normalizedStatus) {
    where.status =
      normalizedStatus;
  }

  if (
    type &&
    String(type).trim()
  ) {
    where.type = {
      equals: String(type).trim(),
      mode: "insensitive",
    };
  }

  const fromDate =
    parseDate(from);

  const toDate =
    parseDate(to, true);

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
    where.startDate = {};

    if (fromDate) {
      where.startDate.gte =
        fromDate;
    }

    if (toDate) {
      where.startDate.lte =
        toDate;
    }
  }

  const [
    aggregate,
    statusGroups,
    typeGroups,
    vehicleGroups,
  ] = await Promise.all([
    prisma.maintenance.aggregate({
      where,
      _count: {
        _all: true,
      },
      _sum: {
        cost: true,
      },
      _avg: {
        cost: true,
      },
      _min: {
        cost: true,
      },
      _max: {
        cost: true,
      },
    }),

    prisma.maintenance.groupBy({
      by: ["status"],
      where,
      _count: {
        _all: true,
      },
      _sum: {
        cost: true,
      },
    }),

    prisma.maintenance.groupBy({
      by: ["type"],
      where,
      _count: {
        _all: true,
      },
      _sum: {
        cost: true,
      },
      orderBy: {
        _sum: {
          cost: "desc",
        },
      },
    }),

    prisma.maintenance.groupBy({
      by: ["vehicleId"],
      where,
      _count: {
        _all: true,
      },
      _sum: {
        cost: true,
      },
      orderBy: {
        _sum: {
          cost: "desc",
        },
      },
    }),
  ]);

  const vehicleIds =
    vehicleGroups.map(
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
      vehicleId:
        vehicleId || null,
      status:
        normalizedStatus,
      type:
        type || null,
      from:
        from || null,
      to:
        to || null,
    },

    summary: {
      totalMaintenance:
        aggregate._count._all,
      totalCost: roundNumber(
        decimalToNumber(
          aggregate._sum.cost
        )
      ),
      averageCost: roundNumber(
        decimalToNumber(
          aggregate._avg.cost
        )
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
    },

    statusDistribution:
      statusGroups.map((item) => ({
        status: item.status,
        count: item._count._all,
        totalCost: roundNumber(
          decimalToNumber(
            item._sum.cost
          )
        ),
      })),

    typeDistribution:
      typeGroups.map((item) => ({
        type: item.type,
        count: item._count._all,
        totalCost: roundNumber(
          decimalToNumber(
            item._sum.cost
          )
        ),
      })),

    vehicleDistribution:
      vehicleGroups.map((item) => ({
        vehicle:
          vehicleMap.get(
            item.vehicleId
          ) || {
            id: item.vehicleId,
          },
        count: item._count._all,
        totalCost: roundNumber(
          decimalToNumber(
            item._sum.cost
          )
        ),
      })),
  };
}

module.exports = {
  getAllMaintenance,
  getActiveMaintenance,
  getMaintenanceById,
  createMaintenance,
  updateMaintenance,
  closeMaintenance,
  deleteMaintenance,
  getMaintenanceSummary,
};