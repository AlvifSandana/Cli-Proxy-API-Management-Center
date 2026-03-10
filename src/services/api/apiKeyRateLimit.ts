import type {
  ApiKeyRateLimitConfig,
  ApiKeyRateLimitConfigResponse,
  ApiKeyRateLimitStatus,
  ApiKeyRateLimitStatusEntry,
  ApiKeyRateLimitStatusResponse,
} from '@/types';
import { apiClient } from './client';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const HASH_KEY_PATTERN = /^(?:[a-f0-9]{32}|[a-f0-9]{40}|[a-f0-9]{64}|[a-f0-9]{96}|[a-f0-9]{128})$/i;

const toNonNegativeInteger = (value: unknown): number | null => {
  const normalized = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(normalized) && normalized >= 0 ? normalized : null;
};

const isStrictBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

const normalizeConfig = (value: unknown): ApiKeyRateLimitConfig | null => {
  const record = isRecord(value) ? value : null;
  if (!record) {
    return null;
  }

  const requests = toNonNegativeInteger(record.requests);
  const windowSeconds = toNonNegativeInteger(record['window-seconds']);

  if (!isStrictBoolean(record.enabled) || requests === null || windowSeconds === null) {
    return null;
  }

  return {
    enabled: record.enabled,
    requests,
    'window-seconds': windowSeconds,
  };
};

const normalizeStatusEntry = (value: unknown): ApiKeyRateLimitStatusEntry | null => {
  const record = isRecord(value) ? value : null;
  if (!record) {
    return null;
  }

  const windowStart = typeof record.window_start === 'string' ? record.window_start : '';
  const count = toNonNegativeInteger(record.count);
  const retryAfterSeconds = toNonNegativeInteger(record.retry_after_seconds);

  if (count === null || retryAfterSeconds === null) {
    return null;
  }

  return {
    count,
    window_start: windowStart,
    retry_after_seconds: retryAfterSeconds,
  };
};

const normalizeStatus = (value: unknown): ApiKeyRateLimitStatus | null => {
  const record = isRecord(value) ? value : null;
  if (!record) {
    return null;
  }

  const requests = toNonNegativeInteger(record.requests);
  const windowSeconds = toNonNegativeInteger(record.window_seconds);
  const checks = toNonNegativeInteger(record.checks);
  const allowed = toNonNegativeInteger(record.allowed);
  const denied = toNonNegativeInteger(record.denied);
  const activeKeys = toNonNegativeInteger(record.active_keys);

  if (
    !isStrictBoolean(record.enabled) ||
    requests === null ||
    windowSeconds === null ||
    checks === null ||
    allowed === null ||
    denied === null ||
    activeKeys === null
  ) {
    return null;
  }

  const entriesRecord = isRecord(record.entries) ? record.entries : null;
  const entries = entriesRecord
    ? Object.fromEntries(
        Object.entries(entriesRecord)
          .filter(([key]) => HASH_KEY_PATTERN.test(key))
          .map(([key, entry]) => [key, normalizeStatusEntry(entry)] as const)
          .filter(([, entry]) => Boolean(entry))
      )
    : undefined;

  return {
    enabled: record.enabled,
    requests,
    window_seconds: windowSeconds,
    checks,
    allowed,
    denied,
    active_keys: activeKeys,
    ...(entries && Object.keys(entries).length
      ? { entries: entries as Record<string, ApiKeyRateLimitStatusEntry> }
      : {}),
  };
};

const extractPayload = (data: unknown): unknown => {
  if (!isRecord(data)) {
    return null;
  }

  return data['api-key-rate-limit'] ?? data.value ?? data;
};

const parseConfigPayload = (data: unknown): ApiKeyRateLimitConfig => {
  const normalized = normalizeConfig(extractPayload(data));
  if (!normalized) {
    throw new Error('Invalid API key rate limit configuration response');
  }

  return normalized;
};

const parseStatusPayload = (data: unknown): ApiKeyRateLimitStatus => {
  const normalized = normalizeStatus(extractPayload(data));
  if (!normalized) {
    throw new Error('Invalid API key rate limit status response');
  }

  return normalized;
};

export const apiKeyRateLimitApi = {
  async getConfig(): Promise<ApiKeyRateLimitConfig> {
    const data = await apiClient.get<ApiKeyRateLimitConfigResponse | Record<string, unknown>>(
      '/api-key-rate-limit'
    );
    return parseConfigPayload(data);
  },

  async updateConfig(value: ApiKeyRateLimitConfig): Promise<ApiKeyRateLimitConfig> {
    const data = await apiClient.put<ApiKeyRateLimitConfigResponse | Record<string, unknown>>(
      '/api-key-rate-limit',
      {
        value,
      }
    );
    return parseConfigPayload(data);
  },

  async getStatus(includeEntries: boolean = false): Promise<ApiKeyRateLimitStatus> {
    const data = await apiClient.get<ApiKeyRateLimitStatusResponse | Record<string, unknown>>(
      '/api-key-rate-limit/status',
      {
        params: includeEntries ? { include_entries: true } : undefined,
      }
    );
    return parseStatusPayload(data);
  },
};
