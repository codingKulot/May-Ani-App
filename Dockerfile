# May-Ani in a container, for hosting platforms (Fly.io, Railway, Render, a VPS with Docker, ...). Not needed on the owner's PC.
# NOT YET TESTED: Docker is not installed on the PC where this was written (October 2026). Build and run it once before relying on it:
#   docker build -t may-ani .
#   docker run --env-file .env -p 8787:8787 may-ani
# Settings come from the platform's environment variables (the same names as .env.example); the .env file is never copied in.
# Several copies can run side by side on the same MongoDB (see docs/ARCHITECTURE.md).

# ---- build the app (needs the dev tools)
FROM oven/bun:1.4.3-slim AS build
WORKDIR /app
# mongodb-memory-server is only for the tests: do not download a MongoDB program into the image
ENV MONGOMS_DISABLE_POSTINSTALL=1
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# ---- run it (only what the server needs)
FROM oven/bun:1.4.3-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8787 LOG_FORMAT=json
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY server ./server
COPY --from=build /app/dist ./dist
# not root: a break-in through the app cannot change the container
USER bun
EXPOSE 8787
# /api/live: is the process answering? (platforms that use their own checks can call /api/ready, which also checks MongoDB)
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD bun -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8787) + '/api/live').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
# SIGTERM from the platform stops the server cleanly (server/index.mjs)
CMD ["bun", "server/index.mjs"]
