FROM node:20-alpine

WORKDIR /app

# 1) Nur Package-Files für schnelle Layer
COPY package*.json ./

# 2) Voll installieren (inkl. Dev) -> wir bauen gleich
#    (falls npm ci bei dir zickt, ersetze die Zeile durch: RUN npm install)
RUN npm ci

# 3) Restlichen Code kopieren
COPY . .

# 4) Build ausführen (erzeugt u. a. bin/cli.mjs)
RUN npm run build

# 5) Dev-Dependencies entfernen -> kleineres Image
RUN npm prune --omit=dev

ENV NODE_ENV=production

# Dokumentarisch
EXPOSE 3000

# 6) Start: HTTP-Transport + korrekter Port + Auth + 0.0.0.0 Binding
CMD node bin/cli.mjs --transport http --port $PORT --auth-token $AUTH_TOKEN --host 0.0.0.0
