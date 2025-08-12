import type { Request, Response } from "express";
import * as bitcoin from "bitcoinjs-lib";
import { isTestnet } from "../lib/net";

export function validateAddress(req: Request, res: Response) {
  const address = String(req.query.address || "").trim();
  if (!address) return res.status(400).json({ error: "address is required" });

  const tryNet = (net: bitcoin.Network, label: "mainnet" | "testnet") => {
    try {
      bitcoin.address.toOutputScript(address, net);
      return label;
    } catch {
      return null;
    }
  };

  const n =
    tryNet(bitcoin.networks.bitcoin, "mainnet") ||
    tryNet(bitcoin.networks.testnet, "testnet");

  const isValid = Boolean(n);
  const network = n || "invalid";
  const matchesConfiguredNetwork =
    (isTestnet && network === "testnet") ||
    (!isTestnet && network === "mainnet");

  res.json({ address, isValid, network, matchesConfiguredNetwork });
}
