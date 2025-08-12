import type { Request, Response } from "express";
import { fetchFeerateSatPerVb } from "../lib/fees";

export async function estimateFee(_req: Request, res: Response) {
  try {
    const feerateSatPerVb = await fetchFeerateSatPerVb();
    res.json({ feerateSatPerVb });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch fee estimates" });
  }
}
