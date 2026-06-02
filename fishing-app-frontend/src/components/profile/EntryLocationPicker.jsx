import { useEffect, useMemo, useRef, useState } from "react";
import YandexMap from "../YandexMap";
import { getMapPoints } from "../../api/mapPointsApi";
import { searchPlaces } from "../../api/geocodingApi";
import "../../styles/entryLocationPicker.css";

const DEFAULT_MAP_CENTER = [27.5667, 53.9];

function getFormCoordinatePoint(form) {
  if (form?.latitude === "" || form?.longitude === "" || form?.latitude == null || form?.longitude == null) {
    return null;
  }

  const latitude = Number(form.latitude);
  const longitude = Number(form.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { latitude, longitude };
}

export default function EntryLocationPicker({ isOpen, form, setForm, setLocalMessage }) {
  const [mapCenter, setMapCenter] = useState(DEFAULT_MAP_CENTER);
  const [userLocation, setUserLocation] = useState(null);
  const [savedPoints, setSavedPoints] = useState([]);
  const [savedPointQuery, setSavedPointQuery] = useState("");
  const [savedPointsOpen, setSavedPointsOpen] = useState(false);
  const [savedPointsLoading, setSavedPointsLoading] = useState(false);
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeResults, setPlaceResults] = useState([]);
  const [placeResultsOpen, setPlaceResultsOpen] = useState(false);
  const [placeSearchLoading, setPlaceSearchLoading] = useState(false);
  const locationSearchRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      setSavedPointQuery("");
      setSavedPointsOpen(false);
      setPlaceQuery("");
      setPlaceResults([]);
      setPlaceResultsOpen(false);
      setPlaceSearchLoading(false);
      return;
    }

    const selectedPoint = getFormCoordinatePoint(form);
    setMapCenter(selectedPoint ? [selectedPoint.longitude, selectedPoint.latitude] : DEFAULT_MAP_CENTER);
  }, [form?.latitude, form?.longitude, isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

    let cancelled = false;

    async function loadSavedPoints() {
      try {
        setSavedPointsLoading(true);
        const points = await getMapPoints();

        if (!cancelled) {
          setSavedPoints(Array.isArray(points) ? points : []);
        }
      } catch (err) {
        console.error(err);

        if (!cancelled) {
          setSavedPoints([]);
          setLocalMessage?.(`Не удалось загрузить сохранённые точки: ${err.message}`);
        }
      } finally {
        if (!cancelled) {
          setSavedPointsLoading(false);
        }
      }
    }

    loadSavedPoints();

    return () => {
      cancelled = true;
    };
  }, [isOpen, setLocalMessage]);

  useEffect(() => {
    if (!savedPointsOpen && !placeResultsOpen) return undefined;

    function handleOutsideClick(event) {
      if (!locationSearchRef.current?.contains(event.target)) {
        setSavedPointsOpen(false);
        setPlaceResultsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
    };
  }, [savedPointsOpen, placeResultsOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const normalizedQuery = placeQuery.trim();

    if (normalizedQuery.length < 2) {
      setPlaceResults([]);
      setPlaceSearchLoading(false);
      return undefined;
    }

    setPlaceResultsOpen(true);

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        setPlaceSearchLoading(true);
        const results = await searchPlaces(normalizedQuery);

        if (!cancelled) {
          setPlaceResults(Array.isArray(results) ? results.filter(Boolean) : []);
        }
      } catch (err) {
        console.error(err);

        if (!cancelled) {
          setPlaceResults([]);
          setLocalMessage?.(`Не удалось выполнить поиск места: ${err.message}`);
        }
      } finally {
        if (!cancelled) {
          setPlaceSearchLoading(false);
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isOpen, placeQuery, setLocalMessage]);

  const filteredSavedPoints = useMemo(() => {
    const normalizedQuery = savedPointQuery.trim().toLowerCase();

    return savedPoints
      .filter((point) => {
        if (!normalizedQuery) return true;

        const searchableText = [point.name, point.region, point.description, point.typeName]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return searchableText.includes(normalizedQuery);
      })
      .slice(0, 8);
  }, [savedPointQuery, savedPoints]);

  function handleDetectLocation() {
    if (!navigator.geolocation) {
      setLocalMessage?.("Геолокация не поддерживается браузером.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = Number(position.coords.latitude.toFixed(6));
        const longitude = Number(position.coords.longitude.toFixed(6));

        setUserLocation({ latitude, longitude });
        setForm((current) => ({
          ...current,
          latitude: latitude.toString(),
          longitude: longitude.toString(),
          locationName: current.locationName || "Моё местоположение",
        }));
        setMapCenter([longitude, latitude]);
        setLocalMessage?.("Координаты добавлены.");
      },
      () => setLocalMessage?.("Не удалось определить местоположение."),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  function handleMapClick(latlng) {
    const latitude = Number(latlng.lat.toFixed(6));
    const longitude = Number(latlng.lng.toFixed(6));

    setForm((current) => ({
      ...current,
      latitude: latitude.toString(),
      longitude: longitude.toString(),
      locationName: current.locationName || "Выбранная точка",
    }));
  }

  function selectEntryLocation({ name, address, region, latitude, longitude }) {
    if (latitude == null || longitude == null) {
      setLocalMessage?.("У выбранного места нет координат.");
      return;
    }

    const nextLatitude = Number(latitude);
    const nextLongitude = Number(longitude);

    if (!Number.isFinite(nextLatitude) || !Number.isFinite(nextLongitude)) {
      setLocalMessage?.("У выбранного места некорректные координаты.");
      return;
    }

    const locationName = name || address || region || "Выбранная точка";

    setForm((current) => ({
      ...current,
      locationName,
      latitude: nextLatitude.toFixed(6),
      longitude: nextLongitude.toFixed(6),
    }));

    setMapCenter([nextLongitude, nextLatitude]);
    setSavedPointsOpen(false);
    setPlaceResultsOpen(false);
    setLocalMessage?.("Место ловли выбрано.");
  }

  const selectedCoordinatePoint = getFormCoordinatePoint(form);
  const selectedMapPoint = selectedCoordinatePoint
    ? [
        {
          id: "entry-location-point",
          name: form.locationName || "Место ловли",
          latitude: selectedCoordinatePoint.latitude,
          longitude: selectedCoordinatePoint.longitude,
          type: 0,
          region: null,
          description: "Точка из записи о рыбалке",
        },
      ]
    : [];

  return (
    <section className="profile-location-picker">
      <div className="profile-location-picker-header">
        <div>
          <p className="profile-kicker">Место ловли</p>
          <h3>Выбор точки на карте</h3>
        </div>
      </div>

      <div className="profile-saved-points-search" ref={locationSearchRef}>
        <div>
          <strong>Поиск места</strong>
          <p>Выбери сохранённую точку или найди новое место через поиск по карте.</p>
        </div>

        <div className="profile-location-search-grid">
          <div className="profile-location-search-field profile-location-search-field-dropdown">
            <span>Сохранённые точки</span>
            <input
              value={savedPointQuery}
              onChange={(event) => {
                setSavedPointQuery(event.target.value);
                setSavedPointsOpen(true);
                setPlaceResultsOpen(false);
              }}
              onFocus={() => {
                setSavedPointsOpen(true);
                setPlaceResultsOpen(false);
              }}
              placeholder={savedPointsLoading ? "Загружаем точки..." : "Название, регион или описание точки"}
              autoComplete="off"
            />

            {savedPointsOpen && (
              <div className="profile-location-search-dropdown profile-location-search-dropdown-single">
                <div className="profile-location-search-title">Сохранённые точки</div>

                {savedPointsLoading ? (
                  <div className="profile-location-search-empty">Загружаем...</div>
                ) : filteredSavedPoints.length === 0 ? (
                  <div className="profile-location-search-empty">
                    {savedPointQuery.trim() ? "Точки не найдены" : "Сохранённых точек пока нет"}
                  </div>
                ) : (
                  filteredSavedPoints.map((point) => (
                    <button
                      key={point.id}
                      className="profile-location-search-option"
                      type="button"
                      onClick={() => selectEntryLocation(point)}
                    >
                      <strong>{point.name || "Точка без названия"}</strong>
                      <span>{point.region || point.description || "Сохранённая точка"}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="profile-location-search-field profile-location-search-field-dropdown">
            <span>Поиск места</span>
            <input
              value={placeQuery}
              onChange={(event) => {
                setPlaceQuery(event.target.value);
                setPlaceResultsOpen(true);
                setSavedPointsOpen(false);
              }}
              onFocus={() => {
                setPlaceResultsOpen(true);
                setSavedPointsOpen(false);
              }}
              placeholder="Например: озеро, река, деревня"
              autoComplete="off"
            />

            {placeResultsOpen && (
              <div className="profile-location-search-dropdown profile-location-search-dropdown-single">
                <div className="profile-location-search-title">Найденные места</div>

                {placeSearchLoading ? (
                  <div className="profile-location-search-empty">Ищем...</div>
                ) : placeQuery.trim().length < 2 ? (
                  <div className="profile-location-search-empty">Введите минимум 2 символа</div>
                ) : placeResults.length === 0 ? (
                  <div className="profile-location-search-empty">Места не найдены</div>
                ) : (
                  placeResults.map((place, index) => (
                    <button
                      key={`${place.latitude}-${place.longitude}-${index}`}
                      className="profile-location-search-option"
                      type="button"
                      onClick={() => selectEntryLocation(place)}
                    >
                      <strong>{place.name || "Место на карте"}</strong>
                      <span>{place.address || place.description || place.region || "Найдено через геокодер"}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="profile-location-map-wrapper">
        <YandexMap
          points={selectedMapPoint}
          userLocation={userLocation}
          onMapClick={handleMapClick}
          onLocationClick={handleDetectLocation}
          center={mapCenter}
          zoom={8}
        />
      </div>
    </section>
  );
}
