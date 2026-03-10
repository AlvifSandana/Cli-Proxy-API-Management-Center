export interface ApiKeyRateLimitConfig {
  enabled: boolean;
  requests: number;
  'window-seconds': number;
}

export interface ApiKeyRateLimitConfigResponse {
  'api-key-rate-limit': ApiKeyRateLimitConfig;
}

export interface ApiKeyRateLimitStatusEntry {
  count: number;
  window_start: string;
  retry_after_seconds: number;
}

export interface ApiKeyRateLimitStatus {
  enabled: boolean;
  requests: number;
  window_seconds: number;
  checks: number;
  allowed: number;
  denied: number;
  active_keys: number;
  entries?: Record<string, ApiKeyRateLimitStatusEntry>;
}

export interface ApiKeyRateLimitStatusResponse {
  'api-key-rate-limit': ApiKeyRateLimitStatus;
}
