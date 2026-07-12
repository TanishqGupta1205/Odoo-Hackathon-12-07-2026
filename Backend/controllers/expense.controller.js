// controllers/expense.controller.js

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



function normalizeExpenseType(value) {
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

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    if (endOfDay) {
      date.setUTCHours(23, 59, 59, 999);
    } else {
      date.setUTCHours(0, 0, 0, 0);
    }
  }

  return date;
}

function parseAmount(value) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  const amount = Number(value);

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  /*
   * Prisma Decimal field ला string दिल्यामुळे
   * floating-point precision issue कमी होतो.
   */
  return amount.toFixed(2);
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
        "The selected trip does not belong to the selected vehicle.",
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
| GET ALL EXPENSES
|--------------------------------------------------------------------------
|
| GET /api/expenses
|
| Query examples:
| ?vehicleId=vehicle-id
| ?tripId=trip-id
| ?expenseType=TOLL
| ?from=2026-01-01&to=2026-12-31
| ?minAmount=100&maxAmount=5000
| ?search=highway
| ?page=1&limit=10
| ?sortBy=date&sortOrder=desc
|
*/

async function getAllExpenses(req, res, next) {
  try {
    const {
      vehicleId,
      tripId,
      expenseType,
      from,
      to,
      minAmount,
      maxAmount,
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

    if (expenseType) {
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
     * Amount filter
     */
    if (minAmount !== undefined || maxAmount !== undefined) {
      where.amount = {};

      if (minAmount !== undefined) {
        const parsedMinAmount = Number(minAmount);

        if (
          !Number.isFinite(parsedMinAmount) ||
          parsedMinAmount < 0
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Minimum amount must be a valid non-negative number.",
          });
        }

        where.amount.gte =
          parsedMinAmount.toFixed(2);
      }

      if (maxAmount !== undefined) {
        const parsedMaxAmount = Number(maxAmount);

        if (
          !Number.isFinite(parsedMaxAmount) ||
          parsedMaxAmount < 0
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Maximum amount must be a valid non-negative number.",
          });
        }

        where.amount.lte =
          parsedMaxAmount.toFixed(2);
      }

      if (
        minAmount !== undefined &&
        maxAmount !== undefined &&
        Number(minAmount) > Number(maxAmount)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Minimum amount cannot be greater than maximum amount.",
        });
      }
    }

    const [expenses, totalExpenses, amountAggregate] =
      await prisma.$transaction([
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
        }),
      ]);

    const formattedExpenses = expenses.map(
      (expense) => ({
        ...expense,
        amount: decimalToNumber(expense.amount),
      })
    );

    const totalPages = Math.ceil(
      totalExpenses / limit
    );

    return res.status(200).json({
      success: true,
      message: "Expenses fetched successfully",

      pagination: {
        currentPage: page,
        limit,
        totalExpenses,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },

      summary: {
        totalAmount: decimalToNumber(
          amountAggregate._sum.amount
        ),

        averageAmount: decimalToNumber(
          amountAggregate._avg.amount
        ),
      },

      filters: {
        vehicleId: vehicleId || null,
        tripId: tripId || null,
        expenseType:
          normalizeExpenseType(expenseType),
        from: from || null,
        to: to || null,
      },

      expenses: formattedExpenses,
    });
  } catch (error) {
    next(error);
  }
}



async function getExpenseById(req, res, next) {
  try {
    const { id } = req.params;

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
              status: true,
              dispatchedAt: true,
              completedAt: true,
            },
          },
        },
      });

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: "Expense not found",
      });
    }

    return res.status(200).json({
      success: true,

      expense: {
        ...expense,
        amount: decimalToNumber(expense.amount),
      },
    });
  } catch (error) {
    next(error);
  }
}



async function createExpense(req, res, next) {
  try {
    const {
      vehicleId,
      tripId,
      expenseType,
      amount,
      date,
      description,
    } = req.body;

    if (!vehicleId || !expenseType || amount === undefined) {
      return res.status(400).json({
        success: false,
        message:
          "Vehicle ID, expense type and amount are required.",
      });
    }

    const normalizedExpenseType =
      normalizeExpenseType(expenseType);

    if (!normalizedExpenseType) {
      return res.status(400).json({
        success: false,
        message: "Expense type is required.",
      });
    }

    
    if (
      RESERVED_EXPENSE_TYPES.includes(
        normalizedExpenseType
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          normalizedExpenseType === "FUEL"
            ? "Record fuel expenses through the Fuel Log module."
            : "Record maintenance costs through the Maintenance module.",
      });
    }

    const parsedAmount = parseAmount(amount);

    if (!parsedAmount) {
      return res.status(400).json({
        success: false,
        message:
          "Amount must be a number greater than zero.",
      });
    }

    let parsedDate = new Date();

    if (date !== undefined) {
      parsedDate = parseDate(date);

      if (!parsedDate) {
        return res.status(400).json({
          success: false,
          message: "Invalid expense date.",
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

    const expense = await prisma.expense.create({
      data: {
        vehicleId,
        tripId: tripId || null,
        expenseType: normalizedExpenseType,
        amount: parsedAmount,
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

    return res.status(201).json({
      success: true,
      message: "Expense created successfully",

      expense: {
        ...expense,
        amount: decimalToNumber(expense.amount),
      },
    });
  } catch (error) {
    next(error);
  }
}



async function updateExpense(req, res, next) {
  try {
    const { id } = req.params;

    const {
      vehicleId,
      tripId,
      expenseType,
      amount,
      date,
      description,
    } = req.body;

    const existingExpense =
      await prisma.expense.findUnique({
        where: {
          id,
        },
      });

    if (!existingExpense) {
      return res.status(404).json({
        success: false,
        message: "Expense not found",
      });
    }

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
      if (!finalVehicleId) {
        return res.status(400).json({
          success: false,
          message: "Vehicle ID is required.",
        });
      }

      const validation =
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

      updateData.vehicleId = finalVehicleId;
      updateData.tripId = finalTripId;
    }

    if (expenseType !== undefined) {
      const normalizedExpenseType =
        normalizeExpenseType(expenseType);

      if (!normalizedExpenseType) {
        return res.status(400).json({
          success: false,
          message:
            "Expense type cannot be empty.",
        });
      }

      if (
        RESERVED_EXPENSE_TYPES.includes(
          normalizedExpenseType
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Use the Fuel Log or Maintenance module for this expense type.",
        });
      }

      updateData.expenseType =
        normalizedExpenseType;
    }

    if (amount !== undefined) {
      const parsedAmount = parseAmount(amount);

      if (!parsedAmount) {
        return res.status(400).json({
          success: false,
          message:
            "Amount must be a number greater than zero.",
        });
      }

      updateData.amount = parsedAmount;
    }

    if (date !== undefined) {
      const parsedDate = parseDate(date);

      if (!parsedDate) {
        return res.status(400).json({
          success: false,
          message: "Invalid expense date.",
        });
      }

      updateData.date = parsedDate;
    }

    if (description !== undefined) {
      updateData.description = description
        ? String(description).trim()
        : null;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "Provide at least one field to update.",
      });
    }

    const updatedExpense =
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

    return res.status(200).json({
      success: true,
      message: "Expense updated successfully",

      expense: {
        ...updatedExpense,
        amount: decimalToNumber(
          updatedExpense.amount
        ),
      },
    });
  } catch (error) {
    if (isPrismaNotFoundError(error)) {
      return res.status(404).json({
        success: false,
        message: "Expense not found",
      });
    }

    next(error);
  }
}



async function deleteExpense(req, res, next) {
  try {
    const { id } = req.params;

    const existingExpense =
      await prisma.expense.findUnique({
        where: {
          id,
        },

        select: {
          id: true,
          expenseType: true,
          amount: true,
        },
      });

    if (!existingExpense) {
      return res.status(404).json({
        success: false,
        message: "Expense not found",
      });
    }

    await prisma.expense.delete({
      where: {
        id,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Expense deleted successfully",

      deletedExpense: {
        id: existingExpense.id,
        expenseType:
          existingExpense.expenseType,
        amount: decimalToNumber(
          existingExpense.amount
        ),
      },
    });
  } catch (error) {
    if (isPrismaNotFoundError(error)) {
      return res.status(404).json({
        success: false,
        message: "Expense not found",
      });
    }

    next(error);
  }
}

/*
|--------------------------------------------------------------------------
| EXPENSE SUMMARY
|--------------------------------------------------------------------------
|
| GET /api/expenses/summary
|
| Optional query:
| ?vehicleId=...
| ?tripId=...
| ?from=2026-01-01&to=2026-12-31
|
*/

async function getExpenseSummary(req, res, next) {
  try {
    const {
      vehicleId,
      tripId,
      from,
      to,
    } = req.query;

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

    if (fromDate || toDate) {
      where.date = {};

      if (fromDate) {
        where.date.gte = fromDate;
      }

      if (toDate) {
        where.date.lte = toDate;
      }
    }

    const [aggregate, groupedExpenses] =
      await Promise.all([
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
      ]);

    return res.status(200).json({
      success: true,
      message:
        "Expense summary fetched successfully",

      summary: {
        totalExpenses:
          aggregate._count._all,

        totalAmount: decimalToNumber(
          aggregate._sum.amount
        ),

        averageAmount: decimalToNumber(
          aggregate._avg.amount
        ),

        minimumAmount: decimalToNumber(
          aggregate._min.amount
        ),

        maximumAmount: decimalToNumber(
          aggregate._max.amount
        ),
      },

      expenseTypeDistribution:
        groupedExpenses.map((item) => ({
          expenseType: item.expenseType,
          count: item._count._all,
          totalAmount: decimalToNumber(
            item._sum.amount
          ),
        })),
    });
  } catch (error) {
    next(error);
  }
}



module.exports = {
  getAllExpenses,
  getExpenseById,
  createExpense,
  updateExpense,
  deleteExpense,
  getExpenseSummary,
};