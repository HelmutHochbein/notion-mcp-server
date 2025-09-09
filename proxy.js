// proxy.js (Variante A: mit Proxy-Key, aber redaction-fest)
import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

const proxyPort = process.env.PORT || 8080;
const upstream  = "http://127.0.0.1:8081";
const proxyKey  = (process.env.PROXY_KEY || "").trim();
const authToken = (process.env.AUTH_TOKEN || "").trim();

const app = express();

// Health
app.get("/health", (_req, res) => res.status(200).send("ok"));

// Proxy-Key erkennen: ?k=..., X-Proxy-Key, Authorization: Bearer <PROXY_KEY>
const hasProxyKey = (req) => {
  const q  = req.query?.k;
  const xh = req.header("X-Proxy-Key");
  const ah = req.header("authorization");
  const aBearer = ah?.startsWith("Bearer ") ? ah.slice(7) : null;
  return q === proxyKey || xh === proxyKey || aBearer === proxyKey;
};

// Auth: HEAD/OPTIONS immer erlauben (Preflight), sonst Key erforderlich
const authCheck = (req, res, next) => {
  if (req.method === "HEAD" || req.method === "OPTIONS") return next();
  if (hasProxyKey(req)) return next();
  return res.status(401).json({ error: "unauthorized" });
};

// Gemeinsame Proxy-Optionen: immer MCP-Auth injizieren
const base = {
  target: upstream,
  changeOrigin: true,
  logLevel: "debug",
  headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
  onProxyReq: (proxyReq, req) => {
    if (authToken) proxyReq.setHeader("Authorization", `Bearer ${authToken}`);
    console.log(`[proxy] → ${req.method} ${req.originalUrl} | injectAuth=${!!authToken}`);
  },
};

// *** WILDCARD: jeden Pfad (auch /redacted) zu /mcp rewriten ***
const proxyAnyToMcp = createProxyMiddleware({
  ...base,
  pathRewrite: () => "/mcp",
});

// Reihenfolge: alle Methoden, alle Pfade
app.all("*", authCheck, proxyAnyToMcp);

app.listen(proxyPort, "0.0.0.0", () => {
  console.log(`[proxy] listening on ${proxyPort}, ANY path -> ${upstream}/mcp (preflight allowed)`);
});
