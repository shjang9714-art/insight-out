export type UserRole = 'user' | 'admin'

export type Department =
  | 'Enterprise사업부문'
  | 'SMB사업부문'
  | '공공사업부문'
  | '기술부문'
  | '마케팅부문'
  | '기타'

export type NewsletterFrequency = 'daily' | 'weekly' | 'none'

export interface UserProfile {
  id: string
  email: string
  name: string
  department: Department
  team: string
  position?: string
  role: UserRole
  created_at: string
  updated_at: string
}

export interface Service {
  id: string
  name: string
  description?: string
  icon?: string
  order: number
}

export interface UserService {
  user_id: string
  service_id: string
  is_pinned: boolean
}

export interface NewsletterSubscription {
  user_id: string
  frequency: NewsletterFrequency
  is_active: boolean
}

export interface OnboardingStep1 {
  name: string
  department: Department
  team: string
  position: string
}

export interface OnboardingStep2 {
  service_ids: string[]
}

export interface OnboardingStep3 {
  frequency: NewsletterFrequency
}
