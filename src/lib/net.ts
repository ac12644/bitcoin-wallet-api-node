export const isTestnet = (process.env.NETWORK || "testnet") === "testnet";
export const API = isTestnet
  ? "https://mempool.space/testnet4/api"
  : "https://mempool.space/api";
