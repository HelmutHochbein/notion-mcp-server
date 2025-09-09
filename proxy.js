// proxy.js (Variante B: keine Auth, ANY path -> /mcp)
import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

const proxyPort = process.env.PORT || 8080;
const upstream  = "http://127.0.0.1:8081";
const authToken = (process.env.AUTH_TOKEN || "").trim();

const app = express();

app.get("/health", (_req, res) => res.status(200).send("ok"));

const proxyAnyToMcp = createProxyMiddleware({
  target: upstream,
  changeOrigin: true,
  logLevel: "debug",
  headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
  onProxyReq: (proxyReq, req) => {
    if (authToken) proxyReq.setHeader("Authorization", `Bearer ${authToken}`);
    console.log(`[proxy] → ${req.method} ${req.originalUrl} | injectAuth=${!!authToken}`);
  },
  pathRewrite: () => "/mcp",
});

// Keine Auth, alle Methoden, alle Pfade
app.all("*", proxyAnyToMcp);

app.listen(proxyPort, "0.0.0.0", () => {
  console.log(`[proxy] listening on ${proxyPort}, ANY path -> ${upstream}/mcp (NO external auth)`);
});
