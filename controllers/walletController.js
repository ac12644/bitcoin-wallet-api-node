const bitcore = require("bitcore-lib");
const Mnemonic = require("bitcore-mnemonic");
const { LocalStorage } = require("node-localstorage");
const { isTestnet } = require("../lib/net");
const { saveSingle, saveHD } = require("../lib/keystore");

const localStorage = new LocalStorage("./scratch");
const network = isTestnet ? bitcore.Networks.testnet : bitcore.Networks.livenet;

/**
 * POST /wallet
 * body: { password }
 * Creates a SINGLE wallet (random key), encrypts WIF with password, stores server-side.
 * Returns { id, address, type:"single" }
 */
exports.createWallet = (req, res) => {
  const password = (req.body?.password || "").trim();
  if (!password) return res.status(400).json({ error: "Password is required" });

  const privateKey = new bitcore.PrivateKey(undefined, network);
  const address = privateKey.toAddress(network).toString();

  // optional legacy list (watch-only) for your UI
  const wallets = JSON.parse(localStorage.getItem("wallets") || "[]");
  localStorage.setItem("wallets", JSON.stringify([...wallets, { address }]));

  const out = saveSingle({ address, wif: privateKey.toWIF(), password });
  res.json(out); // { id, type, address }
};

/**
 * POST /wallet/hd
 * body: { password }
 * Creates an HD wallet, encrypts MNEMONIC with password, stores server-side.
 * Returns { id, address, xpub, type:"hd" }
 */
exports.createHDWallet = (req, res) => {
  const password = (req.body?.password || "").trim();
  if (!password) return res.status(400).json({ error: "Password is required" });

  const mnemonic = new Mnemonic();
  const xpriv = mnemonic.toHDPrivateKey(null, network);
  const xpub = xpriv.hdPublicKey.xpubkey;
  const address = xpriv.publicKey.toAddress(network).toString();

  // optional legacy list for your UI
  const list = JSON.parse(localStorage.getItem("hdwallets") || "[]");
  localStorage.setItem(
    "hdwallets",
    JSON.stringify([...list, { xpub, address }])
  );

  const out = saveHD({
    address,
    xpub,
    mnemonic: mnemonic.toString(),
    password,
  });
  res.json(out); // { id, type, address, xpub }
};

/**
 * POST /wallet/retrieve
 * body: { mnemonic, password }
 * Imports HD mnemonic, encrypts and stores.
 * Returns { id, address, xpub, type:"hd" }
 */
exports.importWalletFromMnemonic = (req, res) => {
  const mnemonicStr = (req.body?.mnemonic || "").trim();
  const password = (req.body?.password || "").trim();
  if (!mnemonicStr || !password) {
    return res
      .status(400)
      .json({ error: "Mnemonic and password are required" });
  }
  if (!Mnemonic.isValid(mnemonicStr)) {
    return res.status(400).json({ error: "Invalid mnemonic" });
  }

  const m = new Mnemonic(mnemonicStr);
  const xpriv = m.toHDPrivateKey(null, network);
  const xpub = xpriv.hdPublicKey.xpubkey;
  const address = xpriv.publicKey.toAddress(network).toString();

  const out = saveHD({ address, xpub, mnemonic: mnemonicStr, password });
  res.json(out);
};

/**
 * POST /wallet/multisig (unchanged except for network var)
 */
exports.createMultisig = (req, res) => {
  const { publicKeys, requiredSignatures } = req.body || {};
  const m = Number(requiredSignatures || 0);
  if (!Array.isArray(publicKeys) || publicKeys.length < m || m <= 0) {
    return res
      .status(400)
      .json({ error: "Invalid public keys or required signatures count" });
  }
  const addr = bitcore.Address.createMultisig(
    publicKeys.map((k) => new bitcore.PublicKey(k)),
    m,
    network
  );
  const list = JSON.parse(localStorage.getItem("multisig") || "[]");
  localStorage.setItem("multisig", JSON.stringify([...list, addr.toString()]));
  res.json({ address: addr.toString(), m, n: publicKeys.length });
};

/**
 * POST /wallet/mnemonic
 * body: { id, password }
 * Decrypt the mnemonic for the given saved HD wallet.
 */
const { findById, getDecryptedSecret } = require("../lib/keystore");
exports.retrieveMnemonic = (req, res) => {
  const id = (req.body?.id || "").trim();
  const password = (req.body?.password || "").trim();
  if (!id || !password)
    return res.status(400).json({ error: "id and password are required" });

  const rec = findById(id);
  if (!rec || rec.type !== "hd")
    return res.status(404).json({ error: "HD wallet not found" });

  try {
    const { mnemonic } = getDecryptedSecret(rec, password);
    res.json({ mnemonic });
  } catch (e) {
    if (e.code === "BAD_PASSWORD")
      return res.status(401).json({ error: "Invalid password" });
    res.status(500).json({ error: e.message || "Failed to retrieve mnemonic" });
  }
};
