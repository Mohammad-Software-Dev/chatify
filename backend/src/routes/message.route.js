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
  searchAllMessages,
} from "../controllers/message.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";
import { arcjetProtection } from "../middleware/arcjet.middleware.js";
import {
  attachmentLimiter,
  contactSearchLimiter,
} from "../middleware/rate-limit.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import {
  getMessagesSchema,
  addReactionSchema,
  markReadSchema,
  sendMessageSchema,
  attachmentUploadSchema,
  attachmentDeleteSchema,
  editMessageSchema,
  deleteMessageSchema,
  searchMessagesSchema,
  searchAllMessagesSchema,
  listPinnedSchema,
  listStarredSchema,
  pinToggleSchema,
  starToggleSchema,
  getMessageByIdSchema,
  contactsSchema,
} from "../validators/index.js";

const router = express.Router();

// the middlewares execute in order - so requests get rate-limited first, then authenticated.
// this is actually more efficient since unauthenticated requests get blocked by rate limiting before hitting the auth middleware.
router.use(arcjetProtection, protectRoute);

router.get(
  "/contacts",
  contactSearchLimiter,
  validate(contactsSchema),
  getAllContacts
);
router.get("/chats", getChatPartners);
router.get("/search-all", validate(searchAllMessagesSchema), searchAllMessages);
router.get("/search/:id", validate(searchMessagesSchema), searchMessages);
router.get("/pinned/:id", validate(listPinnedSchema), getPinnedMessages);
router.get("/starred/:id", validate(listStarredSchema), getStarredMessages);
router.get("/item/:id", validate(getMessageByIdSchema), getMessageById);
router.get("/:id", validate(getMessagesSchema), getMessagesByUserId);
router.put("/:id", validate(editMessageSchema), editMessage);
router.delete("/:id", validate(deleteMessageSchema), deleteMessage);
router.post("/:id/pin", validate(pinToggleSchema), togglePin);
router.post("/:id/star", validate(starToggleSchema), toggleStar);
router.post("/:id/reactions", validate(addReactionSchema), addReaction);
router.put("/read/:id", validate(markReadSchema), markMessagesAsRead);
router.post(
  "/attachments",
  attachmentLimiter,
  validate(attachmentUploadSchema),
  uploadAttachment
);
router.delete("/attachments", validate(attachmentDeleteSchema), deleteAttachment);
router.post("/send/:id", validate(sendMessageSchema), sendMessage);

export default router;
