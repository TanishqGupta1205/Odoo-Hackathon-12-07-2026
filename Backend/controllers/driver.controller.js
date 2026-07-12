// controllers/driver.controller.js

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
  "licenseExpiryDate",
  "safetyScore",
  "status",
  "createdAt",
  "updatedAt",
];

/*
|--------------------------------------------------------------------------
| Helper Functions
|--------------------------------------------------------------------------
*/

function normalizeStatus(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;

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

function parseSafetyScore(value) {
  if (
      value === undefined ||
      value === null ||
      value === ""
  ) {
    return undefined;
  }

  const score = Number(value);

  if (!Number.isFinite(score)) {
    return null;
  }

  return score;
}

function parseDate(value) {
  if (!value) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
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

function isEmptyString(value) {
  return (
      typeof value === "string" &&
      value.trim().length === 0
  );
}

function isPrismaUniqueError(error) {
  return error && error.code === "P2002";
}

function isPrismaNotFoundError(error) {
  return error && error.code === "P2025";
}

/*
|--------------------------------------------------------------------------
| GET ALL DRIVERS
|--------------------------------------------------------------------------
*/

async function getAllDrivers(req, res, next) {
  try {
    const {
      search,
      status,
      licenseCategory,
      licenseStatus,
      expiringInDays,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const page = parsePositiveInteger(req.query.page, 1);
    const requestedLimit = parsePositiveInteger(req.query.limit, 10);
    const limit = Math.min(requestedLimit, 100);
    const skip = (page - 1) * limit;

    const normalizedStatus = normalizeStatus(status);

    if (
        normalizedStatus &&
        !DRIVER_STATUSES.includes(normalizedStatus)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid driver status. Use AVAILABLE, ON_TRIP, OFF_DUTY or SUSPENDED.",
      });
    }

    const normalizedLicenseStatus = licenseStatus
        ? String(licenseStatus).trim().toLowerCase()
        : null;

    const allowedLicenseStatuses = ["valid", "expired", "expiring"];

    if (
        normalizedLicenseStatus &&
        !allowedLicenseStatuses.includes(normalizedLicenseStatus)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid license status. Use valid, expired or expiring.",
      });
    }

    const safeSortBy = ALLOWED_SORT_FIELDS.includes(sortBy) ? sortBy : "createdAt";
    const safeSortOrder = String(sortOrder).toLowerCase() === "asc" ? "asc" : "desc";

    const where = {};

    if (search && String(search).trim()) {
      const searchValue = String(search).trim();

      where.OR = [
        { name: { contains: searchValue, mode: "insensitive" } },
        { licenseNumber: { contains: searchValue, mode: "insensitive" } },
        { contactNumber: { contains: searchValue, mode: "insensitive" } },
      ];
    }

    if (normalizedStatus) {
      where.status = normalizedStatus;
    }

    if (licenseCategory && String(licenseCategory).trim()) {
      where.licenseCategory = {
        equals: String(licenseCategory).trim(),
        mode: "insensitive",
      };
    }

    const now = new Date();

    if (normalizedLicenseStatus === "valid") {
      where.licenseExpiryDate = { gt: now };
    }

    if (normalizedLicenseStatus === "expired") {
      where.licenseExpiryDate = { lte: now };
    }

    if (normalizedLicenseStatus === "expiring") {
      const days = Math.min(parsePositiveInteger(expiringInDays, 30), 365);
      const expiryLimit = new Date();
      expiryLimit.setDate(expiryLimit.getDate() + days);

      where.licenseExpiryDate = {
        gt: now,
        lte: expiryLimit,
      };
    }

    const [drivers, totalDrivers] = await prisma.$transaction([
      prisma.driver.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [safeSortBy]: safeSortOrder },
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
          _count: { select: { trips: true } },
        },
      }),
      prisma.driver.count({ where }),
    ]);

    const formattedDrivers = drivers.map((driver) => ({
      id: driver.id,
      name: driver.name,
      licenseNumber: driver.licenseNumber,
      licenseCategory: driver.licenseCategory,
      licenseExpiryDate: driver.licenseExpiryDate,
      contactNumber: driver.contactNumber,
      safetyScore: driver.safetyScore,
      status: driver.status,
      isLicenseExpired: driver.licenseExpiryDate <= now,
      totalTrips: driver._count.trips,
      createdAt: driver.createdAt,
      updatedAt: driver.updatedAt,
    }));

    const totalPages = Math.ceil(totalDrivers / limit);

    return res.status(200).json({
      success: true,
      message: "Drivers fetched successfully",
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
      drivers: formattedDrivers,
    });
  } catch (error) {
    next(error);
  }
}

/*
|--------------------------------------------------------------------------
| GET AVAILABLE DRIVERS
|--------------------------------------------------------------------------
*/

async function getAvailableDrivers(req, res, next) {
  try {
    const { licenseCategory, search } = req.query;

    const where = {
      status: "AVAILABLE",
      licenseExpiryDate: { gt: new Date() },
    };

    if (licenseCategory && String(licenseCategory).trim()) {
      where.licenseCategory = {
        equals: String(licenseCategory).trim(),
        mode: "insensitive",
      };
    }

    if (search && String(search).trim()) {
      const searchValue = String(search).trim();

      where.OR = [
        { name: { contains: searchValue, mode: "insensitive" } },
        { licenseNumber: { contains: searchValue, mode: "insensitive" } },
      ];
    }

    const drivers = await prisma.driver.findMany({
      where,
      orderBy: { name: "asc" },
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

    return res.status(200).json({
      success: true,
      count: drivers.length,
      drivers,
    });
  } catch (error) {
    next(error);
  }
}

/*
|--------------------------------------------------------------------------
| GET DRIVER BY ID
|--------------------------------------------------------------------------
*/

async function getDriverById(req, res, next) {
  try {
    const { id } = req.params;

    const driver = await prisma.driver.findUnique({
      where: { id },
      include: {
        trips: {
          take: 10,
          orderBy: { createdAt: "desc" },
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
        _count: { select: { trips: true } },
      },
    });

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found",
      });
    }

    const now = new Date();

    return res.status(200).json({
      success: true,
      driver: {
        id: driver.id,
        name: driver.name,
        licenseNumber: driver.licenseNumber,
        licenseCategory: driver.licenseCategory,
        licenseExpiryDate: driver.licenseExpiryDate,
        contactNumber: driver.contactNumber,
        safetyScore: driver.safetyScore,
        status: driver.status,
        isLicenseExpired: driver.licenseExpiryDate <= now,
        totalTrips: driver._count.trips,
        recentTrips: driver.trips,
        createdAt: driver.createdAt,
        updatedAt: driver.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
}

/*
|--------------------------------------------------------------------------
| CREATE DRIVER
|--------------------------------------------------------------------------
*/

async function createDriver(req, res, next) {
  try {
    const {
      name,
      licenseNumber,
      licenseCategory,
      licenseExpiryDate,
      contactNumber,
      safetyScore,
      status,
    } = req.body;

    if (
        !name ||
        !licenseNumber ||
        !licenseCategory ||
        !licenseExpiryDate ||
        !contactNumber
    ) {
      return res.status(400).json({
        success: false,
        message: "Name, license number, license category, license expiry date and contact number are required.",
      });
    }

    if (
        isEmptyString(name) ||
        isEmptyString(licenseNumber) ||
        isEmptyString(licenseCategory) ||
        isEmptyString(contactNumber)
    ) {
      return res.status(400).json({
        success: false,
        message: "Required fields cannot be empty.",
      });
    }

    const parsedExpiryDate = parseDate(licenseExpiryDate);

    if (!parsedExpiryDate) {
      return res.status(400).json({
        success: false,
        message: "Invalid license expiry date.",
      });
    }

    const parsedSafetyScore = parseSafetyScore(safetyScore);

    if (parsedSafetyScore === null) {
      return res.status(400).json({
        success: false,
        message: "Safety score must be a valid number.",
      });
    }

    if (
        parsedSafetyScore !== undefined &&
        (parsedSafetyScore < 0 || parsedSafetyScore > 100)
    ) {
      return res.status(400).json({
        success: false,
        message: "Safety score must be between 0 and 100.",
      });
    }

    const normalizedStatus = normalizeStatus(status) || "AVAILABLE";

    if (!DRIVER_STATUSES.includes(normalizedStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invalid driver status. Use AVAILABLE, OFF_DUTY or SUSPENDED.",
      });
    }

    if (normalizedStatus === "ON_TRIP") {
      return res.status(400).json({
        success: false,
        message: "ON_TRIP status cannot be assigned manually. Dispatch a trip to update this status.",
      });
    }

    const existingDriver = await prisma.driver.findUnique({
      where: { licenseNumber: String(licenseNumber).trim() },
    });

    if (existingDriver) {
      return res.status(409).json({
        success: false,
        message: "A driver with this license number already exists.",
      });
    }

    const driver = await prisma.driver.create({
      data: {
        name: String(name).trim(),
        licenseNumber: String(licenseNumber).trim(),
        licenseCategory: String(licenseCategory).trim(),
        licenseExpiryDate: parsedExpiryDate,
        contactNumber: String(contactNumber).trim(),
        safetyScore: parsedSafetyScore === undefined ? 100 : parsedSafetyScore,
        status: normalizedStatus,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Driver created successfully",
      driver,
    });
  } catch (error) {
    if (isPrismaUniqueError(error)) {
      return res.status(409).json({
        success: false,
        message: "A driver with this license number already exists.",
      });
    }
    next(error);
  }
}

/*
|--------------------------------------------------------------------------
| UPDATE DRIVER
|--------------------------------------------------------------------------
*/

async function updateDriver(req, res, next) {
  try {
    const { id } = req.params;
    const {
      name,
      licenseNumber,
      licenseCategory,
      licenseExpiryDate,
      contactNumber,
      safetyScore,
      status,
    } = req.body;

    const existingDriver = await prisma.driver.findUnique({
      where: { id },
    });

    if (!existingDriver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found",
      });
    }

    const updateData = {};

    if (name !== undefined) {
      if (isEmptyString(name)) {
        return res.status(400).json({ success: false, message: "Name cannot be empty." });
      }
      updateData.name = String(name).trim();
    }

    if (licenseNumber !== undefined) {
      if (isEmptyString(licenseNumber)) {
        return res.status(400).json({ success: false, message: "License number cannot be empty." });
      }
      updateData.licenseNumber = String(licenseNumber).trim();
    }

    if (licenseCategory !== undefined) {
      if (isEmptyString(licenseCategory)) {
        return res.status(400).json({ success: false, message: "License category cannot be empty." });
      }
      updateData.licenseCategory = String(licenseCategory).trim();
    }

    if (contactNumber !== undefined) {
      if (isEmptyString(contactNumber)) {
        return res.status(400).json({ success: false, message: "Contact number cannot be empty." });
      }
      updateData.contactNumber = String(contactNumber).trim();
    }

    if (licenseExpiryDate !== undefined) {
      const parsedExpiryDate = parseDate(licenseExpiryDate);
      if (!parsedExpiryDate) {
        return res.status(400).json({ success: false, message: "Invalid license expiry date." });
      }
      updateData.licenseExpiryDate = parsedExpiryDate;
    }

    if (safetyScore !== undefined) {
      const parsedSafetyScore = parseSafetyScore(safetyScore);
      if (
          parsedSafetyScore === null ||
          parsedSafetyScore < 0 ||
          parsedSafetyScore > 100
      ) {
        return res.status(400).json({
          success: false,
          message: "Safety score must be between 0 and 100.",
        });
      }
      updateData.safetyScore = parsedSafetyScore;
    }

    if (status !== undefined) {
      const normalizedStatus = normalizeStatus(status);

      if (!normalizedStatus || !DRIVER_STATUSES.includes(normalizedStatus)) {
        return res.status(400).json({
          success: false,
          message: "Invalid driver status. Use AVAILABLE, ON_TRIP, OFF_DUTY or SUSPENDED.",
        });
      }

      if (
          normalizedStatus === "ON_TRIP" &&
          existingDriver.status !== "ON_TRIP"
      ) {
        return res.status(400).json({
          success: false,
          message: "ON_TRIP status cannot be assigned manually.",
        });
      }

      if (
          existingDriver.status === "ON_TRIP" &&
          normalizedStatus !== "ON_TRIP"
      ) {
        const activeTrip = await prisma.trip.findFirst({
          where: {
            driverId: id,
            status: "DISPATCHED",
          },
          select: { id: true },
        });

        if (activeTrip) {
          return res.status(409).json({
            success: false,
            message: "Driver is assigned to an active trip. Complete or cancel the trip before changing driver status.",
          });
        }
      }

      updateData.status = normalizedStatus;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Provide at least one field to update.",
      });
    }

    const updatedDriver = await prisma.driver.update({
      where: { id },
      data: updateData,
    });

    return res.status(200).json({
      success: true,
      message: "Driver updated successfully",
      driver: updatedDriver,
    });
  } catch (error) {
    if (isPrismaUniqueError(error)) {
      return res.status(409).json({
        success: false,
        message: "A driver with this license number already exists.",
      });
    }
    if (isPrismaNotFoundError(error)) {
      return res.status(404).json({
        success: false,
        message: "Driver not found",
      });
    }
    next(error);
  }
}

/*
|--------------------------------------------------------------------------
| SUSPEND DRIVER
|--------------------------------------------------------------------------
*/

async function suspendDriver(req, res, next) {
  try {
    const { id } = req.params;

    const driver = await prisma.driver.findUnique({
      where: { id },
    });

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found",
      });
    }

    if (driver.status === "ON_TRIP") {
      const activeTrip = await prisma.trip.findFirst({
        where: {
          driverId: id,
          status: "DISPATCHED",
        },
        select: { id: true },
      });

      if (activeTrip) {
        return res.status(409).json({
          success: false,
          message: "Driver is currently on an active trip. Complete or cancel the trip before suspension.",
        });
      }
    }

    const suspendedDriver = await prisma.driver.update({
      where: { id },
      data: { status: "SUSPENDED" },
    });

    return res.status(200).json({
      success: true,
      message: "Driver suspended successfully",
      driver: suspendedDriver,
    });
  } catch (error) {
    next(error);
  }
}

/*
|--------------------------------------------------------------------------
| RESTORE DRIVER
|--------------------------------------------------------------------------
*/

async function restoreDriver(req, res, next) {
  try {
    const { id } = req.params;

    const driver = await prisma.driver.findUnique({
      where: { id },
    });

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found",
      });
    }

    if (driver.licenseExpiryDate <= new Date()) {
      return res.status(400).json({
        success: false,
        message: "Driver license has expired. Update the license expiry date before restoring the driver.",
      });
    }

    const restoredDriver = await prisma.driver.update({
      where: { id },
      data: { status: "AVAILABLE" },
    });

    return res.status(200).json({
      success: true,
      message: "Driver restored successfully",
      driver: restoredDriver,
    });
  } catch (error) {
    next(error);
  }
}

/*
|--------------------------------------------------------------------------
| DELETE DRIVER
|--------------------------------------------------------------------------
*/

async function deleteDriver(req, res, next) {
  try {
    const { id } = req.params;

    const driver = await prisma.driver.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        status: true,
        _count: { select: { trips: true } },
      },
    });

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found",
      });
    }

    if (driver.status === "ON_TRIP") {
      return res.status(409).json({
        success: false,
        message: "Driver is currently on a trip and cannot be deleted.",
      });
    }

    if (driver._count.trips > 0) {
      return res.status(409).json({
        success: false,
        message: "Driver has trip history and cannot be deleted. Set the driver status to OFF_DUTY or SUSPENDED instead.",
      });
    }

    await prisma.driver.delete({
      where: { id },
    });

    return res.status(200).json({
      success: true,
      message: "Driver deleted successfully",
    });
  } catch (error) {
    if (isPrismaNotFoundError(error)) {
      return res.status(404).json({
        success: false,
        message: "Driver not found",
      });
    }
    next(error);
  }
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
};