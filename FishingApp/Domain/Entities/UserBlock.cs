namespace FishingApp.Domain.Entities;

public class UserBlock
{
    public Guid Id { get; set; }

    public Guid BlockerUserId { get; set; }
    public AppUser BlockerUser { get; set; } = null!;

    public Guid BlockedUserId { get; set; }
    public AppUser BlockedUser { get; set; } = null!;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
