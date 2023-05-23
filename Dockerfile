FROM denoland/deno:latest

WORKDIR app

COPY jwks.json jwks.json
COPY cognito.js cognito.js

RUN deno cache cognito.js

RUN touch main.sqlite
ENV DENO_STORAGE_AREA__DEFAULT_URL sqlite://main.sqlite

CMD deno run -A cognito.js
