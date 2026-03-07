FROM node:22 AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build



ENV NODE_ENV=production
WORKDIR /app/dist
CMD ["node", "index.js"]