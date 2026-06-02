import React, { useState, useRef, useEffect } from "react";
import { Building2, ChevronDown, Check } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useReportsStore } from "../../store";
import { apiSetup } from "../../lib/api/setup";

interface Station {
  id: string;
  name: string;
  code?: string;
}

async function fetchStations(): Promise<Station[]> {
  return apiSetup.stations.list();
}

export function StationSwitcher() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const { stationId, setFilters } = useReportsStore();

  const { data: stations = [] } = useQuery({
    queryKey: ["stations"],
    queryFn: fetchStations,
    staleTime: 5 * 60 * 1000,
  });

  const selectedStation = stations.find((s) => s.id === stationId);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  if (stations.length <= 1) return null;

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 h-9 px-3 bg-muted/50 border border-input rounded-xl hover:border-primary/50 transition-all text-xs font-bold"
      >
        <Building2 size={14} className="text-muted-foreground" />
        <span className="max-w-[120px] truncate">
          {selectedStation?.name ?? "All Stations"}
        </span>
        <ChevronDown size={12} className="text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-card border border-border rounded-xl shadow-xl z-50 py-1 animate-in fade-in slide-in-from-top-2 duration-200">
          <button
            onClick={() => {
              setFilters({ stationId: null });
              setOpen(false);
            }}
            className="flex items-center gap-2 w-full px-4 py-2.5 text-xs font-bold hover:bg-muted transition-colors"
          >
            <Building2 size={14} className="text-muted-foreground" />
            <span className="flex-1 text-left">All Stations</span>
            {!stationId && <Check size={14} className="text-primary" />}
          </button>
          <div className="h-px bg-border mx-2" />
          {stations.map((station) => (
            <button
              key={station.id}
              onClick={() => {
                setFilters({ stationId: station.id });
                setOpen(false);
              }}
              className="flex items-center gap-2 w-full px-4 py-2.5 text-xs font-bold hover:bg-muted transition-colors"
            >
              <Building2 size={14} className="text-muted-foreground" />
              <span className="flex-1 text-left truncate">{station.name}</span>
              {stationId === station.id && (
                <Check size={14} className="text-primary" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
