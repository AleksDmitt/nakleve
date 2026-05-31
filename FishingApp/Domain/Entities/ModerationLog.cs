namespace FishingApp.Domain.Entities;

public class ModerationLog
{
    public Guid Id { get; set; }
    public Guid AdminUserId { get; set; }

    public string Action { get; set; } = null!;
    public string EntityType { get; set; } = null!;
    public Guid EntityId { get; set; }

    public string? Reason { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public AppUser AdminUser { get; set; } = null!;
}