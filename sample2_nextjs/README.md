Classification: INTERNAL

# Sample 2 - Next.js + multi-stage Dockerfile

```bash
docker build -t hello-next .
docker run --rm -p 3000:3000 hello-next
curl localhost:3000
docker images hello-next     # bandingkan ukuran dengan single-stage
```

Poin ajar: 3 stage (deps -> build -> runner), `output: 'standalone'`, `USER node` (non-root).
