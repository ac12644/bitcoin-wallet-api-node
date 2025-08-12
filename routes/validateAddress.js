const express = require("express");
const router = express.Router();
const { validateAddress } = require("../controllers/validateAddressController");

// Generate a payment request QR code
router.get("/", validateAddress);

module.exports = router;
