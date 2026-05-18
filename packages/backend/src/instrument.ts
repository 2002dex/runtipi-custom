import * as Sentry from '@sentry/nestjs';
import { cleanseErrorData } from './common/helpers/error-helpers';

const { NODE_ENV, TIPI_VERSION } = process.env;

Sentry.init({
  release: TIPI_VERSION,
  enabled: false,
  tracesSampleRate: 1.0,
  dsn: 'https://6c41590b241cb84886736e9ac1402bd2@o4509948475408384.ingest.us.sentry.io/4510011977498624',
  environment: NODE_ENV,
  beforeSend: cleanseErrorData,
  includeLocalVariables: true,
  integrations: [Sentry.extraErrorDataIntegration(), Sentry.nestIntegration()],
  initialScope: {
    tags: { version: TIPI_VERSION },
  },
});
