import cloudinary from "../lib/cloudinary.js";
import { getReceiverSocketIds, io } from "../lib/socket.js";
import Message from "../models/Message.js";
import User from "../models/User.js";

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
      query.createdAt = { $lt: before };
    }

    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    messages.reverse();

    if (markRead) {
      const now = new Date();
      const messagesToMark = await Message.find({
        senderId: userToChatId,
        receiverId: myId,
        status: { $ne: "read" },
      }).select("_id");

      if (messagesToMark.length > 0) {
        await Message.updateMany(
          { _id: { $in: messagesToMark.map((msg) => msg._id) } },
          [
            {
              $set: {
                status: "read",
                readAt: now,
                deliveredAt: { $ifNull: ["$deliveredAt", now] },
              },
            },
          ]
        );

        const senderSocketIds = getReceiverSocketIds(userToChatId);
        if (senderSocketIds.length > 0) {
          senderSocketIds.forEach((socketId) => {
            io.to(socketId).emit("messageStatusUpdate", {
              messageIds: messagesToMark.map((msg) => msg._id.toString()),
              status: "read",
              readAt: now.toISOString(),
              deliveredAt: now.toISOString(),
            });
          });
        }
      }
    }

    res.status(200).json(messages);
  } catch (error) {
    console.log("Error in getMessages controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { text, image } = req.body;
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
    });

    await newMessage.save();

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

    const partners = await Message.aggregate([
      {
        $match: {
          $or: [
            { senderId: loggedInUserId },
            { receiverId: loggedInUserId },
          ],
        },
      },
      { $sort: { createdAt: -1 } },
      {
        $project: {
          partnerId: {
            $cond: [
              { $eq: ["$senderId", loggedInUserId] },
              "$receiverId",
              "$senderId",
            ],
          },
          createdAt: 1,
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

    const partnerIds = partners.map((partner) => partner._id);
    const chatPartners = await User.find({
      _id: { $in: partnerIds },
    })
      .select("-password")
      .lean();

    const chatPartnerMap = new Map(
      chatPartners.map((user) => [user._id.toString(), user])
    );

    const response = partners
      .map((partner) => {
        const user = chatPartnerMap.get(partner._id.toString());
        if (!user) return null;
        return {
          ...user,
          lastMessageAt: partner.lastMessageAt,
          unreadCount: partner.unreadCount || 0,
          lastMessageText: partner.lastMessageText || "",
          lastMessageImage: partner.lastMessageImage || "",
          lastMessageSenderId: partner.lastMessageSenderId?.toString() || "",
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

    const messagesToMark = await Message.find({
      senderId,
      receiverId: myId,
      status: { $ne: "read" },
    }).select("_id");

    if (messagesToMark.length === 0) {
      return res.status(200).json({ updated: 0 });
    }

    await Message.updateMany(
      { _id: { $in: messagesToMark.map((msg) => msg._id) } },
      [
        {
          $set: {
            status: "read",
            readAt: now,
            deliveredAt: { $ifNull: ["$deliveredAt", now] },
          },
        },
      ]
    );

    const senderSocketIds = getReceiverSocketIds(senderId);
    if (senderSocketIds.length > 0) {
      senderSocketIds.forEach((socketId) => {
        io.to(socketId).emit("messageStatusUpdate", {
          messageIds: messagesToMark.map((msg) => msg._id.toString()),
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
