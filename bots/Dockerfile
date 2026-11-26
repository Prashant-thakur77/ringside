# Bots (lobby, spectators, courtsider, relay, matchmaker). Needs the WASM node build
# (./scripts/build-wasm.sh) and ml/ppo/out/policy.onnx in the build context; keys are mounted.
FROM node:24.10-bookworm
RUN corepack enable && corepack prepare pnpm@10.12.1 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/client ./packages/client
COPY bots ./bots
COPY scripts/package.json ./scripts/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN pnpm install --frozen-lockfile --filter @ringside/bots... --filter @ringside/client
COPY crates/ringside-wasm/pkg/node ./crates/ringside-wasm/pkg/node
COPY ml/ppo/out/policy.onnx ml/ppo/out/policy.onnx.data ./ml/ppo/out/
ENV RINGSIDE_ENV=devnet
CMD ["npx", "tsx", "bots/lobby.ts"]
