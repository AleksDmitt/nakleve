namespace FishingApp.Domain.Entities;

public class FishingEntryShare
{
    public Guid Id { get; set; }

    public Guid FishingEntryId { get; set; }
    public FishingEntry FishingEntry { get; set; } = null!;

    public Guid UserId { get; set; }
    public AppUser User { get; set; } = null!;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
