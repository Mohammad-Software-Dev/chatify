import mongoose from "mongoose";
import Message from "../src/models/Message.js";
import { ENV } from "../src/lib/env.js";
import {
  encryptJson,
  encryptString,
  isMessageEncryptionEnabled,
  shouldStoreMessagePlaintext,
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

  await mongoose.connect(ENV.MONGO_URI);
  const storePlaintext = shouldStoreMessagePlaintext();

  const query = {
    $and: [
      {
        $or: [
          { text: { $exists: true, $ne: "" } },
          { linkPreview: { $ne: null } },
        ],
      },
      {
        $or: [
          { textEnc: { $exists: false } },
          { textEnc: null },
          { linkPreviewEnc: { $exists: false } },
          { linkPreviewEnc: null },
        ],
      },
    ],
  };

  const cursor = Message.find(query).cursor();
  let ops = [];
  let processed = 0;
  for await (const message of cursor) {
    const rawTextEnc = message.text ? encryptString(message.text) : null;
    const rawLinkPreviewEnc = message.linkPreview
      ? encryptJson(message.linkPreview)
      : null;

    if (!rawTextEnc && !rawLinkPreviewEnc) continue;

    const update = {
      textEnc: rawTextEnc ? stripKeyId(rawTextEnc) : message.textEnc,
      linkPreviewEnc: rawLinkPreviewEnc
        ? stripKeyId(rawLinkPreviewEnc)
        : message.linkPreviewEnc,
      encKeyId: rawTextEnc?.keyId || rawLinkPreviewEnc?.keyId || message.encKeyId,
      encVersion: 1,
    };

    if (!storePlaintext) {
      if (message.text) update.text = "";
      if (message.linkPreview) update.linkPreview = null;
    }

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
  console.log(`Encrypted ${processed} messages.`);
};

run().catch((error) => {
  console.error("Migration failed:", error.message);
  process.exit(1);
});
