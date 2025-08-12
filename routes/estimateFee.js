const express = require("express");
const router = express.Router();
const { estimateFee } = require("../controllers/estimateFeeController");

// Generate a payment request QR code
router.get("/", estimateFee);

module.exports = router;
