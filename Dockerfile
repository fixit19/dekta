FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY public ./public
COPY scripts/build.mjs ./scripts/build.mjs
COPY server ./server
RUN npm run build
USER node
ENV NODE_ENV=staging HOST=0.0.0.0 PORT=4180
EXPOSE 4180
CMD ["node", "server/start.mjs"]
