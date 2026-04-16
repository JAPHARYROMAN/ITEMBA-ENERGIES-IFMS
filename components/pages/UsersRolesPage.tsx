import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, UserPlus, Ban, CheckCircle2, XCircle } from 'lucide-react';
import PageHeader from '../ifms/PageHeader';
import FilterBar from '../ifms/FilterBar';
import { IFMSDataTable } from '../ifms/DataTable';
import { TableSkeleton } from '../ifms/Skeletons';
import DetailsDrawer from '../ifms/DetailsDrawer';
import { ExportButton } from '../ifms/ExportButton';
import { hasAnyPermission, useAppStore, useAuthStore } from '../../store';
import { apiFetch } from '../../lib/api/client';
import { permissionGroups } from '../../lib/permissions';

interface UserRecord {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  createdAt: string;
  roles?: string[];
}

interface RoleRecord {
  code: string;
  name: string;
  description: string | null;
}

async function fetchUsers(): Promise<UserRecord[]> {
  return apiFetch<UserRecord[]>('auth/users');
}

async function fetchRoles(): Promise<RoleRecord[]> {
  return apiFetch<RoleRecord[]>('auth/roles');
}

export default function UsersRolesPage() {
  const { t } = useTranslation();
  const { addToast } = useAppStore();
  const { user } = useAuthStore();
  const canManageUsers = hasAnyPermission(user, permissionGroups.usersAdmin);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUserForm, setNewUserForm] = useState({
    name: '',
    email: '',
    password: '',
  });
  const [selectedRoleCode, setSelectedRoleCode] = useState('');

  const usersQuery = useQuery({
    queryKey: ['admin-users'],
    queryFn: fetchUsers,
  });
  const rolesQuery = useQuery({
    queryKey: ['admin-roles'],
    queryFn: fetchRoles,
  });

  const users = usersQuery.data ?? [];
  const roles = rolesQuery.data ?? [];

  const filtered = useMemo(() => {
    if (!search) return users;
    const q = search.toLowerCase();
    return users.filter(
      (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    );
  }, [users, search]);

  const createUserMutation = useMutation({
    mutationFn: (data: { name: string; email: string; password: string }) =>
      apiFetch('auth/users', { method: 'POST', body: data }),
    onSuccess: () => {
      addToast(t('users.userCreated'), 'success');
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setShowCreateUser(false);
      setNewUserForm({ name: '', email: '', password: '' });
    },
    onError: (err: any) => addToast(err?.apiError?.message ?? 'Failed to create user', 'error'),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ userId, isActive }: { userId: string; isActive: boolean }) =>
      apiFetch(`auth/users/${userId}/status`, {
        method: 'PATCH',
        body: { isActive },
      }),
    onSuccess: () => {
      addToast(t('users.userUpdated', { defaultValue: 'User status updated' }), 'success');
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (err: any) => addToast(err?.apiError?.message ?? 'Failed to update status', 'error'),
  });

  const assignRoleMutation = useMutation({
    mutationFn: ({ userId, roleCode }: { userId: string; roleCode: string }) =>
      apiFetch(`auth/users/${userId}/roles`, {
        method: 'POST',
        body: { roleCode },
      }),
    onSuccess: () => {
      addToast(t('users.role', { defaultValue: 'Role assigned' }), 'success');
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (err: any) => addToast(err?.apiError?.message ?? 'Failed to assign role', 'error'),
  });

  const removeRoleMutation = useMutation({
    mutationFn: ({ userId, roleCode }: { userId: string; roleCode: string }) =>
      apiFetch(`auth/users/${userId}/roles/${roleCode}`, { method: 'DELETE' }),
    onSuccess: () => {
      addToast(t('users.userDeleted', { defaultValue: 'Role removed' }), 'success');
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (err: any) => addToast(err?.apiError?.message ?? 'Failed to remove role', 'error'),
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader
        title={t('pages.usersTitle')}
        description={t('pages.usersDesc')}
        icon={ShieldCheck}
        actions={
          <div className="flex items-center gap-2">
            <ExportButton
              exportType="tables.any"
              params={{
                title: 'Users Export',
                columns: [
                  { header: 'Name', accessorKey: 'name' },
                  { header: 'Email', accessorKey: 'email' },
                  { header: 'Active', accessorKey: 'isActive' },
                  { header: 'Created', accessorKey: 'createdAt' },
                ],
                rows: filtered,
              }}
              label={t('common.export')}
            />
            <button
              onClick={() => setShowCreateUser(true)}
              disabled={!canManageUsers}
              className="px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:opacity-90 transition-all flex items-center gap-2"
            >
              <UserPlus size={14} /> {t('users.createUser')}
            </button>
          </div>
        }
      />

      <FilterBar onSearch={setSearch} showDate={false} />

      {usersQuery.isLoading ? (
        <div className="bg-card border border-border rounded-xl p-8">
          <TableSkeleton />
        </div>
      ) : (
        <IFMSDataTable
          data={filtered}
          onRowClick={(row: UserRecord) => setSelectedUser(row)}
          columns={[
            { header: 'Name', accessorKey: 'name' },
            { header: 'Email', accessorKey: 'email' },
            {
              header: 'Status',
              accessorKey: 'isActive',
              cell: (r: UserRecord) => (
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${
                    r.isActive
                      ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                      : 'bg-rose-100 text-rose-700 border-rose-200'
                  }`}
                >
                  {r.isActive ? 'Active' : 'Disabled'}
                </span>
              ),
            },
            {
              header: 'Roles',
              accessorKey: 'roles',
              cell: (r: UserRecord) => (
                <div className="flex flex-wrap gap-1">
                  {(r.roles ?? []).map((role) => (
                    <span
                      key={role}
                      className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-blue-100 text-blue-700 border border-blue-200"
                    >
                      {role}
                    </span>
                  ))}
                  {(!r.roles || r.roles.length === 0) && (
                    <span className="text-xs text-muted-foreground">No roles</span>
                  )}
                </div>
              ),
            },
            {
              header: 'Created',
              accessorKey: 'createdAt',
              cell: (r: UserRecord) => (
                <span className="text-xs">{new Date(r.createdAt).toLocaleDateString()}</span>
              ),
            },
          ]}
        />
      )}

      {/* User Detail Drawer */}
      <DetailsDrawer
        isOpen={!!selectedUser}
        onClose={() => setSelectedUser(null)}
        title="User Detail"
        subtitle={selectedUser ? `${selectedUser.name} — ${selectedUser.email}` : ''}
      >
        {selectedUser && (
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-muted/20 rounded-xl border border-border">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Name
                </p>
                <p className="text-sm font-bold mt-1">{selectedUser.name}</p>
              </div>
              <div className="p-3 bg-muted/20 rounded-xl border border-border">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Email
                </p>
                <p className="text-sm font-bold mt-1">{selectedUser.email}</p>
              </div>
              <div className="p-3 bg-muted/20 rounded-xl border border-border">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Status
                </p>
                <p className="text-sm font-bold mt-1">
                  {selectedUser.isActive ? 'Active' : 'Disabled'}
                </p>
              </div>
              <div className="p-3 bg-muted/20 rounded-xl border border-border">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Created
                </p>
                <p className="text-sm font-bold mt-1">
                  {new Date(selectedUser.createdAt).toLocaleString()}
                </p>
              </div>
            </div>

            {/* Toggle Status */}
            <div className="flex gap-2">
              <button
                disabled={!canManageUsers}
                onClick={() =>
                  toggleStatusMutation.mutate({
                    userId: selectedUser.id,
                    isActive: !selectedUser.isActive,
                  })
                }
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border transition-all ${
                  selectedUser.isActive
                    ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                }`}
              >
                {selectedUser.isActive ? (
                  <>
                    <Ban size={14} /> Disable User
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={14} /> Enable User
                  </>
                )}
              </button>
            </div>

            {/* Roles */}
            <div>
              <h4 className="text-xs font-black uppercase tracking-[0.2em] text-primary border-b border-border pb-2 mb-3">
                Roles
              </h4>
              <div className="space-y-2">
                {(selectedUser.roles ?? []).map((role) => (
                  <div
                    key={role}
                    className="flex items-center justify-between p-3 bg-muted/20 rounded-xl border border-border"
                  >
                    <span className="text-sm font-bold">{role}</span>
                    <button
                      disabled={!canManageUsers}
                      onClick={() =>
                        removeRoleMutation.mutate({
                          userId: selectedUser.id,
                          roleCode: role,
                        })
                      }
                      className="flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase text-rose-600 hover:bg-rose-50 rounded transition-colors"
                    >
                      <XCircle size={12} /> Remove
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 mt-3">
                <select
                  value={selectedRoleCode}
                  onChange={(e) => setSelectedRoleCode(e.target.value)}
                  className="flex-1 px-3 py-2 border border-border rounded-xl text-xs font-bold bg-card"
                >
                  <option value="">Select role...</option>
                  {roles
                    .filter((r) => !(selectedUser.roles ?? []).includes(r.code))
                    .map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.name}
                      </option>
                    ))}
                </select>
                <button
                  onClick={() => {
                    if (selectedRoleCode) {
                      assignRoleMutation.mutate({
                        userId: selectedUser.id,
                        roleCode: selectedRoleCode,
                      });
                      setSelectedRoleCode('');
                    }
                  }}
                  disabled={!selectedRoleCode || !canManageUsers}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-40"
                >
                  Assign
                </button>
              </div>
            </div>
          </div>
        )}
      </DetailsDrawer>

      {/* Create User Drawer */}
      <DetailsDrawer
        isOpen={showCreateUser}
        onClose={() => setShowCreateUser(false)}
        title="Create User"
        subtitle="Add a new user account"
      >
        <div className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-black uppercase tracking-wider text-muted-foreground">
              Full Name
            </label>
            <input
              type="text"
              value={newUserForm.name}
              onChange={(e) => setNewUserForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/35"
              placeholder="Jane Doe"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-black uppercase tracking-wider text-muted-foreground">
              Email
            </label>
            <input
              type="email"
              value={newUserForm.email}
              onChange={(e) => setNewUserForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/35"
              placeholder="jane@company.com"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-black uppercase tracking-wider text-muted-foreground">
              Password
            </label>
            <input
              type="password"
              value={newUserForm.password}
              onChange={(e) => setNewUserForm((f) => ({ ...f, password: e.target.value }))}
              className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/35"
              placeholder="Min 8 characters"
              autoComplete="new-password"
            />
          </div>
          <button
            onClick={() => createUserMutation.mutate(newUserForm)}
            disabled={
              !canManageUsers ||
              createUserMutation.isPending ||
              !newUserForm.name ||
              !newUserForm.email ||
              newUserForm.password.length < 8
            }
            className="w-full px-4 py-3 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-40"
          >
            {createUserMutation.isPending ? 'Creating...' : 'Create User'}
          </button>
        </div>
      </DetailsDrawer>
    </div>
  );
}
