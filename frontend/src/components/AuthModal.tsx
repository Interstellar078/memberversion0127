import React, { useState } from 'react';
import { User, Lock, ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { AuthService } from '../services/authService';
import { User as UserType } from '../types';

interface AuthModalProps {
  onLoginSuccess: (user: UserType) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ onLoginSuccess }) => {
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
    <div className="fixed inset-0 bg-white/30 backdrop-blur-md z-[100] flex items-center justify-center p-4 transition-all duration-300">
      <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-white/20 w-full max-w-[380px] overflow-hidden transform transition-all ring-1 ring-gray-900/5">

        {/* Minimalist Header */}
        <div className="pt-8 px-8 pb-2 text-center">
          <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mx-auto mb-4 text-blue-600">
            <Sparkles size={24} />
          </div>
          <h2 className="text-xl font-bold text-gray-900">
            {isLogin ? '欢迎回来' : '创建账号'}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {isLogin ? '登录以继续您的定制之旅' : '开始体验智能行程规划'}
          </p>
        </div>

        <div className="p-8 pt-6">
          {/* Toggle Switch */}
          {/* Toggle removed, moved to bottom */}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <User size={16} className="text-gray-400 group-focus-within:text-blue-500 transition-colors" />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="block w-full pl-9 pr-3 py-2.5 bg-gray-50/50 border border-gray-200/60 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white text-sm transition-all placeholder:text-gray-400/80"
                placeholder="用户名"
              />
            </div>

            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock size={16} className="text-gray-400 group-focus-within:text-blue-500 transition-colors" />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full pl-9 pr-3 py-2.5 bg-gray-50/50 border border-gray-200/60 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white text-sm transition-all placeholder:text-gray-400/80"
                placeholder="密码"
              />
            </div>

            {!isLogin && (
              <div className="relative group animate-fade-in">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock size={16} className="text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                </div>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="block w-full pl-9 pr-3 py-2.5 bg-gray-50/50 border border-gray-200/60 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white text-sm transition-all placeholder:text-gray-400/80"
                  placeholder="确认密码"
                />
              </div>
            )}

            {error && (
              <div className="text-red-500 text-xs text-center bg-red-50 py-2 rounded-lg flex items-center justify-center gap-1 animate-fade-in">
                <span>!</span> {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center items-center gap-2 py-2.5 px-4 bg-gray-900 hover:bg-black text-white rounded-lg text-sm font-medium transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-gray-200 mt-2"
            >
              {isLoading ? <Loader2 size={16} className="animate-spin" /> : <>
                {isLogin ? '登 录' : '立即注册'} <ArrowRight size={16} />
              </>}
            </button>

            <div className="text-center mt-4">
              <button
                type="button"
                onClick={() => { setIsLogin(!isLogin); setError(''); setPassword(''); setConfirmPassword(''); }}
                className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
              >
                {isLogin ? (
                  <>还没有账号? <span className="font-bold text-blue-600">立即注册</span></>
                ) : (
                  <>已有账号? <span className="font-bold text-blue-600">直接登录</span></>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="px-8 py-4 bg-gray-50 border-t border-gray-100 text-center">
          <p className="text-[10px] text-gray-400">
            星际云旅行 · 智能行程定制系统
          </p>
        </div>
      </div>
    </div>
  );
};
