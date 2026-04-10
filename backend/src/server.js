import { connectDB } from "./lib/db.js";
import { ENV } from "./lib/env.js";
import { app, server } from "./lib/socket.js";
import { setupApp } from "./app.js";
import logger from "./lib/logger.js";

const PORT = ENV.PORT || 3000;

setupApp(app);

server.listen(PORT, () => {
  logger.info("Server running on port:", PORT);
  connectDB();
});
