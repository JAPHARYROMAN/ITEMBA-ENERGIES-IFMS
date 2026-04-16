import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store';
import { checkSignupAvailability, signup } from '../../lib/api/auth';
import { isSignupEndpointMissing, normalizeAuthError } from './auth-error';

interface SignupInput {
  name: string;
  email: string;
  password: string;
}

const INVITE_ONLY_MESSAGE = 'Accounts are created by administrators';

export function useSignup() {
  const navigate = useNavigate();
  const { addToast } = useAppStore();
  const [inviteOnlyMode, setInviteOnlyMode] = useState(false);

  const mutation = useMutation({
    mutationFn: async (payload: SignupInput) => {
      return signup(payload);
    },
    onSuccess: () => {
      addToast('Account created. You can now sign in.', 'success');
      navigate('/login');
    },
    onError: (error) => {
      if (isSignupEndpointMissing(error)) {
        setInviteOnlyMode(true);
      }
    },
  });

  useEffect(() => {
    let cancelled = false;
    const probe = async () => {
      const available = await checkSignupAvailability();
      if (!cancelled && !available) {
        setInviteOnlyMode(true);
      }
    };
    probe().catch(() => {
      // Keep default state on probe failure; submit path still handles explicit endpoint errors.
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const errorMessage = inviteOnlyMode
    ? INVITE_ONLY_MESSAGE
    : mutation.isError
      ? normalizeAuthError(mutation.error)
      : '';

  return {
    submitSignup: mutation.mutateAsync,
    isSubmitting: mutation.isPending,
    inviteOnlyMode,
    inviteOnlyMessage: INVITE_ONLY_MESSAGE,
    errorMessage,
    resetError: mutation.reset,
  };
}
