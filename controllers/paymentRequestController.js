const qrcode = require("qrcode");
const { LocalStorage } = require("node-localstorage");

const localStorage = new LocalStorage("./qrCodes");

/**
 * GET /payment/payment-request-qr?address=...&amount=...&message=...
 * Returns a data URL and a simple id for later retrieval (if needed).
 */
exports.generatePaymentRequestQR = async (req, res) => {
  const { address, amount, message = "" } = req.query || {};
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
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};
