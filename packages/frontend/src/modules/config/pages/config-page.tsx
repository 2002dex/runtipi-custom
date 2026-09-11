import React from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { useNavigate, useSearchParams } from 'react-router';
import { useAuthenticatedFetch } from '@/lib/hooks/use-authenticated-fetch';
import toast from 'react-hot-toast';

function DuplicatesTab() {
  const { t } = useTranslation();
  const authenticatedFetch = useAuthenticatedFetch();
  const [users, setUsers] = useState<string[]>([]);
  const [usersLoading, setUsersLoading] = useState<boolean>(true);
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [resultLoading, setResultLoading] = useState<boolean>(false);
  const [entries, setEntries] = useState<Array<{ path: string; type: string; is_original?: boolean }>>([]);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [dupError, setDupError] = useState<string>('');
  const [dupSuccess, setDupSuccess] = useState<string>('');
  const [showingSelected, setShowingSelected] = useState<boolean>(false);
  const [hasRunFind, setHasRunFind] = useState<boolean>(false);

  // Load users from /data/state/user_list.json via backend
  useEffect(() => {
    const loadUsers = async () => {
      try {
        const res = await authenticatedFetch('/api/config/nextcloud/users');
        const data = await res.json();
        setUsers(data.users || []);
      } catch (e: any) {
        setDupError(String(e));
      } finally {
        setUsersLoading(false);
      }
    };
    void loadUsers();
  }, [authenticatedFetch]);

  const refreshEntries = async () => {
    setResultLoading(true);
    setDupError('');
    try {
      const res = await authenticatedFetch('/api/config/duplicates/rmlint');
      const data = await res.json();
      const newEntries = data.entries || [];
      setEntries(newEntries);
      setSelected({});
      return newEntries;
    } catch (e: any) {
      setDupError(String(e));
      return [];
    } finally {
      setResultLoading(false);
    }
  };


  const onSelectUser = (username: string) => {
    setSelectedUser(username);
    setDupError('');
    setDupSuccess('');
    setShowingSelected(false);
    setHasRunFind(false);
    // Clear previous results when changing user selection
    setEntries([]);
    setSelected({});
  };

  const handleFindClick = async () => {
    if (!selectedUser) return;
    setDupError('');
    setDupSuccess('');
    setShowingSelected(false);
    try {
      // Overwrite path.txt with the selected user's path and persist username
      await authenticatedFetch('/api/config/duplicates/set-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: selectedUser }),
      });
      const newEntries = await refreshEntries();
      setHasRunFind(true);

      // If no duplicates found, reset form so user can pick another account
      if (!newEntries || newEntries.length === 0) {
        setHasRunFind(false);
        setSelectedUser('');
        setEntries([]);
        setSelected({});
        setShowingSelected(false);
        setDupSuccess(t('CONFIG_DUPLICATES_NO_RESULTS'));
      }
    } catch (e: any) {
      setDupError(String(e));
    }
  };

  const selectedItems = Object.entries(selected)
    .filter(([, v]) => v)
    .map(([k]) => entries[Number(k)])
    .filter((entry): entry is { path: string; type: string; is_original?: boolean } => Boolean(entry));

  const handleWriteSelection = async () => {
    if (selectedItems.length === 0) return;
    setDupError('');
    setDupSuccess('');
    try {
      const res = await authenticatedFetch('/api/config/duplicates/selected', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selected: selectedItems }),
      });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      // After save, show only selected items
      setEntries(selectedItems);
      setSelected({});
      setShowingSelected(true);
    } catch (e: any) {
      setDupError(String(e));
    }
  };


  return (
    <div>
      {dupError && (
        <div className="alert alert-danger" role="alert">{dupError}</div>
      )}
      {dupSuccess && (
        <div className="alert alert-success" role="alert">{dupSuccess}</div>
      )}
      {!hasRunFind && (
        <div className="row g-2 align-items-end mb-3">
          <div className="col-md-4">
            <label className="form-label">{t('CONFIG_DUPLICATES_USER_LABEL')}</label>
            <select className="form-select" disabled={usersLoading} value={selectedUser} onChange={(e) => onSelectUser(e.target.value)}>
              <option value="">{usersLoading ? t('APP_ACTION_LOADING') : t('APP_INSTALL_FORM_CHOOSE_OPTION')}</option>
              {users.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
            {!usersLoading && users.length === 0 && (
              <div className="form-text text-warning">{t('CONFIG_DUPLICATES_NO_USERS')}</div>
            )}
          </div>
          <div className="col-md-4 d-flex gap-2">
            <Button intent="primary" onClick={handleFindClick} disabled={!selectedUser}>
              {t('CONFIG_DUPLICATES_FIND_BUTTON')}
            </Button>
          </div>
        </div>
      )}

      {resultLoading ? (
        <div>Reading data...</div>
      ) : (
        <div>
          <div className="d-flex align-items-center justify-content-between mb-2">
            <h5 className="m-0">{t('CONFIG_DUPLICATES_RESULTS_TITLE')}</h5>
            <div className="d-flex gap-2">
              {!showingSelected ? (
                <>
                  <Button intent="primary" onClick={handleWriteSelection} disabled={Object.values(selected).filter(Boolean).length === 0}>Done</Button>
                  <Button
                    intent="default"
                    onClick={() => {
                      // Reset entire duplicates form so a different user can be selected
                      setSelected({});
                      setEntries([]);
                      setShowingSelected(false);
                      setSelectedUser('');
                      setHasRunFind(false);
                      setDupError('');
                      setDupSuccess('');
                    }}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <Button intent="warning" onClick={async () => {
                  try {
                    const res = await authenticatedFetch('/api/config/duplicates/remove-all', { method: 'POST' });
                    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
                    setDupSuccess('Files removed successfully');
                    // reset form back to Nextcloud user selection
                    setEntries([]);
                    setSelected({});
                    setShowingSelected(false);
                    setSelectedUser('');
                    setHasRunFind(false);
                  } catch (e: any) {
                    setDupError(String(e));
                  }
                }}>
                  Confirm Deletion
                </Button>
              )}
            </div>
          </div>
          {!showingSelected && (
            <div className="mb-2 text-muted">
              {t('CONFIG_DUPLICATES_SUMMARY', { count: Object.values(selected).filter(Boolean).length })}
            </div>
          )}
          {entries.length === 0 ? (
            <div className="text-muted">{t('CONFIG_DUPLICATES_NO_RESULTS')}</div>
          ) : (
            <div className="d-flex flex-column gap-1">
              {showingSelected && (
                <div className="alert alert-warning py-2 mb-1">Following items selected for deletion</div>
              )}
              {/* Table header */}
              <div className="d-flex px-2 py-1 fw-semibold" style={{ backgroundColor: 'var(--bs-secondary-bg)' }}>
                <div style={{ width: '2rem' }}>Sel</div>
                <div className="flex-grow-1">File</div>
                <div style={{ width: '10rem' }}>Type</div>
                <div style={{ width: '7rem' }}>Original</div>
              </div>
              {entries.map((it, idx) => (
                <div key={idx} className="d-flex align-items-center px-2 py-1 border-bottom" style={{ gap: '0.5rem' }}>
                  <div style={{ width: '2rem' }}>
                    {!showingSelected && (
                      <input type="checkbox" className="form-check-input" checked={Boolean(selected[idx])} onChange={(e) => setSelected((prev) => ({ ...prev, [idx]: e.target.checked }))} />
                    )}
                  </div>
                  <div className="flex-grow-1 font-monospace" style={{ wordBreak: 'break-all' }}>{it.path}</div>
                  <div style={{ width: '10rem' }}>{it.type}</div>
                  <div
                    style={{
                      width: '7rem',
                      backgroundColor: it.is_original ? '#f1f902ff' : 'transparent',
                      fontWeight: it.is_original ? 'bold' : 'normal',
                      color: it.is_original ? 'red' : 'inherit',
                    }}
                  >
                    {it.is_original ? 'Yes' : 'No'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
}

// Frigate object detection classes from labelmap.txt
const FRIGATE_OBJECTS = [
  'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat',
  'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat',
  'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe', 'backpack',
  'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee', 'skis', 'snowboard', 'sports ball',
  'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard', 'tennis racket',
  'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple',
  'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake',
  'chair', 'couch', 'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop',
  'mouse', 'remote', 'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink',
  'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy bear', 'hair drier',
  'toothbrush'
];

interface CameraInput {
  path: string;
  roles: string[];
}

interface Camera {
  name: string;
  ip?: string;  // Keep for backward compatibility
  user?: string;
  password?: string;
  objects?: string[];
  record?: boolean;
  inputs?: CameraInput[];
}

interface SmbShare {
  id?: string;
  name: string;
  quota: string;
  type: 'macos' | 'windows';
  dataset?: string;
  mountpoint?: string;
  uiId?: string;
}

interface SmbAppliedShare extends SmbShare {
  id: string;
  dataset: string;
  mountpoint: string;
}

interface SmbSharesStatus {
  enabled: boolean;
  username: string;
  shares: SmbShare[];
  appliedShares: SmbAppliedShare[];
  passwordSet: boolean;
  storageTotalBytes: number;
  storageFreeBytes: number;
  status: string;
  message?: string;
  error?: string;
  quotaDetails?: {
    id?: string;
    share?: string;
    dataset?: string;
    requestedQuota?: string;
    currentQuota?: string;
    currentUsed?: string;
    zfsError?: string;
  };
}

const SMB_SHARES_DEFAULTS: SmbSharesStatus = {
  enabled: false,
  username: 'smadmin',
  shares: [],
  appliedShares: [],
  passwordSet: false,
  storageTotalBytes: 0,
  storageFreeBytes: 0,
  status: 'not_configured',
};

export default function ConfigPage() {
  const { t } = useTranslation();
  const authenticatedFetch = useAuthenticatedFetch();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [currentTab, setCurrentTab] = React.useState(searchParams.get('tab') || 'info');

  // Info
  const [internalIp, setInternalIp] = useState<string>('');

  // Frigate
  const [frigateInstalled, setFrigateInstalled] = useState<boolean>(false);
  const [frigateDialogOpen, setFrigateDialogOpen] = useState<boolean>(false);

  // Jellyfin Sync
  const [jellyfinInstalled, setJellyfinInstalled] = useState<boolean>(false);
  const [syncDialogOpen, setSyncDialogOpen] = useState<boolean>(false);
  const smbRowIdRef = React.useRef(0);
  const smbNewRowIdRef = React.useRef('smb-share-new');
  const [loading, setLoading] = useState<boolean>(true);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [validationErrors, setValidationErrors] = useState<Record<number, { name?: string; inputs?: string }>>({});
  const [smbShares, setSmbShares] = useState<SmbSharesStatus>(SMB_SHARES_DEFAULTS);
  const [smbPassword, setSmbPassword] = useState<string>('');
  const [smbDeleteShares, setSmbDeleteShares] = useState<string[]>([]);
  const [smbSaving, setSmbSaving] = useState<boolean>(false);
  const [smbError, setSmbError] = useState<string>('');
  const [smbSuccess, setSmbSuccess] = useState<string>('');
  const [smbDeleteTarget, setSmbDeleteTarget] = useState<SmbShare | null>(null);

  // Objects dropdown states
  const [objectsDropdownOpen, setObjectsDropdownOpen] = useState<Record<number, boolean>>({});
  const [objectsSearchTerm, setObjectsSearchTerm] = useState<Record<number, string>>({});

  // Theme detection for explicit bg-dark/bg-white application
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
  useEffect(() => {
    const getIsDark = () => {
      const attr = document.documentElement.getAttribute('data-bs-theme') || document.body.getAttribute('data-bs-theme');
      if (attr) return attr === 'dark';
      if (document.documentElement.classList.contains('theme-dark') || document.body.classList.contains('theme-dark')) return true;
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    };

    setIsDarkMode(getIsDark());

    const observer = new MutationObserver(() => setIsDarkMode(getIsDark()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-bs-theme', 'class'] });
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-bs-theme', 'class'] });

    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const mqlHandler = () => setIsDarkMode(getIsDark());
    if (mql.addEventListener) {
      mql.addEventListener('change', mqlHandler);
    } else if ((mql as any).addListener) {
      (mql as any).addListener(mqlHandler);
    }

    return () => {
      observer.disconnect();
      if (mql.removeEventListener) {
        mql.removeEventListener('change', mqlHandler);
      } else if ((mql as any).removeListener) {
        (mql as any).removeListener(mqlHandler);
      }
    };
  }, []);

  const extractSmbMessage = (messageStr: string, quotaDetails?: SmbSharesStatus['quotaDetails']): string => {
    if (quotaDetails?.zfsError) {
      return quotaDetails.zfsError;
    }
    if (!messageStr) return '';
    try {
      const parsed = JSON.parse(messageStr);
      if (parsed) {
        if (parsed.quotaDetails?.zfsError) {
          return parsed.quotaDetails.zfsError;
        }
        if (parsed.zfsError) {
          return parsed.zfsError;
        }
        if (parsed.error) {
          return typeof parsed.error === 'string' ? parsed.error : (parsed.error.message || JSON.stringify(parsed.error));
        }
        if (parsed.message) {
          return parsed.message;
        }
      }
    } catch {
      // Not a JSON string
    }
    return messageStr;
  };

  useEffect(() => {
    if (smbError) {
      const zfsErrMsg = extractSmbMessage(smbError);
      if (zfsErrMsg) {
        toast.error(zfsErrMsg);
      }
      setSmbError('');
    }
  }, [smbError]);

  useEffect(() => {
    if (smbShares.error) {
      const zfsErrMsg = extractSmbMessage(smbShares.error, smbShares.quotaDetails);
      if (zfsErrMsg) {
        toast.error(zfsErrMsg);
      }
      setSmbShares((prev) => ({ ...prev, error: undefined, quotaDetails: undefined }));
    }
  }, [smbShares.error, smbShares.quotaDetails]);

  useEffect(() => {
    const load = async () => {
      try {
        const info = await authenticatedFetch('/api/config/info').then((r) => r.json());
        setInternalIp(info.internalIp || '');

        const status = await authenticatedFetch('/api/config/frigate/status').then((r) => r.json());
        setFrigateInstalled(Boolean(status.installed));

        const jf = await authenticatedFetch('/api/config/jellyfin/status').then((r) => r.json());
        setJellyfinInstalled(Boolean(jf.installed));

        const shares = await authenticatedFetch('/api/config/smb-shares').then((r) => r.json());
        const loadedShares = (shares.shares || []).map((share: SmbShare) => ({ ...share, uiId: `smb-share-${smbRowIdRef.current++}` }));
        setSmbShares({ ...SMB_SHARES_DEFAULTS, ...shares, shares: loadedShares, appliedShares: shares.appliedShares || [] });
        setSmbDeleteShares([]);

        if (status.installed) {
          const cfg = await authenticatedFetch('/api/config/frigate/config').then((r) => r.json());
          const loadedCameras = (cfg?.cameras || []).map((camera: any) => ({
            ...camera,
            // Ensure inputs array exists and has at least one input; normalize roles to lowercase
            inputs: camera.inputs && camera.inputs.length > 0
              ? camera.inputs.map((i: any) => ({
                path: i?.path || '',
                roles: Array.isArray(i?.roles)
                  ? i.roles.map((r: any) => String(r).toLowerCase())
                  : []
              }))
              :
              // If no inputs but we have legacy ip, create a backward-compatible input
              camera.ip ? [{
                path: camera.user && camera.password
                  ? `rtsp://${encodeURIComponent(camera.user)}:${encodeURIComponent(camera.password)}@${camera.ip}`
                  : camera.user
                    ? `rtsp://${encodeURIComponent(camera.user)}@${camera.ip}`
                    : `rtsp://${camera.ip}`,
                roles: ['detect', ...(camera.record !== false ? ['record'] : [])]
              }] : [{ path: '', roles: ['detect'] }],
            // Ensure record defaults to true
            record: camera.record !== false
          }));
          setCameras(loadedCameras);
        }
      } catch (e: any) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [authenticatedFetch]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.objects-dropdown')) {
        setObjectsDropdownOpen({});
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const addCamera = () => setCameras((prev) => [...prev, {
    name: '',
    ip: '',
    user: '',
    password: '',
    objects: ['person'], // Default to person
    record: true,
    inputs: [{ path: '', roles: ['detect'] }]
  }]);

  const removeCamera = (idx: number) => setCameras((prev) => prev.filter((_, i) => i !== idx));

  const updateCamera = (idx: number, key: keyof Camera, value: any) => {
    setCameras((prev) => prev.map((c, i) => (i === idx ? { ...c, [key]: value } : c)));
  };

  // Objects dropdown functions
  const toggleObjectsDropdown = (cameraIdx: number) => {
    setObjectsDropdownOpen(prev => ({
      ...prev,
      [cameraIdx]: !prev[cameraIdx]
    }));
  };

  const updateObjectsSearch = (cameraIdx: number, searchTerm: string) => {
    setObjectsSearchTerm(prev => ({
      ...prev,
      [cameraIdx]: searchTerm
    }));
  };

  const toggleObjectSelection = (cameraIdx: number, object: string) => {
    const currentObjects = cameras[cameraIdx]?.objects || [];
    const isSelected = currentObjects.includes(object);

    const newObjects = isSelected
      ? currentObjects.filter(obj => obj !== object)
      : [...currentObjects, object];

    updateCamera(cameraIdx, 'objects', newObjects);
  };

  const getFilteredObjects = (cameraIdx: number) => {
    const searchTerm = objectsSearchTerm[cameraIdx] || '';
    return FRIGATE_OBJECTS.filter(obj =>
      obj.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  const updateInput = (cameraIdx: number, inputIdx: number, field: 'path' | 'roles', value: any) => {
    setCameras((prev) => prev.map((c, i) =>
      i === cameraIdx
        ? {
          ...c,
          inputs: (c.inputs || []).map((input, j) =>
            j === inputIdx ? { ...input, [field]: value } : input
          )
        }
        : c
    ));
  };

  const updateInputRoles = (cameraIdx: number, inputIdx: number, role: string, checked: boolean) => {
    setCameras((prev) => prev.map((c, i) =>
      i === cameraIdx
        ? {
          ...c,
          inputs: (c.inputs || []).map((input, j) =>
            j === inputIdx
              ? {
                ...input,
                roles: checked
                  ? [...(input.roles || []), role]
                  : (input.roles || []).filter(r => r !== role)
              }
              : input
          )
        }
        : c
    ));
  };

  const validateCameras = () => {
    const errors: Record<number, { name?: string; inputs?: string }> = {};
    let hasErrors = false;

    cameras.forEach((camera, idx) => {
      const cameraErrors: { name?: string; inputs?: string } = {};

      if (!camera.name.trim()) {
        cameraErrors.name = t('APP_INSTALL_FORM_ERROR_REQUIRED', { label: t('CONFIG_FRIGATE_CAMERA_NAME_LABEL') });
        hasErrors = true;
      }

      // Require at least one non-empty input path (full RTSP URL)
      const hasPath = (camera.inputs || []).some(inp => (inp.path || '').trim().length > 0);
      if (!hasPath) {
        cameraErrors.inputs = t('APP_INSTALL_FORM_ERROR_REQUIRED', { label: t('CONFIG_FRIGATE_CAMERA_INPUT_PATH_LABEL') });
        hasErrors = true;
      }

      if (Object.keys(cameraErrors).length > 0) {
        errors[idx] = cameraErrors;
      }
    });

    setValidationErrors(errors);
    return !hasErrors;
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateCameras()) return;
    setFrigateDialogOpen(true);
  };

  const saveFrigateAndRestart = async () => {
    setSaving(true);
    setSuccess('');
    setError('');
    setValidationErrors({});
    try {
      const res = await authenticatedFetch('/api/config/frigate/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cameras }),
      });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      setSuccess(t('CONFIG_FRIGATE_CONFIG_UPDATED'));
    } catch (err: any) {
      setError(String(err));
    } finally {
      setSaving(false);
      setFrigateDialogOpen(false);
    }
  };

  const quotaToBytes = (quota: string) => {
    const normalized = quota.trim().toUpperCase();
    const match = normalized.match(/^([1-9][0-9]*)(M|G|T)$/);
    if (!match) return Number.NaN;
    const value = Number(match[1]);
    const unit = match[2];
    const multiplier = unit === 'T' ? 1024 ** 4 : unit === 'G' ? 1024 ** 3 : 1024 ** 2;
    return value * multiplier;
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes <= 0) return t('CONFIG_SMB_STORAGE_UNKNOWN');
    if (bytes >= 1024 ** 4) return `${(bytes / 1024 ** 4).toFixed(1)} TB`;
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  };


  const getQuotaValidationError = (shares: SmbShare[]) => {
    if (smbShares.storageTotalBytes <= 0) return '';
    const totalRequested = shares.reduce((sum, share) => {
      const bytes = quotaToBytes(share.quota);
      return Number.isFinite(bytes) ? sum + bytes : sum;
    }, 0);
    if (totalRequested > smbShares.storageTotalBytes) {
      return t('CONFIG_SMB_QUOTA_EXCEEDS_TOTAL');
    }
    return '';
  };

  const makeSmbShareId = (name: string) => {
    const slug = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^[^a-z0-9]+/, '')
      .replace(/-+/g, '-')
      .replace(/[-_]+$/g, '')
      .slice(0, 63);

    return slug || `share-${Date.now()}`;
  };

  const normalizeSmbSharesForSave = () => {
    const usedIds = new Set<string>();

    return smbShares.shares
      .map((share) => {
        const name = share.name.trim();
        const existingId = share.id?.trim().toLowerCase();
        const baseId = existingId && /^[a-z0-9][a-z0-9_-]{0,62}$/.test(existingId) ? existingId : makeSmbShareId(name);
        let id = baseId;
        let suffix = 2;

        while (usedIds.has(id)) {
          const suffixText = `-${suffix++}`;
          id = `${baseId.slice(0, 63 - suffixText.length)}${suffixText}`;
        }

        usedIds.add(id);

        const result: SmbShare = {
          id,
          name,
          quota: share.quota.trim().toUpperCase(),
          type: share.type,
        };
        if (share.dataset) {
          result.dataset = share.dataset;
        }
        if (share.mountpoint) {
          result.mountpoint = share.mountpoint;
        }
        return result;
      });
  };

  const validateSmbShares = (shares: SmbShare[]) => {
    const seenIds = new Set<string>();
    const seen = new Set<string>();
    const idPattern = /^[a-z0-9][a-z0-9_-]{0,62}$/;
    const namePattern = /^[A-Za-z0-9][A-Za-z0-9_ -]{0,62}$/;
    const quotaPattern = /^[1-9][0-9]*(M|G|T)$/;

    for (const share of shares) {
      if (!share.id || !idPattern.test(share.id)) {
        throw new Error(t('CONFIG_SMB_SHARE_NAME_INVALID'));
      }
      if (!namePattern.test(share.name)) {
        throw new Error(t('CONFIG_SMB_SHARE_NAME_INVALID'));
      }
      if (!quotaPattern.test(share.quota)) {
        throw new Error(t('CONFIG_SMB_SHARE_QUOTA_INVALID'));
      }
      if (share.type !== 'macos' && share.type !== 'windows') {
        throw new Error(t('CONFIG_SMB_SHARE_TYPE_INVALID'));
      }

      if (seenIds.has(share.id)) {
        throw new Error(t('CONFIG_SMB_SHARE_NAME_DUPLICATE'));
      }
      seenIds.add(share.id);

      const key = share.name.toLowerCase();
      if (seen.has(key)) {
        throw new Error(t('CONFIG_SMB_SHARE_NAME_DUPLICATE'));
      }
      seen.add(key);
    }

    const quotaError = getQuotaValidationError(shares);
    if (quotaError) throw new Error(quotaError);
  };

  useEffect(() => {
    if (smbSuccess) {
      toast.success(smbSuccess);
    }
  }, [smbSuccess]);

  const saveSmbSharesConfig = async () => {
    setSmbSaving(true);
    setSmbError('');
    setSmbSuccess('');
    try {
      const nextShares = normalizeSmbSharesForSave();
      validateSmbShares(nextShares);

      const payload: { enabled: boolean; shares: SmbShare[]; password?: string; deleteShares?: string[] } = { enabled: smbShares.enabled, shares: nextShares };
      if (smbPassword.trim()) payload.password = smbPassword;
      if (smbDeleteShares.length > 0) payload.deleteShares = smbDeleteShares;

      const res = await authenticatedFetch('/api/config/smb-shares', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || `Request failed: ${res.status}`);
      const savedShares = (data.shares || []).map((share: SmbShare) => ({ ...share, uiId: `smb-share-${smbRowIdRef.current++}` }));
      setSmbShares({ ...SMB_SHARES_DEFAULTS, ...data, shares: savedShares, appliedShares: data.appliedShares || [] });
      if (data?.status === 'error' || data?.error) {
        return false;
      }
      const successMessage = data?.message || t('CONFIG_SMB_SHARES_SAVED');
      setSmbPassword('');
      setSmbDeleteShares([]);
      setSmbSuccess(successMessage);
      return true;
    } catch (e: any) {
      setSmbError(String(e?.message || e));
      return false;
    } finally {
      setSmbSaving(false);
    }
  };

  const removeSmbShare = (shareToRemove: SmbShare) => {
    const normalizedId = shareToRemove.id?.trim().toLowerCase();
    setSmbShares((prev) => ({
      ...prev,
      shares: prev.shares.filter((share) => {
        if (shareToRemove.uiId && share.uiId) {
          return share.uiId !== shareToRemove.uiId;
        }
        return share.id !== shareToRemove.id;
      }),
    }));
    if (normalizedId) {
      setSmbDeleteShares((prev) => Array.from(new Set([...prev, normalizedId])));
    }
  };

  const toggleSmbEnabled = (enabled: boolean) => {
    setSmbError('');
    setSmbSuccess('');
    setSmbShares((prev) => ({ ...prev, enabled }));
  };

  const addSmbShare = () => {
    setSmbShares((prev) => {
      const nextUiId = `smb-share-new-${smbRowIdRef.current++}`;
      const newShare: SmbShare = {
        name: '',
        quota: '500G',
        type: 'macos',
        uiId: nextUiId,
      };
      return {
        ...prev,
        shares: [...prev.shares, newShare],
      };
    });
  };

  const updateSmbShareRow = (index: number, key: keyof SmbShare, value: string) => {
    setSmbShares((prev) => {
      const shares = [...prev.shares];
      if (shares[index]) {
        const nextValue = key === 'quota' ? value.toUpperCase() : value;
        shares[index] = { ...shares[index], [key]: nextValue } as SmbShare;
      }
      return { ...prev, shares };
    });
  };

  return (
    <div className="card d-flex">
      <Tabs value={currentTab}>
        <TabsList>
          <TabsTrigger onClick={() => { setCurrentTab('info'); navigate(`?tab=info`, { replace: true }); }} value="info">
            {t('CONFIG_INFO_TITLE')}
          </TabsTrigger>
          <TabsTrigger onClick={() => { setCurrentTab('frigate'); navigate(`?tab=frigate`, { replace: true }); }} value="frigate">
            {t('CONFIG_FRIGATE_TITLE')}
          </TabsTrigger>
          <TabsTrigger onClick={() => { setCurrentTab('sync'); navigate(`?tab=sync`, { replace: true }); }} value="sync">
            {t('CONFIG_SYNC_TAB_TITLE')}
          </TabsTrigger>
          <TabsTrigger onClick={() => { setCurrentTab('timemachine'); navigate(`?tab=timemachine`, { replace: true }); }} value="timemachine">
            {t('CONFIG_SMB_SHARES_TAB_TITLE')}
          </TabsTrigger>
          <TabsTrigger onClick={() => { setCurrentTab('duplicates'); navigate(`?tab=duplicates`, { replace: true }); }} value="duplicates">
            {t('CONFIG_DUPLICATES_TAB_TITLE')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <div className="card mb-0 p-3">
            {loading ? (
              <div>{t('APP_ACTION_LOADING')}</div>
            ) : (
              <div>
                <div className="text-muted">{t('CONFIG_INFO_INTERNAL_IP_LABEL')}</div>
                <div className="fs-4">{internalIp || 'Unknown'}</div>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="frigate">
          {frigateInstalled ? (
            <div className="card p-3">
              <form onSubmit={onSubmit}>
                {error && (
                  <div className="alert alert-danger" role="alert">
                    {error}
                  </div>
                )}
                {success && (
                  <div className="alert alert-success" role="alert">
                    {success}
                  </div>
                )}

                <div className="d-flex align-items-center justify-content-between mb-2">
                  <h4 className="m-0">{t('CONFIG_FRIGATE_CAMERAS_TITLE')}</h4>
                  <button type="button" className="btn btn-sm btn-primary" onClick={addCamera}>
                    {t('CONFIG_FRIGATE_ADD_CAMERA')}
                  </button>
                </div>

                {cameras.map((cam, idx) => (
                  <div key={idx} className="card mb-3 p-3">
                    <div className="row g-2">
                      <div className="col-md-3">
                        <label className="form-label">{t('CONFIG_FRIGATE_CAMERA_NAME_LABEL')}</label>
                        <input
                          className={`form-control ${validationErrors[idx]?.name ? 'is-invalid' : ''}`}
                          value={cam.name}
                          onChange={(e) => updateCamera(idx, 'name', e.target.value)}
                          required
                        />
                        {validationErrors[idx]?.name && (
                          <div className="invalid-feedback">{validationErrors[idx].name}</div>
                        )}
                      </div>
                      <div className="col-md-3">
                        <label className="form-label">{t('CONFIG_FRIGATE_CAMERA_IP_LABEL')}</label>
                        <input
                          className={`form-control`}
                          value={cam.ip}
                          onChange={(e) => updateCamera(idx, 'ip', e.target.value)}
                        />
                      </div>
                      <div className="col-md-3">
                        <label className="form-label">{t('CONFIG_FRIGATE_CAMERA_USER_LABEL')}</label>
                        <input className="form-control" value={cam.user || ''} onChange={(e) => updateCamera(idx, 'user', e.target.value)} />
                      </div>
                      <div className="col-md-3">
                        <label className="form-label">{t('CONFIG_FRIGATE_CAMERA_PASSWORD_LABEL')}</label>
                        <input className="form-control" type="password" value={cam.password || ''} onChange={(e) => updateCamera(idx, 'password', e.target.value)} />
                      </div>
                      <div className="col-md-6">
                        <label className="form-label">{t('CONFIG_FRIGATE_CAMERA_OBJECTS_LABEL')}</label>
                        <div className="position-relative objects-dropdown">
                          <div
                            className="form-control d-flex flex-wrap gap-1 cursor-pointer"
                            onClick={() => toggleObjectsDropdown(idx)}
                            style={{ minHeight: '38px', cursor: 'pointer' }}
                          >
                            {(cam.objects || []).length > 0 ? (
                              (cam.objects || []).map(obj => (
                                <span key={obj} className="badge bg-primary text-white d-flex align-items-center gap-1">
                                  {obj}
                                  <button
                                    type="button"
                                    className="btn-close btn-close-white"
                                    style={{ fontSize: '0.65em' }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleObjectSelection(idx, obj);
                                    }}
                                  ></button>
                                </span>
                              ))
                            ) : (
                              <span className="text-muted">Select objects to detect...</span>
                            )}
                          </div>

                          {objectsDropdownOpen[idx] && (
                            <div className={`position-absolute w-100 border border-top-0 shadow-sm objects-menu ${isDarkMode ? 'bg-dark' : 'bg-white'}`}
                              style={{
                                zIndex: 1000,
                                maxHeight: '200px',
                                overflowY: 'auto'
                              }}>
                              <div className="p-2 border-bottom" style={{ borderColor: 'var(--bs-border-color)' }}>
                                <input
                                  className="form-control form-control-sm"
                                  placeholder="Search objects..."
                                  value={objectsSearchTerm[idx] || ''}
                                  onChange={(e) => updateObjectsSearch(idx, e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>

                              <div className="list-group list-group-flush">
                                {getFilteredObjects(idx).map(object => (
                                  <button
                                    key={object}
                                    type="button"
                                    className={`list-group-item list-group-item-action d-flex align-items-center gap-2 ${(cam.objects || []).includes(object) ? 'active' : ''
                                      } objects-menu-item`}
                                    onClick={() => toggleObjectSelection(idx, object)}
                                  >
                                    <input
                                      type="checkbox"
                                      className="form-check-input"
                                      checked={(cam.objects || []).includes(object)}
                                      onChange={() => { }}
                                      style={{
                                        backgroundColor: (cam.objects || []).includes(object)
                                          ? 'var(--bs-white)'
                                          : 'transparent',
                                        borderColor: (cam.objects || []).includes(object)
                                          ? 'var(--bs-white)'
                                          : 'var(--bs-border-color)'
                                      }}
                                    />
                                    <span className="text-capitalize" style={{ fontSize: '0.875rem', fontWeight: '500' }}>{object}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="col-md-3">
                        <label className="form-label">{t('CONFIG_FRIGATE_CAMERA_RECORD_LABEL')}</label>
                        <select className="form-select" value={cam.record !== false ? 'true' : 'false'} onChange={(e) => updateCamera(idx, 'record', e.target.value === 'true')}>
                          <option value="true">{t('CONFIG_FRIGATE_CAMERA_RECORD_ENABLED')}</option>
                          <option value="false">{t('CONFIG_FRIGATE_CAMERA_RECORD_DISABLED')}</option>
                        </select>
                      </div>
                      <div className="col-md-3 d-flex align-items-end justify-content-end">
                        <button type="button" className="btn btn-outline-danger" onClick={() => removeCamera(idx)}>
                          {t('CONFIG_FRIGATE_CAMERA_REMOVE')}
                        </button>
                      </div>
                    </div>

                    {/* Single Input Section (one stream per camera) */}
                    <div className="mt-3">
                      <div className="d-flex align-items-center justify-content-between mb-2">
                        <h6 className="m-0">{t('CONFIG_FRIGATE_CAMERA_INPUTS_LABEL')}</h6>
                      </div>

                      {(cam.inputs || []).map((input, inputIdx) => (
                        <div
                          key={inputIdx}
                          className="card mb-2 p-2"
                          style={{ backgroundColor: 'var(--bs-secondary-bg)' }}
                        >
                          <div className="row g-2 align-items-end">
                            <div className="col-md-6">
                              <label className="form-label">{t('CONFIG_FRIGATE_CAMERA_INPUT_PATH_LABEL')}</label>
                              <input
                                className={`form-control form-control-sm ${validationErrors[idx]?.inputs && !input.path.trim() ? 'is-invalid' : ''}`}
                                value={input.path}
                                onChange={(e) => updateInput(idx, inputIdx, 'path', e.target.value)}
                                placeholder="rtsp://admin:L2A32047@192.168.1.3:554/cam/realmonitor?channel=1&subtype=1"
                              />
                              {validationErrors[idx]?.inputs && !input.path.trim() && (
                                <div className="invalid-feedback">{validationErrors[idx].inputs}</div>
                              )}
                            </div>
                            <div className="col-md-4">
                              <label className="form-label">{t('CONFIG_FRIGATE_CAMERA_INPUT_ROLES_LABEL')}</label>
                              <div className="d-flex gap-2 flex-wrap">
                                <div className="form-check">
                                  <input
                                    className="form-check-input"
                                    type="checkbox"
                                    id={`detect-${idx}-${inputIdx}`}
                                    checked={(input.roles || []).includes('detect')}
                                    onChange={(e) => updateInputRoles(idx, inputIdx, 'detect', e.target.checked)}
                                  />
                                  <label className="form-check-label" htmlFor={`detect-${idx}-${inputIdx}`}>
                                    {t('CONFIG_FRIGATE_CAMERA_INPUT_ROLE_DETECT')}
                                  </label>
                                </div>
                                <div className="form-check">
                                  <input
                                    className="form-check-input"
                                    type="checkbox"
                                    id={`record-${idx}-${inputIdx}`}
                                    checked={(input.roles || []).includes('record')}
                                    onChange={(e) => updateInputRoles(idx, inputIdx, 'record', e.target.checked)}
                                  />
                                  <label className="form-check-label" htmlFor={`record-${idx}-${inputIdx}`}>
                                    {t('CONFIG_FRIGATE_CAMERA_INPUT_ROLE_RECORD')}
                                  </label>
                                </div>
                                <div className="form-check">
                                  <input
                                    className="form-check-input"
                                    type="checkbox"
                                    id={`audio-${idx}-${inputIdx}`}
                                    checked={(input.roles || []).includes('audio')}
                                    onChange={(e) => updateInputRoles(idx, inputIdx, 'audio', e.target.checked)}
                                  />
                                  <label className="form-check-label" htmlFor={`audio-${idx}-${inputIdx}`}>
                                    {t('CONFIG_FRIGATE_CAMERA_INPUT_ROLE_AUDIO')}
                                  </label>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                <div className="d-flex justify-content-end">
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving ? t('CONFIG_FRIGATE_SAVE_BUTTON_LOADING') : t('CONFIG_FRIGATE_SAVE_BUTTON')}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="alert alert-warning" role="alert">
              {t('CONFIG_FRIGATE_NOT_INSTALLED_WARNING')}
            </div>
          )}
        </TabsContent>

        <TabsContent value="sync">
          <div className="card p-3">
            <h3 className="mb-2">{t('CONFIG_SYNC_TITLE')}</h3>
            <p className="text-muted mb-3">{t('CONFIG_SYNC_DESCRIPTION')}</p>
            <div className="d-flex gap-2">
              <Button intent="primary" disabled={!jellyfinInstalled} onClick={() => setSyncDialogOpen(true)}>
                {t('CONFIG_SYNC_BUTTON')}
              </Button>
              {!jellyfinInstalled && (
                <span className="text-muted d-flex align-items-center">{t('CONFIG_SYNC_JELLYFIN_NOT_INSTALLED')}</span>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="timemachine">
          <div className="card p-3">
            <h3 className="mb-2">{t('CONFIG_SMB_SHARES_TITLE')}</h3>
            <p className="text-muted mb-3">{t('CONFIG_SMB_SHARES_DESCRIPTION')}</p>

            {(() => {
              const totalBytes = smbShares.storageTotalBytes || 0;
              const freeBytes = smbShares.storageFreeBytes || 0;
              const usedBytes = Math.max(0, totalBytes - freeBytes);
              const usedPercent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;
              return (
                <>
                  <div className="mb-4">
                    <div className="row g-2 align-items-center mb-3">
                      <div className="col-md-6">
                        <label className="form-check form-switch m-0">
                          <input
                            className="form-check-input"
                            type="checkbox"
                            checked={smbShares.enabled}
                            disabled={smbSaving}
                            onChange={(e) => {
                              toggleSmbEnabled(e.target.checked);
                            }}
                          />
                          <span className="form-check-label">{t('CONFIG_SMB_ENABLE_LABEL')}</span>
                        </label>
                      </div>
                      <div className="col-md-6 text-md-end">
                        <Button intent="primary" onClick={() => saveSmbSharesConfig()} disabled={smbSaving}>
                          {smbSaving ? t('CONFIG_SMB_APPLYING') : t('CONFIG_SMB_SAVE_SHARES')}
                        </Button>
                      </div>
                    </div>
                    {!smbShares.enabled && (
                      <div className="mt-2 text-muted mb-3">{t('CONFIG_SMB_ENABLE_HINT')}</div>
                    )}

                    {totalBytes > 0 && (
                      <div className="card p-3 mb-3 border bg-light-subtle">
                        <div className="d-flex justify-content-between align-items-center mb-1">
                          <span className="fw-semibold">{t('CONFIG_SMB_STORAGE_USAGE', 'Storage Usage')}</span>
                          <span className="text-muted small">
                            {t('CONFIG_SMB_STORAGE_VALUES', '{{used}} of {{total}} used ({{percent}}%)', {
                              used: formatBytes(usedBytes),
                              total: formatBytes(totalBytes),
                              percent: usedPercent.toFixed(1),
                            })}
                          </span>
                        </div>
                        <div className="progress" style={{ height: '8px' }}>
                          <div
                            className={`progress-bar ${usedPercent > 90 ? 'bg-danger' : usedPercent > 75 ? 'bg-warning' : 'bg-success'}`}
                            role="progressbar"
                            style={{ width: `${usedPercent}%` }}
                            aria-valuenow={usedPercent}
                            aria-valuemin={0}
                            aria-valuemax={100}
                          />
                        </div>
                        <div className="d-flex justify-content-between mt-1 text-muted small">
                          <span>{t('CONFIG_SMB_STORAGE_FREE', '{{free}} free', { free: formatBytes(freeBytes) })}</span>
                          <span>{usedPercent.toFixed(0)}%</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {smbShares.enabled && (
                    <>
                      <div className="mb-4">
                        <h5 className="mb-2">{t('CONFIG_SMB_CREDENTIALS_TITLE')}</h5>
                        <div className="row g-2 align-items-end">
                          <div className="col-md-4">
                            <label className="form-label">{t('CONFIG_SMB_USERNAME')}</label>
                            <input className="form-control" value={smbShares.username} disabled />
                          </div>
                          <div className="col-md-8">
                            <label className="form-label">{t('CONFIG_SMB_PASSWORD_LABEL')}</label>
                            <input
                              className="form-control"
                              type="password"
                              value={smbPassword}
                              onChange={(e) => setSmbPassword(e.target.value)}
                              placeholder={t('CONFIG_SMB_PASSWORD_PLACEHOLDER')}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="d-flex align-items-center justify-content-between mb-2">
                        <h5 className="m-0">{t('CONFIG_SMB_MANAGE_SHARES_TITLE')}</h5>
                        <Button
                          type="button"
                          intent="primary"
                          size="sm"
                          onClick={addSmbShare}
                          disabled={smbSaving}
                        >
                          + {t('CONFIG_SMB_ADD_SHARE_BUTTON')}
                        </Button>
                      </div>

                      <div className="mb-3 text-muted">
                        {smbShares.message || t('CONFIG_SMB_STATUS', { status: smbShares.status })}
                      </div>

                      <div className="d-flex flex-column gap-2 mb-3">
                        {smbShares.shares.map((share, idx) => {
                          const applied = share.id ? smbShares.appliedShares.find((item) => item.id === share.id) : undefined;
                          const isNewShare = !share.id;
                          return (
                            <div key={share.uiId || `smb-share-${idx}`} className="border rounded p-2">
                              <div className="row g-2 align-items-end">
                                <div className="col-md-3">
                                  <label className="form-label">{t('CONFIG_SMB_SHARE_NAME')}</label>
                                  <input
                                    className="form-control"
                                    value={share.name}
                                    onChange={(e) => updateSmbShareRow(idx, 'name', e.target.value)}
                                    placeholder="MyBackup"
                                  />
                                </div>
                                <div className="col-md-2">
                                  <label className="form-label">{t('CONFIG_SMB_SHARE_QUOTA')}</label>
                                  <input
                                    className="form-control"
                                    value={share.quota}
                                    onChange={(e) => updateSmbShareRow(idx, 'quota', e.target.value)}
                                  />
                                </div>
                                <div className="col-md-3">
                                  <label className="form-label">{t('CONFIG_SMB_SHARE_TYPE')}</label>
                                  <select
                                    className="form-select"
                                    value={share.type}
                                    onChange={(e) => updateSmbShareRow(idx, 'type', e.target.value)}
                                  >
                                    <option value="macos">{t('CONFIG_SMB_SHARE_TYPE_MACOS')}</option>
                                    <option value="windows">{t('CONFIG_SMB_SHARE_TYPE_WINDOWS')}</option>
                                  </select>
                                </div>
                                <div className="col-md-2">
                                  <div className="text-muted">{t('CONFIG_SMB_MOUNTPOINT')}</div>
                                  <div className="font-monospace">{applied?.mountpoint || '-'}</div>
                                </div>
                                <div className="col-md-2 d-flex justify-content-end">
                                  <Button
                                    intent="danger"
                                    onClick={() => {
                                      if (isNewShare) {
                                        removeSmbShare(share);
                                      } else {
                                        setSmbDeleteTarget(share);
                                      }
                                    }}
                                    disabled={smbSaving}
                                  >
                                    {t('APP_ACTION_REMOVE')}
                                  </Button>
                                </div>
                              </div>
                              {applied?.dataset && (
                                <div className="mt-2 text-muted font-monospace">
                                  {applied.dataset}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {smbShares.shares.length === 0 && (
                          <div className="text-center py-4 border rounded text-muted d-flex flex-column align-items-center gap-2" style={{ borderStyle: 'dashed' }}>
                            <span>{t('CONFIG_SMB_NO_SHARES')}</span>
                            <Button
                              type="button"
                              intent="secondary"
                              variant="outline"
                              size="sm"
                              onClick={addSmbShare}
                              disabled={smbSaving}
                            >
                              + {t('CONFIG_SMB_ADD_SHARE_BUTTON')}
                            </Button>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </>
              );
            })()}
          </div>
        </TabsContent>

        {/* Duplicates */}
        <TabsContent value="duplicates">
          <div className="card p-3">
            <h3 className="mb-3">{t('CONFIG_DUPLICATES_TITLE')}</h3>
            <DuplicatesTab />
          </div>
        </TabsContent>
      </Tabs>

      {/* Frigate restart dialog */}
      <Dialog open={frigateDialogOpen} onOpenChange={setFrigateDialogOpen}>
        <DialogContent size="sm" type="warning">
          <DialogHeader>
            <DialogTitle>{t('CONFIG_FRIGATE_RESTART_DIALOG_TITLE')}</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            <span className="text-muted">{t('CONFIG_FRIGATE_RESTART_DIALOG_SUBTITLE')}</span>
          </DialogDescription>
          <DialogFooter>
            <Button onClick={() => setFrigateDialogOpen(false)}>{t('ACTIONS_CANCEL')}</Button>
            <Button intent="warning" onClick={saveFrigateAndRestart} disabled={saving}>
              {t('APP_ACTION_RESTART')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Jellyfin sync dialog */}
      <Dialog open={syncDialogOpen} onOpenChange={setSyncDialogOpen}>
        <DialogContent size="sm" type="warning">
          <DialogHeader>
            <DialogTitle>{t('CONFIG_SYNC_DIALOG_TITLE')}</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            <span className="text-muted">{t('CONFIG_SYNC_DIALOG_SUBTITLE')}</span>
          </DialogDescription>
          <DialogFooter>
            <Button onClick={() => setSyncDialogOpen(false)}>{t('ACTIONS_CANCEL')}</Button>
            <Button
              intent="warning"
              onClick={async () => {
                try {
                  const res = await authenticatedFetch('/api/config/sync/jellyfin', { method: 'POST' });
                  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
                  setSuccess(t('CONFIG_SYNC_SUCCESS'));
                } catch (e: any) {
                  setError(String(e));
                } finally {
                  setSyncDialogOpen(false);
                }
              }}
            >
              {t('CONFIG_SYNC_DIALOG_CONFIRM')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(smbDeleteTarget)} onOpenChange={(open) => {
        if (!open) setSmbDeleteTarget(null);
      }}>
        <DialogContent size="sm" type="danger">
          <DialogHeader>
            <DialogTitle>{t('CONFIG_SMB_DELETE_DIALOG_TITLE')}</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            <span className="text-muted">
              {t('CONFIG_SMB_DELETE_DIALOG_SUBTITLE', { name: smbDeleteTarget?.name || '' })}
            </span>
          </DialogDescription>
          <DialogFooter>
            <Button onClick={() => setSmbDeleteTarget(null)}>{t('ACTIONS_CANCEL')}</Button>
            <Button
              intent="danger"
              onClick={() => {
                if (!smbDeleteTarget) return;
                removeSmbShare(smbDeleteTarget);
                setSmbDeleteTarget(null);
              }}
              disabled={smbSaving}
            >
              {smbSaving ? t('CONFIG_SMB_APPLYING') : t('CONFIG_SMB_DELETE_CONFIRM')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
