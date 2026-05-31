using FishingApp.Domain.Enums;

namespace FishingApp.Api.DTOs.FishingEntries;

public class FishingEntryResponse
{
    public Guid Id { get; set; }
    public string Title { get; set; } = null!;
    public string? Description { get; set; }

    // Старое поле оставляем, чтобы не ломать старые места frontend'а.
    public DateTime FishingDate { get; set; }

    public DateTime FishingStartedAt { get; set; }
    public DateTime? FishingEndedAt { get; set; }

    public string? LocationName { get; set; }
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }

    public string? CatchType { get; set; }
    public decimal? CatchWeight { get; set; }
    public string? Bait { get; set; }
    public string? WeatherSummary { get; set; }
    public string? PhotoUrl { get; set; }

    public List<FishingEntryMediaResponse> Media { get; set; } = new();

    public FishingEntryVisibility Visibility { get; set; }
    public bool IsPublishedToFeed { get; set; }
    public DateTime CreatedAt { get; set; }

    public Guid UserId { get; set; }
    public string? UserName { get; set; }
    public string? AvatarUrl { get; set; }

    public int LikesCount { get; set; }
    public int CommentsCount { get; set; }
    public int SharesCount { get; set; }
    public bool IsLikedByCurrentUser { get; set; }
    public string? PhotoPreviewUrl { get; set; }
    public string? PhotoThumbnailUrl { get; set; }
}
