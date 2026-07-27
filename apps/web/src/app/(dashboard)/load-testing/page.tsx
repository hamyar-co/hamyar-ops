'use client';

import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { Activity, Zap, ShieldAlert } from 'lucide-react';

interface LoadTestResult {
  url: string;
  connections: number;
  duration: number;
  requests: {
    total: number;
    average: number;
  };
  latency: {
    average: number;
    p99: number;
  };
  throughput: {
    average: number;
  };
  errors: number;
  timeouts: number;
  non2xx: number;
}

export default function LoadTestingPage() {
  const [url, setUrl] = useState('http://localhost:4000/v1/blog');
  const [connections, setConnections] = useState('100');
  const [duration, setDuration] = useState('10');
  
  const { mutate, isPending, data, error } = useMutation({
    mutationFn: async () => {
      const res = await apiClient.post('/load-testing/run', {
        url,
        connections: parseInt(connections, 10),
        duration: parseInt(duration, 10),
      });
      return res.data.data as LoadTestResult;
    }
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col">
        <h1 className="text-2xl font-semibold text-foreground">API Load Testing</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Simulate high user traffic to test load balancing and DDoS resilience across your microservices.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-surface border border-border rounded-xl p-5 md:col-span-1 space-y-4">
          <div className="mb-4">
            <h3 className="font-semibold text-foreground">Test Configuration</h3>
            <p className="text-xs text-muted-foreground">Configure the target and attack parameters</p>
          </div>
          
          <div className="space-y-1.5">
            <label htmlFor="app" className="block text-sm font-medium text-foreground">Select App / Target URL</label>
            <select 
              id="app" 
              value={url} 
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setUrl(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-surface-2 border border-border rounded-lg text-foreground focus:outline-none focus:border-primary transition-colors appearance-none"
            >
              <option value="http://localhost:4000/v1/blog">Blog Service (Gateway)</option>
              <option value="http://localhost:4000/v1/tickets">Tickets Service (Gateway)</option>
              <option value="http://localhost:4000/v1/media">Media Service (Gateway)</option>
              <option value="http://localhost:4000/v1/users">Users Service (Gateway)</option>
              <option value="">Custom URL...</option>
            </select>
          </div>
          
          <div className="space-y-1.5">
            <label htmlFor="customUrl" className="block text-sm font-medium text-foreground">Custom Target URL</label>
            <input 
              id="customUrl" 
              type="text"
              value={url} 
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)} 
              placeholder="http://localhost:4000/v1/app" 
              className="w-full px-3 py-2 text-sm bg-surface-2 border border-border rounded-lg text-foreground focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="connections" className="block text-sm font-medium text-foreground">Concurrent Users (Connections)</label>
            <input 
              id="connections" 
              type="number" 
              min="1" 
              max="10000" 
              value={connections} 
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConnections(e.target.value)} 
              className="w-full px-3 py-2 text-sm bg-surface-2 border border-border rounded-lg text-foreground focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="duration" className="block text-sm font-medium text-foreground">Test Duration (Seconds)</label>
            <input 
              id="duration" 
              type="number" 
              min="1" 
              max="300" 
              value={duration} 
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDuration(e.target.value)} 
              className="w-full px-3 py-2 text-sm bg-surface-2 border border-border rounded-lg text-foreground focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          <button 
            className="w-full mt-4 flex justify-center items-center px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            onClick={() => mutate()} 
            disabled={isPending || !url}
          >
            {isPending ? (
              <>
                <Activity className="mr-2 h-4 w-4 animate-spin" />
                Running Attack...
              </>
            ) : (
              <>
                <Zap className="mr-2 h-4 w-4" />
                Launch Load Test
              </>
            )}
          </button>
          
          {error && (
            <p className="text-error text-xs mt-2 p-2 bg-error/10 rounded">
              {(error as any)?.response?.data?.message || error.message}
            </p>
          )}
        </div>

        <div className="bg-surface border border-border rounded-xl p-5 md:col-span-2 flex flex-col">
          <div className="mb-4">
            <h3 className="font-semibold text-foreground">Attack Results</h3>
            <p className="text-xs text-muted-foreground">
              Real-time analysis of system throughput and stability
            </p>
          </div>
          
          <div className="flex-1">
            {!data && !isPending && (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground border-2 border-dashed border-border rounded-lg">
                <ShieldAlert className="h-12 w-12 mb-4 opacity-20" />
                <p>No tests run yet. Configure your attack and click Launch.</p>
              </div>
            )}
            
            {isPending && (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground border border-border rounded-lg bg-surface-2/50">
                <Activity className="h-10 w-10 mb-4 animate-spin text-primary" />
                <p>Simulating {connections} concurrent users for {duration} seconds...</p>
                <p className="text-xs opacity-50 mt-2">This may take a moment. Do not refresh.</p>
              </div>
            )}

            {data && !isPending && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 border border-border rounded-lg bg-surface-2">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total Requests</p>
                  <h3 className="text-2xl font-semibold mt-1 text-primary">{data.requests.total.toLocaleString()}</h3>
                </div>
                
                <div className="p-4 border border-border rounded-lg bg-surface-2">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Requests / Sec</p>
                  <h3 className="text-2xl font-semibold mt-1 text-primary">{data.requests.average.toLocaleString(undefined, {maximumFractionDigits:0})}</h3>
                </div>

                <div className="p-4 border border-border rounded-lg bg-surface-2">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Average Latency</p>
                  <h3 className="text-2xl font-semibold mt-1 text-warning">{data.latency.average} ms</h3>
                </div>

                <div className="p-4 border border-border rounded-lg bg-surface-2">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">P99 Latency</p>
                  <h3 className="text-2xl font-semibold mt-1 text-warning">{data.latency.p99} ms</h3>
                </div>

                <div className="p-4 border border-border rounded-lg bg-surface-2 col-span-2">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Throughput</p>
                  <h3 className="text-2xl font-semibold mt-1">{(data.throughput.average / 1024 / 1024).toFixed(2)} MB/s</h3>
                </div>

                <div className={`p-4 border rounded-lg col-span-2 ${data.errors > 0 || data.timeouts > 0 ? 'border-error/20 bg-error/5' : 'border-success/20 bg-success/5'}`}>
                  <p className={`text-xs font-medium uppercase tracking-wider flex items-center ${data.errors > 0 || data.timeouts > 0 ? 'text-error' : 'text-success'}`}>
                    <ShieldAlert className="h-3.5 w-3.5 mr-1.5"/> Errors & Drops
                  </p>
                  <h3 className={`text-2xl font-semibold mt-1 flex items-baseline gap-2 ${data.errors > 0 || data.timeouts > 0 ? 'text-error' : 'text-success'}`}>
                    {data.errors + data.timeouts} 
                    <span className="text-sm font-normal text-muted-foreground">
                      ({data.non2xx} Non-2xx)
                    </span>
                  </h3>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
