export type PropertyPlan = {
  id: string;
  title: string;
  image?: string;
  description?: string;
};

export type PropertyMapBlock = {
  id: string;
  label: string;
  sizeSqYd: number;
  size: string;
  facing: string;
  status: "available" | "reserved" | "booked" | "sold";
  price: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type NormalizedProperty = {
  id: string;
  name: string;
  location: string;
  category: string;
  startingPrice?: number;
  size?: string;
  image?: string;
  images: string[];
  videoUrl?: string;
  description?: string;
  facing?: string;
  roadWidth?: string;
  availability?: string;
  featured?: boolean;
  amenities: string[];
  approvals: string[];
  nearby: string[];
  highlights?: string;
  layoutPlans: PropertyPlan[];
  featuresImage?: string;
  mapBlocks?: PropertyMapBlock[];
};

export function isSiripuramProperty(property: Pick<NormalizedProperty, "id" | "name" | "location"> | null | undefined) {
  if (!property) return false;
  const id = String(property.id || "").toLowerCase();
  const name = String(property.name || "").toLowerCase();
  const location = String(property.location || "").toLowerCase();
  return id === "prop-1" || name.includes("siripuram gardens") || location.includes("achutapuram");
}

const propertyImage1 = "https://res.cloudinary.com/dzisksq78/image/upload/v1781939094/Property_Image_1_wbetmo.jpg";
const propertyImage2 = "https://res.cloudinary.com/dzisksq78/image/upload/v1781939094/Property_Image_2_mjznar.jpg";
const eastFacePlan = "https://res.cloudinary.com/dzisksq78/image/upload/v1781939095/East_Face_dbfatm.jpg";
const westFacePlan = "https://res.cloudinary.com/dzisksq78/image/upload/v1781939095/West_Face_acvhma.jpg";
const featuresSheet = "https://res.cloudinary.com/dzisksq78/image/upload/v1781939095/Features_e4g9kw.jpg";

const SRIPURAM_PLOT_SQYDS = [
  747, 757, 744, 765, 879, 1339, 1343, 1233, 1129, 287, 292, 1816, 1667, 3148, 622, 444, 444, 444, 444, 444, 444,
  444, 444, 533, 533, 444, 444, 444, 444, 444, 444, 444, 444, 622, 400, 267, 267, 267, 267, 267, 267, 267, 267, 267,
  267, 467, 467, 267, 267, 267, 267, 267, 267, 267, 267, 267, 267, 400, 333, 167, 167, 167, 167, 167, 167, 167, 167,
  167, 278, 278, 167, 167, 167, 167, 167, 167, 167, 167, 167, 333, 333, 167, 167, 167, 167, 167, 167, 167, 167, 167,
  278, 278, 167, 167, 167, 167, 167, 167, 167, 167, 167, 167, 333, 300, 150, 150, 150, 150, 150, 150, 150, 150, 150,
  250, 250, 150, 150, 150, 150, 150, 150, 150, 150, 150, 300, 300, 150, 150, 150, 150, 150, 150, 150, 150, 150, 250,
  250, 150, 150, 150, 150, 150, 150, 150, 150, 150, 300, 426, 124, 139, 153, 168, 182, 188, 190, 257, 361, 368, 978,
  1222, 533, 356, 356, 356, 356, 356, 356, 474, 655, 356, 356, 356, 356, 356, 356, 533, 400, 200, 200, 200, 200, 200,
  200, 200, 200, 200, 301, 307, 200, 200, 200, 200, 200, 200, 200, 200, 200, 400, 261, 167, 167, 167, 167, 167, 167,
  167, 167, 167, 167, 169, 172, 167, 167, 167, 167, 167, 167, 167, 167, 167, 167, 261, 261, 167, 167, 167, 167, 167,
  167, 167, 167, 167, 167, 179, 183, 167, 167, 167, 167, 167, 167, 167, 167, 167, 167, 261, 235, 150, 150, 150, 150,
  150, 150, 150, 150, 150, 150, 171, 175, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 235, 235, 150, 150, 150,
  150, 150, 150, 150, 150, 150, 150, 179, 183, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 235, 267, 167, 167,
  167, 167, 167, 167, 167, 167, 167, 167, 167, 167, 167, 167, 167, 167, 167, 267, 633, 633, 633, 633, 167, 289, 484,
  275, 90, 90, 90, 83, 92, 90, 90, 90, 90, 90, 90, 90, 232, 335, 90, 90, 90, 90, 90, 90, 90, 90, 95, 101, 90, 90, 90,
  90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 206, 309, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 97, 126,
  90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 204, 307, 90, 90, 90, 90, 90, 90, 90, 90, 90,
  90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 102, 102, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90,
  90, 90, 90, 90, 90, 90, 90, 228, 541, 220, 220, 220, 220, 220, 220, 220, 220, 220, 220, 220, 198,
];

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const normalized = Number(value.replace(/[^\d.]/g, ""));
      if (Number.isFinite(normalized) && normalized > 0) return normalized;
    }
  }
  return undefined;
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
}

function imageList(input: any) {
  const images = Array.isArray(input?.images) ? input.images : [];
  const normalized = images
    .map((item: any) => (typeof item === "string" ? item.trim() : typeof item?.url === "string" ? item.url.trim() : ""))
    .filter(Boolean);
  const hero = firstString(input?.image, input?.hero_image, input?.cover_image);
  if (hero && !normalized.includes(hero)) normalized.unshift(hero);
  return normalized;
}

function normalizePlans(value: unknown): PropertyPlan[] {
  if (!Array.isArray(value)) return [];
  return value.map((item: any, index) => ({
    id: firstString(item?.id, item?._id, `plan-${index + 1}`),
    title: firstString(item?.title, item?.name, `Plan ${index + 1}`),
    image: firstString(item?.image, item?.url),
    description: firstString(item?.description, item?.summary),
  }));
}

export function normalizePropertyRecord(input: any): NormalizedProperty | null {
  if (!input) return null;
  const id = firstString(input.id, input._id, input.property_id);
  const name = firstString(input.name, input.title, input.property_name);
  if (!id || !name) return null;
  const images = imageList(input);
  return {
    id,
    name,
    location: firstString(input.location, input.city, input.address),
    category: firstString(input.category, input.type, input.property_type, "Property"),
    startingPrice: firstNumber(input.starting_price, input.price_from, input.price, input.base_price),
    size: firstString(input.size, input.area, input.plot_size, input.built_up_area),
    image: images[0],
    images,
    videoUrl: firstString(input.videoUrl, input.video_url),
    description: firstString(input.description, input.long_description, input.summary),
    facing: firstString(input.facing, input.orientation),
    roadWidth: firstString(input.road_width, input.roadWidth),
    availability: firstString(input.availability, input.inventory_summary),
    featured: Boolean(input.featured),
    amenities: stringList(input.amenities),
    approvals: stringList(input.approvals),
    nearby: stringList(input.nearby),
    highlights: firstString(input.highlights, input.hero_highlight),
    layoutPlans: normalizePlans(input.layoutPlans || input.layout_plans),
    featuresImage: firstString(input.featuresImage, input.features_image),
  };
}

export function normalizePropertyCollection(payload: any): NormalizedProperty[] {
  const rawList = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload?.properties)
        ? payload.properties
        : [];
  return rawList
    .map((item: any) => normalizePropertyRecord(item))
    .filter((item: NormalizedProperty | null): item is NormalizedProperty => Boolean(item));
}

function buildSripuramMapBlocks(): PropertyMapBlock[] {
  return SRIPURAM_PLOT_SQYDS.slice(0, 120).map((sizeSqYd, index) => {
    const plotNumber = index + 1;
    const col = index % 12;
    const row = Math.floor(index / 12);
    const status =
      plotNumber % 41 === 0 ? "booked" : plotNumber % 29 === 0 ? "reserved" : plotNumber % 73 === 0 ? "sold" : "available";
    return {
      id: `sg-plot-${plotNumber}`,
      label: String(plotNumber),
      sizeSqYd,
      size: `${sizeSqYd} sq.yd`,
      facing: plotNumber % 2 === 0 ? "East" : "West",
      status,
      price: Math.round(sizeSqYd * 5200),
      x: 4 + col * 7.8,
      y: 8 + row * 5.6,
      w: 6.6,
      h: 4.2,
    };
  });
}

const REAL_PROPERTY_OVERRIDES: Record<string, Partial<NormalizedProperty>> = {
  "prop-1": {
    name: "Siripuram Gardens Independent House",
    category: "Independent House",
    location: "Achutapuram, Visakhapatnam",
    startingPrice: 1600000,
    size: "840 sq.ft",
    image: propertyImage1,
    images: [propertyImage1, propertyImage2],
    description:
      "A compact independent-house offering anchored in the Siripuram Gardens layout at Achutapuram with live availability, east-face and west-face plans, and project approval details.",
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
    nearby: ["Pudimadaka Beach - 10 min", "Kondakarla Tourist Spot - 15 min", "Steel Plant - 30 min", "Vizag Airport - 60 min"],
    highlights: "454 plotted sites with east-facing and west-facing house plan options",
    layoutPlans: [
      {
        id: "east-face",
        title: "East Face Plan",
        image: eastFacePlan,
        description: "Two-bedroom 840 sq.ft arrangement with a clean portico, drawing room, dining, kitchen, and dual toilets.",
      },
      {
        id: "west-face",
        title: "West Face Plan",
        image: westFacePlan,
        description: "West-facing 840 sq.ft option with two bedrooms, drawing/dining sequence, and compact daily-use circulation.",
      },
    ],
    featuresImage: featuresSheet,
    mapBlocks: buildSripuramMapBlocks(),
  },
};

export function getFallbackProperty(id: string): NormalizedProperty | null {
  if (!REAL_PROPERTY_OVERRIDES[id]) return null;
  return enrichProperty({
    id,
    name: "Siripuram Gardens",
    location: "Achutapuram, Visakhapatnam",
    category: "Property",
    startingPrice: undefined,
    size: "",
    image: "",
    images: [],
    description: "",
    facing: "",
    roadWidth: "",
    availability: "",
    featured: true,
    amenities: [],
    approvals: [],
    nearby: [],
    highlights: "",
    layoutPlans: [],
    featuresImage: "",
    mapBlocks: [],
  });
}

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
