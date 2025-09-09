// proxy.js
import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

const proxyPort = process.env.PORT || 8080;                 // öffentlicher Railway-Port
const upstream  = "http://127.0.0.1:8081";                  // interner MCP (läuft via Dockerfile auf 8081)
const proxyKey  = (process.env.PROXY_KEY || "").trim();     // externer Zugriffsschlüssel (?k=... oder Header)
const authToken = (process.env.AUTH_TOKEN || "").trim();    // interner MCP-Auth-Token (Bearer ...)

const app = express();

// -------- Health --------
app.get("/health", (_req, res) => res.status(200).send("ok"));

// -------- Auth: akzeptiert ?k=... ODER Header X-Proxy-Key --------
const authCheck = (req, res, next) => {
  const ok = req.query.k === proxyKey || req.header("X-Proxy-Key") === proxyKey;
  if (!ok) return res.status(401).json({ error: "unauthorized" });
  next();
};

// (temporär) Request-Log
app.use((req, _res, next) => {
  console.log(`[proxy] ${req.method} ${req.originalUrl}`);
  next();
});

// Gemeinsame Proxy-Optionen: Auth-Header setzen (zweifach)
const baseProxyOpts = {
  target: upstream,
  changeOrigin: true,
  logLevel: "debug",
  headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
  onProxyReq: (proxyReq, req) => {
    // Fallback: Header nochmal setzen (falls headers:{} überschrieben würde)
    if (authToken) proxyReq.setHeader("Authorization", `Bearer ${authToken}`);
    console.log(
      `[proxy] → ${req.method} ${req.originalUrl} | injectAuth=${Boolean(
        authToken
      )} len=${authToken.length}`
    );
  },
};

// 1) NUR echte Root "/" → immer /mcp beim Upstream
const proxyRootToMcp = createProxyMiddleware({
  ...baseProxyOpts,
  pathRewrite: () => "/mcp",
});

// 2) Alle anderen Pfade unverändert durchreichen (inkl. /mcp selbst)
const proxyPassthrough = createProxyMiddleware({
  ...baseProxyOpts,
});

// Reihenfolge ist wichtig:
app.get("/", authCheck, proxyRootToMcp);     // echte Root
app.use("/", authCheck, proxyPassthrough);   // alles andere

app.listen(proxyPort, "0.0.0.0", () => {
  console.log(
    `[proxy] listening on ${proxyPort}, root "/" -> ${upstream}/mcp (PROXY_KEY set=${!!proxyKey}, AUTH_TOKEN len=${authToken.length})`
  );
});
