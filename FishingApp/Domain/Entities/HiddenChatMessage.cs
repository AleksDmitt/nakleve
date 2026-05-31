namespace FishingApp.Domain.Entities;

public class HiddenChatMessage
{
    public Guid Id { get; set; }
    public Guid MessageId { get; set; }
    public Guid UserId { get; set; }
    public DateTime HiddenAt { get; set; } = DateTime.UtcNow;

    public ChatMessage Message { get; set; } = null!;
    public AppUser User { get; set; } = null!;
}