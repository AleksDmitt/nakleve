namespace FishingApp.Api.DTOs.MapPoints;

public class GeocodingSearchResult
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? Address { get; set; }
    public string? Region { get; set; }

    public double Latitude { get; set; }
    public double Longitude { get; set; }
}
