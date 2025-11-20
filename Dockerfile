FROM mcr.microsoft.com/playwright:v1.56.1-jammy

WORKDIR /app

COPY package*.json ./
RUN npm install

# ✅ Force download of Chromium binary Playwright expects
RUN npx playwright install --with-deps chromium

COPY . .

ENV PLAYWRIGHT_BROWSERS_PATH=0

EXPOSE 3000
CMD ["node", "index.js"]
