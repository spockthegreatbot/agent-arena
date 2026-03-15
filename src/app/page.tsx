'use client';

import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import ActivityPanel from '@/components/ActivityPanel';
import { AgentState, ActivityItem, SystemStats } from '@/lib/agents';

const PixelOffice = dynamic(() => import('@/components/PixelOffice'), { ssr: false });

type ArenaMode = 'live' | 'demo' | null;

export default function Home() {
  const [agents, setAgents] = useState<AgentState[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [mode, setMode] = useState<ArenaMode>(null);

  const fetchData = useCallback(async () => {
    try {
      const [statusRes, activityRes, statsRes] = await Promise.all([
        fetch('/api/agents/status'),
        fetch('/api/agents/activity'),
        fetch('/api/agents/stats'),
      ]);

      if (statusRes.ok) {
        const data = await statusRes.json();
        setAgents(data.agents || []);
        if (data.mode) setMode(data.mode);
      }
      if (activityRes.ok) {
        const data = await activityRes.json();
        setActivities(data.activities || []);
      }
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <main className="h-screen w-screen bg-[#0a0a0f] flex overflow-hidden relative">
      {/* Left: Pixel Office */}
      <div className="w-3/5 h-full p-3 flex items-center justify-center">
        <PixelOffice agents={agents} />
      </div>

      {/* Right: Activity Panel */}
      <div className="w-2/5 h-full border-l border-[#2a2a3e] flex flex-col">
        <ActivityPanel agents={agents} activities={activities} stats={stats} />
      </div>

      {/* Mode Badge — top-left */}
      {mode && (
        <div className={`absolute top-3 left-3 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 z-50 ${
          mode === 'live'
            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
            : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${
            mode === 'live' ? 'bg-green-400 animate-pulse' : 'bg-amber-400'
          }`} />
          {mode === 'live' ? 'Live' : 'Demo'}
        </div>
      )}

      {/* Deploy Your Own — bottom-right */}
      <a
        href="https://github.com/spockthegreatbot/agent-arena"
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-4 right-4 z-50 px-3 py-2 bg-[#1a1a2e]/90 backdrop-blur-sm border border-[#2a2a3e] rounded-lg text-[11px] text-[#8a8aaa] hover:text-white hover:border-[#4a4a6e] transition-all duration-200 flex items-center gap-2 group"
      >
        <span>🏟️</span>
        <span className="group-hover:text-white transition-colors">Deploy your own Agent Arena</span>
        <svg className="w-3 h-3 opacity-50 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </a>
    </main>
  );
}
