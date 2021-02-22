FROM node:14

WORKDIR /var/www/app/

COPY ./package.* ./yarn.* /var/www/app/

RUN yarn install

COPY ./ ./

RUN yarn build-prod

CMD ["yarn", "start"]

