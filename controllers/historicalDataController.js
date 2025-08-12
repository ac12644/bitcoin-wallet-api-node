const axios = require("axios");

exports.getHistoricalData = async (req, res) => {
  const { startDate, endDate } = req.query || {};
  if (!startDate || !endDate) {
    return res
      .status(400)
      .json({ error: "startDate and endDate are required (YYYY-MM-DD)" });
  }
  try {
    const { data } = await axios.get(
      `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart/range`,
      {
        params: {
          vs_currency: "usd",
          from: Math.floor(new Date(startDate).getTime() / 1000),
          to: Math.floor(new Date(endDate).getTime() / 1000),
        },
      }
    );
    res.json(data);
  } catch (error) {
    console.error(
      "Error fetching historical data:",
      error?.response?.data || error.message
    );
    res.status(500).json({ error: "Failed to fetch historical data" });
  }
};
