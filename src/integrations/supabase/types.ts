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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      courses: {
        Row: {
          created_at: string
          description: string | null
          featured: boolean
          featured_rank: number
          id: string
          owner_id: string
          published: boolean
          tags: string[]
          thumbnail_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          featured?: boolean
          featured_rank?: number
          id?: string
          owner_id: string
          published?: boolean
          tags?: string[]
          thumbnail_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          featured?: boolean
          featured_rank?: number
          id?: string
          owner_id?: string
          published?: boolean
          tags?: string[]
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      exam_launches: {
        Row: {
          event_id: string
          id: string
          launched_at: string
          user_id: string
        }
        Insert: {
          event_id: string
          id?: string
          launched_at?: string
          user_id: string
        }
        Update: {
          event_id?: string
          id?: string
          launched_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_launches_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "timeline_events"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string
          email: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name: string
          email: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string
          email?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      quiz_attempts: {
        Row: {
          created_at: string
          event_id: string
          id: string
          is_correct: boolean
          selected_index: number
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          is_correct: boolean
          selected_index: number
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          is_correct?: boolean
          selected_index?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_attempts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "timeline_events"
            referencedColumns: ["id"]
          },
        ]
      }
      quizzes: {
        Row: {
          correct_index: number
          created_at: string
          event_id: string
          id: string
          options: string[]
          question: string
          updated_at: string
        }
        Insert: {
          correct_index: number
          created_at?: string
          event_id: string
          id?: string
          options: string[]
          question: string
          updated_at?: string
        }
        Update: {
          correct_index?: number
          created_at?: string
          event_id?: string
          id?: string
          options?: string[]
          question?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quizzes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "timeline_events"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_invites: {
        Row: {
          created_at: string
          email: string
          id: string
          invited_by: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          invited_by?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
        }
        Relationships: []
      }
      teacher_role_requests: {
        Row: {
          created_at: string
          id: string
          message: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      timeline_events: {
        Row: {
          at_seconds: number
          created_at: string
          id: string
          owner_id: string
          payload: Json
          required: boolean
          title: string | null
          type: Database["public"]["Enums"]["timeline_event_type"]
          updated_at: string
          video_id: string
        }
        Insert: {
          at_seconds: number
          created_at?: string
          id?: string
          owner_id: string
          payload?: Json
          required?: boolean
          title?: string | null
          type: Database["public"]["Enums"]["timeline_event_type"]
          updated_at?: string
          video_id: string
        }
        Update: {
          at_seconds?: number
          created_at?: string
          id?: string
          owner_id?: string
          payload?: Json
          required?: boolean
          title?: string | null
          type?: Database["public"]["Enums"]["timeline_event_type"]
          updated_at?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "timeline_events_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
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
          role: Database["public"]["Enums"]["app_role"]
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
      video_event_completions: {
        Row: {
          completed_at: string
          event_id: string
          id: string
          user_id: string
        }
        Insert: {
          completed_at?: string
          event_id: string
          id?: string
          user_id: string
        }
        Update: {
          completed_at?: string
          event_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_event_completions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "timeline_events"
            referencedColumns: ["id"]
          },
        ]
      }
      video_progress: {
        Row: {
          created_at: string
          id: string
          unlocked_until_seconds: number
          updated_at: string
          user_id: string
          video_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          unlocked_until_seconds?: number
          updated_at?: string
          user_id: string
          video_id: string
        }
        Update: {
          created_at?: string
          id?: string
          unlocked_until_seconds?: number
          updated_at?: string
          user_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_progress_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      videos: {
        Row: {
          course_id: string
          created_at: string
          description: string | null
          duration_seconds: number | null
          exam_url: string | null
          id: string
          lecture_sheet_url: string | null
          owner_id: string
          published: boolean
          simulation_url: string | null
          title: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          course_id: string
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          exam_url?: string | null
          id?: string
          lecture_sheet_url?: string | null
          owner_id: string
          published?: boolean
          simulation_url?: string | null
          title: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          course_id?: string
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          exam_url?: string | null
          id?: string
          lecture_sheet_url?: string | null
          owner_id?: string
          published?: boolean
          simulation_url?: string | null
          title?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "videos_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_my_roles: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "teacher" | "student"
      timeline_event_type: "quiz" | "simulation" | "exam"
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
      app_role: ["admin", "teacher", "student"],
      timeline_event_type: ["quiz", "simulation", "exam"],
    },
  },
} as const
