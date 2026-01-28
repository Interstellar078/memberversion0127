import { User, AuditLog, UserRole } from '../types';
import { apiGet, apiPost, apiDelete, apiPut, setAuthToken, getAuthToken } from './apiClient';

const normalizeRole = (role?: string): UserRole => {
  if (role === 'admin' || role === 'super_admin') return role as UserRole;
  return 'user';
};

const toUser = (raw: any): User => ({
  username: raw?.username || '',
  password: '',
  role: normalizeRole(raw?.role),
  createdAt: typeof raw?.createdAt === 'number' ? raw.createdAt : Date.now()
});

export const AuthService = {
  init: async () => {},

  getUsers: async (): Promise<User[]> => {
    try {
      const users = await apiGet<User[]>(`/api/admin/users`);
      return Array.isArray(users) ? users.map(u => toUser(u)) : [];
    } catch {
      return [];
    }
  },

  updateUserRole: async (targetUsername: string, newRole: UserRole, operator: User): Promise<boolean> => {
    if (operator.role !== 'admin' && operator.role !== 'super_admin') return false;
    if (targetUsername === operator.username) return false;
    try {
      await apiPut(`/api/admin/users/${encodeURIComponent(targetUsername)}/role`, { role: newRole === 'admin' ? 'admin' : 'user' });
      return true;
    } catch {
      return false;
    }
  },

  adminResetPassword: async (targetUsername: string, newPassword: string, operator: User): Promise<{ success: boolean, message: string }> => {
    if (operator.role !== 'admin' && operator.role !== 'super_admin') return { success: false, message: '权限不足' };
    try {
      await apiPost(`/api/admin/users/${encodeURIComponent(targetUsername)}/reset-password`, { password: newPassword });
      return { success: true, message: '密码重置成功' };
    } catch (err: any) {
      return { success: false, message: err?.message || '重置失败' };
    }
  },

  register: async (username: string, password: string): Promise<{ success: boolean, message: string }> => {
    try {
      const result = await apiPost<{ success: boolean; message: string; user?: User; token?: string }>(`/api/auth/register`, {
        username,
        password
      });
      if (result.success && result.token) setAuthToken(result.token);
      return { success: result.success, message: result.message };
    } catch (err: any) {
      return { success: false, message: err?.message || '注册失败' };
    }
  },

  login: async (username: string, password: string): Promise<{ success: boolean, user?: User, message: string }> => {
    try {
      const result = await apiPost<{ success: boolean; message: string; user?: User; token?: string }>(`/api/auth/login`, {
        username,
        password
      });
      if (result.success && result.token) setAuthToken(result.token);
      return { success: result.success, user: result.user ? toUser(result.user) : undefined, message: result.message };
    } catch (err: any) {
      return { success: false, message: err?.message || '登录失败' };
    }
  },

  logout: async () => {
    try {
      await apiPost(`/api/auth/logout`);
    } catch {
      // ignore
    }
    setAuthToken(null);
  },

  getCurrentUser: async (): Promise<User | null> => {
    if (!getAuthToken()) return null;
    try {
      const user = await apiGet<User>(`/api/auth/me`);
      return toUser(user);
    } catch {
      setAuthToken(null);
      return null;
    }
  },

  deleteUser: async (username: string, operator: User): Promise<boolean> => {
    if (operator.role !== 'admin' && operator.role !== 'super_admin') return false;
    try {
      const result = await apiDelete<{ success: boolean }>(`/api/admin/users/${encodeURIComponent(username)}`);
      return result.success;
    } catch {
      return false;
    }
  },

  logAction: async (username: string, action: string, details: string) => {
    console.log(`[Audit] ${username} ${action}: ${details}`);
  },

  getLogs: async (): Promise<AuditLog[]> => {
    try {
      return await apiGet<AuditLog[]>(`/api/admin/logs`);
    } catch {
      return [];
    }
  }
};
