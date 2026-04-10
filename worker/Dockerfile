FROM node:20-alpine
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

ENV NODE_ENV=production

CMD ["node_modules/.bin/tsx", "index.ts"]
