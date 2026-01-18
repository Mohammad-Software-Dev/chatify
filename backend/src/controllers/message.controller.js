import cloudinary from "../lib/cloudinary.js";
import { getReceiverSocketIds, io } from "../lib/socket.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import Conversation from "../models/Conversation.js";
import mongoose from "mongoose";

const getConversationKey = (userIdA, userIdB) =>
  [userIdA.toString(), userIdB.toString()].sort().join(":");

export const getAllContacts = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;
    const filteredUsers = await User.find({
      _id: { $ne: loggedInUserId },
    }).select("-password");

    res.status(200).json(filteredUsers);
  } catch (error) {
    console.log("Error in getAllContacts:", error);
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
        "senderId receiverId text image createdAt status sentAt deliveredAt readAt updatedAt"
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
        if (senderSocketIds.length > 0) {
          senderSocketIds.forEach((socketId) => {
            io.to(socketId).emit("messageStatusUpdate", {
              messageIds: messageIds.map((id) => id.toString()),
              status: "read",
              readAt: now.toISOString(),
              deliveredAt: now.toISOString(),
            });
          });
        }
      }

      const conversationKey = getConversationKey(myId, userToChatId);
      await Conversation.updateOne(
        { participantsKey: conversationKey },
        { $set: { [`unreadCounts.${myId.toString()}`]: 0 } }
      );
    }

    res.status(200).json(normalizedMessages);
  } catch (error) {
    console.log("Error in getMessages controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { text, image, clientMessageId } = req.body;
    const { id: receiverId } = req.params;
    const senderId = req.user._id;

    if (!text && !image) {
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
    if (image) {
      // upload base64 image to cloudinary
      const uploadResponse = await cloudinary.uploader.upload(image);
      imageUrl = uploadResponse.secure_url;
    }

    const receiverSocketIds = getReceiverSocketIds(receiverId);
    const isDelivered = receiverSocketIds.length > 0;
    const deliveredAt = isDelivered ? new Date() : undefined;

    const newMessage = new Message({
      senderId,
      receiverId,
      text,
      image: imageUrl,
      status: isDelivered ? "delivered" : "sent",
      deliveredAt,
      sentAt: new Date(),
      clientMessageId,
    });

    await newMessage.save();

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
          lastMessageText: newMessage.text || "",
          lastMessageImage: newMessage.image || "",
          lastMessageSenderId: senderId,
          [`unreadCounts.${senderId.toString()}`]: 0,
        },
        $inc: { [`unreadCounts.${receiverId.toString()}`]: 1 },
      },
      { upsert: true }
    );

    if (receiverSocketIds.length > 0) {
      receiverSocketIds.forEach((socketId) => {
        io.to(socketId).emit("newMessage", newMessage);
      });
    }

    if (isDelivered) {
      const senderSocketIds = getReceiverSocketIds(senderId);
      if (senderSocketIds.length > 0) {
        senderSocketIds.forEach((socketId) => {
          io.to(socketId).emit("messageStatusUpdate", {
            messageIds: [newMessage._id.toString()],
            status: "delivered",
            deliveredAt: deliveredAt.toISOString(),
          });
        });
      }
    }

    res.status(201).json(newMessage);
  } catch (error) {
    console.log("Error in sendMessage controller: ", error.message);
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
          lastMessageSenderId:
            conversation.lastMessageSenderId?.toString() || "",
        };
      })
      .filter(Boolean);

    res.status(200).json(response);
  } catch (error) {
    console.error("Error in getChatPartners: ", error.message);
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
    if (senderSocketIds.length > 0) {
      senderSocketIds.forEach((socketId) => {
        io.to(socketId).emit("messageStatusUpdate", {
          messageIds: messageIds.map((id) => id.toString()),
          status: "read",
          readAt: now.toISOString(),
          deliveredAt: now.toISOString(),
        });
      });
    }

    res.status(200).json({ updated: messagesToMark.length });
  } catch (error) {
    console.error("Error in markMessagesAsRead: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
