
export enum TransportType {
  PrivateCar = '包车',
  Transfer = '接送',
  Carpool = '拼车',
  PickupDropoff = '接送机',
  Plane = '飞机',
  Train = '火车',
  Ship = '船舶',
  Other = '其它'
}

export interface CostItem {
  id: string;
  name: string;
  value: number;
}

// New Interface for Detailed Transport Selection
export interface TransportItem {
  id: string;
  model: string; // Car Model Name
  serviceType?: string; // New: Service Type to disambiguate pricing
  quantity: number; // Number of cars
  priceType: 'low' | 'high'; // Season
  price: number; // Unit price used
  sourcePublic: boolean;
}

// New Interface for Detailed Hotel Selection
export interface HotelItem {
  id: string;
  name: string; // Hotel Name
  roomType: string; // Room Type
  quantity: number; // Number of rooms
  price: number; // Unit price
  sourcePublic: boolean;
}

// New Interface for General Items (Ticket, Activity, Other)
export interface GeneralItem {
  id: string;
  name: string;
  quantity: number; // Supports decimals
  price: number; // Unit price
  sourcePublic: boolean;
}

export interface DayRow {
  id: string;
  dayIndex: number; // 1-based
  date: string; // YYYY-MM-DD
  route: string; // Format: A-B-C
  
  // Transport
  transport: string[]; // Transport Types (e.g. 包车)
  transportDetails: TransportItem[]; // Replaces carModel
  
  // Hotel
  hotelDetails: HotelItem[]; // Replaces hotelName, hotelRoomType, rooms

  // Items
  ticketDetails: GeneralItem[]; // Replaces ticketName
  activityDetails: GeneralItem[]; // Replaces activityName
  otherDetails: GeneralItem[]; // Replaces otherServiceName

  description: string; 
  
  // Costs (Calculated Sums)
  transportCost: number;
  hotelCost: number; 
  ticketCost: number; 
  activityCost: number; 
  otherCost: number; 
  
  // Custom dynamic costs
  customCosts: Record<string, number>;

  // Track manual overrides
  manualCostFlags?: {
    transport?: boolean;
    hotel?: boolean;
    ticket?: boolean;
    activity?: boolean;
    other?: boolean;
  };
  
  // Source tracking for masking logic (Aggregation implies if ANY is public, treat carefully, usually simple logic: if mixed, maybe show masked?)
  // We will calculate these dynamically based on the lists.
}

export interface CustomColumn {
  id: string;
  name: string;
}

export interface SavedTrip {
  id: string;
  name: string;
  timestamp: number;
  settings: TripSettings;
  rows: DayRow[];
  customColumns: CustomColumn[];
  createdBy?: string; 
  lastModifiedBy?: string;
  isPublic?: boolean; 
}

export interface TripSettings {
  plannerName: string;
  customerName: string; 
  peopleCount: number;
  roomCount: number;
  currency: string;
  exchangeRate: number;
  destinations: string[]; 
  startDate: string;
  marginPercent: number; 
  tipPerDay: number;
  
  manualTotalPrice?: number;
  manualInclusions?: string;
  manualExclusions?: string; 
}

// Resource Database Types
export interface CarCostEntry {
  id: string;
  region: string; 
  carModel: string; 
  serviceType: string; 
  passengers: number; 
  priceLow: number; 
  priceHigh: number; 
  description?: string; 
  lastUpdated?: number; 
  createdBy?: string; 
  isPublic?: boolean; 
}

export interface PoiCity {
  id: string;
  country: string;
  name: string;
  createdBy?: string;
  isPublic?: boolean;
}

export interface PoiSpot {
  id: string;
  cityId: string;
  name: string;
  price: number;
  description?: string; 
  lastUpdated?: number; 
  createdBy?: string;
  isPublic?: boolean;
}

export interface PoiHotel {
  id: string;
  cityId: string;
  name: string;
  roomType: string;
  price: number;
  description?: string; 
  lastUpdated?: number; 
  createdBy?: string;
  isPublic?: boolean;
}

export interface PoiActivity {
  id: string;
  cityId: string;
  name: string;
  price: number;
  description?: string; 
  lastUpdated?: number; 
  createdBy?: string;
  isPublic?: boolean;
}

export interface PoiOther {
  id: string;
  country: string; 
  name: string;
  price: number;
  description?: string; 
  lastUpdated?: number; 
  createdBy?: string;
  isPublic?: boolean;
}

export interface CountryFile {
  id: string;
  country: string;
  name: string;
  type: string; 
  size: number;
  data: string; 
  uploadDate: number;
  createdBy?: string;
  isPublic?: boolean;
}

// NEW: Generic Resource File for Document Uploads
export interface ResourceFile {
  id: string;
  country: string;
  category: 'country' | 'transport' | 'hotel' | 'spot' | 'activity' | 'other';
  fileName: string;
  fileType: string; // mime type
  fileSize: number;
  data: string; // Base64 content
  description: string; // Remarks
  uploadedBy: string;
  uploadTime: number;
}

export interface ResourceMetadata {
  lastUpdated: number;
  updatedBy: string;
}

export type UserRole = 'super_admin' | 'admin' | 'user';

export interface User {
  username: string;
  password: string; 
  role: UserRole;
  createdAt: number;
}

export interface AuditLog {
  id: string;
  timestamp: number;
  username: string;
  action: string; 
  details: string;
}
