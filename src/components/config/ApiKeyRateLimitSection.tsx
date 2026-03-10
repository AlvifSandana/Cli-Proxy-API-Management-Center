import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { ConfigSection } from '@/components/config/ConfigSection';
import { apiKeyRateLimitApi } from '@/services/api';
import { useNotificationStore } from '@/stores';
import { formatDateTime, formatNumber } from '@/utils/format';
import type { ApiKeyRateLimitConfig, ApiKeyRateLimitStatus } from '@/types';
import styles from './ApiKeyRateLimitSection.module.scss';

interface ApiKeyRateLimitSectionProps {
  disabled?: boolean;
}

type DraftState = {
  enabled: boolean;
  requests: string;
  windowSeconds: string;
};

const createDraftState = (config: ApiKeyRateLimitConfig): DraftState => ({
  enabled: config.enabled,
  requests: String(config.requests),
  windowSeconds: String(config['window-seconds']),
});

const parseNonNegativeInteger = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return null;
  const numeric = Number(trimmed);
  return Number.isSafeInteger(numeric) ? numeric : null;
};

export function ApiKeyRateLimitSection({ disabled = false }: ApiKeyRateLimitSectionProps) {
  const { t, i18n } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const showConfirmation = useNotificationStore((state) => state.showConfirmation);
  const [config, setConfig] = useState<ApiKeyRateLimitConfig | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [status, setStatus] = useState<ApiKeyRateLimitStatus | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showEntries, setShowEntries] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

  const loadConfig = useCallback(async () => {
    setLoadingConfig(true);
    try {
      const nextConfig = await apiKeyRateLimitApi.getConfig();
      setConfig(nextConfig);
      setDraft(createDraftState(nextConfig));
    } catch {
      showNotification(t('config_management.api_key_rate_limit.load_failed'), 'error');
    } finally {
      setLoadingConfig(false);
    }
  }, [showNotification, t]);

  const loadStatus = useCallback(
    async (includeEntries: boolean) => {
      setLoadingStatus(true);
      try {
        const nextStatus = await apiKeyRateLimitApi.getStatus(includeEntries);
        setStatus(nextStatus);
        setLastRefreshedAt(new Date());
      } catch {
        showNotification(t('config_management.api_key_rate_limit.status_failed'), 'error');
      } finally {
        setLoadingStatus(false);
      }
    },
    [showNotification, t]
  );

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    void loadStatus(showEntries);
  }, [loadStatus, showEntries]);

  const errors = useMemo(() => {
    if (!draft) {
      return { requests: '', windowSeconds: '' };
    }

    const requests = parseNonNegativeInteger(draft.requests);
    const windowSeconds = parseNonNegativeInteger(draft.windowSeconds);

    return {
      requests:
        requests === null ? t('config_management.api_key_rate_limit.validation.requests') : '',
      windowSeconds:
        windowSeconds === null
          ? t('config_management.api_key_rate_limit.validation.window_seconds')
          : '',
    };
  }, [draft, t]);

  const parsedDraft = useMemo(() => {
    if (!draft) {
      return null;
    }

    const requests = parseNonNegativeInteger(draft.requests);
    const windowSeconds = parseNonNegativeInteger(draft.windowSeconds);
    if (requests === null || windowSeconds === null) {
      return null;
    }

    return {
      enabled: draft.enabled,
      requests,
      'window-seconds': windowSeconds,
    } satisfies ApiKeyRateLimitConfig;
  }, [draft]);

  const isDirty =
    Boolean(config && parsedDraft) && JSON.stringify(config) !== JSON.stringify(parsedDraft);
  const hasErrors = Boolean(errors.requests || errors.windowSeconds);
  const showRuntimeDisabledWarning = Boolean(
    draft?.enabled &&
    ((parseNonNegativeInteger(draft.requests) ?? 0) === 0 ||
      (parseNonNegativeInteger(draft.windowSeconds) ?? 0) === 0)
  );

  const handleReload = () => {
    if (!isDirty) {
      void loadConfig();
      void loadStatus(showEntries);
      return;
    }

    showConfirmation({
      title: t('common.unsaved_changes_title'),
      message: t('config_management.api_key_rate_limit.reload_confirm'),
      confirmText: t('config_management.api_key_rate_limit.reload'),
      cancelText: t('common.cancel'),
      variant: 'danger',
      onConfirm: async () => {
        await loadConfig();
        await loadStatus(showEntries);
      },
    });
  };

  const handleSave = async () => {
    if (!parsedDraft || hasErrors) {
      showNotification(
        t('config_management.api_key_rate_limit.validation.fix_before_save'),
        'error'
      );
      return;
    }

    setSaving(true);
    try {
      const saved = await apiKeyRateLimitApi.updateConfig(parsedDraft);
      setConfig(saved);
      setDraft(createDraftState(saved));
      await loadStatus(showEntries);
      showNotification(t('config_management.api_key_rate_limit.save_success'), 'success');
    } catch {
      showNotification(t('config_management.api_key_rate_limit.save_failed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const entries = status?.entries ? Object.entries(status.entries) : [];

  return (
    <ConfigSection
      title={t('config_management.api_key_rate_limit.title')}
      description={t('config_management.api_key_rate_limit.description')}
      className={styles.section}
    >
      {loadingConfig || !draft ? (
        <div className={styles.infoBox}>{t('config_management.api_key_rate_limit.loading')}</div>
      ) : (
        <>
          <div className={styles.toggleRow}>
            <ToggleSwitch
              checked={draft.enabled}
              onChange={(enabled) =>
                setDraft((current) => (current ? { ...current, enabled } : current))
              }
              disabled={disabled || saving || loadingConfig}
              ariaLabel={t('config_management.api_key_rate_limit.enabled')}
              label={t('config_management.api_key_rate_limit.enabled')}
            />
          </div>

          <div className={styles.formGrid}>
            <Input
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              label={t('config_management.api_key_rate_limit.requests')}
              hint={t('config_management.api_key_rate_limit.requests_hint')}
              value={draft.requests}
              onChange={(event) =>
                setDraft((current) =>
                  current ? { ...current, requests: event.target.value } : current
                )
              }
              disabled={disabled || saving || loadingConfig}
              error={errors.requests}
            />
            <Input
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              label={t('config_management.api_key_rate_limit.window_seconds')}
              hint={t('config_management.api_key_rate_limit.window_seconds_hint')}
              value={draft.windowSeconds}
              onChange={(event) =>
                setDraft((current) =>
                  current ? { ...current, windowSeconds: event.target.value } : current
                )
              }
              disabled={disabled || saving || loadingConfig}
              error={errors.windowSeconds}
            />
          </div>

          {showRuntimeDisabledWarning && (
            <div className={styles.warningBox}>
              {t('config_management.api_key_rate_limit.warning_zero_disables')}
            </div>
          )}

          <div className={styles.infoBox}>
            {t('config_management.api_key_rate_limit.ephemeral_hint')}
          </div>

          <div className={styles.actions}>
            <Button
              variant="secondary"
              onClick={handleReload}
              disabled={saving || loadingConfig || loadingStatus}
            >
              {t('config_management.api_key_rate_limit.reload')}
            </Button>
            <Button
              onClick={handleSave}
              loading={saving}
              disabled={disabled || loadingConfig || !isDirty || hasErrors}
            >
              {t('config_management.api_key_rate_limit.save')}
            </Button>
          </div>
        </>
      )}

      <div className={styles.statusCard}>
        <div className={styles.statusHeader}>
          <div>
            <div className={styles.statusTitle}>
              {t('config_management.api_key_rate_limit.status_title')}
            </div>
            <div className={styles.metaText}>
              {lastRefreshedAt
                ? t('config_management.api_key_rate_limit.last_refreshed', {
                    value: formatDateTime(lastRefreshedAt, i18n.language),
                  })
                : t('config_management.api_key_rate_limit.status_loading')}
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void loadStatus(showEntries)}
            disabled={disabled || loadingStatus || saving}
          >
            {t('config_management.api_key_rate_limit.refresh_status')}
          </Button>
        </div>

        {loadingStatus || !status ? (
          <div className={styles.infoBox}>
            {t('config_management.api_key_rate_limit.status_loading')}
          </div>
        ) : (
          <div className={styles.statusGrid}>
            <div className={styles.statusItem}>
              <span className={styles.statusLabel}>
                {t('config_management.api_key_rate_limit.status_enabled')}
              </span>
              <span className={styles.statusValue}>
                {status.enabled ? t('common.yes') : t('common.no')}
              </span>
            </div>
            <div className={styles.statusItem}>
              <span className={styles.statusLabel}>
                {t('config_management.api_key_rate_limit.status_limit')}
              </span>
              <span className={styles.statusValue}>
                {formatNumber(status.requests, i18n.language)} /{' '}
                {t('config_management.api_key_rate_limit.seconds_compact', {
                  value: formatNumber(status.window_seconds, i18n.language),
                })}
              </span>
            </div>
            <div className={styles.statusItem}>
              <span className={styles.statusLabel}>
                {t('config_management.api_key_rate_limit.status_checks')}
              </span>
              <span className={styles.statusValue}>
                {formatNumber(status.checks, i18n.language)}
              </span>
            </div>
            <div className={styles.statusItem}>
              <span className={styles.statusLabel}>
                {t('config_management.api_key_rate_limit.status_allowed')}
              </span>
              <span className={styles.statusValue}>
                {formatNumber(status.allowed, i18n.language)}
              </span>
            </div>
            <div className={styles.statusItem}>
              <span className={styles.statusLabel}>
                {t('config_management.api_key_rate_limit.status_denied')}
              </span>
              <span className={styles.statusValue}>
                {formatNumber(status.denied, i18n.language)}
              </span>
            </div>
            <div className={styles.statusItem}>
              <span className={styles.statusLabel}>
                {t('config_management.api_key_rate_limit.status_active_keys')}
              </span>
              <span className={styles.statusValue}>
                {formatNumber(status.active_keys, i18n.language)}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className={styles.entriesCard}>
        <div className={styles.entriesHeader}>
          <div>
            <div className={styles.statusTitle}>
              {t('config_management.api_key_rate_limit.entries_title')}
            </div>
            <div className={styles.metaText}>
              {t('config_management.api_key_rate_limit.entries_hint')}
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowEntries((current) => !current)}
            disabled={disabled || saving || loadingStatus}
          >
            {showEntries
              ? t('config_management.api_key_rate_limit.hide_entries')
              : t('config_management.api_key_rate_limit.show_entries')}
          </Button>
        </div>

        {!showEntries ? (
          <div className={styles.infoBox}>
            {t('config_management.api_key_rate_limit.entries_collapsed')}
          </div>
        ) : loadingStatus ? (
          <div className={styles.infoBox}>
            {t('config_management.api_key_rate_limit.status_loading')}
          </div>
        ) : !entries.length ? (
          <div className={styles.infoBox}>
            {t('config_management.api_key_rate_limit.no_entries')}
          </div>
        ) : (
          <div className={styles.entriesList}>
            {entries.map(([hash, entry]) => (
              <div key={hash} className={styles.entryItem}>
                <div className={styles.entryHash}>{hash}</div>
                <div className={styles.entryGrid}>
                  <div>
                    <span className={styles.entryLabel}>
                      {t('config_management.api_key_rate_limit.entry_count')}
                    </span>
                    <div className={styles.entryValue}>
                      {formatNumber(entry.count, i18n.language)}
                    </div>
                  </div>
                  <div>
                    <span className={styles.entryLabel}>
                      {t('config_management.api_key_rate_limit.entry_window_start')}
                    </span>
                    <div className={styles.entryValue}>
                      {entry.window_start ? formatDateTime(entry.window_start, i18n.language) : '-'}
                    </div>
                  </div>
                  <div>
                    <span className={styles.entryLabel}>
                      {t('config_management.api_key_rate_limit.entry_retry_after')}
                    </span>
                    <div className={styles.entryValue}>
                      {t('config_management.api_key_rate_limit.seconds_compact', {
                        value: formatNumber(entry.retry_after_seconds, i18n.language),
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ConfigSection>
  );
}
