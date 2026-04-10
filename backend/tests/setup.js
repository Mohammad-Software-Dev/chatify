import { beforeAll, afterAll, vi } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import net from "node:net";

let mongoServer;
let dbReady = false;

process.env.JWT_SECRET = process.env.JWT_SECRET || "test_secret";
process.env.CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";
process.env.NODE_ENV = "test";
process.env.COOKIE_SAMESITE = process.env.COOKIE_SAMESITE || "strict";
process.env.COOKIE_SECURE = process.env.COOKIE_SECURE || "true";
process.env.COOKIE_PATH = process.env.COOKIE_PATH || "/";
process.env.JWT_ACCESS_TTL = process.env.JWT_ACCESS_TTL || "10m";
process.env.JWT_REFRESH_TTL = process.env.JWT_REFRESH_TTL || "7d";
process.env.MONGOMS_IP = process.env.MONGOMS_IP || "127.0.0.1";

const getFreeLocalPort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });

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

vi.mock("../src/emails/emailHandlers.js", () => ({
  sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
}));

beforeAll(async () => {
  if (process.env.SKIP_DB_TESTS === "true") {
    return;
  }
  if (process.env.TEST_MONGO_URI) {
    await mongoose.connect(process.env.TEST_MONGO_URI);
    dbReady = true;
    return;
  }
  const port = process.env.MONGOMS_PORT
    ? Number(process.env.MONGOMS_PORT)
    : await getFreeLocalPort();

  mongoServer = await MongoMemoryServer.create({
    instance: {
      ip: "127.0.0.1",
      port,
    },
    binary: {
      bindIp: "127.0.0.1",
    },
  });
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
  dbReady = true;
});

afterAll(async () => {
  if (dbReady) {
    await mongoose.disconnect();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
});
