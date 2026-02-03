import { CarCostEntry, PoiCity, PoiSpot, PoiHotel, PoiActivity, ResourceDocument } from '../types';
import { getAuthToken } from './apiClient';

const API_BASE = '/api/resources';

const fetchJson = async (url: string, options: RequestInit = {}) => {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
  return res.json();
};

export const resourceApi = {
  listCountries: (params: { search?: string; page?: number; size?: number; scope?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.search) q.set('search', params.search);
    if (params.scope) q.set('scope', params.scope);
    q.set('page', (params.page || 1).toString());
    q.set('size', (params.size || 100).toString());
    return fetchJson(`${API_BASE}/countries?${q.toString()}`);
  },
  listCities: (params: { country?: string; search?: string; page?: number; size?: number; scope?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.country) q.set('country', params.country);
    if (params.search) q.set('search', params.search);
    if (params.scope) q.set('scope', params.scope);
    q.set('page', (params.page || 1).toString());
    q.set('size', (params.size || 100).toString());
    return fetchJson(`${API_BASE}/cities?${q.toString()}`);
  },
  createCity: (data: Partial<PoiCity>) => fetchJson(`${API_BASE}/cities`, { method: 'POST', body: JSON.stringify(data) }),
  updateCity: (id: string, data: Partial<PoiCity>) => fetchJson(`${API_BASE}/cities/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCity: (id: string) => fetchJson(`${API_BASE}/cities/${id}`, { method: 'DELETE' }),

  listSpots: (params: { city_id?: string; city_name?: string[]; search?: string; page?: number; size?: number; scope?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.city_id) q.set('city_id', params.city_id);
    if (params.city_name) params.city_name.forEach((n) => q.append('city_name', n));
    if (params.search) q.set('search', params.search);
    if (params.scope) q.set('scope', params.scope);
    q.set('page', (params.page || 1).toString());
    q.set('size', (params.size || 100).toString());
    return fetchJson(`${API_BASE}/spots?${q.toString()}`);
  },
  createSpot: (data: Partial<PoiSpot>) => fetchJson(`${API_BASE}/spots`, { method: 'POST', body: JSON.stringify(data) }),
  updateSpot: (id: string, data: Partial<PoiSpot>) => fetchJson(`${API_BASE}/spots/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSpot: (id: string) => fetchJson(`${API_BASE}/spots/${id}`, { method: 'DELETE' }),

  listHotels: (params: { city_id?: string; city_name?: string[]; search?: string; page?: number; size?: number; scope?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.city_id) q.set('city_id', params.city_id);
    if (params.city_name) params.city_name.forEach((n) => q.append('city_name', n));
    if (params.search) q.set('search', params.search);
    if (params.scope) q.set('scope', params.scope);
    q.set('page', (params.page || 1).toString());
    q.set('size', (params.size || 100).toString());
    return fetchJson(`${API_BASE}/hotels?${q.toString()}`);
  },
  createHotel: (data: Partial<PoiHotel>) => fetchJson(`${API_BASE}/hotels`, { method: 'POST', body: JSON.stringify(data) }),
  updateHotel: (id: string, data: Partial<PoiHotel>) => fetchJson(`${API_BASE}/hotels/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteHotel: (id: string) => fetchJson(`${API_BASE}/hotels/${id}`, { method: 'DELETE' }),

  listActivities: (params: { city_id?: string; city_name?: string[]; search?: string; page?: number; size?: number; scope?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.city_id) q.set('city_id', params.city_id);
    if (params.city_name) params.city_name.forEach((n) => q.append('city_name', n));
    if (params.search) q.set('search', params.search);
    if (params.scope) q.set('scope', params.scope);
    q.set('page', (params.page || 1).toString());
    q.set('size', (params.size || 100).toString());
    return fetchJson(`${API_BASE}/activities?${q.toString()}`);
  },
  createActivity: (data: Partial<PoiActivity>) => fetchJson(`${API_BASE}/activities`, { method: 'POST', body: JSON.stringify(data) }),
  updateActivity: (id: string, data: Partial<PoiActivity>) => fetchJson(`${API_BASE}/activities/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteActivity: (id: string) => fetchJson(`${API_BASE}/activities/${id}`, { method: 'DELETE' }),


  listDocuments: (params: { category?: string; country?: string; city_id?: string } = {}): Promise<ResourceDocument[]> => {
    const q = new URLSearchParams();
    if (params.category) q.set('category', params.category);
    if (params.country) q.set('country', params.country);
    if (params.city_id) q.set('city_id', params.city_id);
    return fetchJson(`${API_BASE}/documents?${q.toString()}`);
  },
  uploadDocument: async (payload: { file: File; category: string; country: string; cityId?: string; note?: string; title?: string }): Promise<ResourceDocument> => {
    const token = getAuthToken();
    const form = new FormData();
    form.append('file', payload.file);
    form.append('category', payload.category);
    form.append('country', payload.country);
    if (payload.cityId) form.append('city_id', payload.cityId);
    if (payload.note) form.append('note', payload.note);
    if (payload.title) form.append('title', payload.title);
    const res = await fetch(`${API_BASE}/documents`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
    });
    if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
    return res.json();
  },
  listTransports: (params: { region?: string; search?: string; page?: number; size?: number; scope?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.region) q.set('region', params.region);
    if (params.search) q.set('search', params.search);
    if (params.scope) q.set('scope', params.scope);
    q.set('page', (params.page || 1).toString());
    q.set('size', (params.size || 100).toString());
    return fetchJson(`${API_BASE}/transports?${q.toString()}`);
  },
  createTransport: (data: Partial<CarCostEntry>) => fetchJson(`${API_BASE}/transports`, { method: 'POST', body: JSON.stringify(data) }),
  updateTransport: (id: string, data: Partial<CarCostEntry>) => fetchJson(`${API_BASE}/transports/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTransport: (id: string) => fetchJson(`${API_BASE}/transports/${id}`, { method: 'DELETE' }),
};
