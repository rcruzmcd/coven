export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      access_grants: {
        Row: {
          access_level: string;
          account_identifier: string | null;
          asset_id: string;
          created_at: string;
          created_by: string | null;
          expires_at: string | null;
          granted_at: string;
          granted_by: string | null;
          id: string;
          last_verified: string | null;
          notes: string | null;
          person_id: string;
          purpose: string | null;
          revoked_at: string | null;
          revoked_by: string | null;
          status: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          access_level: string;
          account_identifier?: string | null;
          asset_id: string;
          created_at?: string;
          created_by?: string | null;
          expires_at?: string | null;
          granted_at?: string;
          granted_by?: string | null;
          id?: string;
          last_verified?: string | null;
          notes?: string | null;
          person_id: string;
          purpose?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          access_level?: string;
          account_identifier?: string | null;
          asset_id?: string;
          created_at?: string;
          created_by?: string | null;
          expires_at?: string | null;
          granted_at?: string;
          granted_by?: string | null;
          id?: string;
          last_verified?: string | null;
          notes?: string | null;
          person_id?: string;
          purpose?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "access_grants_asset_id_fkey";
            columns: ["tenant_id", "asset_id"];
            isOneToOne: false;
            referencedRelation: "assets";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "access_grants_person_id_fkey";
            columns: ["tenant_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "access_grants_person_id_fkey";
            columns: ["tenant_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "access_grants_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "access_grants_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      agenda_template_versions: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          sections: Json;
          template_id: string;
          tenant_id: string;
          version: number;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          sections?: Json;
          template_id: string;
          tenant_id?: string;
          version: number;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          sections?: Json;
          template_id?: string;
          tenant_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "agenda_template_versions_template_id_fkey";
            columns: ["tenant_id", "template_id"];
            isOneToOne: false;
            referencedRelation: "agenda_templates";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "agenda_template_versions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agenda_template_versions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      agenda_templates: {
        Row: {
          created_at: string;
          created_by: string | null;
          current_version_id: string | null;
          description: string | null;
          id: string;
          is_active: boolean;
          key: string;
          name: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          current_version_id?: string | null;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          key: string;
          name: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          current_version_id?: string | null;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          key?: string;
          name?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "agenda_templates_current_version_id_fkey";
            columns: ["tenant_id", "current_version_id"];
            isOneToOne: false;
            referencedRelation: "agenda_template_versions";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "agenda_templates_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agenda_templates_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      agendas: {
        Row: {
          body_text: string | null;
          created_at: string;
          created_by: string;
          document_path: string | null;
          external_link: string | null;
          format: string;
          id: string;
          items: Json;
          meeting_id: string;
          new_business: Json;
          next_meeting_date: string | null;
          next_meeting_topics: string | null;
          ongoing_items: Json;
          parking_lot: Json;
          template_id: string | null;
          template_version_id: string | null;
          tenant_id: string;
          upcoming_dates: Json;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          body_text?: string | null;
          created_at?: string;
          created_by?: string;
          document_path?: string | null;
          external_link?: string | null;
          format?: string;
          id?: string;
          items?: Json;
          meeting_id: string;
          new_business?: Json;
          next_meeting_date?: string | null;
          next_meeting_topics?: string | null;
          ongoing_items?: Json;
          parking_lot?: Json;
          template_id?: string | null;
          template_version_id?: string | null;
          tenant_id?: string;
          upcoming_dates?: Json;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          body_text?: string | null;
          created_at?: string;
          created_by?: string;
          document_path?: string | null;
          external_link?: string | null;
          format?: string;
          id?: string;
          items?: Json;
          meeting_id?: string;
          new_business?: Json;
          next_meeting_date?: string | null;
          next_meeting_topics?: string | null;
          ongoing_items?: Json;
          parking_lot?: Json;
          template_id?: string | null;
          template_version_id?: string | null;
          tenant_id?: string;
          upcoming_dates?: Json;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "agendas_meeting_id_fkey";
            columns: ["tenant_id", "meeting_id"];
            isOneToOne: false;
            referencedRelation: "governance_meetings";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "agendas_template_id_fkey";
            columns: ["tenant_id", "template_id"];
            isOneToOne: false;
            referencedRelation: "agenda_templates";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "agendas_template_version_id_fkey";
            columns: ["tenant_id", "template_version_id"];
            isOneToOne: false;
            referencedRelation: "agenda_template_versions";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "agendas_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agendas_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      annual_requirements: {
        Row: {
          body_text: string | null;
          completed_at: string | null;
          created_at: string;
          created_by: string;
          document_path: string | null;
          due_date: string;
          external_link: string | null;
          id: string;
          name: string;
          responsible_person_id: string | null;
          status: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          body_text?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string;
          document_path?: string | null;
          due_date: string;
          external_link?: string | null;
          id?: string;
          name: string;
          responsible_person_id?: string | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          body_text?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string;
          document_path?: string | null;
          due_date?: string;
          external_link?: string | null;
          id?: string;
          name?: string;
          responsible_person_id?: string | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "annual_requirements_responsible_person_id_fkey";
            columns: ["tenant_id", "responsible_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "annual_requirements_responsible_person_id_fkey";
            columns: ["tenant_id", "responsible_person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "annual_requirements_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "annual_requirements_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      app_settings: {
        Row: {
          id: string;
          key: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
          value: Json;
        };
        Insert: {
          id?: string;
          key: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          value: Json;
        };
        Update: {
          id?: string;
          key?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          value?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "app_settings_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "app_settings_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      article_categories: {
        Row: {
          created_at: string;
          draft_position: number | null;
          draft_updated_at: string | null;
          draft_updated_by: string | null;
          draft_value: Json | null;
          has_draft: boolean;
          id: string;
          pack_id: string | null;
          position: number;
          published_at: string | null;
          published_by: string | null;
          slug: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
          value: Json | null;
        };
        Insert: {
          created_at?: string;
          draft_position?: number | null;
          draft_updated_at?: string | null;
          draft_updated_by?: string | null;
          draft_value?: Json | null;
          has_draft?: boolean;
          id?: string;
          pack_id?: string | null;
          position?: number;
          published_at?: string | null;
          published_by?: string | null;
          slug: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          value?: Json | null;
        };
        Update: {
          created_at?: string;
          draft_position?: number | null;
          draft_updated_at?: string | null;
          draft_updated_by?: string | null;
          draft_value?: Json | null;
          has_draft?: boolean;
          id?: string;
          pack_id?: string | null;
          position?: number;
          published_at?: string | null;
          published_by?: string | null;
          slug?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          value?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "article_categories_pack_fkey";
            columns: ["tenant_id", "pack_id"];
            isOneToOne: false;
            referencedRelation: "content_packs";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "article_categories_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "article_categories_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      articles: {
        Row: {
          anchor: string;
          category_id: string;
          created_at: string;
          draft_position: number | null;
          draft_updated_at: string | null;
          draft_updated_by: string | null;
          draft_value: Json | null;
          has_draft: boolean;
          id: string;
          position: number;
          published_at: string | null;
          published_by: string | null;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
          value: Json | null;
        };
        Insert: {
          anchor: string;
          category_id: string;
          created_at?: string;
          draft_position?: number | null;
          draft_updated_at?: string | null;
          draft_updated_by?: string | null;
          draft_value?: Json | null;
          has_draft?: boolean;
          id?: string;
          position?: number;
          published_at?: string | null;
          published_by?: string | null;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          value?: Json | null;
        };
        Update: {
          anchor?: string;
          category_id?: string;
          created_at?: string;
          draft_position?: number | null;
          draft_updated_at?: string | null;
          draft_updated_by?: string | null;
          draft_value?: Json | null;
          has_draft?: boolean;
          id?: string;
          position?: number;
          published_at?: string | null;
          published_by?: string | null;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          value?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "articles_tenant_id_category_id_fkey";
            columns: ["tenant_id", "category_id"];
            isOneToOne: false;
            referencedRelation: "article_categories";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "articles_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "articles_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      artwork_submission_images: {
        Row: {
          byte_size: number | null;
          content_type: string;
          created_at: string;
          id: string;
          position: number;
          storage_path: string;
          submission_id: string;
          tenant_id: string;
          thumb_path: string;
        };
        Insert: {
          byte_size?: number | null;
          content_type: string;
          created_at?: string;
          id?: string;
          position?: number;
          storage_path: string;
          submission_id: string;
          tenant_id?: string;
          thumb_path: string;
        };
        Update: {
          byte_size?: number | null;
          content_type?: string;
          created_at?: string;
          id?: string;
          position?: number;
          storage_path?: string;
          submission_id?: string;
          tenant_id?: string;
          thumb_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: "artwork_submission_images_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "artwork_submission_images_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "artwork_submission_images_tenant_id_submission_id_fkey";
            columns: ["tenant_id", "submission_id"];
            isOneToOne: false;
            referencedRelation: "artwork_submissions";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      artwork_submissions: {
        Row: {
          artist_statement: string | null;
          call_id: string;
          claimed_at: string | null;
          claimed_by_person_id: string | null;
          consented_at: string | null;
          consented_terms: string | null;
          created_at: string;
          credit_name: string | null;
          event_id: string | null;
          id: string;
          medium: string | null;
          portfolio_url: string | null;
          review_notes: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: string;
          submitter_email: string;
          submitter_name: string;
          tenant_id: string;
          title: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          artist_statement?: string | null;
          call_id: string;
          claimed_at?: string | null;
          claimed_by_person_id?: string | null;
          consented_at?: string | null;
          consented_terms?: string | null;
          created_at?: string;
          credit_name?: string | null;
          event_id?: string | null;
          id?: string;
          medium?: string | null;
          portfolio_url?: string | null;
          review_notes?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          submitter_email: string;
          submitter_name: string;
          tenant_id?: string;
          title?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          artist_statement?: string | null;
          call_id?: string;
          claimed_at?: string | null;
          claimed_by_person_id?: string | null;
          consented_at?: string | null;
          consented_terms?: string | null;
          created_at?: string;
          credit_name?: string | null;
          event_id?: string | null;
          id?: string;
          medium?: string | null;
          portfolio_url?: string | null;
          review_notes?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          submitter_email?: string;
          submitter_name?: string;
          tenant_id?: string;
          title?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "artwork_submissions_claimed_by_in_tenant";
            columns: ["tenant_id", "claimed_by_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "artwork_submissions_claimed_by_in_tenant";
            columns: ["tenant_id", "claimed_by_person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "artwork_submissions_tenant_id_call_id_fkey";
            columns: ["tenant_id", "call_id"];
            isOneToOne: false;
            referencedRelation: "event_artwork_calls";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "artwork_submissions_tenant_id_event_id_fkey";
            columns: ["tenant_id", "event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "artwork_submissions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "artwork_submissions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      assets: {
        Row: {
          backup_admin_person_id: string | null;
          category: string;
          created_at: string;
          created_by: string | null;
          credential_management_location: string;
          description: string | null;
          id: string;
          is_org_owned: boolean;
          last_reviewed: string | null;
          mfa_required: boolean;
          mfa_status: string;
          name: string;
          next_review: string | null;
          notes: string | null;
          owner_person_id: string | null;
          primary_admin_person_id: string | null;
          recovery_documented: boolean;
          recovery_owner_person_id: string | null;
          sensitivity: string;
          service_id: string;
          status: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
          url: string | null;
        };
        Insert: {
          backup_admin_person_id?: string | null;
          category: string;
          created_at?: string;
          created_by?: string | null;
          credential_management_location?: string;
          description?: string | null;
          id?: string;
          is_org_owned?: boolean;
          last_reviewed?: string | null;
          mfa_required?: boolean;
          mfa_status?: string;
          name: string;
          next_review?: string | null;
          notes?: string | null;
          owner_person_id?: string | null;
          primary_admin_person_id?: string | null;
          recovery_documented?: boolean;
          recovery_owner_person_id?: string | null;
          sensitivity?: string;
          service_id: string;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          url?: string | null;
        };
        Update: {
          backup_admin_person_id?: string | null;
          category?: string;
          created_at?: string;
          created_by?: string | null;
          credential_management_location?: string;
          description?: string | null;
          id?: string;
          is_org_owned?: boolean;
          last_reviewed?: string | null;
          mfa_required?: boolean;
          mfa_status?: string;
          name?: string;
          next_review?: string | null;
          notes?: string | null;
          owner_person_id?: string | null;
          primary_admin_person_id?: string | null;
          recovery_documented?: boolean;
          recovery_owner_person_id?: string | null;
          sensitivity?: string;
          service_id?: string;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "assets_backup_admin_person_id_fkey";
            columns: ["tenant_id", "backup_admin_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "assets_backup_admin_person_id_fkey";
            columns: ["tenant_id", "backup_admin_person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "assets_owner_person_id_fkey";
            columns: ["tenant_id", "owner_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "assets_owner_person_id_fkey";
            columns: ["tenant_id", "owner_person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "assets_primary_admin_person_id_fkey";
            columns: ["tenant_id", "primary_admin_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "assets_primary_admin_person_id_fkey";
            columns: ["tenant_id", "primary_admin_person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "assets_recovery_owner_person_id_fkey";
            columns: ["tenant_id", "recovery_owner_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "assets_recovery_owner_person_id_fkey";
            columns: ["tenant_id", "recovery_owner_person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "assets_service_id_fkey";
            columns: ["tenant_id", "service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "assets_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assets_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          id: string;
          new_data: Json | null;
          occurred_at: string;
          old_data: Json | null;
          record_id: string;
          redacted_at: string | null;
          table_name: string;
          tenant_id: string | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          id?: string;
          new_data?: Json | null;
          occurred_at?: string;
          old_data?: Json | null;
          record_id: string;
          redacted_at?: string | null;
          table_name: string;
          tenant_id?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          id?: string;
          new_data?: Json | null;
          occurred_at?: string;
          old_data?: Json | null;
          record_id?: string;
          redacted_at?: string | null;
          table_name?: string;
          tenant_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_log_table_name_fkey";
            columns: ["table_name"];
            isOneToOne: false;
            referencedRelation: "audited_tables";
            referencedColumns: ["table_name"];
          },
        ];
      };
      audited_tables: {
        Row: {
          pk_column: string;
          redacted_columns: string[];
          table_name: string;
        };
        Insert: {
          pk_column?: string;
          redacted_columns?: string[];
          table_name: string;
        };
        Update: {
          pk_column?: string;
          redacted_columns?: string[];
          table_name?: string;
        };
        Relationships: [];
      };
      auto_reply_templates: {
        Row: {
          enabled: boolean;
          id: string;
          kind: string;
          slots: Json;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          enabled?: boolean;
          id?: string;
          kind: string;
          slots?: Json;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          enabled?: boolean;
          id?: string;
          kind?: string;
          slots?: Json;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "auto_reply_templates_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "auto_reply_templates_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      board_members: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          is_active: boolean;
          notes: string | null;
          person_id: string;
          role_title: string;
          tenant_id: string;
          term_end: string | null;
          term_start: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string;
          id?: string;
          is_active?: boolean;
          notes?: string | null;
          person_id: string;
          role_title: string;
          tenant_id?: string;
          term_end?: string | null;
          term_start: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          is_active?: boolean;
          notes?: string | null;
          person_id?: string;
          role_title?: string;
          tenant_id?: string;
          term_end?: string | null;
          term_start?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "board_members_person_id_fkey";
            columns: ["tenant_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "board_members_person_id_fkey";
            columns: ["tenant_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "board_members_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "board_members_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      bylaws: {
        Row: {
          amendment_summary: string | null;
          body_text: string | null;
          created_at: string;
          created_by: string;
          document_path: string | null;
          effective_date: string;
          external_link: string | null;
          id: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
          version: string;
        };
        Insert: {
          amendment_summary?: string | null;
          body_text?: string | null;
          created_at?: string;
          created_by?: string;
          document_path?: string | null;
          effective_date: string;
          external_link?: string | null;
          id?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          version: string;
        };
        Update: {
          amendment_summary?: string | null;
          body_text?: string | null;
          created_at?: string;
          created_by?: string;
          document_path?: string | null;
          effective_date?: string;
          external_link?: string | null;
          id?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bylaws_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bylaws_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      calendar_categories: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          is_active: boolean;
          key: string;
          label: string;
          sort_order: number;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          key: string;
          label: string;
          sort_order?: number;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          key?: string;
          label?: string;
          sort_order?: number;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "calendar_categories_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calendar_categories_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      calendar_item_categories: {
        Row: {
          category: string;
          item_id: string;
          tenant_id: string;
        };
        Insert: {
          category: string;
          item_id: string;
          tenant_id?: string;
        };
        Update: {
          category?: string;
          item_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "calendar_item_categories_category_fkey";
            columns: ["tenant_id", "category"];
            isOneToOne: false;
            referencedRelation: "calendar_categories";
            referencedColumns: ["tenant_id", "key"];
          },
          {
            foreignKeyName: "calendar_item_categories_item_id_fkey";
            columns: ["tenant_id", "item_id"];
            isOneToOne: false;
            referencedRelation: "calendar_items";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "calendar_item_categories_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calendar_item_categories_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      calendar_item_programs: {
        Row: {
          item_id: string;
          program_id: string;
          tenant_id: string;
        };
        Insert: {
          item_id: string;
          program_id: string;
          tenant_id?: string;
        };
        Update: {
          item_id?: string;
          program_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "calendar_item_programs_item_id_fkey";
            columns: ["tenant_id", "item_id"];
            isOneToOne: false;
            referencedRelation: "calendar_items";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "calendar_item_programs_program_id_fkey";
            columns: ["tenant_id", "program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "calendar_item_programs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calendar_item_programs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      calendar_items: {
        Row: {
          calendar_status: string;
          created_at: string;
          created_by: string;
          decision: string | null;
          decision_note: string | null;
          ends_at: string | null;
          exceptions: Json;
          id: string;
          is_sensitive_topic: boolean;
          item_type: string;
          owner_id: string | null;
          priority_rationale: string | null;
          priority_tier: number;
          public_url: string | null;
          recurrence_end_day: number | null;
          recurrence_end_is_month_end: boolean;
          recurrence_end_month: number | null;
          recurrence_rule: string | null;
          recurrence_start_day: number | null;
          recurrence_start_month: number | null;
          region: string | null;
          series_key: string | null;
          source: string | null;
          starts_at: string;
          summary: string | null;
          tenant_id: string;
          time_zone: string;
          title: string;
          tone_guidance: string | null;
          updated_at: string;
          updated_by: string | null;
          visibility: string;
        };
        Insert: {
          calendar_status?: string;
          created_at?: string;
          created_by?: string;
          decision?: string | null;
          decision_note?: string | null;
          ends_at?: string | null;
          exceptions?: Json;
          id?: string;
          is_sensitive_topic?: boolean;
          item_type: string;
          owner_id?: string | null;
          priority_rationale?: string | null;
          priority_tier?: number;
          public_url?: string | null;
          recurrence_end_day?: number | null;
          recurrence_end_is_month_end?: boolean;
          recurrence_end_month?: number | null;
          recurrence_rule?: string | null;
          recurrence_start_day?: number | null;
          recurrence_start_month?: number | null;
          region?: string | null;
          series_key?: string | null;
          source?: string | null;
          starts_at: string;
          summary?: string | null;
          tenant_id?: string;
          time_zone: string;
          title: string;
          tone_guidance?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          visibility?: string;
        };
        Update: {
          calendar_status?: string;
          created_at?: string;
          created_by?: string;
          decision?: string | null;
          decision_note?: string | null;
          ends_at?: string | null;
          exceptions?: Json;
          id?: string;
          is_sensitive_topic?: boolean;
          item_type?: string;
          owner_id?: string | null;
          priority_rationale?: string | null;
          priority_tier?: number;
          public_url?: string | null;
          recurrence_end_day?: number | null;
          recurrence_end_is_month_end?: boolean;
          recurrence_end_month?: number | null;
          recurrence_rule?: string | null;
          recurrence_start_day?: number | null;
          recurrence_start_month?: number | null;
          region?: string | null;
          series_key?: string | null;
          source?: string | null;
          starts_at?: string;
          summary?: string | null;
          tenant_id?: string;
          time_zone?: string;
          title?: string;
          tone_guidance?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          visibility?: string;
        };
        Relationships: [
          {
            foreignKeyName: "calendar_items_owner_id_fkey";
            columns: ["tenant_id", "owner_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "calendar_items_owner_id_fkey";
            columns: ["tenant_id", "owner_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "calendar_items_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calendar_items_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      conduct_report_actions: {
        Row: {
          created_at: string;
          created_by: string | null;
          description: string;
          id: string;
          kind: string;
          lifted_on: string | null;
          report_id: string;
          taken_on: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          description: string;
          id?: string;
          kind: string;
          lifted_on?: string | null;
          report_id: string;
          taken_on: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          description?: string;
          id?: string;
          kind?: string;
          lifted_on?: string | null;
          report_id?: string;
          taken_on?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "conduct_report_actions_report_in_tenant";
            columns: ["tenant_id", "report_id"];
            isOneToOne: false;
            referencedRelation: "conduct_reports";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "conduct_report_actions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conduct_report_actions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      conduct_report_appeals: {
        Row: {
          created_at: string;
          created_by: string | null;
          decided_on: string | null;
          filed_on: string;
          grounds: string | null;
          id: string;
          outcome: string | null;
          report_id: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          decided_on?: string | null;
          filed_on: string;
          grounds?: string | null;
          id?: string;
          outcome?: string | null;
          report_id: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          decided_on?: string | null;
          filed_on?: string;
          grounds?: string | null;
          id?: string;
          outcome?: string | null;
          report_id?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "conduct_report_appeals_report_in_tenant";
            columns: ["tenant_id", "report_id"];
            isOneToOne: true;
            referencedRelation: "conduct_reports";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "conduct_report_appeals_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conduct_report_appeals_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      conduct_report_reviewers: {
        Row: {
          assigned_by: string | null;
          assigned_on: string;
          created_at: string;
          id: string;
          recusal_reason: string | null;
          recused_on: string | null;
          report_id: string;
          stage: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
          user_id: string;
        };
        Insert: {
          assigned_by?: string | null;
          assigned_on?: string;
          created_at?: string;
          id?: string;
          recusal_reason?: string | null;
          recused_on?: string | null;
          report_id: string;
          stage: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          user_id: string;
        };
        Update: {
          assigned_by?: string | null;
          assigned_on?: string;
          created_at?: string;
          id?: string;
          recusal_reason?: string | null;
          recused_on?: string | null;
          report_id?: string;
          stage?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conduct_report_reviewers_report_in_tenant";
            columns: ["tenant_id", "report_id"];
            isOneToOne: false;
            referencedRelation: "conduct_reports";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "conduct_report_reviewers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conduct_report_reviewers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      conduct_reports: {
        Row: {
          acknowledged_on: string | null;
          channel: string;
          closed_on: string | null;
          context: string | null;
          created_at: string;
          created_by: string | null;
          decided_on: string | null;
          event_id: string | null;
          id: string;
          outcome: string | null;
          received_on: string;
          reference: string;
          reporter_contact: string | null;
          reporter_kind: string;
          reporter_name: string | null;
          reporter_person_id: string | null;
          severity: string;
          status: string;
          subject_description: string | null;
          subject_person_id: string | null;
          summary: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          acknowledged_on?: string | null;
          channel: string;
          closed_on?: string | null;
          context?: string | null;
          created_at?: string;
          created_by?: string | null;
          decided_on?: string | null;
          event_id?: string | null;
          id?: string;
          outcome?: string | null;
          received_on: string;
          reference: string;
          reporter_contact?: string | null;
          reporter_kind: string;
          reporter_name?: string | null;
          reporter_person_id?: string | null;
          severity?: string;
          status?: string;
          subject_description?: string | null;
          subject_person_id?: string | null;
          summary: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          acknowledged_on?: string | null;
          channel?: string;
          closed_on?: string | null;
          context?: string | null;
          created_at?: string;
          created_by?: string | null;
          decided_on?: string | null;
          event_id?: string | null;
          id?: string;
          outcome?: string | null;
          received_on?: string;
          reference?: string;
          reporter_contact?: string | null;
          reporter_kind?: string;
          reporter_name?: string | null;
          reporter_person_id?: string | null;
          severity?: string;
          status?: string;
          subject_description?: string | null;
          subject_person_id?: string | null;
          summary?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "conduct_reports_event_in_tenant";
            columns: ["tenant_id", "event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "conduct_reports_reporter_in_tenant";
            columns: ["tenant_id", "reporter_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "conduct_reports_reporter_in_tenant";
            columns: ["tenant_id", "reporter_person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "conduct_reports_subject_in_tenant";
            columns: ["tenant_id", "subject_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "conduct_reports_subject_in_tenant";
            columns: ["tenant_id", "subject_person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "conduct_reports_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conduct_reports_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      conflict_of_interest_disclosures: {
        Row: {
          body_text: string | null;
          created_at: string;
          created_by: string;
          disclosure_year: number;
          document_path: string | null;
          external_link: string | null;
          id: string;
          notes: string | null;
          on_file_date: string | null;
          person_id: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          body_text?: string | null;
          created_at?: string;
          created_by?: string;
          disclosure_year: number;
          document_path?: string | null;
          external_link?: string | null;
          id?: string;
          notes?: string | null;
          on_file_date?: string | null;
          person_id: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          body_text?: string | null;
          created_at?: string;
          created_by?: string;
          disclosure_year?: number;
          document_path?: string | null;
          external_link?: string | null;
          id?: string;
          notes?: string | null;
          on_file_date?: string | null;
          person_id?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "conflict_of_interest_disclosures_person_id_fkey";
            columns: ["tenant_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "conflict_of_interest_disclosures_person_id_fkey";
            columns: ["tenant_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "conflict_of_interest_disclosures_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conflict_of_interest_disclosures_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      contact_messages: {
        Row: {
          claimed_at: string | null;
          claimed_by_person_id: string | null;
          created_at: string;
          email: string;
          id: string;
          message: string;
          name: string;
          status: string;
          tenant_id: string;
          topic: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          claimed_at?: string | null;
          claimed_by_person_id?: string | null;
          created_at?: string;
          email: string;
          id?: string;
          message: string;
          name: string;
          status?: string;
          tenant_id?: string;
          topic: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          claimed_at?: string | null;
          claimed_by_person_id?: string | null;
          created_at?: string;
          email?: string;
          id?: string;
          message?: string;
          name?: string;
          status?: string;
          tenant_id?: string;
          topic?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "contact_messages_claimed_by_in_tenant";
            columns: ["tenant_id", "claimed_by_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "contact_messages_claimed_by_in_tenant";
            columns: ["tenant_id", "claimed_by_person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "contact_messages_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contact_messages_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      content_opportunities: {
        Row: {
          calendar_item_id: string;
          content: string | null;
          content_status: string;
          created_at: string;
          created_by: string;
          draft_due_at: string | null;
          id: string;
          internal_notes: string | null;
          lead_time_days: number;
          owner_id: string | null;
          publish_due_at: string | null;
          review_due_at: string | null;
          reviewer_id: string | null;
          skip_reason: string | null;
          status_changed_at: string | null;
          status_changed_by: string | null;
          tenant_id: string;
          title: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          calendar_item_id: string;
          content?: string | null;
          content_status?: string;
          created_at?: string;
          created_by?: string;
          draft_due_at?: string | null;
          id?: string;
          internal_notes?: string | null;
          lead_time_days?: number;
          owner_id?: string | null;
          publish_due_at?: string | null;
          review_due_at?: string | null;
          reviewer_id?: string | null;
          skip_reason?: string | null;
          status_changed_at?: string | null;
          status_changed_by?: string | null;
          tenant_id?: string;
          title: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          calendar_item_id?: string;
          content?: string | null;
          content_status?: string;
          created_at?: string;
          created_by?: string;
          draft_due_at?: string | null;
          id?: string;
          internal_notes?: string | null;
          lead_time_days?: number;
          owner_id?: string | null;
          publish_due_at?: string | null;
          review_due_at?: string | null;
          reviewer_id?: string | null;
          skip_reason?: string | null;
          status_changed_at?: string | null;
          status_changed_by?: string | null;
          tenant_id?: string;
          title?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "content_opportunities_calendar_item_id_fkey";
            columns: ["tenant_id", "calendar_item_id"];
            isOneToOne: false;
            referencedRelation: "calendar_items";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "content_opportunities_owner_id_fkey";
            columns: ["tenant_id", "owner_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "content_opportunities_owner_id_fkey";
            columns: ["tenant_id", "owner_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "content_opportunities_reviewer_id_fkey";
            columns: ["tenant_id", "reviewer_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "content_opportunities_reviewer_id_fkey";
            columns: ["tenant_id", "reviewer_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "content_opportunities_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_opportunities_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      content_pack_adoptions: {
        Row: {
          adopted_at: string;
          adopted_by: string | null;
          article_count: number;
          category_count: number;
          id: string;
          pack_id: string;
          pack_key: string;
          pack_name: string;
          tenant_id: string;
        };
        Insert: {
          adopted_at?: string;
          adopted_by?: string | null;
          article_count?: number;
          category_count?: number;
          id?: string;
          pack_id: string;
          pack_key: string;
          pack_name: string;
          tenant_id?: string;
        };
        Update: {
          adopted_at?: string;
          adopted_by?: string | null;
          article_count?: number;
          category_count?: number;
          id?: string;
          pack_id?: string;
          pack_key?: string;
          pack_name?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "content_pack_adoptions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_pack_adoptions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      content_packs: {
        Row: {
          created_at: string;
          description: string;
          id: string;
          is_offered: boolean;
          key: string;
          name: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          description?: string;
          id?: string;
          is_offered?: boolean;
          key: string;
          name: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          description?: string;
          id?: string;
          is_offered?: boolean;
          key?: string;
          name?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "content_packs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_packs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      deactivated_users: {
        Row: {
          deactivated_at: string;
          deactivated_by: string | null;
          user_id: string;
        };
        Insert: {
          deactivated_at?: string;
          deactivated_by?: string | null;
          user_id: string;
        };
        Update: {
          deactivated_at?: string;
          deactivated_by?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      discount_code_options: {
        Row: {
          code_id: string;
          created_at: string;
          option_id: string;
          percent_off: number;
          tenant_id: string;
        };
        Insert: {
          code_id: string;
          created_at?: string;
          option_id: string;
          percent_off: number;
          tenant_id?: string;
        };
        Update: {
          code_id?: string;
          created_at?: string;
          option_id?: string;
          percent_off?: number;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "discount_code_options_code_fkey";
            columns: ["tenant_id", "code_id"];
            isOneToOne: false;
            referencedRelation: "discount_codes";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "discount_code_options_option_fkey";
            columns: ["tenant_id", "option_id"];
            isOneToOne: false;
            referencedRelation: "event_registration_options";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "discount_code_options_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "discount_code_options_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      discount_codes: {
        Row: {
          assigned_at: string | null;
          code: string;
          created_at: string;
          created_by: string;
          description: string | null;
          event_id: string;
          id: string;
          kind: string | null;
          notes: string | null;
          pin: string | null;
          registration_id: string | null;
          sent_at: string | null;
          sent_to_email: string | null;
          sent_to_name: string | null;
          shared: boolean;
          source: string | null;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
          value: number | null;
        };
        Insert: {
          assigned_at?: string | null;
          code: string;
          created_at?: string;
          created_by?: string;
          description?: string | null;
          event_id: string;
          id?: string;
          kind?: string | null;
          notes?: string | null;
          pin?: string | null;
          registration_id?: string | null;
          sent_at?: string | null;
          sent_to_email?: string | null;
          sent_to_name?: string | null;
          shared?: boolean;
          source?: string | null;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          value?: number | null;
        };
        Update: {
          assigned_at?: string | null;
          code?: string;
          created_at?: string;
          created_by?: string;
          description?: string | null;
          event_id?: string;
          id?: string;
          kind?: string | null;
          notes?: string | null;
          pin?: string | null;
          registration_id?: string | null;
          sent_at?: string | null;
          sent_to_email?: string | null;
          sent_to_name?: string | null;
          shared?: boolean;
          source?: string | null;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          value?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "discount_codes_event_id_fkey";
            columns: ["tenant_id", "event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "discount_codes_registration_id_fkey";
            columns: ["tenant_id", "registration_id"];
            isOneToOne: false;
            referencedRelation: "event_registrations";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "discount_codes_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "discount_codes_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      distribution_acknowledgement_requests: {
        Row: {
          acknowledged_at: string | null;
          acknowledgement_id: string;
          expires_at: string;
          gear_request_ids: string[];
          id: string;
          requested_at: string;
          requested_by: string | null;
          tenant_id: string;
          token_hash: string;
        };
        Insert: {
          acknowledged_at?: string | null;
          acknowledgement_id: string;
          expires_at: string;
          gear_request_ids?: string[];
          id?: string;
          requested_at?: string;
          requested_by?: string | null;
          tenant_id?: string;
          token_hash: string;
        };
        Update: {
          acknowledged_at?: string | null;
          acknowledgement_id?: string;
          expires_at?: string;
          gear_request_ids?: string[];
          id?: string;
          requested_at?: string;
          requested_by?: string | null;
          tenant_id?: string;
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "distribution_acknowledgement_requests_acknowledgement_fkey";
            columns: ["tenant_id", "acknowledgement_id"];
            isOneToOne: true;
            referencedRelation: "distribution_acknowledgements";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "distribution_acknowledgement_requests_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "distribution_acknowledgement_requests_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      distribution_acknowledgements: {
        Row: {
          acknowledged_at: string | null;
          as_is_text: string | null;
          created_at: string;
          id: string;
          method: string | null;
          present_staff: string | null;
          recipient_person_id: string | null;
          skipped_note: string | null;
          skipped_reason: string | null;
          tenant_id: string;
          typed_name: string | null;
        };
        Insert: {
          acknowledged_at?: string | null;
          as_is_text?: string | null;
          created_at?: string;
          id?: string;
          method?: string | null;
          present_staff?: string | null;
          recipient_person_id?: string | null;
          skipped_note?: string | null;
          skipped_reason?: string | null;
          tenant_id?: string;
          typed_name?: string | null;
        };
        Update: {
          acknowledged_at?: string | null;
          as_is_text?: string | null;
          created_at?: string;
          id?: string;
          method?: string | null;
          present_staff?: string | null;
          recipient_person_id?: string | null;
          skipped_note?: string | null;
          skipped_reason?: string | null;
          tenant_id?: string;
          typed_name?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "distribution_acknowledgements_recipient_in_tenant";
            columns: ["tenant_id", "recipient_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "distribution_acknowledgements_recipient_in_tenant";
            columns: ["tenant_id", "recipient_person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "distribution_acknowledgements_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "distribution_acknowledgements_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      donations: {
        Row: {
          created_at: string;
          created_by: string;
          donated_at: string;
          donor_id: string | null;
          event_id: string | null;
          id: string;
          notes: string | null;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string;
          donated_at?: string;
          donor_id?: string | null;
          event_id?: string | null;
          id?: string;
          notes?: string | null;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          donated_at?: string;
          donor_id?: string | null;
          event_id?: string | null;
          id?: string;
          notes?: string | null;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "donations_donor_id_fkey";
            columns: ["tenant_id", "donor_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "donations_donor_id_fkey";
            columns: ["tenant_id", "donor_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "donations_event_id_fkey";
            columns: ["tenant_id", "event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "donations_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "donations_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      event_access_area_tables: {
        Row: {
          area_key: string;
          resource_key: string;
          table_name: string;
        };
        Insert: {
          area_key: string;
          resource_key: string;
          table_name: string;
        };
        Update: {
          area_key?: string;
          resource_key?: string;
          table_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "event_access_area_tables_area_key_fkey";
            columns: ["area_key"];
            isOneToOne: false;
            referencedRelation: "event_access_areas";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "event_access_area_tables_resource_key_fkey";
            columns: ["resource_key"];
            isOneToOne: false;
            referencedRelation: "resources";
            referencedColumns: ["key"];
          },
        ];
      };
      event_access_areas: {
        Row: {
          description: string;
          key: string;
          label: string;
          sensitive: boolean;
          sort_order: number;
        };
        Insert: {
          description: string;
          key: string;
          label: string;
          sensitive: boolean;
          sort_order: number;
        };
        Update: {
          description?: string;
          key?: string;
          label?: string;
          sensitive?: boolean;
          sort_order?: number;
        };
        Relationships: [];
      };
      event_access_grants: {
        Row: {
          areas: string[];
          created_at: string;
          created_by: string | null;
          event_id: string;
          granted_by: string | null;
          id: string;
          level: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
          user_id: string;
        };
        Insert: {
          areas: string[];
          created_at?: string;
          created_by?: string | null;
          event_id: string;
          granted_by?: string | null;
          id?: string;
          level: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          user_id: string;
        };
        Update: {
          areas?: string[];
          created_at?: string;
          created_by?: string | null;
          event_id?: string;
          granted_by?: string | null;
          id?: string;
          level?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "event_access_grants_event_fkey";
            columns: ["tenant_id", "event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_access_grants_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_access_grants_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      event_artwork_calls: {
        Row: {
          closes_at: string | null;
          created_at: string;
          created_by: string | null;
          event_id: string | null;
          id: string;
          intro: string | null;
          is_open: boolean;
          max_images: number;
          opens_at: string | null;
          rights_note: string | null;
          submission_code: string;
          tenant_id: string;
          timezone: string | null;
          title: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          closes_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          event_id?: string | null;
          id?: string;
          intro?: string | null;
          is_open?: boolean;
          max_images?: number;
          opens_at?: string | null;
          rights_note?: string | null;
          submission_code?: string;
          tenant_id?: string;
          timezone?: string | null;
          title: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          closes_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          event_id?: string | null;
          id?: string;
          intro?: string | null;
          is_open?: boolean;
          max_images?: number;
          opens_at?: string | null;
          rights_note?: string | null;
          submission_code?: string;
          tenant_id?: string;
          timezone?: string | null;
          title?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "event_artwork_calls_tenant_id_event_id_fkey";
            columns: ["tenant_id", "event_id"];
            isOneToOne: true;
            referencedRelation: "events";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_artwork_calls_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_artwork_calls_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      event_carpool_assignment_emails: {
        Row: {
          emailed_at: string;
          event_id: string;
          registration_id: string;
          signature: string;
          tenant_id: string;
        };
        Insert: {
          emailed_at?: string;
          event_id: string;
          registration_id: string;
          signature: string;
          tenant_id?: string;
        };
        Update: {
          emailed_at?: string;
          event_id?: string;
          registration_id?: string;
          signature?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "event_carpool_assignment_emails_event_fkey";
            columns: ["tenant_id", "event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_carpool_assignment_emails_registration_fkey";
            columns: ["tenant_id", "registration_id"];
            isOneToOne: false;
            referencedRelation: "event_registrations";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_carpool_assignment_emails_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_carpool_assignment_emails_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      event_carpool_cars: {
        Row: {
          created_at: string;
          driver_assigned_at: string | null;
          driver_registration_id: string | null;
          event_id: string;
          id: string;
          label: string;
          leaving_from: string | null;
          notes: string | null;
          seats: number;
          sort_order: number;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          driver_assigned_at?: string | null;
          driver_registration_id?: string | null;
          event_id: string;
          id?: string;
          label: string;
          leaving_from?: string | null;
          notes?: string | null;
          seats: number;
          sort_order?: number;
          tenant_id?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          driver_assigned_at?: string | null;
          driver_registration_id?: string | null;
          event_id?: string;
          id?: string;
          label?: string;
          leaving_from?: string | null;
          notes?: string | null;
          seats?: number;
          sort_order?: number;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "event_carpool_cars_driver_fkey";
            columns: ["tenant_id", "driver_registration_id"];
            isOneToOne: false;
            referencedRelation: "event_registrations";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_carpool_cars_event_fkey";
            columns: ["tenant_id", "event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_carpool_cars_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_carpool_cars_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      event_carpool_passengers: {
        Row: {
          added_at: string;
          car_id: string;
          event_id: string;
          id: string;
          paid_driver_at: string | null;
          paid_marked_by: string | null;
          registration_id: string;
          tenant_id: string;
        };
        Insert: {
          added_at?: string;
          car_id: string;
          event_id: string;
          id?: string;
          paid_driver_at?: string | null;
          paid_marked_by?: string | null;
          registration_id: string;
          tenant_id?: string;
        };
        Update: {
          added_at?: string;
          car_id?: string;
          event_id?: string;
          id?: string;
          paid_driver_at?: string | null;
          paid_marked_by?: string | null;
          registration_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "event_carpool_passengers_car_fkey";
            columns: ["tenant_id", "car_id"];
            isOneToOne: false;
            referencedRelation: "event_carpool_cars";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_carpool_passengers_event_fkey";
            columns: ["tenant_id", "event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_carpool_passengers_registration_fkey";
            columns: ["tenant_id", "registration_id"];
            isOneToOne: false;
            referencedRelation: "event_registrations";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_carpool_passengers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_carpool_passengers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      event_checklist_items: {
        Row: {
          completed_at: string | null;
          created_at: string;
          created_by: string | null;
          due_date: string | null;
          event_id: string;
          id: string;
          is_done: boolean;
          owner_person_id: string | null;
          tenant_id: string;
          title: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          due_date?: string | null;
          event_id: string;
          id?: string;
          is_done?: boolean;
          owner_person_id?: string | null;
          tenant_id?: string;
          title: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          due_date?: string | null;
          event_id?: string;
          id?: string;
          is_done?: boolean;
          owner_person_id?: string | null;
          tenant_id?: string;
          title?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "event_checklist_items_event_id_fkey";
            columns: ["tenant_id", "event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_checklist_items_owner_in_tenant";
            columns: ["tenant_id", "owner_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_checklist_items_owner_in_tenant";
            columns: ["tenant_id", "owner_person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_checklist_items_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_checklist_items_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      event_expenses: {
        Row: {
          amount: number;
          approved_at: string | null;
          approved_by: string | null;
          created_at: string;
          created_by: string;
          currency: string;
          description: string;
          event_id: string | null;
          expense_date: string;
          id: string;
          notes: string | null;
          paid_at: string | null;
          paid_by: string | null;
          paid_by_person_id: string | null;
          participant_assistance: boolean;
          receipt_path: string | null;
          receipt_url: string | null;
          rejected_at: string | null;
          rejected_by: string | null;
          rejection_reason: string | null;
          status: string;
          submitted_by: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          amount: number;
          approved_at?: string | null;
          approved_by?: string | null;
          created_at?: string;
          created_by?: string;
          currency?: string;
          description: string;
          event_id?: string | null;
          expense_date?: string;
          id?: string;
          notes?: string | null;
          paid_at?: string | null;
          paid_by?: string | null;
          paid_by_person_id?: string | null;
          participant_assistance?: boolean;
          receipt_path?: string | null;
          receipt_url?: string | null;
          rejected_at?: string | null;
          rejected_by?: string | null;
          rejection_reason?: string | null;
          status?: string;
          submitted_by?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          amount?: number;
          approved_at?: string | null;
          approved_by?: string | null;
          created_at?: string;
          created_by?: string;
          currency?: string;
          description?: string;
          event_id?: string | null;
          expense_date?: string;
          id?: string;
          notes?: string | null;
          paid_at?: string | null;
          paid_by?: string | null;
          paid_by_person_id?: string | null;
          participant_assistance?: boolean;
          receipt_path?: string | null;
          receipt_url?: string | null;
          rejected_at?: string | null;
          rejected_by?: string | null;
          rejection_reason?: string | null;
          status?: string;
          submitted_by?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "event_expenses_event_id_fkey";
            columns: ["tenant_id", "event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_expenses_paid_by_person_id_fkey";
            columns: ["tenant_id", "paid_by_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_expenses_paid_by_person_id_fkey";
            columns: ["tenant_id", "paid_by_person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_expenses_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_expenses_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      event_impact_notes: {
        Row: {
          assistance_total: number | null;
          beginner_pairings_count: number | null;
          created_at: string;
          created_by: string;
          event_id: string;
          first_time_riders: number | null;
          id: string;
          legacy_manual_values: Json | null;
          notes: string | null;
          rental_subsidies_count: number | null;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          assistance_total?: number | null;
          beginner_pairings_count?: number | null;
          created_at?: string;
          created_by?: string;
          event_id: string;
          first_time_riders?: number | null;
          id?: string;
          legacy_manual_values?: Json | null;
          notes?: string | null;
          rental_subsidies_count?: number | null;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          assistance_total?: number | null;
          beginner_pairings_count?: number | null;
          created_at?: string;
          created_by?: string;
          event_id?: string;
          first_time_riders?: number | null;
          id?: string;
          legacy_manual_values?: Json | null;
          notes?: string | null;
          rental_subsidies_count?: number | null;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "event_impact_notes_event_id_fkey";
            columns: ["tenant_id", "event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_impact_notes_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_impact_notes_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      event_incidents: {
        Row: {
          created_at: string;
          description: string;
          event_id: string;
          id: string;
          occurred_at: string;
          people_involved: string | null;
          reported_by: string;
          severity: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description: string;
          event_id: string;
          id?: string;
          occurred_at?: string;
          people_involved?: string | null;
          reported_by?: string;
          severity?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string;
          event_id?: string;
          id?: string;
          occurred_at?: string;
          people_involved?: string | null;
          reported_by?: string;
          severity?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "event_incidents_event_id_fkey";
            columns: ["tenant_id", "event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_incidents_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_incidents_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      event_logistics: {
        Row: {
          created_at: string;
          created_by: string;
          emergency_contact_name: string | null;
          emergency_contact_phone: string | null;
          event_id: string;
          food: string | null;
          gear_requirements: string | null;
          meeting_point: string | null;
          notes: string | null;
          supplies: string | null;
          tenant_id: string;
          transportation: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string;
          emergency_contact_name?: string | null;
          emergency_contact_phone?: string | null;
          event_id: string;
          food?: string | null;
          gear_requirements?: string | null;
          meeting_point?: string | null;
          notes?: string | null;
          supplies?: string | null;
          tenant_id?: string;
          transportation?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          emergency_contact_name?: string | null;
          emergency_contact_phone?: string | null;
          event_id?: string;
          food?: string | null;
          gear_requirements?: string | null;
          meeting_point?: string | null;
          notes?: string | null;
          supplies?: string | null;
          tenant_id?: string;
          transportation?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "event_logistics_event_id_fkey";
            columns: ["tenant_id", "event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_logistics_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_logistics_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      event_media: {
        Row: {
          caption: string | null;
          content_type: string;
          event_id: string;
          id: string;
          is_public: boolean;
          kind: string;
          link_receipt_hash: string | null;
          original_filename: string;
          rights_confirmed_at: string | null;
          rights_terms: string | null;
          size_bytes: number;
          storage_path: string;
          tenant_id: string;
          thumb_path: string | null;
          upload_link_id: string | null;
          uploaded_at: string;
          uploaded_by: string | null;
          expires_at: string | null;
          uploader_name: string | null;
        };
        Insert: {
          caption?: string | null;
          content_type: string;
          event_id: string;
          id?: string;
          is_public: boolean;
          kind?: string;
          link_receipt_hash?: string | null;
          original_filename: string;
          rights_confirmed_at?: string | null;
          rights_terms?: string | null;
          size_bytes: number;
          storage_path: string;
          tenant_id?: string;
          thumb_path?: string | null;
          upload_link_id?: string | null;
          uploaded_at?: string;
          uploaded_by?: string | null;
        };
        Update: {
          caption?: string | null;
          content_type?: string;
          event_id?: string;
          id?: string;
          is_public?: boolean;
          kind?: string;
          link_receipt_hash?: string | null;
          original_filename?: string;
          rights_confirmed_at?: string | null;
          rights_terms?: string | null;
          size_bytes?: number;
          storage_path?: string;
          tenant_id?: string;
          thumb_path?: string | null;
          upload_link_id?: string | null;
          uploaded_at?: string;
          uploaded_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "event_media_event_fkey";
            columns: ["tenant_id", "event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_media_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_media_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_media_upload_link_fkey";
            columns: ["tenant_id", "upload_link_id"];
            isOneToOne: false;
            referencedRelation: "event_media_upload_links";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      event_media_upload_links: {
        Row: {
          created_at: string;
          created_by: string | null;
          event_id: string;
          expires_at: string;
          id: string;
          label: string;
          max_bytes: number;
          revoked_at: string | null;
          tenant_id: string;
          token_hash: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          event_id: string;
          expires_at: string;
          id?: string;
          label: string;
          max_bytes?: number;
          revoked_at?: string | null;
          tenant_id?: string;
          token_hash: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          event_id?: string;
          expires_at?: string;
          id?: string;
          label?: string;
          max_bytes?: number;
          revoked_at?: string | null;
          tenant_id?: string;
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "event_media_upload_links_event_fkey";
            columns: ["tenant_id", "event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_media_upload_links_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_media_upload_links_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      event_programs: {
        Row: {
          event_id: string;
          program_id: string;
          tenant_id: string;
        };
        Insert: {
          event_id: string;
          program_id: string;
          tenant_id?: string;
        };
        Update: {
          event_id?: string;
          program_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "event_programs_event_id_fkey";
            columns: ["tenant_id", "event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_programs_program_id_fkey";
            columns: ["tenant_id", "program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_programs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_programs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      event_registration_answer_requests: {
        Row: {
          answered_at: string | null;
          expires_at: string;
          id: string;
          registration_id: string;
          requested_at: string;
          requested_by: string | null;
          source: string;
          tenant_id: string;
          token_hash: string;
        };
        Insert: {
          answered_at?: string | null;
          expires_at: string;
          id?: string;
          registration_id: string;
          requested_at?: string;
          requested_by?: string | null;
          source?: string;
          tenant_id?: string;
          token_hash: string;
        };
        Update: {
          answered_at?: string | null;
          expires_at?: string;
          id?: string;
          registration_id?: string;
          requested_at?: string;
          requested_by?: string | null;
          source?: string;
          tenant_id?: string;
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "event_registration_answer_requests_registration_fkey";
            columns: ["tenant_id", "registration_id"];
            isOneToOne: true;
            referencedRelation: "event_registrations";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_registration_answer_requests_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_registration_answer_requests_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      event_registration_answers: {
        Row: {
          answer_text: string;
          answered_at: string;
          id: string;
          kind: string;
          prompt_as_shown: string;
          question_id: string | null;
          registration_id: string;
          sort_order: number;
          tenant_id: string;
          value: Json;
        };
        Insert: {
          answer_text: string;
          answered_at?: string;
          id?: string;
          kind: string;
          prompt_as_shown: string;
          question_id?: string | null;
          registration_id: string;
          sort_order?: number;
          tenant_id?: string;
          value: Json;
        };
        Update: {
          answer_text?: string;
          answered_at?: string;
          id?: string;
          kind?: string;
          prompt_as_shown?: string;
          question_id?: string | null;
          registration_id?: string;
          sort_order?: number;
          tenant_id?: string;
          value?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "event_registration_answers_question_fkey";
            columns: ["tenant_id", "question_id"];
            isOneToOne: false;
            referencedRelation: "event_registration_questions";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_registration_answers_registration_fkey";
            columns: ["tenant_id", "registration_id"];
            isOneToOne: false;
            referencedRelation: "event_registrations";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_registration_answers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_registration_answers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      event_registration_option_counts: {
        Row: {
          id: string;
          label: string;
          option_id: string | null;
          price: number | null;
          quantity: number;
          registration_id: string;
          sort_order: number;
          tenant_id: string;
        };
        Insert: {
          id?: string;
          label: string;
          option_id?: string | null;
          price?: number | null;
          quantity: number;
          registration_id: string;
          sort_order?: number;
          tenant_id?: string;
        };
        Update: {
          id?: string;
          label?: string;
          option_id?: string | null;
          price?: number | null;
          quantity?: number;
          registration_id?: string;
          sort_order?: number;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "event_registration_option_counts_option_fkey";
            columns: ["tenant_id", "option_id"];
            isOneToOne: false;
            referencedRelation: "event_registration_options";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_registration_option_counts_registration_fkey";
            columns: ["tenant_id", "registration_id"];
            isOneToOne: false;
            referencedRelation: "event_registrations";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_registration_option_counts_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_registration_option_counts_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      event_registration_options: {
        Row: {
          cap: number | null;
          created_at: string;
          event_id: string;
          id: string;
          label: string;
          price: number | null;
          sort_order: number;
          tenant_id: string;
        };
        Insert: {
          cap?: number | null;
          created_at?: string;
          event_id: string;
          id?: string;
          label: string;
          price?: number | null;
          sort_order?: number;
          tenant_id?: string;
        };
        Update: {
          cap?: number | null;
          created_at?: string;
          event_id?: string;
          id?: string;
          label?: string;
          price?: number | null;
          sort_order?: number;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "event_registration_options_event_fkey";
            columns: ["tenant_id", "event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_registration_options_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_registration_options_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      event_registration_questions: {
        Row: {
          archived_at: string | null;
          column_label: string | null;
          created_at: string;
          event_id: string;
          help: string | null;
          id: string;
          kind: string;
          max_value: number | null;
          min_value: number | null;
          options: Json;
          place_allow_other: boolean;
          place_granularity: string | null;
          prompt: string;
          required: boolean;
          shares_contact: boolean;
          show_if: Json | null;
          sort_order: number;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          archived_at?: string | null;
          column_label?: string | null;
          created_at?: string;
          event_id: string;
          help?: string | null;
          id?: string;
          kind: string;
          max_value?: number | null;
          min_value?: number | null;
          options?: Json;
          place_allow_other?: boolean;
          place_granularity?: string | null;
          prompt: string;
          required?: boolean;
          shares_contact?: boolean;
          show_if?: Json | null;
          sort_order?: number;
          tenant_id?: string;
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          column_label?: string | null;
          created_at?: string;
          event_id?: string;
          help?: string | null;
          id?: string;
          kind?: string;
          max_value?: number | null;
          min_value?: number | null;
          options?: Json;
          place_allow_other?: boolean;
          place_granularity?: string | null;
          prompt?: string;
          required?: boolean;
          shares_contact?: boolean;
          show_if?: Json | null;
          sort_order?: number;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "event_registration_questions_event_fkey";
            columns: ["tenant_id", "event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_registration_questions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_registration_questions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      event_registrations: {
        Row: {
          accompanying_adult_name: string | null;
          accompanying_adult_phone: string | null;
          adults_only_confirmed_at: string | null;
          answers_changed_at: string | null;
          attended_before: boolean | null;
          cancellation_note: string | null;
          cancellation_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          checked_in_at: string | null;
          created_at: string;
          email: string;
          emergency_contact_name: string | null;
          emergency_contact_phone: string | null;
          event_id: string;
          group_chat_added_at: string | null;
          group_chat_added_by: string | null;
          has_no_instagram: boolean | null;
          id: string;
          instagram_handle: string | null;
          name: string;
          notes: string | null;
          party_includes_minor: boolean | null;
          party_size: number;
          person_id: string | null;
          phone: string | null;
          photo_consent: boolean | null;
          photo_consent_at: string | null;
          photo_consent_text: string | null;
          preferred_contact_detail: string | null;
          preferred_contact_method: string | null;
          pronouns: string | null;
          reminder_sent_at: string | null;
          riding_discipline_at_event: string | null;
          ski_experience_level_at_event: string | null;
          snowboard_experience_level_at_event: string | null;
          tenant_id: string;
          waiver_accepted_at: string | null;
          waiver_version: number | null;
        };
        Insert: {
          accompanying_adult_name?: string | null;
          accompanying_adult_phone?: string | null;
          adults_only_confirmed_at?: string | null;
          answers_changed_at?: string | null;
          attended_before?: boolean | null;
          cancellation_note?: string | null;
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          checked_in_at?: string | null;
          created_at?: string;
          email: string;
          emergency_contact_name?: string | null;
          emergency_contact_phone?: string | null;
          event_id: string;
          group_chat_added_at?: string | null;
          group_chat_added_by?: string | null;
          has_no_instagram?: boolean | null;
          id?: string;
          instagram_handle?: string | null;
          name: string;
          notes?: string | null;
          party_includes_minor?: boolean | null;
          party_size?: number;
          person_id?: string | null;
          phone?: string | null;
          photo_consent?: boolean | null;
          photo_consent_at?: string | null;
          photo_consent_text?: string | null;
          preferred_contact_detail?: string | null;
          preferred_contact_method?: string | null;
          pronouns?: string | null;
          reminder_sent_at?: string | null;
          riding_discipline_at_event?: string | null;
          ski_experience_level_at_event?: string | null;
          snowboard_experience_level_at_event?: string | null;
          tenant_id?: string;
          waiver_accepted_at?: string | null;
          waiver_version?: number | null;
        };
        Update: {
          accompanying_adult_name?: string | null;
          accompanying_adult_phone?: string | null;
          adults_only_confirmed_at?: string | null;
          answers_changed_at?: string | null;
          attended_before?: boolean | null;
          cancellation_note?: string | null;
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          checked_in_at?: string | null;
          created_at?: string;
          email?: string;
          emergency_contact_name?: string | null;
          emergency_contact_phone?: string | null;
          event_id?: string;
          group_chat_added_at?: string | null;
          group_chat_added_by?: string | null;
          has_no_instagram?: boolean | null;
          id?: string;
          instagram_handle?: string | null;
          name?: string;
          notes?: string | null;
          party_includes_minor?: boolean | null;
          party_size?: number;
          person_id?: string | null;
          phone?: string | null;
          photo_consent?: boolean | null;
          photo_consent_at?: string | null;
          photo_consent_text?: string | null;
          preferred_contact_detail?: string | null;
          preferred_contact_method?: string | null;
          pronouns?: string | null;
          reminder_sent_at?: string | null;
          riding_discipline_at_event?: string | null;
          ski_experience_level_at_event?: string | null;
          snowboard_experience_level_at_event?: string | null;
          tenant_id?: string;
          waiver_accepted_at?: string | null;
          waiver_version?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "event_registrations_event_id_fkey";
            columns: ["tenant_id", "event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_registrations_person_id_fkey";
            columns: ["tenant_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_registrations_person_id_fkey";
            columns: ["tenant_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_registrations_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_registrations_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      event_retro_items: {
        Row: {
          area: string | null;
          author_id: string | null;
          body: string;
          completed_at: string | null;
          created_at: string;
          event_id: string;
          id: string;
          kind: string;
          owner_person_id: string | null;
          status: string | null;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
          author_name: string | null;
        };
        Insert: {
          area?: string | null;
          author_id?: string | null;
          body: string;
          completed_at?: string | null;
          created_at?: string;
          event_id: string;
          id?: string;
          kind: string;
          owner_person_id?: string | null;
          status?: string | null;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          area?: string | null;
          author_id?: string | null;
          body?: string;
          completed_at?: string | null;
          created_at?: string;
          event_id?: string;
          id?: string;
          kind?: string;
          owner_person_id?: string | null;
          status?: string | null;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "event_retro_items_event_fkey";
            columns: ["tenant_id", "event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_retro_items_owner_in_tenant";
            columns: ["tenant_id", "owner_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_retro_items_owner_in_tenant";
            columns: ["tenant_id", "owner_person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_retro_items_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_retro_items_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      event_revenue: {
        Row: {
          amount: number;
          created_at: string;
          created_by: string;
          event_id: string | null;
          id: string;
          notes: string | null;
          received_date: string;
          source: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          amount: number;
          created_at?: string;
          created_by?: string;
          event_id?: string | null;
          id?: string;
          notes?: string | null;
          received_date?: string;
          source: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          amount?: number;
          created_at?: string;
          created_by?: string;
          event_id?: string | null;
          id?: string;
          notes?: string | null;
          received_date?: string;
          source?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "event_revenue_event_id_fkey";
            columns: ["tenant_id", "event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_revenue_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_revenue_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      event_shifts: {
        Row: {
          created_at: string;
          created_by: string;
          ends_at: string;
          event_id: string;
          id: string;
          label: string;
          notes: string | null;
          starts_at: string;
          target_headcount: number | null;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
          volunteer_role_type_id: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string;
          ends_at: string;
          event_id: string;
          id?: string;
          label: string;
          notes?: string | null;
          starts_at: string;
          target_headcount?: number | null;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          volunteer_role_type_id?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          ends_at?: string;
          event_id?: string;
          id?: string;
          label?: string;
          notes?: string | null;
          starts_at?: string;
          target_headcount?: number | null;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          volunteer_role_type_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "event_shifts_event_id_fkey";
            columns: ["tenant_id", "event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_shifts_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_shifts_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_shifts_volunteer_role_type_id_fkey";
            columns: ["tenant_id", "volunteer_role_type_id"];
            isOneToOne: false;
            referencedRelation: "volunteer_role_types";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      event_sponsors: {
        Row: {
          contribution_value: number | null;
          created_at: string;
          created_by: string;
          donation_id: string | null;
          event_id: string;
          follow_up_due_date: string | null;
          follow_up_notes: string | null;
          follow_up_owner_person_id: string | null;
          follow_up_status: string;
          id: string;
          in_kind_description: string | null;
          is_public: boolean;
          monetary_donation_id: string | null;
          notes: string | null;
          person_id: string;
          support_type: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          contribution_value?: number | null;
          created_at?: string;
          created_by?: string;
          donation_id?: string | null;
          event_id: string;
          follow_up_due_date?: string | null;
          follow_up_notes?: string | null;
          follow_up_owner_person_id?: string | null;
          follow_up_status?: string;
          id?: string;
          in_kind_description?: string | null;
          is_public?: boolean;
          monetary_donation_id?: string | null;
          notes?: string | null;
          person_id: string;
          support_type?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          contribution_value?: number | null;
          created_at?: string;
          created_by?: string;
          donation_id?: string | null;
          event_id?: string;
          follow_up_due_date?: string | null;
          follow_up_notes?: string | null;
          follow_up_owner_person_id?: string | null;
          follow_up_status?: string;
          id?: string;
          in_kind_description?: string | null;
          is_public?: boolean;
          monetary_donation_id?: string | null;
          notes?: string | null;
          person_id?: string;
          support_type?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "event_sponsors_donation_id_fkey";
            columns: ["tenant_id", "donation_id"];
            isOneToOne: false;
            referencedRelation: "donations";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_sponsors_event_id_fkey";
            columns: ["tenant_id", "event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_sponsors_follow_up_owner_in_tenant";
            columns: ["tenant_id", "follow_up_owner_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_sponsors_follow_up_owner_in_tenant";
            columns: ["tenant_id", "follow_up_owner_person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_sponsors_monetary_donation_id_fkey";
            columns: ["tenant_id", "monetary_donation_id"];
            isOneToOne: false;
            referencedRelation: "monetary_donations";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_sponsors_person_id_fkey";
            columns: ["tenant_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_sponsors_person_id_fkey";
            columns: ["tenant_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_sponsors_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_sponsors_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      event_staff: {
        Row: {
          created_at: string;
          created_by: string;
          event_id: string;
          id: string;
          notes: string | null;
          person_id: string;
          role: string | null;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string;
          event_id: string;
          id?: string;
          notes?: string | null;
          person_id: string;
          role?: string | null;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          event_id?: string;
          id?: string;
          notes?: string | null;
          person_id?: string;
          role?: string | null;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "event_staff_event_id_fkey";
            columns: ["tenant_id", "event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_staff_person_id_fkey";
            columns: ["tenant_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_staff_person_id_fkey";
            columns: ["tenant_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_staff_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_staff_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      event_volunteers: {
        Row: {
          created_at: string;
          created_by: string;
          event_id: string;
          id: string;
          notes: string | null;
          person_id: string;
          role: string | null;
          shift_id: string | null;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
          volunteer_role_type_id: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string;
          event_id: string;
          id?: string;
          notes?: string | null;
          person_id: string;
          role?: string | null;
          shift_id?: string | null;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          volunteer_role_type_id?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          event_id?: string;
          id?: string;
          notes?: string | null;
          person_id?: string;
          role?: string | null;
          shift_id?: string | null;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          volunteer_role_type_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "event_volunteers_event_id_fkey";
            columns: ["tenant_id", "event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_volunteers_person_id_fkey";
            columns: ["tenant_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_volunteers_person_id_fkey";
            columns: ["tenant_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_volunteers_shift_id_fkey";
            columns: ["tenant_id", "shift_id"];
            isOneToOne: false;
            referencedRelation: "event_shifts";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "event_volunteers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_volunteers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_volunteers_volunteer_role_type_id_fkey";
            columns: ["tenant_id", "volunteer_role_type_id"];
            isOneToOne: false;
            referencedRelation: "volunteer_role_types";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      events: {
        Row: {
          adults_only: boolean;
          attendance_count: number | null;
          attendance_notes: string | null;
          auto_assign_discount_codes: boolean;
          budget_amount: number | null;
          capacity: number | null;
          carpool_seats_question_id: string | null;
          carpools_enabled: boolean;
          confirmation_note: string | null;
          content_notes: string | null;
          created_at: string;
          created_by: string;
          description: string | null;
          ends_at: string | null;
          event_lead_id: string | null;
          feedback_notes: string | null;
          flier_url: string | null;
          group_chat_enabled: boolean;
          group_chat_label: string | null;
          id: string;
          lessons_learned: string | null;
          location: string | null;
          name: string;
          registration_deadline: string | null;
          registration_enabled: boolean;
          registration_options_prompt: string | null;
          reminder_days_before: number;
          reminder_enabled: boolean;
          reminder_intro: string | null;
          report_reopen_reason: string | null;
          report_reopened_at: string | null;
          report_reopened_by: string | null;
          report_snapshot: Json | null;
          report_status: string;
          report_submitted_at: string | null;
          report_submitted_by: string | null;
          report_summary: string | null;
          starts_at: string;
          status: string;
          tenant_id: string;
          timezone: string;
          updated_at: string;
          updated_by: string | null;
          visibility: string;
        };
        Insert: {
          adults_only?: boolean;
          attendance_count?: number | null;
          attendance_notes?: string | null;
          auto_assign_discount_codes?: boolean;
          budget_amount?: number | null;
          capacity?: number | null;
          carpool_seats_question_id?: string | null;
          carpools_enabled?: boolean;
          confirmation_note?: string | null;
          content_notes?: string | null;
          created_at?: string;
          created_by?: string;
          description?: string | null;
          ends_at?: string | null;
          event_lead_id?: string | null;
          feedback_notes?: string | null;
          flier_url?: string | null;
          group_chat_enabled?: boolean;
          group_chat_label?: string | null;
          id?: string;
          lessons_learned?: string | null;
          location?: string | null;
          name: string;
          registration_deadline?: string | null;
          registration_enabled?: boolean;
          registration_options_prompt?: string | null;
          reminder_days_before?: number;
          reminder_enabled?: boolean;
          reminder_intro?: string | null;
          report_reopen_reason?: string | null;
          report_reopened_at?: string | null;
          report_reopened_by?: string | null;
          report_snapshot?: Json | null;
          report_status?: string;
          report_submitted_at?: string | null;
          report_submitted_by?: string | null;
          report_summary?: string | null;
          starts_at: string;
          status?: string;
          tenant_id?: string;
          timezone: string;
          updated_at?: string;
          updated_by?: string | null;
          visibility?: string;
        };
        Update: {
          adults_only?: boolean;
          attendance_count?: number | null;
          attendance_notes?: string | null;
          auto_assign_discount_codes?: boolean;
          budget_amount?: number | null;
          capacity?: number | null;
          carpool_seats_question_id?: string | null;
          carpools_enabled?: boolean;
          confirmation_note?: string | null;
          content_notes?: string | null;
          created_at?: string;
          created_by?: string;
          description?: string | null;
          ends_at?: string | null;
          event_lead_id?: string | null;
          feedback_notes?: string | null;
          flier_url?: string | null;
          group_chat_enabled?: boolean;
          group_chat_label?: string | null;
          id?: string;
          lessons_learned?: string | null;
          location?: string | null;
          name?: string;
          registration_deadline?: string | null;
          registration_enabled?: boolean;
          registration_options_prompt?: string | null;
          reminder_days_before?: number;
          reminder_enabled?: boolean;
          reminder_intro?: string | null;
          report_reopen_reason?: string | null;
          report_reopened_at?: string | null;
          report_reopened_by?: string | null;
          report_snapshot?: Json | null;
          report_status?: string;
          report_submitted_at?: string | null;
          report_submitted_by?: string | null;
          report_summary?: string | null;
          starts_at?: string;
          status?: string;
          tenant_id?: string;
          timezone?: string;
          updated_at?: string;
          updated_by?: string | null;
          visibility?: string;
        };
        Relationships: [
          {
            foreignKeyName: "events_event_lead_id_fkey";
            columns: ["tenant_id", "event_lead_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "events_event_lead_id_fkey";
            columns: ["tenant_id", "event_lead_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "events_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "events_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      gear_request_acknowledgement_requests: {
        Row: {
          acknowledged_at: string | null;
          expires_at: string;
          id: string;
          request_id: string;
          requested_at: string;
          requested_by: string | null;
          tenant_id: string;
          token_hash: string;
        };
        Insert: {
          acknowledged_at?: string | null;
          expires_at: string;
          id?: string;
          request_id: string;
          requested_at?: string;
          requested_by?: string | null;
          tenant_id?: string;
          token_hash: string;
        };
        Update: {
          acknowledged_at?: string | null;
          expires_at?: string;
          id?: string;
          request_id?: string;
          requested_at?: string;
          requested_by?: string | null;
          tenant_id?: string;
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "gear_request_acknowledgement_requests_request_fkey";
            columns: ["tenant_id", "request_id"];
            isOneToOne: true;
            referencedRelation: "gear_requests";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "gear_request_acknowledgement_requests_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gear_request_acknowledgement_requests_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      gear_requests: {
        Row: {
          as_is_acknowledged_at: string | null;
          as_is_method: string | null;
          as_is_text: string | null;
          as_is_typed_name: string | null;
          cancelled_at: string | null;
          claimed_at: string | null;
          claimed_by_person_id: string | null;
          created_at: string;
          delivery_method: string;
          fulfilled_at: string | null;
          id: string;
          notes: string | null;
          paid_at: string | null;
          payment_method: string | null;
          person_id: string | null;
          quoted_amount: number | null;
          quoted_at: string | null;
          ship_city: string | null;
          ship_country: string | null;
          ship_line1: string | null;
          ship_line2: string | null;
          ship_name: string | null;
          ship_postal_code: string | null;
          ship_region: string | null;
          status: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          as_is_acknowledged_at?: string | null;
          as_is_method?: string | null;
          as_is_text?: string | null;
          as_is_typed_name?: string | null;
          cancelled_at?: string | null;
          claimed_at?: string | null;
          claimed_by_person_id?: string | null;
          created_at?: string;
          delivery_method: string;
          fulfilled_at?: string | null;
          id?: string;
          notes?: string | null;
          paid_at?: string | null;
          payment_method?: string | null;
          person_id?: string | null;
          quoted_amount?: number | null;
          quoted_at?: string | null;
          ship_city?: string | null;
          ship_country?: string | null;
          ship_line1?: string | null;
          ship_line2?: string | null;
          ship_name?: string | null;
          ship_postal_code?: string | null;
          ship_region?: string | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          as_is_acknowledged_at?: string | null;
          as_is_method?: string | null;
          as_is_text?: string | null;
          as_is_typed_name?: string | null;
          cancelled_at?: string | null;
          claimed_at?: string | null;
          claimed_by_person_id?: string | null;
          created_at?: string;
          delivery_method?: string;
          fulfilled_at?: string | null;
          id?: string;
          notes?: string | null;
          paid_at?: string | null;
          payment_method?: string | null;
          person_id?: string | null;
          quoted_amount?: number | null;
          quoted_at?: string | null;
          ship_city?: string | null;
          ship_country?: string | null;
          ship_line1?: string | null;
          ship_line2?: string | null;
          ship_name?: string | null;
          ship_postal_code?: string | null;
          ship_region?: string | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "gear_requests_claimed_by_in_tenant";
            columns: ["tenant_id", "claimed_by_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "gear_requests_claimed_by_in_tenant";
            columns: ["tenant_id", "claimed_by_person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "gear_requests_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gear_requests_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gear_requests_tenant_id_person_id_fkey";
            columns: ["tenant_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "gear_requests_tenant_id_person_id_fkey";
            columns: ["tenant_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      giveaway_buckets: {
        Row: {
          created_at: string;
          created_by: string;
          giveaway_id: string;
          id: string;
          name: string;
          rank: number;
          tenant_id: string;
          tier_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string;
          giveaway_id: string;
          id?: string;
          name: string;
          rank?: number;
          tenant_id?: string;
          tier_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          giveaway_id?: string;
          id?: string;
          name?: string;
          rank?: number;
          tenant_id?: string;
          tier_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "giveaway_buckets_giveaway_id_fkey";
            columns: ["tenant_id", "giveaway_id"];
            isOneToOne: false;
            referencedRelation: "giveaways";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "giveaway_buckets_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "giveaway_buckets_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "giveaway_buckets_tier_fk";
            columns: ["tier_id", "giveaway_id"];
            isOneToOne: false;
            referencedRelation: "giveaway_tiers";
            referencedColumns: ["id", "giveaway_id"];
          },
        ];
      };
      giveaway_prizes: {
        Row: {
          bucket_id: string | null;
          created_at: string;
          created_by: string;
          donor_person_id: string | null;
          estimated_value: number | null;
          giveaway_id: string;
          id: string;
          notes: string | null;
          prize_name: string;
          source_inventory_item_id: string | null;
          source_monetary_donation_id: string | null;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          bucket_id?: string | null;
          created_at?: string;
          created_by?: string;
          donor_person_id?: string | null;
          estimated_value?: number | null;
          giveaway_id: string;
          id?: string;
          notes?: string | null;
          prize_name: string;
          source_inventory_item_id?: string | null;
          source_monetary_donation_id?: string | null;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          bucket_id?: string | null;
          created_at?: string;
          created_by?: string;
          donor_person_id?: string | null;
          estimated_value?: number | null;
          giveaway_id?: string;
          id?: string;
          notes?: string | null;
          prize_name?: string;
          source_inventory_item_id?: string | null;
          source_monetary_donation_id?: string | null;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "giveaway_prizes_bucket_fk";
            columns: ["bucket_id", "giveaway_id"];
            isOneToOne: false;
            referencedRelation: "giveaway_buckets";
            referencedColumns: ["id", "giveaway_id"];
          },
          {
            foreignKeyName: "giveaway_prizes_donor_person_id_fkey";
            columns: ["tenant_id", "donor_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "giveaway_prizes_donor_person_id_fkey";
            columns: ["tenant_id", "donor_person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "giveaway_prizes_source_inventory_item_id_fkey";
            columns: ["tenant_id", "source_inventory_item_id"];
            isOneToOne: false;
            referencedRelation: "inventory_items";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "giveaway_prizes_source_monetary_donation_id_fkey";
            columns: ["tenant_id", "source_monetary_donation_id"];
            isOneToOne: false;
            referencedRelation: "monetary_donations";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "giveaway_prizes_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "giveaway_prizes_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "raffle_prizes_raffle_id_fkey";
            columns: ["tenant_id", "giveaway_id"];
            isOneToOne: false;
            referencedRelation: "giveaways";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      giveaway_rules: {
        Row: {
          created_at: string;
          created_by: string;
          giveaway_id: string;
          id: string;
          odds_basis: string;
          overrides: Json;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string;
          giveaway_id: string;
          id?: string;
          odds_basis?: string;
          overrides?: Json;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          giveaway_id?: string;
          id?: string;
          odds_basis?: string;
          overrides?: Json;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "giveaway_rules_giveaway_fk";
            columns: ["tenant_id", "giveaway_id"];
            isOneToOne: true;
            referencedRelation: "giveaways";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "giveaway_rules_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "giveaway_rules_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      giveaway_rules_versions: {
        Row: {
          content: Json;
          created_at: string;
          created_by: string;
          effective_at: string;
          giveaway_rules_id: string;
          id: string;
          tenant_id: string;
          version: number;
        };
        Insert: {
          content: Json;
          created_at?: string;
          created_by?: string;
          effective_at?: string;
          giveaway_rules_id: string;
          id?: string;
          tenant_id?: string;
          version: number;
        };
        Update: {
          content?: Json;
          created_at?: string;
          created_by?: string;
          effective_at?: string;
          giveaway_rules_id?: string;
          id?: string;
          tenant_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "giveaway_rules_versions_rules_fk";
            columns: ["tenant_id", "giveaway_rules_id"];
            isOneToOne: false;
            referencedRelation: "giveaway_rules";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "giveaway_rules_versions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "giveaway_rules_versions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      giveaway_ticket_grants: {
        Row: {
          created_at: string;
          created_by: string;
          donation_id: string | null;
          giveaway_id: string;
          id: string;
          inventory_item_id: string | null;
          issued_at: string;
          quantity: number;
          sale_id: string | null;
          source_tier_id: string;
          tenant_id: string;
          ticket_tier_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string;
          donation_id?: string | null;
          giveaway_id: string;
          id?: string;
          inventory_item_id?: string | null;
          issued_at?: string;
          quantity: number;
          sale_id?: string | null;
          source_tier_id: string;
          tenant_id?: string;
          ticket_tier_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          donation_id?: string | null;
          giveaway_id?: string;
          id?: string;
          inventory_item_id?: string | null;
          issued_at?: string;
          quantity?: number;
          sale_id?: string | null;
          source_tier_id?: string;
          tenant_id?: string;
          ticket_tier_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "giveaway_ticket_grants_donation_id_fkey";
            columns: ["tenant_id", "donation_id"];
            isOneToOne: false;
            referencedRelation: "donations";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "giveaway_ticket_grants_giveaway_id_fkey";
            columns: ["tenant_id", "giveaway_id"];
            isOneToOne: false;
            referencedRelation: "giveaways";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "giveaway_ticket_grants_inventory_item_id_fkey";
            columns: ["tenant_id", "inventory_item_id"];
            isOneToOne: false;
            referencedRelation: "inventory_items";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "giveaway_ticket_grants_sale_id_fkey";
            columns: ["tenant_id", "sale_id"];
            isOneToOne: false;
            referencedRelation: "giveaway_ticket_sales";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "giveaway_ticket_grants_source_tier_fk";
            columns: ["source_tier_id", "giveaway_id"];
            isOneToOne: false;
            referencedRelation: "giveaway_tiers";
            referencedColumns: ["id", "giveaway_id"];
          },
          {
            foreignKeyName: "giveaway_ticket_grants_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "giveaway_ticket_grants_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "giveaway_ticket_grants_ticket_tier_fk";
            columns: ["ticket_tier_id", "giveaway_id"];
            isOneToOne: false;
            referencedRelation: "giveaway_tiers";
            referencedColumns: ["id", "giveaway_id"];
          },
        ];
      };
      giveaway_ticket_packages: {
        Row: {
          bundle_quantity: number;
          created_at: string;
          created_by: string;
          giveaway_id: string;
          id: string;
          is_active: boolean;
          name: string;
          price: number;
          rank: number;
          tenant_id: string;
          tier_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          bundle_quantity?: number;
          created_at?: string;
          created_by?: string;
          giveaway_id: string;
          id?: string;
          is_active?: boolean;
          name: string;
          price: number;
          rank?: number;
          tenant_id?: string;
          tier_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          bundle_quantity?: number;
          created_at?: string;
          created_by?: string;
          giveaway_id?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          price?: number;
          rank?: number;
          tenant_id?: string;
          tier_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "giveaway_ticket_packages_giveaway_id_fkey";
            columns: ["tenant_id", "giveaway_id"];
            isOneToOne: false;
            referencedRelation: "giveaways";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "giveaway_ticket_packages_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "giveaway_ticket_packages_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "giveaway_ticket_packages_tier_fk";
            columns: ["tier_id", "giveaway_id"];
            isOneToOne: false;
            referencedRelation: "giveaway_tiers";
            referencedColumns: ["id", "giveaway_id"];
          },
        ];
      };
      giveaway_ticket_sales: {
        Row: {
          amount: number;
          created_at: string;
          created_by: string;
          giveaway_id: string;
          id: string;
          notes: string | null;
          package_id: string;
          purchaser_person_id: string | null;
          quantity: number;
          sold_at: string;
          tenant_id: string;
          unit_price: number;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          amount: number;
          created_at?: string;
          created_by?: string;
          giveaway_id: string;
          id?: string;
          notes?: string | null;
          package_id: string;
          purchaser_person_id?: string | null;
          quantity?: number;
          sold_at?: string;
          tenant_id?: string;
          unit_price: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          amount?: number;
          created_at?: string;
          created_by?: string;
          giveaway_id?: string;
          id?: string;
          notes?: string | null;
          package_id?: string;
          purchaser_person_id?: string | null;
          quantity?: number;
          sold_at?: string;
          tenant_id?: string;
          unit_price?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "giveaway_ticket_sales_giveaway_id_fkey";
            columns: ["tenant_id", "giveaway_id"];
            isOneToOne: false;
            referencedRelation: "giveaways";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "giveaway_ticket_sales_package_fk";
            columns: ["package_id", "giveaway_id"];
            isOneToOne: false;
            referencedRelation: "giveaway_ticket_packages";
            referencedColumns: ["id", "giveaway_id"];
          },
          {
            foreignKeyName: "giveaway_ticket_sales_purchaser_person_id_fkey";
            columns: ["tenant_id", "purchaser_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "giveaway_ticket_sales_purchaser_person_id_fkey";
            columns: ["tenant_id", "purchaser_person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "giveaway_ticket_sales_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "giveaway_ticket_sales_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      giveaway_tier_grants: {
        Row: {
          created_at: string;
          created_by: string;
          giveaway_id: string;
          id: string;
          quantity: number;
          source_tier_id: string;
          tenant_id: string;
          ticket_tier_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string;
          giveaway_id: string;
          id?: string;
          quantity?: number;
          source_tier_id: string;
          tenant_id?: string;
          ticket_tier_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          giveaway_id?: string;
          id?: string;
          quantity?: number;
          source_tier_id?: string;
          tenant_id?: string;
          ticket_tier_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "giveaway_tier_grants_giveaway_id_fkey";
            columns: ["tenant_id", "giveaway_id"];
            isOneToOne: false;
            referencedRelation: "giveaways";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "giveaway_tier_grants_source_tier_fk";
            columns: ["source_tier_id", "giveaway_id"];
            isOneToOne: false;
            referencedRelation: "giveaway_tiers";
            referencedColumns: ["id", "giveaway_id"];
          },
          {
            foreignKeyName: "giveaway_tier_grants_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "giveaway_tier_grants_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "giveaway_tier_grants_ticket_tier_fk";
            columns: ["ticket_tier_id", "giveaway_id"];
            isOneToOne: false;
            referencedRelation: "giveaway_tiers";
            referencedColumns: ["id", "giveaway_id"];
          },
        ];
      };
      giveaway_tier_rules: {
        Row: {
          created_at: string;
          created_by: string;
          giveaway_id: string;
          id: string;
          match_text: string;
          tenant_id: string;
          tier_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string;
          giveaway_id: string;
          id?: string;
          match_text: string;
          tenant_id?: string;
          tier_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          giveaway_id?: string;
          id?: string;
          match_text?: string;
          tenant_id?: string;
          tier_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "giveaway_tier_rules_giveaway_id_fkey";
            columns: ["tenant_id", "giveaway_id"];
            isOneToOne: false;
            referencedRelation: "giveaways";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "giveaway_tier_rules_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "giveaway_tier_rules_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "giveaway_tier_rules_tier_fk";
            columns: ["tier_id", "giveaway_id"];
            isOneToOne: false;
            referencedRelation: "giveaway_tiers";
            referencedColumns: ["id", "giveaway_id"];
          },
        ];
      };
      giveaway_tiers: {
        Row: {
          created_at: string;
          created_by: string;
          giveaway_id: string;
          id: string;
          key: string;
          label: string;
          rank: number;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string;
          giveaway_id: string;
          id?: string;
          key: string;
          label: string;
          rank?: number;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          giveaway_id?: string;
          id?: string;
          key?: string;
          label?: string;
          rank?: number;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "giveaway_tiers_giveaway_id_fkey";
            columns: ["tenant_id", "giveaway_id"];
            isOneToOne: false;
            referencedRelation: "giveaways";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "giveaway_tiers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "giveaway_tiers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      giveaway_winners: {
        Row: {
          created_at: string;
          created_by: string;
          distributed_at: string | null;
          distribution_status: string;
          giveaway_prize_id: string;
          id: string;
          notes: string | null;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
          winner_contact: string | null;
          winner_name: string;
          winner_person_id: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string;
          distributed_at?: string | null;
          distribution_status?: string;
          giveaway_prize_id: string;
          id?: string;
          notes?: string | null;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          winner_contact?: string | null;
          winner_name: string;
          winner_person_id?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          distributed_at?: string | null;
          distribution_status?: string;
          giveaway_prize_id?: string;
          id?: string;
          notes?: string | null;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          winner_contact?: string | null;
          winner_name?: string;
          winner_person_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "giveaway_winners_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "giveaway_winners_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "giveaway_winners_winner_person_id_fkey";
            columns: ["tenant_id", "winner_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "giveaway_winners_winner_person_id_fkey";
            columns: ["tenant_id", "winner_person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "raffle_winners_raffle_prize_id_fkey";
            columns: ["tenant_id", "giveaway_prize_id"];
            isOneToOne: false;
            referencedRelation: "giveaway_prizes";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      giveaways: {
        Row: {
          created_at: string;
          created_by: string;
          drawing_date: string | null;
          event_id: string;
          id: string;
          name: string | null;
          notes: string | null;
          revenue_amount: number;
          tenant_id: string;
          ticket_price: number | null;
          tickets_sold: number;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string;
          drawing_date?: string | null;
          event_id: string;
          id?: string;
          name?: string | null;
          notes?: string | null;
          revenue_amount?: number;
          tenant_id?: string;
          ticket_price?: number | null;
          tickets_sold?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          drawing_date?: string | null;
          event_id?: string;
          id?: string;
          name?: string | null;
          notes?: string | null;
          revenue_amount?: number;
          tenant_id?: string;
          ticket_price?: number | null;
          tickets_sold?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "giveaways_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "giveaways_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "raffles_event_id_fkey";
            columns: ["tenant_id", "event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      governance_meeting_action_items: {
        Row: {
          created_at: string;
          created_by: string;
          description: string;
          due_date: string | null;
          id: string;
          meeting_id: string;
          minutes_item_key: string | null;
          owner_person_id: string;
          status: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string;
          description: string;
          due_date?: string | null;
          id?: string;
          meeting_id: string;
          minutes_item_key?: string | null;
          owner_person_id: string;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          description?: string;
          due_date?: string | null;
          id?: string;
          meeting_id?: string;
          minutes_item_key?: string | null;
          owner_person_id?: string;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "governance_meeting_action_items_meeting_id_fkey";
            columns: ["tenant_id", "meeting_id"];
            isOneToOne: false;
            referencedRelation: "governance_meetings";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "governance_meeting_action_items_owner_person_id_fkey";
            columns: ["tenant_id", "owner_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "governance_meeting_action_items_owner_person_id_fkey";
            columns: ["tenant_id", "owner_person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "governance_meeting_action_items_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "governance_meeting_action_items_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      governance_meeting_attendees: {
        Row: {
          attended: boolean;
          created_at: string;
          created_by: string;
          id: string;
          meeting_id: string;
          person_id: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          attended?: boolean;
          created_at?: string;
          created_by?: string;
          id?: string;
          meeting_id: string;
          person_id: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          attended?: boolean;
          created_at?: string;
          created_by?: string;
          id?: string;
          meeting_id?: string;
          person_id?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "governance_meeting_attendees_meeting_id_fkey";
            columns: ["tenant_id", "meeting_id"];
            isOneToOne: false;
            referencedRelation: "governance_meetings";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "governance_meeting_attendees_person_id_fkey";
            columns: ["tenant_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "governance_meeting_attendees_person_id_fkey";
            columns: ["tenant_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "governance_meeting_attendees_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "governance_meeting_attendees_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      governance_meeting_decisions: {
        Row: {
          created_at: string;
          created_by: string;
          decision_date: string;
          description: string;
          id: string;
          meeting_id: string;
          tenant_id: string;
          topic: string | null;
          updated_at: string;
          updated_by: string | null;
          vote_result: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string;
          decision_date: string;
          description: string;
          id?: string;
          meeting_id: string;
          tenant_id?: string;
          topic?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          vote_result?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          decision_date?: string;
          description?: string;
          id?: string;
          meeting_id?: string;
          tenant_id?: string;
          topic?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          vote_result?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "governance_meeting_decisions_meeting_id_fkey";
            columns: ["tenant_id", "meeting_id"];
            isOneToOne: false;
            referencedRelation: "governance_meetings";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "governance_meeting_decisions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "governance_meeting_decisions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      governance_meetings: {
        Row: {
          created_at: string;
          created_by: string;
          event_id: string | null;
          facilitator_person_id: string | null;
          id: string;
          location: string | null;
          meeting_date: string;
          meeting_type: string;
          minutes_approved_at: string | null;
          minutes_approved_by: string | null;
          notes: string | null;
          notetaker_person_id: string | null;
          status: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string;
          event_id?: string | null;
          facilitator_person_id?: string | null;
          id?: string;
          location?: string | null;
          meeting_date: string;
          meeting_type: string;
          minutes_approved_at?: string | null;
          minutes_approved_by?: string | null;
          notes?: string | null;
          notetaker_person_id?: string | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          event_id?: string | null;
          facilitator_person_id?: string | null;
          id?: string;
          location?: string | null;
          meeting_date?: string;
          meeting_type?: string;
          minutes_approved_at?: string | null;
          minutes_approved_by?: string | null;
          notes?: string | null;
          notetaker_person_id?: string | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "governance_meetings_event_id_fkey";
            columns: ["tenant_id", "event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "governance_meetings_facilitator_person_id_fkey";
            columns: ["tenant_id", "facilitator_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "governance_meetings_facilitator_person_id_fkey";
            columns: ["tenant_id", "facilitator_person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "governance_meetings_notetaker_person_id_fkey";
            columns: ["tenant_id", "notetaker_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "governance_meetings_notetaker_person_id_fkey";
            columns: ["tenant_id", "notetaker_person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "governance_meetings_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "governance_meetings_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      grants: {
        Row: {
          amount: number | null;
          application_deadline: string;
          created_at: string;
          created_by: string;
          funder_name: string;
          id: string;
          notes: string | null;
          owner_person_id: string | null;
          status: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          amount?: number | null;
          application_deadline: string;
          created_at?: string;
          created_by?: string;
          funder_name: string;
          id?: string;
          notes?: string | null;
          owner_person_id?: string | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          amount?: number | null;
          application_deadline?: string;
          created_at?: string;
          created_by?: string;
          funder_name?: string;
          id?: string;
          notes?: string | null;
          owner_person_id?: string | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "grants_owner_person_id_fkey";
            columns: ["tenant_id", "owner_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "grants_owner_person_id_fkey";
            columns: ["tenant_id", "owner_person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "grants_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "grants_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_categories: {
        Row: {
          created_at: string;
          created_by: string | null;
          group_id: string;
          id: string;
          is_active: boolean;
          key: string;
          label: string;
          sort_order: number;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          group_id: string;
          id?: string;
          is_active?: boolean;
          key: string;
          label: string;
          sort_order?: number;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          group_id?: string;
          id?: string;
          is_active?: boolean;
          key?: string;
          label?: string;
          sort_order?: number;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_categories_group_id_fkey";
            columns: ["tenant_id", "group_id"];
            isOneToOne: false;
            referencedRelation: "inventory_category_groups";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "inventory_categories_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_categories_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_category_groups: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          is_active: boolean;
          key: string;
          label: string;
          sort_order: number;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          key: string;
          label: string;
          sort_order?: number;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          key?: string;
          label?: string;
          sort_order?: number;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_category_groups_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_category_groups_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_distribution_draft_items: {
        Row: {
          created_at: string;
          draft_id: string;
          id: string;
          item_id: string;
          tenant_id: string;
        };
        Insert: {
          created_at?: string;
          draft_id: string;
          id?: string;
          item_id: string;
          tenant_id?: string;
        };
        Update: {
          created_at?: string;
          draft_id?: string;
          id?: string;
          item_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_distribution_draft_items_draft_in_tenant";
            columns: ["tenant_id", "draft_id"];
            isOneToOne: false;
            referencedRelation: "inventory_distribution_drafts";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "inventory_distribution_draft_items_item_in_tenant";
            columns: ["tenant_id", "item_id"];
            isOneToOne: false;
            referencedRelation: "inventory_items";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "inventory_distribution_draft_items_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_distribution_draft_items_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_distribution_drafts: {
        Row: {
          ack_acknowledged_at: string | null;
          ack_as_is_text: string | null;
          ack_method: string | null;
          ack_token_expires_at: string | null;
          ack_token_hash: string | null;
          ack_typed_name: string | null;
          created_at: string;
          event_id: string | null;
          id: string;
          recipient_person_id: string | null;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
          user_id: string;
        };
        Insert: {
          ack_acknowledged_at?: string | null;
          ack_as_is_text?: string | null;
          ack_method?: string | null;
          ack_token_expires_at?: string | null;
          ack_token_hash?: string | null;
          ack_typed_name?: string | null;
          created_at?: string;
          event_id?: string | null;
          id?: string;
          recipient_person_id?: string | null;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          user_id?: string;
        };
        Update: {
          ack_acknowledged_at?: string | null;
          ack_as_is_text?: string | null;
          ack_method?: string | null;
          ack_token_expires_at?: string | null;
          ack_token_hash?: string | null;
          ack_typed_name?: string | null;
          created_at?: string;
          event_id?: string | null;
          id?: string;
          recipient_person_id?: string | null;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_distribution_drafts_event_in_tenant";
            columns: ["tenant_id", "event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "inventory_distribution_drafts_recipient_in_tenant";
            columns: ["tenant_id", "recipient_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "inventory_distribution_drafts_recipient_in_tenant";
            columns: ["tenant_id", "recipient_person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "inventory_distribution_drafts_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_distribution_drafts_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_item_tag_assignments: {
        Row: {
          assigned_at: string;
          assigned_by: string | null;
          id: string;
          item_id: string;
          release_reason: string | null;
          released_at: string | null;
          released_by: string | null;
          tag_id: string;
          tenant_id: string;
        };
        Insert: {
          assigned_at?: string;
          assigned_by?: string | null;
          id?: string;
          item_id: string;
          release_reason?: string | null;
          released_at?: string | null;
          released_by?: string | null;
          tag_id: string;
          tenant_id?: string;
        };
        Update: {
          assigned_at?: string;
          assigned_by?: string | null;
          id?: string;
          item_id?: string;
          release_reason?: string | null;
          released_at?: string | null;
          released_by?: string | null;
          tag_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_item_tag_assignments_item_in_tenant";
            columns: ["tenant_id", "item_id"];
            isOneToOne: false;
            referencedRelation: "inventory_items";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "inventory_item_tag_assignments_tag_in_tenant";
            columns: ["tenant_id", "tag_id"];
            isOneToOne: false;
            referencedRelation: "inventory_item_tags";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "inventory_item_tag_assignments_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_item_tag_assignments_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_item_tags: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          item_id: string | null;
          kind: string;
          last_printed_at: string | null;
          nfc_written_at: string | null;
          nfc_written_by: string | null;
          number: number | null;
          print_count: number;
          retired_at: string | null;
          retired_by: string | null;
          retired_note: string | null;
          retired_reason: string | null;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
          value: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          item_id?: string | null;
          kind: string;
          last_printed_at?: string | null;
          nfc_written_at?: string | null;
          nfc_written_by?: string | null;
          number?: number | null;
          print_count?: number;
          retired_at?: string | null;
          retired_by?: string | null;
          retired_note?: string | null;
          retired_reason?: string | null;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          value: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          item_id?: string | null;
          kind?: string;
          last_printed_at?: string | null;
          nfc_written_at?: string | null;
          nfc_written_by?: string | null;
          number?: number | null;
          print_count?: number;
          retired_at?: string | null;
          retired_by?: string | null;
          retired_note?: string | null;
          retired_reason?: string | null;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          value?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_item_tags_item_in_tenant";
            columns: ["tenant_id", "item_id"];
            isOneToOne: false;
            referencedRelation: "inventory_items";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "inventory_item_tags_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_item_tags_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_items: {
        Row: {
          category_id: string | null;
          condition: string;
          created_at: string;
          created_by: string;
          description: string;
          donation_id: string;
          face_value: number | null;
          gender: string | null;
          id: string;
          intended_use: string;
          notes: string | null;
          photo_url: string | null;
          size: string | null;
          status: string;
          tenant_id: string;
          type: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          category_id?: string | null;
          condition: string;
          created_at?: string;
          created_by?: string;
          description: string;
          donation_id: string;
          face_value?: number | null;
          gender?: string | null;
          id?: string;
          intended_use?: string;
          notes?: string | null;
          photo_url?: string | null;
          size?: string | null;
          status?: string;
          tenant_id?: string;
          type?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          category_id?: string | null;
          condition?: string;
          created_at?: string;
          created_by?: string;
          description?: string;
          donation_id?: string;
          face_value?: number | null;
          gender?: string | null;
          id?: string;
          intended_use?: string;
          notes?: string | null;
          photo_url?: string | null;
          size?: string | null;
          status?: string;
          tenant_id?: string;
          type?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_items_category_id_fkey";
            columns: ["tenant_id", "category_id"];
            isOneToOne: false;
            referencedRelation: "inventory_categories";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "inventory_items_donation_id_fkey";
            columns: ["tenant_id", "donation_id"];
            isOneToOne: false;
            referencedRelation: "donations";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "inventory_items_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_items_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_movements: {
        Row: {
          created_at: string;
          created_by: string | null;
          distribution_acknowledgement_id: string | null;
          event_id: string | null;
          gear_request_id: string | null;
          id: string;
          inventory_item_id: string;
          movement_type: string;
          notes: string | null;
          occurred_at: string;
          quantity: number;
          reason: string | null;
          recipient_person_id: string | null;
          tenant_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          distribution_acknowledgement_id?: string | null;
          event_id?: string | null;
          gear_request_id?: string | null;
          id?: string;
          inventory_item_id: string;
          movement_type: string;
          notes?: string | null;
          occurred_at?: string;
          quantity?: number;
          reason?: string | null;
          recipient_person_id?: string | null;
          tenant_id?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          distribution_acknowledgement_id?: string | null;
          event_id?: string | null;
          gear_request_id?: string | null;
          id?: string;
          inventory_item_id?: string;
          movement_type?: string;
          notes?: string | null;
          occurred_at?: string;
          quantity?: number;
          reason?: string | null;
          recipient_person_id?: string | null;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_movements_distribution_acknowledgement_in_tenant";
            columns: ["tenant_id", "distribution_acknowledgement_id"];
            isOneToOne: false;
            referencedRelation: "distribution_acknowledgements";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "inventory_movements_event_id_fkey";
            columns: ["tenant_id", "event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "inventory_movements_gear_request_id_fkey";
            columns: ["tenant_id", "gear_request_id"];
            isOneToOne: false;
            referencedRelation: "gear_requests";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "inventory_movements_inventory_item_id_fkey";
            columns: ["tenant_id", "inventory_item_id"];
            isOneToOne: false;
            referencedRelation: "inventory_items";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "inventory_movements_recipient_person_id_fkey";
            columns: ["tenant_id", "recipient_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "inventory_movements_recipient_person_id_fkey";
            columns: ["tenant_id", "recipient_person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "inventory_movements_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_movements_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      legal_document_versions: {
        Row: {
          content: Json;
          created_at: string;
          created_by: string | null;
          document: string;
          effective_at: string;
          id: string;
          surfaces: Json | null;
          tenant_id: string;
          time_zone: string;
          version: number;
        };
        Insert: {
          content: Json;
          created_at?: string;
          created_by?: string | null;
          document: string;
          effective_at?: string;
          id?: string;
          surfaces?: Json | null;
          tenant_id?: string;
          time_zone?: string;
          version: number;
        };
        Update: {
          content?: Json;
          created_at?: string;
          created_by?: string | null;
          document?: string;
          effective_at?: string;
          id?: string;
          surfaces?: Json | null;
          tenant_id?: string;
          time_zone?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "legal_document_versions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "legal_document_versions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      meeting_minutes: {
        Row: {
          agenda_snapshot: Json;
          approved_at: string | null;
          approved_at_meeting_id: string | null;
          approved_by: string | null;
          body_text: string | null;
          created_at: string;
          created_by: string;
          finalized_at: string | null;
          finalized_by: string | null;
          id: string;
          meeting_id: string;
          notes: Json;
          status: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          agenda_snapshot?: Json;
          approved_at?: string | null;
          approved_at_meeting_id?: string | null;
          approved_by?: string | null;
          body_text?: string | null;
          created_at?: string;
          created_by?: string;
          finalized_at?: string | null;
          finalized_by?: string | null;
          id?: string;
          meeting_id: string;
          notes?: Json;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          agenda_snapshot?: Json;
          approved_at?: string | null;
          approved_at_meeting_id?: string | null;
          approved_by?: string | null;
          body_text?: string | null;
          created_at?: string;
          created_by?: string;
          finalized_at?: string | null;
          finalized_by?: string | null;
          id?: string;
          meeting_id?: string;
          notes?: Json;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "meeting_minutes_tenant_id_approved_at_meeting_id_fkey";
            columns: ["tenant_id", "approved_at_meeting_id"];
            isOneToOne: false;
            referencedRelation: "governance_meetings";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "meeting_minutes_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "meeting_minutes_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "meeting_minutes_tenant_id_meeting_id_fkey";
            columns: ["tenant_id", "meeting_id"];
            isOneToOne: true;
            referencedRelation: "governance_meetings";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      modules: {
        Row: {
          default_enabled: boolean;
          description: string | null;
          is_core: boolean;
          key: string;
          label: string;
          sort_order: number;
        };
        Insert: {
          default_enabled: boolean;
          description?: string | null;
          is_core?: boolean;
          key: string;
          label: string;
          sort_order?: number;
        };
        Update: {
          default_enabled?: boolean;
          description?: string | null;
          is_core?: boolean;
          key?: string;
          label?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      monetary_donations: {
        Row: {
          amount: number;
          created_at: string;
          created_by: string;
          donor_id: string | null;
          event_id: string | null;
          external_reference: string | null;
          fee_amount: number | null;
          gross_amount: number | null;
          id: string;
          method: string;
          notes: string | null;
          processor_label: string | null;
          received_date: string;
          source: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          amount: number;
          created_at?: string;
          created_by?: string;
          donor_id?: string | null;
          event_id?: string | null;
          external_reference?: string | null;
          fee_amount?: number | null;
          gross_amount?: number | null;
          id?: string;
          method: string;
          notes?: string | null;
          processor_label?: string | null;
          received_date?: string;
          source?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          amount?: number;
          created_at?: string;
          created_by?: string;
          donor_id?: string | null;
          event_id?: string | null;
          external_reference?: string | null;
          fee_amount?: number | null;
          gross_amount?: number | null;
          id?: string;
          method?: string;
          notes?: string | null;
          processor_label?: string | null;
          received_date?: string;
          source?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "monetary_donations_donor_id_fkey";
            columns: ["tenant_id", "donor_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "monetary_donations_donor_id_fkey";
            columns: ["tenant_id", "donor_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "monetary_donations_event_id_fkey";
            columns: ["tenant_id", "event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "monetary_donations_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "monetary_donations_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      nonprofit_status_milestones: {
        Row: {
          created_at: string;
          created_by: string | null;
          description: string;
          due_date: string | null;
          id: string;
          notes: string | null;
          owner_person_id: string | null;
          phase: string;
          sort_order: number;
          status: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          description: string;
          due_date?: string | null;
          id?: string;
          notes?: string | null;
          owner_person_id?: string | null;
          phase: string;
          sort_order?: number;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          description?: string;
          due_date?: string | null;
          id?: string;
          notes?: string | null;
          owner_person_id?: string | null;
          phase?: string;
          sort_order?: number;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "nonprofit_status_milestones_owner_person_id_fkey";
            columns: ["tenant_id", "owner_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "nonprofit_status_milestones_owner_person_id_fkey";
            columns: ["tenant_id", "owner_person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "nonprofit_status_milestones_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "nonprofit_status_milestones_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_deliveries: {
        Row: {
          created_at: string;
          dedupe_key: string;
          error: string | null;
          id: string;
          kind: string;
          person_id: string | null;
          provider_message_id: string | null;
          sent_at: string | null;
          skip_reason: string | null;
          status: string;
          tenant_id: string;
        };
        Insert: {
          created_at?: string;
          dedupe_key: string;
          error?: string | null;
          id?: string;
          kind: string;
          person_id?: string | null;
          provider_message_id?: string | null;
          sent_at?: string | null;
          skip_reason?: string | null;
          status?: string;
          tenant_id?: string;
        };
        Update: {
          created_at?: string;
          dedupe_key?: string;
          error?: string | null;
          id?: string;
          kind?: string;
          person_id?: string | null;
          provider_message_id?: string | null;
          sent_at?: string | null;
          skip_reason?: string | null;
          status?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notification_deliveries_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notification_deliveries_tenant_id_person_id_fkey";
            columns: ["tenant_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "notification_deliveries_tenant_id_person_id_fkey";
            columns: ["tenant_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      outbound_messages: {
        Row: {
          batch_id: string | null;
          body: string;
          created_at: string;
          delivery_id: string | null;
          id: string;
          kind: string;
          module: string;
          person_id: string | null;
          record_id: string;
          record_type: string;
          sent_by: string | null;
          status: string;
          subject: string;
          tenant_id: string;
          to_email: string;
        };
        Insert: {
          batch_id?: string | null;
          body: string;
          created_at?: string;
          delivery_id?: string | null;
          id: string;
          kind: string;
          module: string;
          person_id?: string | null;
          record_id: string;
          record_type: string;
          sent_by?: string | null;
          status: string;
          subject: string;
          tenant_id?: string;
          to_email: string;
        };
        Update: {
          batch_id?: string | null;
          body?: string;
          created_at?: string;
          delivery_id?: string | null;
          id?: string;
          kind?: string;
          module?: string;
          person_id?: string | null;
          record_id?: string;
          record_type?: string;
          sent_by?: string | null;
          status?: string;
          subject?: string;
          tenant_id?: string;
          to_email?: string;
        };
        Relationships: [
          {
            foreignKeyName: "outbound_messages_tenant_id_delivery_id_fkey";
            columns: ["tenant_id", "delivery_id"];
            isOneToOne: false;
            referencedRelation: "notification_deliveries";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "outbound_messages_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "outbound_messages_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "outbound_messages_tenant_id_person_id_fkey";
            columns: ["tenant_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "outbound_messages_tenant_id_person_id_fkey";
            columns: ["tenant_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      partnership_opportunities: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          next_step_date: string | null;
          notes: string | null;
          organization_person_id: string;
          owner_person_id: string | null;
          stage: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string;
          id?: string;
          next_step_date?: string | null;
          notes?: string | null;
          organization_person_id: string;
          owner_person_id?: string | null;
          stage?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          next_step_date?: string | null;
          notes?: string | null;
          organization_person_id?: string;
          owner_person_id?: string | null;
          stage?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "partnership_opportunities_organization_person_id_fkey";
            columns: ["tenant_id", "organization_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "partnership_opportunities_organization_person_id_fkey";
            columns: ["tenant_id", "organization_person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "partnership_opportunities_owner_person_id_fkey";
            columns: ["tenant_id", "owner_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "partnership_opportunities_owner_person_id_fkey";
            columns: ["tenant_id", "owner_person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "partnership_opportunities_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "partnership_opportunities_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      pending_event_access_grants: {
        Row: {
          areas: string[];
          created_at: string;
          created_by: string | null;
          email: string;
          event_id: string;
          id: string;
          invited_at: string | null;
          level: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          areas: string[];
          created_at?: string;
          created_by?: string | null;
          email: string;
          event_id: string;
          id?: string;
          invited_at?: string | null;
          level: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          areas?: string[];
          created_at?: string;
          created_by?: string | null;
          email?: string;
          event_id?: string;
          id?: string;
          invited_at?: string | null;
          level?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "pending_event_access_grants_event_fkey";
            columns: ["tenant_id", "event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "pending_event_access_grants_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pending_event_access_grants_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      pending_role_grants: {
        Row: {
          claimed_at: string | null;
          claimed_by: string | null;
          created_at: string;
          created_by: string | null;
          email: string;
          expires_at: string | null;
          id: string;
          invited_at: string | null;
          invited_by: string | null;
          name: string | null;
          revoked_at: string | null;
          revoked_by: string | null;
          role_id: string;
          status: string;
          tenant_id: string;
        };
        Insert: {
          claimed_at?: string | null;
          claimed_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          email: string;
          expires_at?: string | null;
          id?: string;
          invited_at?: string | null;
          invited_by?: string | null;
          name?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
          role_id: string;
          status?: string;
          tenant_id: string;
        };
        Update: {
          claimed_at?: string | null;
          claimed_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          email?: string;
          expires_at?: string | null;
          id?: string;
          invited_at?: string | null;
          invited_by?: string | null;
          name?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
          role_id?: string;
          status?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pending_role_grants_role_id_fkey";
            columns: ["tenant_id", "role_id"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "pending_role_grants_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pending_role_grants_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      people: {
        Row: {
          address_city: string | null;
          address_country: string | null;
          address_line1: string | null;
          address_line2: string | null;
          address_postal_code: string | null;
          address_region: string | null;
          auth_user_id: string | null;
          created_at: string;
          created_by: string | null;
          email: string | null;
          email_pending: string | null;
          email_token: string | null;
          email_token_expires_at: string | null;
          id: string;
          instagram_handle: string | null;
          is_anonymous: boolean;
          logo_url: string | null;
          name: string | null;
          notes: string | null;
          notification_email: string | null;
          notification_email_pending: string | null;
          notification_email_token: string | null;
          notification_email_token_expires_at: string | null;
          person_type: string;
          phone: string | null;
          preferred_mountain: string | null;
          preferred_name: string | null;
          primary_contact_person_id: string | null;
          pronouns: string | null;
          riding_discipline: string | null;
          ski_experience_level: string | null;
          snowboard_experience_level: string | null;
          source_type: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
          website: string | null;
          has_portal_access: boolean | null;
        };
        Insert: {
          address_city?: string | null;
          address_country?: string | null;
          address_line1?: string | null;
          address_line2?: string | null;
          address_postal_code?: string | null;
          address_region?: string | null;
          auth_user_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          email?: string | null;
          email_pending?: string | null;
          email_token?: string | null;
          email_token_expires_at?: string | null;
          id?: string;
          instagram_handle?: string | null;
          is_anonymous?: boolean;
          logo_url?: string | null;
          name?: string | null;
          notes?: string | null;
          notification_email?: string | null;
          notification_email_pending?: string | null;
          notification_email_token?: string | null;
          notification_email_token_expires_at?: string | null;
          person_type?: string;
          phone?: string | null;
          preferred_mountain?: string | null;
          preferred_name?: string | null;
          primary_contact_person_id?: string | null;
          pronouns?: string | null;
          riding_discipline?: string | null;
          ski_experience_level?: string | null;
          snowboard_experience_level?: string | null;
          source_type: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          website?: string | null;
        };
        Update: {
          address_city?: string | null;
          address_country?: string | null;
          address_line1?: string | null;
          address_line2?: string | null;
          address_postal_code?: string | null;
          address_region?: string | null;
          auth_user_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          email?: string | null;
          email_pending?: string | null;
          email_token?: string | null;
          email_token_expires_at?: string | null;
          id?: string;
          instagram_handle?: string | null;
          is_anonymous?: boolean;
          logo_url?: string | null;
          name?: string | null;
          notes?: string | null;
          notification_email?: string | null;
          notification_email_pending?: string | null;
          notification_email_token?: string | null;
          notification_email_token_expires_at?: string | null;
          person_type?: string;
          phone?: string | null;
          preferred_mountain?: string | null;
          preferred_name?: string | null;
          primary_contact_person_id?: string | null;
          pronouns?: string | null;
          riding_discipline?: string | null;
          ski_experience_level?: string | null;
          snowboard_experience_level?: string | null;
          source_type?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          website?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "people_primary_contact_person_id_fkey";
            columns: ["tenant_id", "primary_contact_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "people_primary_contact_person_id_fkey";
            columns: ["tenant_id", "primary_contact_person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "people_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "people_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      person_claims: {
        Row: {
          auth_user_id: string;
          claimed_at: string | null;
          claimed_by_person_id: string | null;
          claimed_person_id: string | null;
          created_at: string;
          id: string;
          note: string | null;
          review_note: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          stated_email: string | null;
          stated_instagram_handle: string | null;
          stated_name: string;
          stated_phone: string | null;
          status: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          auth_user_id: string;
          claimed_at?: string | null;
          claimed_by_person_id?: string | null;
          claimed_person_id?: string | null;
          created_at?: string;
          id?: string;
          note?: string | null;
          review_note?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          stated_email?: string | null;
          stated_instagram_handle?: string | null;
          stated_name: string;
          stated_phone?: string | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          auth_user_id?: string;
          claimed_at?: string | null;
          claimed_by_person_id?: string | null;
          claimed_person_id?: string | null;
          created_at?: string;
          id?: string;
          note?: string | null;
          review_note?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          stated_email?: string | null;
          stated_instagram_handle?: string | null;
          stated_name?: string;
          stated_phone?: string | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "person_claims_claimed_by_in_tenant";
            columns: ["tenant_id", "claimed_by_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "person_claims_claimed_by_in_tenant";
            columns: ["tenant_id", "claimed_by_person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "person_claims_person_in_tenant";
            columns: ["tenant_id", "claimed_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "person_claims_person_in_tenant";
            columns: ["tenant_id", "claimed_person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "person_claims_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "person_claims_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      person_merges: {
        Row: {
          id: string;
          merged_at: string;
          merged_by: string | null;
          merged_person_id: string;
          merged_snapshot: Json;
          redacted_at: string | null;
          repointed: Json;
          survivor_before: Json;
          survivor_person_id: string;
          tenant_id: string;
        };
        Insert: {
          id?: string;
          merged_at?: string;
          merged_by?: string | null;
          merged_person_id: string;
          merged_snapshot: Json;
          redacted_at?: string | null;
          repointed: Json;
          survivor_before: Json;
          survivor_person_id: string;
          tenant_id?: string;
        };
        Update: {
          id?: string;
          merged_at?: string;
          merged_by?: string | null;
          merged_person_id?: string;
          merged_snapshot?: Json;
          redacted_at?: string | null;
          repointed?: Json;
          survivor_before?: Json;
          survivor_person_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "person_merges_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "person_merges_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      person_notification_preferences: {
        Row: {
          created_at: string;
          created_by: string | null;
          enabled: boolean;
          id: string;
          kind: string;
          person_id: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          enabled?: boolean;
          id?: string;
          kind: string;
          person_id: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          enabled?: boolean;
          id?: string;
          kind?: string;
          person_id?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "person_notification_preferences_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "person_notification_preferences_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "person_notification_preferences_tenant_id_person_id_fkey";
            columns: ["tenant_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "person_notification_preferences_tenant_id_person_id_fkey";
            columns: ["tenant_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      person_organizations: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          is_primary: boolean;
          organization_id: string;
          person_id: string;
          role: string | null;
          tenant_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string;
          id?: string;
          is_primary?: boolean;
          organization_id: string;
          person_id: string;
          role?: string | null;
          tenant_id?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          is_primary?: boolean;
          organization_id?: string;
          person_id?: string;
          role?: string | null;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "person_organizations_organization_id_fkey";
            columns: ["tenant_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "person_organizations_organization_id_fkey";
            columns: ["tenant_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "person_organizations_person_id_fkey";
            columns: ["tenant_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "person_organizations_person_id_fkey";
            columns: ["tenant_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "person_organizations_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "person_organizations_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      person_role_tags: {
        Row: {
          granted_at: string;
          granted_by: string | null;
          id: string;
          is_public: boolean;
          notes: string | null;
          person_id: string;
          role: string;
          tenant_id: string;
        };
        Insert: {
          granted_at?: string;
          granted_by?: string | null;
          id?: string;
          is_public?: boolean;
          notes?: string | null;
          person_id: string;
          role: string;
          tenant_id?: string;
        };
        Update: {
          granted_at?: string;
          granted_by?: string | null;
          id?: string;
          is_public?: boolean;
          notes?: string | null;
          person_id?: string;
          role?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "person_role_tags_person_id_fkey";
            columns: ["tenant_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "person_role_tags_person_id_fkey";
            columns: ["tenant_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "person_role_tags_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "person_role_tags_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      person_screenings: {
        Row: {
          cleared_on: string;
          created_at: string;
          created_by: string | null;
          expires_on: string | null;
          id: string;
          person_id: string;
          tenant_id: string;
          tier_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          cleared_on: string;
          created_at?: string;
          created_by?: string | null;
          expires_on?: string | null;
          id?: string;
          person_id: string;
          tenant_id?: string;
          tier_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          cleared_on?: string;
          created_at?: string;
          created_by?: string | null;
          expires_on?: string | null;
          id?: string;
          person_id?: string;
          tenant_id?: string;
          tier_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "person_screenings_person_in_tenant";
            columns: ["tenant_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "person_screenings_person_in_tenant";
            columns: ["tenant_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "person_screenings_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "person_screenings_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "person_screenings_tier_in_tenant";
            columns: ["tenant_id", "tier_id"];
            isOneToOne: false;
            referencedRelation: "volunteer_screening_tiers";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      person_waiver_acceptances: {
        Row: {
          accepted_at: string;
          person_id: string;
          tenant_id: string;
          version: number;
        };
        Insert: {
          accepted_at?: string;
          person_id: string;
          tenant_id?: string;
          version: number;
        };
        Update: {
          accepted_at?: string;
          person_id?: string;
          tenant_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "person_waiver_acceptances_person_fkey";
            columns: ["tenant_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "person_waiver_acceptances_person_fkey";
            columns: ["tenant_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "person_waiver_acceptances_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "person_waiver_acceptances_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      place_zips: {
        Row: {
          place_id: string;
          share: number;
          zip: string;
        };
        Insert: {
          place_id: string;
          share: number;
          zip: string;
        };
        Update: {
          place_id?: string;
          share?: number;
          zip?: string;
        };
        Relationships: [
          {
            foreignKeyName: "place_zips_place_id_fkey";
            columns: ["place_id"];
            isOneToOne: false;
            referencedRelation: "places";
            referencedColumns: ["id"];
          },
        ];
      };
      places: {
        Row: {
          aliases: string[];
          area_ids: string[];
          county_name: string | null;
          id: string;
          kind: string;
          label: string;
          name: string;
          parent_id: string | null;
          place_type: string | null;
          population: number | null;
          search_text: string;
          source: string;
          source_id: string;
          state_code: string;
        };
        Insert: {
          aliases?: string[];
          area_ids?: string[];
          county_name?: string | null;
          id: string;
          kind: string;
          label: string;
          name: string;
          parent_id?: string | null;
          place_type?: string | null;
          population?: number | null;
          search_text?: string;
          source: string;
          source_id: string;
          state_code: string;
        };
        Update: {
          aliases?: string[];
          area_ids?: string[];
          county_name?: string | null;
          id?: string;
          kind?: string;
          label?: string;
          name?: string;
          parent_id?: string | null;
          place_type?: string | null;
          population?: number | null;
          search_text?: string;
          source?: string;
          source_id?: string;
          state_code?: string;
        };
        Relationships: [
          {
            foreignKeyName: "places_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "places";
            referencedColumns: ["id"];
          },
        ];
      };
      plan_modules: {
        Row: {
          enabled: boolean;
          module_key: string;
          plan: string;
        };
        Insert: {
          enabled: boolean;
          module_key: string;
          plan: string;
        };
        Update: {
          enabled?: boolean;
          module_key?: string;
          plan?: string;
        };
        Relationships: [
          {
            foreignKeyName: "plan_modules_module_key_fkey";
            columns: ["module_key"];
            isOneToOne: false;
            referencedRelation: "modules";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "plan_modules_module_key_fkey";
            columns: ["module_key"];
            isOneToOne: false;
            referencedRelation: "public_tenant_modules";
            referencedColumns: ["module_key"];
          },
        ];
      };
      policies: {
        Row: {
          body_text: string | null;
          category: string | null;
          created_at: string;
          created_by: string;
          document_path: string | null;
          effective_date: string;
          external_link: string | null;
          id: string;
          name: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
          version: string;
        };
        Insert: {
          body_text?: string | null;
          category?: string | null;
          created_at?: string;
          created_by?: string;
          document_path?: string | null;
          effective_date: string;
          external_link?: string | null;
          id?: string;
          name: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          version: string;
        };
        Update: {
          body_text?: string | null;
          category?: string | null;
          created_at?: string;
          created_by?: string;
          document_path?: string | null;
          effective_date?: string;
          external_link?: string | null;
          id?: string;
          name?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: string;
        };
        Relationships: [
          {
            foreignKeyName: "policies_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "policies_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      product_variants: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          is_active: boolean;
          label: string;
          price: number;
          product_id: string;
          sku: string | null;
          sort_order: number;
          stock_on_hand: number;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string;
          id?: string;
          is_active?: boolean;
          label: string;
          price: number;
          product_id: string;
          sku?: string | null;
          sort_order?: number;
          stock_on_hand?: number;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          is_active?: boolean;
          label?: string;
          price?: number;
          product_id?: string;
          sku?: string | null;
          sort_order?: number;
          stock_on_hand?: number;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "product_variants_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_variants_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_variants_tenant_id_product_id_fkey";
            columns: ["tenant_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      products: {
        Row: {
          created_at: string;
          created_by: string;
          description: string | null;
          id: string;
          is_active: boolean;
          name: string;
          sort_order: number;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          sort_order?: number;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          sort_order?: number;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "products_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      programs: {
        Row: {
          created_at: string;
          created_by: string;
          description: string | null;
          emoji: string | null;
          id: string;
          is_public: boolean;
          name: string;
          pillar: string | null;
          sort_order: number | null;
          status: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string;
          description?: string | null;
          emoji?: string | null;
          id?: string;
          is_public?: boolean;
          name: string;
          pillar?: string | null;
          sort_order?: number | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          description?: string | null;
          emoji?: string | null;
          id?: string;
          is_public?: boolean;
          name?: string;
          pillar?: string | null;
          sort_order?: number | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "programs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "programs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      public_team_members: {
        Row: {
          bio: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          person_id: string;
          photo_url: string | null;
          public_role: string | null;
          sort_order: number | null;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          bio?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          person_id: string;
          photo_url?: string | null;
          public_role?: string | null;
          sort_order?: number | null;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          bio?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          person_id?: string;
          photo_url?: string | null;
          public_role?: string | null;
          sort_order?: number | null;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "public_team_members_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "public_team_members_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "public_team_members_tenant_id_person_id_fkey";
            columns: ["tenant_id", "person_id"];
            isOneToOne: true;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "public_team_members_tenant_id_person_id_fkey";
            columns: ["tenant_id", "person_id"];
            isOneToOne: true;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      publication_pages: {
        Row: {
          alt_text: string | null;
          created_at: string;
          created_by: string | null;
          height: number;
          id: string;
          image_path: string;
          image_renditions: Json;
          position: number;
          publication_id: string;
          tenant_id: string;
          transcript: string | null;
          updated_at: string;
          updated_by: string | null;
          width: number;
        };
        Insert: {
          alt_text?: string | null;
          created_at?: string;
          created_by?: string | null;
          height: number;
          id?: string;
          image_path: string;
          image_renditions?: Json;
          position: number;
          publication_id: string;
          tenant_id?: string;
          transcript?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          width: number;
        };
        Update: {
          alt_text?: string | null;
          created_at?: string;
          created_by?: string | null;
          height?: number;
          id?: string;
          image_path?: string;
          image_renditions?: Json;
          position?: number;
          publication_id?: string;
          tenant_id?: string;
          transcript?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          width?: number;
        };
        Relationships: [
          {
            foreignKeyName: "publication_pages_publication_in_tenant";
            columns: ["tenant_id", "publication_id"];
            isOneToOne: false;
            referencedRelation: "publications";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "publication_pages_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "publication_pages_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      publications: {
        Row: {
          blurb: string | null;
          cover_height: number | null;
          cover_path: string | null;
          cover_renditions: Json;
          cover_width: number | null;
          created_at: string;
          created_by: string | null;
          id: string;
          print_pdf_bytes: number | null;
          print_pdf_path: string | null;
          publish_date: string | null;
          published_at: string | null;
          reading_pdf_bytes: number | null;
          reading_pdf_path: string | null;
          season_label: string | null;
          slug: string;
          status: string;
          tenant_id: string;
          title: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          blurb?: string | null;
          cover_height?: number | null;
          cover_path?: string | null;
          cover_renditions?: Json;
          cover_width?: number | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          print_pdf_bytes?: number | null;
          print_pdf_path?: string | null;
          publish_date?: string | null;
          published_at?: string | null;
          reading_pdf_bytes?: number | null;
          reading_pdf_path?: string | null;
          season_label?: string | null;
          slug: string;
          status?: string;
          tenant_id?: string;
          title: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          blurb?: string | null;
          cover_height?: number | null;
          cover_path?: string | null;
          cover_renditions?: Json;
          cover_width?: number | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          print_pdf_bytes?: number | null;
          print_pdf_path?: string | null;
          publish_date?: string | null;
          published_at?: string | null;
          reading_pdf_bytes?: number | null;
          reading_pdf_path?: string | null;
          season_label?: string | null;
          slug?: string;
          status?: string;
          tenant_id?: string;
          title?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "publications_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "publications_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      rate_limit_hits: {
        Row: {
          created_at: string;
          id: number;
          ip_address: unknown;
          route: string;
        };
        Insert: {
          created_at?: string;
          id?: never;
          ip_address?: unknown;
          route: string;
        };
        Update: {
          created_at?: string;
          id?: never;
          ip_address?: unknown;
          route?: string;
        };
        Relationships: [];
      };
      reimbursements: {
        Row: {
          amount: number;
          approved_at: string | null;
          approved_by: string | null;
          created_at: string;
          created_by: string;
          currency: string;
          description: string;
          event_id: string | null;
          id: string;
          notes: string | null;
          paid_at: string | null;
          paid_by: string | null;
          person_id: string;
          receipt_path: string | null;
          receipt_url: string | null;
          rejected_at: string | null;
          rejection_reason: string | null;
          source_expense_id: string | null;
          status: string;
          submitted_by: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          amount: number;
          approved_at?: string | null;
          approved_by?: string | null;
          created_at?: string;
          created_by?: string;
          currency?: string;
          description: string;
          event_id?: string | null;
          id?: string;
          notes?: string | null;
          paid_at?: string | null;
          paid_by?: string | null;
          person_id: string;
          receipt_path?: string | null;
          receipt_url?: string | null;
          rejected_at?: string | null;
          rejection_reason?: string | null;
          source_expense_id?: string | null;
          status?: string;
          submitted_by?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          amount?: number;
          approved_at?: string | null;
          approved_by?: string | null;
          created_at?: string;
          created_by?: string;
          currency?: string;
          description?: string;
          event_id?: string | null;
          id?: string;
          notes?: string | null;
          paid_at?: string | null;
          paid_by?: string | null;
          person_id?: string;
          receipt_path?: string | null;
          receipt_url?: string | null;
          rejected_at?: string | null;
          rejection_reason?: string | null;
          source_expense_id?: string | null;
          status?: string;
          submitted_by?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "reimbursements_event_id_fkey";
            columns: ["tenant_id", "event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "reimbursements_person_id_fkey";
            columns: ["tenant_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "reimbursements_person_id_fkey";
            columns: ["tenant_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "reimbursements_source_expense_id_fkey";
            columns: ["tenant_id", "source_expense_id"];
            isOneToOne: false;
            referencedRelation: "event_expenses";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "reimbursements_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reimbursements_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      resolutions: {
        Row: {
          body_text: string | null;
          created_at: string;
          created_by: string;
          document_path: string | null;
          effective_date: string | null;
          external_link: string | null;
          id: string;
          meeting_id: string | null;
          motion_text: string;
          mover_person_id: string;
          seconder_person_id: string | null;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
          vote_outcome: string;
        };
        Insert: {
          body_text?: string | null;
          created_at?: string;
          created_by?: string;
          document_path?: string | null;
          effective_date?: string | null;
          external_link?: string | null;
          id?: string;
          meeting_id?: string | null;
          motion_text: string;
          mover_person_id: string;
          seconder_person_id?: string | null;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          vote_outcome?: string;
        };
        Update: {
          body_text?: string | null;
          created_at?: string;
          created_by?: string;
          document_path?: string | null;
          effective_date?: string | null;
          external_link?: string | null;
          id?: string;
          meeting_id?: string | null;
          motion_text?: string;
          mover_person_id?: string;
          seconder_person_id?: string | null;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          vote_outcome?: string;
        };
        Relationships: [
          {
            foreignKeyName: "resolutions_meeting_id_fkey";
            columns: ["tenant_id", "meeting_id"];
            isOneToOne: false;
            referencedRelation: "governance_meetings";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "resolutions_mover_person_id_fkey";
            columns: ["tenant_id", "mover_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "resolutions_mover_person_id_fkey";
            columns: ["tenant_id", "mover_person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "resolutions_seconder_person_id_fkey";
            columns: ["tenant_id", "seconder_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "resolutions_seconder_person_id_fkey";
            columns: ["tenant_id", "seconder_person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "resolutions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "resolutions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      resources: {
        Row: {
          description: string | null;
          id: string;
          key: string;
          label: string;
          module_key: string;
          section: string;
          sort_order: number;
        };
        Insert: {
          description?: string | null;
          id?: string;
          key: string;
          label: string;
          module_key: string;
          section: string;
          sort_order?: number;
        };
        Update: {
          description?: string | null;
          id?: string;
          key?: string;
          label?: string;
          module_key?: string;
          section?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "resources_module_key_fkey";
            columns: ["module_key"];
            isOneToOne: false;
            referencedRelation: "modules";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "resources_module_key_fkey";
            columns: ["module_key"];
            isOneToOne: false;
            referencedRelation: "public_tenant_modules";
            referencedColumns: ["module_key"];
          },
        ];
      };
      retention_policies: {
        Row: {
          description: string;
          label: string;
          mode: string;
          period: string;
          policy_key: string;
          secondary_period: string | null;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          description: string;
          label: string;
          mode?: string;
          period: string;
          policy_key: string;
          secondary_period?: string | null;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          description?: string;
          label?: string;
          mode?: string;
          period?: string;
          policy_key?: string;
          secondary_period?: string | null;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "retention_policies_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "retention_policies_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      retention_purgeable_person_refs: {
        Row: {
          column_name: string;
          table_name: string;
        };
        Insert: {
          column_name: string;
          table_name: string;
        };
        Update: {
          column_name?: string;
          table_name?: string;
        };
        Relationships: [];
      };
      retention_run_tables: {
        Row: {
          action: string;
          error: string | null;
          id: string;
          policy_key: string;
          row_count: number;
          run_id: string;
          sample_ids: string[];
          subject_person_id: string | null;
          table_name: string;
          tenant_id: string;
        };
        Insert: {
          action: string;
          error?: string | null;
          id?: string;
          policy_key: string;
          row_count?: number;
          run_id: string;
          sample_ids?: string[];
          subject_person_id?: string | null;
          table_name: string;
          tenant_id?: string;
        };
        Update: {
          action?: string;
          error?: string | null;
          id?: string;
          policy_key?: string;
          row_count?: number;
          run_id?: string;
          sample_ids?: string[];
          subject_person_id?: string | null;
          table_name?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "retention_run_tables_run_id_fkey";
            columns: ["tenant_id", "run_id"];
            isOneToOne: false;
            referencedRelation: "retention_runs";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "retention_run_tables_subject_person_id_fkey";
            columns: ["tenant_id", "subject_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "retention_run_tables_subject_person_id_fkey";
            columns: ["tenant_id", "subject_person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "retention_run_tables_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "retention_run_tables_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      retention_runs: {
        Row: {
          as_of: string;
          dry_run: boolean;
          error: string | null;
          finished_at: string | null;
          id: string;
          reason: string | null;
          started_at: string;
          status: string;
          tenant_id: string;
          trigger: string;
          triggered_by: string | null;
        };
        Insert: {
          as_of: string;
          dry_run: boolean;
          error?: string | null;
          finished_at?: string | null;
          id?: string;
          reason?: string | null;
          started_at?: string;
          status?: string;
          tenant_id?: string;
          trigger: string;
          triggered_by?: string | null;
        };
        Update: {
          as_of?: string;
          dry_run?: boolean;
          error?: string | null;
          finished_at?: string | null;
          id?: string;
          reason?: string | null;
          started_at?: string;
          status?: string;
          tenant_id?: string;
          trigger?: string;
          triggered_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "retention_runs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "retention_runs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      retention_snapshot_personal_columns: {
        Row: {
          column_name: string;
          table_name: string;
        };
        Insert: {
          column_name: string;
          table_name: string;
        };
        Update: {
          column_name?: string;
          table_name?: string;
        };
        Relationships: [];
      };
      role_permissions: {
        Row: {
          id: string;
          level: string;
          resource_id: string;
          role_id: string;
          tenant_id: string;
        };
        Insert: {
          id?: string;
          level?: string;
          resource_id: string;
          role_id: string;
          tenant_id: string;
        };
        Update: {
          id?: string;
          level?: string;
          resource_id?: string;
          role_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "role_permissions_resource_id_fkey";
            columns: ["resource_id"];
            isOneToOne: false;
            referencedRelation: "resources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey";
            columns: ["tenant_id", "role_id"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "role_permissions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "role_permissions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      roles: {
        Row: {
          description: string | null;
          id: string;
          label: string | null;
          name: string;
          tenant_id: string;
        };
        Insert: {
          description?: string | null;
          id?: string;
          label?: string | null;
          name: string;
          tenant_id?: string;
        };
        Update: {
          description?: string | null;
          id?: string;
          label?: string | null;
          name?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "roles_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "roles_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      sale_line_items: {
        Row: {
          created_at: string;
          created_by: string;
          description: string;
          id: string;
          line_total: number;
          list_price: number | null;
          product_variant_id: string | null;
          quantity: number;
          sale_id: string;
          tenant_id: string;
          unit_price: number;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string;
          description: string;
          id?: string;
          line_total: number;
          list_price?: number | null;
          product_variant_id?: string | null;
          quantity: number;
          sale_id: string;
          tenant_id?: string;
          unit_price: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          description?: string;
          id?: string;
          line_total?: number;
          list_price?: number | null;
          product_variant_id?: string | null;
          quantity?: number;
          sale_id?: string;
          tenant_id?: string;
          unit_price?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "sale_line_items_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sale_line_items_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sale_line_items_tenant_id_product_variant_id_fkey";
            columns: ["tenant_id", "product_variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "sale_line_items_tenant_id_sale_id_fkey";
            columns: ["tenant_id", "sale_id"];
            isOneToOne: false;
            referencedRelation: "sales";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      sales: {
        Row: {
          created_at: string;
          created_by: string;
          discount_amount: number;
          event_id: string | null;
          id: string;
          notes: string | null;
          payment_method: string;
          purchaser_person_id: string | null;
          receipt_number: number;
          sold_at: string;
          status: string;
          subtotal: number;
          tax_amount: number;
          tax_rate: number;
          tenant_id: string;
          total: number;
          updated_at: string;
          updated_by: string | null;
          void_reason: string | null;
          voided_at: string | null;
          voided_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string;
          discount_amount?: number;
          event_id?: string | null;
          id?: string;
          notes?: string | null;
          payment_method: string;
          purchaser_person_id?: string | null;
          receipt_number: number;
          sold_at?: string;
          status?: string;
          subtotal: number;
          tax_amount?: number;
          tax_rate?: number;
          tenant_id?: string;
          total: number;
          updated_at?: string;
          updated_by?: string | null;
          void_reason?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          discount_amount?: number;
          event_id?: string | null;
          id?: string;
          notes?: string | null;
          payment_method?: string;
          purchaser_person_id?: string | null;
          receipt_number?: number;
          sold_at?: string;
          status?: string;
          subtotal?: number;
          tax_amount?: number;
          tax_rate?: number;
          tenant_id?: string;
          total?: number;
          updated_at?: string;
          updated_by?: string | null;
          void_reason?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "sales_tenant_id_event_id_fkey";
            columns: ["tenant_id", "event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "sales_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_tenant_id_purchaser_person_id_fkey";
            columns: ["tenant_id", "purchaser_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "sales_tenant_id_purchaser_person_id_fkey";
            columns: ["tenant_id", "purchaser_person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      services: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          name: string;
          notes: string | null;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
          website: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name: string;
          notes?: string | null;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          website?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name?: string;
          notes?: string | null;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          website?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "services_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "services_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      site_content: {
        Row: {
          approval_reference: string | null;
          approved_at: string | null;
          approved_by: string | null;
          draft_updated_at: string | null;
          draft_updated_by: string | null;
          draft_value: Json | null;
          has_draft: boolean;
          id: string;
          key: string;
          published_at: string | null;
          published_by: string | null;
          review_notes: string | null;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
          value: Json | null;
        };
        Insert: {
          approval_reference?: string | null;
          approved_at?: string | null;
          approved_by?: string | null;
          draft_updated_at?: string | null;
          draft_updated_by?: string | null;
          draft_value?: Json | null;
          has_draft?: boolean;
          id?: string;
          key: string;
          published_at?: string | null;
          published_by?: string | null;
          review_notes?: string | null;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          value?: Json | null;
        };
        Update: {
          approval_reference?: string | null;
          approved_at?: string | null;
          approved_by?: string | null;
          draft_updated_at?: string | null;
          draft_updated_by?: string | null;
          draft_value?: Json | null;
          has_draft?: boolean;
          id?: string;
          key?: string;
          published_at?: string | null;
          published_by?: string | null;
          review_notes?: string | null;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          value?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "site_content_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "site_content_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_memberships: {
        Row: {
          created_at: string;
          created_by: string | null;
          expires_at: string | null;
          id: string;
          kind: string;
          reason: string | null;
          tenant_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          expires_at?: string | null;
          id?: string;
          kind?: string;
          reason?: string | null;
          tenant_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          expires_at?: string | null;
          id?: string;
          kind?: string;
          reason?: string | null;
          tenant_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_memberships_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tenant_memberships_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_modules: {
        Row: {
          enabled: boolean;
          module_key: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          enabled: boolean;
          module_key: string;
          tenant_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          enabled?: boolean;
          module_key?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_modules_module_key_fkey";
            columns: ["module_key"];
            isOneToOne: false;
            referencedRelation: "modules";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "tenant_modules_module_key_fkey";
            columns: ["module_key"];
            isOneToOne: false;
            referencedRelation: "public_tenant_modules";
            referencedColumns: ["module_key"];
          },
          {
            foreignKeyName: "tenant_modules_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tenant_modules_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenants: {
        Row: {
          allowed_origins: string[];
          created_at: string;
          created_by: string | null;
          custom_domain: string | null;
          id: string;
          inventory_numbered_codes_only: boolean;
          inventory_tag_prefix: string | null;
          name: string;
          plan: string;
          slug: string;
          status: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          allowed_origins?: string[];
          created_at?: string;
          created_by?: string | null;
          custom_domain?: string | null;
          id?: string;
          inventory_numbered_codes_only?: boolean;
          inventory_tag_prefix?: string | null;
          name: string;
          plan?: string;
          slug: string;
          status?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          allowed_origins?: string[];
          created_at?: string;
          created_by?: string | null;
          custom_domain?: string | null;
          id?: string;
          inventory_numbered_codes_only?: boolean;
          inventory_tag_prefix?: string | null;
          name?: string;
          plan?: string;
          slug?: string;
          status?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      user_onboarding: {
        Row: {
          first_seen_at: string;
          last_release_seen: string | null;
          user_id: string;
          welcome_completed_at: string | null;
        };
        Insert: {
          first_seen_at?: string;
          last_release_seen?: string | null;
          user_id: string;
          welcome_completed_at?: string | null;
        };
        Update: {
          first_seen_at?: string;
          last_release_seen?: string | null;
          user_id?: string;
          welcome_completed_at?: string | null;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          role_id: string;
          tenant_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          role_id: string;
          tenant_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          role_id?: string;
          tenant_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_roles_role_id_fkey";
            columns: ["tenant_id", "role_id"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "user_roles_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_roles_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      user_tenant_selection: {
        Row: {
          tenant_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          tenant_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          tenant_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_tenant_selection_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_tenant_selection_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      volunteer_applications: {
        Row: {
          availability: string | null;
          claimed_at: string | null;
          claimed_by_person_id: string | null;
          created_at: string;
          email: string;
          id: string;
          name: string;
          person_id: string;
          phone: string | null;
          pronouns: string | null;
          reference_code: string;
          role_interest: string | null;
          status: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          availability?: string | null;
          claimed_at?: string | null;
          claimed_by_person_id?: string | null;
          created_at?: string;
          email: string;
          id?: string;
          name: string;
          person_id: string;
          phone?: string | null;
          pronouns?: string | null;
          reference_code: string;
          role_interest?: string | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          availability?: string | null;
          claimed_at?: string | null;
          claimed_by_person_id?: string | null;
          created_at?: string;
          email?: string;
          id?: string;
          name?: string;
          person_id?: string;
          phone?: string | null;
          pronouns?: string | null;
          reference_code?: string;
          role_interest?: string | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "volunteer_applications_claimed_by_in_tenant";
            columns: ["tenant_id", "claimed_by_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "volunteer_applications_claimed_by_in_tenant";
            columns: ["tenant_id", "claimed_by_person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "volunteer_applications_person_id_fkey";
            columns: ["tenant_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "volunteer_applications_person_id_fkey";
            columns: ["tenant_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "volunteer_applications_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "volunteer_applications_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      volunteer_hour_submissions: {
        Row: {
          claimed_at: string | null;
          claimed_by_person_id: string | null;
          created_at: string;
          created_by: string | null;
          event_id: string | null;
          hours: number;
          id: string;
          logged_date: string;
          notes: string | null;
          person_id: string;
          review_note: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
          volunteer_hours_id: string | null;
          volunteer_role_type_id: string | null;
        };
        Insert: {
          claimed_at?: string | null;
          claimed_by_person_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          event_id?: string | null;
          hours: number;
          id?: string;
          logged_date: string;
          notes?: string | null;
          person_id: string;
          review_note?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          volunteer_hours_id?: string | null;
          volunteer_role_type_id?: string | null;
        };
        Update: {
          claimed_at?: string | null;
          claimed_by_person_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          event_id?: string | null;
          hours?: number;
          id?: string;
          logged_date?: string;
          notes?: string | null;
          person_id?: string;
          review_note?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          volunteer_hours_id?: string | null;
          volunteer_role_type_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "volunteer_hour_submissions_claimed_by_in_tenant";
            columns: ["tenant_id", "claimed_by_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "volunteer_hour_submissions_claimed_by_in_tenant";
            columns: ["tenant_id", "claimed_by_person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "volunteer_hour_submissions_event_in_tenant";
            columns: ["tenant_id", "event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "volunteer_hour_submissions_hours_in_tenant";
            columns: ["tenant_id", "volunteer_hours_id"];
            isOneToOne: false;
            referencedRelation: "volunteer_hours";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "volunteer_hour_submissions_person_in_tenant";
            columns: ["tenant_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "volunteer_hour_submissions_person_in_tenant";
            columns: ["tenant_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "volunteer_hour_submissions_role_type_in_tenant";
            columns: ["tenant_id", "volunteer_role_type_id"];
            isOneToOne: false;
            referencedRelation: "volunteer_role_types";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "volunteer_hour_submissions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "volunteer_hour_submissions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      volunteer_hours: {
        Row: {
          created_at: string;
          event_id: string | null;
          hours: number;
          id: string;
          logged_by: string;
          logged_date: string;
          notes: string | null;
          person_id: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
          volunteer_role_type_id: string | null;
        };
        Insert: {
          created_at?: string;
          event_id?: string | null;
          hours: number;
          id?: string;
          logged_by?: string;
          logged_date?: string;
          notes?: string | null;
          person_id: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          volunteer_role_type_id?: string | null;
        };
        Update: {
          created_at?: string;
          event_id?: string | null;
          hours?: number;
          id?: string;
          logged_by?: string;
          logged_date?: string;
          notes?: string | null;
          person_id?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          volunteer_role_type_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "volunteer_hours_event_id_fkey";
            columns: ["tenant_id", "event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "volunteer_hours_person_id_fkey";
            columns: ["tenant_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "volunteer_hours_person_id_fkey";
            columns: ["tenant_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "volunteer_hours_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "volunteer_hours_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "volunteer_hours_volunteer_role_type_id_fkey";
            columns: ["tenant_id", "volunteer_role_type_id"];
            isOneToOne: false;
            referencedRelation: "volunteer_role_types";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      volunteer_role_types: {
        Row: {
          created_at: string;
          created_by: string;
          description: string | null;
          id: string;
          is_public: boolean;
          name: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string;
          description?: string | null;
          id?: string;
          is_public?: boolean;
          name: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          description?: string | null;
          id?: string;
          is_public?: boolean;
          name?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "volunteer_role_types_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "volunteer_role_types_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      volunteer_screening_tiers: {
        Row: {
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          is_active: boolean;
          name: string;
          sort_order: number;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          sort_order?: number;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          sort_order?: number;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "volunteer_screening_tiers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "volunteer_screening_tiers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      event_registration_minor_contacts: {
        Row: {
          accompanying_adult_name: string | null;
          accompanying_adult_phone: string | null;
          emergency_contact_name: string | null;
          emergency_contact_phone: string | null;
          event_id: string | null;
          registration_id: string | null;
        };
        Insert: {
          accompanying_adult_name?: string | null;
          accompanying_adult_phone?: string | null;
          emergency_contact_name?: string | null;
          emergency_contact_phone?: string | null;
          event_id?: string | null;
          registration_id?: string | null;
        };
        Update: {
          accompanying_adult_name?: string | null;
          accompanying_adult_phone?: string | null;
          emergency_contact_name?: string | null;
          emergency_contact_phone?: string | null;
          event_id?: string | null;
          registration_id?: string | null;
        };
        Relationships: [];
      };
      inventory_items_with_category: {
        Row: {
          category_group_key: string | null;
          category_group_label: string | null;
          category_id: string | null;
          category_is_active: boolean | null;
          category_key: string | null;
          category_label: string | null;
          category_sort_key: string | null;
          condition: string | null;
          created_at: string | null;
          created_by: string | null;
          description: string | null;
          donation_id: string | null;
          face_value: number | null;
          gender: string | null;
          id: string | null;
          intended_use: string | null;
          notes: string | null;
          photo_url: string | null;
          size: string | null;
          status: string | null;
          type: string | null;
          updated_at: string | null;
          updated_by: string | null;
          tag_kinds: string[] | null;
        };
        Relationships: [];
      };
      org_conduct_process: {
        Row: {
          acknowledgement_days: number | null;
          appeal_days: number | null;
          appeal_excludes_original_reviewers: boolean | null;
          reviewer_minimum: number | null;
        };
        Relationships: [];
      };
      org_fiscal_year: {
        Row: {
          start_month: number | null;
        };
        Relationships: [];
      };
      org_notification_settings: {
        Row: {
          email_enabled: boolean | null;
          reply_to: string | null;
        };
        Relationships: [];
      };
      org_sales_tax: {
        Row: {
          rate: number | null;
        };
        Relationships: [];
      };
      org_timezone: {
        Row: {
          zone: string | null;
        };
        Relationships: [];
      };
      people_with_roles: {
        Row: {
          address_city: string | null;
          address_country: string | null;
          address_line1: string | null;
          address_line2: string | null;
          address_postal_code: string | null;
          address_region: string | null;
          auth_user_id: string | null;
          created_at: string | null;
          created_by: string | null;
          email: string | null;
          email_pending: string | null;
          email_token: string | null;
          email_token_expires_at: string | null;
          has_account: boolean | null;
          has_portal_access: boolean | null;
          id: string | null;
          instagram_handle: string | null;
          is_anonymous: boolean | null;
          is_attendee: boolean | null;
          is_donor: boolean | null;
          is_partner: boolean | null;
          is_recipient: boolean | null;
          is_sponsor: boolean | null;
          is_staff: boolean | null;
          is_volunteer: boolean | null;
          logo_url: string | null;
          name: string | null;
          notes: string | null;
          notification_email: string | null;
          notification_email_pending: string | null;
          notification_email_token: string | null;
          notification_email_token_expires_at: string | null;
          person_type: string | null;
          phone: string | null;
          preferred_mountain: string | null;
          preferred_name: string | null;
          primary_contact_person_id: string | null;
          pronouns: string | null;
          riding_discipline: string | null;
          ski_experience_level: string | null;
          snowboard_experience_level: string | null;
          source_type: string | null;
          tenant_id: string | null;
          updated_at: string | null;
          updated_by: string | null;
          website: string | null;
          account_email: string | null;
          primary_contact: {
            address_city: string | null;
            address_country: string | null;
            address_line1: string | null;
            address_line2: string | null;
            address_postal_code: string | null;
            address_region: string | null;
            auth_user_id: string | null;
            created_at: string;
            created_by: string | null;
            email: string | null;
            email_pending: string | null;
            email_token: string | null;
            email_token_expires_at: string | null;
            id: string;
            instagram_handle: string | null;
            is_anonymous: boolean;
            logo_url: string | null;
            name: string | null;
            notes: string | null;
            notification_email: string | null;
            notification_email_pending: string | null;
            notification_email_token: string | null;
            notification_email_token_expires_at: string | null;
            person_type: string;
            phone: string | null;
            preferred_mountain: string | null;
            preferred_name: string | null;
            primary_contact_person_id: string | null;
            pronouns: string | null;
            riding_discipline: string | null;
            ski_experience_level: string | null;
            snowboard_experience_level: string | null;
            source_type: string;
            tenant_id: string;
            updated_at: string;
            updated_by: string | null;
            website: string | null;
          } | null;
        };
        Relationships: [
          {
            foreignKeyName: "people_primary_contact_person_id_fkey";
            columns: ["tenant_id", "primary_contact_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "people_primary_contact_person_id_fkey";
            columns: ["tenant_id", "primary_contact_person_id"];
            isOneToOne: false;
            referencedRelation: "people_with_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "people_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "public_tenant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "people_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      public_article_categories: {
        Row: {
          id: string | null;
          position: number | null;
          slug: string | null;
          value: Json | null;
        };
        Insert: {
          id?: string | null;
          position?: number | null;
          slug?: string | null;
          value?: Json | null;
        };
        Update: {
          id?: string | null;
          position?: number | null;
          slug?: string | null;
          value?: Json | null;
        };
        Relationships: [];
      };
      public_articles: {
        Row: {
          anchor: string | null;
          category_id: string | null;
          id: string | null;
          position: number | null;
          value: Json | null;
        };
        Relationships: [];
      };
      public_branding: {
        Row: {
          token: string | null;
          value: Json | null;
        };
        Insert: {
          token?: never;
          value?: Json | null;
        };
        Update: {
          token?: never;
          value?: Json | null;
        };
        Relationships: [];
      };
      public_calendar_categories: {
        Row: {
          key: string | null;
          label: string | null;
          sort_order: number | null;
        };
        Insert: {
          key?: string | null;
          label?: string | null;
          sort_order?: number | null;
        };
        Update: {
          key?: string | null;
          label?: string | null;
          sort_order?: number | null;
        };
        Relationships: [];
      };
      public_calendar_items: {
        Row: {
          categories: string[] | null;
          ends_at: string | null;
          id: string | null;
          item_type: string | null;
          public_url: string | null;
          starts_at: string | null;
          summary: string | null;
          time_zone: string | null;
          title: string | null;
        };
        Relationships: [];
      };
      public_event_programs: {
        Row: {
          event_id: string | null;
          name: string | null;
          program_id: string | null;
        };
        Relationships: [];
      };
      public_event_registration_options: {
        Row: {
          event_id: string | null;
          id: string | null;
          is_full: boolean | null;
          label: string | null;
          prompt: string | null;
          sort_order: number | null;
        };
        Relationships: [];
      };
      public_event_registration_questions: {
        Row: {
          event_id: string | null;
          help: string | null;
          id: string | null;
          kind: string | null;
          max_value: number | null;
          min_value: number | null;
          options: Json | null;
          place_allow_other: boolean | null;
          place_granularity: string | null;
          prompt: string | null;
          required: boolean | null;
          show_if: Json | null;
          sort_order: number | null;
        };
        Relationships: [];
      };
      public_event_sponsors: {
        Row: {
          event_id: string | null;
          logo_url: string | null;
          name: string | null;
          sponsor_id: string | null;
          website: string | null;
        };
        Relationships: [];
      };
      public_events: {
        Row: {
          adults_only: boolean | null;
          capacity: number | null;
          carpools_enabled: boolean | null;
          description: string | null;
          ends_at: string | null;
          flier_url: string | null;
          id: string | null;
          location: string | null;
          name: string | null;
          registration_deadline: string | null;
          registration_enabled: boolean | null;
          starts_at: string | null;
          timezone: string | null;
        };
        Insert: {
          adults_only?: boolean | null;
          capacity?: number | null;
          carpools_enabled?: boolean | null;
          description?: string | null;
          ends_at?: string | null;
          flier_url?: string | null;
          id?: string | null;
          location?: string | null;
          name?: string | null;
          registration_deadline?: string | null;
          registration_enabled?: boolean | null;
          starts_at?: string | null;
          timezone?: string | null;
        };
        Update: {
          adults_only?: boolean | null;
          capacity?: number | null;
          carpools_enabled?: boolean | null;
          description?: string | null;
          ends_at?: string | null;
          flier_url?: string | null;
          id?: string | null;
          location?: string | null;
          name?: string | null;
          registration_deadline?: string | null;
          registration_enabled?: boolean | null;
          starts_at?: string | null;
          timezone?: string | null;
        };
        Relationships: [];
      };
      public_gear_catalog: {
        Row: {
          category_group_key: string | null;
          category_group_label: string | null;
          category_group_sort_order: number | null;
          category_key: string | null;
          category_label: string | null;
          category_sort_order: number | null;
          condition: string | null;
          created_at: string | null;
          description: string | null;
          gender: string | null;
          id: string | null;
          photo_url: string | null;
          size: string | null;
          type: string | null;
        };
        Relationships: [];
      };
      public_gear_request_settings: {
        Row: {
          slot: string | null;
          value: Json | null;
        };
        Relationships: [];
      };
      public_giveaway_rules: {
        Row: {
          content: Json | null;
          effective_at: string | null;
          event_id: string | null;
          giveaway_id: string | null;
          version: number | null;
        };
        Relationships: [];
      };
      public_giving_settings: {
        Row: {
          slot: string | null;
          value: Json | null;
        };
        Relationships: [];
      };
      public_legal_document_versions: {
        Row: {
          content: Json | null;
          document: string | null;
          effective_at: string | null;
          time_zone: string | null;
          version: number | null;
        };
        Insert: {
          content?: Json | null;
          document?: string | null;
          effective_at?: string | null;
          time_zone?: string | null;
          version?: number | null;
        };
        Update: {
          content?: Json | null;
          document?: string | null;
          effective_at?: string | null;
          time_zone?: string | null;
          version?: number | null;
        };
        Relationships: [];
      };
      public_legal_publication: {
        Row: {
          document: string | null;
          value: Json | null;
        };
        Insert: {
          document?: never;
          value?: Json | null;
        };
        Update: {
          document?: never;
          value?: Json | null;
        };
        Relationships: [];
      };
      public_lexicon: {
        Row: {
          term: string | null;
          value: Json | null;
        };
        Insert: {
          term?: never;
          value?: Json | null;
        };
        Update: {
          term?: never;
          value?: Json | null;
        };
        Relationships: [];
      };
      public_page_visibility: {
        Row: {
          slot: string | null;
          value: Json | null;
        };
        Insert: {
          slot?: never;
          value?: Json | null;
        };
        Update: {
          slot?: never;
          value?: Json | null;
        };
        Relationships: [];
      };
      public_person_role_labels: {
        Row: {
          labels: Json | null;
        };
        Insert: {
          labels?: Json | null;
        };
        Update: {
          labels?: Json | null;
        };
        Relationships: [];
      };
      public_programs: {
        Row: {
          description: string | null;
          emoji: string | null;
          id: string | null;
          name: string | null;
          pillar: string | null;
          sort_order: number | null;
        };
        Insert: {
          description?: string | null;
          emoji?: string | null;
          id?: string | null;
          name?: string | null;
          pillar?: string | null;
          sort_order?: number | null;
        };
        Update: {
          description?: string | null;
          emoji?: string | null;
          id?: string | null;
          name?: string | null;
          pillar?: string | null;
          sort_order?: number | null;
        };
        Relationships: [];
      };
      public_publication_pages: {
        Row: {
          alt_text: string | null;
          height: number | null;
          id: string | null;
          image_path: string | null;
          image_renditions: Json | null;
          position: number | null;
          publication_id: string | null;
          transcript: string | null;
          width: number | null;
        };
        Relationships: [];
      };
      public_publications: {
        Row: {
          blurb: string | null;
          cover_height: number | null;
          cover_path: string | null;
          cover_renditions: Json | null;
          cover_width: number | null;
          id: string | null;
          print_pdf_bytes: number | null;
          print_pdf_path: string | null;
          publish_date: string | null;
          published_at: string | null;
          reading_pdf_bytes: number | null;
          reading_pdf_path: string | null;
          season_label: string | null;
          slug: string | null;
          title: string | null;
        };
        Insert: {
          blurb?: string | null;
          cover_height?: number | null;
          cover_path?: string | null;
          cover_renditions?: Json | null;
          cover_width?: number | null;
          id?: string | null;
          print_pdf_bytes?: number | null;
          print_pdf_path?: string | null;
          publish_date?: string | null;
          published_at?: string | null;
          reading_pdf_bytes?: number | null;
          reading_pdf_path?: string | null;
          season_label?: string | null;
          slug?: string | null;
          title?: string | null;
        };
        Update: {
          blurb?: string | null;
          cover_height?: number | null;
          cover_path?: string | null;
          cover_renditions?: Json | null;
          cover_width?: number | null;
          id?: string | null;
          print_pdf_bytes?: number | null;
          print_pdf_path?: string | null;
          publish_date?: string | null;
          published_at?: string | null;
          reading_pdf_bytes?: number | null;
          reading_pdf_path?: string | null;
          season_label?: string | null;
          slug?: string | null;
          title?: string | null;
        };
        Relationships: [];
      };
      public_registration_settings: {
        Row: {
          asks_about_minors: boolean | null;
          requires_instagram: boolean | null;
          service_area: string[] | null;
        };
        Relationships: [];
      };
      public_rider_profile_settings: {
        Row: {
          mountains: Json | null;
        };
        Relationships: [];
      };
      public_site_content: {
        Row: {
          key: string | null;
          value: Json | null;
        };
        Insert: {
          key?: string | null;
          value?: Json | null;
        };
        Update: {
          key?: string | null;
          value?: Json | null;
        };
        Relationships: [];
      };
      public_site_images: {
        Row: {
          slot: string | null;
          value: Json | null;
        };
        Insert: {
          slot?: never;
          value?: Json | null;
        };
        Update: {
          slot?: never;
          value?: Json | null;
        };
        Relationships: [];
      };
      public_site_layout: {
        Row: {
          slot: string | null;
          value: Json | null;
        };
        Insert: {
          slot?: never;
          value?: Json | null;
        };
        Update: {
          slot?: never;
          value?: Json | null;
        };
        Relationships: [];
      };
      public_sponsor_wall: {
        Row: {
          logo_url: string | null;
          name: string | null;
          sponsor_id: string | null;
          website: string | null;
        };
        Relationships: [];
      };
      public_team: {
        Row: {
          bio: string | null;
          id: string | null;
          name: string | null;
          photo_url: string | null;
          role: string | null;
          sort_order: number | null;
        };
        Relationships: [];
      };
      public_tenant: {
        Row: {
          custom_domain: string | null;
          id: string | null;
          name: string | null;
          plan: string | null;
          slug: string | null;
        };
        Insert: {
          custom_domain?: string | null;
          id?: string | null;
          name?: string | null;
          plan?: string | null;
          slug?: string | null;
        };
        Update: {
          custom_domain?: string | null;
          id?: string | null;
          name?: string | null;
          plan?: string | null;
          slug?: string | null;
        };
        Relationships: [];
      };
      public_tenant_modules: {
        Row: {
          enabled: boolean | null;
          module_key: string | null;
        };
        Relationships: [];
      };
      public_volunteer_role_types: {
        Row: {
          description: string | null;
          id: string | null;
          name: string | null;
        };
        Insert: {
          description?: string | null;
          id?: string | null;
          name?: string | null;
        };
        Update: {
          description?: string | null;
          id?: string | null;
          name?: string | null;
        };
        Relationships: [];
      };
      tenant_branding: {
        Row: {
          token: string | null;
          value: Json | null;
        };
        Insert: {
          token?: never;
          value?: Json | null;
        };
        Update: {
          token?: never;
          value?: Json | null;
        };
        Relationships: [];
      };
      tenant_lexicon: {
        Row: {
          term: string | null;
          value: Json | null;
        };
        Insert: {
          term?: never;
          value?: Json | null;
        };
        Update: {
          term?: never;
          value?: Json | null;
        };
        Relationships: [];
      };
      tenant_person_role_labels: {
        Row: {
          labels: Json | null;
        };
        Insert: {
          labels?: Json | null;
        };
        Update: {
          labels?: Json | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      accepted_waiver_version: {
        Args: {
          p_accepted: boolean;
          p_claimed_version: number;
          p_tenant_id: string;
        };
        Returns: number;
      };
      account_email: {
        Args: { "": Database["public"]["Views"]["people_with_roles"]["Row"] };
        Returns: {
          error: true;
        } & "the function public.account_email with parameter or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache";
      };
      acknowledge_as_is_by_token: {
        Args: {
          p_acknowledged: boolean;
          p_as_is_text: string;
          p_ip_address: unknown;
          p_token_hash: string;
          p_typed_name: string;
        };
        Returns: string;
      };
      acknowledge_distribution_by_token: {
        Args: {
          p_acknowledged: boolean;
          p_as_is_text: string;
          p_ip_address: unknown;
          p_token_hash: string;
          p_typed_name: string;
        };
        Returns: undefined;
      };
      acknowledge_distribution_on_staff_device: {
        Args: {
          p_acknowledged: boolean;
          p_as_is_text: string;
          p_event_id: string;
          p_typed_name: string;
        };
        Returns: undefined;
      };
      acknowledged_as_is: {
        Args: { p_acknowledged: boolean; p_text: string };
        Returns: string;
      };
      add_gear_request_item: {
        Args: { p_inventory_item_id: string; p_request_id: string };
        Returns: undefined;
      };
      add_to_distribution_draft: {
        Args: { p_event_id?: string; p_item_id: string };
        Returns: string;
      };
      adopt_content_pack: { Args: { p_pack_id: string }; Returns: Json };
      apply_registration_answers: {
        Args: {
          p_answers: Json;
          p_event_id: string;
          p_registration_id: string;
          p_required: boolean;
          p_tenant_id: string;
        };
        Returns: undefined;
      };
      apply_registration_cancellation: {
        Args: {
          p_note: string;
          p_reason: string;
          p_registration_id: string;
          p_tenant_id: string;
        };
        Returns: undefined;
      };
      apply_registration_option_counts: {
        Args: {
          p_counts: Json;
          p_enforce_caps: boolean;
          p_event_id: string;
          p_party_size: number;
          p_registration_id: string;
          p_required: boolean;
          p_tenant_id: string;
        };
        Returns: undefined;
      };
      apply_registration_rider_profile: {
        Args: {
          p_person_id: string;
          p_preferred_mountain: string;
          p_riding_discipline: string;
          p_ski_experience_level: string;
          p_snowboard_experience_level: string;
          p_tenant_id: string;
        };
        Returns: undefined;
      };
      approve_event_expense: {
        Args: { p_id: string };
        Returns: {
          amount: number;
          approved_at: string | null;
          approved_by: string | null;
          created_at: string;
          created_by: string;
          currency: string;
          description: string;
          event_id: string | null;
          expense_date: string;
          id: string;
          notes: string | null;
          paid_at: string | null;
          paid_by: string | null;
          paid_by_person_id: string | null;
          participant_assistance: boolean;
          receipt_path: string | null;
          receipt_url: string | null;
          rejected_at: string | null;
          rejected_by: string | null;
          rejection_reason: string | null;
          status: string;
          submitted_by: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "event_expenses";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      approve_reimbursement: {
        Args: { p_id: string };
        Returns: {
          amount: number;
          approved_at: string | null;
          approved_by: string | null;
          created_at: string;
          created_by: string;
          currency: string;
          description: string;
          event_id: string | null;
          id: string;
          notes: string | null;
          paid_at: string | null;
          paid_by: string | null;
          person_id: string;
          receipt_path: string | null;
          receipt_url: string | null;
          rejected_at: string | null;
          rejection_reason: string | null;
          source_expense_id: string | null;
          status: string;
          submitted_by: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "reimbursements";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      assign_numbered_inventory_tag: {
        Args: { p_code: string; p_item_id: string; p_move?: boolean };
        Returns: {
          code: string;
          holder_description: string;
          holder_item_id: string;
          outcome: string;
        }[];
      };
      author_name: {
        Args: { "": Database["public"]["Tables"]["event_retro_items"]["Row"] };
        Returns: {
          error: true;
        } & "the function public.author_name with parameter or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache";
      };
      available_content_packs: {
        Args: never;
        Returns: {
          adopted_at: string;
          article_count: number;
          category_count: number;
          description: string;
          id: string;
          key: string;
          name: string;
        }[];
      };
      bulk_import_monetary_donations: {
        Args: { p_processor_label?: string; p_rows: Json };
        Returns: Json;
      };
      can_see_conduct_report: {
        Args: { p_report_id: string };
        Returns: boolean;
      };
      can_upload_event_media: {
        Args: { p_event_id: string };
        Returns: boolean;
      };
      can_write_event_retro: { Args: { p_event_id: string }; Returns: boolean };
      cancel_event_registration: {
        Args: { p_note?: string; p_reason: string; p_registration_id: string };
        Returns: undefined;
      };
      cancel_my_event_registration: {
        Args: { p_registration_id: string };
        Returns: undefined;
      };
      carpool_assignment_card: {
        Args: { p_registration_id: string };
        Returns: Json;
      };
      carpool_car_event: { Args: { p_car_id: string }; Returns: string };
      carpool_event_guard: { Args: { p_event_id: string }; Returns: string };
      carpool_registration_guard: {
        Args: {
          p_event_id: string;
          p_registration_id: string;
          p_tenant_id: string;
        };
        Returns: undefined;
      };
      check_gear_request_passphrase: {
        Args: { p_ip_address?: unknown; p_passphrase: string };
        Returns: boolean;
      };
      check_rate_limit: {
        Args: {
          p_ip_address: unknown;
          p_max_attempts: number;
          p_route: string;
          p_window: string;
        };
        Returns: boolean;
      };
      claim_artwork_upload_slots: {
        Args: { p_code: string; p_count: number; p_ip_address?: unknown };
        Returns: {
          call_id: string;
          max_images: number;
          tenant_id: string;
        }[];
      };
      claim_event_media_link_upload_slots: {
        Args: {
          p_bytes: number;
          p_count: number;
          p_ip_address: unknown;
          p_token_hash: string;
        };
        Returns: {
          event_id: string;
          tenant_id: string;
        }[];
      };
      claim_event_reminders: {
        Args: { p_limit: number; p_tenant_id: string };
        Returns: string[];
      };
      claim_pending_role_grants: { Args: never; Returns: number };
      complete_my_welcome: {
        Args: { p_current_release?: string };
        Returns: undefined;
      };
      confirm_email_change: {
        Args: { p_ip_address: unknown; p_token_hash: string };
        Returns: {
          confirmed_email: string;
          display_name: string;
          outcome: string;
          person_id: string;
          previous_email: string;
          tenant_id: string;
        }[];
      };
      confirm_notification_email: {
        Args: { p_ip_address: unknown; p_token_hash: string };
        Returns: {
          confirmed_email: string;
          display_name: string;
          person_id: string;
          previous_email: string;
          tenant_id: string;
        }[];
      };
      copy_content_pack: {
        Args: { p_pack_id: string; p_tenant_id: string };
        Returns: Json;
      };
      count_pending_artwork_submissions: { Args: never; Returns: number };
      count_pending_event_expense_approvals: { Args: never; Returns: number };
      count_pending_reimbursement_approvals: { Args: never; Returns: number };
      count_unclaimed_pending_artwork_submissions: {
        Args: never;
        Returns: number;
      };
      create_blank_asset_tags: {
        Args: { p_count: number };
        Returns: {
          id: string;
          value: string;
        }[];
      };
      create_donation_with_items: {
        Args: {
          p_donated_at?: string;
          p_donor_email: string;
          p_donor_id?: string;
          p_donor_is_anonymous: boolean;
          p_donor_name: string;
          p_donor_notes: string;
          p_donor_phone: string;
          p_donor_source_type: string;
          p_event_id?: string;
          p_items: Json;
          p_notes?: string;
        };
        Returns: {
          asset_tags: string[];
          donation_id: string;
          giveaway_id: string;
          inventory_item_ids: string[];
          untiered_item_ids: string[];
        }[];
      };
      create_event_media_upload_link: {
        Args: {
          p_event_id: string;
          p_expires_at: string;
          p_label: string;
          p_max_bytes: number;
          p_token_hash: string;
        };
        Returns: string;
      };
      create_event_sponsor: {
        Args: {
          p_contribution_value: number;
          p_event_id: string;
          p_follow_up_due_date?: string;
          p_follow_up_notes: string;
          p_follow_up_owner_person_id?: string;
          p_follow_up_status: string;
          p_is_public: boolean;
          p_items?: Json;
          p_notes: string;
          p_person_id: string;
          p_support_type: string;
        };
        Returns: string;
      };
      create_gear_request: {
        Args: {
          p_as_is_acknowledged?: boolean;
          p_as_is_text?: string;
          p_delivery_method?: string;
          p_inventory_item_ids: string[];
          p_notes?: string;
          p_passphrase?: string;
          p_payment_method?: string;
          p_person_id: string;
          p_shipping?: Json;
          p_tenant_id: string;
        };
        Returns: string;
      };
      create_giveaway_prize: {
        Args: {
          p_donor_person_id?: string;
          p_estimated_value?: number;
          p_giveaway_id: string;
          p_notes?: string;
          p_prize_name: string;
          p_source_inventory_item_id?: string;
          p_source_monetary_donation_id?: string;
        };
        Returns: string;
      };
      current_membership_kind: { Args: never; Returns: string };
      current_tenant_id: { Args: never; Returns: string };
      current_tenant_is_demo: { Args: never; Returns: boolean };
      default_tenant_id: { Args: never; Returns: string };
      delete_article_category: { Args: { p_id: string }; Returns: number };
      delete_content_pack: { Args: { p_id: string }; Returns: number };
      delete_event_carpool_car: {
        Args: { p_car_id: string };
        Returns: undefined;
      };
      delete_event_media_by_link: {
        Args: {
          p_ip_address: unknown;
          p_media_id: string;
          p_receipt_hash: string;
          p_token_hash: string;
        };
        Returns: {
          storage_path: string;
          thumb_path: string;
        }[];
      };
      delete_event_sponsor: { Args: { p_id: string }; Returns: undefined };
      delete_giveaway_prize: {
        Args: { p_prize_id: string };
        Returns: undefined;
      };
      delete_rider_profile: {
        Args: { p_person_id: string; p_reason?: string };
        Returns: undefined;
      };
      delete_sponsor_inventory_items: {
        Args: { p_donation_id: string; p_keep: string[] };
        Returns: undefined;
      };
      delete_tenant: { Args: { p_tenant_id: string }; Returns: Json };
      discard_article_drafts: { Args: { p_id: string }; Returns: number };
      discard_site_content_drafts: {
        Args: { p_keys: string[] };
        Returns: number;
      };
      distribution_acknowledgement_link_view: {
        Args: { p_acknowledgement_id: string };
        Returns: Json;
      };
      distribution_acknowledgement_view: {
        Args: { p_draft_id: string };
        Returns: Json;
      };
      distribution_draft_checkout: {
        Args: { p_event_id?: string };
        Returns: {
          needs_acknowledgement: boolean;
        }[];
      };
      distribution_draft_holds: {
        Args: { p_draft_id: string };
        Returns: {
          as_is_acknowledged_at: string;
          gear_request_id: string;
          item_id: string;
        }[];
      };
      distribution_draft_needs_acknowledgement: {
        Args: { p_draft_id: string };
        Returns: boolean;
      };
      email_is_this_tenants_to_invite: {
        Args: { p_email: string };
        Returns: boolean;
      };
      ensure_current_person: {
        Args: never;
        Returns: {
          email: string;
          name: string;
          notification_email: string;
          notification_email_expires_at: string;
          notification_email_pending: string;
          person_id: string;
          preferred_name: string;
          pronouns: string;
        }[];
      };
      ensure_my_onboarding: {
        Args: { p_current_release?: string };
        Returns: {
          first_seen_at: string;
          last_release_seen: string;
          welcome_completed_at: string;
        }[];
      };
      event_access_account_name: {
        Args: { p_user_id: string };
        Returns: {
          email: string;
          name: string;
        }[];
      };
      event_access_ids: {
        Args: { p_min_level: string; p_parent?: string; p_table_name: string };
        Returns: string[];
      };
      event_access_offered_areas: { Args: never; Returns: string[] };
      event_access_rank: {
        Args: { p_event_id: string; p_table_name: string };
        Returns: number;
      };
      event_access_tenant_offered_areas: {
        Args: { p_tenant_id: string };
        Returns: string[];
      };
      event_carpool_assignment_recipients: {
        Args: { p_event_id: string };
        Returns: {
          card: Json;
          changed: boolean;
          email: string;
          emailed_at: string;
          name: string;
          person_id: string;
          registration_id: string;
          signature: string;
        }[];
      };
      event_carpool_markers: {
        Args: { p_event_id: string };
        Returns: {
          name: string;
          user_id: string;
        }[];
      };
      event_delete_blockers: { Args: { p_id: string }; Returns: string[] };
      event_group_chat_adders: {
        Args: { p_event_id: string };
        Returns: {
          name: string;
          user_id: string;
        }[];
      };
      event_linked_record_labels: { Args: { p_id: string }; Returns: string[] };
      event_media_event_expires_at: {
        Args: { p_event_id: string };
        Returns: string;
      };
      event_media_expiry: {
        Args: {
          p_event_id: string;
          p_tenant_id: string;
          p_uploaded_at: string;
        };
        Returns: string;
      };
      event_media_path_event_id: { Args: { p_name: string }; Returns: string };
      event_media_retention_days: { Args: never; Returns: number };
      event_media_summary: {
        Args: { p_event_id: string };
        Returns: {
          event_bytes: number;
          photo_objections: number;
          tenant_bytes: number;
        }[];
      };
      event_media_upload_link_list: {
        Args: { p_event_id: string };
        Returns: {
          bytes: number;
          created_at: string;
          expires_at: string;
          files: number;
          id: string;
          label: string;
          max_bytes: number;
          revoked_at: string;
        }[];
      };
      event_media_uploads_enabled: { Args: never; Returns: boolean };
      event_people: {
        Args: { p_event_id: string };
        Returns: {
          email: string;
          id: string;
          name: string;
          phone: string;
          preferred_name: string;
        }[];
      };
      event_public_gallery_enabled: { Args: never; Returns: boolean };
      event_reminder_due_tenants: { Args: never; Returns: string[] };
      event_reminder_message: {
        Args: { p_registration_id: string };
        Returns: {
          car: Json;
          carpools_enabled: boolean;
          email: string;
          ends_at: string;
          event_id: string;
          event_name: string;
          location: string;
          name: string;
          person_id: string;
          registration_id: string;
          reminder_intro: string;
          starts_at: string;
          tenant_id: string;
          timezone: string;
        }[];
      };
      event_reminder_send_at: {
        Args: {
          p_days_before: number;
          p_starts_at: string;
          p_timezone: string;
        };
        Returns: string;
      };
      event_reminder_status: {
        Args: { p_event_id: string };
        Returns: {
          recipients: number;
          send_at: string;
          sent: number;
        }[];
      };
      event_reminders_sent_since: {
        Args: { p_since: string };
        Returns: number;
      };
      event_report_rows: {
        Args: {
          p_event_id: string;
          p_events: boolean;
          p_goods: boolean;
          p_money: boolean;
        };
        Returns: Json;
      };
      expired_event_media: {
        Args: { p_now?: string };
        Returns: {
          id: string;
          storage_path: string;
          thumb_path: string;
        }[];
      };
      expires_at: {
        Args: { "": Database["public"]["Tables"]["event_media"]["Row"] };
        Returns: {
          error: true;
        } & "the function public.expires_at with parameter or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache";
      };
      export_current_tenant_data: { Args: never; Returns: Json };
      export_tenant_data: { Args: { p_tenant_id: string }; Returns: Json };
      find_duplicate_people: {
        Args: never;
        Returns: {
          auth_user_id: string;
          created_at: string;
          email: string;
          email_key: string;
          has_portal_access: boolean;
          id: string;
          name: string;
          person_type: string;
          preferred_name: string;
        }[];
      };
      format_numbered_inventory_tag: {
        Args: { p_number: number; p_prefix: string };
        Returns: string;
      };
      gear_request_acknowledgement_view: {
        Args: { p_request_id: string };
        Returns: Json;
      };
      gear_request_passphrase_ok: {
        Args: { p_passphrase: string; p_tenant_id: string };
        Returns: boolean;
      };
      generate_artwork_submission_code: {
        Args: { p_tenant_id?: string };
        Returns: string;
      };
      generate_conduct_report_reference: {
        Args: { p_tenant_id: string };
        Returns: string;
      };
      generate_inventory_asset_tag: {
        Args: { p_tenant_id: string };
        Returns: string;
      };
      generate_numbered_inventory_tags: {
        Args: { p_count: number };
        Returns: {
          id: string;
          number: number;
          value: string;
        }[];
      };
      generate_volunteer_reference_code: {
        Args: { p_tenant_id?: string };
        Returns: string;
      };
      get_artwork_call: {
        Args: { p_code: string; p_ip_address?: unknown };
        Returns: {
          call_id: string;
          closes_at: string;
          display_timezone: string;
          event_id: string;
          event_name: string;
          intro: string;
          location: string;
          max_images: number;
          opens_at: string;
          rights_note: string;
          starts_at: string;
          status: string;
          title: string;
        }[];
      };
      get_as_is_acknowledgement: {
        Args: { p_ip_address: unknown; p_token_hash: string };
        Returns: Json;
      };
      get_distribution_acknowledgement: {
        Args: { p_ip_address: unknown; p_token_hash: string };
        Returns: Json;
      };
      get_distribution_acknowledgement_on_staff_device: {
        Args: { p_event_id?: string };
        Returns: Json;
      };
      get_donation_import_mapping: { Args: never; Returns: Json };
      get_event_impact_derived_data: {
        Args: { p_event_id: string };
        Returns: Json;
      };
      get_event_media_upload_link: {
        Args: { p_ip_address: unknown; p_token_hash: string };
        Returns: Json;
      };
      get_event_place_breakdown: {
        Args: { p_event_id: string };
        Returns: Json;
      };
      get_event_report_data: { Args: { p_event_id: string }; Returns: Json };
      get_finance_report_data: {
        Args: { p_from: string; p_to: string };
        Returns: Json;
      };
      get_gear_request_settings: { Args: never; Returns: Json };
      get_giveaway_prize_sources: {
        Args: { p_giveaway_id: string };
        Returns: Json;
      };
      get_giving_settings: { Args: never; Returns: Json };
      get_program_impact_rollup_data: {
        Args: { p_program_id: string };
        Returns: Json;
      };
      get_program_place_reach: {
        Args: { p_program_id: string };
        Returns: Json;
      };
      get_registration_answer_request: {
        Args: { p_ip_address: unknown; p_token_hash: string };
        Returns: Json;
      };
      giveaway_ticket_totals: {
        Args: {
          p_donation_id?: string;
          p_giveaway_id: string;
          p_sale_id?: string;
        };
        Returns: {
          quantity: number;
          tier_id: string;
          tier_key: string;
          tier_label: string;
          tier_rank: number;
        }[];
      };
      grant_giveaway_tickets: {
        Args: {
          p_donation_id: string;
          p_giveaway_id: string;
          p_inventory_item_id: string;
          p_multiplier: number;
          p_sale_id: string;
          p_source_tier_id: string;
        };
        Returns: undefined;
      };
      grant_support_access: {
        Args: {
          p_email: string;
          p_expires_at: string;
          p_reason: string;
          p_role_name?: string;
        };
        Returns: string;
      };
      has_any_event_access: {
        Args: { p_min_level: string; p_table_name: string };
        Returns: boolean;
      };
      has_event_access: {
        Args: { p_event_id: string; p_min_level: string; p_table_name: string };
        Returns: boolean;
      };
      has_permission: {
        Args: { p_min_level: string; p_resource_key: string };
        Returns: boolean;
      };
      has_portal_access: {
        Args: { "": Database["public"]["Tables"]["people"]["Row"] };
        Returns: {
          error: true;
        } & "the function public.has_portal_access with parameter or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache";
      };
      has_role: { Args: { p_role: string }; Returns: boolean };
      has_tenant_membership: { Args: never; Returns: boolean };
      inventory_actor_name: { Args: { p_user_id: string }; Returns: string };
      inventory_intake_labels: {
        Args: { p_codes: string[]; p_donation_id: string };
        Returns: {
          code: string;
          description: string;
          item_id: string;
          size: string;
          tag_id: string;
        }[];
      };
      inventory_intake_scan: {
        Args: { p_asset_tag: string; p_barcode: string };
        Returns: {
          asset_tag_status: string;
          barcode_category_key: string;
          barcode_description: string;
          barcode_known: boolean;
        }[];
      };
      inventory_item_history: {
        Args: { p_item_id: string };
        Returns: {
          as_is_acknowledged_at: string;
          as_is_method: string;
          as_is_skipped_note: string;
          as_is_skipped_reason: string;
          as_is_typed_name: string;
          donated_on: string;
          donation_id: string;
          donor_id: string;
          donor_is_anonymous: boolean;
          donor_name: string;
          donor_source_type: string;
          entry_id: string;
          entry_kind: string;
          event_id: string;
          event_name: string;
          gear_request_id: string;
          intake_route: string;
          movement_type: string;
          notes: string;
          occurred_at: string;
          quantity: number;
          reason: string;
          recipient_id: string;
          recipient_name: string;
          recorded_by: string;
          recorded_by_name: string;
        }[];
      };
      inventory_numbered_tag_number: {
        Args: { p_code: string };
        Returns: number;
      };
      inventory_tag_codes: {
        Args: {
          p_ids?: string[];
          p_kinds?: string[];
          p_limit?: number;
          p_never_printed?: boolean;
          p_not_written?: boolean;
          p_number_from?: number;
          p_number_to?: number;
          p_offset?: number;
          p_search?: string;
          p_search_number?: number;
          p_states?: string[];
        };
        Returns: {
          code_kind: string;
          created_at: string;
          id: string;
          item_description: string;
          item_id: string;
          item_size: string;
          kind: string;
          last_printed_at: string;
          nfc_written_at: string;
          number: number;
          print_count: number;
          retired_at: string;
          retired_note: string;
          retired_reason: string;
          state: string;
          total_count: number;
          value: string;
        }[];
      };
      inventory_tag_history: {
        Args: { p_tag_id: string };
        Returns: {
          actor_name: string;
          detail: string;
          event: string;
          item_description: string;
          item_id: string;
          occurred_at: string;
        }[];
      };
      is_admin: { Args: never; Returns: boolean };
      is_on_event_staff: { Args: { p_event_id: string }; Returns: boolean };
      is_platform_operator: { Args: never; Returns: boolean };
      issue_distribution_acknowledgement_token: {
        Args: { p_event_id: string; p_token_hash: string };
        Returns: string;
      };
      issue_registration_answer_link: {
        Args: {
          p_registration_id: string;
          p_source: string;
          p_token_hash: string;
        };
        Returns: string;
      };
      issue_registration_answer_link_for_email: {
        Args: {
          p_email: string;
          p_event_id: string;
          p_ip_address: unknown;
          p_tenant_id: string;
          p_token_hash: string;
        };
        Returns: {
          email: string;
          expires_at: string;
          name: string;
          person_id: string;
          registration_id: string;
        }[];
      };
      link_person_to_auth_user: {
        Args: { p_person_id: string; p_user_id: string };
        Returns: undefined;
      };
      list_article_actors: {
        Args: { p_user_ids: string[] };
        Returns: {
          email: string;
          full_name: string;
          user_id: string;
        }[];
      };
      list_available_giveaway_sources: {
        Args: { p_event_id: string; p_include_prize_id?: string };
        Returns: Json;
      };
      list_calendar_owners: {
        Args: never;
        Returns: {
          auth_user_id: string;
          email: string;
          name: string;
          person_id: string;
          preferred_name: string;
        }[];
      };
      list_conduct_actors: {
        Args: { p_user_ids: string[] };
        Returns: {
          email: string;
          full_name: string;
          user_id: string;
        }[];
      };
      list_conduct_reviewer_candidates: {
        Args: never;
        Returns: {
          email: string;
          full_name: string;
          user_id: string;
        }[];
      };
      list_event_access: {
        Args: { p_event_id: string };
        Returns: {
          areas: string[];
          created_at: string;
          email: string;
          granted_by_name: string;
          id: string;
          kind: string;
          level: string;
          name: string;
          updated_at: string;
          user_id: string;
        }[];
      };
      list_event_sponsor_items: { Args: { p_event_id: string }; Returns: Json };
      list_expense_actors: {
        Args: { p_user_ids: string[] };
        Returns: {
          email: string;
          full_name: string;
          user_id: string;
        }[];
      };
      list_outbound_message_actors: {
        Args: { p_message_ids: string[] };
        Returns: {
          email: string;
          full_name: string;
          user_id: string;
        }[];
      };
      list_portal_users: {
        Args: never;
        Returns: {
          created_at: string;
          deactivated_at: string;
          email: string;
          full_name: string;
          person_id: string;
          person_name: string;
          preferred_name: string;
          roles: string[];
          shared_account: boolean;
          user_id: string;
        }[];
      };
      list_program_pillars: { Args: never; Returns: string[] };
      list_site_content_actors: {
        Args: { p_user_ids: string[] };
        Returns: {
          email: string;
          full_name: string;
          user_id: string;
        }[];
      };
      list_support_grants: {
        Args: never;
        Returns: {
          created_at: string;
          created_by_email: string;
          email: string;
          expires_at: string;
          id: string;
          reason: string;
          roles: string[];
          user_id: string;
        }[];
      };
      log_my_volunteer_hours: {
        Args: {
          p_event_id?: string;
          p_hours: number;
          p_ip_address?: unknown;
          p_logged_date: string;
          p_notes?: string;
          p_volunteer_role_type_id?: string;
        };
        Returns: string;
      };
      log_person_self_edit: {
        Args: { p_after: Json; p_before: Json; p_person_id: string };
        Returns: undefined;
      };
      lookup_volunteer_application_status: {
        Args: {
          p_email: string;
          p_ip_address?: unknown;
          p_reference_code: string;
        };
        Returns: string;
      };
      mark_event_expense_paid: {
        Args: { p_id: string };
        Returns: {
          amount: number;
          approved_at: string | null;
          approved_by: string | null;
          created_at: string;
          created_by: string;
          currency: string;
          description: string;
          event_id: string | null;
          expense_date: string;
          id: string;
          notes: string | null;
          paid_at: string | null;
          paid_by: string | null;
          paid_by_person_id: string | null;
          participant_assistance: boolean;
          receipt_path: string | null;
          receipt_url: string | null;
          rejected_at: string | null;
          rejected_by: string | null;
          rejection_reason: string | null;
          status: string;
          submitted_by: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "event_expenses";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      mark_reimbursement_paid: {
        Args: { p_id: string };
        Returns: {
          amount: number;
          approved_at: string | null;
          approved_by: string | null;
          created_at: string;
          created_by: string;
          currency: string;
          description: string;
          event_id: string | null;
          id: string;
          notes: string | null;
          paid_at: string | null;
          paid_by: string | null;
          person_id: string;
          receipt_path: string | null;
          receipt_url: string | null;
          rejected_at: string | null;
          rejection_reason: string | null;
          source_expense_id: string | null;
          status: string;
          submitted_by: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "reimbursements";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      mark_release_seen: { Args: { p_release: string }; Returns: undefined };
      merge_people: {
        Args: {
          p_duplicate_id: string;
          p_field_overrides?: Json;
          p_survivor_id: string;
        };
        Returns: undefined;
      };
      module_enabled_for_tenant: {
        Args: { p_module_key: string; p_tenant_id: string };
        Returns: boolean;
      };
      modules_for_tenant: {
        Args: { p_tenant_id: string };
        Returns: {
          enabled: boolean;
          module_key: string;
        }[];
      };
      move_carpool_passenger: {
        Args: {
          p_event_id: string;
          p_registration_id: string;
          p_to_car_id: string;
        };
        Returns: undefined;
      };
      move_distribution_draft: {
        Args: { p_from_event_id?: string; p_to_event_id?: string };
        Returns: string;
      };
      my_constituent_person_id: {
        Args: { p_module_key?: string };
        Returns: string;
      };
      my_contact_details: {
        Args: never;
        Returns: {
          address_city: string;
          address_country: string;
          address_line1: string;
          address_line2: string;
          address_postal_code: string;
          address_region: string;
          email: string;
          email_pending: string;
          email_pending_expires_at: string;
          instagram_handle: string;
          name: string;
          person_id: string;
          phone: string;
          preferred_mountain: string;
          preferred_name: string;
          pronouns: string;
          riding_discipline: string;
          ski_experience_level: string;
          snowboard_experience_level: string;
        }[];
      };
      my_contact_person_id: { Args: never; Returns: string };
      my_event_access: {
        Args: { p_event_id: string };
        Returns: {
          area_key: string;
          level: string;
        }[];
      };
      my_event_history: {
        Args: never;
        Returns: {
          attended: boolean;
          cancelled_at: string;
          ends_at: string;
          event_id: string;
          event_name: string;
          location: string;
          party_size: number;
          registered_at: string;
          registration_id: string;
          starts_at: string;
          timezone: string;
        }[];
      };
      my_event_registration: {
        Args: { p_event_id: string };
        Returns: {
          checked_in_at: string;
          notes: string;
          party_size: number;
          registered_at: string;
          registration_id: string;
        }[];
      };
      my_gear_history: {
        Args: never;
        Returns: {
          cancelled_at: string;
          delivery_method: string;
          fulfilled_at: string;
          id: string;
          items: string[];
          kind: string;
          note: string;
          occurred_at: string;
          quantity: number;
          quoted_amount: number;
          status: string;
        }[];
      };
      my_giving_history: {
        Args: never;
        Returns: {
          amount: number;
          event_id: string;
          event_name: string;
          id: string;
          items: string[];
          kind: string;
          received_on: string;
        }[];
      };
      my_granted_events: {
        Args: never;
        Returns: {
          areas: string[];
          event_id: string;
          level: string;
        }[];
      };
      my_history_person_id: { Args: { p_module_key: string }; Returns: string };
      my_loggable_events: {
        Args: never;
        Returns: {
          event_id: string;
          name: string;
          starts_at: string;
          timezone: string;
        }[];
      };
      my_modules: {
        Args: never;
        Returns: {
          enabled: boolean;
          is_core: boolean;
          label: string;
          module_key: string;
        }[];
      };
      my_notification_preferences: {
        Args: never;
        Returns: {
          enabled: boolean;
          kind: string;
        }[];
      };
      my_permissions: {
        Args: never;
        Returns: {
          level: string;
          resource_key: string;
        }[];
      };
      my_person_id: { Args: never; Returns: string };
      my_photo_consent: {
        Args: { p_registration_id: string };
        Returns: {
          asked: boolean;
          consent: boolean;
          consent_text: string;
          consented_at: string;
        }[];
      };
      my_public_person_id: { Args: never; Returns: string };
      my_registration_carpool: {
        Args: { p_registration_id: string };
        Returns: Json;
      };
      my_registration_contact: {
        Args: { p_registration_id: string };
        Returns: {
          editable: boolean;
          has_no_instagram: boolean;
          instagram_handle: string;
          preferred_contact_detail: string;
          preferred_contact_method: string;
          requires_instagram: boolean;
        }[];
      };
      my_registration_option_counts: {
        Args: { p_registration_id: string };
        Returns: {
          available: number;
          editable: boolean;
          label: string;
          option_id: string;
          party_size: number;
          prompt: string;
          quantity: number;
        }[];
      };
      my_registration_questions: {
        Args: { p_registration_id: string };
        Returns: {
          answer_text: string;
          editable: boolean;
          help: string;
          kind: string;
          max_value: number;
          min_value: number;
          options: Json;
          place_allow_other: boolean;
          place_granularity: string;
          prompt: string;
          question_id: string;
          required: boolean;
          show_if: Json;
          value: Json;
        }[];
      };
      my_roles: { Args: never; Returns: string[] };
      my_tenant_ids: { Args: never; Returns: string[] };
      my_volunteer_history: {
        Args: never;
        Returns: {
          event_id: string;
          event_name: string;
          event_timezone: string;
          hours: number;
          id: string;
          kind: string;
          occurred_at: string;
          occurred_on: string;
          role: string;
          status: string;
        }[];
      };
      my_volunteer_role_types: {
        Args: never;
        Returns: {
          id: string;
          name: string;
        }[];
      };
      my_waiver_on_file: {
        Args: never;
        Returns: {
          accepted_at: string;
          version: number;
        }[];
      };
      normalize_instagram_handle: {
        Args: { p_input: string };
        Returns: string;
      };
      notification_recipients: {
        Args: { p_kinds: Json };
        Returns: {
          email: string;
          holds_role: boolean;
          kind: string;
          name: string;
          opted_in: boolean;
          person_id: string;
          preferred_name: string;
          receives: boolean;
        }[];
      };
      people_with_permission: {
        Args: {
          p_min_level: string;
          p_resource_keys: string[];
          p_tenant_id: string;
        };
        Returns: {
          email: string;
          name: string;
          person_id: string;
          preferred_name: string;
          tenant_id: string;
        }[];
      };
      permission_rank: { Args: { p_level: string }; Returns: number };
      person_claim_candidates: {
        Args: { p_claim_id: string };
        Returns: {
          already_linked: boolean;
          email: string;
          instagram_handle: string;
          name: string;
          person_id: string;
          preferred_name: string;
          score: number;
          tier: string;
        }[];
      };
      person_last_activity_at: {
        Args: { p_person_id: string };
        Returns: string;
      };
      person_merge_blockers: {
        Args: { p_duplicate_id: string; p_survivor_id: string };
        Returns: {
          detail: string;
          kind: string;
          table_name: string;
        }[];
      };
      person_merge_preview: {
        Args: { p_duplicate_id: string; p_survivor_id: string };
        Returns: {
          column_name: string;
          duplicate_count: number;
          survivor_count: number;
          table_name: string;
        }[];
      };
      person_portal_access: { Args: { p_person_id: string }; Returns: boolean };
      person_role_flags: {
        Args: { p_person_id: string };
        Returns: {
          is_attendee: boolean;
          is_donor: boolean;
          is_partner: boolean;
          is_recipient: boolean;
          is_sponsor: boolean;
          is_staff: boolean;
          is_volunteer: boolean;
        }[];
      };
      person_self_edit_snapshot: {
        Args: { p: Database["public"]["Tables"]["people"]["Row"] };
        Returns: Json;
      };
      place_answer_counts: {
        Args: { p_event_ids: string[]; p_tenant_id: string };
        Returns: {
          place_id: string;
          place_kind: string;
          place_label: string;
          question_id: string;
          region_id: string;
          region_kind: string;
          region_label: string;
          registrations: number;
        }[];
      };
      place_answer_kinds: {
        Args: { p_granularity: string };
        Returns: string[];
      };
      place_key_id: { Args: { p_key: string }; Returns: string };
      place_regions: {
        Args: { p_place_ids: string[] };
        Returns: {
          place_id: string;
          place_kind: string;
          place_label: string;
          region_id: string;
          region_kind: string;
          region_label: string;
        }[];
      };
      place_search_text: {
        Args: { p_aliases: string[]; p_label: string; p_name: string };
        Returns: string;
      };
      platform_export_tenant: { Args: { p_tenant_id: string }; Returns: Json };
      platform_list_tenant_modules: {
        Args: { p_tenant_id: string };
        Returns: {
          description: string;
          enabled: boolean;
          is_core: boolean;
          label: string;
          module_key: string;
          sort_order: number;
          source: string;
          updated_at: string;
          updated_by_email: string;
        }[];
      };
      platform_list_tenants: {
        Args: never;
        Returns: {
          created_at: string;
          custom_domain: string;
          id: string;
          member_count: number;
          name: string;
          plan: string;
          slug: string;
          status: string;
          support_grant_count: number;
        }[];
      };
      platform_provision_tenant: {
        Args: {
          p_admin_email?: string;
          p_custom_domain?: string;
          p_name: string;
          p_pack_keys?: string[];
          p_plan?: string;
          p_slug: string;
        };
        Returns: string;
      };
      platform_set_tenant_domain: {
        Args: { p_custom_domain: string; p_tenant_id: string };
        Returns: undefined;
      };
      platform_set_tenant_module: {
        Args: { p_enabled: boolean; p_module_key: string; p_tenant_id: string };
        Returns: undefined;
      };
      platform_set_tenant_status: {
        Args: { p_status: string; p_tenant_id: string };
        Returns: undefined;
      };
      primary_contact: {
        Args: { "": Database["public"]["Views"]["people_with_roles"]["Row"] };
        Returns: {
          address_city: string | null;
          address_country: string | null;
          address_line1: string | null;
          address_line2: string | null;
          address_postal_code: string | null;
          address_region: string | null;
          auth_user_id: string | null;
          created_at: string;
          created_by: string | null;
          email: string | null;
          email_pending: string | null;
          email_token: string | null;
          email_token_expires_at: string | null;
          id: string;
          instagram_handle: string | null;
          is_anonymous: boolean;
          logo_url: string | null;
          name: string | null;
          notes: string | null;
          notification_email: string | null;
          notification_email_pending: string | null;
          notification_email_token: string | null;
          notification_email_token_expires_at: string | null;
          person_type: string;
          phone: string | null;
          preferred_mountain: string | null;
          preferred_name: string | null;
          primary_contact_person_id: string | null;
          pronouns: string | null;
          riding_discipline: string | null;
          ski_experience_level: string | null;
          snowboard_experience_level: string | null;
          source_type: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
          website: string | null;
        };
        SetofOptions: {
          from: "people_with_roles";
          to: "people";
          isOneToOne: true;
          isSetofReturn: true;
        };
      };
      provision_tenant: {
        Args: {
          p_admin_email?: string;
          p_custom_domain?: string;
          p_name: string;
          p_pack_keys?: string[];
          p_plan?: string;
          p_slug: string;
          p_template_tenant_id?: string;
        };
        Returns: string;
      };
      public_event_media: {
        Args: { p_event_id: string; p_tenant_id: string };
        Returns: {
          caption: string;
          content_type: string;
          id: string;
          kind: string;
          path: string;
          uploaded_at: string;
        }[];
      };
      public_module_enabled: {
        Args: { p_module_key: string };
        Returns: boolean;
      };
      public_origin_allowed: { Args: { p_origin: string }; Returns: boolean };
      public_tenant_id: { Args: never; Returns: string };
      publication_pages_missing_text: {
        Args: { p_publication_id: string };
        Returns: number;
      };
      publish_article_category: { Args: { p_id: string }; Returns: number };
      publish_giveaway_rules: {
        Args: { p_content: Json; p_giveaway_id: string };
        Returns: {
          effective_at: string;
          version: number;
        }[];
      };
      publish_site_content: {
        Args: { p_approval?: Json; p_keys: string[]; p_legal_surface?: Json };
        Returns: number;
      };
      purge_rate_limit_hits: { Args: { p_as_of?: string }; Returns: number };
      record_distribution_draft: {
        Args: {
          p_event_id?: string;
          p_link_token_hash?: string;
          p_mark_item_distributed?: boolean;
          p_occurred_at?: string;
          p_reason?: string;
          p_recipient_person_id?: string;
          p_removed_tags?: string[];
          p_skipped_note?: string;
          p_skipped_reason?: string;
        };
        Returns: {
          link_expires_at: string;
          recorded: number;
          released_tags: Json;
        }[];
      };
      record_event_distribution: {
        Args: {
          p_event_id?: string;
          p_inventory_item_id: string;
          p_mark_item_distributed?: boolean;
          p_occurred_at?: string;
          p_quantity: number;
          p_reason: string;
          p_recipient_person_id?: string;
        };
        Returns: string;
      };
      record_event_media: {
        Args: {
          p_caption?: string;
          p_original_filename: string;
          p_path: string;
        };
        Returns: {
          caption: string | null;
          content_type: string;
          event_id: string;
          id: string;
          is_public: boolean;
          kind: string;
          link_receipt_hash: string | null;
          original_filename: string;
          rights_confirmed_at: string | null;
          rights_terms: string | null;
          size_bytes: number;
          storage_path: string;
          tenant_id: string;
          thumb_path: string | null;
          upload_link_id: string | null;
          uploaded_at: string;
          uploaded_by: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "event_media";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      record_event_media_by_link: {
        Args: {
          p_ip_address: unknown;
          p_original_filename: string;
          p_path: string;
          p_receipt_hash: string;
          p_rights_confirmed: boolean;
          p_token_hash: string;
        };
        Returns: string;
      };
      record_giveaway_ticket_sale: {
        Args: {
          p_giveaway_id: string;
          p_notes?: string;
          p_package_id: string;
          p_purchaser_person_id?: string;
          p_quantity: number;
          p_sold_at?: string;
        };
        Returns: {
          amount: number;
          sale_id: string;
        }[];
      };
      record_inventory_labels_printed: {
        Args: { p_tag_ids: string[] };
        Returns: number;
      };
      record_product_sale: {
        Args: {
          p_discount_amount: number;
          p_event_id: string;
          p_lines: Json;
          p_notes: string;
          p_payment_method: string;
          p_purchaser_person_id: string;
          p_sold_at: string;
          p_tax_rate?: number;
        };
        Returns: {
          sale_id: string;
          subtotal: number;
          tax: number;
          total: number;
        }[];
      };
      recuse_from_conduct_report: {
        Args: { p_reason: string; p_report_id: string };
        Returns: undefined;
      };
      register_for_event: {
        Args: {
          p_accompanying_adult_name?: string;
          p_accompanying_adult_phone?: string;
          p_adults_only_confirmed?: boolean;
          p_answers?: Json;
          p_attended_before?: boolean;
          p_email: string;
          p_emergency_contact_name?: string;
          p_emergency_contact_phone?: string;
          p_event_id: string;
          p_has_no_instagram?: boolean;
          p_honeypot?: string;
          p_instagram_handle?: string;
          p_ip_address?: unknown;
          p_name: string;
          p_notes: string;
          p_option_counts?: Json;
          p_party_includes_minor?: boolean;
          p_party_size: number;
          p_phone: string;
          p_photo_consent?: boolean;
          p_preferred_contact_detail?: string;
          p_preferred_contact_method?: string;
          p_preferred_mountain?: string;
          p_pronouns?: string;
          p_riding_discipline?: string;
          p_ski_experience_level?: string;
          p_snowboard_experience_level?: string;
          p_waiver_accepted?: boolean;
          p_waiver_version?: number;
        };
        Returns: string;
      };
      register_myself_for_event: {
        Args: {
          p_accompanying_adult_name?: string;
          p_accompanying_adult_phone?: string;
          p_adults_only_confirmed?: boolean;
          p_answers?: Json;
          p_attended_before?: boolean;
          p_emergency_contact_name?: string;
          p_emergency_contact_phone?: string;
          p_event_id: string;
          p_has_no_instagram?: boolean;
          p_instagram_handle?: string;
          p_ip_address?: unknown;
          p_notes?: string;
          p_option_counts?: Json;
          p_party_includes_minor?: boolean;
          p_party_size: number;
          p_phone?: string;
          p_photo_consent?: boolean;
          p_preferred_contact_detail?: string;
          p_preferred_contact_method?: string;
          p_preferred_mountain?: string;
          p_pronouns?: string;
          p_riding_discipline?: string;
          p_ski_experience_level?: string;
          p_snowboard_experience_level?: string;
          p_waiver_accepted?: boolean;
          p_waiver_version?: number;
        };
        Returns: string;
      };
      registration_asks_about_minors: { Args: never; Returns: boolean };
      registration_carpool_by_token: {
        Args: { p_ip_address: unknown; p_token_hash: string };
        Returns: Json;
      };
      registration_option_defaults: {
        Args: { p_tenant_id: string };
        Returns: Json;
      };
      registration_requires_instagram: { Args: never; Returns: boolean };
      registration_service_area: { Args: never; Returns: Json };
      reject_event_expense: {
        Args: { p_id: string; p_reason: string };
        Returns: {
          amount: number;
          approved_at: string | null;
          approved_by: string | null;
          created_at: string;
          created_by: string;
          currency: string;
          description: string;
          event_id: string | null;
          expense_date: string;
          id: string;
          notes: string | null;
          paid_at: string | null;
          paid_by: string | null;
          paid_by_person_id: string | null;
          participant_assistance: boolean;
          receipt_path: string | null;
          receipt_url: string | null;
          rejected_at: string | null;
          rejected_by: string | null;
          rejection_reason: string | null;
          status: string;
          submitted_by: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "event_expenses";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      reject_reimbursement: {
        Args: { p_id: string; p_reason: string };
        Returns: {
          amount: number;
          approved_at: string | null;
          approved_by: string | null;
          created_at: string;
          created_by: string;
          currency: string;
          description: string;
          event_id: string | null;
          id: string;
          notes: string | null;
          paid_at: string | null;
          paid_by: string | null;
          person_id: string;
          receipt_path: string | null;
          receipt_url: string | null;
          rejected_at: string | null;
          rejection_reason: string | null;
          source_expense_id: string | null;
          status: string;
          submitted_by: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "reimbursements";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      release_inventory_item_from_giveaway: {
        Args: { p_event_id: string; p_inventory_item_id: string };
        Returns: undefined;
      };
      released_numbered_inventory_tags: {
        Args: { p_movement_ids: string[] };
        Returns: {
          code: string;
          description: string;
          item_id: string;
        }[];
      };
      remove_gear_request_item: {
        Args: { p_inventory_item_id: string; p_request_id: string };
        Returns: undefined;
      };
      remove_tenant_member: { Args: { p_user_id: string }; Returns: undefined };
      reopen_event_report: {
        Args: { p_id: string; p_reason: string };
        Returns: {
          adults_only: boolean;
          attendance_count: number | null;
          attendance_notes: string | null;
          auto_assign_discount_codes: boolean;
          budget_amount: number | null;
          capacity: number | null;
          carpool_seats_question_id: string | null;
          carpools_enabled: boolean;
          confirmation_note: string | null;
          content_notes: string | null;
          created_at: string;
          created_by: string;
          description: string | null;
          ends_at: string | null;
          event_lead_id: string | null;
          feedback_notes: string | null;
          flier_url: string | null;
          group_chat_enabled: boolean;
          group_chat_label: string | null;
          id: string;
          lessons_learned: string | null;
          location: string | null;
          name: string;
          registration_deadline: string | null;
          registration_enabled: boolean;
          registration_options_prompt: string | null;
          reminder_days_before: number;
          reminder_enabled: boolean;
          reminder_intro: string | null;
          report_reopen_reason: string | null;
          report_reopened_at: string | null;
          report_reopened_by: string | null;
          report_snapshot: Json | null;
          report_status: string;
          report_submitted_at: string | null;
          report_submitted_by: string | null;
          report_summary: string | null;
          starts_at: string;
          status: string;
          tenant_id: string;
          timezone: string;
          updated_at: string;
          updated_by: string | null;
          visibility: string;
        };
        SetofOptions: {
          from: "*";
          to: "events";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      reorder_article_categories: {
        Args: { p_ids: string[] };
        Returns: number;
      };
      request_gear_item: {
        Args: {
          p_email: string;
          p_inventory_item_id: string;
          p_name: string;
          p_notes?: string;
          p_phone: string;
        };
        Returns: string;
      };
      request_gear_items: {
        Args: {
          p_as_is_acknowledged?: boolean;
          p_as_is_text?: string;
          p_delivery_method?: string;
          p_email: string;
          p_honeypot?: string;
          p_instagram_handle?: string;
          p_inventory_item_ids: string[];
          p_ip_address?: unknown;
          p_name: string;
          p_notes?: string;
          p_passphrase?: string;
          p_payment_method?: string;
          p_phone: string;
          p_shipping?: Json;
        };
        Returns: string;
      };
      request_gear_items_as_me: {
        Args: {
          p_as_is_acknowledged?: boolean;
          p_as_is_text?: string;
          p_delivery_method?: string;
          p_inventory_item_ids: string[];
          p_ip_address?: unknown;
          p_notes?: string;
          p_passphrase?: string;
          p_payment_method?: string;
          p_shipping?: Json;
        };
        Returns: string;
      };
      request_gear_request_acknowledgements: {
        Args: { p_requests: Json };
        Returns: {
          expires_at: string;
          request_id: string;
        }[];
      };
      request_host: { Args: never; Returns: string };
      request_my_email_change: {
        Args: { p_email: string; p_token_hash: string };
        Returns: {
          display_name: string;
          expires_at: string;
          outcome: string;
          pending_email: string;
          person_id: string;
          tenant_id: string;
        }[];
      };
      request_registration_answers: {
        Args: { p_event_id: string; p_requests: Json };
        Returns: {
          expires_at: string;
          registration_id: string;
        }[];
      };
      request_tenant_slug: { Args: never; Returns: string };
      require_platform_operator: { Args: never; Returns: undefined };
      reserve_inventory_item_for_giveaway: {
        Args: { p_event_id: string; p_inventory_item_id: string };
        Returns: undefined;
      };
      reset_my_welcome: { Args: never; Returns: undefined };
      resolve_current_person_id: { Args: never; Returns: string };
      resolve_distribution_acknowledgement_link: {
        Args: { p_for_update: boolean; p_token_hash: string };
        Returns: string;
      };
      resolve_distribution_acknowledgement_token: {
        Args: { p_for_update: boolean; p_token_hash: string };
        Returns: string;
      };
      resolve_event_media_upload_link: {
        Args: { p_for_update: boolean; p_token_hash: string };
        Returns: {
          event_id: string;
          label: string;
          link_id: string;
          max_bytes: number;
          tenant_id: string;
        }[];
      };
      resolve_gear_request_acknowledgement_token: {
        Args: { p_for_update: boolean; p_token_hash: string };
        Returns: string;
      };
      resolve_inventory_category: {
        Args: { p_tenant_id?: string; p_text: string };
        Returns: string;
      };
      resolve_minor_contacts: {
        Args: {
          p_adult_name: string;
          p_adult_phone: string;
          p_emergency_name: string;
          p_emergency_phone: string;
          p_includes_minor: boolean;
        };
        Returns: Database["public"]["CompositeTypes"]["minor_accompaniment_contacts"];
        SetofOptions: {
          from: "*";
          to: "minor_accompaniment_contacts";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      resolve_or_create_person_by_email: {
        Args: {
          p_email: string;
          p_instagram_handle?: string;
          p_name: string;
          p_notes?: string;
          p_phone?: string;
          p_pronouns?: string;
          p_role_flag?: string;
          p_source_type?: string;
          p_tenant_id?: string;
        };
        Returns: string;
      };
      resolve_registration_answer_request: {
        Args: { p_for_update: boolean; p_token_hash: string };
        Returns: {
          event_id: string;
          registration_id: string;
          request_id: string;
          tenant_id: string;
        }[];
      };
      resolve_registration_contact: {
        Args: {
          p_asked: boolean;
          p_detail: string;
          p_has_no_instagram: boolean;
          p_instagram_handle: string;
          p_method: string;
          p_required: boolean;
        };
        Returns: Database["public"]["CompositeTypes"]["registration_contact"];
        SetofOptions: {
          from: "*";
          to: "registration_contact";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      resolve_tenant_id_from_host: {
        Args: { p_host: string };
        Returns: string;
      };
      resolve_tenant_id_from_slug: {
        Args: { p_slug: string };
        Returns: string;
      };
      resolved_photo_consent: {
        Args: { p_answer: boolean; p_tenant_id: string };
        Returns: Database["public"]["CompositeTypes"]["photo_consent_record"];
        SetofOptions: {
          from: "*";
          to: "photo_consent_record";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      restore_event_registration: {
        Args: { p_registration_id: string };
        Returns: undefined;
      };
      retention_auth_user_is_referenced: {
        Args: { p_user_id: string };
        Returns: boolean;
      };
      retention_log: {
        Args: {
          p_action: string;
          p_ids: string[];
          p_policy_key: string;
          p_run_id: string;
          p_subject_person_id?: string;
          p_table_name: string;
        };
        Returns: undefined;
      };
      retention_period_matches: {
        Args: {
          p_period: string;
          p_policy_key: string;
          p_secondary_period?: string;
        };
        Returns: boolean;
      };
      retention_person_is_retained: {
        Args: { p_person_id: string };
        Returns: boolean;
      };
      retention_redact_snapshot: {
        Args: { p_data: Json; p_table_name: string };
        Returns: Json;
      };
      retention_snapshot_has_personal_data: {
        Args: { p_first: Json; p_second?: Json; p_table_name: string };
        Returns: boolean;
      };
      retention_unclaimed_account_ids: {
        Args: { p_cutoff: string };
        Returns: string[];
      };
      retention_unregistered_personal_columns: {
        Args: never;
        Returns: {
          column_name: string;
          table_name: string;
        }[];
      };
      retire_inventory_tags: {
        Args: {
          p_allow_last?: boolean;
          p_note?: string;
          p_reason: string;
          p_tag_ids: string[];
        };
        Returns: {
          code: string;
          item_id: string;
          outcome: string;
          released_from: string;
          tag_id: string;
        }[];
      };
      retire_item_asset_tag_codes: {
        Args: { p_item_ids: string[]; p_note?: string; p_reason?: string };
        Returns: {
          code: string;
          description: string;
          item_id: string;
          outcome: string;
        }[];
      };
      return_gear_request_item: {
        Args: { p_inventory_item_id: string; p_request_id: string };
        Returns: undefined;
      };
      review_person_claim: {
        Args: {
          p_approve: boolean;
          p_claim_id: string;
          p_person_id?: string;
          p_review_note?: string;
        };
        Returns: string;
      };
      review_volunteer_hour_submission: {
        Args: {
          p_confirm: boolean;
          p_hours?: number;
          p_note?: string;
          p_submission_id: string;
        };
        Returns: undefined;
      };
      revoke_event_media_upload_link: {
        Args: { p_link_id: string };
        Returns: undefined;
      };
      revoke_support_access: {
        Args: { p_membership_id: string };
        Returns: undefined;
      };
      rider_profile_mountains: { Args: never; Returns: Json };
      run_retention_purge: {
        Args: {
          p_as_of?: string;
          p_dry_run?: boolean;
          p_tenant_id?: string;
          p_trigger?: string;
        };
        Returns: string;
      };
      save_article_drafts: {
        Args: { p_articles: Json; p_category: Json };
        Returns: string;
      };
      save_content_pack: {
        Args: {
          p_description?: string;
          p_id: string;
          p_is_offered?: boolean;
          p_key: string;
          p_name: string;
        };
        Returns: string;
      };
      save_event_carpool_car: {
        Args: {
          p_car_id: string;
          p_driver_registration_id: string;
          p_event_id: string;
          p_label: string;
          p_leaving_from: string;
          p_notes: string;
          p_seats: number;
        };
        Returns: string;
      };
      save_event_registration_options: {
        Args: { p_event_id: string; p_options: Json; p_prompt: string };
        Returns: undefined;
      };
      save_event_registration_questions: {
        Args: { p_event_id: string; p_questions: Json };
        Returns: undefined;
      };
      save_meeting_minutes_draft: {
        Args: {
          p_body_text: string;
          p_body_text_set: boolean;
          p_meeting_id: string;
          p_notes: Json;
        };
        Returns: string;
      };
      save_publication: {
        Args: { p_id: string; p_issue: Json; p_pages: Json };
        Returns: undefined;
      };
      save_registrant_rider_profile: {
        Args: {
          p_honeypot?: string;
          p_ip_address?: unknown;
          p_preferred_mountain?: string;
          p_registration_id: string;
          p_riding_discipline: string;
          p_ski_experience_level?: string;
          p_snowboard_experience_level?: string;
        };
        Returns: undefined;
      };
      save_site_content_drafts: { Args: { p_entries: Json }; Returns: number };
      search_places: {
        Args: { p_area?: string[]; p_granularity: string; p_query: string };
        Returns: {
          id: string;
          in_area: boolean;
          kind: string;
          label: string;
          matched: string;
        }[];
      };
      seed_demo_tenant: {
        Args: {
          p_actor_person_id: string;
          p_actor_user_id: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      seed_giveaway_tiers: {
        Args: { p_giveaway_id: string };
        Returns: undefined;
      };
      set_article_category_pack: {
        Args: { p_category_id: string; p_pack_id: string };
        Returns: number;
      };
      set_carpool_passenger_paid: {
        Args: { p_car_id: string; p_paid: boolean; p_registration_id: string };
        Returns: undefined;
      };
      set_current_tenant: { Args: { p_tenant_id: string }; Returns: undefined };
      set_distribution_draft_recipient: {
        Args: { p_event_id?: string; p_person_id?: string };
        Returns: string;
      };
      set_donation_import_mapping: {
        Args: { p_mapping: Json };
        Returns: undefined;
      };
      set_event_access_offered_areas: {
        Args: { p_areas: string[] };
        Returns: string[];
      };
      set_event_carpool_passengers: {
        Args: { p_car_id: string; p_registration_ids: string[] };
        Returns: number;
      };
      set_event_media_public: {
        Args: { p_ids: string[]; p_public: boolean };
        Returns: number;
      };
      set_event_media_retention_days: {
        Args: { p_days: number };
        Returns: undefined;
      };
      set_event_media_uploads_enabled: {
        Args: { p_enabled: boolean };
        Returns: undefined;
      };
      set_event_public_gallery_enabled: {
        Args: { p_enabled: boolean };
        Returns: undefined;
      };
      set_gear_request_notes: {
        Args: { p_notes: string; p_request_id: string };
        Returns: undefined;
      };
      set_gear_request_passphrase: {
        Args: {
          p_help_text: string;
          p_passphrase: string;
          p_required: boolean;
        };
        Returns: undefined;
      };
      set_gear_request_settings: {
        Args: {
          p_meetup_instructions: string;
          p_payment_methods: Json;
          p_shipping_enabled: boolean;
          p_shipping_instructions: string;
        };
        Returns: undefined;
      };
      set_gear_request_status: {
        Args: {
          p_quoted_amount?: number;
          p_request_id: string;
          p_status: string;
        };
        Returns: undefined;
      };
      set_giving_settings: {
        Args: {
          p_amount_param: string;
          p_enabled: boolean;
          p_mode: string;
          p_provider_label: string;
          p_recurring_available: boolean;
          p_suggested_amounts: Json;
          p_url: string;
        };
        Returns: undefined;
      };
      set_inventory_numbered_codes_only: {
        Args: { p_on: boolean };
        Returns: boolean;
      };
      set_inventory_tag_prefix: { Args: { p_prefix: string }; Returns: string };
      set_inventory_tags_nfc_written: {
        Args: { p_tag_ids: string[]; p_written?: boolean };
        Returns: number;
      };
      set_my_contact_details: {
        Args: {
          p_address_city: string;
          p_address_country: string;
          p_address_line1: string;
          p_address_line2: string;
          p_address_postal_code: string;
          p_address_region: string;
          p_instagram_handle: string;
          p_phone: string;
          p_preferred_mountain: string;
          p_preferred_name: string;
          p_pronouns: string;
          p_riding_discipline: string;
          p_ski_experience_level: string;
          p_snowboard_experience_level: string;
        };
        Returns: undefined;
      };
      set_my_notification_email: {
        Args: { p_email: string; p_token_hash: string };
        Returns: {
          display_name: string;
          expires_at: string;
          outcome: string;
          pending_email: string;
          person_id: string;
          tenant_id: string;
        }[];
      };
      set_my_notification_preference: {
        Args: { p_enabled: boolean; p_kind: string };
        Returns: undefined;
      };
      set_my_photo_consent: {
        Args: { p_consent: boolean; p_registration_id: string };
        Returns: Database["public"]["CompositeTypes"]["photo_consent_record"];
        SetofOptions: {
          from: "*";
          to: "photo_consent_record";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      set_my_preferred_name: {
        Args: { p_preferred_name: string };
        Returns: undefined;
      };
      set_my_pronouns: { Args: { p_pronouns: string }; Returns: undefined };
      set_my_registration_answers: {
        Args: { p_answers: Json; p_registration_id: string };
        Returns: undefined;
      };
      set_my_registration_contact: {
        Args: {
          p_has_no_instagram: boolean;
          p_instagram_handle: string;
          p_preferred_contact_detail: string;
          p_preferred_contact_method: string;
          p_registration_id: string;
        };
        Returns: undefined;
      };
      set_my_registration_option_counts: {
        Args: { p_counts: Json; p_registration_id: string };
        Returns: undefined;
      };
      set_notification_email_for_person: {
        Args: { p_email: string; p_person_id: string; p_token_hash: string };
        Returns: {
          display_name: string;
          expires_at: string;
          outcome: string;
          pending_email: string;
          person_id: string;
          tenant_id: string;
        }[];
      };
      set_person_role_tags: {
        Args: {
          p_person_id: string;
          p_public_roles?: string[];
          p_roles: string[];
        };
        Returns: undefined;
      };
      set_preferred_name_for_user: {
        Args: { p_preferred_name: string; p_user_id: string };
        Returns: undefined;
      };
      set_queue_item_claim: {
        Args: { p_id: string; p_person_id: string; p_queue: string };
        Returns: undefined;
      };
      set_registrant_option_counts: {
        Args: { p_counts: Json; p_registration_id: string };
        Returns: undefined;
      };
      set_registrant_rider_profile: {
        Args: {
          p_preferred_mountain?: string;
          p_registration_id: string;
          p_riding_discipline: string;
          p_ski_experience_level?: string;
          p_snowboard_experience_level?: string;
        };
        Returns: undefined;
      };
      set_registration_answers: {
        Args: { p_answers: Json; p_registration_id: string };
        Returns: undefined;
      };
      set_registration_asks_about_minors: {
        Args: { p_enabled: boolean };
        Returns: undefined;
      };
      set_registration_contact: {
        Args: {
          p_has_no_instagram: boolean;
          p_instagram_handle: string;
          p_preferred_contact_detail: string;
          p_preferred_contact_method: string;
          p_registration_id: string;
        };
        Returns: undefined;
      };
      set_registration_requires_instagram: {
        Args: { p_enabled: boolean };
        Returns: undefined;
      };
      set_registration_service_area: {
        Args: { p_place_ids: string[] };
        Returns: undefined;
      };
      set_registrations_group_chat: {
        Args: {
          p_added: boolean;
          p_event_id: string;
          p_registration_ids: string[];
        };
        Returns: number;
      };
      set_retention_policy_mode: {
        Args: { p_mode: string; p_policy_key: string };
        Returns: undefined;
      };
      set_rider_profile_mountains: {
        Args: { p_mountains: string[] };
        Returns: undefined;
      };
      show_limit: { Args: never; Returns: number };
      show_trgm: { Args: { "": string }; Returns: string[] };
      site_content_approver_count: { Args: never; Returns: number };
      stamp_event_reminder: {
        Args: { p_registration_id: string };
        Returns: boolean;
      };
      store_distribution_acknowledgement: {
        Args: {
          p_acknowledged: boolean;
          p_as_is_text: string;
          p_draft_id: string;
          p_method: string;
          p_typed_name: string;
        };
        Returns: undefined;
      };
      submit_artwork: {
        Args: {
          p_code: string;
          p_consent?: boolean;
          p_credit_name?: string;
          p_email: string;
          p_honeypot?: string;
          p_images: Json;
          p_ip_address?: unknown;
          p_medium: string;
          p_name: string;
          p_portfolio_url?: string;
          p_statement: string;
          p_title: string;
        };
        Returns: string;
      };
      submit_claim_from_gear_request: {
        Args: { p_ip_address?: unknown; p_request_id: string };
        Returns: undefined;
      };
      submit_claim_from_registration: {
        Args: { p_ip_address?: unknown; p_registration_id: string };
        Returns: undefined;
      };
      submit_contact_message: {
        Args: {
          p_email: string;
          p_honeypot?: string;
          p_ip_address?: unknown;
          p_message: string;
          p_name: string;
          p_topic: string;
        };
        Returns: string;
      };
      submit_event_report: {
        Args: { p_id: string };
        Returns: {
          adults_only: boolean;
          attendance_count: number | null;
          attendance_notes: string | null;
          auto_assign_discount_codes: boolean;
          budget_amount: number | null;
          capacity: number | null;
          carpool_seats_question_id: string | null;
          carpools_enabled: boolean;
          confirmation_note: string | null;
          content_notes: string | null;
          created_at: string;
          created_by: string;
          description: string | null;
          ends_at: string | null;
          event_lead_id: string | null;
          feedback_notes: string | null;
          flier_url: string | null;
          group_chat_enabled: boolean;
          group_chat_label: string | null;
          id: string;
          lessons_learned: string | null;
          location: string | null;
          name: string;
          registration_deadline: string | null;
          registration_enabled: boolean;
          registration_options_prompt: string | null;
          reminder_days_before: number;
          reminder_enabled: boolean;
          reminder_intro: string | null;
          report_reopen_reason: string | null;
          report_reopened_at: string | null;
          report_reopened_by: string | null;
          report_snapshot: Json | null;
          report_status: string;
          report_submitted_at: string | null;
          report_submitted_by: string | null;
          report_summary: string | null;
          starts_at: string;
          status: string;
          tenant_id: string;
          timezone: string;
          updated_at: string;
          updated_by: string | null;
          visibility: string;
        };
        SetofOptions: {
          from: "*";
          to: "events";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      submit_person_claim: {
        Args: {
          p_email?: string;
          p_instagram_handle?: string;
          p_ip_address?: unknown;
          p_name: string;
          p_note?: string;
          p_phone?: string;
        };
        Returns: undefined;
      };
      submit_registration_answers_by_token: {
        Args: { p_answers: Json; p_ip_address: unknown; p_token_hash: string };
        Returns: undefined;
      };
      submit_registration_contact_by_token: {
        Args: {
          p_has_no_instagram: boolean;
          p_instagram_handle: string;
          p_ip_address: unknown;
          p_preferred_contact_detail: string;
          p_preferred_contact_method: string;
          p_token_hash: string;
        };
        Returns: undefined;
      };
      submit_volunteer_application: {
        Args: {
          p_availability: string;
          p_email: string;
          p_honeypot?: string;
          p_ip_address?: unknown;
          p_name: string;
          p_phone: string;
          p_pronouns?: string;
          p_role_interest: string;
        };
        Returns: string;
      };
      suggest_giveaway_tier: {
        Args: { p_giveaway_id: string; p_item_type: string };
        Returns: string;
      };
      sync_event_sponsor_donations: {
        Args: { p_items: Json; p_sponsor_id: string };
        Returns: undefined;
      };
      tag_kinds: {
        Args: {
          "": Database["public"]["Views"]["inventory_items_with_category"]["Row"];
        };
        Returns: {
          error: true;
        } & "the function public.tag_kinds with parameter or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache";
      };
      tenant_asks_about_minors: {
        Args: { p_tenant_id: string };
        Returns: boolean;
      };
      tenant_asks_photo_consent: { Args: never; Returns: boolean };
      tenant_data_snapshot: { Args: { p_tenant_id: string }; Returns: Json };
      tenant_event_media_retention_days: {
        Args: { p_tenant_id: string };
        Returns: number;
      };
      tenant_event_media_uploads_enabled: {
        Args: { p_tenant_id: string };
        Returns: boolean;
      };
      tenant_event_public_gallery_enabled: {
        Args: { p_tenant_id: string };
        Returns: boolean;
      };
      tenant_isolation_gaps: {
        Args: never;
        Returns: {
          detail: string;
          kind: string;
          table_name: string;
        }[];
      };
      tenant_media_upload_rights: {
        Args: { p_tenant_id: string };
        Returns: string;
      };
      tenant_module_enabled: {
        Args: { p_module_key: string };
        Returns: boolean;
      };
      tenant_requires_instagram: {
        Args: { p_tenant_id: string };
        Returns: boolean;
      };
      tenant_service_area: { Args: { p_tenant_id: string }; Returns: string[] };
      trigger_retention_run: { Args: { p_dry_run?: boolean }; Returns: string };
      unassign_numbered_inventory_tag: {
        Args: { p_item_id: string };
        Returns: string;
      };
      unlink_person_account: {
        Args: { p_person_id: string };
        Returns: undefined;
      };
      unretire_inventory_tag: { Args: { p_tag_id: string }; Returns: string };
      update_event_sponsor: {
        Args: {
          p_contribution_value: number;
          p_follow_up_due_date?: string;
          p_follow_up_notes: string;
          p_follow_up_owner_person_id?: string;
          p_follow_up_status: string;
          p_id: string;
          p_is_public: boolean;
          p_items?: Json;
          p_notes: string;
          p_support_type: string;
        };
        Returns: undefined;
      };
      update_giveaway_prize: {
        Args: {
          p_donor_person_id?: string;
          p_estimated_value?: number;
          p_notes?: string;
          p_prize_id: string;
          p_prize_name: string;
          p_source_inventory_item_id?: string;
          p_source_monetary_donation_id?: string;
        };
        Returns: undefined;
      };
      uploader_name: {
        Args: { "": Database["public"]["Tables"]["event_media"]["Row"] };
        Returns: {
          error: true;
        } & "the function public.uploader_name with parameter or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache";
      };
      upsert_giveaway_winner: {
        Args: {
          p_distributed_at?: string;
          p_distribution_status?: string;
          p_notes?: string;
          p_prize_id: string;
          p_winner_contact?: string;
          p_winner_name: string;
        };
        Returns: string;
      };
      user_can_review_conduct: {
        Args: { p_tenant_id: string; p_user_id: string };
        Returns: boolean;
      };
      user_is_only_in_current_tenant: {
        Args: { p_user_id: string };
        Returns: boolean;
      };
      void_product_sale: {
        Args: { p_reason: string; p_sale_id: string };
        Returns: undefined;
      };
      waiver_on_file: {
        Args: { p_person_id: string; p_tenant_id: string };
        Returns: {
          accepted_at: string;
          version: number;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      minor_accompaniment_contacts: {
        accompanying_adult_name: string | null;
        accompanying_adult_phone: string | null;
        emergency_contact_name: string | null;
        emergency_contact_phone: string | null;
      };
      photo_consent_record: {
        consent: boolean | null;
        consented_at: string | null;
        consent_text: string | null;
      };
      registration_contact: {
        instagram_handle: string | null;
        has_no_instagram: boolean | null;
        preferred_contact_method: string | null;
        preferred_contact_detail: string | null;
      };
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
