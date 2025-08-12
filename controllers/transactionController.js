const axios = require("axios");
const bitcore = require("bitcore-lib");
const { API } = require("../lib/net");

exports.getBalance = async (req, res) => {
  const address = (req.params.address || "").trim();
  if (!address) return res.status(400).json({ error: "address is required" });

  try {
    const { data } = await axios.get(`${API}/address/${address}`);
    const c = data.chain_stats || {};
    const m = data.mempool_stats || {};
    const confirmed = (c.funded_txo_sum || 0) - (c.spent_txo_sum || 0);
    const pending = (m.funded_txo_sum || 0) - (m.spent_txo_sum || 0);
    res.json({
      confirmedBTC: bitcore.Unit.fromSatoshis(confirmed).toBTC(),
      pendingBTC: bitcore.Unit.fromSatoshis(pending).toBTC(),
      confirmedSats: confirmed,
      pendingSats: pending,
    });
  } catch (error) {
    console.error(`getBalance error:`, error?.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch balance" });
  }
};

exports.getTransactions = async (req, res) => {
  const address = (req.params.address || "").trim();
  if (!address) return res.status(400).json({ error: "address is required" });

  try {
    const { data } = await axios.get(`${API}/address/${address}/txs`);
    res.json({ transactions: data });
  } catch (error) {
    console.error(
      `getTransactions error:`,
      error?.response?.data || error.message
    );
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
};
