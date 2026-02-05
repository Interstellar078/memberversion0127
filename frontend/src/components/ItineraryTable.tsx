
import React from 'react';
import { Plus, Trash2, Calendar, FileDown, Settings, Save, MapPin, Navigation, Info, Car, Hotel, Ticket, Palmtree, User, ArrowLeft, ArrowRight, Loader2, Sparkles, Wand2, Database, Rocket, FolderOpen, FileUp, FileSpreadsheet, CheckCircle, Cloud, ShieldAlert, LogOut, Library, GripVertical, AlertTriangle, ChevronDown, ChevronUp, Copy, Edit3, Filter, HardDrive, MinusCircle, PlusCircle, RefreshCw, RotateCcw, Search, Upload, X } from 'lucide-react';
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

    return (
        <React.Fragment>
            {/* DragDropContext removed due to React 19 incompatibility */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto no-scrollbar">
                    <table className="w-full text-sm text-left border-collapse">
                        <thead className="bg-slate-50 text-slate-700 border-b border-gray-200">
                            <tr>
                                {Th('day', 'Day', 'bg-slate-50', 'text-slate-600', true)}
                                {Th('date', '日期')}
                                {Th('route', '路线')}
                                {Th('transport', '交通/车型')}
                                {Th('hotel', '酒店/房型')}
                                {Th('description', '详情')}
                                {Th('ticket', '门票')}
                                {Th('activity', '活动')}
                                {Th('restaurant', '餐厅')}
                                {Th('otherService', '其它服务')}
                                {Th('transportCost', '交通费')}
                                {Th('hotelCost', '酒店费')}
                                {Th('ticketCost', '门票费')}
                                {Th('activityCost', '活动费')}
                                {Th('restaurantCost', '餐饮费')}
                                {Th('otherCost', '其它费用')}
                                <th className="w-10 sticky right-0 bg-gray-50 z-20"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
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
                                        className={`group transition-all duration-200 border-b border-gray-100 last:border-0 hover:bg-blue-50/30`}
                                    >
                                        <td className="p-2 sticky left-0 bg-white group-hover:bg-blue-50/40 transition-colors z-10 font-bold text-center text-slate-400 shadow-[4px_0_12px_rgba(0,0,0,0.02)]">
                                            <div className="flex items-center gap-2">
                                                {/* Drag handle hidden */}
                                                <div className="text-gray-100">
                                                    <GripVertical size={14} />
                                                </div>
                                                {row.dayIndex}
                                            </div>
                                        </td>
                                        <td className="p-1.5"><input type="date" className="w-full bg-transparent border border-transparent hover:border-gray-200 focus:bg-white focus:border-blue-400 rounded px-1 py-1 text-gray-700 text-sm focus:ring-2 focus:ring-blue-100 transition-all outline-none" value={row.date} onChange={(e) => { if (index === 0) setSettings(prev => ({ ...prev, startDate: e.target.value })); else updateRow(index, { date: e.target.value }); }} /></td>
                                        <td className="p-1.5"><div className="flex items-center justify-between gap-1"><div className="flex-1"><Autocomplete value={row.route} onChange={(val) => handleRouteUpdate(index, val)} suggestions={allowedCityNames} placeholder="城市-城市" separator="-" /></div><button tabIndex={-1} onClick={() => handleQuickSave('route', index)} className="opacity-0 group-hover:opacity-100 text-blue-300 hover:text-blue-600 transition-opacity"><PlusCircle size={14} /></button></div></td>

                                        {/* Transport Column */}
                                        <td className="p-1.5">
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
                                        <td className="p-1.5 relative group/cell">
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

                                        <td className="p-1.5"><textarea className="w-full bg-transparent border border-transparent hover:border-gray-200 focus:bg-white focus:border-blue-400 rounded px-1 py-1 text-sm focus:ring-2 focus:ring-blue-100 transition-all outline-none resize-y min-h-[3.5rem] text-gray-600 leading-relaxed" rows={3} value={row.description} onChange={(e) => updateRow(index, { description: e.target.value })} /></td>

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

                                        <td className="p-1.5 text-right align-top">{shouldMaskPrice(row.transportDetails.some(i => i.sourcePublic)) ? <span className="text-gray-400 font-mono text-sm px-1 py-1 block">{maskNumber(row.transportCost, true)}</span> : <input type="number" className="w-full bg-transparent border border-transparent hover:border-gray-200 focus:bg-white focus:border-blue-400 rounded px-1 py-1 text-right text-sm focus:ring-2 focus:ring-blue-100 transition-all outline-none text-gray-600 font-medium" value={row.transportCost} onChange={(e) => updateRow(index, { transportCost: parseFloat(e.target.value) || 0, manualCostFlags: { ...row.manualCostFlags, transport: true } })} />}</td>
                                        <td className="p-1.5 text-right align-top">{shouldMaskPrice(row.hotelDetails.some(i => i.sourcePublic)) ? <span className="text-gray-400 font-mono text-sm px-1 py-1 block">{maskNumber(row.hotelCost, true)}</span> : <input type="number" className="w-full bg-transparent border border-transparent hover:border-gray-200 focus:bg-white focus:border-blue-400 rounded px-1 py-1 text-right text-sm focus:ring-2 focus:ring-blue-100 transition-all outline-none text-gray-600 font-medium" value={row.hotelCost} onChange={(e) => updateRow(index, { hotelCost: parseFloat(e.target.value) || 0, manualCostFlags: { ...row.manualCostFlags, hotel: true } })} />}</td>
                                        <td className="p-1.5 text-right align-top">{shouldMaskPrice(row.ticketDetails.some(i => i.sourcePublic)) ? <span className="text-gray-400 font-mono text-sm px-1 py-1 block">{maskNumber(row.ticketCost, true)}</span> : <input type="number" className="w-full bg-transparent border border-transparent hover:border-gray-200 focus:bg-white focus:border-blue-400 rounded px-1 py-1 text-right text-sm focus:ring-2 focus:ring-blue-100 transition-all outline-none text-gray-600 font-medium" value={row.ticketCost} onChange={(e) => updateRow(index, { ticketCost: parseFloat(e.target.value) || 0, manualCostFlags: { ...row.manualCostFlags, ticket: true } })} />}</td>
                                        <td className="p-1.5 text-right align-top">{shouldMaskPrice(row.activityDetails.some(i => i.sourcePublic)) ? <span className="text-gray-400 font-mono text-sm px-1 py-1 block">{maskNumber(row.activityCost, true)}</span> : <input type="number" className="w-full bg-transparent border border-transparent hover:border-gray-200 focus:bg-white focus:border-blue-400 rounded px-1 py-1 text-right text-sm focus:ring-2 focus:ring-blue-100 transition-all outline-none text-gray-600 font-medium" value={row.activityCost} onChange={(e) => updateRow(index, { activityCost: parseFloat(e.target.value) || 0, manualCostFlags: { ...row.manualCostFlags, activity: true } })} />}</td>
                                        <td className="p-1.5 text-right align-top">{shouldMaskPrice((row.restaurantDetails || []).some(i => i.sourcePublic)) ? <span className="text-gray-400 font-mono text-sm px-1 py-1 block">{maskNumber(row.restaurantCost || 0, true)}</span> : <input type="number" className="w-full bg-transparent border border-transparent hover:border-gray-200 focus:bg-white focus:border-blue-400 rounded px-1 py-1 text-right text-sm focus:ring-2 focus:ring-blue-100 transition-all outline-none text-gray-600 font-medium" value={row.restaurantCost || 0} onChange={(e) => updateRow(index, { restaurantCost: parseFloat(e.target.value) || 0, manualCostFlags: { ...row.manualCostFlags, restaurant: true } })} />}</td>
                                        <td className="p-1.5 text-right align-top">{shouldMaskPrice(row.otherDetails.some(i => i.sourcePublic)) ? <span className="text-gray-400 font-mono text-sm px-1 py-1 block">{maskNumber(row.otherCost, true)}</span> : <input type="number" className="w-full bg-transparent border border-transparent hover:border-gray-200 focus:bg-white focus:border-blue-400 rounded px-1 py-1 text-right text-sm focus:ring-2 focus:ring-blue-100 transition-all outline-none text-gray-600 font-medium" value={row.otherCost} onChange={(e) => updateRow(index, { otherCost: parseFloat(e.target.value) || 0, manualCostFlags: { ...row.manualCostFlags, other: true } })} />}</td>

                                        <td className="p-1.5 text-center sticky right-0 bg-white group-hover:bg-blue-50/30 z-10 align-top"><button onClick={() => handleDeleteRow(index)} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot className="bg-slate-50 border-t-2 border-slate-100 font-bold text-slate-700 shadow-[0_-4px_12px_rgba(0,0,0,0.02)] relative z-20">
                            <tr>
                                <td colSpan={9} className="p-4 text-right text-gray-600 font-medium">总计成本 ({settings.currency}):</td>
                                <td colSpan={5} className="p-3 text-right text-blue-600">{isMember ? '****' : totalCost.toLocaleString()}</td>
                                <td></td>
                            </tr>
                            <tr>
                                <td colSpan={9} className="p-3"><div className="flex items-center justify-end gap-4 h-full"><button onClick={() => setIsChatOpen(true)} className="flex items-center gap-1 text-purple-600 bg-purple-50 hover:bg-purple-100 px-3 py-1 rounded-full border border-purple-200 text-xs font-bold transition-colors mr-2"><Wand2 size={14} /> AI 优化</button>{!isMember && (<div className="flex items-center gap-2 bg-blue-50 px-3 py-1 rounded-full border border-blue-100"><span className="text-xs font-medium text-blue-800">利润率</span><input type="range" min="0" max="60" step="1" value={settings.marginPercent} onChange={(e) => setSettings(prev => ({ ...prev, marginPercent: parseInt(e.target.value) || 0 }))} className="w-24 h-1.5 bg-blue-200 rounded-lg appearance-none cursor-pointer accent-blue-600" /><span className="text-xs font-bold text-blue-800 w-8 text-right">{settings.marginPercent}%</span></div>)}<span className="font-bold text-gray-700">总报价:</span></div></td>
                                <td colSpan={6} className="p-4 text-left"><span className="text-2xl text-green-600 font-black tracking-tight">{Math.round(totalCost * settings.exchangeRate / (1 - settings.marginPercent / 100)).toLocaleString()}</span></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
            <div className="p-4 bg-gray-50 border-t flex gap-4">
                <button onClick={() => setRows([...rows, createEmptyRow(rows.length + 1)])} className="flex-1 text-sm text-gray-500 flex items-center justify-center gap-2 hover:bg-white hover:text-blue-600 hover:border-blue-300 border border-dashed border-gray-300 py-3 rounded-lg transition-all shadow-sm group font-medium bg-white/50">
                    <Plus size={16} className="text-gray-400 group-hover:text-blue-500 transition-colors" /> 添加一天
                </button>
                <button onClick={handleRefreshCosts} className="flex-1 text-sm text-gray-500 flex items-center justify-center gap-2 hover:bg-white hover:text-green-600 hover:border-green-300 border border-dashed border-gray-300 py-3 rounded-lg transition-all shadow-sm group font-medium bg-white/50">
                    <RefreshCw size={16} className="text-gray-400 group-hover:text-green-500 transition-colors" /> 刷新价格
                </button>
            </div>
        </React.Fragment>
    );
};
