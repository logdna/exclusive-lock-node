FROM node:24 AS base

USER root
RUN mkdir -p /opt/app/coverage
RUN chown -R 1000:1000 /opt/app
WORKDIR /opt/app
USER 1000
VOLUME /opt/app/coverage

COPY --chown=1000:1000 ./package.json /opt/app/

RUN npm install

COPY --chown=1000:1000 . /opt/app
