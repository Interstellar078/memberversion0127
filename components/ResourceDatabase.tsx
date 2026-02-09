
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Trash2, X, Car, Hotel, Globe, MapPin, Search, Ticket, Palmtree, Download, Upload, Loader2, Check, AlertCircle, Info, Lock, FileText, File as FileIcon, GitMerge, Eye, Unlock, PackagePlus, Eraser, Paperclip, ExternalLink } from 'lucide-react';
import { CarCostEntry, PoiCity, PoiSpot, PoiHotel, PoiActivity, PoiOther, CountryFile, User, ResourceFile } from '../types';
import { generateUUID } from '../utils/dateUtils';

// --- Independent FileRow Component to isolate state and prevent re-renders ---
const FileRow: React.FC<{
    file: ResourceFile;
    canManageFiles: boolean;
    onUpdateDesc: (id: string, desc: string) => void;
    onDelete: (id: string) => void;
    onView: (f: ResourceFile) => void;
    onDownload: (f: ResourceFile) => void;
    onEnterKey: (e: React.KeyboardEvent) => void;
}> = ({ file, canManageFiles, onUpdateDesc, onDelete, onView, onDownload, onEnterKey }) => {
    // Local state to hold the input value during typing
    const [desc, setDesc] = useState(file.description);

    // Sync local state if prop changes from outside (e.g. data reload)
    useEffect(() => {
        setDesc(file.description);
    }, [file.description]);

    // Only update parent state on blur (prevents focus loss and excessive re-renders)
    const handleBlur = () => {
        if (desc !== file.description) {
            onUpdateDesc(file.id, desc);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            (e.target as HTMLElement).blur(); // Trigger blur to save
            onEnterKey(e);
        }
    };

    return (
        <tr className="hover:bg-purple-50/20 group">
            {/* 1. 文件名 */}
            <td className="px-4 py-2 text-sm text-gray-700 font-medium">
                <div className="flex items-center gap-2 cursor-pointer hover:text-blue-600" onClick={() => onView(file)}>
                    <Paperclip size={14} className="text-gray-400 shrink-0"/>
                    <span className="truncate">{file.fileName}</span>
                </div>
            </td>

            {/* 2. 操作列 (Preview / Download / Delete) - Moved Here */}
            <td className="px-4 py-2 text-center whitespace-nowrap">
                <div className="flex items-center gap-3">
                    <button onClick={() => onView(file)} className="text-gray-400 hover:text-blue-600 transition-colors" title="预览">
                        <Eye size={16}/>
                    </button>
                    <button onClick={() => onDownload(file)} className="text-gray-400 hover:text-green-600 transition-colors" title="下载文档">
                        <Download size={16}/>
                    </button>
                    {/* DELETE BUTTON (Visible only to Super Admins via canManageFiles) */}
                    {canManageFiles && (
                        <button onClick={() => onDelete(file.id)} className="text-gray-400 hover:text-red-500 transition-colors" title="删除文档 (仅管理员)">
                            <Trash2 size={16}/>
                        </button>
                    )}
                </div>
            </td>

            {/* 3. 备注 */}
            <td className="px-4 py-2">
                <input 
                    value={desc} 
                    disabled={!canManageFiles}
                    onKeyDown={handleKeyDown}
                    onChange={(e) => setDesc(e.target.value)}
                    onBlur={handleBlur}
                    className="w-full text-sm border-transparent bg-transparent hover:border-gray-200 hover:bg-white focus:border-blue-300 focus:bg-white rounded px-2 py-1 transition-all disabled:hover:bg-transparent"
                />
            </td>

            {/* 4. 上传者 */}
            <td className="px-4 py-2 text-xs text-gray-500">{file.uploadedBy}</td>

            {/* 5. 上传时间 */}
            <td className="px-4 py-2 text-xs text-gray-500">{new Date(file.uploadTime).toLocaleString()}</td>
        </tr>
    );
};

// --- Standalone FileTable Component ---
const FileTable: React.FC<{
  category: ResourceFile['category'];
  files: ResourceFile[] | null; // Nullable for lazy loading
  canViewFiles: boolean;
  canManageFiles: boolean;
  isUploading: boolean;
  uploadCategory: ResourceFile['category'];
  colWidths: Record<string, number>;
  onTriggerUpload: (c: ResourceFile['category']) => void;
  onUpdateDesc: (id: string, desc: string) => void;
  onDelete: (id: string) => void;
  onView: (f: ResourceFile) => void;
  onDownload: (f: ResourceFile) => void;
  onEnterKey: (e: React.KeyboardEvent) => void;
  onLoad: () => void;
  loading: boolean;
}> = ({ 
  category, files, canViewFiles, canManageFiles, isUploading, uploadCategory, colWidths,
  onTriggerUpload, onUpdateDesc, onDelete, onView, onDownload, onEnterKey, onLoad, loading
}) => {
    if (!canViewFiles) return null;
    
    // Helper for TH
    const Th = (id: string, label: string) => {
        const w = colWidths[id] || 100;
        return (
            <th style={{ width: w, minWidth: w }} className="relative px-4 py-3 text-left text-xs font-medium uppercase group text-gray-500 bg-gray-50 border-b border-gray-200">
               <div className="flex items-center justify-between w-full h-full">
                   <span className="truncate">{label}</span>
               </div>
            </th>
        );
    };

    return (
        <div className="mt-8 border-t border-gray-200 pt-4">
          <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                  <FileIcon size={16} className="text-purple-600"/> 相关文档 / 协议 / 附件
              </h4>
              {canManageFiles && files !== null && (
                  <button onClick={() => onTriggerUpload(category)} className="text-xs flex items-center gap-1 bg-purple-50 text-purple-700 px-3 py-1.5 rounded hover:bg-purple-100 border border-purple-200">
                      {isUploading && uploadCategory === category ? <Loader2 size={12} className="animate-spin"/> : <Upload size={12}/>}
                      上传文档
                  </button>
              )}
          </div>
          
          {files === null ? (
              <div className="p-6 bg-gray-50 rounded border border-dashed border-gray-300 flex justify-center items-center">
                  <button 
                    onClick={onLoad} 
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 shadow-sm rounded text-sm text-gray-700 hover:bg-gray-50 hover:text-blue-600 transition-colors"
                  >
                      {loading ? <Loader2 size={16} className="animate-spin"/> : <Download size={16}/>}
                      点击加载附件列表
                  </button>
              </div>
          ) : files.length > 0 ? (
              <div className="border border-gray-200 rounded-lg overflow-x-auto bg-white shadow-sm">
                  <table className="min-w-full divide-y divide-gray-200">
                       <thead>
                           <tr>
                               {Th('f_name', '文件名')}
                               <th className="w-28 px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 bg-gray-50 border-b border-gray-200">操作</th>
                               {Th('f_desc', '备注 (AI检索依据)')}
                               {Th('f_user', '上传者')}
                               {Th('f_time', '上传时间')}
                           </tr>
                       </thead>
                       <tbody className="divide-y divide-gray-200">
                           {files.map(file => (
                               <FileRow 
                                   key={file.id} 
                                   file={file}
                                   canManageFiles={canManageFiles}
                                   onUpdateDesc={onUpdateDesc}
                                   onDelete={onDelete}
                                   onView={onView}
                                   onDownload={onDownload}
                                   onEnterKey={onEnterKey}
                               />
                           ))}
                       </tbody>
                  </table>
              </div>
          ) : (
              <div className="p-4 bg-gray-50 rounded border border-dashed border-gray-300 text-center text-xs text-gray-400">
                  暂无相关文档
              </div>
          )}
      </div>
    );
};

interface ResourceDatabaseProps {
  isOpen: boolean;
  onClose: () => void;
  carDB: CarCostEntry[];
  poiCities: PoiCity[];
  poiSpots: PoiSpot[];
  poiHotels: PoiHotel[];
  poiActivities: PoiActivity[];
  poiOthers?: PoiOther[]; 
  countryFiles: CountryFile[];
  resourceFiles: ResourceFile[] | null; // Nullable for lazy load
  
  onUpdateCarDB: (db: CarCostEntry[]) => void;
  onUpdatePoiCities: (db: PoiCity[]) => void;
  onUpdatePoiSpots: (db: PoiSpot[]) => void;
  onUpdatePoiHotels: (db: PoiHotel[]) => void;
  onUpdatePoiActivities: (db: PoiActivity[]) => void;
  onUpdatePoiOthers?: (db: PoiOther[]) => void; 
  onUpdateCountryFiles: (files: CountryFile[]) => void;
  onUpdateResourceFiles: (files: ResourceFile[]) => void;
  onLoadResourceFiles: () => void;

  isReadOnly?: boolean;
  currentUser?: User | null;
  onActivity?: (username: string) => void;
  onForceSave?: () => void; 
}

export const ResourceDatabase: React.FC<ResourceDatabaseProps> = ({
  isOpen, onClose,
  carDB, poiCities, poiSpots, poiHotels, poiActivities, poiOthers = [], countryFiles, resourceFiles,
  onUpdateCarDB, onUpdatePoiCities, onUpdatePoiSpots, onUpdatePoiHotels, onUpdatePoiActivities, onUpdatePoiOthers, onUpdateCountryFiles, onUpdateResourceFiles,
  onLoadResourceFiles,
  isReadOnly = false,
  currentUser,
  onActivity,
  onForceSave
}) => {
  const [selectedCountry, setSelectedCountry] = useState<string>('');
  const [selectedCityId, setSelectedCityId] = useState<string>('');
  const [mainTab, setMainTab] = useState<'transport' | 'poi' | 'other'>('poi');
  const [poiTab, setPoiTab] = useState<'spot' | 'hotel' | 'activity'>('spot');
  
  const [newCountryName, setNewCountryName] = useState('');
  const [isAddingCountry, setIsAddingCountry] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [newCityName, setNewCityName] = useState('');
  const [isAddingCity, setIsAddingCity] = useState(false);
  
  const [colWidths, setColWidths] = useState<Record<string, number>>({
      t_model: 140, t_service: 120, t_pax: 80, t_priceLow: 100, t_priceHigh: 100, t_desc: 250, t_updated: 100,
      s_name: 200, s_price: 120, s_desc: 250, s_updated: 100, s_room: 150,
      h_name: 200, h_details: 600,
      a_name: 200, a_price: 120, a_desc: 250, a_updated: 100,
      o_name: 200, o_price: 120, o_desc: 300, o_updated: 100,
      f_name: 250, f_desc: 300, f_user: 100, f_time: 150
  });

  // Upload Logic
  const [isUploading, setIsUploading] = useState(false);
  const [isFileLoading, setIsFileLoading] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [uploadCategory, setUploadCategory] = useState<ResourceFile['category']>('country');

  // --- PERMISSION LOGIC ---
  const isSuperAdmin = currentUser?.role === 'super_admin';
  const isAdmin = currentUser?.role === 'admin';
  const isMember = currentUser?.role === 'user';

  // Visibility Check (Standard Data)
  const isVisible = (item: { createdBy?: string, isPublic?: boolean }) => {
      if (isSuperAdmin) return true;
      if (item.isPublic) return true;
      if (item.createdBy === currentUser?.username) return true;
      if (!item.createdBy) return true; 
      return false;
  };

  // Visibility Check (Files - Relaxed: Allow all logged in users to view/download)
  const canViewFiles = !!currentUser; 
  
  // Edit/Upload/Delete Check (Files - Strict: Only Super Admin)
  const canManageFiles = isSuperAdmin;

  // Standard Edit Permission
  const canEdit = (item: { createdBy?: string, isPublic?: boolean }) => {
      if (isSuperAdmin) return true;
      if (item.isPublic) return false;
      if (!item.createdBy) return false;
      return item.createdBy === currentUser?.username;
  };

  const canSeeRealPrice = (item: { createdBy?: string, isPublic?: boolean }) => {
      if (item.createdBy === currentUser?.username) return true; 
      if (!item.createdBy) return isSuperAdmin || isAdmin; 
      if (item.isPublic) return isSuperAdmin || isAdmin; 
      return isSuperAdmin; 
  };

  const formatDate = (ts?: number) => {
      if (!ts) return '-';
      return new Date(ts).toLocaleString();
  };

  const visibleCountries = useMemo(() => {
    const s = new Set<string>();
    carDB.filter(isVisible).forEach(c => c.region && s.add(c.region));
    poiCities.filter(isVisible).forEach(c => c.country && s.add(c.country));
    countryFiles.filter(isVisible).forEach(f => f.country && s.add(f.country));
    poiOthers.filter(isVisible).forEach(o => o.country && s.add(o.country));
    // If resourceFiles is null, we can't iterate it for country list, which is fine for lazy load.
    if (resourceFiles) resourceFiles.forEach(f => f.country && s.add(f.country));
    return Array.from(s).sort();
  }, [carDB, poiCities, countryFiles, poiOthers, resourceFiles, currentUser]);

  useEffect(() => {
    if (isOpen && visibleCountries.length > 0) {
        if (!selectedCountry || !visibleCountries.includes(selectedCountry)) {
            setSelectedCountry(visibleCountries[0]);
        }
    }
  }, [isOpen, visibleCountries]);

  const currentCars = carDB.filter(c => c.region === selectedCountry && isVisible(c));
  const currentCities = poiCities.filter(c => c.country === selectedCountry && isVisible(c));
  const currentSpots = poiSpots.filter(s => s.cityId === selectedCityId && isVisible(s));
  const currentActivities = poiActivities.filter(a => a.cityId === selectedCityId && isVisible(a));
  const currentHotels = poiHotels.filter(h => h.cityId === selectedCityId && isVisible(h));
  const currentOthers = poiOthers.filter(o => o.country === selectedCountry && isVisible(o));

  // --- FILE HANDLING ---
  
  const getFilesForCategory = (category: ResourceFile['category']) => {
      if (resourceFiles === null) return null;
      return resourceFiles.filter(f => f.country === selectedCountry && f.category === category);
  };

  const handleLoadFiles = async () => {
      if (resourceFiles !== null) return;
      setIsFileLoading(true);
      await onLoadResourceFiles();
      setIsFileLoading(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!isSuperAdmin) {
          alert("只有超级管理员有权限上传文档。");
          return;
      }
      
      const file = e.target.files?.[0];
      if (!file) return;

      if (resourceFiles === null) {
          alert("请先点击加载文档列表，然后再上传。");
          if (uploadInputRef.current) uploadInputRef.current.value = '';
          return;
      }

      if (file.size > 10 * 1024 * 1024) {
          alert("文件大小不能超过 10MB");
          return;
      }

      setIsUploading(true);
      const reader = new FileReader();
      
      const desc = window.prompt("请输入文档备注 (必填，用于AI检索):", file.name);
      if (desc === null) {
          setIsUploading(false);
          if (uploadInputRef.current) uploadInputRef.current.value = '';
          return;
      }

      reader.onload = (evt) => {
          const result = evt.target?.result as string;
          if (result) {
               const newFile: ResourceFile = {
                   id: generateUUID(),
                   country: selectedCountry,
                   category: uploadCategory,
                   fileName: file.name,
                   fileType: file.type,
                   fileSize: file.size,
                   data: result.split(',')[1],
                   description: desc || file.name,
                   uploadedBy: currentUser?.username || 'unknown',
                   uploadTime: Date.now()
               };
               
               onUpdateResourceFiles([...resourceFiles, newFile]);
               if (onActivity && currentUser) onActivity(currentUser.username);
               if (onForceSave) onForceSave(); 
          }
          setIsUploading(false);
          if (uploadInputRef.current) uploadInputRef.current.value = '';
      };
      
      reader.onerror = () => {
          alert("文件读取失败");
          setIsUploading(false);
      };

      reader.readAsDataURL(file);
  };

  const handleDeleteFile = (id: string) => {
      if (!isSuperAdmin || resourceFiles === null) return;
      if (window.confirm("确定删除此文档吗?")) {
          onUpdateResourceFiles(resourceFiles.filter(f => f.id !== id));
          if (onActivity && currentUser) onActivity(currentUser.username);
      }
  };
  
  const triggerUpload = (category: ResourceFile['category']) => {
      setUploadCategory(category);
      if (uploadInputRef.current) uploadInputRef.current.click();
  };
  
  const downloadFile = (file: ResourceFile) => {
      const link = document.createElement('a');
      link.href = `data:${file.fileType};base64,${file.data}`;
      link.download = file.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const viewFile = (file: ResourceFile) => {
       const newWindow = window.open();
       if (newWindow) {
           const src = `data:${file.fileType};base64,${file.data}`;
           if (file.fileType.startsWith('image/')) {
               newWindow.document.write(`<div style="display:flex;justify-content:center;align-items:center;height:100vh;background:#f0f0f0;"><img src="${src}" style="max-width:95%; max-height:95vh; box-shadow: 0 4px 6px rgba(0,0,0,0.1);"></div>`);
           } else if (file.fileType === 'application/pdf') {
               newWindow.document.write(`<iframe src="${src}" style="width:100%; height:100vh; border:none;"></iframe>`);
           } else {
               newWindow.document.write(`<div style="font-family:sans-serif; padding:20px;"><h3>无法预览此文件类型 (${file.fileType})</h3><p>请下载后查看。</p></div>`);
           }
           newWindow.document.title = `预览: ${file.fileName}`;
       }
  };

  const updateFileDesc = (id: string, desc: string) => {
      if (!canManageFiles || resourceFiles === null) return;
      const updated = resourceFiles.map(f => f.id === id ? { ...f, description: desc } : f);
      onUpdateResourceFiles(updated);
      if (onActivity && currentUser) onActivity(currentUser.username);
  };

  // --- UI COMPONENTS ---

  const startResize = (e: React.MouseEvent, id: string) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.pageX;
      const startW = colWidths[id] || 100;
      
      const onMove = (mv: MouseEvent) => {
          const newW = Math.max(50, startW + (mv.pageX - startX));
          setColWidths(prev => ({ ...prev, [id]: newW }));
      };
      
      const onUp = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
      };
      
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
  };

  const ResizableTh = (id: string, label: string, textColorClass = "text-gray-500") => {
    const w = colWidths[id] || 100;
    return (
        <th style={{ width: w, minWidth: w }} className={`relative px-4 py-3 text-left text-xs font-medium uppercase group ${textColorClass}`}>
           <div className="flex items-center justify-between w-full h-full relative">
               <span className="truncate">{label}</span>
               <div 
                   className="absolute -right-2 top-0 bottom-0 w-4 cursor-col-resize z-20 flex justify-center hover:bg-blue-400/20"
                   onMouseDown={(e) => startResize(e, id)}
                   onClick={(e) => e.stopPropagation()}
               >
                  <div className="w-[1px] h-full bg-gray-200 group-hover:bg-blue-400"></div>
               </div>
           </div>
        </th>
    );
  };

  // Helper Wrappers for Generic CRUD
  const markAsUpdated = () => { if (onActivity && currentUser) onActivity(currentUser.username); };
  
  const updateItem = <T extends { id: string, createdBy?: string, isPublic?: boolean }>(items: T[], updater: (newItems: T[]) => void, id: string, diff: Partial<T>) => {
      const target = items.find(i => i.id === id);
      if (!target || !canEdit(target)) return;
      updater(items.map(i => i.id === id ? { ...i, ...diff, lastUpdated: Date.now() } : i));
      markAsUpdated();
  };

  const deleteItem = <T extends { id: string, createdBy?: string, isPublic?: boolean }>(items: T[], updater: (newItems: T[]) => void, id: string, itemName: string) => {
      const target = items.find(i => i.id === id);
      if (!target || !canEdit(target)) return;
      if (window.confirm(`确定删除此${itemName}数据吗？`)) {
          updater(items.filter(i => i.id !== id));
          markAsUpdated();
      }
  };
  
  const togglePublic = <T extends { id: string, isPublic?: boolean }>(items: T[], updater: (items: T[]) => void, item: T) => {
      if (!isSuperAdmin) return;
      updater(items.map(i => i.id === item.id ? { ...i, isPublic: !item.isPublic, lastUpdated: Date.now() } : i));
      markAsUpdated();
  };

  const handleCreate = <T,>(creator: (base: any) => T, updater: (items: T[]) => void, currentItems: T[]) => {
      if (isReadOnly) return;
      const base = {
          id: generateUUID(),
          lastUpdated: Date.now(),
          createdBy: currentUser?.username || 'unknown',
          isPublic: isSuperAdmin 
      };
      updater([...currentItems, creator(base)]);
      markAsUpdated();
  };

  // Handle Force Save Key
  const handleEnterKey = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && onForceSave) {
          (e.target as HTMLElement).blur();
          onForceSave();
      }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col md:flex-row overflow-hidden">
        
        {/* Hidden Upload Input */}
        <input 
            type="file" 
            ref={uploadInputRef} 
            className="hidden" 
            onChange={handleFileUpload} 
        />

        {/* Sidebar */}
        <div className="w-full md:w-56 bg-gray-50 border-b md:border-b-0 md:border-r border-gray-200 flex flex-col shrink-0 h-48 md:h-auto">
          <div className="p-4 border-b border-gray-200 bg-gray-100">
             <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2">
               <Globe size={16} className="text-blue-600"/> 国家列表
             </h2>
             <input type="text" placeholder="搜索..." className="w-full mt-2 pl-2 py-1 text-xs border border-gray-300 rounded" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <div className="flex-1 overflow-y-auto">
            {visibleCountries.length > 0 ? (
                visibleCountries.filter(c => c.toLowerCase().includes(searchTerm.toLowerCase())).map(country => (
                <div key={country} onClick={() => setSelectedCountry(country)} className={`px-4 py-3 cursor-pointer flex justify-between items-center group ${selectedCountry === country ? 'bg-white border-l-4 border-blue-600 shadow-sm' : 'hover:bg-gray-100 border-l-4 border-transparent'}`}>
                    <span className={`text-sm font-medium ${selectedCountry === country ? 'text-blue-700' : 'text-gray-700'}`}>{country}</span>
                </div>
                ))
            ) : (
                <div className="p-4 text-center text-xs text-gray-400">暂无数据</div>
            )}
          </div>
          <div className="p-3 border-t bg-white space-y-2">
              {isAddingCountry ? (
                <div className="flex items-center gap-1">
                    <input autoFocus type="text" className="w-full text-xs border border-blue-300 rounded px-1 py-1" placeholder="新国家名称" value={newCountryName} onChange={(e) => setNewCountryName(e.target.value)} />
                    <button onClick={() => {
                        if (!newCountryName.trim()) return;
                        handleCreate(
                            (base) => ({ ...base, region: newCountryName.trim(), carModel: '适配车型', serviceType: '包车', passengers: 4, priceLow: 0, priceHigh: 0 }),
                            onUpdateCarDB, carDB
                        );
                        setSelectedCountry(newCountryName.trim());
                        setIsAddingCountry(false);
                        setNewCountryName('');
                    }}><Plus size={16} className="text-blue-600"/></button>
                </div>
              ) : (
                <button onClick={() => setIsAddingCountry(true)} className="w-full py-1.5 text-xs text-blue-600 border border-dashed border-blue-300 rounded hover:bg-blue-50 flex justify-center items-center gap-1"><Plus size={14}/> 添加国家</button>
              )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col bg-white min-w-0 h-full overflow-hidden">
           {selectedCountry ? (
             <>
                <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50 flex-wrap gap-2">
                    <div>
                        <div className="flex items-center gap-3">
                            <h2 className="text-xl font-bold text-gray-900">{selectedCountry}</h2>
                        </div>
                        <div className="flex gap-4 mt-4 overflow-x-auto pb-1">
                            <button onClick={() => setMainTab('poi')} className={`text-sm font-medium pb-1 border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${mainTab === 'poi' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}><MapPin size={16}/> 地点与资源</button>
                            <button onClick={() => setMainTab('transport')} className={`text-sm font-medium pb-1 border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${mainTab === 'transport' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}><Car size={16}/> 交通配置</button>
                            <button onClick={() => setMainTab('other')} className={`text-sm font-medium pb-1 border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${mainTab === 'other' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}><PackagePlus size={16}/> 其它服务</button>
                        </div>
                    </div>
                    <button onClick={onClose}><X size={24} className="text-gray-400 hover:text-gray-600" /></button>
                </div>

                <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
                    {mainTab === 'transport' && (
                        <div className="flex-1 p-4 md:p-6 overflow-auto">
                            <div className="bg-white border rounded-lg shadow-sm mb-8 overflow-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            {ResizableTh('t_model', '车型')}
                                            {ResizableTh('t_service', '服务')}
                                            {ResizableTh('t_pax', '顾客数')}
                                            {ResizableTh('t_priceLow', '淡季价格', 'text-blue-600')}
                                            {ResizableTh('t_priceHigh', '旺季价格', 'text-red-600')}
                                            {ResizableTh('t_desc', '备注')}
                                            {ResizableTh('t_updated', '更新时间')}
                                            <th className="w-24 px-4 py-3 text-xs font-medium text-gray-500">属性</th>
                                            <th className="w-16"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {currentCars.map(row => (
                                            <tr key={row.id}>
                                                <td className="px-4 py-2"><input onKeyDown={handleEnterKey} disabled={!canEdit(row)} className="w-full text-sm border-gray-300 rounded disabled:bg-transparent disabled:border-none" value={row.carModel} onChange={(e) => updateItem<CarCostEntry>(carDB, onUpdateCarDB, row.id, { carModel: e.target.value })} /></td>
                                                <td className="px-4 py-2">
                                                    <select onKeyDown={handleEnterKey} disabled={!canEdit(row)} className="w-full text-sm border-gray-300 rounded disabled:bg-transparent disabled:border-none" value={row.serviceType} onChange={(e) => updateItem<CarCostEntry>(carDB, onUpdateCarDB, row.id, { serviceType: e.target.value })}>
                                                        <option value="包车">包车</option>
                                                        <option value="接送">接送</option>
                                                        <option value="拼车">拼车</option>
                                                        <option value="接送机">接送机</option>
                                                        <option value="飞机">飞机</option>
                                                        <option value="火车">火车</option>
                                                        <option value="船舶">船舶</option>
                                                        <option value="其它">其它</option>
                                                    </select>
                                                </td>
                                                <td className="px-4 py-2"><input onKeyDown={handleEnterKey} disabled={!canEdit(row)} type="number" className="w-full text-sm border-gray-300 rounded disabled:bg-transparent disabled:border-none" value={row.passengers} onChange={(e) => updateItem<CarCostEntry>(carDB, onUpdateCarDB, row.id, { passengers: parseFloat(e.target.value) || 0 })} /></td>
                                                <td className="px-4 py-2">
                                                    {canSeeRealPrice(row) ? (
                                                        <input onKeyDown={handleEnterKey} disabled={!canEdit(row)} type="number" className="w-full text-sm border-gray-300 rounded text-blue-600 disabled:bg-transparent disabled:border-none" value={row.priceLow || ''} onChange={(e) => updateItem<CarCostEntry>(carDB, onUpdateCarDB, row.id, { priceLow: parseFloat(e.target.value) || 0 })} />
                                                    ) : <span className="text-sm text-gray-400 font-mono">****</span>}
                                                </td>
                                                <td className="px-4 py-2">
                                                    {canSeeRealPrice(row) ? (
                                                        <input onKeyDown={handleEnterKey} disabled={!canEdit(row)} type="number" className="w-full text-sm border-gray-300 rounded text-red-600 disabled:bg-transparent disabled:border-none" value={row.priceHigh || ''} onChange={(e) => updateItem<CarCostEntry>(carDB, onUpdateCarDB, row.id, { priceHigh: parseFloat(e.target.value) || 0 })} />
                                                    ) : <span className="text-sm text-gray-400 font-mono">****</span>}
                                                </td>
                                                <td className="px-4 py-2"><input onKeyDown={handleEnterKey} disabled={!canEdit(row)} className="w-full text-sm border-gray-300 rounded disabled:bg-transparent disabled:border-none" value={row.description || ''} onChange={(e) => updateItem<CarCostEntry>(carDB, onUpdateCarDB, row.id, { description: e.target.value })} /></td>
                                                <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">{formatDate(row.lastUpdated)}</td>
                                                <td className="px-4 py-2 text-xs">
                                                    <div className="flex flex-col gap-1">
                                                        <span className={`px-1.5 py-0.5 rounded w-fit ${row.isPublic ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                                            {row.isPublic ? '公有' : '私有'}
                                                        </span>
                                                        {isSuperAdmin && (
                                                            <button onClick={() => togglePublic(carDB, onUpdateCarDB, row)} className="text-blue-600 hover:underline">
                                                                {row.isPublic ? '设为私有' : '设为公有'}
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 text-center">{canEdit(row) && <button onClick={() => deleteItem(carDB, onUpdateCarDB, row.id, '车型')}><Trash2 size={16} className="text-gray-300 hover:text-red-500"/></button>}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <button onClick={() => handleCreate((base) => ({ ...base, region: selectedCountry, carModel: '', serviceType: '包车', passengers: 4, priceLow: 0, priceHigh: 0 }), onUpdateCarDB, carDB)} className="m-4 text-sm text-blue-600 flex items-center gap-1"><Plus size={16}/> 添加车型配置</button>
                            </div>
                            
                            {/* TRANSPORT DOCUMENTS */}
                            <FileTable 
                                category="transport" 
                                files={getFilesForCategory("transport")} 
                                canViewFiles={canViewFiles}
                                canManageFiles={canManageFiles}
                                isUploading={isUploading}
                                uploadCategory={uploadCategory}
                                colWidths={colWidths}
                                onTriggerUpload={triggerUpload}
                                onUpdateDesc={updateFileDesc}
                                onDelete={handleDeleteFile}
                                onView={viewFile}
                                onDownload={downloadFile}
                                onEnterKey={handleEnterKey}
                                onLoad={handleLoadFiles}
                                loading={isFileLoading}
                            />
                        </div>
                    )}

                    {mainTab === 'other' && (
                        <div className="flex-1 p-4 md:p-6 overflow-auto">
                            <div className="bg-white border rounded-lg shadow-sm mb-8 overflow-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            {ResizableTh('o_name', '名称')}
                                            {ResizableTh('o_price', '价格')}
                                            {ResizableTh('o_desc', '备注')}
                                            {ResizableTh('o_updated', '更新时间')}
                                            <th className="w-24 px-4 py-3 text-xs font-medium text-gray-500">属性</th>
                                            <th className="w-16"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {currentOthers.map(row => (
                                            <tr key={row.id}>
                                                <td className="px-4 py-2"><input onKeyDown={handleEnterKey} disabled={!canEdit(row)} className="w-full text-sm border-gray-300 rounded disabled:bg-transparent disabled:border-none" value={row.name} onChange={(e) => updateItem<PoiOther>(poiOthers, onUpdatePoiOthers!, row.id, { name: e.target.value })} /></td>
                                                <td className="px-4 py-2">
                                                    {canSeeRealPrice(row) ? (
                                                        <input onKeyDown={handleEnterKey} disabled={!canEdit(row)} type="number" className="w-full text-sm border-gray-300 rounded text-blue-600 disabled:bg-transparent disabled:border-none" value={row.price || ''} onChange={(e) => updateItem<PoiOther>(poiOthers, onUpdatePoiOthers!, row.id, { price: parseFloat(e.target.value) || 0 })} />
                                                    ) : <span className="text-sm text-gray-400 font-mono">****</span>}
                                                </td>
                                                <td className="px-4 py-2"><input onKeyDown={handleEnterKey} disabled={!canEdit(row)} className="w-full text-sm border-gray-300 rounded disabled:bg-transparent disabled:border-none" value={row.description || ''} onChange={(e) => updateItem<PoiOther>(poiOthers, onUpdatePoiOthers!, row.id, { description: e.target.value })} /></td>
                                                <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">{formatDate(row.lastUpdated)}</td>
                                                <td className="px-4 py-2 text-xs">
                                                    <div className="flex flex-col gap-1">
                                                        <span className={`px-1.5 py-0.5 rounded w-fit ${row.isPublic ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                                            {row.isPublic ? '公有' : '私有'}
                                                        </span>
                                                        {isSuperAdmin && (
                                                            <button onClick={() => togglePublic(poiOthers, onUpdatePoiOthers!, row)} className="text-blue-600 hover:underline">
                                                                {row.isPublic ? '设为私有' : '设为公有'}
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 text-center">{canEdit(row) && <button onClick={() => deleteItem(poiOthers, onUpdatePoiOthers!, row.id, '其它服务')}><Trash2 size={16} className="text-gray-300 hover:text-red-500"/></button>}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <button onClick={() => handleCreate((base) => ({ ...base, country: selectedCountry, name: '', price: 0 }), onUpdatePoiOthers!, poiOthers)} className="m-4 text-sm text-blue-600 flex items-center gap-1"><Plus size={16}/> 添加其它服务</button>
                            </div>
                            
                            {/* OTHER/COUNTRY DOCUMENTS */}
                            <FileTable 
                                category="other" 
                                files={getFilesForCategory("other")} 
                                canViewFiles={canViewFiles}
                                canManageFiles={canManageFiles}
                                isUploading={isUploading}
                                uploadCategory={uploadCategory}
                                colWidths={colWidths}
                                onTriggerUpload={triggerUpload}
                                onUpdateDesc={updateFileDesc}
                                onDelete={handleDeleteFile}
                                onView={viewFile}
                                onDownload={downloadFile}
                                onEnterKey={handleEnterKey}
                                onLoad={handleLoadFiles}
                                loading={isFileLoading}
                            />
                        </div>
                    )}

                    {mainTab === 'poi' && (
                        <>
                            {/* City Sidebar */}
                            <div className="w-full md:w-48 border-b md:border-b-0 md:border-r border-gray-200 bg-gray-50 flex flex-col overflow-hidden h-40 md:h-auto">
                                <div className="p-3 border-b"><span className="text-xs font-bold text-gray-500 uppercase">地点列表</span></div>
                                <div className="flex-1 overflow-y-auto">
                                    {currentCities.map(city => (
                                        <div key={city.id} onClick={() => setSelectedCityId(city.id)} className={`px-4 py-2 cursor-pointer text-sm flex justify-between items-center group ${selectedCityId === city.id ? 'bg-white text-blue-600 font-medium border-l-2 md:border-l-0 md:border-r-2 border-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}>
                                            <input onKeyDown={handleEnterKey} disabled={!canEdit(city)} type="text" className={`w-full bg-transparent border-none p-0 text-sm cursor-pointer ${selectedCityId === city.id ? 'font-medium text-blue-600' : 'text-gray-600'}`} value={city.name} onChange={(e) => updateItem<PoiCity>(poiCities, onUpdatePoiCities, city.id, { name: e.target.value })} />
                                            {canEdit(city) && <button onClick={(e) => { e.stopPropagation(); deleteItem(poiCities, onUpdatePoiCities, city.id, '城市'); }} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 ml-2"><Trash2 size={12}/></button>}
                                        </div>
                                    ))}
                                </div>
                                <div className="p-2 border-t">
                                     {isAddingCity ? (
                                        <div className="flex items-center gap-1">
                                            <input autoFocus type="text" className="w-full text-xs border border-blue-300 rounded px-1 py-1" value={newCityName} onChange={(e) => setNewCityName(e.target.value)} />
                                            <button onClick={() => {
                                                if(!newCityName.trim()) return;
                                                handleCreate((base) => ({...base, country: selectedCountry, name: newCityName.trim()}), onUpdatePoiCities, poiCities);
                                                setIsAddingCity(false);
                                                setNewCityName('');
                                            }}><Plus size={16} className="text-blue-600"/></button>
                                        </div>
                                     ) : (
                                        <button onClick={() => setIsAddingCity(true)} className="w-full py-1 text-xs text-blue-600 border border-dashed border-blue-300 rounded hover:bg-blue-50 flex justify-center items-center gap-1"><Plus size={14}/> 添加地点</button>
                                     )}
                                </div>
                            </div>

                            {/* POI Content */}
                            <div className="flex-1 flex flex-col bg-white overflow-hidden">
                                {selectedCityId ? (
                                    <>
                                        <div className="flex border-b px-4 overflow-x-auto">
                                            {[{id:'spot',label:'景点/门票',Icon:Ticket}, {id:'hotel',label:'酒店',Icon:Hotel}, {id:'activity',label:'活动',Icon:Palmtree}].map(tab => (
                                                <button key={tab.id} onClick={() => setPoiTab(tab.id as any)} className={`px-4 py-3 text-sm font-medium border-b-2 flex items-center gap-2 whitespace-nowrap ${poiTab === tab.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}>
                                                    <tab.Icon size={16}/> {tab.label}
                                                </button>
                                            ))}
                                        </div>
                                        
                                        <div className="flex-1 overflow-auto p-4 bg-gray-50/50">
                                            <div className="bg-white border rounded shadow-sm overflow-auto">
                                                <table className="min-w-full divide-y divide-gray-200">
                                                    <thead className="bg-gray-50"><tr>
                                                        {ResizableTh('s_name', '名称')}
                                                        {poiTab === 'hotel' && ResizableTh('s_room', '房型')}
                                                        {ResizableTh('s_price', '价格')}
                                                        {ResizableTh('s_desc', '备注')}
                                                        {ResizableTh('s_updated', '更新时间')}
                                                        <th className="w-24 px-4 py-3 text-xs font-medium text-gray-500">属性</th>
                                                        <th className="w-12"></th>
                                                    </tr></thead>
                                                    <tbody className="divide-y divide-gray-200">
                                                        {(poiTab === 'spot' ? currentSpots : poiTab === 'hotel' ? currentHotels : currentActivities).map(item => (
                                                            <tr key={item.id}>
                                                                <td className="px-4 py-2"><input onKeyDown={handleEnterKey} disabled={!canEdit(item)} className="w-full text-sm border-gray-300 rounded disabled:bg-transparent disabled:border-none" value={item.name} onChange={(e) => {
                                                                    if (poiTab === 'spot') updateItem<PoiSpot>(poiSpots, onUpdatePoiSpots, item.id, { name: e.target.value });
                                                                    else if (poiTab === 'hotel') updateItem<PoiHotel>(poiHotels, onUpdatePoiHotels, item.id, { name: e.target.value });
                                                                    else updateItem<PoiActivity>(poiActivities, onUpdatePoiActivities, item.id, { name: e.target.value });
                                                                }} /></td>
                                                                
                                                                {poiTab === 'hotel' && (
                                                                    <td className="px-4 py-2"><input onKeyDown={handleEnterKey} disabled={!canEdit(item)} className="w-full text-sm border-gray-300 rounded disabled:bg-transparent disabled:border-none" value={(item as PoiHotel).roomType} onChange={(e) => updateItem<PoiHotel>(poiHotels, onUpdatePoiHotels, item.id, { roomType: e.target.value })} /></td>
                                                                )}
                                                                
                                                                <td className="px-4 py-2">
                                                                    {canSeeRealPrice(item) ? (
                                                                        <input onKeyDown={handleEnterKey} disabled={!canEdit(item)} type="number" className="w-full text-sm border-gray-300 rounded text-blue-600 disabled:bg-transparent disabled:border-none" value={item.price || ''} onChange={(e) => {
                                                                             const val = parseFloat(e.target.value) || 0;
                                                                             if (poiTab === 'spot') updateItem<PoiSpot>(poiSpots, onUpdatePoiSpots, item.id, { price: val });
                                                                             else if (poiTab === 'hotel') updateItem<PoiHotel>(poiHotels, onUpdatePoiHotels, item.id, { price: val });
                                                                             else updateItem<PoiActivity>(poiActivities, onUpdatePoiActivities, item.id, { price: val });
                                                                        }} />
                                                                    ) : <span className="text-sm text-gray-400 font-mono">****</span>}
                                                                </td>
                                                                
                                                                <td className="px-4 py-2"><input onKeyDown={handleEnterKey} disabled={!canEdit(item)} className="w-full text-sm border-gray-300 rounded disabled:bg-transparent disabled:border-none" value={item.description || ''} onChange={(e) => {
                                                                    if (poiTab === 'spot') updateItem<PoiSpot>(poiSpots, onUpdatePoiSpots, item.id, { description: e.target.value });
                                                                    else if (poiTab === 'hotel') updateItem<PoiHotel>(poiHotels, onUpdatePoiHotels, item.id, { description: e.target.value });
                                                                    else updateItem<PoiActivity>(poiActivities, onUpdatePoiActivities, item.id, { description: e.target.value });
                                                                }} /></td>

                                                                <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">{formatDate(item.lastUpdated)}</td>

                                                                <td className="px-4 py-2 text-xs">
                                                                    <div className="flex flex-col gap-1">
                                                                        <span className={`px-1.5 py-0.5 rounded w-fit ${item.isPublic ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                                                            {item.isPublic ? '公有' : '私有'}
                                                                        </span>
                                                                        {isSuperAdmin && (
                                                                            <button onClick={() => {
                                                                                if (poiTab === 'spot') togglePublic(poiSpots, onUpdatePoiSpots, item as PoiSpot);
                                                                                else if (poiTab === 'hotel') togglePublic(poiHotels, onUpdatePoiHotels, item as PoiHotel);
                                                                                else togglePublic(poiActivities, onUpdatePoiActivities, item as PoiActivity);
                                                                            }} className="text-blue-600 hover:underline">
                                                                                {item.isPublic ? '设为私有' : '设为公有'}
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </td>

                                                                <td className="px-4 text-center">{canEdit(item) && <button onClick={() => {
                                                                    if (poiTab === 'spot') deleteItem(poiSpots, onUpdatePoiSpots, item.id, '景点');
                                                                    else if (poiTab === 'hotel') deleteItem(poiHotels, onUpdatePoiHotels, item.id, '酒店');
                                                                    else deleteItem(poiActivities, onUpdatePoiActivities, item.id, '活动');
                                                                }}><Trash2 size={14} className="text-gray-300 hover:text-red-500"/></button>}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                                <button onClick={() => {
                                                    const base = { cityId: selectedCityId, name: '', price: 0 };
                                                    if (poiTab === 'spot') handleCreate(b => ({...b, ...base}), onUpdatePoiSpots, poiSpots);
                                                    else if (poiTab === 'hotel') handleCreate(b => ({...b, ...base, roomType: '标准间'}), onUpdatePoiHotels, poiHotels);
                                                    else handleCreate(b => ({...b, ...base}), onUpdatePoiActivities, poiActivities);
                                                }} className="m-3 text-xs text-blue-600 flex items-center gap-1"><Plus size={14}/> 添加资源</button>
                                            </div>
                                            
                                            {/* POI SPECIFIC DOCUMENTS */}
                                            <FileTable 
                                                category={poiTab} 
                                                files={getFilesForCategory(poiTab)} 
                                                canViewFiles={canViewFiles}
                                                canManageFiles={canManageFiles}
                                                isUploading={isUploading}
                                                uploadCategory={uploadCategory}
                                                colWidths={colWidths}
                                                onTriggerUpload={triggerUpload}
                                                onUpdateDesc={updateFileDesc}
                                                onDelete={handleDeleteFile}
                                                onView={viewFile}
                                                onDownload={downloadFile}
                                                onEnterKey={handleEnterKey}
                                                onLoad={handleLoadFiles}
                                                loading={isFileLoading}
                                            />
                                        </div>
                                    </>
                                ) : <div className="flex-1 flex items-center justify-center text-gray-300 flex-col gap-2 p-8"><MapPin size={40} className="opacity-20"/><span className="text-sm">请选择左侧/上方地点</span></div>}
                            </div>
                        </>
                    )}
                </div>
             </>
           ) : <div className="flex-1 flex items-center justify-center text-gray-300 flex-col gap-2 p-8"><Globe size={48} className="opacity-20"/><span className="text-sm">请选择左侧/上方国家</span></div>}
        </div>
      </div>
    </div>
  );
};
