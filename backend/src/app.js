import express from "express";
import cookieParser from "cookie-parser";
import path from "path";
import cors from "cors";
import helmet from "helmet";

import authRoutes from "./routes/auth.route.js";
import messageRoutes from "./routes/message.route.js";
import { ENV } from "./lib/env.js";

const __dirname = path.resolve();

export const setupApp = (app) => {
  const helmetOptions =
    ENV.NODE_ENV === "production"
      ? {
          contentSecurityPolicy: {
            useDefaults: true,
            directives: {
              "script-src": ["'self'", "'unsafe-inline'"],
              "style-src": ["'self'", "'unsafe-inline'"],
              "img-src": ["'self'", "data:", "https:"],
            },
          },
          hsts: {
            maxAge: 15552000,
            includeSubDomains: true,
            preload: true,
          },
          referrerPolicy: { policy: "no-referrer" },
          frameguard: { action: "deny" },
        }
      : {};

  app.use(helmet(helmetOptions));
  app.use(express.json({ limit: "5mb" })); // req.body
  app.use(
    cors({
      origin: ENV.CLIENT_URL,
      credentials: true,
    })
  );
  app.use(cookieParser());

  app.get("/health", (_, res) => res.status(200).send("ok"));
  app.get("/health_2", (_, res) => res.status(200).send("ok"));

  app.use("/api/auth", authRoutes);
  app.use("/api/messages", messageRoutes);

  // make ready for deployment
  if (ENV.NODE_ENV === "production") {
    app.use(express.static(path.join(__dirname, "../frontend/dist")));

    app.get(/.*/, (_, res) => {
      res.sendFile(path.join(__dirname, "../frontend", "dist", "index.html"));
    });
  }
};

export const createApp = () => {
  const app = express();
  setupApp(app);
  return app;
};
