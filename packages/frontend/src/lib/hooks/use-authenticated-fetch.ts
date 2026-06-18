import { useUserContext } from '@/context/user-context';
import { useCallback } from 'react';
import { useNavigate } from 'react-router';

export const useAuthenticatedFetch = () => {
  const navigate = useNavigate();
  const { setUserContext } = useUserContext();

  return useCallback(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await fetch(input, {
        ...init,
        credentials: 'include',
      });

      if (response.status === 401 || response.status === 403) {
        setUserContext({ isLoggedIn: false });
        navigate('/login', { replace: true });
        throw new Error('Session expired. Please log in again.');
      }

      return response;
    },
    [navigate, setUserContext],
  );
};
