import { useUIStore } from '@/stores/ui-store';
import type { FC } from 'react';

export const Footer: FC = () => {
  const darkMode = useUIStore((s) => s.darkMode);
  const logoSrc = darkMode ? '/logo-white.png' : '/logo.png';

  return (
    <footer className="py-3 border-top bg-body">
      <div className="container-xl">
        <div className="d-flex justify-content-center align-items-center gap-2">
          <span className="text-muted">Powered by</span>
          <a 
            href="https://dspworks.in/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="d-flex align-items-center"
            style={{ textDecoration: 'none' }}
          >
            <img
              src={logoSrc}
              alt="Company logo"
              height={20}
              style={{ maxHeight: 20, height: 20, width: 'auto' }}
            />
          </a>
        </div>
      </div>
    </footer>
  );
};