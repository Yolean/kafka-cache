FROM yolean/node-kafka-cache

COPY --chown=nonroot:nogroup package.json /usr/src/app/package.json

WORKDIR /usr/src/app

RUN npm install --development

COPY . ./test

ENTRYPOINT ["./node_modules/.bin/mocha", "-t", "60000", "--exit"]
