import { apiRequest } from "../utils/apiClient";

export function getWeather(latOrParams, lonArg) {
  const params =
    typeof latOrParams === "object"
      ? latOrParams
      : {
          lat: latOrParams,
          lon: lonArg,
        };

  const query = new URLSearchParams();

  query.set("lat", params.lat);
  query.set("lon", params.lon);

  if (params.date) {
    query.set("date", params.date);
  }

  if (params.placeName) {
    query.set("placeName", params.placeName);
  }

  return apiRequest(`/Weather?${query.toString()}`);
}