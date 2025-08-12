const bitcore = require("bitcore-lib");
const { isTestnet } = require("../lib/net");

// Light bech32/bech32m check; bitcore may not validate taproot bech32m correctly
const BECH32_RE = /^(bc1|tb1)[0-9a-z]{11,87}$/;

exports.validateAddress = (req, res) => {
  const address = (req.query.address || "").trim();
  if (!address) return res.status(400).json({ error: "address is required" });

  try {
    let isValid = false;
    let network = "invalid";

    // Try bitcore (covers P2PKH/P2SH/bech32 in many cases)
    try {
      const addr = new bitcore.Address(address);
      isValid = true;
      network =
        addr.network && addr.network.name === "testnet" ? "testnet" : "mainnet";
    } catch (_) {
      // Fallback for bech32/bech32m taproot style
      if (BECH32_RE.test(address)) {
        isValid = true;
        network = address.startsWith("tb1") ? "testnet" : "mainnet";
      }
    }

    // Optional: ensure matches configured network
    const matchesConfiguredNetwork =
      (isTestnet && network === "testnet") ||
      (!isTestnet && network === "mainnet");

    res.json({ address, isValid, network, matchesConfiguredNetwork });
  } catch (error) {
    console.error("Error validating address:", error);
    res.status(400).json({ error: "Invalid address format" });
  }
};
