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

const registerSchema = z.object({
  name: nameField,
  email: emailField,
  password: passwordField,
});

const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Password wajib diisi').max(72),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(10, 'Refresh token tidak valid').max(512),
});

const updateMeSchema = z
  .object({
    name: nameField.optional(),
    email: emailField.optional(),
  })
  .refine((value) => value.name !== undefined || value.email !== undefined, {
    message: 'Minimal satu field harus diisi',
  });

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Password lama wajib diisi').max(72),
  newPassword: passwordField,
});

module.exports = {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  updateMeSchema,
  changePasswordSchema,
};
