import { SeverityNumber } from '@opentelemetry/api-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs';

const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

const exporter =
  key && host
    ? new OTLPLogExporter({
        url: `${host.replace(/\/$/, '')}/i/v1/logs`,
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        timeoutMillis: 2_000,
      })
    : undefined;

const loggerProvider = exporter
  ? new LoggerProvider({
      resource: resourceFromAttributes({ 'service.name': 'bairmair-web' }),
      processors: [new BatchLogRecordProcessor({ exporter })],
    })
  : undefined;

const posthogLogger = loggerProvider?.getLogger('posthog-exporter');

if (!loggerProvider && process.env.NODE_ENV !== 'production') {
  const missingVariable = key ? 'NEXT_PUBLIC_POSTHOG_HOST' : 'NEXT_PUBLIC_POSTHOG_KEY';
  console.warn(
    `${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`,
  );
}

export function register() {}

export function emitPostHogLog(
  body: string,
  attributes: Record<string, string | number | boolean>,
): void {
  posthogLogger?.emit({ body, severityNumber: SeverityNumber.INFO, attributes });
}

export async function flushPostHogLogs(): Promise<void> {
  await loggerProvider?.forceFlush().catch(() => {});
}
