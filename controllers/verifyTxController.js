const axios = require("axios");
const { API } = require("../lib/net");

const getTransactionStatus = async (txid) => {
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
};

exports.verifyTx = async (req, res) => {
  const ids = Array.isArray(req.body.txids) ? req.body.txids : [req.body.txids];
  if (!ids || !ids.length)
    return res.status(400).json({ error: "txids required" });

  const results = await Promise.all(
    ids.map((id) => getTransactionStatus((id || "").trim()))
  );
  res.json(results);
};
