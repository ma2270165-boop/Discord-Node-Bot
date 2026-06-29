FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends fonts-dejavu-core fontconfig \
 && rm -rf /var/lib/apt/lists/* \
 && fc-cache -f

WORKDIR /app

ENV PNPM_HOME=/usr/local/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./

COPY artifacts/discord-bot/package.json ./artifacts/discord-bot/
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/mockup-sandbox/package.json ./artifacts/mockup-sandbox/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY lib/api-spec/package.json ./lib/api-spec/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY lib/db/package.json ./lib/db/
COPY scripts/package.json ./scripts/

RUN pnpm install --no-frozen-lockfile --filter "@workspace/discord-bot..."

COPY artifacts/discord-bot ./artifacts/discord-bot
COPY lib/db ./lib/db

EXPOSE 3000

WORKDIR /app/artifacts/discord-bot

CMD ["pnpm", "run", "start"]
