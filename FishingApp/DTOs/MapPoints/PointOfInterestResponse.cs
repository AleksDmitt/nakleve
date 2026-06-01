using FishingApp.Domain.Enums;

namespace FishingApp.Api.DTOs;

public class PointOfInterestResponse
{
    public Guid Id { get; set; }
    public Guid CreatedByUserId { get; set; }
    public string Name { get; set; } = null!;
    public string? Description { get; set; }
    public double Latitude { get; set; }
    public double Longitude { get; set; }
    public PointType Type { get; set; }
    public string? Region { get; set; }
    public bool IsApproved { get; set; }
    public bool IsVisibleOnMap { get; set; }
    public bool IsPublic { get; set; }
    public bool CanManage { get; set; }
    public DateTime CreatedAt { get; set; }
}