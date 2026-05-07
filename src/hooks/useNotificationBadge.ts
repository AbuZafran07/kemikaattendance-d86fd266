import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { playNotificationSound } from '@/lib/notificationSound';

const FALLBACK_DAYS = 7;

const getFallbackCutoff = () => {
  const d = new Date();
  d.setDate(d.getDate() - FALLBACK_DAYS);
  return d.toISOString();
};

export const useNotificationBadge = () => {
  const [badgeCount, setBadgeCount] = useState(0);
  const prevCountRef = useRef(-1);
  const lastSeenRef = useRef<string | null>(null);
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

  const loadLastSeen = useCallback(async (): Promise<string> => {
    if (!profile?.id) return getFallbackCutoff();
    try {
      const { data } = await supabase
        .from('notification_last_seen' as any)
        .select('last_seen_at')
        .eq('user_id', profile.id)
        .maybeSingle();
      const ts = (data as any)?.last_seen_at as string | undefined;
      return ts || getFallbackCutoff();
    } catch {
      return getFallbackCutoff();
    }
  }, [profile?.id]);

  const fetchBadgeCount = useCallback(async () => {
    if (!profile?.id) return;

    try {
      const lastSeen = await loadLastSeen();
      lastSeenRef.current = lastSeen;

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
  }, [profile?.id, updateAppBadge, loadLastSeen]);

  useEffect(() => {
    fetchBadgeCount();
    const interval = setInterval(fetchBadgeCount, 60000);

    const channel = supabase
      .channel('badge-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests' }, () => fetchBadgeCount())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'overtime_requests' }, () => fetchBadgeCount())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'business_travel_requests' }, () => fetchBadgeCount())
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
      if ('clearAppBadge' in navigator) {
        (navigator as any).clearAppBadge();
      }
    };
  }, [fetchBadgeCount]);

  const clearBadge = useCallback(async () => {
    if (!profile?.id) return;
    prevCountRef.current = 0;
    setBadgeCount(0);
    if ('clearAppBadge' in navigator) {
      (navigator as any).clearAppBadge();
    }
    try {
      const { data } = await supabase.rpc('mark_notifications_seen' as any);
      if (data) lastSeenRef.current = data as string;
    } catch (error) {
      console.error('Error marking notifications seen:', error);
    }
  }, [profile?.id]);

  return { badgeCount, refreshBadge: fetchBadgeCount, clearBadge };
};
