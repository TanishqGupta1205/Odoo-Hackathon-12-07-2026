const { prisma } = require("../config/db");

const MAINTENANCE_STATUSES = ["ACTIVE", "CLOSED"];

const ALLOWED_SORT_FIELDS = [
  "type",
  "cost",
  "startDate",
  "endDate",
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

function parsePositiveInteger(value, defaultValue) {
  const parsedValue = Number.parseInt(value, 10);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    return defaultValue;
  }

  return parsedValue;
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

function parseCost(value) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  const cost = Number(value);

  if (!Number.isFinite(cost) || cost < 0) {
    return null;
  }

  return cost.toFixed(2);
}

function decimalToNumber(value) {
  if (value === null || value === undefined) {
    return 0;
  }

  return Number(value);
}

function isPrismaNotFoundError(error) {
  return error && error.code === "P2025";
}

async function getAllMaintenance(req, res, next) {
  try {
    const {
      vehicleId,
      status,
      type,
      search,
      from,
      to,
      sortBy = "startDate",
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
      !MAINTENANCE_STATUSES.includes(
        normalizedStatus
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid maintenance status. Use ACTIVE or CLOSED.",
      });
    }

    const safeSortBy = ALLOWED_SORT_FIELDS.includes(
      sortBy
    )
      ? sortBy
      : "startDate";

    const safeSortOrder =
      String(sortOrder).toLowerCase() === "asc"
        ? "asc"
        : "desc";

    const where = {};

    if (vehicleId) {
      where.vehicleId = vehicleId;
    }

    if (normalizedStatus) {
      where.status = normalizedStatus;
    }

    if (type && String(type).trim()) {
      where.type = {
        equals: String(type).trim(),
        mode: "insensitive",
      };
    }

    if (search && String(search).trim()) {
      const searchValue = String(search).trim();

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
      where.startDate = {};

      if (fromDate) {
        where.startDate.gte = fromDate;
      }

      if (toDate) {
        where.startDate.lte = toDate;
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
              odometer: true,
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
      }),
    ]);

    const formattedLogs = maintenanceLogs.map(
      (maintenance) => ({
        ...maintenance,
        cost: decimalToNumber(maintenance.cost),
      })
    );

    const totalPages = Math.ceil(
      totalMaintenance / limit
    );

    return res.status(200).json({
      success: true,
      message:
        "Maintenance records fetched successfully",
      pagination: {
        currentPage: page,
        limit,
        totalMaintenance,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
      summary: {
        totalCost: decimalToNumber(
          costAggregate._sum.cost
        ),
        averageCost: decimalToNumber(
          costAggregate._avg.cost
        ),
      },
      maintenanceLogs: formattedLogs,
    });
  } catch (error) {
    next(error);
  }
}

async function getActiveMaintenance(
  req,
  res,
  next
) {
  try {
    const maintenanceLogs =
      await prisma.maintenance.findMany({
        where: {
          status: "ACTIVE",
        },
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
              status: true,
            },
          },
        },
      });

    return res.status(200).json({
      success: true,
      count: maintenanceLogs.length,
      maintenanceLogs: maintenanceLogs.map(
        (maintenance) => ({
          ...maintenance,
          cost: decimalToNumber(
            maintenance.cost
          ),
        })
      ),
    });
  } catch (error) {
    next(error);
  }
}

async function getMaintenanceById(
  req,
  res,
  next
) {
  try {
    const { id } = req.params;

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
            },
          },
        },
      });

    if (!maintenance) {
      return res.status(404).json({
        success: false,
        message: "Maintenance record not found",
      });
    }

    return res.status(200).json({
      success: true,
      maintenance: {
        ...maintenance,
        cost: decimalToNumber(maintenance.cost),
        vehicle: {
          ...maintenance.vehicle,
          acquisitionCost: decimalToNumber(
            maintenance.vehicle.acquisitionCost
          ),
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

async function createMaintenance(
  req,
  res,
  next
) {
  try {
    const {
      vehicleId,
      type,
      description,
      cost,
      startDate,
    } = req.body;

    if (!vehicleId || !type) {
      return res.status(400).json({
        success: false,
        message:
          "Vehicle ID and maintenance type are required.",
      });
    }

    if (!String(type).trim()) {
      return res.status(400).json({
        success: false,
        message:
          "Maintenance type cannot be empty.",
      });
    }

    const parsedCost =
      cost === undefined ? "0.00" : parseCost(cost);

    if (parsedCost === null) {
      return res.status(400).json({
        success: false,
        message:
          "Maintenance cost must be a valid non-negative number.",
      });
    }

    let parsedStartDate = new Date();

    if (startDate !== undefined) {
      parsedStartDate = parseDate(startDate);

      if (!parsedStartDate) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid maintenance start date.",
        });
      }
    }

    const vehicle =
      await prisma.vehicle.findUnique({
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
      return res.status(404).json({
        success: false,
        message: "Vehicle not found",
      });
    }

    if (vehicle.status === "RETIRED") {
      return res.status(409).json({
        success: false,
        message:
          "Retired vehicle cannot be added to active maintenance.",
      });
    }

    if (vehicle.status === "ON_TRIP") {
      return res.status(409).json({
        success: false,
        message:
          "Vehicle is currently on a trip. Complete or cancel the trip first.",
      });
    }

    const activeMaintenance =
      await prisma.maintenance.findFirst({
        where: {
          vehicleId,
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
          "This vehicle already has an active maintenance record.",
      });
    }

    const maintenance =
      await prisma.$transaction(
        async (transaction) => {
          const createdMaintenance =
            await transaction.maintenance.create({
              data: {
                vehicleId,
                type: String(type).trim(),
                description: description
                  ? String(description).trim()
                  : null,
                cost: parsedCost,
                startDate: parsedStartDate,
                status: "ACTIVE",
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

          await transaction.vehicle.update({
            where: {
              id: vehicleId,
            },
            data: {
              status: "IN_SHOP",
            },
          });

          return createdMaintenance;
        }
      );

    return res.status(201).json({
      success: true,
      message:
        "Maintenance record created successfully",
      maintenance: {
        ...maintenance,
        cost: decimalToNumber(maintenance.cost),
        vehicle: {
          ...maintenance.vehicle,
          status: "IN_SHOP",
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

async function updateMaintenance(
  req,
  res,
  next
) {
  try {
    const { id } = req.params;

    const {
      type,
      description,
      cost,
      startDate,
    } = req.body;

    const existingMaintenance =
      await prisma.maintenance.findUnique({
        where: {
          id,
        },
      });

    if (!existingMaintenance) {
      return res.status(404).json({
        success: false,
        message: "Maintenance record not found",
      });
    }

    const updateData = {};

    if (type !== undefined) {
      if (!String(type).trim()) {
        return res.status(400).json({
          success: false,
          message:
            "Maintenance type cannot be empty.",
        });
      }

      updateData.type = String(type).trim();
    }

    if (description !== undefined) {
      updateData.description = description
        ? String(description).trim()
        : null;
    }

    if (cost !== undefined) {
      const parsedCost = parseCost(cost);

      if (parsedCost === null) {
        return res.status(400).json({
          success: false,
          message:
            "Maintenance cost must be a valid non-negative number.",
        });
      }

      updateData.cost = parsedCost;
    }

    if (startDate !== undefined) {
      const parsedStartDate =
        parseDate(startDate);

      if (!parsedStartDate) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid maintenance start date.",
        });
      }

      if (
        existingMaintenance.endDate &&
        parsedStartDate >
          existingMaintenance.endDate
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Start date cannot be after end date.",
        });
      }

      updateData.startDate = parsedStartDate;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "Provide at least one field to update.",
      });
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
              status: true,
            },
          },
        },
      });

    return res.status(200).json({
      success: true,
      message:
        "Maintenance record updated successfully",
      maintenance: {
        ...maintenance,
        cost: decimalToNumber(maintenance.cost),
      },
    });
  } catch (error) {
    if (isPrismaNotFoundError(error)) {
      return res.status(404).json({
        success: false,
        message: "Maintenance record not found",
      });
    }

    next(error);
  }
}

async function closeMaintenance(
  req,
  res,
  next
) {
  try {
    const { id } = req.params;
    const { endDate, cost } = req.body;

    const maintenance =
      await prisma.maintenance.findUnique({
        where: {
          id,
        },
        include: {
          vehicle: {
            select: {
              id: true,
              status: true,
              registrationNumber: true,
              vehicleName: true,
            },
          },
        },
      });

    if (!maintenance) {
      return res.status(404).json({
        success: false,
        message: "Maintenance record not found",
      });
    }

    if (maintenance.status === "CLOSED") {
      return res.status(409).json({
        success: false,
        message:
          "Maintenance record is already closed.",
      });
    }

    let parsedEndDate = new Date();

    if (endDate !== undefined) {
      parsedEndDate = parseDate(endDate, true);

      if (!parsedEndDate) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid maintenance end date.",
        });
      }
    }

    if (parsedEndDate < maintenance.startDate) {
      return res.status(400).json({
        success: false,
        message:
          "End date cannot be before start date.",
      });
    }

    const updateData = {
      status: "CLOSED",
      endDate: parsedEndDate,
    };

    if (cost !== undefined) {
      const parsedCost = parseCost(cost);

      if (parsedCost === null) {
        return res.status(400).json({
          success: false,
          message:
            "Maintenance cost must be a valid non-negative number.",
        });
      }

      updateData.cost = parsedCost;
    }

    const result = await prisma.$transaction(
      async (transaction) => {
        const closedMaintenance =
          await transaction.maintenance.update({
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
                  status: true,
                },
              },
            },
          });

        let vehicleStatus =
          maintenance.vehicle.status;

        if (
          maintenance.vehicle.status !== "RETIRED"
        ) {
          const updatedVehicle =
            await transaction.vehicle.update({
              where: {
                id: maintenance.vehicleId,
              },
              data: {
                status: "AVAILABLE",
              },
              select: {
                status: true,
              },
            });

          vehicleStatus = updatedVehicle.status;
        }

        return {
          closedMaintenance,
          vehicleStatus,
        };
      }
    );

    return res.status(200).json({
      success: true,
      message:
        "Maintenance record closed successfully",
      maintenance: {
        ...result.closedMaintenance,
        cost: decimalToNumber(
          result.closedMaintenance.cost
        ),
        vehicle: {
          ...result.closedMaintenance.vehicle,
          status: result.vehicleStatus,
        },
      },
    });
  } catch (error) {
    if (isPrismaNotFoundError(error)) {
      return res.status(404).json({
        success: false,
        message: "Maintenance record not found",
      });
    }

    next(error);
  }
}

async function deleteMaintenance(
  req,
  res,
  next
) {
  try {
    const { id } = req.params;

    const maintenance =
      await prisma.maintenance.findUnique({
        where: {
          id,
        },
        select: {
          id: true,
          status: true,
          type: true,
          cost: true,
          vehicleId: true,
        },
      });

    if (!maintenance) {
      return res.status(404).json({
        success: false,
        message: "Maintenance record not found",
      });
    }

    if (maintenance.status === "ACTIVE") {
      return res.status(409).json({
        success: false,
        message:
          "Active maintenance record cannot be deleted. Close it first.",
      });
    }

    await prisma.maintenance.delete({
      where: {
        id,
      },
    });

    return res.status(200).json({
      success: true,
      message:
        "Maintenance record deleted successfully",
      deletedMaintenance: {
        ...maintenance,
        cost: decimalToNumber(maintenance.cost),
      },
    });
  } catch (error) {
    if (isPrismaNotFoundError(error)) {
      return res.status(404).json({
        success: false,
        message: "Maintenance record not found",
      });
    }

    next(error);
  }
}

async function getMaintenanceSummary(
  req,
  res,
  next
) {
  try {
    const { vehicleId, from, to } = req.query;

    const where = {};

    if (vehicleId) {
      where.vehicleId = vehicleId;
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
      where.startDate = {};

      if (fromDate) {
        where.startDate.gte = fromDate;
      }

      if (toDate) {
        where.startDate.lte = toDate;
      }
    }

    const [aggregate, statusGroups, typeGroups] =
      await Promise.all([
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
      ]);

    return res.status(200).json({
      success: true,
      message:
        "Maintenance summary fetched successfully",
      summary: {
        totalMaintenance:
          aggregate._count._all,
        totalCost: decimalToNumber(
          aggregate._sum.cost
        ),
        averageCost: decimalToNumber(
          aggregate._avg.cost
        ),
        minimumCost: decimalToNumber(
          aggregate._min.cost
        ),
        maximumCost: decimalToNumber(
          aggregate._max.cost
        ),
      },
      statusDistribution: statusGroups.map(
        (item) => ({
          status: item.status,
          count: item._count._all,
          totalCost: decimalToNumber(
            item._sum.cost
          ),
        })
      ),
      typeDistribution: typeGroups.map(
        (item) => ({
          type: item.type,
          count: item._count._all,
          totalCost: decimalToNumber(
            item._sum.cost
          ),
        })
      ),
    });
  } catch (error) {
    next(error);
  }
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