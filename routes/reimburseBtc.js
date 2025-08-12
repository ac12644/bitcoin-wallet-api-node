const express = require("express");
const router = express.Router();
const { reimburseBitcoin } = require("../controllers/reimburseBtcController");

// Generate a payment request QR code
router.post("/reimburseBitcoin", reimburseBitcoin);

module.exports = router;
