using FishingApp.Domain.Enums;

namespace FishingApp.Api.DTOs;

public class UpdatePointOfInterestRequest
{
    public string Name { get; set; } = null!;
    public string? Description { get; set; }
    public double Latitude { get; set; }
    public double Longitude { get; set; }
    public PointType Type { get; set; }
    public string? Region { get; set; }
    public bool IsVisibleOnMap { get; set; } = true;
}