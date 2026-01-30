import crypto from "crypto";
import { ENV } from "./env.js";

const KEY_HEX_REGEX = /^[0-9a-fA-F]{64}$/;

let cachedKeyRing;
let cachedCurrentKeyId;
let keyChecked = false;
let keyErrorLogged = false;

const parseKeyValue = (raw) => {
  const key = KEY_HEX_REGEX.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("MESSAGE_ENC_KEY must be 32 bytes.");
  }
  return key;
};

const resolveKeyRing = () => {
  if (keyChecked) {
    return { keyRing: cachedKeyRing, currentKeyId: cachedCurrentKeyId };
  }
  keyChecked = true;

  const keyRing = new Map();
  let currentKeyId = null;

  if (ENV.MESSAGE_ENC_KEYS) {
    const entries = ENV.MESSAGE_ENC_KEYS.split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    for (const entry of entries) {
      const [id, value] = entry.split(":");
      if (!id || !value) continue;
      try {
        keyRing.set(id, parseKeyValue(value));
      } catch (error) {
        if (!keyErrorLogged) {
          console.error("Invalid MESSAGE_ENC_KEYS entry:", error.message);
          keyErrorLogged = true;
        }
      }
    }
    currentKeyId = ENV.MESSAGE_ENC_KEY_ID || entries[0]?.split(":")[0];
  } else if (ENV.MESSAGE_ENC_KEY) {
    try {
      keyRing.set("default", parseKeyValue(ENV.MESSAGE_ENC_KEY));
      currentKeyId = "default";
    } catch (error) {
      if (!keyErrorLogged) {
        console.error("Invalid MESSAGE_ENC_KEY:", error.message);
        keyErrorLogged = true;
      }
    }
  }

  cachedKeyRing = keyRing.size ? keyRing : null;
  cachedCurrentKeyId = keyRing.size ? currentKeyId : null;
  return { keyRing: cachedKeyRing, currentKeyId: cachedCurrentKeyId };
};

const getKeyById = (keyId) => {
  const { keyRing } = resolveKeyRing();
  if (!keyRing) return null;
  return keyRing.get(keyId) || null;
};

const getCurrentKey = () => {
  const { keyRing, currentKeyId } = resolveKeyRing();
  if (!keyRing || !currentKeyId) return null;
  return { keyId: currentKeyId, key: keyRing.get(currentKeyId) };
};

const getAllKeys = () => {
  const { keyRing } = resolveKeyRing();
  if (!keyRing) return [];
  return Array.from(keyRing.entries());
};

export const getCurrentMessageKeyId = () => getCurrentKey()?.keyId || null;

export const getMessageKeyIds = () => getAllKeys().map(([id]) => id);

export const isMessageEncryptionEnabled = () => Boolean(getCurrentKey());

export const shouldStoreMessagePlaintext = () =>
  String(ENV.MESSAGE_ENC_STORE_PLAINTEXT || "").toLowerCase() !== "false";

export const encryptString = (plaintext) => {
  if (!plaintext) return null;
  const current = getCurrentKey();
  if (!current) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", current.key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64"),
    keyId: current.keyId,
  };
};

export const decryptString = (payload, keyId) => {
  if (!payload) return null;
  try {
    const iv = Buffer.from(payload.iv, "base64");
    const tag = Buffer.from(payload.tag, "base64");
    const data = Buffer.from(payload.data, "base64");

    const attempt = (key) => {
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([
        decipher.update(data),
        decipher.final(),
      ]);
      return decrypted.toString("utf8");
    };

    if (keyId || payload.keyId) {
      const preferredKey = getKeyById(keyId || payload.keyId);
      if (preferredKey) return attempt(preferredKey);
    }

    const keys = getAllKeys();
    for (const [, key] of keys) {
      try {
        return attempt(key);
      } catch {
        continue;
      }
    }
    return null;
  } catch (error) {
    if (!keyErrorLogged) {
      console.error("Failed to decrypt message payload:", error.message);
      keyErrorLogged = true;
    }
    return null;
  }
};

export const encryptJson = (value) => {
  if (!value) return null;
  return encryptString(JSON.stringify(value));
};

export const decryptJson = (payload, keyId) => {
  const decrypted = decryptString(payload, keyId);
  if (!decrypted) return null;
  try {
    return JSON.parse(decrypted);
  } catch (error) {
    if (!keyErrorLogged) {
      console.error("Failed to parse decrypted JSON:", error.message);
      keyErrorLogged = true;
    }
    return null;
  }
};
