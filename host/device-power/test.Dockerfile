FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 systemd && rm -rf /var/lib/apt/lists/*
WORKDIR /work
COPY host/device-power ./host/device-power
COPY src/device-power.js ./src/device-power.js
COPY package.json ./package.json
CMD ["sh", "host/device-power/test-install.sh"]
