import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { useDisclosure } from '@/lib/hooks/use-disclosure';
import type { TranslatableError } from '@/types/error.types';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

const restartSystem = async () => {
  const response = await fetch('/api/system/restart', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error('Failed to restart system');
  }
  
  return response.json();
};

export const RestartModal = () => {
  const RestartModalDisclosure = useDisclosure();
  const { t } = useTranslation();

  const restart = useMutation({
    mutationFn: restartSystem,
    onSuccess: () => {
      toast.success(t('SETTINGS_ACTIONS_RESTART_SUCCESS'));
      RestartModalDisclosure.close();
    },
    onError: (e: TranslatableError) => {
      toast.error(t(e.message, e.intlParams));
    },
  });

  return (
    <div>
      <Button onClick={() => RestartModalDisclosure.open()}>{t('SETTINGS_ACTIONS_RESTART_MODAL_BUTTON')}</Button>
      <Dialog open={RestartModalDisclosure.isOpen} onOpenChange={RestartModalDisclosure.toggle}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{t('SETTINGS_ACTIONS_RESTART_TITLE')}</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            <span className="text-muted">{t('SETTINGS_ACTIONS_RESTART_MODAL_SUBTITLE')}</span>
          </DialogDescription>
          <DialogFooter>
            <Button intent="success" loading={restart.isPending} onClick={() => restart.mutate()}>
              {t('SETTINGS_ACTIONS_RESTART_MODAL_BUTTON')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
