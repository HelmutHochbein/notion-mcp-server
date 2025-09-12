// proxy.js – Redaction-fester Proxy für OpenAI Platform
import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

const proxyPort = process.env.PORT || 8080;                 // öffentlicher Railway-Port
const upstream  = "http://127.0.0.1:8081";                  // interner MCP-Server (läuft auf 8081)
const authToken = (process.env.AUTH_TOKEN || "").trim();    // interner MCP-Auth (Bearer ...)
const requiredHeaders = (process.env.REQUIRED_HEADERS || "x-notion-mcp-key-1,x-notion-mcp-key-2")
  .split(",")
  .map(h => h.trim().toLowerCase())
  .filter(Boolean);

const app = express();

// Health
app.get("/health", (_req, res) => res.status(200).send("ok"));

// ---- Auth über Header-NAMEN (Werte egal) ----
// Erlaubt HEAD/OPTIONS (Preflight von OpenAI) ohne Auth
const authCheck = (req, res, next) => {
  if (req.method === "HEAD" || req.method === "OPTIONS") return next();

  const present = requiredHeaders.every(h => req.headers[h] !== undefined);
  if (!present) {
    return res.status(401).json({
      error: "unauthorized",
      missing: requiredHeaders.filter(h => req.headers[h] === undefined),
    });
  }
  next();
};

// ---- Gemeinsame Proxy-Optionen: MCP-Auth immer injizieren ----
const base = {
  target: upstream,
  changeOrigin: true,
  logLevel: "debug",
  headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
  onProxyReq: (proxyReq, req) => {
    if (authToken) proxyReq.setHeader("Authorization", `Bearer ${authToken}`);
    console.log(`[proxy] → ${req.method} ${req.originalUrl} | injectAuth=${!!authToken} reqHeaders=${requiredHeaders.join("+")}`);
  },
  // WICHTIG: egal welcher Pfad (auch /redacted), IMMER auf /mcp umschreiben
  pathRewrite: () => "/mcp",
};

// **Alle** Methoden & **alle** Pfade → nach /mcp
app.all("*", authCheck, createProxyMiddleware(base));

app.listen(proxyPort, "0.0.0.0", () => {
  console.log(`[proxy] listening on ${proxyPort}, ANY path -> ${upstream}/mcp`);
  console.log(`[proxy] required header names: ${requiredHeaders.join(", ")}`);
});
