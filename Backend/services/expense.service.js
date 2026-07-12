const { prisma } = require("../config/db");

const ALLOWED_SORT_FIELDS = [
  "expenseType",
  "amount",
  "date",
  "createdAt",
];

const RESERVED_EXPENSE_TYPES = [
  "FUEL",
  "MAINTENANCE",
];

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeExpenseType(value) {
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

function formatExpense(expense) {
  if (!expense) return null;

  return {
    ...expense,
    amount: decimalToNumber(expense.amount),
  };
}

function handlePrismaError(error) {
  if (error?.statusCode) {
    throw error;
  }

  if (error?.code === "P2025") {
    throw createHttpError(
      404,
      "Expense record not found."
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
    },
  });

  if (!trip) {
    throw createHttpError(404, "Trip not found.");
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

async function getAllExpenses(filters = {}) {
  const {
    vehicleId,
    tripId,
    expenseType,
    search,
    from,
    to,
    minAmount,
    maxAmount,
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

  if (
    expenseType &&
    String(expenseType).trim()
  ) {
    where.expenseType = {
      equals: normalizeExpenseType(expenseType),
      mode: "insensitive",
    };
  }

  if (search && String(search).trim()) {
    const searchValue = String(search).trim();

    where.OR = [
      {
        expenseType: {
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
    minAmount !== undefined ||
    maxAmount !== undefined
  ) {
    where.amount = {};

    if (minAmount !== undefined) {
      const parsedMinAmount =
        parseNonNegativeNumber(minAmount);

      if (parsedMinAmount === null) {
        throw createHttpError(
          400,
          "Minimum amount must be a valid non-negative number."
        );
      }

      where.amount.gte =
        parsedMinAmount.toFixed(2);
    }

    if (maxAmount !== undefined) {
      const parsedMaxAmount =
        parseNonNegativeNumber(maxAmount);

      if (parsedMaxAmount === null) {
        throw createHttpError(
          400,
          "Maximum amount must be a valid non-negative number."
        );
      }

      where.amount.lte =
        parsedMaxAmount.toFixed(2);
    }

    if (
      minAmount !== undefined &&
      maxAmount !== undefined &&
      Number(minAmount) > Number(maxAmount)
    ) {
      throw createHttpError(
        400,
        "Minimum amount cannot be greater than maximum amount."
      );
    }
  }

  const [
    expenses,
    totalExpenses,
    amountAggregate,
  ] = await prisma.$transaction([
    prisma.expense.findMany({
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
          },
        },
      },
    }),

    prisma.expense.count({
      where,
    }),

    prisma.expense.aggregate({
      where,
      _sum: {
        amount: true,
      },
      _avg: {
        amount: true,
      },
      _min: {
        amount: true,
      },
      _max: {
        amount: true,
      },
    }),
  ]);

  const totalPages = Math.ceil(
    totalExpenses / limit
  );

  return {
    pagination: {
      currentPage: page,
      limit,
      totalExpenses,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },

    filters: {
      vehicleId: vehicleId || null,
      tripId: tripId || null,
      expenseType:
        normalizeExpenseType(expenseType),
      search: search || null,
      from: from || null,
      to: to || null,
      minAmount: minAmount || null,
      maxAmount: maxAmount || null,
    },

    summary: {
      totalAmount: roundNumber(
        decimalToNumber(
          amountAggregate._sum.amount
        )
      ),
      averageAmount: roundNumber(
        decimalToNumber(
          amountAggregate._avg.amount
        )
      ),
      minimumAmount: roundNumber(
        decimalToNumber(
          amountAggregate._min.amount
        )
      ),
      maximumAmount: roundNumber(
        decimalToNumber(
          amountAggregate._max.amount
        )
      ),
    },

    expenses: expenses.map(formatExpense),
  };
}

async function getExpenseById(id) {
  if (!id) {
    throw createHttpError(
      400,
      "Expense ID is required."
    );
  }

  const expense =
    await prisma.expense.findUnique({
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
            status: true,
          },
        },
        trip: {
          select: {
            id: true,
            source: true,
            destination: true,
            cargoWeight: true,
            plannedDistance: true,
            actualDistance: true,
            status: true,
            dispatchedAt: true,
            completedAt: true,
          },
        },
      },
    });

  if (!expense) {
    throw createHttpError(
      404,
      "Expense record not found."
    );
  }

  return formatExpense(expense);
}

async function createExpense(data) {
  try {
    const {
      vehicleId,
      tripId,
      expenseType,
      amount,
      date,
      description,
    } = data;

    if (
      !vehicleId ||
      !expenseType ||
      amount === undefined
    ) {
      throw createHttpError(
        400,
        "Vehicle ID, expense type and amount are required."
      );
    }

    const normalizedExpenseType =
      normalizeExpenseType(expenseType);

    if (!normalizedExpenseType) {
      throw createHttpError(
        400,
        "Expense type is required."
      );
    }

    if (
      RESERVED_EXPENSE_TYPES.includes(
        normalizedExpenseType
      )
    ) {
      throw createHttpError(
        400,
        normalizedExpenseType === "FUEL"
          ? "Record fuel cost using the Fuel Log module."
          : "Record maintenance cost using the Maintenance module."
      );
    }

    const parsedAmount =
      parsePositiveNumber(amount);

    if (parsedAmount === null) {
      throw createHttpError(
        400,
        "Expense amount must be greater than zero."
      );
    }

    let parsedDate = new Date();

    if (date !== undefined) {
      parsedDate = parseDate(date);

      if (!parsedDate) {
        throw createHttpError(
          400,
          "Invalid expense date."
        );
      }
    }

    await validateVehicleAndTrip(
      vehicleId,
      tripId || null
    );

    const expense =
      await prisma.expense.create({
        data: {
          vehicleId,
          tripId: tripId || null,
          expenseType: normalizedExpenseType,
          amount: parsedAmount.toFixed(2),
          date: parsedDate,
          description: description
            ? String(description).trim()
            : null,
        },
        include: {
          vehicle: {
            select: {
              id: true,
              registrationNumber: true,
              vehicleName: true,
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
            },
          },
        },
      });

    return formatExpense(expense);
  } catch (error) {
    handlePrismaError(error);
  }
}

async function updateExpense(id, data) {
  try {
    if (!id) {
      throw createHttpError(
        400,
        "Expense ID is required."
      );
    }

    const existingExpense =
      await prisma.expense.findUnique({
        where: {
          id,
        },
      });

    if (!existingExpense) {
      throw createHttpError(
        404,
        "Expense record not found."
      );
    }

    const {
      vehicleId,
      tripId,
      expenseType,
      amount,
      date,
      description,
    } = data;

    const updateData = {};

    const finalVehicleId =
      vehicleId !== undefined
        ? vehicleId
        : existingExpense.vehicleId;

    const finalTripId =
      tripId !== undefined
        ? tripId || null
        : existingExpense.tripId;

    if (
      vehicleId !== undefined ||
      tripId !== undefined
    ) {
      await validateVehicleAndTrip(
        finalVehicleId,
        finalTripId
      );

      updateData.vehicleId = finalVehicleId;
      updateData.tripId = finalTripId;
    }

    if (expenseType !== undefined) {
      const normalizedExpenseType =
        normalizeExpenseType(expenseType);

      if (!normalizedExpenseType) {
        throw createHttpError(
          400,
          "Expense type cannot be empty."
        );
      }

      if (
        RESERVED_EXPENSE_TYPES.includes(
          normalizedExpenseType
        )
      ) {
        throw createHttpError(
          400,
          "Use the Fuel Log or Maintenance module for this expense type."
        );
      }

      updateData.expenseType =
        normalizedExpenseType;
    }

    if (amount !== undefined) {
      const parsedAmount =
        parsePositiveNumber(amount);

      if (parsedAmount === null) {
        throw createHttpError(
          400,
          "Expense amount must be greater than zero."
        );
      }

      updateData.amount =
        parsedAmount.toFixed(2);
    }

    if (date !== undefined) {
      const parsedDate = parseDate(date);

      if (!parsedDate) {
        throw createHttpError(
          400,
          "Invalid expense date."
        );
      }

      updateData.date = parsedDate;
    }

    if (description !== undefined) {
      updateData.description = description
        ? String(description).trim()
        : null;
    }

    if (
      Object.keys(updateData).length === 0
    ) {
      throw createHttpError(
        400,
        "Provide at least one field to update."
      );
    }

    const expense =
      await prisma.expense.update({
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
            },
          },
        },
      });

    return formatExpense(expense);
  } catch (error) {
    handlePrismaError(error);
  }
}

async function deleteExpense(id) {
  try {
    if (!id) {
      throw createHttpError(
        400,
        "Expense ID is required."
      );
    }

    const expense =
      await prisma.expense.findUnique({
        where: {
          id,
        },
        select: {
          id: true,
          expenseType: true,
          amount: true,
          date: true,
          vehicleId: true,
          tripId: true,
        },
      });

    if (!expense) {
      throw createHttpError(
        404,
        "Expense record not found."
      );
    }

    await prisma.expense.delete({
      where: {
        id,
      },
    });

    return formatExpense(expense);
  } catch (error) {
    handlePrismaError(error);
  }
}

async function getExpenseSummary(filters = {}) {
  const {
    vehicleId,
    tripId,
    from,
    to,
  } = filters;

  const where = {};

  if (vehicleId) {
    where.vehicleId = vehicleId;
  }

  if (tripId) {
    where.tripId = tripId;
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

  const [
    aggregate,
    typeGroups,
    vehicleGroups,
  ] = await Promise.all([
    prisma.expense.aggregate({
      where,
      _count: {
        _all: true,
      },
      _sum: {
        amount: true,
      },
      _avg: {
        amount: true,
      },
      _min: {
        amount: true,
      },
      _max: {
        amount: true,
      },
    }),

    prisma.expense.groupBy({
      by: ["expenseType"],
      where,
      _count: {
        _all: true,
      },
      _sum: {
        amount: true,
      },
      orderBy: {
        _sum: {
          amount: "desc",
        },
      },
    }),

    prisma.expense.groupBy({
      by: ["vehicleId"],
      where,
      _count: {
        _all: true,
      },
      _sum: {
        amount: true,
      },
      orderBy: {
        _sum: {
          amount: "desc",
        },
      },
    }),
  ]);

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
      totalExpenses: aggregate._count._all,
      totalAmount: roundNumber(
        decimalToNumber(aggregate._sum.amount)
      ),
      averageAmount: roundNumber(
        decimalToNumber(aggregate._avg.amount)
      ),
      minimumAmount: roundNumber(
        decimalToNumber(aggregate._min.amount)
      ),
      maximumAmount: roundNumber(
        decimalToNumber(aggregate._max.amount)
      ),
    },

    expenseTypeDistribution:
      typeGroups.map((item) => ({
        expenseType: item.expenseType,
        count: item._count._all,
        totalAmount: roundNumber(
          decimalToNumber(item._sum.amount)
        ),
      })),

    vehicleExpenseDistribution:
      vehicleGroups.map((item) => ({
        vehicle:
          vehicleMap.get(item.vehicleId) || {
            id: item.vehicleId,
          },
        count: item._count._all,
        totalAmount: roundNumber(
          decimalToNumber(item._sum.amount)
        ),
      })),
  };
}

module.exports = {
  getAllExpenses,
  getExpenseById,
  createExpense,
  updateExpense,
  deleteExpense,
  getExpenseSummary,
};