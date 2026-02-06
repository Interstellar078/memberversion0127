import { SavedTrip, CarCostEntry, PoiCity, PoiSpot, PoiHotel, PoiActivity, PoiRestaurant, PoiOther, CountryFile, User, ResourceMetadata } from '../types';
import { apiGet, apiPut, apiPost } from './apiClient';
import { resourceApi } from './resourceApi';

type ChatRole = 'user' | 'assistant' | 'system';
type ChatMessageRecord = {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: number;
};

const KEYS = {
  DB_CARS: 'travel_builder_db_cars',
  DB_CITIES: 'travel_builder_db_poi_cities',
  DB_SPOTS: 'travel_builder_db_poi_spots',
  DB_HOTELS: 'travel_builder_db_poi_hotels_v2',
  DB_ACTIVITIES: 'travel_builder_db_poi_activities',
  DB_OTHERS: 'travel_builder_db_poi_others',
  DB_FILES: 'travel_builder_db_country_files',
  DB_METADATA: 'travel_builder_db_metadata',
  HISTORY: 'travel_builder_history',
  LOCATIONS: 'travel_builder_locations_history',
  SETTINGS_GLOBAL: 'travel_builder_settings_global',
  SYSTEM_CONFIG: 'travel_builder_system_config',
  AI_CHAT_PREFIX: 'travel_builder_ai_chat'
};

let currentUser: User | null = null;

const mapOwner = <T extends { ownerId?: string; owner_id?: string; isPublic?: boolean; is_public?: boolean }>(item: T) => ({
  ...item,
  createdBy: item.ownerId ?? (item as any).owner_id,
  isPublic: item.isPublic ?? (item as any).is_public
});

const getData = async <T>(key: string, fallback: T, scope?: 'public' | 'private'): Promise<T> => {
  try {
    const url = scope
      ? `/api/data/${encodeURIComponent(key)}?scope=${scope}`
      : `/api/data/${encodeURIComponent(key)}`;
    const data = await apiGet<{ key: string; value: T }>(url);
    return data?.value ?? fallback;
  } catch {
    return fallback;
  }
};

const setData = async <T>(key: string, value: T, isPublic = false): Promise<void> => {
  await apiPut(`/api/data/${encodeURIComponent(key)}`, { value, is_public: isPublic });
};

const mergeLists = <T extends { id?: string }>(pub: T[], priv: T[]): T[] => {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of [...priv, ...pub]) {
    if (item && item.id) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
    }
    result.push(item);
  }
  return result;
};

const splitByPublic = <T extends { isPublic?: boolean }>(items: T[]) => {
  const pub: T[] = [];
  const priv: T[] = [];
  for (const item of items) {
    if (item?.isPublic) pub.push(item);
    else priv.push(item);
  }
  return { pub, priv };
};

const toSafeChatMessages = (value: unknown): ChatMessageRecord[] => {
  const source = Array.isArray(value)
    ? value
    : (value && typeof value === 'object' && Array.isArray((value as any).messages))
      ? (value as any).messages
      : [];
  return source
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => {
      const role = item.role === 'assistant' || item.role === 'system' ? item.role : 'user';
      const content = typeof item.content === 'string' ? item.content : '';
      const timestamp = Number.isFinite(Number(item.timestamp)) ? Number(item.timestamp) : Date.now();
      const id = typeof item.id === 'string' && item.id.trim().length > 0
        ? item.id
        : `${role}-${timestamp}`;
      return { id, role, content, timestamp };
    })
    .filter((item) => item.content.trim().length > 0);
};

export const StorageService = {
  setCurrentUser(user: User | null) {
    currentUser = user;
  },

  async getCars(): Promise<CarCostEntry[]> {
    if (!currentUser) return [];
    const items = await resourceApi.listTransports({ page: 1, size: 5000 });
    return (items || []).map(mapOwner) as CarCostEntry[];
  },
  async getCities(): Promise<PoiCity[]> {
    if (!currentUser) return [];
    const items = await resourceApi.listCities({ page: 1, size: 5000 });
    return (items || []).map(mapOwner) as PoiCity[];
  },
  async getSpots(): Promise<PoiSpot[]> {
    if (!currentUser) return [];
    const items = await resourceApi.listSpots({ page: 1, size: 5000 });
    return (items || []).map(mapOwner) as PoiSpot[];
  },
  async getHotels(): Promise<PoiHotel[]> {
    if (!currentUser) return [];
    const items = await resourceApi.listHotels({ page: 1, size: 5000 });
    return (items || []).map(mapOwner) as PoiHotel[];
  },
  async getActivities(): Promise<PoiActivity[]> {
    if (!currentUser) return [];
    const items = await resourceApi.listActivities({ page: 1, size: 5000 });
    return (items || []).map(mapOwner) as PoiActivity[];
  },
  async getOthers(): Promise<PoiOther[]> {
    if (!currentUser) {
      return getData<PoiOther[]>(KEYS.DB_OTHERS, [], 'public');
    }
    const [pub, priv] = await Promise.all([
      getData<PoiOther[]>(KEYS.DB_OTHERS, [], 'public'),
      getData<PoiOther[]>(KEYS.DB_OTHERS, [], 'private')
    ]);
    return mergeLists(pub, priv);
  },
  async getFiles(): Promise<CountryFile[]> {
    if (!currentUser) {
      return getData<CountryFile[]>(KEYS.DB_FILES, [], 'public');
    }
    const [pub, priv] = await Promise.all([
      getData<CountryFile[]>(KEYS.DB_FILES, [], 'public'),
      getData<CountryFile[]>(KEYS.DB_FILES, [], 'private')
    ]);
    return mergeLists(pub, priv);
  },
  async getTrips(): Promise<SavedTrip[]> {
    if (!currentUser) return [] as SavedTrip[];
    return getData(KEYS.HISTORY, [] as SavedTrip[], 'private');
  },
  async getLocations(): Promise<string[]> {
    if (!currentUser) return [] as string[];
    return getData(KEYS.LOCATIONS, [], 'private');
  },

  async getResourceMetadata(): Promise<ResourceMetadata | null> {
    return getData(KEYS.DB_METADATA, null, 'public');
  },
  async saveResourceMetadata(meta: ResourceMetadata): Promise<void> {
    await setData(KEYS.DB_METADATA, meta, true);
  },

  async getSystemConfig(): Promise<{ defaultMargin: number }> {
    return getData(KEYS.SYSTEM_CONFIG, { defaultMargin: 20 }, 'public');
  },
  async saveSystemConfig(config: { defaultMargin: number }): Promise<void> {
    await setData(KEYS.SYSTEM_CONFIG, config, true);
  },

  async saveCars(_data: CarCostEntry[]): Promise<void> {
    return;
  },
  async saveCities(_data: PoiCity[]): Promise<void> {
    return;
  },
  async saveSpots(_data: PoiSpot[]): Promise<void> {
    return;
  },
  async saveHotels(_data: PoiHotel[]): Promise<void> {
    return;
  },
  async saveActivities(_data: PoiActivity[]): Promise<void> {
    return;
  },
  async getRestaurants(): Promise<PoiRestaurant[]> {
    if (!currentUser) return [];
    const items = await resourceApi.listRestaurants({ page: 1, size: 5000 });
    return (items || []).map(mapOwner) as any;
  },
  async saveRestaurants(_data: PoiRestaurant[]): Promise<void> {
    return;
  },
  async saveOthers(data: PoiOther[]): Promise<void> {
    await StorageService.saveScoped(KEYS.DB_OTHERS, data);
  },
  async saveFiles(data: CountryFile[]): Promise<void> {
    await StorageService.saveScoped(KEYS.DB_FILES, data);
  },

  async saveTrips(data: SavedTrip[]): Promise<void> {
    if (!currentUser) return;
    await setData(KEYS.HISTORY, data, false);
  },
  async saveLocations(data: string[]): Promise<void> {
    if (!currentUser) return;
    await setData(KEYS.LOCATIONS, data, false);
  },

  async getAppSettings(): Promise<any> {
    if (!currentUser) return {};
    return getData(KEYS.SETTINGS_GLOBAL, {}, 'private');
  },
  async saveAppSettings(settings: any): Promise<void> {
    if (!currentUser) return;
    await setData(KEYS.SETTINGS_GLOBAL, settings, false);
  },

  async getChatMessages(conversationId: string): Promise<ChatMessageRecord[]> {
    if (!currentUser) return [];
    const key = `${KEYS.AI_CHAT_PREFIX}:${conversationId}`;
    const payload = await getData<any>(key, { messages: [] }, 'private');
    return toSafeChatMessages(payload);
  },
  async saveChatMessages(conversationId: string, messages: ChatMessageRecord[]): Promise<void> {
    if (!currentUser) return;
    const key = `${KEYS.AI_CHAT_PREFIX}:${conversationId}`;
    await setData(key, {
      version: 1,
      updatedAt: Date.now(),
      messages: toSafeChatMessages(messages),
    }, false);
  },

  async getUserProfiles(): Promise<User[]> {
    return apiGet<User[]>(`/api/admin/users`);
  },

  async saveUserProfile(_user: User): Promise<void> {
    return;
  },

  async deleteUserProfile(_username: string): Promise<void> {
    return;
  },

  async ensureAdminProfile(): Promise<void> {
    return;
  },

  async migrateLocalData(): Promise<void> {
    return;
  },

  async createBackup(): Promise<any[]> {
    return apiGet<any[]>(`/api/data`);
  },

  async restoreBackup(dump: { key: string; value: any }[]): Promise<void> {
    await apiPost(`/api/data/restore`, { items: dump });
  },

  async saveScoped<T extends { isPublic?: boolean }>(key: string, items: T[]): Promise<void> {
    if (!currentUser) return;
    const { pub, priv } = splitByPublic(items);
    const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'super_admin';
    if (isAdmin) {
      await setData(key, priv, false);
      await setData(key, pub, true);
      return;
    }
    await setData(key, items, false);
  }
};
