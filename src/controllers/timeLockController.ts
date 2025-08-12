import type { Request, Response } from "express";
import axios from "axios";
import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import { ECPairFactory } from "ecpair";
import { mnemonicToSeedSync } from "@scure/bip39";
import { HDKey } from "@scure/bip32";
import { API, isTestnet } from "../lib/net";
import { fetchFeerateSatPerVb } from "../lib/fees";
import {
  findByAddress,
  findById,
  getDecryptedSecret,
  KeystoreRecord,
} from "../lib/keystore";

const ECPair = ECPairFactory(ecc);
const network = isTestnet ? bitcoin.networks.testnet : bitcoin.networks.bitcoin;

type Utxo = { txid: string; vout: number; value: number };

function worstCaseFee(inCount: number, outCount: number, feerate: number) {
  const vbytes = 10 + inCount * 148 + outCount * 34;
  return Math.ceil(vbytes * feerate);
}
async function fetchUtxos(address: string): Promise<Utxo[]> {
  const { data } = await axios.get(`${API}/address/${address}/utxo`);
  return (data || []).map((u: any) => ({
    txid: u.txid,
    vout: u.vout,
    value: u.value,
  }));
}
async function fetchPrevTxHex(txid: string): Promise<string> {
  const { data } = await axios.get(`${API}/tx/${txid}/hex`);
  return data as string;
}
function keypairFromRecord(rec: KeystoreRecord, password: string) {
  const sec = getDecryptedSecret(rec, password);
  if (rec.type === "single" && "wif" in sec) {
    const keyPair = ECPair.fromWIF(sec.wif, network);
    const { address } = bitcoin.payments.p2wpkh({
      pubkey: keyPair.publicKey,
      network,
    });
    if (!address) throw new Error("Failed to derive fromAddress");
    return { fromAddress: address, keyPair };
  }
  if (rec.type === "hd" && "mnemonic" in sec) {
    const seed = mnemonicToSeedSync(sec.mnemonic);
    const root = HDKey.fromMasterSeed(seed);
    const coin = isTestnet ? 1 : 0;
    const child = root.derive(`m/84'/${coin}'/0'/0/0`);
    if (!child.privateKey) throw new Error("HD child has no private key");
    const keyPair = ECPair.fromPrivateKey(Buffer.from(child.privateKey), {
      network,
    });
    const { address } = bitcoin.payments.p2wpkh({
      pubkey: keyPair.publicKey,
      network,
    });
    if (!address) throw new Error("Failed to derive fromAddress");
    return { fromAddress: address, keyPair };
  }
  throw new Error("Unsupported wallet type");
}

/**
 * body: { recipientAddress, amountInBTC, timestamp, password, walletId?, fromAddress? }
 * returns: unsigned/broadcasted? -> we return txHex (not broadcast) like before
 */
export async function createTimeLockTransaction(req: Request, res: Response) {
  try {
    const recipientAddress = String(req.body?.recipientAddress || "").trim();
    const amountInBTC = String(req.body?.amountInBTC || "").trim();
    const timestamp = Number(req.body?.timestamp || 0);
    const password = String(req.body?.password || "");
    const walletId = req.body?.walletId ? String(req.body.walletId) : "";
    const fromAddressHint = req.body?.fromAddress
      ? String(req.body.fromAddress)
      : "";

    if (!recipientAddress || !amountInBTC || !timestamp || !password) {
      return res.status(400).json({
        error: "recipientAddress, amountInBTC, timestamp, password required",
      });
    }
    if (timestamp <= Math.floor(Date.now() / 1000)) {
      return res
        .status(400)
        .json({ error: "timestamp must be in the future (Unix seconds)" });
    }

    const rec =
      (walletId && findById(walletId)) ||
      (fromAddressHint && findByAddress(fromAddressHint)) ||
      null;
    if (!rec) return res.status(404).json({ error: "Wallet not found" });

    const { keyPair, fromAddress } = keypairFromRecord(rec, password);
    if (fromAddressHint && fromAddressHint !== fromAddress)
      return res
        .status(400)
        .json({ error: "Active address does not match keystore" });

    const amount = Math.round(Number(amountInBTC) * 1e8);
    if (!(amount > 0)) return res.status(400).json({ error: "Invalid amount" });
    if (amount < 546)
      return res.status(400).json({ error: "Amount below dust" });

    const utxos = await fetchUtxos(fromAddress);
    if (!utxos.length)
      return res.status(400).json({ error: "No UTXOs for this address" });

    const feerate = await fetchFeerateSatPerVb();

    // coin selection
    let selected: Utxo[] = [];
    let totalIn = 0;
    let outCount = 2; // recipient + change (likely)
    let fee = 0;
    for (const u of utxos) {
      selected.push(u);
      totalIn += u.value;
      const change =
        totalIn - amount - worstCaseFee(selected.length, 2, feerate);
      outCount = change >= 546 ? 2 : 1;
      fee = worstCaseFee(selected.length, outCount, feerate);
      if (totalIn >= amount + fee) break;
    }
    if (totalIn < amount + fee)
      return res.status(400).json({ error: "Insufficient balance" });

    const psbt = new bitcoin.Psbt({ network });
    for (const u of selected) {
      const prevHex = await fetchPrevTxHex(u.txid);
      psbt.addInput({
        hash: u.txid,
        index: u.vout,
        nonWitnessUtxo: Buffer.from(prevHex, "hex"),
        sequence: 0xfffffffd, // RBF + needed for locktime
      });
    }

    // set absolute locktime (UNIX seconds)
    psbt.setLocktime(timestamp);

    // outputs
    psbt.addOutput({ address: recipientAddress, value: amount });
    const change = totalIn - amount - fee;
    if (change >= 546) psbt.addOutput({ address: fromAddress, value: change });

    // sign & finalize
    psbt.signAllInputs(keyPair);
    psbt.finalizeAllInputs();
    const txHex = psbt.extractTransaction().toHex();

    res.json({
      txHex,
      lockTime: timestamp,
      feeSatoshis: fee,
      feerateSatPerVb: feerate,
    });
  } catch (err: any) {
    console.error("Error creating time-locked transaction:", err);
    res.status(500).json({ error: err?.message || "Failed to create tx" });
  }
}
