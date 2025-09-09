// proxy.js
import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

const proxyPort = process.env.PORT || 8080;               // Öffentlicher Railway-Port
const upstream  = "http://127.0.0.1:8081";                // MCP-Server (läuft im Container auf 8081)
const proxyKey  = (process.env.PROXY_KEY || "").trim();   // Externer Zugangsschlüssel (für OpenAI-URL ?k=...)
const authToken = (process.env.AUTH_TOKEN || "").trim();  // Interner MCP-Auth-Token (Bearer ...)

const app = express();

// --- Healthcheck ---
app.get("/health", (_req, res) => res.status(200).send("ok"));

// --- Auth-Middleware: akzeptiert ?k=... ODER Header X-Proxy-Key ---
const authCheck = (req, res, next) => {
  const ok =
    req.query.k === proxyKey ||
    req.header("X-Proxy-Key") === proxyKey;

  if (!ok) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
};

// --- Proxy-Konfiguration (setzt Authorization-Header zum MCP) ---
const injectAuth = {
  changeOrigin: true,
  logLevel: "debug",
  onProxyReq: (proxyReq, req) => {
    const has = Boolean(authToken);
    if (has) {
      proxyReq.setHeader("Authorization", `Bearer ${authToken}`);
    }
    console.log(`[proxy] → ${req.method} ${req.originalUrl} | injectAuth=${has} len=${authToken.length}`);
  },
};

// --- Root "/" → zwingend /mcp ---
const proxyRootToMcp = createProxyMiddleware({
  target: upstream,
  ...injectAuth,
  pathRewrite: () => "/mcp",
});

// --- Alle anderen Pfade unverändert durchreichen ---
const proxyPassthrough = createProxyMiddleware({
  target: upstream,
  ...injectAuth,
});

// --- Routen ---
app.get("/", authCheck, proxyRootToMcp);    // NUR echte Root
app.use("/", authCheck, proxyPassthrough);  // alles andere (inkl. /mcp)

app.listen(proxyPort, "0.0.0.0", () => {
  console.log(`[proxy] listening on ${proxyPort}, root "/" -> ${upstream}/mcp`);
});
