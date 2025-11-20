FROM mcr.microsoft.com/playwright:v1.56.1-jammy

WORKDIR /app

COPY package*.json ./
RUN npm install

# 👇 cache-busting install (forces fresh browser download)
RUN echo "FORCE PLAYWRIGHT REINSTALL $(date)" && npx playwright install chromium

COPY . .

EXPOSE 3000
CMD ["node", "index.js"]

