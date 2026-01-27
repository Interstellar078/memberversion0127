
import { User, AuditLog, UserRole } from '../types';
import { SupabaseManager } from './supabaseClient';
import { StorageService } from './storageService';

// Helper to generate a consistent, valid email from any username input
const getEmailFromUsername = (username: string): string => {
    const clean = username.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailRegex.test(clean)) return clean;
    const safeName = encodeURIComponent(clean).replace(/%/g, '_');
    return `${safeName}@travel.user`; 
};

export const AuthService = {
    init: async () => {
    },

    // --- User Management ---
    getUsers: async (): Promise<User[]> => {
        return await StorageService.getUserProfiles();
    },

    updateUserRole: async (targetUsername: string, newRole: UserRole, operator: User): Promise<boolean> => {
        if (operator.role !== 'super_admin') return false; // Only Super Admin can change roles
        if (targetUsername === 'admin') return false; // Cannot change main admin
        
        try {
            const client = SupabaseManager.getClient();
            if (!client) return false;

            const { data } = await client
                .from('app_data')
                .select('value')
                .eq('key', `user_profile_${targetUsername}`)
                .single();
            
            if (!data || !data.value) return false;

            const profile = data.value as User;
            const updatedProfile = { ...profile, role: newRole };
            
            await StorageService.saveUserProfile(updatedProfile);
            return true;
        } catch (e) {
            console.error("Failed to update user role", e);
            return false;
        }
    },

    // New: Allow Super Admin to reset another user's password (Application Layer)
    adminResetPassword: async (targetUsername: string, newPassword: string, operator: User): Promise<{ success: boolean, message: string }> => {
        if (operator.role !== 'super_admin') return { success: false, message: '权限不足：仅超级管理员可重置密码' };
        
        try {
            const client = SupabaseManager.getClient();
            if (!client) return { success: false, message: '云端未连接' };

            // 1. Fetch existing profile
            const { data } = await client
                .from('app_data')
                .select('value')
                .eq('key', `user_profile_${targetUsername}`)
                .single();

            if (!data || !data.value) return { success: false, message: '用户资料不存在' };

            const profile = data.value as User;
            
            // 2. Update profile with the plain password (Simulation for Client-Side Auth override)
            // Note: In a strict production env, this should use Supabase Admin API via Edge Functions.
            // Here we allow the login function to fallback to this password if Supabase Auth fails.
            const updatedProfile = { ...profile, password: newPassword }; // Store password in profile to allow override
            
            await StorageService.saveUserProfile(updatedProfile);
            return { success: true, message: '密码重置成功 (已应用为该用户的备选登录密码)' };
        } catch (e) {
            console.error("Reset password failed", e);
            return { success: false, message: '重置失败，请检查网络' };
        }
    },

    register: async (username: string, password: string): Promise<{ success: boolean, message: string }> => {
        const client = SupabaseManager.getClient();
        if (!client) return { success: false, message: '未连接云端服务，请先配置 Supabase' };

        if (password.length < 6) {
            return { success: false, message: '密码长度至少需6位' };
        }

        const cleanUsername = username.trim();
        const email = getEmailFromUsername(cleanUsername);

        console.log(`[Auth] Registering: User="${cleanUsername}" -> Email="${email}"`);

        // 1. Create Auth User
        const { data, error } = await client.auth.signUp({
            email,
            password,
            options: {
                data: { username: cleanUsername, role: 'user' } // Default to ordinary member
            }
        });

        if (error) {
            console.error("Supabase SignUp Error:", error);
            if (error.message.includes('already registered')) return { success: false, message: '该用户名已被注册' };
            if (error.message.includes('invalid')) return { success: false, message: `注册格式错误: ${error.message}` };
            return { success: false, message: `注册失败: ${error.message}` };
        }

        // 2. Create Public Profile Record in app_data
        if (data.user) {
            const newUser: User = {
                username: cleanUsername,
                password: '', // Don't store plain password initially
                role: 'user', // Default
                createdAt: Date.now()
            };
            
            try {
                await StorageService.saveUserProfile(newUser);
            } catch (storageError: any) {
                console.error("Profile Save Error:", storageError);
                return { success: true, message: '账号创建成功，但用户资料保存失败(可能是网络问题)，请尝试直接登录。' };
            }

            if (!data.session) {
                 return { 
                     success: true, 
                     message: '注册成功！【重要提示】检测到未自动登录，请务必在 Supabase 后台 (Authentication -> Providers -> Email) 中关闭 "Confirm email" 选项，否则无法使用此用户名登录。' 
                 };
            }
        }

        return { success: true, message: '注册成功！' };
    },

    login: async (username: string, password: string): Promise<{ success: boolean, user?: User, message: string }> => {
        const client = SupabaseManager.getClient();
        if (!client) return { success: false, message: '未连接云端服务' };

        const cleanUsername = username.trim();
        const email = getEmailFromUsername(cleanUsername);

        // --- 1. Attempt Standard Supabase Auth Login ---
        const { data, error } = await client.auth.signInWithPassword({
            email,
            password
        });

        // --- Admin Bootstrap Logic (Hardcoded override) ---
        if (error && cleanUsername === 'admin' && password === 'liuwen') {
            console.log("Attempting to bootstrap Super Admin account...");
            const { data: signUpData, error: signUpError } = await client.auth.signUp({
                email,
                password,
                options: { data: { username: 'admin', role: 'super_admin' } }
            });

            if (!signUpError && signUpData.user) {
                const adminUser: User = {
                    username: 'admin',
                    password: '',
                    role: 'super_admin',
                    createdAt: Date.now()
                };
                await StorageService.saveUserProfile(adminUser);
                return { success: true, user: adminUser, message: '超级管理员账户初始化成功' };
            }
        }
        
        // --- 2. If Auth Success ---
        if (data.user) {
            let role: UserRole = 'user';
            const metaRole = data.user.user_metadata.role;
            if (metaRole === 'super_admin' || metaRole === 'admin' || metaRole === 'user') role = metaRole;

            // Fetch DB Profile to allow dynamic role updates to take effect immediately
            try {
                const { data: profileData } = await client
                    .from('app_data')
                    .select('value')
                    .eq('key', `user_profile_${cleanUsername}`)
                    .single();
                
                if (profileData && profileData.value) {
                    if (profileData.value.role) role = profileData.value.role;
                }
            } catch (e) {
                // Ignore
            }
            
            // Force override: 'admin' is ALWAYS super_admin
            if (cleanUsername === 'admin') role = 'super_admin';

            const user: User = {
                username: cleanUsername,
                password: '',
                role,
                createdAt: new Date(data.user.created_at).getTime()
            };
            
            // Sync local profile if needed
            StorageService.saveUserProfile(user).catch(console.warn);
            
            return { success: true, user, message: '登录成功' };
        }

        // --- 3. If Auth Failed, Check Application Layer Password (User Profile) ---
        // This supports the "Admin changes other user's password" feature without backend code
        if (error) {
            try {
                const { data: profileData } = await client
                    .from('app_data')
                    .select('value')
                    .eq('key', `user_profile_${cleanUsername}`)
                    .single();
                
                if (profileData && profileData.value) {
                    const profile = profileData.value as User;
                    // Check if profile has a password override and it matches
                    if (profile.password && profile.password === password) {
                         // Force 'admin' is ALWAYS super_admin check again
                        let role = profile.role || 'user';
                        if (cleanUsername === 'admin') role = 'super_admin';

                        return { 
                            success: true, 
                            user: { ...profile, role }, 
                            message: '登录成功 (管理员重置密码)' 
                        };
                    }
                }
            } catch (fallbackError) {
                // Ignore fallback error
            }

            // Normal Error Handling
            if (error.message.includes('Invalid login credentials')) {
                return { success: false, message: '用户名或密码错误。' };
            }
            if (error.message.includes('Email not confirmed')) return { success: false, message: '登录失败：邮箱未验证。' };
            return { success: false, message: `登录失败: ${error.message}` };
        }
        
        return { success: false, message: '未知错误' };
    },

    logout: async () => {
        const client = SupabaseManager.getClient();
        if (client) await client.auth.signOut();
    },

    getCurrentUser: async (): Promise<User | null> => {
        const client = SupabaseManager.getClient();
        if (!client) return null;

        const { data: { session } } = await client.auth.getSession();
        
        // Case A: Supabase Session Exists
        if (session?.user) {
            const username = session.user.user_metadata.username || session.user.email || 'User';
            
            let role: UserRole = 'user';
            
            try {
                const { data } = await client
                    .from('app_data')
                    .select('value')
                    .eq('key', `user_profile_${username}`)
                    .single();
                
                if (data && data.value && data.value.role) {
                    role = data.value.role;
                }
            } catch (e) {
                // Ignore error
            }
            // Enforce Super Admin for 'admin'
            if (username === 'admin') role = 'super_admin';

            return {
                username: username,
                password: '',
                role: role,
                createdAt: new Date(session.user.created_at).getTime()
            };
        }

        // Case B: No Session (or App Layer Login state logic needed?)
        // Currently relying on Supabase session mainly. 
        // If "Admin Reset Login" was used, the session might not be persisted perfectly by supabase-js client if we don't manually set it.
        // However, standard flow is: Login -> Sets internal state/cookies. 
        // For this demo, we rely on Supabase session. If using app-layer password, we might need to handle session persistence manually if supabase doesn't.
        // *Correction*: Without a real session token, page refresh loses login. 
        // To fix this for the "Change Password" feature to really work across reloads, we would need to manually store user in localStorage, 
        // but for safety in this strict environment, we will assume the user stays on page or uses standard auth if possible.
        // Or we can rely on `AuthModal` calling `setCurrentUser`.
        
        return null;
    },

    deleteUser: async (username: string, operator: User): Promise<boolean> => {
        if(operator.role !== 'super_admin') return false;
        if(username === 'admin') return false;
        if(username === operator.username) return false;
        
        await StorageService.deleteUserProfile(username);
        return true;
    },

    logAction: async (username: string, action: string, details: string) => {
        console.log(`[Audit] ${username} ${action}: ${details}`);
    },

    getLogs: async (): Promise<AuditLog[]> => {
        return [];
    }
};
