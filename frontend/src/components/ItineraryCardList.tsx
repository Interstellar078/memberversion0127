import React from 'react';
import { MapPin, Bus, Bed, Ticket, Camera, Calendar } from 'lucide-react';
import { DayRow } from '../types';

interface ItineraryCardListProps {
    rows: DayRow[];
    setRows: (rows: DayRow[]) => void;
}

export const ItineraryCardList: React.FC<ItineraryCardListProps> = ({ rows }) => {
    // Drag and drop logic temporarily disabled due to React 19 / hello-pangea-dnd compatibility issues.

    return (
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {rows.map((row) => (
                <div
                    key={row.id}
                    className="bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow duration-200 overflow-hidden group h-full flex flex-col"
                >
                    {/* Header: Day & Date */}
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 flex justify-between items-center border-b border-blue-100/50">
                        <div className="flex items-center gap-2">
                            <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-sm">
                                DAY {row.dayIndex}
                            </span>
                            <span className="text-gray-600 font-medium text-sm flex items-center gap-1">
                                <Calendar size={12} className="text-blue-400" />
                                {row.date}
                            </span>
                        </div>
                    </div>

                    {/* Content Body */}
                    <div className="p-4 space-y-4">

                        {/* Route */}
                        <div className="flex gap-3">
                            <div className="mt-0.5 w-6 h-6 rounded-full bg-orange-50 flex items-center justify-center text-orange-500 shrink-0">
                                <MapPin size={14} />
                            </div>
                            <div className="flex-1">
                                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-0.5">行程路线</h4>
                                <p className="text-sm font-medium text-gray-800 leading-snug">{row.route}</p>
                            </div>
                        </div>

                        {/* Transport & Hotel Grid */}
                        <div className="grid grid-cols-2 gap-3">
                            {/* Transport */}
                            <div className="flex gap-2">
                                <div className="mt-0.5 w-5 h-5 rounded-full bg-blue-50 flex items-center justify-center text-blue-500 shrink-0">
                                    <Bus size={12} />
                                </div>
                                <div>
                                    <h4 className="text-[10px] font-bold text-gray-400 uppercase mb-0.5">交通</h4>
                                    {row.transportDetails && row.transportDetails.length > 0 ? (
                                        row.transportDetails.map((t, i) => (
                                            <div key={i} className="text-xs text-gray-700">
                                                {t.model} x{t.quantity}
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-xs text-gray-700">{row.transport ? row.transport.join(', ') : '-'}</div>
                                    )}
                                    {row.transportCost > 0 && <span className="text-[10px] text-green-600 font-medium">¥{row.transportCost}</span>}
                                </div>
                            </div>

                            {/* Hotel */}
                            <div className="flex gap-2">
                                <div className="mt-0.5 w-5 h-5 rounded-full bg-purple-50 flex items-center justify-center text-purple-500 shrink-0">
                                    <Bed size={12} />
                                </div>
                                <div>
                                    <h4 className="text-[10px] font-bold text-gray-400 uppercase mb-0.5">酒店</h4>
                                    {row.hotelDetails && row.hotelDetails.length > 0 ? (
                                        row.hotelDetails.map((h, i) => (
                                            <div key={i} className="text-xs text-gray-700">
                                                {h.name} ({h.roomType})
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-xs text-gray-400">-</div>
                                    )}
                                    {row.hotelCost > 0 && <span className="text-[10px] text-green-600 font-medium">¥{row.hotelCost}</span>}
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-gray-50 my-2"></div>

                        {/* Tickets & Activities */}
                        <div className="space-y-3">
                            {/* Tickets */}
                            {row.ticketDetails && row.ticketDetails.length > 0 && (
                                <div className="flex gap-2">
                                    <div className="mt-0.5 w-5 h-5 rounded-full bg-green-50 flex items-center justify-center text-green-500 shrink-0">
                                        <Ticket size={12} />
                                    </div>
                                    <div>
                                        <h4 className="text-[10px] font-bold text-gray-400 uppercase mb-0.5">门票</h4>
                                        {row.ticketDetails.map((t, i) => (
                                            <div key={i} className="text-xs text-gray-700">{t.name} x{t.quantity}</div>
                                        ))}
                                        {row.ticketCost > 0 && <span className="text-[10px] text-green-600 font-medium">¥{row.ticketCost}</span>}
                                    </div>
                                </div>
                            )}

                            {/* Activities */}
                            {row.activityDetails && row.activityDetails.length > 0 && (
                                <div className="flex gap-2">
                                    <div className="mt-0.5 w-5 h-5 rounded-full bg-pink-50 flex items-center justify-center text-pink-500 shrink-0">
                                        <Camera size={12} />
                                    </div>
                                    <div>
                                        <h4 className="text-[10px] font-bold text-gray-400 uppercase mb-0.5">活动/用餐</h4>
                                        {row.activityDetails.map((a, i) => (
                                            <div key={i} className="text-xs text-gray-700">{a.name} x{a.quantity}</div>
                                        ))}
                                        {row.activityCost > 0 && <span className="text-[10px] text-green-600 font-medium">¥{row.activityCost}</span>}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Description */}
                        {row.description && (
                            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">
                                {row.description}
                            </div>
                        )}

                        {/* Footer Totals */}
                        <div className="flex justify-end items-center gap-2 pt-2 border-t border-gray-100">
                            <span className="text-[10px] text-gray-400 uppercase font-bold">每日预估</span>
                            <span className="text-sm font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                                ¥{row.transportCost + row.hotelCost + row.ticketCost + row.activityCost + row.otherCost}
                            </span>
                        </div>

                    </div>
                </div>
            ))}
        </div>
    );
};
