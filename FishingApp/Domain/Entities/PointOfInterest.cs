using FishingApp.Domain.Enums;

namespace FishingApp.Domain.Entities;

public class PointOfInterest
{
    public Guid Id { get; set; }
    public Guid CreatedByUserId { get; set; }

    public string Name { get; set; } = null!;
    public string? Description { get; set; }

    public double Latitude { get; set; }
    public double Longitude { get; set; }

    public PointType Type { get; set; }
    public string? Region { get; set; }

    public bool IsApproved { get; set; } = false;
    public bool IsVisibleOnMap { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public AppUser CreatedByUser { get; set; } = null!;
}