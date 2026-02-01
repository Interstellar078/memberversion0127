
import { GoogleGenAI, Type } from "@google/genai";
import { DayRow, SavedTrip, PoiSpot, PoiHotel, PoiActivity, PoiCity, TransportItem, HotelItem, GeneralItem, CarCostEntry, ResourceFile } from "../types";
import { StorageService } from "./storageService";
import * as XLSX from 'xlsx';
import JSZip from 'jszip';

// Helper to safely get API key
const getApiKey = (): string => {
  try {
    if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
      return process.env.API_KEY;
    }
  } catch (e) {
    // Ignore
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

const parseDocumentContent = async (file: ResourceFile): Promise<string> => {
    try {
        const mime = file.fileType.toLowerCase();
        const name = file.fileName.toLowerCase();
        
        // 1. Text / Markdown / JSON / CSV
        if (mime.includes('text/') || mime.includes('json') || mime.includes('csv') || name.endsWith('.txt') || name.endsWith('.md') || name.endsWith('.csv') || name.endsWith('.json')) {
             try {
                // Decode Base64 to UTF-8 string
                const binaryString = atob(file.data);
                const bytes = Uint8Array.from(binaryString, c => c.charCodeAt(0));
                return `[文本文件内容: ${file.fileName}]\n${new TextDecoder().decode(bytes)}\n`;
             } catch(e) { return ""; }
        }

        // 2. Excel
        if (mime.includes('sheet') || mime.includes('excel') || name.endsWith('.xlsx') || name.endsWith('.xls')) {
            const wb = XLSX.read(file.data, { type: 'base64' });
            let content = `[Excel表格内容: ${file.fileName}]\n`;
            wb.SheetNames.forEach(sheetName => {
                const sheet = wb.Sheets[sheetName];
                const csv = XLSX.utils.sheet_to_csv(sheet);
                if (csv.length > 0) content += `--- Sheet: ${sheetName} ---\n${csv}\n`;
            });
            // Limit text size to prevent token overflow (e.g. 50k chars)
            return content.substring(0, 50000) + (content.length > 50000 ? "\n...(truncated)..." : "");
        }

        // 3. Word
        if (mime.includes('wordprocessing') || name.endsWith('.docx')) {
            const zip = new JSZip();
            const zipContent = await zip.loadAsync(file.data, { base64: true });
            if (zipContent.files['word/document.xml']) {
                const xml = await zipContent.files['word/document.xml'].async('string');
                // Basic XML text extraction (strip tags)
                let text = xml.replace(/<w:p.*?>/g, '\n').replace(/<[^>]+>/g, ' ');
                return `[Word文档内容: ${file.fileName}]\n${text.substring(0, 50000)}`;
            }
        }

    } catch (e) {
        console.warn(`Failed to parse file ${file.fileName}`, e);
    }
    return "";
};

const buildKnowledgeBaseContext = async (userQuery: string = ''): Promise<{ textContext: string; pdfParts: any[] }> => {
    try {
        const [cars, cities, spots, hotels, activities, files] = await Promise.all([
            StorageService.getCars(),
            StorageService.getCities(),
            StorageService.getSpots(),
            StorageService.getHotels(),
            StorageService.getActivities(),
            StorageService.getResourceFiles()
        ]);

        const queryLower = userQuery.toLowerCase().trim();
        const hasQuery = queryLower.length > 0;

        // Generic filter function to rank and select items based on query relevance
        const getRelevantItems = <T>(
            items: T[],
            extractFields: (item: T) => { name?: string, location?: string, type?: string, desc?: string }
        ): { item: T, score: number }[] => {
            if (!hasQuery) return items.slice(0, 5).map(i => ({ item: i, score: 1 })); 

            const scoredItems = items.map(item => {
                const { name = '', location = '', type = '', desc = '' } = extractFields(item);
                const n = name.toLowerCase();
                const l = location.toLowerCase();
                const t = type.toLowerCase();
                const d = desc.toLowerCase();
                
                let score = 0;
                if (n && (queryLower.includes(n) || n.includes(queryLower))) score += 20;
                if (l && queryLower.includes(l)) score += 10;
                if (d && d.includes(queryLower)) score += 5;
                if (t && queryLower.includes(t)) score += 2;

                return { item, score };
            });

            return scoredItems.filter(si => si.score > 0).sort((a, b) => b.score - a.score);
        };

        let context = "";
        const pdfParts: any[] = [];
        
        // --- PRIORITY 1: SYSTEM GENERATED KNOWLEDGE FILE ---
        // If the Super Admin has explicitly generated the knowledge base file, use it as the primary source.
        const systemKnowledgeFile = files.find(f => f.fileName === 'AI_Structured_Knowledge.json');
        
        if (systemKnowledgeFile) {
             context += "=== 1. 核心结构化资源库 (System Knowledge Base) ===\n";
             context += "注意：此部分数据由超级管理员生成，包含系统内所有车型、酒店、景点、活动的详细报价单。\n";
             const content = await parseDocumentContent(systemKnowledgeFile);
             context += content + "\n\n";
        } else {
            // Fallback: Dynamic Structured Data
            context += "=== 1. 结构化资源库 (Dynamic Resources) ===\n";

            const filteredCars = getRelevantItems(cars, c => ({ name: c.carModel, location: c.region, type: '车 包车 接送', desc: c.serviceType })).map(si => si.item).slice(0, 30);
            if (filteredCars.length > 0) {
                context += "[车型库]:\n";
                filteredCars.forEach(c => context += `- ${c.region} ${c.carModel} (${c.serviceType}): 淡季${c.priceLow} 旺季${c.priceHigh} (载客${c.passengers})\n`);
            }

            const filteredHotels = getRelevantItems(hotels, h => {
                const city = cities.find(c => c.id === h.cityId);
                return { name: h.name, location: (city?.name || '') + (city?.country || ''), type: '酒店 住宿 房', desc: h.roomType + ' ' + (h.description || '') };
            }).map(si => si.item).slice(0, 30);
            if (filteredHotels.length > 0) {
                context += "\n[酒店库]:\n";
                filteredHotels.forEach(h => {
                    const city = cities.find(c => c.id === h.cityId)?.name || '未知城市';
                    context += `- ${city} ${h.name} (${h.roomType}): ${h.price}元 (${(h.description || '').substring(0, 50)})\n`;
                });
            }

            const filteredSpots = getRelevantItems(spots, s => {
                const city = cities.find(c => c.id === s.cityId);
                return { name: s.name, location: (city?.name || '') + (city?.country || ''), type: '景点 门票', desc: s.description };
            }).map(si => si.item).slice(0, 30);
            if (filteredSpots.length > 0) {
                context += "\n[景点门票]:\n";
                filteredSpots.forEach(s => {
                    const city = cities.find(c => c.id === s.cityId)?.name || '未知城市';
                    context += `- ${city} ${s.name}: ${s.price}元\n`;
                });
            }

            const filteredActivities = getRelevantItems(activities, a => {
                const city = cities.find(c => c.id === a.cityId);
                return { name: a.name, location: (city?.name || '') + (city?.country || ''), type: '活动 体验', desc: a.description };
            }).map(si => si.item).slice(0, 30);
            if (filteredActivities.length > 0) {
                context += "\n[活动项目]:\n";
                filteredActivities.forEach(a => {
                    const city = cities.find(c => c.id === a.cityId)?.name || '未知城市';
                    context += `- ${city} ${a.name}: ${a.price}元\n`;
                });
            }
        }

        // --- SECTION 2: DOCUMENTS (Other Files) ---
        context += "\n=== 2. 内部文档库 (Document Content) ===\n";
        
        // Find relevant files (Exclude the system knowledge file itself)
        const relevantFileItems = getRelevantItems(
            files.filter(f => f.fileName !== 'AI_Structured_Knowledge.json'), 
            f => ({
                name: f.fileName,
                location: f.country,
                type: f.category,
                desc: f.description
            })
        );

        // Take top 3 most relevant files to parse deeply
        // or if no query, just list summary
        const topFiles = hasQuery ? relevantFileItems.slice(0, 3) : relevantFileItems.slice(0, 1); // If no query, don't parse too much

        if (relevantFileItems.length > 0) {
            context += `找到 ${relevantFileItems.length} 个相关文档。以下是高相关度文档的详细内容：\n\n`;
            
            for (const { item: file } of topFiles) {
                // Determine if we should parse text or attach as PDF
                if (file.fileType === 'application/pdf') {
                    context += `- [PDF文档] ${file.country} - "${file.fileName}": 内容已作为附件提供给AI分析。\n`;
                    pdfParts.push({
                        inlineData: {
                            data: file.data,
                            mimeType: 'application/pdf'
                        }
                    });
                } else {
                    // Try to parse text content
                    const extractedText = await parseDocumentContent(file);
                    if (extractedText) {
                        context += extractedText + "\n----------------\n";
                    } else {
                        context += `- [${file.category.toUpperCase()}] ${file.country} - "${file.fileName}": (无法解析内容) ${file.description}\n`;
                    }
                }
            }
            
            // List remaining files as summary only
            if (relevantFileItems.length > topFiles.length) {
                context += "\n其它相关文档摘要 (未读取全文):\n";
                relevantFileItems.slice(topFiles.length, topFiles.length + 5).forEach(({ item: f }) => {
                    context += `- ${f.fileName} (${f.description || '无备注'})\n`;
                });
            }
        } else {
            context += "(暂无相关文档)\n";
        }

        return { textContext: context, pdfParts };

    } catch (e) {
        console.error("Failed to build knowledge base", e);
        return { textContext: "", pdfParts: [] };
    }
};

export const askTravelAI = async (
  userQuestion: string, 
  attachment?: { data: string; mimeType: string } | null
): Promise<{ text: string; images?: string[] }> => {
  const apiKey = getApiKey();
  if (!apiKey) return { text: "系统未配置 API Key，无法回答。" };

  try {
    const ai = new GoogleGenAI({ apiKey });
    
    // Build Knowledge Base with Query filtering (returns text + pdf parts)
    const { textContext, pdfParts } = await buildKnowledgeBaseContext(userQuestion || '');

    // Construct parts
    const parts: any[] = [];
    
    // 1. Add User Attachment (Image/File)
    const isImageInput = attachment && attachment.mimeType.startsWith('image/');
    
    // Heuristic: If user uploads Image, use Image model (might ignore PDF parts if mixed?).
    let model = "gemini-3-flash-preview";
    if (isImageInput) {
        model = "gemini-2.5-flash-image";
    }

    // Add Knowledge Base PDFs (Limit to 1-2 to be safe)
    if (!isImageInput && pdfParts.length > 0) {
        parts.push(...pdfParts);
    }

    if (attachment) {
      parts.push({
        inlineData: {
          mimeType: attachment.mimeType,
          data: attachment.data 
        }
      });
    }
    
    // Add Text Prompt
    const systemInstruction = `
      你叫星艾，专业的旅行定制师助手。
      
      【回答逻辑优先级】
      1. **核心结构化资源库 (System Knowledge Base)**：最优先使用。这是管理员生成的系统级报价单，包含所有资源的准确价格、房型和描述。请基于此JSON数据回答。
      2. **内部文档库 (Document Library)**：其次查阅此处的Excel、Word或PDF内容。
      3. **通用知识**：仅当内部库中无信息时，才使用通用知识。
      
      【知识库上下文】
      ${textContext}
      
      回答必须精炼、直接。不要有任何客套话。
    `;
    
    if (userQuestion) {
      parts.push({ text: userQuestion });
    } else if (attachment) {
      parts.push({ text: "请分析这份文件或图片，并结合内部资源库告诉我相关信息。" });
    }

    const response = await ai.models.generateContent({
      model: model, 
      contents: { parts },
      config: {
        systemInstruction: systemInstruction,
      }
    });

    let responseText = "";
    const responseImages: string[] = [];

    if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
            if (part.text) {
                responseText += part.text;
            }
            if (part.inlineData) {
                responseImages.push(part.inlineData.data);
            }
        }
    }
    
    if (!responseText && response.text) {
        responseText = response.text;
    }

    return { 
        text: responseText || "（无文本回复）", 
        images: responseImages.length > 0 ? responseImages : undefined 
    };

  } catch (error: any) {
    console.error("Gemini Chat Error:", error);
    let errorMsg = "思考过程中遇到了一点小问题，请稍后再试。";
    if (error.message?.includes('413')) errorMsg = "文件过大，请上传小于 10MB 的文件。";
    if (error.message?.includes('token') || error.status === 400) errorMsg = "当前查询的数据量过大，请尝试缩小查询范围（例如指定具体的国家或城市）。";
    return { text: errorMsg };
  }
};

export const generateFileName = async (
  plannerName: string,
  destinations: string[],
  people: number,
  days: number
): Promise<string> => {
    const base = `${plannerName}${destinations.join('')}${people}人${days}天`;
    return base;
};

export interface ItineraryItem {
  day: number;
  origin: string;
  originCountry?: string; 
  destination: string;
  destinationCountry?: string; 
  ticketName?: string;
  activityName?: string;
  hotelName?: string; 
  description?: string; 
}

export interface AIPlanningResult {
    detectedDestinations: string[]; 
    isFullReplacement?: boolean; 
    startDate?: string; 
    peopleCount?: number; 
    roomCount?: number; 
    roomType?: string; 
    ticketCount?: number; 
    carModel?: string; 
    itinerary: ItineraryItem[];
    reasoning?: string;
}

// Helper to structure DB data for Prompt Context
const buildResourceContext = (
  cities: string[],
  poiCities: PoiCity[],
  spots: PoiSpot[],
  hotels: PoiHotel[],
  activities: PoiActivity[]
): string => {
  const context: Record<string, Record<string, { hotels: string[], spots: string[], activities: string[] }>> = {};

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
  availableCountries: string[], 
  availableCities: string[],
  poiCities: PoiCity[],
  poiSpots: PoiSpot[],
  poiHotels: PoiHotel[],
  poiActivities: PoiActivity[],
  userPrompt?: string,
  carDB: CarCostEntry[] = []
): Promise<AIPlanningResult | null> => {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  try {
    const ai = new GoogleGenAI({ apiKey });

    // 1. Prepare Trip History Context (Training Data)
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
    const availableCarModels = Array.from(new Set(carDB.map(c => c.carModel).filter(Boolean)));

    // 3. Serialize Current Rows
    const currentItinerarySummary = currentRows.map(r => {
        const hotels = (r.hotelDetails || []).map(h=>h.name).join(',') || '未定';
        const spots = (r.ticketDetails || []).map(t=>t.name).join(',') || '无';
        const activities = (r.activityDetails || []).map(a=>a.name).join(',') || '无';
        return `Day ${r.dayIndex} (${r.date || 'N/A'}): Route=[${r.route || '未定'}], Hotel=[${hotels}], Spots=[${spots}], Activities=[${activities}], Desc=[${r.description || ''}]`;
    }).join('\n');

    let prompt = `
      作为一名资深的高端旅行定制师，请利用【资源库】和【历史行程库】为用户规划或优化行程。

      【核心原则 - 极为重要】
      1. **优先使用现有资源**：在规划路线、酒店、景点、活动时，通常应从下方的【现有资源数据库】中选取。
      2. **用户指定绝对优先**：如果用户在指令中**明确指定**了具体的酒店名称、景点名称或车型，**必须直接使用用户指定的名称**，严禁擅自更换为数据库中的其他资源。
      3. **提取关键信息**：分析指令，提取出发日期、人数、房间数、偏好的车型、房型。

      【现有资源数据库 (JSON格式: 国家 -> 城市 -> 资源)】
      ${dbContext}
      
      【现有车型列表】
      ${availableCarModels.join(', ')}

      【历史行程范例】
      ${JSON.stringify(historyContext, null, 2)}

      【现有国家列表 (Strict Allowed Values for Country Fields)】
      ${availableCountries.join(', ')}
      
      【现有城市列表 (Strict Preferred Values for City Fields)】
      ${availableCities.join(', ')}

      【当前已规划的行程】
      ${currentItinerarySummary}

      【当前请求参数】
      - 原定目的地: ${currentDestinations.join(', ') || "未设定"}
      - 计划天数: ${currentDays} 天

      【用户具体指令】
      "${userPrompt}"

      【任务要求】
      1. 分析用户指令，如果是修改行程，只修改对应部分。如果是新行程，完全重新规划。
      2. **语言控制**：如果用户要求英文，Description 用英文。
      3. **JSON返回**。
      4. **detectedDestinations** 数组和 **destinationCountry** 字段必须严格等于【现有国家列表】中的某一项。严禁出现城市名或列表以外的国家名。如果用户提到的是城市，请推断其所属国家并填入。
      5. **路线城市标准化**：在生成 itinerary 中的 origin 和 destination 字段时，**请务必优先**从【现有城市列表】中选择名称。
         - 例如：如果库中有 "卡萨布兰卡Casablanca"，不要写 "卡萨"。
         - 只有当用户明确提到一个不在库中的新城市时，才使用新名称。
      
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
            detectedDestinations: { type: Type.ARRAY, items: { type: Type.STRING } },
            isFullReplacement: { type: Type.BOOLEAN },
            startDate: { type: Type.STRING },
            peopleCount: { type: Type.INTEGER },
            roomCount: { type: Type.INTEGER },
            roomType: { type: Type.STRING },
            ticketCount: { type: Type.INTEGER },
            carModel: { type: Type.STRING },
            itinerary: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        day: { type: Type.INTEGER },
                        origin: { type: Type.STRING },
                        originCountry: { type: Type.STRING },
                        destination: { type: Type.STRING },
                        destinationCountry: { type: Type.STRING },
                        ticketName: { type: Type.STRING },
                        activityName: { type: Type.STRING },
                        hotelName: { type: Type.STRING },
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
    return null;
  }
};
