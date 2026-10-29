# May-Ani in a container, for hosting platforms (Fly.io, Railway, Render, a VPS with Docker, ...) and for trying it on the PC.
# Built and run with Docker Desktop on the owner's PC on 29 October 2026. Easiest way to run it: docker compose (see compose.yaml).
#   docker build -t may-ani .
#   docker compose up                (uses .env, the same as "bun run start")
# Settings come from the platform's environment variables (the same names as .env.example); the .env file is never copied in.
# Careful with "docker run --env-file .env": it keeps quotes, so MONGODB_URI="mongodb+srv://..." arrives with the quotes and
# MongoDB refuses it. docker compose reads the quotes correctly.
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
# React and the icons are already inside dist/; the server only loads mongodb, nodemailer and unpdf (85 MB less)
RUN bun install --frozen-lockfile --production \
  && rm -rf node_modules/react node_modules/react-dom node_modules/react-icons node_modules/scheduler /root/.bun/install/cache
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
