import { SavedTrip, CarCostEntry, PoiCity, PoiSpot, PoiHotel, PoiActivity, PoiOther, CountryFile, User, ResourceMetadata } from '../types';
import { apiGet, apiPut, apiPost } from './apiClient';

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
  SYSTEM_CONFIG: 'travel_builder_system_config'
};

let currentUser: User | null = null;

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

export const StorageService = {
  setCurrentUser(user: User | null) {
    currentUser = user;
  },

  async getCars(): Promise<CarCostEntry[]> {
    const [pub, priv] = await Promise.all([
      getData<CarCostEntry[]>(KEYS.DB_CARS, [], 'public'),
      getData<CarCostEntry[]>(KEYS.DB_CARS, [], 'private')
    ]);
    return mergeLists(pub, priv);
  },
  async getCities(): Promise<PoiCity[]> {
    const [pub, priv] = await Promise.all([
      getData<PoiCity[]>(KEYS.DB_CITIES, [], 'public'),
      getData<PoiCity[]>(KEYS.DB_CITIES, [], 'private')
    ]);
    return mergeLists(pub, priv);
  },
  async getSpots(): Promise<PoiSpot[]> {
    const [pub, priv] = await Promise.all([
      getData<PoiSpot[]>(KEYS.DB_SPOTS, [], 'public'),
      getData<PoiSpot[]>(KEYS.DB_SPOTS, [], 'private')
    ]);
    return mergeLists(pub, priv);
  },
  async getHotels(): Promise<PoiHotel[]> {
    const [pub, priv] = await Promise.all([
      getData<PoiHotel[]>(KEYS.DB_HOTELS, [], 'public'),
      getData<PoiHotel[]>(KEYS.DB_HOTELS, [], 'private')
    ]);
    return mergeLists(pub, priv);
  },
  async getActivities(): Promise<PoiActivity[]> {
    const [pub, priv] = await Promise.all([
      getData<PoiActivity[]>(KEYS.DB_ACTIVITIES, [], 'public'),
      getData<PoiActivity[]>(KEYS.DB_ACTIVITIES, [], 'private')
    ]);
    return mergeLists(pub, priv);
  },
  async getOthers(): Promise<PoiOther[]> {
    const [pub, priv] = await Promise.all([
      getData<PoiOther[]>(KEYS.DB_OTHERS, [], 'public'),
      getData<PoiOther[]>(KEYS.DB_OTHERS, [], 'private')
    ]);
    return mergeLists(pub, priv);
  },
  async getFiles(): Promise<CountryFile[]> {
    const [pub, priv] = await Promise.all([
      getData<CountryFile[]>(KEYS.DB_FILES, [], 'public'),
      getData<CountryFile[]>(KEYS.DB_FILES, [], 'private')
    ]);
    return mergeLists(pub, priv);
  },
  async getTrips(): Promise<SavedTrip[]> {
    return getData(KEYS.HISTORY, [] as SavedTrip[], 'private');
  },
  async getLocations(): Promise<string[]> {
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

  async saveCars(data: CarCostEntry[]): Promise<void> {
    await StorageService.saveScoped(KEYS.DB_CARS, data);
  },
  async saveCities(data: PoiCity[]): Promise<void> {
    await StorageService.saveScoped(KEYS.DB_CITIES, data);
  },
  async saveSpots(data: PoiSpot[]): Promise<void> {
    await StorageService.saveScoped(KEYS.DB_SPOTS, data);
  },
  async saveHotels(data: PoiHotel[]): Promise<void> {
    await StorageService.saveScoped(KEYS.DB_HOTELS, data);
  },
  async saveActivities(data: PoiActivity[]): Promise<void> {
    await StorageService.saveScoped(KEYS.DB_ACTIVITIES, data);
  },
  async saveOthers(data: PoiOther[]): Promise<void> {
    await StorageService.saveScoped(KEYS.DB_OTHERS, data);
  },
  async saveFiles(data: CountryFile[]): Promise<void> {
    await StorageService.saveScoped(KEYS.DB_FILES, data);
  },

  async saveTrips(data: SavedTrip[]): Promise<void> {
    await setData(KEYS.HISTORY, data, false);
  },
  async saveLocations(data: string[]): Promise<void> {
    await setData(KEYS.LOCATIONS, data, false);
  },

  async getAppSettings(): Promise<any> {
    return getData(KEYS.SETTINGS_GLOBAL, {}, 'private');
  },
  async saveAppSettings(settings: any): Promise<void> {
    await setData(KEYS.SETTINGS_GLOBAL, settings, false);
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
