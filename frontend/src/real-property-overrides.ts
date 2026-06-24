import { buildSripuramMapBlocks } from "@/src/sripuram-layout";
import type { NormalizedProperty, PropertyMapBlock } from "@/src/property-presenter";

const propertyImage1 = "https://res.cloudinary.com/dzisksq78/image/upload/v1781939094/Property_Image_1_wbetmo.jpg";
const propertyImage2 = "https://res.cloudinary.com/dzisksq78/image/upload/v1781939094/Property_Image_2_mjznar.jpg";
const eastFacePlan = "https://res.cloudinary.com/dzisksq78/image/upload/v1781939095/East_Face_dbfatm.jpg";
const westFacePlan = "https://res.cloudinary.com/dzisksq78/image/upload/v1781939095/West_Face_acvhma.jpg";
const featuresSheet = "https://res.cloudinary.com/dzisksq78/image/upload/v1781939095/Features_e4g9kw.jpg";

type PropertyOverride = Partial<NormalizedProperty> & {
  mapBlocks?: PropertyMapBlock[];
};

const sripuramMapBlocks = buildSripuramMapBlocks();

export const REAL_PROPERTY_OVERRIDES: Record<string, PropertyOverride> = {
  "prop-1": {
    name: "Siripuram Gardens Independent House",
    category: "Independent House",
    location: "Achutapuram, Visakhapatnam",
    startingPrice: 1600000,
    size: "840 sq.ft",
    image: propertyImage1,
    images: [propertyImage1, propertyImage2],
    description:
      "A compact independent-house offering anchored in the Siripuram Gardens layout at Achutapuram. Buyers can review house elevations, east-face and west-face plans, live plot availability, and approval-ready layout details without leaving the core property journey.",
    facing: "East Face / West Face",
    roadWidth: "40-60 ft internal roads",
    availability: "454 plotted sites ready for enquiry",
    amenities: [
      "100% clear vaasthu planning",
      "Street lighting with transformer connections",
      "Overhead water tank with 24-hour water supply",
      "Underground drainage system",
      "Rain-water harvesting",
      "Landscaping and plantation",
    ],
    approvals: ["VUDA approved layout", "Clear title layout planning"],
    nearby: [
      "Pudimadaka Beach - 10 min",
      "Kondakarla Tourist Spot - 15 min",
      "Steel Plant - 30 min",
      "Vizag Airport - 60 min",
    ],
    highlights: "454 plotted sites with east-facing and west-facing house plan options",
    layoutPlans: [
      {
        id: "east-face",
        title: "East Face Plan",
        image: eastFacePlan,
        description:
          "Two-bedroom 840 sq.ft arrangement with front portico access, central drawing room, dining beside the kitchen, and dual toilets placed toward the rear private zone.",
      },
      {
        id: "west-face",
        title: "West Face Plan",
        image: westFacePlan,
        description:
          "840 sq.ft west-facing option with drawing and dining at the entry side, one front bedroom, one rear bedroom, and kitchen plus toilets aligned for a compact daily-use circulation.",
      },
    ],
    featuresImage: featuresSheet,
    mapBlocks: sripuramMapBlocks,
  },
};

export function enrichProperty(property: NormalizedProperty | null): NormalizedProperty | null {
  if (!property) return null;
  const override = REAL_PROPERTY_OVERRIDES[property.id];
  if (!override) return property;

  return {
    ...property,
    ...override,
    images: override.images?.length ? override.images : property.images,
    amenities: override.amenities?.length ? override.amenities : property.amenities,
    approvals: override.approvals?.length ? override.approvals : property.approvals,
    nearby: override.nearby?.length ? override.nearby : property.nearby,
    layoutPlans: override.layoutPlans?.length ? override.layoutPlans : property.layoutPlans,
  };
}

export function enrichPropertyCollection(properties: NormalizedProperty[]) {
  return properties.map((property) => enrichProperty(property)).filter((property): property is NormalizedProperty => Boolean(property));
}

export function getPropertyMapBlocks(propertyId?: string) {
  return propertyId ? REAL_PROPERTY_OVERRIDES[propertyId]?.mapBlocks || [] : [];
}
