FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY server.js ./

RUN addgroup -S nodeapp \
    && adduser -S nodeapp -G nodeapp \
    && mkdir -p /app/data \
    && chown -R nodeapp:nodeapp /app

USER nodeapp

EXPOSE 3000

CMD ["npm", "start"]
