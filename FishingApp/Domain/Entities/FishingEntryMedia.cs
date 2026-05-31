namespace FishingApp.Domain.Entities;

public class FishingEntryMedia
{
    public Guid Id { get; set; }

    public Guid FishingEntryId { get; set; }
    public FishingEntry FishingEntry { get; set; } = null!;

    public string Url { get; set; } = string.Empty;

    // image / video
    public string MediaType { get; set; } = "image";

    public int SortOrder { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
