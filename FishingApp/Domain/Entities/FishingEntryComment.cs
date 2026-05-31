namespace FishingApp.Domain.Entities;

public class FishingEntryComment
{
    public Guid Id { get; set; }

    public Guid FishingEntryId { get; set; }
    public FishingEntry FishingEntry { get; set; } = null!;

    public Guid UserId { get; set; }
    public AppUser User { get; set; } = null!;

    public Guid? ParentCommentId { get; set; }
    public FishingEntryComment? ParentComment { get; set; }
    public ICollection<FishingEntryComment> Replies { get; set; } = new List<FishingEntryComment>();

    public string Text { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
}
