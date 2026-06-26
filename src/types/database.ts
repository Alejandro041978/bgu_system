export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          role_id: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          role_id?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          avatar_url?: string | null
          role_id?: string | null
          is_active?: boolean
          updated_at?: string
        }
      }
      roles: {
        Row: {
          id: string
          name: string
          description: string | null
          permissions: Json
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          permissions?: Json
          created_at?: string
        }
        Update: {
          name?: string
          description?: string | null
          permissions?: Json
        }
      }
      zoho_tokens: {
        Row: {
          id: string
          access_token: string
          refresh_token: string
          expires_at: string
          organization_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          access_token: string
          refresh_token: string
          expires_at: string
          organization_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          refresh_token?: string
          expires_at?: string
          updated_at?: string
        }
      }
      ticket_ai_reviews: {
        Row: {
          id: string
          ticket_id: string
          agent_id: string | null
          score: number
          sentiment: string
          response_quality: string
          empathy_score: number
          resolution_score: number
          professionalism_score: number
          feedback: string
          suggestions: string | null
          reviewed_at: string
          created_at: string
        }
        Insert: {
          id?: string
          ticket_id: string
          agent_id?: string | null
          score: number
          sentiment: string
          response_quality: string
          empathy_score: number
          resolution_score: number
          professionalism_score: number
          feedback: string
          suggestions?: string | null
          reviewed_at?: string
          created_at?: string
        }
        Update: {
          score?: number
          sentiment?: string
          response_quality?: string
          empathy_score?: number
          resolution_score?: number
          professionalism_score?: number
          feedback?: string
          suggestions?: string | null
        }
      }
      quality_months: {
        Row: {
          id: string
          name: string
          start_date: string
          end_date: string
          calendar_month: number
          calendar_year: number
          is_closed: boolean
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          start_date: string
          end_date: string
          calendar_month: number
          calendar_year: number
          is_closed?: boolean
          created_at?: string
        }
        Update: {
          name?: string
          start_date?: string
          end_date?: string
          is_closed?: boolean
        }
      }
      collaborator_kpis: {
        Row: {
          id: string
          profile_id: string
          quality_month_id: string
          kpi_type: string
          target_value: number
          actual_value: number | null
          score: number | null
          bonus_eligible: boolean
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          quality_month_id: string
          kpi_type: string
          target_value: number
          actual_value?: number | null
          score?: number | null
          bonus_eligible?: boolean
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          actual_value?: number | null
          score?: number | null
          bonus_eligible?: boolean
          notes?: string | null
          updated_at?: string
        }
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
