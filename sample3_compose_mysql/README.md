Classification: INTERNAL

# Sample 3 - Docker Compose: Node.js + MySQL + Redis

```bash
cp .env.example .env        # lalu ganti password
docker compose up --build
curl localhost:3000         # total naik tiap request (MySQL)

# rate limit (Redis): 1 request / 2 detik per IP
curl -i localhost:3000/limited; curl -i localhost:3000/limited   # 200 lalu 429 + Retry-After
sleep 2; curl -i localhost:3000/limited                          # 200 lagi

docker compose down         # data tetap (volume)
docker compose down -v      # hapus volume -> data hilang
```

Poin ajar: service name sebagai hostname, volume, healthcheck + depends_on, env lewat .env.
