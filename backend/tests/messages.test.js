import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import User from "../src/models/User.js";
import Message from "../src/models/Message.js";

process.env.MESSAGE_ENC_STORE_PLAINTEXT =
  process.env.MESSAGE_ENC_STORE_PLAINTEXT || "true";

const app = createApp();
const describeDb = process.env.SKIP_DB_TESTS ? describe.skip : describe;

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

    const { cookie } = await signupAndLogin("e@example.com", "user_e");

    const res = await request(app)
      .get("/api/messages/contacts")
      .set("Cookie", cookie)
      .query({ username: "mike" });
    expect(res.status).toBe(200);
    expect(res.body[0].username).toBe("mike");
  });
});
