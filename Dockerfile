FROM node:20-slim

# Puppeteer dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium fonts-noto-cjk fonts-noto-cjk-extra fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY generate.mjs server.mjs fonts.mjs template.html ./
COPY public/ public/
COPY fonts/ fonts/
COPY test.json ./
COPY scripts/ scripts/

EXPOSE 3000
LABEL name="json2card" description="Turn any JSON into beautiful shareable cards"
CMD ["node", "server.mjs"]
