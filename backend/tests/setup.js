import { beforeAll, afterAll, vi } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

let mongoServer;
let dbReady = false;

process.env.JWT_SECRET = process.env.JWT_SECRET || "test_secret";
process.env.CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";
process.env.NODE_ENV = "test";
process.env.MONGOMS_IP = "127.0.0.1";
process.env.MONGOMS_PORT = "27017";

vi.mock("../src/lib/arcjet.js", () => ({
  default: {
    protect: async () => ({
      isDenied: () => false,
      reason: {},
      results: [],
    }),
  },
}));

vi.mock("../src/lib/cloudinary.js", () => ({
  default: {
    uploader: {
      upload: async () => ({
        secure_url: "https://example.com/mock.png",
        public_id: "mock_public_id",
      }),
      destroy: async () => ({ result: "ok" }),
    },
  },
}));

beforeAll(async () => {
  if (process.env.SKIP_DB_TESTS === "true") {
    return;
  }
  try {
    if (process.env.TEST_MONGO_URI) {
      await mongoose.connect(process.env.TEST_MONGO_URI);
      dbReady = true;
      return;
    }
    mongoServer = await MongoMemoryServer.create({
      instance: {
        ip: "127.0.0.1",
      },
      binary: {
        bindIp: "127.0.0.1",
      },
    });
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
    dbReady = true;
  } catch (error) {
    console.warn("Mongo test setup failed, skipping DB tests:", error.message);
    process.env.SKIP_DB_TESTS = "true";
  }
});

afterAll(async () => {
  if (dbReady) {
    await mongoose.disconnect();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
});
