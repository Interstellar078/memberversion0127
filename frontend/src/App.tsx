
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Trash2, Calendar, Save, CheckCircle, Library, Search, X, RefreshCw } from 'lucide-react';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { DayRow, TripSettings, TransportType, CustomColumn, SavedTrip, CarCostEntry, PoiCity, PoiSpot, PoiHotel, PoiActivity, PoiOther, User, CountryFile, TransportItem, HotelItem, GeneralItem } from './types';
import { GlobalSettings } from './components/GlobalSettings';
import { ResourceDatabase } from './components/ResourceDatabase';
import { AuthModal } from './components/AuthModal';
import { AdminDashboard } from './components/AdminDashboard';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { addDays, generateUUID } from './utils/dateUtils';
import { generateItinerary } from './services/aiService';
import { AuthService } from './services/authService';

import { StorageService } from './services/storageService';
import { AIChatSidebar, ChatMessage } from './components/AIChatSidebar';
import { AppHeader } from './components/AppHeader';
import { ItineraryTable } from './components/ItineraryTable';

const INITIAL_ROWS = 8;

export default function App() {
    // --- Auth State ---
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [showAdminDashboard, setShowAdminDashboard] = useState(false);
    const [showAuthModal, setShowAuthModal] = useState(false);

    // --- App State ---
    const [isAppLoading, setIsAppLoading] = useState(true);
    const [dataLoadedSuccessfully, setDataLoadedSuccessfully] = useState(false);
    const [cloudStatus, setCloudStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
    const [notification, setNotification] = useState<{ show: boolean, message: string }>({ show: false, message: '' });

    // System Config
    const [systemConfig, setSystemConfig] = useState<{ defaultMargin: number }>({ defaultMargin: 20 });
    const [isRefreshingResources, setIsRefreshingResources] = useState(false);
    const [isRefreshingTrips, setIsRefreshingTrips] = useState(false);

    // 1. Settings & UI State
    const [settings, setSettings] = useState<TripSettings>({
        plannerName: '',
        customerName: '',
        peopleCount: 2,
        roomCount: 1,
        currency: 'CNY',
        exchangeRate: 1,
        destinations: [],
        startDate: new Date().toISOString().split('T')[0],
        marginPercent: 20,
        tipPerDay: 50,
        manualInclusions: '1. 全程舒适专车接送\n2. 行程所列首道景点门票\n3. 全程高品质酒店住宿\n4. 7x24小时管家服务',
        manualExclusions: ''
    });

    // 2. POI Database State
    const [carDB, setCarDB] = useState<CarCostEntry[]>([]);
    const [poiCities, setPoiCities] = useState<PoiCity[]>([]);
    const [poiSpots, setPoiSpots] = useState<PoiSpot[]>([]);
    const [poiHotels, setPoiHotels] = useState<PoiHotel[]>([]);
    const [poiActivities, setPoiActivities] = useState<PoiActivity[]>([]);
    const [poiOthers, setPoiOthers] = useState<PoiOther[]>([]);
    const [countryFiles, setCountryFiles] = useState<CountryFile[]>([]);

    // 3. Trips & History
    const [savedTrips, setSavedTrips] = useState<SavedTrip[]>([]);
    const [locationHistory, setLocationHistory] = useState<string[]>([]);
    const [tripSearchTerm, setTripSearchTerm] = useState('');

    // 4. App Operational State
    const [rows, setRows] = useState<DayRow[]>(() => Array.from({ length: INITIAL_ROWS }).map((_, i) => ({
        id: generateUUID(),
        dayIndex: i + 1,
        date: '',
        route: '',
        transport: ['包车'],
        transportDetails: [], // NEW
        hotelDetails: [], // NEW
        ticketDetails: [], // NEW
        activityDetails: [], // NEW
        otherDetails: [], // NEW
        description: '',
        transportCost: 0,
        hotelCost: 0,
        ticketCost: 0,
        activityCost: 0,
        otherCost: 0,
        customCosts: {},
        manualCostFlags: {},
    })));

    const [customColumns, setCustomColumns] = useState<CustomColumn[]>([]);
    const [showSavedList, setShowSavedList] = useState(false);
    const [activeTripId, setActiveTripId] = useState<string | null>(null);
    const [isResourceOpen, setIsResourceOpen] = useState(false);

    const [qsModal, setQsModal] = useState<{
        isOpen: boolean;
        type: 'route' | 'hotel' | 'ticket' | 'activity';
        rowIndex: number;
        itemsDisplay: string;
        routeCities: string[];
        targetCityName: string;
        smartCountry: string;
    } | null>(null);
    const [qsSelectedCountry, setQsSelectedCountry] = useState('');
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [saveName, setSaveName] = useState('');
    // const [showAIModal, setShowAIModal] = useState(false); // REMOVED
    // const [aiPromptInput, setAiPromptInput] = useState(''); // REMOVED
    const [isGenerating, setIsGenerating] = useState(false);

    // Chat State
    const [isChatOpen, setIsChatOpen] = useState(true);
    const [conversationId] = useState(() => {
        const key = 'ai_conversation_id';
        const existing = localStorage.getItem(key);
        if (existing) return existing;
        const id = generateUUID();
        localStorage.setItem(key, id);
        return id;
    });

    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
        { id: 'init', role: 'assistant', content: '您好！我是您的智能行程规划助手。\n您可以告诉我您的目的地、天数和偏好，我会为您生成专业行程。\n或者在现有行程上，让我帮您调整细节。', timestamp: Date.now() }
    ]);

    const [colWidths, setColWidths] = useState<Record<string, number>>({
        day: 48, date: 110, route: 160, transport: 200, hotel: 220,
        ticket: 180, activity: 180, otherService: 180, description: 250,
        transportCost: 90, hotelCost: 90,
        ticketCost: 90, activityCost: 90, otherCost: 90
    });

    const totalCost = useMemo(() => rows.reduce((acc, r) => acc + r.transportCost + r.hotelCost + r.ticketCost + r.activityCost + r.otherCost, 0), [rows]);

    // --- PERMISSION HELPERS ---
    const isSuperAdmin = currentUser?.role === 'super_admin' || currentUser?.role === 'admin';
    const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'super_admin';
    const isMember = currentUser?.role === 'user';

    const isResourceVisible = (item: { createdBy?: string, isPublic?: boolean }) => {
        if (isSuperAdmin) return true;
        if (item.isPublic) return true;
        if (item.createdBy === currentUser?.username) return true;
        if (!item.createdBy) return true;
        return false;
    };

    const shouldMaskPrice = (sourcePublicFlag?: boolean) => {
        if (isMember && sourcePublicFlag) return true;
        return false;
    };

    const maskNumber = (num: number, isMasked: boolean): string => {
        if (!isMasked) return num.toString();
        const s = Math.round(num).toString();
        if (s.length <= 1) return s;
        return s[0] + '*'.repeat(s.length - 1);
    };

    const allowedCityNames = useMemo(() => {
        let cities = poiCities.filter(isResourceVisible);
        if (settings.destinations.length > 0) {
            cities = cities.filter(c => settings.destinations.includes(c.country));
        }
        return cities.map(c => c.name);
    }, [poiCities, settings.destinations, currentUser]);

    useEffect(() => {
        const initApp = async () => {
            setIsAppLoading(true);
            const user = await AuthService.getCurrentUser();
            if (user) setCurrentUser(user);
            await loadCloudData(user);
            setIsAppLoading(false);
        };
        initApp();
    }, []);

    useEffect(() => {
        StorageService.setCurrentUser(currentUser);
    }, [currentUser]);



    useEffect(() => {
        if (isMember && systemConfig) {
            setSettings(prev => ({ ...prev, marginPercent: systemConfig.defaultMargin }));
        }
    }, [currentUser, systemConfig, isMember]);

    useEffect(() => {
        if (settings.startDate) {
            setRows(prevRows => prevRows.map((row, index) => {
                const targetDate = addDays(settings.startDate, index);
                if (row.date !== targetDate) return { ...row, date: targetDate };
                return row;
            }));
        }
    }, [settings.startDate]);

    const loadCloudData = async (user: User | null = currentUser) => {
        try {
            await StorageService.migrateLocalData().catch(console.warn);
            await StorageService.ensureAdminProfile().catch(console.warn);

            // --- Phase 1: Critical User Data (Trips & Settings) ---
            // Load this SEPARATELY so if Resources fail (too large), user still sees trips.
            try {
                const trips = await StorageService.getTrips();
                setSavedTrips(trips);
            } catch (e) {
                console.error("Failed to load trips", e);
                setNotification({ show: true, message: '行程加载失败' });
            }

            try {
                const [locs, settings, config] = await Promise.all([
                    StorageService.getLocations(),
                    StorageService.getAppSettings(),
                    StorageService.getSystemConfig()
                ]);
                setLocationHistory(locs);
                if (settings && Object.keys(settings).length > 0) setColWidths(settings);
                setSystemConfig(config);
                if (user?.role === 'user') {
                    setSettings(prev => ({ ...prev, marginPercent: config.defaultMargin }));
                }
            } catch (e) {
                console.error("Failed to load settings", e);
            }

            // --- Phase 2: Core Resources (light) ---
            // Keep initial load light; heavy resources are loaded on demand.
            try {
                const cities = await StorageService.getCities();
                setPoiCities(cities);
            } catch (e) {
                console.error("Failed to load core resources", e);
                setNotification({ show: true, message: '基础资源加载失败，请稍后重试。' });
            }

            setDataLoadedSuccessfully(true);
            setCloudStatus('synced');
        } catch (e) {
            console.error("Load failed fatal", e);
            setCloudStatus('error');
            setDataLoadedSuccessfully(false);
            alert("连接云端数据库失败。请检查网络后刷新页面。");
        }
    };

    const useDebouncedSave = (data: any, saver: (d: any) => Promise<void>, delay = 1500) => {
        const firstRun = useRef(true);
        useEffect(() => {
            if (firstRun.current) { firstRun.current = false; return; }
            if (isAppLoading || !dataLoadedSuccessfully) return;
            setCloudStatus('syncing');
            const handler = setTimeout(() => {
                saver(data).then(() => setCloudStatus('synced')).catch(() => setCloudStatus('error'));
            }, delay);
            return () => clearTimeout(handler);
        }, [data]);
    };

    useDebouncedSave(carDB, StorageService.saveCars);
    useDebouncedSave(poiCities, StorageService.saveCities);
    useDebouncedSave(poiSpots, StorageService.saveSpots);
    useDebouncedSave(poiHotels, StorageService.saveHotels);
    useDebouncedSave(poiActivities, StorageService.saveActivities);
    useDebouncedSave(poiOthers, StorageService.saveOthers);
    useDebouncedSave(countryFiles, StorageService.saveFiles);
    useDebouncedSave(savedTrips, StorageService.saveTrips);
    useDebouncedSave(locationHistory, StorageService.saveLocations);
    useDebouncedSave(colWidths, StorageService.saveAppSettings);

    const handleResourceActivity = async (username: string) => {
        await StorageService.saveResourceMetadata({
            lastUpdated: Date.now(),
            updatedBy: username
        });
    };

    const handleForceSave = async () => {
        if (isAppLoading || !dataLoadedSuccessfully) {
            alert("数据未完全加载，无法执行强制同步，以防数据丢失。");
            return;
        }
        setCloudStatus('syncing');
        try {
            await Promise.all([
                StorageService.saveCars(carDB),
                StorageService.saveCities(poiCities),
                StorageService.saveSpots(poiSpots),
                StorageService.saveHotels(poiHotels),
                StorageService.saveActivities(poiActivities),
                StorageService.saveOthers(poiOthers),
                StorageService.saveFiles(countryFiles)
            ]);
            setCloudStatus('synced');
            setNotification({ show: true, message: '已立即同步至云端' });
            setTimeout(() => setNotification({ show: false, message: '' }), 3000);
        } catch (e) {
            console.error("Force save failed", e);
            setCloudStatus('error');
        }
    };

    const handleOpenResources = async () => {
        if (isRefreshingResources) return;
        setIsRefreshingResources(true);
        setCloudStatus('syncing');
        try {
            const cities = await StorageService.getCities();
            setPoiCities(cities);
            setCloudStatus('synced');
            setIsResourceOpen(true);
        } catch (error) {
            console.error("Failed to refresh resources", error);
            setCloudStatus('error');
            setIsResourceOpen(true);
            alert("资源库加载遇到问题，部分数据可能未显示。");
        } finally {
            setIsRefreshingResources(false);
        }
    };

    const handleOpenSavedList = async () => {
        if (isRefreshingTrips) return;
        setIsRefreshingTrips(true);
        setCloudStatus('syncing');
        try {
            // Explicitly reload trips. If this fails, we catch it.
            const trips = await StorageService.getTrips();
            setSavedTrips(trips);
            setCloudStatus('synced');
            setShowSavedList(true);
        } catch (error) {
            console.error("Failed to refresh trips", error);
            setCloudStatus('error');
            setShowSavedList(true); // Still open the list even if refresh failed (shows last known state)
            alert("刷新行程列表失败，请检查网络。");
        } finally {
            setIsRefreshingTrips(false);
        }
    };

    function createEmptyRow(dayIndex: number): DayRow {
        return {
            id: generateUUID(),
            dayIndex,
            date: settings.startDate ? addDays(settings.startDate, dayIndex - 1) : '',
            route: '',
            transport: ['包车'],
            transportDetails: [],
            hotelDetails: [],
            ticketDetails: [],
            activityDetails: [],
            otherDetails: [],
            description: '',
            transportCost: 0,
            hotelCost: 0,
            ticketCost: 0,
            activityCost: 0,
            otherCost: 0,
            customCosts: {},
            manualCostFlags: {},
        };
    }

    const extractCitiesFromRoute = (route: string): string[] => {
        if (!route) return [];
        return route.split(/[-—>，,]/).map(s => s.trim()).filter(Boolean);
    };


    const getMatchingCityIds = (name: string, allCities: PoiCity[]): string[] => {
        return allCities.filter(c => {
            if (!isResourceVisible(c)) return false;
            if (c.name === name) return true;
            return false;
        }).map(c => c.id);
    };

    const getDestinationCityIds = (route: string): string[] => {
        const cities = extractCitiesFromRoute(route);
        if (cities.length === 0) return [];
        const lastCityName = cities[cities.length - 1];
        return getMatchingCityIds(lastCityName, poiCities);
    };

    const calculateRowCosts = (row: DayRow): DayRow => {
        const newRow = { ...row };
        if (!row.manualCostFlags?.transport) {
            newRow.transportCost = row.transportDetails.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        }
        if (!row.manualCostFlags?.hotel) {
            newRow.hotelCost = row.hotelDetails.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        }
        if (!row.manualCostFlags?.ticket) {
            newRow.ticketCost = row.ticketDetails.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        }
        if (!row.manualCostFlags?.activity) {
            newRow.activityCost = row.activityDetails.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        }
        if (!row.manualCostFlags?.other) {
            newRow.otherCost = row.otherDetails.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        }
        return newRow;
    };

    const handleRefreshCosts = () => {
        const visibleCars = carDB.filter(isResourceVisible);
        const visibleHotels = poiHotels.filter(isResourceVisible);
        const visibleSpots = poiSpots.filter(isResourceVisible);
        const visibleActivities = poiActivities.filter(isResourceVisible);
        const visibleOthers = poiOthers.filter(isResourceVisible);

        const newRows = rows.map(row => {
            let updatedRow = { ...row };
            updatedRow.transportDetails = row.transportDetails.map(item => {
                const car = visibleCars.find(c => c.carModel === item.model);
                if (car) {
                    return { ...item, price: item.priceType === 'high' ? car.priceHigh : car.priceLow, sourcePublic: car.isPublic || !car.createdBy };
                }
                return item;
            });
            updatedRow.hotelDetails = row.hotelDetails.map(item => {
                let hotel = visibleHotels.find(h => h.name === item.name && h.roomType === item.roomType);
                if (hotel) {
                    return { ...item, price: hotel.price, sourcePublic: hotel.isPublic || !hotel.createdBy };
                }
                return item;
            });
            updatedRow.ticketDetails = row.ticketDetails.map(item => {
                const spot = visibleSpots.find(s => s.name === item.name);
                if (spot) {
                    return { ...item, price: spot.price, sourcePublic: spot.isPublic || !spot.createdBy };
                }
                return item;
            });
            updatedRow.activityDetails = row.activityDetails.map(item => {
                const act = visibleActivities.find(a => a.name === item.name);
                if (act) {
                    return { ...item, price: act.price, sourcePublic: act.isPublic || !act.createdBy };
                }
                return item;
            });
            updatedRow.otherDetails = row.otherDetails.map(item => {
                const other = visibleOthers.find(o => o.name === item.name);
                if (other) {
                    return { ...item, price: other.price, sourcePublic: other.isPublic || !other.createdBy };
                }
                return item;
            });
            return calculateRowCosts(updatedRow);
        });
        setRows(newRows);
        setNotification({ show: true, message: '所有子项单价已刷新并重新计算总价' });
        setTimeout(() => setNotification({ show: false, message: '' }), 3000);
    };

    const updateRow = (index: number, updates: Partial<DayRow>) => {
        let newRows = [...rows];
        newRows[index] = { ...newRows[index], ...updates };
        if (updates.transportDetails || updates.hotelDetails || updates.ticketDetails || updates.activityDetails || updates.otherDetails) {
            newRows[index] = calculateRowCosts(newRows[index]);
        }
        setRows(newRows);
    };

    const handleDeleteRow = (index: number) => {
        if (rows.length <= 1) { alert("至少保留一天行程"); return; }
        if (window.confirm(`确定删除第 ${index + 1} 天的行程吗？`)) {
            const newRows = rows.filter((_, i) => i !== index);
            const reIndexedRows = newRows.map((row, i) => ({
                ...row,
                dayIndex: i + 1,
                date: settings.startDate ? addDays(settings.startDate, i) : ''
            }));
            setRows(reIndexedRows);
        }
    };

    const handleRouteUpdate = (index: number, val: string) => {
        const newRows = [...rows];
        newRows[index] = { ...newRows[index], route: val };
        const cities = extractCitiesFromRoute(val);
        const currentDest = cities.length > 0 ? cities[cities.length - 1] : null;
        if (currentDest && index < newRows.length - 1) {
            const nextRow = newRows[index + 1];
            const nextRowCities = extractCitiesFromRoute(nextRow.route);
            if (nextRowCities.length === 0) {
                newRows[index + 1] = { ...nextRow, route: `${currentDest}-` };
            }
        }
        setRows(newRows);
        const newLocs = cities.filter(v => !locationHistory.includes(v));
        if (newLocs.length > 0) setLocationHistory([...locationHistory, ...newLocs]);
    };

    const addTransportItem = (index: number) => {
        const row = rows[index];
        const visibleCars = carDB.filter(isResourceVisible);
        const defaultCar = visibleCars.find(c => settings.destinations.includes(c.region)) || visibleCars[0];
        const newItem: TransportItem = {
            id: generateUUID(),
            model: defaultCar ? defaultCar.carModel : '新车型',
            quantity: 1,
            priceType: 'low',
            price: defaultCar ? defaultCar.priceLow : 0,
            sourcePublic: defaultCar ? (defaultCar.isPublic || !defaultCar.createdBy) : false
        };
        updateRow(index, { transportDetails: [...row.transportDetails, newItem], manualCostFlags: { ...row.manualCostFlags, transport: false } });
    };

    const updateTransportItem = (rowIndex: number, itemId: string, updates: Partial<TransportItem>) => {
        const row = rows[rowIndex];
        const newDetails = row.transportDetails.map(item => {
            if (item.id === itemId) {
                const updated = { ...item, ...updates };
                if (updates.model || updates.priceType) {
                    const visibleCars = carDB.filter(isResourceVisible);
                    const car = visibleCars.find(c => c.carModel === updated.model);
                    if (car) {
                        updated.price = updated.priceType === 'high' ? car.priceHigh : car.priceLow;
                        updated.sourcePublic = car.isPublic || !car.createdBy;
                    }
                }
                return updated;
            }
            return item;
        });
        updateRow(rowIndex, { transportDetails: newDetails, manualCostFlags: { ...row.manualCostFlags, transport: false } });
    };

    const removeTransportItem = (rowIndex: number, itemId: string) => {
        const row = rows[rowIndex];
        updateRow(rowIndex, {
            transportDetails: row.transportDetails.filter(i => i.id !== itemId),
            manualCostFlags: { ...row.manualCostFlags, transport: false }
        });
    };

    const addHotelItem = (index: number) => {
        const row = rows[index];
        const newItem: HotelItem = {
            id: generateUUID(),
            name: '',
            roomType: '标准间',
            quantity: settings.roomCount || 1,
            price: 0,
            sourcePublic: false
        };
        updateRow(index, { hotelDetails: [...row.hotelDetails, newItem], manualCostFlags: { ...row.manualCostFlags, hotel: false } });
    };

    const updateHotelItem = (rowIndex: number, itemId: string, updates: Partial<HotelItem>) => {
        const row = rows[rowIndex];
        const newDetails = row.hotelDetails.map(item => {
            if (item.id === itemId) {
                const updated = { ...item, ...updates };
                if (updates.name || updates.roomType) {
                    const visibleHotels = poiHotels.filter(isResourceVisible);
                    let hotel = visibleHotels.find(h => h.name === updated.name && h.roomType === updated.roomType);
                    if (!hotel && updates.name) {
                        hotel = visibleHotels.find(h => h.name === updated.name);
                        if (hotel) updated.roomType = hotel.roomType;
                    }
                    if (hotel) {
                        updated.price = hotel.price;
                        updated.sourcePublic = hotel.isPublic || !hotel.createdBy;
                    }
                }
                return updated;
            }
            return item;
        });
        updateRow(rowIndex, { hotelDetails: newDetails, manualCostFlags: { ...row.manualCostFlags, hotel: false } });
    };

    const removeHotelItem = (rowIndex: number, itemId: string) => {
        const row = rows[rowIndex];
        updateRow(rowIndex, {
            hotelDetails: row.hotelDetails.filter(i => i.id !== itemId),
            manualCostFlags: { ...row.manualCostFlags, hotel: false }
        });
    };

    const addGeneralItem = (index: number, type: 'ticket' | 'activity' | 'other') => {
        const row = rows[index];
        const newItem: GeneralItem = {
            id: generateUUID(),
            name: '',
            quantity: settings.peopleCount || 1,
            price: 0,
            sourcePublic: false
        };
        const updateKey = type === 'ticket' ? 'ticketDetails' : type === 'activity' ? 'activityDetails' : 'otherDetails';
        const manualKey = type as keyof typeof row.manualCostFlags;
        updateRow(index, {
            [updateKey]: [...(row[updateKey] as GeneralItem[]), newItem],
            manualCostFlags: { ...row.manualCostFlags, [manualKey]: false }
        });
    };

    const updateGeneralItem = (rowIndex: number, itemId: string, type: 'ticket' | 'activity' | 'other', updates: Partial<GeneralItem>) => {
        const row = rows[rowIndex];
        const updateKey = type === 'ticket' ? 'ticketDetails' : type === 'activity' ? 'activityDetails' : 'otherDetails';
        const manualKey = type as keyof typeof row.manualCostFlags;
        const dbList = type === 'ticket' ? poiSpots : type === 'activity' ? poiActivities : poiOthers;
        const newDetails = (row[updateKey] as GeneralItem[]).map(item => {
            if (item.id === itemId) {
                const updated = { ...item, ...updates };
                if (updates.name) {
                    const visibleItems = dbList.filter(isResourceVisible);
                    const found = visibleItems.find(i => i.name === updated.name);
                    if (found) {
                        updated.price = found.price;
                        updated.sourcePublic = found.isPublic || !found.createdBy;
                    }
                }
                return updated;
            }
            return item;
        });
        updateRow(rowIndex, {
            [updateKey]: newDetails,
            manualCostFlags: { ...row.manualCostFlags, [manualKey]: false }
        });
    };

    const removeGeneralItem = (rowIndex: number, itemId: string, type: 'ticket' | 'activity' | 'other') => {
        const row = rows[rowIndex];
        const updateKey = type === 'ticket' ? 'ticketDetails' : type === 'activity' ? 'activityDetails' : 'otherDetails';
        const manualKey = type as keyof typeof row.manualCostFlags;
        updateRow(rowIndex, {
            [updateKey]: (row[updateKey] as GeneralItem[]).filter(i => i.id !== itemId),
            manualCostFlags: { ...row.manualCostFlags, [manualKey]: false }
        });
    };

    const handleQuickSave = (type: 'route' | 'hotel' | 'ticket' | 'activity', rowIndex: number) => {
        if (!currentUser) { alert("请先登录"); setShowAuthModal(true); return; }
        const row = rows[rowIndex];
        const routeCities = extractCitiesFromRoute(row.route);
        let itemsDisplay = '';
        let targetCityName = '';
        if (type === 'route') {
            const currentNames = new Set(poiCities.map(c => c.name));
            const newCities = routeCities.filter(name => !currentNames.has(name));
            if (newCities.length === 0) { alert("路线中的城市均已存在"); return; }
            itemsDisplay = newCities.join('、');
        } else {
            targetCityName = routeCities.length > 0 ? routeCities[routeCities.length - 1] : '';
            if (!targetCityName) { alert("无法识别目标城市，请先填写路线"); return; }
            if (type === 'hotel') itemsDisplay = row.hotelDetails.map(h => h.name).filter(Boolean).join('、');
            else if (type === 'ticket') itemsDisplay = row.ticketDetails.map(t => t.name).filter(Boolean).join('、');
            else if (type === 'activity') itemsDisplay = row.activityDetails.map(a => a.name).filter(Boolean).join('、');
        }
        if (!itemsDisplay) { alert("该项为空，无法添加"); return; }
        let detectedCountry = '';
        if (type === 'route') {
            const existingName = routeCities.find(n => poiCities.some(pc => pc.name === n));
            if (existingName) {
                const match = poiCities.find(pc => pc.name === existingName);
                if (match) detectedCountry = match.country;
            }
        } else {
            const match = poiCities.find(c => c.name === targetCityName);
            if (match) detectedCountry = match.country;
        }
        if (!detectedCountry && settings.destinations.length > 0) detectedCountry = settings.destinations[0];
        setQsModal({ isOpen: true, type, rowIndex, itemsDisplay, routeCities, targetCityName, smartCountry: detectedCountry || settings.destinations[0] || '' });
        setQsSelectedCountry(detectedCountry || settings.destinations[0] || '');
    };

    const performQuickSave = () => {
        if (!qsModal) return;
        const { type, rowIndex, routeCities, targetCityName } = qsModal;
        const finalCountry = qsSelectedCountry;
        const row = rows[rowIndex];
        if (!finalCountry) { alert("请选择归属国家"); return; }
        let addedCount = 0;
        let duplicateCount = 0;
        let tempCities = [...poiCities];
        let hasCityUpdate = false;
        const baseItem = {
            lastUpdated: Date.now(),
            createdBy: currentUser?.username || 'user',
            isPublic: isSuperAdmin
        };
        const ensureCitySmart = (name: string): string => {
            const exact = tempCities.find(c => c.country === finalCountry && c.name === name);
            if (exact) return exact.id;
            const newId = generateUUID();
            tempCities.push({ id: newId, country: finalCountry, name, ...baseItem });
            hasCityUpdate = true;
            return newId;
        };
        if (type === 'route') {
            const currentNames = new Set(poiCities.map(c => c.name));
            routeCities.forEach(name => {
                const id = ensureCitySmart(name);
                if (!currentNames.has(name) && !poiCities.find(c => c.id === id)) addedCount++;
                else duplicateCount++;
            });
            if (hasCityUpdate) setPoiCities(tempCities);
        } else {
            const cityId = ensureCitySmart(targetCityName);
            if (hasCityUpdate) setPoiCities(tempCities);
            if (type === 'hotel') {
                row.hotelDetails.forEach(item => {
                    if (!item.name) return;
                    const exists = poiHotels.some(h => h.cityId === cityId && h.name === item.name);
                    if (!exists) {
                        setPoiHotels(prev => [...prev, { id: generateUUID(), cityId: cityId!, name: item.name, roomType: item.roomType || '标准间', price: item.price || 0, ...baseItem }]);
                        addedCount++;
                    } else duplicateCount++;
                });
            } else if (type === 'ticket') {
                const toAdd: PoiSpot[] = [];
                row.ticketDetails.forEach(item => {
                    if (!item.name) return;
                    const exists = poiSpots.some(s => s.cityId === cityId && s.name === item.name);
                    if (!exists) {
                        toAdd.push({ id: generateUUID(), cityId: cityId!, name: item.name, price: item.price || 0, ...baseItem });
                        addedCount++;
                    } else duplicateCount++;
                });
                setPoiSpots(prev => [...prev, ...toAdd]);
            } else if (type === 'activity') {
                const toAdd: PoiActivity[] = [];
                row.activityDetails.forEach(item => {
                    if (!item.name) return;
                    const exists = poiActivities.some(a => a.cityId === cityId && a.name === item.name);
                    if (!exists) {
                        toAdd.push({ id: generateUUID(), cityId: cityId!, name: item.name, price: item.price || 0, ...baseItem });
                        addedCount++;
                    } else duplicateCount++;
                });
                setPoiActivities(prev => [...prev, ...toAdd]);
            }
        }
        alert(addedCount > 0 ? `成功添加 ${addedCount} 个资源。` : "没有新资源被添加 (可能已存在)。");
        if (addedCount > 0 || hasCityUpdate) handleResourceActivity(currentUser?.username || 'user');
        setQsModal(null);
    };

    const handleOpenSaveModal = () => {
        const planner = currentUser?.username || settings.plannerName || '未命名';
        let country = '未定国家';
        if (settings.destinations.length > 0) { country = settings.destinations.join('+'); } else { const allCities = rows.flatMap(r => extractCitiesFromRoute(r.route)); if (allCities.length > 0) { const c = poiCities.find(pc => pc.name === allCities[0]); if (c) country = c.country; } }
        const duration = `${rows.length}天`;
        const now = new Date();
        const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        const smartName = `${planner}_${country}_${duration}_${dateStr}`;
        if (activeTripId) { const currentTrip = savedTrips.find(t => t.id === activeTripId); setSaveName(currentTrip ? currentTrip.name : smartName); } else { setSaveName(smartName); }
        setShowSaveModal(true);
    };

    const handleConfirmSave = async () => {
        const nameToCheck = saveName.trim();
        if (!nameToCheck) { alert("请输入行程名称"); return; }
        const existingTripWithSameName = savedTrips.find(t => t.name === nameToCheck);
        const currentEditingTrip = activeTripId ? savedTrips.find(t => t.id === activeTripId) : null;
        const canModify = (trip: SavedTrip) => {
            if (!currentUser) return false;
            if (isSuperAdmin) return true;
            if (!trip.createdBy) return true;
            return trip.createdBy === currentUser.username;
        };
        let targetId: string;
        if (existingTripWithSameName) {
            if (currentEditingTrip && existingTripWithSameName.id === currentEditingTrip.id) {
                if (canModify(currentEditingTrip)) { targetId = currentEditingTrip.id; } else { if (!window.confirm(`您没有权限修改行程 "${nameToCheck}"。\n是否将其保存为您名下的新副本？`)) { return; } targetId = generateUUID(); }
            } else {
                if (!canModify(existingTripWithSameName)) { alert(`行程名称 "${nameToCheck}" 已存在且属于用户 ${existingTripWithSameName.createdBy || '未知'}。\n您没有权限覆盖它，请使用其他名称。`); return; }
                if (!window.confirm(`行程名称 "${nameToCheck}" 已存在于行程库中。\n是否覆盖该旧行程？`)) { return; }
                targetId = existingTripWithSameName.id;
            }
        } else {
            targetId = generateUUID();
        }
        const newTrip: SavedTrip = {
            id: targetId,
            name: nameToCheck,
            timestamp: Date.now(),
            settings: settings,
            rows: rows,
            customColumns: customColumns,
            createdBy: currentUser?.username || 'anonymous',
            lastModifiedBy: currentUser?.username || 'anonymous',
            isPublic: isSuperAdmin
        };
        const updatedTrips = [...savedTrips.filter(t => t.id !== targetId), newTrip];
        setSavedTrips(updatedTrips);
        setActiveTripId(targetId);
        setShowSaveModal(false);
        setNotification({ show: true, message: '行程已保存' });
        setTimeout(() => setNotification({ show: false, message: '' }), 3000);
    };

    const handleLoadTrip = (trip: SavedTrip) => {
        setSettings(trip.settings);
        if (isMember) {
            setSettings(prev => ({ ...prev, marginPercent: systemConfig.defaultMargin }));
        }
        const migratedRows = trip.rows.map(r => ({
            ...r,
            transportDetails: r.transportDetails || [],
            hotelDetails: r.hotelDetails || [],
            ticketDetails: r.ticketDetails || [],
            activityDetails: r.activityDetails || [],
            otherDetails: r.otherDetails || []
        }));
        setRows(migratedRows);
        setCustomColumns(trip.customColumns || []);
        setActiveTripId(trip.id);
        setShowSavedList(false);
        setNotification({ show: true, message: `已加载: ${trip.name}` });
        setTimeout(() => setNotification({ show: false, message: '' }), 3000);
    };

    const handleNewTrip = () => {
        if (window.confirm("确定要新建行程吗？当前未保存的内容将丢失。")) {
            setActiveTripId(null);
            setSettings({
                ...settings,
                destinations: [],
                startDate: new Date().toISOString().split('T')[0],
                marginPercent: isMember ? systemConfig.defaultMargin : settings.marginPercent
            });
            setRows(Array.from({ length: 8 }).map((_, i) => createEmptyRow(i + 1)));
            setCustomColumns([]);
        }
    };

    const handleExport = () => {
        const wb = XLSX.utils.book_new();
        const headers = ["第几天", "日期", "路线", "交通方式", "车型详情", "酒店详情", "行程详情", "门票详情", "活动详情", "其它服务详情", "交通费", "酒店费", "门票费", "活动费", "其它费"];
        const dataRows = rows.map(r => [
            r.dayIndex, r.date, r.route, r.transport.join(', '),
            r.transportDetails.map(t => `${t.model}x${t.quantity}(${t.priceType === 'high' ? '旺' : '淡'})`).join('\n'),
            r.hotelDetails.map(h => `${h.name}-${h.roomType}x${h.quantity}`).join('\n'),
            r.description,
            r.ticketDetails.map(t => `${t.name}x${t.quantity}`).join('\n'),
            r.activityDetails.map(a => `${a.name}x${a.quantity}`).join('\n'),
            r.otherDetails.map(o => `${o.name}x${o.quantity}`).join('\n'),
            r.transportCost, r.hotelCost, r.ticketCost, r.activityCost, r.otherCost
        ]);
        const quotePrice = Math.round(totalCost * settings.exchangeRate / (1 - settings.marginPercent / 100));
        const sheetData = [
            headers, ...dataRows, [], [],
            ["总报价 / Total Quote", `${quotePrice.toLocaleString()} ${settings.currency}`],
            [], ["费用包含 / Inclusions"], [settings.manualInclusions], [], ["费用不含 / Exclusions"], [settings.manualExclusions]
        ];
        const ws = XLSX.utils.aoa_to_sheet(sheetData);
        XLSX.utils.book_append_sheet(wb, ws, "Itinerary");
        XLSX.writeFile(wb, `${settings.customerName || 'Itinerary'}.xlsx`);
    };

    const handleChatRequest = async (userPrompt: string) => {
        if (!userPrompt.trim()) return;

        const userMsg: ChatMessage = { id: generateUUID(), role: 'user', content: userPrompt, timestamp: Date.now() };
        const historyForAi = [...chatMessages, userMsg]
            .slice(-10)
            .map(m => ({ role: m.role, content: m.content }));
        setChatMessages(prev => [...prev, userMsg]);
        setIsGenerating(true);


        const normalizeList = (value?: string[] | string) => {
            if (!value) return [] as string[];
            if (Array.isArray(value)) return value;
            return value.split(/[,，、]/).map(s => s.trim()).filter(Boolean);
        };

        const toNumberOrUndefined = (value: any) => {
            if (value === null || value === undefined || value === '') return undefined;
            const num = typeof value === 'number' ? value : Number(value);
            return Number.isFinite(num) ? num : undefined;
        };

        const deriveDestinations = (items: ItineraryItem[]) => {
            const cities: string[] = [];
            items.forEach(item => {
                const routeCities = item.route ? extractCitiesFromRoute(item.route) : [];
                if (routeCities.length > 0) {
                    cities.push(...routeCities);
                } else {
                    if (item.s_city) cities.push(item.s_city);
                    if (item.e_city) cities.push(item.e_city);
                }
            });
            const uniqCities = Array.from(new Set(cities.filter(Boolean)));
            if (uniqCities.length === 0) return settings.destinations;
            const countries = uniqCities
                .map(c => poiCities.find(pc => pc.name === c)?.country)
                .filter(Boolean) as string[];
            const uniqCountries = Array.from(new Set(countries));
            const isForeign = uniqCountries.some(c => c !== '中国');
            return isForeign ? uniqCountries : uniqCities;
        };

        try {
            const result: ItineraryResponse = await generateItinerary({
                currentDestinations: settings.destinations,
                currentDays: rows.length,
                currentRows: rows,
                historyTrips: savedTrips,
                userPrompt,
                peopleCount: settings.peopleCount,
                roomCount: settings.roomCount,
                startDate: settings.startDate,
                conversationId,
                chatHistory: historyForAi
            });

            if (result && result.error && (!result.itinerary || result.itinerary.length === 0)) {
                const aiMsg: ChatMessage = {
                    id: generateUUID(),
                    role: 'assistant',
                    content: result.error,
                    timestamp: Date.now()
                };
                setChatMessages(prev => [...prev, aiMsg]);
                return;
            }

            if (result && result.itinerary && result.itinerary.length > 0) {
                const autoDestinations = deriveDestinations(result.itinerary);
                if (autoDestinations && autoDestinations.length > 0) {
                    setSettings(prev => ({ ...prev, destinations: autoDestinations }));
                }

                const newRows = [...rows];
                const maxDay = Math.max(...result.itinerary.map(i => i.day || 1));
                if (maxDay > newRows.length) {
                    for (let i = newRows.length; i < maxDay; i++) {
                        newRows.push(createEmptyRow(i + 1));
                    }
                } else if (maxDay < newRows.length) {
                    newRows.splice(maxDay);
                }

                result.itinerary.forEach(item => {
                    const idx = (item.day || 1) - 1;
                    if (idx >= 0 && idx < newRows.length) {
                        const currentRow = newRows[idx];
                        let routeStr = currentRow.route;
                        if (item.route) {
                            routeStr = item.route;
                        } else if (item.s_city || item.e_city) {
                            const start = item.s_city || currentRow.route.split('-')[0] || '';
                            const end = item.e_city || currentRow.route.split('-')[1] || '';
                            if (start && end) routeStr = `${start}-${end}`;
                        }

                        const ticketItems: GeneralItem[] = normalizeList(item.ticketName).map(s => ({ id: generateUUID(), name: s, quantity: settings.peopleCount, price: 0, sourcePublic: false }));
                        const activityItems: GeneralItem[] = normalizeList(item.activityName).map(s => ({ id: generateUUID(), name: s, quantity: settings.peopleCount, price: 0, sourcePublic: false }));
                        const hotelItems: HotelItem[] = item.hotelName ? [{ id: generateUUID(), name: item.hotelName, roomType: '标准间', quantity: settings.roomCount, price: 0, sourcePublic: false }] : currentRow.hotelDetails;

                        newRows[idx] = {
                            ...currentRow,
                            route: routeStr,
                            hotelDetails: hotelItems,
                            ticketDetails: ticketItems.length > 0 ? ticketItems : currentRow.ticketDetails,
                            activityDetails: activityItems.length > 0 ? activityItems : currentRow.activityDetails,
                            description: item.description || currentRow.description,
                            transportCost: toNumberOrUndefined(item.transportCost) ?? currentRow.transportCost,
                            hotelCost: toNumberOrUndefined(item.hotelCost) ?? currentRow.hotelCost,
                            ticketCost: toNumberOrUndefined(item.ticketCost) ?? currentRow.ticketCost,
                            activityCost: toNumberOrUndefined(item.activityCost) ?? currentRow.activityCost,
                            otherCost: toNumberOrUndefined(item.otherCost) ?? currentRow.otherCost,
                            manualCostFlags: {
                                ...currentRow.manualCostFlags,
                                hotel: false,
                                ticket: false,
                                activity: false,
                                transport: false
                            }
                        };
                    }
                });
                setRows(newRows);

                const aiMsg: ChatMessage = {
                    id: generateUUID(),
                    role: 'assistant',
                    content: `已为您更新行程！

**主要变更**：
- 调整了 ${result.itinerary.length} 天的安排。
- 若涉及新城市，已自动更新目的地列表。

请检查细节，如果不满意，告诉我具体哪里需要修改。`,
                    timestamp: Date.now()
                };
                setChatMessages(prev => [...prev, aiMsg]);
                setNotification({ show: true, message: 'AI 规划完成！请点击“刷新价格”以计算最新费用。' });
                if (result.followUp) {
                    const followMsg: ChatMessage = {
                        id: generateUUID(),
                        role: 'assistant',
                        content: result.followUp,
                        timestamp: Date.now()
                    };
                    setChatMessages(prev => [...prev, followMsg]);
                }
                setTimeout(() => setNotification({ show: false, message: '' }), 4000);
            } else {
                const err = result?.error || 'AI 返回了无效的行程数据';
                throw new Error(err);
            }
        } catch (e: any) {
            console.error("AI Error in App:", e);
            let msg = e.message;
            if (msg === 'Failed to fetch') msg = '网络请求失败，请检查您的网络连接。';
            const errorMsg: ChatMessage = { id: generateUUID(), role: 'assistant', content: `抱歉，执行任务时遇到了问题：
${msg}

请稍后再试。`, timestamp: Date.now() };
            setChatMessages(prev => [...prev, errorMsg]);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleDragEnd = (result: DropResult) => {
        if (!result.destination) return;

        const sourceIndex = result.source.index;
        const destinationIndex = result.destination.index;

        if (sourceIndex === destinationIndex) return;

        const newRows = [...rows];
        const [reorderedItem] = newRows.splice(sourceIndex, 1);
        newRows.splice(destinationIndex, 0, reorderedItem);

        // Re-assign Day Indices securely
        const reindexedRows = newRows.map((row, index) => ({
            ...row,
            dayIndex: index + 1
        }));

        setRows(reindexedRows);
    };

    return (
        <div className="h-screen overflow-hidden bg-gray-50 flex flex-col font-sans text-gray-900">
            <AppHeader
                handleNewTrip={handleNewTrip}
                handleOpenSavedList={handleOpenSavedList}
                isRefreshingTrips={isRefreshingTrips}
                handleOpenSaveModal={handleOpenSaveModal}
                handleExport={handleExport}
                handleOpenResources={handleOpenResources}
                isRefreshingResources={isRefreshingResources}
                isChatOpen={isChatOpen}
                setIsChatOpen={setIsChatOpen}
                notification={notification}
                cloudStatus={cloudStatus}
                currentUser={currentUser}
                isSuperAdmin={isSuperAdmin}
                setShowAdminDashboard={setShowAdminDashboard}
                setShowAuthModal={setShowAuthModal}
                setCurrentUser={setCurrentUser}
            />

            <div className="flex-1 flex flex-row overflow-hidden relative">
                {/* Responsive margin: only apply mr-[400px] on large screens when chat is open */}
                <div className={`flex-1 flex flex-col h-full overflow-hidden transition-all duration-300 ${isChatOpen ? 'lg:mr-[400px]' : ''}`}>
                    <div className="flex-1 p-6 overflow-auto">
                        <div>
                            <GlobalSettings settings={settings} updateSettings={(s) => setSettings(prev => ({ ...prev, ...s }))} availableCountries={Array.from(new Set(poiCities.filter(isResourceVisible).map(c => c.country)))} />
                        </div>
                        <ItineraryTable
                            rows={rows}
                            setRows={setRows}
                            settings={settings}
                            setSettings={setSettings}
                            colWidths={colWidths}
                            setColWidths={setColWidths}
                            isMember={isMember}
                            totalCost={totalCost}
                            setIsChatOpen={setIsChatOpen}
                            handleRefreshCosts={handleRefreshCosts}
                            handleDeleteRow={handleDeleteRow}
                            handleDragEnd={handleDragEnd}
                            updateRow={updateRow}
                            handleRouteUpdate={handleRouteUpdate}
                            handleQuickSave={handleQuickSave}

                            poiCities={poiCities}
                            carDB={carDB}
                            poiHotels={poiHotels}
                            poiSpots={poiSpots}
                            poiActivities={poiActivities}
                            poiOthers={poiOthers}

                            createEmptyRow={createEmptyRow}
                            isResourceVisible={isResourceVisible}
                            allowedCityNames={allowedCityNames}
                            extractCitiesFromRoute={extractCitiesFromRoute}
                            getMatchingCityIds={getMatchingCityIds}
                            getDestinationCityIds={getDestinationCityIds}
                            shouldMaskPrice={shouldMaskPrice}
                            maskNumber={maskNumber}

                            addTransportItem={addTransportItem}
                            updateTransportItem={updateTransportItem}
                            removeTransportItem={removeTransportItem}
                            addHotelItem={addHotelItem}
                            updateHotelItem={updateHotelItem}
                            removeHotelItem={removeHotelItem}
                            addGeneralItem={addGeneralItem}
                            updateGeneralItem={updateGeneralItem}
                            removeGeneralItem={removeGeneralItem}
                        />
                    </div>
                    {/* ... Rest of components ... */}


                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 no-print">
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                            <h3 className="font-bold text-gray-700 mb-2 flex items-center gap-2"><CheckCircle size={16} className="text-green-600" /> 费用包含</h3>
                            <textarea className="w-full h-32 p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm" value={settings.manualInclusions} onChange={(e) => setSettings({ ...settings, manualInclusions: e.target.value })} />
                        </div>
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                            <h3 className="font-bold text-gray-700 mb-2 flex items-center gap-2"><X size={16} className="text-red-600" /> 费用不含</h3>
                            <textarea className="w-full h-32 p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm" value={settings.manualExclusions} onChange={(e) => setSettings({ ...settings, manualExclusions: e.target.value })} />
                        </div>
                    </div>
                </div>
                <AIChatSidebar
                    messages={chatMessages}
                    onSendMessage={handleChatRequest}
                    isGenerating={isGenerating}
                    isOpen={isChatOpen}
                    onToggle={() => setIsChatOpen(!isChatOpen)}
                />
            </div>

            {showAuthModal && <AuthModal onLoginSuccess={async (u) => { setCurrentUser(u); setShowAuthModal(false); setIsAppLoading(true); await loadCloudData(u); setIsAppLoading(false); setNotification({ show: true, message: `欢迎回来, ${u.username}` }); setTimeout(() => setNotification({ show: false, message: '' }), 3000); }} />}
            {showAdminDashboard && currentUser && <AdminDashboard currentUser={currentUser} onClose={() => setShowAdminDashboard(false)} />}
            <ResourceDatabase
                isOpen={isResourceOpen} onClose={() => setIsResourceOpen(false)}
                carDB={carDB} poiCities={poiCities} poiSpots={poiSpots} poiHotels={poiHotels} poiActivities={poiActivities} poiOthers={poiOthers} countryFiles={countryFiles}
                onUpdateCarDB={setCarDB} onUpdatePoiCities={setPoiCities} onUpdatePoiSpots={setPoiSpots} onUpdatePoiHotels={setPoiHotels} onUpdatePoiActivities={setPoiActivities} onUpdatePoiOthers={setPoiOthers} onUpdateCountryFiles={setCountryFiles}
                isReadOnly={false}
                currentUser={currentUser}
                onActivity={handleResourceActivity}
                onForceSave={handleForceSave}
            />
            {showSaveModal && (<div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center"><div className="bg-white p-6 rounded-lg shadow-xl w-96"><h3 className="text-lg font-bold mb-4">保存行程</h3><div className="mb-4"><label className="block text-sm font-medium text-gray-700 mb-1">行程名称</label><input type="text" className="w-full border border-gray-300 rounded p-2" value={saveName} onChange={(e) => setSaveName(e.target.value)} /></div><div className="flex justify-end gap-2"><button onClick={() => setShowSaveModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">取消</button><button onClick={handleConfirmSave} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">确认保存</button></div></div></div>)}
            {showSavedList && (<div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"><div className="bg-white rounded-xl shadow-xl w-full max-w-4xl h-[80vh] flex flex-col"><div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-xl"><h3 className="font-bold text-lg flex items-center gap-2"><Library size={20} /> 我的行程库</h3><button onClick={() => setShowSavedList(false)}><X size={24} className="text-gray-400 hover:text-gray-600" /></button></div><div className="p-4 border-b bg-white"><div className="relative"><Search size={16} className="absolute left-3 top-3 text-gray-400" /><input type="text" className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg" placeholder="搜索..." value={tripSearchTerm} onChange={(e) => setTripSearchTerm(e.target.value)} /></div></div><div className="flex-1 overflow-auto p-4 bg-gray-50"><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{savedTrips.filter(t => (isSuperAdmin || t.isPublic || t.createdBy === currentUser?.username || (!t.createdBy && true)) && (t.name.includes(tripSearchTerm) || t.settings.destinations.join('').includes(tripSearchTerm))).map(trip => (<div key={trip.id} onClick={() => handleLoadTrip(trip)} className="bg-white p-4 rounded-lg border border-gray-200 hover:shadow-md cursor-pointer transition-shadow group relative"><div className="flex justify-between items-start mb-2"><h4 className="font-bold text-blue-700 line-clamp-1">{trip.name}</h4>{(isSuperAdmin || trip.createdBy === currentUser?.username) && (<button onClick={(e) => { e.stopPropagation(); if (window.confirm(`确认删除?`)) setSavedTrips(savedTrips.filter(t => t.id !== trip.id)); }} className="text-gray-300 hover:text-red-500 p-1"><Trash2 size={14} /></button>)}</div><div className="text-xs text-gray-500 space-y-1"><p>{trip.rows.length}天</p><p>{trip.createdBy || 'Unknown'} {trip.isPublic ? '(公有)' : '(私有)'}</p></div></div>))}</div></div></div></div>)}
            {qsModal && (<div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center"><div className="bg-white p-6 rounded-lg shadow-xl w-96"><h3 className="text-lg font-bold mb-4 flex items-center gap-2"><Save size={18} /> 快速添加至资源库</h3><div className="space-y-4"><div className="p-3 bg-blue-50 rounded text-sm text-blue-800"><p className="font-bold">内容:</p><p className="mt-1">{qsModal.itemsDisplay}</p></div><div><label className="block text-sm font-medium text-gray-700 mb-1">归属国家</label><select className="w-full border border-gray-300 rounded p-2" value={qsSelectedCountry} onChange={(e) => setQsSelectedCountry(e.target.value)}><option value="">请选择...</option>{Array.from(new Set(poiCities.map(c => c.country))).map(c => (<option key={c} value={c}>{c}</option>))}</select></div></div><div className="flex justify-end gap-2 mt-6"><button onClick={() => setQsModal(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">取消</button><button onClick={performQuickSave} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">确认添加</button></div></div></div>)}
        </div>
    );
}
