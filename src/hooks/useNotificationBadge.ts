import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { playNotificationSound } from '@/lib/notificationSound';

const getLastSeenKey = (userId: string) => `notif_last_seen_${userId}`;

const getLastSeen = (userId: string): string => {
  try {
    const v = localStorage.getItem(getLastSeenKey(userId));
    if (v) return v;
  } catch {}
  // Default: 7 days ago
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString();
};

export const useNotificationBadge = () => {
  const [badgeCount, setBadgeCount] = useState(0);
  const prevCountRef = useRef(-1);
  const { profile } = useAuth();

  const updateAppBadge = useCallback((count: number) => {
    if ('setAppBadge' in navigator) {
      if (count > 0) {
        (navigator as any).setAppBadge(count);
      } else {
        (navigator as any).clearAppBadge();
      }
    }
  }, []);

  const fetchBadgeCount = useCallback(async () => {
    if (!profile?.id) return;

    try {
      const lastSeen = getLastSeen(profile.id);

      // Only count approved/rejected items updated AFTER user last visited notifications page
      const [leaveUpdated, overtimeUpdated, travelUpdated] = await Promise.all([
        supabase
          .from('leave_requests')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', profile.id)
          .in('status', ['approved', 'rejected'])
          .gt('updated_at', lastSeen),
        supabase
          .from('overtime_requests')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', profile.id)
          .in('status', ['approved', 'rejected'])
          .gt('updated_at', lastSeen),
        supabase
          .from('business_travel_requests')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', profile.id)
          .in('status', ['approved', 'rejected'])
          .gt('updated_at', lastSeen),
      ]);

      const total =
        (leaveUpdated.count || 0) +
        (overtimeUpdated.count || 0) +
        (travelUpdated.count || 0);

      if (prevCountRef.current >= 0 && total > prevCountRef.current) {
        playNotificationSound();
      }
      prevCountRef.current = total;
      setBadgeCount(total);
      updateAppBadge(total);
    } catch (error) {
      console.error('Error fetching badge count:', error);
    }
  }, [profile?.id, updateAppBadge]);

  useEffect(() => {
    fetchBadgeCount();

    const interval = setInterval(fetchBadgeCount, 60000);

    const channel = supabase
      .channel('badge-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leave_requests' },
        () => fetchBadgeCount()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'overtime_requests' },
        () => fetchBadgeCount()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'business_travel_requests' },
        () => fetchBadgeCount()
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
      if ('clearAppBadge' in navigator) {
        (navigator as any).clearAppBadge();
      }
    };
  }, [fetchBadgeCount]);

  const clearBadge = useCallback(() => {
    if (profile?.id) {
      try {
        localStorage.setItem(getLastSeenKey(profile.id), new Date().toISOString());
      } catch {}
    }
    prevCountRef.current = 0;
    setBadgeCount(0);
    if ('clearAppBadge' in navigator) {
      (navigator as any).clearAppBadge();
    }
  }, [profile?.id]);

  return { badgeCount, refreshBadge: fetchBadgeCount, clearBadge };
};
