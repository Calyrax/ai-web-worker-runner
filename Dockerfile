FROM mcr.microsoft.com/playwright:v1.56.1-jammy

WORKDIR /app

COPY package*.json ./
RUN npm install

# ✅ Force Playwright to use bundled browsers
ENV PLAYWRIGHT_BROWSERS_PATH=0

COPY . .

EXPOSE 3000
CMD ["node", "index.js"]
