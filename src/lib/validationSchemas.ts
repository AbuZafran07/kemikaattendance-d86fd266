import { z } from 'zod';

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Email harus diisi')
    .email('Format email tidak valid')
    .max(255, 'Email maksimal 255 karakter'),
  password: z
    .string()
    .min(1, 'Password harus diisi')
    .min(6, 'Password minimal 6 karakter')
    .max(128, 'Password maksimal 128 karakter'),
});

export const employeeSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Email harus diisi')
    .email('Format email tidak valid')
    .max(255, 'Email maksimal 255 karakter'),
  password: z
    .string()
    .min(1, 'Password harus diisi')
    .min(8, 'Password minimal 8 karakter')
    .max(128, 'Password maksimal 128 karakter')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/,
      'Password harus mengandung huruf besar, huruf kecil, angka, dan simbol'
    ),
  nik: z
    .string()
    .trim()
    .min(1, 'NIK harus diisi')
    .max(50, 'NIK maksimal 50 karakter'),
  full_name: z
    .string()
    .trim()
    .min(1, 'Nama lengkap harus diisi')
    .max(100, 'Nama maksimal 100 karakter'),
  jabatan: z
    .string()
    .min(1, 'Jabatan harus dipilih'),
  departemen: z
    .string()
    .min(1, 'Departemen harus dipilih'),
  phone: z
    .string()
    .trim()
    .max(20, 'Nomor telepon maksimal 20 karakter')
    .optional()
    .or(z.literal('')),
  address: z
    .string()
    .trim()
    .max(500, 'Alamat maksimal 500 karakter')
    .optional()
    .or(z.literal('')),
});

export const employeeEditSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Email harus diisi')
    .email('Format email tidak valid')
    .max(255, 'Email maksimal 255 karakter'),
  nik: z
    .string()
    .trim()
    .min(1, 'NIK harus diisi')
    .max(50, 'NIK maksimal 50 karakter'),
  full_name: z
    .string()
    .trim()
    .min(1, 'Nama lengkap harus diisi')
    .max(100, 'Nama maksimal 100 karakter'),
  jabatan: z
    .string()
    .min(1, 'Jabatan harus dipilih'),
  departemen: z
    .string()
    .min(1, 'Departemen harus dipilih'),
  phone: z
    .string()
    .trim()
    .max(20, 'Nomor telepon maksimal 20 karakter')
    .optional()
    .or(z.literal('')),
  address: z
    .string()
    .trim()
    .max(500, 'Alamat maksimal 500 karakter')
    .optional()
    .or(z.literal('')),
  status: z
    .string()
    .optional(),
  basic_salary: z
    .union([z.string(), z.number()])
    .transform(val => Number(val))
    .refine(val => !isNaN(val) && val >= 0 && val <= 1000000000, {
      message: 'Gaji pokok harus antara 0 dan 1.000.000.000',
    })
    .optional(),
  npwp: z
    .string()
    .trim()
    .max(20, 'NPWP maksimal 20 karakter')
    .regex(/^$|^\d{0,20}$/, 'NPWP hanya boleh berisi angka')
    .optional()
    .or(z.literal('')),
  bank_account_number: z
    .string()
    .trim()
    .max(25, 'Nomor rekening maksimal 25 karakter')
    .regex(/^$|^[\d\-]+$/, 'Nomor rekening hanya boleh berisi angka dan strip')
    .optional()
    .or(z.literal('')),
  bank_name: z
    .string()
    .trim()
    .max(100, 'Nama bank maksimal 100 karakter')
    .optional()
    .or(z.literal('')),
  tunjangan_komunikasi: z
    .union([z.string(), z.number()])
    .transform(val => Number(val))
    .refine(val => !isNaN(val) && val >= 0 && val <= 100000000, {
      message: 'Tunjangan komunikasi harus antara 0 dan 100.000.000',
    })
    .optional(),
  tunjangan_jabatan: z
    .union([z.string(), z.number()])
    .transform(val => Number(val))
    .refine(val => !isNaN(val) && val >= 0 && val <= 100000000, {
      message: 'Tunjangan jabatan harus antara 0 dan 100.000.000',
    })
    .optional(),
  tunjangan_operasional: z
    .union([z.string(), z.number()])
    .transform(val => Number(val))
    .refine(val => !isNaN(val) && val >= 0 && val <= 100000000, {
      message: 'Tunjangan operasional harus antara 0 dan 100.000.000',
    })
    .optional(),
});

export const leaveRequestSchema = z.object({
  leaveType: z.enum(['cuti_tahunan', 'izin', 'sakit', 'lupa_absen'], {
    required_error: 'Jenis cuti harus dipilih',
  }),
  startDate: z.string().min(1, 'Tanggal mulai harus diisi'),
  endDate: z.string().min(1, 'Tanggal selesai harus diisi'),
  reason: z.string().trim().max(1000, 'Alasan maksimal 1000 karakter').optional().or(z.literal('')),
  delegatedTo: z.string().optional().or(z.literal('')),
  delegationNotes: z.string().trim().max(1000, 'Detail tugas maksimal 1000 karakter').optional().or(z.literal('')),
  checkInTime: z.string().optional().or(z.literal('')),
  checkOutTime: z.string().optional().or(z.literal('')),
}).refine(data => new Date(data.endDate) >= new Date(data.startDate), {
  message: 'Tanggal selesai harus setelah tanggal mulai',
  path: ['endDate'],
}).superRefine((data, ctx) => {
  if (data.leaveType !== 'lupa_absen') {
    if (!data.delegatedTo || !/^[0-9a-f-]{36}$/i.test(data.delegatedTo)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['delegatedTo'], message: 'Karyawan pengganti harus dipilih' });
    }
    if (!data.delegationNotes || data.delegationNotes.trim().length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['delegationNotes'], message: 'Detail tugas yang didelegasikan harus diisi' });
    }
  } else {
    if (data.checkInTime && data.checkOutTime && data.checkInTime >= data.checkOutTime) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['checkOutTime'], message: 'Jam pulang harus setelah jam masuk' });
    }
  }
});

export const overtimeRequestSchema = z.object({
  overtimeDate: z.string().min(1, 'Tanggal lembur harus diisi'),
  startTime: z.string().min(1, 'Jam mulai harus diisi'),
  endTime: z.string().min(1, 'Jam selesai harus diisi'),
  reason: z.string().trim().min(1, 'Alasan harus diisi').max(1000, 'Alasan maksimal 1000 karakter'),
});

export type LoginFormData = z.infer<typeof loginSchema>;
export type EmployeeFormData = z.infer<typeof employeeSchema>;
export type EmployeeEditFormData = z.infer<typeof employeeEditSchema>;
export type LeaveRequestFormData = z.infer<typeof leaveRequestSchema>;
export type OvertimeRequestFormData = z.infer<typeof overtimeRequestSchema>;
