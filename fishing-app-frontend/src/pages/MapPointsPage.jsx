import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import YandexMap from "../components/YandexMap";
import {
  createMapPoint,
  deleteMapPoint,
  getMapPoints,
  updateMapPoint,
} from "../api/mapPointsApi";
import { apiRequest } from "../utils/apiClient";
import "../styles/mapPoints.css";

const DEFAULT_CENTER = [55.030878, 82.920179];
const USER_LOCATION_ZOOM = 14;
const SEARCH_RESULT_ZOOM = 16;
const NEW_POINT_ZOOM = 16;
const POINT_FOCUS_ZOOM = 17;

const emptyForm = {
  name: "",
  description: "",
  latitude: "",
  longitude: "",
  type: "0",
  region: "",
  isVisibleOnMap: true,
};

const pointTypeLabels = {
  0: "Место для рыбалки",
  1: "Пирс",
  2: "Домик отдыха",
  3: "Магазин",
  4: "Опасная зона",
  5: "Другое",
};

const pointTypeIcons = {
  0: "🎣",
  1: "⚓",
  2: "🏡",
  3: "🛒",
  4: "⚠️",
  5: "📍",
};

function normalizePoint(point) {
  return {
    ...point,
    isVisibleOnMap: point.isVisibleOnMap !== false,
  };
}

function getPointTypeLabel(type) {
  return pointTypeLabels[Number(type)] ?? "Другое";
}

function getPointTypeIcon(type) {
  return pointTypeIcons[Number(type)] ?? "📍";
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatCoordinate(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return number.toFixed(6);
}

function extractRegionFromAddress(value) {
  if (!value) return "";

  const ignored = new Set(["россия", "республика беларусь", "беларусь", "казахстан"]);
  const parts = String(value)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !/^\d{5,6}$/.test(part))
    .filter((part) => !ignored.has(part.toLowerCase()));

  if (parts.length === 0) return "";

  const cityLike = parts.find((part) =>
    /^(г\.?|город|пос[её]лок|деревня|село|пгт)\s/i.test(part)
  );

  return cityLike || parts[0];
}

function buildWeatherUrl(point) {
  const params = new URLSearchParams({
    lat: String(point.latitude),
    lon: String(point.longitude),
    placeName: point.name || "Точка на карте",
  });

  return `/weather?${params.toString()}`;
}

function buildCreateEntryUrl(point) {
  const params = new URLSearchParams({
    createEntry: "1",
    lat: String(point.latitude),
    lon: String(point.longitude),
    locationName: point.name || "",
    region: point.region || "",
    mapPointId: point.id || "",
    pointType: String(point.type ?? 0),
  });

  return `/profile?${params.toString()}`;
}

function getPointPayload(form) {
  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    latitude: Number(form.latitude),
    longitude: Number(form.longitude),
    type: Number(form.type),
    region: form.region.trim() || null,
    isVisibleOnMap: Boolean(form.isVisibleOnMap),
  };
}

function mapSearchResult(raw) {
  const latitude = raw.latitude ?? raw.lat ?? raw.Latitude;
  const longitude = raw.longitude ?? raw.lon ?? raw.lng ?? raw.Longitude;
  const address = raw.address ?? raw.Address ?? raw.formattedAddress ?? raw.FormattedAddress ?? "";
  const description = raw.description ?? raw.Description ?? address;
  const region = raw.region ?? raw.Region ?? extractRegionFromAddress(address || description);

  return {
    name: raw.name ?? raw.title ?? raw.Name ?? "Найденное место",
    description,
    region,
    latitude: Number(latitude),
    longitude: Number(longitude),
  };
}

async function tryApiRequest(url) {
  try {
    return await apiRequest(url);
  } catch {
    return null;
  }
}

async function searchPlaces(query) {
  const encoded = encodeURIComponent(query);
  const result = await tryApiRequest(`/Geocoding/search?query=${encoded}`)
    ?? await tryApiRequest(`/geocoding/search?query=${encoded}`)
    ?? await tryApiRequest(`/Geocoding?query=${encoded}`)
    ?? await tryApiRequest(`/geocoding?query=${encoded}`);

  const list = Array.isArray(result) ? result : result?.items || result?.results || [];
  return list
    .map(mapSearchResult)
    .filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));
}

async function reverseGeocode(latitude, longitude) {
  const result = await tryApiRequest(`/Geocoding/reverse?lat=${latitude}&lon=${longitude}`)
    ?? await tryApiRequest(`/geocoding/reverse?lat=${latitude}&lon=${longitude}`)
    ?? await tryApiRequest(`/Geocoding/reverse?latitude=${latitude}&longitude=${longitude}`)
    ?? await tryApiRequest(`/geocoding/reverse?latitude=${latitude}&longitude=${longitude}`);

  if (!result) return null;

  const address = result.address || result.formattedAddress || result.description || "";
  const region = result.region
    || result.city
    || result.locality
    || result.area
    || extractRegionFromAddress(address);

  return {
    name: result.name || result.title || address || "",
    region,
    description: address,
  };
}

function PointActionsMenu({ point, onEdit, onToggleVisibility, onDelete, onCreateEntry }) {
  const [open, setOpen] = useState(false);
  const isVisible = point.isVisibleOnMap !== false;

  return (
    <div className="map-point-menu-wrap">
      <button
        className="map-point-menu-button"
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Действия с точкой"
      >
        ⋮
      </button>

      {open && (
        <div className="map-point-menu">
          <button type="button" onClick={() => { setOpen(false); onEdit(point); }}>
            Изменить
          </button>
          <button type="button" onClick={() => { setOpen(false); onToggleVisibility(point); }}>
            {isVisible ? "Скрыть с карты" : "Показать на карте"}
          </button>
          <button type="button" onClick={() => { setOpen(false); onCreateEntry(point); }}>
            Создать запись здесь
          </button>
          <button type="button" className="danger" onClick={() => { setOpen(false); onDelete(point); }}>
            Удалить
          </button>
        </div>
      )}
    </div>
  );
}

export default function MapPointsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [points, setPoints] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [activePointId, setActivePointId] = useState(null);
  const [externalPoint, setExternalPoint] = useState(null);
  const [draftPoint, setDraftPoint] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [isErrorMessage, setIsErrorMessage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [mapCenter, setMapCenter] = useState(DEFAULT_CENTER);
  const [mapFocusKey, setMapFocusKey] = useState(null);
  const [mapFocusZoom, setMapFocusZoom] = useState(8);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [visibilityFilter, setVisibilityFilter] = useState("all");
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeResults, setPlaceResults] = useState([]);
  const [placeSearching, setPlaceSearching] = useState(false);

  const visiblePoints = useMemo(
    () => points.filter((point) => point.isVisibleOnMap !== false),
    [points]
  );

  const filteredPoints = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return points.filter((point) => {
      const matchesQuery = !normalizedQuery
        || `${point.name || ""} ${point.description || ""} ${point.region || ""}`
          .toLowerCase()
          .includes(normalizedQuery);

      const matchesType = typeFilter === "all" || Number(point.type) === Number(typeFilter);

      const matchesVisibility =
        visibilityFilter === "all"
        || (visibilityFilter === "visible" && point.isVisibleOnMap !== false)
        || (visibilityFilter === "hidden" && point.isVisibleOnMap === false);

      return matchesQuery && matchesType && matchesVisibility;
    });
  }, [points, query, typeFilter, visibilityFilter]);

  const pointsForMap = useMemo(() => {
    const markers = filteredPoints
      .filter((point) => point.isVisibleOnMap !== false)
      .map((point) => ({
        ...point,
        icon: getPointTypeIcon(point.type),
        markerTitle: getPointTypeLabel(point.type),
      }));

    if (externalPoint && !markers.some((point) => point.id === externalPoint.id)) {
      markers.push({
        ...externalPoint,
        icon: getPointTypeIcon(externalPoint.type),
        markerTitle: getPointTypeLabel(externalPoint.type),
      });
    }

    if (draftPoint && !markers.some((point) => point.id === draftPoint.id)) {
      markers.push({
        ...draftPoint,
        icon: getPointTypeIcon(draftPoint.type),
        markerTitle: "Выбранная точка",
      });
    }

    return markers;
  }, [draftPoint, externalPoint, filteredPoints]);

  function focusMap(longitude, latitude, zoom = POINT_FOCUS_ZOOM) {
    const lon = Number(longitude);
    const lat = Number(latitude);

    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;

    setMapCenter([lon, lat]);
    setMapFocusZoom(zoom);
    setMapFocusKey(`${lon}:${lat}:${zoom}:${Date.now()}`);
  }

  function showMessage(text, isError = false) {
    setMessage(text);
    setIsErrorMessage(isError);
  }

  async function loadPoints() {
    try {
      setLoading(true);
      const data = await getMapPoints();
      setPoints((data || []).map(normalizePoint));
    } catch (err) {
      showMessage(`Не удалось загрузить точки: ${err.message}`, true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPoints();
  }, []);

  useEffect(() => {
    const hasUrlPoint =
      searchParams.get("lat") &&
      (searchParams.get("lon") ||
        searchParams.get("lng") ||
        searchParams.get("longitude"));

    if (hasUrlPoint) return;
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = Number(position.coords.latitude.toFixed(6));
        const longitude = Number(position.coords.longitude.toFixed(6));

        setUserLocation({ latitude, longitude });
        focusMap(longitude, latitude, USER_LOCATION_ZOOM);
      },
      () => {
        // Не показываем ошибку при загрузке страницы: пользователь мог запретить геолокацию.
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 60000,
      }
    );
  }, [searchParams]);

  useEffect(() => {
    const lat = Number(searchParams.get("lat") || searchParams.get("latitude"));
    const lon = Number(
      searchParams.get("lon") ||
        searchParams.get("lng") ||
        searchParams.get("longitude")
    );

    const name =
      searchParams.get("name") ||
      searchParams.get("locationName") ||
      "Место из записи";

    const entryId = searchParams.get("entryId");
    const zoom = Number(searchParams.get("zoom")) || POINT_FOCUS_ZOOM;

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    const pointFromUrl = normalizePoint({
      id: "external",
      name,
      description: entryId ? "Точка из записи о рыбалке" : "Точка из ссылки",
      latitude: lat,
      longitude: lon,
      type: 0,
      region: "",
      isVisibleOnMap: true,
      createdAt: null,
    });

    setExternalPoint(pointFromUrl);
    setDraftPoint(null);
    setActivePointId("external");
    focusMap(lon, lat, zoom);
    setForm({
      ...emptyForm,
      name: "",
      latitude: lat.toFixed(6),
      longitude: lon.toFixed(6),
      type: "0",
      isVisibleOnMap: true,
    });
    setFormOpen(false);
  }, [searchParams]);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      setMessage("");
      setIsErrorMessage(false);
    }, 3500);

    return () => clearTimeout(timer);
  }, [message]);

  function prepareDraftPoint({ latitude, longitude, region = "", type = "0" }) {
    const lat = Number(latitude);
    const lon = Number(longitude);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    const nextDraft = normalizePoint({
      id: "draft",
      name: "Выбранная точка",
      description: "",
      latitude: lat,
      longitude: lon,
      type: Number(type),
      region,
      isVisibleOnMap: true,
      createdAt: null,
      icon: getPointTypeIcon(type),
    });

    setEditingId(null);
    setForm({
      ...emptyForm,
      name: "",
      description: "",
      latitude: lat.toFixed(6),
      longitude: lon.toFixed(6),
      type: String(type),
      region: region || "",
      isVisibleOnMap: true,
    });
    setDraftPoint(nextDraft);
    setExternalPoint(null);
    setActivePointId("draft");
    setFormOpen(false);
  }

  function openCreateFormFromDraft() {
    if (!draftPoint) return;
    setEditingId(null);
    setFormOpen(true);
  }

  const handleDetectLocation = useCallback(() => {
    if (!navigator.geolocation) {
      showMessage("Геолокация не поддерживается браузером.", true);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const latitude = Number(position.coords.latitude.toFixed(6));
        const longitude = Number(position.coords.longitude.toFixed(6));

        setUserLocation({ latitude, longitude });
        focusMap(longitude, latitude, USER_LOCATION_ZOOM);

        const geo = await reverseGeocode(latitude, longitude);
        prepareDraftPoint({
          latitude,
          longitude,
          region: geo?.region || "",
          type: "0",
        });

        showMessage("Местоположение определено. Можно сохранить точку.");
      },
      () => showMessage("Не удалось определить местоположение.", true),
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  }, []);

  const handleMapClick = useCallback(async (latlng) => {
    const latitude = Number(latlng.lat.toFixed(6));
    const longitude = Number(latlng.lng.toFixed(6));
    const geo = await reverseGeocode(latitude, longitude);
    focusMap(longitude, latitude, NEW_POINT_ZOOM);

    prepareDraftPoint({
      latitude,
      longitude,
      region: geo?.region || "",
      type: "0",
    });
  }, []);

  async function handlePlaceSearch(event) {
    event.preventDefault();

    if (!placeQuery.trim()) {
      setPlaceResults([]);
      return;
    }

    try {
      setPlaceSearching(true);
      const results = await searchPlaces(placeQuery.trim());
      setPlaceResults(results);

      if (results.length === 0) {
        showMessage("Места не найдены.", true);
      }
    } catch (err) {
      showMessage(`Не удалось выполнить поиск: ${err.message}`, true);
    } finally {
      setPlaceSearching(false);
    }
  }

  function selectSearchResult(result) {
    const latitude = Number(result.latitude.toFixed(6));
    const longitude = Number(result.longitude.toFixed(6));

    focusMap(longitude, latitude, SEARCH_RESULT_ZOOM);
    setPlaceResults([]);
    prepareDraftPoint({
      latitude,
      longitude,
      region: result.region || "",
      type: "0",
    });
  }

  function openPointOnMap(point) {
    setActivePointId(point.id);
    focusMap(point.longitude, point.latitude, POINT_FOCUS_ZOOM);
    setDraftPoint(null);
    setFormOpen(false);
    showMessage(`Открыта точка: ${point.name}`);
  }

  function startEdit(point) {
    setEditingId(point.id);
    setActivePointId(point.id);
    setDraftPoint(null);
    setForm({
      name: point.name || "",
      description: point.description || "",
      latitude: point.latitude ?? "",
      longitude: point.longitude ?? "",
      type: String(point.type ?? "0"),
      region: point.region || "",
      isVisibleOnMap: point.isVisibleOnMap !== false,
    });

    focusMap(point.longitude, point.latitude, POINT_FOCUS_ZOOM);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");

    if (!form.name.trim()) {
      showMessage("Укажи название точки.", true);
      return;
    }

    if (!Number.isFinite(Number(form.latitude)) || !Number.isFinite(Number(form.longitude))) {
      showMessage("Выбери точку на карте или через поиск.", true);
      return;
    }

    try {
      setSaving(true);
      const payload = getPointPayload(form);

      if (editingId) {
        const updated = normalizePoint(await updateMapPoint(editingId, payload));
        setPoints((current) => current.map((point) => point.id === editingId ? updated : point));
        setActivePointId(updated.id);
        showMessage("Точка обновлена");
      } else {
        const created = normalizePoint(await createMapPoint(payload));
        setPoints((current) => [created, ...current]);
        setActivePointId(created.id);
        showMessage("Точка создана");
      }

      setEditingId(null);
      setForm(emptyForm);
      setDraftPoint(null);
      setExternalPoint(null);
      setFormOpen(false);
      setSearchParams({});
    } catch (err) {
      showMessage(`Не удалось сохранить точку: ${err.message}`, true);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(point) {
    const confirmed = window.confirm(`Удалить точку "${point.name}"?`);
    if (!confirmed) return;

    try {
      await deleteMapPoint(point.id);
      setPoints((current) => current.filter((item) => item.id !== point.id));

      if (editingId === point.id) {
        closeForm();
      }

      if (activePointId === point.id) {
        setActivePointId(null);
      }

      showMessage("Точка удалена");
    } catch (err) {
      showMessage(`Не удалось удалить точку: ${err.message}`, true);
    }
  }

  async function handleToggleVisibility(point) {
    try {
      const payload = {
        name: point.name,
        description: point.description || null,
        latitude: point.latitude,
        longitude: point.longitude,
        type: point.type,
        region: point.region || null,
        isVisibleOnMap: point.isVisibleOnMap === false,
      };

      const updated = normalizePoint(await updateMapPoint(point.id, payload));
      setPoints((current) => current.map((item) => item.id === point.id ? updated : item));
      showMessage(updated.isVisibleOnMap ? "Точка показана на карте" : "Точка скрыта с карты");
    } catch (err) {
      showMessage(`Не удалось изменить видимость: ${err.message}`, true);
    }
  }

  return (
    <div className="map-points-page">
      <header className="map-points-header">
        <div>
          <p className="map-points-kicker">Мои места</p>
          <h1>Карта рыболова</h1>
          <p>
            Сохраняй перспективные места, пирсы, магазины и зоны риска. Фильтры управляют и списком, и маркерами на карте.
          </p>
        </div>

        <div className="map-points-header-stats">
          <div>
            <strong>{points.length}</strong>
            <span>всего точек</span>
          </div>
          <div>
            <strong>{visiblePoints.length}</strong>
            <span>на карте</span>
          </div>
        </div>
      </header>

      {message && (
        <div className={`map-points-message ${isErrorMessage ? "error" : "success"}`}>
          {message}
        </div>
      )}

      <section className="map-points-map-card">
        <div className="map-points-map-topbar map-points-map-topbar-search-only">
          <form className="map-points-place-search" onSubmit={handlePlaceSearch}>
            <input
              value={placeQuery}
              onChange={(event) => setPlaceQuery(event.target.value)}
              placeholder="Найти место, озеро или город"
            />
            <button type="submit" disabled={placeSearching}>
              {placeSearching ? "Ищем..." : "Найти"}
            </button>
          </form>
        </div>

        {placeResults.length > 0 && (
          <div className="map-points-search-results">
            {placeResults.map((result, index) => (
              <button key={`${result.latitude}-${result.longitude}-${index}`} type="button" onClick={() => selectSearchResult(result)}>
                <strong>{result.name}</strong>
                <span>{result.description || result.region || `${formatCoordinate(result.latitude)}, ${formatCoordinate(result.longitude)}`}</span>
              </button>
            ))}
          </div>
        )}

        <div className="map-points-map-shell">
          <YandexMap
            points={pointsForMap}
            userLocation={userLocation}
            onMapClick={handleMapClick}
            onLocationClick={handleDetectLocation}
            center={mapCenter}
            zoom={8}
            focusKey={mapFocusKey}
            focusZoom={mapFocusZoom}
          />

          {draftPoint && !formOpen && (
            <div className="map-points-selected-panel">
              <div>
                <p className="map-points-kicker">Выбрана точка</p>
                <strong>Сохранить выбранную точку</strong>
              </div>
              <button type="button" className="map-points-primary-button" onClick={openCreateFormFromDraft}>
                Сохранить
              </button>
            </div>
          )}

          {formOpen && (
            <div className="map-points-form-backdrop" onClick={closeForm}>
              <form className="map-points-floating-form" onSubmit={handleSubmit} onClick={(event) => event.stopPropagation()}>
                <div className="map-points-form-header">
                  <button type="button" className="map-points-back-button" onClick={closeForm} aria-label="Закрыть форму">
                    ←
                  </button>
                  <div>
                    <p className="map-points-kicker">{editingId ? "Редактирование" : "Новая точка"}</p>
                    <h2>{editingId ? "Изменить точку" : "Сохранить место"}</h2>
                  </div>
                  <button type="button" className="map-points-close-button" onClick={closeForm} aria-label="Закрыть">
                    ×
                  </button>
                </div>

                <label>
                  Название
                  <input
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                    placeholder="Например: Пирс у старого моста"
                    required
                  />
                </label>

                <div className="map-points-type-picker">
                  {Object.entries(pointTypeLabels).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={Number(form.type) === Number(value) ? "active" : ""}
                      onClick={() => {
                        setForm({ ...form, type: value });
                        setDraftPoint((current) => current ? { ...current, type: Number(value), icon: getPointTypeIcon(value) } : current);
                      }}
                    >
                      <span>{getPointTypeIcon(value)}</span>
                      <small>{label}</small>
                    </button>
                  ))}
                </div>

                <label>
                  Описание
                  <textarea
                    value={form.description}
                    onChange={(event) => setForm({ ...form, description: event.target.value })}
                    placeholder="Что важно знать об этом месте"
                  />
                </label>

                <label className={`map-points-visibility-card ${form.isVisibleOnMap ? "active" : ""}`}>
                  <input
                    type="checkbox"
                    checked={form.isVisibleOnMap}
                    onChange={(event) => setForm({ ...form, isVisibleOnMap: event.target.checked })}
                  />
                  <span className="map-points-toggle" />
                  <span>
                    <strong>Показывать на карте</strong>
                    <small>Если выключить, точка останется в списке, но исчезнет с карты.</small>
                  </span>
                </label>

                <div className="map-points-form-actions">
                  <button type="submit" className="map-points-primary-button" disabled={saving}>
                    {saving ? "Сохранение..." : editingId ? "Сохранить изменения" : "Добавить точку"}
                  </button>
                  <button type="button" className="map-points-secondary-button" onClick={closeForm}>
                    Закрыть
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </section>

      <section className="map-points-list-section">
        <div className="map-points-list-header">
          <div>
            <p className="map-points-kicker">Список</p>
            <h2>Сохранённые точки</h2>
          </div>

          <div className="map-points-filters">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Поиск по названию, описанию или региону"
            />
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              <option value="all">Все типы</option>
              {Object.entries(pointTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <select value={visibilityFilter} onChange={(event) => setVisibilityFilter(event.target.value)}>
              <option value="all">Все точки</option>
              <option value="visible">На карте</option>
              <option value="hidden">Скрытые</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="map-points-empty">Загрузка точек...</div>
        ) : filteredPoints.length === 0 ? (
          <div className="map-points-empty">
            <span>📍</span>
            <h3>Точки не найдены</h3>
            <p>Выбери место на карте или используй поиск, чтобы добавить первую точку.</p>
          </div>
        ) : (
          <div className="map-points-grid">
            {filteredPoints.map((point) => {
              const isActive = activePointId === point.id;
              const isVisible = point.isVisibleOnMap !== false;

              return (
                <article key={point.id} className={`map-point-card ${isActive ? "active" : ""} ${!isVisible ? "hidden-point" : ""}`}>
                  <PointActionsMenu
                    point={point}
                    onEdit={startEdit}
                    onToggleVisibility={handleToggleVisibility}
                    onDelete={handleDelete}
                    onCreateEntry={(item) => navigate(buildCreateEntryUrl(item))}
                  />

                  <div className="map-point-card-header">
                    <span className="map-point-icon">{getPointTypeIcon(point.type)}</span>
                    <div>
                      <h3>{point.name}</h3>
                      <p>{getPointTypeLabel(point.type)} · {point.region || "Регион не указан"}</p>
                    </div>
                  </div>

                  {point.description && <p className="map-point-description">{point.description}</p>}

                  <div className="map-point-coordinates">
                    <span>Широта: <strong>{formatCoordinate(point.latitude)}</strong></span>
                    <span>Долгота: <strong>{formatCoordinate(point.longitude)}</strong></span>
                  </div>

                  <div className="map-point-meta">
                    <span>{formatDate(point.createdAt)}</span>
                    <span>{isVisible ? "На карте" : "Скрыта"}</span>
                  </div>

                  <div className="map-point-actions map-point-actions-main">
                    <button type="button" onClick={() => openPointOnMap(point)}>
                      Открыть на карте
                    </button>
                    <button type="button" className="map-points-secondary-button" onClick={() => navigate(buildWeatherUrl(point))}>
                      Прогноз
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
