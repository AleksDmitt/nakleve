using System.ComponentModel.DataAnnotations;
using FishingApp.Domain.Enums;

namespace FishingApp.Api.DTOs.FishingEntries;

public class UpdateFishingEntryRequest
{
    [Required]
    [MaxLength(120)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(5000)]
    public string? Description { get; set; }

    public DateTime? FishingDate { get; set; }

    public DateTime? FishingStartedAt { get; set; }

    public DateTime? FishingEndedAt { get; set; }

    [MaxLength(200)]
    public string? LocationName { get; set; }

    public double? Latitude { get; set; }

    public double? Longitude { get; set; }

    [MaxLength(100)]
    public string? CatchType { get; set; }

    public decimal? CatchWeight { get; set; }

    [MaxLength(1000)]
    public string? Bait { get; set; }

    public string? PhotoUrl { get; set; }

    public List<FishingEntryMediaRequest> Media { get; set; } = new();

    public FishingEntryVisibility Visibility { get; set; } = FishingEntryVisibility.Private;

    public bool IsPublishedToFeed { get; set; }
}