import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

const proxyPort = process.env.PORT || 8080;
const upstream  = "http://127.0.0.1:8081";
const proxyKey  = process.env.PROXY_KEY;
const authToken = process.env.AUTH_TOKEN;

const app = express();

// Healthcheck
app.get("/health", (_req, res) => res.status(200).send("ok"));

// Auth check
app.use((req, res, next) => {
  const keyFromQuery  = req.query.k;
  const keyFromHeader = req.header("X-Proxy-Key");
  if (keyFromQuery === proxyKey || keyFromHeader === proxyKey) {
    return next();
  }
  return res.status(401).json({ error: "unauthorized" });
});

// Proxy root "/" nach "/mcp" umschreiben
app.use(
  "/",
  createProxyMiddleware({
    target: upstream,
    changeOrigin: true,
    pathRewrite: { "^/$": "/mcp" },   // Regex: NUR echte Root → /mcp
    logLevel: "debug",
    onProxyReq: (proxyReq) => {
      if (authToken) {
        proxyReq.setHeader("Authorization", `Bearer ${authToken}`);
      }
    },
  })
);

app.listen(proxyPort, "0.0.0.0", () => {
  console.log(`[proxy] listening on ${proxyPort}, forwarding root "/" to ${upstream}/mcp`);
});
