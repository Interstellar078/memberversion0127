import React, { useState } from 'react';
import { User, Lock, ArrowRight, Loader2, Sparkles, X } from 'lucide-react';
import { AuthService } from '../services/authService';
import { User as UserType } from '../types';

interface AuthModalProps {
  onLoginSuccess: (user: UserType) => void;
  onClose?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ onLoginSuccess, onClose }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (!username.trim() || !password.trim()) {
        setError('请输入用户名和密码');
        setIsLoading(false);
        return;
      }

      if (isLogin) {
        const result = await AuthService.login(username, password);
        if (result.success && result.user) {
          onLoginSuccess(result.user);
        } else {
          setError(result.message);
        }
      } else {
        if (password !== confirmPassword) {
          setError('两次输入的密码不一致');
          setIsLoading(false);
          return;
        }

        const result = await AuthService.register(username, password);
        if (result.success) {
          alert('注册成功，请登录');
          setIsLogin(true);
          setPassword('');
          setConfirmPassword('');
        } else {
          setError(result.message);
        }
      }
    } catch (e) {
      setError('系统繁忙，请稍后再试');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 transition-all duration-500 animate-in fade-in bg-black/40 backdrop-blur-sm">
      <div className="relative bg-white/80 backdrop-blur-xl rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)] border border-white/40 w-full max-w-[400px] overflow-hidden transform hover:scale-[1.005] transition-all duration-300 ring-1 ring-white/50">

        {/* Close Button */}
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100/50 rounded-full transition-colors z-10"
            title="关闭"
          >
            <X size={20} />
          </button>
        )}

        {/* Header */}
        <div className="pt-10 px-8 pb-4 text-center">
          <div className="w-14 h-14 bg-gradient-to-br from-indigo-50 to-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-inner border border-white/50 text-indigo-600 transform rotate-3">
            <Sparkles size={28} className="drop-shadow-sm" />
          </div>
          <h2 className="text-2xl font-black bg-gradient-to-br from-gray-900 to-gray-700 bg-clip-text text-transparent mb-2 tracking-tight">
            {isLogin ? '欢迎回来' : '开启旅程'}
          </h2>
          <p className="text-sm text-gray-500 font-medium">
            {isLogin ? '登录以管理您的定制行程' : '注册账号，体验智能行程规划'}
          </p>
        </div>

        <div className="p-8 pt-2">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-3">
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <User size={18} className="text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="block w-full pl-10 pr-4 py-3 bg-gray-50/50 border border-gray-200 rounded-xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 focus:bg-white text-sm font-medium transition-all placeholder:text-gray-400"
                  placeholder="用户名"
                />
              </div>

              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Lock size={18} className="text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-4 py-3 bg-gray-50/50 border border-gray-200 rounded-xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 focus:bg-white text-sm font-medium transition-all placeholder:text-gray-400"
                  placeholder="密码"
                />
              </div>

              {!isLogin && (
                <div className="relative group animate-in slide-in-from-top-2 fade-in duration-300">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Lock size={18} className="text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
                  </div>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="block w-full pl-10 pr-4 py-3 bg-gray-50/50 border border-gray-200 rounded-xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 focus:bg-white text-sm font-medium transition-all placeholder:text-gray-400"
                    placeholder="确认密码"
                  />
                </div>
              )}
            </div>

            {error && (
              <div className="text-red-500 text-xs text-center bg-red-50 py-2.5 rounded-xl border border-red-100 flex items-center justify-center gap-1.5 animate-in shake">
                <span className="w-4 h-4 rounded-full bg-red-100 flex items-center justify-center text-[10px] font-bold">!</span> {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center items-center gap-2 py-3.5 px-6 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-[15px] font-semibold transition-all shadow-lg shadow-blue-200 hover:shadow-blue-300 active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed group"
            >
              {isLoading ? <Loader2 size={18} className="animate-spin" /> : <>
                {isLogin ? '立即登录' : '创建账号'} <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
              </>}
            </button>

            <div className="flex items-center justify-between text-xs pt-2">
              <button
                type="button"
                onClick={() => { setIsLogin(!isLogin); setError(''); setPassword(''); setConfirmPassword(''); }}
                className="text-gray-500 hover:text-indigo-600 font-medium transition-colors"
              >
                {isLogin ? '没有账号？注册新账号' : '已有账号？返回登录'}
              </button>

              {isLogin && (
                <span className="text-gray-300 cursor-not-allowed">忘记密码?</span>
              )}
            </div>

            {/* Guest Mode Option */}
            {onClose && (
              <div className="pt-4 mt-2 border-t border-gray-100 text-center">
                <button
                  type="button"
                  onClick={onClose}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors inline-flex items-center gap-1"
                >
                  暂不登录，以游客身份浏览 &rarr;
                </button>
              </div>
            )}

          </form>
        </div>
      </div>
    </div>
  );
};
