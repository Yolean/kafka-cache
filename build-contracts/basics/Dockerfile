FROM yolean/node-kafka@sha256:3acd64fcc616872ece886d115a0514f23f0a3ee98238d2ac0f9043abbc6cea37 as build

RUN apt-get update && \
  apt-get install make g++ python libsasl2-2 libsasl2-dev libssl-dev zlib1g-dev --no-install-recommends git -y

WORKDIR /kafka-cache

COPY package.json .

RUN npm install

COPY . .


FROM yolean/node-kafka@sha256:3acd64fcc616872ece886d115a0514f23f0a3ee98238d2ac0f9043abbc6cea37

# Without this I'm unable to get things running due to missing
# c libs like libssl.so.1.1
RUN apt-get update && \
  apt-get install libsasl2-2 libsasl2-dev libssl-dev zlib1g-dev --no-install-recommends git -y

WORKDIR /usr/src/app

COPY ./build-contracts/basics/package.json ./package.json

RUN npm install

COPY --from=build /kafka-cache /kafka-cache

COPY build-contracts/basics/ ./test

ENTRYPOINT ["./node_modules/.bin/mocha", "-t", "60000", "--exit"]