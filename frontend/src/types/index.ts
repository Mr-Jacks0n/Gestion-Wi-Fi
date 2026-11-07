/* ============================================================
   Adven's Manager — TypeScript type definitions
   ============================================================ */

export interface User {
  id: number;
  username: string;
  full_name: string;
  phone: string;
  email: string | null;
  role: 'admin' | 'vendor' | 'technician';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserWithStats extends User {
  total_sales: number;
  total_revenue: number;
  stock_count: number;
}

export interface SubscriptionType {
  id: number;
  name: string;
  duration_hours: number;
  price: number;
  is_active: boolean;
  created_at: string;
}

export interface Batch {
  id: number;
  reference: string;
  admin_id: number;
  subscription_type_id: number;
  total_tickets: number;
  notes: string | null;
  created_at: string;
  subscription_type?: SubscriptionType;
  admin_name?: string;
}

export interface BatchUpdate {
  reference?: string;
  subscription_type_id?: number;
  notes?: string | null;
}

export interface Ticket {
  id: number;
  code: string;
  batch_id: number;
  subscription_type_id: number;
  status: 'available' | 'assigned' | 'sold';
  assigned_to: number | null;
  assigned_at: string | null;
  sold_at: string | null;
  subscription_type?: SubscriptionType;
  assigned_user_name?: string;
  batch_reference?: string;
}

export interface Sale {
  id: number;
  ticket_id: number | null;
  vendor_id: number;
  client_name: string | null;
  client_phone: string | null;
  payment_method: string;
  amount: number;
  created_at: string;
  is_cancelled: boolean;
  cancelled_by: number | null;
  cancel_reason: string | null;
  cancelled_at: string | null;
  ticket_code?: string;
  vendor_name?: string;
  subscription_type_name?: string;
  subscription_duration_hours?: number;
  batch_reference?: string;
  is_paid: boolean;
  paid_at: string | null;
  ticket_status?: string;
}

export interface ResupplyRequest {
  id: number;
  vendor_id: number;
  subscription_type_id: number;
  quantity: number;
  status: 'pending' | 'approved' | 'rejected';
  processed_by: number | null;
  rejection_reason: string | null;
  created_at: string;
  processed_at: string | null;
  vendor_name?: string;
  subscription_type_name?: string;
}

export interface PaymentMethod {
  id: number;
  name: string;
  is_active: boolean;
  wave_merchant_number: string | null;
  wave_qr_image_path: string | null;
}

export interface DashboardStats {
  central_stock: number;
  vendor_stock: number;
  today_sales: number;
  today_revenue: number;
  total_revenue: number;
  cash_payments: number;
  wave_payments: number;
  total_cash_payments: number;
  total_wave_payments: number;
  pending_requests: number;
  total_vendors: number;
  total_tickets: number;
  total_sold: number;
  cash_balance: number;
  wave_balance: number;
  global_balance: number;
  total_defective: number;
  total_compensation: number;
  top_client_name?: string | null;
  top_client_tickets?: number;
  top_vendor_name?: string | null;
  top_vendor_tickets?: number;
  top_subscription_type_name?: string | null;
  top_subscription_type_tickets?: number;
  top_day_name?: string | null;
  top_day_tickets?: number;
  vendor_performance?: {
    vendor_id: number;
    vendor_name: string;
    sales_count: number;
    revenue: number;
  }[] | null;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface StockSummaryItem {
  subscription_type: SubscriptionType;
  available: number;
  assigned: number;
  sold: number;
}

export interface AuditLog {
  id: number;
  user_id: number;
  user_name: string | null;
  action: string;
  entity_type: string;
  entity_id: number | null;
  details: Record<string, any> | null;
  ip_address: string | null;
  created_at: string;
}
