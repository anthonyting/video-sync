FROM node:14
RUN apt-get -y update
RUN apt-get -y upgrade
RUN apt-get install -y ffmpeg

WORKDIR /var/www/app/

COPY ./package.* ./yarn.* /var/www/app/

RUN yarn install

COPY ./ ./

RUN yarn build-prod

CMD ["yarn", "start"]

