import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, User, Bot, Loader2, X, RefreshCw } from 'lucide-react';

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
            className={`fixed inset-y-0 right-0 z-50 border-l border-white/20 shadow-2xl transform transition-transform duration-300 ease-in-out flex flex-col backdrop-blur-md
        ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        ${mode === 'overlay' ? 'bg-white/95 shadow-2xl' : 'bg-white border-l-gray-200'}
        lg:shadow-none
        `}
            style={{ width: isOpen && window.innerWidth >= 640 ? width : '100%' }}
        >
            {/* Resize Handle */}
            {isOpen && setWidth && (
                <div
                    className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-blue-400/50 z-50 transition-colors group"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        setIsResizing(true);
                    }}
                >
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-gray-300 rounded-full group-hover:bg-blue-400 transition-colors"></div>
                </div>
            )}

            {/* Header */}
            <div className="h-14 px-4 border-b border-gray-100 flex justify-between items-center bg-white/50 backdrop-blur-sm shrink-0">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-purple-50 flex items-center justify-center text-purple-600">
                        <Sparkles size={16} />
                    </div>
                    <div>
                        <h3 className="font-bold text-gray-800 text-sm">AI 智能助手</h3>
                        <p className="text-[10px] text-gray-400">基于详细行程上下文</p>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    {setMode && (
                        <button
                            onClick={() => setMode(mode === 'docked' ? 'overlay' : 'docked')}
                            className="p-1.5 hover:bg-gray-100/50 rounded text-gray-400 hover:text-gray-600 transition-colors"
                            title={mode === 'docked' ? "切换悬浮模式" : "切换停靠模式"}
                        >
                            <RefreshCw size={14} className={mode === 'docked' ? '' : 'text-blue-500'} />
                        </button>
                    )}
                    <button onClick={onToggle} className="p-1.5 hover:bg-gray-50 rounded-full text-gray-400 hover:text-gray-600 transition-colors">
                        <X size={16} />
                    </button>
                </div>
            </div>

            {/* Messages Area */}
            <div className={`flex-1 overflow-y-auto p-4 space-y-4 ${mode === 'overlay' ? 'bg-gray-50/80' : 'bg-gray-50/50'}`}>
                {messages.length === 0 && (
                    <div className="text-center text-gray-400 mt-20 space-y-3">
                        <div className="w-12 h-12 bg-white rounded-full shadow-sm mx-auto flex items-center justify-center text-gray-300">
                            <Bot size={24} />
                        </div>
                        <p className="text-xs">我是您的专属旅行规划师。</p>
                        <p className="text-[10px] text-gray-300">试着让我帮您调整行程、推荐酒店或查询景点。</p>
                    </div>
                )}

                {messages.map((msg) => (
                    <div
                        key={msg.id}
                        className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                    >
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 border ${msg.role === 'user' ? 'bg-blue-50 border-blue-100 text-blue-600' :
                            msg.role === 'assistant' ? 'bg-white border-gray-100 text-purple-600 shadow-sm' : 'bg-gray-100 text-gray-500'
                            }`}>
                            {msg.role === 'user' ? <User size={14} /> : msg.role === 'assistant' ? <Bot size={14} /> : <Sparkles size={12} />}
                        </div>

                        <div className={`max-w-[85%] rounded-lg p-2.5 text-sm leading-relaxed whitespace-pre-wrap shadow-sm ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' :
                            msg.role === 'assistant' ? 'bg-white border border-gray-100 text-gray-700 rounded-tl-none' :
                                'bg-gray-100 text-gray-500 text-xs italic text-center w-full'
                            }`}>
                            {msg.content}
                        </div>
                    </div>
                ))}

                {isGenerating && (
                    <div className="flex gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-white border border-gray-100 text-purple-600 shadow-sm flex items-center justify-center shrink-0">
                            <Loader2 size={14} className="animate-spin" />
                        </div>
                        <div className="bg-white border border-gray-100 rounded-lg p-2.5 text-sm text-gray-400 shadow-sm rounded-tl-none flex items-center gap-2">
                            <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce"></span>
                            <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce delay-75"></span>
                            <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce delay-150"></span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-3 border-t border-gray-100 bg-white/80 backdrop-blur-md shrink-0">
                <div className="relative">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="输入您的需求..."
                        className="w-full pl-3 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-1 focus:ring-purple-500 focus:border-purple-500 resize-none text-xs scrollbar-hide min-h-[40px] max-h-[120px]"
                        rows={1}
                        style={{ height: input.length > 50 ? '80px' : '42px' }} // Simple auto-height
                        disabled={isGenerating}
                    />
                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || isGenerating}
                        className="absolute right-1.5 bottom-1.5 p-1.5 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:hover:bg-purple-600 transition-colors"
                    >
                        <Send size={14} />
                    </button>
                </div>
            </div>
        </div>
    );
};
