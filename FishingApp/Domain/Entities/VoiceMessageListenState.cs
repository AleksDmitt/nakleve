namespace FishingApp.Domain.Entities;

public class VoiceMessageListenState
{
    public Guid Id { get; set; }

    public Guid ChatMessageAttachmentId { get; set; }
    public ChatMessageAttachment ChatMessageAttachment { get; set; } = null!;

    public Guid UserId { get; set; }
    public AppUser User { get; set; } = null!;

    public DateTime ListenedAtUtc { get; set; } = DateTime.UtcNow;
}
