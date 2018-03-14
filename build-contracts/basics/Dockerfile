FROM yolean/node-kafka-cache

WORKDIR /usr/src/app

COPY package.json .

RUN npm install --development

COPY . ./test

ENTRYPOINT ["./node_modules/.bin/mocha", "-t", "60000", "--exit"]
