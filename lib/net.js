const isTestnet = (process.env.NETWORK || "testnet") === "testnet";
const API = isTestnet
  ? "https://mempool.space/testnet4/api"
  : "https://mempool.space/api";

module.exports = { isTestnet, API };
