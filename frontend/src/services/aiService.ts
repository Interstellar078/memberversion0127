import { apiPost } from './apiClient';

export interface ItineraryItem {
  day?: number;
  date?: string;
  route?: string;
  s_city?: string;
  e_city?: string;
  transport?: string[];
  hotelName?: string | null;
  hotelId?: string | null;
  ticketName?: string[] | string;
  ticketIds?: string[] | null;
  activityName?: string[] | string;
  activityIds?: string[] | null;
  description?: string | null;
  transportIds?: string[] | null;
  hotelCost?: number | null;
  ticketCost?: number | null;
  activityCost?: number | null;
  transportCost?: number | null;
  otherCost?: number | null;
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
  conversationId?: string | null;
  chatHistory?: { role: string; content: string }[];
}

export const generateItinerary = (payload: ItineraryRequest) => {
  return apiPost<ItineraryResponse>('/api/ai/itinerary', payload);
};

export const suggestHotels = (payload: { destination: string }) => {
  return apiPost<{ hotels: string[] }>('/api/ai/suggest-hotels', payload);
};
