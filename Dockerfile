FROM mcr.microsoft.com/playwright:v1.56.1-jammy

WORKDIR /app

ENV PLAYWRIGHT_BROWSERS_PATH=0

COPY package*.json ./
RUN npm install

# force browser install to correct internal path
RUN npx playwright install chromium

COPY . .

EXPOSE 3000
CMD ["node", "index.js"]
