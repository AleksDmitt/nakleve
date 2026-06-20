namespace FishingApp.Api.DTOs.Chat;

public class ChatMessageResponse
{
    public Guid Id { get; set; }
    public Guid ChatId { get; set; }
    public Guid UserId { get; set; }
    public string UserName { get; set; } = null!;
    public string? UserAvatarUrl { get; set; }
    public string Text { get; set; } = null!;
    public DateTime SentAt { get; set; }

    public Guid? ReplyToMessageId { get; set; }
    public string? ReplyToUserName { get; set; }
    public string? ReplyToText { get; set; }

    public Guid? SharedFishingEntryId { get; set; }
    public ChatSharedFishingEntryResponse? SharedFishingEntry { get; set; }

    public bool IsDeleted { get; set; }
    public bool IsDeletedForAll { get; set; }

    public bool IsForwarded { get; set; }
    public Guid? ForwardedFromUserId { get; set; }
    public string? ForwardedFromUserName { get; set; }

    // true только для сообщений текущего пользователя, когда остальные участники чата уже открывали чат после отправки сообщения.
    public bool IsReadByOthers { get; set; }

    public List<ChatMessageAttachmentResponse> Attachments { get; set; } = new();
}
