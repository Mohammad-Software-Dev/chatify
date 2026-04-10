import cloudinary from "../lib/cloudinary.js";
import { getReceiverSocketIds, emitEnvelopeToSocketIds } from "../lib/socket.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import Conversation from "../models/Conversation.js";
import mongoose from "mongoose";
import { fetchLinkPreview } from "../lib/linkPreview.js";
import { ENV } from "../lib/env.js";
import logger from "../lib/logger.js";
import {
  decryptJson,
  decryptString,
  encryptJson,
  encryptString,
  isMessageEncryptionEnabled,
  shouldStoreMessagePlaintext,
} from "../lib/messageCrypto.js";

const getConversationKey = (userIdA, userIdB) =>
  [userIdA.toString(), userIdB.toString()].sort().join(":");

const stripKeyId = (payload) => {
  if (!payload) return null;
  const { keyId, ...rest } = payload;
  return rest;
};

const applyDecryptedFields = (message) => {
  if (!message) return message;
  if (!message.text && message.textEnc) {
    const decrypted = decryptString(message.textEnc, message.encKeyId);
    if (decrypted) {
      message.text = decrypted;
    }
  }
  if (!message.linkPreview && message.linkPreviewEnc) {
    const decrypted = decryptJson(message.linkPreviewEnc, message.encKeyId);
    if (decrypted) {
      message.linkPreview = decrypted;
    }
  }
  delete message.textEnc;
  delete message.linkPreviewEnc;
  delete message.encKeyId;
  delete message.encVersion;
  return message;
};

const applyDecryptedFieldsArray = (messages) =>
  messages.map((message) => applyDecryptedFields(message));

const extractFirstUrl = (text) => {
  if (!text) return null;
  const match = text.match(/https?:\/\/\S+/i);
  return match ? match[0] : null;
};

const isParticipant = (message, userId) => {
  if (!message) return false;
  const id = userId.toString();
  return (
    message.senderId.toString() === id || message.receiverId.toString() === id
  );
};

const escapeRegex = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeUsername = (username) => username?.trim().toLowerCase();

export const getAdminContact = async (req, res) => {
  try {
    const adminUsername = normalizeUsername(ENV.ADMIN_USERNAME);
    if (!adminUsername) return res.status(200).json(null);

    const admin = await User.findOne({ username: adminUsername })
      .select("-password")
      .lean();
    if (!admin) return res.status(200).json(null);
    if (admin._id.toString() === req.user._id.toString()) {
      return res.status(200).json(null);
    }

    return res.status(200).json(admin);
  } catch (error) {
    logger.warn("Admin contact lookup failed:", error.message);
    return res.status(200).json(null);
  }
};

export const getAllContacts = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;
    const query = req.query.username?.trim().toLowerCase();
    if (!query || query.length < 3) {
      return res.status(200).json([]);
    }

    const exactMatch = await User.findOne({
      _id: { $ne: loggedInUserId },
      username: query,
    })
      .select("-password")
      .lean();

    const remainingLimit = exactMatch ? 19 : 20;
    const excludedIds = [loggedInUserId];
    if (exactMatch?._id) excludedIds.push(exactMatch._id);

    const partialUsers = await User.find({
      _id: { $nin: excludedIds },
      username: { $regex: new RegExp(escapeRegex(query), "i") },
    })
      .select("-password")
      .limit(remainingLimit)
      .lean();

    const filteredUsers = exactMatch
      ? [exactMatch, ...partialUsers]
      : partialUsers;

    res.status(200).json(filteredUsers);
  } catch (error) {
    logger.error("Contact search failed:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

export const getMessagesByUserId = async (req, res) => {
  try {
    const myId = req.user._id;
    const { id: userToChatId } = req.params;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const before = req.query.before ? new Date(req.query.before) : null;
    const markRead = req.query.markRead !== "false";

    const query = {
      $or: [
        { senderId: myId, receiverId: userToChatId },
        { senderId: userToChatId, receiverId: myId },
      ],
    };
    if (before && !Number.isNaN(before.valueOf())) {
      const beforeObjectId = mongoose.Types.ObjectId.createFromTime(
        Math.floor(before.getTime() / 1000)
      );
      query.$or = [
        {
          $and: [
            { senderId: myId, receiverId: userToChatId },
            { createdAt: { $lt: before } },
          ],
        },
        {
          $and: [
            { senderId: userToChatId, receiverId: myId },
            { createdAt: { $lt: before } },
          ],
        },
        {
          $and: [
            { senderId: myId, receiverId: userToChatId },
            { createdAt: { $exists: false } },
            { _id: { $lt: beforeObjectId } },
          ],
        },
        {
          $and: [
            { senderId: userToChatId, receiverId: myId },
            { createdAt: { $exists: false } },
            { _id: { $lt: beforeObjectId } },
          ],
        },
      ];
    }

    const messages = await Message.find(query)
      .select(
        "senderId receiverId text textEnc linkPreview linkPreviewEnc encKeyId encVersion image images replyToMessageId reactions pinnedBy starredBy editedAt deletedAt deletedBy createdAt status sentAt deliveredAt readAt updatedAt"
      )
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .lean();

    const normalizedMessages = messages.map((msg) => {
      const fallbackCreatedAt =
        msg.createdAt ||
        msg.sentAt ||
        msg.updatedAt ||
        msg.deliveredAt ||
        msg.readAt ||
        (msg._id?.getTimestamp ? msg._id.getTimestamp() : new Date());

      return {
        ...msg,
        createdAt: msg.createdAt || fallbackCreatedAt,
        status: msg.status || "sent",
      };
    });

    const replyIds = normalizedMessages
      .map((msg) => msg.replyToMessageId)
      .filter(Boolean);
    if (replyIds.length > 0) {
      const replyMessages = await Message.find({ _id: { $in: replyIds } })
        .select("senderId text textEnc encKeyId image images deletedAt")
        .lean();
      const replyMap = new Map(
        replyMessages.map((msg) => [msg._id.toString(), msg])
      );
      normalizedMessages.forEach((msg) => {
        if (!msg.replyToMessageId) return;
        const reply = replyMap.get(msg.replyToMessageId.toString());
        if (!reply) return;
        applyDecryptedFields(reply);
        msg.replyPreview = {
          _id: reply._id,
          senderId: reply.senderId,
          text: reply.deletedAt ? "Message deleted" : reply.text,
          image: reply.image,
          images: reply.images,
          deletedAt: reply.deletedAt,
        };
      });
    }

    normalizedMessages.reverse();

    if (markRead) {
      const now = new Date();
      const messagesToMark = await Message.find({
        senderId: userToChatId,
        receiverId: myId,
        status: { $ne: "read" },
      }).select("_id");

      if (messagesToMark.length > 0) {
        const messageIds = messagesToMark.map((msg) => msg._id);

        await Message.updateMany(
          { _id: { $in: messageIds }, status: { $ne: "read" } },
          { $set: { status: "read", readAt: now } }
        );
        await Message.updateMany(
          {
            _id: { $in: messageIds },
            $or: [{ deliveredAt: { $exists: false } }, { deliveredAt: null }],
          },
          { $set: { deliveredAt: now } }
        );

        const senderSocketIds = getReceiverSocketIds(userToChatId);
        emitEnvelopeToSocketIds(senderSocketIds, "message:status", {
          messageIds: messageIds.map((id) => id.toString()),
          status: "read",
          readAt: now.toISOString(),
          deliveredAt: now.toISOString(),
        });
      }

      const conversationKey = getConversationKey(myId, userToChatId);
      await Conversation.updateOne(
        { participantsKey: conversationKey },
        { $set: { [`unreadCounts.${myId.toString()}`]: 0 } }
      );
    }

    res.status(200).json(applyDecryptedFieldsArray(normalizedMessages));
  } catch (error) {
    logger.error("Get messages failed:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getMessageById = async (req, res) => {
  try {
    const { id: messageId } = req.params;
    const myId = req.user._id;

    const message = await Message.findById(messageId)
      .select(
        "senderId receiverId text textEnc linkPreview linkPreviewEnc encKeyId encVersion image images replyToMessageId reactions pinnedBy starredBy editedAt deletedAt deletedBy createdAt status sentAt deliveredAt readAt updatedAt"
      )
      .lean();
    if (!message) return res.status(404).json({ message: "Message not found" });
    if (
      message.senderId.toString() !== myId.toString() &&
      message.receiverId.toString() !== myId.toString()
    ) {
      return res.status(403).json({ message: "Not allowed" });
    }

    res.status(200).json(applyDecryptedFields(message));
  } catch (error) {
    logger.error("Get message by id failed:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { text, image, images, clientMessageId, replyToMessageId } = req.body;
    const { id: receiverId } = req.params;
    const senderId = req.user._id;

    const imagesArray = Array.isArray(images)
      ? images.filter(Boolean)
      : image
      ? [image]
      : [];

    if (!text && imagesArray.length === 0) {
      return res.status(400).json({ message: "Text or image is required." });
    }
    if (senderId.equals(receiverId)) {
      return res
        .status(400)
        .json({ message: "Cannot send messages to yourself." });
    }
    const receiverExists = await User.exists({ _id: receiverId });
    if (!receiverExists) {
      return res.status(404).json({ message: "Receiver not found." });
    }

    let imageUrl;
    let imageUrls = [];
    if (imagesArray.length > 0) {
      const existingUrls = imagesArray.filter(
        (img) => typeof img === "string" && /^https?:\/\//i.test(img)
      );
      const uploadCandidates = imagesArray.filter(
        (img) => typeof img === "string" && !/^https?:\/\//i.test(img)
      );

      if (uploadCandidates.length > 0) {
        // upload base64 images to cloudinary
        const uploads = await Promise.all(
          uploadCandidates.map((img) => cloudinary.uploader.upload(img))
        );
        imageUrls = uploads.map((upload) => upload.secure_url);
      }

      imageUrls = [...existingUrls, ...imageUrls];
      imageUrl = imageUrls[0];
    }

    const receiverSocketIds = getReceiverSocketIds(receiverId);
    const isDelivered = receiverSocketIds.length > 0;
    const deliveredAt = isDelivered ? new Date() : undefined;

    let replyTo;
    if (replyToMessageId) {
      replyTo = await Message.findById(replyToMessageId).select("_id");
      if (!replyTo) {
        return res.status(404).json({ message: "Reply target not found." });
      }
    }

    let linkPreview = null;
    const url = extractFirstUrl(text);
    if (url) {
      linkPreview = await fetchLinkPreview(url);
    }

    const encryptionEnabled = isMessageEncryptionEnabled();
    const storePlaintext = shouldStoreMessagePlaintext();
    const rawTextEnc = encryptionEnabled ? encryptString(text) : null;
    const rawLinkPreviewEnc = encryptionEnabled
      ? encryptJson(linkPreview)
      : null;
    const encKeyId = rawTextEnc?.keyId || rawLinkPreviewEnc?.keyId || null;
    const textEnc = stripKeyId(rawTextEnc);
    const linkPreviewEnc = stripKeyId(rawLinkPreviewEnc);

    const newMessage = new Message({
      senderId,
      receiverId,
      text: storePlaintext ? text : "",
      textEnc,
      image: imageUrl,
      images: imageUrls,
      replyToMessageId: replyTo?._id,
      linkPreview: storePlaintext ? linkPreview : null,
      linkPreviewEnc,
      encKeyId,
      encVersion: textEnc || linkPreviewEnc ? 1 : undefined,
      status: isDelivered ? "delivered" : "sent",
      deliveredAt,
      sentAt: new Date(),
      clientMessageId,
    });

    await newMessage.save();

    let messagePayload = applyDecryptedFields(newMessage.toObject());
    if (replyTo) {
      const replyMessage = await Message.findById(replyTo._id)
        .select("senderId text textEnc encKeyId image images deletedAt")
        .lean();
      if (replyMessage) {
        applyDecryptedFields(replyMessage);
        messagePayload.replyPreview = {
          _id: replyMessage._id,
          senderId: replyMessage.senderId,
          text: replyMessage.deletedAt ? "Message deleted" : replyMessage.text,
          image: replyMessage.image,
          images: replyMessage.images,
          deletedAt: replyMessage.deletedAt,
        };
      }
    }

    const conversationKey = getConversationKey(senderId, receiverId);
    await Conversation.findOneAndUpdate(
      { participantsKey: conversationKey },
      {
        $setOnInsert: {
          participantIds: [senderId, receiverId],
          participantsKey: conversationKey,
        },
        $set: {
          lastMessageAt: newMessage.createdAt,
          lastMessageText: storePlaintext
            ? newMessage.text || ""
            : text
            ? "Encrypted message"
            : "",
          lastMessageImage: newMessage.image || "",
          lastMessageImages: newMessage.images || [],
          lastMessageSenderId: senderId,
          [`unreadCounts.${senderId.toString()}`]: 0,
        },
        $inc: { [`unreadCounts.${receiverId.toString()}`]: 1 },
      },
      { upsert: true }
    );

    const senderSocketIds = getReceiverSocketIds(senderId);
    const allSocketIds = Array.from(
      new Set([...receiverSocketIds, ...senderSocketIds])
    );
    emitEnvelopeToSocketIds(allSocketIds, "message:new", messagePayload, {
      requestId: clientMessageId || undefined,
    });

    if (isDelivered) {
      emitEnvelopeToSocketIds(senderSocketIds, "message:status", {
        messageIds: [messagePayload._id.toString()],
        status: "delivered",
        deliveredAt: deliveredAt.toISOString(),
      });
    }

    res.status(201).json(messagePayload);
  } catch (error) {
    logger.error("Send message failed:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const addReaction = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id: messageId } = req.params;
    const { emoji } = req.body;
    if (!emoji) return res.status(400).json({ message: "Emoji required." });

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ message: "Message not found" });
    const isParticipant =
      message.senderId.toString() === userId.toString() ||
      message.receiverId.toString() === userId.toString();
    if (!isParticipant) {
      return res.status(403).json({ message: "Not allowed" });
    }

    const existing = message.reactions.find(
      (reaction) =>
        reaction.userId.toString() === userId.toString() &&
        reaction.emoji === emoji
    );

    if (existing) {
      message.reactions = message.reactions.filter(
        (reaction) =>
          !(
            reaction.userId.toString() === userId.toString() &&
            reaction.emoji === emoji
          )
      );
    } else {
      message.reactions.push({ userId, emoji });
    }

    await message.save();

    const receiverSocketIds = getReceiverSocketIds(
      message.receiverId.toString()
    );
    const senderSocketIds = getReceiverSocketIds(message.senderId.toString());
    const reactions = message.reactions.map((reaction) => ({
      userId: reaction.userId.toString(),
      emoji: reaction.emoji,
      createdAt: reaction.createdAt,
    }));
    emitEnvelopeToSocketIds(
      [...receiverSocketIds, ...senderSocketIds],
      "message:reaction",
      {
        messageId: message._id.toString(),
        reactions,
      }
    );

    res.status(200).json({ reactions });
  } catch (error) {
    logger.error("Add reaction failed:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const searchMessages = async (req, res) => {
  try {
    if (!shouldStoreMessagePlaintext()) {
      return res.status(400).json({
        message: "Message search is disabled when plaintext storage is off.",
        code: "SEARCH_DISABLED",
      });
    }
    const myId = req.user._id;
    const { id: userToChatId } = req.params;
    const queryText = req.query.q?.trim();
    if (!queryText) return res.status(200).json([]);

    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const regex = new RegExp(escapeRegex(queryText), "i");

    const query = {
      $and: [
        {
          $or: [
            { senderId: myId, receiverId: userToChatId },
            { senderId: userToChatId, receiverId: myId },
          ],
        },
        { text: { $regex: regex } },
        { $or: [{ deletedAt: { $exists: false } }, { deletedAt: null }] },
      ],
    };

    const results = await Message.find(query)
      .select(
        "senderId receiverId text textEnc linkPreview linkPreviewEnc encKeyId encVersion image images pinnedBy starredBy createdAt sentAt updatedAt"
      )
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .lean();

    res.status(200).json(applyDecryptedFieldsArray(results));
  } catch (error) {
    logger.error("Search messages failed:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getPinnedMessages = async (req, res) => {
  try {
    const myId = req.user._id;
    const { id: userToChatId } = req.params;

    const results = await Message.find({
      $and: [
        {
          $or: [
            { senderId: myId, receiverId: userToChatId },
            { senderId: userToChatId, receiverId: myId },
          ],
        },
        { pinnedBy: myId },
        { $or: [{ deletedAt: { $exists: false } }, { deletedAt: null }] },
      ],
    })
      .select(
        "senderId receiverId text textEnc linkPreview linkPreviewEnc encKeyId encVersion image images pinnedBy starredBy createdAt sentAt updatedAt"
      )
      .sort({ createdAt: -1, _id: -1 })
      .lean();

    res.status(200).json(applyDecryptedFieldsArray(results));
  } catch (error) {
    logger.error("Get pinned messages failed:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getStarredMessages = async (req, res) => {
  try {
    const myId = req.user._id;
    const { id: userToChatId } = req.params;

    const results = await Message.find({
      $and: [
        {
          $or: [
            { senderId: myId, receiverId: userToChatId },
            { senderId: userToChatId, receiverId: myId },
          ],
        },
        { starredBy: myId },
        { $or: [{ deletedAt: { $exists: false } }, { deletedAt: null }] },
      ],
    })
      .select(
        "senderId receiverId text textEnc linkPreview linkPreviewEnc encKeyId encVersion image images pinnedBy starredBy createdAt sentAt updatedAt"
      )
      .sort({ createdAt: -1, _id: -1 })
      .lean();

    res.status(200).json(applyDecryptedFieldsArray(results));
  } catch (error) {
    logger.error("Get starred messages failed:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const togglePin = async (req, res) => {
  try {
    const { id: messageId } = req.params;
    const { pin } = req.body || {};
    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ message: "Message not found" });
    if (!isParticipant(message, req.user._id)) {
      return res.status(403).json({ message: "Not allowed" });
    }
    if (message.deletedAt) {
      return res.status(400).json({ message: "Message deleted" });
    }

    const shouldPin =
      typeof pin === "boolean"
        ? pin
        : !message.pinnedBy.some(
            (id) => id.toString() === req.user._id.toString()
          );

    const update = shouldPin
      ? { $addToSet: { pinnedBy: req.user._id } }
      : { $pull: { pinnedBy: req.user._id } };

    const updated = await Message.findByIdAndUpdate(messageId, update, {
      new: true,
    }).lean();
    const payload = applyDecryptedFields(updated);

    const receiverSocketIds = getReceiverSocketIds(
      message.receiverId.toString()
    );
    const senderSocketIds = getReceiverSocketIds(message.senderId.toString());
    emitEnvelopeToSocketIds(
      [...receiverSocketIds, ...senderSocketIds],
      "message:pinned",
      payload
    );

    res.status(200).json(payload);
  } catch (error) {
    logger.error("Toggle pin failed:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const toggleStar = async (req, res) => {
  try {
    const { id: messageId } = req.params;
    const { star } = req.body || {};
    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ message: "Message not found" });
    if (!isParticipant(message, req.user._id)) {
      return res.status(403).json({ message: "Not allowed" });
    }
    if (message.deletedAt) {
      return res.status(400).json({ message: "Message deleted" });
    }

    const shouldStar =
      typeof star === "boolean"
        ? star
        : !message.starredBy.some(
            (id) => id.toString() === req.user._id.toString()
          );

    const update = shouldStar
      ? { $addToSet: { starredBy: req.user._id } }
      : { $pull: { starredBy: req.user._id } };

    const updated = await Message.findByIdAndUpdate(messageId, update, {
      new: true,
    }).lean();
    const payload = applyDecryptedFields(updated);

    const receiverSocketIds = getReceiverSocketIds(
      message.receiverId.toString()
    );
    const senderSocketIds = getReceiverSocketIds(message.senderId.toString());
    emitEnvelopeToSocketIds(
      [...receiverSocketIds, ...senderSocketIds],
      "message:starred",
      payload
    );

    res.status(200).json(payload);
  } catch (error) {
    logger.error("Toggle star failed:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

const updateConversationIfLatest = async (message, updates) => {
  const conversationKey = getConversationKey(
    message.senderId,
    message.receiverId
  );
  const latest = await Message.findOne({
    $or: [
      { senderId: message.senderId, receiverId: message.receiverId },
      { senderId: message.receiverId, receiverId: message.senderId },
    ],
  })
    .sort({ createdAt: -1, _id: -1 })
    .select("_id")
    .lean();

  if (!latest || latest._id.toString() !== message._id.toString()) return;

  await Conversation.updateOne(
    { participantsKey: conversationKey },
    { $set: updates }
  );
};

export const editMessage = async (req, res) => {
  try {
    const { id: messageId } = req.params;
    const { text } = req.body;
    const trimmed = text?.trim();
    if (!trimmed) {
      return res.status(400).json({ message: "Text is required." });
    }

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ message: "Message not found" });
    if (message.senderId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not allowed" });
    }
    if (message.deletedAt) {
      return res.status(400).json({ message: "Message already deleted" });
    }

    const currentText =
      message.text || decryptString(message.textEnc, message.encKeyId);
    if (currentText === trimmed) {
      return res.status(200).json(applyDecryptedFields(message.toObject()));
    }

    const encryptionEnabled = isMessageEncryptionEnabled();
    const storePlaintext = shouldStoreMessagePlaintext();
    const rawTextEnc = encryptionEnabled ? encryptString(trimmed) : null;
    message.text = storePlaintext ? trimmed : "";
    message.textEnc = stripKeyId(rawTextEnc);
    message.encKeyId = rawTextEnc?.keyId || null;
    message.encVersion = message.textEnc ? 1 : undefined;
    message.editedAt = new Date();
    await message.save();

    await updateConversationIfLatest(message, {
      lastMessageText: storePlaintext ? trimmed : "Encrypted message",
    });

    const receiverSocketIds = getReceiverSocketIds(
      message.receiverId.toString()
    );
    const senderSocketIds = getReceiverSocketIds(message.senderId.toString());
    const payload = applyDecryptedFields(message.toObject());
    emitEnvelopeToSocketIds(
      [...receiverSocketIds, ...senderSocketIds],
      "message:updated",
      payload
    );

    res.status(200).json(payload);
  } catch (error) {
    logger.error("Edit message failed:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const deleteMessage = async (req, res) => {
  try {
    const { id: messageId } = req.params;
    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ message: "Message not found" });
    if (message.senderId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not allowed" });
    }
    if (message.deletedAt) {
      return res.status(200).json(message);
    }

    message.deletedAt = new Date();
    message.deletedBy = req.user._id;
    message.text = "";
    message.textEnc = null;
    message.image = "";
    message.images = [];
    message.linkPreview = null;
    message.linkPreviewEnc = null;
    message.encKeyId = null;
    message.encVersion = undefined;
    await message.save();

    await updateConversationIfLatest(message, {
      lastMessageText: "Message deleted",
      lastMessageImage: "",
      lastMessageImages: [],
    });

    const receiverSocketIds = getReceiverSocketIds(
      message.receiverId.toString()
    );
    const senderSocketIds = getReceiverSocketIds(message.senderId.toString());
    const payload = applyDecryptedFields(message.toObject());
    emitEnvelopeToSocketIds(
      [...receiverSocketIds, ...senderSocketIds],
      "message:deleted",
      payload
    );

    res.status(200).json(payload);
  } catch (error) {
    logger.error("Delete message failed:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const uploadAttachment = async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ message: "Image is required." });
    }

    const upload = await cloudinary.uploader.upload(image);
    return res.status(201).json({
      url: upload.secure_url,
      publicId: upload.public_id,
    });
  } catch (error) {
    logger.error("Upload attachment failed:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const deleteAttachment = async (req, res) => {
  try {
    const { publicId } = req.body;
    if (!publicId) {
      return res.status(400).json({ message: "publicId is required." });
    }

    const result = await cloudinary.uploader.destroy(publicId);
    res.status(200).json({ result: result?.result || "unknown" });
  } catch (error) {
    logger.error("Delete attachment failed:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};


export const getChatPartners = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;

    let conversations = await Conversation.find({
      participantIds: loggedInUserId,
    })
      .sort({ lastMessageAt: -1 })
      .lean();

    if (conversations.length === 0) {
      const partners = await Message.aggregate([
        {
          $match: {
            $or: [
              { senderId: loggedInUserId },
              { receiverId: loggedInUserId },
            ],
          },
        },
        {
          $addFields: {
            messageAt: {
              $ifNull: [
                "$createdAt",
                {
                  $ifNull: [
                    "$sentAt",
                    { $ifNull: ["$updatedAt", "$deliveredAt"] },
                  ],
                },
              ],
            },
            status: { $ifNull: ["$status", "sent"] },
          },
        },
        { $sort: { messageAt: -1, _id: -1 } },
        {
          $project: {
            partnerId: {
              $cond: [
                { $eq: ["$senderId", loggedInUserId] },
                "$receiverId",
                "$senderId",
              ],
            },
            createdAt: "$messageAt",
            receiverId: 1,
            status: 1,
            text: 1,
            image: 1,
            senderId: 1,
          },
        },
        {
          $group: {
            _id: "$partnerId",
            lastMessageAt: { $first: "$createdAt" },
            lastMessageText: { $first: "$text" },
            lastMessageImage: { $first: "$image" },
            lastMessageSenderId: { $first: "$senderId" },
            unreadCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$receiverId", loggedInUserId] },
                      { $ne: ["$status", "read"] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
        { $sort: { lastMessageAt: -1 } },
      ]);

      if (partners.length > 0) {
        const ops = partners.map((partner) => {
          const conversationKey = getConversationKey(
            loggedInUserId,
            partner._id
          );
          return {
            updateOne: {
              filter: { participantsKey: conversationKey },
              update: {
                $setOnInsert: {
                  participantIds: [loggedInUserId, partner._id],
                  participantsKey: conversationKey,
                },
                $set: {
                  lastMessageAt: partner.lastMessageAt,
                  lastMessageText: partner.lastMessageText || "",
                  lastMessageImage: partner.lastMessageImage || "",
                  lastMessageImages: partner.lastMessageImage
                    ? [partner.lastMessageImage]
                    : [],
                  lastMessageSenderId: partner.lastMessageSenderId,
                  [`unreadCounts.${loggedInUserId.toString()}`]:
                    partner.unreadCount || 0,
                },
              },
              upsert: true,
            },
          };
        });

        await Conversation.bulkWrite(ops);
        conversations = await Conversation.find({
          participantIds: loggedInUserId,
        })
          .sort({ lastMessageAt: -1 })
          .lean();
      }
    }

    const partnerIds = conversations
      .map((conversation) =>
        conversation.participantIds.find(
          (id) => id.toString() !== loggedInUserId.toString()
        )
      )
      .filter(Boolean);
    const chatPartners = await User.find({
      _id: { $in: partnerIds },
    })
      .select("-password")
      .lean();

    const chatPartnerMap = new Map(
      chatPartners.map((user) => [user._id.toString(), user])
    );

    const response = conversations
      .map((conversation) => {
        const partnerId = conversation.participantIds.find(
          (id) => id.toString() !== loggedInUserId.toString()
        );
        if (!partnerId) return null;

        const user = chatPartnerMap.get(partnerId.toString());
        if (!user) return null;

        const unreadCount =
          conversation.unreadCounts?.[loggedInUserId.toString()] || 0;

        return {
          ...user,
          lastMessageAt: conversation.lastMessageAt,
          unreadCount,
          lastMessageText: conversation.lastMessageText || "",
          lastMessageImage: conversation.lastMessageImage || "",
          lastMessageImages: conversation.lastMessageImages || [],
          lastMessageSenderId:
            conversation.lastMessageSenderId?.toString() || "",
        };
      })
      .filter(Boolean);

    res.status(200).json(response);
  } catch (error) {
    logger.error("Get chat partners failed:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const markMessagesAsRead = async (req, res) => {
  try {
    const myId = req.user._id;
    const { id: senderId } = req.params;
    const now = new Date();
    const conversationKey = getConversationKey(myId, senderId);

    const messagesToMark = await Message.find({
      senderId,
      receiverId: myId,
      status: { $ne: "read" },
    }).select("_id");

    if (messagesToMark.length === 0) {
      return res.status(200).json({ updated: 0 });
    }

    const messageIds = messagesToMark.map((msg) => msg._id);
    await Message.updateMany(
      { _id: { $in: messageIds }, status: { $ne: "read" } },
      { $set: { status: "read", readAt: now } }
    );
    await Message.updateMany(
      {
        _id: { $in: messageIds },
        $or: [{ deliveredAt: { $exists: false } }, { deliveredAt: null }],
      },
      { $set: { deliveredAt: now } }
    );

    await Conversation.updateOne(
      { participantsKey: conversationKey },
      { $set: { [`unreadCounts.${myId.toString()}`]: 0 } }
    );

    const senderSocketIds = getReceiverSocketIds(senderId);
    emitEnvelopeToSocketIds(senderSocketIds, "message:status", {
      messageIds: messageIds.map((id) => id.toString()),
      status: "read",
      readAt: now.toISOString(),
      deliveredAt: now.toISOString(),
    });

    res.status(200).json({ updated: messagesToMark.length });
  } catch (error) {
    logger.error("Mark messages as read failed:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
