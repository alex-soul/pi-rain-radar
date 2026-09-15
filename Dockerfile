FROM node:24-bookworm-slim@sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553
WORKDIR /app
LABEL org.opencontainers.image.source="https://github.com/alex-soul/pi-rain-radar"
LABEL org.opencontainers.image.licenses="MIT"
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY public ./public
COPY assets ./assets
COPY LICENSE THIRD_PARTY_NOTICES.md ./
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
