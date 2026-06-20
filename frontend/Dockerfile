# node 22 (LTS): vite 8 requires Node >=20.19 / >=22.12 — node:18 crashes
# with "CustomEvent is not defined" / adapter-node ESM resolution errors.
FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

RUN chown -R node:node /app
USER node

EXPOSE 5173

CMD ["npm", "run", "dev"]
