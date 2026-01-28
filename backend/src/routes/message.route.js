import express from "express";
import {
  getAllContacts,
  getChatPartners,
  getMessagesByUserId,
  addReaction,
  markMessagesAsRead,
  sendMessage,
  uploadAttachment,
  deleteAttachment,
  editMessage,
  deleteMessage,
  searchMessages,
  getPinnedMessages,
  getStarredMessages,
  togglePin,
  toggleStar,
  getMessageById,
} from "../controllers/message.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";
import { arcjetProtection } from "../middleware/arcjet.middleware.js";

const router = express.Router();

// the middlewares execute in order - so requests get rate-limited first, then authenticated.
// this is actually more efficient since unauthenticated requests get blocked by rate limiting before hitting the auth middleware.
router.use(arcjetProtection, protectRoute);

router.get("/contacts", getAllContacts);
router.get("/chats", getChatPartners);
router.get("/search/:id", searchMessages);
router.get("/pinned/:id", getPinnedMessages);
router.get("/starred/:id", getStarredMessages);
router.get("/item/:id", getMessageById);
router.get("/:id", getMessagesByUserId);
router.put("/:id", editMessage);
router.delete("/:id", deleteMessage);
router.post("/:id/pin", togglePin);
router.post("/:id/star", toggleStar);
router.post("/:id/reactions", addReaction);
router.put("/read/:id", markMessagesAsRead);
router.post("/attachments", uploadAttachment);
router.delete("/attachments", deleteAttachment);
router.post("/send/:id", sendMessage);

export default router;
