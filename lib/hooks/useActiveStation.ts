import { useQuery } from '@tanstack/react-query';
import { useReportsStore } from '../../store';
import { apiSetup } from '../api/setup';

interface Station {
  id: string;
  name: string;
  code?: string;
}

async function fetchStations(): Promise<Station[]> {
  return apiSetup.stations.list();
}

/**
 * Returns the currently active station ID and station list.
 *
 * Priority:
 *  1. The station selected via StationSwitcher (persisted in useReportsStore)
 *  2. The first station returned by the API
 *
 * Components should use `stationId` instead of hardcoding identifiers like 's1'.
 */
export function useActiveStation() {
  const { stationId: selectedStationId, setFilters } = useReportsStore();

  const { data: stations = [], isLoading } = useQuery({
    queryKey: ['stations-switcher'],
    queryFn: fetchStations,
    staleTime: 5 * 60 * 1000,
  });

  const stationId = selectedStationId ?? stations[0]?.id ?? null;
  const station = stations.find((s) => s.id === stationId) ?? null;

  return {
    /** Resolved station ID (from switcher or first available). Null while loading. */
    stationId,
    /** Full station object for the active station */
    station,
    /** All stations the user has access to */
    stations,
    /** Whether the station list is still loading */
    isLoading,
    /** Change the active station (delegates to ReportsStore) */
    setStationId: (id: string | null) => setFilters({ stationId: id }),
  };
}
