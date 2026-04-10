import mongoose from "mongoose";
import { ENV } from "./env.js";
import logger from "./logger.js";

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(ENV.MONGO_URI);
    logger.info("MONGODB CONNECTED:", conn.connection.host);
  } catch (error) {
    logger.error("Error connecting to MONGODB:", error.message);
    process.exit(1);
  }
};
