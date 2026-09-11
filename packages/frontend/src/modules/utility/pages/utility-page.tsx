import { Button } from '@/components/ui/Button';
import { PasswordInput } from '@/components/ui/PasswordInput/PasswordInput';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs/tabs';
import { copyTextToClipboard } from '@/lib/helpers/text-helpers';
import { useAuthenticatedFetch } from '@/lib/hooks/use-authenticated-fetch';
import { IconBrandApple, IconBrandWindows, IconCopy, IconDownload, IconTerminal, IconTerminal2 } from '@tabler/icons-react';
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

interface RemoteAccessInfo {
  ultraviewer: {
    downloadUrl: string;
    subtitle: string;
  };
  ssh: {
    host: string;
    port: number;
    username: string;
    password: string;
    connectionHelp: {
      windows: string;
      linux: string;
      mac: string;
      putty: string;
    };
  };
}

const DEFAULT_INFO: RemoteAccessInfo = {
  ultraviewer: {
    downloadUrl: 'https://ultraviewer.net/en/download.html',
    subtitle: 'only supported for windows client',
  },
  ssh: {
    host: 'smritimegh.local',
    port: 25432,
    username: 'smadmin',
    password: 'SM@dmin@098',
    connectionHelp: {
      windows: 'ssh -p 25432 smadmin@smritimegh.local',
      linux: 'ssh -p 25432 smadmin@smritimegh.local',
      mac: 'ssh -p 25432 smadmin@smritimegh.local',
      putty: 'putty.exe -P 25432 smadmin@smritimegh.local',
    },
  },
};

export default function UtilityPage() {
  const { t } = useTranslation();
  const authenticatedFetch = useAuthenticatedFetch();
  const [info, setInfo] = useState<RemoteAccessInfo>(DEFAULT_INFO);

  React.useEffect(() => {
    const fetchRemoteAccess = async () => {
      try {
        const res = await authenticatedFetch('/api/utility/remote-access');
        if (!res.ok) return;
        const data = await res.json();
        if (data?.ssh && data?.ultraviewer) {
          setInfo(data);
        }
      } catch {
        // Fall back to default static credentials if API is unavailable
      }
    };
    void fetchRemoteAccess();
  }, [authenticatedFetch]);

  const copyToClipboard = async (text: string, label: string) => {
    const ok = await copyTextToClipboard(text);
    if (ok) {
      toast.success(`${label} ${t('UTILITY_COPIED_TO_CLIPBOARD', 'copied to clipboard!')}`);
    } else {
      toast.error(`Failed to copy ${label}`);
    }
  };

  return (
    <div className="space-y-4">
      <Tabs defaultValue="remote-access" className="w-full">
        <TabsList>
          <TabsTrigger value="remote-access">{t('UTILITY_TAB_REMOTE_ACCESS', 'Remote Access')}</TabsTrigger>
        </TabsList>

        <TabsContent value="remote-access">
          <div className="d-flex flex-column gap-4">
            {/* Header 1: Ultra Viewer */}
            <div className="card p-3">
              <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
                <div>
                  <h3 className="mb-1">{t('UTILITY_ULTRAVIEWER_TITLE', 'Ultra Viewer')}</h3>
                  <div className="text-muted small">{t('UTILITY_ULTRAVIEWER_SUBTITLE', info.ultraviewer.subtitle)}</div>
                </div>
                <div>
                  <a
                    href={info.ultraviewer.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary d-inline-flex align-items-center gap-2"
                  >
                    <IconDownload size={18} />
                    <span>{t('UTILITY_ULTRAVIEWER_DOWNLOAD_BTN', 'Download Ultra Viewer')}</span>
                  </a>
                </div>
              </div>
            </div>

            {/* Header 2: SSH */}
            <div className="card p-3">
              <h3 className="mb-3">{t('UTILITY_SSH_TITLE', 'SSH')}</h3>

              <div className="row g-3 mb-4">
                {/* Local Domain */}
                <div className="col-md-6 col-lg-3">
                  <label htmlFor="ssh-local-domain" className="form-label">
                    {t('UTILITY_SSH_LOCAL_DOMAIN', 'Local Domain')}
                  </label>
                  <div className="input-group">
                    <input id="ssh-local-domain" type="text" className="form-control font-monospace" value={info.ssh.host} readOnly />
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => copyToClipboard(info.ssh.host, t('UTILITY_SSH_LOCAL_DOMAIN', 'Local Domain'))}
                      aria-label="Copy Local Domain"
                    >
                      <IconCopy size={16} />
                    </Button>
                  </div>
                </div>

                {/* Port */}
                <div className="col-md-6 col-lg-3">
                  <label htmlFor="ssh-port" className="form-label">
                    {t('UTILITY_SSH_PORT', 'Port')}
                  </label>
                  <div className="input-group">
                    <input id="ssh-port" type="text" className="form-control font-monospace" value={info.ssh.port} readOnly />
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => copyToClipboard(String(info.ssh.port), t('UTILITY_SSH_PORT', 'Port'))}
                      aria-label="Copy Port"
                    >
                      <IconCopy size={16} />
                    </Button>
                  </div>
                </div>

                {/* Username */}
                <div className="col-md-6 col-lg-3">
                  <label htmlFor="ssh-username" className="form-label">
                    {t('UTILITY_SSH_USERNAME', 'Username')}
                  </label>
                  <div className="input-group">
                    <input id="ssh-username" type="text" className="form-control font-monospace" value={info.ssh.username} readOnly />
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => copyToClipboard(info.ssh.username, t('UTILITY_SSH_USERNAME', 'Username'))}
                      aria-label="Copy Username"
                    >
                      <IconCopy size={16} />
                    </Button>
                  </div>
                </div>

                {/* Password */}
                <div className="col-md-6 col-lg-3">
                  <label htmlFor="ssh-password" className="form-label">
                    {t('UTILITY_SSH_PASSWORD', 'Password')}
                  </label>
                  <div className="input-group">
                    <div className="flex-grow-1">
                      <PasswordInput id="ssh-password" value={info.ssh.password} readOnly groupClassName="mb-0" />
                    </div>
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => copyToClipboard(info.ssh.password, t('UTILITY_SSH_PASSWORD', 'Password'))}
                      aria-label="Copy Password"
                    >
                      <IconCopy size={16} />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Connection Help */}
              <div className="border-top pt-3 mt-2">
                <h4 className="mb-3 d-flex align-items-center gap-2">
                  <IconTerminal size={20} />
                  <span>{t('UTILITY_SSH_CONNECTION_HELP', 'Connection Help')}</span>
                </h4>

                <div className="row g-3">
                  {/* Windows */}
                  <div className="col-md-6">
                    <div className="card card-body bg-light-subtle p-3 h-100">
                      <div className="fw-bold mb-2 d-flex align-items-center gap-2">
                        <IconBrandWindows size={18} />
                        <span>{t('UTILITY_SSH_HELP_WINDOWS', 'Windows (PowerShell / CMD)')}</span>
                      </div>
                      <div className="d-flex align-items-center justify-content-between font-monospace bg-dark text-white p-2 rounded">
                        <code>{info.ssh.connectionHelp.windows}</code>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyToClipboard(info.ssh.connectionHelp.windows, 'Windows command')}
                          aria-label="Copy Windows Command"
                          className="text-white ms-2"
                        >
                          <IconCopy size={16} />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Linux */}
                  <div className="col-md-6">
                    <div className="card card-body bg-light-subtle p-3 h-100">
                      <div className="fw-bold mb-2 d-flex align-items-center gap-2">
                        <IconTerminal2 size={18} />
                        <span>{t('UTILITY_SSH_HELP_LINUX', 'Linux')}</span>
                      </div>
                      <div className="d-flex align-items-center justify-content-between font-monospace bg-dark text-white p-2 rounded">
                        <code>{info.ssh.connectionHelp.linux}</code>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyToClipboard(info.ssh.connectionHelp.linux, 'Linux command')}
                          aria-label="Copy Linux Command"
                          className="text-white ms-2"
                        >
                          <IconCopy size={16} />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* macOS */}
                  <div className="col-md-6">
                    <div className="card card-body bg-light-subtle p-3 h-100">
                      <div className="fw-bold mb-2 d-flex align-items-center gap-2">
                        <IconBrandApple size={18} />
                        <span>{t('UTILITY_SSH_HELP_MAC', 'macOS')}</span>
                      </div>
                      <div className="d-flex align-items-center justify-content-between font-monospace bg-dark text-white p-2 rounded">
                        <code>{info.ssh.connectionHelp.mac}</code>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyToClipboard(info.ssh.connectionHelp.mac, 'macOS command')}
                          aria-label="Copy macOS Command"
                          className="text-white ms-2"
                        >
                          <IconCopy size={16} />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* PuTTY */}
                  <div className="col-md-6">
                    <div className="card card-body bg-light-subtle p-3 h-100">
                      <div className="fw-bold mb-2 d-flex align-items-center gap-2">
                        <IconTerminal size={18} />
                        <span>{t('UTILITY_SSH_HELP_PUTTY', 'PuTTY')}</span>
                      </div>
                      <div className="d-flex align-items-center justify-content-between font-monospace bg-dark text-white p-2 rounded mb-2">
                        <code>{info.ssh.connectionHelp.putty}</code>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyToClipboard(info.ssh.connectionHelp.putty, 'PuTTY command')}
                          aria-label="Copy PuTTY Command"
                          className="text-white ms-2"
                        >
                          <IconCopy size={16} />
                        </Button>
                      </div>
                      <div className="text-muted small">
                        Host Name: <strong>{info.ssh.host}</strong> | Port: <strong>{info.ssh.port}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
