namespace FishingApp.Api.DTOs.Chat;

public class ChatResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = null!;
    public string Type { get; set; } = null!;
    public string? Region { get; set; }
    public DateTime CreatedAt { get; set; }

    public Guid? TargetUserId { get; set; }
    public string? TargetUserAvatarUrl { get; set; }
    public bool IsTargetUserBlocked { get; set; }
    public string? TargetUserBlockedText { get; set; }
    public string? LastMessageText { get; set; }
    public DateTime? LastMessageSentAt { get; set; }
    public string? LastMessageUserName { get; set; }

    public int UnreadCount { get; set; }
    public bool HasUnread { get; set; }
    public bool IsMuted { get; set; }
}
