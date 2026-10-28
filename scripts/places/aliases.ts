// Names people say that are not a place of their own (#1700): sections of a
// city and post-office names, each pointing at the municipality it is in.
// Searching one finds the municipality, shown as "Ironbound (Newark, Essex
// Co., NJ)", and the answer is the municipality.
//
// Keyed by the places row key (scripts/places/build.ts). Only names that are
// not already a place: Short Hills, Princeton Junction and most other post
// office names are Census CDPs and are found on their own. A name is listed
// under the one municipality its post office or section is in, never two.
//
// Curated by hand. Add a section only where it lies wholly in one
// municipality; a name that spans several belongs in a neighborhood dataset,
// not here.

export const PLACE_ALIASES: Record<
  string,
  { place: string; aliases: string[] }
> = {
  // Newark: its wards and best-known sections.
  "place:3451000": {
    place: "Newark, Essex Co., NJ",
    aliases: [
      "Ironbound",
      "Down Neck",
      "Forest Hill",
      "Vailsburg",
      "Weequahic",
      "Roseville",
      "Clinton Hill",
      "University Heights",
      "Lower Broadway",
      "North Ward",
      "South Ward",
      "East Ward",
      "West Ward",
      "Central Ward",
    ],
  },
  "place:3436000": {
    place: "Jersey City, Hudson Co., NJ",
    aliases: [
      "Journal Square",
      "The Heights",
      "Jersey City Heights",
      "Downtown Jersey City",
      "Paulus Hook",
      "Hamilton Park",
      "Harsimus Cove",
      "Van Vorst Park",
      "Newport",
      "Exchange Place",
      "Bergen-Lafayette",
      "Greenville",
      "West Side",
      "McGinley Square",
    ],
  },
  "place:3421000": {
    place: "Elizabeth, Union Co., NJ",
    aliases: ["Elizabethport", "Elmora", "Peterstown", "Bayway"],
  },
  "place:3474000": {
    place: "Trenton, Mercer Co., NJ",
    aliases: ["Chambersburg", "Mill Hill"],
  },
  "place:3410000": {
    place: "Camden, Camden Co., NJ",
    aliases: ["Cramer Hill", "Parkside", "Waterfront South"],
  },
  // Post-office names that are no Census place.
  "cousub:3401962250": {
    place: "Readington Twp, Hunterdon Co., NJ",
    aliases: ["Whitehouse Station"],
  },
  "cousub:3402905305": {
    place: "Berkeley Twp, Ocean Co., NJ",
    aliases: ["Bayville"],
  },
  "cousub:3402937380": {
    place: "Lacey Twp, Ocean Co., NJ",
    aliases: ["Lanoka Harbor"],
  },
  "cousub:3403729850": {
    place: "Hardyston Twp, Sussex Co., NJ",
    aliases: ["Stockholm"],
  },
};
