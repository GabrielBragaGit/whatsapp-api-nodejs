# FROM node:14.18.2-alpine as builder
FROM node:16.20.0-alpine as builder

USER root
RUN apk add git
RUN apk update && \
    apk add --no-cache tzdata

USER node
WORKDIR /src/app

COPY package*.json ./

RUN npm ci
COPY --chown=node:node . .
RUN npm prune --production

FROM node:16.20.0-alpine

WORKDIR /src/app

COPY --from=builder /src/app/package*.json ./
COPY --from=builder /src/app/node_modules/ ./node_modules/
COPY --from=builder /src/app/ ./

CMD ["npm", "run", "start"]

#docker build . --tag dregistry.pljeng.com.br/contact-plus-api:newdev2 --no-cache && docker push dregistry.pljeng.com.br/contact-plus-api:newdev2