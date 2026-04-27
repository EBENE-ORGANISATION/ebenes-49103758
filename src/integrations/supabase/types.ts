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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_state: {
        Row: {
          created_at: string
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          changes: Json | null
          created_at: string
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
          user_email: string | null
          user_id: string | null
          value_after: Json | null
          value_before: Json | null
        }
        Insert: {
          action: string
          changes?: Json | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
          user_email?: string | null
          user_id?: string | null
          value_after?: Json | null
          value_before?: Json | null
        }
        Update: {
          action?: string
          changes?: Json | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
          user_email?: string | null
          user_id?: string | null
          value_after?: Json | null
          value_before?: Json | null
        }
        Relationships: []
      }
      cross_service_grants: {
        Row: {
          created_at: string
          expires_at: string
          granted_at: string
          granted_by: string | null
          id: string
          level: string
          note: string | null
          service: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          level?: string
          note?: string | null
          service: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          level?: string
          note?: string | null
          service?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      permission_overrides: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          level: Database["public"]["Enums"]["access_level"]
          module: Database["public"]["Enums"]["app_module"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          level: Database["public"]["Enums"]["access_level"]
          module: Database["public"]["Enums"]["app_module"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          id?: string
          level?: Database["public"]["Enums"]["access_level"]
          module?: Database["public"]["Enums"]["app_module"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          actif: boolean
          created_at: string
          email: string | null
          id: string
          nom: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          actif?: boolean
          created_at?: string
          email?: string | null
          id?: string
          nom?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          actif?: boolean
          created_at?: string
          email?: string | null
          id?: string
          nom?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      societe_config: {
        Row: {
          adresse: string | null
          couleur_accent: string | null
          couleur_primaire: string | null
          couleur_secondaire: string | null
          email: string | null
          logo_url: string | null
          mention_contrat: string | null
          mention_facture: string | null
          module_fiscalite: boolean
          module_grh: boolean
          module_immobilisations: boolean
          module_stock: boolean
          nif: string | null
          police: string | null
          rccm: string | null
          site_web: string | null
          societe_id: string
          telephone: string | null
          theme_custom: Json
          updated_at: string
        }
        Insert: {
          adresse?: string | null
          couleur_accent?: string | null
          couleur_primaire?: string | null
          couleur_secondaire?: string | null
          email?: string | null
          logo_url?: string | null
          mention_contrat?: string | null
          mention_facture?: string | null
          module_fiscalite?: boolean
          module_grh?: boolean
          module_immobilisations?: boolean
          module_stock?: boolean
          nif?: string | null
          police?: string | null
          rccm?: string | null
          site_web?: string | null
          societe_id: string
          telephone?: string | null
          theme_custom?: Json
          updated_at?: string
        }
        Update: {
          adresse?: string | null
          couleur_accent?: string | null
          couleur_primaire?: string | null
          couleur_secondaire?: string | null
          email?: string | null
          logo_url?: string | null
          mention_contrat?: string | null
          mention_facture?: string | null
          module_fiscalite?: boolean
          module_grh?: boolean
          module_immobilisations?: boolean
          module_stock?: boolean
          nif?: string | null
          police?: string | null
          rccm?: string | null
          site_web?: string | null
          societe_id?: string
          telephone?: string | null
          theme_custom?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "societe_config_societe_id_fkey"
            columns: ["societe_id"]
            isOneToOne: true
            referencedRelation: "societes"
            referencedColumns: ["id"]
          },
        ]
      }
      societes: {
        Row: {
          adresse: string
          couleur_primaire: string
          couleur_secondaire: string
          created_at: string
          created_by: string | null
          email: string
          fonction_representant: string
          id: string
          logo_url: string
          mention_legale_pied: string
          nif: string
          nom: string
          plan: string
          rccm: string
          representant: string
          site_web: string
          slogan: string
          slug: string | null
          statut: string
          telephone: string
          updated_at: string
        }
        Insert: {
          adresse?: string
          couleur_primaire?: string
          couleur_secondaire?: string
          created_at?: string
          created_by?: string | null
          email?: string
          fonction_representant?: string
          id?: string
          logo_url?: string
          mention_legale_pied?: string
          nif?: string
          nom: string
          plan?: string
          rccm?: string
          representant?: string
          site_web?: string
          slogan?: string
          slug?: string | null
          statut?: string
          telephone?: string
          updated_at?: string
        }
        Update: {
          adresse?: string
          couleur_primaire?: string
          couleur_secondaire?: string
          created_at?: string
          created_by?: string | null
          email?: string
          fonction_representant?: string
          id?: string
          logo_url?: string
          mention_legale_pied?: string
          nif?: string
          nom?: string
          plan?: string
          rccm?: string
          representant?: string
          site_web?: string
          slogan?: string
          slug?: string | null
          statut?: string
          telephone?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_feature_access: {
        Row: {
          created_at: string
          enabled: boolean
          feature: Database["public"]["Enums"]["header_feature"]
          granted_by: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          feature: Database["public"]["Enums"]["header_feature"]
          granted_by?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          feature?: Database["public"]["Enums"]["header_feature"]
          granted_by?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          service: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          service?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          service?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_societes: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          societe_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          societe_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          societe_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_societes_societe_id_fkey"
            columns: ["societe_id"]
            isOneToOne: false
            referencedRelation: "societes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      app_state_societe_id: { Args: { _key: string }; Returns: string }
      has_active_chef_grant: {
        Args: { _service: string; _user_id: string }
        Returns: boolean
      }
      has_active_grant: {
        Args: { _service: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_societe_access: {
        Args: { _societe_id: string; _user_id: string }
        Returns: boolean
      }
      in_service_compta: { Args: { _user_id: string }; Returns: boolean }
      in_service_grh: { Args: { _user_id: string }; Returns: boolean }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_admin_general: { Args: { _user_id: string }; Returns: boolean }
      is_chef: { Args: { _user_id: string }; Returns: boolean }
      is_chef_compta: { Args: { _user_id: string }; Returns: boolean }
      is_chef_grh: { Args: { _user_id: string }; Returns: boolean }
      is_employe: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      access_level: "none" | "read" | "write" | "validate"
      app_module:
        | "dashboard"
        | "compta"
        | "factures"
        | "stock"
        | "immobilisations"
        | "fiscalite"
        | "parametres_sociaux"
        | "grh"
        | "outils_admin"
      app_role:
        | "admin"
        | "rh"
        | "comptable"
        | "saisie"
        | "chef_compta"
        | "membre_compta"
        | "chef_grh"
        | "membre_grh"
        | "dashboard_viewer"
        | "employe"
        | "admin_general"
      header_feature:
        | "alertes"
        | "recap_annuel"
        | "archives"
        | "json_io"
        | "users_admin"
        | "audit_log"
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
      access_level: ["none", "read", "write", "validate"],
      app_module: [
        "dashboard",
        "compta",
        "factures",
        "stock",
        "immobilisations",
        "fiscalite",
        "parametres_sociaux",
        "grh",
        "outils_admin",
      ],
      app_role: [
        "admin",
        "rh",
        "comptable",
        "saisie",
        "chef_compta",
        "membre_compta",
        "chef_grh",
        "membre_grh",
        "dashboard_viewer",
        "employe",
        "admin_general",
      ],
      header_feature: [
        "alertes",
        "recap_annuel",
        "archives",
        "json_io",
        "users_admin",
        "audit_log",
      ],
    },
  },
} as const
