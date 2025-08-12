import { Router } from "express";
import {
  createWallet,
  createHDWallet,
  importWalletFromMnemonic,
  createMultisig,
  retrieveMnemonic,
} from "../controllers/walletController";

const router = Router();

router.post("/", createWallet);
router.post("/hd", createHDWallet);
router.post("/retrieve", importWalletFromMnemonic);
router.post("/multisig", createMultisig);
router.post("/mnemonic", retrieveMnemonic);

export default router;
