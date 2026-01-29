import { connectDB } from "./lib/db.js";
import { ENV } from "./lib/env.js";
import { app, server } from "./lib/socket.js";
import { setupApp } from "./app.js";

const PORT = ENV.PORT || 3000;

setupApp(app);

server.listen(PORT, () => {
  console.log("Server running on port: " + PORT);
  connectDB();
});
