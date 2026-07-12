const { prisma } = require("../config/db");

const DRIVER_STATUSES = [
  "AVAILABLE",
  "ON_TRIP",
  "OFF_DUTY",
  "SUSPENDED",
];

const ALLOWED_SORT_FIELDS = [
  "name",
  "licenseNumber",
  "licenseCategory",
  "licenseExpiryDate",
  "contactNumber",
  "safetyScore",
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

function parsePositiveInteger(value, defaultValue) {
  const parsedValue = Number.parseInt(value, 10);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    return defaultValue;
  }

  return parsedValue;
}

function parseDate(value) {
  if (!value) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const date = new Date(`${value}T23:59:59.999Z`);

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

function parseSafetyScore(value) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return undefined;
  }

  const score = Number(value);

  if (
    !Number.isFinite(score) ||
    score < 0 ||
    score > 100
  ) {
    return null;
  }

  return score;
}

function formatDriver(driver) {
  if (!driver) return null;

  return {
    ...driver,
    isLicenseExpired:
      driver.licenseExpiryDate <= new Date(),
    totalTrips:
      driver._count?.trips !== undefined
        ? driver._count.trips
        : undefined,
  };
}

function handlePrismaError(error) {
  if (error?.code === "P2002") {
    throw createHttpError(
      409,
      "A driver with this license number already exists."
    );
  }

  if (error?.code === "P2025") {
    throw createHttpError(404, "Driver not found.");
  }

  throw error;
}

async function getAllDrivers(filters = {}) {
  const {
    search,
    status,
    licenseCategory,
    licenseStatus,
    expiringInDays,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = filters;

  const page = parsePositiveInteger(filters.page, 1);

  const requestedLimit = parsePositiveInteger(
    filters.limit,
    10
  );

  const limit = Math.min(requestedLimit, 100);
  const skip = (page - 1) * limit;

  const normalizedStatus = normalizeStatus(status);

  if (
    normalizedStatus &&
    !DRIVER_STATUSES.includes(normalizedStatus)
  ) {
    throw createHttpError(
      400,
      "Invalid driver status. Use AVAILABLE, ON_TRIP, OFF_DUTY or SUSPENDED."
    );
  }

  const normalizedLicenseStatus = licenseStatus
    ? String(licenseStatus).trim().toLowerCase()
    : null;

  if (
    normalizedLicenseStatus &&
    !["valid", "expired", "expiring"].includes(
      normalizedLicenseStatus
    )
  ) {
    throw createHttpError(
      400,
      "Invalid license status. Use valid, expired or expiring."
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

  if (search && String(search).trim()) {
    const searchValue = String(search).trim();

    where.OR = [
      {
        name: {
          contains: searchValue,
          mode: "insensitive",
        },
      },
      {
        licenseNumber: {
          contains: searchValue,
          mode: "insensitive",
        },
      },
      {
        contactNumber: {
          contains: searchValue,
          mode: "insensitive",
        },
      },
      {
        licenseCategory: {
          contains: searchValue,
          mode: "insensitive",
        },
      },
    ];
  }

  if (normalizedStatus) {
    where.status = normalizedStatus;
  }

  if (
    licenseCategory &&
    String(licenseCategory).trim()
  ) {
    where.licenseCategory = {
      equals: String(licenseCategory).trim(),
      mode: "insensitive",
    };
  }

  const now = new Date();

  if (normalizedLicenseStatus === "valid") {
    where.licenseExpiryDate = {
      gt: now,
    };
  }

  if (normalizedLicenseStatus === "expired") {
    where.licenseExpiryDate = {
      lte: now,
    };
  }

  if (normalizedLicenseStatus === "expiring") {
    const days = Math.min(
      parsePositiveInteger(expiringInDays, 30),
      365
    );

    const expiryDate = new Date();

    expiryDate.setDate(expiryDate.getDate() + days);

    where.licenseExpiryDate = {
      gt: now,
      lte: expiryDate,
    };
  }

  const [drivers, totalDrivers] =
    await prisma.$transaction([
      prisma.driver.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [safeSortBy]: safeSortOrder,
        },
        select: {
          id: true,
          name: true,
          licenseNumber: true,
          licenseCategory: true,
          licenseExpiryDate: true,
          contactNumber: true,
          safetyScore: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              trips: true,
            },
          },
        },
      }),

      prisma.driver.count({
        where,
      }),
    ]);

  const totalPages = Math.ceil(totalDrivers / limit);

  return {
    pagination: {
      currentPage: page,
      limit,
      totalDrivers,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },

    filters: {
      search: search || null,
      status: normalizedStatus,
      licenseCategory: licenseCategory || null,
      licenseStatus: normalizedLicenseStatus,
    },

    drivers: drivers.map(formatDriver),
  };
}

async function getAvailableDrivers(filters = {}) {
  const { search, licenseCategory } = filters;

  const where = {
    status: "AVAILABLE",
    licenseExpiryDate: {
      gt: new Date(),
    },
  };

  if (
    licenseCategory &&
    String(licenseCategory).trim()
  ) {
    where.licenseCategory = {
      equals: String(licenseCategory).trim(),
      mode: "insensitive",
    };
  }

  if (search && String(search).trim()) {
    const searchValue = String(search).trim();

    where.OR = [
      {
        name: {
          contains: searchValue,
          mode: "insensitive",
        },
      },
      {
        licenseNumber: {
          contains: searchValue,
          mode: "insensitive",
        },
      },
    ];
  }

  return prisma.driver.findMany({
    where,
    orderBy: {
      name: "asc",
    },
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
  });
}

async function getDriverById(id) {
  if (!id) {
    throw createHttpError(
      400,
      "Driver ID is required."
    );
  }

  const driver = await prisma.driver.findUnique({
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
          vehicle: {
            select: {
              id: true,
              registrationNumber: true,
              vehicleName: true,
              type: true,
              status: true,
            },
          },
        },
      },
      _count: {
        select: {
          trips: true,
        },
      },
    },
  });

  if (!driver) {
    throw createHttpError(404, "Driver not found.");
  }

  return formatDriver(driver);
}

async function createDriver(data) {
  try {
    const {
      name,
      licenseNumber,
      licenseCategory,
      licenseExpiryDate,
      contactNumber,
      safetyScore,
      status,
    } = data;

    if (
      !name ||
      !licenseNumber ||
      !licenseCategory ||
      !licenseExpiryDate ||
      !contactNumber
    ) {
      throw createHttpError(
        400,
        "Name, license number, license category, license expiry date and contact number are required."
      );
    }

    const parsedExpiryDate = parseDate(
      licenseExpiryDate
    );

    if (!parsedExpiryDate) {
      throw createHttpError(
        400,
        "Invalid license expiry date."
      );
    }

    const parsedSafetyScore =
      parseSafetyScore(safetyScore);

    if (parsedSafetyScore === null) {
      throw createHttpError(
        400,
        "Safety score must be between 0 and 100."
      );
    }

    const normalizedStatus =
      normalizeStatus(status) || "AVAILABLE";

    if (
      !DRIVER_STATUSES.includes(normalizedStatus)
    ) {
      throw createHttpError(
        400,
        "Invalid driver status."
      );
    }

    if (normalizedStatus === "ON_TRIP") {
      throw createHttpError(
        400,
        "ON_TRIP status cannot be assigned manually."
      );
    }

    const normalizedLicenseNumber =
      String(licenseNumber).trim().toUpperCase();

    const existingDriver =
      await prisma.driver.findUnique({
        where: {
          licenseNumber: normalizedLicenseNumber,
        },
        select: {
          id: true,
        },
      });

    if (existingDriver) {
      throw createHttpError(
        409,
        "A driver with this license number already exists."
      );
    }

    return await prisma.driver.create({
      data: {
        name: String(name).trim(),
        licenseNumber: normalizedLicenseNumber,
        licenseCategory:
          String(licenseCategory).trim(),
        licenseExpiryDate: parsedExpiryDate,
        contactNumber:
          String(contactNumber).trim(),
        safetyScore:
          parsedSafetyScore === undefined
            ? 100
            : parsedSafetyScore,
        status: normalizedStatus,
      },
    });
  } catch (error) {
    handlePrismaError(error);
  }
}

async function updateDriver(id, data) {
  try {
    const existingDriver =
      await prisma.driver.findUnique({
        where: {
          id,
        },
      });

    if (!existingDriver) {
      throw createHttpError(
        404,
        "Driver not found."
      );
    }

    const {
      name,
      licenseNumber,
      licenseCategory,
      licenseExpiryDate,
      contactNumber,
      safetyScore,
      status,
    } = data;

    const updateData = {};

    if (name !== undefined) {
      if (!String(name).trim()) {
        throw createHttpError(
          400,
          "Driver name cannot be empty."
        );
      }

      updateData.name = String(name).trim();
    }

    if (licenseNumber !== undefined) {
      if (!String(licenseNumber).trim()) {
        throw createHttpError(
          400,
          "License number cannot be empty."
        );
      }

      updateData.licenseNumber =
        String(licenseNumber)
          .trim()
          .toUpperCase();
    }

    if (licenseCategory !== undefined) {
      if (!String(licenseCategory).trim()) {
        throw createHttpError(
          400,
          "License category cannot be empty."
        );
      }

      updateData.licenseCategory =
        String(licenseCategory).trim();
    }

    if (contactNumber !== undefined) {
      if (!String(contactNumber).trim()) {
        throw createHttpError(
          400,
          "Contact number cannot be empty."
        );
      }

      updateData.contactNumber =
        String(contactNumber).trim();
    }

    if (licenseExpiryDate !== undefined) {
      const parsedExpiryDate = parseDate(
        licenseExpiryDate
      );

      if (!parsedExpiryDate) {
        throw createHttpError(
          400,
          "Invalid license expiry date."
        );
      }

      updateData.licenseExpiryDate =
        parsedExpiryDate;
    }

    if (safetyScore !== undefined) {
      const parsedSafetyScore =
        parseSafetyScore(safetyScore);

      if (parsedSafetyScore === null) {
        throw createHttpError(
          400,
          "Safety score must be between 0 and 100."
        );
      }

      updateData.safetyScore =
        parsedSafetyScore;
    }

    if (status !== undefined) {
      const normalizedStatus =
        normalizeStatus(status);

      if (
        !DRIVER_STATUSES.includes(
          normalizedStatus
        )
      ) {
        throw createHttpError(
          400,
          "Invalid driver status."
        );
      }

      if (
        normalizedStatus === "ON_TRIP" &&
        existingDriver.status !== "ON_TRIP"
      ) {
        throw createHttpError(
          400,
          "ON_TRIP status cannot be assigned manually."
        );
      }

      if (
        existingDriver.status === "ON_TRIP" &&
        normalizedStatus !== "ON_TRIP"
      ) {
        const activeTrip =
          await prisma.trip.findFirst({
            where: {
              driverId: id,
              status: "DISPATCHED",
            },
            select: {
              id: true,
            },
          });

        if (activeTrip) {
          throw createHttpError(
            409,
            "Driver has an active trip. Complete or cancel the trip first."
          );
        }
      }

      const finalExpiryDate =
        updateData.licenseExpiryDate ||
        existingDriver.licenseExpiryDate;

      if (
        normalizedStatus === "AVAILABLE" &&
        finalExpiryDate <= new Date()
      ) {
        throw createHttpError(
          400,
          "Driver with an expired license cannot be marked AVAILABLE."
        );
      }

      updateData.status = normalizedStatus;
    }

    if (Object.keys(updateData).length === 0) {
      throw createHttpError(
        400,
        "Provide at least one field to update."
      );
    }

    return await prisma.driver.update({
      where: {
        id,
      },
      data: updateData,
    });
  } catch (error) {
    handlePrismaError(error);
  }
}

async function suspendDriver(id) {
  const driver = await prisma.driver.findUnique({
    where: {
      id,
    },
  });

  if (!driver) {
    throw createHttpError(404, "Driver not found.");
  }

  const activeTrip = await prisma.trip.findFirst({
    where: {
      driverId: id,
      status: "DISPATCHED",
    },
    select: {
      id: true,
    },
  });

  if (activeTrip) {
    throw createHttpError(
      409,
      "Driver has an active trip. Complete or cancel it before suspension."
    );
  }

  return prisma.driver.update({
    where: {
      id,
    },
    data: {
      status: "SUSPENDED",
    },
  });
}

async function restoreDriver(id) {
  const driver = await prisma.driver.findUnique({
    where: {
      id,
    },
  });

  if (!driver) {
    throw createHttpError(404, "Driver not found.");
  }

  if (driver.licenseExpiryDate <= new Date()) {
    throw createHttpError(
      400,
      "Driver license has expired. Update the expiry date first."
    );
  }

  const activeTrip = await prisma.trip.findFirst({
    where: {
      driverId: id,
      status: "DISPATCHED",
    },
    select: {
      id: true,
    },
  });

  if (activeTrip) {
    throw createHttpError(
      409,
      "Driver is assigned to an active trip."
    );
  }

  return prisma.driver.update({
    where: {
      id,
    },
    data: {
      status: "AVAILABLE",
    },
  });
}

async function deleteDriver(id) {
  const driver = await prisma.driver.findUnique({
    where: {
      id,
    },
    select: {
      id: true,
      name: true,
      status: true,
      _count: {
        select: {
          trips: true,
        },
      },
    },
  });

  if (!driver) {
    throw createHttpError(404, "Driver not found.");
  }

  if (driver.status === "ON_TRIP") {
    throw createHttpError(
      409,
      "Driver currently has an active trip."
    );
  }

  if (driver._count.trips > 0) {
    throw createHttpError(
      409,
      "Driver has trip history. Set the driver to OFF_DUTY or SUSPENDED instead."
    );
  }

  await prisma.driver.delete({
    where: {
      id,
    },
  });

  return {
    id: driver.id,
    name: driver.name,
  };
}

async function getDriversWithExpiringLicenses(
  days = 30
) {
  const validDays = Math.min(
    parsePositiveInteger(days, 30),
    365
  );

  const now = new Date();
  const expiryLimit = new Date();

  expiryLimit.setDate(
    expiryLimit.getDate() + validDays
  );

  return prisma.driver.findMany({
    where: {
      licenseExpiryDate: {
        gt: now,
        lte: expiryLimit,
      },
      status: {
        not: "SUSPENDED",
      },
    },
    orderBy: {
      licenseExpiryDate: "asc",
    },
    select: {
      id: true,
      name: true,
      licenseNumber: true,
      licenseCategory: true,
      licenseExpiryDate: true,
      contactNumber: true,
      status: true,
    },
  });
}

module.exports = {
  getAllDrivers,
  getAvailableDrivers,
  getDriverById,
  createDriver,
  updateDriver,
  suspendDriver,
  restoreDriver,
  deleteDriver,
  getDriversWithExpiringLicenses,
};