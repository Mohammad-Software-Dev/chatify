import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import User from "../src/models/User.js";

const app = createApp();
const describeDb = process.env.SKIP_DB_TESTS ? describe.skip : describe;

describeDb("Auth", () => {
  beforeEach(async () => {
    await User.deleteMany({});
  });
  it("signs up a user with username", async () => {
    const res = await request(app).post("/api/auth/signup").send({
      fullName: "Test User",
      email: "test1@example.com",
      password: "password123",
      username: "user_1234",
    });

    expect(res.status).toBe(201);
    expect(res.body.email).toBe("test1@example.com");
    expect(res.body.username).toBe("user_1234");
  });

  it("rejects duplicate email signup", async () => {
    await User.create({
      fullName: "Dup User",
      email: "dup@example.com",
      password: "hashed",
      username: "dup_user",
    });

    const res = await request(app).post("/api/auth/signup").send({
      fullName: "Dup User",
      email: "dup@example.com",
      password: "password123",
      username: "dup_user2",
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Email already exists/i);
  });

  it("checks username availability", async () => {
    const available = await request(app)
      .get("/api/auth/check-username")
      .query({ username: "free_name" });
    expect(available.status).toBe(200);
    expect(available.body.available).toBe(true);

    await User.create({
      fullName: "Taken User",
      email: "taken@example.com",
      password: "hashed",
      username: "taken_name",
    });

    const taken = await request(app)
      .get("/api/auth/check-username")
      .query({ username: "taken_name" });
    expect(taken.status).toBe(200);
    expect(taken.body.available).toBe(false);
  });

  it("logs in and returns auth cookie", async () => {
    await request(app).post("/api/auth/signup").send({
      fullName: "Login User",
      email: "login@example.com",
      password: "password123",
      username: "login_user",
    });

    const res = await request(app).post("/api/auth/login").send({
      email: "login@example.com",
      password: "password123",
    });

    expect(res.status).toBe(200);
    expect(res.headers["set-cookie"]).toBeDefined();
  });
});
