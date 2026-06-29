FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends fonts-dejavu-core fontconfig \
 && rm -rf /var/lib/apt/lists/* \
 && fc-cache -f

WORKDIR /app

ENV PNPM_HOME=/usr/local/pnpm
ENV PATH=$PNPM_HOME:$PATH

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

# Install all deps (including devDeps for esbuild) before setting NODE_ENV.
RUN pnpm install --frozen-lockfile --filter "@workspace/discord-bot..."

# Copy source after install so package.json changes don't bust the install cache.
COPY lib/db ./lib/db
COPY artifacts/discord-bot ./artifacts/discord-bot

# Build: esbuild bundles src/index.ts and inlines @workspace/db so the final
# dist/index.mjs has zero workspace symlink dependencies at runtime.
# tsx is never invoked at runtime — no more ERR_MODULE_NOT_FOUND.
RUN pnpm --filter @workspace/discord-bot run build

ENV NODE_ENV=production

EXPOSE 3000

CMD ["pnpm", "--filter", "@workspace/discord-bot", "run", "start"]
