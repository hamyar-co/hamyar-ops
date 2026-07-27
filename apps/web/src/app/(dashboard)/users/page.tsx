'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { formatDate } from '@/lib/format';
import { CustomButton } from '@/components/ui/CustomButton';
import { CustomInput } from '@/components/ui/CustomInput';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { CustomBadge } from '@/components/ui/CustomBadge';
import { CustomModal } from '@/components/ui/CustomModal';

interface User {
  id: string;
  username: string;
  email: string;
  role: 'ADMIN' | 'VIEWER';
  totpEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

const emptyCreate = { username: '', email: '', password: '', role: 'VIEWER' as const };

const ROLE_OPTIONS = [
  { value: 'VIEWER', label: 'Viewer (Read-only)' },
  { value: 'ADMIN', label: 'Administrator (Full Access)' },
];

export default function UsersPage() {
  const currentUser = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const [modal, setModal] = useState<'create' | 'edit' | 'password' | null>(null);
  const [selected, setSelected] = useState<User | null>(null);
  const [createForm, setCreateForm] = useState(emptyCreate);
  const [editForm, setEditForm] = useState({ username: '', email: '', role: 'VIEWER' as 'ADMIN' | 'VIEWER' });
  const [resetPw, setResetPw] = useState('');
  const [error, setError] = useState('');

  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => apiClient.get('/users').then((r) => r.data),
  });

  const refetch = () => qc.invalidateQueries({ queryKey: ['users'] });

  const createUser = useMutation({
    mutationFn: () => apiClient.post('/users', createForm),
    onSuccess: () => { refetch(); setModal(null); setCreateForm(emptyCreate); setError(''); },
    onError: (e: any) => setError(e.response?.data?.message || 'Failed to create user'),
  });

  const updateUser = useMutation({
    mutationFn: () => apiClient.patch(`/users/${selected!.id}`, editForm),
    onSuccess: () => { refetch(); setModal(null); setError(''); },
    onError: (e: any) => setError(e.response?.data?.message || 'Failed to update user'),
  });

  const resetPassword = useMutation({
    mutationFn: () => apiClient.patch(`/users/${selected!.id}/reset-password`, { newPassword: resetPw }),
    onSuccess: () => { setModal(null); setResetPw(''); setError(''); },
    onError: (e: any) => setError(e.response?.data?.message || 'Failed to reset password'),
  });

  const deleteUser = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/users/${id}`),
    onSuccess: () => refetch(),
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">User Management</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Manage administrative accounts, role-based access, 2FA status, and password resets.
          </p>
        </div>
        <CustomButton size="sm" onClick={() => { setCreateForm(emptyCreate); setError(''); setModal('create'); }} icon={<span>+</span>}>
          Add User
        </CustomButton>
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-xs font-semibold text-muted-foreground uppercase">
                <th className="px-5 py-3">Username & Email</th>
                <th className="px-5 py-3">Role</th>
                <th className="px-5 py-3">2FA Status</th>
                <th className="px-5 py-3">Last Login</th>
                <th className="px-5 py-3">Created</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-xs text-muted-foreground">Loading user accounts...</td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-xs text-muted-foreground">No accounts found</td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="hover:bg-surface-2/50 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-foreground">
                      <div>
                        <p className="font-semibold text-xs text-foreground">{u.username}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <CustomBadge variant={u.role === 'ADMIN' ? 'info' : 'outline'}>
                        {u.role}
                      </CustomBadge>
                    </td>
                    <td className="px-5 py-3.5">
                      <CustomBadge variant={u.totpEnabled ? 'success' : 'warning'}>
                        {u.totpEnabled ? 'Enabled' : 'Disabled'}
                      </CustomBadge>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-muted-foreground">
                      {u.lastLoginAt ? formatDate(u.lastLoginAt) : 'Never'}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-muted-foreground">
                      {formatDate(u.createdAt)}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <CustomButton
                          size="sm"
                          variant="ghost"
                          onClick={() => { setSelected(u); setEditForm({ username: u.username, email: u.email, role: u.role }); setModal('edit'); }}
                        >
                          Edit
                        </CustomButton>
                        <CustomButton
                          size="sm"
                          variant="ghost"
                          onClick={() => { setSelected(u); setResetPw(''); setModal('password'); }}
                        >
                          Reset Pass
                        </CustomButton>
                        {currentUser?.id !== u.id && (
                          <CustomButton
                            size="sm"
                            variant="ghost"
                            className="text-error hover:bg-error/10"
                            onClick={() => deleteUser.mutate(u.id)}
                          >
                            Delete
                          </CustomButton>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create User Modal */}
      {modal === 'create' && (
        <CustomModal
          isOpen={true}
          onClose={() => setModal(null)}
          title="Add New User Account"
          description="Create a new administrator or viewer user."
        >
          <div className="space-y-4">
            {error && <div className="p-3 rounded-lg bg-error/10 border border-error/20 text-xs text-error">{error}</div>}
            <CustomInput
              label="Username"
              placeholder="e.g. jared_ops"
              value={createForm.username}
              onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
            />
            <CustomInput
              label="Email Address"
              placeholder="e.g. jared@hamyar.io"
              value={createForm.email}
              onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
            />
            <CustomInput
              label="Initial Password"
              type="password"
              placeholder="••••••••••••"
              value={createForm.password}
              onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
            />
            <CustomSelect
              label="Access Role"
              value={createForm.role}
              onChange={(v) => setCreateForm({ ...createForm, role: v as any })}
              options={ROLE_OPTIONS}
            />
            <div className="flex justify-end gap-2 pt-2">
              <CustomButton variant="outline" onClick={() => setModal(null)}>Cancel</CustomButton>
              <CustomButton
                loading={createUser.isPending}
                disabled={!createForm.username || !createForm.email || !createForm.password}
                onClick={() => createUser.mutate()}
              >
                Create Account
              </CustomButton>
            </div>
          </div>
        </CustomModal>
      )}
    </div>
  );
}
