// proxy.js
import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

const proxyPort = process.env.PORT || 8080;               // öffentlicher Railway-Port
const upstream  = "http://127.0.0.1:8081";                // interner MCP-Server (läuft auf 8081)
const proxyKey  = process.env.PROXY_KEY;                  // externer Zugang (für OpenAI-URL ?k=...)
const authToken = process.env.AUTH_TOKEN;                 // interner MCP-Auth (Bearer ...)

const app = express();

// --- Health ---
app.get("/health", (_req, res) => res.status(200).send("ok"));

// --- Auth-Middleware: akzeptiert ?k=... ODER Header X-Proxy-Key ---
const authCheck = (req, res, next) => {
  const ok = req.query.k === proxyKey || req.header("X-Proxy-Key") === proxyKey;
  if (!ok) return res.status(401).json({ error: "unauthorized" });
  next();
};

// --- Upstream-Header injection (setzt Authorization zum MCP) ---
const injectAuth = {
  onProxyReq: (proxyReq) => {
    if (authToken) proxyReq.setHeader("Authorization", `Bearer ${authToken}`);
  },
  changeOrigin: true,
  logLevel: "debug",
};

// 1) **Root** exakt "/" → immer auf "/mcp" beim Upstream
const proxyRootToMcp = createProxyMiddleware({
  target: upstream,
  ...injectAuth,
  pathRewrite: () => "/mcp", // egal, was ankommt: Root → /mcp
});

// 2) **Alle anderen Pfade** unverändert durchreichen (inkl. /mcp selbst)
const proxyPassthrough = createProxyMiddleware({
  target: upstream,
  ...injectAuth,
});

// Reihenfolge ist wichtig:
app.get("/", authCheck, proxyRootToMcp);     // NUR echte Root
app.use("/", authCheck, proxyPassthrough);   // alles andere

app.listen(proxyPort, "0.0.0.0", () => {
  console.log(`[proxy] listening on ${proxyPort}, root "/" -> ${upstream}/mcp`);
});
