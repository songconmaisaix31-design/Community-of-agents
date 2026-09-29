FROM node:24-alpine@sha256:50c8e8ca1d27439048670df5883f32d57cf81cff6233222c893fd0d9884cbd81 AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Explicit one-shot maintenance image; never an application startup dependency.
FROM dependencies AS migration
ENV NODE_ENV=production
COPY migrations ./migrations
COPY scripts/migrate.mjs scripts/migration-policy.mjs ./scripts/
USER node
CMD ["node", "scripts/migrate.mjs"]

FROM node:24-alpine@sha256:50c8e8ca1d27439048670df5883f32d57cf81cff6233222c893fd0d9884cbd81 AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
# Builds the same client and Next/Crier service; no migration or runtime secrets.
RUN npm run build

FROM node:24-alpine@sha256:50c8e8ca1d27439048670df5883f32d57cf81cff6233222c893fd0d9884cbd81 AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S -g 1001 gongzhi && adduser -S -u 1001 -G gongzhi gongzhi
COPY --from=builder --chown=gongzhi:gongzhi /app/.next/standalone ./
COPY --from=builder --chown=gongzhi:gongzhi /app/.next/static ./.next/static
COPY --from=builder --chown=gongzhi:gongzhi /app/public ./public
COPY --from=builder --chown=gongzhi:gongzhi /app/LICENSE-Crier ./LICENSE-Crier
USER gongzhi
EXPOSE 3000
# Process liveness only. Real Auth/DB acceptance is a separate explicit check.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/gongzhi/config').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
