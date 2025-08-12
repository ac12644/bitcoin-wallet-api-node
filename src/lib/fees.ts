import axios from "axios";
import { API } from "./net";

export async function fetchFeerateSatPerVb(): Promise<number> {
  const { data } = await axios.get(`${API}/fee-estimates`);
  let total = 0;
  for (let i = 1; i <= 6; i++) total += data[i] || 5;
  return total / 6;
}

export function estimateVSizeFromTx(tx: any): number {
  return Math.ceil(tx.toBuffer().length);
}

export function computeFeeForSignedTx(
  tx: any,
  feerateSatPerVb: number
): number {
  const vsize = estimateVSizeFromTx(tx);
  return Math.ceil(vsize * feerateSatPerVb);
}
