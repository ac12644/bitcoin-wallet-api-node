import type { Request, Response } from "express";
import axios from "axios";
import { API } from "../lib/net";

export async function getBalance(req: Request, res: Response) {
  const address = String(req.params.address || "").trim();
  if (!address) return res.status(400).json({ error: "address is required" });

  try {
    const { data } = await axios.get(`${API}/address/${address}`);
    const c = data.chain_stats || {};
    const m = data.mempool_stats || {};
    const confirmed = (c.funded_txo_sum || 0) - (c.spent_txo_sum || 0);
    const pending = (m.funded_txo_sum || 0) - (m.spent_txo_sum || 0);
    res.json({
      confirmedBTC: confirmed / 1e8,
      pendingBTC: pending / 1e8,
      confirmedSats: confirmed,
      pendingSats: pending,
    });
  } catch (error: any) {
    console.error("getBalance error:", error?.response?.data || error);
    res.status(500).json({ error: "Failed to fetch balance" });
  }
}

export async function getTransactions(req: Request, res: Response) {
  const address = String(req.params.address || "").trim();
  if (!address) return res.status(400).json({ error: "address is required" });

  try {
    const { data } = await axios.get(`${API}/address/${address}/txs`);
    res.json({ transactions: data });
  } catch (error: any) {
    console.error("getTransactions error:", error?.response?.data || error);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
}
