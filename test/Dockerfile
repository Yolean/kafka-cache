FROM yolean/node as build

RUN apt-get update && \
  apt-get install make g++ python libsasl2-2 libsasl2-dev libssl-dev zlib1g-dev --no-install-recommends -y

WORKDIR /kafka-cache

COPY package.json .

RUN npm install

COPY . .

ENTRYPOINT ["./node_modules/.bin/mocha", "-t", "60000", "--exit"]