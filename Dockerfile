FROM mcr.microsoft.com/playwright:v1.56.1-jammy

WORKDIR /app

COPY package*.json ./
RUN npm install

# This is what you were missing
RUN npx playwright install chromium

COPY . .

EXPOSE 3001
CMD ["node", "index.js"]

