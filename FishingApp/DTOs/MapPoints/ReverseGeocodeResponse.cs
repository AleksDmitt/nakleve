namespace FishingApp.Api.DTOs.MapPoints;

public class ReverseGeocodeResponse
{
    public string Address { get; set; } = string.Empty;
    public string? Region { get; set; }
}
