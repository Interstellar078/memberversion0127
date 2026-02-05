import React from 'react';
import { TripSettings } from '../types';
import { Users, Calendar, Globe, Coins, Table as TableIcon, LayoutGrid } from 'lucide-react';
import { MultiSelect } from './MultiSelect';

interface GlobalSettingsProps {
  settings: TripSettings;
  updateSettings: (s: Partial<TripSettings>) => void;
  availableCountries: string[];
  viewMode: 'table' | 'card';
  setViewMode: (mode: 'table' | 'card') => void;
}

export const GlobalSettings: React.FC<GlobalSettingsProps> = ({ settings, updateSettings, availableCountries, viewMode, setViewMode }) => {
  return (
    <div className="flex flex-wrap items-center gap-3 mb-4 p-1 no-print">
      {/* View Switcher - Integrated */}
      <div className="bg-white p-0.5 rounded-lg border border-gray-200 shadow-sm flex shrink-0 mr-2">
        <button
          onClick={() => setViewMode('table')}
          className={`p-1.5 rounded-md transition-all ${viewMode === 'table' ? 'bg-indigo-50 text-indigo-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
          title="表格视图"
        >
          <TableIcon size={16} />
        </button>
        <button
          onClick={() => setViewMode('card')}
          className={`p-1.5 rounded-md transition-all ${viewMode === 'card' ? 'bg-indigo-50 text-indigo-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
          title="卡片视图"
        >
          <LayoutGrid size={16} />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-400 whitespace-nowrap">定制师</label>
        <input
          type="text"
          value={settings.plannerName}
          onChange={(e) => updateSettings({ plannerName: e.target.value })}
          className="w-24 rounded border-gray-200 bg-white shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs py-1.5 px-2 transition-colors"
          placeholder="名字"
        />
      </div>

      <div className="h-4 w-px bg-gray-200"></div>

      {/* Start Date */}
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1 text-xs text-gray-400 whitespace-nowrap">
          <Calendar size={12} /> 出发
        </label>
        <input
          type="date"
          value={settings.startDate}
          onChange={(e) => updateSettings({ startDate: e.target.value })}
          className="w-32 rounded border-gray-200 bg-white shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs py-1.5 px-2 transition-colors"
        />
      </div>

      <div className="h-4 w-px bg-gray-200"></div>

      {/* People & Rooms */}
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1 text-xs text-gray-400 whitespace-nowrap">
          <Users size={12} /> 人/房
        </label>
        <div className="flex gap-1">
          <div className="relative">
            <input
              type="number"
              min="1"
              value={settings.peopleCount}
              onChange={(e) => updateSettings({ peopleCount: parseInt(e.target.value) || 0 })}
              className="w-16 rounded border-gray-200 bg-white shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs py-1.5 px-2 pr-6 transition-colors"
              placeholder="人"
            />
            <span className="absolute right-2 top-1.5 text-gray-400 text-[10px]">人</span>
          </div>
          <div className="relative">
            <input
              type="number"
              min="0"
              value={settings.roomCount}
              onChange={(e) => updateSettings({ roomCount: parseInt(e.target.value) || 0 })}
              className="w-16 rounded border-gray-200 bg-white shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs py-1.5 px-2 pr-6 transition-colors"
              placeholder="间"
            />
            <span className="absolute right-2 top-1.5 text-gray-400 text-[10px]">间</span>
          </div>
        </div>
      </div>

      <div className="h-4 w-px bg-gray-200"></div>

      {/* Currency & Destinations */}
      <div className="flex items-center gap-2 flex-1 min-w-[200px]">
        <label className="flex items-center gap-1 text-xs text-gray-400 whitespace-nowrap">
          <Globe size={12} /> 目的地
        </label>
        <div className="flex-1">
          <MultiSelect
            options={availableCountries}
            value={settings.destinations}
            onChange={(vals) => updateSettings({ destinations: vals })}
            placeholder="选择国家..."
            className="w-full text-xs"
          />
        </div>
      </div>

      <div className="h-4 w-px bg-gray-200"></div>

      {/* Currency Rate */}
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1 text-xs text-gray-400 whitespace-nowrap">
          <Coins size={12} /> 汇率
        </label>
        <div className="flex gap-1">
          <input
            type="text"
            value={settings.currency}
            onChange={(e) => {
              const val = e.target.value;
              const isCNY = val.toUpperCase() === 'CNY' || val === '人民币';
              updateSettings({
                currency: val,
                exchangeRate: isCNY ? 1 : settings.exchangeRate
              })
            }}
            className="w-16 rounded border-gray-200 bg-white shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs py-1.5 px-2 transition-colors"
            placeholder="货币"
          />
          <input
            type="number"
            step="0.01"
            disabled={settings.currency.toUpperCase() === 'CNY' || settings.currency === '人民币'}
            value={settings.exchangeRate}
            onChange={(e) => updateSettings({ exchangeRate: parseFloat(e.target.value) || 1 })}
            className="w-20 rounded border-gray-200 bg-white shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs py-1.5 px-2 disabled:bg-gray-50 disabled:text-gray-400 transition-colors"
            placeholder="汇率"
          />
        </div>
      </div>

    </div>
  );
};
