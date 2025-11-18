# Use Puppeteer’s official image — includes Chromium + all dependencies
FROM ghcr.io/puppeteer/puppeteer:latest

# Switch to root so we can create the app directory
USER root

# Create /app and give permissions to the pptruser (non-root)
RUN mkdir -p /app && chown -R pptruser:pptruser /app

# Switch to non-root user that Puppeteer requires
USER pptruser
WORKDIR /app

# Copy package.json files first (better layer caching)
COPY --chown=pptruser:pptruser package*.json ./

# Install dependencies (no Chromium download needed)
RUN npm install

# Copy the rest of the code
COPY --chown=pptruser:pptruser . .

# Expose the backend port
EXPOSE 3000

# Run the Node server
CMD ["node", "index.js"]
