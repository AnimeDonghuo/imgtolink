export interface User {
  user_id: number;
  created_at: Date;
  usage_count: number;
  last_error?: string;
}