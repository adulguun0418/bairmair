export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.18';
  };
  public: {
    Tables: {
      agent_profiles: {
        Row: {
          agency_name: string;
          bio: string | null;
          created_at: string;
          profile_id: string;
          updated_at: string;
          verified: boolean;
          verified_at: string | null;
        };
        Insert: {
          agency_name: string;
          bio?: string | null;
          created_at?: string;
          profile_id?: string;
          updated_at?: string;
          verified?: boolean;
          verified_at?: string | null;
        };
        Update: {
          agency_name?: string;
          bio?: string | null;
          created_at?: string;
          profile_id?: string;
          updated_at?: string;
          verified?: boolean;
          verified_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'agent_profiles_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      cities: {
        Row: {
          id: number;
          name_en: string;
          name_mn: string;
          slug: string;
        };
        Insert: {
          id: number;
          name_en: string;
          name_mn: string;
          slug: string;
        };
        Update: {
          id?: number;
          name_en?: string;
          name_mn?: string;
          slug?: string;
        };
        Relationships: [];
      };
      contact_reveals: {
        Row: {
          created_at: string;
          id: number;
          ip_hash: string | null;
          listing_id: string;
          viewer_id: string | null;
        };
        Insert: {
          created_at?: string;
          id?: never;
          ip_hash?: string | null;
          listing_id: string;
          viewer_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: never;
          ip_hash?: string | null;
          listing_id?: string;
          viewer_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'contact_reveals_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: false;
            referencedRelation: 'listings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contact_reveals_viewer_id_fkey';
            columns: ['viewer_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      districts: {
        Row: {
          city_id: number;
          id: number;
          name_en: string;
          name_mn: string;
          slug: string;
          sort_order: number;
        };
        Insert: {
          city_id: number;
          id: number;
          name_en: string;
          name_mn: string;
          slug: string;
          sort_order?: number;
        };
        Update: {
          city_id?: number;
          id?: number;
          name_en?: string;
          name_mn?: string;
          slug?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'districts_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'cities';
            referencedColumns: ['id'];
          },
        ];
      };
      favorites: {
        Row: {
          created_at: string;
          listing_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          listing_id: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          listing_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'favorites_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: false;
            referencedRelation: 'listings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'favorites_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      listing_photos: {
        Row: {
          camera_pose: Json | null;
          created_at: string;
          height: number | null;
          id: string;
          listing_id: string;
          room_id: string | null;
          scan_id: string | null;
          sort_order: number;
          storage_path: string;
          width: number | null;
        };
        Insert: {
          camera_pose?: Json | null;
          created_at?: string;
          height?: number | null;
          id?: string;
          listing_id: string;
          room_id?: string | null;
          scan_id?: string | null;
          sort_order?: number;
          storage_path: string;
          width?: number | null;
        };
        Update: {
          camera_pose?: Json | null;
          created_at?: string;
          height?: number | null;
          id?: string;
          listing_id?: string;
          room_id?: string | null;
          scan_id?: string | null;
          sort_order?: number;
          storage_path?: string;
          width?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'listing_photos_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: false;
            referencedRelation: 'listings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'listing_photos_scan_same_listing';
            columns: ['scan_id', 'listing_id'];
            isOneToOne: false;
            referencedRelation: 'room_scans';
            referencedColumns: ['id', 'listing_id'];
          },
        ];
      };
      listing_private: {
        Row: {
          lat: number;
          listing_id: string;
          lng: number;
          unit_number: string | null;
          updated_at: string;
        };
        Insert: {
          lat: number;
          listing_id: string;
          lng: number;
          unit_number?: string | null;
          updated_at?: string;
        };
        Update: {
          lat?: number;
          listing_id?: string;
          lng?: number;
          unit_number?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'listing_private_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: true;
            referencedRelation: 'listings';
            referencedColumns: ['id'];
          },
        ];
      };
      listing_views: {
        Row: {
          day: string;
          listing_id: string;
          views: number;
        };
        Insert: {
          day?: string;
          listing_id: string;
          views?: number;
        };
        Update: {
          day?: string;
          listing_id?: string;
          views?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'listing_views_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: false;
            referencedRelation: 'listings';
            referencedColumns: ['id'];
          },
        ];
      };
      listings: {
        Row: {
          address_text: string | null;
          area_official_m2: number | null;
          area_scanned_m2: number | null;
          balconies: number;
          building_material: Database['public']['Enums']['building_material'] | null;
          building_year: number | null;
          city_id: number;
          complex_name: string | null;
          created_at: string;
          currency: Database['public']['Enums']['currency_code'];
          deposit: number | null;
          description: string | null;
          district_id: number | null;
          floor: number | null;
          furnishing: Database['public']['Enums']['furnishing'] | null;
          has_3d: boolean;
          heating: Database['public']['Enums']['heating_type'] | null;
          id: string;
          khoroo: number | null;
          last_confirmed_at: string | null;
          location_public: unknown;
          min_term_months: number | null;
          mortgage_eligible: boolean | null;
          negotiable: boolean;
          new_building: boolean;
          owner_id: string;
          parking: Database['public']['Enums']['parking_type'] | null;
          price: number | null;
          public_lat: number | null;
          public_lng: number | null;
          published_at: string | null;
          rooms: number | null;
          scan_verified: boolean;
          search_text: string | null;
          show_exact_location: boolean;
          status: Database['public']['Enums']['listing_status'];
          title: string;
          total_floors: number | null;
          type: Database['public']['Enums']['listing_type'];
          updated_at: string;
          utilities_included: boolean | null;
        };
        Insert: {
          address_text?: string | null;
          area_official_m2?: number | null;
          area_scanned_m2?: number | null;
          balconies?: number;
          building_material?: Database['public']['Enums']['building_material'] | null;
          building_year?: number | null;
          city_id: number;
          complex_name?: string | null;
          created_at?: string;
          currency?: Database['public']['Enums']['currency_code'];
          deposit?: number | null;
          description?: string | null;
          district_id?: number | null;
          floor?: number | null;
          furnishing?: Database['public']['Enums']['furnishing'] | null;
          has_3d?: boolean;
          heating?: Database['public']['Enums']['heating_type'] | null;
          id?: string;
          khoroo?: number | null;
          last_confirmed_at?: string | null;
          location_public?: unknown;
          min_term_months?: number | null;
          mortgage_eligible?: boolean | null;
          negotiable?: boolean;
          new_building?: boolean;
          owner_id?: string;
          parking?: Database['public']['Enums']['parking_type'] | null;
          price?: number | null;
          public_lat?: number | null;
          public_lng?: number | null;
          published_at?: string | null;
          rooms?: number | null;
          scan_verified?: boolean;
          search_text?: string | null;
          show_exact_location?: boolean;
          status?: Database['public']['Enums']['listing_status'];
          title: string;
          total_floors?: number | null;
          type: Database['public']['Enums']['listing_type'];
          updated_at?: string;
          utilities_included?: boolean | null;
        };
        Update: {
          address_text?: string | null;
          area_official_m2?: number | null;
          area_scanned_m2?: number | null;
          balconies?: number;
          building_material?: Database['public']['Enums']['building_material'] | null;
          building_year?: number | null;
          city_id?: number;
          complex_name?: string | null;
          created_at?: string;
          currency?: Database['public']['Enums']['currency_code'];
          deposit?: number | null;
          description?: string | null;
          district_id?: number | null;
          floor?: number | null;
          furnishing?: Database['public']['Enums']['furnishing'] | null;
          has_3d?: boolean;
          heating?: Database['public']['Enums']['heating_type'] | null;
          id?: string;
          khoroo?: number | null;
          last_confirmed_at?: string | null;
          location_public?: unknown;
          min_term_months?: number | null;
          mortgage_eligible?: boolean | null;
          negotiable?: boolean;
          new_building?: boolean;
          owner_id?: string;
          parking?: Database['public']['Enums']['parking_type'] | null;
          price?: number | null;
          public_lat?: number | null;
          public_lng?: number | null;
          published_at?: string | null;
          rooms?: number | null;
          scan_verified?: boolean;
          search_text?: string | null;
          show_exact_location?: boolean;
          status?: Database['public']['Enums']['listing_status'];
          title?: string;
          total_floors?: number | null;
          type?: Database['public']['Enums']['listing_type'];
          updated_at?: string;
          utilities_included?: boolean | null;
        };
        Relationships: [
          {
            foreignKeyName: 'listings_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'cities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'listings_district_in_city';
            columns: ['district_id', 'city_id'];
            isOneToOne: false;
            referencedRelation: 'districts';
            referencedColumns: ['id', 'city_id'];
          },
          {
            foreignKeyName: 'listings_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_path: string | null;
          created_at: string;
          display_name: string | null;
          id: string;
          role: Database['public']['Enums']['user_role'];
          updated_at: string;
        };
        Insert: {
          avatar_path?: string | null;
          created_at?: string;
          display_name?: string | null;
          id: string;
          role?: Database['public']['Enums']['user_role'];
          updated_at?: string;
        };
        Update: {
          avatar_path?: string | null;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          role?: Database['public']['Enums']['user_role'];
          updated_at?: string;
        };
        Relationships: [];
      };
      reports: {
        Row: {
          created_at: string;
          details: string | null;
          id: string;
          listing_id: string;
          reason: Database['public']['Enums']['report_reason'];
          reporter_id: string;
          resolved_at: string | null;
          status: Database['public']['Enums']['report_status'];
        };
        Insert: {
          created_at?: string;
          details?: string | null;
          id?: string;
          listing_id: string;
          reason: Database['public']['Enums']['report_reason'];
          reporter_id?: string;
          resolved_at?: string | null;
          status?: Database['public']['Enums']['report_status'];
        };
        Update: {
          created_at?: string;
          details?: string | null;
          id?: string;
          listing_id?: string;
          reason?: Database['public']['Enums']['report_reason'];
          reporter_id?: string;
          resolved_at?: string | null;
          status?: Database['public']['Enums']['report_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'reports_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: false;
            referencedRelation: 'listings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reports_reporter_id_fkey';
            columns: ['reporter_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      room_scans: {
        Row: {
          app_version: string | null;
          converter_version: string | null;
          created_at: string;
          device_model: string | null;
          floor_plan_path: string | null;
          id: string;
          ios_version: string | null;
          is_current: boolean;
          listing_id: string;
          metrics: Json | null;
          model_path: string | null;
          raw_json_path: string;
          room_labels: Json;
          schema_version: number | null;
          status: Database['public']['Enums']['scan_status'];
          updated_at: string;
          usdz_path: string;
        };
        Insert: {
          app_version?: string | null;
          converter_version?: string | null;
          created_at?: string;
          device_model?: string | null;
          floor_plan_path?: string | null;
          id?: string;
          ios_version?: string | null;
          is_current?: boolean;
          listing_id: string;
          metrics?: Json | null;
          model_path?: string | null;
          raw_json_path: string;
          room_labels?: Json;
          schema_version?: number | null;
          status?: Database['public']['Enums']['scan_status'];
          updated_at?: string;
          usdz_path: string;
        };
        Update: {
          app_version?: string | null;
          converter_version?: string | null;
          created_at?: string;
          device_model?: string | null;
          floor_plan_path?: string | null;
          id?: string;
          ios_version?: string | null;
          is_current?: boolean;
          listing_id?: string;
          metrics?: Json | null;
          model_path?: string | null;
          raw_json_path?: string;
          room_labels?: Json;
          schema_version?: number | null;
          status?: Database['public']['Enums']['scan_status'];
          updated_at?: string;
          usdz_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'room_scans_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: false;
            referencedRelation: 'listings';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      confirm_listing_available: {
        Args: { p_listing_id: string };
        Returns: string;
      };
      record_listing_view: {
        Args: { p_listing_id: string };
        Returns: undefined;
      };
      reveal_listing_contact: {
        Args: { p_listing_id: string };
        Returns: string;
      };
    };
    Enums: {
      building_material: 'panel' | 'brick' | 'monolithic' | 'other';
      currency_code: 'MNT' | 'USD';
      furnishing: 'none' | 'partial' | 'full';
      heating_type: 'central' | 'autonomous' | 'electric' | 'other';
      listing_status: 'draft' | 'published' | 'sold_or_rented' | 'archived';
      listing_type: 'sale' | 'rent';
      parking_type: 'none' | 'outdoor' | 'garage' | 'underground';
      report_reason: 'fake' | 'wrong_info' | 'unavailable' | 'duplicate' | 'offensive' | 'other';
      report_status: 'open' | 'resolved' | 'dismissed';
      scan_status: 'uploaded' | 'ready' | 'failed';
      user_role: 'owner' | 'agent' | 'admin';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      building_material: ['panel', 'brick', 'monolithic', 'other'],
      currency_code: ['MNT', 'USD'],
      furnishing: ['none', 'partial', 'full'],
      heating_type: ['central', 'autonomous', 'electric', 'other'],
      listing_status: ['draft', 'published', 'sold_or_rented', 'archived'],
      listing_type: ['sale', 'rent'],
      parking_type: ['none', 'outdoor', 'garage', 'underground'],
      report_reason: ['fake', 'wrong_info', 'unavailable', 'duplicate', 'offensive', 'other'],
      report_status: ['open', 'resolved', 'dismissed'],
      scan_status: ['uploaded', 'ready', 'failed'],
      user_role: ['owner', 'agent', 'admin'],
    },
  },
} as const;
