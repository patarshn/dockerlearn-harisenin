const { z } = require('zod');

const nameField = z
  .string()
  .trim()
  .min(2, 'Nama minimal 2 karakter')
  .max(100, 'Nama maksimal 100 karakter');

const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .email('Format email tidak valid')
  .max(255, 'Email maksimal 255 karakter');

const passwordField = z
  .string()
  .min(8, 'Password minimal 8 karakter')
  .max(72, 'Password maksimal 72 karakter')
  .regex(/[A-Za-z]/, 'Password harus mengandung huruf')
  .regex(/\d/, 'Password harus mengandung angka');

const idParamSchema = z.object({
  id: z.coerce.number().int('ID harus bilangan bulat').positive('ID harus lebih dari 0'),
});

const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(100).optional(),
  role: z.enum(['admin', 'user']).optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  sort: z.enum(['id', 'name', 'email', 'created_at']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

const createUserSchema = z.object({
  name: nameField,
  email: emailField,
  password: passwordField,
  role: z.enum(['admin', 'user']).default('user'),
  isActive: z.boolean().default(true),
});

const updateUserSchema = z
  .object({
    name: nameField.optional(),
    email: emailField.optional(),
    password: passwordField.optional(),
    role: z.enum(['admin', 'user']).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Minimal satu field harus diisi',
  });

module.exports = {
  idParamSchema,
  listUsersQuerySchema,
  createUserSchema,
  updateUserSchema,
};
