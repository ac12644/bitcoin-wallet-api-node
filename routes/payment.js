const express = require("express");
const router = express.Router();
const {
  generatePaymentRequestQR,
} = require("../controllers/paymentRequestController");

// Generate a payment request QR code
router.get("/payment-request-qr", generatePaymentRequestQR);

module.exports = router;
