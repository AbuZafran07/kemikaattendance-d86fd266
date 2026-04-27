export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      approval_audit_logs: {
        Row: {
          action_type: string
          created_at: string
          details: Json | null
          id: string
          notes: string | null
          performed_by: string
          request_id: string
          request_type: string
          target_user_id: string
        }
        Insert: {
          action_type: string
          created_at?: string
          details?: Json | null
          id?: string
          notes?: string | null
          performed_by: string
          request_id: string
          request_type: string
          target_user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string
          details?: Json | null
          id?: string
          notes?: string | null
          performed_by?: string
          request_id?: string
          request_type?: string
          target_user_id?: string
        }
        Relationships: []
      }
      attendance: {
        Row: {
          check_in_latitude: number
          check_in_longitude: number
          check_in_photo_url: string | null
          check_in_time: string
          check_out_latitude: number | null
          check_out_longitude: number | null
          check_out_photo_url: string | null
          check_out_time: string | null
          created_at: string
          duration_minutes: number | null
          face_recognition_validated: boolean | null
          gps_validated: boolean | null
          id: string
          notes: string | null
          status: Database["public"]["Enums"]["attendance_status"]
          user_id: string
        }
        Insert: {
          check_in_latitude: number
          check_in_longitude: number
          check_in_photo_url?: string | null
          check_in_time: string
          check_out_latitude?: number | null
          check_out_longitude?: number | null
          check_out_photo_url?: string | null
          check_out_time?: string | null
          created_at?: string
          duration_minutes?: number | null
          face_recognition_validated?: boolean | null
          gps_validated?: boolean | null
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          user_id: string
        }
        Update: {
          check_in_latitude?: number
          check_in_longitude?: number
          check_in_photo_url?: string | null
          check_in_time?: string
          check_out_latitude?: number | null
          check_out_longitude?: number | null
          check_out_photo_url?: string | null
          check_out_time?: string | null
          created_at?: string
          duration_minutes?: number | null
          face_recognition_validated?: boolean | null
          gps_validated?: boolean | null
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          user_id?: string
        }
        Relationships: []
      }
      attendance_audit_logs: {
        Row: {
          action_type: string
          attendance_id: string
          changed_by: string
          created_at: string
          id: string
          new_data: Json | null
          old_data: Json
          reason: string | null
        }
        Insert: {
          action_type: string
          attendance_id: string
          changed_by: string
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data: Json
          reason?: string | null
        }
        Update: {
          action_type?: string
          attendance_id?: string
          changed_by?: string
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json
          reason?: string | null
        }
        Relationships: []
      }
      biometric_consent_records: {
        Row: {
          action_type: string
          consent_given: boolean
          consent_timestamp: string
          created_at: string
          faceio_facial_id: string | null
          id: string
          ip_address: string | null
          notes: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action_type: string
          consent_given: boolean
          consent_timestamp?: string
          created_at?: string
          faceio_facial_id?: string | null
          id?: string
          ip_address?: string | null
          notes?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action_type?: string
          consent_given?: boolean
          consent_timestamp?: string
          created_at?: string
          faceio_facial_id?: string | null
          id?: string
          ip_address?: string | null
          notes?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      business_travel_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          destination: string
          document_url: string | null
          end_date: string
          id: string
          notes: string | null
          purpose: string
          rejection_reason: string | null
          start_date: string
          status: Database["public"]["Enums"]["leave_status"]
          total_days: number
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          destination: string
          document_url?: string | null
          end_date: string
          id?: string
          notes?: string | null
          purpose: string
          rejection_reason?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["leave_status"]
          total_days: number
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          destination?: string
          document_url?: string | null
          end_date?: string
          id?: string
          notes?: string | null
          purpose?: string
          rejection_reason?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["leave_status"]
          total_days?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      company_announcements: {
        Row: {
          content: string
          created_at: string
          created_by: string
          expire_at: string | null
          id: string
          is_active: boolean
          priority: number
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by: string
          expire_at?: string | null
          id?: string
          is_active?: boolean
          priority?: number
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string
          expire_at?: string | null
          id?: string
          is_active?: boolean
          priority?: number
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_events: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          end_date: string
          id: string
          start_date: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          end_date: string
          id?: string
          start_date: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          end_date?: string
          id?: string
          start_date?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      employee_loans: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          loan_type: string
          monthly_installment: number
          paid_installments: number
          remaining_amount: number
          start_date: string
          status: string
          total_amount: number
          total_installments: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          loan_type?: string
          monthly_installment?: number
          paid_installments?: number
          remaining_amount?: number
          start_date?: string
          status?: string
          total_amount?: number
          total_installments?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          loan_type?: string
          monthly_installment?: number
          paid_installments?: number
          remaining_amount?: number
          start_date?: string
          status?: string
          total_amount?: number
          total_installments?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      geocoding_cache: {
        Row: {
          address: string
          created_at: string
          hit_count: number
          id: string
          last_used_at: string
          lat_rounded: number
          lng_rounded: number
        }
        Insert: {
          address: string
          created_at?: string
          hit_count?: number
          id?: string
          last_used_at?: string
          lat_rounded: number
          lng_rounded: number
        }
        Update: {
          address?: string
          created_at?: string
          hit_count?: number
          id?: string
          last_used_at?: string
          lat_rounded?: number
          lng_rounded?: number
        }
        Relationships: []
      }
      leave_requests: {
        Row: {
          approval_notes: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          delegated_to: string | null
          delegation_notes: string | null
          end_date: string
          id: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          reason: string
          rejection_reason: string | null
          start_date: string
          status: Database["public"]["Enums"]["leave_status"]
          total_days: number
          updated_at: string
          user_id: string
        }
        Insert: {
          approval_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          delegated_to?: string | null
          delegation_notes?: string | null
          end_date: string
          id?: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          reason: string
          rejection_reason?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["leave_status"]
          total_days: number
          updated_at?: string
          user_id: string
        }
        Update: {
          approval_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          delegated_to?: string | null
          delegation_notes?: string | null
          end_date?: string
          id?: string
          leave_type?: Database["public"]["Enums"]["leave_type"]
          reason?: string
          rejection_reason?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["leave_status"]
          total_days?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      loan_installments: {
        Row: {
          amount: number
          created_at: string
          id: string
          installment_number: number
          loan_id: string
          notes: string | null
          payment_date: string | null
          payroll_period_id: string | null
          status: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          installment_number: number
          loan_id: string
          notes?: string | null
          payment_date?: string | null
          payroll_period_id?: string | null
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          installment_number?: number
          loan_id?: string
          notes?: string | null
          payment_date?: string | null
          payroll_period_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_installments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "employee_loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_installments_payroll_period_id_fkey"
            columns: ["payroll_period_id"]
            isOneToOne: false
            referencedRelation: "payroll_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      overtime_requests: {
        Row: {
          approval_notes: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          hours: number
          id: string
          overtime_date: string
          reason: string
          rejection_reason: string | null
          status: Database["public"]["Enums"]["leave_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          approval_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          hours: number
          id?: string
          overtime_date: string
          reason: string
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["leave_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          approval_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          hours?: number
          id?: string
          overtime_date?: string
          reason?: string
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["leave_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payroll: {
        Row: {
          allowance: number
          basic_salary: number
          bonus_lainnya: number
          bonus_tahunan: number
          bpjs_jht_employer: number
          bpjs_jkk_employer: number
          bpjs_jkm_employer: number
          bpjs_jp_employer: number
          bpjs_kes_employer: number
          bpjs_kesehatan: number
          bpjs_ketenagakerjaan: number
          bruto_income: number
          created_at: string
          deduction_notes: string | null
          id: string
          insentif_kinerja: number
          insentif_penjualan: number
          loan_deduction: number
          netto_income: number
          other_deduction: number
          overtime_hours: number
          overtime_total: number
          pengembalian_employee: number
          period_id: string
          pkp: number
          pph21_mode: string
          pph21_monthly: number
          pph21_ter_rate: number | null
          ptkp_status: string
          ptkp_value: number
          take_home_pay: number
          thr: number
          tunjangan_jabatan: number
          tunjangan_kesehatan: number
          tunjangan_komunikasi: number
          tunjangan_operasional: number
          user_id: string
        }
        Insert: {
          allowance?: number
          basic_salary?: number
          bonus_lainnya?: number
          bonus_tahunan?: number
          bpjs_jht_employer?: number
          bpjs_jkk_employer?: number
          bpjs_jkm_employer?: number
          bpjs_jp_employer?: number
          bpjs_kes_employer?: number
          bpjs_kesehatan?: number
          bpjs_ketenagakerjaan?: number
          bruto_income?: number
          created_at?: string
          deduction_notes?: string | null
          id?: string
          insentif_kinerja?: number
          insentif_penjualan?: number
          loan_deduction?: number
          netto_income?: number
          other_deduction?: number
          overtime_hours?: number
          overtime_total?: number
          pengembalian_employee?: number
          period_id: string
          pkp?: number
          pph21_mode?: string
          pph21_monthly?: number
          pph21_ter_rate?: number | null
          ptkp_status?: string
          ptkp_value?: number
          take_home_pay?: number
          thr?: number
          tunjangan_jabatan?: number
          tunjangan_kesehatan?: number
          tunjangan_komunikasi?: number
          tunjangan_operasional?: number
          user_id: string
        }
        Update: {
          allowance?: number
          basic_salary?: number
          bonus_lainnya?: number
          bonus_tahunan?: number
          bpjs_jht_employer?: number
          bpjs_jkk_employer?: number
          bpjs_jkm_employer?: number
          bpjs_jp_employer?: number
          bpjs_kes_employer?: number
          bpjs_kesehatan?: number
          bpjs_ketenagakerjaan?: number
          bruto_income?: number
          created_at?: string
          deduction_notes?: string | null
          id?: string
          insentif_kinerja?: number
          insentif_penjualan?: number
          loan_deduction?: number
          netto_income?: number
          other_deduction?: number
          overtime_hours?: number
          overtime_total?: number
          pengembalian_employee?: number
          period_id?: string
          pkp?: number
          pph21_mode?: string
          pph21_monthly?: number
          pph21_ter_rate?: number | null
          ptkp_status?: string
          ptkp_value?: number
          take_home_pay?: number
          thr?: number
          tunjangan_jabatan?: number
          tunjangan_kesehatan?: number
          tunjangan_komunikasi?: number
          tunjangan_operasional?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "payroll_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_audit_logs: {
        Row: {
          action_type: string
          affected_user_id: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          id: string
          performed_by: string
          period_id: string
          period_month: number
          period_year: number
          reason: string
        }
        Insert: {
          action_type: string
          affected_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          id?: string
          performed_by: string
          period_id: string
          period_month: number
          period_year: number
          reason: string
        }
        Update: {
          action_type?: string
          affected_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          id?: string
          performed_by?: string
          period_id?: string
          period_month?: number
          period_year?: number
          reason?: string
        }
        Relationships: []
      }
      payroll_overrides: {
        Row: {
          bonus_lainnya: number
          bonus_tahunan: number
          created_at: string
          deduction_notes: string | null
          id: string
          insentif_kinerja: number
          insentif_penjualan: number
          loan_deduction: number
          other_deduction: number
          overtime_override: number
          pengembalian_employee: number
          period_month: number
          period_year: number
          thr: number
          tunjangan_kehadiran: number
          tunjangan_kesehatan: number
          updated_at: string
          user_id: string
        }
        Insert: {
          bonus_lainnya?: number
          bonus_tahunan?: number
          created_at?: string
          deduction_notes?: string | null
          id?: string
          insentif_kinerja?: number
          insentif_penjualan?: number
          loan_deduction?: number
          other_deduction?: number
          overtime_override?: number
          pengembalian_employee?: number
          period_month: number
          period_year: number
          thr?: number
          tunjangan_kehadiran?: number
          tunjangan_kesehatan?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          bonus_lainnya?: number
          bonus_tahunan?: number
          created_at?: string
          deduction_notes?: string | null
          id?: string
          insentif_kinerja?: number
          insentif_penjualan?: number
          loan_deduction?: number
          other_deduction?: number
          overtime_override?: number
          pengembalian_employee?: number
          period_month?: number
          period_year?: number
          thr?: number
          tunjangan_kehadiran?: number
          tunjangan_kesehatan?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payroll_periods: {
        Row: {
          created_at: string
          id: string
          month: number
          status: string
          year: number
        }
        Insert: {
          created_at?: string
          id?: string
          month: number
          status?: string
          year: number
        }
        Update: {
          created_at?: string
          id?: string
          month?: number
          status?: string
          year?: number
        }
        Relationships: []
      }
      pph21_ter_rates: {
        Row: {
          bruto_max: number
          bruto_min: number
          created_at: string
          id: string
          kategori_ptkp: string
          tarif_efektif: number
          updated_at: string
        }
        Insert: {
          bruto_max?: number
          bruto_min?: number
          created_at?: string
          id?: string
          kategori_ptkp: string
          tarif_efektif?: number
          updated_at?: string
        }
        Update: {
          bruto_max?: number
          bruto_min?: number
          created_at?: string
          id?: string
          kategori_ptkp?: string
          tarif_efektif?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address: string | null
          annual_leave_quota: number | null
          bank_account_number: string | null
          bank_name: string | null
          basic_salary: number | null
          bpjs_kesehatan_enabled: boolean
          bpjs_ketenagakerjaan_enabled: boolean
          contract_type: string
          created_at: string
          departemen: string
          email: string
          fcm_token: string | null
          full_name: string
          id: string
          jabatan: string
          join_date: string
          nik: string
          npwp: string | null
          phone: string | null
          photo_url: string | null
          ptkp_status: string | null
          remaining_leave: number | null
          resign_date: string | null
          status: string | null
          tunjangan_jabatan: number | null
          tunjangan_komunikasi: number | null
          tunjangan_operasional: number | null
          updated_at: string
          work_type: string
        }
        Insert: {
          address?: string | null
          annual_leave_quota?: number | null
          bank_account_number?: string | null
          bank_name?: string | null
          basic_salary?: number | null
          bpjs_kesehatan_enabled?: boolean
          bpjs_ketenagakerjaan_enabled?: boolean
          contract_type?: string
          created_at?: string
          departemen: string
          email: string
          fcm_token?: string | null
          full_name: string
          id: string
          jabatan: string
          join_date?: string
          nik: string
          npwp?: string | null
          phone?: string | null
          photo_url?: string | null
          ptkp_status?: string | null
          remaining_leave?: number | null
          resign_date?: string | null
          status?: string | null
          tunjangan_jabatan?: number | null
          tunjangan_komunikasi?: number | null
          tunjangan_operasional?: number | null
          updated_at?: string
          work_type?: string
        }
        Update: {
          address?: string | null
          annual_leave_quota?: number | null
          bank_account_number?: string | null
          bank_name?: string | null
          basic_salary?: number | null
          bpjs_kesehatan_enabled?: boolean
          bpjs_ketenagakerjaan_enabled?: boolean
          contract_type?: string
          created_at?: string
          departemen?: string
          email?: string
          fcm_token?: string | null
          full_name?: string
          id?: string
          jabatan?: string
          join_date?: string
          nik?: string
          npwp?: string | null
          phone?: string | null
          photo_url?: string | null
          ptkp_status?: string | null
          remaining_leave?: number | null
          resign_date?: string | null
          status?: string | null
          tunjangan_jabatan?: number | null
          tunjangan_komunikasi?: number | null
          tunjangan_operasional?: number | null
          updated_at?: string
          work_type?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_business_travel_request: {
        Args: { document_url_param?: string; request_id: string }
        Returns: undefined
      }
      approve_leave_request: {
        Args: { notes?: string; request_id: string }
        Returns: undefined
      }
      approve_overtime_request: {
        Args: { notes?: string; request_id: string }
        Returns: undefined
      }
      get_biaya_jabatan_config: { Args: never; Returns: Json }
      get_bpjs_config: { Args: never; Returns: Json }
      get_effective_work_hours: { Args: never; Returns: Json }
      get_low_leave_quota_employees: {
        Args: { threshold?: number }
        Returns: {
          full_name: string
          remaining_leave: number
          user_id: string
        }[]
      }
      get_office_locations: { Args: never; Returns: Json }
      get_pph21_brackets_config: { Args: never; Returns: Json }
      get_ptkp_config: { Args: never; Returns: Json }
      get_work_hours: { Args: never; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      reject_business_travel_request: {
        Args: { reason: string; request_id: string }
        Returns: undefined
      }
      reject_leave_request: {
        Args: { reason: string; request_id: string }
        Returns: undefined
      }
      reject_overtime_request: {
        Args: { reason: string; request_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "employee" | "hr"
      attendance_status: "hadir" | "terlambat" | "pulang_cepat" | "tidak_hadir"
      leave_status: "pending" | "approved" | "rejected"
      leave_type: "cuti_tahunan" | "izin" | "sakit" | "lupa_absen"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "employee", "hr"],
      attendance_status: ["hadir", "terlambat", "pulang_cepat", "tidak_hadir"],
      leave_status: ["pending", "approved", "rejected"],
      leave_type: ["cuti_tahunan", "izin", "sakit", "lupa_absen"],
    },
  },
} as const
