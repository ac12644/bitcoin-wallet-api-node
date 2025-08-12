import type { Request, Response } from "express";
import qrcode from "qrcode";
import { LocalStorage } from "node-localstorage";

const localStorage = new LocalStorage("./qrCodes");

/**
 * GET /payment/payment-request-qr?address=...&amount=...&message=...
 */
export async function generatePaymentRequestQR(req: Request, res: Response) {
  const { address, amount, message = "" } = req.query as Record<string, string>;
  if (!address || !amount) {
    return res
      .status(400)
      .json({ success: false, error: "address and amount are required" });
  }
  try {
    const bip21 = `bitcoin:${address}?amount=${encodeURIComponent(amount)}${
      message ? `&message=${encodeURIComponent(message)}` : ""
    }`;
    const dataUrl = await qrcode.toDataURL(bip21);
    const id = Date.now().toString();
    localStorage.setItem(`qr_${id}`, dataUrl);
    res.json({ success: true, id, bip21, dataUrl });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message });
  }
}
