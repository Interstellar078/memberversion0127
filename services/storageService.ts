
import { SavedTrip, CarCostEntry, PoiCity, PoiSpot, PoiHotel, PoiActivity, PoiOther, CountryFile, User, ResourceMetadata, ResourceFile } from '../types';
import { SupabaseManager } from './supabaseClient';

const KEYS = {
  DB_CARS: 'travel_builder_db_cars',
  DB_CITIES: 'travel_builder_db_poi_cities',
  DB_SPOTS: 'travel_builder_db_poi_spots',
  DB_HOTELS: 'travel_builder_db_poi_hotels_v2',
  DB_ACTIVITIES: 'travel_builder_db_poi_activities',
  DB_OTHERS: 'travel_builder_db_poi_others', 
  DB_FILES: 'travel_builder_db_country_files', // Legacy country maps
  DB_RESOURCE_FILES: 'travel_builder_db_resource_files', // New Documents
  DB_METADATA: 'travel_builder_db_metadata', 
  HISTORY: 'travel_builder_history',
  LOCATIONS: 'travel_builder_locations_history',
  SETTINGS_GLOBAL: 'travel_builder_settings_global',
  SYSTEM_CONFIG: 'travel_builder_system_config'
};

const db = {
    get: async <T>(key: string, defaultValue: T): Promise<T> => {
        const client = SupabaseManager.getClient();
        if (!client) return defaultValue;

        try {
            const { data, error } = await client
                .from('app_data')
                .select('value, updated_at')
                .eq('key', key)
                .order('updated_at', { ascending: false }); 
            
            if (error) {
                console.error(`Database error fetching ${key}:`, error);
                return defaultValue;
            }
            
            if (!data || data.length === 0) return defaultValue;

            if (Array.isArray(defaultValue)) {
                 let merged: any[] = [];
                 data.forEach(row => {
                     if (Array.isArray(row.value)) {
                         merged = [...merged, ...row.value];
                     }
                 });
                 const seenIds = new Set();
                 const uniqueMerged = merged.filter((item: any) => {
                     if (item && item.id) {
                         if (seenIds.has(item.id)) return false;
                         seenIds.add(item.id);
                         return true;
                     }
                     return true;
                 });
                 
                 if (data.length > 0 && uniqueMerged.length === 0 && merged.length > 0) return merged as T; 
                 if (uniqueMerged.length > 0) return uniqueMerged as T;
            }

            const latestVal = data[0].value;
            if (latestVal === null || latestVal === undefined) return defaultValue;
            
            return latestVal as T;

        } catch (e: any) {
            console.error(`System error fetching ${key}`, e);
            return defaultValue;
        }
    },

    set: async <T>(key: string, value: T): Promise<void> => {
        const client = SupabaseManager.getClient();
        if (!client) throw new Error("No cloud connection");

        try {
            const { error } = await client
                .from('app_data')
                .upsert({ 
                    key, 
                    value: value as any, 
                    updated_at: new Date().toISOString() 
                }, { onConflict: 'key' });
                
            if (error) throw error;
        } catch (e) {
            console.error(`Error saving ${key}`, e);
            throw e;
        }
    },

    delete: async (key: string): Promise<void> => {
        const client = SupabaseManager.getClient();
        if (!client) return;
        await client.from('app_data').delete().eq('key', key);
    }
};

export const StorageService = {
  // --- Core Data ---
  async getCars(): Promise<CarCostEntry[]> { return db.get(KEYS.DB_CARS, []); },
  async getCities(): Promise<PoiCity[]> { return db.get(KEYS.DB_CITIES, []); },
  async getSpots(): Promise<PoiSpot[]> { return db.get(KEYS.DB_SPOTS, []); },
  async getHotels(): Promise<PoiHotel[]> { return db.get(KEYS.DB_HOTELS, []); },
  async getActivities(): Promise<PoiActivity[]> { return db.get(KEYS.DB_ACTIVITIES, []); },
  async getOthers(): Promise<PoiOther[]> { return db.get(KEYS.DB_OTHERS, []); }, 
  async getFiles(): Promise<CountryFile[]> { return db.get(KEYS.DB_FILES, []); },
  async getResourceFiles(): Promise<ResourceFile[]> { return db.get(KEYS.DB_RESOURCE_FILES, []); }, // New
  async getTrips(): Promise<SavedTrip[]> { return db.get(KEYS.HISTORY, []); },
  async getLocations(): Promise<string[]> { return db.get(KEYS.LOCATIONS, []); },
  
  async getResourceMetadata(): Promise<ResourceMetadata | null> { return db.get(KEYS.DB_METADATA, null); },
  async saveResourceMetadata(meta: ResourceMetadata): Promise<void> { return db.set(KEYS.DB_METADATA, meta); },

  async getSystemConfig(): Promise<{ defaultMargin: number }> { return db.get(KEYS.SYSTEM_CONFIG, { defaultMargin: 20 }); },
  async saveSystemConfig(config: { defaultMargin: number }): Promise<void> { return db.set(KEYS.SYSTEM_CONFIG, config); },

  async saveCars(data: CarCostEntry[]): Promise<void> { return db.set(KEYS.DB_CARS, data); },
  async saveCities(data: PoiCity[]): Promise<void> { return db.set(KEYS.DB_CITIES, data); },
  async saveSpots(data: PoiSpot[]): Promise<void> { return db.set(KEYS.DB_SPOTS, data); },
  async saveHotels(data: PoiHotel[]): Promise<void> { return db.set(KEYS.DB_HOTELS, data); },
  async saveActivities(data: PoiActivity[]): Promise<void> { return db.set(KEYS.DB_ACTIVITIES, data); },
  async saveOthers(data: PoiOther[]): Promise<void> { return db.set(KEYS.DB_OTHERS, data); }, 
  async saveFiles(data: CountryFile[]): Promise<void> { return db.set(KEYS.DB_FILES, data); },
  async saveResourceFiles(data: ResourceFile[]): Promise<void> { return db.set(KEYS.DB_RESOURCE_FILES, data); }, // New
  async saveTrips(data: SavedTrip[]): Promise<void> { return db.set(KEYS.HISTORY, data); },
  async saveLocations(data: string[]): Promise<void> { return db.set(KEYS.LOCATIONS, data); },

  // --- User Profiles ---
  async getUserProfiles(): Promise<User[]> {
    const client = SupabaseManager.getClient();
    if (!client) return [];
    const { data } = await client.from('app_data').select('value').like('key', 'user_profile_%');
    return data?.map(d => d.value) || [];
  },

  async saveUserProfile(user: User): Promise<void> {
    return db.set(`user_profile_${user.username}`, user);
  },

  async deleteUserProfile(username: string): Promise<void> {
    return db.delete(`user_profile_${username}`);
  },
  
  async ensureAdminProfile(): Promise<void> {
      const adminKey = 'user_profile_admin';
      const existing = await db.get<User | null>(adminKey, null);
      if (!existing) {
          const adminUser: User = {
              username: 'admin',
              password: '', 
              role: 'super_admin', 
              createdAt: Date.now()
          };
          console.log("Bootstrapping Super Admin User Profile...");
          await db.set(adminKey, adminUser);
      }
  },

  // --- App Settings ---
  async getAppSettings(): Promise<any> {
    return db.get(KEYS.SETTINGS_GLOBAL, {});
  },

  async saveAppSettings(settings: any): Promise<void> {
    return db.set(KEYS.SETTINGS_GLOBAL, settings);
  },

  async migrateLocalData(): Promise<void> {
      console.log("Checking for local data migration...");
      const client = SupabaseManager.getClient();
      if (!client) return;

      const keysToMigrate = [
          KEYS.DB_CARS,
          KEYS.DB_CITIES,
          KEYS.DB_SPOTS,
          KEYS.DB_HOTELS,
          KEYS.DB_ACTIVITIES,
          KEYS.DB_OTHERS,
          KEYS.DB_RESOURCE_FILES,
          KEYS.HISTORY,
          KEYS.LOCATIONS,
          KEYS.SETTINGS_GLOBAL,
          KEYS.SYSTEM_CONFIG
      ];

      for (const key of keysToMigrate) {
          try {
              const { data, error } = await client.from('app_data').select('key').eq('key', key).limit(1);
              
              const exists = data && data.length > 0;

              if (!exists) {
                  const localJson = localStorage.getItem(key);
                  if (localJson) {
                      const localData = JSON.parse(localJson);
                      if (localData && (Array.isArray(localData) ? localData.length > 0 : Object.keys(localData).length > 0)) {
                          console.log(`Migrating ${key} from LocalStorage to Cloud...`);
                          await db.set(key, localData);
                      }
                  }
              }
          } catch (e) {
              console.error(`Migration failed for ${key}`, e);
          }
      }
  },

  createBackup: async (): Promise<any[]> => {
    const client = SupabaseManager.getClient();
    if (!client) return [];
    const { data, error } = await client.from('app_data').select('*');
    if (error) throw error;
    return data || [];
  },

  restoreBackup: async (dump: { key: string; value: any }[]): Promise<void> => {
      const client = SupabaseManager.getClient();
      if (!client) throw new Error("No cloud connection");
      
      if (!Array.isArray(dump) || dump.length === 0) return;

      const payload = dump.map(d => ({
          key: d.key,
          value: d.value,
          updated_at: new Date().toISOString()
      }));

      const { error } = await client.from('app_data').upsert(payload, { onConflict: 'key' });
      if (error) throw error;
  }
};
