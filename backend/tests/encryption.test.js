import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";

const describeDb = process.env.SKIP_DB_TESTS ? describe.skip : describe;

const buildApp = async (envOverrides = {}) => {
  vi.resetModules();
  Object.assign(process.env, envOverrides);
  const { createApp } = await import("../src/app.js");
  const Message = (await import("../src/models/Message.js")).default;
  const User = (await import("../src/models/User.js")).default;
  return { app: createApp(), Message, User };
};

const signupAndLogin = async (app, email, username) => {
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
  return { cookie };
};

describeDb("Message encryption", () => {
  const prevEnv = { ...process.env };

  afterAll(() => {
    Object.keys(process.env).forEach((key) => {
      if (!(key in prevEnv)) {
        delete process.env[key];
      }
    });
    Object.assign(process.env, prevEnv);
  });

  beforeEach(async () => {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.db.dropDatabase();
    }
  });

  it("encrypts text/link previews when plaintext storage is disabled", async () => {
    const { app, Message, User } = await buildApp({
      MESSAGE_ENC_KEYS:
        "v1:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      MESSAGE_ENC_KEY_ID: "v1",
      MESSAGE_ENC_STORE_PLAINTEXT: "false",
    });

    await User.deleteMany({});
    const sender = await signupAndLogin(app, "enc1@example.com", "user_enc1");
    const receiver = await signupAndLogin(app, "enc2@example.com", "user_enc2");
    const receiverUser = await User.findOne({ email: "enc2@example.com" }).lean();

    const sendRes = await request(app)
      .post(`/api/messages/send/${receiverUser._id}`)
      .set("Cookie", sender.cookie)
      .send({ text: "Hello encrypted" });
    expect(sendRes.status).toBe(201);
    expect(sendRes.body.text).toBe("Hello encrypted");

    const stored = await Message.findById(sendRes.body._id).lean();
    expect(stored.text).toBe("");
    expect(stored.textEnc).toBeTruthy();
    expect(stored.encKeyId).toBe("v1");
  });

  it("disables message search when plaintext storage is off", async () => {
    const { app, User } = await buildApp({
      MESSAGE_ENC_KEYS:
        "v1:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      MESSAGE_ENC_KEY_ID: "v1",
      MESSAGE_ENC_STORE_PLAINTEXT: "false",
    });

    await User.deleteMany({});
    const sender = await signupAndLogin(app, "enc3@example.com", "user_enc3");
    const receiver = await signupAndLogin(app, "enc4@example.com", "user_enc4");
    const receiverUser = await User.findOne({ email: "enc4@example.com" }).lean();

    const searchRes = await request(app)
      .get(`/api/messages/search/${receiverUser._id}`)
      .set("Cookie", sender.cookie)
      .query({ q: "hello" });
    expect(searchRes.status).toBe(400);
    expect(searchRes.body.code).toBe("SEARCH_DISABLED");
  });
});
