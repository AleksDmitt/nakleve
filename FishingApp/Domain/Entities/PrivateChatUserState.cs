namespace FishingApp.Domain.Entities;

public class PrivateChatUserState
{
    public Guid Id { get; set; }

    public Guid ChatId { get; set; }
    public Guid UserId { get; set; }

    public DateTime? ClearedAt { get; set; }
    public bool IsMuted { get; set; } = false;

    public Chat Chat { get; set; } = null!;
    public AppUser User { get; set; } = null!;
}