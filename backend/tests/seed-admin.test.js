import { describe, it, expect, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import User from "../src/models/User.js";
import { seedAdmin } from "../src/lib/seedAdmin.js";

const describeDb =
  process.env.SKIP_DB_TESTS === "true" ? describe.skip : describe;

const adminEnv = {
  ADMIN_USERNAME: "Admin_User",
  ADMIN_EMAIL: "admin@example.com",
  ADMIN_PASSWORD: "password123",
  ADMIN_FULL_NAME: "Admin User",
};

describeDb("seedAdmin", () => {
  beforeEach(async () => {
    await User.deleteMany({});
  });

  it("creates a configured admin user", async () => {
    const result = await seedAdmin({ env: adminEnv });

    expect(result.created).toBe(true);
    expect(result.user.username).toBe("admin_user");
    expect(result.user.password).toBeUndefined();

    const stored = await User.findOne({ username: "admin_user" });
    expect(stored.email).toBe("admin@example.com");
    expect(await bcrypt.compare("password123", stored.password)).toBe(true);
  });

  it("is idempotent when the admin username already exists", async () => {
    await seedAdmin({ env: adminEnv });
    const firstStored = await User.findOne({ username: "admin_user" }).lean();

    const result = await seedAdmin({
      env: {
        ...adminEnv,
        ADMIN_PASSWORD: "different-password",
      },
    });

    const users = await User.find({ username: "admin_user" }).lean();
    const stored = users[0];
    expect(result.created).toBe(false);
    expect(users).toHaveLength(1);
    expect(stored.password).toBe(firstStored.password);
  });

  it("fails clearly when required admin env vars are missing", async () => {
    await expect(seedAdmin({ env: {} })).rejects.toThrow(
      /ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD/
    );
  });
});
