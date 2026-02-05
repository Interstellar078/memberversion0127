import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, User, Bot, Loader2, X, RefreshCw, Rocket } from 'lucide-react';

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
}

interface AIChatSidebarProps {
    messages: ChatMessage[];
    onSendMessage: (text: string) => void;
    isGenerating: boolean;
    isOpen: boolean;
    onToggle: () => void;
    width?: number;
    setWidth?: (width: number) => void;
    mode?: 'docked' | 'overlay';
    setMode?: (mode: 'docked' | 'overlay') => void;
}

export const AIChatSidebar: React.FC<AIChatSidebarProps> = ({
    messages,
    onSendMessage,
    isGenerating,
    isOpen,
    onToggle,
    width = 400,
    setWidth,
    mode = 'docked',
    setMode
}) => {
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [isResizing, setIsResizing] = useState(false);
    const sidebarRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing || !setWidth) return;
            const newWidth = window.innerWidth - e.clientX;
            // Limit width between 300px and 800px (or 50% of screen)
            const maxWidth = Math.min(800, window.innerWidth * 0.8);
            if (newWidth >= 300 && newWidth <= maxWidth) {
                setWidth(newWidth);
            }
        };

        const handleMouseUp = () => {
            setIsResizing(false);
            document.body.style.cursor = 'default';
        };

        if (isResizing) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'ew-resize';
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing, setWidth]);

    const handleSend = () => {
        if (!input.trim() || isGenerating) return;
        onSendMessage(input);
        setInput('');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div
            ref={sidebarRef}
            className={`absolute inset-y-0 right-0 z-50 border-l border-gray-200 shadow-xl transform transition-transform duration-300 ease-in-out flex flex-col backdrop-blur-md
        ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        ${mode === 'overlay' ? 'bg-white/95 shadow-2xl' : 'bg-gradient-to-b from-white to-gray-50/50'}
        lg:shadow-none
        `}
            style={{ width: isOpen && window.innerWidth >= 640 ? width : '100%' }}
        >
            {/* Resize Handle */}
            {isOpen && setWidth && (
                <div
                    className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-indigo-500/50 transition-colors z-50 group"
                    onMouseDown={() => {
                        setIsResizing(true);
                        document.body.style.cursor = 'ew-resize';
                    }}
                >
                    <div className="absolute top-1/2 left-0 -translate-x-1/2 w-4 h-8 bg-white border border-gray-200 rounded-full shadow-md flex items-center justify-center group-hover:bg-indigo-50 group-hover:border-indigo-300 transition-all opacity-0 group-hover:opacity-100">
                        <div className="w-0.5 h-4 bg-gray-300 group-hover:bg-indigo-400 rounded-full" />
                    </div>
                </div>
            )}

            {/* Header */}
            {/* Header */}
            <div className="bg-white/90 backdrop-blur-md border-b border-indigo-100 p-3 flex items-center justify-between shrink-0 z-10">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-indigo-50 flex items-center justify-center border border-indigo-100">
                        <Rocket className="text-indigo-500" size={18} />
                    </div>
                    <div>
                        <h2 className="text-gray-800 font-bold text-base tracking-wide flex items-center gap-1">
                            星艾
                            <span className="flex h-2 w-2 relative">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                            </span>
                        </h2>
                        <p className="text-indigo-400 text-[10px] font-medium uppercase tracking-wider">Xing Ai</p>
                    </div>
                </div>
                <div className="flex items-center gap-1">

                    <button
                        onClick={onToggle}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="关闭"
                    >
                        <X size={18} />
                    </button>
                </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin scrollbar-thumb-indigo-200 scrollbar-track-transparent bg-slate-50/50">
                {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4 p-8 text-center animate-bounce-in">
                        <div className="w-24 h-24 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-full flex items-center justify-center mb-2 shadow-inner">
                            <Rocket size={48} className="text-indigo-400" />
                        </div>
                        <div>
                            <p className="text-lg font-medium text-gray-600">有什么我可以帮您的吗？</p>
                            <p className="text-sm mt-2 max-w-xs text-gray-500">我可以帮您规划行程、推荐景点、计算预算或回答旅行相关的问题。</p>
                        </div>
                    </div>
                ) : (
                    messages.map((msg) => (
                        <div
                            key={msg.id}
                            className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'} group`}
                        >
                            <div className={`
                                w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-md transform transition-transform group-hover:scale-110 duration-200
                                ${msg.role === 'user'
                                    ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white'
                                    : 'bg-white text-indigo-600 border border-indigo-100'}
                            `}>
                                {msg.role === 'user' ? <User size={16} /> : <Rocket size={16} />}
                            </div>
                            <div className={`
                                max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm transition-all duration-200
                                ${msg.role === 'user'
                                    ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-tr-none shadow-indigo-200 hover:shadow-indigo-300 hover:-translate-y-0.5'
                                    : 'bg-white border text-gray-700 rounded-tl-none hover:shadow-md hover:-translate-y-0.5 relative overflow-hidden'}
                            `}>
                                {msg.role !== 'user' && (
                                    <div className="absolute inset-0 bg-gradient-to-r from-indigo-50 to-purple-50 opacity-50 pointer-events-none" />
                                )}
                                <div className="relative z-10 whitespace-pre-wrap">{msg.content}</div>
                                <div className={`text-[10px] mt-1.5 opacity-70 flex items-center gap-1 ${msg.role === 'user' ? 'justify-end text-indigo-100' : 'justify-start text-gray-400'}`}>
                                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                            </div>
                        </div>
                    ))
                )}
                {isGenerating && (
                    <div className="flex gap-3 animate-pulse">
                        <div className="w-8 h-8 rounded-full bg-white border border-indigo-100 flex items-center justify-center shrink-0 shadow-sm">
                            <Rocket size={16} className="text-indigo-600" />
                        </div>
                        <div className="bg-white border border-indigo-50 px-4 py-3 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-2">
                            <Loader2 size={16} className="animate-spin text-indigo-500" />
                            <span className="text-sm text-gray-500 font-medium shimmer-text">正在思考...</span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-white/80 backdrop-blur-sm border-t border-indigo-50 shrink-0">
                <div className={`
                    bg-gradient-to-r from-gray-50 to-indigo-50/30
                    border-2 rounded-xl transition-all duration-300 ease-in-out
                    flex flex-col shadow-sm
                    focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-100/50 focus-within:shadow-md
                    ${isGenerating ? 'opacity-75 grayscale' : 'border-indigo-100 hover:border-indigo-300'}
                `}>
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="输入您的问题..."
                        disabled={isGenerating}
                        className="w-full bg-transparent p-3 max-h-32 min-h-[50px] focus:outline-none resize-none text-sm text-gray-700 placeholder-gray-400 disabled:cursor-not-allowed"
                        rows={1}
                        style={{ height: 'auto', minHeight: '52px' }}
                        onInput={(e) => {
                            const target = e.target as HTMLTextAreaElement;
                            target.style.height = 'auto';
                            target.style.height = `${Math.min(target.scrollHeight, 128)}px`;
                        }}
                    />
                    <div className="flex justify-between items-center px-2 pb-2">
                        <div className="text-xs text-indigo-300 ml-2 font-medium">
                            Cmd + Enter 发送
                        </div>
                        <button
                            onClick={handleSend}
                            disabled={!input.trim() || isGenerating}
                            className={`
                                p-2 rounded-lg transition-all duration-300 transform
                                ${!input.trim() || isGenerating
                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed scale-95'
                                    : 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-200 hover:shadow-indigo-300 hover:scale-105 active:scale-95 hover:from-indigo-600 hover:to-purple-700'}
                            `}
                        >
                            <Send size={18} className={input.trim() && !isGenerating ? 'ml-0.5' : ''} />
                        </button>
                    </div>
                </div>
                <div className="text-center mt-2 text-[10px] text-gray-400">
                    AI 可能会产生错误信息，请核对重要事实。
                </div>
            </div>
        </div>
    );
};
