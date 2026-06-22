import { buildSripuramMapBlocks } from "@/src/sripuram-layout";

const propertyImage1 = "https://res.cloudinary.com/dzisksq78/image/upload/v1781939094/Property_Image_1_wbetmo.jpg";
const propertyImage2 = "https://res.cloudinary.com/dzisksq78/image/upload/v1781939094/Property_Image_2_mjznar.jpg";
const eastFacePlan = "https://res.cloudinary.com/dzisksq78/image/upload/v1781939095/East_Face_dbfatm.jpg";
const westFacePlan = "https://res.cloudinary.com/dzisksq78/image/upload/v1781939095/West_Face_acvhma.jpg";
const featuresSheet = "https://res.cloudinary.com/dzisksq78/image/upload/v1781939095/Features_e4g9kw.jpg";
const mapSheet = "https://res.cloudinary.com/dzisksq78/image/upload/v1781939095/Map_lxrtic.jpg";
const sripuramMapBlocks = buildSripuramMapBlocks();

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
    availability: "454 plotted sites ready for enquiry",
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
    highlights: "454 plotted sites with east and west facing options",
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
    mapBlocks: sripuramMapBlocks,
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
