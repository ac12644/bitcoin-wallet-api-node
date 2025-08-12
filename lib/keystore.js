const { LocalStorage } = require("node-localstorage");
const crypto = require("crypto");
const bcrypt = require("bcrypt");

const store = new LocalStorage("./keystore");
const saltRounds = 10;

// AES-256-GCM helpers (encrypt UTF-8 -> base64, decrypt base64 -> UTF-8)
function aesEncrypt(plaintext, password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 32); // 32 bytes
  const iv = crypto.randomBytes(12); // GCM nonce
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, tag, enc]).toString("base64");
}
function aesDecrypt(blobB64, password) {
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

function list() {
  try {
    return JSON.parse(store.getItem("records") || "[]");
  } catch {
    return [];
  }
}
function saveAll(arr) {
  store.setItem("records", JSON.stringify(arr));
}

function createId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now() + Math.random());
}

/**
 * Save a password-protected SINGLE wallet (WIF).
 * @returns { id, type, address }
 */
function saveSingle({ address, wif, password }) {
  const id = createId();
  const passwordHash = bcrypt.hashSync(password, saltRounds);
  const encWif = aesEncrypt(wif, password);
  const rec = {
    id,
    type: "single",
    address,
    encWif,
    passwordHash,
    createdAt: Date.now(),
  };
  const arr = list();
  arr.push(rec);
  saveAll(arr);
  return { id, type: "single", address };
}

/**
 * Save a password-protected HD wallet (mnemonic).
 * @returns { id, type, address, xpub }
 */
function saveHD({ address, xpub, mnemonic, password }) {
  const id = createId();
  const passwordHash = bcrypt.hashSync(password, saltRounds);
  const encMnemonic = aesEncrypt(mnemonic, password);
  const rec = {
    id,
    type: "hd",
    address,
    xpub,
    encMnemonic,
    passwordHash,
    createdAt: Date.now(),
  };
  const arr = list();
  arr.push(rec);
  saveAll(arr);
  return { id, type: "hd", address, xpub };
}

function findById(id) {
  return list().find((r) => r.id === id) || null;
}
function findByAddress(address) {
  return list().find((r) => r.address === address) || null;
}

function verifyPassword(rec, password) {
  return bcrypt.compareSync(password, rec.passwordHash);
}

function getDecryptedSecret(rec, password) {
  if (!verifyPassword(rec, password)) {
    const err = new Error("Invalid password");
    err.code = "BAD_PASSWORD";
    throw err;
  }
  if (rec.type === "single")
    return { type: "single", wif: aesDecrypt(rec.encWif, password) };
  if (rec.type === "hd")
    return { type: "hd", mnemonic: aesDecrypt(rec.encMnemonic, password) };
  const err = new Error("Unsupported record type");
  err.code = "BAD_TYPE";
  throw err;
}

module.exports = {
  saveSingle,
  saveHD,
  findById,
  findByAddress,
  getDecryptedSecret,
  verifyPassword,
};
