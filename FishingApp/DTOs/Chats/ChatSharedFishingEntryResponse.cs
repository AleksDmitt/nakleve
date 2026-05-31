using FishingApp.Api.DTOs.FishingEntries;
using FishingApp.Domain.Enums;

namespace FishingApp.Api.DTOs.Chat;

public class ChatSharedFishingEntryResponse
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? PhotoUrl { get; set; }
    public string? LocationName { get; set; }
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
    public string? CatchType { get; set; }
    public decimal? CatchWeight { get; set; }
    public string? Bait { get; set; }
    public string? WeatherSummary { get; set; }
    public DateTime FishingDate { get; set; }
    public DateTime FishingStartedAt { get; set; }
    public DateTime? FishingEndedAt { get; set; }
    public FishingEntryVisibility Visibility { get; set; }
    public bool IsPublishedToFeed { get; set; }
    public DateTime CreatedAt { get; set; }
    public Guid UserId { get; set; }
    public string UserName { get; set; } = string.Empty;
    public string? AvatarUrl { get; set; }
    public List<FishingEntryMediaResponse> Media { get; set; } = new();
}
