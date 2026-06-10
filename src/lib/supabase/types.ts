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
      agent_messages: {
        Row: {
          created_at: string
          from_agent: string | null
          id: string
          intent: string
          job_id: string | null
          payload: Json
          to_agent: string | null
        }
        Insert: {
          created_at?: string
          from_agent?: string | null
          id?: string
          intent: string
          job_id?: string | null
          payload: Json
          to_agent?: string | null
        }
        Update: {
          created_at?: string
          from_agent?: string | null
          id?: string
          intent?: string
          job_id?: string | null
          payload?: Json
          to_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_messages_from_agent_fkey"
            columns: ["from_agent"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_messages_to_agent_fkey"
            columns: ["to_agent"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_prompt_versions: {
        Row: {
          agent_id: string
          changelog: string | null
          created_at: string
          id: string
          prompt_template: string
          version: number
        }
        Insert: {
          agent_id: string
          changelog?: string | null
          created_at?: string
          id?: string
          prompt_template: string
          version: number
        }
        Update: {
          agent_id?: string
          changelog?: string | null
          created_at?: string
          id?: string
          prompt_template?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_prompt_versions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          current_state: string
          current_task: string | null
          description: string
          display_name: string
          emoji: string | null
          id: string
          is_active: boolean
          model_id: string
          prompt_template: string
          prompt_version: number
          total_decisions: number
          total_wins: number
          updated_at: string
        }
        Insert: {
          current_state?: string
          current_task?: string | null
          description: string
          display_name: string
          emoji?: string | null
          id: string
          is_active?: boolean
          model_id?: string
          prompt_template: string
          prompt_version?: number
          total_decisions?: number
          total_wins?: number
          updated_at?: string
        }
        Update: {
          current_state?: string
          current_task?: string | null
          description?: string
          display_name?: string
          emoji?: string | null
          id?: string
          is_active?: boolean
          model_id?: string
          prompt_template?: string
          prompt_version?: number
          total_decisions?: number
          total_wins?: number
          updated_at?: string
        }
        Relationships: []
      }
      assistant_activity_log: {
        Row: {
          activity_type: string
          assistant_id: string
          created_at: string
          id: string
          payload: Json
          summary: string
        }
        Insert: {
          activity_type: string
          assistant_id: string
          created_at?: string
          id?: string
          payload?: Json
          summary: string
        }
        Update: {
          activity_type?: string
          assistant_id?: string
          created_at?: string
          id?: string
          payload?: Json
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_activity_log_assistant_id_fkey"
            columns: ["assistant_id"]
            isOneToOne: false
            referencedRelation: "assistants"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          thread_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          thread_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "assistant_chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_chat_threads: {
        Row: {
          assistant_id: string
          id: string
          last_message_at: string
          started_at: string
          title: string | null
        }
        Insert: {
          assistant_id: string
          id?: string
          last_message_at?: string
          started_at?: string
          title?: string | null
        }
        Update: {
          assistant_id?: string
          id?: string
          last_message_at?: string
          started_at?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assistant_chat_threads_assistant_id_fkey"
            columns: ["assistant_id"]
            isOneToOne: false
            referencedRelation: "assistants"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_memory: {
        Row: {
          assistant_id: string
          confidence: number
          editable_by_user: boolean
          id: string
          last_updated_at: string
          memory_key: string
          memory_value: Json
        }
        Insert: {
          assistant_id: string
          confidence?: number
          editable_by_user?: boolean
          id?: string
          last_updated_at?: string
          memory_key: string
          memory_value: Json
        }
        Update: {
          assistant_id?: string
          confidence?: number
          editable_by_user?: boolean
          id?: string
          last_updated_at?: string
          memory_key?: string
          memory_value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "assistant_memory_assistant_id_fkey"
            columns: ["assistant_id"]
            isOneToOne: false
            referencedRelation: "assistants"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_settings: {
        Row: {
          assistant_id: string
          settings: Json
          updated_at: string
        }
        Insert: {
          assistant_id: string
          settings?: Json
          updated_at?: string
        }
        Update: {
          assistant_id?: string
          settings?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_settings_assistant_id_fkey"
            columns: ["assistant_id"]
            isOneToOne: true
            referencedRelation: "assistants"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_status: {
        Row: {
          assistant_id: string
          current_activity: string | null
          state: string
          updated_at: string
        }
        Insert: {
          assistant_id: string
          current_activity?: string | null
          state: string
          updated_at?: string
        }
        Update: {
          assistant_id?: string
          current_activity?: string | null
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_status_assistant_id_fkey"
            columns: ["assistant_id"]
            isOneToOne: true
            referencedRelation: "assistants"
            referencedColumns: ["id"]
          },
        ]
      }
      assistants: {
        Row: {
          accent_color_var: string
          created_at: string
          display_name: string
          icon_name: string
          id: string
          is_enabled: boolean
          role_description: string
        }
        Insert: {
          accent_color_var?: string
          created_at?: string
          display_name: string
          icon_name: string
          id: string
          is_enabled?: boolean
          role_description: string
        }
        Update: {
          accent_color_var?: string
          created_at?: string
          display_name?: string
          icon_name?: string
          id?: string
          is_enabled?: boolean
          role_description?: string
        }
        Relationships: []
      }
      channel_personas: {
        Row: {
          brand_watermark_url: string | null
          caption_style: Json
          channel_id: string
          created_at: string
          id: string
          intro_template: Json
          outro_template: Json
          signature_phrases: string[]
          updated_at: string
          voice_profile: Json
        }
        Insert: {
          brand_watermark_url?: string | null
          caption_style?: Json
          channel_id: string
          created_at?: string
          id?: string
          intro_template?: Json
          outro_template?: Json
          signature_phrases?: string[]
          updated_at?: string
          voice_profile?: Json
        }
        Update: {
          brand_watermark_url?: string | null
          caption_style?: Json
          channel_id?: string
          created_at?: string
          id?: string
          intro_template?: Json
          outro_template?: Json
          signature_phrases?: string[]
          updated_at?: string
          voice_profile?: Json
        }
        Relationships: [
          {
            foreignKeyName: "channel_personas_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: true
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_stat_snapshots: {
        Row: {
          channel_id: string
          snapshot_at: string
          subscriber_count: number
          video_count: number | null
          view_count: number | null
        }
        Insert: {
          channel_id: string
          snapshot_at?: string
          subscriber_count: number
          video_count?: number | null
          view_count?: number | null
        }
        Update: {
          channel_id?: string
          snapshot_at?: string
          subscriber_count?: number
          video_count?: number | null
          view_count?: number | null
        }
        Relationships: []
      }
      channels: {
        Row: {
          created_at: string
          creator_goals: string | null
          default_tts_provider: string | null
          default_voice_id: string | null
          display_name: string
          external_channel_id: string | null
          id: string
          interests: string[]
          is_active: boolean
          max_clip_ingest_per_day: number
          max_uploads_per_day: number
          niche_id: string | null
          oauth_refresh_token_encrypted: string | null
          onboarding_completed_at: string | null
          persona: Json
          platform: string
          posting_schedule: Json
          slug: string
          target_format_mix: Json
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          creator_goals?: string | null
          default_tts_provider?: string | null
          default_voice_id?: string | null
          display_name: string
          external_channel_id?: string | null
          id?: string
          interests?: string[]
          is_active?: boolean
          max_clip_ingest_per_day?: number
          max_uploads_per_day?: number
          niche_id?: string | null
          oauth_refresh_token_encrypted?: string | null
          onboarding_completed_at?: string | null
          persona?: Json
          platform: string
          posting_schedule?: Json
          slug: string
          target_format_mix?: Json
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          creator_goals?: string | null
          default_tts_provider?: string | null
          default_voice_id?: string | null
          display_name?: string
          external_channel_id?: string | null
          id?: string
          interests?: string[]
          is_active?: boolean
          max_clip_ingest_per_day?: number
          max_uploads_per_day?: number
          niche_id?: string | null
          oauth_refresh_token_encrypted?: string | null
          onboarding_completed_at?: string | null
          persona?: Json
          platform?: string
          posting_schedule?: Json
          slug?: string
          target_format_mix?: Json
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channels_niche_id_fkey"
            columns: ["niche_id"]
            isOneToOne: false
            referencedRelation: "niches"
            referencedColumns: ["id"]
          },
        ]
      }
      classification_samples: {
        Row: {
          chosen_labels: Json
          created_at: string
          id: string
          prompt_full: string
          response_full: string
          review_verdict: string | null
          reviewed: boolean
          reviewed_at: string | null
          reviewed_by: string | null
          video_id: string
        }
        Insert: {
          chosen_labels: Json
          created_at?: string
          id?: string
          prompt_full: string
          response_full: string
          review_verdict?: string | null
          reviewed?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          video_id: string
        }
        Update: {
          chosen_labels?: Json
          created_at?: string
          id?: string
          prompt_full?: string
          response_full?: string
          review_verdict?: string | null
          reviewed?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "classification_samples_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "shorts_observations"
            referencedColumns: ["video_id"]
          },
        ]
      }
      clip_library: {
        Row: {
          added_at: string
          added_by: string
          description: string | null
          duration_seconds: number
          height: number | null
          id: string
          local_path: string
          niche_id: string | null
          source_creator: string | null
          source_platform: string
          source_url: string
          tags: string[]
          width: number | null
        }
        Insert: {
          added_at?: string
          added_by: string
          description?: string | null
          duration_seconds: number
          height?: number | null
          id?: string
          local_path: string
          niche_id?: string | null
          source_creator?: string | null
          source_platform: string
          source_url: string
          tags?: string[]
          width?: number | null
        }
        Update: {
          added_at?: string
          added_by?: string
          description?: string | null
          duration_seconds?: number
          height?: number | null
          id?: string
          local_path?: string
          niche_id?: string | null
          source_creator?: string | null
          source_platform?: string
          source_url?: string
          tags?: string[]
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "clip_library_niche_id_fkey"
            columns: ["niche_id"]
            isOneToOne: false
            referencedRelation: "niches"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_channels: {
        Row: {
          added_at: string
          channel_handle: string | null
          channel_id: string
          channel_title: string | null
          is_active: boolean
        }
        Insert: {
          added_at?: string
          channel_handle?: string | null
          channel_id: string
          channel_title?: string | null
          is_active?: boolean
        }
        Update: {
          added_at?: string
          channel_handle?: string | null
          channel_id?: string
          channel_title?: string | null
          is_active?: boolean
        }
        Relationships: []
      }
      compilation_drafts: {
        Row: {
          accent_word: string
          caption_style: string
          channel_id: string
          clip_refs: Json
          created_at: string
          id: string
          layout_variant: string
          music_track_id: string | null
          promoted_your_video_id: string | null
          rendered_path: string | null
          reveal_pattern: string
          status: string
          theme: string
          title_formula_id: string
          title_template: string
          topic_queue_id: string | null
          updated_at: string
        }
        Insert: {
          accent_word: string
          caption_style: string
          channel_id: string
          clip_refs: Json
          created_at?: string
          id?: string
          layout_variant?: string
          music_track_id?: string | null
          promoted_your_video_id?: string | null
          rendered_path?: string | null
          reveal_pattern: string
          status?: string
          theme: string
          title_formula_id: string
          title_template: string
          topic_queue_id?: string | null
          updated_at?: string
        }
        Update: {
          accent_word?: string
          caption_style?: string
          channel_id?: string
          clip_refs?: Json
          created_at?: string
          id?: string
          layout_variant?: string
          music_track_id?: string | null
          promoted_your_video_id?: string | null
          rendered_path?: string | null
          reveal_pattern?: string
          status?: string
          theme?: string
          title_formula_id?: string
          title_template?: string
          topic_queue_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compilation_drafts_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compilation_drafts_music_track_id_fkey"
            columns: ["music_track_id"]
            isOneToOne: false
            referencedRelation: "music_tracks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compilation_drafts_promoted_your_video_id_fkey"
            columns: ["promoted_your_video_id"]
            isOneToOne: false
            referencedRelation: "your_videos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compilation_drafts_topic_queue_id_fkey"
            columns: ["topic_queue_id"]
            isOneToOne: false
            referencedRelation: "topic_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      decisions: {
        Row: {
          agent_id: string | null
          alternatives: Json
          chosen: Json
          created_at: string
          decision_type: string
          guidance_ids_used: string[]
          id: string
          inputs: Json
          job_id: string | null
          outcome: Json | null
          outcome_recorded_at: string | null
          prompt_version: string | null
          reasoning: string | null
          scores: Json | null
          your_video_id: string | null
        }
        Insert: {
          agent_id?: string | null
          alternatives?: Json
          chosen: Json
          created_at?: string
          decision_type: string
          guidance_ids_used?: string[]
          id?: string
          inputs: Json
          job_id?: string | null
          outcome?: Json | null
          outcome_recorded_at?: string | null
          prompt_version?: string | null
          reasoning?: string | null
          scores?: Json | null
          your_video_id?: string | null
        }
        Update: {
          agent_id?: string | null
          alternatives?: Json
          chosen?: Json
          created_at?: string
          decision_type?: string
          guidance_ids_used?: string[]
          id?: string
          inputs?: Json
          job_id?: string | null
          outcome?: Json | null
          outcome_recorded_at?: string | null
          prompt_version?: string | null
          reasoning?: string | null
          scores?: Json | null
          your_video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "decisions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_your_video_id_fkey"
            columns: ["your_video_id"]
            isOneToOne: false
            referencedRelation: "your_videos"
            referencedColumns: ["id"]
          },
        ]
      }
      digest_runs: {
        Row: {
          cluster_ids: Json
          error: string | null
          html: string | null
          id: string
          recipient: string | null
          sent_at: string
          status: string
          week_start: string
        }
        Insert: {
          cluster_ids?: Json
          error?: string | null
          html?: string | null
          id?: string
          recipient?: string | null
          sent_at?: string
          status: string
          week_start: string
        }
        Update: {
          cluster_ids?: Json
          error?: string | null
          html?: string | null
          id?: string
          recipient?: string | null
          sent_at?: string
          status?: string
          week_start?: string
        }
        Relationships: []
      }
      ingest_blocklist: {
        Row: {
          added_at: string
          added_by: string
          id: string
          identifier: string
          identifier_type: string
          reason: string | null
          source_platform: string
        }
        Insert: {
          added_at?: string
          added_by?: string
          id?: string
          identifier: string
          identifier_type: string
          reason?: string | null
          source_platform: string
        }
        Update: {
          added_at?: string
          added_by?: string
          id?: string
          identifier?: string
          identifier_type?: string
          reason?: string | null
          source_platform?: string
        }
        Relationships: []
      }
      ingest_skip_log: {
        Row: {
          id: string
          reasoning: string | null
          skipped_at: string
          source_platform: string
          source_url: string
          stage_1_score: number
        }
        Insert: {
          id?: string
          reasoning?: string | null
          skipped_at?: string
          source_platform: string
          source_url: string
          stage_1_score: number
        }
        Update: {
          id?: string
          reasoning?: string | null
          skipped_at?: string
          source_platform?: string
          source_url?: string
          stage_1_score?: number
        }
        Relationships: []
      }
      ingestion_runs: {
        Row: {
          context: Json
          error: string | null
          finished_at: string | null
          id: string
          items_ingested: number
          items_skipped: number
          job: string
          quota_units: number
          started_at: string
          status: string
        }
        Insert: {
          context?: Json
          error?: string | null
          finished_at?: string | null
          id?: string
          items_ingested?: number
          items_skipped?: number
          job: string
          quota_units?: number
          started_at?: string
          status: string
        }
        Update: {
          context?: Json
          error?: string | null
          finished_at?: string | null
          id?: string
          items_ingested?: number
          items_skipped?: number
          job?: string
          quota_units?: number
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      jobs: {
        Row: {
          channel_id: string | null
          created_at: string
          current_agent: string | null
          current_step: string | null
          error: string | null
          finished_at: string | null
          id: string
          kind: string
          metadata: Json
          progress_pct: number | null
          started_at: string | null
          status: string
          topic_queue_id: string | null
        }
        Insert: {
          channel_id?: string | null
          created_at?: string
          current_agent?: string | null
          current_step?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          kind: string
          metadata?: Json
          progress_pct?: number | null
          started_at?: string | null
          status?: string
          topic_queue_id?: string | null
        }
        Update: {
          channel_id?: string | null
          created_at?: string
          current_agent?: string | null
          current_step?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          kind?: string
          metadata?: Json
          progress_pct?: number | null
          started_at?: string | null
          status?: string
          topic_queue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_current_agent_fkey"
            columns: ["current_agent"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_topic_queue_id_fkey"
            columns: ["topic_queue_id"]
            isOneToOne: false
            referencedRelation: "topic_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      kill_criteria_log: {
        Row: {
          criterion: string
          decision_text: string
          evaluated_at: string
          evidence: Json
          id: string
          verdict: string
        }
        Insert: {
          criterion: string
          decision_text: string
          evaluated_at?: string
          evidence?: Json
          id?: string
          verdict: string
        }
        Update: {
          criterion?: string
          decision_text?: string
          evaluated_at?: string
          evidence?: Json
          id?: string
          verdict?: string
        }
        Relationships: []
      }
      music_tracks: {
        Row: {
          added_at: string
          artist: string | null
          duration_seconds: number | null
          energy_level: number | null
          genre: string | null
          id: string
          license_notes: string | null
          local_path: string
          requires_attribution: boolean
          source: string
          title: string
        }
        Insert: {
          added_at?: string
          artist?: string | null
          duration_seconds?: number | null
          energy_level?: number | null
          genre?: string | null
          id?: string
          license_notes?: string | null
          local_path: string
          requires_attribution?: boolean
          source?: string
          title: string
        }
        Update: {
          added_at?: string
          artist?: string | null
          duration_seconds?: number | null
          energy_level?: number | null
          genre?: string | null
          id?: string
          license_notes?: string | null
          local_path?: string
          requires_attribution?: boolean
          source?: string
          title?: string
        }
        Relationships: []
      }
      niche_actions: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          id: string
          niche_cluster_id: string
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          id?: string
          niche_cluster_id: string
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          id?: string
          niche_cluster_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "niche_actions_niche_cluster_id_fkey"
            columns: ["niche_cluster_id"]
            isOneToOne: false
            referencedRelation: "niche_clusters"
            referencedColumns: ["id"]
          },
        ]
      }
      niche_clusters: {
        Row: {
          audience_signal: string | null
          avg_velocity_24h: number | null
          avg_views: number | null
          canonical_topic: string
          channel_count: number
          created_at: string
          digest_rank: number | null
          discovery_state: string | null
          example_video_ids: Json
          explainability_top_signals: Json
          first_mover_score: number | null
          first_seen_at: string | null
          format_label: string
          id: string
          niche_score: number | null
          outlier_density: number | null
          production_fit: string | null
          proven_score: number | null
          week_start: string
        }
        Insert: {
          audience_signal?: string | null
          avg_velocity_24h?: number | null
          avg_views?: number | null
          canonical_topic: string
          channel_count?: number
          created_at?: string
          digest_rank?: number | null
          discovery_state?: string | null
          example_video_ids?: Json
          explainability_top_signals?: Json
          first_mover_score?: number | null
          first_seen_at?: string | null
          format_label: string
          id?: string
          niche_score?: number | null
          outlier_density?: number | null
          production_fit?: string | null
          proven_score?: number | null
          week_start: string
        }
        Update: {
          audience_signal?: string | null
          avg_velocity_24h?: number | null
          avg_views?: number | null
          canonical_topic?: string
          channel_count?: number
          created_at?: string
          digest_rank?: number | null
          discovery_state?: string | null
          example_video_ids?: Json
          explainability_top_signals?: Json
          first_mover_score?: number | null
          first_seen_at?: string | null
          format_label?: string
          id?: string
          niche_score?: number | null
          outlier_density?: number | null
          production_fit?: string | null
          proven_score?: number | null
          week_start?: string
        }
        Relationships: []
      }
      niche_predictions: {
        Row: {
          accuracy_verdict: string | null
          actual_video_id: string | null
          actual_views_7d: number | null
          closed_at: string | null
          id: string
          niche_cluster_id: string
          predicted_at: string
          predicted_views_7d_lower: number
          predicted_views_7d_upper: number
        }
        Insert: {
          accuracy_verdict?: string | null
          actual_video_id?: string | null
          actual_views_7d?: number | null
          closed_at?: string | null
          id?: string
          niche_cluster_id: string
          predicted_at?: string
          predicted_views_7d_lower: number
          predicted_views_7d_upper: number
        }
        Update: {
          accuracy_verdict?: string | null
          actual_video_id?: string | null
          actual_views_7d?: number | null
          closed_at?: string | null
          id?: string
          niche_cluster_id?: string
          predicted_at?: string
          predicted_views_7d_lower?: number
          predicted_views_7d_upper?: number
        }
        Relationships: [
          {
            foreignKeyName: "niche_predictions_actual_video_id_fkey"
            columns: ["actual_video_id"]
            isOneToOne: false
            referencedRelation: "your_videos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "niche_predictions_niche_cluster_id_fkey"
            columns: ["niche_cluster_id"]
            isOneToOne: false
            referencedRelation: "niche_clusters"
            referencedColumns: ["id"]
          },
        ]
      }
      niches: {
        Row: {
          created_at: string
          description: string | null
          display_name: string
          id: string
          is_active: boolean
          slug: string
          subreddits: string[]
          tiktok_hashtags: string[]
          updated_at: string
          youtube_search_terms: string[]
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_name: string
          id?: string
          is_active?: boolean
          slug: string
          subreddits?: string[]
          tiktok_hashtags?: string[]
          updated_at?: string
          youtube_search_terms?: string[]
        }
        Update: {
          created_at?: string
          description?: string | null
          display_name?: string
          id?: string
          is_active?: boolean
          slug?: string
          subreddits?: string[]
          tiktok_hashtags?: string[]
          updated_at?: string
          youtube_search_terms?: string[]
        }
        Relationships: []
      }
      operator_alerts: {
        Row: {
          acknowledged_at: string | null
          category: string
          channel_id: string | null
          context: Json | null
          created_at: string
          id: string
          message: string
          resolved_at: string | null
          severity: string
          status: string
          suggested_actions: Json | null
        }
        Insert: {
          acknowledged_at?: string | null
          category: string
          channel_id?: string | null
          context?: Json | null
          created_at?: string
          id?: string
          message: string
          resolved_at?: string | null
          severity?: string
          status?: string
          suggested_actions?: Json | null
        }
        Update: {
          acknowledged_at?: string | null
          category?: string
          channel_id?: string | null
          context?: Json | null
          created_at?: string
          id?: string
          message?: string
          resolved_at?: string | null
          severity?: string
          status?: string
          suggested_actions?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "operator_alerts_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      pattern_performance: {
        Row: {
          avg_ctr_pct: number | null
          avg_retention_pct: number | null
          avg_views: number | null
          channel_id: string
          computed_at: string
          id: string
          pattern_id: string
          videos_using_pattern: number
        }
        Insert: {
          avg_ctr_pct?: number | null
          avg_retention_pct?: number | null
          avg_views?: number | null
          channel_id: string
          computed_at?: string
          id?: string
          pattern_id: string
          videos_using_pattern?: number
        }
        Update: {
          avg_ctr_pct?: number | null
          avg_retention_pct?: number | null
          avg_views?: number | null
          channel_id?: string
          computed_at?: string
          id?: string
          pattern_id?: string
          videos_using_pattern?: number
        }
        Relationships: [
          {
            foreignKeyName: "pattern_performance_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pattern_performance_pattern_id_fkey"
            columns: ["pattern_id"]
            isOneToOne: false
            referencedRelation: "patterns"
            referencedColumns: ["id"]
          },
        ]
      }
      patterns: {
        Row: {
          example_observation_ids: string[]
          first_seen_at: string
          id: string
          kind: string
          last_seen_at: string
          niche_id: string | null
          total_count: number
          value: Json
          win_count: number
          win_rate_pct: number | null
        }
        Insert: {
          example_observation_ids?: string[]
          first_seen_at?: string
          id?: string
          kind: string
          last_seen_at?: string
          niche_id?: string | null
          total_count?: number
          value: Json
          win_count?: number
          win_rate_pct?: number | null
        }
        Update: {
          example_observation_ids?: string[]
          first_seen_at?: string
          id?: string
          kind?: string
          last_seen_at?: string
          niche_id?: string | null
          total_count?: number
          value?: Json
          win_count?: number
          win_rate_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "patterns_niche_id_fkey"
            columns: ["niche_id"]
            isOneToOne: false
            referencedRelation: "niches"
            referencedColumns: ["id"]
          },
        ]
      }
      render_jobs: {
        Row: {
          attempts: number
          claimed_at: string | null
          clip_library_id: string | null
          compilation_draft_id: string | null
          created_at: string
          finished_at: string | null
          id: string
          job_type: string
          last_error: string | null
          payload: Json
          sandbox_invocation_id: string | null
          started_at: string | null
          status: string
          your_video_id: string | null
        }
        Insert: {
          attempts?: number
          claimed_at?: string | null
          clip_library_id?: string | null
          compilation_draft_id?: string | null
          created_at?: string
          finished_at?: string | null
          id?: string
          job_type: string
          last_error?: string | null
          payload: Json
          sandbox_invocation_id?: string | null
          started_at?: string | null
          status?: string
          your_video_id?: string | null
        }
        Update: {
          attempts?: number
          claimed_at?: string | null
          clip_library_id?: string | null
          compilation_draft_id?: string | null
          created_at?: string
          finished_at?: string | null
          id?: string
          job_type?: string
          last_error?: string | null
          payload?: Json
          sandbox_invocation_id?: string | null
          started_at?: string | null
          status?: string
          your_video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "render_jobs_clip_library_id_fkey"
            columns: ["clip_library_id"]
            isOneToOne: false
            referencedRelation: "clip_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "render_jobs_compilation_draft_id_fkey"
            columns: ["compilation_draft_id"]
            isOneToOne: false
            referencedRelation: "compilation_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "render_jobs_your_video_id_fkey"
            columns: ["your_video_id"]
            isOneToOne: false
            referencedRelation: "your_videos"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_recommendations: {
        Row: {
          analyst_run_id: string | null
          applied_at: string | null
          channel_id: string
          confidence: string
          created_at: string
          dismissed_at: string | null
          evidence: Json
          id: string
          recommended_format_mix: Json | null
          recommended_posting_schedule: Json | null
          status: string
        }
        Insert: {
          analyst_run_id?: string | null
          applied_at?: string | null
          channel_id: string
          confidence: string
          created_at?: string
          dismissed_at?: string | null
          evidence: Json
          id?: string
          recommended_format_mix?: Json | null
          recommended_posting_schedule?: Json | null
          status?: string
        }
        Update: {
          analyst_run_id?: string | null
          applied_at?: string | null
          channel_id?: string
          confidence?: string
          created_at?: string
          dismissed_at?: string | null
          evidence?: Json
          id?: string
          recommended_format_mix?: Json | null
          recommended_posting_schedule?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_recommendations_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      shorts_classifications: {
        Row: {
          audience_signal: string | null
          classified_at: string
          confidence: number
          format_label: string
          model: string
          prompt_version: string
          topic_label: string
          transcript_used: boolean
          video_id: string
          vision_used: boolean
        }
        Insert: {
          audience_signal?: string | null
          classified_at?: string
          confidence: number
          format_label: string
          model: string
          prompt_version: string
          topic_label: string
          transcript_used?: boolean
          video_id: string
          vision_used?: boolean
        }
        Update: {
          audience_signal?: string | null
          classified_at?: string
          confidence?: number
          format_label?: string
          model?: string
          prompt_version?: string
          topic_label?: string
          transcript_used?: boolean
          video_id?: string
          vision_used?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "shorts_classifications_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: true
            referencedRelation: "shorts_observations"
            referencedColumns: ["video_id"]
          },
        ]
      }
      shorts_observations: {
        Row: {
          channel_id: string | null
          channel_subscriber_count: number | null
          comment_count: number | null
          description: string | null
          duration_seconds: number | null
          last_refreshed_at: string
          like_count: number | null
          observed_at: string
          published_at: string | null
          source: string
          tags: Json | null
          thumbnail_url: string | null
          title: string
          video_id: string
          view_count: number | null
        }
        Insert: {
          channel_id?: string | null
          channel_subscriber_count?: number | null
          comment_count?: number | null
          description?: string | null
          duration_seconds?: number | null
          last_refreshed_at?: string
          like_count?: number | null
          observed_at?: string
          published_at?: string | null
          source: string
          tags?: Json | null
          thumbnail_url?: string | null
          title: string
          video_id: string
          view_count?: number | null
        }
        Update: {
          channel_id?: string | null
          channel_subscriber_count?: number | null
          comment_count?: number | null
          description?: string | null
          duration_seconds?: number | null
          last_refreshed_at?: string
          like_count?: number | null
          observed_at?: string
          published_at?: string | null
          source?: string
          tags?: Json | null
          thumbnail_url?: string | null
          title?: string
          video_id?: string
          view_count?: number | null
        }
        Relationships: []
      }
      topic_embeddings: {
        Row: {
          created_at: string
          embedding: Json
          model: string
          topic_label: string
        }
        Insert: {
          created_at?: string
          embedding: Json
          model: string
          topic_label: string
        }
        Update: {
          created_at?: string
          embedding?: Json
          model?: string
          topic_label?: string
        }
        Relationships: []
      }
      topic_queue: {
        Row: {
          created_at: string
          external_ref: string | null
          hookability_score: number | null
          id: string
          niche_id: string | null
          raw_payload: Json
          rejected_reason: string | null
          scored_at: string | null
          source: string
          state: string
          summary: string | null
          title: string
          updated_at: string
          used_for_video_id: string | null
        }
        Insert: {
          created_at?: string
          external_ref?: string | null
          hookability_score?: number | null
          id?: string
          niche_id?: string | null
          raw_payload: Json
          rejected_reason?: string | null
          scored_at?: string | null
          source: string
          state?: string
          summary?: string | null
          title: string
          updated_at?: string
          used_for_video_id?: string | null
        }
        Update: {
          created_at?: string
          external_ref?: string | null
          hookability_score?: number | null
          id?: string
          niche_id?: string | null
          raw_payload?: Json
          rejected_reason?: string | null
          scored_at?: string | null
          source?: string
          state?: string
          summary?: string | null
          title?: string
          updated_at?: string
          used_for_video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "topic_queue_niche_id_fkey"
            columns: ["niche_id"]
            isOneToOne: false
            referencedRelation: "niches"
            referencedColumns: ["id"]
          },
        ]
      }
      video_analytics: {
        Row: {
          avg_view_duration_seconds: number | null
          comments: number | null
          ctr_pct: number | null
          first_30s_retention: number | null
          first_60s_retention: number | null
          id: string
          impressions: number | null
          likes: number | null
          raw_payload: Json | null
          relative_retention_opening: number | null
          retention_curve_jsonb: Json | null
          shares: number | null
          snapshot_at: string
          subscribers_gained: number | null
          views: number | null
          watch_time_seconds: number | null
          your_video_id: string
        }
        Insert: {
          avg_view_duration_seconds?: number | null
          comments?: number | null
          ctr_pct?: number | null
          first_30s_retention?: number | null
          first_60s_retention?: number | null
          id?: string
          impressions?: number | null
          likes?: number | null
          raw_payload?: Json | null
          relative_retention_opening?: number | null
          retention_curve_jsonb?: Json | null
          shares?: number | null
          snapshot_at?: string
          subscribers_gained?: number | null
          views?: number | null
          watch_time_seconds?: number | null
          your_video_id: string
        }
        Update: {
          avg_view_duration_seconds?: number | null
          comments?: number | null
          ctr_pct?: number | null
          first_30s_retention?: number | null
          first_60s_retention?: number | null
          id?: string
          impressions?: number | null
          likes?: number | null
          raw_payload?: Json | null
          relative_retention_opening?: number | null
          retention_curve_jsonb?: Json | null
          shares?: number | null
          snapshot_at?: string
          subscribers_gained?: number | null
          views?: number | null
          watch_time_seconds?: number | null
          your_video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "your_videos_analytics_snapshots_video_id_fkey"
            columns: ["your_video_id"]
            isOneToOne: false
            referencedRelation: "your_videos"
            referencedColumns: ["id"]
          },
        ]
      }
      video_review_feedback: {
        Row: {
          action_taken: string
          id: string
          recorded_at: string
          suggestion_index: number
          video_review_id: string
        }
        Insert: {
          action_taken: string
          id?: string
          recorded_at?: string
          suggestion_index: number
          video_review_id: string
        }
        Update: {
          action_taken?: string
          id?: string
          recorded_at?: string
          suggestion_index?: number
          video_review_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_review_feedback_video_review_id_fkey"
            columns: ["video_review_id"]
            isOneToOne: false
            referencedRelation: "video_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      video_reviews: {
        Row: {
          audio_score: number | null
          audio_verdict: string | null
          description_seo_score: number | null
          description_seo_verdict: string | null
          hook_score: number | null
          hook_verdict: string | null
          id: string
          model: string
          overall_verdict: string
          pacing_score: number | null
          pacing_verdict: string | null
          prompt_version: string
          reviewed_at: string
          strengths: Json
          suggestions: Json
          thumbnail_score: number | null
          thumbnail_verdict: string | null
          title_score: number | null
          title_verdict: string | null
          visual_score: number | null
          visual_verdict: string | null
          your_video_id: string
        }
        Insert: {
          audio_score?: number | null
          audio_verdict?: string | null
          description_seo_score?: number | null
          description_seo_verdict?: string | null
          hook_score?: number | null
          hook_verdict?: string | null
          id?: string
          model: string
          overall_verdict: string
          pacing_score?: number | null
          pacing_verdict?: string | null
          prompt_version: string
          reviewed_at?: string
          strengths?: Json
          suggestions?: Json
          thumbnail_score?: number | null
          thumbnail_verdict?: string | null
          title_score?: number | null
          title_verdict?: string | null
          visual_score?: number | null
          visual_verdict?: string | null
          your_video_id: string
        }
        Update: {
          audio_score?: number | null
          audio_verdict?: string | null
          description_seo_score?: number | null
          description_seo_verdict?: string | null
          hook_score?: number | null
          hook_verdict?: string | null
          id?: string
          model?: string
          overall_verdict?: string
          pacing_score?: number | null
          pacing_verdict?: string | null
          prompt_version?: string
          reviewed_at?: string
          strengths?: Json
          suggestions?: Json
          thumbnail_score?: number | null
          thumbnail_verdict?: string | null
          title_score?: number | null
          title_verdict?: string | null
          visual_score?: number | null
          visual_verdict?: string | null
          your_video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_reviews_your_video_id_fkey"
            columns: ["your_video_id"]
            isOneToOne: false
            referencedRelation: "your_videos"
            referencedColumns: ["id"]
          },
        ]
      }
      video_velocity_snapshots: {
        Row: {
          comment_count: number
          like_count: number
          snapshot_at: string
          video_id: string
          view_count: number
        }
        Insert: {
          comment_count?: number
          like_count?: number
          snapshot_at?: string
          video_id: string
          view_count: number
        }
        Update: {
          comment_count?: number
          like_count?: number
          snapshot_at?: string
          video_id?: string
          view_count?: number
        }
        Relationships: []
      }
      vidiq_appearances: {
        Row: {
          canonical_topic: string
          created_at: string
          first_surfaced_by_1of10_at: string | null
          first_surfaced_by_exploding_topics_at: string | null
          first_surfaced_by_shorts_os_at: string
          first_surfaced_by_vidiq_at: string | null
          format_label: string
          id: string
          notes: string | null
        }
        Insert: {
          canonical_topic: string
          created_at?: string
          first_surfaced_by_1of10_at?: string | null
          first_surfaced_by_exploding_topics_at?: string | null
          first_surfaced_by_shorts_os_at: string
          first_surfaced_by_vidiq_at?: string | null
          format_label: string
          id?: string
          notes?: string | null
        }
        Update: {
          canonical_topic?: string
          created_at?: string
          first_surfaced_by_1of10_at?: string | null
          first_surfaced_by_exploding_topics_at?: string | null
          first_surfaced_by_shorts_os_at?: string
          first_surfaced_by_vidiq_at?: string | null
          format_label?: string
          id?: string
          notes?: string | null
        }
        Relationships: []
      }
      viral_observations: {
        Row: {
          channel_id: string | null
          channel_name: string | null
          comments: number | null
          duration_seconds: number | null
          external_id: string
          hook_seconds_estimate: number | null
          hook_text: string | null
          id: string
          likes: number | null
          niche_id: string | null
          observed_at: string
          raw_payload: Json
          source: string
          title: string | null
          url: string
          views: number | null
          views_at_observation: number | null
        }
        Insert: {
          channel_id?: string | null
          channel_name?: string | null
          comments?: number | null
          duration_seconds?: number | null
          external_id: string
          hook_seconds_estimate?: number | null
          hook_text?: string | null
          id?: string
          likes?: number | null
          niche_id?: string | null
          observed_at?: string
          raw_payload: Json
          source: string
          title?: string | null
          url: string
          views?: number | null
          views_at_observation?: number | null
        }
        Update: {
          channel_id?: string | null
          channel_name?: string | null
          comments?: number | null
          duration_seconds?: number | null
          external_id?: string
          hook_seconds_estimate?: number | null
          hook_text?: string | null
          id?: string
          likes?: number | null
          niche_id?: string | null
          observed_at?: string
          raw_payload?: Json
          source?: string
          title?: string | null
          url?: string
          views?: number | null
          views_at_observation?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "viral_observations_niche_id_fkey"
            columns: ["niche_id"]
            isOneToOne: false
            referencedRelation: "niches"
            referencedColumns: ["id"]
          },
        ]
      }
      watched_channels: {
        Row: {
          added_at: string
          channel_handle: string | null
          channel_id: string
          channel_thumbnail_url: string | null
          channel_title: string | null
          current_subscriber_count: number
          discovery_source: string
          is_active: boolean
          last_snapshotted_at: string | null
          outlier_rate_60d: number | null
          subscriber_count_at_add: number
          subscriber_growth_30d: number | null
          subscriber_growth_90d: number | null
          upload_cadence_per_week: number | null
        }
        Insert: {
          added_at?: string
          channel_handle?: string | null
          channel_id: string
          channel_thumbnail_url?: string | null
          channel_title?: string | null
          current_subscriber_count: number
          discovery_source: string
          is_active?: boolean
          last_snapshotted_at?: string | null
          outlier_rate_60d?: number | null
          subscriber_count_at_add: number
          subscriber_growth_30d?: number | null
          subscriber_growth_90d?: number | null
          upload_cadence_per_week?: number | null
        }
        Update: {
          added_at?: string
          channel_handle?: string | null
          channel_id?: string
          channel_thumbnail_url?: string | null
          channel_title?: string | null
          current_subscriber_count?: number
          discovery_source?: string
          is_active?: boolean
          last_snapshotted_at?: string | null
          outlier_rate_60d?: number | null
          subscriber_count_at_add?: number
          subscriber_growth_30d?: number | null
          subscriber_growth_90d?: number | null
          upload_cadence_per_week?: number | null
        }
        Relationships: []
      }
      your_videos: {
        Row: {
          caption_props: Json | null
          channel_id: string
          chapter_markers: Json | null
          created_at: string
          description: string | null
          duration_seconds: number | null
          editor_session_id: string | null
          external_video_id: string | null
          format: string
          generator_edits: Json | null
          id: string
          longform_plan: Json | null
          orientation: string
          posted_at: string | null
          posted_dow_local: number | null
          posted_hour_local: number | null
          render_artifact_url: string | null
          review_id: string | null
          scheduled_for: string | null
          script: string | null
          script_brief: Json | null
          source_compilation_draft_id: string | null
          source_niche_cluster_id: string | null
          status: string
          style_preset_id: string | null
          target_duration_seconds: number | null
          title: string
          topic_queue_id: string | null
          updated_at: string
          url: string | null
          visual_treatment: string | null
          voice_id: string | null
          voice_provider: string | null
        }
        Insert: {
          caption_props?: Json | null
          channel_id: string
          chapter_markers?: Json | null
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          editor_session_id?: string | null
          external_video_id?: string | null
          format?: string
          generator_edits?: Json | null
          id?: string
          longform_plan?: Json | null
          orientation?: string
          posted_at?: string | null
          posted_dow_local?: number | null
          posted_hour_local?: number | null
          render_artifact_url?: string | null
          review_id?: string | null
          scheduled_for?: string | null
          script?: string | null
          script_brief?: Json | null
          source_compilation_draft_id?: string | null
          source_niche_cluster_id?: string | null
          status?: string
          style_preset_id?: string | null
          target_duration_seconds?: number | null
          title: string
          topic_queue_id?: string | null
          updated_at?: string
          url?: string | null
          visual_treatment?: string | null
          voice_id?: string | null
          voice_provider?: string | null
        }
        Update: {
          caption_props?: Json | null
          channel_id?: string
          chapter_markers?: Json | null
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          editor_session_id?: string | null
          external_video_id?: string | null
          format?: string
          generator_edits?: Json | null
          id?: string
          longform_plan?: Json | null
          orientation?: string
          posted_at?: string | null
          posted_dow_local?: number | null
          posted_hour_local?: number | null
          render_artifact_url?: string | null
          review_id?: string | null
          scheduled_for?: string | null
          script?: string | null
          script_brief?: Json | null
          source_compilation_draft_id?: string | null
          source_niche_cluster_id?: string | null
          status?: string
          style_preset_id?: string | null
          target_duration_seconds?: number | null
          title?: string
          topic_queue_id?: string | null
          updated_at?: string
          url?: string | null
          visual_treatment?: string | null
          voice_id?: string | null
          voice_provider?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "your_videos_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "your_videos_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "video_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "your_videos_source_compilation_draft_id_fkey"
            columns: ["source_compilation_draft_id"]
            isOneToOne: false
            referencedRelation: "compilation_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "your_videos_source_niche_cluster_id_fkey"
            columns: ["source_niche_cluster_id"]
            isOneToOne: false
            referencedRelation: "niche_clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "your_videos_topic_queue_id_fkey"
            columns: ["topic_queue_id"]
            isOneToOne: false
            referencedRelation: "topic_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      youtube_oauth_state: {
        Row: {
          channel_id: string
          created_at: string
          state: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          state: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "youtube_oauth_state_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      longform_decision_outcomes: {
        Row: {
          agent_id: string | null
          analytics_snapshot_at: string | null
          avg_view_duration_seconds: number | null
          chosen: Json | null
          ctr_pct: number | null
          decision_id: string | null
          decision_type: string | null
          duration_seconds: number | null
          first_30s_retention: number | null
          first_60s_retention: number | null
          posted_at: string | null
          relative_retention_opening: number | null
          retention_curve_jsonb: Json | null
          status: string | null
          title: string | null
          views: number | null
          watch_time_seconds: number | null
          your_video_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "decisions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_your_video_id_fkey"
            columns: ["your_video_id"]
            isOneToOne: false
            referencedRelation: "your_videos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      claim_due_scheduled_uploads: {
        Args: { p_limit: number; p_now: string }
        Returns: {
          channel_id: string
          id: string
        }[]
      }
      claim_render_jobs: {
        Args: { p_limit: number }
        Returns: {
          attempts: number
          claimed_at: string | null
          clip_library_id: string | null
          compilation_draft_id: string | null
          created_at: string
          finished_at: string | null
          id: string
          job_type: string
          last_error: string | null
          payload: Json
          sandbox_invocation_id: string | null
          started_at: string | null
          status: string
          your_video_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "render_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      reset_stuck_render_jobs: {
        Args: never
        Returns: {
          attempts: number
          claimed_at: string | null
          clip_library_id: string | null
          compilation_draft_id: string | null
          created_at: string
          finished_at: string | null
          id: string
          job_type: string
          last_error: string | null
          payload: Json
          sandbox_invocation_id: string | null
          started_at: string | null
          status: string
          your_video_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "render_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const

