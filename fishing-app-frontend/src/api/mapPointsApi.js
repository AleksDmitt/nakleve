import { apiRequest } from "../utils/apiClient";

export function getMapPoints() {
  return apiRequest("/map-points");
}

export function getMapPointById(id) {
  return apiRequest(`/map-points/${id}`);
}

export function createMapPoint(data) {
  return apiRequest("/map-points", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateMapPoint(id, data) {
  return apiRequest(`/map-points/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteMapPoint(id) {
  return apiRequest(`/map-points/${id}`, {
    method: "DELETE",
  });
}