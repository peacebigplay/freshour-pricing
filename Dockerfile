# Freshour pricing — zero-dependency Node server · ข้อมูลเปลี่ยนแปลงเก็บใน data/journal.jsonl (mount volume ที่ /app/data)
FROM node:22-alpine
WORKDIR /app
COPY . .
ENV NODE_ENV=production PORT=8787
EXPOSE 8787
VOLUME ["/app/data"]
HEALTHCHECK --interval=60s --timeout=5s CMD wget -qO- http://127.0.0.1:8787/api/health >/dev/null || exit 1
CMD ["node", "server.js"]
