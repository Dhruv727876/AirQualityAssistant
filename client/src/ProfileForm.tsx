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

interface NumberFieldProps {
  id: string;
  label: string;
  value: string;
  min: string;
  max: string;
  onChange: (value: string) => void;
}

function NumberField({ id, label, value, min, max, onChange }: NumberFieldProps) {
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

interface SelectFieldProps<T extends string> {
  id: string;
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}

function SelectField<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
}: SelectFieldProps<T>) {
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(e) => {
          const match = options.find((o) => o.value === e.target.value);
          if (match) {
            onChange(match.value);
          }
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
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
          <NumberField
            id="family-adults"
            label="Adults"
            value={adults}
            min="1"
            max="10"
            onChange={setAdults}
          />
          <NumberField
            id="family-children"
            label="Children"
            value={children}
            min="0"
            max="10"
            onChange={setChildren}
          />
          <NumberField
            id="family-elderly"
            label="Elderly"
            value={elderly}
            min="0"
            max="10"
            onChange={setElderly}
          />
        </fieldset>
      ) : (
        <div className="form-group">
          <NumberField
            id="community-households"
            label="Households"
            value={households}
            min="2"
            max="10000"
            onChange={setHouseholds}
          />
        </div>
      )}

      <fieldset className="form-group">
        <legend>Daily commute</legend>
        <SelectField
          id="commute-mode"
          label="Commute mode"
          value={commuteMode}
          options={COMMUTE_OPTIONS}
          onChange={setCommuteMode}
        />
        <NumberField
          id="commute-km"
          label="One-way distance (km)"
          value={oneWayKm}
          min="0"
          max="200"
          onChange={setOneWayKm}
        />
        <NumberField
          id="commute-days"
          label="Days per week"
          value={daysPerWeek}
          min="0"
          max="7"
          onChange={setDaysPerWeek}
        />
      </fieldset>

      <fieldset className="form-group">
        <legend>Home and heating</legend>
        <SelectField
          id="heating-mode"
          label="Heating"
          value={heating}
          options={HEATING_OPTIONS}
          onChange={setHeating}
        />
        <SelectField
          id="cooking-mode"
          label="Cooking"
          value={cooking}
          options={COOKING_OPTIONS}
          onChange={setCooking}
        />
        <NumberField
          id="room-area"
          label="Room area (m²)"
          value={roomAreaM2}
          min="4"
          max="200"
          onChange={setRoomAreaM2}
        />
        <NumberField
          id="purifier-cadr"
          label="Air purifier CADR (m³/h, optional)"
          value={purifierCadr}
          min="10"
          max="1000"
          onChange={setPurifierCadr}
        />
      </fieldset>

      <div className="form-group checkbox-group">
        <label htmlFor="sensitive-member">
          <input
            id="sensitive-member"
            type="checkbox"
            checked={hasSensitiveMember}
            onChange={(e) => setHasSensitiveMember(e.target.checked)}
          />
          {mode === "community"
            ? "Some residents are sensitive to air pollution"
            : "Someone sensitive lives here"}
        </label>
      </div>

      <button type="submit" disabled={submitting}>
        {submitting ? "Building plan…" : "Get air quality plan"}
      </button>
    </form>
  );
}
