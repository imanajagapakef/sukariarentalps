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
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: Database["public"]["Enums"]["user_role"] | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: number
          reason: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["user_role"] | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: number
          reason?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["user_role"] | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: number
          reason?: string | null
        }
        Relationships: []
      }
      booking_config: {
        Row: {
          advance_booking_days: number
          booking_interval_minutes: number
          branch_id: string | null
          cleaning_duration_minutes: number
          config_id: string
          created_at: string
          data_status: Database["public"]["Enums"]["data_status"]
          extension_interval_minutes: number
          late_tolerance_minutes: number
          maximum_duration_minutes: number
          minimum_duration_minutes: number
          minimum_extension_minutes: number
          payment_deadline_minutes: number
          updated_at: string
        }
        Insert: {
          advance_booking_days?: number
          booking_interval_minutes?: number
          branch_id?: string | null
          cleaning_duration_minutes?: number
          config_id: string
          created_at?: string
          data_status?: Database["public"]["Enums"]["data_status"]
          extension_interval_minutes?: number
          late_tolerance_minutes?: number
          maximum_duration_minutes?: number
          minimum_duration_minutes?: number
          minimum_extension_minutes?: number
          payment_deadline_minutes?: number
          updated_at?: string
        }
        Update: {
          advance_booking_days?: number
          booking_interval_minutes?: number
          branch_id?: string | null
          cleaning_duration_minutes?: number
          config_id?: string
          created_at?: string
          data_status?: Database["public"]["Enums"]["data_status"]
          extension_interval_minutes?: number
          late_tolerance_minutes?: number
          maximum_duration_minutes?: number
          minimum_duration_minutes?: number
          minimum_extension_minutes?: number
          payment_deadline_minutes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_config_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["branch_id"]
          },
        ]
      }
      booking_extensions: {
        Row: {
          amount: number
          booking_id: string
          created_at: string
          extension_id: string
          new_end_at: string
          payment_deadline_at: string | null
          previous_end_at: string
          rejected_reason: string | null
          requested_by: string | null
          requested_minutes: number
          status: Database["public"]["Enums"]["extension_status"]
          updated_at: string
        }
        Insert: {
          amount?: number
          booking_id: string
          created_at?: string
          extension_id?: string
          new_end_at: string
          payment_deadline_at?: string | null
          previous_end_at: string
          rejected_reason?: string | null
          requested_by?: string | null
          requested_minutes: number
          status?: Database["public"]["Enums"]["extension_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          booking_id?: string
          created_at?: string
          extension_id?: string
          new_end_at?: string
          payment_deadline_at?: string | null
          previous_end_at?: string
          rejected_reason?: string | null
          requested_by?: string | null
          requested_minutes?: number
          status?: Database["public"]["Enums"]["extension_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_extensions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["booking_id"]
          },
        ]
      }
      booking_items: {
        Row: {
          booking_id: string
          booking_item_id: number
          created_at: string
          description: string
          item_type: Database["public"]["Enums"]["booking_item_type"]
          quantity: number
          snack_id: string | null
          subtotal: number
          unit_price: number
        }
        Insert: {
          booking_id: string
          booking_item_id?: number
          created_at?: string
          description: string
          item_type: Database["public"]["Enums"]["booking_item_type"]
          quantity?: number
          snack_id?: string | null
          subtotal: number
          unit_price: number
        }
        Update: {
          booking_id?: string
          booking_item_id?: number
          created_at?: string
          description?: string
          item_type?: Database["public"]["Enums"]["booking_item_type"]
          quantity?: number
          snack_id?: string | null
          subtotal?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "booking_items_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "booking_items_snack_id_fkey"
            columns: ["snack_id"]
            isOneToOne: false
            referencedRelation: "snacks"
            referencedColumns: ["snack_id"]
          },
        ]
      }
      bookings: {
        Row: {
          actual_end_at: string | null
          actual_start_at: string | null
          booking_code: string
          booking_id: string
          branch_id: string
          cancelled_reason: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          discount_amount: number
          duration_minutes: number
          game_id: string | null
          latest_extendable_at: string | null
          notes: string | null
          payment_deadline_at: string | null
          rental_amount: number
          scheduled_end_at: string
          scheduled_start_at: string
          snack_amount: number
          source: Database["public"]["Enums"]["booking_source"]
          status: Database["public"]["Enums"]["booking_status"]
          total_amount: number
          unit_id: string
          updated_at: string
        }
        Insert: {
          actual_end_at?: string | null
          actual_start_at?: string | null
          booking_code?: string
          booking_id?: string
          branch_id: string
          cancelled_reason?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          discount_amount?: number
          duration_minutes: number
          game_id?: string | null
          latest_extendable_at?: string | null
          notes?: string | null
          payment_deadline_at?: string | null
          rental_amount?: number
          scheduled_end_at: string
          scheduled_start_at: string
          snack_amount?: number
          source?: Database["public"]["Enums"]["booking_source"]
          status?: Database["public"]["Enums"]["booking_status"]
          total_amount?: number
          unit_id: string
          updated_at?: string
        }
        Update: {
          actual_end_at?: string | null
          actual_start_at?: string | null
          booking_code?: string
          booking_id?: string
          branch_id?: string
          cancelled_reason?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          discount_amount?: number
          duration_minutes?: number
          game_id?: string | null
          latest_extendable_at?: string | null
          notes?: string | null
          payment_deadline_at?: string | null
          rental_amount?: number
          scheduled_end_at?: string
          scheduled_start_at?: string
          snack_amount?: number
          source?: Database["public"]["Enums"]["booking_source"]
          status?: Database["public"]["Enums"]["booking_status"]
          total_amount?: number
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "bookings_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "bookings_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["unit_id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string
          branch_code: string
          branch_id: string
          created_at: string
          data_status: Database["public"]["Enums"]["data_status"]
          google_rating: number | null
          google_review_count: number | null
          name: string
          operating_hours: string
          phone: string | null
          short_name: string
          status: Database["public"]["Enums"]["branch_status"]
          updated_at: string
        }
        Insert: {
          address: string
          branch_code: string
          branch_id: string
          created_at?: string
          data_status?: Database["public"]["Enums"]["data_status"]
          google_rating?: number | null
          google_review_count?: number | null
          name: string
          operating_hours: string
          phone?: string | null
          short_name: string
          status?: Database["public"]["Enums"]["branch_status"]
          updated_at?: string
        }
        Update: {
          address?: string
          branch_code?: string
          branch_id?: string
          created_at?: string
          data_status?: Database["public"]["Enums"]["data_status"]
          google_rating?: number | null
          google_review_count?: number | null
          name?: string
          operating_hours?: string
          phone?: string | null
          short_name?: string
          status?: Database["public"]["Enums"]["branch_status"]
          updated_at?: string
        }
        Relationships: []
      }
      businesses: {
        Row: {
          brand_name: string
          business_id: string
          business_type: string
          city: string
          country: string
          created_at: string
          currency: string
          data_status: Database["public"]["Enums"]["data_status"]
          instagram: string | null
          online_booking: boolean
          online_payment_provider: string | null
          operating_hours: string
          province: string
          timezone: string
          updated_at: string
          website: string | null
        }
        Insert: {
          brand_name: string
          business_id: string
          business_type: string
          city: string
          country?: string
          created_at?: string
          currency?: string
          data_status?: Database["public"]["Enums"]["data_status"]
          instagram?: string | null
          online_booking?: boolean
          online_payment_provider?: string | null
          operating_hours: string
          province: string
          timezone?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          brand_name?: string
          business_id?: string
          business_type?: string
          city?: string
          country?: string
          created_at?: string
          currency?: string
          data_status?: Database["public"]["Enums"]["data_status"]
          instagram?: string | null
          online_booking?: boolean
          online_payment_provider?: string | null
          operating_hours?: string
          province?: string
          timezone?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      customers: {
        Row: {
          created_at: string
          customer_id: string
          email: string | null
          first_booking_at: string | null
          last_booking_at: string | null
          name: string
          phone: string
          total_booking: number
          total_spending: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id?: string
          email?: string | null
          first_booking_at?: string | null
          last_booking_at?: string | null
          name: string
          phone: string
          total_booking?: number
          total_spending?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          email?: string | null
          first_booking_at?: string | null
          last_booking_at?: string | null
          name?: string
          phone?: string
          total_booking?: number
          total_spending?: number
          updated_at?: string
        }
        Relationships: []
      }
      data_sources: {
        Row: {
          created_at: string
          reference: string
          source_date: string | null
          source_id: string
          source_type: string
          verification_status: string
        }
        Insert: {
          created_at?: string
          reference: string
          source_date?: string | null
          source_id: string
          source_type: string
          verification_status?: string
        }
        Update: {
          created_at?: string
          reference?: string
          source_date?: string | null
          source_id?: string
          source_type?: string
          verification_status?: string
        }
        Relationships: []
      }
      facility_types: {
        Row: {
          category: Database["public"]["Enums"]["facility_category"]
          code: string
          created_at: string
          data_status: Database["public"]["Enums"]["data_status"]
          facility_type_id: string
          name: string
          platform: string
          updated_at: string
        }
        Insert: {
          category: Database["public"]["Enums"]["facility_category"]
          code: string
          created_at?: string
          data_status?: Database["public"]["Enums"]["data_status"]
          facility_type_id: string
          name: string
          platform: string
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["facility_category"]
          code?: string
          created_at?: string
          data_status?: Database["public"]["Enums"]["data_status"]
          facility_type_id?: string
          name?: string
          platform?: string
          updated_at?: string
        }
        Relationships: []
      }
      feedback: {
        Row: {
          booking_id: string | null
          categories: string[] | null
          cleanliness_rating: number | null
          comment: string | null
          created_at: string
          customer_id: string | null
          feedback_id: string
          rating: number
          service_rating: number | null
          unit_rating: number | null
        }
        Insert: {
          booking_id?: string | null
          categories?: string[] | null
          cleanliness_rating?: number | null
          comment?: string | null
          created_at?: string
          customer_id?: string | null
          feedback_id?: string
          rating: number
          service_rating?: number | null
          unit_rating?: number | null
        }
        Update: {
          booking_id?: string | null
          categories?: string[] | null
          cleanliness_rating?: number | null
          comment?: string | null
          created_at?: string
          customer_id?: string | null
          feedback_id?: string
          rating?: number
          service_rating?: number | null
          unit_rating?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "feedback_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["customer_id"]
          },
        ]
      }
      game_availability: {
        Row: {
          available: boolean
          branch_id: string
          condition: Database["public"]["Enums"]["game_condition"]
          created_at: string
          game_availability_id: string
          game_id: string
          verification_status: string
        }
        Insert: {
          available?: boolean
          branch_id: string
          condition?: Database["public"]["Enums"]["game_condition"]
          created_at?: string
          game_availability_id: string
          game_id: string
          verification_status?: string
        }
        Update: {
          available?: boolean
          branch_id?: string
          condition?: Database["public"]["Enums"]["game_condition"]
          created_at?: string
          game_availability_id?: string
          game_id?: string
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_availability_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "game_availability_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["game_id"]
          },
        ]
      }
      game_features: {
        Row: {
          co_op: boolean
          competitive: boolean
          game_id: string
          genre: string | null
          local_multiplayer: boolean
          max_local_players: number | null
          online_multiplayer: boolean
          psvr2: boolean
          recommended_players: string | null
          research_status: string
          single_player: boolean
          updated_at: string
        }
        Insert: {
          co_op?: boolean
          competitive?: boolean
          game_id: string
          genre?: string | null
          local_multiplayer?: boolean
          max_local_players?: number | null
          online_multiplayer?: boolean
          psvr2?: boolean
          recommended_players?: string | null
          research_status?: string
          single_player?: boolean
          updated_at?: string
        }
        Update: {
          co_op?: boolean
          competitive?: boolean
          game_id?: string
          genre?: string | null
          local_multiplayer?: boolean
          max_local_players?: number | null
          online_multiplayer?: boolean
          psvr2?: boolean
          recommended_players?: string | null
          research_status?: string
          single_player?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_features_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: true
            referencedRelation: "games"
            referencedColumns: ["game_id"]
          },
        ]
      }
      game_platforms: {
        Row: {
          created_at: string
          game_id: string
          game_platform_id: string
          platform_id: string
          verification_status: string
          version: string
        }
        Insert: {
          created_at?: string
          game_id: string
          game_platform_id: string
          platform_id: string
          verification_status?: string
          version?: string
        }
        Update: {
          created_at?: string
          game_id?: string
          game_platform_id?: string
          platform_id?: string
          verification_status?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_platforms_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "game_platforms_platform_id_fkey"
            columns: ["platform_id"]
            isOneToOne: false
            referencedRelation: "platforms"
            referencedColumns: ["platform_id"]
          },
        ]
      }
      game_requests: {
        Row: {
          created_at: string
          game_name: string
          request_id: string
          status: Database["public"]["Enums"]["request_status"]
          updated_at: string
          vote_count: number
        }
        Insert: {
          created_at?: string
          game_name: string
          request_id?: string
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
          vote_count?: number
        }
        Update: {
          created_at?: string
          game_name?: string
          request_id?: string
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
          vote_count?: number
        }
        Relationships: []
      }
      game_tag_map: {
        Row: {
          game_id: string
          tag_id: string
        }
        Insert: {
          game_id: string
          tag_id: string
        }
        Update: {
          game_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_tag_map_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "game_tag_map_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "game_tags"
            referencedColumns: ["tag_id"]
          },
        ]
      }
      game_tags: {
        Row: {
          category: string | null
          code: string
          name: string
          tag_id: string
        }
        Insert: {
          category?: string | null
          code: string
          name: string
          tag_id: string
        }
        Update: {
          category?: string | null
          code?: string
          name?: string
          tag_id?: string
        }
        Relationships: []
      }
      game_votes: {
        Row: {
          created_at: string
          request_id: string
          vote_id: number
          voter_ref: string
        }
        Insert: {
          created_at?: string
          request_id: string
          vote_id?: number
          voter_ref: string
        }
        Update: {
          created_at?: string
          request_id?: string
          vote_id?: number
          voter_ref?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_votes_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "game_requests"
            referencedColumns: ["request_id"]
          },
        ]
      }
      games: {
        Row: {
          active: boolean
          age_rating: string | null
          created_at: string
          data_status: Database["public"]["Enums"]["data_status"]
          description: string | null
          developer: string | null
          game_id: string
          name: string
          publisher: string | null
          release_date: string | null
          research_status: string
          short_description: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          age_rating?: string | null
          created_at?: string
          data_status?: Database["public"]["Enums"]["data_status"]
          description?: string | null
          developer?: string | null
          game_id: string
          name: string
          publisher?: string | null
          release_date?: string | null
          research_status?: string
          short_description?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          age_rating?: string | null
          created_at?: string
          data_status?: Database["public"]["Enums"]["data_status"]
          description?: string | null
          developer?: string | null
          game_id?: string
          name?: string
          publisher?: string | null
          release_date?: string | null
          research_status?: string
          short_description?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      inventory_movements: {
        Row: {
          actor_id: string | null
          booking_id: string | null
          created_at: string
          id: number
          movement_type: Database["public"]["Enums"]["inventory_movement_type"]
          qty_delta: number
          reason: string | null
          snack_id: string
          stock_after: number
        }
        Insert: {
          actor_id?: string | null
          booking_id?: string | null
          created_at?: string
          id?: number
          movement_type: Database["public"]["Enums"]["inventory_movement_type"]
          qty_delta: number
          reason?: string | null
          snack_id: string
          stock_after: number
        }
        Update: {
          actor_id?: string | null
          booking_id?: string | null
          created_at?: string
          id?: number
          movement_type?: Database["public"]["Enums"]["inventory_movement_type"]
          qty_delta?: number
          reason?: string | null
          snack_id?: string
          stock_after?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "inventory_movements_snack_id_fkey"
            columns: ["snack_id"]
            isOneToOne: false
            referencedRelation: "snacks"
            referencedColumns: ["snack_id"]
          },
        ]
      }
      notifications: {
        Row: {
          channel: string
          created_at: string
          error: string | null
          id: number
          payload: Json
          recipient_ref: string
          recipient_type: Database["public"]["Enums"]["notification_recipient"]
          sent_at: string | null
          status: Database["public"]["Enums"]["notification_status"]
          template: string
        }
        Insert: {
          channel?: string
          created_at?: string
          error?: string | null
          id?: number
          payload?: Json
          recipient_ref: string
          recipient_type: Database["public"]["Enums"]["notification_recipient"]
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          template: string
        }
        Update: {
          channel?: string
          created_at?: string
          error?: string | null
          id?: number
          payload?: Json
          recipient_ref?: string
          recipient_type?: Database["public"]["Enums"]["notification_recipient"]
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          template?: string
        }
        Relationships: []
      }
      payment_events: {
        Row: {
          created_at: string
          event_type: string
          payload: Json
          payment_event_id: number
          payment_id: string | null
          processed_at: string | null
          provider_event_id: string | null
          signature_valid: boolean
        }
        Insert: {
          created_at?: string
          event_type: string
          payload: Json
          payment_event_id?: number
          payment_id?: string | null
          processed_at?: string | null
          provider_event_id?: string | null
          signature_valid?: boolean
        }
        Update: {
          created_at?: string
          event_type?: string
          payload?: Json
          payment_event_id?: number
          payment_id?: string | null
          processed_at?: string | null
          provider_event_id?: string | null
          signature_valid?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["payment_id"]
          },
        ]
      }
      payments: {
        Row: {
          booking_id: string | null
          created_at: string
          expires_at: string | null
          extension_id: string | null
          gross_amount: number
          method: Database["public"]["Enums"]["payment_method"] | null
          paid_at: string | null
          payment_id: string
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_order_id: string | null
          provider_txn_id: string | null
          raw_response: Json | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          expires_at?: string | null
          extension_id?: string | null
          gross_amount: number
          method?: Database["public"]["Enums"]["payment_method"] | null
          paid_at?: string | null
          payment_id?: string
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_order_id?: string | null
          provider_txn_id?: string | null
          raw_response?: Json | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          expires_at?: string | null
          extension_id?: string | null
          gross_amount?: number
          method?: Database["public"]["Enums"]["payment_method"] | null
          paid_at?: string | null
          payment_id?: string
          provider?: Database["public"]["Enums"]["payment_provider"]
          provider_order_id?: string | null
          provider_txn_id?: string | null
          raw_response?: Json | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "payments_extension_id_fkey"
            columns: ["extension_id"]
            isOneToOne: false
            referencedRelation: "booking_extensions"
            referencedColumns: ["extension_id"]
          },
        ]
      }
      platforms: {
        Row: {
          active: boolean
          code: string
          created_at: string
          name: string
          platform_id: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          name: string
          platform_id: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          name?: string
          platform_id?: string
        }
        Relationships: []
      }
      pricing_rules: {
        Row: {
          active: boolean
          branch_id: string
          created_at: string
          data_status: Database["public"]["Enums"]["data_status"]
          duration_minutes: number
          facility_type_id: string
          price: number
          pricing_id: string
          pricing_type: Database["public"]["Enums"]["pricing_type"]
          source_date: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          branch_id: string
          created_at?: string
          data_status?: Database["public"]["Enums"]["data_status"]
          duration_minutes: number
          facility_type_id: string
          price: number
          pricing_id: string
          pricing_type: Database["public"]["Enums"]["pricing_type"]
          source_date?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          branch_id?: string
          created_at?: string
          data_status?: Database["public"]["Enums"]["data_status"]
          duration_minutes?: number
          facility_type_id?: string
          price?: number
          pricing_id?: string
          pricing_type?: Database["public"]["Enums"]["pricing_type"]
          source_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_rules_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "pricing_rules_facility_type_id_fkey"
            columns: ["facility_type_id"]
            isOneToOne: false
            referencedRelation: "facility_types"
            referencedColumns: ["facility_type_id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          full_name: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          full_name?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          full_name?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      promotion_items: {
        Row: {
          duration_minutes: number
          facility_type_id: string
          price: number
          promotion_id: string
        }
        Insert: {
          duration_minutes: number
          facility_type_id: string
          price: number
          promotion_id: string
        }
        Update: {
          duration_minutes?: number
          facility_type_id?: string
          price?: number
          promotion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotion_items_facility_type_id_fkey"
            columns: ["facility_type_id"]
            isOneToOne: false
            referencedRelation: "facility_types"
            referencedColumns: ["facility_type_id"]
          },
          {
            foreignKeyName: "promotion_items_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["promotion_id"]
          },
        ]
      }
      promotions: {
        Row: {
          branch_id: string
          created_at: string
          description: string | null
          name: string
          promotion_id: string
          source_date: string | null
          status: Database["public"]["Enums"]["promotion_status"]
          updated_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          description?: string | null
          name: string
          promotion_id: string
          source_date?: string | null
          status?: Database["public"]["Enums"]["promotion_status"]
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          description?: string | null
          name?: string
          promotion_id?: string
          source_date?: string | null
          status?: Database["public"]["Enums"]["promotion_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["branch_id"]
          },
        ]
      }
      snacks: {
        Row: {
          active: boolean
          category: Database["public"]["Enums"]["snack_category"]
          created_at: string
          data_status: Database["public"]["Enums"]["data_status"]
          min_stock: number
          name: string
          price: number
          snack_id: string
          stock: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          category: Database["public"]["Enums"]["snack_category"]
          created_at?: string
          data_status?: Database["public"]["Enums"]["data_status"]
          min_stock?: number
          name: string
          price: number
          snack_id: string
          stock?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: Database["public"]["Enums"]["snack_category"]
          created_at?: string
          data_status?: Database["public"]["Enums"]["data_status"]
          min_stock?: number
          name?: string
          price?: number
          snack_id?: string
          stock?: number
          updated_at?: string
        }
        Relationships: []
      }
      unit_reservations: {
        Row: {
          booking_id: string | null
          created_at: string
          kind: Database["public"]["Enums"]["reservation_kind"]
          period: unknown
          reservation_id: number
          unit_id: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          kind: Database["public"]["Enums"]["reservation_kind"]
          period: unknown
          reservation_id?: number
          unit_id: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          kind?: Database["public"]["Enums"]["reservation_kind"]
          period?: unknown
          reservation_id?: number
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unit_reservations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "unit_reservations_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["unit_id"]
          },
        ]
      }
      unit_status_history: {
        Row: {
          actor_id: string | null
          booking_id: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["unit_status"] | null
          id: number
          reason: string | null
          to_status: Database["public"]["Enums"]["unit_status"]
          unit_id: string
        }
        Insert: {
          actor_id?: string | null
          booking_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["unit_status"] | null
          id?: number
          reason?: string | null
          to_status: Database["public"]["Enums"]["unit_status"]
          unit_id: string
        }
        Update: {
          actor_id?: string | null
          booking_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["unit_status"] | null
          id?: number
          reason?: string | null
          to_status?: Database["public"]["Enums"]["unit_status"]
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unit_status_history_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "unit_status_history_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["unit_id"]
          },
        ]
      }
      units: {
        Row: {
          branch_id: string
          condition: Database["public"]["Enums"]["unit_condition"]
          created_at: string
          data_status: Database["public"]["Enums"]["data_status"]
          facility_type_id: string
          name: string
          status: Database["public"]["Enums"]["unit_status"]
          unit_id: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          condition?: Database["public"]["Enums"]["unit_condition"]
          created_at?: string
          data_status?: Database["public"]["Enums"]["data_status"]
          facility_type_id: string
          name: string
          status?: Database["public"]["Enums"]["unit_status"]
          unit_id: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          condition?: Database["public"]["Enums"]["unit_condition"]
          created_at?: string
          data_status?: Database["public"]["Enums"]["data_status"]
          facility_type_id?: string
          name?: string
          status?: Database["public"]["Enums"]["unit_status"]
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "units_facility_type_id_fkey"
            columns: ["facility_type_id"]
            isOneToOne: false
            referencedRelation: "facility_types"
            referencedColumns: ["facility_type_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_price: {
        Args: {
          p_branch_id: string
          p_duration_minutes: number
          p_facility_type_id: string
        }
        Returns: number
      }
      cancel_booking: {
        Args: { p_booking_id: string; p_reason?: string }
        Returns: Database["public"]["Enums"]["booking_status"]
      }
      check_in: {
        Args: { p_booking_id: string }
        Returns: Database["public"]["Enums"]["booking_status"]
      }
      complete_booking: {
        Args: { p_booking_id: string }
        Returns: Database["public"]["Enums"]["booking_status"]
      }
      confirm_booking: {
        Args: { p_booking_id: string }
        Returns: Database["public"]["Enums"]["booking_status"]
      }
      create_booking: {
        Args: {
          p_branch_id: string
          p_created_by?: string
          p_customer_email?: string
          p_customer_name: string
          p_customer_phone: string
          p_duration_minutes?: number
          p_game_id?: string
          p_notes?: string
          p_snacks?: Json
          p_source?: Database["public"]["Enums"]["booking_source"]
          p_start_at?: string
          p_unit_id: string
        }
        Returns: {
          booking_code: string
          booking_id: string
          payment_deadline_at: string
          scheduled_end_at: string
          scheduled_start_at: string
          total_amount: number
        }[]
      }
      expire_bookings: { Args: never; Returns: number }
      find_or_create_customer: {
        Args: { p_email?: string; p_name: string; p_phone: string }
        Returns: string
      }
      generate_booking_code: { Args: never; Returns: string }
      get_available_units: {
        Args: { p_branch_id: string; p_end: string; p_start: string }
        Returns: {
          facility_type_id: string
          status: Database["public"]["Enums"]["unit_status"]
          unit_id: string
          unit_name: string
        }[]
      }
      get_booking_config: {
        Args: { p_branch_id: string }
        Returns: {
          advance_booking_days: number
          booking_interval_minutes: number
          branch_id: string | null
          cleaning_duration_minutes: number
          config_id: string
          created_at: string
          data_status: Database["public"]["Enums"]["data_status"]
          extension_interval_minutes: number
          late_tolerance_minutes: number
          maximum_duration_minutes: number
          minimum_duration_minutes: number
          minimum_extension_minutes: number
          payment_deadline_minutes: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "booking_config"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      latest_extendable: { Args: { p_booking_id: string }; Returns: string }
      mark_no_show: {
        Args: { p_booking_id: string }
        Returns: Database["public"]["Enums"]["booking_status"]
      }
      mark_unit_ready: {
        Args: { p_unit_id: string }
        Returns: Database["public"]["Enums"]["unit_status"]
      }
      next_available: {
        Args: { p_from?: string; p_unit_id: string }
        Returns: string
      }
      round_to_interval: {
        Args: { p_at: string; p_interval: number }
        Returns: string
      }
    }
    Enums: {
      booking_item_type: "RENTAL" | "SNACK"
      booking_source: "ONLINE" | "WALK_IN"
      booking_status:
        | "DRAFT"
        | "WAITING_PAYMENT"
        | "CONFIRMED"
        | "CHECKED_IN"
        | "IN_USE"
        | "COMPLETED"
        | "CANCELLED"
        | "EXPIRED"
        | "NO_SHOW"
      branch_status: "ACTIVE" | "INACTIVE"
      data_status: "SOURCE" | "DRAFT" | "RESEARCH" | "VERIFY"
      extension_status:
        | "REQUESTED"
        | "WAITING_PAYMENT"
        | "CONFIRMED"
        | "REJECTED"
        | "CANCELLED"
      facility_category: "RENTAL" | "RACING" | "CONSOLE" | "VR"
      game_condition: "AVAILABLE" | "NEEDS_VERIFICATION" | "MISSING"
      inventory_movement_type: "IN" | "OUT" | "ADJUSTMENT" | "SALE"
      notification_recipient: "CUSTOMER" | "ADMIN"
      notification_status: "PENDING" | "SENT" | "FAILED"
      payment_method:
        | "MIDTRANS_QRIS"
        | "MIDTRANS_GOPAY"
        | "MIDTRANS_SHOPEEPAY"
        | "MIDTRANS_BANK_TRANSFER"
        | "MIDTRANS_CREDIT_CARD"
        | "CASH"
        | "QRIS_MANUAL"
        | "TRANSFER_MANUAL"
      payment_provider: "MIDTRANS" | "CASH" | "MANUAL"
      payment_status:
        | "PENDING"
        | "PAID"
        | "FAILED"
        | "EXPIRED"
        | "REFUNDED"
        | "PARTIALLY_REFUNDED"
      pricing_type: "HOURLY" | "PACKAGE"
      promotion_status: "DRAFT" | "ACTIVE" | "ENDED"
      request_status:
        | "REQUESTED"
        | "UNDER_REVIEW"
        | "APPROVED"
        | "REJECTED"
        | "ADDED"
      reservation_kind: "BOOKING" | "CLEANING" | "BLOCK"
      snack_category: "SNACK" | "DRINK" | "INSTANT_FOOD" | "COMBO"
      unit_condition: "GOOD" | "NEEDS_CLEANING" | "NEEDS_CHECK" | "DAMAGED"
      unit_status:
        | "AVAILABLE"
        | "BOOKED"
        | "IN_USE"
        | "IN_ORDER"
        | "MAINTENANCE"
        | "OFFLINE"
      user_role: "OWNER" | "ADMIN" | "STAFF"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      booking_item_type: ["RENTAL", "SNACK"],
      booking_source: ["ONLINE", "WALK_IN"],
      booking_status: [
        "DRAFT",
        "WAITING_PAYMENT",
        "CONFIRMED",
        "CHECKED_IN",
        "IN_USE",
        "COMPLETED",
        "CANCELLED",
        "EXPIRED",
        "NO_SHOW",
      ],
      branch_status: ["ACTIVE", "INACTIVE"],
      data_status: ["SOURCE", "DRAFT", "RESEARCH", "VERIFY"],
      extension_status: [
        "REQUESTED",
        "WAITING_PAYMENT",
        "CONFIRMED",
        "REJECTED",
        "CANCELLED",
      ],
      facility_category: ["RENTAL", "RACING", "CONSOLE", "VR"],
      game_condition: ["AVAILABLE", "NEEDS_VERIFICATION", "MISSING"],
      inventory_movement_type: ["IN", "OUT", "ADJUSTMENT", "SALE"],
      notification_recipient: ["CUSTOMER", "ADMIN"],
      notification_status: ["PENDING", "SENT", "FAILED"],
      payment_method: [
        "MIDTRANS_QRIS",
        "MIDTRANS_GOPAY",
        "MIDTRANS_SHOPEEPAY",
        "MIDTRANS_BANK_TRANSFER",
        "MIDTRANS_CREDIT_CARD",
        "CASH",
        "QRIS_MANUAL",
        "TRANSFER_MANUAL",
      ],
      payment_provider: ["MIDTRANS", "CASH", "MANUAL"],
      payment_status: [
        "PENDING",
        "PAID",
        "FAILED",
        "EXPIRED",
        "REFUNDED",
        "PARTIALLY_REFUNDED",
      ],
      pricing_type: ["HOURLY", "PACKAGE"],
      promotion_status: ["DRAFT", "ACTIVE", "ENDED"],
      request_status: [
        "REQUESTED",
        "UNDER_REVIEW",
        "APPROVED",
        "REJECTED",
        "ADDED",
      ],
      reservation_kind: ["BOOKING", "CLEANING", "BLOCK"],
      snack_category: ["SNACK", "DRINK", "INSTANT_FOOD", "COMBO"],
      unit_condition: ["GOOD", "NEEDS_CLEANING", "NEEDS_CHECK", "DAMAGED"],
      unit_status: [
        "AVAILABLE",
        "BOOKED",
        "IN_USE",
        "IN_ORDER",
        "MAINTENANCE",
        "OFFLINE",
      ],
      user_role: ["OWNER", "ADMIN", "STAFF"],
    },
  },
} as const
