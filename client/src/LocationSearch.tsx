import { useState, useEffect, useRef } from "react";
import { searchLocations, type GeocodePlace } from "./api";
import type { Profile } from "./profile";

export type LocationSelection = Profile["location"];

interface LocationSearchProps {
  onSelect: (location: LocationSelection) => void;
  selected: LocationSelection | null;
}

function formatPlaceLabel(place: GeocodePlace): string {
  const parts: string[] = [];
  if (place.name) parts.push(place.name);
  if (place.region) parts.push(place.region);
  if (place.country) parts.push(place.country);
  return parts.join(", ");
}

export function LocationSearch({ onSelect, selected }: LocationSearchProps) {
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<GeocodePlace[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
    };
  }, []);

  const triggerSearch = () => {
    const trimmed = query.trim();
    if (!trimmed) {
      return;
    }

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setStatus(null);
    setPlaces([]);

    searchLocations(trimmed, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setPlaces(data.results);
          if (data.results.length === 0) {
            setStatus("No places found.");
          }
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setStatus("Search failed. Try again.");
        }
      });
  };

  const handlePick = (place: GeocodePlace) => {
    const selectedPlace: LocationSelection = {
      name: place.name,
      latitude: place.latitude,
      longitude: place.longitude,
    };
    setPlaces([]);
    onSelect(selectedPlace);
  };

  return (
    <div className="location-search">
      <div className="location-search-controls">
        <label htmlFor="location-query">Search location</label>
        <div>
          <input
            id="location-query"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                // WHY: LocationSearch sits inside the profile form, so Enter would otherwise submit the whole form.
                e.preventDefault();
                triggerSearch();
              }
            }}
          />
          <button type="button" onClick={triggerSearch}>
            Search
          </button>
        </div>
      </div>

      {status && (
        <p role="status">
          {status}
        </p>
      )}

      {selected && (
        <p>Selected location: {selected.name}</p>
      )}

      {places.length > 0 && (
        <ul>
          {places.map((place, idx) => (
            <li key={`${place.name}-${place.latitude}-${place.longitude}-${idx}`}>
              <button type="button" onClick={() => handlePick(place)}>
                {formatPlaceLabel(place)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
