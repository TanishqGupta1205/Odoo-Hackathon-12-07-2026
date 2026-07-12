// routes/expense.routes.js

const express = require("express");

const expenseController = require(
    "../controllers/expense.controller"
);

// 🛠️ FIX: Destructure the exact function from your middleware file
const { verifyToken } = require(
    "../middlewares/auth.middleware"
);

const router = express.Router();

router.get(
    "/summary",
    verifyToken,
    expenseController.getExpenseSummary
);

router.get(
    "/",
    verifyToken,
    expenseController.getAllExpenses
);

router.get(
    "/:id",
    verifyToken,
    expenseController.getExpenseById
);

router.post(
    "/",
    verifyToken,
    expenseController.createExpense
);

router.patch(
    "/:id",
    verifyToken,
    expenseController.updateExpense
);

router.delete(
    "/:id",
    verifyToken,
    expenseController.deleteExpense
);

module.exports = router;