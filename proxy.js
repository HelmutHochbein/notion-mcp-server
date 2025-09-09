// proxy.js
import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

const proxyPort = process.env.PORT || 8080;                  // öffentlicher Railway-Port
const upstream  = "http://127.0.0.1:8081";                   // MCP-Server intern
const proxyKey  = process.env.PROXY_KEY;                     // externer Zugangsschlüssel
const authToken = process.env.AUTH_TOKEN;                    // interner MCP-Auth-Token

if (!proxyKey) {
  console.error("[proxy] PROXY_KEY is not set");
}
if (!authToken) {
  console.error("[proxy] AUTH_TOKEN is not set");
}

const app = express();

// Health (optional)
app.get("/health", (_req, res) => res.status(200).send("ok"));

// Auth-Middleware: akzeptiere ?k=... ODER Header X-Proxy-Key
app.use((req, res, next) => {
  const keyFromQuery  = req.query.k;
  const keyFromHeader = req.header("X-Proxy-Key");
  const ok = (keyFromQuery && keyFromQuery === proxyKey) || (keyFromHeader && keyFromHeader === proxyKey);
  if (!ok) return res.status(401).json({ error: "unauthorized" });
  return next();
});

// Proxy: NUR Root "/" → "/mcp" rewriten, übrige Pfade durchreichen.
// Zusätzlich den internen MCP-Header setzen.
app.use(
  "/",
  createProxyMiddleware({
    target: upstream,
    changeOrigin: true,
    pathRewrite: (path) => {
      if (path === "/" || path === "") return "/mcp"; // nur Root auf /mcp
      return path;                                    // sonst unverändert
    },
    logLevel: "warn",
    onProxyReq: (proxyReq) => {
      if (authToken) {
        proxyReq.setHeader("Authorization", `Bearer ${authToken}`);
      }
    },
  })
);

app.listen(proxyPort, "0.0.0.0", () => {
  console.log(`[proxy] listening on ${proxyPort}, forwarding to ${upstream} (root→/mcp), auth via PROXY_KEY`);
});
