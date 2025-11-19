# -----------------------------
# Node base image
# -----------------------------
FROM node:18-slim

# Install system dependencies required for Chrome
RUN apt-get update && apt-get install -y \
    wget gnupg ca-certificates \
    fonts-liberation \
    libatk-bridge2.0-0 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libasound2 \
    libpango-1.0-0 \
    libcups2 \
    libxshmfence1 \
    --no-install-recommends

# Add Google Chrome repo key
RUN wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | apt-key add -

# Add Google Chrome repo
RUN echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" \
    | tee /etc/apt/sources.list.d/google-chrome.list

# Install Google Chrome Stable
RUN apt-get update && apt-get install -y google-chrome-stable

# App directory
WORKDIR /app

# Copy package files first
COPY package*.json ./

# Install NPM packages
RUN npm install

# Copy everything else
COPY . .

# Tell Puppeteer where Chrome is
ENV PUPPETEER_EXECUTABLE_PATH="/usr/bin/google-chrome-stable"

# Expose runner port
EXPOSE 3000

# Start the server
CMD ["node", "index.js"]

