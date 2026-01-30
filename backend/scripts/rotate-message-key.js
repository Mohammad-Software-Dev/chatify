import mongoose from "mongoose";
import Message from "../src/models/Message.js";
import { ENV } from "../src/lib/env.js";
import {
  decryptJson,
  decryptString,
  encryptJson,
  encryptString,
  getCurrentMessageKeyId,
  isMessageEncryptionEnabled,
} from "../src/lib/messageCrypto.js";

const BATCH_SIZE = 200;

const stripKeyId = (payload) => {
  if (!payload) return null;
  const { keyId, ...rest } = payload;
  return rest;
};

const run = async () => {
  if (!ENV.MONGO_URI) {
    console.error("MONGO_URI is required.");
    process.exit(1);
  }
  if (!isMessageEncryptionEnabled()) {
    console.error("Message encryption is not enabled. Set MESSAGE_ENC_KEY(S).");
    process.exit(1);
  }

  const currentKeyId = getCurrentMessageKeyId();
  if (!currentKeyId) {
    console.error("Current key ID is not set.");
    process.exit(1);
  }

  await mongoose.connect(ENV.MONGO_URI);

  const query = {
    $and: [
      {
        $or: [
          { textEnc: { $exists: true, $ne: null } },
          { linkPreviewEnc: { $exists: true, $ne: null } },
        ],
      },
      {
        $or: [
          { encKeyId: { $exists: false } },
          { encKeyId: null },
          { encKeyId: { $ne: currentKeyId } },
        ],
      },
    ],
  };

  const cursor = Message.find(query).cursor();
  let ops = [];
  let processed = 0;
  let failed = 0;

  for await (const message of cursor) {
    const decryptedText = message.textEnc
      ? decryptString(message.textEnc, message.encKeyId)
      : null;
    const decryptedLinkPreview = message.linkPreviewEnc
      ? decryptJson(message.linkPreviewEnc, message.encKeyId)
      : null;

    if (message.textEnc && !decryptedText) {
      failed += 1;
      continue;
    }
    if (message.linkPreviewEnc && !decryptedLinkPreview) {
      failed += 1;
      continue;
    }

    const rawTextEnc = decryptedText ? encryptString(decryptedText) : null;
    const rawLinkPreviewEnc = decryptedLinkPreview
      ? encryptJson(decryptedLinkPreview)
      : null;

    const update = {
      textEnc: rawTextEnc ? stripKeyId(rawTextEnc) : message.textEnc,
      linkPreviewEnc: rawLinkPreviewEnc
        ? stripKeyId(rawLinkPreviewEnc)
        : message.linkPreviewEnc,
      encKeyId: rawTextEnc?.keyId || rawLinkPreviewEnc?.keyId || currentKeyId,
      encVersion: 1,
    };

    ops.push({
      updateOne: {
        filter: { _id: message._id },
        update: { $set: update },
      },
    });
    processed += 1;

    if (ops.length >= BATCH_SIZE) {
      await Message.bulkWrite(ops);
      ops = [];
    }
  }

  if (ops.length > 0) {
    await Message.bulkWrite(ops);
  }

  await mongoose.disconnect();
  console.log(`Re-encrypted ${processed} messages.`);
  if (failed) {
    console.log(`Skipped ${failed} messages due to decrypt failure.`);
  }
};

run().catch((error) => {
  console.error("Rotation failed:", error.message);
  process.exit(1);
});
