import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import YandexMap from "../components/YandexMap";
import { getWeather } from "../api/weatherApi";
import { searchPlaces } from "../api/geocodingApi";
import "../styles/WeatherPage.css";

function getTodayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function parseLocalDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00`);
  }

  return new Date(value);
}

function getDateKey(value) {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  return new Date(value).toISOString().slice(0, 10);
}

function formatDate(date) {
  const dateObject = parseLocalDate(date);
  if (!dateObject || Number.isNaN(dateObject.getTime())) return "—";

  return dateObject.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatShortDate(date) {
  const dateObject = parseLocalDate(date);
  if (!dateObject || Number.isNaN(dateObject.getTime())) return "—";

  return dateObject.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
  });
}

function formatDayName(date, index) {
  const dateObject = parseLocalDate(date);
  if (!dateObject || Number.isNaN(dateObject.getTime())) return `День ${index + 1}`;

  // Подписи считаем от первого дня прогноза, а не от текущей системной даты.
  // Так при открытии прогноза из отчёта/выбранной даты первый день всегда корректно называется "Сегодня".
  if (index === 0) return "Сегодня";
  if (index === 1) return "Завтра";

  return dateObject
    .toLocaleDateString("ru-RU", { weekday: "short" })
    .replace(".", "");
}

function formatTime(dateTime) {
  if (!dateTime) return "—";

  return new Date(dateTime).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatHour(dateTime) {
  if (!dateTime) return "—";

  return new Date(dateTime).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatNumber(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }

  return Number(value).toFixed(digits);
}

function formatTemperature(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";

  const rounded = Math.round(Number(value));
  return `${rounded > 0 ? "+" : ""}${rounded}`;
}

function hpaToMmHg(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return null;
  }

  return Number(value) * 0.750062;
}

function formatDaylightDuration(seconds) {
  if (seconds === null || seconds === undefined || Number.isNaN(Number(seconds))) {
    return "—";
  }

  const hours = Math.floor(Number(seconds) / 3600);
  const minutes = Math.round((Number(seconds) % 3600) / 60);

  return `${hours} ч ${minutes} мин`;
}

function getWeatherEmoji(code) {
  if (code === 0) return "☀️";
  if ([1, 2].includes(code)) return "🌤️";
  if (code === 3) return "☁️";
  if ([45, 48].includes(code)) return "🌫️";
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return "🌧️";
  if ([71, 73, 75].includes(code)) return "❄️";
  if ([95, 96, 99].includes(code)) return "⛈️";
  return "🌦️";
}

export default function WeatherPage() {
  const [searchParams] = useSearchParams();
  const hourlyTableRef = useRef(null);

  const queryLat = searchParams.get("lat") || searchParams.get("latitude");
  const queryLon =
    searchParams.get("lon") ||
    searchParams.get("lng") ||
    searchParams.get("longitude");
  const queryDateFromUrl = searchParams.get("date");
  const queryDate = queryDateFromUrl
    ? getDateKey(queryDateFromUrl)
    : getTodayDateString();
  const queryPlaceName =
    searchParams.get("placeName") ||
    searchParams.get("locationName") ||
    "";

  const [weather, setWeather] = useState(null);
  const [message, setMessage] = useState("");
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [selectedDate, setSelectedDate] = useState(queryDate);
  const [activeDay, setActiveDay] = useState(queryDate);
  const [loadingWeather, setLoadingWeather] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [mapCenter, setMapCenter] = useState([27.5667, 53.9]);
  const [mapZoom, setMapZoom] = useState(8);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const handleLoadWeather = useCallback(
    async (latitude, longitude, placeName = queryPlaceName, date = getTodayDateString()) => {
      setWeather(null);
      setMessage("");
      setLoadingWeather(true);

      try {
        const data = await getWeather({
          lat: latitude,
          lon: longitude,
          date,
          placeName,
        });

        setWeather(data);
        setActiveDay(getDateKey(data?.date || date));
      } catch (err) {
        console.error(err);
        setMessage(`Не удалось получить погоду: ${err.message}`);
      } finally {
        setLoadingWeather(false);
      }
    },
    [queryPlaceName]
  );

  const handleDetectLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setMessage("Геолокация не поддерживается браузером.");
      setLoadingLocation(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const latitude = Number(position.coords.latitude.toFixed(6));
        const longitude = Number(position.coords.longitude.toFixed(6));
        const today = getTodayDateString();

        setUserLocation({ latitude, longitude });
        setSelectedPoint({
          id: "selected-weather-point",
          name: "Моё местоположение",
          latitude,
          longitude,
          type: 0,
          region: null,
          description: null,
        });

        setMapCenter([longitude, latitude]);
        setMapZoom(13);
        setSelectedDate(today);
        setActiveDay(today);
        setLoadingLocation(false);
        await handleLoadWeather(latitude, longitude, "Моё местоположение", today);
      },
      (error) => {
        console.error(error);
        setMessage("Не удалось определить местоположение.");
        setLoadingLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  }, [handleLoadWeather]);

  useEffect(() => {
    if (!queryLat || !queryLon) {
      handleDetectLocation();
      return;
    }

    const latitude = Number(queryLat);
    const longitude = Number(queryLon);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      handleDetectLocation();
      return;
    }

    setSelectedDate(queryDate);
    setActiveDay(queryDate);
    setSelectedPoint({
      id: "selected-weather-point",
      name: queryPlaceName || "Выбранная точка",
      latitude,
      longitude,
      type: 0,
      region: null,
      description: null,
    });

    setMapCenter([longitude, latitude]);
    setMapZoom(14);
    setLoadingLocation(false);
    handleLoadWeather(latitude, longitude, queryPlaceName || "Место из записи", queryDate);
  }, [queryLat, queryLon, queryDate, queryPlaceName, handleDetectLocation, handleLoadWeather]);

  useEffect(() => {
    const table = hourlyTableRef.current;

    if (!table) return undefined;

    const handleWheel = (event) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;

      event.preventDefault();
      table.scrollLeft += event.deltaY;
    };

    table.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      table.removeEventListener("wheel", handleWheel);
    };
  }, [weather, activeDay]);

  async function handleSearchPlace(event) {
    event.preventDefault();

    if (!searchQuery.trim()) {
      setMessage("Введите название города или места.");
      return;
    }

    setSearchLoading(true);
    setMessage("");

    try {
      const results = await searchPlaces(searchQuery.trim());
      setSearchResults(results || []);

      if (!results || results.length === 0) {
        setMessage("Место не найдено.");
      }
    } catch (err) {
      console.error(err);
      setMessage(`Не удалось выполнить поиск: ${err.message}`);
    } finally {
      setSearchLoading(false);
    }
  }

  async function handleSelectPlace(place) {
    const latitude = Number(place.latitude);
    const longitude = Number(place.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setMessage("У найденного места некорректные координаты.");
      return;
    }

    const today = getTodayDateString();
    const placeName = place.address || place.name || "Выбранное место";

    setSelectedPoint({
      id: "selected-weather-point",
      name: placeName,
      latitude,
      longitude,
      type: 0,
      region: null,
      description: place.description || null,
    });

    setMapCenter([longitude, latitude]);
    setMapZoom(13);
    setSelectedDate(today);
    setActiveDay(today);
    setSearchQuery(placeName);
    setSearchResults([]);
    setLoadingLocation(false);

    await handleLoadWeather(latitude, longitude, placeName, today);
  }

  const handleMapClick = useCallback(
    async (latlng) => {
      const latitude = Number(latlng.lat.toFixed(6));
      const longitude = Number(latlng.lng.toFixed(6));
      const today = getTodayDateString();

      setSelectedPoint({
        id: "selected-weather-point",
        name: "Выбранная точка",
        latitude,
        longitude,
        type: 0,
        region: null,
        description: null,
      });

      setMapCenter([longitude, latitude]);
      setMapZoom(14);
      setSelectedDate(today);
      setActiveDay(today);
      await handleLoadWeather(latitude, longitude, "Выбранная точка", today);
    },
    [handleLoadWeather]
  );

  async function handleDateChange(event) {
    const nextDate = event.target.value;
    setSelectedDate(nextDate);
    setActiveDay(nextDate);

    if (!selectedPoint) return;

    await handleLoadWeather(
      selectedPoint.latitude,
      selectedPoint.longitude,
      selectedPoint.name,
      nextDate
    );
  }

  async function handleTodayClick() {
    const today = getTodayDateString();
    setSelectedDate(today);
    setActiveDay(today);

    if (!selectedPoint) return;

    await handleLoadWeather(
      selectedPoint.latitude,
      selectedPoint.longitude,
      selectedPoint.name,
      today
    );
  }

  const weatherPoints = useMemo(() => {
    return selectedPoint ? [selectedPoint] : [];
  }, [selectedPoint]);

  const pageTitle = weather?.placeName || selectedPoint?.name || queryPlaceName || "Выбранная точка";
  const weatherDate = weather?.date || selectedDate;

  const dailyList = useMemo(() => weather?.daily || [], [weather]);
  const activeDayData = dailyList.find((day) => getDateKey(day.date) === getDateKey(activeDay));
  const activeDayHours = useMemo(() => {
    return (weather?.hourly || []).filter((hour) => getDateKey(hour.time) === getDateKey(activeDay));
  }, [weather, activeDay]);

  return (
    <div className="weather-page">
      <header className="weather-page-header">
        <div>
          <p className="weather-kicker">НаКлёве · погода</p>
          <h1>Погода для рыбалки</h1>
          <p>Поиск места, выбор точки на карте и подробный прогноз на нужную дату.</p>
        </div>
      </header>

      <section className="weather-map-card">
        <form className="weather-search" onSubmit={handleSearchPlace}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Найти город, озеро или место..."
          />

          <button type="submit" disabled={searchLoading}>
            {searchLoading ? "Ищем..." : "Найти"}
          </button>
        </form>

        {searchResults.length > 0 && (
          <div className="weather-search-results">
            {searchResults.map((place) => (
              <button
                type="button"
                key={`${place.latitude}-${place.longitude}-${place.name}`}
                onClick={() => handleSelectPlace(place)}
              >
                <strong>{place.name}</strong>
                <span>{place.description || place.address}</span>
              </button>
            ))}
          </div>
        )}

        <div className="weather-map-info">
          <div className="weather-date-control weather-top-card">
            <span>Дата</span>

            <div className="weather-date-input-row">
              <input type="date" value={selectedDate} onChange={handleDateChange} />
              <button type="button" onClick={handleTodayClick}>
                Сегодня
              </button>
            </div>

            <small>{formatDate(weatherDate)}</small>
          </div>

          <div className="weather-top-card weather-point-card">
            <span>Точка</span>
            <strong>{pageTitle}</strong>
            <small>
              {weather?.isHistorical ? "Фактическая погода за выбранную дату" : "Прогноз для выбранной точки"}
            </small>
          </div>
        </div>

        <div className="weather-map-wrapper">
          {loadingLocation ? (
            <div className="weather-loading-box">Определяем ваше местоположение...</div>
          ) : (
            <YandexMap
              points={weatherPoints}
              userLocation={userLocation}
              onMapClick={handleMapClick}
              onLocationClick={handleDetectLocation}
              center={mapCenter}
              zoom={mapZoom}
            />
          )}
        </div>
      </section>

      {message && <div className="weather-message">{message}</div>}
      {loadingWeather && <div className="weather-loading-panel">Загружаем погоду...</div>}

      {weather && (
        <>
          <section className="weather-summary-card">
            <div className="weather-summary-main">
              <div className="weather-emoji">{getWeatherEmoji(weather.weatherCode)}</div>

              <div className="weather-summary-text">
                <p className="weather-kicker weather-summary-kicker">
                  {weather.isHistorical ? "Фактическая погода" : "Прогноз погоды"}
                </p>
                <h2>{pageTitle}</h2>
                <p className="weather-date">
                  {formatDate(weather.date)} · {formatTime(weather.forecastTime)}
                </p>
              </div>
            </div>

            <div className="weather-temp-block">
              <strong>
                {weather.temperature === null || weather.temperature === undefined
                  ? "—"
                  : `${Math.round(weather.temperature)}°C`}
              </strong>
              <span>{weather.description || "Нет описания"}</span>
            </div>
          </section>
          {!weather.isHistorical && dailyList.length > 0 && (
            <section className="weather-week-section">
              <div className="weather-section-title weather-section-title-compact">
                <h2>Дневной прогноз</h2>
              </div>

              <div className="weather-week-cards">
                {dailyList.slice(0, 7).map((day, index) => {
                  const dayKey = getDateKey(day.date);
                  const isActive = dayKey === getDateKey(activeDay);

                  return (
                    <button
                      key={dayKey}
                      type="button"
                      className={`weather-day-card ${isActive ? "active" : ""}`}
                      onClick={() => setActiveDay(dayKey)}
                    >
                      <span className="weather-day-card-name">{formatDayName(day.date, index)}</span>
                      <span className="weather-day-card-date">{formatShortDate(day.date)}</span>
                      <span className="weather-day-card-icon">{getWeatherEmoji(day.weatherCode)}</span>
                      <span className="weather-day-card-description">{day.description}</span>
                      <span className="weather-day-card-temp">
                        {formatTemperature(day.temperatureMax)}° / {formatTemperature(day.temperatureMin)}°
                      </span>
                      <span className="weather-day-card-meta">🌧️ {formatNumber(day.precipitation)} мм</span>
                      <span className="weather-day-card-meta">💨 {formatNumber(day.windSpeedMax)} м/с</span>
                      <span className="weather-day-card-sun">
                        🌅 {formatTime(day.sunrise)} · 🌇 {formatTime(day.sunset)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          <section className="weather-hourly-section">
            <div className="weather-section-title weather-section-title-compact">
              <h2>Почасовой прогноз · {formatDate(activeDayData?.date || activeDay)}</h2>
            </div>

            <div className="weather-hourly-table-wrapper" ref={hourlyTableRef}>
              <table className="weather-hourly-table">
                <tbody>
                  <tr>
                    <th>Время</th>
                    {activeDayHours.map((hour) => (
                      <td key={hour.time}>{formatHour(hour.time)}</td>
                    ))}
                  </tr>
                  <tr>
                    <th>Погода</th>
                    {activeDayHours.map((hour) => (
                      <td key={hour.time} title={hour.description}>
                        <span className="weather-hourly-table-icon">{getWeatherEmoji(hour.weatherCode)}</span>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th>Температура, °C</th>
                    {activeDayHours.map((hour) => (
                      <td key={hour.time} className="weather-hourly-temp-cell">
                        {formatTemperature(hour.temperature)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th>Осадки, мм</th>
                    {activeDayHours.map((hour) => (
                      <td key={hour.time}>{formatNumber(hour.precipitation)}</td>
                    ))}
                  </tr>
                  <tr>
                    <th>Давление, мм рт. ст.</th>
                    {activeDayHours.map((hour) => (
                      <td key={hour.time}>{formatNumber(hpaToMmHg(hour.pressure), 0)}</td>
                    ))}
                  </tr>
                  <tr>
                    <th>Ветер, м/с</th>
                    {activeDayHours.map((hour) => (
                      <td key={hour.time}>{formatNumber(hour.windSpeed)}</td>
                    ))}
                  </tr>
                  <tr>
                    <th>Влажность, %</th>
                    {activeDayHours.map((hour) => (
                      <td key={hour.time}>{formatNumber(hour.humidity, 0)}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
