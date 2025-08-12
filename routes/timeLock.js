const express = require("express");
const router = express.Router();
const {
  createTimeLockTransaction,
} = require("../controllers/timeLockController");

router.post("/", createTimeLockTransaction);

module.exports = router;
