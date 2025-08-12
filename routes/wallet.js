const express = require("express");
const router = express.Router();
const {
  createWallet,
  createHDWallet,
  importWalletFromMnemonic,
  createMultisig,
  retrieveMnemonic,
} = require("../controllers/walletController");

// Create a new wallet
router.post("/", createWallet);

// Create a new HD wallet
router.post("/hd", createHDWallet);

// Retrieve wallet from MNEMONIC key
router.post("/retrieve", importWalletFromMnemonic);

// Create Multisig wallet
router.post("/multisig", createMultisig);

// Retrieve decrypted mnemonic
router.post("/mnemonic", retrieveMnemonic);

module.exports = router;
