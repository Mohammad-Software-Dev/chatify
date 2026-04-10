import { ENV } from "./env.js";

const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 50,
};

const normalizeLevel = (value) =>
  Object.prototype.hasOwnProperty.call(LEVELS, value) ? value : null;

const getDefaultLevel = () => {
  if (ENV.NODE_ENV === "production") return "warn";
  if (ENV.NODE_ENV === "test") return "error";
  return "info";
};

const getActiveLevel = () =>
  normalizeLevel(process.env.LOG_LEVEL || ENV.LOG_LEVEL) || getDefaultLevel();

const write = (level, args) => {
  if (LEVELS[level] < LEVELS[getActiveLevel()]) return;
  console[level](...args);
};

export const logger = {
  debug: (...args) => write("debug", args),
  info: (...args) => write("info", args),
  warn: (...args) => write("warn", args),
  error: (...args) => write("error", args),
};

export default logger;
