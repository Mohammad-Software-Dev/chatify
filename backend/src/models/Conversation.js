import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema(
  {
    participantIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],
    participantsKey: {
      type: String,
      required: true,
      unique: true,
    },
    lastMessageAt: {
      type: Date,
    },
    lastMessageText: {
      type: String,
      default: "",
    },
    lastMessageImage: {
      type: String,
      default: "",
    },
    lastMessageSenderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    unreadCounts: {
      type: Map,
      of: Number,
      default: {},
    },
  },
  { timestamps: true }
);

conversationSchema.index({ participantIds: 1 });
conversationSchema.index({ lastMessageAt: -1 });

const Conversation = mongoose.model("Conversation", conversationSchema);

export default Conversation;
