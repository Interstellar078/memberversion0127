import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Trash2, X, Car, Hotel, Globe, MapPin, Search, Ticket, Palmtree, PackagePlus, Eraser, ChevronRight } from 'lucide-react';
import * as XLSX from 'xlsx';
import { CarCostEntry, PoiCity, PoiSpot, PoiHotel, PoiActivity, PoiOther, CountryFile, ResourceDocument, User } from '../types';
import { generateUUID } from '../utils/dateUtils';
import { resourceApi } from '../services/resourceApi';
import { StorageService } from '../services/storageService';

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
    onUpdateCarDB: (db: CarCostEntry[] | ((prev: CarCostEntry[]) => CarCostEntry[])) => void;
    onUpdatePoiCities: (db: PoiCity[] | ((prev: PoiCity[]) => PoiCity[])) => void;
    onUpdatePoiSpots: (db: PoiSpot[] | ((prev: PoiSpot[]) => PoiSpot[])) => void;
    onUpdatePoiHotels: (db: PoiHotel[] | ((prev: PoiHotel[]) => PoiHotel[])) => void;
    onUpdatePoiActivities: (db: PoiActivity[] | ((prev: PoiActivity[]) => PoiActivity[])) => void;
    onUpdatePoiOthers?: (db: PoiOther[] | ((prev: PoiOther[]) => PoiOther[])) => void;
    onUpdateCountryFiles: (files: CountryFile[] | ((prev: CountryFile[]) => CountryFile[])) => void;
    isReadOnly?: boolean;
    currentUser?: User | null;
    onActivity?: (username: string) => void;
    onForceSave?: () => void;
}

export const ResourceDatabase: React.FC<ResourceDatabaseProps> = ({
    isOpen, onClose,
    carDB, poiCities, poiSpots, poiHotels, poiActivities, poiOthers = [], countryFiles,
    onUpdateCarDB, onUpdatePoiCities, onUpdatePoiSpots, onUpdatePoiHotels, onUpdatePoiActivities, onUpdatePoiOthers, onUpdateCountryFiles,
    isReadOnly = false,
    currentUser,
    onActivity,
    onForceSave
}) => {
    const [selectedCountry, setSelectedCountry] = useState<string>('');
    // activeSection: 'transport' | 'other' | cityId
    const [activeSection, setActiveSection] = useState<string>('transport');

    const [poiTab, setPoiTab] = useState<'spot' | 'hotel' | 'activity'>('spot');

    const [newCountryName, setNewCountryName] = useState('');
    const [isAddingCountry, setIsAddingCountry] = useState(false);
    const [countrySearchTerm, setCountrySearchTerm] = useState('');

    const [newCityName, setNewCityName] = useState('');
    const [isAddingCity, setIsAddingCity] = useState(false);

    const [colWidths, setColWidths] = useState<Record<string, number>>({
        t_model: 140, t_service: 120, t_pax: 80, t_priceLow: 100, t_priceHigh: 100, t_desc: 250, t_updated: 100,
        s_name: 200, s_price: 120, s_desc: 250, s_updated: 100,
        h_name: 200, h_details: 600,
        a_name: 200, a_price: 120, a_desc: 250, a_updated: 100,
        o_name: 200, o_price: 120, o_desc: 300, o_updated: 100
    });

    const fileInputRef = useRef<HTMLInputElement>(null);
    const docUploadRef = useRef<HTMLInputElement>(null);

    const pendingUpdates = useRef(new Map<string, number>());

    const normalizeOwner = <T extends { ownerId?: string; owner_id?: string; isPublic?: boolean; is_public?: boolean }>(item: T) => ({
        ...item,
        createdBy: item.ownerId ?? (item as any).owner_id,
        isPublic: item.isPublic ?? (item as any).is_public
    });

    const [resourceSearchTerm, setResourceSearchTerm] = useState('');
    const [resourceSearchLoading, setResourceSearchLoading] = useState(false);
    const [docMap, setDocMap] = useState<Record<string, ResourceDocument[]>>({});
    const [docUploadContext, setDocUploadContext] = useState<{ key: string; category: string; country: string; cityId?: string } | null>(null);
    const loadedDocKeys = useRef(new Set<string>());
    const loadingDocKeys = useRef(new Set<string>());
    const loadedCarRegions = useRef(new Set<string>());
    const loadingCarRegions = useRef(new Set<string>());
    const loadedOtherCountries = useRef(new Set<string>());
    const loadingOtherCountries = useRef(new Set<string>());

    const mergeByCity = <T extends { cityId?: string }>(items: T[], cityId: string, nextItems: T[]) => {
        const kept = items.filter((i) => i.cityId !== cityId);
        return [...kept, ...nextItems];
    };

    const mergeByRegion = <T extends { region?: string }>(items: T[], region: string, nextItems: T[]) => {
        const kept = items.filter((i) => (i as any).region !== region);
        return [...kept, ...nextItems];
    };

    const mergeByCountry = <T extends { country?: string }>(items: T[], country: string, nextItems: T[]) => {
        const kept = items.filter((i) => (i as any).country !== country);
        return [...kept, ...nextItems];
    };

    const scheduleUpdate = (key: string, fn: () => Promise<void>) => {
        const map = pendingUpdates.current;
        const existing = map.get(key);
        if (existing) window.clearTimeout(existing);
        const timer = window.setTimeout(() => {
            fn().catch((e) => console.error('Update failed', e));
            map.delete(key);
        }, 600);
        map.set(key, timer);
    };

    // --- PERMISSION LOGIC ---
    const isSuperAdmin = currentUser?.role === 'super_admin' || currentUser?.role === 'admin';
    const isAdmin = currentUser?.role === 'admin';
    const canViewDocs = currentUser?.role === 'admin' || currentUser?.role === 'super_admin';
    const canUploadDocs = currentUser?.role === 'super_admin';

    const isVisible = (item: { createdBy?: string, isPublic?: boolean }) => {
        if (isSuperAdmin) return true;
        if (item.isPublic) return true;
        if (item.createdBy === currentUser?.username) return true;
        if (!item.createdBy) return true;
        return false;
    };

    const canSeeRealPrice = (item: { createdBy?: string, isPublic?: boolean }) => {
        if (item.createdBy === currentUser?.username) return true;
        if (!item.createdBy) return isSuperAdmin || isAdmin;
        if (item.isPublic) return isSuperAdmin || isAdmin;
        return isSuperAdmin;
    };

    const canEdit = (item: { createdBy?: string, isPublic?: boolean }) => {
        if (isSuperAdmin) return true;
        if (item.isPublic) return false;
        if (!item.createdBy) return false;
        return item.createdBy === currentUser?.username;
    };

    const formatDate = (ts?: number) => {
        if (!ts) return '-';
        return new Date(ts).toLocaleDateString();
    };

    const formatDocDate = (iso?: string) => {
        if (!iso) return '-';
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return iso;
        return d.toLocaleString();
    };

    const renderDocsPanel = () => {
        if (!docQuery || !canViewDocs) return null;
        const key = docKey(docQuery.category, docQuery.country, docQuery.cityId);
        const docs = docMap[key] ?? [];
        return (
            <div className="mb-4 bg-white border rounded-lg shadow-sm">
                <div className="px-4 py-2 border-b flex items-center justify-between">
                    <div className="text-sm font-medium text-gray-700">合作资料</div>
                    {canUploadDocs && (
                        <button onClick={triggerDocUpload} className="text-xs px-3 py-1 rounded border border-blue-300 text-blue-600 hover:bg-blue-50">
                            上传资料
                        </button>
                    )}
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">文件/标题</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">备注</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">上传人</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">上传时间</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">下载</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {docs.length === 0 ? (
                                <tr>
                                    <td className="px-4 py-3 text-sm text-gray-400" colSpan={5}>暂无资料</td>
                                </tr>
                            ) : (
                                docs.map((doc) => (
                                    <tr key={doc.id}>
                                        <td className="px-4 py-2 text-sm text-gray-700">{doc.title || doc.fileName}</td>
                                        <td className="px-4 py-2 text-sm text-gray-600">{doc.note || '-'}</td>
                                        <td className="px-4 py-2 text-sm text-gray-600">{doc.uploadedBy || '-'}</td>
                                        <td className="px-4 py-2 text-sm text-gray-600">{formatDocDate(doc.uploadedAt)}</td>
                                        <td className="px-4 py-2 text-sm">
                                            {doc.downloadUrl ? (
                                                <a className="text-blue-600 hover:underline" href={doc.downloadUrl} target="_blank" rel="noreferrer">下载</a>
                                            ) : (
                                                '-'
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    // Filter Data based on visibility
    const visibleCountries = useMemo(() => {
        const s = new Set<string>();
        carDB.filter(isVisible).forEach(c => c.region && s.add(c.region));
        poiCities.filter(isVisible).forEach(c => c.country && s.add(c.country));
        countryFiles.filter(isVisible).forEach(f => f.country && s.add(f.country));
        poiOthers.filter(isVisible).forEach(o => o.country && s.add(o.country));
        return Array.from(s).sort();
    }, [carDB, poiCities, countryFiles, poiOthers, currentUser]);

    useEffect(() => {
        if (isOpen) {
            if (visibleCountries.length > 0) {
                if (!selectedCountry || !visibleCountries.includes(selectedCountry)) {
                    setSelectedCountry(visibleCountries[0]);
                }
            } else {
                setSelectedCountry('');
            }
        }
    }, [isOpen, visibleCountries, selectedCountry]);

    useEffect(() => {
        if (!selectedCountry) return;
        const citiesForCountry = poiCities.filter(c => c.country === selectedCountry && isVisible(c));
        const firstCity = citiesForCountry[0]?.id;
        setActiveSection((prev) => {
            if (!prev || prev === 'transport' || prev === 'other') return firstCity || 'transport';
            if (!citiesForCountry.some(c => c.id === prev)) return firstCity || 'transport';
            return prev;
        });
    }, [selectedCountry, poiCities, currentUser]);

    // Derived filtered lists
    const currentCars = carDB.filter(c => c.region === selectedCountry && isVisible(c));
    const currentCities = poiCities.filter(c => c.country === selectedCountry && isVisible(c));
    const currentOthers = poiOthers.filter(o => o.country === selectedCountry && isVisible(o));

    // Determine which data to show based on activeSection
    const isTransport = activeSection === 'transport';
    const isOther = activeSection === 'other';
    const isCity = !isTransport && !isOther;
    const currentCityId = isCity ? activeSection : '';

    const docKey = (category: string, country: string, cityId?: string) => `${category}|${country}|${cityId || ''}`;

    const docQuery = useMemo(() => {
        if (!selectedCountry) return null;
        if (isTransport) return { category: 'transport', country: selectedCountry };
        if (isOther) return { category: 'country', country: selectedCountry };
        if (isCity && currentCityId) {
            const category = poiTab === 'spot' ? 'ticket' : poiTab === 'hotel' ? 'hotel' : 'activity';
            return { category, country: selectedCountry, cityId: currentCityId };
        }
        return null;
    }, [selectedCountry, isTransport, isOther, isCity, currentCityId, poiTab]);

    const loadDocuments = async (query: { category: string; country: string; cityId?: string }) => {
        if (!canViewDocs) return;
        const key = docKey(query.category, query.country, query.cityId);
        if (loadedDocKeys.current.has(key) || loadingDocKeys.current.has(key)) return;
        loadingDocKeys.current.add(key);
        try {
            const docs = await resourceApi.listDocuments({ category: query.category, country: query.country, city_id: query.cityId });
            setDocMap((prev) => ({ ...prev, [key]: docs || [] }));
            loadedDocKeys.current.add(key);
        } catch (e) {
            console.error('Failed to load documents', e);
        } finally {
            loadingDocKeys.current.delete(key);
        }
    };

    useEffect(() => {
        if (!isOpen || !docQuery || !canViewDocs) return;
        loadDocuments(docQuery);
    }, [isOpen, docQuery, canViewDocs]);


    useEffect(() => {
        if (!isOpen || !currentCityId) return;
        setResourceSearchTerm('');
    }, [isOpen, currentCityId]);


    // load transports on demand when transport tab is opened
    useEffect(() => {
        if (!isOpen || !selectedCountry) return;
        if (activeSection != 'transport') return;
        if (loadedCarRegions.current.has(selectedCountry) || loadingCarRegions.current.has(selectedCountry)) return;
        loadingCarRegions.current.add(selectedCountry);
        resourceApi.listTransports({ region: selectedCountry, page: 1, size: 1000 })
            .then((cars) => {
                const norm = (cars || []).map(normalizeOwner);
                onUpdateCarDB((prev) => mergeByRegion(prev, selectedCountry, norm));
                loadedCarRegions.current.add(selectedCountry);
            })
            .catch((e) => console.error('Failed to load transport config', e))
            .finally(() => {
                loadingCarRegions.current.delete(selectedCountry);
            });
    }, [isOpen, activeSection, selectedCountry]);

    // load other services/files on demand when other tab is opened
    useEffect(() => {
        if (!isOpen || !selectedCountry) return;
        if (activeSection != 'other') return;
        if (loadedOtherCountries.current.has(selectedCountry) || loadingOtherCountries.current.has(selectedCountry)) return;
        loadingOtherCountries.current.add(selectedCountry);
        Promise.all([StorageService.getOthers(), StorageService.getFiles()])
            .then(([others, files]) => {
                const normOthers = (others || []).map(normalizeOwner).filter((o) => o.country === selectedCountry);
                const normFiles = (files || []).map(normalizeOwner).filter((f) => f.country === selectedCountry);
                if (onUpdatePoiOthers) onUpdatePoiOthers((prev) => mergeByCountry(prev, selectedCountry, normOthers));
                onUpdateCountryFiles((prev) => mergeByCountry(prev, selectedCountry, normFiles));
                loadedOtherCountries.current.add(selectedCountry);
            })
            .catch((e) => console.error('Failed to load other services', e))
            .finally(() => {
                loadingOtherCountries.current.delete(selectedCountry);
            });
    }, [isOpen, activeSection, selectedCountry]);
    const runResourceSearch = async (termOverride?: string) => {
        if (!currentCityId) return;
        const term = (termOverride ?? resourceSearchTerm).trim();
        if (!term) {
            setResourceSearchLoading(true);
            try {
                if (poiTab === 'spot') {
                    const spots = await resourceApi.listSpots({ city_id: currentCityId, page: 1, size: 50 });
                    const norm = (spots || []).map(normalizeOwner);
                    onUpdatePoiSpots((prev) => mergeByCity(prev, currentCityId, norm));
                } else if (poiTab === 'hotel') {
                    const hotels = await resourceApi.listHotels({ city_id: currentCityId, page: 1, size: 50 });
                    const norm = (hotels || []).map(normalizeOwner);
                    onUpdatePoiHotels((prev) => mergeByCity(prev, currentCityId, norm));
                } else {
                    const activities = await resourceApi.listActivities({ city_id: currentCityId, page: 1, size: 50 });
                    const norm = (activities || []).map(normalizeOwner);
                    onUpdatePoiActivities((prev) => mergeByCity(prev, currentCityId, norm));
                }
            } catch (e) {
                console.error('Failed to load city resources', e);
            } finally {
                setResourceSearchLoading(false);
            }
            return;
        }
        setResourceSearchLoading(true);
        try {
            if (poiTab === 'spot') {
                const spots = await resourceApi.listSpots({ city_id: currentCityId, search: term, page: 1, size: 50 });
                const norm = (spots || []).map(normalizeOwner);
                onUpdatePoiSpots((prev) => mergeByCity(prev, currentCityId, norm));
            } else if (poiTab === 'hotel') {
                const hotels = await resourceApi.listHotels({ city_id: currentCityId, search: term, page: 1, size: 50 });
                const norm = (hotels || []).map(normalizeOwner);
                onUpdatePoiHotels((prev) => mergeByCity(prev, currentCityId, norm));
            } else {
                const activities = await resourceApi.listActivities({ city_id: currentCityId, search: term, page: 1, size: 50 });
                const norm = (activities || []).map(normalizeOwner);
                onUpdatePoiActivities((prev) => mergeByCity(prev, currentCityId, norm));
            }
        } catch (e) {
            console.error('Failed to search city resources', e);
        } finally {
            setResourceSearchLoading(false);
        }
    };

    const triggerDocUpload = () => {
        if (!docQuery || !docUploadRef.current) return;
        const key = docKey(docQuery.category, docQuery.country, docQuery.cityId);
        setDocUploadContext({ key, category: docQuery.category, country: docQuery.country, cityId: docQuery.cityId });
        docUploadRef.current.value = '';
        docUploadRef.current.click();
    };

    const handleDocUploadChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const ctx = docUploadContext;
        const files = Array.from(event.target.files ?? []);
        if (!ctx || files.length === 0) return;
        const note = window.prompt('备注(可选):')?.trim() || '';
        const uploaded: ResourceDocument[] = [];
        for (const file of files) {
            try {
                const doc = await resourceApi.uploadDocument({
                    file,
                    category: ctx.category,
                    country: ctx.country,
                    cityId: ctx.cityId,
                    note: note || undefined,
                    title: file.name
                });
                uploaded.push(doc);
            } catch (e) {
                console.error('Failed to upload document', e);
            }
        }
        if (uploaded.length) {
            setDocMap((prev) => {
                const existing = prev[ctx.key] ?? [];
                return { ...prev, [ctx.key]: [...uploaded, ...existing] };
            });
            loadedDocKeys.current.add(ctx.key);
        }
        event.target.value = '';
        setDocUploadContext(null);
    };


    useEffect(() => {
        if (!currentCityId) return;
        if (!resourceSearchTerm.trim()) {
            runResourceSearch('');
            return;
        }
        runResourceSearch();
    }, [poiTab, currentCityId]);


    const currentSpots = poiSpots.filter(s => s.cityId === currentCityId && isVisible(s));
    const currentActivities = poiActivities.filter(a => a.cityId === currentCityId && isVisible(a));
    const currentHotels = poiHotels.filter(h => h.cityId === currentCityId && isVisible(h));
    const hasAutoResults = poiTab === 'spot' ? currentSpots.length > 0 : poiTab === 'hotel' ? currentHotels.length > 0 : currentActivities.length > 0;
    const shouldShowResults = resourceSearchTerm.trim().length > 0 || hasAutoResults;

    // Helper to toggle Public status (Super Admin only)
    const togglePublicLocal = <T extends { id: string, isPublic?: boolean }>(items: T[], updater: (items: T[]) => void, item: T) => {
        if (!isSuperAdmin) return;
        const updated = items.map(i => i.id === item.id ? { ...i, isPublic: !i.isPublic } : i);
        updater(updated);
        markAsUpdated();
    };

    const togglePublicRemote = async <T extends { id: string, isPublic?: boolean }>(
        kind: 'transport' | 'spot' | 'hotel' | 'activity',
        items: T[],
        updater: (items: T[]) => void,
        item: T
    ) => {
        if (!isSuperAdmin) return;
        const updated = items.map(i => i.id === item.id ? { ...i, isPublic: !i.isPublic } : i);
        updater(updated);
        markAsUpdated();
        const target = updated.find(i => i.id === item.id) as any;
        if (kind === 'transport') await resourceApi.updateTransport(item.id, { isPublic: target.isPublic });
        else if (kind === 'spot') await resourceApi.updateSpot(item.id, { isPublic: target.isPublic });
        else if (kind === 'hotel') await resourceApi.updateHotel(item.id, { isPublic: target.isPublic });
        else if (kind === 'activity') await resourceApi.updateActivity(item.id, { isPublic: target.isPublic });
    };


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
                <div className="flex items-center justify-between w-full h-full">
                    <span className="truncate">{label}</span>
                    <div className="absolute -right-2 top-0 bottom-0 w-4 cursor-col-resize z-10 flex justify-center hover:bg-blue-100 rounded" onMouseDown={(e) => startResize(e, id)} onClick={(e) => e.stopPropagation()}>
                        <div className="w-[1px] h-full bg-gray-200 group-hover:bg-blue-400"></div>
                    </div>
                </div>
            </th>
        );
    };

    const handleEnterKey = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && onForceSave) {
            (e.target as HTMLElement).blur();
            onForceSave();
        }
    };

    const markAsUpdated = () => {
        if (onActivity && currentUser) {
            onActivity(currentUser.username);
        }
    };

    const updateItemLocal = <T extends { id: string, createdBy?: string, isPublic?: boolean }>(items: T[], updater: (newItems: T[]) => void, id: string, diff: Partial<T>) => {
        const target = items.find(i => i.id === id);
        if (!target || !canEdit(target)) return;
        const updatedItems = items.map(i => (i.id === id ? { ...i, ...diff, lastUpdated: Date.now() } : i));
        updater(updatedItems);
        markAsUpdated();
    };

    const updateItemRemote = <T extends { id: string, createdBy?: string, isPublic?: boolean }>(
        kind: 'transport' | 'city' | 'spot' | 'hotel' | 'activity',
        items: T[],
        updater: (newItems: T[]) => void,
        id: string,
        diff: Partial<T>
    ) => {
        const target = items.find(i => i.id === id);
        if (!target || !canEdit(target)) return;
        const updated = { ...target, ...diff, lastUpdated: Date.now() } as any;
        const updatedItems = items.map(i => (i.id === id ? updated : i));
        updater(updatedItems);
        markAsUpdated();
        scheduleUpdate(`${kind}:${id}`, async () => {
            if (kind === 'transport') {
                await resourceApi.updateTransport(id, {
                    region: updated.region,
                    carModel: updated.carModel,
                    serviceType: updated.serviceType,
                    passengers: updated.passengers,
                    priceLow: updated.priceLow,
                    priceHigh: updated.priceHigh,
                    isPublic: updated.isPublic
                });
            } else if (kind === 'city') {
                await resourceApi.updateCity(id, { name: updated.name, country: updated.country, isPublic: updated.isPublic });
            } else if (kind === 'spot') {
                await resourceApi.updateSpot(id, { name: updated.name, price: updated.price, cityId: updated.cityId, isPublic: updated.isPublic });
            } else if (kind === 'hotel') {
                await resourceApi.updateHotel(id, { name: updated.name, roomType: updated.roomType, price: updated.price, cityId: updated.cityId, isPublic: updated.isPublic });
            } else if (kind === 'activity') {
                await resourceApi.updateActivity(id, { name: updated.name, price: updated.price, cityId: updated.cityId, isPublic: updated.isPublic });
            }
        });
    };



    const deleteItemLocal = <T extends { id: string, createdBy?: string, isPublic?: boolean }>(items: T[], updater: (newItems: T[]) => void, id: string, itemName: string) => {
        const target = items.find(i => i.id === id);
        if (!target || !canEdit(target)) return;

        if (window.confirm(`确定删除此${itemName}数据吗？`)) {
            updater(items.filter(i => i.id !== id));
            markAsUpdated();
        }
    };

    const deleteItemRemote = async <T extends { id: string, createdBy?: string, isPublic?: boolean }>(
        kind: 'transport' | 'city' | 'spot' | 'hotel' | 'activity',
        items: T[],
        updater: (newItems: T[]) => void,
        id: string,
        itemName: string
    ) => {
        const target = items.find(i => i.id === id);
        if (!target || !canEdit(target)) return;
        if (!window.confirm(`确定删除此${itemName}数据吗？`)) return;
        if (kind === 'transport') await resourceApi.deleteTransport(id);
        else if (kind === 'city') await resourceApi.deleteCity(id);
        else if (kind === 'spot') await resourceApi.deleteSpot(id);
        else if (kind === 'hotel') await resourceApi.deleteHotel(id);
        else if (kind === 'activity') await resourceApi.deleteActivity(id);
        updater(items.filter(i => i.id !== id));
        markAsUpdated();
    };


    const handleCreateLocal = <T,>(creator: (base: any) => T, updater: (items: T[]) => void, currentItems: T[]) => {
        if (isReadOnly) return;
        const base = {
            id: generateUUID(),
            lastUpdated: Date.now(),
            createdBy: currentUser?.username || 'unknown',
            isPublic: isSuperAdmin
        };
        const newItem = creator(base);
        updater([...currentItems, newItem]);
        markAsUpdated();
    };

    const handleCreateRemote = async <T,>(
        kind: 'transport' | 'city' | 'spot' | 'hotel' | 'activity',
        payload: any,
        updater: (items: T[]) => void,
        currentItems: T[]
    ) => {
        if (isReadOnly) return;
        let created: any = null;
        if (kind === 'transport') created = await resourceApi.createTransport(payload);
        else if (kind === 'city') created = await resourceApi.createCity(payload);
        else if (kind === 'spot') created = await resourceApi.createSpot(payload);
        else if (kind === 'hotel') created = await resourceApi.createHotel(payload);
        else if (kind === 'activity') created = await resourceApi.createActivity(payload);
        if (!created) return;
        updater([...currentItems, normalizeOwner(created)]);
        markAsUpdated();
    };



    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-7xl h-[90vh] flex overflow-hidden border border-gray-200">

                <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx, .xls" />
                <input type="file" ref={docUploadRef} className="hidden" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,image/*" onChange={handleDocUploadChange} />

                {/* Column 1: Country Sidebar */}
                <div className="w-56 bg-gray-50 border-r border-gray-200 flex flex-col shrink-0">
                    <div className="p-4 border-b border-gray-200 bg-gray-50/50">
                        <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                            <Globe size={16} className="text-blue-600" /> 国家列表
                        </h2>
                        <input type="text" placeholder="搜索国家..." className="w-full mt-2 pl-2 py-1.5 text-xs border border-gray-300 rounded bg-white focus:ring-1 focus:ring-blue-500 transition-all" value={countrySearchTerm} onChange={(e) => setCountrySearchTerm(e.target.value)} />
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {visibleCountries.length > 0 ? (
                            visibleCountries.filter(c => c.toLowerCase().includes(countrySearchTerm.toLowerCase())).map(country => (
                                <div key={country} onClick={() => setSelectedCountry(country)} className={`px-4 py-3 cursor-pointer flex justify-between items-center group transition-colors ${selectedCountry === country ? 'bg-white border-l-4 border-blue-600 shadow-sm' : 'hover:bg-gray-100 border-l-4 border-transparent'}`}>
                                    <span className={`text-sm font-medium ${selectedCountry === country ? 'text-blue-700' : 'text-gray-700'}`}>{country}</span>
                                    {selectedCountry === country && <ChevronRight size={14} className="text-gray-400" />}
                                </div>
                            ))
                        ) : (
                            <div className="p-4 text-center text-xs text-gray-400">暂无数据</div>
                        )}
                    </div>
                    <div className="p-3 border-t bg-gray-50 space-y-2">
                        {isAddingCountry ? (
                            <div className="flex items-center gap-1 animate-fade-in">
                                <input autoFocus type="text" className="w-full text-xs border border-blue-300 rounded px-2 py-1.5 focus:ring-1 focus:ring-blue-500" placeholder="新国家名称" value={newCountryName} onChange={(e) => setNewCountryName(e.target.value)} />
                                <button onClick={() => {
                                    if (!newCountryName.trim()) return;
                                    handleCreateRemote(
                                        'transport',
                                        { region: newCountryName.trim(), carModel: '适配车型', serviceType: '包车', passengers: 4, priceLow: 0, priceHigh: 0, isPublic: isSuperAdmin },
                                        onUpdateCarDB, carDB
                                    );
                                    setSelectedCountry(newCountryName.trim());
                                    setIsAddingCountry(false);
                                    setNewCountryName('');
                                }}><Plus size={16} className="text-blue-600" /></button>
                            </div>
                        ) : (
                            <button onClick={() => setIsAddingCountry(true)} className="w-full py-1.5 text-xs text-blue-600 border border-dashed border-blue-300 rounded hover:bg-blue-50 flex justify-center items-center gap-1 transition-colors"><Plus size={14} /> 添加国家</button>
                        )}
                    </div>
                </div>

                {/* Column 2: Secondary Navigation (Transport / Other / City List) */}
                {selectedCountry ? (
                    <div className="w-56 border-r border-gray-200 bg-white flex flex-col shrink-0">
                        <div className="p-4 border-b border-gray-100">
                            <h2 className="text-sm font-bold text-gray-800">{selectedCountry}</h2>
                            <p className="text-xs text-gray-400 mt-0.5">资源管理</p>
                        </div>

                        <div className="flex-1 overflow-y-auto py-2">
                            {/* Global Config Section */}
                            <div className="px-3 mb-2">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2">全局配置</span>
                            </div>

                            <button onClick={() => setActiveSection('transport')} className={`w-full text-left px-5 py-2.5 text-sm flex items-center gap-3 transition-colors ${activeSection === 'transport' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
                                <Car size={16} className={activeSection === 'transport' ? 'text-blue-600' : 'text-gray-400'} /> 交通配置
                            </button>
                            <button onClick={() => setActiveSection('other')} className={`w-full text-left px-5 py-2.5 text-sm flex items-center gap-3 transition-colors ${activeSection === 'other' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
                                <PackagePlus size={16} className={activeSection === 'other' ? 'text-blue-600' : 'text-gray-400'} /> 其它服务
                            </button>

                            <div className="my-2 border-t border-gray-100 mx-4"></div>

                            {/* Cities Section */}
                            <div className="px-3 mb-2 mt-2 flex justify-between items-center group/header">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2">地点列表</span>
                            </div>

                            <div className="space-y-0.5">
                                {currentCities.map(city => (
                                    <div key={city.id} onClick={() => setActiveSection(city.id)} className={`px-5 py-2.5 cursor-pointer text-sm flex justify-between items-center group transition-all ${activeSection === city.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <MapPin size={16} className={`shrink-0 ${activeSection === city.id ? 'text-blue-600' : 'text-gray-400'}`} />
                                            {/* Inline Edit for City Name */}
                                            {canEdit(city) ? (
                                                <input
                                                    onKeyDown={handleEnterKey}
                                                    type="text"
                                                    className={`bg-transparent border-none p-0 text-sm cursor-pointer focus:ring-0 w-full truncate ${activeSection === city.id ? 'font-medium text-blue-700' : 'text-gray-600'}`}
                                                    value={city.name}
                                                    onChange={(e) => updateItemRemote<PoiCity>('city', poiCities, onUpdatePoiCities, city.id, { name: e.target.value })}
                                                    onFocus={() => setActiveSection(city.id)}
                                                    onClick={(e) => e.stopPropagation()} // Allow editing without triggering selection again
                                                />
                                            ) : (
                                                <span className={`text-sm truncate ${activeSection === city.id ? 'font-medium text-blue-700' : 'text-gray-600'}`}>{city.name}</span>
                                            )}
                                        </div>
                                        {canEdit(city) && <button onClick={(e) => { e.stopPropagation(); deleteItemRemote('city', poiCities, onUpdatePoiCities, city.id, '城市'); }} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity"><Trash2 size={12} /></button>}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="p-3 border-t bg-gray-50">
                            {isAddingCity ? (
                                <div className="flex items-center gap-1 animate-fade-in">
                                    <input autoFocus type="text" className="w-full text-xs border border-blue-300 rounded px-2 py-1.5 focus:ring-1 focus:ring-blue-500" placeholder="新城市名称" value={newCityName} onChange={(e) => setNewCityName(e.target.value)} />
                                    <button onClick={() => {
                                        if (!newCityName.trim()) return;
                                        handleCreateRemote('city', { country: selectedCountry, name: newCityName.trim(), isPublic: isSuperAdmin }, onUpdatePoiCities, poiCities);
                                        setIsAddingCity(false);
                                        setNewCityName('');
                                    }}><Plus size={16} className="text-blue-600" /></button>
                                </div>
                            ) : (
                                <button onClick={() => setIsAddingCity(true)} className="w-full py-1.5 text-xs text-blue-600 border border-dashed border-blue-300 rounded hover:bg-blue-50 flex justify-center items-center gap-1 transition-colors"><Plus size={14} /> 添加地点</button>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="w-56 border-r border-gray-200 bg-gray-50 flex items-center justify-center text-gray-400 text-xs">
                        请先选择国家
                    </div>
                )}

                {/* Column 3: Main Content Area */}
                <div className="flex-1 flex flex-col bg-white min-w-0">
                    <div className="h-14 px-6 border-b border-gray-200 flex justify-between items-center bg-white shrink-0">
                        <div>
                            {/* Dynamic Header */}
                            {selectedCountry ? (
                                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                    {isTransport ? '交通配置' : isOther ? '其它服务' : currentCities.find(c => c.id === currentCityId)?.name || '未知地点'}
                                    {/* Breadcrumb style check */}
                                    {!isTransport && !isOther && isCity && <span className="text-xs font-normal text-gray-400 px-2 py-0.5 bg-gray-100 rounded-full">资源详情</span>}
                                </h2>
                            ) : <span className="text-gray-400">未选择</span>}
                        </div>
                        <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full transition-colors"><X size={20} className="text-gray-400 hover:text-gray-600" /></button>
                    </div>

                    <div className="flex-1 overflow-hidden flex flex-col bg-gray-50/30">
                        {/* Check if Country Selected */}
                        {selectedCountry ? (
                            <>
                                {/* Transport Table */}
                                {isTransport && (
                                    <div className="flex-1 p-6 overflow-auto animate-fade-in">
                                        {renderDocsPanel()}
                                        <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
                                            <div className="overflow-x-auto">
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
                                                            <tr key={row.id} className="hover:bg-gray-50/50 transition-colors">
                                                                <td className="px-4 py-3"><input onKeyDown={handleEnterKey} disabled={!canEdit(row)} className="w-full text-sm bg-transparent border border-transparent hover:border-gray-300 focus:bg-white focus:border-blue-500 rounded px-2 py-1 transition-all outline-none" value={row.carModel} onChange={(e) => updateItemRemote<CarCostEntry>('transport', carDB, onUpdateCarDB, row.id, { carModel: e.target.value })} /></td>
                                                                <td className="px-4 py-2">
                                                                    <select onKeyDown={handleEnterKey} disabled={!canEdit(row)} className="w-full text-sm bg-transparent border border-transparent hover:border-gray-300 focus:bg-white focus:border-blue-500 rounded px-1 py-1 transition-all outline-none" value={row.serviceType} onChange={(e) => updateItemRemote<CarCostEntry>('transport', carDB, onUpdateCarDB, row.id, { serviceType: e.target.value })}>
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
                                                                <td className="px-4 py-2"><input onKeyDown={handleEnterKey} disabled={!canEdit(row)} type="number" className="w-full text-sm border-gray-300 rounded disabled:bg-transparent disabled:border-none" value={row.passengers} onChange={(e) => updateItemRemote<CarCostEntry>('transport', carDB, onUpdateCarDB, row.id, { passengers: parseFloat(e.target.value) || 0 })} /></td>
                                                                <td className="px-4 py-2">
                                                                    {canSeeRealPrice(row) ? (
                                                                        <input onKeyDown={handleEnterKey} disabled={!canEdit(row)} type="number" className="w-full text-sm border-gray-300 rounded text-blue-600 disabled:bg-transparent disabled:border-none font-medium" value={row.priceLow || ''} onChange={(e) => updateItemRemote<CarCostEntry>('transport', carDB, onUpdateCarDB, row.id, { priceLow: parseFloat(e.target.value) || 0 })} />
                                                                    ) : <span className="text-sm text-gray-400 font-mono">****</span>}
                                                                </td>
                                                                <td className="px-4 py-2">
                                                                    {canSeeRealPrice(row) ? (
                                                                        <input onKeyDown={handleEnterKey} disabled={!canEdit(row)} type="number" className="w-full text-sm border-gray-300 rounded text-red-600 disabled:bg-transparent disabled:border-none font-medium" value={row.priceHigh || ''} onChange={(e) => updateItemRemote<CarCostEntry>('transport', carDB, onUpdateCarDB, row.id, { priceHigh: parseFloat(e.target.value) || 0 })} />
                                                                    ) : <span className="text-sm text-gray-400 font-mono">****</span>}
                                                                </td>
                                                                <td className="px-4 py-2"><input onKeyDown={handleEnterKey} disabled={!canEdit(row)} className="w-full text-sm border-gray-300 rounded disabled:bg-transparent disabled:border-none" value={row.description || ''} onChange={(e) => updateItemRemote<CarCostEntry>('transport', carDB, onUpdateCarDB, row.id, { description: e.target.value })} /></td>
                                                                <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">{formatDate(row.lastUpdated)}</td>
                                                                <td className="px-4 py-2 text-xs">
                                                                    <div className="flex flex-col gap-1 items-center">
                                                                        {isSuperAdmin ? (
                                                                            <label className="relative inline-flex items-center cursor-pointer">
                                                                                <input type="checkbox" className="sr-only peer" checked={!!row.isPublic} onChange={() => togglePublicRemote('transport', carDB, onUpdateCarDB, row)} />
                                                                                <div className="w-8 h-4 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-100 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
                                                                            </label>
                                                                        ) : (
                                                                            <span className={`px-1.5 py-0.5 rounded w-fit text-[10px] uppercase font-bold tracking-wider ${row.isPublic ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                                                                {row.isPublic ? 'Public' : 'Private'}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td className="px-4 text-center">{canEdit(row) && <button onClick={() => deleteItemRemote('transport', carDB, onUpdateCarDB, row.id, '车型')}><Trash2 size={16} className="text-gray-300 hover:text-red-500" /></button>}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                            <button onClick={() => handleCreateRemote('transport', { region: selectedCountry, carModel: '', serviceType: '包车', passengers: 4, priceLow: 0, priceHigh: 0, isPublic: isSuperAdmin }, onUpdateCarDB, carDB)} className="m-4 mx-6 text-sm text-gray-500 flex items-center justify-center gap-2 hover:bg-white hover:text-blue-600 hover:border-blue-300 border border-dashed border-gray-300 py-3 rounded-lg transition-all shadow-sm group"><Plus size={16} className="text-gray-400 group-hover:text-blue-500 transition-colors" /> 添加车型配置</button>
                                        </div>
                                    </div>
                                )}

                                {/* Other Services Table */}
                                {isOther && (
                                    <div className="flex-1 p-6 overflow-auto animate-fade-in">
                                        {renderDocsPanel()}
                                        <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
                                            <div className="overflow-x-auto">
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
                                                                <td className="px-4 py-3"><input onKeyDown={handleEnterKey} disabled={!canEdit(row)} className="w-full text-sm bg-transparent border border-transparent hover:border-gray-300 focus:bg-white focus:border-blue-500 rounded px-2 py-1 transition-all outline-none" value={row.name} onChange={(e) => updateItemLocal<PoiOther>(poiOthers, onUpdatePoiOthers!, row.id, { name: e.target.value })} /></td>
                                                                <td className="px-4 py-2">
                                                                    {canSeeRealPrice(row) ? (
                                                                        <input onKeyDown={handleEnterKey} disabled={!canEdit(row)} type="number" className="w-full text-sm border-gray-300 rounded text-blue-600 disabled:bg-transparent disabled:border-none font-medium" value={row.price || ''} onChange={(e) => updateItemLocal<PoiOther>(poiOthers, onUpdatePoiOthers!, row.id, { price: parseFloat(e.target.value) || 0 })} />
                                                                    ) : <span className="text-sm text-gray-400 font-mono">****</span>}
                                                                </td>
                                                                <td className="px-4 py-2"><input onKeyDown={handleEnterKey} disabled={!canEdit(row)} className="w-full text-sm border-gray-300 rounded disabled:bg-transparent disabled:border-none" value={row.description || ''} onChange={(e) => updateItemLocal<PoiOther>(poiOthers, onUpdatePoiOthers!, row.id, { description: e.target.value })} /></td>
                                                                <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">{formatDate(row.lastUpdated)}</td>
                                                                <td className="px-4 py-2 text-xs">
                                                                    <div className="flex flex-col gap-1 items-center">
                                                                        {isSuperAdmin ? (
                                                                            <label className="relative inline-flex items-center cursor-pointer">
                                                                                <input type="checkbox" className="sr-only peer" checked={!!row.isPublic} onChange={() => togglePublicLocal(poiOthers, onUpdatePoiOthers!, row)} />
                                                                                <div className="w-8 h-4 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-100 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
                                                                            </label>
                                                                        ) : (
                                                                            <span className={`px-1.5 py-0.5 rounded w-fit text-[10px] uppercase font-bold tracking-wider ${row.isPublic ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                                                                {row.isPublic ? 'Public' : 'Private'}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td className="px-4 text-center">{canEdit(row) && <button onClick={() => deleteItemLocal(poiOthers, onUpdatePoiOthers!, row.id, '其它服务')}><Trash2 size={16} className="text-gray-300 hover:text-red-500" /></button>}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                            <button onClick={() => handleCreateLocal((base) => ({ ...base, country: selectedCountry, name: '', price: 0 }), onUpdatePoiOthers!, poiOthers)} className="m-4 mx-6 text-sm text-gray-500 flex items-center justify-center gap-2 hover:bg-white hover:text-blue-600 hover:border-blue-300 border border-dashed border-gray-300 py-3 rounded-lg transition-all shadow-sm group"><Plus size={16} className="text-gray-400 group-hover:text-blue-500 transition-colors" /> 添加其它服务</button>
                                        </div>
                                    </div>
                                )}

                                {/* City POIs (Spot, Hotel, Activity) */}
                                {isCity && (
                                    <div className="flex-1 flex flex-col overflow-hidden animate-fade-in">
                                        {/* In-Content Tabs */}
                                        <div className="px-6 py-2 border-b border-gray-200 bg-white flex gap-6">
                                            {[{ id: 'spot', label: '景点/门票', Icon: Ticket }, { id: 'hotel', label: '酒店', Icon: Hotel }, { id: 'activity', label: '活动', Icon: Palmtree }].map(tab => (
                                                <button key={tab.id} onClick={() => setPoiTab(tab.id as any)} className={`pb-2 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors ${poiTab === tab.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                                                    <tab.Icon size={16} /> {tab.label}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="px-6 py-3 border-b border-gray-200 bg-white flex items-center gap-2">
                                            <div className="relative flex-1">
                                                <Search size={16} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                                                <input
                                                    className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-md"
                                                    placeholder="输入关键词搜索当前城市资源（按回车搜索）"
                                                    value={resourceSearchTerm}
                                                    onChange={(e) => setResourceSearchTerm(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') runResourceSearch();
                                                    }}
                                                />
                                            </div>
                                            <button
                                                className="px-3 py-2 text-sm rounded-md border border-gray-200 hover:bg-gray-50"
                                                onClick={runResourceSearch}
                                                disabled={resourceSearchLoading}
                                            >
                                                {resourceSearchLoading ? '搜索中...' : '搜索'}
                                            </button>
                                        </div>

                                        <div className="flex-1 p-6 overflow-auto">
                                            {renderDocsPanel()}
                                            <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
                                                <div className="overflow-x-auto">
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
                                                            {(shouldShowResults ? (poiTab === 'spot' ? currentSpots : poiTab === 'hotel' ? currentHotels : currentActivities) : []).map(item => (
                                                                <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                                                                    <td className="px-4 py-2"><input onKeyDown={handleEnterKey} disabled={!canEdit(item)} className="w-full text-sm border-gray-300 rounded disabled:bg-transparent disabled:border-none focus:ring-1 focus:ring-blue-500" value={item.name} onChange={(e) => {
                                                                        if (poiTab === 'spot') updateItemRemote<PoiSpot>('spot', poiSpots, onUpdatePoiSpots, item.id, { name: e.target.value });
                                                                        else if (poiTab === 'hotel') updateItemRemote<PoiHotel>('hotel', poiHotels, onUpdatePoiHotels, item.id, { name: e.target.value });
                                                                        else updateItemRemote<PoiActivity>('activity', poiActivities, onUpdatePoiActivities, item.id, { name: e.target.value });
                                                                    }} /></td>

                                                                    {poiTab === 'hotel' && (
                                                                        <td className="px-4 py-2"><input onKeyDown={handleEnterKey} disabled={!canEdit(item)} className="w-full text-sm border-gray-300 rounded disabled:bg-transparent disabled:border-none" value={(item as PoiHotel).roomType} onChange={(e) => updateItemRemote<PoiHotel>('hotel', poiHotels, onUpdatePoiHotels, item.id, { roomType: e.target.value })} /></td>
                                                                    )}

                                                                    <td className="px-4 py-2">
                                                                        {canSeeRealPrice(item) ? (
                                                                            <input onKeyDown={handleEnterKey} disabled={!canEdit(item)} type="number" className="w-full text-sm border-gray-300 rounded text-blue-600 disabled:bg-transparent disabled:border-none font-medium" value={item.price || ''} onChange={(e) => {
                                                                                const val = parseFloat(e.target.value) || 0;
                                                                                if (poiTab === 'spot') updateItemRemote<PoiSpot>('spot', poiSpots, onUpdatePoiSpots, item.id, { price: val });
                                                                                else if (poiTab === 'hotel') updateItemRemote<PoiHotel>('hotel', poiHotels, onUpdatePoiHotels, item.id, { price: val });
                                                                                else updateItemRemote<PoiActivity>('activity', poiActivities, onUpdatePoiActivities, item.id, { price: val });
                                                                            }} />
                                                                        ) : <span className="text-sm text-gray-400 font-mono">****</span>}
                                                                    </td>

                                                                    <td className="px-4 py-2"><input onKeyDown={handleEnterKey} disabled={!canEdit(item)} className="w-full text-sm border-gray-300 rounded disabled:bg-transparent disabled:border-none" value={item.description || ''} onChange={(e) => {
                                                                        if (poiTab === 'spot') updateItemRemote<PoiSpot>('spot', poiSpots, onUpdatePoiSpots, item.id, { description: e.target.value });
                                                                        else if (poiTab === 'hotel') updateItemRemote<PoiHotel>('hotel', poiHotels, onUpdatePoiHotels, item.id, { description: e.target.value });
                                                                        else updateItemRemote<PoiActivity>('activity', poiActivities, onUpdatePoiActivities, item.id, { description: e.target.value });
                                                                    }} /></td>

                                                                    <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">{formatDate(item.lastUpdated)}</td>

                                                                    <td className="px-4 py-2 text-xs">
                                                                        <div className="flex flex-col gap-1 items-center">
                                                                            {isSuperAdmin ? (
                                                                                <label className="relative inline-flex items-center cursor-pointer">
                                                                                    <input type="checkbox" className="sr-only peer" checked={!!item.isPublic} onChange={() => {
                                                                                        if (poiTab === 'spot') togglePublicRemote('spot', poiSpots, onUpdatePoiSpots, item as PoiSpot);
                                                                                        else if (poiTab === 'hotel') togglePublicRemote('hotel', poiHotels, onUpdatePoiHotels, item as PoiHotel);
                                                                                        else togglePublicRemote('activity', poiActivities, onUpdatePoiActivities, item as PoiActivity);
                                                                                    }} />
                                                                                    <div className="w-8 h-4 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-100 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
                                                                                </label>
                                                                            ) : (
                                                                                <span className={`px-1.5 py-0.5 rounded w-fit text-[10px] uppercase font-bold tracking-wider ${item.isPublic ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                                                                    {item.isPublic ? 'Public' : 'Private'}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </td>

                                                                    <td className="px-4 text-center">{canEdit(item) && <button onClick={() => {
                                                                        if (poiTab === 'spot') deleteItemRemote('spot', poiSpots, onUpdatePoiSpots, item.id, '景点');
                                                                        else if (poiTab === 'hotel') deleteItemRemote('hotel', poiHotels, onUpdatePoiHotels, item.id, '酒店');
                                                                        else deleteItemRemote('activity', poiActivities, onUpdatePoiActivities, item.id, '活动');
                                                                    }}><Trash2 size={14} className="text-gray-300 hover:text-red-500" /></button>}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                                {!shouldShowResults && (
                                                    <div className="px-6 py-4 text-sm text-gray-400">请输入关键词搜索当前城市资源。</div>
                                                )}
                                                <button onClick={() => {
                                                    const base = { cityId: currentCityId, name: '', price: 0 };
                                                    if (poiTab === 'spot') handleCreateRemote('spot', { ...base, isPublic: isSuperAdmin }, onUpdatePoiSpots, poiSpots);
                                                    else if (poiTab === 'hotel') handleCreateRemote('hotel', { ...base, roomType: '标准间', isPublic: isSuperAdmin }, onUpdatePoiHotels, poiHotels);
                                                    else handleCreateRemote('activity', { ...base, isPublic: isSuperAdmin }, onUpdatePoiActivities, poiActivities);
                                                }} className="m-4 mx-6 text-sm text-gray-500 flex items-center justify-center gap-2 hover:bg-white hover:text-blue-600 hover:border-blue-300 border border-dashed border-gray-300 py-3 rounded-lg transition-all shadow-sm group"><Plus size={16} className="text-gray-400 group-hover:text-blue-500 transition-colors" /> 添加资源</button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="flex-1 flex items-center justify-center text-gray-300 flex-col gap-2">
                                <Globe size={48} className="opacity-20" />
                                <span className="text-sm">请从左侧选择一个国家以管理资源</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
