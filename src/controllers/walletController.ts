import type { Request, Response } from "express";
import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import { ECPairFactory } from "ecpair";
import {
  generateMnemonic,
  mnemonicToSeedSync,
  validateMnemonic,
} from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { HDKey } from "@scure/bip32";
import { LocalStorage } from "node-localstorage";
import { isTestnet } from "../lib/net";
import {
  saveSingle,
  saveHD,
  findById,
  verifyPassword,
  getDecryptedSecret,
} from "../lib/keystore";

const ECPair = ECPairFactory(ecc);
const localStorage = new LocalStorage("./scratch");
const network = isTestnet ? bitcoin.networks.testnet : bitcoin.networks.bitcoin;

// helper: derive BIP84 m/84'/coin'/0'/0/0 from mnemonic
function deriveBip84KeypairFromMnemonic(mnemonic: string) {
  const seed = mnemonicToSeedSync(mnemonic);
  const root = HDKey.fromMasterSeed(seed);
  const coin = isTestnet ? 1 : 0;
  const path = `m/84'/${coin}'/0'/0/0`;
  const child = root.derive(path);
  if (!child.privateKey) throw new Error("HD child has no private key");
  const keyPair = ECPair.fromPrivateKey(Buffer.from(child.privateKey), {
    network,
  });
  const { address } = bitcoin.payments.p2wpkh({
    pubkey: keyPair.publicKey,
    network,
  });
  if (!address) throw new Error("Failed to derive address");
  return { keyPair, address, path };
}

// POST /wallet  { password }
export function createWallet(req: Request, res: Response) {
  const password = String(req.body?.password || "");
  if (!password) return res.status(400).json({ error: "Password is required" });

  const keyPair = ECPair.makeRandom({ network });
  const wif = keyPair.toWIF();
  const { address } = bitcoin.payments.p2wpkh({
    pubkey: keyPair.publicKey,
    network,
  });
  if (!address) return res.status(500).json({ error: "Address gen failed" });

  const record = saveSingle({ address, wif, password });

  // keep tiny UI cache (legacy)
  const wallets = JSON.parse(localStorage.getItem("wallets") || "[]");
  localStorage.setItem("wallets", JSON.stringify([...wallets, { address }]));

  res.json({ id: record.id, address });
}

// POST /wallet/hd  { password }
export function createHDWallet(req: Request, res: Response) {
  const password = String(req.body?.password || "");
  if (!password) return res.status(400).json({ error: "Password is required" });

  const mnemonic = generateMnemonic(wordlist, 256);
  const { address } = deriveBip84KeypairFromMnemonic(mnemonic);
  // Export a standard BIP32 xpub (root neutered) for convenience
  const xpub = HDKey.fromMasterSeed(mnemonicToSeedSync(mnemonic))
    .publicExtendedKey as string;

  const record = saveHD({ address, xpub, mnemonic, password });
  res.json({ id: record.id, xpub, address });
}

// POST /wallet/retrieve  { mnemonic, password }
export function importWalletFromMnemonic(req: Request, res: Response) {
  const mnemonic = String(req.body?.mnemonic || "").trim();
  const password = String(req.body?.password || "");
  if (!mnemonic || !password)
    return res
      .status(400)
      .json({ error: "Mnemonic and password are required" });
  if (!validateMnemonic(mnemonic, wordlist))
    return res.status(400).json({ error: "Invalid mnemonic provided." });

  const { address } = deriveBip84KeypairFromMnemonic(mnemonic);
  const xpub = HDKey.fromMasterSeed(mnemonicToSeedSync(mnemonic))
    .publicExtendedKey as string;

  const record = saveHD({ address, xpub, mnemonic, password });
  res.json({ id: record.id, xpub, address });
}

// POST /wallet/multisig  { publicKeys: string[], requiredSignatures: number }
export function createMultisig(req: Request, res: Response) {
  const publicKeys = Array.isArray(req.body?.publicKeys)
    ? req.body.publicKeys
    : [];
  const m = Number(req.body?.requiredSignatures || 0);
  if (!publicKeys.length || m <= 0 || m > publicKeys.length)
    return res
      .status(400)
      .json({ error: "Invalid public keys or required signatures count" });

  const pubkeys = publicKeys.map((hex: string) => Buffer.from(hex, "hex"));
  const p2ms = bitcoin.payments.p2ms({ m, pubkeys, network });
  const p2sh = bitcoin.payments.p2sh({ redeem: p2ms, network });
  if (!p2sh.address) return res.status(500).json({ error: "Create failed" });

  // keep legacy list for UI “multisig” section
  const list = JSON.parse(localStorage.getItem("multisig") || "[]");
  localStorage.setItem("multisig", JSON.stringify([...list, p2sh.address]));
  res.json({ address: p2sh.address, m, n: publicKeys.length });
}

// POST /wallet/mnemonic  { walletId, password }
export function retrieveMnemonic(req: Request, res: Response) {
  const walletId = String(req.body?.walletId || "");
  const password = String(req.body?.password || "");
  if (!walletId || !password)
    return res
      .status(400)
      .json({ error: "walletId and password are required" });

  const rec = findById(walletId);
  if (!rec || rec.type !== "hd")
    return res.status(404).json({ error: "HD wallet not found" });
  if (!verifyPassword(rec, password))
    return res.status(401).json({ error: "Invalid password" });

  const sec = getDecryptedSecret(rec, password); // { type:'hd', mnemonic }
  res.json({ mnemonic: (sec as any).mnemonic });
}
