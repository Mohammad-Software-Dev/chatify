import dns from "node:dns/promises";
import net from "node:net";

const FETCH_TIMEOUT_MS = 3000;
const MAX_REDIRECTS = 3;
const MAX_HTML_BYTES = 200_000;

const isUnsafeIpv4 = (ip) => {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return true;
  }
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224 ||
    ip === "255.255.255.255"
  );
};

const isUnsafeIpv6 = (ip) => {
  const normalized = ip.toLowerCase();
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("::ffff:")) {
    return isUnsafeIpv4(normalized.replace("::ffff:", ""));
  }
  return (
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("ff")
  );
};

const isUnsafeAddress = (address) => {
  const version = net.isIP(address);
  if (version === 4) return isUnsafeIpv4(address);
  if (version === 6) return isUnsafeIpv6(address);
  return true;
};

const normalizeHostname = (hostname) =>
  hostname.toLowerCase().replace(/\.$/, "");

const isUnsafeHostname = (hostname) => {
  const normalized = normalizeHostname(hostname);
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local")
  ) {
    return true;
  }

  return net.isIP(normalized) ? isUnsafeAddress(normalized) : false;
};

const resolveSafeHostname = async (hostname) => {
  if (isUnsafeHostname(hostname)) return false;

  const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0) return false;
  return addresses.every((entry) => !isUnsafeAddress(entry.address));
};

const resolveSafeUrl = async (rawUrl, baseUrl) => {
  let url;
  try {
    url = baseUrl ? new URL(rawUrl, baseUrl) : new URL(rawUrl);
  } catch {
    return null;
  }

  if (!["http:", "https:"].includes(url.protocol)) return null;
  if (url.username || url.password) return null;
  if (!(await resolveSafeHostname(url.hostname))) return null;
  return url;
};

const readLimitedText = async (res) => {
  if (!res.body?.getReader) return res.text();

  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_HTML_BYTES) {
      await reader.cancel();
      throw new Error("Preview response too large");
    }
    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks).toString("utf8");
};

const getMetaContent = (html, attribute, value) => {
  const tagMatch = html.match(
    new RegExp(`<meta[^>]+${attribute}=["']${value}["'][^>]*>`, "i")
  );
  if (!tagMatch) return null;
  return tagMatch[0].match(/content=["']([^"']+)["']/i)?.[1] || null;
};

const parsePreview = (html, url) => {
  const title =
    getMetaContent(html, "property", "og:title") ||
    getMetaContent(html, "name", "twitter:title") ||
    html.match(/<title>([^<]*)<\/title>/i)?.[1] ||
    url;
  const description =
    getMetaContent(html, "property", "og:description") ||
    getMetaContent(html, "name", "description") ||
    getMetaContent(html, "name", "twitter:description");
  const image =
    getMetaContent(html, "property", "og:image") ||
    getMetaContent(html, "name", "twitter:image");

  return { url, title, description, image };
};

export const fetchLinkPreview = async (rawUrl) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    let url = await resolveSafeUrl(rawUrl);
    if (!url) return null;

    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      const res = await fetch(url.href, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": "ChatifyBot/1.0",
        },
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location || redirects === MAX_REDIRECTS) return null;
        url = await resolveSafeUrl(location, url);
        if (!url) return null;
        continue;
      }

      if (!res.ok) return null;
      const contentType = res.headers.get("content-type") || "";
      if (contentType && !contentType.toLowerCase().includes("text/html")) {
        return null;
      }

      const html = await readLimitedText(res);
      return parsePreview(html, url.href);
    }

    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
};
