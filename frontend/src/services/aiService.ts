import { apiPost } from './apiClient';

export interface ItineraryItem {
  day?: number;
  date?: string;
  route?: string;
  s_city?: string;
  e_city?: string;
  transport?: string[];
  hotelName?: string | null;
  ticketName?: string[] | string;
  activityName?: string[] | string;
  description?: string | null;
}

export interface ItineraryResponse {
  detectedDestinations: string[];
  itinerary: ItineraryItem[];
  reasoning?: string | null;
  error?: string | null;
}

export interface ItineraryRequest {
  currentDestinations: string[];
  currentDays: number;
  currentRows: any[];
  historyTrips: any[];
  availableCountries?: string[];
  userPrompt?: string | null;
  peopleCount?: number | null;
  roomCount?: number | null;
  startDate?: string | null;
}

export const generateItinerary = (payload: ItineraryRequest) => {
  return apiPost<ItineraryResponse>('/api/ai/itinerary', payload);
};

export const suggestHotels = (payload: { destination: string }) => {
  return apiPost<{ hotels: string[] }>('/api/ai/suggest-hotels', payload);
};
