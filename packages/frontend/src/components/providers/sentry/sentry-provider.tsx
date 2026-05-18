import { useUserContext } from '@/context/user-context';
import * as Sentry from '@sentry/react';
import { type PropsWithChildren, useEffect } from 'react';

export const SentryProvider = ({ children }: PropsWithChildren) => {
  const { allowErrorMonitoring, version } = useUserContext();

  useEffect(() => {
    if (allowErrorMonitoring) {
      console.info('Error monitoring enabled, version:', version.current);
      Sentry.init({
        release: version.current,
        environment: 'production',
        tracesSampleRate: 1.0,
        dsn: 'https://ec97a64bc44ff663fd731a2c994dbd0d@o4509948475408384.ingest.us.sentry.io/4510038834085888',
        integrations: [Sentry.browserTracingIntegration()],
        initialScope: {
          tags: { version: version.current },
        },
      });
    }
  }, [allowErrorMonitoring, version.current]);

  return children;
};
