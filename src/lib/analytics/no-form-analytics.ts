/**
 * A page carrying this attribute sends no form events (#1764): the staff
 * preview of an event, whose test registrations are not visitors. Its own
 * module so a server component can set it without importing the client-side
 * sender in `form-events.ts`.
 */
export const NO_FORM_ANALYTICS_ATTRIBUTE = "data-no-form-analytics";
