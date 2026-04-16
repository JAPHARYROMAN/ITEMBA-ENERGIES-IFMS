import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { resetPassword } from '../../lib/api/auth';
import { getAuthStatusCode, normalizeAuthError } from './auth-error';

export function useResetPassword() {
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const mutation = useMutation({
    mutationFn: async ({ token, newPassword }: { token: string; newPassword: string }) =>
      resetPassword(token, newPassword),
    onSuccess: () => {
      setErrorMessage('');
      setSuccessMessage('Password reset successfully. You can now sign in with your new password.');
    },
    onError: (error) => {
      setSuccessMessage('');
      const statusCode = getAuthStatusCode(error);
      if (statusCode === 400) {
        setErrorMessage('Invalid or expired reset link. Please request a new one.');
        return;
      }
      if (statusCode === 429) {
        setErrorMessage('Too many attempts. Please wait a moment and try again.');
        return;
      }
      setErrorMessage(normalizeAuthError(error));
    },
  });

  const submitResetPassword = async (token: string, newPassword: string) => {
    setErrorMessage('');
    setSuccessMessage('');
    await mutation.mutateAsync({ token, newPassword });
  };

  return {
    submitResetPassword,
    isSubmitting: mutation.isPending,
    successMessage,
    errorMessage,
  };
}
