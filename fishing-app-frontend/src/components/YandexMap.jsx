import { useEffect, useMemo, useRef, useState } from "react";
import { loadYandexReactify } from "../utils/loadYandexReactify";
import "../styles/yandexMap.css";

const MIN_ZOOM = 2;
const MAX_ZOOM = 19;
const DEFAULT_CENTER = [82.920179, 55.030878];
const DEFAULT_ZOOM = 6;
const PROGRAMMATIC_CENTER_LOCK_MS = 700;
const PROGRAMMATIC_ZOOM_LOCK_MS = 450;
const ZOOM_BUTTON_STEP = 2;
const ZOOM_HOLD_STEP = 0.2;
const ZOOM_HOLD_START_DELAY_MS = 140;
const ZOOM_HOLD_INTERVAL_MS = 35;
const SATELLITE_LAYER_ID = "maptiler-satellite-layer";
const SATELLITE_SOURCE_ID = "maptiler-satellite-source";

function clampZoom(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return DEFAULT_ZOOM;
  }

  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, number));
}

function normalizeCenter(value) {
  const lng = Number(value?.[0]);
  const lat = Number(value?.[1]);

  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return DEFAULT_CENTER;
  }

  return [lng, lat];
}

function normalizeLocation(value) {
  const lng = Number(value?.longitude ?? value?.lng ?? value?.lon ?? value?.[0]);
  const lat = Number(value?.latitude ?? value?.lat ?? value?.[1]);

  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return null;
  }

  return [lng, lat];
}

function isSameCenter(first, second) {
  if (!first || !second) return false;

  return (
    Math.abs(Number(first[0]) - Number(second[0])) < 0.000001 &&
    Math.abs(Number(first[1]) - Number(second[1])) < 0.000001
  );
}

function getUpdatePayload(firstArg, secondArg) {
  if (secondArg?.location || secondArg?.camera) return secondArg;
  return firstArg;
}

function getMapTilerKey() {
  return (import.meta.env.VITE_MAPTILER_KEY || "").trim();
}


function clampLatitude(latitude) {
  return Math.max(-85.05112878, Math.min(85.05112878, latitude));
}

function lonLatToWorldPixel([lng, lat], zoom) {
  const scale = 256 * 2 ** clampZoom(zoom);
  const normalizedLng = ((Number(lng) + 180) / 360) * scale;
  const sinLat = Math.sin((clampLatitude(Number(lat)) * Math.PI) / 180);
  const normalizedLat = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;

  return [normalizedLng, normalizedLat];
}

function worldPixelToLonLat([x, y], zoom) {
  const scale = 256 * 2 ** clampZoom(zoom);
  const lng = (Number(x) / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * Number(y)) / scale;
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(n));

  return [lng, lat];
}

function isMapOverlayElement(target) {
  return Boolean(
    target?.closest?.(
      ".yandex-map-controls, .yandex-map-type-switcher, .yandex-map-marker-icon, button, input, textarea, select, a"
    )
  );
}

export default function YandexMap({
  points = [],
  userLocation = null,
  onMapClick,
  onPointClick,
  onMapContextMenu,
  onLocationClick,
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  showLocationButton = true,
  focusKey = null,
  focusZoom = null,
  showSatelliteSwitcher = true,
}) {
  const [components, setComponents] = useState(null);
  const [currentZoom, setCurrentZoom] = useState(clampZoom(zoom));
  const [currentCenter, setCurrentCenter] = useState(() => normalizeCenter(center));
  const [mapType, setMapType] = useState("scheme");

  const programmaticCenterLockUntilRef = useRef(0);
  const programmaticZoomLockUntilRef = useRef(0);
  const locationButtonWasClickedRef = useRef(false);
  const zoomHoldTimeoutRef = useRef(null);
  const zoomHoldIntervalRef = useRef(null);
  const containerRef = useRef(null);
  const longPressTimeoutRef = useRef(null);
  const longPressStartRef = useRef(null);
  const nativeContextHandledAtRef = useRef(0);
  const yandexContextHandledAtRef = useRef(0);
  const mapTilerKey = getMapTilerKey();
  const canUseSatellite = Boolean(mapTilerKey);
  const effectiveMapType = mapType === "satellite" && canUseSatellite ? "satellite" : "scheme";

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const { ymaps3, reactify } = await loadYandexReactify();

        let SphericalMercator = null;

        try {
          const projectionModule = await ymaps3.import(
            "@yandex/ymaps3-spherical-mercator-projection@0.0.1"
          );
          SphericalMercator = projectionModule.SphericalMercator;
        } catch (projectionError) {
          console.warn("SphericalMercator projection is not available:", projectionError);
        }

        const {
          YMap,
          YMapDefaultSchemeLayer,
          YMapDefaultFeaturesLayer,
          YMapListener,
          YMapMarker,
          YMapTileDataSource,
          YMapLayer,
        } = reactify.module(ymaps3);

        if (!cancelled) {
          setComponents({
            YMap,
            YMapDefaultSchemeLayer,
            YMapDefaultFeaturesLayer,
            YMapListener,
            YMapMarker,
            YMapTileDataSource,
            YMapLayer,
            SphericalMercator,
          });
        }
      } catch (err) {
        console.error("Yandex map init error:", err);
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      stopZoomHold();
      clearLongPressTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const safeCenter = useMemo(() => normalizeCenter(center), [center]);
  const safeUserLocation = useMemo(() => normalizeLocation(userLocation), [userLocation]);

  function moveCenterWithoutChangingZoom(nextCenter) {
    const normalized = normalizeCenter(nextCenter);
    programmaticCenterLockUntilRef.current = Date.now() + PROGRAMMATIC_CENTER_LOCK_MS;

    setCurrentCenter((previous) => {
      if (isSameCenter(previous, normalized)) return previous;
      return normalized;
    });
  }

  useEffect(() => {
    if (isSameCenter(currentCenter, safeCenter)) return;
    moveCenterWithoutChangingZoom(safeCenter);
    // currentCenter intentionally omitted: this effect should react only to external center changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeCenter]);

  useEffect(() => {
    if (!safeUserLocation || !locationButtonWasClickedRef.current) return;

    moveCenterWithoutChangingZoom(safeUserLocation);
    locationButtonWasClickedRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeUserLocation]);

  useEffect(() => {
    if (focusKey == null || focusZoom == null) return;
    setZoomProgrammatically(focusZoom);
  }, [focusKey, focusZoom]);

  const location = useMemo(() => {
    return {
      center: currentCenter,
      zoom: currentZoom,
      duration: 400,
    };
  }, [currentCenter, currentZoom]);

  const satelliteRasterSource = useMemo(() => {
    if (!canUseSatellite) return null;

    return {
      type: "tiles",
      fetchTile: `https://api.maptiler.com/maps/satellite/256/{{z}}/{{x}}/{{y}}.jpg?key=${encodeURIComponent(mapTilerKey)}`,
      transparent: false,
      size: 256,
    };
  }, [canUseSatellite, mapTilerKey]);

  const markerElements = useMemo(() => {
    return points.map((point, index) => {
      const markerClassName = [
        "yandex-map-marker-icon",
        point.id === "draft" ? "draft" : "",
        point.id === "external" ? "external" : "",
      ].filter(Boolean).join(" ");

      function handlePointClick(event) {
        event?.stopPropagation?.();
        onPointClick?.(point);
      }

      function handlePointKeyDown(event) {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        onPointClick?.(point);
      }

      return (
        <div
          key={point.id || `${point.longitude}-${point.latitude}-${index}`}
          className={markerClassName}
          title={point.name || point.markerTitle || "Точка"}
          role="button"
          tabIndex={0}
          onClick={handlePointClick}
          onKeyDown={handlePointKeyDown}
        >
          {point.icon || "📍"}
        </div>
      );
    });
  }, [onPointClick, points]);

  function setZoomProgrammatically(nextZoom) {
    programmaticZoomLockUntilRef.current = Date.now() + PROGRAMMATIC_ZOOM_LOCK_MS;
    setCurrentZoom(clampZoom(nextZoom));
  }

  function changeZoom(delta) {
    programmaticZoomLockUntilRef.current = Date.now() + PROGRAMMATIC_ZOOM_LOCK_MS;
    setCurrentZoom((prev) => clampZoom(prev + delta));
  }

  function zoomIn() {
    changeZoom(ZOOM_BUTTON_STEP);
  }

  function zoomOut() {
    changeZoom(-ZOOM_BUTTON_STEP);
  }

  function stopZoomHold() {
    if (zoomHoldTimeoutRef.current) {
      window.clearTimeout(zoomHoldTimeoutRef.current);
      zoomHoldTimeoutRef.current = null;
    }

    if (zoomHoldIntervalRef.current) {
      window.clearInterval(zoomHoldIntervalRef.current);
      zoomHoldIntervalRef.current = null;
    }
  }

  function startZoomHold(direction) {
    stopZoomHold();

    const delta = direction === "in" ? ZOOM_HOLD_STEP : -ZOOM_HOLD_STEP;

    zoomHoldTimeoutRef.current = window.setTimeout(() => {
      changeZoom(delta);

      zoomHoldIntervalRef.current = window.setInterval(() => {
        changeZoom(delta);
      }, ZOOM_HOLD_INTERVAL_MS);
    }, ZOOM_HOLD_START_DELAY_MS);
  }

  function handleLocationButtonClick() {
    locationButtonWasClickedRef.current = true;

    if (safeUserLocation) {
      moveCenterWithoutChangingZoom(safeUserLocation);
      locationButtonWasClickedRef.current = false;
    }

    onLocationClick?.();
  }

  function handleMapTypeChange(nextType) {
    if (nextType === "satellite" && !canUseSatellite) {
      console.warn("VITE_MAPTILER_KEY is not configured. Satellite layer is disabled.");
      setMapType("scheme");
      return;
    }

    setMapType(nextType);
  }


  function getCoordinatesFromClientPoint(clientX, clientY) {
    const container = containerRef.current;
    if (!container) return null;

    const rect = container.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    const centerWorld = lonLatToWorldPixel(currentCenter, currentZoom);
    const deltaX = Number(clientX) - rect.left - rect.width / 2;
    const deltaY = Number(clientY) - rect.top - rect.height / 2;
    const [lng, lat] = worldPixelToLonLat([centerWorld[0] + deltaX, centerWorld[1] + deltaY], currentZoom);

    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    return { lat, lng };
  }

  function clearLongPressTimer() {
    if (longPressTimeoutRef.current) {
      window.clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  }

  function requestSavePointFromClientPoint(clientX, clientY, source = "native") {
    const now = Date.now();

    if (source === "native" && now - yandexContextHandledAtRef.current < 260) {
      return;
    }

    if (source === "yandex" && now - nativeContextHandledAtRef.current < 260) {
      return;
    }

    const coords = getCoordinatesFromClientPoint(clientX, clientY);
    if (!coords) return;

    if (source === "native") {
      nativeContextHandledAtRef.current = now;
    } else {
      yandexContextHandledAtRef.current = now;
    }

    moveCenterWithoutChangingZoom([coords.lng, coords.lat]);
    onMapContextMenu?.(coords);
  }

  function handleContainerContextMenu(event) {
    if (!onMapContextMenu || isMapOverlayElement(event.target)) return;

    event.preventDefault();
    event.stopPropagation();
    requestSavePointFromClientPoint(event.clientX, event.clientY, "native");
  }

  function handleContainerPointerDown(event) {
    if (!onMapContextMenu || event.pointerType === "mouse" || !event.isPrimary) return;
    if (isMapOverlayElement(event.target)) return;

    clearLongPressTimer();

    longPressStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
    };

    longPressTimeoutRef.current = window.setTimeout(() => {
      const start = longPressStartRef.current;
      if (!start || start.pointerId !== event.pointerId) return;

      requestSavePointFromClientPoint(start.x, start.y, "native");
      longPressStartRef.current = null;
      clearLongPressTimer();
    }, 640);
  }

  function handleContainerPointerMove(event) {
    const start = longPressStartRef.current;
    if (!start || start.pointerId !== event.pointerId) return;

    const dx = Math.abs(event.clientX - start.x);
    const dy = Math.abs(event.clientY - start.y);

    if (dx > 12 || dy > 12) {
      longPressStartRef.current = null;
      clearLongPressTimer();
    }
  }

  function handleContainerPointerEnd(event) {
    const start = longPressStartRef.current;
    if (!start || start.pointerId !== event.pointerId) return;

    longPressStartRef.current = null;
    clearLongPressTimer();
  }

  function getPointerCoordinates(event) {
    const coords = event?.coordinates;
    if (!coords) return null;

    const [lng, lat] = coords;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;

    return { lat, lng };
  }

  function handleMapClick(object, event) {
    const coords = getPointerCoordinates(event);
    if (!coords) return;

    moveCenterWithoutChangingZoom([coords.lng, coords.lat]);
    onMapClick?.(coords);
  }

  function handleMapContextMenu(object, event) {
    const coords = getPointerCoordinates(event);
    if (!coords) return;

    const now = Date.now();
    if (now - nativeContextHandledAtRef.current < 260) {
      return;
    }

    yandexContextHandledAtRef.current = now;
    event?.domEvent?.preventDefault?.();
    event?.domEvent?.stopPropagation?.();
    moveCenterWithoutChangingZoom([coords.lng, coords.lat]);
    onMapContextMenu?.(coords);
  }

  if (!components) {
    return <div style={{ padding: 16 }}>Загрузка карты...</div>;
  }

  const {
    YMap,
    YMapDefaultSchemeLayer,
    YMapDefaultFeaturesLayer,
    YMapListener,
    YMapMarker,
    YMapTileDataSource,
    YMapLayer,
    SphericalMercator,
  } = components;

  const satelliteProjection = effectiveMapType === "satellite" && SphericalMercator
    ? new SphericalMercator()
    : undefined;
  const shouldRenderSatellite = effectiveMapType === "satellite" && satelliteRasterSource && satelliteProjection;

  return (
    <div
      ref={containerRef}
      className="yandex-map-container"
      onContextMenuCapture={handleContainerContextMenu}
      onPointerDownCapture={handleContainerPointerDown}
      onPointerMoveCapture={handleContainerPointerMove}
      onPointerUpCapture={handleContainerPointerEnd}
      onPointerCancelCapture={handleContainerPointerEnd}
      onPointerLeaveCapture={handleContainerPointerEnd}
    >
      <YMap
        key={`${shouldRenderSatellite ? "satellite" : "scheme"}-${satelliteProjection ? "mercator" : "default"}`}
        location={location}
        projection={satelliteProjection}
        style={{ width: "100%", height: "100%" }}
      >
        {shouldRenderSatellite ? (
          <>
            <YMapTileDataSource id={SATELLITE_SOURCE_ID} raster={satelliteRasterSource} />
            <YMapLayer
              id={SATELLITE_LAYER_ID}
              source={SATELLITE_SOURCE_ID}
              type="tiles"
              zIndex={1000}
            />
          </>
        ) : (
          <YMapDefaultSchemeLayer />
        )}

        <YMapDefaultFeaturesLayer />

        <YMapListener
          onClick={handleMapClick}
          onContextMenu={handleMapContextMenu}
          onUpdate={(object, event) => {
            const payload = getUpdatePayload(object, event);
            const nextZoom = payload?.location?.zoom ?? payload?.zoom;
            const nextCenter = payload?.location?.center ?? payload?.center;

            if (Number.isFinite(nextZoom)) {
              if (Date.now() >= programmaticZoomLockUntilRef.current) {
                setCurrentZoom(clampZoom(nextZoom));
              }
            }

            if (Array.isArray(nextCenter) && nextCenter.length >= 2) {
              const normalized = normalizeCenter(nextCenter);

              // После программного центрирования карта может прислать промежуточный старый центр.
              // Не даём этому событию откатить выбранную точку назад, но zoom всё равно сохраняем.
              if (Date.now() < programmaticCenterLockUntilRef.current) {
                return;
              }

              setCurrentCenter((previous) => {
                if (isSameCenter(previous, normalized)) return previous;
                return normalized;
              });
            }
          }}
        />

        {points.map((point, index) => {
          const coordinates = normalizeLocation(point);
          if (!coordinates) return null;

          return (
            <YMapMarker
              key={point.id || `${coordinates[0]}-${coordinates[1]}-${index}`}
              coordinates={coordinates}
            >
              {markerElements[index]}
            </YMapMarker>
          );
        })}

        {safeUserLocation && (
          <YMapMarker coordinates={safeUserLocation}>
            <div
              className="yandex-map-user-marker"
              title="Моё местоположение"
            />
          </YMapMarker>
        )}
      </YMap>

      {showSatelliteSwitcher && (
        <div className="yandex-map-type-switcher" aria-label="Тип карты">
          <button
            type="button"
            className={!shouldRenderSatellite ? "active" : ""}
            onClick={() => handleMapTypeChange("scheme")}
          >
            Схема
          </button>
          <button
            type="button"
            className={shouldRenderSatellite ? "active" : ""}
            onClick={() => handleMapTypeChange("satellite")}
            disabled={!canUseSatellite}
            title={canUseSatellite ? "Спутник" : "Добавь VITE_MAPTILER_KEY в .env"}
          >
            Спутник
          </button>
        </div>
      )}

      <div className="yandex-map-controls">
        <button
          type="button"
          onClick={zoomIn}
          onPointerDown={() => startZoomHold("in")}
          onPointerUp={stopZoomHold}
          onPointerLeave={stopZoomHold}
          onPointerCancel={stopZoomHold}
          aria-label="Увеличить масштаб"
        >
          +
        </button>

        <button
          type="button"
          onClick={zoomOut}
          onPointerDown={() => startZoomHold("out")}
          onPointerUp={stopZoomHold}
          onPointerLeave={stopZoomHold}
          onPointerCancel={stopZoomHold}
          aria-label="Уменьшить масштаб"
        >
          −
        </button>

        {showLocationButton && onLocationClick && (
          <button
            type="button"
            onClick={handleLocationButtonClick}
            aria-label="Моё местоположение"
            title="Моё местоположение"
          >
            ⌖
          </button>
        )}
      </div>
    </div>
  );
}
