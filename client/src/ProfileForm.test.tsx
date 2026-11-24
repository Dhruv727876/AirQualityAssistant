import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProfileForm } from "./ProfileForm";
import { sampleProfile } from "./testData";
import type { Profile } from "./profile";

describe("ProfileForm", () => {
  it("invalid submit shows the alert and doesn't call onSubmit", () => {
    const handleSubmit = vi.fn();
    render(
      <ProfileForm
        mode="family"
        initial={null}
        onSubmit={handleSubmit}
        submitting={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Get air quality plan" }));

    expect(handleSubmit).not.toHaveBeenCalled();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("Choose a location first.");
  });

  it("initial with adults 0 shows validation alert and does not submit", () => {
    const handleSubmit = vi.fn();
    render(
      <ProfileForm
        mode="family"
        initial={sampleProfile}
        onSubmit={handleSubmit}
        submitting={false}
      />
    );

    const adultsInput = screen.getByLabelText("Adults");
    fireEvent.change(adultsInput, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Get air quality plan" }));

    expect(handleSubmit).not.toHaveBeenCalled();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("Invalid fields: members.adults");
  });

  it("submitting with CADR calls onSubmit with purifierCadrM3PerHour", () => {
    const handleSubmit = vi.fn();
    render(
      <ProfileForm
        mode="family"
        initial={sampleProfile}
        onSubmit={handleSubmit}
        submitting={false}
      />
    );

    const cadrInput = screen.getByLabelText("Air purifier CADR (m³/h, optional)");
    fireEvent.change(cadrInput, { target: { value: "200" } });
    fireEvent.click(screen.getByRole("button", { name: "Get air quality plan" }));

    expect(handleSubmit).toHaveBeenCalledWith({
      ...sampleProfile,
      purifierCadrM3PerHour: 200,
    });
  });

  it("a valid submit builds the expected family profile and community profile", () => {
    const handleFamilySubmit = vi.fn();
    const { unmount } = render(
      <ProfileForm
        mode="family"
        initial={sampleProfile}
        onSubmit={handleFamilySubmit}
        submitting={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Get air quality plan" }));
    expect(handleFamilySubmit).toHaveBeenCalledWith(sampleProfile);

    unmount();

    const communitySample: Profile = {
      mode: "community",
      location: {
        name: "Community Tower",
        latitude: 12.97,
        longitude: 77.59,
      },
      commute: {
        mode: "public-transport",
        oneWayKm: 8,
        daysPerWeek: 4,
      },
      heating: "none",
      cooking: "electric",
      roomAreaM2: 30,
      hasSensitiveMember: false,
      households: 50,
    };

    const handleCommunitySubmit = vi.fn();
    render(
      <ProfileForm
        mode="community"
        initial={communitySample}
        onSubmit={handleCommunitySubmit}
        submitting={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Get air quality plan" }));
    expect(handleCommunitySubmit).toHaveBeenCalledWith(communitySample);
  });

  it("initial prefills only when the mode matches", () => {
    // Mode mismatch: community mode with family initial
    const { unmount } = render(
      <ProfileForm
        mode="community"
        initial={sampleProfile}
        onSubmit={vi.fn()}
        submitting={false}
      />
    );

    const householdsInput = screen.getByLabelText("Households");
    expect(householdsInput).toHaveProperty("value", "10");
    expect(screen.queryByText("Selected location: Delhi")).toBeNull();

    unmount();

    // Mode match: family mode with family initial
    render(
      <ProfileForm
        mode="family"
        initial={sampleProfile}
        onSubmit={vi.fn()}
        submitting={false}
      />
    );

    expect(screen.getByLabelText("Adults")).toHaveProperty("value", "2");
    expect(screen.getByText("Selected location: Delhi")).toBeDefined();
  });
});
