import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { useDisclosure } from '@/lib/hooks/use-disclosure';
import type { TranslatableError } from '@/types/error.types';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

const updateSystem = async () => {
  const response = await fetch('/api/system/update', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error('Failed to update system');
  }
  
  return response.json();
};

export const UpdateModal = () => {
  const UpdateModalDisclosure = useDisclosure();
  const { t } = useTranslation();

  const update = useMutation({
    mutationFn: updateSystem,
    onSuccess: () => {
      toast.success(t('SETTINGS_ACTIONS_UPDATE_SUCCESS'));
      UpdateModalDisclosure.close();
    },
    onError: (e: TranslatableError) => {
      toast.error(t(e.message, e.intlParams));
    },
  });

  return (
    <div>
      <Button onClick={() => UpdateModalDisclosure.open()}>{t('SETTINGS_ACTIONS_UPDATE_MODAL_BUTTON')}</Button>
      <Dialog open={UpdateModalDisclosure.isOpen} onOpenChange={UpdateModalDisclosure.toggle}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{t('SETTINGS_ACTIONS_UPDATE_TITLE')}</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            <span className="text-muted">{t('SETTINGS_ACTIONS_UPDATE_MODAL_SUBTITLE')}</span>
          </DialogDescription>
          <DialogFooter>
            <Button intent="success" loading={update.isPending} onClick={() => update.mutate()}>
              {t('SETTINGS_ACTIONS_UPDATE_MODAL_BUTTON')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
