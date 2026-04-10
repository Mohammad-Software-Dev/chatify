import "dotenv/config";
import net from "node:net";

process.env.NODE_ENV = "test";
process.env.PORT = "3010";
process.env.CLIENT_URL = "http://127.0.0.1:5174";
process.env.JWT_SECRET = "e2e_secret";
process.env.COOKIE_SAMESITE = "lax";
process.env.COOKIE_SECURE = "false";
process.env.COOKIE_PATH = "/";
process.env.JWT_ACCESS_TTL = "10m";
process.env.JWT_REFRESH_TTL = "7d";
process.env.ADMIN_USERNAME = "admin_user";
process.env.ADMIN_EMAIL = "admin@example.com";
process.env.ADMIN_PASSWORD = "password123";
process.env.ADMIN_FULL_NAME = "Admin User";
process.env.MONGOMS_IP = process.env.MONGOMS_IP || "127.0.0.1";
process.env.LOG_LEVEL = process.env.LOG_LEVEL || "warn";

const [{ MongoMemoryServer }, mongoose, bcrypt, socketModule, appModule, userModule] =
  await Promise.all([
    import("mongodb-memory-server"),
    import("mongoose"),
    import("bcryptjs"),
    import("../src/lib/socket.js"),
    import("../src/app.js"),
    import("../src/models/User.js"),
  ]);

const { app, server } = socketModule;
const { setupApp } = appModule;
const User = userModule.default;
let mongoServer;

const getFreeLocalPort = () =>
  new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() => resolve(address.port));
    });
  });

const seedAdmin = async () => {
  const username = process.env.ADMIN_USERNAME.trim().toLowerCase();
  const existing = await User.findOne({ username }).select("_id").lean();
  if (existing) return;

  const password = await bcrypt.default.hash(process.env.ADMIN_PASSWORD, 10);
  await User.create({
    fullName: process.env.ADMIN_FULL_NAME,
    email: process.env.ADMIN_EMAIL,
    username,
    password,
  });
};

const shutdown = async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.default.disconnect();
  if (mongoServer) await mongoServer.stop();
};

const mongoPort = await getFreeLocalPort();
mongoServer = await MongoMemoryServer.create({
  instance: {
    ip: "127.0.0.1",
    port: mongoPort,
  },
  binary: {
    bindIp: "127.0.0.1",
  },
});

await mongoose.default.connect(mongoServer.getUri());
await seedAdmin();
setupApp(app);

server.listen(Number(process.env.PORT), "127.0.0.1", () => {
  console.log(`E2E backend listening on ${process.env.PORT}`);
});

process.once("SIGTERM", () => {
  shutdown().finally(() => process.exit(0));
});
process.once("SIGINT", () => {
  shutdown().finally(() => process.exit(0));
});
