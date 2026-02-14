FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM deps AS builder
WORKDIR /app
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN npm install -g serve@14.2.4
COPY --from=builder /app/dist ./dist

EXPOSE 4173

HEALTHCHECK --interval=15s --timeout=5s --retries=5 CMD node -e "require('node:http').get('http://127.0.0.1:4173/', (res) => process.exit(res.statusCode >= 200 && res.statusCode < 400 ? 0 : 1)).on('error', () => process.exit(1));"

CMD ["serve", "-s", "dist", "-l", "4173"]
