const pool = require('../config/db');
const ApiError = require('../utils/ApiError');
const { hashPassword } = require('../utils/password');
const { toPublicUser } = require('../utils/serialize');
const { revokeAllForUser } = require('./auth.service');

const SORT_COLUMNS = {
  id: 'id',
  name: 'name',
  email: 'email',
  created_at: 'created_at',
};

async function findRowById(id) {
  const [rows] = await pool.execute('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function assertEmailAvailable(email, excludeId = null) {
  const [rows] = excludeId
    ? await pool.execute('SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1', [
        email,
        excludeId,
      ])
    : await pool.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);

  if (rows.length > 0) {
    throw new ApiError(409, 'EMAIL_ALREADY_EXISTS', 'Email sudah terdaftar');
  }
}

async function assertNotLastAdmin() {
  const [rows] = await pool.execute(
    "SELECT COUNT(*) AS total FROM users WHERE role = 'admin' AND is_active = 1"
  );

  if (Number(rows[0].total) <= 1) {
    throw new ApiError(
      422,
      'LAST_ADMIN',
      'Aksi ini akan menghilangkan admin aktif terakhir'
    );
  }
}

async function list({ page, limit, search, role, isActive, sort, order }) {
  const conditions = [];
  const params = [];

  if (search) {
    conditions.push('(name LIKE ? OR email LIKE ?)');
    const pattern = `%${search}%`;
    params.push(pattern, pattern);
  }

  if (role) {
    conditions.push('role = ?');
    params.push(role);
  }

  if (typeof isActive === 'boolean') {
    conditions.push('is_active = ?');
    params.push(isActive ? 1 : 0);
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM users ${whereSql}`,
    params
  );
  const total = Number(countRows[0].total);
  const offset = (page - 1) * limit;
  const sortColumn = SORT_COLUMNS[sort] || 'created_at';
  const direction = order === 'asc' ? 'ASC' : 'DESC';

  const [rows] = await pool.execute(
    `SELECT * FROM users ${whereSql}
     ORDER BY ${sortColumn} ${direction}
     LIMIT ${limit} OFFSET ${offset}`,
    params
  );

  return {
    items: rows.map(toPublicUser),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async function getById(id) {
  const row = await findRowById(id);

  if (!row) {
    throw ApiError.notFound('User tidak ditemukan');
  }

  return toPublicUser(row);
}

async function create({ name, email, password, role, isActive }) {
  await assertEmailAvailable(email);
  const passwordHash = await hashPassword(password);

  const [result] = await pool.execute(
    `INSERT INTO users (name, email, password_hash, role, is_active)
     VALUES (?, ?, ?, ?, ?)`,
    [name.trim(), email, passwordHash, role, isActive ? 1 : 0]
  );

  return getById(result.insertId);
}

async function update(actor, id, data) {
  const target = await findRowById(id);

  if (!target) {
    throw ApiError.notFound('User tidak ditemukan');
  }

  if (actor.id === id) {
    const changesRole = data.role !== undefined && data.role !== target.role;
    const deactivatesSelf = data.isActive === false;

    if (changesRole || deactivatesSelf) {
      throw new ApiError(
        422,
        'CANNOT_MODIFY_SELF',
        'Tidak dapat mengubah role atau menonaktifkan akun sendiri'
      );
    }
  }

  if (target.role === 'admin' && target.is_active) {
    const removesAdmin =
      (data.role !== undefined && data.role !== 'admin') || data.isActive === false;

    if (removesAdmin) {
      await assertNotLastAdmin();
    }
  }

  if (data.email !== undefined && data.email !== target.email) {
    await assertEmailAvailable(data.email, id);
  }

  const fields = [];
  const params = [];

  if (data.name !== undefined) {
    fields.push('name = ?');
    params.push(data.name);
  }

  if (data.email !== undefined) {
    fields.push('email = ?');
    params.push(data.email);
  }

  if (data.role !== undefined) {
    fields.push('role = ?');
    params.push(data.role);
  }

  if (data.isActive !== undefined) {
    fields.push('is_active = ?');
    params.push(data.isActive ? 1 : 0);
  }

  if (data.password !== undefined) {
    fields.push('password_hash = ?');
    params.push(await hashPassword(data.password));
  }

  if (fields.length > 0) {
    params.push(id);
    await pool.execute(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, params);
  }

  if (data.password !== undefined) {
    await revokeAllForUser(id);
  }

  return getById(id);
}

async function remove(actor, id) {
  const target = await findRowById(id);

  if (!target) {
    throw ApiError.notFound('User tidak ditemukan');
  }

  if (actor.id === id) {
    throw new ApiError(422, 'CANNOT_DELETE_SELF', 'Tidak dapat menghapus akun sendiri');
  }

  if (target.role === 'admin' && target.is_active) {
    await assertNotLastAdmin();
  }

  await pool.execute('DELETE FROM users WHERE id = ?', [id]);
}

module.exports = { list, getById, create, update, remove };
