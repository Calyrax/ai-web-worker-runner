FROM mcr.microsoft.com/playwright:v1.56.1-jammy

WORKDIR /app

COPY package*.json ./
RUN npm install

# Force Chromium install inside the container
RUN npx playwright install chromium

COPY . .

EXPOSE 3000
CMD ["node", "index.js"]

