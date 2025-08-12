const axios = require("axios");
const { API } = require("./net");

/**
 * Fetch average feerate (sat/vB) using Blockstream fee-estimates.
 * Simple mean of targets 1..6 (fast confirmation).
 */
async function fetchFeerateSatPerVb() {
  const { data } = await axios.get(`${API}/fee-estimates`);
  let total = 0;
  for (let i = 1; i <= 6; i++) total += data[i] || 5;
  return total / 6; // sat/vB
}

/**
 * Rough vsize in virtual bytes from a signed tx object (bitcore-lib).
 * For our P2PKH/Testnet flows, tx.toBuffer().length is a decent proxy.
 */
function estimateVSizeFromTx(tx) {
  return Math.ceil(tx.toBuffer().length); // bytes ≈ vbytes (OK for non-SegWit)
}

/**
 * Compute a fee in satoshis from a signed tx and a feerate (sat/vB).
 */
function computeFeeForSignedTx(tx, feerateSatPerVb) {
  const vsize = estimateVSizeFromTx(tx);
  return Math.ceil(vsize * feerateSatPerVb);
}

module.exports = {
  fetchFeerateSatPerVb,
  estimateVSizeFromTx,
  computeFeeForSignedTx,
};
