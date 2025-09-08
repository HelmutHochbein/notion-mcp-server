// proxy.js
import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

const proxyPort = process.env.PORT || 8080;        // Öffentlicher Railway-Port
const upstream   = process.env.INTERNAL_TARGET || "http://127.0.0.1:8081"; // MCP-Server intern

const app = express();

// Alles was an "/" reinkommt, wird intern nach "/mcp" weitergeleitet
app.use(
  "/",
  createProxyMiddleware({
    target: upstream,
    changeOrigin: true,
    // Root-Aufrufe und sonstige Pfade landen auf /mcp
    pathRewrite: (path) => {
      // Beispiele:
      // "/" -> "/mcp"
      // "/health" -> "/mcp" (du kannst hier Ausnahmen bauen, wenn du willst)
      return "/mcp";
    },
    logLevel: "warn",
    // Sicherheits-Header/Authorization werden durchgereicht
    onProxyReq: (proxyReq, req) => {
      // Nichts nötig: Standard leitet Headers inkl. Authorization weiter
    },
  })
);

app.listen(proxyPort, "0.0.0.0", () => {
  console.log(`[proxy] listening on ${proxyPort}, forwarding to ${upstream}/mcp`);
});
