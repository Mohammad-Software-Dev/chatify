import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import User from "../src/models/User.js";
import Message from "../src/models/Message.js";
import { ENV } from "../src/lib/env.js";

process.env.MESSAGE_ENC_STORE_PLAINTEXT =
  process.env.MESSAGE_ENC_STORE_PLAINTEXT || "true";

const app = createApp();
const describeDb =
  process.env.SKIP_DB_TESTS === "true" ? describe.skip : describe;

const signupAndLogin = async (email, username) => {
  await request(app).post("/api/auth/signup").send({
    fullName: "User " + username,
    email,
    password: "password123",
    username,
  });
  const res = await request(app).post("/api/auth/login").send({
    email,
    password: "password123",
  });
  const cookie = res.headers["set-cookie"][0];
  const user = await User.findOne({ email }).lean();
  return { cookie, user };
};

describeDb("Messages", () => {
  beforeEach(async () => {
    ENV.ADMIN_USERNAME = undefined;
    await Message.deleteMany({});
    await User.deleteMany({});
  });

  it("sends, edits, and deletes a message", async () => {
    const sender = await signupAndLogin("a@example.com", "user_a");
    const receiver = await signupAndLogin("b@example.com", "user_b");

    const sendRes = await request(app)
      .post(`/api/messages/send/${receiver.user._id}`)
      .set("Cookie", sender.cookie)
      .send({ text: "Hello there" });
    expect(sendRes.status).toBe(201);
    const messageId = sendRes.body._id;

    const editRes = await request(app)
      .put(`/api/messages/${messageId}`)
      .set("Cookie", sender.cookie)
      .send({ text: "Edited text" });
    expect(editRes.status).toBe(200);
    expect(editRes.body.text).toBe("Edited text");

    const deleteRes = await request(app)
      .delete(`/api/messages/${messageId}`)
      .set("Cookie", sender.cookie);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.deletedAt).toBeTruthy();
  });

  it("pins, stars, and searches messages", async () => {
    const sender = await signupAndLogin("c@example.com", "user_c");
    const receiver = await signupAndLogin("d@example.com", "user_d");

    const sendRes = await request(app)
      .post(`/api/messages/send/${receiver.user._id}`)
      .set("Cookie", sender.cookie)
      .send({ text: "Search me" });
    const messageId = sendRes.body._id;

    const pinRes = await request(app)
      .post(`/api/messages/${messageId}/pin`)
      .set("Cookie", sender.cookie)
      .send({});
    expect(pinRes.status).toBe(200);
    expect(pinRes.body.pinnedBy?.length).toBe(1);

    const starRes = await request(app)
      .post(`/api/messages/${messageId}/star`)
      .set("Cookie", sender.cookie)
      .send({});
    expect(starRes.status).toBe(200);
    expect(starRes.body.starredBy?.length).toBe(1);

    const searchRes = await request(app)
      .get(`/api/messages/search/${receiver.user._id}`)
      .set("Cookie", sender.cookie)
      .query({ q: "Search" });
    expect(searchRes.status).toBe(200);
    expect(searchRes.body.length).toBeGreaterThan(0);

    const pinnedRes = await request(app)
      .get(`/api/messages/pinned/${receiver.user._id}`)
      .set("Cookie", sender.cookie);
    expect(pinnedRes.status).toBe(200);
    expect(pinnedRes.body.length).toBe(1);

    const starredRes = await request(app)
      .get(`/api/messages/starred/${receiver.user._id}`)
      .set("Cookie", sender.cookie);
    expect(starredRes.status).toBe(200);
    expect(starredRes.body.length).toBe(1);
  });

  it("uploads and deletes attachments", async () => {
    const sender = await signupAndLogin("upload@example.com", "user_up");

    const uploadRes = await request(app)
      .post("/api/messages/attachments")
      .set("Cookie", sender.cookie)
      .send({ image: "data:image/png;base64,AAAA" });
    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.url).toMatch(/^https?:/);

    const deleteRes = await request(app)
      .delete("/api/messages/attachments")
      .set("Cookie", sender.cookie)
      .send({ publicId: uploadRes.body.publicId });
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.result).toBe("ok");
  });

  it("searches contacts by username with exact match first", async () => {
    await User.create([
      {
        fullName: "Exact User",
        email: "exact@example.com",
        password: "hashed",
        username: "mike",
      },
      {
        fullName: "Partial User",
        email: "partial@example.com",
        password: "hashed",
        username: "mike_1234",
      },
    ]);

    const { cookie, user } = await signupAndLogin("e@example.com", "mike_self");

    const res = await request(app)
      .get("/api/messages/contacts")
      .set("Cookie", cookie)
      .query({ username: "mike" });
    expect(res.status).toBe(200);
    expect(res.body[0].username).toBe("mike");
    expect(res.body.some((contact) => contact._id === user._id.toString())).toBe(false);
  });

  it("rejects invalid reply target ids", async () => {
    const sender = await signupAndLogin("reply-a@example.com", "reply_a");
    const receiver = await signupAndLogin("reply-b@example.com", "reply_b");

    const res = await request(app)
      .post(`/api/messages/send/${receiver.user._id}`)
      .set("Cookie", sender.cookie)
      .send({ text: "bad reply", replyToMessageId: "not-an-object-id" });

    expect(res.status).toBe(400);
  });

  it("sends messages without previews for unsafe preview urls", async () => {
    const sender = await signupAndLogin("unsafe-a@example.com", "unsafe_a");
    const receiver = await signupAndLogin("unsafe-b@example.com", "unsafe_b");

    const res = await request(app)
      .post(`/api/messages/send/${receiver.user._id}`)
      .set("Cookie", sender.cookie)
      .send({ text: "internal http://127.0.0.1/private" });

    expect(res.status).toBe(201);
    expect(res.body.text).toContain("127.0.0.1");
    expect(res.body.linkPreview).toBeFalsy();
  });

  it("returns configured admin contact for non-admin users", async () => {
    await signupAndLogin("admin@example.com", "admin_user");
    const member = await signupAndLogin("member@example.com", "member_user");
    ENV.ADMIN_USERNAME = "Admin_User";

    const res = await request(app)
      .get("/api/messages/admin-contact")
      .set("Cookie", member.cookie);

    expect(res.status).toBe(200);
    expect(res.body.username).toBe("admin_user");
    expect(res.body.password).toBeUndefined();
  });

  it("returns null admin contact for the admin user", async () => {
    const admin = await signupAndLogin("admin-self@example.com", "admin_self");
    ENV.ADMIN_USERNAME = "admin_self";

    const res = await request(app)
      .get("/api/messages/admin-contact")
      .set("Cookie", admin.cookie);

    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it("returns null admin contact when admin username is missing", async () => {
    const member = await signupAndLogin("missing-admin@example.com", "member_missing");

    const res = await request(app)
      .get("/api/messages/admin-contact")
      .set("Cookie", member.cookie);

    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it("returns null admin contact when configured admin does not exist", async () => {
    const member = await signupAndLogin("ghost-admin@example.com", "member_ghost");
    ENV.ADMIN_USERNAME = "ghost_admin";

    const res = await request(app)
      .get("/api/messages/admin-contact")
      .set("Cookie", member.cookie);

    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });
});
