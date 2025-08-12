import { LocalStorage } from "node-localstorage";
import * as crypto from "crypto";
import * as bcrypt from "bcrypt";

const store = new LocalStorage("./keystore");
const saltRounds = 10 as const;

export type WalletType = "single" | "hd";

export interface KeystoreRecordBase {
  id: string;
  type: WalletType;
  address: string;
  passwordHash: string;
  createdAt: number;
}
export interface SingleRecord extends KeystoreRecordBase {
  type: "single";
  encWif: string;
}
export interface HDRecord extends KeystoreRecordBase {
  type: "hd";
  xpub?: string;
  encMnemonic: string;
}
export type KeystoreRecord = SingleRecord | HDRecord;

// AES-256-GCM helpers (encrypt UTF-8 -> base64, decrypt base64 -> UTF-8)
function aesEncrypt(plaintext: string, password: string): string {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 32);
  const iv = crypto.randomBytes(12); // GCM nonce
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, tag, enc]).toString("base64");
}
function aesDecrypt(blobB64: string, password: string): string {
  const buf = Buffer.from(blobB64, "base64");
  const salt = buf.slice(0, 16);
  const iv = buf.slice(16, 28);
  const tag = buf.slice(28, 44);
  const enc = buf.slice(44);
  const key = crypto.scryptSync(password, salt, 32);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const out = Buffer.concat([decipher.update(enc), decipher.final()]);
  return out.toString("utf8");
}

function list(): KeystoreRecord[] {
  try {
    return JSON.parse(store.getItem("records") || "[]") as KeystoreRecord[];
  } catch {
    return [];
  }
}
function saveAll(arr: KeystoreRecord[]): void {
  store.setItem("records", JSON.stringify(arr));
}

function newId(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : String(Date.now() + Math.random());
}

export function saveSingle(params: {
  address: string;
  wif: string;
  password: string;
}): { id: string; type: "single"; address: string } {
  const rec: SingleRecord = {
    id: newId(),
    type: "single",
    address: params.address,
    encWif: aesEncrypt(params.wif, params.password),
    passwordHash: bcrypt.hashSync(params.password, saltRounds),
    createdAt: Date.now(),
  };
  const arr = list();
  arr.push(rec);
  saveAll(arr);
  return { id: rec.id, type: rec.type, address: rec.address };
}

export function saveHD(params: {
  address: string;
  xpub?: string;
  mnemonic: string;
  password: string;
}): { id: string; type: "hd"; address: string; xpub?: string } {
  const rec: HDRecord = {
    id: newId(),
    type: "hd",
    address: params.address,
    xpub: params.xpub,
    encMnemonic: aesEncrypt(params.mnemonic, params.password),
    passwordHash: bcrypt.hashSync(params.password, saltRounds),
    createdAt: Date.now(),
  };
  const arr = list();
  arr.push(rec);
  saveAll(arr);
  return { id: rec.id, type: rec.type, address: rec.address, xpub: rec.xpub };
}

export function findById(recId: string): KeystoreRecord | null {
  return list().find((r) => r.id === recId) || null;
}

export function findByAddress(address: string): KeystoreRecord | null {
  return list().find((r) => r.address === address) || null;
}

export function verifyPassword(rec: KeystoreRecord, password: string): boolean {
  return bcrypt.compareSync(password, rec.passwordHash);
}

export function getDecryptedSecret(
  rec: KeystoreRecord,
  password: string
): { type: "single"; wif: string } | { type: "hd"; mnemonic: string } {
  if (!verifyPassword(rec, password)) {
    const e = new Error("Invalid password") as any;
    e.code = "BAD_PASSWORD";
    throw e;
  }
  if (rec.type === "single") {
    return { type: "single", wif: aesDecrypt(rec.encWif, password) };
  }
  if (rec.type === "hd") {
    return { type: "hd", mnemonic: aesDecrypt(rec.encMnemonic, password) };
  }
  const e = new Error("Unsupported record type") as any;
  e.code = "BAD_TYPE";
  throw e;
}
