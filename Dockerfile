FROM node:20-alpine

RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    font-noto-emoji

RUN apk add --no-cache \
    msttcorefonts-installer \
    fontconfig \
    && update-ms-fonts \
    && fc-cache -f

WORKDIR /app

COPY package*.json ./
COPY package-lock.json ./

RUN npm ci

RUN npx playwright install chromium

COPY . .

RUN npm run prisma:generate

RUN npm run build

RUN mkdir -p /app/data /app/logs

ENV NODE_ENV=production
ENV PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PORT=3000
ENV HOST=0.0.0.0
ENV TZ=UTC

EXPOSE 3000

# Copy startup script that runs prisma generate + migrate deploy before starting the app.
# NOTE: prisma migrate deploy MUST run at startup (not during build) because it needs
# a running database. The database is only available at runtime via docker-compose.
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

CMD ["/app/docker-entrypoint.sh"]
