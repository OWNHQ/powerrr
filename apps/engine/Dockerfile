FROM node:22-bookworm-slim AS runtime
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4000
RUN corepack enable
WORKDIR /workspace
COPY --chown=node:node . .
RUN pnpm install --frozen-lockfile --prod=false
USER node
EXPOSE 4000
CMD ["pnpm", "--filter", "@powerrr/engine", "start"]
