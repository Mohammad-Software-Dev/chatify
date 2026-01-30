import { z } from "zod";

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id");
const usernameRegex = /^[a-z0-9_]{3,20}$/;

const userIdParam = z.object({ id: objectId });
const messageIdParam = z.object({ id: objectId });

export const signupSchema = z.object({
  body: z.object({
    fullName: z.string().min(1).max(100),
    email: z.string().email(),
    password: z.string().min(6).max(100),
    username: z.string().regex(usernameRegex).optional(),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(6).max(100),
  }),
});

export const checkUsernameSchema = z.object({
  query: z.object({
    username: z.string().min(3).max(20).regex(usernameRegex),
  }),
});

export const updateProfileSchema = z.object({
  body: z.object({
    profilePic: z.string().min(1),
  }),
});

export const updateUsernameSchema = z.object({
  body: z.object({
    username: z.string().min(3).max(20).regex(usernameRegex),
  }),
});

export const getMessagesSchema = z.object({
  params: userIdParam,
  query: z.object({
    before: z.string().optional(),
    limit: z.string().optional(),
    markRead: z.string().optional(),
  }),
});

export const sendMessageSchema = z.object({
  params: userIdParam,
  body: z.object({
    text: z.string().max(2000).optional(),
    image: z.string().optional(),
    images: z.array(z.string()).max(4).optional(),
    clientMessageId: z.string().optional(),
    replyToMessageId: z.string().optional(),
  }),
});

export const addReactionSchema = z.object({
  params: messageIdParam,
  body: z.object({
    emoji: z.string().min(1).max(10),
  }),
});

export const markReadSchema = z.object({
  params: userIdParam,
});

export const editMessageSchema = z.object({
  params: messageIdParam,
  body: z.object({
    text: z.string().min(1).max(2000),
  }),
});

export const deleteMessageSchema = z.object({
  params: messageIdParam,
});

export const pinToggleSchema = z.object({
  params: messageIdParam,
  body: z
    .object({
      pin: z.boolean().optional(),
    })
    .optional(),
});

export const starToggleSchema = z.object({
  params: messageIdParam,
  body: z
    .object({
      star: z.boolean().optional(),
    })
    .optional(),
});

export const searchMessagesSchema = z.object({
  params: userIdParam,
  query: z.object({
    q: z.string().min(1).max(100),
    limit: z.string().optional(),
  }),
});

export const contactsSchema = z.object({
  query: z.object({
    username: z.string().min(3).max(20).regex(usernameRegex),
  }),
});

export const attachmentUploadSchema = z.object({
  body: z.object({
    image: z.string().min(1),
  }),
});

export const attachmentDeleteSchema = z.object({
  body: z.object({
    publicId: z.string().min(1),
  }),
});

export const getMessageByIdSchema = z.object({
  params: messageIdParam,
});

export const listPinnedSchema = z.object({
  params: userIdParam,
});

export const listStarredSchema = z.object({
  params: userIdParam,
});
