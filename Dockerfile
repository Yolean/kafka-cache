FROM yolean/node-kafka:4c2cb3be0aaf192f28d2c69c76d42cd976e4fdfe-root@sha256:5862e4b9b8bc9ff82d75585790298d974ccc7229877980b7628bec8e0ea5c0b4

RUN set -ex; \
  export DEBIAN_FRONTEND=noninteractive; \
  buildDeps=' \
    git \
    build-essential \
    python \
    libsasl2-dev \
    libssl-dev \
    zlib1g-dev \
    liblz4-dev \
  '; \
  apt-get update && apt-get install -y $buildDeps --no-install-recommends

WORKDIR /usr/local/lib/node_modules/kafka-cache

COPY package.json .

RUN  mkdir node_modules; \
  chown node node_modules; \
  su node -c "npm install"; \
  rm -rf /home/node/.npm; \
  rm -rf /home/node/.node-gyp

COPY . .

RUN ./node_modules/.bin/mocha -t 60000 --exit

FROM yolean/node-kafka:4c2cb3be0aaf192f28d2c69c76d42cd976e4fdfe@sha256:5cda73ff66ed31813a2019fbcd865242d1068bc424bad0c6b3e1c4a81d652d64

COPY --from=0 /usr/local/lib/node_modules/kafka-cache /usr/local/lib/node_modules/kafka-cache

# Legacy
RUN ln -s /usr/local/lib/node_modules/kafka-cache /usr/src/yolean-kafka-cache \
  && ln -s /usr/local/lib/node_modules/kafka-cache /usr/src/kafka-cache
