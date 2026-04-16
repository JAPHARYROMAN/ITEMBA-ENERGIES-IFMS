import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAppStore, useAuthStore } from '../../store';
import { normalizeAuthError } from './auth-error';

interface LoginInput {
  email: string;
  password: string;
  nextPath?: string;
}

export function useLogin() {
  const navigate = useNavigate();
  const { addToast } = useAppStore();
  const loginWithCredentials = useAuthStore((state) => state.loginWithCredentials);

  const mutation = useMutation({
    mutationFn: async ({ email, password }: LoginInput) => {
      if (!loginWithCredentials) {
        throw new Error('Authentication flow is not configured.');
      }
      await loginWithCredentials(email, password);
    },
    onSuccess: (_data, variables) => {
      addToast('Signed in', 'success');
      const safeNext = variables.nextPath?.startsWith('/app/') ? variables.nextPath : '/app/dashboard';
      navigate(safeNext);
    },
  });

  return {
    submitLogin: mutation.mutateAsync,
    isSubmitting: mutation.isPending,
    errorMessage: mutation.isError ? normalizeAuthError(mutation.error) : '',
    resetError: mutation.reset,
  };
}
