import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { forgotPassword } from '../../lib/api/auth';
import { getAuthStatusCode } from './auth-error';

const GENERIC_SUCCESS = 'If an account exists, a reset link has been sent.';
const RATE_LIMIT_MESSAGE = 'Too many reset attempts. Please wait a moment and try again.';

export function useForgotPassword() {
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const mutation = useMutation({
    mutationFn: async (email: string) => forgotPassword(email),
    onSuccess: () => {
      setErrorMessage('');
      setSuccessMessage(GENERIC_SUCCESS);
    },
    onError: (error) => {
      const statusCode = getAuthStatusCode(error);
      if (statusCode === 429) {
        setSuccessMessage('');
        setErrorMessage(RATE_LIMIT_MESSAGE);
        return;
      }
      setErrorMessage('');
      setSuccessMessage(GENERIC_SUCCESS);
    },
  });

  const submitForgotPassword = async (email: string) => {
    setErrorMessage('');
    setSuccessMessage('');
    await mutation.mutateAsync(email);
  };

  return {
    submitForgotPassword,
    isSubmitting: mutation.isPending,
    successMessage,
    errorMessage,
  };
}
