const bitcore = require("bitcore-lib");
const axios = require("axios");
const Mnemonic = require("bitcore-mnemonic");
const { API, isTestnet } = require("../lib/net");
const { fetchFeerateSatPerVb, computeFeeForSignedTx } = require("../lib/fees");
const {
  findById,
  findByAddress,
  getDecryptedSecret,
} = require("../lib/keystore");

const network = isTestnet ? bitcore.Networks.testnet : bitcore.Networks.livenet;

/**
 * POST /sendbtc
 * body: {
 *   to: "tb1...", amount: "0.001",
 *   // choose one lookup:
 *   walletId?: "uuid", fromAddress?: "tb1...",
 *   // mandatory:
 *   password: "user-supplied"
 * }
 */
exports.sendBitcoin = async (req, res) => {
  try {
    const to = (req.body?.to || "").trim();
    const amountStr = (req.body?.amount || "").trim();
    const walletId = (req.body?.walletId || "").trim();
    const fromAddressParam = (req.body?.fromAddress || "").trim();
    const password = (req.body?.password || "").trim();

    if (!to || !amountStr)
      return res.status(400).json({ error: "to and amount are required" });
    if (!password)
      return res.status(400).json({ error: "password is required" });

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

    // Locate stored wallet record
    let rec = null;
    if (walletId) rec = findById(walletId);
    if (!rec && fromAddressParam) rec = findByAddress(fromAddressParam);
    if (!rec)
      return res
        .status(404)
        .json({ error: "Wallet not found (id or fromAddress)" });

    // Decrypt secret with password -> bitcore.PrivateKey
    let privateKey;
    try {
      const secret = getDecryptedSecret(rec, password);
      if (secret.type === "single") {
        privateKey = bitcore.PrivateKey.fromWIF(secret.wif);
      } else if (secret.type === "hd") {
        // derive the same default address we displayed when saving (root pubkey address)
        const m = new Mnemonic(secret.mnemonic);
        const xpriv = m.toHDPrivateKey(null, network);
        privateKey = xpriv.privateKey;
      } else {
        return res.status(400).json({ error: "Unsupported wallet type" });
      }
    } catch (e) {
      if (e.code === "BAD_PASSWORD")
        return res.status(401).json({ error: "Invalid password" });
      return res
        .status(500)
        .json({ error: e.message || "Failed to unlock key" });
    }

    const fromAddress = privateKey.toAddress(network).toString();

    // Load UTXOs
    const { data: utxos } = await axios.get(
      `${API}/address/${fromAddress}/utxo`
    );
    if (!Array.isArray(utxos) || utxos.length === 0) {
      return res.status(400).json({ error: "No UTXOs found for this address" });
    }

    const satoshisToSend = bitcore.Unit.fromBTC(amountStr).toSatoshis();
    if (satoshisToSend < 546)
      return res.status(400).json({ error: "Amount below dust" });

    // Build provisional, sign (for vsize)
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
    provisional.inputs.forEach((i) => (i.sequenceNumber = 0xfffffffd)); // RBF
    provisional.sign(privateKey);

    const feerate = await fetchFeerateSatPerVb();
    const fee = computeFeeForSignedTx(provisional, feerate);

    const totalIn = utxos.reduce((a, u) => a + u.value, 0);
    const remaining = totalIn - satoshisToSend - fee;
    if (remaining < 0)
      return res.status(400).json({ error: "Insufficient balance" });

    // Final tx
    const tx = new bitcore.Transaction()
      .from(inputs)
      .to(to, satoshisToSend)
      .change(fromAddress)
      .fee(fee);
    tx.inputs.forEach((i) => (i.sequenceNumber = 0xfffffffd));
    tx.sign(privateKey);

    const raw = tx.serialize();
    const { data: txid } = await axios.post(`${API}/tx`, raw, {
      headers: { "Content-Type": "text/plain" },
    });

    res.json({
      txId: txid,
      fromAddress,
      feeSatoshis: fee,
      feerateSatPerVb: feerate,
      walletType: rec.type,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || "send failed" });
  }
};
