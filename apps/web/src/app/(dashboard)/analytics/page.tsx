'use client';

import { useState, useEffect } from 'react';
import { Card, Grid } from '@/components/layout/ResponsiveComponents';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { Activity, Users, Clock, Database, AlertCircle, HeartPulse, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import type { AnalyticsDashboardDto } from '@hamyar-ops/shared';

const MOCK_DATA: AnalyticsDashboardDto = {
  summary: {
    totalRequests: 145020,
    uniqueVisitors: 28540,
    sessions: 42100,
    bandwidth: "41.2 GB",
    errors: 124,
    healthScore: 99.8
  },
  trafficTimeline: Array.from({ length: 24 }).map((_, i) => ({
    timestamp: `${i}:00`,
    requests: Math.floor(Math.random() * 10000) + 1000,
    visitors: Math.floor(Math.random() * 2000) + 200,
  })),
  topBrowsers: [
    { name: 'Chrome', value: 65, percentage: 65 },
    { name: 'Safari', value: 20, percentage: 20 },
    { name: 'Firefox', value: 10, percentage: 10 },
    { name: 'Edge', value: 5, percentage: 5 }
  ],
  topOs: [
    { name: 'Windows', value: 45, percentage: 45 },
    { name: 'macOS', value: 30, percentage: 30 },
    { name: 'Linux', value: 15, percentage: 15 },
    { name: 'iOS/Android', value: 10, percentage: 10 }
  ],
  topCountries: [
    { name: 'United States', value: 45000, percentage: 40 },
    { name: 'Germany', value: 25000, percentage: 22 },
    { name: 'United Kingdom', value: 15000, percentage: 13 },
    { name: 'France', value: 10000, percentage: 9 },
    { name: 'Others', value: 18000, percentage: 16 }
  ]
};

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsDashboardDto | null>(null);

  useEffect(() => {
    // Simulate API call
    const timer = setTimeout(() => {
      setData(MOCK_DATA);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  if (!data) {
    return (
      <div className="p-6 h-full w-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const statCards = [
    { label: 'Total Requests', value: data.summary.totalRequests.toLocaleString(), icon: Activity, trend: '+12.5%', isPositive: true },
    { label: 'Unique Visitors', value: data.summary.uniqueVisitors.toLocaleString(), icon: Users, trend: '+5.2%', isPositive: true },
    { label: 'Total Sessions', value: data.summary.sessions.toLocaleString(), icon: Clock, trend: '-2.1%', isPositive: false },
    { label: 'Bandwidth', value: data.summary.bandwidth, icon: Database, trend: '+18.4%', isPositive: true },
    { label: 'Errors', value: data.summary.errors.toLocaleString(), icon: AlertCircle, trend: '-14.2%', isPositive: true },
    { label: 'Health Score', value: `${data.summary.healthScore}%`, icon: HeartPulse, trend: '+0.1%', isPositive: true },
  ];

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">Nginx Analytics</h1>
        <p className="text-muted-foreground">Monitor traffic, health, and performance of your reverse proxy.</p>
      </div>

      <Grid cols={3}>
        {statCards.map((stat, i) => (
          <Card key={i} className="flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-muted-foreground">{stat.label}</span>
              <div className="p-2 bg-primary/10 rounded-lg text-primary">
                <stat.icon className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline justify-between mt-auto">
              <h2 className="text-2xl font-bold">{stat.value}</h2>
              <span className={`text-xs font-medium flex items-center ${stat.isPositive ? 'text-emerald-500' : 'text-rose-500'}`}>
                {stat.isPositive ? <ArrowUpRight className="w-3 h-3 mr-1" /> : <ArrowDownRight className="w-3 h-3 mr-1" />}
                {stat.trend}
              </span>
            </div>
          </Card>
        ))}
      </Grid>

      <Card className="col-span-full h-[400px]">
        <div className="mb-6">
          <h3 className="font-semibold text-lg">Traffic Overview</h3>
          <p className="text-sm text-muted-foreground">Requests and visitors over the last 24 hours.</p>
        </div>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.trafficTimeline} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
              <XAxis dataKey="timestamp" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value / 1000}k`} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                itemStyle={{ color: '#f8fafc' }}
              />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              <Line type="monotone" dataKey="requests" name="Requests" stroke="#3b82f6" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
              <Line type="monotone" dataKey="visitors" name="Visitors" stroke="#10b981" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Grid cols={3}>
        <Card>
          <div className="mb-6">
            <h3 className="font-semibold text-lg">Top Browsers</h3>
          </div>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.topBrowsers}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {data.topBrowsers.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                  itemStyle={{ color: '#f8fafc' }}
                />
                <Legend verticalAlign="bottom" height={36} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <div className="mb-6">
            <h3 className="font-semibold text-lg">Operating Systems</h3>
          </div>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.topOs}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {data.topOs.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[(index + 1) % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                  itemStyle={{ color: '#f8fafc' }}
                />
                <Legend verticalAlign="bottom" height={36} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <div className="mb-6">
            <h3 className="font-semibold text-lg">Top Countries</h3>
          </div>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.topCountries} layout="vertical" margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} width={100} />
                <Tooltip 
                  cursor={{ fill: '#334155', opacity: 0.2 }}
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                  itemStyle={{ color: '#f8fafc' }}
                />
                <Bar dataKey="value" name="Requests" fill="#8b5cf6" radius={[0, 4, 4, 0]}>
                  {data.topCountries.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </Grid>
    </div>
  );
}
