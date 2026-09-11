import { Button } from '@/components/ui/Button';
import { useAuthenticatedFetch } from '@/lib/hooks/use-authenticated-fetch';
import React from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

type UsbDevice = {
  device: string;
  model?: string | null;
  size?: string | null;
  mountpoint?: string | null;
  uuid?: string | null;
  label?: string | null;
};

type InstalledApps = {
  nextcloud: boolean;
  jellyfin: boolean;
  immich: boolean;
};

type CopyStatusPayload = {
  job_id?: string;
  status?: 'running' | 'completed' | 'stopped' | 'error' | 'waiting' | string;
  percent?: number;
  bytes_done?: number;
  bytes_total?: number;
  speed?: number;
  eta?: number;
  error?: string | null;
  message?: string;
};

export default function ExternalUsbPage() {
  const { t } = useTranslation();
  const authenticatedFetch = useAuthenticatedFetch();

  const [activeTab, setActiveTab] = React.useState<'app' | 'backup'>('app');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [devices, setDevices] = React.useState<UsbDevice[]>([]);
  const [busyDevice, setBusyDevice] = React.useState<string | null>(null);
  const [installedApps, setInstalledApps] = React.useState<InstalledApps | null>(null);

  // Device selection state
  const [selectedDevice, setSelectedDevice] = React.useState<string | null>(null);
  const [selectedApp, setSelectedApp] = React.useState<string>('');
  const [isMounted, setIsMounted] = React.useState<boolean>(false);
  const [selectingDevice, setSelectingDevice] = React.useState<string | null>(null);
  const [savingApp, setSavingApp] = React.useState<boolean>(false);

  // Backup & Polling Copy progress state
  const [copyStatus, setCopyStatus] = React.useState<CopyStatusPayload | null>(null);
  const [startingCopy, setStartingCopy] = React.useState<boolean>(false);
  const [stoppingCopy, setStoppingCopy] = React.useState<boolean>(false);

  // Load last selected device/app/mounted state from backend on component mount
  React.useEffect(() => {
    const loadSelection = async () => {
      try {
        const res = await authenticatedFetch('/api/config/usb/selected');
        if (!res.ok) return;
        const data = await res.json();
        const dev = typeof data?.device === 'string' && data.device ? data.device : null;
        const app = typeof data?.app === 'string' && data.app ? data.app : '';
        const mounted = Boolean(data?.mounted);

        if (dev) {
          setSelectedDevice(dev);
          if (app) {
            setSelectedApp(app);
            if (app === 'backup') {
              setActiveTab('backup');
            }
          }
          setIsMounted(mounted);

          try {
            const scanRes = await authenticatedFetch('/api/config/usb/scan', { method: 'POST' });
            const scanData = await scanRes.json();
            if (!scanRes.ok || scanData?.error) return;
            const list: UsbDevice[] = Array.isArray(scanData?.devices) ? scanData.devices : [];
            setDevices(list);
            const matched = list.find((d: UsbDevice) => d.device === dev);
            // Preserve mounted state if backend reported mounted or matched device has mountpoint
            if (mounted || Boolean(matched?.mountpoint)) {
              setIsMounted(true);
            }
          } catch {
            // ignore scan errors
          }
        } else {
          setIsMounted(false);
        }
      } catch {
        // ignore errors
      }
    };

    const fetchInstalledApps = async () => {
      try {
        const res = await authenticatedFetch('/api/config/usb/installed-apps');
        if (!res.ok) return;
        const data = await res.json();
        setInstalledApps(data);
      } catch {
        // ignore errors
      }
    };

    void loadSelection();
    void fetchInstalledApps();
  }, [authenticatedFetch]);

  // 5-second polling interval for reading copy_status.json in Backup tab
  React.useEffect(() => {
    if (activeTab !== 'backup') return;

    const fetchCopyStatus = async () => {
      try {
        const res = await authenticatedFetch('/api/config/usb/copy-status');
        if (res.ok) {
          const data = await res.json();
          if (data && typeof data === 'object') {
            setCopyStatus(data);
          }
        }
      } catch {
        // ignore errors during polling
      }
    };

    // Initial fetch immediately on tab mount
    void fetchCopyStatus();

    // Poll every 5 seconds
    const interval = setInterval(fetchCopyStatus, 5000);

    return () => {
      clearInterval(interval);
    };
  }, [activeTab, authenticatedFetch]);

  const refreshList = async () => {
    const res = await authenticatedFetch('/api/config/usb/scan', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.message || `Request failed: ${res.status}`);
    if (data?.error) throw new Error(String(data.error));
    const list: UsbDevice[] = Array.isArray(data?.devices) ? data.devices : [];
    setDevices(list);
    if (selectedDevice) {
      const matched = list.find((d: UsbDevice) => d.device === selectedDevice);
      if (matched?.mountpoint) {
        setIsMounted(true);
      }
    }
  };

  const onScan = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await authenticatedFetch('/api/config/usb/scan', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || `Request failed: ${res.status}`);
      if (data?.error) throw new Error(String(data.error));
      const list: UsbDevice[] = Array.isArray(data?.devices) ? data.devices : [];
      setDevices(list);
      if (selectedDevice) {
        const matched = list.find((d: UsbDevice) => d.device === selectedDevice);
        if (matched?.mountpoint) {
          setIsMounted(true);
        }
      }
      toast.success(t('EXTERNAL_USB_SCANNED', 'USB devices scanned'));
    } catch (e: any) {
      const msg = String(e);
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // App Mount handler (writes "mount" to command.txt)
  const onMount = async () => {
    if (!selectedDevice) return;
    setBusyDevice(selectedDevice);
    setError('');
    try {
      const res = await authenticatedFetch('/api/config/usb/mount', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device: selectedDevice }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || `Request failed: ${res.status}`);
      if (data?.error) throw new Error(String(data.error));
      await refreshList();
      setIsMounted(true);
      toast.success(t('EXTERNAL_USB_MOUNT_SUCCESS', 'Device mounted successfully'));
    } catch (e: any) {
      const msg = String(e);
      setError(msg);
      toast.error(msg);
    } finally {
      setBusyDevice(null);
    }
  };

  // Backup Mount handler (writes "mount-backup" to command.txt)
  const onMountBackup = async () => {
    if (!selectedDevice) return;
    setBusyDevice(selectedDevice);
    setError('');
    try {
      const res = await authenticatedFetch('/api/config/usb/mount-backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device: selectedDevice }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || `Request failed: ${res.status}`);
      if (data?.error) throw new Error(String(data.error));
      await refreshList();
      setIsMounted(true);
      toast.success(t('EXTERNAL_USB_BACKUP_MOUNT_SUCCESS', 'Backup device mounted successfully'));
    } catch (e: any) {
      const msg = String(e);
      setError(msg);
      toast.error(msg);
    } finally {
      setBusyDevice(null);
    }
  };

  // Start Copy handler (writes "copy" to command.txt) - Non-blocking
  const onStartCopy = async () => {
    setStartingCopy(true);
    setError('');
    try {
      const res = await authenticatedFetch('/api/config/usb/copy', {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || `Request failed: ${res.status}`);
      if (data?.error) throw new Error(String(data.error));
      toast.success(t('EXTERNAL_USB_COPY_STARTED', 'Copy operation started'));
    } catch (e: any) {
      const msg = String(e);
      setError(msg);
      toast.error(msg);
    } finally {
      setStartingCopy(false);
    }
  };

  // Stop Copy handler (writes "copy-stop" to command.txt)
  const onStopCopy = async () => {
    setStoppingCopy(true);
    setError('');
    try {
      const res = await authenticatedFetch('/api/config/usb/copy-stop', {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || `Request failed: ${res.status}`);
      if (data?.error) throw new Error(String(data.error));
      toast.success(t('EXTERNAL_USB_COPY_STOPPED', 'Copy stop request sent'));
    } catch (e: any) {
      const msg = String(e);
      setError(msg);
      toast.error(msg);
    } finally {
      setStoppingCopy(false);
    }
  };

  // Unmount handler (writes "unmount" to command.txt)
  const onUnmount = async () => {
    if (!selectedDevice) return;
    setBusyDevice(selectedDevice);
    setError('');
    try {
      const res = await authenticatedFetch('/api/config/usb/unmount', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device: selectedDevice }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || `Request failed: ${res.status}`);
      if (data?.error) throw new Error(String(data.error));
      await refreshList();
      setIsMounted(false);
      setSelectedApp('');
      toast.success(t('EXTERNAL_USB_UNMOUNT_SUCCESS', 'Device unmounted successfully'));
    } catch (e: any) {
      const msg = String(e);
      setError(msg);
      toast.error(msg);
    } finally {
      setBusyDevice(null);
    }
  };

  const toggleSelectDevice = async (device: string) => {
    if (isMounted) return;
    setSelectingDevice(device);
    setError('');
    try {
      if (selectedDevice === device) {
        const res = await authenticatedFetch('/api/config/usb/clear-selected', { method: 'POST' });
        const data = await res.json();
        if (!res.ok || data?.ok !== true) throw new Error(data?.message || `Request failed: ${res.status}`);
        setSelectedDevice(null);
        setIsMounted(false);
        toast.success(t('EXTERNAL_USB_SELECTION_CLEARED', 'Selection cleared'));
      } else {
        const res = await authenticatedFetch('/api/config/usb/select', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ device }),
        });
        const data = await res.json();
        if (!res.ok || data?.ok !== true) throw new Error(data?.message || `Request failed: ${res.status}`);
        setSelectedDevice(device);
        const matched = devices.find((d) => d.device === device);
        setIsMounted(Boolean(matched?.mountpoint));
        toast.success(t('EXTERNAL_USB_SELECTION_SAVED', 'Device selected'));
      }
    } catch (e: any) {
      const msg = String(e);
      setError(msg);
      toast.error(msg);
    } finally {
      setSelectingDevice(null);
    }
  };

  const onSelectApp = async (app: string) => {
    if (isMounted) return;
    setSavingApp(true);
    setError('');
    try {
      const res = await authenticatedFetch('/api/config/usb/app', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app }),
      });
      const data = await res.json();
      if (!res.ok || data?.ok !== true) throw new Error(data?.message || `Request failed: ${res.status}`);
      setSelectedApp(app);
      toast.success(t('EXTERNAL_USB_APP_SAVED', 'App selection saved'));
    } catch (e: any) {
      const msg = String(e);
      setError(msg);
      toast.error(msg);
    } finally {
      setSavingApp(false);
    }
  };

  const isCopying = copyStatus?.status === 'running';

  return (
    <div className="card p-3">
      <h3 className="mb-3">{t('EXTERNAL_USB_TITLE', 'External USB Storage')}</h3>

      {/* Tabs header */}
      <ul className="nav nav-tabs mb-3">
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link ${activeTab === 'app' ? 'active fw-bold' : ''}`}
            onClick={() => setActiveTab('app')}
          >
            {t('EXTERNAL_USB_TAB_APP', 'App Storage')}
          </button>
        </li>
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link ${activeTab === 'backup' ? 'active fw-bold' : ''}`}
            onClick={() => setActiveTab('backup')}
          >
            {t('EXTERNAL_USB_TAB_BACKUP', 'Backup')}
          </button>
        </li>
      </ul>

      {error && (
        <div className="alert alert-danger mb-3" role="alert">
          {error}
        </div>
      )}

      {/* Common Scan Bar */}
      <div className="d-flex gap-2 align-items-center mb-3">
        <Button intent="primary" onClick={onScan} disabled={loading}>
          {t('EXTERNAL_USB_SCAN_BUTTON', 'Scan USB Devices')}
        </Button>
        {loading && <div className="text-muted">Scanning devices...</div>}
      </div>

      {/* Device List Table */}
      {devices.length === 0 ? (
        <div className="text-muted mb-3">{t('EXTERNAL_USB_NO_DEVICES', 'No USB devices found.')}</div>
      ) : (
        <div className="d-flex flex-column gap-1 mb-3">
          <div className="d-flex px-2 py-1 fw-semibold" style={{ backgroundColor: 'var(--bs-secondary-bg)' }}>
            <div className="flex-grow-1">{t('EXTERNAL_USB_COL_NAME', 'Name')}</div>
            <div style={{ width: '10rem' }}>{t('EXTERNAL_USB_COL_SIZE', 'Size')}</div>
            <div style={{ width: '14rem' }}>{t('EXTERNAL_USB_COL_MODEL', 'Model')}</div>
            <div style={{ width: '14rem' }}>{t('EXTERNAL_USB_COL_MOUNTPOINT', 'Mountpoint')}</div>
            <div style={{ width: '12rem' }}>{t('EXTERNAL_USB_COL_ACTIONS', 'Actions')}</div>
          </div>

          {devices.map((d) => {
            const name = (d.label || d.device || '').toString();
            const isBusy = busyDevice === d.device || selectingDevice === d.device;
            const isSelected = selectedDevice === d.device;

            return (
              <div key={d.device} className="d-flex align-items-center px-2 py-1 border-bottom" style={{ gap: '0.5rem' }}>
                <div className="flex-grow-1 font-monospace" style={{ wordBreak: 'break-all' }}>{name}</div>
                <div style={{ width: '10rem' }}>{d.size || '-'}</div>
                <div style={{ width: '14rem' }}>{d.model || '-'}</div>
                <div className="font-monospace" style={{ width: '14rem', wordBreak: 'break-all' }}>{d.mountpoint || '-'}</div>
                <div style={{ width: '12rem' }} className="d-flex gap-2">
                  <Button
                    intent={isSelected ? 'warning' : 'primary'}
                    disabled={isMounted || isBusy}
                    onClick={() => toggleSelectDevice(d.device)}
                  >
                    {isBusy
                      ? t('EXTERNAL_USB_WORKING', 'Working...')
                      : isSelected
                        ? t('EXTERNAL_USB_UNSELECT_BUTTON', 'Unselect')
                        : t('EXTERNAL_USB_SELECT_BUTTON', 'Select')}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* APP STORAGE TAB CONTENT */}
      {activeTab === 'app' && (
        <>
          {selectedDevice && (
            <div className="card mb-3 p-3" style={{ backgroundColor: 'var(--bs-secondary-bg)' }}>
              {installedApps && !installedApps.nextcloud && !installedApps.jellyfin && !installedApps.immich ? (
                <div className="alert alert-info mb-0" role="alert">
                  {t('EXTERNAL_USB_NO_APPS_INSTALLED', 'Please install Nextcloud, Jellyfin, or Immich to mount a USB device.')}
                </div>
              ) : (
                <div className="row g-2 align-items-end">
                  <div className="col-md-4">
                    <label className="form-label">{t('EXTERNAL_USB_CHOOSE_APP_LABEL', 'Target App')}</label>
                    <select
                      className="form-select"
                      disabled={savingApp || isMounted}
                      value={selectedApp}
                      onChange={(e) => onSelectApp(e.target.value)}
                    >
                      <option value="">{t('EXTERNAL_USB_CHOOSE_APP_PLACEHOLDER', 'Select application...')}</option>
                      {installedApps?.nextcloud && <option value="nextcloud">Nextcloud</option>}
                      {installedApps?.jellyfin && <option value="jellyfin">Jellyfin</option>}
                      {installedApps?.immich && <option value="immich">Immich</option>}
                    </select>
                  </div>
                  {savingApp && (
                    <div className="col-md-4 d-flex align-items-center">{t('EXTERNAL_USB_SAVING_APP', 'Saving app selection...')}</div>
                  )}
                </div>
              )}
            </div>
          )}

          {selectedDevice && selectedApp && (
            <div className="d-flex flex-column gap-1 mt-2">
              <div className="d-flex gap-2">
                <Button
                  intent="primary"
                  disabled={isMounted || busyDevice !== null}
                  onClick={onMount}
                >
                  {busyDevice ? t('EXTERNAL_USB_WORKING', 'Working...') : t('EXTERNAL_USB_MOUNT_BUTTON', 'Mount')}
                </Button>
                <Button
                  intent="warning"
                  disabled={!isMounted || busyDevice !== null}
                  onClick={onUnmount}
                >
                  {t('EXTERNAL_USB_UNMOUNT_BUTTON', 'Unmount')}
                </Button>
              </div>
              {busyDevice && (
                <div className="text-muted small">
                  {t('EXTERNAL_USB_MOUNTING_HINT', 'Mounting device... please wait.')}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* BACKUP TAB CONTENT */}
      {activeTab === 'backup' && (
        <div className="mt-2">
          {selectedDevice && (
            <div className="card mb-3 p-3" style={{ backgroundColor: 'var(--bs-secondary-bg)' }}>
              <div className="d-flex align-items-center justify-content-between">
                <div>
                  <strong>Selected Device:</strong> <span className="font-monospace">{selectedDevice}</span>
                  {isMounted && <span className="badge bg-success ms-2">Mounted</span>}
                </div>
                <div className="d-flex gap-2">
                  {!isMounted ? (
                    <Button
                      intent="primary"
                      disabled={busyDevice !== null}
                      onClick={onMountBackup}
                    >
                      {busyDevice ? 'Mounting...' : 'Mount Backup Device'}
                    </Button>
                  ) : (
                    <>
                      <Button
                        intent="primary"
                        disabled={isCopying || startingCopy || busyDevice !== null}
                        onClick={onStartCopy}
                      >
                        {startingCopy ? 'Starting Copy...' : isCopying ? 'Copying in Progress...' : 'Copy (Start Backup)'}
                      </Button>
                      {isCopying && (
                        <Button
                          intent="danger"
                          disabled={stoppingCopy}
                          onClick={onStopCopy}
                        >
                          {stoppingCopy ? 'Stopping...' : 'Stop'}
                        </Button>
                      )}
                      <Button
                        intent="warning"
                        disabled={!isMounted || busyDevice !== null}
                        onClick={onUnmount}
                      >
                        {busyDevice ? 'Unmounting...' : 'Unmount'}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 5-Second Polling Percent Display Section */}
          {copyStatus && copyStatus.status && copyStatus.status !== 'waiting' && (
            <div className="card p-3 mt-3 border">
              <div className="d-flex align-items-center justify-content-between">
                <div>
                  <span className="fw-bold fs-4">
                    Percent Completed: {copyStatus.percent ?? 0}%
                  </span>
                </div>
                <div>
                  {copyStatus.status === 'running' && <span className="badge bg-primary fs-6">Copying...</span>}
                  {copyStatus.status === 'completed' && <span className="badge bg-success fs-6">Completed</span>}
                  {copyStatus.status === 'stopped' && <span className="badge bg-warning text-dark fs-6">Stopped</span>}
                  {copyStatus.status === 'error' && <span className="badge bg-danger fs-6">Failed</span>}
                </div>
              </div>

              {copyStatus.status === 'error' && (
                <div className="alert alert-danger mt-3 mb-0" role="alert">
                  <strong>Copy Error:</strong> {copyStatus.error || copyStatus.message || 'An error occurred during copy.'}
                </div>
              )}

              {copyStatus.status === 'stopped' && (
                <div className="alert alert-warning mt-3 mb-0" role="alert">
                  Copy operation was stopped by user.
                </div>
              )}

              {copyStatus.status === 'completed' && (
                <div className="alert alert-success mt-3 mb-0" role="alert">
                  Backup copy completed successfully!
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
