FROM node:18-bullseye

WORKDIR /app

RUN apt-get update && apt-get install -y \
  chromium \
  ca-certificates \
  fonts-liberation \
  libatk-bridge2.0-0 \
  libnss3 \
  libxcomposite1 \
  libxdamage1 \
  libxrandr2 \
  libasound2 \
  libcups2 \
  libxshmfence1 \
  --no-install-recommends

COPY package*.json ./
RUN npm install

COPY . .

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

EXPOSE 3000
CMD ["node", "index.js"]

