// ユーザー・認証
export type UserRole = 'admin' | 'staff' | 'sales';

export interface User {
  id: string;
  name: string;
  role: UserRole;
  email: string;
  phone?: string;
  avatar_url?: string;
  line_user_id?: string;
  status: 'active' | 'retired';
  can_register_project?: boolean;
}

// 案件
export type ProjectStatus =
  | 'inquiry'
  | 'estimate'
  | 'followup_status'
  | 'contract'
  | 'in_progress'
  | 'completed'
  | 'lost';

export interface Project {
  id: string;
  project_number: string;
  customer_name: string;
  customer_name_kana?: string;
  postal_code?: string;
  address: string;
  phone: string;
  email?: string;
  work_description: string;
  work_type: string[];
  estimated_amount: number;
  contract_amount?: number;
  acquisition_route: string;
  assigned_to: string;
  assigned_to_name?: string;
  status: ProjectStatus;
  inquiry_date: string;
  planned_budget?: number;
  actual_cost?: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

// 経費
export interface Expense {
  id: string;
  project_id?: string;
  project_number?: string;
  customer_name?: string;
  amount: number;
  date: string;
  category: string;
  memo?: string;
  receipt_url?: string;
  user_id: string;
  user_name?: string;
  created_at: string;
}

export type ExpenseCategory =
  | '材料費'
  | '交通費'
  | '外注費'
  | '消耗品費'
  | '飲食費'
  | 'その他';

// 出退勤
export interface Attendance {
  id: string;
  user_id: string;
  date: string;
  clock_in?: string;
  clock_out?: string;
  created_at: string;
  updated_at: string;
}

export type AttendanceType = 'clock_in' | 'clock_out';

export interface AttendanceLog {
  time: string;
  type: AttendanceType;
  label: string;
}

// 日報
export interface Report {
  id: string;
  project_id: string;
  report_date: string;
  content: string;
  photo_urls?: string[];
  created_by: string;
  created_at: string;
}

// 現場写真
export type PhotoCategory =
  | '契約前'
  | '現調'
  | '施工前'
  | '下地'
  | '施工中'
  | '施工後'
  | '完工'
  | 'その他';

export interface SitePhoto {
  id: string;
  project_id: string;
  category: PhotoCategory;
  work_type?: string;
  memo?: string;
  photo_date: string;
  drive_url?: string;
  uploaded_by: string;
  created_at: string;
}

// 集計
export interface ProjectCostRatio {
  project_number: string;
  customer_name: string;
  contract_amount: number;
  planned_budget_ratio: number;
  actual_cost_ratio: number;
  estimated_cost_ratio: number;
}

// AI候補
export interface AiCandidate {
  project_id: string;
  project_number: string;
  customer_name: string;
  confidence: number;
  reason: string;
}

// トースト
export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
}
