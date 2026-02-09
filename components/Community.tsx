import React, { useState, useEffect } from 'react';
import { PublishedTrip, Comment, Message, User } from '../types';
import { StorageService } from '../services/storageService';
import { generateUUID } from '../utils/dateUtils';
import { ThumbsUp, MessageCircle, MapPin, Calendar, ArrowLeft, Send, Search, User as UserIcon, Clock, Filter, Mail, X, Trash2, Edit, ChevronDown, ChevronUp } from 'lucide-react';

interface CommunityProps {
    currentUser: User;
    onBack?: () => void; // Optional back handler if embedded
}

const PREDEFINED_TAGS = ['求包车', '求租车', '约搭子', '求导游', '求拼房'];

export const Community: React.FC<CommunityProps> = ({ currentUser, onBack }) => {
    const [view, setView] = useState<'feed' | 'detail' | 'inbox'>('feed');
    const [posts, setPosts] = useState<PublishedTrip[]>([]);
    const [activePost, setActivePost] = useState<PublishedTrip | null>(null);
    const [comments, setComments] = useState<Comment[]>([]);
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(false);

    // Filter State
    const [searchTerm, setSearchTerm] = useState('');
    const [filterCountry, setFilterCountry] = useState('');
    const [filterTag, setFilterTag] = useState('');
    const [filterDate, setFilterDate] = useState('');
    const [showMobileFilters, setShowMobileFilters] = useState(false);

    // Messaging State
    const [showMessageModal, setShowMessageModal] = useState(false);
    const [messageTarget, setMessageTarget] = useState('');
    const [messageContent, setMessageContent] = useState('');

    // Editing State
    const [editingPost, setEditingPost] = useState<PublishedTrip | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [editDesc, setEditDesc] = useState('');
    const [editTags, setEditTags] = useState<string[]>([]);

    useEffect(() => {
        loadPosts();
        loadMessages();
    }, []);

    const loadPosts = async () => {
        setLoading(true);
        const data = await StorageService.getPublishedTrips();
        // Sort by date desc
        setPosts(data.sort((a, b) => b.publishedAt - a.publishedAt));
        setLoading(false);
    };

    const loadMessages = async () => {
        const msgs = await StorageService.getMessages(currentUser.username);
        setMessages(msgs.sort((a, b) => b.createdAt - a.createdAt));
    };

    const handleLike = async (e: React.MouseEvent, post: PublishedTrip) => {
        e.stopPropagation();
        const isLiked = post.likedBy?.includes(currentUser.username);
        let newLikes = post.likes;
        let newLikedBy = post.likedBy || [];

        if (isLiked) {
            newLikes--;
            newLikedBy = newLikedBy.filter(u => u !== currentUser.username);
        } else {
            newLikes++;
            newLikedBy = [...newLikedBy, currentUser.username];
        }

        const updatedPost = { ...post, likes: newLikes, likedBy: newLikedBy };
        const newPosts = posts.map(p => p.id === post.id ? updatedPost : p);
        
        setPosts(newPosts);
        await StorageService.savePublishedTrips(newPosts);
        if (activePost && activePost.id === post.id) setActivePost(updatedPost);
    };

    const openPost = async (post: PublishedTrip) => {
        setActivePost(post);
        // Increment view count locally and save
        const updatedPost = { ...post, viewCount: (post.viewCount || 0) + 1 };
        const newPosts = posts.map(p => p.id === post.id ? updatedPost : p);
        setPosts(newPosts);
        StorageService.savePublishedTrips(newPosts); // Fire and forget save

        // Load comments
        const allComments = await StorageService.getAllComments();
        setComments(allComments.filter(c => c.postId === post.id));
        
        setView('detail');
    };

    const submitComment = async (content: string) => {
        if (!activePost || !content.trim()) return;
        const newComment: Comment = {
            id: generateUUID(),
            postId: activePost.id,
            userId: currentUser.username,
            content: content.trim(),
            createdAt: Date.now()
        };
        
        const allComments = await StorageService.getAllComments();
        const newAllComments = [...allComments, newComment];
        await StorageService.saveAllComments(newAllComments);
        
        setComments([...comments, newComment]);
        
        // Update post comment count
        const updatedPost = { ...activePost, commentCount: (activePost.commentCount || 0) + 1 };
        const newPosts = posts.map(p => p.id === activePost.id ? updatedPost : p);
        setPosts(newPosts);
        await StorageService.savePublishedTrips(newPosts);
        setActivePost(updatedPost);
    };

    const sendMessage = async () => {
        if (!messageTarget || !messageContent.trim()) return;
        // Load target user's inbox
        const targetInbox = await StorageService.getMessages(messageTarget);
        const newMessage: Message = {
            id: generateUUID(),
            fromUser: currentUser.username,
            toUser: messageTarget,
            content: messageContent.trim(),
            read: false,
            createdAt: Date.now()
        };
        await StorageService.saveMessages(messageTarget, [...targetInbox, newMessage]);
        alert("私信已发送！");
        setShowMessageModal(false);
        setMessageContent('');
    };

    // --- Delete & Edit Logic ---
    const handleDeletePost = async (e: React.MouseEvent, post: PublishedTrip) => {
        e.stopPropagation();
        if (window.confirm("确定要删除这个帖子吗？此操作无法撤销。")) {
            const newPosts = posts.filter(p => p.id !== post.id);
            await StorageService.savePublishedTrips(newPosts);
            setPosts(newPosts);
            if (activePost && activePost.id === post.id) {
                setView('feed');
                setActivePost(null);
            }
        }
    };

    const handleStartEdit = (e: React.MouseEvent, post: PublishedTrip) => {
        e.stopPropagation();
        setEditingPost(post);
        setEditTitle(post.title);
        setEditDesc(post.description);
        // Only load predefined tags for editing to prevent custom tag proliferation
        setEditTags(post.tags.filter(t => PREDEFINED_TAGS.includes(t))); 
    };

    const handleSaveEdit = async () => {
        if (!editingPost) return;
        if (!editTitle.trim() || !editDesc.trim()) { alert("标题和描述不能为空"); return; }
        
        const originalDestinations = editingPost.tripSnapshot.settings.destinations || [];
        const newTags = Array.from(new Set([...originalDestinations, ...editTags]));

        const updatedPost = {
            ...editingPost,
            title: editTitle,
            description: editDesc,
            tags: newTags
        };

        const newPosts = posts.map(p => p.id === editingPost.id ? updatedPost : p);
        await StorageService.savePublishedTrips(newPosts);
        setPosts(newPosts);
        
        if (activePost && activePost.id === editingPost.id) {
            setActivePost(updatedPost);
        }
        setEditingPost(null);
    };

    const filteredPosts = posts.filter(p => {
        const matchSearch = p.title.toLowerCase().includes(searchTerm.toLowerCase()) || p.description.toLowerCase().includes(searchTerm.toLowerCase());
        const matchCountry = filterCountry ? p.tripSnapshot.settings.destinations.includes(filterCountry) : true;
        const matchTag = filterTag ? p.tags.includes(filterTag) : true;
        const matchDate = filterDate ? p.tripSnapshot.settings.startDate >= filterDate : true;
        return matchSearch && matchCountry && matchDate && matchTag;
    });

    // Derive unique countries from actual trip destinations
    const uniqueCountries = Array.from(new Set(posts.flatMap(p => p.tripSnapshot.settings.destinations || []))).filter(Boolean).sort();

    return (
        <div className="bg-gray-100 min-h-full">
            {/* Sub-Header */}
            <div className="bg-white border-b border-gray-200 sticky top-14 z-30 px-4 py-3 flex justify-between items-center shadow-sm">
                <div className="flex items-center gap-4">
                    {view !== 'feed' && (
                        <button onClick={() => setView('feed')} className="text-gray-600 hover:text-blue-600 flex items-center gap-1">
                            <ArrowLeft size={18}/> 返回列表
                        </button>
                    )}
                    <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <span className="text-2xl">🪐</span> 星艾社区
                    </h2>
                </div>
                <div className="flex items-center gap-3">
                    <button 
                        onClick={() => { loadMessages(); setView('inbox'); }}
                        className={`relative p-2 rounded-full hover:bg-gray-100 ${view === 'inbox' ? 'text-blue-600 bg-blue-50' : 'text-gray-600'}`}
                        title="我的私信"
                    >
                        <Mail size={20}/>
                        {messages.filter(m => !m.read).length > 0 && (
                            <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-white"></span>
                        )}
                    </button>
                </div>
            </div>

            <div className="max-w-6xl mx-auto p-4 md:p-6 flex flex-col md:flex-row gap-6">
                
                {/* --- FEED VIEW --- */}
                {view === 'feed' && (
                    <>
                        {/* Left Sidebar: Filters */}
                        <div className="w-full md:w-64 shrink-0 space-y-4">
                            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                                <div className="flex justify-between items-center cursor-pointer md:cursor-default" onClick={() => setShowMobileFilters(!showMobileFilters)}>
                                    <h3 className="font-bold text-gray-700 flex items-center gap-2"><Filter size={16}/> 筛选</h3>
                                    <div className="md:hidden text-gray-500">
                                        {showMobileFilters ? <ChevronUp size={20}/> : <ChevronDown size={20}/>}
                                    </div>
                                </div>
                                <div className={`space-y-3 mt-4 md:mt-4 ${showMobileFilters ? 'block' : 'hidden md:block'}`}>
                                    <div>
                                        <label className="text-xs text-gray-500 font-medium mb-1 block">搜索关键词</label>
                                        <div className="relative">
                                            <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400"/>
                                            <input 
                                                type="text" 
                                                className="w-full pl-8 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:border-blue-500" 
                                                placeholder="标题 / 描述..."
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                    
                                    {/* Tag Filter */}
                                    <div>
                                        <label className="text-xs text-gray-500 font-medium mb-1 block">需求标签</label>
                                        <div className="flex flex-wrap gap-1.5">
                                            {PREDEFINED_TAGS.map(tag => (
                                                <button 
                                                    key={tag}
                                                    onClick={() => setFilterTag(filterTag === tag ? '' : tag)}
                                                    className={`px-2 py-1 text-xs rounded border transition-colors ${
                                                        filterTag === tag 
                                                        ? 'bg-purple-100 text-purple-700 border-purple-200 font-bold' 
                                                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                                    }`}
                                                >
                                                    {tag}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-xs text-gray-500 font-medium mb-1 block">国家</label>
                                        <select 
                                            className="w-full py-2 text-sm border border-gray-200 rounded-lg bg-gray-50"
                                            value={filterCountry}
                                            onChange={(e) => setFilterCountry(e.target.value)}
                                        >
                                            <option value="">全部</option>
                                            {uniqueCountries.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    
                                    <div>
                                        <label className="text-xs text-gray-500 font-medium mb-1 block">最早出发日期</label>
                                        <input 
                                            type="date" 
                                            className="w-full py-2 text-sm border border-gray-200 rounded-lg bg-gray-50"
                                            value={filterDate}
                                            onChange={(e) => setFilterDate(e.target.value)}
                                        />
                                    </div>
                                    <button 
                                        onClick={() => {setSearchTerm(''); setFilterCountry(''); setFilterTag(''); setFilterDate('')}}
                                        className="text-xs text-blue-600 hover:underline w-full text-right"
                                    >
                                        重置筛选
                                    </button>
                                </div>
                            </div>
                            
                            <div className="hidden md:block bg-gradient-to-br from-blue-600 to-indigo-700 text-white p-4 rounded-xl shadow-md">
                                <h4 className="font-bold text-lg mb-1">分享你的旅程</h4>
                                <p className="text-xs text-blue-100 mb-3">将你精心设计的行程发布到社区，收获点赞与建议。</p>
                                <div className="text-xs bg-white/20 p-2 rounded">
                                    💡 请前往 "定制行程" 页面，点击右上角的 "发布" 按钮。
                                </div>
                            </div>
                        </div>

                        {/* Center: Posts Feed */}
                        <div className="flex-1 space-y-4">
                            {loading ? (
                                <div className="text-center py-10 text-gray-400 flex flex-col items-center gap-2">
                                    <Clock className="animate-spin"/> 加载中...
                                </div>
                            ) : filteredPosts.length === 0 ? (
                                <div className="text-center py-10 text-gray-400 bg-white rounded-xl border border-dashed border-gray-300">
                                    暂无相关行程
                                </div>
                            ) : (
                                filteredPosts.map(post => (
                                    <div key={post.id} className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all cursor-pointer overflow-hidden flex group/post" onClick={() => openPost(post)}>
                                        {/* Vote Column (Reddit Style) */}
                                        <div className="w-12 bg-gray-50 flex flex-col items-center pt-4 border-r border-gray-100 shrink-0">
                                            <button 
                                                onClick={(e) => handleLike(e, post)} 
                                                className={`p-1 rounded hover:bg-gray-200 ${post.likedBy?.includes(currentUser.username) ? 'text-orange-500' : 'text-gray-400'}`}
                                            >
                                                <ThumbsUp size={20} className={post.likedBy?.includes(currentUser.username) ? 'fill-current' : ''} />
                                            </button>
                                            <span className={`text-xs font-bold mt-1 ${post.likedBy?.includes(currentUser.username) ? 'text-orange-600' : 'text-gray-600'}`}>
                                                {post.likes}
                                            </span>
                                        </div>
                                        
                                        {/* Content */}
                                        <div className="flex-1 p-4 min-w-0">
                                            <div className="flex justify-between items-start mb-1">
                                                <h3 className="font-bold text-gray-900 text-lg line-clamp-1 group-hover/post:text-blue-600 transition-colors">
                                                    {post.title}
                                                </h3>
                                                {/* Edit/Delete if Author */}
                                                {(currentUser.username === post.authorId || currentUser.role === 'super_admin') && (
                                                    <div className="flex items-center gap-1 opacity-0 group-hover/post:opacity-100 transition-opacity">
                                                        {currentUser.username === post.authorId && (
                                                            <button 
                                                                onClick={(e) => handleStartEdit(e, post)}
                                                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                                                            >
                                                                <Edit size={14}/>
                                                            </button>
                                                        )}
                                                        <button 
                                                            onClick={(e) => handleDeletePost(e, post)}
                                                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                                                        >
                                                            <Trash2 size={14}/>
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                            
                                            <div className="flex flex-wrap gap-2 mb-2">
                                                {post.tags.map((tag, idx) => (
                                                    <span key={idx} className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full border border-gray-200">
                                                        {tag}
                                                    </span>
                                                ))}
                                            </div>

                                            <p className="text-gray-500 text-sm line-clamp-2 mb-3">
                                                {post.description}
                                            </p>
                                            
                                            <div className="flex items-center gap-4 text-xs text-gray-400 mt-auto">
                                                <span className="flex items-center gap-1 font-medium text-gray-500">
                                                    <UserIcon size={12}/> {post.authorName}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Clock size={12}/> {new Date(post.publishedAt).toLocaleDateString()}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <MessageCircle size={12}/> {post.commentCount || 0} 评论
                                                </span>
                                                {/* <span className="flex items-center gap-1">
                                                    <Eye size={12}/> {post.viewCount || 0}
                                                </span> */}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </>
                )}

                {/* --- DETAIL VIEW --- */}
                {view === 'detail' && activePost && (
                    <div className="w-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
                        <div className="p-6 border-b border-gray-100">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h1 className="text-2xl font-bold text-gray-900 mb-2">{activePost.title}</h1>
                                    <div className="flex items-center gap-4 text-sm text-gray-500">
                                        <span className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-full">
                                            <UserIcon size={14}/> {activePost.authorName}
                                        </span>
                                        <span>{new Date(activePost.publishedAt).toLocaleString()}</span>
                                        <span className="flex items-center gap-1 text-orange-500 font-medium">
                                            <ThumbsUp size={14}/> {activePost.likes}
                                        </span>
                                    </div>
                                </div>
                                {(activePost.authorId !== currentUser.username) && (
                                    <button 
                                        onClick={() => { setMessageTarget(activePost.authorId); setShowMessageModal(true); }}
                                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-sm"
                                    >
                                        <Mail size={16}/> 私信作者
                                    </button>
                                )}
                            </div>

                            <div className="flex flex-wrap gap-2 mb-6">
                                {activePost.tags.map(tag => (
                                    <span key={tag} className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm font-medium border border-blue-100">
                                        {tag}
                                    </span>
                                ))}
                            </div>

                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 text-gray-700 leading-relaxed whitespace-pre-wrap mb-8">
                                {activePost.description}
                            </div>
                            
                            {/* Itinerary Preview (Simplified) */}
                            <div className="border rounded-xl overflow-hidden mb-8">
                                <div className="bg-gray-50 px-4 py-2 border-b font-bold text-gray-700 text-sm">行程预览</div>
                                <div className="max-h-96 overflow-y-auto p-4 bg-white">
                                    <table className="w-full text-sm">
                                        <thead className="text-left text-gray-500 border-b">
                                            <tr>
                                                <th className="pb-2 pl-2">Day</th>
                                                <th className="pb-2">路线</th>
                                                <th className="pb-2">住宿</th>
                                                <th className="pb-2">概览</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {activePost.tripSnapshot.rows.map(row => (
                                                <tr key={row.dayIndex}>
                                                    <td className="py-2 pl-2 font-medium text-gray-400">D{row.dayIndex}</td>
                                                    <td className="py-2 font-medium">{row.route || '-'}</td>
                                                    <td className="py-2 text-gray-600">
                                                        {row.hotelDetails.map(h => h.name).join(', ') || '-'}
                                                    </td>
                                                    <td className="py-2 text-gray-500 truncate max-w-xs" title={row.description}>
                                                        {row.description || '-'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Comments Section */}
                            <div className="space-y-6">
                                <h3 className="font-bold text-lg flex items-center gap-2">
                                    <MessageCircle size={20}/> 评论 ({comments.length})
                                </h3>
                                
                                <div className="flex gap-4">
                                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold shrink-0">
                                        {currentUser.username[0].toUpperCase()}
                                    </div>
                                    <div className="flex-1">
                                        <textarea 
                                            className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[100px]"
                                            placeholder="写下你的评论..."
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && !e.shiftKey) {
                                                    e.preventDefault();
                                                    submitComment((e.target as HTMLTextAreaElement).value);
                                                    (e.target as HTMLTextAreaElement).value = '';
                                                }
                                            }}
                                        />
                                        <p className="text-xs text-gray-400 mt-1 text-right">按 Enter 发送</p>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    {comments.map(comment => (
                                        <div key={comment.id} className="flex gap-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
                                            <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 font-bold shrink-0">
                                                {comment.userId[0].toUpperCase()}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="font-bold text-gray-900">{comment.userId}</span>
                                                    <span className="text-xs text-gray-400">{new Date(comment.createdAt).toLocaleString()}</span>
                                                </div>
                                                <p className="text-gray-700">{comment.content}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- INBOX VIEW --- */}
                {view === 'inbox' && (
                    <div className="w-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-[600px]">
                         <div className="p-4 border-b bg-gray-50 font-bold text-gray-700 flex justify-between items-center">
                             <span>我的私信</span>
                         </div>
                         <div className="flex-1 overflow-y-auto p-4 space-y-2">
                             {messages.length === 0 ? (
                                 <div className="text-center text-gray-400 mt-20">暂无私信</div>
                             ) : (
                                 messages.map(msg => (
                                     <div key={msg.id} className={`p-4 rounded-xl border ${msg.read ? 'bg-gray-50 border-gray-100' : 'bg-blue-50 border-blue-100'}`}>
                                         <div className="flex justify-between items-center mb-2">
                                             <span className="font-bold text-gray-800 flex items-center gap-2">
                                                 <UserIcon size={14}/> {msg.fromUser === currentUser.username ? `我 发给 ${msg.toUser}` : `${msg.fromUser} 发给我`}
                                             </span>
                                             <span className="text-xs text-gray-400">{new Date(msg.createdAt).toLocaleString()}</span>
                                         </div>
                                         <p className="text-gray-700">{msg.content}</p>
                                         {msg.toUser === currentUser.username && (
                                              <div className="mt-2 flex justify-end">
                                                  <button 
                                                    onClick={() => { setMessageTarget(msg.fromUser); setShowMessageModal(true); }}
                                                    className="text-xs text-blue-600 hover:underline"
                                                  >
                                                      回复
                                                  </button>
                                              </div>
                                         )}
                                     </div>
                                 ))
                             )}
                         </div>
                    </div>
                )}

            </div>

            {/* Message Modal */}
            {showMessageModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
                        <h3 className="font-bold text-lg mb-4">发送私信给 {messageTarget}</h3>
                        <textarea 
                            className="w-full border border-gray-300 rounded-lg p-3 h-32 mb-4 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="请输入内容..."
                            value={messageContent}
                            onChange={(e) => setMessageContent(e.target.value)}
                        />
                        <div className="flex justify-end gap-3">
                            <button onClick={() => setShowMessageModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">取消</button>
                            <button onClick={sendMessage} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
                                <Send size={16}/> 发送
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Post Modal */}
            {editingPost && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
                        <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Edit size={18}/> 编辑帖子</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">标题</label>
                                <input 
                                    type="text" 
                                    className="w-full border border-gray-300 rounded-lg p-2"
                                    value={editTitle}
                                    onChange={(e) => setEditTitle(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">描述</label>
                                <textarea 
                                    className="w-full border border-gray-300 rounded-lg p-2 h-32"
                                    value={editDesc}
                                    onChange={(e) => setEditDesc(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-2">标签</label>
                                <div className="flex flex-wrap gap-2">
                                    {PREDEFINED_TAGS.map(tag => {
                                        const isSelected = editTags.includes(tag);
                                        return (
                                            <button 
                                                key={tag} 
                                                onClick={() => { if (isSelected) setEditTags(prev => prev.filter(t => t !== tag)); else setEditTags(prev => [...prev, tag]); }} 
                                                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${isSelected ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-300 hover:border-purple-400'}`}
                                            >
                                                {tag}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setEditingPost(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">取消</button>
                            <button onClick={handleSaveEdit} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">保存修改</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};