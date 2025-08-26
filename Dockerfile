FROM node:20-alpine

WORKDIR /app

# Nur was für den Install nötig ist zuerst kopieren
COPY package*.json ./

# Prod-Dependencies installieren
RUN npm ci --omit=dev

# Restlichen Code kopieren
COPY . .

ENV NODE_ENV=production

# Railway stellt PORT bereit; wir exposen nur dokumentarisch
EXPOSE 3000

# Start: HTTP-Transport + Port + Auth-Token + 0.0.0.0 Binding
CMD ["node", "bin/cli.mjs", "--transport", "http", "--port", "${PORT}", "--auth-token", "${AUTH_TOKEN}"]
