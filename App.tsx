
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Trash2, Download, Save, FolderOpen, Rocket, Sparkles, Database, Filter, Calendar, MapPin, Clock, Copy, Edit3, X, FileDown, FileUp, HardDrive, PlusCircle, CheckCircle, RotateCcw, ArrowRightCircle, Search, LogOut, ShieldAlert, FileSpreadsheet, Calculator, Info, Library, Wand2, Loader2, Upload, Cloud, RefreshCw, Settings, AlertTriangle, User as UserIcon, MinusCircle, ChevronDown, ChevronUp, MessageCircle, Send, Minimize2, Paperclip, FileText, Image as ImageIcon } from 'lucide-react';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { DayRow, TripSettings, TransportType, CustomColumn, SavedTrip, CarCostEntry, PoiCity, PoiSpot, PoiHotel, PoiActivity, PoiOther, User, CountryFile, TransportItem, HotelItem, GeneralItem, ResourceFile } from './types';
import { GlobalSettings } from './components/GlobalSettings';
import { Autocomplete } from './components/Autocomplete';
import { MultiSelect } from './components/MultiSelect';
import { ResourceDatabase } from './components/ResourceDatabase';
import { AuthModal } from './components/AuthModal';
import { AdminDashboard } from './components/AdminDashboard';
import { addDays, generateUUID } from './utils/dateUtils';
import { suggestHotels, generateFileName, generateComprehensiveItinerary, ItineraryItem, AIPlanningResult, askTravelAI } from './services/geminiService';
import { AuthService } from './services/authService';
import { StorageService } from './services/storageService';
import { SupabaseManager } from './services/supabaseClient';

const INITIAL_ROWS = 8;

export default function App() {
  // --- Auth State ---
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showAdminDashboard, setShowAdminDashboard] = useState(false);
  // Remove showAuthModal as we now enforce login via conditional rendering
  // const [showAuthModal, setShowAuthModal] = useState(false);

  // --- App State ---
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [dataLoadedSuccessfully, setDataLoadedSuccessfully] = useState(false); 
  const [cloudStatus, setCloudStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [notification, setNotification] = useState<{show: boolean, message: string}>({ show: false, message: '' });

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
  const [resourceFiles, setResourceFiles] = useState<ResourceFile[]>([]); // NEW: Resource Files

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
  })));
  
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>([]);
  const [showSavedList, setShowSavedList] = useState(false);
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [isResourceOpen, setIsResourceOpen] = useState(false);
  
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiPromptInput, setAiPromptInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Chat State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatAttachment, setChatAttachment] = useState<{data: string, mimeType: string, previewUrl?: string} | null>(null);
  const [chatMessages, setChatMessages] = useState<{
      role: 'user' | 'model', 
      text: string, 
      attachment?: string,
      responseImages?: string[] 
  }[]>([
      { role: 'model', text: '你好！我是星艾，你的专业旅行顾问。你可以问我关于内部资源库的问题，或者让我帮你查阅已上传的文档。' }
  ]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatFileRef = useRef<HTMLInputElement>(null);

  const [colWidths, setColWidths] = useState<Record<string, number>>({
      day: 48, date: 110, route: 160, transport: 200, hotel: 220, 
      ticket: 180, activity: 180, otherService: 180, description: 250, 
      transportCost: 90, hotelCost: 90, 
      ticketCost: 90, activityCost: 90, otherCost: 90
  });

  const totalCost = useMemo(() => rows.reduce((acc, r) => acc + r.transportCost + r.hotelCost + r.ticketCost + r.activityCost + r.otherCost, 0), [rows]);

  // --- PERMISSION HELPERS ---
  const isSuperAdmin = currentUser?.role === 'super_admin';
  const isAdmin = currentUser?.role === 'admin'; 
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
    return Array.from(new Set(cities.map(c => c.name))).sort();
  }, [poiCities, settings.destinations, currentUser]);

  useEffect(() => {
      const initApp = async () => {
          setIsAppLoading(true);
          const user = await AuthService.getCurrentUser();
          if (user) {
              setCurrentUser(user);
              await loadCloudData(user);
          } else {
              // If no user, we don't load confidential cloud data yet, 
              // but we need to stop loading so AuthModal can show.
          }
          setIsAppLoading(false);
      };
      initApp();
  }, []);

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

  // Scroll chat to bottom
  useEffect(() => {
      if (isChatOpen && chatEndRef.current) {
          chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
  }, [chatMessages, isChatOpen, chatAttachment]);

  const loadCloudData = async (user: User | null = currentUser) => {
      try {
            await StorageService.migrateLocalData().catch(console.warn);
            await StorageService.ensureAdminProfile().catch(console.warn);
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
                     setSettings(prev => ({...prev, marginPercent: config.defaultMargin }));
                 }
            } catch (e) {
                 console.error("Failed to load settings", e);
            }
            try {
                const [cars, cities, spots, hotels, activities, others, files, resFiles] = await Promise.all([
                    StorageService.getCars(),
                    StorageService.getCities(),
                    StorageService.getSpots(),
                    StorageService.getHotels(),
                    StorageService.getActivities(),
                    StorageService.getOthers(), 
                    StorageService.getFiles(),
                    StorageService.getResourceFiles() // New
                ]);
                setCarDB(cars);
                setPoiCities(cities);
                setPoiSpots(spots);
                setPoiHotels(hotels);
                setPoiActivities(activities);
                setPoiOthers(others); 
                setCountryFiles(files);
                setResourceFiles(resFiles); // New
            } catch (e) {
                console.error("Failed to load full resources", e);
                setNotification({ show: true, message: '部分资源加载失败 (可能数据量过大)，请尝试刷新。' });
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
  useDebouncedSave(resourceFiles, StorageService.saveResourceFiles); // New
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
              StorageService.saveFiles(countryFiles),
              StorageService.saveResourceFiles(resourceFiles) // New
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
          const [cars, cities, spots, hotels, activities, others, files, resFiles] = await Promise.all([
              StorageService.getCars(),
              StorageService.getCities(),
              StorageService.getSpots(),
              StorageService.getHotels(),
              StorageService.getActivities(),
              StorageService.getOthers(), 
              StorageService.getFiles(),
              StorageService.getResourceFiles()
          ]);
          setCarDB(cars);
          setPoiCities(cities);
          setPoiSpots(spots);
          setPoiHotels(hotels);
          setPoiActivities(activities);
          setPoiOthers(others); 
          setCountryFiles(files);
          setResourceFiles(resFiles);
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

  // ... (Rest of existing App.tsx logic unchanged until Return) ...
  const handleOpenSavedList = async () => {
      if (isRefreshingTrips) return;
      setIsRefreshingTrips(true);
      setCloudStatus('syncing');
      try {
          const trips = await StorageService.getTrips();
          setSavedTrips(trips);
          setCloudStatus('synced');
          setShowSavedList(true);
      } catch (error) {
          console.error("Failed to refresh trips", error);
          setCloudStatus('error');
          setShowSavedList(true);
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
  
  const Th = (id: string, label: string | React.ReactNode, bgClass = '', textClass = 'text-gray-500', sticky = false) => {
      const w = colWidths[id] || 100;
      return (
        <th key={id} style={{ width: w, minWidth: w }} className={`px-2 py-3 text-left text-xs font-bold uppercase group ${textClass} ${bgClass} sticky top-0 ${sticky ? 'left-0 z-30 shadow-[1px_0_2px_rgba(0,0,0,0.05)]' : 'z-20'} border-b border-gray-200`}>
           <div className="flex items-center justify-between w-full h-full relative">
               <span className="truncate w-full block">{label}</span>
               <div className="absolute -right-2 top-0 bottom-0 w-4 cursor-col-resize z-20 flex justify-center hover:bg-blue-400/20 rounded" onMouseDown={(e) => startResize(e, id)} onClick={(e) => e.stopPropagation()}>
                  <div className="w-[1px] h-full bg-gray-200 group-hover:bg-blue-400"></div>
               </div>
           </div>
        </th>
      );
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
              let car = visibleCars.find(c => c.carModel === item.model && c.serviceType === item.serviceType); 
              if (!car && !item.serviceType) {
                   car = visibleCars.find(c => c.carModel === item.model);
              }
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
  
  // ... (Transport/Hotel/General Item Add/Update/Remove functions - unchanged) ...
  const addTransportItem = (index: number) => {
      const row = rows[index];
      const visibleCars = carDB.filter(isResourceVisible);
      const defaultCar = visibleCars.find(c => settings.destinations.includes(c.region)) || visibleCars[0];
      const newItem: TransportItem = {
          id: generateUUID(),
          model: defaultCar ? defaultCar.carModel : '新车型',
          serviceType: defaultCar ? defaultCar.serviceType : '包车',
          quantity: 1,
          priceType: 'low',
          price: defaultCar ? defaultCar.priceLow : 0,
          sourcePublic: defaultCar ? (defaultCar.isPublic || !defaultCar.createdBy) : false
      };
      updateRow(index, { transportDetails: [...row.transportDetails, newItem], manualCostFlags: {...row.manualCostFlags, transport: false} });
  };

  const updateTransportItem = (rowIndex: number, itemId: string, updates: Partial<TransportItem>) => {
      const row = rows[rowIndex];
      const newDetails = row.transportDetails.map(item => {
          if (item.id === itemId) {
              const updated = { ...item, ...updates };
              if (updates.model || updates.priceType || updates.serviceType) {
                   const visibleCars = carDB.filter(isResourceVisible);
                   const car = visibleCars.find(c => c.carModel === updated.model && c.serviceType === updated.serviceType);
                   if (car) {
                       updated.price = updated.priceType === 'high' ? car.priceHigh : car.priceLow;
                       updated.sourcePublic = car.isPublic || !car.createdBy;
                   }
              }
              return updated;
          }
          return item;
      });
      updateRow(rowIndex, { transportDetails: newDetails, manualCostFlags: {...row.manualCostFlags, transport: false} });
  };

  const removeTransportItem = (rowIndex: number, itemId: string) => {
      const row = rows[rowIndex];
      updateRow(rowIndex, { 
          transportDetails: row.transportDetails.filter(i => i.id !== itemId),
          manualCostFlags: {...row.manualCostFlags, transport: false}
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
      updateRow(index, { hotelDetails: [...row.hotelDetails, newItem], manualCostFlags: {...row.manualCostFlags, hotel: false} });
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
      updateRow(rowIndex, { hotelDetails: newDetails, manualCostFlags: {...row.manualCostFlags, hotel: false} });
  };

  const removeHotelItem = (rowIndex: number, itemId: string) => {
      const row = rows[rowIndex];
      updateRow(rowIndex, { 
          hotelDetails: row.hotelDetails.filter(i => i.id !== itemId),
          manualCostFlags: {...row.manualCostFlags, hotel: false}
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

  const handleOpenSaveModal = () => {
    const planner = currentUser?.username || settings.plannerName || '未命名';
    let country = '未定国家';
    if (settings.destinations.length > 0) {
        country = settings.destinations.join('+');
    } else {
        const allCities = rows.flatMap(r => extractCitiesFromRoute(r.route));
        if (allCities.length > 0) {
            const c = poiCities.find(pc => pc.name === allCities[0]);
            if (c) country = c.country;
        }
    }
    const duration = `${rows.length}天`;
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const smartName = `${planner}_${country}_${duration}_${dateStr}`;
    setSaveName(smartName); 
    setShowSaveModal(true);
  };

  const handleConfirmSave = async () => {
      const nameToCheck = saveName.trim();
      if (!nameToCheck) { alert("请输入行程名称"); return; }
      const collisionTrip = savedTrips.find(t => t.name === nameToCheck);
      let finalId = activeTripId;

      if (collisionTrip) {
          const isSelf = activeTripId && collisionTrip.id === activeTripId;
          if (!isSelf) {
               const canOverwrite = isSuperAdmin || (currentUser && collisionTrip.createdBy === currentUser.username) || (!collisionTrip.createdBy);
               if (!canOverwrite) {
                   alert(`行程 "${nameToCheck}" 已存在且由用户 ${collisionTrip.createdBy} 创建。\n您没有权限覆盖它，请修改名称。`);
                   return;
               }
               if (!window.confirm(`行程名称 "${nameToCheck}" 已存在。\n确定要覆盖原有行程吗？`)) {
                   return;
               }
               finalId = collisionTrip.id;
          }
      } else {
          if (!finalId) finalId = generateUUID();
      }

      const newTrip: SavedTrip = {
        id: finalId!,
        name: nameToCheck,
        timestamp: Date.now(),
        settings: settings,
        rows: rows,
        customColumns: customColumns,
        createdBy: currentUser?.username || 'anonymous',
        lastModifiedBy: currentUser?.username || 'anonymous',
        isPublic: isSuperAdmin 
      };
      
      const updatedTrips = [...savedTrips.filter(t => t.id !== finalId), newTrip];
      setSavedTrips(updatedTrips);
      setActiveTripId(finalId);
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
    setActiveTripId(null);
    setShowSavedList(false);
    setNotification({ show: true, message: `已加载: ${trip.name} (副本)` });
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

  // ... (Room Match Logic, Hotel Details Gen Logic, AI Planning Logic - unchanged) ...
  const findBestRoomTypeMatch = (hotelName: string, targetOcc: number, prefType: string, allHotels: PoiHotel[]): string => {
      const hotelEntries = allHotels.filter(h => h.name === hotelName);
      if (hotelEntries.length === 0) {
          if (targetOcc <= 1) return '单人间';
          if (targetOcc === 2) return prefType && (prefType.includes('大') || prefType.includes('双')) ? prefType : '标准间';
          if (targetOcc === 3) return '三人间';
          return '家庭房';
      }
      const types = hotelEntries.map(h => h.roomType);
      const score = (type: string) => {
          let s = 0;
          const t = type.toLowerCase();
          if (targetOcc === 1) {
              if (t.includes('单') || t.includes('single')) s += 10;
          } else if (targetOcc === 2) {
              if (t.includes('标') || t.includes('standard')) s += 5;
              if (t.includes('双') || t.includes('twin')) s += 5;
              if (t.includes('大') || t.includes('king')) s += 5;
              if (prefType && t.includes(prefType)) s += 20; 
          } else if (targetOcc === 3) {
              if (t.includes('三') || t.includes('triple')) s += 10;
              if (t.includes('家庭') || t.includes('family')) s += 5;
          } else {
              if (t.includes('家庭') || t.includes('family') || t.includes('套') || t.includes('suite')) s += 10;
          }
          return s;
      };
      types.sort((a, b) => score(b) - score(a));
      return types[0];
  };

  const generateHotelDetails = (hotelName: string, people: number, rooms: number, prefType: string): HotelItem[] => {
    if (!hotelName) return [];
    const safeRooms = Math.max(1, rooms);
    const safePeople = Math.max(1, people);
    const items: HotelItem[] = [];
    const baseOcc = Math.floor(safePeople / safeRooms);
    const rem = safePeople % safeRooms; 
    const countLarge = rem;
    const countSmall = safeRooms - rem;
    const occLarge = baseOcc + 1;
    const occSmall = baseOcc;
    const visibleHotels = poiHotels.filter(isResourceVisible);
    if (countLarge > 0) {
        const typeName = findBestRoomTypeMatch(hotelName, occLarge, prefType, visibleHotels);
        items.push({ id: generateUUID(), name: hotelName, roomType: typeName, quantity: countLarge, price: 0, sourcePublic: false });
    }
    if (countSmall > 0) {
        const typeName = findBestRoomTypeMatch(hotelName, occSmall <= 0 ? 1 : occSmall, prefType, visibleHotels);
        const existing = items.find(i => i.roomType === typeName);
        if (existing) { existing.quantity += countSmall; } else { items.push({ id: generateUUID(), name: hotelName, roomType: typeName, quantity: countSmall, price: 0, sourcePublic: false }); }
    }
    items.forEach(item => {
        const match = visibleHotels.find(h => h.name === item.name && h.roomType === item.roomType);
        if (match) { item.price = match.price; item.sourcePublic = match.isPublic || !match.createdBy; }
    });
    return items;
  };

  const handleAIPlanning = async () => {
    if (!aiPromptInput.trim()) return;
    setIsGenerating(true);
    const visibleCars = carDB.filter(isResourceVisible);
    const availableCountries: string[] = Array.from(new Set(poiCities.filter(c => isResourceVisible(c)).map(c => c.country)));
    const availableCities: string[] = poiCities.filter(c => isResourceVisible(c)).map(c => c.name);

    try {
        const result = await generateComprehensiveItinerary(
            settings.destinations,
            rows.length,
            rows,
            savedTrips,
            availableCountries,
            availableCities,
            poiCities,
            poiSpots,
            poiHotels,
            poiActivities,
            aiPromptInput,
            carDB 
        );

        if (result && result.itinerary) {
             let effectiveDestinations = settings.destinations;
             if (result.detectedDestinations && result.detectedDestinations.length > 0) {
                 effectiveDestinations = result.detectedDestinations;
                 setSettings(prev => ({ ...prev, destinations: result.detectedDestinations }));
             }

             if (result.startDate) {
                  setSettings(prev => ({ ...prev, startDate: result.startDate! }));
             }

             let effectivePeople = settings.peopleCount;
             let effectiveRooms = settings.roomCount;
             if (result.peopleCount !== undefined) effectivePeople = result.peopleCount;
             if (result.roomCount !== undefined) effectiveRooms = result.roomCount; 
             else if (result.peopleCount !== undefined) effectiveRooms = Math.ceil(effectivePeople / 2);
             
             let effectiveRoomType = result.roomType || '标准间';
             let effectiveTicketCount = result.ticketCount !== undefined ? result.ticketCount : effectivePeople;

             if (result.peopleCount !== undefined || result.roomCount !== undefined) {
                  setSettings(prev => ({ ...prev, peopleCount: effectivePeople, roomCount: effectiveRooms }));
             }
             
             const extractedCarModel = result.carModel;
             const newRows = [...rows];
             const maxDay = Math.max(...result.itinerary.map(i => i.day));
             if (maxDay > newRows.length) {
                 for(let i = newRows.length; i < maxDay; i++) newRows.push(createEmptyRow(i + 1));
             } else if (result.isFullReplacement && maxDay < newRows.length && maxDay > 0) {
                 newRows.splice(maxDay);
             }

             result.itinerary.forEach(item => {
                 const idx = item.day - 1;
                 if (idx >= 0 && idx < newRows.length) {
                     const currentRow = newRows[idx];
                     let routeStr = currentRow.route;
                     if (item.origin && item.destination) {
                         routeStr = `${item.origin}-${item.destination}`;
                     }
                     const ticketItems: GeneralItem[] = item.ticketName ? item.ticketName.split(/[,，、]/).map(s => ({ id: generateUUID(), name: s.trim(), quantity: effectiveTicketCount, price: 0, sourcePublic: false })) : currentRow.ticketDetails;
                     const activityItems: GeneralItem[] = item.activityName ? item.activityName.split(/[,，、]/).map(s => ({ id: generateUUID(), name: s.trim(), quantity: effectivePeople, price: 0, sourcePublic: false })) : currentRow.activityDetails;
                     
                     let hotelItems: HotelItem[] = currentRow.hotelDetails;
                     if (item.hotelName) {
                         hotelItems = generateHotelDetails(item.hotelName, effectivePeople, effectiveRooms, effectiveRoomType);
                     } else if (result.roomCount !== undefined || result.peopleCount !== undefined) {
                         if (currentRow.hotelDetails.length === 1) {
                             const existingName = currentRow.hotelDetails[0].name;
                             hotelItems = generateHotelDetails(existingName, effectivePeople, effectiveRooms, effectiveRoomType);
                         }
                     }
                     
                     let transportItems = currentRow.transportDetails;
                     let currentTransportTypes = currentRow.transport;
                     const relevantCars = visibleCars.filter(c => effectiveDestinations.includes(c.region) || c.region === '通用');
                     const carsPool = relevantCars.length > 0 ? relevantCars : visibleCars;
                     let targetCarModel = extractedCarModel;
                     let dbCar = carsPool.find(c => c.carModel === targetCarModel);
                     if (!dbCar && carsPool.length > 0) { dbCar = carsPool[0]; targetCarModel = dbCar.carModel; }

                     if (targetCarModel && dbCar) {
                         let quantity = dbCar.passengers > 0 ? Math.ceil(effectivePeople / dbCar.passengers) : 1;
                         transportItems = [{ id: generateUUID(), model: targetCarModel, serviceType: dbCar.serviceType, quantity: quantity, priceType: 'low', price: dbCar.priceLow, sourcePublic: dbCar.isPublic || !dbCar.createdBy }];
                         if (!currentTransportTypes.includes(dbCar.serviceType)) currentTransportTypes = [...currentTransportTypes, dbCar.serviceType];
                     }

                     newRows[idx] = {
                         ...currentRow,
                         route: routeStr,
                         hotelDetails: hotelItems,
                         ticketDetails: ticketItems,
                         activityDetails: activityItems,
                         transportDetails: transportItems, 
                         transport: currentTransportTypes, 
                         description: item.description || currentRow.description,
                         manualCostFlags: { ...currentRow.manualCostFlags, hotel: false, ticket: false, activity: false, transport: false }
                     };
                 }
             });
             setRows(newRows);
             setShowAIModal(false);
             setAiPromptInput('');
             setNotification({ show: true, message: 'AI 规划完成！请点击“刷新价格”以计算最新费用。' });
             setTimeout(() => setNotification({ show: false, message: '' }), 4000);
        } else {
             throw new Error("AI 返回了无效的行程数据");
        }
    } catch (e: any) {
        console.error("AI Error in App:", e);
        let msg = e.message;
        if (msg === 'Failed to fetch') msg = '网络请求失败，请检查您的网络连接。';
        alert(`AI 请求失败: ${msg}`);
    } finally {
        setIsGenerating(false);
    }
  };

  // ... (Chat Handlers unchanged) ...
  const handleChatFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processChatFile(file);
      e.target.value = ''; 
  };
  const handleChatPaste = (e: React.ClipboardEvent) => {
      const items = e.clipboardData.items;
      for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf("image") !== -1) {
              const blob = items[i].getAsFile();
              if (blob) processChatFile(blob);
              e.preventDefault(); 
              return;
          }
      }
  };
  const processChatFile = (file: File | Blob) => {
      if (file.size > 10 * 1024 * 1024) { 
          alert("文件大小不能超过 10MB");
          return;
      }
      const reader = new FileReader();
      reader.onload = (evt) => {
          const result = evt.target?.result as string; 
          if (result) {
              const base64Data = result.split(',')[1];
              const mimeType = result.split(';')[0].split(':')[1];
              setChatAttachment({ data: base64Data, mimeType, previewUrl: result });
          }
      };
      reader.readAsDataURL(file);
  };
  const handleSendChat = async () => {
      if ((!chatInput.trim() && !chatAttachment) || isChatLoading) return;
      const userMsg = chatInput.trim();
      const currentAttachment = chatAttachment; 
      setChatInput('');
      setChatAttachment(null); 
      setChatMessages(prev => [...prev, { role: 'user', text: userMsg, attachment: currentAttachment?.previewUrl }]);
      setIsChatLoading(true);
      // NOTE: `askTravelAI` now internally fetches the latest Knowledge Base via StorageService, so we don't need to pass it here explicitly.
      const aiResponse = await askTravelAI(userMsg, currentAttachment ? { data: currentAttachment.data, mimeType: currentAttachment.mimeType } : null);
      setChatMessages(prev => [...prev, { role: 'model', text: aiResponse.text, responseImages: aiResponse.images }]);
      setIsChatLoading(false);
  };

  const handleLoginSuccess = async (u: User) => {
      setCurrentUser(u);
      setIsAppLoading(true);
      await loadCloudData(u);
      setIsAppLoading(false);
      setNotification({ show: true, message: `欢迎回来, ${u.username}` });
      setTimeout(() => setNotification({ show: false, message: '' }), 3000);
  };

  // --- RENDER CONDITIONAL ---
  if (isAppLoading) {
      return (
          <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-blue-600 gap-4">
              <Loader2 size={48} className="animate-spin"/>
              <div className="text-sm font-medium text-gray-500">正在启动星艾旅行助手...</div>
          </div>
      );
  }

  if (!currentUser) {
      return <AuthModal onLoginSuccess={handleLoginSuccess} />;
  }

  // --- MAIN APP (Only rendered if logged in) ---
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-gray-900">
      {/* ... (Header) ... */}
      <div className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 shadow-sm z-40 sticky top-0 no-print flex flex-col md:flex-row justify-between items-center gap-3">
        <div className="flex w-full md:w-auto justify-between md:justify-start items-center gap-4">
           <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent flex items-center gap-2">
             <img src="https://img.icons8.com/fluency/96/astronaut.png" alt="Logo" className="w-8 h-8" />
             <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">星艾-专业旅行定制师</span>
           </h1>
           <div className="md:hidden flex items-center gap-2">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs">{currentUser.username.substring(0, 2).toUpperCase()}</div>
                </div>
           </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-between md:justify-end">
           <div className="flex items-center gap-2">
              <button onClick={handleNewTrip} className="p-2 hover:bg-gray-100 rounded text-gray-600" title="新建"><FileUp size={18}/></button>
              <button onClick={handleOpenSavedList} className="p-2 hover:bg-gray-100 rounded text-gray-600 flex items-center gap-1">{isRefreshingTrips ? <Loader2 size={18} className="animate-spin text-blue-600"/> : <FolderOpen size={18}/>}</button>
              <button onClick={handleOpenSaveModal} className="p-2 hover:bg-gray-100 rounded text-blue-600" title="保存"><Save size={18}/></button>
              <button onClick={handleExport} className="p-2 hover:bg-gray-100 rounded text-green-600" title="导出"><FileSpreadsheet size={18}/></button>
           </div>
           
           <div className="h-6 w-px bg-gray-300 mx-1 hidden md:block"></div>
           
           <div className="flex items-center gap-2">
               <button onClick={handleOpenResources} className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 text-sm font-medium transition-colors whitespace-nowrap">{isRefreshingResources ? <Loader2 size={16} className="animate-spin"/> : <Database size={16}/>} <span className="hidden sm:inline">资源库</span></button>
               <button onClick={() => setShowAIModal(true)} className="flex items-center gap-1 px-3 py-1.5 bg-purple-50 text-purple-700 rounded hover:bg-purple-100 text-sm font-medium whitespace-nowrap"><Sparkles size={16}/> <span className="hidden sm:inline">AI 规划</span></button>
           </div>

           <div className="hidden md:flex items-center gap-4 ml-2">
                {notification.show && <div className="text-sm text-green-600 font-medium animate-fade-in bg-green-50 px-3 py-1 rounded-full flex items-center gap-1"><CheckCircle size={14}/> {notification.message}</div>}
                <div className={`text-xs px-2 py-1 rounded flex items-center gap-1 ${cloudStatus === 'synced' ? 'text-green-600 bg-green-50' : cloudStatus === 'error' ? 'text-red-600 bg-red-50' : 'text-gray-400'}`}>
                    <Cloud size={12}/> {cloudStatus === 'synced' ? '已同步' : cloudStatus === 'syncing' ? '同步...' : '未同步'}
                </div>
                <div className="flex items-center gap-3">
                {isSuperAdmin && <button onClick={() => setShowAdminDashboard(true)} className="text-gray-500 hover:text-red-600" title="管理员后台"><ShieldAlert size={18}/></button>}
                <div className="flex flex-col items-end leading-tight">
                    <span className="text-sm font-medium">{currentUser.username}</span>
                    <span className="text-[10px] text-gray-400">{currentUser.role === 'super_admin' ? '超级管理员' : currentUser.role === 'admin' ? '管理员' : '普通会员'}</span>
                </div>
                <button onClick={() => { AuthService.logout(); setCurrentUser(null); window.location.reload(); }} className="text-gray-400 hover:text-gray-600"><LogOut size={18}/></button>
                </div>
           </div>
        </div>
      </div>

      <div className="flex-1 p-2 md:p-6 overflow-auto">
        <GlobalSettings settings={settings} updateSettings={(s) => setSettings(prev => ({...prev, ...s}))} availableCountries={Array.from(new Set(poiCities.filter(isResourceVisible).map(c => c.country)))} />
        {/* ... Main Table ... */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto pb-32"> 
                <table className="w-full text-sm text-left border-collapse">
                    <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200">
                        <tr>
                            {Th('day', 'Day', 'bg-gray-50', 'text-gray-500', true)}
                            {Th('date', '日期')}
                            {Th('route', '路线')}
                            {Th('description', '详情')}
                            {Th('transport', '交通/车型')}
                            {Th('hotel', '酒店/房型')}
                            {Th('ticket', '门票')}
                            {Th('activity', '活动')}
                            {Th('otherService', '其它服务')}
                            {Th('transportCost', '交通费')}
                            {Th('hotelCost', '酒店费')}
                            {Th('ticketCost', '门票费')}
                            {Th('activityCost', '活动费')}
                            {Th('otherCost', '其它费用')}
                            <th className="w-10 sticky right-0 bg-gray-50 z-20"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {rows.map((row, index) => {
                            // Extract route cities and determine arrival city
                            const routeCities = extractCitiesFromRoute(row.route);
                            const currentDestCityName = routeCities.length > 0 ? routeCities[routeCities.length - 1] : null;
                            const currentDestCityIds = currentDestCityName ? getMatchingCityIds(currentDestCityName, poiCities) : [];
                            
                            // Determine relevant city IDs for Spots/Activities (All cities in route)
                            let relevantCityIds: string[] = [];
                            if (routeCities.length > 0) {
                                relevantCityIds = routeCities.flatMap(name => getMatchingCityIds(name, poiCities));
                            } else {
                                relevantCityIds = poiCities
                                    .filter(c => settings.destinations.includes(c.country) && isResourceVisible(c))
                                    .map(c => c.id);
                            }
                            relevantCityIds = Array.from(new Set(relevantCityIds));

                            // FILTER CARS
                            // Logic: Show cars if they belong to Global Destinations OR Current Route Cities OR are Generic.
                            // AND if they match the selected Transport Types (Service Types) for this row.
                            const visibleCars = carDB.filter(c => 
                                isResourceVisible(c) && 
                                (settings.destinations.includes(c.region) || c.region === '通用' || routeCities.includes(c.region)) &&
                                (row.transport.length === 0 || row.transport.includes(c.serviceType))
                            );

                            // FILTER HOTELS
                            // Logic: Filter by destination city if known. Fallback to Country.
                            const allVisibleHotels = poiHotels.filter(isResourceVisible);
                            let hotelOptions = allVisibleHotels;

                            if (currentDestCityIds.length > 0) {
                                // Strict filter: Arrival City
                                hotelOptions = allVisibleHotels.filter(h => currentDestCityIds.includes(h.cityId));
                            } else if (settings.destinations.length > 0) {
                                // Fallback filter: Selected Countries
                                const validCityIds = poiCities
                                    .filter(c => settings.destinations.includes(c.country))
                                    .map(c => c.id);
                                hotelOptions = allVisibleHotels.filter(h => validCityIds.includes(h.cityId));
                            }
                            const uniqueHotelNames = Array.from(new Set(hotelOptions.map(h => h.name)));

                            const validSpots = poiSpots.filter(s => (relevantCityIds.includes(s.cityId) || !s.cityId) && isResourceVisible(s));
                            const validActivities = poiActivities.filter(a => (relevantCityIds.includes(a.cityId) || !a.cityId) && isResourceVisible(a));
                            const validOthers = poiOthers.filter(o => settings.destinations.includes(o.country) && isResourceVisible(o));

                            return (
                            <tr key={row.id} className="hover:bg-blue-50/30 group align-top">
                                <td className="p-2 sticky left-0 bg-white group-hover:bg-blue-50/30 z-10 font-medium text-center text-gray-400">{row.dayIndex}</td>
                                <td className="p-2"><input type="date" className="w-full border-none bg-transparent p-0 text-gray-600 text-xs focus:ring-0" value={row.date} onChange={(e) => { if (index === 0) setSettings(prev => ({ ...prev, startDate: e.target.value })); else updateRow(index, { date: e.target.value }); }} /></td>
                                <td className="p-2"><Autocomplete value={row.route} onChange={(val) => handleRouteUpdate(index, val)} suggestions={allowedCityNames} placeholder="城市-城市" separator="-" /></td>
                                
                                <td className="p-2"><textarea className="w-full border-none bg-transparent p-0 text-sm focus:ring-0 resize-y min-h-[4rem]" rows={3} value={row.description} onChange={(e) => updateRow(index, { description: e.target.value })} /></td>

                                {/* Transport Column */}
                                <td className="p-2">
                                    <MultiSelect options={Object.values(TransportType)} value={row.transport} onChange={(v) => updateRow(index, { transport: v })} className="w-full mb-2" />
                                    <div className="space-y-1">
                                        {row.transportDetails.map(item => (
                                            <div key={item.id} className="flex items-center gap-1 bg-gray-50 p-1 rounded border border-gray-200 text-xs">
                                                <select 
                                                    className="flex-1 bg-transparent border-none p-0 text-xs w-28 min-w-0" 
                                                    value={item.serviceType ? `${item.model}|${item.serviceType}` : item.model} 
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        if (val.includes('|')) {
                                                            const [m, s] = val.split('|');
                                                            updateTransportItem(index, item.id, { model: m, serviceType: s });
                                                        } else {
                                                            updateTransportItem(index, item.id, { model: val });
                                                        }
                                                    }}
                                                >
                                                     <option value="">选择车型</option>
                                                     {visibleCars.map(c => (
                                                        <option key={c.id} value={`${c.carModel}|${c.serviceType}`}>
                                                            {c.carModel} ({c.serviceType})
                                                        </option>
                                                     ))}
                                                </select>
                                                <span className="text-gray-400">x</span>
                                                <input type="number" min="1" className="w-8 p-0 border-none bg-transparent text-center text-xs" value={item.quantity} onChange={(e) => updateTransportItem(index, item.id, { quantity: parseInt(e.target.value)||1 })} />
                                                <select className="bg-transparent border-none p-0 text-[10px] text-gray-500 w-10" value={item.priceType} onChange={(e) => updateTransportItem(index, item.id, { priceType: e.target.value as 'low'|'high' })}>
                                                    <option value="low">淡季</option>
                                                    <option value="high">旺季</option>
                                                </select>
                                                <button onClick={() => removeTransportItem(index, item.id)} className="text-gray-400 hover:text-red-500"><X size={12}/></button>
                                            </div>
                                        ))}
                                        <button onClick={() => addTransportItem(index)} className="text-xs text-blue-500 flex items-center gap-1 hover:underline"><Plus size={10}/> 添加车辆</button>
                                    </div>
                                </td>

                                {/* Hotel Column */}
                                <td className="p-2 relative group/cell">
                                    <div className="space-y-1">
                                         {row.hotelDetails.map(item => (
                                             <div key={item.id} className="flex flex-col gap-1 bg-gray-50 p-1.5 rounded border border-gray-200 text-xs">
                                                 <div className="flex items-center gap-1">
                                                     <Autocomplete className="flex-1 min-w-[80px]" value={item.name} onChange={(v) => updateHotelItem(index, item.id, { name: v })} suggestions={uniqueHotelNames} placeholder="酒店名" />
                                                     <button onClick={() => removeHotelItem(index, item.id)} className="text-gray-400 hover:text-red-500"><X size={12}/></button>
                                                 </div>
                                                 <div className="flex items-center gap-1">
                                                     <select className="flex-1 bg-transparent border-gray-200 rounded text-[10px] p-0.5 h-6" value={item.roomType} onChange={(e) => updateHotelItem(index, item.id, { roomType: e.target.value })}>
                                                          <option value="">房型...</option>
                                                          {allVisibleHotels.filter(h => h.name === item.name).map(h => <option key={h.id} value={h.roomType}>{h.roomType}</option>)}
                                                     </select>
                                                     <span className="text-gray-400 text-[10px]">x</span>
                                                     <input type="number" min="0" className="w-8 p-0 border-none bg-transparent text-center text-xs" value={item.quantity} onChange={(e) => updateHotelItem(index, item.id, { quantity: parseInt(e.target.value)||0 })} />
                                                 </div>
                                             </div>
                                         ))}
                                         <button onClick={() => addHotelItem(index)} className="text-xs text-blue-500 flex items-center gap-1 hover:underline"><Plus size={10}/> 添加房间</button>
                                    </div>
                                </td>
                                
                                <td className="p-2 relative group/cell">
                                    <div className="space-y-1">
                                        {row.ticketDetails.map(item => (
                                            <div key={item.id} className="flex items-center gap-1 bg-gray-50 p-1 rounded border border-gray-200 text-xs">
                                                <Autocomplete className="flex-1 min-w-[60px]" value={item.name} onChange={(v) => updateGeneralItem(index, item.id, 'ticket', { name: v })} suggestions={validSpots.map(s => s.name)} placeholder="门票" />
                                                <span className="text-gray-400">x</span>
                                                <input type="number" step="0.1" className="w-10 p-0 border-none bg-transparent text-center text-xs" value={item.quantity} onChange={(e) => updateGeneralItem(index, item.id, 'ticket', { quantity: parseFloat(e.target.value)||0 })} />
                                                <button onClick={() => removeGeneralItem(index, item.id, 'ticket')} className="text-gray-400 hover:text-red-500"><X size={12}/></button>
                                            </div>
                                        ))}
                                        <button onClick={() => addGeneralItem(index, 'ticket')} className="text-xs text-blue-500 flex items-center gap-1 hover:underline"><Plus size={10}/> 添加门票</button>
                                    </div>
                                </td>

                                <td className="p-2 relative group/cell">
                                    <div className="space-y-1">
                                        {row.activityDetails.map(item => (
                                            <div key={item.id} className="flex items-center gap-1 bg-gray-50 p-1 rounded border border-gray-200 text-xs">
                                                <Autocomplete className="flex-1 min-w-[60px]" value={item.name} onChange={(v) => updateGeneralItem(index, item.id, 'activity', { name: v })} suggestions={validActivities.map(a => a.name)} placeholder="活动" />
                                                <span className="text-gray-400">x</span>
                                                <input type="number" step="0.1" className="w-10 p-0 border-none bg-transparent text-center text-xs" value={item.quantity} onChange={(e) => updateGeneralItem(index, item.id, 'activity', { quantity: parseFloat(e.target.value)||0 })} />
                                                <button onClick={() => removeGeneralItem(index, item.id, 'activity')} className="text-gray-400 hover:text-red-500"><X size={12}/></button>
                                            </div>
                                        ))}
                                        <button onClick={() => addGeneralItem(index, 'activity')} className="text-xs text-blue-500 flex items-center gap-1 hover:underline"><Plus size={10}/> 添加活动</button>
                                    </div>
                                </td>

                                <td className="p-2">
                                     <div className="space-y-1">
                                        {row.otherDetails.map(item => (
                                            <div key={item.id} className="flex items-center gap-1 bg-gray-50 p-1 rounded border border-gray-200 text-xs">
                                                <Autocomplete className="flex-1 min-w-[60px]" value={item.name} onChange={(v) => updateGeneralItem(index, item.id, 'other', { name: v })} suggestions={validOthers.map(o => o.name)} placeholder="服务" />
                                                <span className="text-gray-400">x</span>
                                                <input type="number" step="0.1" className="w-10 p-0 border-none bg-transparent text-center text-xs" value={item.quantity} onChange={(e) => updateGeneralItem(index, item.id, 'other', { quantity: parseFloat(e.target.value)||0 })} />
                                                <button onClick={() => removeGeneralItem(index, item.id, 'other')} className="text-gray-400 hover:text-red-500"><X size={12}/></button>
                                            </div>
                                        ))}
                                        <button onClick={() => addGeneralItem(index, 'other')} className="text-xs text-blue-500 flex items-center gap-1 hover:underline"><Plus size={10}/> 添加服务</button>
                                    </div>
                                </td>
                                
                                <td className="p-2 text-right align-top">{shouldMaskPrice(row.transportDetails.some(i => i.sourcePublic)) ? <span className="text-gray-400 font-mono text-sm">{maskNumber(row.transportCost, true)}</span> : <input type="number" className="w-full border-none bg-transparent p-0 text-right focus:ring-0 text-gray-500" value={row.transportCost} onChange={(e) => updateRow(index, { transportCost: parseFloat(e.target.value)||0, manualCostFlags: { ...row.manualCostFlags, transport: true } })} />}</td>
                                <td className="p-2 text-right align-top">{shouldMaskPrice(row.hotelDetails.some(i => i.sourcePublic)) ? <span className="text-gray-400 font-mono text-sm">{maskNumber(row.hotelCost, true)}</span> : <input type="number" className="w-full border-none bg-transparent p-0 text-right focus:ring-0 text-gray-500" value={row.hotelCost} onChange={(e) => updateRow(index, { hotelCost: parseFloat(e.target.value)||0, manualCostFlags: { ...row.manualCostFlags, hotel: true } })} />}</td>
                                <td className="p-2 text-right align-top">{shouldMaskPrice(row.ticketDetails.some(i => i.sourcePublic)) ? <span className="text-gray-400 font-mono text-sm">{maskNumber(row.ticketCost, true)}</span> : <input type="number" className="w-full border-none bg-transparent p-0 text-right focus:ring-0 text-gray-500" value={row.ticketCost} onChange={(e) => updateRow(index, { ticketCost: parseFloat(e.target.value)||0, manualCostFlags: { ...row.manualCostFlags, ticket: true } })} />}</td>
                                <td className="p-2 text-right align-top">{shouldMaskPrice(row.activityDetails.some(i => i.sourcePublic)) ? <span className="text-gray-400 font-mono text-sm">{maskNumber(row.activityCost, true)}</span> : <input type="number" className="w-full border-none bg-transparent p-0 text-right focus:ring-0 text-gray-500" value={row.activityCost} onChange={(e) => updateRow(index, { activityCost: parseFloat(e.target.value)||0, manualCostFlags: { ...row.manualCostFlags, activity: true } })} />}</td>
                                <td className="p-2 text-right align-top">{shouldMaskPrice(row.otherDetails.some(i => i.sourcePublic)) ? <span className="text-gray-400 font-mono text-sm">{maskNumber(row.otherCost, true)}</span> : <input type="number" className="w-full border-none bg-transparent p-0 text-right focus:ring-0 text-gray-500" value={row.otherCost} onChange={(e) => updateRow(index, { otherCost: parseFloat(e.target.value)||0, manualCostFlags: { ...row.manualCostFlags, other: true } })} />}</td>
                                
                                <td className="p-2 text-center sticky right-0 bg-white group-hover:bg-blue-50/30 z-10 align-top"><button onClick={() => handleDeleteRow(index)} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button></td>
                            </tr>
                        );
                        })}
                    </tbody>
                    <tfoot className="bg-gray-50 font-bold text-gray-700">
                        <tr>
                            <td colSpan={9} className="p-3 text-right">总计成本 ({settings.currency}):</td>
                            <td colSpan={5} className="p-3 text-right text-blue-600">{isMember ? '****' : totalCost.toLocaleString()}</td>
                            <td></td>
                        </tr>
                        <tr>
                            <td colSpan={9} className="p-3"><div className="flex items-center justify-end gap-4 h-full"><button onClick={() => setShowAIModal(true)} className="flex items-center gap-1 text-purple-600 bg-purple-50 hover:bg-purple-100 px-3 py-1 rounded-full border border-purple-200 text-xs font-bold transition-colors mr-2"><Wand2 size={14} /> AI 优化</button>{!isMember && (<div className="flex items-center gap-2 bg-blue-50 px-3 py-1 rounded-full border border-blue-100"><span className="text-xs font-medium text-blue-800">利润率</span><input type="range" min="0" max="60" step="1" value={settings.marginPercent} onChange={(e) => setSettings(prev => ({...prev, marginPercent: parseInt(e.target.value) || 0}))} className="w-24 h-1.5 bg-blue-200 rounded-lg appearance-none cursor-pointer accent-blue-600"/><span className="text-xs font-bold text-blue-800 w-8 text-right">{settings.marginPercent}%</span></div>)}<span className="font-bold text-gray-700">总报价:</span></div></td>
                            <td colSpan={6} className="p-3 text-left text-xl text-green-600 font-black">{Math.round(totalCost * settings.exchangeRate / (1 - settings.marginPercent / 100)).toLocaleString()}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
            <div className="p-3 bg-gray-50 border-t flex flex-col sm:flex-row justify-center gap-3"><button onClick={() => setRows([...rows, createEmptyRow(rows.length + 1)])} className="text-blue-600 flex items-center justify-center gap-1 hover:bg-blue-100 px-4 py-2 rounded transition-colors font-medium w-full sm:w-auto"><Plus size={16}/> 添加一天</button><button onClick={handleRefreshCosts} className="ml-0 sm:ml-4 text-green-600 flex items-center justify-center gap-1 hover:bg-green-100 px-4 py-2 rounded transition-colors font-medium w-full sm:w-auto"><RefreshCw size={16}/> 刷新价格</button></div>
        </div>
        
        {/* ... Rest of Body (Inclusions/Exclusions) ... */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 no-print">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                <h3 className="font-bold text-gray-700 mb-2 flex items-center gap-2"><CheckCircle size={16} className="text-green-600"/> 费用包含</h3>
                <textarea className="w-full h-32 p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm" value={settings.manualInclusions} onChange={(e) => setSettings({...settings, manualInclusions: e.target.value})} />
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                <h3 className="font-bold text-gray-700 mb-2 flex items-center gap-2"><X size={16} className="text-red-600"/> 费用不含</h3>
                <textarea className="w-full h-32 p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm" value={settings.manualExclusions} onChange={(e) => setSettings({...settings, manualExclusions: e.target.value})} />
            </div>
        </div>
      </div>

      {showAdminDashboard && currentUser && <AdminDashboard currentUser={currentUser} onClose={() => setShowAdminDashboard(false)} />}
      <ResourceDatabase 
        isOpen={isResourceOpen} onClose={() => setIsResourceOpen(false)}
        carDB={carDB} poiCities={poiCities} poiSpots={poiSpots} poiHotels={poiHotels} poiActivities={poiActivities} poiOthers={poiOthers} countryFiles={countryFiles}
        resourceFiles={resourceFiles} // NEW
        onUpdateCarDB={setCarDB} onUpdatePoiCities={setPoiCities} onUpdatePoiSpots={setPoiSpots} onUpdatePoiHotels={setPoiHotels} onUpdatePoiActivities={setPoiActivities} onUpdatePoiOthers={setPoiOthers} onUpdateCountryFiles={setCountryFiles}
        onUpdateResourceFiles={setResourceFiles} // NEW
        isReadOnly={false} 
        currentUser={currentUser}
        onActivity={handleResourceActivity}
        onForceSave={handleForceSave}
      />
      {/* ... Modals (Save, Load, AI, Chat) ... */}
      {showSaveModal && (<div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center"><div className="bg-white p-6 rounded-lg shadow-xl w-96"><h3 className="text-lg font-bold mb-4">保存行程</h3><div className="mb-4"><label className="block text-sm font-medium text-gray-700 mb-1">行程名称</label><input type="text" className="w-full border border-gray-300 rounded p-2" value={saveName} onChange={(e) => setSaveName(e.target.value)} /></div><div className="flex justify-end gap-2"><button onClick={() => setShowSaveModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">取消</button><button onClick={handleConfirmSave} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">确认保存</button></div></div></div>)}
      {showSavedList && (<div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"><div className="bg-white rounded-xl shadow-xl w-full max-w-4xl h-[80vh] flex flex-col"><div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-xl"><h3 className="font-bold text-lg flex items-center gap-2"><Library size={20}/> 我的行程库</h3><button onClick={() => setShowSavedList(false)}><X size={24} className="text-gray-400 hover:text-gray-600"/></button></div><div className="p-4 border-b bg-white"><div className="relative"><Search size={16} className="absolute left-3 top-3 text-gray-400"/><input type="text" className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg" placeholder="搜索..." value={tripSearchTerm} onChange={(e) => setTripSearchTerm(e.target.value)} /></div></div><div className="flex-1 overflow-auto p-4 bg-gray-50"><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{savedTrips.filter(t => (isSuperAdmin || t.isPublic || t.createdBy === currentUser?.username || (!t.createdBy && true)) && (t.name.includes(tripSearchTerm) || t.settings.destinations.join('').includes(tripSearchTerm))).map(trip => (<div key={trip.id} onClick={() => handleLoadTrip(trip)} className="bg-white p-4 rounded-lg border border-gray-200 hover:shadow-md cursor-pointer transition-shadow group relative"><div className="flex justify-between items-start mb-2"><h4 className="font-bold text-blue-700 line-clamp-1">{trip.name}</h4>{(isSuperAdmin || trip.createdBy === currentUser?.username) && (<button onClick={(e) => { e.stopPropagation(); if(window.confirm(`确认删除?`)) setSavedTrips(savedTrips.filter(t => t.id !== trip.id)); }} className="text-gray-300 hover:text-red-500 p-1"><Trash2 size={14}/></button>)}</div><div className="text-xs text-gray-500 space-y-1"><p>{trip.rows.length}天</p><p>{trip.createdBy || 'Unknown'} {trip.isPublic ? '(公有)' : '(私有)'}</p></div></div>))}</div></div></div></div>)}
      
      {showAIModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-purple-600 to-indigo-600 text-white">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                        <Sparkles size={24} className="text-yellow-300"/> AI 智能规划助手
                    </h3>
                    <p className="text-purple-100 text-sm mt-1">
                        基于您的资源库和历史数据，为您生成或优化行程。
                    </p>
                </div>
                
                <div className="p-6 flex-1 overflow-y-auto">
                    <div className="space-y-4">
                        <div className="bg-purple-50 p-4 rounded-lg border border-purple-100">
                             <h4 className="font-bold text-purple-800 text-sm mb-2 leading-relaxed">
                                我叫星艾，是一个专业的旅行定制师，我的优点是懂您，懂行程。懂成本。您可以这样问我：
                             </h4>
                             <ul className="text-xs text-purple-700 space-y-1 list-disc list-inside">
                                 <li>“摩洛哥8天，卡萨布兰卡进出，3位，两个房间。”</li>
                                 <li>“南美阿根廷，智利，巴西三国，去马丘比丘，普诺，圣保罗，伊瓜苏，玛瑙斯，20天，2位，利马进，布宜诺斯艾力斯出”</li>
                                 <li>“春节6天，我要去避寒，北京往返，帮我找一个国家，设计行程。”</li>
                             </ul>
                             <div className="mt-3 pt-3 border-t border-purple-200 text-xs text-purple-800 font-medium">
                                使用的任何问题，可以联系联系我的父亲：微信 13917643020
                             </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">您的需求指令</label>
                            <textarea 
                                className="w-full h-32 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                                placeholder="请输入您的具体需求..."
                                value={aiPromptInput}
                                onChange={(e) => setAiPromptInput(e.target.value)}
                            />
                        </div>
                        
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                            <Info size={12}/>
                            <span>AI 将优先使用您资源库中已有的酒店、景点和活动。</span>
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                    <button onClick={() => setShowAIModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors">取消</button>
                    <button onClick={handleAIPlanning} disabled={isGenerating || !aiPromptInput.trim()} className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
                        {isGenerating ? <Loader2 size={16} className="animate-spin"/> : <Wand2 size={16}/>}
                        {isGenerating ? '正在思考中...' : '开始生成'}
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* --- Floating Chat Widget --- */}
      <div className="fixed bottom-6 right-6 z-[90] flex flex-col items-end gap-4 no-print">
          {isChatOpen && (
              <div className="w-[95vw] sm:w-[900px] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col animate-fade-in-up" style={{height: '800px', maxHeight: '90vh'}}>
                  {/* Chat Header */}
                  <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 text-white flex justify-between items-center shrink-0">
                      <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                              <Sparkles size={16} className="text-yellow-300"/>
                          </div>
                          <div>
                              <h4 className="font-bold text-sm">星艾旅行助手</h4>
                              <p className="text-[10px] text-blue-100 opacity-90">支持图片/文件分析与修改 (Max 10MB)，随时问我</p>
                          </div>
                      </div>
                      <button onClick={() => setIsChatOpen(false)} className="text-white/80 hover:text-white p-1 hover:bg-white/10 rounded transition-colors">
                          <Minimize2 size={18}/>
                      </button>
                  </div>

                  {/* Chat Messages */}
                  <div className="flex-1 overflow-y-auto p-4 bg-gray-50 space-y-4">
                      {chatMessages.map((msg, idx) => (
                          <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                              {/* Attachment Preview in Message History */}
                              {msg.attachment && (
                                  <div className="mb-1 max-w-[200px]">
                                      {msg.attachment.startsWith('data:image') ? (
                                          <img src={msg.attachment} alt="attachment" className="rounded-lg shadow-sm border border-gray-200 max-h-40 object-cover" />
                                      ) : (
                                          <div className="bg-gray-100 border border-gray-200 rounded-lg p-3 flex items-center gap-2 text-sm text-gray-600">
                                              <FileText size={20}/> 文件已发送
                                          </div>
                                      )}
                                  </div>
                              )}
                              <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm whitespace-pre-wrap ${
                                  msg.role === 'user' 
                                  ? 'bg-blue-600 text-white rounded-tr-none' 
                                  : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'
                              }`}>
                                  {msg.text}
                              </div>
                              {/* Model Generated Images */}
                              {msg.responseImages && msg.responseImages.length > 0 && (
                                  <div className="mt-2 grid grid-cols-2 gap-2 max-w-[85%]">
                                      {msg.responseImages.map((imgBase64, imgIdx) => (
                                          <img key={imgIdx} src={`data:image/png;base64,${imgBase64}`} alt="AI Generated" className="rounded-lg shadow-sm border border-gray-200 object-cover w-full h-auto" />
                                      ))}
                                  </div>
                              )}
                          </div>
                      ))}
                      {isChatLoading && (
                          <div className="flex justify-start">
                              <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-none px-4 py-3 shadow-sm">
                                  <div className="flex gap-1">
                                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></span>
                                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></span>
                                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></span>
                                  </div>
                              </div>
                          </div>
                      )}
                      <div ref={chatEndRef} />
                  </div>

                  {/* Attachment Preview Area */}
                  {chatAttachment && (
                      <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                          <div className="flex items-center gap-2 overflow-hidden">
                              {chatAttachment.mimeType.startsWith('image/') ? (
                                  <img src={chatAttachment.previewUrl} alt="preview" className="h-10 w-10 object-cover rounded border border-gray-200"/>
                              ) : (
                                  <div className="h-10 w-10 bg-gray-200 rounded flex items-center justify-center text-gray-500"><FileText size={20}/></div>
                              )}
                              <div className="flex flex-col truncate">
                                  <span className="text-xs font-medium text-gray-700 truncate max-w-[150px]">已选择文件</span>
                                  <span className="text-[10px] text-gray-400">{chatAttachment.mimeType}</span>
                              </div>
                          </div>
                          <button onClick={() => { setChatAttachment(null); if(chatFileRef.current) chatFileRef.current.value=''; }} className="p-1 hover:bg-gray-200 rounded-full text-gray-500">
                              <X size={16}/>
                          </button>
                      </div>
                  )}

                  {/* Chat Input */}
                  <div className="p-3 bg-white border-t border-gray-100 shrink-0">
                      <div className="relative flex items-center gap-2">
                          <input type="file" ref={chatFileRef} className="hidden" onChange={handleChatFileSelect} accept="image/*,application/pdf,text/plain" />
                          <button onClick={() => chatFileRef.current?.click()} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors" title="上传图片或文件"><Paperclip size={20}/></button>
                          
                          <input 
                              type="text" 
                              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all shadow-inner"
                              placeholder="输入问题或粘贴图片..."
                              value={chatInput}
                              onChange={(e) => setChatInput(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                              onPaste={handleChatPaste}
                              disabled={isChatLoading}
                          />
                          <button onClick={handleSendChat} disabled={(!chatInput.trim() && !chatAttachment) || isChatLoading} className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:bg-gray-300 transition-colors shadow-sm">
                              {isChatLoading ? <Loader2 size={16} className="animate-spin"/> : <Send size={16} className="ml-0.5"/>}
                          </button>
                      </div>
                  </div>
              </div>
          )}

          {!isChatOpen && (
              <button onClick={() => setIsChatOpen(true)} className="group flex items-center justify-center w-14 h-14 bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-full shadow-lg hover:shadow-2xl hover:scale-110 transition-all duration-300 relative">
                  <MessageCircle size={28} className="group-hover:rotate-12 transition-transform duration-300"/>
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white"></span>
              </button>
          )}
      </div>
    </div>
  );
}
