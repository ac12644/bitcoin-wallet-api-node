const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const walletRoutes = require("./routes/wallet");
const transactionRoutes = require("./routes/transaction");
const paymentRoutes = require("./routes/payment");
const sendBtcRouter = require("./routes/sendBtc");
const timeLockRouter = require("./routes/timeLock");
const verifyTxRouter = require("./routes/verifyTx");
const validateAddressRouter = require("./routes/validateAddress");
const estimateFeeRouter = require("./routes/estimateFee");
const historicalDataRouter = require("./routes/historicalData");
const reimburseBtcRouter = require("./routes/reimburseBtc");

const app = express();

app.use(bodyParser.json());

// Routes
app.use("/wallet", walletRoutes);
app.use("/transactions", transactionRoutes);
app.use("/payment", paymentRoutes);
app.use("/sendbtc", sendBtcRouter);
app.use("/timeLock", timeLockRouter);
app.use("/verifyTx", verifyTxRouter);
app.use("/validateAddress", validateAddressRouter);
app.use("/estimateFee", estimateFeeRouter);
app.use("/historicalData", historicalDataRouter);
app.use("/reimburseBtc", reimburseBtcRouter);

// API Documentation
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
