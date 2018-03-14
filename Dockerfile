FROM yolean/node-kafka@sha256:3acd64fcc616872ece886d115a0514f23f0a3ee98238d2ac0f9043abbc6cea37

COPY . /usr/src/yolean-kafka-cache

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
    git \
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
