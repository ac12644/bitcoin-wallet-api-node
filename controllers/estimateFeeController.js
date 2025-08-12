const { fetchFeerateSatPerVb } = require("../lib/fees");

/**
 * Returns average feerate in sat/vB (mean of targets 1..6 blocks).
 */
exports.estimateFee = async (_req, res) => {
  try {
    const feerateSatPerVb = await fetchFeerateSatPerVb();
    res.json({ feerateSatPerVb });
  } catch (error) {
    console.error("Error fetching fee estimates:", error);
    res.status(500).json({ error: "Failed to fetch fee estimates" });
  }
};
