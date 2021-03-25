FROM node:14

ENV DEBIAN_FRONTEND noninteractive
RUN apt-get update && apt-get -y upgrade && apt-get install -y ffmpeg

WORKDIR /var/www/app/
COPY ./ ./

RUN mkdir -p /nonexistent
RUN mkdir -p /content /output
RUN chown -R nobody:nogroup /var/www/app/ /nonexistent/ /output /content

USER nobody
RUN yarn install && yarn build-prod
CMD ["yarn", "start"]
