Classification: INTERNAL

# Sample 4 — CRUD User + Login (Node.js, MySQL, Docker)

API sederhana untuk CRUD user dan autentikasi login, dibungkus Docker Compose.

Fitur:

- Register, login, refresh token (rotasi), logout.
- Profil sendiri: lihat, ubah nama/email, ganti password.
- CRUD user khusus role `admin` (pagination, search, filter, sort).
- JWT access token 15 menit + refresh token 7 hari (disimpan sebagai SHA-256).
- Validasi input (Zod), error envelope konsisten, rate limit login.

## Quick Start (Docker)

```bash
cp .env.example .env      # ganti password/secret bila perlu
docker compose up --build
```

API berjalan di `http://localhost:3000/api/v1`. Schema database dibuat otomatis dari
`db/schema.sql`, lalu admin di-seed otomatis saat container API start.

Kredensial demo (dari `.env`):

```text
email    : admin@example.com
password : Admin#12345
```

Cek kesehatan:

```bash
curl -s localhost:3000/api/v1/health
```

Jalankan smoke test end-to-end dari host:

```bash
npm install   # sekali saja
npm run smoke
```

## Endpoint

| Method | Path | Akses | Deskripsi |
|---|---|---|---|
| POST | `/api/v1/auth/register` | publik | Daftar akun (role `user`) |
| POST | `/api/v1/auth/login` | publik | Login, dapat access + refresh token |
| POST | `/api/v1/auth/refresh` | publik | Tukar refresh token (rotasi) |
| POST | `/api/v1/auth/logout` | publik | Revoke refresh token |
| GET | `/api/v1/auth/me` | login | Profil sendiri |
| PATCH | `/api/v1/auth/me` | login | Ubah nama/email sendiri |
| PUT | `/api/v1/auth/me/password` | login | Ganti password (revoke semua sesi) |
| GET | `/api/v1/users` | admin | List user |
| GET | `/api/v1/users/:id` | admin | Detail user |
| POST | `/api/v1/users` | admin | Buat user |
| PATCH | `/api/v1/users/:id` | admin | Update user |
| DELETE | `/api/v1/users/:id` | admin | Hapus user |
| GET | `/api/v1/health` | publik | Status API + database |

Query list user: `page`, `limit` (maks 100), `search`, `role`, `isActive`, `sort`, `order`.

## Contoh Cepat

```bash
# login admin -> ambil access token
ACCESS=$(curl -s -X POST localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"Admin#12345"}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.accessToken')

# list user
curl -s 'localhost:3000/api/v1/users?page=1&limit=10' \
  -H "Authorization: Bearer $ACCESS"

# buat user
curl -s -X POST localhost:3000/api/v1/users \
  -H "Authorization: Bearer $ACCESS" -H 'Content-Type: application/json' \
  -d '{"name":"Siti","email":"siti@example.com","password":"Rahasia123"}'

# update
curl -s -X PATCH localhost:3000/api/v1/users/2 \
  -H "Authorization: Bearer $ACCESS" -H 'Content-Type: application/json' \
  -d '{"name":"Siti Aminah"}'

# delete
curl -i -X DELETE localhost:3000/api/v1/users/2 \
  -H "Authorization: Bearer $ACCESS"
```

Format sukses: `{ "data": ... }` (list menambahkan `meta`).
Format error: `{ "error": { "code", "message", "details?" } }`.

## Development Lokal (tanpa container API)

```bash
cp .env.example .env      # DB_HOST=127.0.0.1, DB_PORT=3307
docker compose up -d db   # schema otomatis pada volume baru
npm install
npm run db:seed
npm run dev               # http://localhost:3000
```

Catatan:

- `npm run db:init` menjalankan ulang `db/schema.sql` (butuh user DB dengan izin membuat database).
- Login/register dibatasi 5 request/menit/IP; global 100 request/menit/IP.
- Semua tanggal disimpan/ ditampilkan dalam UTC (ISO 8601).

## Test

```bash
npm test    # unit test (password, JWT, validasi) — tidak butuh database
npm run smoke   # end-to-end, butuh API + DB berjalan
```

## Perintah Docker Berguna

```bash
docker compose logs -f api
docker compose exec db mysql -uapp -p crud_app
docker compose down        # container berhenti, data tetap
docker compose down -v     # hapus volume -> database & data hilang
```

## Struktur

```text
src/
├── app.js, server.js
├── config/        env + connection pool MySQL
├── routes/        definisi endpoint
├── controllers/   HTTP request/response
├── services/      business logic + query SQL
├── middlewares/   auth, role, validasi, rate limit, error handler
├── validators/    schema Zod
└── utils/         JWT, bcrypt, ApiError, serializer
db/
├── schema.sql     DDL users + refresh_tokens
├── init.js        buat database + apply schema
└── seed.js        admin awal
```

## Keamanan

- Password bcrypt (rounds 10), tidak pernah dikembalikan di response.
- Refresh token acak 48 byte; database hanya menyimpan hash SHA-256.
- Rotasi refresh token + deteksi reuse (semua sesi user dicabut).
- User nonaktif langsung ditolak karena status dicek di setiap request.
- Query parameterized; sort/order memakai whitelist.
- Ganti `JWT_SECRET` dan password default sebelum dipakai di luar demo.
