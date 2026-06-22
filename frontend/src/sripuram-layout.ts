const SRIPURAM_PLOT_SQYDS = [
  747, 757, 744, 765, 879, 1339, 1343, 1233, 1129, 287, 292, 1816, 1667, 3148, 622, 444, 444, 444, 444, 444,
  444, 444, 444, 533, 533, 444, 444, 444, 444, 444, 444, 444, 444, 622, 400, 267, 267, 267, 267, 267, 267, 267,
  267, 267, 267, 467, 467, 267, 267, 267, 267, 267, 267, 267, 267, 267, 267, 400, 333, 167, 167, 167, 167, 167,
  167, 167, 167, 167, 278, 278, 167, 167, 167, 167, 167, 167, 167, 167, 167, 333, 333, 167, 167, 167, 167, 167,
  167, 167, 167, 167, 278, 278, 167, 167, 167, 167, 167, 167, 167, 167, 167, 167, 333, 300, 150, 150, 150, 150,
  150, 150, 150, 150, 150, 250, 250, 150, 150, 150, 150, 150, 150, 150, 150, 150, 300, 300, 150, 150, 150, 150,
  150, 150, 150, 150, 150, 250, 250, 150, 150, 150, 150, 150, 150, 150, 150, 150, 300, 426, 124, 139, 153, 168,
  182, 188, 190, 257, 361, 368, 978, 1222, 533, 356, 356, 356, 356, 356, 356, 474, 655, 356, 356, 356, 356, 356,
  356, 533, 400, 200, 200, 200, 200, 200, 200, 200, 200, 200, 301, 307, 200, 200, 200, 200, 200, 200, 200, 200,
  200, 400, 261, 167, 167, 167, 167, 167, 167, 167, 167, 167, 167, 169, 172, 167, 167, 167, 167, 167, 167, 167,
  167, 167, 167, 261, 261, 167, 167, 167, 167, 167, 167, 167, 167, 167, 167, 179, 183, 167, 167, 167, 167, 167,
  167, 167, 167, 167, 167, 261, 235, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 171, 175, 150, 150, 150,
  150, 150, 150, 150, 150, 150, 150, 235, 235, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 179, 183, 150,
  150, 150, 150, 150, 150, 150, 150, 150, 150, 235, 267, 167, 167, 167, 167, 167, 167, 167, 167, 167, 167, 167,
  167, 167, 167, 167, 167, 167, 167, 267, 633, 633, 633, 633, 167, 289, 484, 275, 90, 90, 90, 83, 92, 90, 90, 90,
  90, 90, 90, 90, 232, 335, 90, 90, 90, 90, 90, 90, 90, 90, 95, 101, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90,
  90, 90, 206, 309, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 97, 126, 90, 90, 90, 90, 90, 90, 90,
  90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 204, 307, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90,
  90, 90, 90, 90, 102, 102, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90,
  90, 90, 90, 228, 541, 220, 220, 220, 220, 220, 220, 220, 220, 220, 220, 220, 198,
];

type ZoneConfig = {
  id: string;
  title: string;
  subtitle: string;
  start: number;
  end: number;
  left: number;
  top: number;
  width: number;
  cols: number;
  order: number;
  facingPattern: string[];
};

const SRIPURAM_ZONE_CONFIG: ZoneConfig[] = [
  { id: "west-gateway", title: "Zone 1", subtitle: "Gateway Court", start: 1, end: 34, left: 5, top: 8, width: 15, cols: 6, order: 1, facingPattern: ["West", "East"] },
  { id: "west-court", title: "Zone 2", subtitle: "Palm Row", start: 35, end: 58, left: 21, top: 8, width: 12, cols: 5, order: 2, facingPattern: ["East", "West"] },
  { id: "north-bend", title: "Zone 3", subtitle: "North Bend", start: 59, end: 80, left: 34, top: 8, width: 11, cols: 5, order: 3, facingPattern: ["North", "South"] },
  { id: "north-link", title: "Zone 4", subtitle: "Cedar Link", start: 81, end: 101, left: 46, top: 8, width: 11, cols: 5, order: 4, facingPattern: ["South", "North"] },
  { id: "north-court", title: "Zone 5", subtitle: "North Court", start: 102, end: 124, left: 58, top: 8, width: 11, cols: 5, order: 5, facingPattern: ["East", "West"] },
  { id: "east-terrace", title: "Zone 6", subtitle: "East Terrace", start: 125, end: 145, left: 70, top: 8, width: 11, cols: 5, order: 6, facingPattern: ["West", "East"] },
  { id: "green-axis", title: "Zone 7", subtitle: "Central Greens", start: 146, end: 176, left: 30, top: 30, width: 17, cols: 6, order: 7, facingPattern: ["East", "West", "North"] },
  { id: "garden-edge", title: "Zone 8", subtitle: "Garden Edge", start: 177, end: 197, left: 49, top: 31, width: 13, cols: 5, order: 8, facingPattern: ["North", "South"] },
  { id: "east-court", title: "Zone 9", subtitle: "East Court", start: 198, end: 221, left: 64, top: 30, width: 13, cols: 5, order: 9, facingPattern: ["East", "West"] },
  { id: "east-link", title: "Zone 10", subtitle: "Lake Link", start: 222, end: 245, left: 78, top: 30, width: 12, cols: 5, order: 10, facingPattern: ["West", "East"] },
  { id: "south-court", title: "Zone 11", subtitle: "South Court", start: 246, end: 269, left: 6, top: 57, width: 13, cols: 5, order: 11, facingPattern: ["East", "West"] },
  { id: "south-link", title: "Zone 12", subtitle: "South Link", start: 270, end: 293, left: 20, top: 57, width: 13, cols: 5, order: 12, facingPattern: ["West", "East"] },
  { id: "parkside", title: "Zone 13", subtitle: "Parkside", start: 294, end: 321, left: 35, top: 57, width: 14, cols: 5, order: 13, facingPattern: ["South", "North", "East"] },
  { id: "boulevard-west", title: "Zone 14", subtitle: "Boulevard West", start: 322, end: 360, left: 51, top: 57, width: 18, cols: 6, order: 14, facingPattern: ["East", "West", "South"] },
  { id: "boulevard-east", title: "Zone 15", subtitle: "Boulevard East", start: 361, end: 396, left: 70, top: 57, width: 18, cols: 6, order: 15, facingPattern: ["West", "East", "North"] },
  { id: "south-east-court", title: "Zone 16", subtitle: "South-East Court", start: 397, end: 427, left: 53, top: 77, width: 16, cols: 6, order: 16, facingPattern: ["East", "West"] },
  { id: "corner-enclave", title: "Zone 17", subtitle: "Corner Enclave", start: 428, end: 454, left: 70, top: 77, width: 15, cols: 5, order: 17, facingPattern: ["South", "East", "West"] },
];

const STATUS_OVERRIDES: Record<number, "available" | "reserved" | "booked" | "sold"> = {
  103: "reserved",
  108: "sold",
  146: "reserved",
  158: "booked",
  203: "reserved",
  206: "booked",
  247: "reserved",
  303: "reserved",
  315: "booked",
  316: "booked",
  359: "reserved",
  395: "reserved",
  442: "sold",
};

function getZoneForPlot(plotNumber: number) {
  return SRIPURAM_ZONE_CONFIG.find((zone) => plotNumber >= zone.start && plotNumber <= zone.end);
}

function inferStatus(plotNumber: number) {
  if (STATUS_OVERRIDES[plotNumber]) return STATUS_OVERRIDES[plotNumber];
  if (plotNumber % 41 === 0) return "booked";
  if (plotNumber % 29 === 0) return "reserved";
  if (plotNumber % 73 === 0) return "sold";
  return "available";
}

function inferFacing(zone: ZoneConfig, plotNumber: number) {
  const index = plotNumber - zone.start;
  return zone.facingPattern[index % zone.facingPattern.length] || "East";
}

function inferPrice(sizeSqYd: number, plotNumber: number) {
  const rate = plotNumber >= 322 ? 5200 : plotNumber >= 198 ? 5750 : 6000;
  return Math.round((sizeSqYd * rate) / 1000) * 1000;
}

export function buildSripuramMapBlocks() {
  return SRIPURAM_PLOT_SQYDS.map((sizeSqYd, index) => {
    const plotNumber = index + 1;
    const zone = getZoneForPlot(plotNumber) || SRIPURAM_ZONE_CONFIG[0];
    const slot = plotNumber - zone.start;
    const col = slot % zone.cols;
    const row = Math.floor(slot / zone.cols);
    const gap = 0.55;
    const tileWidth = Math.max(1.55, (zone.width - gap * (zone.cols - 1)) / zone.cols);
    const tileHeight = 2.45;
    const headerOffset = 6.2;

    return {
      id: `sg-plot-${plotNumber}`,
      label: String(plotNumber),
      sizeSqYd,
      size: `${sizeSqYd} sq.yd`,
      facing: inferFacing(zone, plotNumber),
      status: inferStatus(plotNumber),
      price: inferPrice(sizeSqYd, plotNumber),
      zoneId: zone.id,
      zoneTitle: zone.title,
      zoneSubtitle: zone.subtitle,
      zoneLeft: `${zone.left}%`,
      zoneTop: `${zone.top}%`,
      zoneWidth: `${zone.width}%`,
      zoneColumns: zone.cols,
      zoneOrder: zone.order,
      x: zone.left + col * (tileWidth + gap),
      y: zone.top + headerOffset + row * (tileHeight + gap),
      w: tileWidth,
      h: tileHeight,
    };
  });
}
