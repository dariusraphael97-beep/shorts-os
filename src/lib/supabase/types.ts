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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
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
      channels: {
        Row: {
          created_at: string
          default_tts_provider: string | null
          default_voice_id: string | null
          display_name: string
          external_channel_id: string | null
          id: string
          is_active: boolean
          max_clip_ingest_per_day: number
          max_uploads_per_day: number
          niche_id: string | null
          oauth_refresh_token_encrypted: string | null
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
          default_tts_provider?: string | null
          default_voice_id?: string | null
          display_name: string
          external_channel_id?: string | null
          id?: string
          is_active?: boolean
          max_clip_ingest_per_day?: number
          max_uploads_per_day?: number
          niche_id?: string | null
          oauth_refresh_token_encrypted?: string | null
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
          default_tts_provider?: string | null
          default_voice_id?: string | null
          display_name?: string
          external_channel_id?: string | null
          id?: string
          is_active?: boolean
          max_clip_ingest_per_day?: number
          max_uploads_per_day?: number
          niche_id?: string | null
          oauth_refresh_token_encrypted?: string | null
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
        }
        Relationships: [
          {
            foreignKeyName: "decisions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
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
          id: string
          impressions: number | null
          likes: number | null
          raw_payload: Json | null
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
          id?: string
          impressions?: number | null
          likes?: number | null
          raw_payload?: Json | null
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
          id?: string
          impressions?: number | null
          likes?: number | null
          raw_payload?: Json | null
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
      your_videos: {
        Row: {
          channel_id: string
          created_at: string
          description: string | null
          duration_seconds: number | null
          external_video_id: string | null
          id: string
          posted_at: string | null
          posted_dow_local: number | null
          posted_hour_local: number | null
          render_artifact_url: string | null
          scheduled_for: string | null
          script: string
          status: string
          title: string
          topic_queue_id: string | null
          updated_at: string
          url: string | null
          visual_treatment: string | null
          voice_id: string | null
          voice_provider: string | null
        }
        Insert: {
          channel_id: string
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          external_video_id?: string | null
          id?: string
          posted_at?: string | null
          posted_dow_local?: number | null
          posted_hour_local?: number | null
          render_artifact_url?: string | null
          scheduled_for?: string | null
          script: string
          status?: string
          title: string
          topic_queue_id?: string | null
          updated_at?: string
          url?: string | null
          visual_treatment?: string | null
          voice_id?: string | null
          voice_provider?: string | null
        }
        Update: {
          channel_id?: string
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          external_video_id?: string | null
          id?: string
          posted_at?: string | null
          posted_dow_local?: number | null
          posted_hour_local?: number | null
          render_artifact_url?: string | null
          scheduled_for?: string | null
          script?: string
          status?: string
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
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
