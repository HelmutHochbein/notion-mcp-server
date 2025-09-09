import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

const proxyPort = process.env.PORT || 8080;                 // öffentlicher Railway-Port
const upstream  = "http://127.0.0.1:8081";                  // interner MCP (läuft auf 8081)
const proxyKey  = (process.env.PROXY_KEY || "").trim();     // externer Zugriffsschlüssel
const authToken = (process.env.AUTH_TOKEN || "").trim();    // interner MCP-Auth-Token

const app = express();

// --- Health ---
app.get("/health", (_req, res) => res.status(200).send("ok"));

// --- Auth-Helper: Key aus Query ODER Headern erlauben ---
//  - ?k=<PROXY_KEY>
//  - X-Proxy-Key: <PROXY_KEY>
//  - Authorization: Bearer <PROXY_KEY>   (nur als Zugang für den PROXY!)
const hasProxyKey = (req) => {
  const q  = req.query?.k;
  const xh = req.header("X-Proxy-Key");
  const ah = req.header("authorization"); // kann auch klein geschrieben kommen
  const aBearer = ah?.startsWith("Bearer ") ? ah.slice(7) : null;
  return q === proxyKey || xh === proxyKey || aBearer === proxyKey;
};

// --- Auth-Middleware ---
//  - HEAD/OPTIONS IMMER erlauben (OpenAI preflight)
//  - für alles andere muss der Proxy-Key vorliegen
const authCheck = (req, res, next) => {
  if (req.method === "HEAD" || req.method === "OPTIONS") return next();
  if (hasProxyKey(req)) return next();
  return res.status(401).json({ error: "unauthorized" });
};

// --- Gemeinsame Proxy-Optionen: MCP-Auth injizieren ---
const baseProxyOpts = {
  target: upstream,
  changeOrigin: true,
  logLevel: "debug",
  // Header vorab setzen UND in onProxyReq absichern
  headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
  onProxyReq: (proxyReq, req) => {
    if (authToken) proxyReq.setHeader("Authorization", `Bearer ${authToken}`);
    console.log(`[proxy] → ${req.method} ${req.originalUrl} | injectAuth=${!!authToken} len=${authToken.length}`);
  },
};

// Root "/" -> zwingend "/mcp"
const proxyRootToMcp = createProxyMiddleware({
  ...baseProxyOpts,
  pathRewrite: () => "/mcp",
});

// Alle anderen Pfade unverändert (inkl. /mcp)
const proxyPassthrough = createProxyMiddleware({
  ...baseProxyOpts,
});

// Reihenfolge ist wichtig:
app.all("/", authCheck, proxyRootToMcp);     // echte Root
app.use("/", authCheck, proxyPassthrough);   // alles andere

app.listen(proxyPort, "0.0.0.0", () => {
  console.log(`[proxy] listening on ${proxyPort}, root "/" -> ${upstream}/mcp (preflight allowed)`);
});
