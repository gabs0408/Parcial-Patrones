import { useEffect } from 'react';
import { supabase } from '../lib/supabase';

export function useRealtimeEmergencies(onUpdate) {
  useEffect(() => {
    const channel = supabase
      .channel('emergencias-cambios')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'emergencias' },
        (payload) => {
          console.log('Cambio en tiempo real:', payload);
          onUpdate();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [onUpdate]);
}