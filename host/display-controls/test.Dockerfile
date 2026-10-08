FROM node:24-bookworm-slim@sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553
RUN apt-get update && apt-get install -y --no-install-recommends python3 systemd && rm -rf /var/lib/apt/lists/*
WORKDIR /work
COPY host/display-controls ./host/display-controls
COPY src/device-power.js src/screen-control.js ./src/
COPY package.json ./package.json
CMD ["sh", "host/display-controls/test-install.sh"]
