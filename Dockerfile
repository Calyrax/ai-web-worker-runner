# Use Puppeteer's official image — Chromium already included
FROM ghcr.io/puppeteer/puppeteer:latest

# Create app directory as root
USER root
RUN mkdir -p /app && chown -R pptruser:pptruser /app

# Switch to Puppeteer's non-root user
USER pptruser
WORKDIR /app

# Copy package files first
COPY --chown=pptruser:pptruser package*.json ./

# Install dependencies
RUN npm install

# Copy all source code
COPY --chown=pptruser:pptruser . .

# Expose port
EXPOSE 3000

# Start the server
CMD ["node", "index.js"]
