import { useState } from "react";
import { LocationSearch, type LocationSelection } from "./LocationSearch";
import { profileSchema, type Profile } from "./profile";

interface ProfileFormProps {
  mode: "family" | "community";
  initial: Profile | null;
  onSubmit: (profile: Profile) => void;
  submitting: boolean;
}

type CommuteMode = Profile["commute"]["mode"];
type Heating = Profile["heating"];
type Cooking = Profile["cooking"];

const COMMUTE_OPTIONS: readonly { value: CommuteMode; label: string }[] = [
  { value: "car", label: "Car" },
  { value: "two-wheeler", label: "Two-wheeler" },
  { value: "public-transport", label: "Public transport" },
  { value: "walk-cycle", label: "Walk or cycle" },
  { value: "remote", label: "Remote / work from home" },
];

const HEATING_OPTIONS: readonly { value: Heating; label: string }[] = [
  { value: "electric", label: "Electric" },
  { value: "gas", label: "Gas" },
  { value: "wood-or-coal", label: "Wood or coal" },
  { value: "none", label: "None" },
];

const COOKING_OPTIONS: readonly { value: Cooking; label: string }[] = [
  { value: "electric", label: "Electric" },
  { value: "gas", label: "Gas" },
  { value: "wood-or-coal", label: "Wood or coal" },
];

function pickOption<T extends string>(
  options: readonly { value: T }[],
  raw: string
): T | undefined {
  return options.find((o) => o.value === raw)?.value;
}

export function ProfileForm({ mode, initial, onSubmit, submitting }: ProfileFormProps) {
  const matchesMode = initial !== null && initial.mode === mode;

  const [location, setLocation] = useState<LocationSelection | null>(
    matchesMode ? initial.location : null
  );

  const [adults, setAdults] = useState<string>(
    matchesMode && initial.mode === "family" ? String(initial.members.adults) : "2"
  );
  const [children, setChildren] = useState<string>(
    matchesMode && initial.mode === "family" ? String(initial.members.children) : "0"
  );
  const [elderly, setElderly] = useState<string>(
    matchesMode && initial.mode === "family" ? String(initial.members.elderly) : "0"
  );
  const [households, setHouseholds] = useState<string>(
    matchesMode && initial.mode === "community" ? String(initial.households) : "10"
  );

  const [commuteMode, setCommuteMode] = useState<CommuteMode>(
    matchesMode ? initial.commute.mode : "car"
  );
  const [oneWayKm, setOneWayKm] = useState<string>(
    matchesMode ? String(initial.commute.oneWayKm) : "10"
  );
  const [daysPerWeek, setDaysPerWeek] = useState<string>(
    matchesMode ? String(initial.commute.daysPerWeek) : "5"
  );

  const [heating, setHeating] = useState<Heating>(
    matchesMode ? initial.heating : "electric"
  );
  const [cooking, setCooking] = useState<Cooking>(
    matchesMode ? initial.cooking : "gas"
  );
  const [roomAreaM2, setRoomAreaM2] = useState<string>(
    matchesMode ? String(initial.roomAreaM2) : "20"
  );
  const [purifierCadr, setPurifierCadr] = useState<string>(
    matchesMode && initial.purifierCadrM3PerHour !== undefined
      ? String(initial.purifierCadrM3PerHour)
      : ""
  );
  const [hasSensitiveMember, setHasSensitiveMember] = useState<boolean>(
    matchesMode ? initial.hasSensitiveMember : false
  );

  const [alertError, setAlertError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!location) {
      setAlertError("Choose a location first.");
      return;
    }

    const cadrTrimmed = purifierCadr.trim();
    const cadrValue = cadrTrimmed ? Number(cadrTrimmed) : undefined;

    const shared = {
      location,
      commute: {
        mode: commuteMode,
        oneWayKm: Number(oneWayKm),
        daysPerWeek: Number(daysPerWeek),
      },
      heating,
      cooking,
      roomAreaM2: Number(roomAreaM2),
      ...(cadrValue !== undefined ? { purifierCadrM3PerHour: cadrValue } : {}),
      hasSensitiveMember,
    };

    const candidate =
      mode === "family"
        ? {
            ...shared,
            mode,
            members: {
              adults: Number(adults),
              children: Number(children),
              elderly: Number(elderly),
            },
          }
        : {
            ...shared,
            mode,
            households: Number(households),
          };

    const parseResult = profileSchema.safeParse(candidate);
    if (!parseResult.success) {
      const issuePaths = Array.from(
        new Set(parseResult.error.issues.map((issue) => issue.path.join(".")).filter(Boolean))
      );
      setAlertError(issuePaths.length > 0 ? `Invalid fields: ${issuePaths.join(", ")}` : "Invalid input");
      return;
    }

    setAlertError(null);
    onSubmit(parseResult.data);
  };

  return (
    <form onSubmit={handleSubmit} className="profile-form" noValidate>
      {mode === "community" ? (
        <p>This plan is for the whole community or building.</p>
      ) : (
        <p>This plan is for your household.</p>
      )}

      {alertError && <p role="alert">{alertError}</p>}

      <fieldset className="form-group">
        <legend>Location</legend>
        <LocationSearch onSelect={setLocation} selected={location} />
      </fieldset>

      {mode === "family" ? (
        <fieldset className="form-group">
          <legend>Household members</legend>
          <div>
            <label htmlFor="family-adults">Adults</label>
            <input
              id="family-adults"
              type="number"
              min="1"
              max="10"
              value={adults}
              onChange={(e) => setAdults(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="family-children">Children</label>
            <input
              id="family-children"
              type="number"
              min="0"
              max="10"
              value={children}
              onChange={(e) => setChildren(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="family-elderly">Elderly</label>
            <input
              id="family-elderly"
              type="number"
              min="0"
              max="10"
              value={elderly}
              onChange={(e) => setElderly(e.target.value)}
            />
          </div>
        </fieldset>
      ) : (
        <div className="form-group">
          <label htmlFor="community-households">Households</label>
          <input
            id="community-households"
            type="number"
            min="2"
            max="10000"
            value={households}
            onChange={(e) => setHouseholds(e.target.value)}
          />
        </div>
      )}

      <fieldset className="form-group">
        <legend>Daily commute</legend>
        <div>
          <label htmlFor="commute-mode">Commute mode</label>
          <select
            id="commute-mode"
            value={commuteMode}
            onChange={(e) => {
              const v = pickOption(COMMUTE_OPTIONS, e.target.value);
              if (v) setCommuteMode(v);
            }}
          >
            {COMMUTE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="commute-km">One-way distance (km)</label>
          <input
            id="commute-km"
            type="number"
            min="0"
            max="200"
            value={oneWayKm}
            onChange={(e) => setOneWayKm(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="commute-days">Days per week</label>
          <input
            id="commute-days"
            type="number"
            min="0"
            max="7"
            value={daysPerWeek}
            onChange={(e) => setDaysPerWeek(e.target.value)}
          />
        </div>
      </fieldset>

      <fieldset className="form-group">
        <legend>Home and heating</legend>
        <div>
          <label htmlFor="heating-mode">Heating</label>
          <select
            id="heating-mode"
            value={heating}
            onChange={(e) => {
              const v = pickOption(HEATING_OPTIONS, e.target.value);
              if (v) setHeating(v);
            }}
          >
            {HEATING_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="cooking-mode">Cooking</label>
          <select
            id="cooking-mode"
            value={cooking}
            onChange={(e) => {
              const v = pickOption(COOKING_OPTIONS, e.target.value);
              if (v) setCooking(v);
            }}
          >
            {COOKING_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="room-area">Room area (m²)</label>
          <input
            id="room-area"
            type="number"
            min="4"
            max="200"
            value={roomAreaM2}
            onChange={(e) => setRoomAreaM2(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="purifier-cadr">Air purifier CADR (m³/h, optional)</label>
          <input
            id="purifier-cadr"
            type="number"
            min="10"
            max="1000"
            value={purifierCadr}
            onChange={(e) => setPurifierCadr(e.target.value)}
          />
        </div>
      </fieldset>

      <div className="form-group checkbox-group">
        <label htmlFor="sensitive-member">
          <input
            id="sensitive-member"
            type="checkbox"
            checked={hasSensitiveMember}
            onChange={(e) => setHasSensitiveMember(e.target.checked)}
          />
          Someone sensitive lives here
        </label>
      </div>

      <button type="submit" disabled={submitting}>
        {submitting ? "Building plan…" : "Get air quality plan"}
      </button>
    </form>
  );
}
