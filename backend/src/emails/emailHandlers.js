import { resendClient, sender } from "../lib/resend.js";
import { createWelcomeEmailTemplate } from "../emails/emailTemplates.js";
import { ENV } from "../lib/env.js";
import logger from "../lib/logger.js";

export const sendWelcomeEmail = async (email, name, clientURL) => {
  if (!ENV.RESEND_API_KEY || ENV.NODE_ENV === "test") {
    logger.debug("Welcome email skipped");
    return;
  }

  const { data, error } = await resendClient.emails.send({
    from: `${sender.name} <${sender.email}>`,
    to: email,
    subject: "Welcome to Chatify!",
    html: createWelcomeEmailTemplate(name, clientURL),
  });

  if (error) {
    logger.warn("Welcome email provider rejected request:", error.message);
    throw new Error("Failed to send welcome email");
  }

  logger.info("Welcome email sent:", data?.id || "ok");
};
