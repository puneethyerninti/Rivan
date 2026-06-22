import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Linking,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";

import { useAuth } from "@/src/auth-context";
import { findMockPropertyById, mockProperties } from "@/src/mock-data";
import { colors, radii, spacing, typography, shadow } from "@/src/theme";

const AMENITIES_TEXT = [
  "Visakhapatnam Urban Development Authority (PCPIR) approved layout",
  "Grand entry by the side of 200' wide SEZ road",
  "100% clear vaasthu planning",
  "Security check-in and check-out gates",
  "Underground drainage system",
  "Excellent landscaping and plantation",
  "Street lights with transformer connections",
  "Overhead water tank for 24-hour water supply",
  "Rain-water harvesting",
  "Children's play area and parks as per layout approval",
  "Clubhouse membership at additional charge",
];

const FEATURES_TEXT = [
  "Underground telephone and intercom line provision for the housing project",
  "Well designed and standard quality construction",
  "Jogging and walking tracks as per layout approval",
  "60 min to Vizag Airport",
  "45 min to Duvvada",
  "30 min to Steel Plant",
  "25 min to Anakapalli Railway Station",
  "15 min to Kondakarla Tourist Spot",
  "10 min to Pudimadaka Beach",
  "10 min to Brandix, Naval Base, Asian Paints, BARC and NTPC Green Energy Project Company",
  "Renew Photovoltaics 4000cr investments nearby",
  "Google Data Centre corridor access",
  "Steel Plant to Nakkapalli development stretch",
];

const MAP_MIN_ZOOM = 1;
const MAP_MAX_ZOOM = 3.2;
const SALES_CONTACT_NUMBER = "+919966826567";

function formatStartPrice(value?: number) {
  if (!value) return "Rs 16 Lakhs onwards";
  const lakhs = value / 100000;
  return `Rs ${lakhs.toFixed(0)} Lakhs onwards`;
}

function formatCompactPrice(value?: number) {
  if (!value) return "Price on request";
  const lakhs = value / 100000;
  return `Rs ${lakhs.toFixed(1)} Lakhs`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function blockColor(status?: string) {
  switch (status) {
    case "available":
      return "#0F8A4B";
    case "reserved":
      return "#D18A11";
    case "booked":
      return "#3B82F6";
    case "sold":
      return "#D84A4A";
    default:
      return "#64748B";
  }
}

function blockSurface(status?: string) {
  switch (status) {
    case "available":
      return "#EAF8F0";
    case "reserved":
      return "#FFF6E4";
    case "booked":
      return "#EAF2FF";
    case "sold":
      return "#FDECEC";
    default:
      return "#F4F6F8";
  }
}

function blockStatusLabel(status?: string) {
  const value = String(status || "open");
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function facingShortLabel(facing?: string) {
  const normalized = String(facing || "").toLowerCase();
  if (!normalized) return "N/A";
  if (normalized.includes("north-east")) return "NE";
  if (normalized.includes("north-west")) return "NW";
  if (normalized.includes("south-east")) return "SE";
  if (normalized.includes("south-west")) return "SW";
  if (normalized.includes("north")) return "N";
  if (normalized.includes("south")) return "S";
  if (normalized.includes("east")) return "E";
  if (normalized.includes("west")) return "W";
  return String(facing).slice(0, 3).toUpperCase();
}

function getTouchDistance(touches: Array<{ pageX: number; pageY: number }>) {
  if (touches.length < 2) return 0;
  const [firstTouch, secondTouch] = touches;
  const deltaX = secondTouch.pageX - firstTouch.pageX;
  const deltaY = secondTouch.pageY - firstTouch.pageY;
  return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
}

function useRemoteImageSize(uri?: string) {
  const [ratio, setRatio] = useState(1.5);

  useEffect(() => {
    if (!uri) return;
    let active = true;

    Image.getSize(
      uri,
      (width, height) => {
        if (active && width > 0 && height > 0) {
          setRatio(width / height);
        }
      },
      () => {
        if (active) setRatio(1.5);
      }
    );

    return () => {
      active = false;
    };
  }, [uri]);

  return ratio;
}

function ResponsiveImagePanel({
  uri,
  label,
  priority,
}: {
  uri?: string;
  label: string;
  priority?: boolean;
}) {
  const ratio = useRemoteImageSize(uri);

  if (!uri) return null;

  return (
    <View style={styles.mediaPanel}>
      <Image
        source={{ uri }}
        accessibilityLabel={label}
        resizeMode="contain"
        style={[styles.fullImage, { aspectRatio: ratio }]}
        progressiveRenderingEnabled={priority}
      />
    </View>
  );
}

function InteractiveMapViewer({
  blocks,
  selectedBlock,
  onSelectBlock,
  onOpenInterest,
  onScheduleVisit,
}: {
  blocks?: any[];
  selectedBlock?: any;
  onSelectBlock: (block: any) => void;
  onOpenInterest: () => void;
  onScheduleVisit: () => void;
}) {
  const [facingFilter, setFacingFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const animatedPan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const startPanRef = useRef({ x: 0, y: 0 });
  const pinchRef = useRef({ distance: 0, zoom: 1 });
  const boardWidth = 1560;
  const boardHeight = 1220;

  const allBlocks = useMemo(() => blocks || [], [blocks]);
  const stats = useMemo(
    () => ({
      total: allBlocks.length,
      available: allBlocks.filter((block) => block.status === "available").length,
      reserved: allBlocks.filter((block) => block.status === "reserved").length,
      sold: allBlocks.filter((block) => block.status === "sold").length,
    }),
    [allBlocks]
  );

  const filteredBlocks = useMemo(
    () =>
      allBlocks.filter((block) => {
        const facingMatch = facingFilter === "all" || facingShortLabel(block.facing) === facingFilter;
        const statusMatch = statusFilter === "all" || block.status === statusFilter;
        return facingMatch && statusMatch;
      }),
    [allBlocks, facingFilter, statusFilter]
  );

  const zoneLayouts = useMemo(
    () =>
      Object.values(
        filteredBlocks.reduce((acc, block) => {
          const zoneId = block.zoneId || "sripuram-master";
          if (!acc[zoneId]) {
            acc[zoneId] = {
              id: zoneId,
              title: block.zoneTitle || "Master Layout",
              subtitle: block.zoneSubtitle || "Plotted Zone",
              left: block.zoneLeft || "8%",
              top: block.zoneTop || "10%",
              width: block.zoneWidth || "24%",
              columns: Number(block.zoneColumns || 4),
              order: Number(block.zoneOrder || 999),
              blocks: [],
            };
          }
          acc[zoneId].blocks.push(block);
          return acc;
        }, {} as Record<string, any>)
      )
        .sort((a: any, b: any) => a.order - b.order)
        .map((zone: any) => ({
          ...zone,
          blocks: zone.blocks.sort((a: any, b: any) => Number(a.label) - Number(b.label)),
        })),
    [filteredBlocks]
  );

  const quickPicks = filteredBlocks.slice(0, 18);
  const hasPlots = filteredBlocks.length > 0;

  const clampPan = (nextZoom: number, candidatePan: { x: number; y: number }) => {
    const scaledWidth = boardWidth * nextZoom;
    const scaledHeight = boardHeight * nextZoom;
    const boundedX =
      scaledWidth <= viewport.width
        ? (viewport.width - scaledWidth) / 2
        : clamp(candidatePan.x, viewport.width - scaledWidth, 0);
    const boundedY =
      scaledHeight <= viewport.height
        ? (viewport.height - scaledHeight) / 2
        : clamp(candidatePan.y, viewport.height - scaledHeight, 0);

    return { x: boundedX, y: boundedY };
  };

  const applyTransform = (nextZoom: number, nextPan: { x: number; y: number }) => {
    const boundedPan = clampPan(nextZoom, nextPan);
    setZoom(nextZoom);
    setPan(boundedPan);
    animatedPan.setValue(boundedPan);
  };

  const updateZoom = (delta: number) => {
    const nextZoom = clamp(Number((zoom + delta).toFixed(2)), MAP_MIN_ZOOM, MAP_MAX_ZOOM);
    applyTransform(nextZoom, pan);
  };

  const resetView = () => {
    applyTransform(MAP_MIN_ZOOM, { x: 0, y: 0 });
  };

  const focusViewportOnBlock = (block: any, targetZoom = Math.max(zoom, 1.85)) => {
    if (!viewport.width || !viewport.height) return;
    const nextZoom = clamp(targetZoom, MAP_MIN_ZOOM, MAP_MAX_ZOOM);
    const blockCenterX = ((block.x + block.w / 2) / 100) * boardWidth * nextZoom;
    const blockCenterY = ((block.y + block.h / 2) / 100) * boardHeight * nextZoom;
    applyTransform(nextZoom, {
      x: viewport.width / 2 - blockCenterX,
      y: viewport.height / 2 - blockCenterY,
    });
  };

  useEffect(() => {
    animatedPan.setValue(pan);
  }, [animatedPan, pan]);

  useEffect(() => {
    if (!viewport.width || !viewport.height) return;
    setPan((currentPan) => {
      const boundedPan = clampPan(zoom, currentPan);
      animatedPan.setValue(boundedPan);
      return boundedPan;
    });
  }, [animatedPan, viewport.width, viewport.height, zoom]);

  useEffect(() => {
    if (selectedBlock) {
      focusViewportOnBlock(selectedBlock);
    }
  }, [selectedBlock]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_event, gestureState) =>
          gestureState.numberActiveTouches > 1 || Math.abs(gestureState.dx) + Math.abs(gestureState.dy) > 4,
        onPanResponderGrant: (event) => {
          startPanRef.current = pan;
          const touches = event.nativeEvent.touches || [];
          if (touches.length >= 2) {
            pinchRef.current = {
              distance: getTouchDistance(touches),
              zoom,
            };
          }
        },
        onPanResponderMove: (event, gestureState) => {
          const touches = event.nativeEvent.touches || [];
          if (touches.length >= 2) {
            const distance = getTouchDistance(touches);
            if (!pinchRef.current.distance) {
              pinchRef.current = { distance, zoom };
              return;
            }
            const nextZoom = clamp(
              Number(((distance / pinchRef.current.distance) * pinchRef.current.zoom).toFixed(2)),
              MAP_MIN_ZOOM,
              MAP_MAX_ZOOM
            );
            applyTransform(nextZoom, startPanRef.current);
            return;
          }

          if (zoom <= 1 && Math.abs(gestureState.dx) < 6 && Math.abs(gestureState.dy) < 6) return;

          applyTransform(zoom, {
            x: startPanRef.current.x + gestureState.dx,
            y: startPanRef.current.y + gestureState.dy,
          });
        },
        onPanResponderRelease: () => {
          startPanRef.current = pan;
          pinchRef.current = { distance: 0, zoom };
        },
        onPanResponderTerminate: () => {
          startPanRef.current = pan;
          pinchRef.current = { distance: 0, zoom };
        },
      }),
    [pan, zoom, viewport.width, viewport.height]
  );

  const wheelProps =
    Platform.OS === "web"
      ? ({
          onWheel: (event: any) => {
            const deltaY = event?.nativeEvent?.deltaY ?? event?.deltaY ?? 0;
            if (!deltaY) return;
            event.preventDefault?.();
            const nextZoom = clamp(Number((zoom + (deltaY > 0 ? -0.12 : 0.12)).toFixed(2)), MAP_MIN_ZOOM, MAP_MAX_ZOOM);
            applyTransform(nextZoom, pan);
          },
        } as any)
      : {};

  function focusBlock(block: any) {
    onSelectBlock(block);
    focusViewportOnBlock(block, 2.1);
    onOpenInterest();
  }

  return (
    <View style={styles.mapShell}>
      <View style={styles.mapToolbar}>
        <View style={styles.mapToolbarCopy}>
          <Text style={styles.mapToolbarTitle}>Interactive Site Layout</Text>
          <Text style={styles.mapToolbarText}>
            A cleaner plotted layout built for fast browsing. Tap any box to enquire instantly, or filter by facing and live status.
          </Text>
        </View>
        <View style={styles.mapToolbarActions}>
          <TouchableOpacity testID="map-visit-button" style={styles.mapLeadBtn} onPress={onScheduleVisit}>
            <Feather name="calendar" size={14} color={colors.white} />
            <Text style={styles.mapLeadBtnText}>Schedule visit</Text>
          </TouchableOpacity>
          <View style={styles.mapControls}>
            <TouchableOpacity testID="map-control-zoom-out" style={styles.mapControlBtn} onPress={() => updateZoom(-0.2)}>
              <Feather name="minus" size={16} color={colors.primaryDeepest} />
            </TouchableOpacity>
            <TouchableOpacity testID="map-control-reset" style={styles.mapControlBtn} onPress={resetView}>
              <Feather name="maximize" size={15} color={colors.primaryDeepest} />
            </TouchableOpacity>
            <TouchableOpacity testID="map-control-zoom-in" style={styles.mapControlBtn} onPress={() => updateZoom(0.2)}>
              <Feather name="plus" size={16} color={colors.primaryDeepest} />
            </TouchableOpacity>
          </View>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveBadgeText}>Live layout</Text>
          </View>
        </View>
      </View>

      <View style={styles.mapInsightsRow}>
        <View style={styles.mapInsightCard}>
          <Text style={styles.mapInsightValue}>{stats.available}</Text>
          <Text style={styles.mapInsightLabel}>Available</Text>
        </View>
        <View style={styles.mapInsightCard}>
          <Text style={styles.mapInsightValue}>{stats.reserved}</Text>
          <Text style={styles.mapInsightLabel}>Reserved</Text>
        </View>
        <View style={styles.mapInsightCard}>
          <Text style={styles.mapInsightValue}>{stats.sold}</Text>
          <Text style={styles.mapInsightLabel}>Sold</Text>
        </View>
        <View style={styles.mapInsightCard}>
          <Text style={styles.mapInsightValue}>{stats.total}</Text>
          <Text style={styles.mapInsightLabel}>Total plots</Text>
        </View>
      </View>

      <View style={styles.mapFilterWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mapFilterRail}>
          {["all", "E", "N", "S", "W"].map((item) => (
            <TouchableOpacity
              key={item}
              style={[styles.filterPill, facingFilter === item && styles.filterPillActive]}
              onPress={() => setFacingFilter(item)}
            >
              <Text style={[styles.filterPillText, facingFilter === item && styles.filterPillTextActive]}>
                {item === "all" ? "All facings" : `${item} Facing`}
              </Text>
            </TouchableOpacity>
          ))}
          {["all", "available", "reserved", "booked", "sold"].map((item) => (
            <TouchableOpacity
              key={item}
              style={[styles.filterPill, statusFilter === item && styles.filterPillActive]}
              onPress={() => setStatusFilter(item)}
            >
              <Text style={[styles.filterPillText, statusFilter === item && styles.filterPillTextActive]}>
                {item === "all" ? "All status" : blockStatusLabel(item)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.mapSelectedCard}>
        {selectedBlock ? (
          <>
            <View style={styles.selectedBlockTopRow}>
              <View>
                <View style={styles.selectedBlockHeader}>
                  <View style={[styles.selectedBlockDot, { backgroundColor: colors.primary }]} />
                  <Text style={styles.selectedBlockTitle}>Plot {selectedBlock.label}</Text>
                </View>
                <Text style={styles.selectedBlockMeta}>
                  {selectedBlock.size} | {selectedBlock.facing} facing | {formatCompactPrice(selectedBlock.price)}
                </Text>
              </View>
              <View style={styles.selectedFacingPill}>
                <Text style={styles.selectedFacingPillText}>{facingShortLabel(selectedBlock.facing)} Facing</Text>
              </View>
            </View>

            <View style={styles.selectedStatGrid}>
              <View style={styles.selectedStatCard}>
                <Text style={styles.selectedStatLabel}>Plot Type</Text>
                <Text style={styles.selectedStatValue}>Open plot</Text>
              </View>
              <View style={styles.selectedStatCard}>
                <Text style={styles.selectedStatLabel}>Status</Text>
                <Text style={styles.selectedStatValue}>{blockStatusLabel(selectedBlock.status)}</Text>
              </View>
              <View style={styles.selectedStatCard}>
                <Text style={styles.selectedStatLabel}>Facing</Text>
                <Text style={styles.selectedStatValue}>{selectedBlock.facing || "-"}</Text>
              </View>
            </View>

            <View style={styles.selectedActions}>
              <TouchableOpacity testID="map-selected-visit" style={styles.selectedActionGhost} onPress={onScheduleVisit}>
                <Feather name="calendar" size={16} color={colors.accentDark} />
                <Text style={styles.selectedActionGhostText}>Schedule visit</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="map-selected-interest" style={styles.selectedActionPrimary} onPress={onOpenInterest}>
                <Text style={styles.selectedActionPrimaryText}>Enquire for Plot {selectedBlock.label}</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={styles.selectedBlockEmpty}>
            <Text style={styles.selectedBlockPlaceholder}>Choose a plot tile to inspect facing, size, and the current enquiry option.</Text>
            <Text style={styles.selectedBlockHint}>The board below shows only the plotted layout, with each zone separated like a modern property app.</Text>
          </View>
        )}
      </View>

      <View
        style={styles.layoutViewport}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setViewport({ width, height });
        }}
        {...wheelProps}
        {...panResponder.panHandlers}
      >
        <Animated.View
          style={[
            styles.layoutBoardCanvas,
            {
              width: boardWidth,
              height: boardHeight,
              transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale: zoom }],
            },
          ]}
        >
        <View style={[styles.layoutBoard, { width: boardWidth, height: boardHeight }]}>
          <View style={styles.layoutBackdropGlow} />
          <View style={styles.layoutPlaque}>
            <Text style={styles.layoutPlaqueEyebrow}>Master Plan</Text>
            <Text style={styles.layoutPlaqueTitle}>Sripuram Gardens</Text>
            <Text style={styles.layoutPlaqueText}>Premium plotted layout with road-facing orientation and enquiry-ready inventory.</Text>
          </View>

          <View style={styles.layoutTextureBandTop} />
          <View style={styles.layoutTextureBandBottom} />

          <View style={[styles.layoutRoadHorizontal, styles.layoutRoadNorth]}>
            <View style={styles.layoutRoadMedianHorizontal} />
            <Text style={styles.layoutRoadText}>40 ft Main Road</Text>
          </View>
          <View style={[styles.layoutRoadHorizontal, styles.layoutRoadSouth]}>
            <View style={styles.layoutRoadMedianHorizontal} />
            <Text style={styles.layoutRoadText}>60 ft Garden Road</Text>
          </View>
          <View style={[styles.layoutRoadVertical, styles.layoutRoadCentre]}>
            <View style={styles.layoutRoadMedianVertical} />
            <Text style={styles.layoutRoadTextVertical}>30 ft Cross Road</Text>
          </View>
          <View style={[styles.layoutRoadVertical, styles.layoutRoadEast]}>
            <View style={styles.layoutRoadMedianVertical} />
          </View>

          <View style={styles.layoutJunctionHub}>
            <View style={styles.layoutJunctionInner} />
          </View>

          <View style={styles.layoutParkWest}>
            <Feather name="sun" size={16} color={colors.primary} />
            <Text style={styles.layoutParkTitle}>Central Greens</Text>
            <Text style={styles.layoutParkText}>Open park edge</Text>
          </View>

          <View style={styles.layoutCompass}>
            {["N", "E", "S", "W"].map((direction) => (
              <View key={direction} style={styles.layoutCompassPill}>
                <Text style={styles.layoutCompassText}>{direction}</Text>
              </View>
            ))}
          </View>

          {zoneLayouts.map((zone) => (
            <View
              key={zone.id}
              style={[
                styles.zoneCard,
                {
                  left: zone.left as any,
                  top: zone.top as any,
                  width: zone.width as any,
                },
              ]}
            >
                <View style={styles.zoneHeader}>
                  <View>
                    <Text style={styles.zoneOverline}>Residential Cluster</Text>
                    <Text style={styles.zoneTitle}>{zone.title}</Text>
                    <Text style={styles.zoneSubtitle}>{zone.subtitle}</Text>
                  </View>
                <View style={styles.zoneCountPill}>
                  <Text style={styles.zoneCountPillText}>{zone.blocks.length}</Text>
                </View>
              </View>

              <View style={styles.zoneGrid}>
                {zone.blocks.map((block: any) => {
                  const isActive = selectedBlock?.id === block.id;
                  const tileWidth =
                    zone.columns >= 6 ? "15.5%" : zone.columns === 5 ? "18.6%" : zone.columns === 3 ? "31.5%" : "23%";
                  return (
                    <TouchableOpacity
                      key={block.id}
                      testID={`map-hotspot-${block.id}`}
                      activeOpacity={0.9}
                      onPress={() => focusBlock(block)}
                      style={[
                        styles.plotTile,
                        zone.columns >= 6 ? styles.plotTileDense : zone.columns === 5 ? styles.plotTileCompact : null,
                        {
                          width: tileWidth,
                          backgroundColor: blockSurface(block.status),
                          borderColor: isActive ? colors.primaryDeepest : blockColor(block.status),
                        },
                        isActive && styles.plotTileActive,
                      ]}
                    >
                      <Text style={styles.plotTileNumber}>#{block.label}</Text>
                      <Text style={styles.plotTileFacing}>{facingShortLabel(block.facing)}</Text>
                      <Text style={styles.plotTileSize} numberOfLines={1}>
                        {block.size}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}

          {!hasPlots ? (
            <View style={styles.layoutEmptyState}>
              <Feather name="sliders" size={20} color={colors.stone500} />
              <Text style={styles.layoutEmptyTitle}>No plots match these filters</Text>
              <Text style={styles.layoutEmptyText}>Try clearing facing or status to see more plotted boxes.</Text>
            </View>
          ) : null}
        </View>
        </Animated.View>
      </View>

      <View style={styles.layoutLegendRow}>
        {["available", "reserved", "booked", "sold"].map((status) => (
          <View key={status} style={styles.layoutLegendItem}>
            <View style={[styles.layoutLegendDot, { backgroundColor: blockColor(status) }]} />
            <Text style={styles.layoutLegendText}>{blockStatusLabel(status)}</Text>
          </View>
        ))}
        <View style={styles.layoutLegendItem}>
          <Feather name="move" size={14} color={colors.stone500} />
          <Text style={styles.layoutLegendText}>Drag to pan</Text>
        </View>
        <View style={styles.layoutLegendItem}>
          <Feather name="zoom-in" size={14} color={colors.stone500} />
          <Text style={styles.layoutLegendText}>Pinch or scroll to zoom</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.plotChipRail}>
        {quickPicks.map((block) => {
          const active = selectedBlock?.id === block.id;
          return (
            <TouchableOpacity
              key={block.id}
              testID={`map-chip-${block.id}`}
              style={[
                styles.plotChip,
                { borderColor: colors.primaryLight },
                active && { backgroundColor: colors.primary, borderColor: colors.primary },
              ]}
              onPress={() => onSelectBlock(block)}
            >
              <Text style={[styles.plotChipLabel, active && styles.plotChipLabelActive]}>#{block.label}</Text>
              <Text style={[styles.plotChipMeta, active && styles.plotChipMetaActive]}>{facingShortLabel(block.facing)} | {block.size}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

export default function PropertyDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const scrollRef = useRef<ScrollView | null>(null);
  const mapSectionOffset = useRef(0);
  const galleryRef = useRef<ScrollView | null>(null);
  const { width } = useWindowDimensions();
  const propertyFromMock = useMemo(() => findMockPropertyById(id) || mockProperties[0], [id]);
  const [property] = useState<any>(propertyFromMock);
  const [loading, setLoading] = useState(false);
  const [imgIdx, setImgIdx] = useState(0);
  const [selectedBlock, setSelectedBlock] = useState<any>(null);
  const [interestVisible, setInterestVisible] = useState(false);
  const [interestName, setInterestName] = useState("");
  const [interestPhone, setInterestPhone] = useState("");
  const [interestEmail, setInterestEmail] = useState("");

  useEffect(() => {
    setLoading(false);
  }, [propertyFromMock]);

  const curatedFallback = propertyFromMock || mockProperties[0];
  const images: string[] = property?.images?.length ? property.images : curatedFallback.images || [curatedFallback.image];
  const plans: any[] = property?.layoutPlans?.length ? property.layoutPlans : curatedFallback.layoutPlans || [];
  const mapBlocks: any[] = property?.mapBlocks?.length ? property.mapBlocks : curatedFallback.mapBlocks || [];
  const heroRatio = useRemoteImageSize(images[imgIdx] || images[0]);
  const heroWidth = Math.min(width, 1280);
  const heroHeight = Math.min(heroWidth / heroRatio, width > 900 ? 620 : 420);
  const isAgent = user?.role === "agent" || user?.role === "sub_agent";

  useEffect(() => {
    if (images.length <= 1) return;

    const timer = setInterval(() => {
      setImgIdx((current) => {
        const next = (current + 1) % images.length;
        galleryRef.current?.scrollTo({ x: heroWidth * next, animated: true });
        return next;
      });
    }, 3200);

    return () => clearInterval(timer);
  }, [heroWidth, images.length]);

  if (loading || !property) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  function openCall() {
    Linking.openURL(`tel:${SALES_CONTACT_NUMBER}`).catch(() => Alert.alert("Call unavailable", "Unable to open the dialer."));
  }

  function jumpToMap() {
    scrollRef.current?.scrollTo({ y: Math.max(0, mapSectionOffset.current - 96), animated: true });
  }

  function submitInterest() {
    if (!interestName.trim() || !interestPhone.trim()) {
      Alert.alert("Need a few details", "Please enter your name and phone number.");
      return;
    }

    Alert.alert(
      "Thanks for showing interest",
      `${interestName.trim()}, our team will contact you shortly with the availability details for ${selectedBlock ? `Plot ${selectedBlock.label}` : property.name}.`
    );
    setInterestVisible(false);
    setInterestName("");
    setInterestPhone("");
    setInterestEmail("");
  }

  return (
    <View style={styles.container} testID="property-details-screen">
      <ScrollView ref={scrollRef} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.galleryWrap, { height: heroHeight + 32 }]}>
          <ScrollView
            ref={galleryRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setImgIdx(Math.round(e.nativeEvent.contentOffset.x / heroWidth))}
          >
            {images.map((media, index) => (
              <View key={`${property.id}-media-${index}`} style={[styles.heroSlide, { width: heroWidth, height: heroHeight }]}>
                <Image source={{ uri: media }} resizeMode="contain" style={styles.heroImage} />
              </View>
            ))}
          </ScrollView>
          <SafeAreaView edges={["top"]} style={styles.heroNav}>
            <View style={styles.heroNavRow}>
              <TouchableOpacity testID="property-back-button" style={styles.heroBtn} onPress={() => router.back()}>
                <Feather name="arrow-left" size={20} color={colors.white} />
              </TouchableOpacity>
              <TouchableOpacity testID="property-share-button" style={styles.heroBtn} onPress={() => Alert.alert("Share", "Property details are ready to share.")}>
                <Feather name="share-2" size={18} color={colors.white} />
              </TouchableOpacity>
            </View>
          </SafeAreaView>
          <View style={styles.dots}>
            {images.map((_, index) => (
              <View key={`${property.id}-dot-${index}`} style={[styles.dot, index === imgIdx && styles.dotActive]} />
            ))}
          </View>
          <View style={styles.categoryPill}>
            <Text style={styles.categoryText}>{property.category}</Text>
          </View>
        </View>

        <View style={styles.content}>
          <Text style={styles.title}>{property.name}</Text>
          <View style={styles.row}>
            <Feather name="map-pin" size={14} color={colors.stone600} />
            <Text style={styles.location}>{property.location}</Text>
          </View>

          <View style={styles.priceRow}>
            <View>
              <Text style={styles.priceLabel}>Pricing</Text>
              <Text style={styles.priceText}>{formatStartPrice(property.starting_price || curatedFallback.starting_price)}</Text>
            </View>
            <View style={styles.plotInfo}>
              <View style={styles.plotInfoDot} />
              <Text style={styles.plotInfoText}>{isAgent ? property.availability : "Enquiry open"}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <Text style={styles.sectionTitle}>Project Overview</Text>
          <Text style={styles.description}>{property.description}</Text>

          <View style={styles.specsGrid}>
            <SpecItem icon="square" label="Built-up Area" value={property.size} />
            <SpecItem icon="compass" label="Facing Options" value={property.facing} />
            <SpecItem icon="hash" label="Layout Ref." value={property.survey_number} />
            <SpecItem icon="maximize" label="Road Access" value={property.road_width} />
          </View>

          <Text style={styles.sectionTitle}>Floor Plans</Text>
          <View style={styles.planGrid}>
            {plans.map((plan) => (
              <View key={plan.id} style={styles.planCard}>
                <ResponsiveImagePanel uri={plan.image} label={plan.title} />
                <View style={styles.planBody}>
                  <Text style={styles.planTitle}>{plan.title}</Text>
                  <Text style={styles.planText}>{plan.description}</Text>
                </View>
              </View>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Features & Amenities</Text>
          <View style={styles.copyGrid}>
            <View style={styles.copyCard}>
              <Text style={styles.copyHeading}>Amenities</Text>
              {AMENITIES_TEXT.map((item) => (
                <View key={item} style={styles.copyRow}>
                  <Feather name="check-circle" size={14} color={colors.primary} />
                  <Text style={styles.copyText}>{item}</Text>
                </View>
              ))}
            </View>
            <View style={styles.copyCard}>
              <Text style={styles.copyHeading}>Location Highlights</Text>
              {FEATURES_TEXT.map((item) => (
                <View key={item} style={styles.copyRow}>
                  <Feather name="arrow-right-circle" size={14} color={colors.accent} />
                  <Text style={styles.copyText}>{item}</Text>
                </View>
              ))}
            </View>
          </View>

          <View
            onLayout={(event) => {
              mapSectionOffset.current = event.nativeEvent.layout.y;
            }}
          >
            <Text style={styles.sectionTitle}>{isAgent ? "Availability Map" : "Site Layout Map"}</Text>
            <InteractiveMapViewer
              blocks={mapBlocks}
              selectedBlock={selectedBlock}
              onSelectBlock={setSelectedBlock}
              onOpenInterest={() => setInterestVisible(true)}
              onScheduleVisit={() => router.push(`/centre/site-${id}`)}
            />
          </View>
        </View>
      </ScrollView>

      <SafeAreaView edges={["bottom"]} style={styles.actionBarWrap}>
        <View style={styles.actionBar}>
          <TouchableOpacity testID="property-call-button" style={styles.iconAction} onPress={openCall}>
            <Feather name="phone-call" size={20} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            testID="property-visit-button"
            style={[styles.actionBtn, styles.actionBtnSecondary]}
            onPress={() => router.push(`/centre/site-${id}`)}
          >
            <Feather name="calendar" size={16} color={colors.accent} />
            <Text style={styles.actionBtnTextSecondary}>Schedule Visit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="property-map-button"
            style={[styles.actionBtn, styles.actionBtnPrimary]}
            onPress={() => {
              jumpToMap();
              if (!selectedBlock && mapBlocks.length) {
                const firstOpenBlock = mapBlocks.find((block) => block.status === "available") || mapBlocks[0];
                setSelectedBlock(firstOpenBlock);
              }
            }}
          >
            <Feather name="map" size={16} color={colors.white} />
            <Text style={styles.actionBtnTextPrimary}>Explore Layout</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <Modal visible={interestVisible} transparent animationType="fade" onRequestClose={() => setInterestVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderCopy}>
                <Text style={styles.modalTitle}>Thanks for showing interest</Text>
                <Text style={styles.modalSubtitle}>Please provide your details and our team will help you with map availability.</Text>
                {selectedBlock ? <Text style={styles.modalBlockLabel}>Selected plot: {selectedBlock.label}</Text> : null}
              </View>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setInterestVisible(false)}>
                <Feather name="x" size={18} color={colors.primaryDeepest} />
              </TouchableOpacity>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Name</Text>
              <TextInput
                value={interestName}
                onChangeText={setInterestName}
                placeholder="Enter your name"
                placeholderTextColor={colors.stone400}
                style={styles.fieldInput}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Phone Number</Text>
              <TextInput
                value={interestPhone}
                onChangeText={setInterestPhone}
                placeholder="Enter your phone number"
                placeholderTextColor={colors.stone400}
                keyboardType="phone-pad"
                style={styles.fieldInput}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Email</Text>
              <TextInput
                value={interestEmail}
                onChangeText={setInterestEmail}
                placeholder="Enter your email"
                placeholderTextColor={colors.stone400}
                keyboardType="email-address"
                autoCapitalize="none"
                style={styles.fieldInput}
              />
            </View>

            <TouchableOpacity style={styles.submitBtn} onPress={submitInterest}>
              <Text style={styles.submitBtnText}>Submit Interest</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function SpecItem({ icon, label, value }: { icon: any; label: string; value?: string }) {
  return (
    <View style={styles.specItem}>
      <Feather name={icon} size={14} color={colors.accent} />
      <View>
        <Text style={styles.specLabel}>{label}</Text>
        <Text style={styles.specValue}>{value || "-"}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  loader: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.white },
  scrollContent: { paddingBottom: 120 },
  galleryWrap: {
    width: "100%",
    maxWidth: 1280,
    alignSelf: "center",
    position: "relative",
    backgroundColor: "#0F1720",
    justifyContent: "center",
  },
  heroSlide: {
    backgroundColor: "#0F1720",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  heroImage: { width: "100%", height: "100%" },
  heroNav: { position: "absolute", top: 0, left: 0, right: 0 },
  heroNavRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing.md },
  heroBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(15, 23, 32, 0.56)",
    alignItems: "center",
    justifyContent: "center",
  },
  dots: {
    position: "absolute",
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.45)" },
  dotActive: { width: 24, backgroundColor: colors.white },
  categoryPill: {
    position: "absolute",
    top: 88,
    right: spacing.md,
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.md,
  },
  categoryText: { color: colors.white, fontSize: 12, fontWeight: "700" },
  content: { padding: spacing.lg, gap: spacing.sm, width: "100%", maxWidth: 1280, alignSelf: "center" },
  title: { ...typography.h1, color: colors.primaryDeepest, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  location: { ...typography.body, color: colors.stone600 },
  priceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.sm, gap: spacing.sm, flexWrap: "wrap" },
  priceLabel: { ...typography.small, color: colors.stone500 },
  priceText: { ...typography.h2, color: colors.primary, fontWeight: "800", marginTop: 2 },
  plotInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderRadius: radii.full,
  },
  plotInfoDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.available },
  plotInfoText: { ...typography.small, color: colors.primary, fontWeight: "700" },
  divider: { height: 1, backgroundColor: colors.stone100, marginVertical: spacing.md },
  sectionTitle: { ...typography.h4, color: colors.primaryDeepest, fontWeight: "700", marginTop: spacing.md, marginBottom: spacing.sm },
  description: { ...typography.body, color: colors.stone600, lineHeight: 23 },
  specsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  specItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexBasis: "47%",
    padding: spacing.sm,
    backgroundColor: colors.offWhite,
    borderRadius: radii.md,
  },
  specLabel: { ...typography.small, color: colors.stone500, fontSize: 11 },
  specValue: { ...typography.body, color: colors.primaryDeepest, fontWeight: "600" },
  planGrid: { gap: spacing.md },
  planCard: {
    backgroundColor: colors.offWhite,
    borderRadius: radii.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.stone100,
  },
  mediaPanel: {
    backgroundColor: colors.white,
    padding: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  fullImage: {
    width: "100%",
    maxHeight: 900,
    backgroundColor: colors.white,
  },
  planBody: { padding: spacing.md, gap: 6 },
  planTitle: { ...typography.bodyLarge, color: colors.primaryDeepest, fontWeight: "700" },
  planText: { ...typography.body, color: colors.stone600, lineHeight: 21 },
  copyGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  copyCard: {
    flex: 1,
    minWidth: 280,
    backgroundColor: colors.offWhite,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.stone100,
    padding: spacing.md,
    gap: spacing.sm,
  },
  copyHeading: { ...typography.bodyLarge, color: colors.primaryDeepest, fontWeight: "700" },
  copyRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  copyText: { flex: 1, ...typography.body, color: colors.stone700, lineHeight: 21 },
  mapShell: {
    backgroundColor: colors.offWhite,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.stone100,
    overflow: "hidden",
    gap: spacing.sm,
  },
  mapToolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.stone100,
    backgroundColor: colors.white,
    flexWrap: "wrap",
  },
  mapToolbarCopy: { flex: 1, minWidth: 220, gap: 4 },
  mapToolbarTitle: { ...typography.bodyLarge, color: colors.primaryDeepest, fontWeight: "800" },
  mapToolbarText: { ...typography.small, color: colors.stone700, lineHeight: 18 },
  mapToolbarActions: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#E9F8EF",
    borderRadius: radii.full,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#CDEED7",
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  liveBadgeText: { ...typography.small, color: colors.primaryDeepest, fontWeight: "800" },
  mapControls: { flexDirection: "row", gap: 8 },
  mapLeadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: radii.full,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginRight: 4,
  },
  mapLeadBtnText: { ...typography.small, color: colors.white, fontWeight: "700" },
  mapInsightsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  mapInsightCard: {
    flex: 1,
    minWidth: 110,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.stone100,
    padding: spacing.sm,
    gap: 2,
  },
  mapInsightValue: { ...typography.h3, color: colors.primaryDeepest, fontWeight: "800" },
  mapInsightLabel: { ...typography.small, color: colors.stone500, fontWeight: "600" },
  mapFilterWrap: { paddingHorizontal: spacing.md },
  mapFilterRail: { gap: spacing.sm, paddingRight: spacing.md },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.stone200,
    backgroundColor: colors.white,
  },
  filterPillActive: {
    backgroundColor: colors.primaryDeepest,
    borderColor: colors.primaryDeepest,
  },
  filterPillText: { ...typography.small, color: colors.primaryDeepest, fontWeight: "700" },
  filterPillTextActive: { color: colors.white },
  mapControlBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.offWhite,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.stone200,
  },
  mapSelectedCard: {
    marginHorizontal: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.stone100,
    gap: spacing.sm,
  },
  selectedBlockTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  selectedBlockHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  selectedBlockDot: { width: 10, height: 10, borderRadius: 5 },
  selectedBlockTitle: { ...typography.bodyLarge, color: colors.primaryDeepest, fontWeight: "800" },
  selectedBlockMeta: { ...typography.small, color: colors.stone700, lineHeight: 18 },
  selectedFacingPill: {
    borderRadius: radii.full,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: "flex-start",
    backgroundColor: colors.primaryDeepest,
  },
  selectedFacingPillText: { ...typography.small, color: colors.white, fontWeight: "800" },
  selectedStatGrid: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  selectedStatCard: {
    flex: 1,
    minWidth: 140,
    borderRadius: radii.md,
    backgroundColor: colors.offWhite,
    padding: spacing.sm,
    gap: 4,
  },
  selectedStatLabel: { ...typography.small, color: colors.stone500, fontWeight: "700" },
  selectedStatValue: { ...typography.body, color: colors.primaryDeepest, fontWeight: "700" },
  selectedActions: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  selectedActionGhost: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.full,
    backgroundColor: colors.offWhite,
    borderWidth: 1,
    borderColor: colors.stone200,
  },
  selectedActionGhostText: { ...typography.small, color: colors.primaryDeepest, fontWeight: "700" },
  selectedActionPrimary: {
    flex: 1,
    minWidth: 180,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.full,
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  selectedActionPrimaryText: { ...typography.small, color: colors.white, fontWeight: "800" },
  selectedBlockEmpty: { gap: 4 },
  selectedBlockPlaceholder: { ...typography.small, color: colors.stone500 },
  selectedBlockHint: { ...typography.small, color: colors.accentDark, fontWeight: "700" },
  layoutViewport: {
    marginHorizontal: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: "#E5F0E7",
    borderWidth: 1,
    borderColor: "#D3E3D7",
    overflow: "hidden",
    height: 640,
    position: "relative",
  },
  layoutBoardCanvas: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  layoutBoard: {
    position: "relative",
    backgroundColor: "#EEF4EC",
  },
  layoutBackdropGlow: {
    position: "absolute",
    top: -80,
    right: -40,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(255,255,255,0.38)",
  },
  layoutPlaque: {
    position: "absolute",
    left: spacing.md,
    top: spacing.md,
    width: 248,
    borderRadius: radii.lg,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "#D9E6DD",
    padding: spacing.md,
    gap: 4,
    ...shadow.md,
    zIndex: 2,
  },
  layoutPlaqueEyebrow: { ...typography.label, color: colors.accentDark, fontSize: 10, letterSpacing: 0.8 },
  layoutPlaqueTitle: { ...typography.h4, color: colors.primaryDeepest, fontWeight: "800" },
  layoutPlaqueText: { ...typography.small, color: colors.stone600, lineHeight: 18 },
  layoutTextureBandTop: {
    position: "absolute",
    top: "8%",
    left: "5%",
    right: "5%",
    height: 1,
    backgroundColor: "rgba(73,88,75,0.08)",
  },
  layoutTextureBandBottom: {
    position: "absolute",
    bottom: "10%",
    left: "7%",
    right: "8%",
    height: 1,
    backgroundColor: "rgba(73,88,75,0.08)",
  },
  layoutRoadHorizontal: {
    position: "absolute",
    left: "6%",
    right: "6%",
    height: 34,
    borderRadius: 20,
    backgroundColor: "#475649",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#607263",
  },
  layoutRoadNorth: { top: "26%" },
  layoutRoadSouth: { top: "52%" },
  layoutRoadVertical: {
    position: "absolute",
    width: 32,
    borderRadius: 20,
    backgroundColor: "#475649",
    borderWidth: 1,
    borderColor: "#607263",
  },
  layoutRoadCentre: {
    top: "22%",
    bottom: "16%",
    left: "48.5%",
    alignItems: "center",
    justifyContent: "center",
  },
  layoutRoadEast: {
    top: "10%",
    height: "56%",
    left: "83%",
  },
  layoutRoadMedianHorizontal: {
    position: "absolute",
    left: 18,
    right: 18,
    height: 2,
    borderRadius: 1,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  layoutRoadMedianVertical: {
    position: "absolute",
    top: 18,
    bottom: 18,
    alignSelf: "center",
    width: 2,
    borderRadius: 1,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  layoutRoadText: { ...typography.small, color: colors.white, fontWeight: "700" },
  layoutRoadTextVertical: {
    ...typography.small,
    color: colors.white,
    fontWeight: "700",
    transform: [{ rotate: "-90deg" }],
    width: 140,
    textAlign: "center",
  },
  layoutJunctionHub: {
    position: "absolute",
    left: "46.8%",
    top: "49.2%",
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#5A6A5D",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#708273",
    ...shadow.sm,
  },
  layoutJunctionInner: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#D8E4DA",
  },
  layoutParkWest: {
    position: "absolute",
    left: "8%",
    top: "54%",
    width: "22%",
    borderRadius: radii.lg,
    backgroundColor: "rgba(223,244,228,0.98)",
    borderWidth: 1,
    borderColor: "#BFE0C7",
    padding: spacing.md,
    gap: 4,
    ...shadow.sm,
  },
  layoutParkTitle: { ...typography.body, color: colors.primaryDeepest, fontWeight: "700" },
  layoutParkText: { ...typography.small, color: colors.stone600 },
  layoutCompass: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    flexDirection: "row",
    gap: 8,
  },
  layoutCompassPill: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.stone200,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.sm,
  },
  layoutCompassText: { ...typography.small, color: colors.primaryDeepest, fontWeight: "800" },
  zoneCard: {
    position: "absolute",
    backgroundColor: "rgba(255,255,255,0.98)",
    borderWidth: 1,
    borderColor: "#D6E3DA",
    borderRadius: radii.lg,
    padding: spacing.sm,
    ...shadow.md,
  },
  zoneHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  zoneOverline: { ...typography.label, color: colors.accentDark, fontSize: 10, marginBottom: 2 },
  zoneTitle: { ...typography.body, color: colors.primaryDeepest, fontWeight: "800" },
  zoneSubtitle: { ...typography.small, color: colors.stone500 },
  zoneCountPill: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.offWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  zoneCountPillText: { ...typography.small, color: colors.primaryDeepest, fontWeight: "800" },
  zoneGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  plotTile: {
    minWidth: 58,
    aspectRatio: 1,
    borderRadius: radii.md,
    borderWidth: 1.5,
    padding: 6,
    justifyContent: "space-between",
    shadowColor: "#0B2813",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  plotTileCompact: {
    minWidth: 52,
    padding: 5,
  },
  plotTileDense: {
    minWidth: 44,
    padding: 4,
    aspectRatio: 0.88,
  },
  plotTileActive: {
    borderWidth: 2.5,
    transform: [{ translateY: -2 }],
    shadowColor: "#0B2813",
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  plotTileNumber: { ...typography.small, color: colors.primaryDeepest, fontWeight: "800", fontSize: 11 },
  plotTileFacing: { ...typography.small, color: colors.primary, fontWeight: "800", fontSize: 10 },
  plotTileSize: { fontSize: 9, color: colors.stone600, fontWeight: "600" },
  layoutEmptyState: {
    position: "absolute",
    left: "34%",
    top: "42%",
    width: "32%",
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.stone200,
    padding: spacing.lg,
    alignItems: "center",
    gap: spacing.sm,
  },
  layoutEmptyTitle: { ...typography.body, color: colors.primaryDeepest, fontWeight: "800" },
  layoutEmptyText: { ...typography.small, color: colors.stone600, textAlign: "center", lineHeight: 18 },
  layoutLegendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: "center",
  },
  layoutLegendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  layoutLegendDot: { width: 10, height: 10, borderRadius: 5 },
  layoutLegendText: { ...typography.small, color: colors.stone600, fontWeight: "700" },
  mapViewport: {
    marginHorizontal: spacing.md,
    height: 520,
    borderRadius: radii.lg,
    backgroundColor: "#E8EFE9",
    overflow: "hidden",
  },
  mapCanvas: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  mapInteractiveImage: { backgroundColor: colors.white },
  mapBlock: {
    position: "absolute",
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    padding: 4,
    ...shadow.sm,
  },
  mapBlockActive: {
    borderWidth: 3,
    borderColor: colors.primaryDeepest,
    transform: [{ scale: 1.12 }],
  },
  mapBlockLabelDark: { color: colors.primaryDeepest, fontSize: 10, fontWeight: "800" },
  mapFacingTag: {
    position: "absolute",
    right: 3,
    bottom: 3,
    borderRadius: 999,
    backgroundColor: colors.primary,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  mapFacingTagText: { color: colors.white, fontSize: 8, fontWeight: "800" },
  plotChipRail: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  plotChip: {
    minWidth: 94,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    gap: 2,
  },
  plotChipLabel: { ...typography.small, color: colors.primaryDeepest, fontWeight: "800" },
  plotChipLabelActive: { color: colors.white },
  plotChipMeta: { ...typography.small, color: colors.stone500 },
  plotChipMetaActive: { color: "rgba(255,255,255,0.84)" },
  actionBarWrap: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.stone100,
    ...shadow.lg,
  },
  actionBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    width: "100%",
    maxWidth: 1280,
    alignSelf: "center",
  },
  iconAction: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: "#E6F9EE",
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: radii.md,
  },
  actionBtnSecondary: { borderWidth: 1.5, borderColor: colors.accent },
  actionBtnPrimary: { backgroundColor: colors.primary },
  actionBtnTextSecondary: { ...typography.body, color: colors.accent, fontWeight: "700" },
  actionBtnTextPrimary: { ...typography.body, color: colors.white, fontWeight: "700" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(5, 18, 12, 0.48)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  modalCard: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.lg,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  modalHeaderCopy: { flex: 1, gap: 4 },
  modalTitle: { ...typography.h3, color: colors.primaryDeepest, fontWeight: "700" },
  modalSubtitle: { ...typography.body, color: colors.stone600, lineHeight: 21 },
  modalBlockLabel: { ...typography.small, color: colors.accentDark, fontWeight: "700", marginTop: 2 },
  modalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.offWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  fieldGroup: { gap: 6 },
  fieldLabel: { ...typography.small, color: colors.stone700, fontWeight: "700" },
  fieldInput: {
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.stone200,
    paddingHorizontal: spacing.md,
    color: colors.primaryDeepest,
    backgroundColor: colors.white,
  },
  submitBtn: {
    backgroundColor: colors.primary,
    minHeight: 50,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xs,
  },
  submitBtnText: { ...typography.body, color: colors.white, fontWeight: "700" },
});
