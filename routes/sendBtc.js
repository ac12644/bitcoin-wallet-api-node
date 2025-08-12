const express = require("express");
const router = express.Router();
const { sendBitcoin } = require("../controllers/sendBtcController");

router.post("/", sendBitcoin);

module.exports = router;
