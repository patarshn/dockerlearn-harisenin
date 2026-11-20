# Curl Samples — Sample 4 CRUD User + Login

Base URL: `http://localhost:3000/api/v1`

## Cara pakai di Postman

1. **Paling praktis:** import file `postman_collection.json`
   (Postman → Import → File). Jalankan request **Login Admin** dulu; token otomatis
   tersimpan di collection variable.
2. **Copy-paste satu per satu:** salin satu blok `curl` ke
   Postman → Import → Raw text. Ganti `$ACCESS_TOKEN` / `$REFRESH_TOKEN`
   dengan token asli (atau variabel Postman `{{adminAccessToken}}`).

Jalankan dari terminal (bash/zsh) agar variabel di bawah berfungsi:

```bash
BASE_URL=http://localhost:3000/api/v1
```

---

## 1. Health (publik)

```bash
curl -i "$BASE_URL/health"
```

Respons `200`:

```json
{"data":{"status":"ok","db":"up","uptime":12.3,"timestamp":"2026-11-20T13:20:00.000Z"}}
```

---

## 2. Login admin — simpan token

```bash
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"Admin#12345"}')

ACCESS_TOKEN=$(printf '%s' "$LOGIN_RESPONSE" \
  | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).data.accessToken')

REFRESH_TOKEN=$(printf '%s' "$LOGIN_RESPONSE" \
  | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).data.refreshToken')

echo "ACCESS_TOKEN=$ACCESS_TOKEN"
```

Respons `200` (dipotong):

```json
{
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "6mQ9...",
    "tokenType": "Bearer",
    "expiresIn": 900,
    "user": {"id": 1, "name": "Admin", "email": "admin@example.com", "role": "admin"}
  }
}
```

---

## 3. Register user baru (publik)

```bash
curl -i -X POST "$BASE_URL/auth/register" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Budi Santoso","email":"budi@example.com","password":"Rahasia123"}'
```

Respons `201`:

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

> Jika `409 EMAIL_ALREADY_EXISTS`, ganti email (mis. `budi2@example.com`).

---

## 4. Login user — simpan token user

```bash
USER_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"budi@example.com","password":"Rahasia123"}')

USER_ACCESS_TOKEN=$(printf '%s' "$USER_RESPONSE" \
  | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).data.accessToken')

USER_REFRESH_TOKEN=$(printf '%s' "$USER_RESPONSE" \
  | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).data.refreshToken')
```

---

## 5. Profil sendiri

```bash
curl -i "$BASE_URL/auth/me" \
  -H "Authorization: Bearer $USER_ACCESS_TOKEN"
```

Respons `200`: `{"data":{"id":2,"name":"Budi Santoso","email":"budi@example.com","role":"user","isActive":true,...}}`

---

## 6. Ubah nama / email sendiri

```bash
curl -i -X PATCH "$BASE_URL/auth/me" \
  -H "Authorization: Bearer $USER_ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Budi S."}'
```

Respons `200` berisi user terbaru.

---

## 7. Refresh token (rotasi)

```bash
REFRESH_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/refresh" \
  -H 'Content-Type: application/json' \
  -d "{\"refreshToken\":\"$USER_REFRESH_TOKEN\"}")

USER_ACCESS_TOKEN=$(printf '%s' "$REFRESH_RESPONSE" \
  | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).data.accessToken')

USER_REFRESH_TOKEN=$(printf '%s' "$REFRESH_RESPONSE" \
  | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).data.refreshToken')
```

Respons `200`: pasangan `accessToken` + `refreshToken` baru.
Token lama langsung tidak berlaku; jika dipakai lagi → `401 TOKEN_REUSED`.

---

## 8. Logout

```bash
curl -i -X POST "$BASE_URL/auth/logout" \
  -H 'Content-Type: application/json' \
  -d "{\"refreshToken\":\"$USER_REFRESH_TOKEN\"}"
```

Respons `204` (idempotent).

---

## 9. Ganti password sendiri

```bash
curl -i -X PUT "$BASE_URL/auth/me/password" \
  -H "Authorization: Bearer $USER_ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"currentPassword":"Rahasia123","newPassword":"Rahasia456"}'
```

Respons `204` (tanpa body). Semua refresh token user dicabut, jadi login ulang
dengan password baru. Letakkan langkah ini terakhir karena mengubah kredensial demo.

---

## 10. List user (admin)

```bash
curl -i "$BASE_URL/users?page=1&limit=10&sort=created_at&order=desc" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Dengan filter (hapus/ubah sesuai kebutuhan):

```bash
curl -s "$BASE_URL/users?page=1&limit=5&search=budi&role=user&isActive=true&sort=name&order=asc" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Respons `200`:

```json
{
  "data": [{"id":2,"name":"Budi Santoso","email":"budi@example.com","role":"user","isActive":true}],
  "meta": {"page":1,"limit":10,"total":1,"totalPages":1}
}
```

---

## 11. Detail user (admin)

```bash
curl -i "$BASE_URL/users/2" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 12. Create user (admin)

```bash
curl -i -X POST "$BASE_URL/users" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Siti","email":"siti@example.com","password":"Rahasia123","role":"user","isActive":true}'
```

Respons `201` dengan `id` user baru (mis. `3`).

---

## 13. Update user (admin)

```bash
curl -i -X PATCH "$BASE_URL/users/3" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Siti Aminah","role":"admin","isActive":true}'
```

Reset password user oleh admin (opsional, mencabut semua sesi user tersebut):

```bash
curl -i -X PATCH "$BASE_URL/users/3" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"password":"PasswordBaru123"}'
```

---

## 14. Delete user (admin)

```bash
curl -i -X DELETE "$BASE_URL/users/3" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Respons `204`. Menghapus akun sendiri → `422 CANNOT_DELETE_SELF`.

---

## 15. Contoh error

### Tanpa token → 401

```bash
curl -i "$BASE_URL/users"
```

### Role user akses endpoint admin → 403

```bash
curl -i "$BASE_URL/users" \
  -H "Authorization: Bearer $USER_ACCESS_TOKEN"
```

### Email duplikat → 409

```bash
curl -i -X POST "$BASE_URL/auth/register" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Admin Lagi","email":"admin@example.com","password":"Rahasia123"}'
```

### Validasi gagal → 422

```bash
curl -i -X POST "$BASE_URL/auth/register" \
  -H 'Content-Type: application/json' \
  -d '{"name":"X","email":"bukan-email","password":"123"}'
```

### Rate limit login → 429

```bash
for i in 1 2 3 4 5 6 7; do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE_URL/auth/login" \
    -H 'Content-Type: application/json' \
    -d '{"email":"admin@example.com","password":"salah"}'
done
```

Request ke-6 dan seterusnya dalam 1 menit → `429 RATE_LIMITED`.
