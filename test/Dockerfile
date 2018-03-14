FROM yolean/node-kafka@sha256:3acd64fcc616872ece886d115a0514f23f0a3ee98238d2ac0f9043abbc6cea37

RUN apt-get update && \
  apt-get install make g++ python libsasl2-2 libsasl2-dev libssl-dev zlib1g-dev git --no-install-recommends -y

WORKDIR /kafka-cache

COPY package.json .

RUN npm install

COPY . .

ENTRYPOINT ["./node_modules/.bin/mocha", "-t", "60000", "--exit"]