import mongoose from "mongoose";
import { ENV } from "../src/lib/env.js";
import { seedAdmin } from "../src/lib/seedAdmin.js";

const main = async () => {
  if (!ENV.MONGO_URI) {
    throw new Error("MONGO_URI is required.");
  }

  await mongoose.connect(ENV.MONGO_URI);
  const result = await seedAdmin();
  const action = result.created ? "Created" : "Found existing";
  console.log(`${action} admin user: ${result.user.username}`);
};

main()
  .catch((error) => {
    console.error("Admin seed failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
