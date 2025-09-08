FROM node:20-alpine

WORKDIR /app

# 1) Nur Package-Dateien zuerst kopieren (bessere Layer-Caches)
COPY package*.json ./

# 2) Install (robust, falls kein lockfile vorhanden)
RUN npm install

# 3) Restlichen Code
COPY . .

# 4) Build (erzeugt u.a. bin/cli.mjs)
RUN npm run build

# 5) Prod schlank machen
RUN npm prune --omit=dev

ENV NODE_ENV=production

# Dokumentarisch
EXPOSE 8080

# 6) Start: MCP-Server auf 8081; Proxy auf $PORT (Railway setzt $PORT)
#    Ein Prozess startet den MCP-Server, danach der Proxy.
CMD sh -c "\
  node bin/cli.mjs --transport http --port 8081 --auth-token $AUTH_TOKEN --host 0.0.0.0 & \
  node proxy.js \
"
