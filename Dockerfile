FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js ./
COPY api ./api
COPY scripts ./scripts
# só o que o navegador pode ver vai pra public/
COPY index.html app.js styles.css theme.js favicon.svg robots.txt sitemap.xml ./public/
COPY admin ./public/admin
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
