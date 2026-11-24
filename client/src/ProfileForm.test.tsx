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

  it("sensitive checkbox label matches the selected mode", () => {
    const { unmount } = render(
      <ProfileForm
        mode="community"
        initial={null}
        onSubmit={vi.fn()}
        submitting={false}
      />
    );

    expect(
      screen.getByLabelText("Some residents are sensitive to air pollution")
    ).toBeDefined();

    unmount();

    render(
      <ProfileForm
        mode="family"
        initial={null}
        onSubmit={vi.fn()}
        submitting={false}
      />
    );

    expect(
      screen.getByLabelText("Someone sensitive lives here")
    ).toBeDefined();
  });

  it("failed submit sets aria-invalid and aria-describedby pointing to error alert", () => {
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

    expect(adultsInput.getAttribute("aria-invalid")).toBe("true");
    expect(adultsInput.getAttribute("aria-describedby")).toBe("form-error");

    const alert = screen.getByRole("alert");
    expect(alert.id).toBe("form-error");
    expect(alert.textContent).toContain("Invalid fields: members.adults");
  });

  it("failed submit moves focus to the first invalid field", () => {
    render(
      <ProfileForm
        mode="family"
        initial={sampleProfile}
        onSubmit={vi.fn()}
        submitting={false}
      />
    );

    const adultsInput = screen.getByLabelText("Adults");
    fireEvent.change(adultsInput, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Get air quality plan" }));

    expect(document.activeElement).toBe(adultsInput);
  });

  it("valid fields do not have aria-invalid attribute", () => {
    render(
      <ProfileForm
        mode="family"
        initial={sampleProfile}
        onSubmit={vi.fn()}
        submitting={false}
      />
    );

    const adultsInput = screen.getByLabelText("Adults");
    const childrenInput = screen.getByLabelText("Children");

    fireEvent.change(adultsInput, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Get air quality plan" }));

    expect(childrenInput.hasAttribute("aria-invalid")).toBe(false);
    expect(childrenInput.hasAttribute("aria-describedby")).toBe(false);
  });

  it("changing select fields and toggling sensitive checkbox updates submitted profile", () => {
    const handleSubmit = vi.fn();
    render(
      <ProfileForm
        mode="family"
        initial={sampleProfile}
        onSubmit={handleSubmit}
        submitting={false}
      />
    );

    const commuteSelect = screen.getByLabelText("Commute mode");
    fireEvent.change(commuteSelect, { target: { value: "public-transport" } });

    const heatingSelect = screen.getByLabelText("Heating");
    fireEvent.change(heatingSelect, { target: { value: "gas" } });

    const cookingSelect = screen.getByLabelText("Cooking");
    fireEvent.change(cookingSelect, { target: { value: "electric" } });

    const sensitiveCheckbox = screen.getByLabelText("Someone sensitive lives here");
    fireEvent.click(sensitiveCheckbox);

    fireEvent.click(screen.getByRole("button", { name: "Get air quality plan" }));

    expect(handleSubmit).toHaveBeenCalledWith({
      ...sampleProfile,
      commute: {
        ...sampleProfile.commute,
        mode: "public-transport",
      },
      heating: "gas",
      cooking: "electric",
      hasSensitiveMember: false,
    });
  });

  it("submitting community form with invalid households shows error", () => {
    const handleSubmit = vi.fn();
    render(
      <ProfileForm
        mode="community"
        initial={{
          mode: "community",
          location: { name: "City Center", latitude: 10, longitude: 20 },
          commute: { mode: "car", oneWayKm: 5, daysPerWeek: 5 },
          heating: "none",
          cooking: "gas",
          roomAreaM2: 25,
          hasSensitiveMember: false,
          households: 50,
        }}
        onSubmit={handleSubmit}
        submitting={false}
      />
    );

    const householdsInput = screen.getByLabelText("Households");
    fireEvent.change(householdsInput, { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Get air quality plan" }));

    expect(handleSubmit).not.toHaveBeenCalled();
    expect(householdsInput.getAttribute("aria-invalid")).toBe("true");
  });
});
