export type PropertyPlan = {
  id: string;
  title: string;
  image?: string;
  description?: string;
};

export type NormalizedProperty = {
  id: string;
  name: string;
  location: string;
  category: string;
  startingPrice?: number;
  size?: string;
  plotNumber?: string;
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
  availabilityImage?: string;
  featuresImage?: string;
};

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
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function imageList(input: any) {
  const images = Array.isArray(input?.images) ? input.images : [];
  const normalized = images
    .map((item: any) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item.url === "string") return item.url.trim();
      if (item && typeof item.image === "string") return item.image.trim();
      return "";
    })
    .filter(Boolean);

  const hero = firstString(input?.image, input?.hero_image, input?.cover_image);
  if (hero && !normalized.includes(hero)) normalized.unshift(hero);
  return normalized;
}

function normalizePlans(value: unknown): PropertyPlan[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item: any, index) => ({
      id: firstString(item?.id, item?._id, `plan-${index + 1}`),
      title: firstString(item?.title, item?.name, `Plan ${index + 1}`),
      image: firstString(item?.image, item?.url),
      description: firstString(item?.description, item?.summary),
    }))
    .filter((item) => item.title);
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
    plotNumber: firstString(input.plot_number, input.plot_no, input.unit_number),
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
    availabilityImage: firstString(input.availabilityImage, input.availability_image),
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
