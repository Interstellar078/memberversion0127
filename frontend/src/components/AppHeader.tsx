
import React from 'react';
import { Rocket, FileUp, FolderOpen, Loader2, Save, FileSpreadsheet, Database, Sparkles, CheckCircle, Cloud, ShieldAlert, LogOut } from 'lucide-react';
import { User, TripSettings } from '../types';
import { AuthService } from '../services/authService';

interface AppHeaderProps {
    handleNewTrip: () => void;
    handleOpenSavedList: () => void;
    isRefreshingTrips: boolean;
    handleOpenSaveModal: () => void;
    handleExport: () => void;
    handleOpenResources: () => void;
    isRefreshingResources: boolean;
    isChatOpen: boolean;
    setIsChatOpen: (isOpen: boolean) => void;
    notification: { show: boolean, message: string };
    cloudStatus: 'idle' | 'syncing' | 'synced' | 'error';
    currentUser: User | null;
    isSuperAdmin: boolean;
    setShowAdminDashboard: (show: boolean) => void;
    setShowAuthModal: (show: boolean) => void;
    setCurrentUser: (user: User | null) => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
    handleNewTrip,
    handleOpenSavedList,
    isRefreshingTrips,
    handleOpenSaveModal,
    handleExport,
    handleOpenResources,
    isRefreshingResources,
    isChatOpen,
    setIsChatOpen,
    notification,
    cloudStatus,
    currentUser,
    isSuperAdmin,
    setShowAdminDashboard,
    setShowAuthModal,
    setCurrentUser
}) => {
    return (
        <div className="bg-white border-b border-gray-200 px-6 py-3 flex justify-between items-center shadow-sm z-[60] shrink-0 no-print">
            <div className="flex items-center gap-4">
                <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent flex items-center gap-2">
                    <Rocket size={24} className="text-blue-600" /> 星际云旅行
                </h1>
                {currentUser && (
                    <div className="flex items-center gap-2">
                        <button onClick={handleNewTrip} className="p-2 hover:bg-gray-100 rounded text-gray-600" title="新建"><FileUp size={18} /></button>
                        <button onClick={handleOpenSavedList} className="p-2 hover:bg-gray-100 rounded text-gray-600 flex items-center gap-1">
                            {isRefreshingTrips ? <Loader2 size={18} className="animate-spin text-blue-600" /> : <FolderOpen size={18} />}
                        </button>
                        <button onClick={handleOpenSaveModal} className="p-2 hover:bg-gray-100 rounded text-blue-600" title="保存"><Save size={18} /></button>
                        <button onClick={handleExport} className="p-2 hover:bg-gray-100 rounded text-green-600" title="导出"><FileSpreadsheet size={18} /></button>
                    </div>
                )}
                {currentUser && <div className="h-6 w-px bg-gray-300 mx-2"></div>}
                <button onClick={handleOpenResources} className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 text-sm font-medium transition-colors">
                    {isRefreshingResources ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />} 资源库
                </button>

            </div>
            <div className="flex items-center gap-4">
                {notification.show && <div className="text-sm text-green-600 font-medium animate-fade-in bg-green-50 px-3 py-1 rounded-full flex items-center gap-1"><CheckCircle size={14} /> {notification.message}</div>}
                {currentUser && (
                    <div className={`text-xs px-2 py-1 rounded flex items-center gap-1 ${cloudStatus === 'synced' ? 'text-green-600 bg-green-50' : cloudStatus === 'error' ? 'text-red-600 bg-red-50' : 'text-gray-400'}`}>
                        <Cloud size={12} /> {cloudStatus === 'synced' ? '已同步' : cloudStatus === 'syncing' ? '同步中...' : '未同步'}
                    </div>
                )}
                {currentUser ? (
                    <div className="flex items-center gap-3">
                        {isSuperAdmin && <button onClick={() => setShowAdminDashboard(true)} className="text-gray-500 hover:text-red-600" title="管理员后台"><ShieldAlert size={18} /></button>}
                        <div className="flex flex-col items-end leading-tight">
                            <span className="text-sm font-medium">{currentUser.username}</span>
                            <span className="text-[10px] text-gray-400">
                                {currentUser.role === 'super_admin' ? '超级管理员' : currentUser.role === 'admin' ? '管理员' : '普通会员'}
                            </span>
                        </div>
                        <button onClick={() => { AuthService.logout(); setCurrentUser(null); window.location.reload(); }} className="text-gray-400 hover:text-gray-600"><LogOut size={18} /></button>
                    </div>
                ) : (
                    <button onClick={() => setShowAuthModal(true)} className="text-sm font-medium text-blue-600 hover:underline">登录 / 注册</button>
                )}
            </div>
        </div>
    );
};
