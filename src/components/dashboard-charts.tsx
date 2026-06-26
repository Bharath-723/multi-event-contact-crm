'use client';

import React from 'react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell, BarChart, Bar
} from 'recharts';

interface ChartProps {
  dailyData: { date: string; count: number }[];
  skillData: { name: string; value: number }[];
  slotData: { name: string; value: number }[];
  genderData: { name: string; value: number }[];
}

const PURPLE_COLORS = ['#8b5cf6', '#6366f1', '#ec4899', '#3b82f6', '#14b8a6', '#f59e0b'];

export default function DashboardCharts({ dailyData, skillData, slotData, genderData }: ChartProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      
      {/* 1. Daily Registrations Trend */}
      <div className="glass-card rounded-2xl p-5 sm:p-6">
        <h3 className="text-base font-bold text-white mb-4">Daily Registration Trend</h3>
        <div className="h-64 w-full">
          {dailyData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-500 text-sm">
              No registration data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '12px',
                    color: '#f8fafc',
                    fontSize: '12px',
                  }}
                />
                <Area type="monotone" dataKey="count" stroke="#8b5cf6" strokeWidth={2.5} fillOpacity={1} fill="url(#colorCount)" name="Registrations" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* 2. Skills Analytics */}
      <div className="glass-card rounded-2xl p-5 sm:p-6">
        <h3 className="text-base font-bold text-white mb-4">Skills Distribution</h3>
        <div className="h-64 w-full flex flex-col sm:flex-row items-center justify-center">
          {skillData.every(d => d.value === 0) ? (
            <div className="text-slate-500 text-sm">No skills tracked yet</div>
          ) : (
            <>
              <div className="h-48 w-48 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={skillData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={75}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {skillData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={PURPLE_COLORS[index % PURPLE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        borderColor: '#334155',
                        borderRadius: '12px',
                        color: '#f8fafc',
                        fontSize: '12px',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              
              <div className="mt-4 sm:mt-0 sm:ml-6 flex flex-col gap-2 w-full max-w-[200px]">
                {skillData.map((item, index) => (
                  <div key={item.name} className="flex justify-between items-center text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PURPLE_COLORS[index % PURPLE_COLORS.length] }} />
                      <span className="text-slate-300 font-medium">{item.name}</span>
                    </div>
                    <span className="font-bold text-white">{item.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 3. Volunteer Slots Distribution */}
      <div className="glass-card rounded-2xl p-5 sm:p-6">
        <h3 className="text-base font-bold text-white mb-4">Volunteer Slots Allocation</h3>
        <div className="h-64 w-full">
          {slotData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-500 text-sm">
              No slot data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={slotData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" stroke="#64748b" fontSize={9} tickLine={false} interval={0} tickFormatter={(tick) => tick.replace(' AM', '').replace(' PM', '')} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '12px',
                    color: '#f8fafc',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} name="Volunteers">
                  {slotData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#6366f1' : '#a855f7'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* 4. Gender Ratio */}
      <div className="glass-card rounded-2xl p-5 sm:p-6">
        <h3 className="text-base font-bold text-white mb-4">Gender Ratio</h3>
        <div className="h-64 w-full flex flex-col sm:flex-row items-center justify-center">
          {genderData.every(d => d.value === 0) ? (
            <div className="text-slate-500 text-sm">No data available</div>
          ) : (
            <>
              <div className="h-48 w-48 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={genderData}
                      cx="50%"
                      cy="50%"
                      outerRadius={75}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${percent !== undefined ? (percent * 100).toFixed(0) : 0}%`}
                      labelLine={false}
                    >
                      <Cell fill="#a855f7" /> {/* Male - Purple */}
                      <Cell fill="#ec4899" /> {/* Female - Pink */}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        borderColor: '#334155',
                        borderRadius: '12px',
                        color: '#f8fafc',
                        fontSize: '12px',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-4 sm:mt-0 sm:ml-6 flex flex-col gap-2 w-full max-w-[150px]">
                {genderData.map((item, index) => (
                  <div key={item.name} className="flex justify-between items-center text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: index === 0 ? '#a855f7' : '#ec4899' }} />
                      <span className="text-slate-300 font-medium">{item.name}</span>
                    </div>
                    <span className="font-bold text-white">{item.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

    </div>
  );
}
