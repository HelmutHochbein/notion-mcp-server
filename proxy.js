import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

const proxyPort = process.env.PORT || 8080;                   // öffentlicher Railway-Port
const upstream  = process.env.INTERNAL_TARGET || "http://127.0.0.1:8081"; // MCP-Server intern

const app = express();

// Health (optional, hilfreich für schnelle Checks)
app.get("/health", (_req, res) => res.status(200).send("ok"));

// >>> nur Root "/" auf "/mcp" rewriten, sonst Pfad unverändert weiterreichen
app.use(
  "/",
  createProxyMiddleware({
    target: upstream,
    changeOrigin: true,
    pathRewrite: (path /*, req*/) => {
      if (path === "/" || path === "") return "/mcp"; // NUR Root -> /mcp
      return path;                                    // alles andere unverändert
    },
    logLevel: "warn",
  })
);

app.listen(proxyPort, "0.0.0.0", () => {
  console.log(`[proxy] listening on ${proxyPort}, forwarding to ${upstream}`);
});
