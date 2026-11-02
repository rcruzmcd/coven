// The impact metric definitions moved to src/lib/portal/impact-metrics.ts so the
// per-event Results card and this program rollup compute every figure with the
// same functions instead of two implementations that agree only by comment.
// This module stays as the reports page's import surface.
export {
  toNumber,
  sumDistributedQuantity,
  sumVolunteerHours,
  countRepeatParticipants,
  countCheckedIn,
  computeParticipants,
  computeFirstTimeParticipants,
  countSubsidizedTickets,
  countVolunteerParticipants,
  countRentalSubsidies,
  computeParticipantAssistance,
  computeDiscountValueOffered,
  computeProgramImpactRollup,
} from "@/lib/portal/impact-metrics";

export type {
  AssistanceExpenseRow,
  DistributedMovementRow,
  VolunteerHoursRow,
  RegistrationRow,
  EventRow,
  CheckinCountRow,
  DiscountCodeRow,
  OfferedCodeRow,
  PersonEventRow,
  PricedOptionCountRow,
  ProgramImpactRollup,
  ProgramImpactRollupInput,
} from "@/lib/portal/impact-metrics";
