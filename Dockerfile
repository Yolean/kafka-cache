FROM yolean/node-kafka@sha256:56239ea3390c294614ceee0f5efdb9618decc04f045185d6f8a2e1d17e10faf4

COPY package.json /usr/src/yolean-kafka-cache/package.json

RUN set -ex; \
  export DEBIAN_FRONTEND=noninteractive; \
  runDeps='libssl1.1 libsasl2-2'; \
  buildDeps=' \
    build-essential \
    python \
    libsasl2-dev \
    libssl-dev \
    zlib1g-dev \
    liblz4-dev \
  '; \
  apt-get update && apt-get install -y $runDeps $buildDeps --no-install-recommends; \
  \
  cd /usr/src/yolean-kafka-cache; \
  mkdir node_modules && chown node node_modules; \
  su node -c "npm link"; \
  rm -rf /home/node/.npm; \
  rm -rf /home/node/.node-gyp; \
  \
  apt-get purge -y --auto-remove $buildDeps; \
  rm -rf /var/lib/apt/lists/*; \
  rm -rf /var/log/apt /var/log/dpkg.log /var/log/alternatives.log;

COPY . /usr/src/yolean-kafka-cache
