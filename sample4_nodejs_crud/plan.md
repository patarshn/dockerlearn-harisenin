# Plan — Sample 4: Aplikasi CRUD User + Login (Node.js)

Status: draft rencana (belum implementasi)
Stack acuan: Node.js 20 + Express 4 + MySQL 8 + Docker (goal berikutnya)

---

## 1. Ringkasan & Scope

Aplikasi API sederhana untuk mengelola akun user sekaligus autentikasi login.

**In scope:**

- CRUD user (list, detail, create, update, delete) khusus role `admin`.
- Register, login, refresh token, logout.
- Profil sendiri (lihat, ubah nama/email, ganti password).
- Otorisasi berbasis role (`admin`, `user`).
- Validasi input, format error konsisten, rate limit login.

**Out of scope (untuk menjaga sample tetap sederhana):**

- Reset password via email / verifikasi email.
- Multi-tenant, permission granular, audit log.
- UI frontend (fokus ke API; bisa dites dengan curl/Postman).
- Soft delete (dibahas sebagai opsi pengembangan).

**Asumsi:**

- Password di-hash dengan bcrypt (`bcryptjs`, agar tidak perlu build native di Alpine).
- Access token JWT berumur pendek (15 menit) + refresh token opaque yang disimpan di database (7 hari).
- Semua response JSON, field API memakai `camelCase`, kolom database `snake_case`.

---

## 2. Stack & Dependensi

| Kebutuhan | Pilihan |
|---|---|
| Runtime | Node.js 20 (Alpine) |
| Framework | Express 4 |
| Database | MySQL 8 |
| Driver | `mysql2` (connection pool, prepared statement) |
| Password hash | `bcryptjs` |
| Token | `jsonwebtoken` |
| Validasi | `zod` |
| Rate limit | `express-rate-limit` |
| Lain-lain | `dotenv`, `cors`, `helmet`, `morgan` |
| Dev/test | `nodemon`, `jest`, `supertest` |

```json
{
  "dependencies": {
    "express": "^4",
    "mysql2": "^3",
    "bcryptjs": "^2",
    "jsonwebtoken": "^9",
    "zod": "^3",
    "express-rate-limit": "^7",
    "dotenv": "^16",
    "cors": "^2",
    "helmet": "^7",
    "morgan": "^1"
  },
  "devDependencies": {
    "nodemon": "^3",
    "jest": "^29",
    "supertest": "^7"
  }
}
```

---

## 3. Arsitektur & Struktur Folder

Alur request: `route → middleware (auth/role/validate) → controller → service (business + SQL) → MySQL`.

```text
sample4_nodejs_crud/
├── plan.md
├── package.json
├── .env.example
├── Dockerfile                 # goal berikutnya
├── docker-compose.yml         # goal berikutnya
├── db/
│   ├── schema.sql             # DDL + seed opsional
│   └── seed.js                # buat admin awal (bcrypt)
├── src/
│   ├── server.js              # start HTTP server
│   ├── app.js                 # express app + middleware global
│   ├── config/
│   │   ├── env.js             # baca & validasi env
│   │   └── db.js              # mysql2 pool
│   ├── routes/
│   │   ├── index.js
│   │   ├── auth.routes.js
│   │   └── user.routes.js
│   ├── controllers/
│   │   ├── auth.controller.js
│   │   └── user.controller.js
│   ├── services/
│   │   ├── auth.service.js
│   │   └── user.service.js
│   ├── middlewares/
│   │   ├── auth.js            # verifikasi JWT
│   │   ├── requireRole.js     # guard admin
│   │   ├── validate.js        # jalankan zod schema
│   │   ├── notFound.js
│   │   └── errorHandler.js
│   ├── validators/
│   │   ├── auth.validator.js
│   │   └── user.validator.js
│   └── utils/
│       ├── ApiError.js
│       ├── asyncHandler.js
│       ├── jwt.js
│       └── password.js
└── tests/
    ├── auth.test.js
    └── users.test.js
```

---

## 4. Desain Database

Database: `crud_app` (MySQL 8, InnoDB, `utf8mb4`).

### 4.1 ERD

```text
┌──────────────────────────┐
│ users                    │
├──────────────────────────┤
│ id           PK          │
│ name                     │
│ email        UNIQUE      │
│ password_hash            │
│ role         admin|user  │
│ is_active    bool        │
│ last_login_at            │
│ created_at               │
│ updated_at               │
└────────────┬─────────────┘
             │ 1
             │
             │ *
┌────────────▼─────────────┐
│ refresh_tokens           │
├──────────────────────────┤
│ id           PK          │
│ user_id      FK → users  │
│ token_hash   UNIQUE      │
│ user_agent               │
│ ip_address              │
│ expires_at               │
│ revoked_at              │
│ created_at               │
└──────────────────────────┘
```

Satu user bisa punya banyak sesi (device/browser) aktif. Logout menghapus/revoke satu refresh token; ganti password me-revoke semua.

### 4.2 DDL — `users`

```sql
CREATE DATABASE IF NOT EXISTS crud_app
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE crud_app;

CREATE TABLE users (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name          VARCHAR(100)    NOT NULL,
  email         VARCHAR(255)    NOT NULL,
  password_hash VARCHAR(255)    NOT NULL,
  role          ENUM('admin','user') NOT NULL DEFAULT 'user',
  is_active     TINYINT(1)      NOT NULL DEFAULT 1,
  last_login_at DATETIME        NULL,
  created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role (role),
  KEY idx_users_is_active (is_active)
) ENGINE=InnoDB;
```

Catatan:

- `utf8mb4_0900_ai_ci` membuat UNIQUE email bersifat case-insensitive. Aplikasi tetap menormalkan email ke lowercase + trim sebelum insert/query.
- `password_hash` menyimpan hasil bcrypt (60 karakter), disiapkan 255 untuk fleksibilitas.
- `is_active = 0` dipakai untuk menonaktifkan user tanpa menghapus data (login ditolak, token lama tidak bisa dipakai karena dicek per request).

### 4.3 DDL — `refresh_tokens`

```sql
CREATE TABLE refresh_tokens (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64)        NOT NULL,
  user_agent VARCHAR(255)    NULL,
  ip_address VARCHAR(45)     NULL,
  expires_at DATETIME        NOT NULL,
  revoked_at DATETIME        NULL,
  created_at TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_refresh_tokens_hash (token_hash),
  KEY idx_refresh_tokens_user (user_id),
  KEY idx_refresh_tokens_expires (expires_at),
  CONSTRAINT fk_refresh_tokens_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;
```

Catatan:

- Yang disimpan hanya **SHA-256 hex** dari refresh token (64 karakter), bukan token asli. Jika database bocor, token tidak bisa dipakai langsung.
- `ON DELETE CASCADE`: hapus user → semua sesinya ikut terhapus.
- Rotasi token: saat refresh, token lama di-set `revoked_at`, token baru dibuat. Jika token yang sudah revoked dipakai lagi → indikasi pencurian, revoke semua token user tersebut.

### 4.4 Aturan Data

| Aturan | Implementasi |
|---|---|
| Email unik | `UNIQUE (email)` + cek duplikat sebelum insert (409) |
| Email format & lowercase | Zod `.email()`, `.trim().toLowerCase()` |
| Password minimal 8, maks 72 | Validasi Zod (72 = batas byte bcrypt) |
| Role hanya `admin`/`user` | `ENUM` + Zod |
| Admin tidak bisa hapus/nonaktifkan diri sendiri | Cek di service (422) |
| Minimal satu admin aktif | Cek saat update/delete (opsional, disarankan) |
| Tidak ada password di response | Serializer `toPublicUser()` |

### 4.5 Seed Admin

Script `db/seed.js`:

1. Baca `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` dari env.
2. Cek apakah email sudah ada; jika ada, skip.
3. Hash password dengan bcrypt (rounds 10), insert role `admin`, `is_active = 1`.
4. Log kredensial (tanpa password) untuk kebutuhan demo.

Default untuk demo lokal (wajib diganti):

```text
email    : admin@example.com
password : Admin#12345
```

---

## 5. Autentikasi & Otorisasi

### 5.1 Alur Token

1. **Login** → verifikasi email + bcrypt password.
2. Terbitkan:
   - **Access token**: JWT HS256, umur 15 menit, payload `{ sub, role, iss, iat, exp }`.
   - **Refresh token**: 48 byte acak (`crypto.randomBytes(48).toString('base64url')`), umur 7 hari, disimpan sebagai SHA-256 di `refresh_tokens`.
3. Request terproteksi mengirim `Authorization: Bearer <accessToken>`.
4. **Refresh** → validasi refresh token (ada, belum revoked, belum expired) → rotasi → terbitkan pasangan baru.
5. **Logout** → revoke refresh token yang dikirim.
6. **Ganti password** → revoke semua refresh token milik user.

Payload JWT:

```json
{
  "sub": "1",
  "role": "admin",
  "iss": "sample4-api",
  "iat": 1700000000,
  "exp": 1700000900
}
```

### 5.2 Matriks Akses

| Endpoint | Publik | User login | Admin |
|---|:---:|:---:|:---:|
| `POST /auth/register` | ✅ | ✅ | ✅ |
| `POST /auth/login` | ✅ | ✅ | ✅ |
| `POST /auth/refresh` | ✅ | ✅ | ✅ |
| `POST /auth/logout` | ✅ | ✅ | ✅ |
| `GET /auth/me` | — | ✅ | ✅ |
| `PATCH /auth/me` | — | ✅ | ✅ |
| `PUT /auth/me/password` | — | ✅ | ✅ |
| `GET /users` | — | — | ✅ |
| `GET /users/:id` | — | — | ✅ |
| `POST /users` | — | — | ✅ |
| `PATCH /users/:id` | — | — | ✅ |
| `DELETE /users/:id` | — | — | ✅ |
| `GET /health` | ✅ | ✅ | ✅ |

Middleware `auth` memverifikasi JWT **dan** mengambil `id, role, is_active` terbaru dari database. Jika user sudah nonaktif/dihapus → `401`. Ini memastikan perubahan role/nonaktif langsung berlaku tanpa menunggu access token expired.

---

## 6. Spesifikasi API

Base URL: `/api/v1`
Content-Type: `application/json`
Auth: `Authorization: Bearer <accessToken>`

### 6.1 Konvensi Response

**Sukses:**

```json
{ "data": { } }
```

**Sukses list:**

```json
{
  "data": [ ],
  "meta": { "page": 1, "limit": 10, "total": 42, "totalPages": 5 }
}
```

**Error:**

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Input tidak valid",
    "details": [
      { "field": "email", "message": "Format email tidak valid" }
    ]
  }
}
```

**Pagination:** `?page=1&limit=10`
**Sorting:** `?sort=created_at&order=desc` (whitelist: `id`, `name`, `email`, `created_at`)

### 6.2 Ringkasan Endpoint

| Method | Path | Akses | Deskripsi | Sukses |
|---|---|---|---|---|
| POST | `/auth/register` | Publik | Daftar akun baru | 201 |
| POST | `/auth/login` | Publik | Login, dapat token | 200 |
| POST | `/auth/refresh` | Publik | Tukar refresh token | 200 |
| POST | `/auth/logout` | Publik | Revoke refresh token | 204 |
| GET | `/auth/me` | Login | Profil sendiri | 200 |
| PATCH | `/auth/me` | Login | Ubah nama/email sendiri | 200 |
| PUT | `/auth/me/password` | Login | Ganti password sendiri | 204 |
| GET | `/users` | Admin | List user (pagination) | 200 |
| GET | `/users/:id` | Admin | Detail user | 200 |
| POST | `/users` | Admin | Buat user | 201 |
| PATCH | `/users/:id` | Admin | Update user | 200 |
| DELETE | `/users/:id` | Admin | Hapus user | 204 |
| GET | `/health` | Publik | Cek status API + DB | 200 |

### 6.3 Objek `user` (response)

```json
{
  "id": 1,
  "name": "Admin",
  "email": "admin@example.com",
  "role": "admin",
  "isActive": true,
  "lastLoginAt": "2026-11-20T13:00:00.000Z",
  "createdAt": "2026-11-20T12:00:00.000Z",
  "updatedAt": "2026-11-20T13:00:00.000Z"
}
```

`password_hash` tidak pernah dikembalikan. `lastLoginAt` boleh `null`.

---

### 6.4 Detail Endpoint

#### 1) `POST /api/v1/auth/register`

Body:

```json
{
  "name": "Budi Santoso",
  "email": "budi@example.com",
  "password": "Rahasia123"
}
```

Aturan: name 2–100, email valid & belum terdaftar, password 8–72 (huruf + angka).
Response `201`:

```json
{
  "data": {
    "id": 2,
    "name": "Budi Santoso",
    "email": "budi@example.com",
    "role": "user",
    "isActive": true,
    "createdAt": "2026-11-20T13:10:00.000Z"
  }
}
```

Error: `409 EMAIL_ALREADY_EXISTS`, `422 VALIDATION_ERROR`.
Catatan: register tidak mengembalikan token; client login setelahnya.

#### 2) `POST /api/v1/auth/login`

Body:

```json
{ "email": "budi@example.com", "password": "Rahasia123" }
```

Response `200`:

```json
{
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "6mQ9...base64url...",
    "tokenType": "Bearer",
    "expiresIn": 900,
    "user": { "id": 2, "name": "Budi Santoso", "email": "budi@example.com", "role": "user", "isActive": true }
  }
}
```

Aturan:

- Email dinormalkan lowercase + trim.
- Password salah / email tidak ada → `401 INVALID_CREDENTIALS` dengan pesan generik ("Email atau password salah") agar tidak membocorkan apakah email terdaftar.
- User `is_active = 0` → `403 ACCOUNT_INACTIVE`.
- Update `last_login_at`.
- Rate limit: 5 request/menit/IP → `429 RATE_LIMITED`.

#### 3) `POST /api/v1/auth/refresh`

Body:

```json
{ "refreshToken": "6mQ9...base64url..." }
```

Response `200`: sama seperti login (pasangan token baru + user).
Aturan: rotasi token; token lama langsung revoked. Jika token sudah pernah dipakai/revoked → revoke semua sesi user + `401 TOKEN_REUSED`.

#### 4) `POST /api/v1/auth/logout`

Body:

```json
{ "refreshToken": "6mQ9...base64url..." }
```

Response `204` tanpa body. Idempotent: token tidak dikenal/ sudah revoked tetap `204` (tidak membocorkan validitas).

#### 5) `GET /api/v1/auth/me`

Response `200`:

```json
{ "data": { "id": 2, "name": "Budi", "email": "budi@example.com", "role": "user", "isActive": true, "lastLoginAt": "...", "createdAt": "...", "updatedAt": "..." } }
```

#### 6) `PATCH /api/v1/auth/me`

Body (minimal satu field):

```json
{ "name": "Budi S.", "email": "budi.s@example.com" }
```

Response `200` dengan objek user terbaru.
Error: `409 EMAIL_ALREADY_EXISTS`, `422 VALIDATION_ERROR`.
Catatan: perubahan email tidak memaksa login ulang pada sample ini; bisa jadi enhancement (verifikasi email).

#### 7) `PUT /api/v1/auth/me/password`

Body:

```json
{ "currentPassword": "Rahasia123", "newPassword": "Rahasia456" }
```

Response `204`.
Aturan: verifikasi password lama; password baru berbeda dari yang lama; revoke **semua** refresh token user. Access token lama tetap valid sampai 15 menit (bisa diperketat dengan `token_version` bila diperlukan).
Error: `401 INVALID_CREDENTIALS` (password lama salah), `422 VALIDATION_ERROR`.

#### 8) `GET /api/v1/users` (admin)

Query:

| Param | Default | Keterangan |
|---|---|---|
| `page` | 1 | min 1 |
| `limit` | 10 | 1–100 |
| `search` | — | cari di `name`/`email` (`LIKE %q%`) |
| `role` | — | `admin` / `user` |
| `isActive` | — | `true` / `false` |
| `sort` | `created_at` | `id`,`name`,`email`,`created_at` |
| `order` | `desc` | `asc` / `desc` |

Response `200`:

```json
{
  "data": [
    { "id": 1, "name": "Admin", "email": "admin@example.com", "role": "admin", "isActive": true, "createdAt": "..." }
  ],
  "meta": { "page": 1, "limit": 10, "total": 2, "totalPages": 1 }
}
```

Catatan: `sort`/`order` memakai whitelist (jangan interpolasi input mentah ke SQL). `search` memakai parameter binding.

#### 9) `GET /api/v1/users/:id` (admin)

Response `200` objek user. `404 NOT_FOUND` jika tidak ada. `400` jika `:id` bukan angka.

#### 10) `POST /api/v1/users` (admin)

Body:

```json
{
  "name": "Siti",
  "email": "siti@example.com",
  "password": "Rahasia123",
  "role": "user",
  "isActive": true
}
```

Response `201` objek user. Error: `409 EMAIL_ALREADY_EXISTS`, `422 VALIDATION_ERROR`.

#### 11) `PATCH /api/v1/users/:id` (admin)

Body (semua opsional, minimal satu):

```json
{
  "name": "Siti Aminah",
  "email": "siti.a@example.com",
  "role": "admin",
  "isActive": false,
  "password": "PasswordBaru123"
}
```

Response `200` objek user.
Aturan:

- `password` opsional = reset password oleh admin; jika diisi, revoke semua refresh token user tersebut.
- Admin tidak boleh mengubah `role`/`isActive` akunnya sendiri (`422 CANNOT_MODIFY_SELF`).
- Tidak boleh menonaktifkan/menurunkan admin aktif terakhir (`422 LAST_ADMIN`).
- `last_login_at` tidak bisa diubah via endpoint ini.

#### 12) `DELETE /api/v1/users/:id` (admin)

Response `204` tanpa body. Hard delete; refresh token terhapus via cascade.
Error: `404 NOT_FOUND`, `422 CANNOT_DELETE_SELF`, `422 LAST_ADMIN`.

#### 13) `GET /api/v1/health`

Response `200`:

```json
{ "data": { "status": "ok", "db": "up", "uptime": 123.45, "timestamp": "2026-11-20T13:20:00.000Z" } }
```

Jika DB tidak bisa di-ping → `503` dengan `status: "degraded"`, `db: "down"`. Endpoint ini dipakai untuk healthcheck Docker Compose nanti.

---

## 7. Validasi & Aturan Bisnis

| Field | Aturan |
|---|---|
| `name` | string, trim, 2–100 karakter |
| `email` | string, trim, lowercase, format email, maks 255 |
| `password` | string, 8–72 karakter, minimal 1 huruf + 1 angka |
| `role` | enum `admin` \| `user` |
| `isActive` | boolean |
| `page` | integer ≥ 1 |
| `limit` | integer 1–100 |
| `id` path | integer > 0 |
| `refreshToken` | string non-empty |

Aturan tambahan:

- Body harus object JSON; malformed JSON → `400 MALFORMED_JSON`.
- Field tak dikenal diabaikan (Zod `.strip()`) atau ditolak (`.strict()`) — pilih `.strip()` agar sederhana.
- Update tanpa field yang dikenal → `422 VALIDATION_ERROR`.
- Register/update email: cek duplikat case-insensitive (query `WHERE email = ?` setelah lowercase).

---

## 8. Kode Error

| HTTP | Code | Kapan |
|---|---|---|
| 400 | `BAD_REQUEST` | Parameter/ID tidak valid, JSON rusak |
| 401 | `UNAUTHORIZED` | Header auth tidak ada / format salah |
| 401 | `TOKEN_EXPIRED` | Access token kedaluwarsa |
| 401 | `TOKEN_INVALID` | Signature/claim tidak valid |
| 401 | `INVALID_CREDENTIALS` | Email/password salah |
| 401 | `TOKEN_REUSED` | Refresh token yang sudah revoked dipakai |
| 403 | `FORBIDDEN` | Role tidak cukup |
| 403 | `ACCOUNT_INACTIVE` | User dinonaktifkan |
| 404 | `NOT_FOUND` | Resource tidak ada |
| 409 | `EMAIL_ALREADY_EXISTS` | Email sudah terdaftar |
| 422 | `VALIDATION_ERROR` | Field tidak lolos validasi |
| 422 | `CANNOT_DELETE_SELF` | Admin hapus akun sendiri |
| 422 | `CANNOT_MODIFY_SELF` | Admin ubah role/status sendiri |
| 422 | `LAST_ADMIN` | Aksi menghilangkan admin aktif terakhir |
| 429 | `RATE_LIMITED` | Melebihi batas request |
| 500 | `INTERNAL_ERROR` | Error tak terduga (log detail, response generik) |

Format error selalu memakai envelope `{ "error": { code, message, details? } }`.

---

## 9. Keamanan

- Hash password bcrypt rounds 10; batas 72 byte.
- JWT HS256, `JWT_SECRET` minimal 32 karakter acak; jangan commit `.env`.
- Refresh token acak 48 byte, disimpan sebagai SHA-256; rotasi + deteksi reuse.
- Login/register rate limit 5/menit/IP; global 100/menit/IP.
- `helmet`, `cors` dengan origin dari env, body limit `100kb`.
- Query selalu parameterized (`pool.execute(sql, params)`).
- Pesan login generik; jangan log password/token.
- Cek `is_active` di setiap request terproteksi.
- Di production: HTTPS via reverse proxy, `NODE_ENV=production`, secret dari secret manager.

---

## 10. Environment Variables

`.env.example`:

```dotenv
NODE_ENV=development
PORT=3000

DB_HOST=db
DB_PORT=3306
DB_USER=app
DB_PASSWORD=ganti_password
DB_NAME=crud_app

JWT_SECRET=ganti_dengan_string_acak_minimal_32_karakter
JWT_ISSUER=sample4-api
JWT_ACCESS_TTL=15m
REFRESH_TOKEN_TTL_DAYS=7
BCRYPT_ROUNDS=10

CORS_ORIGIN=http://localhost:3000

ADMIN_NAME=Admin
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=Admin#12345
```

`src/config/env.js` memvalidasi variabel wajib saat startup (fail fast).

---

## 11. Rencana Implementasi

| # | Langkah | Deliverable | Kriteria selesai |
|---|---|---|---|
| 1 | Inisialisasi project | `package.json`, struktur folder, `.env.example` | `npm run dev` start, `/health` 200 |
| 2 | Koneksi DB | `config/db.js` (pool), `db/schema.sql` | Tabel `users` & `refresh_tokens` terbentuk |
| 3 | Seed admin | `db/seed.js`, script `db:seed` | Admin bisa dibuat, password ter-hash |
| 4 | Util & error handling | `ApiError`, `asyncHandler`, `errorHandler`, `notFound` | Semua error memakai envelope konsisten |
| 5 | Register + login | `auth.service`, `auth.controller`, `auth.routes`, validasi | Register 201, login 200 + token |
| 6 | Middleware auth/role | `auth.js`, `requireRole.js` | Tanpa token 401, role user 403 di `/users` |
| 7 | Refresh + logout + profil | endpoint `/auth/refresh`, `/auth/logout`, `/auth/me`, `/auth/me/password` | Rotasi & revoke berjalan |
| 8 | CRUD user admin | list (filter/sort/pagination), detail, create, update, delete | Semua aturan self/last-admin berjalan |
| 9 | Rate limit & hardening | limiter, helmet, cors, body limit | 429 muncul saat limit terlampaui |
| 10 | Test & dokumentasi | Jest + Supertest, `README.md` + contoh curl | Test hijau; demo end-to-end lancar |
| 11 | Dockerisasi | `Dockerfile`, `docker-compose.yml`, healthcheck, volume | `docker compose up` → API + MySQL jalan (goal berikutnya) |

Urutan pengerjaan disarankan 1 → 11; endpoint auth selesai sebelum CRUD admin agar bisa dites dengan token.

---

## 12. Rencana Pengujian

### 12.1 Skenario Otomatis (Jest + Supertest)

| Skenario | Ekspektasi |
|---|---|
| Register valid | 201, password tidak muncul di response |
| Register email duplikat | 409 `EMAIL_ALREADY_EXISTS` |
| Register password lemah | 422 `VALIDATION_ERROR` |
| Login benar | 200, access + refresh token |
| Login password salah | 401 `INVALID_CREDENTIALS` |
| Login user nonaktif | 403 `ACCOUNT_INACTIVE` |
| Akses `/users` tanpa token | 401 |
| Akses `/users` sebagai role user | 403 |
| Refresh token valid | 200, token baru; token lama tidak bisa dipakai |
| Refresh token dipakai 2x | 401 `TOKEN_REUSED` |
| Logout lalu refresh | 401 `TOKEN_INVALID` |
| List user pagination/filter | meta & data sesuai |
| Update email ke email lain yang dipakai | 409 |
| Admin hapus diri sendiri | 422 `CANNOT_DELETE_SELF` |
| Hapus user | 204, user hilang, refresh token ikut terhapus |

### 12.2 Demo Manual (curl)

```bash
# 1. register
curl -s -X POST localhost:3000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"Budi","email":"budi@example.com","password":"Rahasia123"}'

# 2. login admin -> simpan access token
ACCESS=$(curl -s -X POST localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"Admin#12345"}' | jq -r .data.accessToken)

# 3. list user (admin)
curl -s 'localhost:3000/api/v1/users?page=1&limit=10&search=budi' \
  -H "Authorization: Bearer $ACCESS"

# 4. buat user
curl -s -X POST localhost:3000/api/v1/users \
  -H "Authorization: Bearer $ACCESS" -H 'Content-Type: application/json' \
  -d '{"name":"Siti","email":"siti@example.com","password":"Rahasia123","role":"user"}'

# 5. update & delete
curl -s -X PATCH localhost:3000/api/v1/users/2 \
  -H "Authorization: Bearer $ACCESS" -H 'Content-Type: application/json' \
  -d '{"name":"Siti Aminah"}'
curl -s -X DELETE localhost:3000/api/v1/users/2 \
  -H "Authorization: Bearer $ACCESS" -i

# 6. health
curl -s localhost:3000/api/v1/health
```

---

## 13. Catatan untuk Goal Docker (Berikutnya)

- `db` service MySQL 8 + volume `dbdata`; mount `db/schema.sql` ke `/docker-entrypoint-initdb.d/` (hanya jalan saat volume kosong).
- `api` build dari `Dockerfile` (`node:20-alpine`, `npm ci --omit=dev`), `depends_on: db: condition: service_healthy`.
- Jalankan seed setelah DB sehat: `docker compose exec api npm run db:seed` atau entrypoint terkontrol.
- Healthcheck API memakai `GET /api/v1/health`; healthcheck DB memakai `mysqladmin ping`.
- `.env` untuk kredensial; jangan hardcode di compose.

---

## 14. Keputusan Terbuka (bisa diubah saat implementasi)

1. Hard delete (dipilih, sederhana) vs soft delete (`deleted_at`).
2. Refresh token di body (dipilih, ramah curl/Postman) vs httpOnly cookie (lebih aman untuk browser).
3. Register publik (dipilih) vs hanya admin yang boleh membuat akun.
4. Stack Express + MySQL (mengikuti sample 3) vs Next.js API routes.
