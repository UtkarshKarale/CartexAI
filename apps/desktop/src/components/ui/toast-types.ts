export interface ToastEntry {
  id: string
  title: string
  description?: string
  variant?: 'default' | 'success' | 'warning' | 'destructive'
}

