const propertyImage1 = "https://res.cloudinary.com/dzisksq78/image/upload/v1781939094/Property_Image_1_wbetmo.jpg";
const propertyImage2 = "https://res.cloudinary.com/dzisksq78/image/upload/v1781939094/Property_Image_2_mjznar.jpg";
const eastFacePlan = "https://res.cloudinary.com/dzisksq78/image/upload/v1781939095/East_Face_dbfatm.jpg";
const westFacePlan = "https://res.cloudinary.com/dzisksq78/image/upload/v1781939095/West_Face_acvhma.jpg";
const featuresSheet = "https://res.cloudinary.com/dzisksq78/image/upload/v1781939095/Features_e4g9kw.jpg";
const mapSheet = "https://res.cloudinary.com/dzisksq78/image/upload/v1781939095/Map_lxrtic.jpg";

export const mockUser = {
  id: "demo-user-001",
  phone: "9999900001",
  name: "Rajesh Kumar",
  email: "rajesh.demo@rivanreality.com",
  address: "Achutapuram, Visakhapatnam",
  kyc_status: "verified",
  is_admin: false,
  created_at: new Date().toISOString(),
};

export const mockProperties = [
  {
    id: "prop-1",
    name: "Sripuram Gardens Independent House",
    category: "Independent House",
    location: "Achutapuram, Visakhapatnam",
    starting_price: 1600000,
    size: "840 sq.ft",
    plot_number: "IH-001",
    image: propertyImage1,
    images: [propertyImage1, propertyImage2],
    videoUrl: undefined,
    description:
      "A compact independent house format designed around an 840 sq.ft plan with two bedrooms, drawing space, dining, kitchen, and portico. The east-face and west-face options keep the same practical footprint while letting buyers choose the frontage that suits their plot and access needs.",
    survey_number: "L.P. No. 3/2011",
    facing: "East Face / West Face",
    road_width: "40-60 ft internal roads",
    availability: "Ready for enquiry",
    featured: true,
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
    highlights: "East and west facing independent house options",
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
    mapBlocks: [
      { id: "blk-101", label: "101", x: 41.5, y: 12.4, w: 2.2, h: 3.6, status: "available", size: "267 sq.yd", facing: "East", price: 1600000 },
      { id: "blk-102", label: "102", x: 44.1, y: 12.4, w: 2.2, h: 3.6, status: "available", size: "333 sq.yd", facing: "East", price: 1780000 },
      { id: "blk-103", label: "103", x: 46.7, y: 12.4, w: 2.2, h: 3.6, status: "reserved", size: "190 sq.yd", facing: "North", price: 1690000 },
      { id: "blk-104", label: "104", x: 49.3, y: 12.4, w: 2.2, h: 3.6, status: "available", size: "205 sq.yd", facing: "West", price: 1710000 },
      { id: "blk-105", label: "105", x: 41.5, y: 16.6, w: 2.2, h: 3.6, status: "available", size: "150 sq.yd", facing: "East", price: 1600000 },
      { id: "blk-106", label: "106", x: 44.1, y: 16.6, w: 2.2, h: 3.6, status: "booked", size: "167 sq.yd", facing: "South", price: 1650000 },
      { id: "blk-107", label: "107", x: 46.7, y: 16.6, w: 2.2, h: 3.6, status: "available", size: "128 sq.yd", facing: "East", price: 1600000 },
      { id: "blk-108", label: "108", x: 49.3, y: 16.6, w: 2.2, h: 3.6, status: "sold", size: "90 sq.yd", facing: "North", price: 1600000 },
      { id: "blk-201", label: "201", x: 56.7, y: 12.0, w: 2.0, h: 3.5, status: "available", size: "150 sq.yd", facing: "East", price: 1600000 },
      { id: "blk-202", label: "202", x: 59.1, y: 12.0, w: 2.0, h: 3.5, status: "available", size: "167 sq.yd", facing: "East", price: 1640000 },
      { id: "blk-203", label: "203", x: 61.5, y: 12.0, w: 2.0, h: 3.5, status: "reserved", size: "178 sq.yd", facing: "West", price: 1690000 },
      { id: "blk-204", label: "204", x: 63.9, y: 12.0, w: 2.0, h: 3.5, status: "available", size: "123 sq.yd", facing: "East", price: 1600000 },
      { id: "blk-205", label: "205", x: 56.7, y: 16.1, w: 2.0, h: 3.5, status: "available", size: "111 sq.yd", facing: "North", price: 1600000 },
      { id: "blk-206", label: "206", x: 59.1, y: 16.1, w: 2.0, h: 3.5, status: "booked", size: "112 sq.yd", facing: "South", price: 1600000 },
      { id: "blk-207", label: "207", x: 61.5, y: 16.1, w: 2.0, h: 3.5, status: "available", size: "113 sq.yd", facing: "East", price: 1600000 },
      { id: "blk-208", label: "208", x: 63.9, y: 16.1, w: 2.0, h: 3.5, status: "available", size: "114 sq.yd", facing: "West", price: 1620000 },
      { id: "blk-301", label: "301", x: 55.8, y: 58.8, w: 1.8, h: 3.1, status: "available", size: "175 sq.yd", facing: "East", price: 1680000 },
      { id: "blk-302", label: "302", x: 58.0, y: 58.8, w: 1.8, h: 3.1, status: "available", size: "150 sq.yd", facing: "East", price: 1600000 },
      { id: "blk-303", label: "303", x: 60.2, y: 58.8, w: 1.8, h: 3.1, status: "reserved", size: "167 sq.yd", facing: "South", price: 1650000 },
      { id: "blk-304", label: "304", x: 62.4, y: 58.8, w: 1.8, h: 3.1, status: "available", size: "206 sq.yd", facing: "East", price: 1790000 },
    ],
    featuresImage: featuresSheet,
    availabilityImage: mapSheet,
  },
];

export const mockFeaturedProperties = mockProperties.filter((p) => p.featured);

export const mockNotifications = [
  {
    id: "notif-1",
    title: "Welcome to Rivan Reality",
    body: "Explore the live Sripuram Gardens independent house listing locally.",
    type: "welcome",
    read: false,
    created_at: new Date().toISOString(),
  },
];

export function findMockPropertyById(id?: string) {
  return mockProperties.find((property) => property.id === id) || null;
}
