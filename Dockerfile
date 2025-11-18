# Use Puppeteer's official image — Chromium already installed!
FROM ghcr.io/puppeteer/puppeteer:latest

# Create app directory
WORKDIR /app

# Copy package.json and install deps
COPY package*.json ./
RUN npm install

# Copy your source files
COPY . .

# Expose Railway port
EXPOSE 3000

CMD ["node", "index.js"]
