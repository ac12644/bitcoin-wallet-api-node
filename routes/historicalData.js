const express = require("express");
const router = express.Router();
const {
  getHistoricalData,
} = require("../controllers/historicalDataController");

// Generate a payment request QR code
router.get("/", getHistoricalData);

module.exports = router;
