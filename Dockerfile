FROM yolean/node-kafka@sha256:3f15521b09217b23104d62d4bbc4e187adb8f2156905d9b772f1d7d19381973b

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
