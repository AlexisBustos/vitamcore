import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

interface ChangePasswordBody {
  currentPassword?: string;
  newPassword: string;
}

/** Cambia la contraseña y refresca la sesión para actualizar el flag. */
export function useChangePassword() {
  const { refresh } = useAuth();
  return useMutation({
    mutationFn: (body: ChangePasswordBody) =>
      api.post('/auth/change-password', body),
    onSuccess: () => refresh(),
  });
}
