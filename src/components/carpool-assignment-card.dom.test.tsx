import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { CarpoolAssignmentCard } from "./carpool-assignment-card";
import { NOT_IN_A_CAR_YET } from "@/lib/carpool-assignment";
import { CARPOOL_COST_NOTICE_HEADING } from "@/lib/event-carpools";

const NOTICE = ["Costs are split in the car."];

describe("CarpoolAssignmentCard (#1651)", () => {
  test("shows the car, the driver and the riders, then the notice", () => {
    render(
      <CarpoolAssignmentCard
        orgName="Chatter Snow"
        notice={NOTICE}
        carpool={{
          notice: null,
          car: {
            carLabel: "Car 2",
            leavingFrom: "Union Square",
            role: "passenger",
            partySize: 1,
            driver: {
              firstName: "Dana",
              instagramHandle: "dana.drives",
              hasNoInstagram: false,
              partySize: 1,
            },
            riders: [
              {
                firstName: "Pat",
                instagramHandle: null,
                hasNoInstagram: true,
                partySize: 2,
              },
            ],
          },
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Your carpool" })).toBeVisible();
    expect(screen.getByText("Car 2")).toBeVisible();
    expect(screen.getByText("Union Square")).toBeVisible();
    expect(screen.getByText("You're a passenger")).toBeVisible();
    expect(screen.getByText(/· @dana\.drives/)).toBeVisible();
    expect(
      screen.getByText("Pat (party of 2)", { exact: false }),
    ).toBeVisible();
    expect(
      screen.getByText(/No Instagram — ask Chatter Snow to connect you/),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: CARPOOL_COST_NOTICE_HEADING }),
    ).toBeVisible();
  });

  test("says so to somebody not in a car yet", () => {
    render(
      <CarpoolAssignmentCard
        orgName="Chatter Snow"
        notice={NOTICE}
        carpool={{ car: null, notice: null }}
      />,
    );
    expect(screen.getByText(NOT_IN_A_CAR_YET)).toBeVisible();
    expect(screen.queryByText("Your role")).toBeNull();
  });
});
