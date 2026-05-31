namespace FishingApp.Api.DTOs.FishingEntries;

public class FishingFeedPageResponse
{
    public List<FishingEntryResponse> Items { get; set; } = new();
    public int Page { get; set; }
    public int PageSize { get; set; }
    public int TotalCount { get; set; }
    public bool HasMore { get; set; }
}
