const bitcore = require("bitcore-lib");
const axios = require("axios");
const Mnemonic = require("bitcore-mnemonic");
const { API, isTestnet } = require("../lib/net");
const { fetchFeerateSatPerVb, computeFeeForSignedTx } = require("../lib/fees");

// keystore helpers (password-protected storage)
const {
  findById,
  findByAddress,
  getDecryptedSecret,
} = require("../lib/keystore");

/**
 * POST /timeLock
 * body: {
 *   recipientAddress: string,
 *   amountInBTC: string,
 *   timestamp: number (unix seconds in the future),
 *   password: string,
 *   walletId?: string,           // preferred
 *   fromAddress?: string         // fallback/legacy
 * }
 * Returns unsigned/broadcast-ready tx hex with nLockTime set.
 */
exports.createTimeLockTransaction = async (req, res) => {
  try {
    const {
      recipientAddress,
      amountInBTC,
      timestamp,
      password,
      walletId,
      fromAddress: fromAddrOverride,
    } = req.body || {};

    if (!recipientAddress || !amountInBTC || !timestamp) {
      return res.status(400).json({
        error: "recipientAddress, amountInBTC, timestamp required",
      });
    }
    if (!password) {
      return res.status(400).json({ error: "password required" });
    }

    const now = Math.floor(Date.now() / 1000);
    if (+timestamp <= now) {
      return res
        .status(400)
        .json({ error: "timestamp must be in the future (Unix seconds)" });
    }

    const network = isTestnet
      ? bitcore.Networks.testnet
      : bitcore.Networks.livenet;

    // Validate destination matches configured network
    try {
      const dest = new bitcore.Address(recipientAddress);
      const ok =
        (isTestnet && dest.network.name === "testnet") ||
        (!isTestnet && dest.network.name !== "testnet");
      if (!ok)
        return res
          .status(400)
          .json({ error: "Address not for configured network" });
    } catch {
      return res.status(400).json({ error: "Invalid recipient address" });
    }

    // ---------- load & decrypt signing key ----------
    let rec =
      (walletId && findById(walletId)) ||
      (fromAddrOverride && findByAddress(fromAddrOverride));
    if (!rec) {
      return res
        .status(404)
        .json({ error: "Wallet not found (walletId/fromAddress)" });
    }

    let privateKey;
    try {
      const secret = getDecryptedSecret(rec, password); // throws on bad password
      if (secret.type === "single") {
        privateKey = new bitcore.PrivateKey.fromWIF(
          secret.wif,
          network // optional; bitcore infers from WIF
        );
      } else if (secret.type === "hd") {
        const m = new Mnemonic(secret.mnemonic);
        const xpriv = m.toHDPrivateKey(null, network);
        // Demo: use master key’s address (matches address returned at create/import time)
        privateKey = xpriv.privateKey;
      } else {
        return res.status(400).json({ error: "Unsupported wallet type" });
      }
    } catch (e) {
      if (e && e.code === "BAD_PASSWORD") {
        return res.status(401).json({ error: "Invalid password" });
      }
      return res.status(500).json({ error: e.message || "Unlock failed" });
    }

    const fromAddress = privateKey.toAddress(network).toString();
    if (fromAddrOverride && fromAddrOverride !== fromAddress) {
      return res
        .status(400)
        .json({ error: "fromAddress does not match unlocked wallet" });
    }

    // ---------- gather UTXOs ----------
    const { data: utxos } = await axios.get(
      `${API}/address/${fromAddress}/utxo`
    );
    if (!Array.isArray(utxos) || utxos.length === 0) {
      return res.status(400).json({ error: "No UTXOs for fromAddress" });
    }

    const satoshisToSend = bitcore.Unit.fromBTC(amountInBTC).toSatoshis();
    if (satoshisToSend < 546) {
      return res.status(400).json({ error: "Amount below dust" });
    }

    // ---------- build provisional (to estimate fee) ----------
    const inputs = utxos.map((u) => ({
      txId: u.txid,
      outputIndex: u.vout,
      script: bitcore.Script.buildPublicKeyHashOut(fromAddress).toString(),
      satoshis: u.value,
    }));

    const provisional = new bitcore.Transaction()
      .from(inputs)
      .to(recipientAddress, satoshisToSend)
      .change(fromAddress);

    provisional.lockUntilDate(new Date(+timestamp * 1000));
    provisional.inputs.forEach((i) => (i.sequenceNumber = 0xfffffffd)); // RBF
    provisional.sign(privateKey);

    const feerate = await fetchFeerateSatPerVb();
    const fee = computeFeeForSignedTx(provisional, feerate);

    const totalIn = utxos.reduce((a, u) => a + u.value, 0);
    const remaining = totalIn - satoshisToSend - fee;
    if (remaining < 0) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    // ---------- final tx ----------
    const tx = new bitcore.Transaction()
      .from(inputs)
      .to(recipientAddress, satoshisToSend)
      .change(fromAddress)
      .fee(fee);

    tx.lockUntilDate(new Date(+timestamp * 1000));
    tx.inputs.forEach((i) => (i.sequenceNumber = 0xfffffffd));
    tx.sign(privateKey);

    res.json({
      txHex: tx.serialize(),
      fromAddress,
      lockTime: +timestamp,
      feeSatoshis: fee,
      feerateSatPerVb: feerate,
    });
  } catch (error) {
    console.error("TimeLock error:", error);
    res.status(500).json({ error: error.message || "Failed to build tx" });
  }
};
