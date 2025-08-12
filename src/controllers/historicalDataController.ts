import type { Request, Response } from "express";
import axios from "axios";

export async function getHistoricalData(req: Request, res: Response) {
  const startDate = String(req.query?.startDate || "");
  const endDate = String(req.query?.endDate || "");
  if (!startDate || !endDate) {
    return res
      .status(400)
      .json({ error: "startDate and endDate are required (YYYY-MM-DD)" });
  }
  try {
    const { data } = await axios.get(
      "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart/range",
      {
        params: {
          vs_currency: "usd",
          from: Math.floor(new Date(startDate).getTime() / 1000),
          to: Math.floor(new Date(endDate).getTime() / 1000),
        },
      }
    );
    res.json(data);
  } catch (error: any) {
    console.error("historical data error:", error?.response?.data || error);
    res.status(500).json({ error: "Failed to fetch historical data" });
  }
}
