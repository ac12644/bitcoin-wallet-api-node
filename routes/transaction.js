const express = require("express");
const router = express.Router();
const {
  getBalance,
  getTransactions,
} = require("../controllers/transactionController");

// Get the balance of an address
router.get("/balance/:address", getBalance);

// Get the transactions of an address
router.get("/:address", getTransactions);

module.exports = router;
