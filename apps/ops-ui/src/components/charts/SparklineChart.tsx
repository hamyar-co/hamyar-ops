'use client';

import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts';

interface DataPoint { timestamp: number; value: number }

interface Props {
  data: DataPoint[];
  color?: string;
  height?: number;
  unit?: string;
}

export function SparklineChart({ data, color = '#6366f1', height = 60, unit = '%' }: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#grad-${color.replace('#', '')})`}
          dot={false}
          isAnimationActive={false}
        />
        <Tooltip
          contentStyle={{
            background: 'hsl(0 0% 7%)',
            border: '1px solid hsl(0 0% 15%)',
            borderRadius: '8px',
            fontSize: '12px',
            color: 'hsl(0 0% 98%)',
          }}
          formatter={(v: number) => [`${v.toFixed(1)}${unit}`, '']}
          labelFormatter={() => ''}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
