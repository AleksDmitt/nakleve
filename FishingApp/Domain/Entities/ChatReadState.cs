namespace FishingApp.Domain.Entities;

public class ChatReadState
{
    public Guid Id { get; set; }

    public Guid ChatId { get; set; }
    public Chat Chat { get; set; } = null!;

    public Guid UserId { get; set; }
    public AppUser User { get; set; } = null!;

    public DateTime? LastReadAt { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}