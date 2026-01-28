
import { GoogleGenAI, Type } from "@google/genai";
import { DayRow, SavedTrip, PoiSpot, PoiHotel, PoiActivity, PoiCity, TransportItem, HotelItem, GeneralItem } from "../types";
import { generateUUID } from "../utils/dateUtils";

// Helper to safely get API key
const getApiKey = (): string => {
  try {
    if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
      return process.env.API_KEY;
    }
  } catch (e) {
    // Ignore ReferenceError if process is not defined
  }
  console.warn("API Key not found in environment.");
  return "";
};

export const suggestHotels = async (
  destination: string
): Promise<string[]> => {
  const apiKey = getApiKey();
  if (!apiKey || !destination) return [];

  const ai = new GoogleGenAI({ apiKey });

  try {
    const prompt = `
      请列出位于 "${destination}" 的5家知名酒店名称。
      只返回JSON数组。
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });

    const text = response.text;
    if (!text) return [];
    return JSON.parse(text) as string[];
  } catch (error) {
    console.error("Gemini suggestHotels error:", error);
    return [];
  }
};

export const generateFileName = async (
  plannerName: string,
  destinations: string[],
  people: number,
  days: number
): Promise<string> => {
    // Basic logic first, fall back to this if AI fails or for speed
    const base = `${plannerName}${destinations.join('')}${people}人${days}天`;
    return base;
};

export interface ItineraryItem {
  day: number;
  origin: string;
  originCountry?: string; // New: Explicit country for origin
  destination: string;
  destinationCountry?: string; // New: Explicit country for destination
  ticketName?: string;
  activityName?: string;
  hotelName?: string; // New: Hotel recommendation
  description?: string; // New: Detailed description
}

export interface AIPlanningResult {
    detectedDestinations: string[]; // Should be COUNTRIES
    itinerary: ItineraryItem[];
    reasoning?: string;
}

export const generateItinerary = async (
  destinations: string[],
  days: number
): Promise<ItineraryItem[]> => {
   return [];
};

// Helper to structure DB data for Prompt Context
const buildResourceContext = (
  cities: string[],
  poiCities: PoiCity[],
  spots: PoiSpot[],
  hotels: PoiHotel[],
  activities: PoiActivity[]
): string => {
  // Group by Country -> City
  const context: Record<string, Record<string, { hotels: string[], spots: string[], activities: string[] }>> = {};

  // We limit the context to avoid token overflow, prioritizing cities in the prompt or all if list is small.
  // For now, we dump all structured data as Flash model has large context window.
  
  poiCities.forEach(city => {
      const country = city.country || "Other";
      if (!context[country]) context[country] = {};
      
      const cityHotels = hotels.filter(h => h.cityId === city.id).map(h => h.name);
      const citySpots = spots.filter(s => s.cityId === city.id).map(s => s.name);
      const cityActs = activities.filter(a => a.cityId === city.id).map(a => a.name);

      if (cityHotels.length > 0 || citySpots.length > 0 || cityActs.length > 0) {
          context[country][city.name] = {
              hotels: cityHotels,
              spots: citySpots,
              activities: cityActs
          };
      }
  });

  return JSON.stringify(context, null, 2);
};

export const generateComprehensiveItinerary = async (
  currentDestinations: string[],
  currentDays: number,
  currentRows: DayRow[],
  historyTrips: SavedTrip[],
  // DB Resources
  availableCountries: string[], 
  availableCities: string[],
  poiCities: PoiCity[],
  poiSpots: PoiSpot[],
  poiHotels: PoiHotel[],
  poiActivities: PoiActivity[],
  // User Prompt
  userPrompt?: string 
): Promise<AIPlanningResult | null> => {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  try {
    const ai = new GoogleGenAI({ apiKey });

    // 1. Prepare Trip History Context (Training Data)
    // Safely map over history items, handling potential legacy data structure
    const historyContext = historyTrips.map(t => {
        const safeRows = t.rows || [];
        return {
            country: (t.settings && t.settings.destinations) ? t.settings.destinations.join(',') : '',
            route: safeRows.map(r => r.route).join(' -> '),
            highlights: safeRows.map(r => {
                const hotels = (r.hotelDetails || []).map(h=>h.name).join(',');
                const spots = (r.ticketDetails || []).map(t=>t.name).join(', ');
                return `Day ${r.dayIndex}: ${r.route} | Hotel: ${hotels} | Spots: ${spots}`;
            }).join('\n')
        };
    }).slice(0, 10); 

    // 2. Prepare Resource Database Context
    const dbContext = buildResourceContext(availableCities, poiCities, poiSpots, poiHotels, poiActivities);

    // 3. Serialize Current Rows for Optimization Context
    const currentItinerarySummary = currentRows.map(r => {
        const hotels = (r.hotelDetails || []).map(h=>h.name).join(',') || '未定';
        const spots = (r.ticketDetails || []).map(t=>t.name).join(',') || '无';
        const activities = (r.activityDetails || []).map(a=>a.name).join(',') || '无';
        return `Day ${r.dayIndex} (${r.date || 'N/A'}): Route=[${r.route || '未定'}], Hotel=[${hotels}], Spots=[${spots}], Activities=[${activities}], Desc=[${r.description || ''}]`;
    }).join('\n');

    let prompt = `
      作为一名资深的高端旅行定制师，请利用【资源库】和【历史行程库】为用户规划或优化行程。

      【核心原则 - 极为重要】
      1. **优先使用现有资源**：在规划路线、酒店、景点、活动时，**必须优先**从下方的【现有资源数据库】中选取完全匹配的名称。只有当数据库中没有合适的资源时，才允许自行创造或推荐新的。
      2. **参考历史行程**：请参考【历史行程范例】，学习之前的路线规划逻辑、城市连接顺序和资源搭配风格。

      【现有资源数据库 (JSON格式: 国家 -> 城市 -> 资源)】
      ${dbContext}

      【历史行程范例 (Input Corpus)】
      ${JSON.stringify(historyContext, null, 2)}

      【现有国家列表】
      ${availableCountries.join(', ')}
      
      【现有城市列表】
      ${availableCities.join(', ')}

      【当前已规划的行程 (Base Itinerary)】
      (如果是进行二次调整或优化，请基于以下内容修改，否则请忽略)
      ${currentItinerarySummary}

      【当前请求参数】
      - 原定目的地: ${currentDestinations.join(', ') || "未设定 (需从指令分析)"}
      - 计划天数: ${currentDays} 天 (如果指令中指定了天数，以指令为准)

      【用户具体指令】
      "${userPrompt}"

      【任务要求】
      1. **分析用户指令**：
         - 如果用户意图是“优化”、“调整”、“增加”、“修改”，请在【当前已规划的行程】基础上进行调整，保留原有合理部分，只修改用户提到的部分。
         - 如果用户意图是“新行程”、“重新规划”，则忽略当前行程，重新生成。
         - 确定目的地国家和城市。
      2. **生成行程 (JSON)**：
         - **route (路线)**: 格式为 "出发城市-到达城市"。出发城市必须是上一天的到达城市。**城市名称必须严格匹配【现有城市列表】中的名称（包含中英文括号）**。
         - **hotelName (酒店)**: **必须优先**从【现有资源数据库】对应城市的 "hotels" 列表中选取。
         - **ticketName (门票)**: 多个景点用逗号分隔。**必须优先**从对应城市的 "spots" 列表中选取。
         - **activityName (活动)**: 多个活动用逗号分隔。**必须优先**从对应城市的 "activities" 列表中选取。
         - **description**: 详细的每日安排、交通建议、餐饮推荐。
      
      请返回一个 JSON 对象。
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            detectedDestinations: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "List of countries identified."
            },
            itinerary: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        day: { type: Type.INTEGER },
                        origin: { type: Type.STRING, description: "Origin city. STRICTLY use exact name from DB if available." },
                        originCountry: { type: Type.STRING },
                        destination: { type: Type.STRING, description: "Destination city. STRICTLY use exact name from DB if available." },
                        destinationCountry: { type: Type.STRING },
                        ticketName: { type: Type.STRING, description: "Comma separated spot names. Pick from DB." },
                        activityName: { type: Type.STRING, description: "Comma separated activity names. Pick from DB." },
                        hotelName: { type: Type.STRING, description: "Hotel name. Pick from DB." },
                        description: { type: Type.STRING }
                    },
                    required: ["day", "origin", "destination", "description"]
                }
            }
          }
        }
      }
    });

    const text = response.text;
    if (!text) return null;
    return JSON.parse(text) as AIPlanningResult;
  } catch (error) {
    console.error("Gemini generateComprehensiveItinerary error:", error);
    // Returning null here allows App.tsx to handle the "failure" case.
    // However, if we threw, App.tsx catches and shows 'Request Failed'.
    // If we return null, App.tsx shows 'AI failed to generate'.
    // The previous error was likely due to a crash in the code BEFORE this try block (e.g. mapping old data).
    // Now that the whole logic is wrapped in try/catch, any data error will be caught here.
    return null;
  }
};
