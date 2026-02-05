
import React from 'react';
import { Plus, Trash2, Calendar, FileDown, Settings, Save, MapPin, Navigation, Info, Car, Hotel, Ticket, Palmtree, User, ArrowLeft, ArrowRight, Loader2, Sparkles, Wand2, Database, Rocket, FolderOpen, FileUp, FileSpreadsheet, CheckCircle, Cloud, ShieldAlert, LogOut, Library, GripVertical, AlertTriangle, ChevronDown, ChevronUp, Copy, Edit3, Filter, HardDrive, MinusCircle, PlusCircle, RefreshCw, RotateCcw, Search, Upload, X, DollarSign } from 'lucide-react';
// import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { DayRow, TripSettings, TransportType, CarCostEntry, PoiCity, PoiSpot, PoiHotel, PoiActivity, PoiOther, CountryFile, TransportItem, HotelItem, GeneralItem } from '../types';
import { Autocomplete } from './Autocomplete';
import { MultiSelect } from './MultiSelect';
import { addDays } from '../utils/dateUtils';

interface ItineraryTableProps {
    rows: DayRow[];
    setRows: (rows: DayRow[]) => void;
    settings: TripSettings;
    setSettings: (updater: (prev: TripSettings) => TripSettings) => void;
    colWidths: Record<string, number>;
    setColWidths: (updater: (prev: Record<string, number>) => Record<string, number>) => void;
    isMember: boolean;
    totalCost: number;
    setIsChatOpen: (isOpen: boolean) => void;
    handleRefreshCosts: () => void;
    handleDeleteRow: (index: number) => void;
    // handleDragEnd: (result: DropResult) => void;
    updateRow: (index: number, updates: Partial<DayRow>) => void;
    handleRouteUpdate: (index: number, val: string) => void;
    handleQuickSave: (type: 'route' | 'hotel' | 'ticket' | 'activity', rowIndex: number) => void;

    // Resource Data for Dropdowns
    poiCities: PoiCity[];
    carDB: CarCostEntry[];
    poiHotels: PoiHotel[];
    poiSpots: PoiSpot[];
    poiActivities: PoiActivity[];
    poiOthers: PoiOther[];

    // Helpers
    createEmptyRow: (dayIndex: number) => DayRow;
    isResourceVisible: (item: any) => boolean;
    allowedCityNames: string[];
    extractCitiesFromRoute: (route: string) => string[];
    getMatchingCityIds: (name: string, allCities: PoiCity[]) => string[];
    getDestinationCityIds: (route: string) => string[];
    shouldMaskPrice: (flag?: boolean) => boolean;
    maskNumber: (num: number, isMasked: boolean) => string;

    // Actions
    addTransportItem: (index: number) => void;
    updateTransportItem: (rowIndex: number, itemId: string, updates: Partial<TransportItem>) => void;
    removeTransportItem: (rowIndex: number, itemId: string) => void;

    addHotelItem: (index: number) => void;
    updateHotelItem: (rowIndex: number, itemId: string, updates: Partial<HotelItem>) => void;
    removeHotelItem: (rowIndex: number, itemId: string) => void;

    addGeneralItem: (index: number, type: 'ticket' | 'activity' | 'other') => void;
    updateGeneralItem: (rowIndex: number, itemId: string, type: 'ticket' | 'activity' | 'other', updates: Partial<GeneralItem>) => void;
    removeGeneralItem: (rowIndex: number, itemId: string, type: 'ticket' | 'activity' | 'other') => void;
}

// 默认空图片
const DEFAULT_HOTEL_IMAGE = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&q=80&w=300&h=200';
const DEFAULT_SPOT_IMAGE = 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&q=80&w=300&h=200';
const DEFAULT_FOOD_IMAGE = 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&q=80&w=300&h=200'; // Added food image

export const ItineraryTable: React.FC<ItineraryTableProps> = ({
    rows, setRows, settings, setSettings, colWidths, setColWidths, isMember, totalCost,
    setIsChatOpen, handleRefreshCosts, handleDeleteRow, updateRow,
    handleRouteUpdate, handleQuickSave,
    poiCities, carDB, poiHotels, poiSpots, poiActivities, poiOthers,
    createEmptyRow, isResourceVisible, allowedCityNames, extractCitiesFromRoute, getMatchingCityIds, getDestinationCityIds, shouldMaskPrice, maskNumber,
    addTransportItem, updateTransportItem, removeTransportItem,
    addHotelItem, updateHotelItem, removeHotelItem,
    addGeneralItem, updateGeneralItem, removeGeneralItem
}) => {

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

    const Th = (id: string, label: string | React.ReactNode, bgClass = '', textClass = 'text-slate-600', sticky = false) => {
        const w = colWidths[id] || 100;
        return (
            <th key={id} style={{ width: w, minWidth: w }} className={`px-2 py-3 text-left text-xs font-bold uppercase tracking-wider group ${textClass} ${bgClass} sticky top-0 ${sticky ? 'left-0 z-30 shadow-[4px_0_12px_rgba(0,0,0,0.05)] bg-slate-50' : 'z-20 bg-slate-50'} border-b border-gray-200`}>
                <div className="flex items-center justify-between w-full h-full relative">
                    <span className="truncate w-full block">{label}</span>
                    <div className="absolute -right-2 top-0 bottom-0 w-4 cursor-col-resize z-20 flex justify-center hover:bg-blue-400/20 rounded transition-colors" onMouseDown={(e) => startResize(e, id)} onClick={(e) => e.stopPropagation()}>
                        <div className="w-[1px] h-full bg-gray-200 group-hover:bg-blue-400 transition-colors"></div>
                    </div>
                </div>
            </th>
        );
    };

    const totalDays = rows.length;

    return (
        <div className="flex flex-col h-full bg-white/50 backdrop-blur-sm relative">
            {/* Header / Toolbar */}
            <div className="p-4 border-b border-gray-200/50 flex justify-between items-center bg-white/80 backdrop-blur-md sticky top-0 z-20">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                        <Calendar size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                            行程规划表
                            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-xs rounded-full border border-indigo-100 font-normal">
                                {totalDays} 天
                            </span>
                        </h2>
                        <p className="text-xs text-gray-500">
                            {settings.startDate ? new Date(settings.startDate).toLocaleDateString() : '未设置日期'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    {/* Margin Control (Admin Only) */}
                    {!isMember && (
                        <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-full border border-gray-200">
                            <span className="text-xs font-medium text-gray-500">利润率</span>
                            <div className="relative flex items-center w-24">
                                <input
                                    type="range"
                                    min="0"
                                    max="60"
                                    step="1"
                                    disabled={isMember}
                                    value={settings.marginPercent}
                                    onChange={(e) => setSettings(prev => ({ ...prev, marginPercent: parseInt(e.target.value) || 0 }))}
                                    className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                />
                            </div>
                            <span className="text-xs font-bold text-blue-600 w-8 text-right font-mono">{settings.marginPercent}%</span>
                        </div>
                    )}

                    {/* Total Cost Display */}
                    <div className="flex items-center gap-3 pl-4 border-l border-gray-100">
                        <div className="flex flex-col items-end">
                            <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">总报价 ({settings.currency})</span>
                            <div className="flex items-baseline gap-1">
                                <span className="text-2xl font-black bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent tracking-tight">
                                    {isMember ? '****' : Math.round(totalCost * settings.exchangeRate / (1 - settings.marginPercent / 100)).toLocaleString()}
                                </span>
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            {/* Table Content */}
            <div className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent p-4">
                <div className="min-w-[1000px] pb-20"> {/* pb-20 for extra scroll space */}
                    <table className="w-full border-separate border-spacing-y-3">
                        <thead className="sticky top-0 z-10">
                            <tr className="shadow-md rounded-lg overflow-hidden">
                                <th className="px-4 py-4 text-left text-xs font-bold text-white uppercase tracking-wider w-20 bg-gradient-to-r from-indigo-500 to-indigo-600 first:rounded-l-xl">天数</th>
                                <th className="px-4 py-4 text-left text-xs font-bold text-white uppercase tracking-wider w-32 bg-indigo-600">日期</th>
                                <th className="px-4 py-4 text-left text-xs font-bold text-white uppercase tracking-wider bg-indigo-600">路线</th>
                                <th className="px-4 py-4 text-left text-xs font-bold text-white uppercase tracking-wider bg-indigo-600">交通/车型</th>
                                <th className="px-4 py-4 text-left text-xs font-bold text-white uppercase tracking-wider bg-indigo-600">酒店/房型</th>
                                <th className="px-4 py-4 text-left text-xs font-bold text-white uppercase tracking-wider bg-indigo-600">详情</th>
                                <th className="px-4 py-4 text-left text-xs font-bold text-white uppercase tracking-wider bg-indigo-600">门票</th>
                                <th className="px-4 py-4 text-left text-xs font-bold text-white uppercase tracking-wider bg-indigo-600">活动</th>
                                <th className="px-4 py-4 text-left text-xs font-bold text-white uppercase tracking-wider bg-indigo-600">餐厅</th>
                                <th className="px-4 py-4 text-left text-xs font-bold text-white uppercase tracking-wider bg-indigo-600">其它服务</th>
                                <th className="px-4 py-4 text-right text-xs font-bold text-white uppercase tracking-wider w-28 bg-indigo-600">交通费</th>
                                <th className="px-4 py-4 text-right text-xs font-bold text-white uppercase tracking-wider w-28 bg-indigo-600">酒店费</th>
                                <th className="px-4 py-4 text-right text-xs font-bold text-white uppercase tracking-wider w-28 bg-indigo-600">门票费</th>
                                <th className="px-4 py-4 text-right text-xs font-bold text-white uppercase tracking-wider w-28 bg-indigo-600">活动费</th>
                                <th className="px-4 py-4 text-right text-xs font-bold text-white uppercase tracking-wider w-28 bg-indigo-600">餐饮费</th>
                                <th className="px-4 py-4 text-right text-xs font-bold text-white uppercase tracking-wider w-28 bg-indigo-600">其它费用</th>
                                <th className="px-4 py-4 text-center text-xs font-bold text-white uppercase tracking-wider w-16 bg-gradient-to-r from-indigo-600 to-purple-600 last:rounded-r-xl">操作</th>
                            </tr>
                        </thead>
                        <tbody className="space-y-4">
                            {rows.map((row, index) => {
                                const destinationCityIds = getDestinationCityIds(row.route);
                                const routeCities = extractCitiesFromRoute(row.route);
                                let relevantCityIds: string[] = [];
                                if (routeCities.length > 0) {
                                    relevantCityIds = routeCities.flatMap(name => getMatchingCityIds(name, poiCities));
                                } else {
                                    relevantCityIds = poiCities
                                        .filter(c => settings.destinations.includes(c.country) && isResourceVisible(c))
                                        .map(c => c.id);
                                }
                                relevantCityIds = Array.from(new Set(relevantCityIds));

                                const visibleCars = carDB.filter(c =>
                                    isResourceVisible(c) &&
                                    (settings.destinations.includes(c.region) || c.region === '通用') &&
                                    (row.transport.length === 0 || row.transport.includes(c.serviceType))
                                );

                                const visibleHotels = poiHotels.filter(isResourceVisible);
                                let hotelOptions = destinationCityIds.length > 0 ? visibleHotels.filter(h => destinationCityIds.includes(h.cityId)) : visibleHotels;
                                const uniqueHotelNames = Array.from(new Set(hotelOptions.map(h => h.name)));
                                const validSpots = poiSpots.filter(s => (relevantCityIds.includes(s.cityId) || !s.cityId) && isResourceVisible(s));
                                const validActivities = poiActivities.filter(a => (relevantCityIds.includes(a.cityId) || !a.cityId) && isResourceVisible(a));
                                const validOthers = poiOthers.filter(o => settings.destinations.includes(o.country) && isResourceVisible(o));

                                return (
                                    <tr
                                        key={row.id}
                                        className={`
                                            group relative transition-all duration-300 ease-out
                                            hover:translate-z-0 hover:-translate-y-1 hover:shadow-lg
                                            bg-white border border-gray-100 rounded-xl
                                        `}
                                    >
                                        <td className="px-4 py-3 bg-white border-y border-l border-gray-100 rounded-l-xl group-hover:border-indigo-100 relative overflow-hidden">
                                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-indigo-400 to-purple-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                            <div className="flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-gray-200 mx-auto group-hover:bg-indigo-400 transition-colors" />
                                                <span className="font-bold text-gray-700">{row.dayIndex}</span>
                                            </div>
                                        </td>
                                        <td className="p-1.5 bg-white border-y border-gray-100 group-hover:border-indigo-100"><input type="date" className="w-full bg-transparent border border-transparent hover:border-gray-200 focus:bg-white focus:border-blue-400 rounded px-1 py-1 text-gray-700 text-sm focus:ring-2 focus:ring-blue-100 transition-all outline-none" value={row.date} onChange={(e) => { if (index === 0) setSettings(prev => ({ ...prev, startDate: e.target.value })); else updateRow(index, { date: e.target.value }); }} /></td>
                                        <td className="p-1.5 bg-white border-y border-gray-100 group-hover:border-indigo-100"><div className="flex items-center justify-between gap-1"><div className="flex-1"><Autocomplete value={row.route} onChange={(val) => handleRouteUpdate(index, val)} suggestions={allowedCityNames} placeholder="城市-城市" separator="-" /></div><button tabIndex={-1} onClick={() => handleQuickSave('route', index)} className="opacity-0 group-hover:opacity-100 text-blue-300 hover:text-blue-600 transition-opacity"><PlusCircle size={14} /></button></div></td>

                                        {/* Transport Column */}
                                        <td className="p-1.5 bg-white border-y border-gray-100 group-hover:border-indigo-100">
                                            <MultiSelect options={Object.values(TransportType)} value={row.transport} onChange={(v) => updateRow(index, { transport: v })} className="w-full mb-1" />
                                            <div className="space-y-1">
                                                {row.transportDetails.map(item => (
                                                    <div key={item.id} className="flex items-center gap-1 bg-gray-50 p-0.5 rounded border border-gray-200 text-xs">
                                                        <select className="flex-1 bg-transparent border-none p-0 text-xs w-20" value={item.model} onChange={(e) => updateTransportItem(index, item.id, { model: e.target.value })}>
                                                            <option value="">选择车型/交通</option>
                                                            {visibleCars.map(c => <option key={c.id} value={c.carModel}>{c.carModel}</option>)}
                                                        </select>
                                                        <span className="text-gray-400">x</span>
                                                        <input type="number" min="1" className="w-8 p-0 border-none bg-transparent text-center text-xs" value={item.quantity} onChange={(e) => updateTransportItem(index, item.id, { quantity: parseInt(e.target.value) || 1 })} />
                                                        <select className="bg-transparent border-none p-0 text-[10px] text-gray-500 w-10" value={item.priceType} onChange={(e) => updateTransportItem(index, item.id, { priceType: e.target.value as 'low' | 'high' })}>
                                                            <option value="low">淡季</option>
                                                            <option value="high">旺季</option>
                                                        </select>
                                                        <button onClick={() => removeTransportItem(index, item.id)} className="text-gray-400 hover:text-red-500"><X size={12} /></button>
                                                    </div>
                                                ))}
                                                <button onClick={() => addTransportItem(index)} className="text-xs text-blue-500 flex items-center gap-1 hover:underline"><Plus size={10} /> 添加车辆</button>
                                            </div>
                                        </td>

                                        {/* Hotel Column */}
                                        <td className="p-1.5 relative group/cell bg-white border-y border-gray-100 group-hover:border-indigo-100">
                                            <div className="space-y-1">
                                                {row.hotelDetails.map(item => (
                                                    <div key={item.id} className="flex flex-col gap-0.5 bg-gray-50 p-1 rounded border border-gray-200 text-xs">
                                                        <div className="flex items-center gap-1">
                                                            <Autocomplete className="flex-1 min-w-[80px]" value={item.name} onChange={(v) => updateHotelItem(index, item.id, { name: v })} suggestions={uniqueHotelNames} placeholder="酒店名" />
                                                            <button onClick={() => removeHotelItem(index, item.id)} className="text-gray-400 hover:text-red-500"><X size={12} /></button>
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            <select className="flex-1 bg-transparent border-gray-200 rounded text-[10px] p-0.5 h-5" value={item.roomType} onChange={(e) => updateHotelItem(index, item.id, { roomType: e.target.value })}>
                                                                <option value="">房型...</option>
                                                                {visibleHotels.filter(h => h.name === item.name).map(h => <option key={h.id} value={h.roomType}>{h.roomType}</option>)}
                                                            </select>
                                                            <span className="text-gray-400 text-[10px]">x</span>
                                                            <input type="number" min="0" className="w-8 p-0 border-none bg-transparent text-center text-xs" value={item.quantity} onChange={(e) => updateHotelItem(index, item.id, { quantity: parseInt(e.target.value) || 0 })} />
                                                        </div>
                                                    </div>
                                                ))}
                                                <button onClick={() => addHotelItem(index)} className="text-xs text-blue-500 flex items-center gap-1 hover:underline"><Plus size={10} /> 添加房间</button>
                                            </div>
                                            <button tabIndex={-1} onClick={() => handleQuickSave('hotel', index)} className="absolute right-1 top-2 opacity-0 group-hover/cell:opacity-100 text-blue-300 hover:text-blue-600"><PlusCircle size={14} /></button>
                                        </td>

                                        <td className="p-1.5 bg-white border-y border-gray-100 group-hover:border-indigo-100"><textarea className="w-full bg-transparent border border-transparent hover:border-gray-200 focus:bg-white focus:border-blue-400 rounded px-1 py-1 text-sm focus:ring-2 focus:ring-blue-100 transition-all outline-none resize-y min-h-[3.5rem] text-gray-600 leading-relaxed" rows={3} value={row.description} onChange={(e) => updateRow(index, { description: e.target.value })} /></td>

                                        {/* Ticket Column */}
                                        <td className="p-1.5 relative group/cell">
                                            <div className="space-y-1">
                                                {row.ticketDetails.map(item => (
                                                    <div key={item.id} className="flex items-center gap-1 bg-gray-50 p-0.5 rounded border border-gray-200 text-xs">
                                                        <Autocomplete className="flex-1 min-w-[60px]" value={item.name} onChange={(v) => updateGeneralItem(index, item.id, 'ticket', { name: v })} suggestions={validSpots.map(s => s.name)} placeholder="门票" />
                                                        <span className="text-gray-400">x</span>
                                                        <input type="number" step="0.1" className="w-10 p-0 border-none bg-transparent text-center text-xs" value={item.quantity} onChange={(e) => updateGeneralItem(index, item.id, 'ticket', { quantity: parseFloat(e.target.value) || 0 })} />
                                                        <button onClick={() => removeGeneralItem(index, item.id, 'ticket')} className="text-gray-400 hover:text-red-500"><X size={12} /></button>
                                                    </div>
                                                ))}
                                                <button onClick={() => addGeneralItem(index, 'ticket')} className="text-xs text-blue-500 flex items-center gap-1 hover:underline"><Plus size={10} /> 添加门票</button>
                                            </div>
                                            <button tabIndex={-1} onClick={() => handleQuickSave('ticket', index)} className="absolute right-1 top-2 opacity-0 group-hover/cell:opacity-100 text-blue-300 hover:text-blue-600"><PlusCircle size={14} /></button>
                                        </td>

                                        {/* Activity Column */}
                                        <td className="p-1.5 relative group/cell">
                                            <div className="space-y-1">
                                                {row.activityDetails.map(item => (
                                                    <div key={item.id} className="flex items-center gap-1 bg-gray-50 p-0.5 rounded border border-gray-200 text-xs">
                                                        <Autocomplete className="flex-1 min-w-[60px]" value={item.name} onChange={(v) => updateGeneralItem(index, item.id, 'activity', { name: v })} suggestions={validActivities.map(a => a.name)} placeholder="活动" />
                                                        <span className="text-gray-400">x</span>
                                                        <input type="number" step="0.1" className="w-10 p-0 border-none bg-transparent text-center text-xs" value={item.quantity} onChange={(e) => updateGeneralItem(index, item.id, 'activity', { quantity: parseFloat(e.target.value) || 0 })} />
                                                        <button onClick={() => removeGeneralItem(index, item.id, 'activity')} className="text-gray-400 hover:text-red-500"><X size={12} /></button>
                                                    </div>
                                                ))}
                                                <button onClick={() => addGeneralItem(index, 'activity')} className="text-xs text-blue-500 flex items-center gap-1 hover:underline"><Plus size={10} /> 添加活动</button>
                                            </div>
                                            <button tabIndex={-1} onClick={() => handleQuickSave('activity', index)} className="absolute right-1 top-2 opacity-0 group-hover/cell:opacity-100 text-blue-300 hover:text-blue-600"><PlusCircle size={14} /></button>
                                        </td>

                                        {/* Restaurant Column */}
                                        <td className="p-1.5 relative group/cell">
                                            <div className="space-y-1">
                                                {(row.restaurantDetails || []).map(item => (
                                                    <div key={item.id} className="flex items-center gap-1 bg-orange-50 p-0.5 rounded border border-orange-200 text-xs">
                                                        <span className="flex-1 min-w-[60px] px-1 text-gray-700">{item.name}</span>
                                                        <span className="text-gray-400">x</span>
                                                        <input type="number" step="0.1" className="w-10 p-0 border-none bg-transparent text-center text-xs" value={item.quantity} onChange={(e) => updateGeneralItem(index, item.id, 'restaurant', { quantity: parseFloat(e.target.value) || 0 })} />
                                                        <button onClick={() => removeGeneralItem(index, item.id, 'restaurant')} className="text-gray-400 hover:text-red-500"><X size={12} /></button>
                                                    </div>
                                                ))}
                                                {(row.restaurantDetails || []).length === 0 && <div className="text-xs text-gray-400 italic">AI推荐</div>}
                                            </div>
                                        </td>

                                        {/* Other Services Column */}
                                        <td className="p-1.5">
                                            <div className="space-y-1">
                                                {row.otherDetails.map(item => (
                                                    <div key={item.id} className="flex items-center gap-1 bg-gray-50 p-0.5 rounded border border-gray-200 text-xs">
                                                        <Autocomplete className="flex-1 min-w-[60px]" value={item.name} onChange={(v) => updateGeneralItem(index, item.id, 'other', { name: v })} suggestions={validOthers.map(o => o.name)} placeholder="服务" />
                                                        <span className="text-gray-400">x</span>
                                                        <input type="number" step="0.1" className="w-10 p-0 border-none bg-transparent text-center text-xs" value={item.quantity} onChange={(e) => updateGeneralItem(index, item.id, 'other', { quantity: parseFloat(e.target.value) || 0 })} />
                                                        <button onClick={() => removeGeneralItem(index, item.id, 'other')} className="text-gray-400 hover:text-red-500"><X size={12} /></button>
                                                    </div>
                                                ))}
                                                <button onClick={() => addGeneralItem(index, 'other')} className="text-xs text-blue-500 flex items-center gap-1 hover:underline"><Plus size={10} /> 添加服务</button>
                                            </div>
                                        </td>

                                        <td className="p-1.5 text-right align-middle">{shouldMaskPrice(row.transportDetails.some(i => i.sourcePublic)) ? <span className="text-gray-400 font-mono text-sm px-1 py-1 block">{maskNumber(row.transportCost, true)}</span> : <input type="number" className="w-full bg-transparent border border-transparent hover:border-gray-200 focus:bg-white focus:border-blue-400 rounded px-1 py-1 text-right text-sm focus:ring-2 focus:ring-blue-100 transition-all outline-none text-gray-600 font-medium" value={row.transportCost} onChange={(e) => updateRow(index, { transportCost: parseFloat(e.target.value) || 0, manualCostFlags: { ...row.manualCostFlags, transport: true } })} />}</td>
                                        <td className="p-1.5 text-right align-middle">{shouldMaskPrice(row.hotelDetails.some(i => i.sourcePublic)) ? <span className="text-gray-400 font-mono text-sm px-1 py-1 block">{maskNumber(row.hotelCost, true)}</span> : <input type="number" className="w-full bg-transparent border border-transparent hover:border-gray-200 focus:bg-white focus:border-blue-400 rounded px-1 py-1 text-right text-sm focus:ring-2 focus:ring-blue-100 transition-all outline-none text-gray-600 font-medium" value={row.hotelCost} onChange={(e) => updateRow(index, { hotelCost: parseFloat(e.target.value) || 0, manualCostFlags: { ...row.manualCostFlags, hotel: true } })} />}</td>
                                        <td className="p-1.5 text-right align-middle">{shouldMaskPrice(row.ticketDetails.some(i => i.sourcePublic)) ? <span className="text-gray-400 font-mono text-sm px-1 py-1 block">{maskNumber(row.ticketCost, true)}</span> : <input type="number" className="w-full bg-transparent border border-transparent hover:border-gray-200 focus:bg-white focus:border-blue-400 rounded px-1 py-1 text-right text-sm focus:ring-2 focus:ring-blue-100 transition-all outline-none text-gray-600 font-medium" value={row.ticketCost} onChange={(e) => updateRow(index, { ticketCost: parseFloat(e.target.value) || 0, manualCostFlags: { ...row.manualCostFlags, ticket: true } })} />}</td>
                                        <td className="p-1.5 text-right align-middle">{shouldMaskPrice(row.activityDetails.some(i => i.sourcePublic)) ? <span className="text-gray-400 font-mono text-sm px-1 py-1 block">{maskNumber(row.activityCost, true)}</span> : <input type="number" className="w-full bg-transparent border border-transparent hover:border-gray-200 focus:bg-white focus:border-blue-400 rounded px-1 py-1 text-right text-sm focus:ring-2 focus:ring-blue-100 transition-all outline-none text-gray-600 font-medium" value={row.activityCost} onChange={(e) => updateRow(index, { activityCost: parseFloat(e.target.value) || 0, manualCostFlags: { ...row.manualCostFlags, activity: true } })} />}</td>
                                        <td className="p-1.5 text-right align-middle">{shouldMaskPrice((row.restaurantDetails || []).some(i => i.sourcePublic)) ? <span className="text-gray-400 font-mono text-sm px-1 py-1 block">{maskNumber(row.restaurantCost || 0, true)}</span> : <input type="number" className="w-full bg-transparent border border-transparent hover:border-gray-200 focus:bg-white focus:border-blue-400 rounded px-1 py-1 text-right text-sm focus:ring-2 focus:ring-blue-100 transition-all outline-none text-gray-600 font-medium" value={row.restaurantCost || 0} onChange={(e) => updateRow(index, { restaurantCost: parseFloat(e.target.value) || 0, manualCostFlags: { ...row.manualCostFlags, restaurant: true } })} />}</td>
                                        <td className="p-1.5 text-right align-middle">{shouldMaskPrice(row.otherDetails.some(i => i.sourcePublic)) ? <span className="text-gray-400 font-mono text-sm px-1 py-1 block">{maskNumber(row.otherCost, true)}</span> : <input type="number" className="w-full bg-transparent border border-transparent hover:border-gray-200 focus:bg-white focus:border-blue-400 rounded px-1 py-1 text-right text-sm focus:ring-2 focus:ring-blue-100 transition-all outline-none text-gray-600 font-medium" value={row.otherCost} onChange={(e) => updateRow(index, { otherCost: parseFloat(e.target.value) || 0, manualCostFlags: { ...row.manualCostFlags, other: true } })} />}</td>

                                        <td className="p-1.5 text-center sticky right-0 bg-white group-hover:bg-blue-50/30 z-10 align-middle"><button onClick={() => handleDeleteRow(index)} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot className="bg-slate-50 border-t-2 border-slate-100 relative z-20 hidden">
                            {/* Footer Removed */}
                        </tfoot>
                    </table>
                </div>
            </div>
            {/* Floating Action Button for Add Day */}
            <div className="absolute bottom-8 left-8 z-30">
                <button
                    onClick={() => setRows([...rows, createEmptyRow(rows.length + 1)])}
                    className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-full shadow-lg shadow-blue-200 hover:shadow-blue-300 transform hover:-translate-y-1 hover:scale-105 transition-all font-medium"
                >
                    <Plus size={20} />
                    <span>添加一天</span>
                </button>
            </div >
        </div >
    );
};
