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

COPY lib/db ./lib/db

RUN pnpm install --no-frozen-lockfile --filter "@workspace/discord-bot..."

# Remove pnpm's workspace symlink for @workspace/db and replace with a real
# copy of the source so tsx can find .ts files without following symlinks.
RUN rm -rf /app/artifacts/discord-bot/node_modules/@workspace/db \
 && mkdir -p /app/artifacts/discord-bot/node_modules/@workspace \
 && cp -r /app/lib/db /app/artifacts/discord-bot/node_modules/@workspace/db \
 && rm -rf /app/node_modules/@workspace/db \
 && mkdir -p /app/node_modules/@workspace \
 && cp -r /app/lib/db /app/node_modules/@workspace/db

COPY artifacts/discord-bot ./artifacts/discord-bot

EXPOSE 3000

CMD ["pnpm", "--filter", "@workspace/discord-bot", "run", "start"]
