'use client';

import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import ActivityPanel from '@/components/ActivityPanel';
import { AgentState, ActivityItem, SystemStats } from '@/lib/agents';

const PixelOffice = dynamic(() => import('@/components/PixelOffice'), { ssr: false });

export default function Home() {
  const [agents, setAgents] = useState<AgentState[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [stats, setStats] = useState<SystemStats | null>(null);

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
    <main className="h-screen w-screen bg-[#0a0a0f] flex overflow-hidden">
      {/* Left: Pixel Office (wider now for bigger canvas) */}
      <div className="w-3/5 h-full p-3 flex items-center justify-center">
        <PixelOffice agents={agents} />
      </div>

      {/* Right: Activity Panel */}
      <div className="w-2/5 h-full border-l border-[#2a2a3e] flex flex-col">
        <ActivityPanel agents={agents} activities={activities} stats={stats} />
      </div>
    </main>
  );
}
