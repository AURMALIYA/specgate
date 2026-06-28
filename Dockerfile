# SpecGate API + dashboard.
FROM node:20-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json tsconfig.json ./
COPY packages ./packages
COPY apps ./apps
COPY config ./config
RUN pnpm install --frozen-lockfile && pnpm build

FROM node:20-slim AS runtime
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 8787
# Persist the audit log + RBAC config to a mounted volume.
ENV SPECGATE_DATA_DIR=/data
VOLUME ["/data"]
CMD ["node", "apps/api/dist/main.js"]
