FROM mcr.microsoft.com/playwright:v1.56.1-jammy

WORKDIR /app

# 🔥 This line forces cache to reset completely
RUN echo "CACHE BUST $(date)"

COPY package*.json ./
RUN npm install

RUN npx playwright install chromium

COPY . .

EXPOSE 3000
CMD ["node", "index.js"]




