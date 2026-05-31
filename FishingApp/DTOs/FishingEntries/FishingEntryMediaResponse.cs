namespace FishingApp.Api.DTOs.FishingEntries;

public class FishingEntryMediaResponse
{
    public Guid Id { get; set; }
    public string Url { get; set; } = string.Empty;
    public string MediaType { get; set; } = "image";
    public int SortOrder { get; set; }
    public string? PreviewUrl { get; set; }
    public string? ThumbnailUrl { get; set; }
}
