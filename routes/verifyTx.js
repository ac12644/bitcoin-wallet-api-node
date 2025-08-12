const express = require("express");
const router = express.Router();
const { verifyTx } = require("../controllers/verifyTxController");

router.post("/", verifyTx);

module.exports = router;
