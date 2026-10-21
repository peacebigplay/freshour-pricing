# Freshour pricing — zero-dependency Node server · ของที่เปลี่ยนได้ (journal/บัญชี/session/inbox) อยู่ใน data/var — mount volume ที่ /app/data/var (ไม่ทับ fixtures)
FROM node:22-alpine
WORKDIR /app
COPY . .
ENV NODE_ENV=production PORT=8787
EXPOSE 8787
VOLUME ["/app/data/var"]
HEALTHCHECK --interval=60s --timeout=5s CMD wget -qO- http://127.0.0.1:8787/healthz >/dev/null || exit 1
CMD ["node", "server.js"]
