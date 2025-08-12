const bitcore = require("bitcore-lib");
const Mnemonic = require("bitcore-mnemonic");
const axios = require("axios");
const { API, isTestnet } = require("../lib/net");
const { fetchFeerateSatPerVb, computeFeeForSignedTx } = require("../lib/fees");
const {
  findById,
  findByAddress,
  getDecryptedSecret,
} = require("../lib/keystore");

// Resolve a signing key from keystore using walletId or fromAddress + password
function resolveSigningKey({ walletId, fromAddressHint, password, network }) {
  let rec = null;
  if (walletId) rec = findById(walletId);
  if (!rec && fromAddressHint) rec = findByAddress(fromAddressHint);
  if (!rec) {
    const err = new Error("Wallet not found (provide walletId or fromAddress)");
    err.code = "WALLET_NOT_FOUND";
    throw err;
  }

  const secret = getDecryptedSecret(rec, password); // throws on bad password

  // Single wallet -> decrypt WIF
  if (secret.type === "single") {
    const pk = new bitcore.PrivateKey.fromWIF(
      secret.wif,
      network // ensure correct net
    );
    const addr = pk.toAddress(network).toString();
    if (fromAddressHint && fromAddressHint !== addr) {
      const e = new Error(
        "Password does not unlock the provided fromAddress (mismatch)"
      );
      e.code = "ADDR_MISMATCH";
      throw e;
    }
    return { privateKey: pk, fromAddress: addr };
  }

  // HD wallet -> decrypt mnemonic, use master key (same address we stored)
  if (secret.type === "hd") {
    const xpriv = new Mnemonic(secret.mnemonic).toHDPrivateKey(null, network);
    const pk = xpriv.privateKey;
    const addr = pk.toAddress(network).toString();
    if (fromAddressHint && fromAddressHint !== addr) {
      const e = new Error(
        "Password does not unlock the provided fromAddress (mismatch)"
      );
      e.code = "ADDR_MISMATCH";
      throw e;
    }
    return { privateKey: pk, fromAddress: addr };
  }

  const err = new Error("Unsupported wallet type in keystore");
  err.code = "BAD_TYPE";
  throw err;
}

/**
 * POST /reimburseBtc/reimburseBitcoin
 * body: { to, amount, password, walletId?, fromAddress? }
 */
exports.reimburseBitcoin = async (req, res) => {
  try {
    const to = (req.body.to || "").trim();
    const amountStr = (req.body.amount || "").trim();
    const password = (req.body.password || "").trim();
    const walletId = (req.body.walletId || "").trim() || null;
    const fromAddressHint = (req.body.fromAddress || "").trim() || null;

    if (!to || !amountStr) {
      return res.status(400).json({ error: "to and amount are required" });
    }
    if (!password) {
      return res.status(400).json({ error: "password is required" });
    }

    const network = isTestnet
      ? bitcore.Networks.testnet
      : bitcore.Networks.livenet;

    // Validate destination address & network
    let dest;
    try {
      dest = new bitcore.Address(to);
      const ok =
        (isTestnet && dest.network.name === "testnet") ||
        (!isTestnet && dest.network.name !== "testnet");
      if (!ok)
        return res
          .status(400)
          .json({ error: "Address not for configured network" });
    } catch {
      return res.status(400).json({ error: "Invalid destination address" });
    }

    // 🔑 derive signing key from keystore
    const { privateKey, fromAddress } = resolveSigningKey({
      walletId,
      fromAddressHint,
      password,
      network,
    });

    // Load UTXOs for the source address
    const { data: utxos } = await axios.get(
      `${API}/address/${fromAddress}/utxo`
    );
    if (!Array.isArray(utxos) || utxos.length === 0) {
      return res.status(400).json({ error: "No UTXOs found for this address" });
    }

    const satoshisToSend = bitcore.Unit.fromBTC(amountStr).toSatoshis();
    if (satoshisToSend < 546) {
      return res.status(400).json({ error: "Amount below dust" });
    }

    // Build a provisional tx to estimate size/fee
    const inputs = utxos.map((u) => ({
      txId: u.txid,
      outputIndex: u.vout,
      script: bitcore.Script.buildPublicKeyHashOut(fromAddress).toString(),
      satoshis: u.value,
    }));

    const provisional = new bitcore.Transaction()
      .from(inputs)
      .to(to, satoshisToSend)
      .change(fromAddress);

    // Enable RBF
    provisional.inputs.forEach((i) => (i.sequenceNumber = 0xfffffffd));
    provisional.sign(privateKey);

    const feerate = await fetchFeerateSatPerVb();
    const fee = computeFeeForSignedTx(provisional, feerate);

    const totalIn = utxos.reduce((a, u) => a + u.value, 0);
    const remaining = totalIn - satoshisToSend - fee;
    if (remaining < 0) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    // Final tx with explicit fee
    const finalTx = new bitcore.Transaction()
      .from(inputs)
      .to(to, satoshisToSend)
      .change(fromAddress)
      .fee(fee);

    finalTx.inputs.forEach((i) => (i.sequenceNumber = 0xfffffffd));
    finalTx.sign(privateKey);

    const raw = finalTx.serialize();

    // Broadcast via Blockstream (raw hex)
    const { data: txid } = await axios.post(`${API}/tx`, raw, {
      headers: { "Content-Type": "text/plain" },
    });

    res.json({
      txId: txid,
      fromAddress,
      feeSatoshis: fee,
      feerateSatPerVb: feerate,
    });
  } catch (error) {
    console.error(error);
    // Friendly error for common cases
    if (error.code === "BAD_PASSWORD") {
      return res.status(401).json({ error: "Invalid password" });
    }
    if (error.code === "WALLET_NOT_FOUND") {
      return res
        .status(404)
        .json({ error: "Wallet not found (walletId/fromAddress missing)" });
    }
    if (error.code === "ADDR_MISMATCH") {
      return res
        .status(400)
        .json({ error: "Password does not unlock the given fromAddress" });
    }
    res.status(500).json({ error: error.message || "broadcast failed" });
  }
};
