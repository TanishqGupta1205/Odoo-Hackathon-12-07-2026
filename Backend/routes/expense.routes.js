// routes/expense.routes.js

const express = require("express");

const expenseController = require(
  "../controllers/expense.controller"
);

const authMiddleware = require(
  "../middlewares/auth.middleware"
);

const router = express.Router();

router.get(
  "/summary",
  authMiddleware,
  expenseController.getExpenseSummary
);

router.get(
  "/",
  authMiddleware,
  expenseController.getAllExpenses
);

router.get(
  "/:id",
  authMiddleware,
  expenseController.getExpenseById
);

router.post(
  "/",
  authMiddleware,
  expenseController.createExpense
);

router.patch(
  "/:id",
  authMiddleware,
  expenseController.updateExpense
);

router.delete(
  "/:id",
  authMiddleware,
  expenseController.deleteExpense
);

module.exports = router;