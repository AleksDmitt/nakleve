import { apiRequest } from "../utils/apiClient";

export function reverseGeocode(lat, lon) {
  return apiRequest(`/Geocoding/reverse?lat=${lat}&lon=${lon}`);
}

export function searchPlaces(query) {
  const params = new URLSearchParams({
    query,
  });

  return apiRequest(`/Geocoding/search?${params.toString()}`);
}