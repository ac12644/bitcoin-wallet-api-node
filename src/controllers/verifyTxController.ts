import type { Request, Response } from "express";
import axios from "axios";
import { API } from "../lib/net";

async function getTransactionStatus(txid: string) {
  try {
    const { data: tx } = await axios.get(`${API}/tx/${txid}`);
    if (tx.status && tx.status.confirmed) {
      const { data: tip } = await axios.get(`${API}/blocks/tip/height`);
      const confirmations = tip - tx.status.block_height + 1;
      return {
        txid,
        confirmed: true,
        confirmations,
        block_height: tx.status.block_height,
      };
    } else {
      return { txid, confirmed: false, confirmations: 0 };
    }
  } catch {
    return { txid, error: "Transaction not found or API error" };
  }
}

export async function verifyTx(req: Request, res: Response) {
  const ids = Array.isArray(req.body?.txids)
    ? req.body.txids
    : [req.body?.txids];
  const list = (ids || [])
    .map((s: any) => String(s || "").trim())
    .filter(Boolean);
  if (!list.length) return res.status(400).json({ error: "txids required" });

  const results = await Promise.all(
    list.map((id: string) => getTransactionStatus(id))
  );
  res.json(results);
}
