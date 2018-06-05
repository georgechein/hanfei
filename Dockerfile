# escape=\
FROM node:8.11-alpine
LABEL maintainer="kevin6535.lin@etatung.com"
RUN apk add --update \
    python \
    python-dev \
    py-pip \
    build-base \
  && pip install virtualenv \
  && rm -rf /var/cache/apk/*

RUN mkdir /opt/hanfei
COPY ./hanfei/. /opt/hanfei/.
RUN rm -rf /opt/hanfei/dist && rm -rf /opt/hanfei/logs 
RUN cd /opt/hanfei && npm install

RUN mkdir /opt/hanfei/logs
RUN mkdir /opt/hanfei/dist

WORKDIR /opt/hanfei
EXPOSE 80 443 3978

ENTRYPOINT ["npm","start"]
