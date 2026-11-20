Classification: INTERNAL

# Sample 1 - Hello World

```bash
docker build -f Dockerfile.nocache -t hello:nocache .
docker build -f Dockerfile.cache   -t hello:cache .
docker run --rm -p 3000:3000 hello:cache
curl localhost:3000        # Hello World
```

## Demo cache
1. Build kedua image (pertama kali sama-sama lambat).
2. Edit `index.js` (ubah teks), build ulang keduanya.
   - `nocache`: `npm install` jalan lagi (lambat).
   - `cache`: `npm install` => `CACHED` (cepat).
3. Paksa tanpa cache: `docker build --no-cache -f Dockerfile.cache -t hello:cache .`
